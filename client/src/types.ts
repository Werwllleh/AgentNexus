export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  category?: string;
  gitBranch: string | null;
  conversationCount: number;
  hasRunningSession: boolean;
  conversations: Conversation[];
}

export interface Conversation {
  id: string;
  project_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  status: 'idle' | 'running' | 'error';
  last_error?: string | null;
  isRunning?: boolean;
}

export interface Step {
  id: string;
  stepIndex: number;
  stepType: 'tool' | 'agent_response' | 'system_message';
  toolName?: string;
  toolParams?: any;
  toolOutput?: string;
  status: 'active' | 'done';
  durationSeconds?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
  status: 'done' | 'streaming' | 'stopped' | 'error';
  steps?: Step[];
}

export interface ConversationDetail extends Conversation {
  activeAssistantMessageId?: string | null;
  messages: Message[];
}

export interface UsageBucket {
  name: string;
  percent: number;
  fraction: number;
  resetTime: string;
  description?: string;
}

export interface UsageGroup {
  name: string;
  description?: string;
  weekly: UsageBucket | null;
  fiveHour: UsageBucket | null;
}

export interface UsageData {
  groups: UsageGroup[];
  updatedAt: number;
  cached?: boolean;
}

export interface EngineModel {
  id: string;
  name: string;
  badge?: string;
  default?: boolean;
}

export interface AIEngine {
  id: string;
  name: string;
  provider: string;
  isAvailable: boolean;
  models: EngineModel[];
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isProjectFolder?: boolean;
}

export interface FsBrowseResponse {
  currentPath: string;
  parentPath: string | null;
  isGitRepo: boolean;
  detectedProject?: {
    name: string;
    description?: string;
    branch?: string;
    path: string;
  } | null;
  items: FileItem[];
}

export interface GitStatusResponse {
  isGitRepo: boolean;
  branch: string | null;
  isClean: boolean;
  changedFiles: Array<{ file: string; status: string }>;
  diffSummary: string;
  error?: string;
}

export interface FileContentResponse {
  path: string;
  name: string;
  size: number;
  extension: string;
  content: string;
}

export interface VersionInfo {
  success: boolean;
  currentVersion: string;
  currentCommit: string;
  currentCommitFull: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  remoteCommit: string;
  remoteCommitFull: string;
  hasUpdate: boolean;
  commitsBehind: number;
  latestRelease?: {
    tagName: string;
    name: string;
    body: string;
    publishedAt: string;
    htmlUrl: string;
  } | null;
  checkSource: string;
  isUpdating: boolean;
  lastChecked: string;
}

export interface UpdateLogEntry {
  timestamp: string;
  step: string;
  message: string;
  status: 'in_progress' | 'done' | 'failed';
}

export interface UpdateResult {
  success: boolean;
  message: string;
  logs: UpdateLogEntry[];
  backupFolder?: string;
  error?: string;
}
