import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  GitCommit,
  ShieldCheck,
  Server,
  Terminal,
  Database,
  ExternalLink
} from 'lucide-react';
import { VersionInfo, UpdateLogEntry } from '../types.ts';
import { fetchVersionInfo, triggerSystemUpdate, checkHealth } from '../services/api.ts';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVersionUpdated?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  onVersionUpdated
}) => {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logs, setLogs] = useState<UpdateLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('master');

  const loadVersion = async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchVersionInfo(force);
      setVersionInfo(data);
    } catch (err: any) {
      setError(err.message || 'Не удалось проверить версию');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersion();
    }
  }, [isOpen]);

  const handleStartUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setError(null);
    setLogs([
      {
        timestamp: new Date().toISOString(),
        step: 'init',
        message: 'Инициализация процесса обновления...',
        status: 'in_progress'
      }
    ]);

    try {
      const res = await triggerSystemUpdate(selectedBranch);
      if (res.logs && res.logs.length > 0) {
        setLogs(res.logs);
      }

      // Start polling for health restart
      startHealthPolling();
    } catch (err: any) {
      setError(err.message || 'Ошибка выполнения обновления');
      setIsUpdating(false);
    }
  };

  const startHealthPolling = () => {
    let attempts = 0;
    setReconnectCountdown(10);

    const interval = setInterval(async () => {
      attempts++;
      const isUp = await checkHealth();
      if (isUp && attempts > 2) {
        clearInterval(interval);
        setReconnectCountdown(0);
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else if (attempts > 30) {
        clearInterval(interval);
        setError('Превышено время ожидания перезапуска сервера. Пожалуйста, обновите страницу вручную.');
        setIsUpdating(false);
      }
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      data-testid="update-modal"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Центр обновлений
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  3X-UI Style
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Управление версиями и обновление системы в 1 клик
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Version Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Local Version Card */}
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-500" />
                  Текущая версия
                </span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-800 dark:text-zinc-200 text-xs font-mono font-semibold">
                  v{versionInfo?.currentVersion || '2.0.0'}
                </span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Коммит:</span>
                  <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                    {versionInfo?.currentCommit || '...'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Ветка:</span>
                  <span className="text-zinc-900 dark:text-zinc-200">
                    {versionInfo?.branch || 'master'}
                  </span>
                </div>
              </div>
            </div>

            {/* Remote Version Card */}
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                  Удаленный статус
                </span>
                {versionInfo?.hasUpdate ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Есть обновление
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Актуально
                  </span>
                )}
              </div>
              <div className="space-y-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Удаленный коммит:</span>
                  <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                    {versionInfo?.remoteCommit || '...'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <span>Источник:</span>
                  <span className="text-zinc-700 dark:text-zinc-300">{versionInfo?.checkSource || 'git'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Latest Commit Message or Release Details */}
          {versionInfo?.commitMessage && (
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/80 dark:border-zinc-800 text-xs">
              <span className="text-zinc-400 font-medium block mb-1">Последний коммит в системе:</span>
              <p className="text-zinc-800 dark:text-zinc-200 font-mono text-[11px] line-clamp-2">
                {versionInfo.commitMessage}
              </p>
              {versionInfo.commitDate && (
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Дата: {versionInfo.commitDate}
                </span>
              )}
            </div>
          )}

          {/* Update Execution Terminal View (when updating) */}
          {isUpdating && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs font-mono space-y-2 text-zinc-300">
              <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800 pb-2 mb-2">
                <span className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                  <Terminal className="w-4 h-4" />
                  Выполнение обновления...
                </span>
                {reconnectCountdown !== null && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Переподключение к серверу...
                  </span>
                )}
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    {log.status === 'done' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    ) : log.status === 'failed' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin mt-0.5 shrink-0" />
                    )}
                    <span className={log.status === 'done' ? 'text-zinc-200' : 'text-zinc-400'}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Safety Backup Notice */}
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-[11px] text-indigo-700 dark:text-indigo-300">
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>
              Перед каждым обновлением автоматически создается моментальная резервная копия базы данных SQLite.
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => loadVersion(true)}
            disabled={isLoading || isUpdating}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Проверить обновления</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isUpdating}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
            >
              Закрыть
            </button>
            <button
              onClick={handleStartUpdate}
              disabled={isUpdating}
              data-testid="start-update-btn"
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-medium shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isUpdating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Обновление...</span>
                </>
              ) : (
                <>
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  <span>Обновить сейчас</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
