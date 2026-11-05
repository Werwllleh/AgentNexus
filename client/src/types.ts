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
