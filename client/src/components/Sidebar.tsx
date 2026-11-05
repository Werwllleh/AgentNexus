import React from 'react';
import {
  FolderGit2,
  GitBranch,
  Plus,
  MessageSquare,
  Sparkles,
  Server,
  Activity,
  Layers,
  LogOut,
  ShieldAlert
} from 'lucide-react';
import { Project, Conversation } from '../types.ts';

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
}) => {
  return (
    <aside className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full select-none shrink-0">
      {/* Brand Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-zinc-100 tracking-tight">
              Gemini Hub
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono">
              /home/alex/apps
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}
          title={isConnected ? 'Сервер подключен' : 'Переподключение...'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'
            }`}
          />
          <span>{isConnected ? 'online' : 'offline'}</span>
        </div>
      </div>

      {/* Projects List */}
      <div className="p-3 border-b border-zinc-800/80">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            Проекты ({projects.length})
          </span>
        </div>

        <div className="space-y-1 max-h-56 overflow-y-auto">
          {projects.map((proj) => {
            const isSelected = proj.id === selectedProjectId;
            return (
              <button
                key={proj.id}
                onClick={() => onSelectProject(proj.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderGit2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
                  <div className="min-w-0 truncate">
                    <div className="truncate font-medium text-zinc-200">{proj.name}</div>
                    {proj.description && (
                      <div className="text-[10px] text-zinc-500 truncate font-mono">
                        {proj.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {proj.gitBranch && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                      <GitBranch className="w-2.5 h-2.5 text-zinc-500" />
                      {proj.gitBranch}
                    </span>
                  )}
                  {proj.hasRunningSession && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversations / Sessions for Selected Project */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
            Сессии диалогов
          </span>
          <button
            onClick={onNewConversation}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition"
          >
            <Plus className="w-3 h-3" />
            <span>Новый</span>
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 text-xs font-mono">
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
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between group ${
                    isSelected
                      ? 'bg-zinc-800/80 text-zinc-100 border border-zinc-700/80'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-zinc-500'}`} />
                    <span className="truncate">{conv.title || 'Новый диалог'}</span>
                  </div>

                  {conv.isRunning && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      работает
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Multiplexer Status & Logout */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950 text-xs text-zinc-500 font-mono flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
          <span>Daemon: Active</span>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-400 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-rose-500/10"
          title="Выйти из системы"
        >
          <LogOut className="w-3 h-3" />
          <span>Выйти</span>
        </button>
      </div>
    </aside>
  );
};
