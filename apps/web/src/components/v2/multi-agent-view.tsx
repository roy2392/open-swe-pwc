"use client";

import { useState, Suspense } from "react";
import { DefaultView } from "./default-view";
import { useThreadsSWR } from "@/hooks/useThreadsSWR";
import { GitHubAppProvider, useGitHubAppProvider } from "@/providers/GitHubApp";
import { Toaster } from "@/components/ui/sonner";
import {
  MANAGER_GRAPH_ID,
  PLANNER_GRAPH_ID,
  PROGRAMMER_GRAPH_ID,
  SECURITY_AUDITOR_GRAPH_ID
} from "@openswe/shared/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserPopover } from "@/components/user-popover";
import { PwCLogo } from "@/components/icons/pwc-logo";
import { Settings, BookOpen, Shield, Users, Code, Target } from "lucide-react";
import NextLink from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

const DOCUMENTATION_URL = "https://docs.langchain.com/labs/swe";

function OpenSettingsButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          asChild
          className="hover:bg-accent hover:text-accent-foreground size-6 rounded-md p-1 hover:cursor-pointer"
        >
          <NextLink href="/settings">
            <Settings className="size-4" />
          </NextLink>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open Settings</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function OpenDocumentationButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          asChild
          className="hover:bg-accent hover:text-accent-foreground size-6 rounded-md p-1 hover:cursor-pointer"
        >
          <a
            href={DOCUMENTATION_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen className="size-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open Documentation</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AgentViewProps {
  assistantId: string;
  agentName: string;
}

function AgentView({ assistantId, agentName }: AgentViewProps) {
  const { currentInstallation } = useGitHubAppProvider();
  const { threads, isLoading: threadsLoading } = useThreadsSWR({
    assistantId,
    currentInstallation,
  });

  if (!threads) {
    return <div>No threads for {agentName}</div>;
  }

  return (
    <DefaultView
      threads={threads}
      threadsLoading={threadsLoading}
      hideHeader={true}
    />
  );
}

function MultiAgentViewContent() {
  const [activeTab, setActiveTab] = useState("manager");

  const agents = [
    {
      id: "manager",
      name: "Manager",
      icon: Users,
      description: "Orchestrate and coordinate tasks",
      graphId: MANAGER_GRAPH_ID,
    },
    {
      id: "planner",
      name: "Planner",
      icon: Target,
      description: "Plan and organize development tasks",
      graphId: PLANNER_GRAPH_ID,
    },
    {
      id: "programmer",
      name: "Programmer",
      icon: Code,
      description: "Write and modify code",
      graphId: PROGRAMMER_GRAPH_ID,
    },
    {
      id: "security-auditor",
      name: "Security Auditor",
      icon: Shield,
      description: "Scan code and provide security recommendations",
      graphId: SECURITY_AUDITOR_GRAPH_ID,
    },
  ];

  return (
    <div className="bg-background h-screen flex flex-col">
      {/* Header */}
      <div className="border-border bg-card border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PwCLogo
              width={100}
              height={65}
            />
          </div>
          <div className="absolute left-1/2 transform -translate-x-1/2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
              PwC Agent Developer Platform
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">ready</span>
              <div className="h-1 w-1 rounded-full bg-green-500 dark:bg-green-600"></div>
            </div>
            <OpenDocumentationButton />
            <OpenSettingsButton />
            <ThemeToggle />
            <UserPopover />
          </div>
        </div>
      </div>

      {/* Agent Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="border-border bg-muted/50 border-b px-4 py-2">
          <TabsList className="w-fit">
            {agents.map((agent) => {
              const IconComponent = agent.icon;
              return (
                <TabsTrigger
                  key={agent.id}
                  value={agent.id}
                  className="flex items-center gap-2"
                >
                  <IconComponent className="size-4" />
                  {agent.name}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {agents.map((agent) => (
            <TabsContent
              key={agent.id}
              value={agent.id}
              className="h-full m-0 data-[state=active]:flex data-[state=active]:flex-col"
            >
              <AgentView
                assistantId={agent.graphId}
                agentName={agent.name}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

export function MultiAgentView() {
  return (
    <GitHubAppProvider>
      <Suspense fallback={<div>Loading...</div>}>
        <Toaster />
        <MultiAgentViewContent />
      </Suspense>
    </GitHubAppProvider>
  );
}