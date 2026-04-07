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

  // Rooms
  listRooms: (params?: { parent?: string; lifecycle?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.parent) qs.set('parent', params.parent);
    if (params?.lifecycle) qs.set('lifecycle', params.lifecycle);
    if (params?.type) qs.set('type', params.type);
    return request<RoomTreeNode[]>(`/rooms?${qs}`);
  },
  getRoomTree: () => request<RoomTreeNode[]>('/rooms/tree'),
  getRoom: (id: string) => request<unknown>(`/rooms/${id}`),

  // Specs
  listSpecs: (params?: { roomId?: string; type?: string; state?: string; tags?: string }) => {
    const qs = new URLSearchParams();
    if (params?.roomId) qs.set('roomId', params.roomId);
    if (params?.type) qs.set('type', params.type);
    if (params?.state) qs.set('state', params.state);
    if (params?.tags) qs.set('tags', params.tags);
    return request<SpecItem[]>(`/specs?${qs}`);
  },
  createSpec: (data: Record<string, unknown>) =>
    request<SpecItem>('/specs', { method: 'POST', body: JSON.stringify(data) }),
  updateSpec: (id: string, data: Record<string, unknown>) =>
    request<SpecItem>(`/specs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archiveStaleSpecs: (roomId: string) =>
    request<{ archived: number }>('/specs/archive-stale', {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    }),

  // Tests
  listTests: (params?: { taskId?: string; cycleId?: number; layer?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.taskId) qs.set('taskId', params.taskId);
    if (params?.cycleId) qs.set('cycleId', String(params.cycleId));
    if (params?.layer) qs.set('layer', params.layer);
    if (params?.status) qs.set('status', params.status);
    return request<TestResultItem[]>(`/tests?${qs}`);
  },

  // Jobs (answer)
  answerJob: (id: string, answers: Record<string, string>, feedback?: string) =>
    request<unknown>(`/jobs/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answers, feedback }),
    }),
};

// ─── Room & Spec types ──────────────────────────────────────────────

export interface RoomTreeNode {
  _id: string;
  name: string;
  type: string;
  owner: string;
  lifecycle: string;
  path: string;
  specCount: { total: number; draft: number };
  children: RoomTreeNode[];
}

export interface SpecItem {
  _id: string;
  roomId: string;
  type: string;
  state: string;
  title: string;
  summary: string;
  detail: string;
  provenance: {
    source_type: string;
    confidence: number;
    source_ref?: string;
    cycle_tag?: string;
  };
  qualityScore: number;
  lastReferencedAt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestResultItem {
  _id: string;
  taskId: string;
  cycleId: number;
  agentRunId: string;
  layer: string;
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  failures: Array<{
    testName: string;
    assertion: string;
    expected?: string;
    actual?: string;
    file?: string;
    line?: number;
  }>;
  createdAt: string;
}

// ─── Analytics types ────────────────────────────────────────────────

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
