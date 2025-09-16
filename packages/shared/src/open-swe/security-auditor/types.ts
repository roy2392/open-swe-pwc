import "@langchain/langgraph/zod";
import { z } from "zod";
import {
  Messages,
  messagesStateReducer,
  MessagesZodState,
} from "@langchain/langgraph";
import {
  CustomRules,
  ModelTokenData,
  TargetRepository,
  TaskPlan,
} from "../types.js";
import { withLangGraph } from "@langchain/langgraph/zod";
import { BaseMessage } from "@langchain/core/messages";
import { tokenDataReducer } from "../../caching.js";

export interface SecurityVulnerability {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  file: string;
  line?: number;
  recommendation: string;
  cweId?: string;
}

export interface SecurityAuditReport {
  vulnerabilities: SecurityVulnerability[];
  summary: string;
  overallRisk: "critical" | "high" | "medium" | "low";
  recommendations: string[];
}

export const SecurityAuditorGraphStateObj = MessagesZodState.extend({
  /**
   * Messages specifically for the security auditor agent
   */
  auditMessages: withLangGraph(z.custom<BaseMessage[]>(), {
    reducer: {
      schema: z.custom<Messages>(),
      fn: messagesStateReducer,
    },
    jsonSchemaExtra: {
      langgraph_type: "messages",
    },
    default: () => [],
  }),
  /**
   * Internal messages from the main conversation to analyze
   */
  internalMessages: withLangGraph(z.custom<BaseMessage[]>(), {
    reducer: {
      schema: z.custom<Messages>(),
      fn: messagesStateReducer,
    },
    jsonSchemaExtra: {
      langgraph_type: "messages",
    },
    default: () => [],
  }),
  sandboxSessionId: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  targetRepository: withLangGraph(z.custom<TargetRepository>(), {
    reducer: {
      schema: z.custom<TargetRepository>(),
      fn: (_state, update) => update,
    },
  }),
  githubIssueId: withLangGraph(z.custom<number>(), {
    reducer: {
      schema: z.custom<number>(),
      fn: (_state, update) => update,
    },
  }),
  codebaseTree: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  taskPlan: withLangGraph(z.custom<TaskPlan>(), {
    reducer: {
      schema: z.custom<TaskPlan>(),
      fn: (_state, update) => update,
    },
  }),
  branchName: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  baseBranchName: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  changedFiles: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  /**
   * Files that have been scanned by the security auditor
   */
  scannedFiles: withLangGraph(z.string(), {
    reducer: {
      schema: z.string(),
      fn: (_state, update) => update,
    },
  }),
  /**
   * Security audit report containing vulnerabilities and recommendations
   */
  securityReport: withLangGraph(z.custom<SecurityAuditReport>(), {
    reducer: {
      schema: z.custom<SecurityAuditReport>(),
      fn: (_state, update) => update,
    },
  }),
  customRules: withLangGraph(z.custom<CustomRules>().optional(), {
    reducer: {
      schema: z.custom<CustomRules>().optional(),
      fn: (_state, update) => update,
    },
  }),
  dependenciesInstalled: withLangGraph(z.boolean(), {
    reducer: {
      schema: z.boolean(),
      fn: (_state, update) => update,
    },
  }),
  tokenData: withLangGraph(z.custom<ModelTokenData[]>().optional(), {
    reducer: {
      schema: z.custom<ModelTokenData[]>().optional(),
      fn: tokenDataReducer,
    },
  }),
});

export type SecurityAuditorGraphState = z.infer<typeof SecurityAuditorGraphStateObj>;
export type SecurityAuditorGraphUpdate = Partial<SecurityAuditorGraphState>;