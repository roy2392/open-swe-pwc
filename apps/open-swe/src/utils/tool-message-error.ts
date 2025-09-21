import {
  BaseMessage,
  isAIMessage,
  isToolMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { getMessageString } from "./message/content.js";

/**
 * Group tool messages by their parent AI message
 * @param messages Array of messages to process
 * @returns Array of tool message groups, where each group contains tool messages tied to the same AI message
 */
export function groupToolMessagesByAIMessage(
  messages: Array<any>,
): ToolMessage[][] {
  const groups: ToolMessage[][] = [];
  let currentGroup: ToolMessage[] = [];
  let processingToolsForAI = false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (isAIMessage(message)) {
      // If we were already processing tools for a previous AI message, save that group
      if (currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
      processingToolsForAI = true;
    } else if (
      isToolMessage(message) &&
      processingToolsForAI &&
      !message.additional_kwargs?.is_diagnosis
    ) {
      currentGroup.push(message);
    } else if (!isToolMessage(message) && processingToolsForAI) {
      // We've encountered a non-tool message after an AI message, end the current group
      if (currentGroup.length > 0) {
        groups.push([...currentGroup]);
        currentGroup = [];
      }
      processingToolsForAI = false;
    }
  }

  // Add the last group if it exists
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Calculate the error rate for a group of tool messages
 * @param group Array of tool messages
 * @returns Error rate as a number between 0 and 1
 */
export function calculateErrorRate(group: ToolMessage[]): number {
  if (group.length === 0) return 0;
  const errorCount = group.filter((m) => m.status === "error").length;
  return errorCount / group.length;
}

/**
 * Check if there was a diagnosis tool call within the last N tool message groups
 * @param messages Array of messages to check
 * @param groupCount Number of recent groups to check
 * @returns True if a diagnosis tool call was found in the recent groups
 */
function hasRecentDiagnosisToolCall(
  messages: Array<BaseMessage>,
  groupCount: number,
): boolean {
  const allGroups: ToolMessage[][] = [];
  let currentGroup: ToolMessage[] = [];
  let processingToolsForAI = false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (isAIMessage(message)) {
      if (currentGroup.length > 0) {
        allGroups.push([...currentGroup]);
        currentGroup = [];
      }
      processingToolsForAI = true;
    } else if (isToolMessage(message) && processingToolsForAI) {
      currentGroup.push(message);
    } else if (!isToolMessage(message) && processingToolsForAI) {
      if (currentGroup.length > 0) {
        allGroups.push([...currentGroup]);
        currentGroup = [];
      }
      processingToolsForAI = false;
    }
  }

  if (currentGroup.length > 0) {
    allGroups.push(currentGroup);
  }

  const recentGroups = allGroups.slice(-groupCount);
  return recentGroups.some((group) =>
    group.some((message) => message.additional_kwargs?.is_diagnosis),
  );
}

/**
 * Enhanced error detection for better recovery. This is true if:
 * - IMMEDIATE: Last 2 consecutive groups have >= 50% error rates (faster intervention)
 * - PATTERN: Last 3 groups have >= 75% error rates (original logic)
 * - STUCK: Same command failed 3+ times in recent history
 * - There hasn't been a diagnosis in the last 2 groups (reduced from 3)
 *
 * @param messages All messages to analyze
 */
export function shouldDiagnoseError(messages: Array<BaseMessage>) {
  const toolGroups = groupToolMessagesByAIMessage(messages);

  if (toolGroups.length < 2) return false;

  const hasRecentDiagnosis = hasRecentDiagnosisToolCall(messages, 2); // Reduced from 3
  if (hasRecentDiagnosis) return false;

  // Check for stuck pattern - same command failing repeatedly
  const isStuckOnSameCommand = checkForStuckPattern(messages);
  if (isStuckOnSameCommand) return true;

  // IMMEDIATE intervention: Last 2 groups with moderate error rate
  if (toolGroups.length >= 2) {
    const lastTwoGroups = toolGroups.slice(-2);
    const IMMEDIATE_THRESHOLD = 0.5; // Reduced from 0.75
    if (lastTwoGroups.every((group) => calculateErrorRate(group) >= IMMEDIATE_THRESHOLD)) {
      return true;
    }
  }

  // PATTERN intervention: Original logic but more sensitive
  if (toolGroups.length >= 3) {
    const lastThreeGroups = toolGroups.slice(-3);
    const ERROR_THRESHOLD = 0.6; // Reduced from 0.75
    return lastThreeGroups.every(
      (group) => calculateErrorRate(group) >= ERROR_THRESHOLD,
    );
  }

  return false;
}

/**
 * Detect if the agent is stuck repeating the same failed command
 */
function checkForStuckPattern(messages: Array<BaseMessage>): boolean {
  const recentMessages = messages.slice(-10); // Look at last 10 messages
  const commandCounts = new Map<string, number>();

  for (let i = 0; i < recentMessages.length - 1; i++) {
    const current = recentMessages[i];
    const next = recentMessages[i + 1];

    // Look for AI message followed by error tool message
    if (
      isAIMessage(current) &&
      isToolMessage(next) &&
      next.status === "error"
    ) {
      // Extract command name or content for pattern detection
      const commandKey = next.name || "unknown_command";
      commandCounts.set(commandKey, (commandCounts.get(commandKey) || 0) + 1);
    }
  }

  // If any command has failed 3+ times recently, we're stuck
  return Array.from(commandCounts.values()).some(count => count >= 3);
}

/**
 * Determine if we should use smart error recovery instead of regular diagnosis
 * Smart recovery is triggered for more severe error patterns that need enhanced strategies
 * @param messages Array of messages to analyze
 * @returns True if smart error recovery should be used instead of regular diagnosis
 */
export function shouldUseSmartRecovery(messages: Array<BaseMessage>): boolean {
  const toolGroups = groupToolMessagesByAIMessage(messages);

  if (toolGroups.length < 2) return false;

  // Check if we've already had multiple diagnosis attempts recently
  const recentDiagnosisCount = messages.slice(-20)
    .filter(msg => isToolMessage(msg) && msg.additional_kwargs?.is_diagnosis)
    .length;

  // If we've had 2+ diagnosis attempts in recent history, escalate to smart recovery
  if (recentDiagnosisCount >= 2) return true;

  // Check for high error rate patterns that suggest complex issues
  if (toolGroups.length >= 3) {
    const lastThreeGroups = toolGroups.slice(-3);
    const highErrorThreshold = 0.8; // 80% error rate indicates severe problems

    const hasHighErrorRate = lastThreeGroups.every(
      (group) => calculateErrorRate(group) >= highErrorThreshold,
    );

    if (hasHighErrorRate) return true;
  }

  // Check for stuck pattern - same command failing repeatedly
  return checkForStuckPattern(messages);
}

export const getAllLastFailedActions = (messages: BaseMessage[]): string => {
  const result: string[] = [];
  let i = 0;

  // Find pairs of AI messages followed by error tool messages
  while (i < messages.length - 1) {
    const currentMessage = messages[i];
    const nextMessage = messages[i + 1];

    if (
      isAIMessage(currentMessage) &&
      isToolMessage(nextMessage) &&
      nextMessage?.status === "error"
    ) {
      // Add the AI message and its corresponding error tool message
      result.push(getMessageString(currentMessage));
      result.push(getMessageString(nextMessage));
      i += 2; // Move to the next potential pair
    } else if (
      isToolMessage(currentMessage) &&
      currentMessage?.status !== "error"
    ) {
      // Stop when we encounter a non-error tool message
      break;
    } else {
      // Move to the next message if current one doesn't match our pattern
      i++;
    }
  }

  return result.join("\n");
};
