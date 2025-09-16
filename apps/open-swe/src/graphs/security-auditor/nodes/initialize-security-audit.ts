import {
  SecurityAuditorGraphState,
  SecurityAuditorGraphUpdate,
} from "@openswe/shared/open-swe/security-auditor/types";
import { getSandboxWithErrorHandling } from "../../../utils/sandbox.js";
import { getRepoAbsolutePath } from "@openswe/shared/git";
import { createLogger, LogLevel } from "../../../utils/logger.js";
import { GraphConfig } from "@openswe/shared/open-swe/types";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { getSandboxErrorFields } from "../../../utils/sandbox-error-fields.js";
import { Sandbox } from "@daytonaio/sdk";
import { createShellExecutor } from "../../../utils/shell-executor/index.js";

const logger = createLogger(LogLevel.INFO, "InitializeSecurityAuditNode");

function createSecurityAuditStartedMessage() {
  const toolCallId = uuidv4();
  const securityAuditToolCall = {
    id: toolCallId,
    name: "security_audit_started",
    args: {
      audit_started: true,
    },
  };

  return [
    new AIMessage({
      id: uuidv4(),
      content: "🔒 Starting security audit of code changes...",
      additional_kwargs: {
        hidden: false,
      },
      tool_calls: [securityAuditToolCall],
    }),
    new ToolMessage({
      id: uuidv4(),
      tool_call_id: toolCallId,
      content: "Security audit initialized",
      additional_kwargs: {
        hidden: true,
      },
    }),
  ];
}

async function getChangedFiles(
  sandbox: Sandbox,
  baseBranchName: string,
  repoRoot: string,
  config: GraphConfig,
): Promise<string> {
  try {
    const executor = createShellExecutor(config);
    const changedFilesRes = await executor.executeCommand({
      command: `git diff ${baseBranchName} --name-only`,
      workdir: repoRoot,
      timeout: 30,
      sandbox,
    });

    if (changedFilesRes.exitCode !== 0) {
      logger.error(`Failed to get changed files: ${changedFilesRes.result}`);
      return "Failed to get changed files.";
    }
    return changedFilesRes.result.trim();
  } catch (e) {
    const errorFields = getSandboxErrorFields(e);
    logger.error("Failed to get changed files.", {
      ...(errorFields ? { errorFields } : { e }),
    });
    return "Failed to get changed files.";
  }
}

async function getBaseBranchName(
  sandbox: Sandbox,
  repoRoot: string,
  config: GraphConfig,
): Promise<string> {
  try {
    const executor = createShellExecutor(config);
    const baseBranchNameRes = await executor.executeCommand({
      command: "git config init.defaultBranch",
      workdir: repoRoot,
      timeout: 30,
      sandbox,
    });

    if (baseBranchNameRes.exitCode !== 0) {
      logger.error("Failed to get base branch name", {
        result: baseBranchNameRes.result,
      });
      return "main"; // Default fallback
    }
    return baseBranchNameRes.result.trim();
  } catch (e) {
    const errorFields = getSandboxErrorFields(e);
    logger.error("Failed to get base branch name.", {
      ...(errorFields ? { errorFields } : { e }),
    });
    return "main"; // Default fallback
  }
}

export async function initializeSecurityAudit(
  state: SecurityAuditorGraphState,
  config: GraphConfig,
): Promise<SecurityAuditorGraphUpdate> {
  const repoRoot = getRepoAbsolutePath(state.targetRepository, config);
  logger.info("Initializing security audit");

  // Get sandbox and repository information
  const { sandbox, codebaseTree, dependenciesInstalled } =
    await getSandboxWithErrorHandling(
      state.sandboxSessionId,
      state.targetRepository,
      state.branchName,
      config,
    );

  let baseBranchName = state.targetRepository.branch;
  if (!baseBranchName) {
    baseBranchName = await getBaseBranchName(sandbox, repoRoot, config);
  }

  const changedFiles = baseBranchName
    ? await getChangedFiles(sandbox, baseBranchName, repoRoot, config)
    : "";

  logger.info("Finished initializing security audit");

  return {
    baseBranchName,
    changedFiles,
    scannedFiles: "", // Will be populated during scanning
    auditMessages: createSecurityAuditStartedMessage(),
    ...(codebaseTree ? { codebaseTree } : {}),
    ...(dependenciesInstalled !== null ? { dependenciesInstalled } : {}),
  };
}