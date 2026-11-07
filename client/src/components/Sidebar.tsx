import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FolderGit2,
  FolderPlus,
  GitBranch,
  Plus,
  MessageSquare,
  Sparkles,
  Activity,
  Layers,
  LogOut,
  Sun,
  Moon,
  X,
  Cpu,
  RotateCw,
  ChevronDown,
  Search,
  Pencil,
  Trash2,
  Check
} from 'lucide-react';
import { Project, Conversation, UsageData, VersionInfo } from '../types.ts';
import { Theme } from '../services/theme.ts';
import { fetchUsage } from '../services/api.ts';

interface SidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onRenameConversation?: (conversationId: string, newTitle: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onLogout: () => void;
  isConnected: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenDirectoryPicker?: () => void;
  versionInfo?: VersionInfo | null;
  onOpenUpdateModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onLogout,
  isConnected,
  theme,
  onToggleTheme,
  isOpenMobile,
  onCloseMobile,
  onOpenDirectoryPicker,
  versionInfo,
  onOpenUpdateModal,
}) => {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isUsageLoading, setIsUsageLoading] = useState(false);
  const [isUsageExpanded, setIsUsageExpanded] = useState(true);
  const [projectSearch, setProjectSearch] = useState('');
  
  // Conversation session inline edit & delete state
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

  const loadUsage = useCallback(async (force = false) => {
    setIsUsageLoading(true);
    try {
      const data = await fetchUsage(force);
      if (data && data.groups) {
        setUsage(data);
      }
    } catch (err) {
      console.error('Error fetching usage quotas:', err);
    } finally {
      setIsUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
    // Auto-refresh quotas every 3 minutes
    const interval = setInterval(() => loadUsage(), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadUsage]);

  const handleProjectClick = (id: string) => {
    onSelectProject(id);
    onCloseMobile?.();
  };

  const handleConversationClick = (id: string) => {
    if (editingConvId || deletingConvId) return;
    onSelectConversation(id);
    onCloseMobile?.();
  };

  const handleNewConvClick = () => {
    onNewConversation();
    onCloseMobile?.();
  };

  const handleStartRename = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitle(conv.title || 'Новый диалог');
    setDeletingConvId(null);
  };

  const handleSaveRename = (e: React.MouseEvent | React.KeyboardEvent, convId: string) => {
    e.stopPropagation();
    if (editTitle.trim() && onRenameConversation) {
      onRenameConversation(convId, editTitle.trim());
    }
    setEditingConvId(null);
    setEditTitle('');
  };

  const handleCancelRename = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setEditingConvId(null);
    setEditTitle('');
  };

  const handleStartDelete = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    setDeletingConvId(convId);
    setEditingConvId(null);
  };

  const handleConfirmDelete = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (onDeleteConversation) {
      onDeleteConversation(convId);
    }
    setDeletingConvId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingConvId(null);
  };

  // Filtered projects by search keyword
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.path && p.path.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.gitBranch && p.gitBranch.toLowerCase().includes(q))
    );
  }, [projects, projectSearch]);

  const geminiGroup = usage?.groups?.find((g) => g.name.toLowerCase().includes('gemini')) || usage?.groups?.[0];
  const claudeGroup = usage?.groups?.find((g) => g.name.toLowerCase().includes('claude') || g.name.toLowerCase().includes('gpt')) || usage?.groups?.[1];

  const renderLimitBar = (bucket: any, label: string) => {
    const hasData = bucket && typeof bucket.percent === 'number';
    const percent = hasData ? bucket.percent : null;

    let colorClass = 'text-zinc-400';
    let barColor = 'bg-zinc-300 dark:bg-zinc-700';

    if (percent !== null) {
      if (percent > 50) {
        colorClass = 'text-emerald-600 dark:text-emerald-400';
        barColor = 'bg-emerald-500';
      } else if (percent > 20) {
        colorClass = 'text-amber-600 dark:text-amber-400';
        barColor = 'bg-amber-500';
      } else {
        colorClass = 'text-rose-600 dark:text-rose-400';
        barColor = 'bg-rose-500';
      }
    }

    const resetInfo = bucket?.resetTime ? ` (сброс: ${new Date(bucket.resetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : '';

    return (
      <div className="space-y-0.5">
        <div className="flex justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
          <span
            className={`font-semibold ${colorClass}`}
            title={(bucket?.description || '') + resetInfo}
          >
            {isUsageLoading && !usage ? (
              <span className="inline-block w-7 h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            ) : percent !== null ? (
              `${percent}%`
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full select-none shrink-0 transition-transform duration-200 ease-in-out fixed md:static inset-y-0 left-0 z-50 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight truncate flex items-center gap-1.5">
                AgentNexus
                <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  STUDIO
                </span>
                <button
                  onClick={onOpenUpdateModal}
                  data-testid="header-version-badge"
                  className="text-[10px] font-mono px-1 py-0.5 rounded text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1"
                  title="Центр обновлений"
                >
                  v{versionInfo?.currentVersion || '2.0.0'}
                  {versionInfo?.hasUpdate && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Theme switcher */}
            <button
              onClick={onToggleTheme}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title={theme === 'dark' ? 'Включить светлую тему' : 'Включить темную тему'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            {/* Online badge */}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
              }`}
              title={isConnected ? 'Сервер подключен' : 'Переподключение...'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 dark:bg-rose-400 animate-pulse'
                }`}
              />
              <span className="hidden sm:inline">{isConnected ? 'online' : 'offline'}</span>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 ml-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Закрыть меню"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Projects List with Quick Search */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Проекты ({projects.length})
            </span>
            {onOpenDirectoryPicker && (
              <button
                type="button"
                data-testid="add-project-btn"
                onClick={onOpenDirectoryPicker}
                className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border border-indigo-200/60 dark:border-indigo-500/30 transition cursor-pointer"
                title="Добавить проект из директории сервера"
              >
                <FolderPlus className="w-3 h-3" />
                <span>+ Проект</span>
              </button>
            )}
          </div>

          {/* Quick Search Input */}
          <div className="relative mb-2">
            <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Поиск проекта..."
              data-testid="project-search-input"
              className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-7 pr-7 py-1 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-hidden focus:border-indigo-500 font-sans"
            />
            {projectSearch && (
              <button
                onClick={() => setProjectSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                title="Очистить поиск"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div data-testid="projects-list-container" className="space-y-1 max-h-[160px] sm:max-h-[180px] overflow-y-auto pr-0.5">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-3 text-zinc-400 text-xs font-mono">
                Ничего не найдено
              </div>
            ) : (
              filteredProjects.map((proj) => {
                const isSelected = proj.id === selectedProjectId;
                return (
                  <button
                    key={proj.id}
                    onClick={() => handleProjectClick(proj.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all group cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <FolderGit2
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          isSelected
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        {/* Top Row: Full Project Name */}
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate flex-1 text-xs">
                            {proj.name}
                          </span>

                          {proj.hasRunningSession && (
                            <span className="relative flex h-2 w-2 shrink-0" title="Выполняется фоновая задача">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                          )}
                        </div>

                        {/* Bottom Row: Git Branch + Description */}
                        <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                          {proj.gitBranch && (
                            <span
                              title={`Git-ветка: ${proj.gitBranch}`}
                              className="inline-flex items-center gap-1 px-1 py-0.2 rounded text-[9px] bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 font-mono shrink-0 max-w-[100px]"
                            >
                              <GitBranch className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
                              <span className="truncate">{proj.gitBranch}</span>
                            </span>
                          )}
                          {proj.description && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">
                              {proj.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversations / Sessions for Selected Project */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-[180px]" data-testid="conversations-sidebar-section">
          <div className="flex items-center justify-between mb-2 px-1 shrink-0">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Сессии диалогов {conversations.length > 0 && `(${conversations.length})`}
            </span>
            <button
              onClick={handleNewConvClick}
              disabled={!selectedProjectId}
              data-testid="new-conversation-btn"
              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border transition ${
                !selectedProjectId
                  ? 'opacity-40 cursor-not-allowed text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700'
                  : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/20 cursor-pointer'
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Новый</span>
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 dark:text-zinc-600 text-xs font-mono">
              {!selectedProjectId ? (
                <span>Выберите проект для просмотра диалогов.</span>
              ) : (
                <span>
                  Нет активных диалогов.
                  <br />
                  Начните новый диалог в поле ввода.
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const isEditing = conv.id === editingConvId;
                const isDeleting = conv.id === deletingConvId;

                if (isEditing) {
                  return (
                    <div
                      key={conv.id}
                      data-testid="conversation-item"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-indigo-400 shadow-xs"
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={editTitle}
                          autoFocus
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(e, conv.id);
                            if (e.key === 'Escape') handleCancelRename(e);
                          }}
                          className="flex-1 bg-white dark:bg-zinc-900 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={(e) => handleSaveRename(e, conv.id)}
                          className="p-1 text-emerald-600 hover:text-emerald-500 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                          title="Сохранить"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelRename}
                          className="p-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 cursor-pointer"
                          title="Отмена"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                }

                if (isDeleting) {
                  return (
                    <div
                      key={conv.id}
                      data-testid="conversation-item"
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs bg-rose-50/70 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 shadow-xs"
                    >
                      <div className="flex items-center justify-between w-full text-[11px] font-sans">
                        <span className="text-rose-600 dark:text-rose-400 font-medium truncate">Удалить сессию?</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleConfirmDelete(e, conv.id)}
                            className="px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium cursor-pointer"
                            title="Подтвердить удаление"
                          >
                            Да
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelDelete}
                            className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                            title="Отмена"
                          >
                            Нет
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={conv.id}
                    type="button"
                    data-testid="conversation-item"
                    onClick={() => handleConversationClick(conv.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between group cursor-pointer relative ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700/80 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                      <span className="truncate">{conv.title || 'Новый диалог'}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {conv.isRunning ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                          работает
                        </span>
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                          {onRenameConversation && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => handleStartRename(e, conv)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 cursor-pointer"
                              title="Переименовать сессию"
                            >
                              <Pencil className="w-3 h-3 pointer-events-none" />
                            </span>
                          )}
                          {onDeleteConversation && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => handleStartDelete(e, conv.id)}
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                              title="Удалить сессию"
                            >
                              <Trash2 className="w-3 h-3 pointer-events-none" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dynamic Model Quotas Widget (/usage) */}
        <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 text-xs shrink-0">
          <div
            onClick={() => setIsUsageExpanded(!isUsageExpanded)}
            className="flex items-center justify-between cursor-pointer select-none py-0.5"
            title="Свернуть / развернуть лимиты"
          >
            <div className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200 text-xs">
              <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Лимиты (/usage)</span>
              <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${isUsageExpanded ? 'rotate-180' : ''}`} />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadUsage(true);
              }}
              disabled={isUsageLoading}
              className="p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
              title="Обновить остатки квот (/usage)"
            >
              <RotateCw className={`w-3 h-3 ${isUsageLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          {isUsageExpanded && (
            <div className="mt-1.5 space-y-2 font-mono text-[11px] bg-white dark:bg-zinc-950 p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs" data-testid="usage-limits-panel">
              {/* Gemini Models group */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    {geminiGroup?.name || 'Gemini Models'}
                  </span>
                  <span className="text-zinc-400 font-mono text-[9px]">Flash / Pro</span>
                </div>
                {renderLimitBar(geminiGroup?.fiveHour, '5-часовой лимит')}
                {renderLimitBar(geminiGroup?.weekly, 'Недельный лимит')}
              </div>

              {/* Claude & GPT models group */}
              <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    {claudeGroup?.name || 'Claude & GPT'}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono">Opus / Sonnet</span>
                </div>
                {renderLimitBar(claudeGroup?.fiveHour, '5-часовой лимит')}
                {renderLimitBar(claudeGroup?.weekly, 'Недельный лимит')}
              </div>
            </div>
          )}
        </div>

        {/* Footer / Version, Multiplexer Status & Logout */}
        <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950 text-xs text-zinc-500 dark:text-zinc-400 font-mono flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenUpdateModal}
              data-testid="version-btn"
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Открыть центр обновлений"
            >
              <span>v{versionInfo?.currentVersion || '2.0.0'}</span>
              {versionInfo?.hasUpdate ? (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Доступно обновление" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Актуальная версия" />
              )}
            </button>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Activity className="w-3 h-3 text-indigo-500" />
              <span>Daemon</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10"
            title="Выйти из системы"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Выйти</span>
          </button>
        </div>
      </aside>
    </>
  );
};
