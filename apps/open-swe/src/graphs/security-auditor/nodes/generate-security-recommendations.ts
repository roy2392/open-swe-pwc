import {
  SecurityAuditorGraphState,
  SecurityAuditorGraphUpdate,
} from "@openswe/shared/open-swe/security-auditor/types";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import { GraphConfig } from "@openswe/shared/open-swe/types";
import { loadModel } from "../../../utils/llms/index.js";
import { AIMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { trackCachePerformance } from "../../../utils/caching.js";
import { LLMTask } from "@openswe/shared/open-swe/llm-task";

const logger = createLogger(LogLevel.INFO, "GenerateSecurityRecommendationsNode");

const SECURITY_RECOMMENDATIONS_PROMPT = `Based on the security analysis performed, provide actionable security recommendations for this codebase.

Previous security analysis:
{securityAnalysis}

Task context:
{taskContext}

Please provide:

1. **Priority Security Actions** - Most critical items to address immediately
2. **Best Practice Recommendations** - Proactive security measures to implement
3. **Code Review Guidelines** - Security-focused review checklist for future changes
4. **Monitoring & Detection** - Security monitoring recommendations
5. **Developer Security Guidelines** - Secure coding practices for the team

Format your response as a comprehensive security recommendations report that can be shared with the development team.

Focus on:
- Actionable, specific recommendations
- Risk-based prioritization
- Implementation guidance
- Prevention strategies for similar issues
- Links to relevant security resources where helpful`;

function getTaskContext(state: SecurityAuditorGraphState): string {
  const taskSummary = "Code changes"; // TaskPlan doesn't have title property
  const changedFiles = state.changedFiles || "No files changed";

  return `
Task: ${taskSummary}
Changed Files: ${changedFiles}
Repository: ${state.targetRepository?.owner}/${state.targetRepository?.repo || "Unknown"}
Branch: ${state.branchName || "Unknown"}
  `.trim();
}

function getSecurityAnalysis(state: SecurityAuditorGraphState): string {
  // Extract the security analysis from audit messages
  return state.auditMessages
    ?.map(msg => msg.content)
    .filter(content => typeof content === 'string' && content.length > 0)
    .join('\n\n') || 'No security analysis available';
}

export async function generateSecurityRecommendations(
  state: SecurityAuditorGraphState,
  config: GraphConfig,
): Promise<SecurityAuditorGraphUpdate> {
  logger.info("Generating security recommendations");

  try {
    const securityAnalysis = getSecurityAnalysis(state);
    const taskContext = getTaskContext(state);

    const model = await loadModel(config, LLMTask.PROGRAMMER);
    const prompt = SECURITY_RECOMMENDATIONS_PROMPT
      .replace("{securityAnalysis}", securityAnalysis)
      .replace("{taskContext}", taskContext);

    const response = await model.invoke([
      {
        role: "user",
        content: prompt,
      },
    ]);

    const tokenData = trackCachePerformance(response, "security-recommendations-model");

    logger.info("Completed generating security recommendations");

    return {
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: response.content as string,
        }),
      ],
      tokenData: tokenData,
    };
  } catch (error) {
    logger.error("Failed to generate security recommendations", { error });

    return {
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: "❌ Failed to generate security recommendations due to an error. Please manually review the security analysis and create appropriate recommendations.",
        }),
      ],
    };
  }
}