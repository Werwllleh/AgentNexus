import React, { useState, useEffect } from 'react';
import {
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  X,
  FileCode,
  CheckCircle2,
  AlertCircle,
  FileDiff,
  Loader2,
  ArrowUp,
  ChevronRight
} from 'lucide-react';
import { Project, FsBrowseResponse, FileContentResponse, GitStatusResponse } from '../types.ts';
import { browseFs, fetchFileContent, fetchGitStatus } from '../services/api.ts';

interface ProjectFileExplorerModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectFileExplorerModal: React.FC<ProjectFileExplorerModalProps> = ({
  project,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'git'>('files');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [browseData, setBrowseData] = useState<FsBrowseResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileContentResponse | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setCurrentPath(project.path);
      loadFolder(project.path);
      loadGit(project.path);
    }
  }, [isOpen, project]);

  const loadFolder = async (folderPath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await browseFs(folderPath);
      setBrowseData(res);
      setCurrentPath(res.currentPath);
    } catch (err: any) {
      setError(err.message || 'Ошибка чтения файлов');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGit = async (projPath: string) => {
    try {
      const res = await fetchGitStatus(projPath);
      setGitStatus(res);
    } catch { /* ignore git status errors */ }
  };

  const handleOpenFile = async (filePath: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const file = await fetchFileContent(filePath);
      setSelectedFile(file);
    } catch (err: any) {
      setError(err.message || 'Не удалось прочитать файл');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div
      data-testid="project-files-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header toolbar */}
        <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                  {project.name}
                </h3>
                {project.gitBranch && (
                  <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    <GitBranch className="w-2.5 h-2.5" />
                    {project.gitBranch}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-sm sm:max-w-md">
                {project.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex rounded-lg p-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 text-xs">
              <button
                onClick={() => { setActiveTab('files'); setSelectedFile(null); }}
                className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                  activeTab === 'files'
                    ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                Файлы
              </button>
              <button
                onClick={() => setActiveTab('git')}
                className={`px-3 py-1 rounded-md font-medium transition cursor-pointer flex items-center gap-1 ${
                  activeTab === 'git'
                    ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <span>Git Diff</span>
                {gitStatus && !gitStatus.isClean && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: File Explorer and Code Preview */}
        {activeTab === 'files' && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Left Column: Directory items */}
            <div className="w-full md:w-72 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/60 dark:bg-zinc-950/40 shrink-0">
              <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                <button
                  onClick={() => browseData?.parentPath && loadFolder(browseData.parentPath)}
                  disabled={!browseData?.parentPath || !browseData.parentPath.startsWith(project.path)}
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                  title="На уровень выше"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </button>
                <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
                  {currentPath.replace(project.path, '') || '/'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
                {isLoading && !selectedFile && (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-500" />
                    Загрузка...
                  </div>
                )}

                {browseData?.items.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => item.isDirectory ? loadFolder(item.path) : handleOpenFile(item.path)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition flex items-center gap-2 group cursor-pointer"
                  >
                    {item.isDirectory ? (
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                      <FileCode className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500 shrink-0" />
                    )}
                    <span className="truncate flex-1 text-zinc-800 dark:text-zinc-200">
                      {item.name}
                    </span>
                    {item.isDirectory && (
                      <ChevronRight className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: File Content Viewer */}
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-zinc-950 overflow-hidden">
              {selectedFile ? (
                <>
                  <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400 shrink-0">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {selectedFile.name}
                    </span>
                    <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap select-text bg-white dark:bg-zinc-950">
                    {selectedFile.content}
                  </pre>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-zinc-400 font-mono">
                  <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                  Выберите файл в левой колонке для просмотра содержимого.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Git Status and Diff */}
        {activeTab === 'git' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!gitStatus?.isGitRepo ? (
              <div className="p-8 text-center text-xs text-zinc-400 font-mono">
                Директория проекта не является Git-репозиторием.
              </div>
            ) : gitStatus.isClean ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <h4 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                  Рабочая ветка чиста
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  В ветке <span className="text-indigo-500 font-semibold">{gitStatus.branch}</span> нет незакоммиченных изменений.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs font-mono">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span>Обнаружены изменения: {gitStatus.changedFiles.length} файлов</span>
                  </div>
                  <span className="text-zinc-500">Ветка: {gitStatus.branch}</span>
                </div>

                {/* Changed files list */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden font-mono text-xs">
                  <div className="bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300 text-[11px] uppercase tracking-wider">
                    Измененные файлы
                  </div>
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {gitStatus.changedFiles.map((item, idx) => (
                      <div key={idx} className="px-3 py-2 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <span className="text-zinc-800 dark:text-zinc-200">{item.file}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'M'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Diff summary */}
                {gitStatus.diffSummary && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-950 font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                    {gitStatus.diffSummary}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
