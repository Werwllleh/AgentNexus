import React, { useState, useEffect, useCallback } from 'react';
import { Project, Conversation, ConversationDetail, Message, Step, VersionInfo } from './types.ts';
import {
  fetchProjects,
  fetchConversations,
  fetchConversation,
  createConversation,
  renameConversation,
  deleteConversation,
  sendPrompt,
  stopConversation,
  checkAuth,
  refreshSession,
  logout,
  fetchVersionInfo
} from './services/api.ts';
import { wsClient } from './services/websocket.ts';
import { Theme, getInitialTheme, applyTheme } from './services/theme.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { LoginView } from './components/LoginView.tsx';
import { DirectoryPickerModal } from './components/DirectoryPickerModal.tsx';
import { ProjectFileExplorerModal } from './components/ProjectFileExplorerModal.tsx';
import { UpdateModal } from './components/UpdateModal.tsx';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isProjectsLoaded, setIsProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('project');
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeAssistantMsgId, setActiveAssistantMsgId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);
  const [isProjectFilesOpen, setIsProjectFilesOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

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

  // Silent sliding session background refresher
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleActive = () => {
      refreshSession();
    };

    // Auto-refresh timer every 6 hours
    const refreshTimer = setInterval(() => {
      refreshSession();
    }, 6 * 60 * 60 * 1000);

    window.addEventListener('focus', handleActive);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    });

    return () => {
      clearInterval(refreshTimer);
      window.removeEventListener('focus', handleActive);
    };
  }, [isAuthenticated]);

  // Load version info once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchVersionInfo().then(setVersionInfo).catch(() => {});
    }
  }, [isAuthenticated]);

  // Helper to read project from URL
  const getUrlProject = (): string | null => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('project');
  };

  // Sync URL when selectedProjectId changes (only after projects have loaded)
  useEffect(() => {
    if (typeof window === 'undefined' || !isProjectsLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const currentInUrl = params.get('project');

    if (selectedProjectId) {
      if (currentInUrl !== selectedProjectId) {
        params.set('project', selectedProjectId);
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, '', newUrl);
      }
    } else {
      if (currentInUrl) {
        params.delete('project');
        const qs = params.toString();
        const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [selectedProjectId, isProjectsLoaded]);

  // Handle browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const projInUrl = getUrlProject();
      if (projInUrl) {
        setSelectedProjectId(projInUrl);
      } else {
        setSelectedProjectId(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
      setIsProjectsLoaded(true);

      const urlProj = getUrlProject();
      if (urlProj && data.some((p) => p.id === urlProj)) {
        setSelectedProjectId(urlProj);
      } else {
        // If no parameter in URL, or project not found, keep null so "Выберите проект" is shown
        setSelectedProjectId(null);
        if (urlProj) {
          const params = new URLSearchParams(window.location.search);
          params.delete('project');
          const qs = params.toString();
          const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
          window.history.replaceState(null, '', newUrl);
        }
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setIsProjectsLoaded(true);
    }
  }, []);

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
    if (!isAuthenticated) return;
    if (!selectedProjectId) {
      setConversations([]);
      setSelectedConversationId(null);
      setConversationDetail(null);
      setIsRunning(false);
      setActiveAssistantMsgId(null);
      wsClient.unsubscribe();
      return;
    }

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
      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        let existingIdx = messages.findIndex((m) => m.id === data.messageId);
        if (existingIdx < 0) {
          existingIdx = messages.findIndex(
            (m) => m.role === 'assistant' && (m.id.startsWith('temp-asst-') || m.status === 'streaming')
          );
        }

        if (existingIdx >= 0) {
          messages[existingIdx] = {
            ...messages[existingIdx],
            id: data.messageId,
            conversation_id: data.conversationId,
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
      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = [...prev.messages];
        let existingIdx = messages.findIndex((m) => m.id === data.messageId);
        if (existingIdx < 0) {
          existingIdx = messages.findIndex(
            (m) => m.role === 'assistant' && (m.id.startsWith('temp-asst-') || m.status === 'streaming')
          );
        }

        if (existingIdx >= 0) {
          const target = messages[existingIdx];
          const steps = [...(target.steps || [])];
          const stepIdx = steps.findIndex((s) => s.stepIndex === data.step.stepIndex);

          if (stepIdx >= 0) {
            steps[stepIdx] = data.step;
          } else {
            steps.push(data.step);
          }

          messages[existingIdx] = {
            ...target,
            id: data.messageId,
            conversation_id: data.conversationId,
            status: 'streaming',
            steps
          };
        } else {
          messages.push({
            id: data.messageId,
            conversation_id: data.conversationId,
            role: 'assistant',
            content: '',
            created_at: Date.now(),
            status: 'streaming',
            steps: [data.step]
          });
        }

        return { ...prev, messages };
      });
    });

    // 4. Done
    const unsubDone = wsClient.on('done', (data) => {
      setIsRunning(false);
      setActiveAssistantMsgId(null);

      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = prev.messages.map((m) => {
          if (m.id === data.messageId || m.id.startsWith('temp-asst-')) {
            return {
              ...m,
              id: data.messageId,
              content: data.finalContent ?? m.content,
              status: 'done' as const
            };
          }
          return m;
        });
        return { ...prev, isRunning: false, messages };
      });

      if (selectedProjectId) {
        loadConversations(selectedProjectId);
      }
    });

    // 5. Stopped
    const unsubStopped = wsClient.on('stopped', (data) => {
      setIsRunning(false);
      setActiveAssistantMsgId(null);

      if (data.securityAlert) {
        setSecurityError(data.securityAlert);
      }

      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = prev.messages.map((m) => {
          if (m.id === data.messageId || m.id.startsWith('temp-asst-')) {
            return {
              ...m,
              id: data.messageId,
              status: 'stopped' as const
            };
          }
          return m;
        });
        return { ...prev, isRunning: false, messages };
      });
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
  const handleNewConversation = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const conv = await createConversation(selectedProjectId);
      await loadConversations(selectedProjectId);
      setSelectedConversationId(conv.id);
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  }, [selectedProjectId, loadConversations]);

  // Handle Rename Conversation
  const handleRenameConversation = async (convId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      await renameConversation(convId, newTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle.trim() } : c))
      );
      if (conversationDetail && conversationDetail.id === convId) {
        setConversationDetail((prev) => (prev ? { ...prev, title: newTitle.trim() } : prev));
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  // Handle Delete Conversation
  const handleDeleteConversation = async (convId: string) => {
    try {
      await deleteConversation(convId);
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);
      if (selectedConversationId === convId) {
        if (remaining.length > 0) {
          setSelectedConversationId(remaining[0].id);
        } else {
          setSelectedConversationId(null);
          setConversationDetail(null);
          setIsRunning(false);
          setActiveAssistantMsgId(null);
          wsClient.unsubscribe();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Global hotkeys (Ctrl+N, Ctrl+B, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape always closes open modals/overlays
      if (e.key === 'Escape') {
        setIsDirectoryPickerOpen(false);
        setIsProjectFilesOpen(false);
        setIsUpdateModalOpen(false);
        setIsMobileNavOpen(false);
        return;
      }

      // Ctrl+N or Cmd+N creates a new conversation in current project
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (selectedProjectId) {
          handleNewConversation();
        }
        return;
      }

      // Ctrl+B or Cmd+B toggles mobile navigation drawer
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsMobileNavOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedProjectId, handleNewConversation]);

  // Handle Send Prompt
  const handleSendPrompt = async (
    promptText: string,
    mode: string = 'auto',
    effort: string = 'high',
    engine: string = 'gemini',
    model: string = 'auto'
  ) => {
    if (!selectedProjectId) return;
    setSecurityError(null);

    // If no conversation currently selected, pre-allocate a clean UUID so we can subscribe immediately
    const targetConvId = selectedConversationId || crypto.randomUUID();
    const tempUserMsgId = 'temp-' + Date.now();
    const tempAssistantMsgId = 'temp-asst-' + Date.now();

    setIsRunning(true);
    setActiveAssistantMsgId(tempAssistantMsgId);

    // Immediately subscribe WebSocket before network request to prevent dropped early events
    wsClient.subscribe(targetConvId);
    if (!selectedConversationId) {
      setSelectedConversationId(targetConvId);
    }

    setConversationDetail((prev) => {
      const userMsg: Message = {
        id: tempUserMsgId,
        conversation_id: targetConvId,
        role: 'user',
        content: promptText,
        created_at: Date.now(),
        status: 'done'
      };

      const assistantMsg: Message = {
        id: tempAssistantMsgId,
        conversation_id: targetConvId,
        role: 'assistant',
        content: '',
        created_at: Date.now(),
        status: 'streaming',
        steps: []
      };

      if (!prev || prev.id !== targetConvId) {
        return {
          id: targetConvId,
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
        conversationId: targetConvId,
        prompt: promptText,
        engine,
        model,
        mode,
        effort
      });

      // Reconcile IDs immediately with server-assigned IDs
      if (res.assistantMessageId) {
        setActiveAssistantMsgId(res.assistantMessageId);
      }

      setConversationDetail((prev) => {
        if (!prev) return prev;
        const messages = prev.messages.map((m) => {
          if (m.id === tempUserMsgId && res.userMessageId) {
            return { ...m, id: res.userMessageId, conversation_id: res.conversationId };
          }
          if (m.id === tempAssistantMsgId && res.assistantMessageId) {
            return { ...m, id: res.assistantMessageId, conversation_id: res.conversationId };
          }
          return m;
        });
        return { ...prev, id: res.conversationId, messages };
      });

      if (res.conversationId && res.conversationId !== targetConvId) {
        setSelectedConversationId(res.conversationId);
        wsClient.subscribe(res.conversationId);
      }
      loadConversations(selectedProjectId);
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

  const handleProjectAdded = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setSelectedProjectId(newProject.id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div className="flex fixed inset-0 h-[100dvh] max-h-[100dvh] w-screen bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans transition-colors duration-200">
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        onSelectConversation={setSelectedConversationId}
        onNewConversation={handleNewConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onLogout={handleLogout}
        isConnected={isConnected}
        theme={theme}
        onToggleTheme={toggleTheme}
        isOpenMobile={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        onOpenDirectoryPicker={() => setIsDirectoryPickerOpen(true)}
        versionInfo={versionInfo}
        onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
      />

      <ChatArea
        project={selectedProject}
        projects={projects}
        onSelectProject={setSelectedProjectId}
        conversation={conversationDetail}
        isRunning={isRunning}
        onSendPrompt={handleSendPrompt}
        onStop={handleStop}
        activeAssistantMessageId={activeAssistantMsgId}
        securityError={securityError}
        onDismissSecurityError={() => setSecurityError(null)}
        onOpenMobile={() => setIsMobileNavOpen(true)}
        onOpenProjectFiles={() => setIsProjectFilesOpen(true)}
      />

      <DirectoryPickerModal
        isOpen={isDirectoryPickerOpen}
        onClose={() => setIsDirectoryPickerOpen(false)}
        onProjectAdded={handleProjectAdded}
      />

      <ProjectFileExplorerModal
        project={selectedProject}
        isOpen={isProjectFilesOpen}
        onClose={() => setIsProjectFilesOpen(false)}
      />

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        onVersionUpdated={() => {
          fetchVersionInfo(true).then(setVersionInfo).catch(() => {});
        }}
      />
    </div>
  );
};
