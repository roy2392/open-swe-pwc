import {
  SecurityAuditorGraphState,
  SecurityAuditorGraphUpdate,
} from "@openswe/shared/open-swe/security-auditor/types";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import { GraphConfig } from "@openswe/shared/open-swe/types";
import { loadModel } from "../../../utils/llms/index.js";
import { AIMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { getSandboxWithErrorHandling } from "../../../utils/sandbox.js";
import { getRepoAbsolutePath } from "@openswe/shared/git";
import { createShellExecutor } from "../../../utils/shell-executor/index.js";
import { trackCachePerformance } from "../../../utils/caching.js";
import { LLMTask } from "@openswe/shared/open-swe/llm-task";

const logger = createLogger(LogLevel.INFO, "ScanCodeChangesNode");

const SECURITY_SCAN_PROMPT = `You are a security expert conducting a code security audit. Your task is to analyze the changed files and identify potential security vulnerabilities.

Focus on these common security issues:
1. **Authentication & Authorization**: Weak authentication, missing authorization checks, privilege escalation
2. **Input Validation**: SQL injection, XSS, command injection, path traversal
3. **Data Protection**: Hardcoded secrets, weak encryption, sensitive data exposure
4. **Error Handling**: Information disclosure through error messages
5. **Access Control**: Insecure direct object references, missing access controls
6. **Logging & Monitoring**: Insufficient logging, sensitive data in logs
7. **Dependencies**: Vulnerable dependencies, insecure configurations
8. **Business Logic**: Race conditions, TOCTOU vulnerabilities
9. **API Security**: Missing rate limiting, insecure endpoints
10. **Cryptography**: Weak algorithms, improper key management

For each file, analyze the code changes and provide:
- File path
- Line numbers (if specific issues found)
- Security risk level (critical/high/medium/low/info)
- Vulnerability category
- Detailed description
- Specific recommendations for remediation
- CWE ID if applicable

Be thorough but practical - focus on real security risks rather than theoretical issues.

Changed files to analyze:
{changedFiles}

Code changes:
{codeChanges}`;

async function getCodeChanges(
  state: SecurityAuditorGraphState,
  config: GraphConfig,
): Promise<string> {
  try {
    const { sandbox } = await getSandboxWithErrorHandling(
      state.sandboxSessionId,
      state.targetRepository,
      state.branchName,
      config,
    );

    const repoRoot = getRepoAbsolutePath(state.targetRepository, config);
    const executor = createShellExecutor(config);

    // Get the actual diff content for security analysis
    const diffRes = await executor.executeCommand({
      command: `git diff ${state.baseBranchName} --unified=3`,
      workdir: repoRoot,
      timeout: 60,
      sandbox,
    });

    if (diffRes.exitCode !== 0) {
      logger.error(`Failed to get code changes: ${diffRes.result}`);
      return "Failed to retrieve code changes for security analysis.";
    }

    return diffRes.result.trim();
  } catch (e) {
    logger.error("Failed to get code changes for security analysis.", { e });
    return "Failed to retrieve code changes for security analysis.";
  }
}

export async function scanCodeChanges(
  state: SecurityAuditorGraphState,
  config: GraphConfig,
): Promise<SecurityAuditorGraphUpdate> {
  logger.info("Starting security scan of code changes");

  if (!state.changedFiles || state.changedFiles.trim() === "") {
    logger.info("No changed files to scan");
    return {
      scannedFiles: "No files changed",
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: "ℹ️ No code changes detected to scan for security vulnerabilities.",
        }),
      ],
    };
  }

  try {
    // Get the actual code changes for analysis
    const codeChanges = await getCodeChanges(state, config);

    const model = await loadModel(config, LLMTask.PROGRAMMER);
    const prompt = SECURITY_SCAN_PROMPT
      .replace("{changedFiles}", state.changedFiles)
      .replace("{codeChanges}", codeChanges);

    const response = await model.invoke([
      {
        role: "user",
        content: prompt,
      },
    ]);

    const tokenData = trackCachePerformance(response, "security-scan-model");

    logger.info("Completed security scan of code changes");

    return {
      scannedFiles: state.changedFiles,
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: response.content as string,
        }),
      ],
      tokenData: tokenData,
    };
  } catch (error) {
    logger.error("Failed to scan code changes for security issues", { error });

    return {
      scannedFiles: state.changedFiles,
      auditMessages: [
        new AIMessage({
          id: uuidv4(),
          content: "❌ Failed to complete security scan due to an error. Please review the code changes manually for potential security vulnerabilities.",
        }),
      ],
    };
  }
}