import { END, START, StateGraph } from "@langchain/langgraph";
import {
  SecurityAuditorGraphState,
  SecurityAuditorGraphStateObj,
} from "@openswe/shared/open-swe/security-auditor/types";
import { GraphConfiguration } from "@openswe/shared/open-swe/types";
import {
  initializeSecurityAudit,
  scanCodeChanges,
  generateSecurityRecommendations,
  finalizeSecurityReport,
} from "./nodes/index.js";
import { isAIMessage } from "@langchain/core/messages";

function proceedToRecommendationsOrFinalize(
  state: SecurityAuditorGraphState,
): "generate-security-recommendations" | "finalize-security-report" {
  const { auditMessages } = state;
  const lastMessage = auditMessages[auditMessages.length - 1];

  if (isAIMessage(lastMessage) && lastMessage.tool_calls?.length) {
    return "generate-security-recommendations";
  }

  // If no tool calls, proceed to finalize report
  return "finalize-security-report";
}

const workflow = new StateGraph(SecurityAuditorGraphStateObj, GraphConfiguration)
  .addNode("initialize-security-audit", initializeSecurityAudit)
  .addNode("scan-code-changes", scanCodeChanges)
  .addNode("generate-security-recommendations", generateSecurityRecommendations)
  .addNode("finalize-security-report", finalizeSecurityReport)
  .addEdge(START, "initialize-security-audit")
  .addEdge("initialize-security-audit", "scan-code-changes")
  .addConditionalEdges(
    "scan-code-changes",
    proceedToRecommendationsOrFinalize,
    ["generate-security-recommendations", "finalize-security-report"],
  )
  .addEdge("generate-security-recommendations", "finalize-security-report")
  .addEdge("finalize-security-report", END);

export const graph = workflow.compile();
graph.name = "Open SWE - Security Auditor";