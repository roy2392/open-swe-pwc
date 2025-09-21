import { v4 as uuidv4 } from "uuid";
import {
  BaseMessage,
  isToolMessage,
  ToolMessage,
  AIMessage,
} from "@langchain/core/messages";
import {
  GraphConfig,
  GraphState,
  GraphUpdate,
} from "@openswe/shared/open-swe/types";
import { createDiagnoseErrorToolFields } from "@openswe/shared/open-swe/tools";
import { formatPlanPromptWithSummaries } from "../../../utils/plan-prompt.js";
import { getMessageString } from "../../../utils/message/content.js";
import { getMessageContentString } from "@openswe/shared/messages";
import {
  loadModel,
  supportsParallelToolCallsParam,
} from "../../../utils/llms/index.js";
import { LLMTask } from "@openswe/shared/open-swe/llm-task";
import { z } from "zod";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import {
  getCompletedPlanItems,
  getCurrentPlanItem,
} from "../../../utils/current-task.js";
import { getActivePlanItems } from "@openswe/shared/open-swe/tasks";

const logger = createLogger(LogLevel.INFO, "SmartErrorRecovery");

interface ErrorPattern {
  errorType: string;
  count: number;
  lastOccurrence: number;
  commands: string[];
}

interface RecoveryState {
  errorPatterns: Map<string, ErrorPattern>;
  retryCount: number;
  lastModelUsed: LLMTask;
  alternativeApproaches: string[];
}

// Store recovery state per thread
const recoveryStates = new Map<string, RecoveryState>();

const ENHANCED_SYSTEM_PROMPT = `You are operating as a terminal-based agentic coding assistant built by LangChain. It wraps LLM models to enable natural language interaction with a local codebase. You are expected to be precise, safe, and helpful.

The last several commands you tried to execute failed with errors. This is an ENHANCED ERROR RECOVERY mode. Please analyze the error patterns and provide a fundamentally different approach to solve the problem.

## Error Analysis Context:
{ERROR_ANALYSIS}

## Critical Guidelines for Recovery:
1. **AVOID REPEATING FAILED APPROACHES**: If a command or approach has failed multiple times, DO NOT try it again
2. **USE ALTERNATIVE STRATEGIES**: Consider completely different tools, commands, or approaches
3. **SIMPLIFY THE APPROACH**: Break complex operations into smaller, simpler steps
4. **VERIFY ASSUMPTIONS**: Question your assumptions about file locations, syntax, or environment
5. **USE SAFER COMMANDS**: Prefer read-only operations to understand the situation before making changes

## Current Task:
{CURRENT_TASK}

## Completed Tasks Summary:
{PLAN_PROMPT}

## Codebase Structure:
{CODEBASE_TREE}

## Failed Commands Pattern Analysis:
{FAILED_COMMANDS_ANALYSIS}

Based on this analysis, provide a completely different approach to solve the current task. Focus on understanding WHY the previous approaches failed and suggest a fundamentally different strategy.

When ready, call the \`diagnose_error\` tool with your enhanced analysis and alternative approach.`;

const USER_PROMPT = `Here is the full conversation history showing the repeated failures:

{CONVERSATION_HISTORY}

Please provide an enhanced diagnosis that:
1. Identifies the root cause of repeated failures
2. Suggests 2-3 completely different approaches to try
3. Recommends specific alternative commands or tools
4. Explains why previous approaches didn't work

Call the \`diagnose_error\` tool with your comprehensive analysis.`;

function analyzeErrorPatterns(messages: BaseMessage[]): string {
  const errorPatterns = new Map<string, ErrorPattern>();
  const failedCommands: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (isToolMessage(message) && message.status === "error") {
      const content = getMessageContentString(message.content);

      // Extract command from error message
      const commandMatch = content.match(/Command:\s*(.+?)(?:\n|$)/i) ||
                          content.match(/`([^`]+)`/) ||
                          [null, message.name];
      const command = commandMatch?.[1]?.trim() || message.name;

      failedCommands.push(command || "unknown");

      // Categorize error types
      let errorType = "unknown";
      if (content.includes("syntax error") || content.includes("SyntaxError")) {
        errorType = "syntax_error";
      } else if (content.includes("not found") || content.includes("No such file")) {
        errorType = "file_not_found";
      } else if (content.includes("permission") || content.includes("Permission denied")) {
        errorType = "permission_error";
      } else if (content.includes("command not found") || content.includes("not recognized")) {
        errorType = "command_not_found";
      } else if (content.includes("timeout") || content.includes("Timeout")) {
        errorType = "timeout_error";
      }

      const pattern = errorPatterns.get(errorType) || {
        errorType,
        count: 0,
        lastOccurrence: i,
        commands: []
      };

      pattern.count++;
      pattern.lastOccurrence = i;
      pattern.commands.push(command || "unknown");
      errorPatterns.set(errorType, pattern);
    }
  }

  let analysis = `## Error Pattern Analysis:\n`;

  if (errorPatterns.size === 0) {
    analysis += "- No clear error patterns detected\n";
  } else {
    errorPatterns.forEach((pattern, type) => {
      analysis += `- **${type.replace('_', ' ').toUpperCase()}**: ${pattern.count} occurrences\n`;
      analysis += `  - Commands: ${pattern.commands.slice(-3).join(', ')}\n`;
    });
  }

  analysis += `\n## Command Repetition Analysis:\n`;
  const commandCounts = new Map<string, number>();
  failedCommands.forEach(cmd => {
    commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1);
  });

  const repeatedCommands = Array.from(commandCounts.entries())
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a);

  if (repeatedCommands.length > 0) {
    analysis += `- **REPEATED FAILED COMMANDS** (avoid these):\n`;
    repeatedCommands.forEach(([cmd, count]) => {
      analysis += `  - "${cmd}": failed ${count} times\n`;
    });
  } else {
    analysis += "- No obviously repeated failed commands detected\n";
  }

  return analysis;
}

function generateAlternativeApproaches(_errorPatterns: string): string {
  const approaches = [
    "Use 'ls -la' to verify file existence and permissions before attempting operations",
    "Try 'file <filename>' to check file type and encoding issues",
    "Use 'head -n 5 <file>' or 'tail -n 5 <file>' for safe file content preview",
    "Consider using 'find' command with different search patterns",
    "Try alternative tools: 'grep', 'awk', 'sed' instead of complex commands",
    "Use 'pwd' and 'ls' to verify current location and available files",
    "Consider using relative paths instead of absolute paths or vice versa",
    "Try 'which <command>' to verify command availability",
    "Use 'cat /etc/os-release' to check system environment",
    "Consider breaking complex operations into multiple simple steps"
  ];

  return `## Suggested Alternative Approaches:\n${approaches.slice(0, 5).map(a => `- ${a}`).join('\n')}`;
}

// Model rotation strategy for different error types
function selectRecoveryModel(_config: GraphConfig, _errorType: string, retryCount: number): LLMTask {
  // Start with PROGRAMMER task for fresh perspective, then rotate
  const modelRotation = [
    LLMTask.PROGRAMMER,   // First attempt - use programmer model
    LLMTask.PLANNER,     // Second attempt - use planner model for different perspective
    LLMTask.SUMMARIZER,  // Third attempt - fall back to summarizer
  ];

  const modelIndex = retryCount % modelRotation.length;
  return modelRotation[modelIndex];
}

const diagnoseErrorTool = createDiagnoseErrorToolFields();

function formatEnhancedSystemPrompt(
  errorAnalysis: string,
  failedCommandsAnalysis: string,
  currentTask: string,
  planPrompt: string,
  codebaseTree: string,
): string {
  return ENHANCED_SYSTEM_PROMPT
    .replace("{ERROR_ANALYSIS}", errorAnalysis)
    .replace("{FAILED_COMMANDS_ANALYSIS}", failedCommandsAnalysis)
    .replace("{CURRENT_TASK}", currentTask)
    .replace("{PLAN_PROMPT}", planPrompt)
    .replace("{CODEBASE_TREE}", codebaseTree);
}

function formatEnhancedUserPrompt(messages: BaseMessage[]): string {
  return USER_PROMPT.replace(
    "{CONVERSATION_HISTORY}",
    messages.slice(-10).map(getMessageString).join("\n") // Last 10 messages for context
  );
}

export async function smartErrorRecovery(
  state: GraphState,
  config: GraphConfig,
): Promise<GraphUpdate> {
  const threadId = config.configurable?.thread_id || "default";

  // Get or create recovery state for this thread
  let recoveryState = recoveryStates.get(threadId);
  if (!recoveryState) {
    recoveryState = {
      errorPatterns: new Map(),
      retryCount: 0,
      lastModelUsed: LLMTask.SUMMARIZER,
      alternativeApproaches: []
    };
    recoveryStates.set(threadId, recoveryState);
  }

  recoveryState.retryCount++;

  // Circuit breaker: if we've tried too many times, request human help
  if (recoveryState.retryCount > 5) {
    logger.warn("Maximum recovery attempts reached. Requesting human help.", {
      threadId,
      retryCount: recoveryState.retryCount
    });

    const helpMessage = new AIMessage({
      id: uuidv4(),
      content: `I've attempted error recovery ${recoveryState.retryCount} times but am still encountering issues. The system has hit a circuit breaker limit. I need human assistance to proceed. Please review the error patterns and provide guidance.`,
      tool_calls: [{
        id: uuidv4(),
        name: "request_human_help",
        args: {
          help_request: `Repeated failures after ${recoveryState.retryCount} recovery attempts. Need human intervention to resolve error patterns.`
        }
      }]
    });

    return {
      messages: [helpMessage],
      internalMessages: [helpMessage],
    };
  }

  logger.info("Starting smart error recovery", {
    threadId,
    retryCount: recoveryState.retryCount,
  });

  // Analyze error patterns from recent messages
  const errorAnalysis = analyzeErrorPatterns(state.internalMessages);
  const alternativeApproaches = generateAlternativeApproaches(errorAnalysis);

  const currentPlanItem = getCurrentPlanItem(getActivePlanItems(state.taskPlan));
  const completedTasks = getCompletedPlanItems(getActivePlanItems(state.taskPlan));

  // Use different model based on retry count and error patterns
  const recoveryModel = selectRecoveryModel(config, "general", recoveryState.retryCount);

  logger.info("Using recovery model", {
    model: recoveryModel,
    retryCount: recoveryState.retryCount
  });

  const model = await loadModel(config, recoveryModel);
  const modelSupportsParallelToolCallsParam = supportsParallelToolCallsParam(
    config,
    recoveryModel,
  );

  const modelWithTools = model.bindTools([diagnoseErrorTool], {
    tool_choice: diagnoseErrorTool.name,
    ...(modelSupportsParallelToolCallsParam
      ? { parallel_tool_calls: false }
      : {}),
  });

  const response = await modelWithTools.invoke([
    {
      role: "system",
      content: formatEnhancedSystemPrompt(
        errorAnalysis,
        alternativeApproaches,
        `<current-task index="${currentPlanItem.index}">${currentPlanItem.plan}</current-task>`,
        formatPlanPromptWithSummaries(completedTasks),
        state.codebaseTree || "No codebase tree generated yet."
      ),
    },
    {
      role: "user",
      content: formatEnhancedUserPrompt(state.internalMessages),
    },
  ]);

  const toolCall = response.tool_calls?.[0];

  if (!toolCall) {
    throw new Error("Failed to generate a tool call when diagnosing error.");
  }

  logger.info("Smart error recovery completed successfully.", {
    diagnosis: (toolCall.args as z.infer<typeof diagnoseErrorTool.schema>).diagnosis,
    retryCount: recoveryState.retryCount,
    modelUsed: recoveryModel
  });

  // Update recovery state
  recoveryState.lastModelUsed = recoveryModel;

  const toolMessage = new ToolMessage({
    id: uuidv4(),
    tool_call_id: toolCall.id ?? "",
    content: `Smart error recovery completed. Analysis includes pattern detection, alternative approaches, and circuit breaker protection. Retry attempt ${recoveryState.retryCount}/5.`,
    name: toolCall.name,
    status: "success",
    additional_kwargs: {
      is_diagnosis: true,
      is_smart_recovery: true,
      retry_count: recoveryState.retryCount,
      model_used: recoveryModel,
    },
  });

  return {
    messages: [response, toolMessage],
    internalMessages: [response, toolMessage],
  };
}