import {
  Project,
  Conversation,
  ConversationDetail,
  AIEngine,
  FsBrowseResponse,
  FileContentResponse,
  GitStatusResponse
} from '../types.ts';

const BASE_URL = '';

let authToken: string | null = localStorage.getItem('pm_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('pm_token', token);
  } else {
    localStorage.removeItem('pm_token');
  }
}

export function getAuthToken(): string | null {
  return authToken || localStorage.getItem('pm_token');
}

async function request(url: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('auth_unauthorized'));
    throw new Error('Требуется авторизация');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err: any = new Error(errorData.error || `HTTP error ${res.status}`);
    err.isSecurityBlock = errorData.isSecurityBlock;
    err.category = errorData.category;
    throw err;
  }

  return res.json();
}

// Auth API
export async function login(loginInput: string, passwordInput: string): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginInput, password: passwordInput }),
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка входа');
  }

  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function checkAuth(): Promise<{ authenticated: boolean }> {
  try {
    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers,
      credentials: 'include',
    });
    if (!res.ok) return { authenticated: false };
    return res.json();
  } catch {
    return { authenticated: false };
  }
}

export async function logout(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
}

export async function refreshSession(): Promise<boolean> {
  try {
    const res = await request('/api/auth/refresh', { method: 'POST' });
    return !!res.success;
  } catch {
    return false;
  }
}

// Protected App API
export async function fetchProjects(): Promise<Project[]> {
  return request('/api/projects');
}

export async function fetchConversations(projectId: string): Promise<Conversation[]> {
  return request(`/api/projects/${projectId}/conversations`);
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  return request(`/api/conversations/${id}`);
}

export async function createConversation(projectId: string, title?: string): Promise<Conversation> {
  return request(`/api/projects/${projectId}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function sendPrompt({
  projectId,
  conversationId,
  prompt,
  engine,
  model,
  mode,
  effort,
}: {
  projectId: string;
  conversationId?: string | null;
  prompt: string;
  engine?: string;
  model?: string;
  mode?: string;
  effort?: string;
}): Promise<any> {
  return request('/api/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, conversationId, prompt, engine, model, mode, effort }),
  });
}

export async function stopConversation(conversationId: string): Promise<{ success: boolean }> {
  return request(`/api/conversations/${conversationId}/stop`, {
    method: 'POST',
  });
}

export async function fetchUsage(force = false): Promise<any> {
  return request(`/api/system/usage${force ? '?force=true' : ''}`);
}

// AI Engines API
export async function fetchEngines(): Promise<AIEngine[]> {
  return request('/api/engines');
}

// File Explorer & Project Picker API
export async function browseFs(dirPath?: string): Promise<FsBrowseResponse> {
  const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return request(`/api/fs/browse${query}`);
}

export async function fetchFileContent(filePath: string): Promise<FileContentResponse> {
  return request(`/api/fs/file?path=${encodeURIComponent(filePath)}`);
}

export async function fetchGitStatus(projectPath: string): Promise<GitStatusResponse> {
  return request(`/api/fs/git-status?path=${encodeURIComponent(projectPath)}`);
}

export async function addProjectFolder(data: {
  folderPath: string;
  name?: string;
  description?: string;
  category?: string;
}): Promise<{ success: boolean; project: Project }> {
  return request('/api/projects/add-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
