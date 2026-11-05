import React, { useState, useEffect, useCallback } from 'react';
import { Project, Conversation, ConversationDetail, Message, Step } from './types.ts';
import {
  fetchProjects,
  fetchConversations,
  fetchConversation,
  createConversation,
  sendPrompt,
  stopConversation,
  checkAuth,
  logout
} from './services/api.ts';
import { wsClient } from './services/websocket.ts';
import { Theme, getInitialTheme, applyTheme } from './services/theme.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { LoginView } from './components/LoginView.tsx';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Theme sync
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Check auth state on start
  const verifyAuth = useCallback(async () => {
    const res = await checkAuth();
    setIsAuthenticated(res.authenticated);
  }, []);

  useEffect(() => {
    verifyAuth();

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      wsClient.disconnect();
    };

    window.addEventListener('auth_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth_unauthorized', handleUnauthorized);
    };
  }, [verifyAuth]);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  }, [selectedProjectId]);

  // Load conversations for project
  const loadConversations = useCallback(async (projId: string) => {
    try {
      const list = await fetchConversations(projId);
      setConversations(list);
      return list;
    } catch (err) {
      console.error('Error loading conversations:', err);
      return [];
    }
  }, []);

  // Load single conversation detail
  const loadConversationDetail = useCallback(async (convId: string) => {
    try {
      const detail = await fetchConversation(convId);
      setConversationDetail(detail);
      setIsRunning(detail.isRunning || false);
      setActiveAssistantMsgId(detail.activeAssistantMessageId || null);
      wsClient.subscribe(convId);
    } catch (err) {
      console.error('Error loading conversation detail:', err);
    }
  }, []);

  // Initialize data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      wsClient.connect();
      loadProjects();

      const unsubConn = wsClient.on('connection_change', ({ connected }) => {
        setIsConnected(connected);
      });

      const unsubAuthErr = wsClient.on('auth_error', () => {
        setIsAuthenticated(false);
      });

      return () => {
        unsubConn();
        unsubAuthErr();
      };
    } else {
      wsClient.disconnect();
    }
  }, [isAuthenticated, loadProjects]);

  // When selected project changes
  useEffect(() => {
    if (!selectedProjectId || !isAuthenticated) return;
    loadConversations(selectedProjectId).then((convList) => {
      if (convList.length > 0) {
        setSelectedConversationId(convList[0].id);
      } else {
        setSelectedConversationId(null);
        setConversationDetail(null);
        setIsRunning(false);
        setActiveAssistantMsgId(null);
        wsClient.unsubscribe();
      }
    });
  }, [selectedProjectId, isAuthenticated, loadConversations]);

  // When selected conversation changes
  useEffect(() => {
    if (selectedConversationId && isAuthenticated) {
      loadConversationDetail(selectedConversationId);
    } else {
      setConversationDetail(null);
      setIsRunning(false);
      setActiveAssistantMsgId(null);
      wsClient.unsubscribe();
    }
  }, [selectedConversationId, isAuthenticated, loadConversationDetail]);

  // WebSocket event listeners for streaming and state sync
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Sync state (on connect or subscribe)
    const unsubSync = wsClient.on('sync_state', (data) => {
      if (data.conversationId !== selectedConversationId) return;

      setIsRunning(data.isRunning);
      if (data.isRunning) {
        setActiveAssistantMsgId(data.assistantMessageId);

        setConversationDetail((prev) => {
          if (!prev) return prev;
          const messages = [...prev.messages];
          const existingIdx = messages.findIndex((m) => m.id === data.assistantMessageId);

          const updatedMsg: Message = {
            id: data.assistantMessageId,
            conversation_id: data.conversationId,
            role: 'assistant',
            content: data.currentContent || '',
            created_at: Date.now(),
            status: 'streaming',
            steps: data.currentSteps || []
          };

          if (existingIdx >= 0) {
            messages[existingIdx] = updatedMsg;
          } else {
            messages.push(updatedMsg);
          }

          return { ...prev, messages };
        });
      }
    });

    // 2. Text delta
    const unsubDelta = wsClient.on('text_delta', (data) => {
      if (data.conversationId !== selectedConversationId) return;

      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const existingIdx = messages.findIndex((m) => m.id === data.messageId);

        if (existingIdx >= 0) {
          messages[existingIdx] = {
            ...messages[existingIdx],
            content: data.fullContent,
            status: 'streaming'
          };
        } else {
          messages.push({
            id: data.messageId,
            conversation_id: data.conversationId,
            role: 'assistant',
            content: data.fullContent,
            created_at: Date.now(),
            status: 'streaming',
            steps: []
          });
        }

        return { ...prev, messages };
      });
    });

    // 3. Tool update
    const unsubTool = wsClient.on('tool_update', (data) => {
      if (data.conversationId !== selectedConversationId) return;

      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        const existingIdx = messages.findIndex((m) => m.id === data.messageId);

        if (existingIdx >= 0) {
          const steps = [...(messages[existingIdx].steps || [])];
          const stepIdx = steps.findIndex((s) => s.stepIndex === data.step.stepIndex);

          if (stepIdx >= 0) {
            steps[stepIdx] = data.step;
          } else {
            steps.push(data.step);
          }

          messages[existingIdx] = {
            ...messages[existingIdx],
            steps
          };
        }

        return { ...prev, messages };
      });
    });

    // 4. Done
    const unsubDone = wsClient.on('done', (data) => {
      if (data.conversationId === selectedConversationId) {
        setIsRunning(false);
        setActiveAssistantMsgId(null);

        setConversationDetail((prev) => {
          if (!prev) return prev;
          const messages = prev.messages.map((m) =>
            m.id === data.messageId
              ? { ...m, content: data.finalContent, status: 'done' as const }
              : m
          );
          return { ...prev, isRunning: false, messages };
        });

        if (selectedProjectId) {
          loadConversations(selectedProjectId);
        }
      }
    });

    // 5. Stopped
    const unsubStopped = wsClient.on('stopped', (data) => {
      if (data.conversationId === selectedConversationId) {
        setIsRunning(false);
        setActiveAssistantMsgId(null);

        if (data.securityAlert) {
          setSecurityError(data.securityAlert);
        }

        setConversationDetail((prev) => {
          if (!prev) return prev;
          const messages = prev.messages.map((m) =>
            m.id === data.messageId
              ? { ...m, status: 'stopped' as const }
              : m
          );
          return { ...prev, isRunning: false, messages };
        });
      }
    });

    // 6. Project status
    const unsubProjectStatus = wsClient.on('project_status', (data) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === data.projectId
            ? { ...p, hasRunningSession: data.status === 'running' }
            : p
        )
      );

      if (data.projectId === selectedProjectId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.conversationId
              ? { ...c, isRunning: data.status === 'running' }
              : c
          )
        );
      }
    });

    // 7. Conversation created
    const unsubConvCreated = wsClient.on('conversation_created', (data) => {
      if (data.projectId === selectedProjectId) {
        loadConversations(selectedProjectId).then(() => {
          setSelectedConversationId(data.conversationId);
        });
      }
    });

    return () => {
      unsubSync();
      unsubDelta();
      unsubTool();
      unsubDone();
      unsubStopped();
      unsubProjectStatus();
      unsubConvCreated();
    };
  }, [selectedConversationId, selectedProjectId, isAuthenticated, loadConversations]);

  // Handle New Conversation
  const handleNewConversation = async () => {
    if (!selectedProjectId) return;
    try {
      const conv = await createConversation(selectedProjectId);
      await loadConversations(selectedProjectId);
      setSelectedConversationId(conv.id);
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  };

  // Handle Send Prompt
  const handleSendPrompt = async (promptText: string, mode: string, effort: string) => {
    if (!selectedProjectId) return;
    setSecurityError(null);

    // Optimistically add user message to UI
    const tempUserMsgId = 'temp-' + Date.now();
    const tempAssistantMsgId = 'temp-asst-' + Date.now();

    setIsRunning(true);
    setActiveAssistantMsgId(tempAssistantMsgId);

    setConversationDetail((prev) => {
      const userMsg: Message = {
        id: tempUserMsgId,
        conversation_id: selectedConversationId || '',
        role: 'user',
        content: promptText,
        created_at: Date.now(),
        status: 'done'
      };

      const assistantMsg: Message = {
        id: tempAssistantMsgId,
        conversation_id: selectedConversationId || '',
        role: 'assistant',
        content: '',
        created_at: Date.now(),
        status: 'streaming',
        steps: []
      };

      if (!prev) {
        return {
          id: selectedConversationId || 'pending',
          project_id: selectedProjectId,
          title: promptText.slice(0, 30) + '...',
          created_at: Date.now(),
          updated_at: Date.now(),
          status: 'running',
          isRunning: true,
          messages: [userMsg, assistantMsg]
        };
      }

      return {
        ...prev,
        isRunning: true,
        messages: [...prev.messages, userMsg, assistantMsg]
      };
    });

    try {
      const res = await sendPrompt({
        projectId: selectedProjectId,
        conversationId: selectedConversationId,
        prompt: promptText,
        mode,
        effort
      });

      if (res.conversationId && res.conversationId !== selectedConversationId) {
        setSelectedConversationId(res.conversationId);
        loadConversations(selectedProjectId);
      }
    } catch (err: any) {
      console.error('Error sending prompt:', err);
      setIsRunning(false);
      setActiveAssistantMsgId(null);

      // Revert optimistic messages if rejected by security
      setConversationDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          isRunning: false,
          messages: prev.messages.filter(
            (m) => m.id !== tempUserMsgId && m.id !== tempAssistantMsgId
          )
        };
      });

      if (err.isSecurityBlock) {
        setSecurityError(err.message);
      } else {
        alert('Ошибка при отправке: ' + err.message);
      }
    }
  };

  // Handle Stop
  const handleStop = async () => {
    if (!selectedConversationId) return;
    try {
      await stopConversation(selectedConversationId);
    } catch (err) {
      console.error('Error stopping conversation:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center font-mono text-zinc-500 text-xs">
        Проверка авторизации...
      </div>
    );
  }

  if (isAuthenticated === false) {
    return (
      <LoginView
        onSuccess={() => setIsAuthenticated(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div className="flex h-screen w-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans transition-colors duration-200">
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={setSelectedConversationId}
        onNewConversation={handleNewConversation}
        onLogout={handleLogout}
        isConnected={isConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <ChatArea
        project={selectedProject}
        conversation={conversationDetail}
        isRunning={isRunning}
        onSendPrompt={handleSendPrompt}
        onStop={handleStop}
        activeAssistantMessageId={activeAssistantMsgId}
        securityError={securityError}
        onDismissSecurityError={() => setSecurityError(null)}
      />
    </div>
  );
};
