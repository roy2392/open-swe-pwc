import {
  SecurityAuditorGraphState,
  SecurityAuditorGraphUpdate,
  SecurityAuditReport,
  SecurityVulnerability,
} from "@openswe/shared/open-swe/security-auditor/types";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import { GraphConfig } from "@openswe/shared/open-swe/types";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";

const logger = createLogger(LogLevel.INFO, "FinalizeSecurityReportNode");

function createSecurityCompletedMessage(report: SecurityAuditReport) {
  const toolCallId = uuidv4();
  const securityCompletedToolCall = {
    id: toolCallId,
    name: "security_audit_completed",
    args: {
      audit_completed: true,
      vulnerabilities_found: report.vulnerabilities.length,
      overall_risk: report.overallRisk,
    },
  };

  const riskEmoji = {
    critical: "🚨",
    high: "⚠️",
    medium: "⚡",
    low: "ℹ️"
  };

  const summaryMessage = `
${riskEmoji[report.overallRisk]} **Security Audit Complete**

**Overall Risk Level:** ${report.overallRisk.toUpperCase()}
**Vulnerabilities Found:** ${report.vulnerabilities.length}
**Files Scanned:** Changed files in this session

${report.summary}

${report.recommendations.length > 0 ? '**Key Recommendations:**\n' + report.recommendations.slice(0, 3).map((rec, i) => `${i + 1}. ${rec}`).join('\n') : ''}

See detailed security analysis above for complete findings and recommendations.
  `.trim();

  return [
    new AIMessage({
      id: uuidv4(),
      content: summaryMessage,
      additional_kwargs: {
        hidden: false,
      },
      tool_calls: [securityCompletedToolCall],
    }),
    new ToolMessage({
      id: uuidv4(),
      tool_call_id: toolCallId,
      content: "Security audit completed successfully",
      additional_kwargs: {
        hidden: true,
      },
    }),
  ];
}

function parseSecurityAnalysis(auditMessages: any[]): SecurityAuditReport {
  // Extract text from audit messages
  const analysisText = auditMessages
    ?.map(msg => msg.content)
    .filter(content => typeof content === 'string' && content.length > 0)
    .join('\n\n') || '';

  // Simple parsing of the analysis to extract key information
  // In a real implementation, you might use structured LLM output or more sophisticated parsing

  const vulnerabilities: SecurityVulnerability[] = [];
  const recommendations: string[] = [];

  // Extract potential vulnerabilities based on common patterns
  const criticalKeywords = ['critical', 'severe', 'high risk', 'vulnerability'];
  const highKeywords = ['important', 'significant', 'security issue'];
  const mediumKeywords = ['consider', 'recommend', 'improve'];

  let overallRisk: "critical" | "high" | "medium" | "low" = "low";

  if (criticalKeywords.some(keyword => analysisText.toLowerCase().includes(keyword))) {
    overallRisk = "critical";
  } else if (highKeywords.some(keyword => analysisText.toLowerCase().includes(keyword))) {
    overallRisk = "high";
  } else if (mediumKeywords.some(keyword => analysisText.toLowerCase().includes(keyword))) {
    overallRisk = "medium";
  }

  // Extract recommendations (lines that start with recommendation patterns)
  const lines = analysisText.split('\n');
  for (const line of lines) {
    if (line.match(/^[\d\-\*]\s*.*recommend|^[\d\-\*]\s*.*should|^[\d\-\*]\s*.*consider/i)) {
      recommendations.push(line.replace(/^[\d\-\*]\s*/, '').trim());
    }
  }

  const summary = analysisText.length > 500
    ? analysisText.substring(0, 500) + "..."
    : analysisText || "Security audit completed with no specific issues identified.";

  return {
    vulnerabilities,
    summary,
    overallRisk,
    recommendations: recommendations.slice(0, 10), // Limit to top 10 recommendations
  };
}

export async function finalizeSecurityReport(
  state: SecurityAuditorGraphState,
  _config: GraphConfig,
): Promise<SecurityAuditorGraphUpdate> {
  logger.info("Finalizing security audit report");

  try {
    // Parse the security analysis to create a structured report
    const securityReport = parseSecurityAnalysis(state.auditMessages || []);

    logger.info("Security audit report finalized", {
      vulnerabilitiesFound: securityReport.vulnerabilities.length,
      overallRisk: securityReport.overallRisk,
      recommendationsCount: securityReport.recommendations.length,
    });

    return {
      securityReport,
      auditMessages: createSecurityCompletedMessage(securityReport),
    };
  } catch (error) {
    logger.error("Failed to finalize security report", { error });

    const fallbackReport: SecurityAuditReport = {
      vulnerabilities: [],
      summary: "Security audit completed but report generation failed. Please review the security analysis above manually.",
      overallRisk: "medium",
      recommendations: ["Manual review of security analysis is recommended"],
    };

    return {
      securityReport: fallbackReport,
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: "⚠️ Security audit completed with errors. Please review the analysis above and create appropriate security measures manually.",
        }),
      ],
    };
  }
}