import React, { useState, useEffect, useCallback } from 'react';
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
  RotateCw
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
    onSelectConversation(id);
    onCloseMobile?.();
  };

  const handleNewConvClick = () => {
    onNewConversation();
    onCloseMobile?.();
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

        {/* Projects List - Expanded height */}
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

          <div className="space-y-1 max-h-[380px] sm:max-h-[420px] overflow-y-auto pr-0.5">
            {projects.map((proj) => {
              const isSelected = proj.id === selectedProjectId;
              return (
                <button
                  key={proj.id}
                  onClick={() => handleProjectClick(proj.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FolderGit2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isSelected
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      {/* Top Row: Full Project Name */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate flex-1">
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
                      <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                        {proj.gitBranch && (
                          <span
                            title={`Git-ветка: ${proj.gitBranch}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 font-mono shrink-0 max-w-[120px]"
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
            })}
          </div>
        </div>

        {/* Conversations / Sessions for Selected Project */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Сессии диалогов
            </span>
            <button
              onClick={handleNewConvClick}
              className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/20 transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Новый</span>
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 dark:text-zinc-600 text-xs font-mono">
              Нет активных диалогов.
              <br />
              Начните новый диалог в поле ввода.
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleConversationClick(conv.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between group cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700/80 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
                      <span className="truncate">{conv.title || 'Новый диалог'}</span>
                    </div>

                    {conv.isRunning && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                        работает
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dynamic Model Quotas Widget (/usage) */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 text-xs shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
              <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Лимиты (/usage)</span>
            </div>
            <button
              onClick={() => loadUsage(true)}
              disabled={isUsageLoading}
              className="p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
              title="Обновить остатки квот (/usage)"
            >
              <RotateCw className={`w-3 h-3 ${isUsageLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>

          <div className="space-y-2.5 font-mono text-[11px] bg-white dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
            {/* Gemini Models group */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-[10px] uppercase tracking-wider">
                  Gemini Models
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">Flash/Pro</span>
              </div>

              {/* 5-Hour Limit */}
              <div className="space-y-0.5 mb-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">5-часовой лимит:</span>
                  <span
                    className={`font-semibold ${
                      (usage?.groups[0]?.fiveHour?.percent ?? 86) > 50
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : (usage?.groups[0]?.fiveHour?.percent ?? 86) > 20
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                    title={usage?.groups[0]?.fiveHour?.description || 'Сброс через 4 часа'}
                  >
                    {usage?.groups[0]?.fiveHour ? `${usage.groups[0].fiveHour.percent}%` : '86%'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (usage?.groups[0]?.fiveHour?.percent ?? 86) > 50
                        ? 'bg-emerald-500'
                        : (usage?.groups[0]?.fiveHour?.percent ?? 86) > 20
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${usage?.groups[0]?.fiveHour?.percent ?? 86}%` }}
                  />
                </div>
              </div>

              {/* Weekly Limit */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Недельный лимит:</span>
                  <span
                    className={`font-semibold ${
                      (usage?.groups[0]?.weekly?.percent ?? 40) > 50
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : (usage?.groups[0]?.weekly?.percent ?? 40) > 20
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                    title={usage?.groups[0]?.weekly?.description || 'Сброс через 1 день'}
                  >
                    {usage?.groups[0]?.weekly ? `${usage.groups[0].weekly.percent}%` : '40%'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (usage?.groups[0]?.weekly?.percent ?? 40) > 50
                        ? 'bg-emerald-500'
                        : (usage?.groups[0]?.weekly?.percent ?? 40) > 20
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${usage?.groups[0]?.weekly?.percent ?? 40}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Claude & GPT models group */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-[10px] uppercase tracking-wider">
                  Claude & GPT
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">Opus/Sonnet</span>
              </div>

              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Остаток квоты:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {usage?.groups[1]?.weekly ? `${usage.groups[1].weekly.percent}%` : '100%'}
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${usage?.groups[1]?.weekly?.percent ?? 100}%` }}
                />
              </div>
            </div>
          </div>
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
