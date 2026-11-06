import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  FolderGit2,
  ChevronRight,
  ArrowUp,
  X,
  Search,
  Check,
  Loader2,
  Sparkles,
  GitBranch
} from 'lucide-react';
import { FsBrowseResponse, FileItem, Project } from '../types.ts';
import { browseFs, addProjectFolder } from '../services/api.ts';

interface DirectoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectAdded: (newProject: Project) => void;
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  onClose,
  onProjectAdded
}) => {
  const [currentPath, setCurrentPath] = useState<string>('/home/alex/apps');
  const [data, setData] = useState<FsBrowseResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectCategory, setProjectCategory] = useState('apps');

  const loadDirectory = async (pathTarget?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await browseFs(pathTarget);
      setData(res);
      setCurrentPath(res.currentPath);

      // Pre-fill form if project detected
      if (res.detectedProject) {
        setProjectName(res.detectedProject.name || '');
        setProjectDesc(res.detectedProject.description || '');
      } else {
        const parts = res.currentPath.split('/').filter(Boolean);
        setProjectName(parts[parts.length - 1] || '');
        setProjectDesc(`Проект в ${res.currentPath}`);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка чтения директории');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory('/home/alex/apps');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectFolder = (folderPath: string) => {
    loadDirectory(folderPath);
  };

  const handleGoUp = () => {
    if (data?.parentPath) {
      loadDirectory(data.parentPath);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('Укажите название проекта');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await addProjectFolder({
        folderPath: currentPath,
        name: projectName.trim(),
        description: projectDesc.trim(),
        category: projectCategory
      });
      onProjectAdded(res.project);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Не удалось добавить проект');
    } finally {
      setIsSubmitting(false);
    }
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  const filteredItems = (data?.items || [])
    .filter((item) => item.isDirectory)
    .filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div
      data-testid="directory-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                Добавить проект из директории
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Выберите любую папку на сервере для подключения к AgentNexus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb Navigation & Up Button */}
        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2 shrink-0">
          <button
            onClick={handleGoUp}
            disabled={!data?.parentPath}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 text-zinc-700 dark:text-zinc-300 transition cursor-pointer shrink-0"
            title="На уровень выше"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1 overflow-x-auto font-mono text-xs text-zinc-600 dark:text-zinc-400 py-1 scrollbar-none flex-1">
            <button
              onClick={() => loadDirectory('/home/alex')}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              /
            </button>
            {breadcrumbs.map((segment, idx) => {
              const fullSegmentPath = '/' + breadcrumbs.slice(0, idx + 1).join('/');
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={fullSegmentPath}>
                  <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                  <button
                    onClick={() => loadDirectory(fullSegmentPath)}
                    className={`hover:underline truncate max-w-[140px] ${
                      isLast
                        ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                        : 'hover:text-indigo-600 dark:hover:text-indigo-400'
                    }`}
                  >
                    {segment}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Search filter */}
        <div className="px-5 py-2 border-b border-zinc-100 dark:border-zinc-800/40 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Поиск по папкам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Folder items list */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 min-h-[160px] max-h-[260px] space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-zinc-500 font-mono gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Чтение директории...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-400 font-mono">
              В этой папке нет вложенных директорий.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleSelectFolder(item.path)}
                  className="w-full text-left p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-4 h-4 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="font-medium text-xs text-zinc-800 dark:text-zinc-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {item.name}
                    </span>
                  </div>
                  {item.isProjectFolder && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono shrink-0">
                      проект
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Folder Registration Form */}
        <form onSubmit={handleAddProject} className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/60 shrink-0 space-y-3">
          {data?.detectedProject && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-[11px] text-indigo-700 dark:text-indigo-300 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>Обнаружен проект: {data.detectedProject.name}</span>
              {data.detectedProject.branch && (
                <span className="flex items-center gap-1 ml-auto font-sans text-[10px] px-1.5 py-0.2 rounded bg-indigo-200/50 dark:bg-indigo-800/50">
                  <GitBranch className="w-2.5 h-2.5" />
                  {data.detectedProject.branch}
                </span>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-600 dark:text-rose-400 font-mono">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Название проекта
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Категория
              </label>
              <select
                value={projectCategory}
                onChange={(e) => setProjectCategory(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 font-mono"
              >
                <option value="apps">Apps (Приложения)</option>
                <option value="web">Web (Сайты и порталы)</option>
                <option value="tools">Tools (Инструменты)</option>
                <option value="infrastructure">Infrastructure (Инфраструктура)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Описание (опционально)
            </label>
            <input
              type="text"
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="Краткое описание назначения проекта"
              className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-[280px]">
              {currentPath}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Подключить директорию</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
