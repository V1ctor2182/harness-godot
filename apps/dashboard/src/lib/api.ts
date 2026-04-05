const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Health
  health: () =>
    request<{ status: string; checks: Record<string, string>; uptime: number }>('/health'),

  // Cycles
  listCycles: () => request<unknown[]>('/cycles'),
  getCycle: (id: number) => request<unknown>(`/cycles/${id}`),
  createCycle: (goal: string) =>
    request<unknown>('/cycles', { method: 'POST', body: JSON.stringify({ goal }) }),
  updateCycle: (id: number, data: Record<string, unknown>) =>
    request<unknown>(`/cycles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Tasks
  listTasks: (params?: { cycleId?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.cycleId) qs.set('cycleId', String(params.cycleId));
    if (params?.status) qs.set('status', params.status);
    return request<unknown[]>(`/tasks?${qs}`);
  },
  getTask: (id: string) => request<unknown>(`/tasks/${id}`),
  updateTask: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  retryTask: (id: string) => request<unknown>(`/tasks/${id}/retry`, { method: 'POST' }),

  // Agent Runs
  listAgentRuns: (params?: {
    cycleId?: number;
    taskId?: string;
    status?: string;
    role?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.cycleId) qs.set('cycleId', String(params.cycleId));
    if (params?.taskId) qs.set('taskId', params.taskId);
    if (params?.status) qs.set('status', params.status);
    if (params?.role) qs.set('role', params.role);
    return request<unknown[]>(`/agents?${qs}`);
  },
  getAgentRun: (id: string) => request<unknown>(`/agents/${id}`),
  getAgentEvents: (id: string, type?: string) => {
    const qs = type ? `?type=${type}` : '';
    return request<unknown[]>(`/agents/${id}/events${qs}`);
  },

  // Jobs
  listJobs: (params?: { status?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    return request<unknown[]>(`/jobs?${qs}`);
  },
  approveJob: (id: string) => request<unknown>(`/jobs/${id}/approve`, { method: 'POST' }),
  rejectJob: (id: string, reason?: string) =>
    request<unknown>(`/jobs/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Knowledge
  listKnowledge: (params?: { category?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.status) qs.set('status', params.status);
    return request<unknown[]>(`/knowledge?${qs}`);
  },
  createKnowledge: (data: { title: string; category: string; content: string }) =>
    request<unknown>('/knowledge', { method: 'POST', body: JSON.stringify(data) }),
  patchKnowledge: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/knowledge/by-id?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Control
  getControl: () => request<unknown>('/control'),
  updateControl: (data: Record<string, unknown>) =>
    request<unknown>('/control', { method: 'PATCH', body: JSON.stringify(data) }),
};

export interface SpendingByCycle {
  cycleId: number;
  totalCostUsd: number;
  runCount: number;
}

export interface SpendingByRole {
  role: string;
  totalCostUsd: number;
  runCount: number;
}

export interface SpendingAnalytics {
  byCycle: SpendingByCycle[];
  byRole: SpendingByRole[];
}

export function getSpendingAnalytics(): Promise<SpendingAnalytics> {
  return request<SpendingAnalytics>('/analytics/spending');
}

export interface TaskByType {
  type: string;
  total: number;
  done: number;
  failed: number;
  avgRetryCount: number;
}

export interface TaskByCycle {
  cycleId: number;
  total: number;
  done: number;
  failed: number;
  avgRetryCount: number;
}

export interface TaskAnalytics {
  byType: TaskByType[];
  byCycle: TaskByCycle[];
}

export function getTaskAnalytics(): Promise<TaskAnalytics> {
  return request<TaskAnalytics>('/analytics/tasks');
}
