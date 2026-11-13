import type {
  CounterStatus,
  EntryChannel,
  HourlyTrafficPoint,
  QueuePriority,
} from '../data/smartQueueData';

export type UserRole = 'citizen' | 'operator' | 'admin';
export type AccountStatus = 'active' | 'inactive';

export type TokenStatus =
  | 'Waiting'
  | 'Called'
  | 'Serving'
  | 'Grace'
  | 'Completed'
  | 'Cancelled'
  | 'Skipped'
  | 'NoShow';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  profilePhoto?: string;
  organisationId?: string;
  assignedFacilityId?: string;
  assignedDepartmentId?: string;
  assignedCounterId?: string;
  shift?: string;
  permissions?: string[];
  trustScore: number;
  createdAt: string;
}

export interface ApiFacility {
  id: string;
  organisationId: string;
  name: string;
  city: string;
  code: string;
  address: string;
  phone?: string;
  workingHours: string;
  isActive: boolean;
  departmentsCount?: number;
  queuesCount?: number;
  countersCount?: number;
  waitingCount?: number;
  avgWaitMins?: number;
}

export interface ApiDepartment {
  id: string;
  facilityId: string;
  facilityName?: string;
  name: string;
  code: string;
  floorOrWing: string;
  description: string;
  isActive: boolean;
  services?: ApiQueue[];
}

export interface ApiOrganisation {
  id: string;
  name: string;
  sector: string;
  facilities: ApiFacility[];
}

export interface ApiQueue {
  id: string;
  facilityId: string;
  departmentId: string;
  departmentName?: string;
  facilityName?: string;
  prefix: string;
  name: string;
  location: string;
  priority: QueuePriority;
  fee: string;
  avgServiceMinutes: number;
  servingNumber: number;
  nextIssueNumber: number;
  predictionConfidence: number;
  waitingCount: number;
  activeCounters: number;
  predictedWaitMins: number;
  isActive: boolean;
  isPaused: boolean;
  overloaded?: boolean;
}

export interface ApiCounter {
  id: string;
  facilityId: string;
  facilityName?: string;
  departmentId: string;
  departmentName?: string;
  label: string;
  staffName: string;
  assignedOperatorId?: string;
  queueId: string;
  queueName: string;
  status: 'Serving' | 'Busy' | 'Paused' | 'Closed';
  currentToken: string;
  avgCycleMins: number;
}

export interface ApiTokenRecord {
  tokenId: string;
  facilityId: string;
  facilityName?: string;
  departmentId: string;
  departmentName?: string;
  queueId: string;
  queueName: string;
  counterId?: string;
  counterLabel?: string;
  numberValue: number;
  citizenName: string;
  channel: EntryChannel;
  priority: QueuePriority;
  status: TokenStatus;
  joinedAt: string;
  calledAt?: string;
  servingStartedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  graceExpiresAt?: string;
  aheadCount: number;
  etaMinutes: number;
}

export interface ApiSwapRequest {
  id: string;
  facilityId: string;
  queueId: string;
  fromTokenId: string;
  fromCitizenName: string;
  fromNumber: number;
  reason: string;
  status: 'open' | 'accepted' | 'expired';
}

export interface FacilitySnapshotResponse {
  facilityId: string;
  departments: ApiDepartment[];
  queues: ApiQueue[];
  counters: ApiCounter[];
  roster: ApiTokenRecord[];
  openSwaps: ApiSwapRequest[];
  surgeAlert: {
    active: boolean;
    queueId: string;
    queueName: string;
    waitingCount: number;
    standbyCounterId: string;
    standbyStaffName: string;
  } | null;
  summary: {
    totalWaiting: number;
    activeCountersCount: number;
    totalCountersCount: number;
    avgWaitMins: number;
    onTimeReturnRate: number;
  };
}

export interface CitizenOverviewResponse {
  centers: Array<{
    facility: ApiFacility;
    departments: ApiDepartment[];
    queues: ApiQueue[];
    counters: ApiCounter[];
  }>;
  activeToken: ApiTokenRecord | null;
}

export interface CitizenHistoryItem {
  tokenId: string;
  facilityId: string;
  facilityName: string;
  facilityCity: string;
  departmentId: string;
  departmentName: string;
  queueId: string;
  queueName: string;
  counterLabel: string;
  channel: EntryChannel;
  priority: QueuePriority;
  status: TokenStatus;
  joinedAt: string;
  calledAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  createdAtMs: number;
}

export interface OperatorLiveQueueItem {
  tokenId: string;
  citizenLabel: string;
  queueId: string;
  queueName: string;
  channel: EntryChannel;
  priority: QueuePriority;
  status: TokenStatus;
  joinedAt: string;
  calledAt?: string;
  servingStartedAt?: string;
  etaMinutes: number;
  waitMinsSoFar: number;
  recallCount: number;
  createdAtMs: number;
}

export interface OperatorHistoryItem {
  tokenId: string;
  citizenLabel: string;
  queueName: string;
  channel: EntryChannel;
  status: TokenStatus;
  joinedAt: string;
  calledAt?: string;
  completedAt?: string;
  waitMins: number;
}

export interface OperatorWorkspaceResponse {
  operator: {
    id: string;
    name: string;
    shift: string;
    todayDate: string;
  };
  facility: ApiFacility;
  department: ApiDepartment | null;
  counter: ApiCounter | null;
  queue: ApiQueue | null;
  liveQueue: OperatorLiveQueueItem[];
  history: OperatorHistoryItem[];
  metrics: {
    totalTokensToday: number;
    waitingTokens: number;
    completedTokens: number;
    skippedTokens: number;
    avgWaitMins: number;
  };
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  facilityId?: string;
  details: string;
  timestamp: string;
}

export interface SystemSettings {
  organisationName: string;
  maxActiveTokensPerCitizen: number;
  gracePeriodMinutes: number;
  allowPeerSwaps: boolean;
  enableInAppNotifications: boolean;
  enableSmsNotifications: boolean;
  enableEmailNotifications: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  updatedAt: string;
}

export interface AdminOverviewResponse {
  kpis: {
    totalCitizens: number;
    totalOperators: number;
    totalFacilities: number;
    totalDepartments: number;
    activeCounters: number;
    totalCounters: number;
    totalTokensToday: number;
    waitingTokens: number;
    completedTokens: number;
    cancelledTokens: number;
    avgWaitMins: number;
  };
  centersSummary: Array<{
    facilityId: string;
    name: string;
    city: string;
    isActive: boolean;
    waiting: number;
    activeCounters: number;
    totalCounters: number;
    avgWaitMins: number;
    hasSurge: boolean;
  }>;
  hourlyTraffic: HourlyTrafficPoint[];
  recentAuditLogs: AuditLogItem[];
}

export interface AdminReportsResponse {
  period: string;
  facilityId: string;
  summary: {
    totalGenerated: number;
    completed: number;
    cancelled: number;
    active: number;
    completionRate: number;
  };
  departmentPerformance: Array<{
    departmentId: string;
    departmentName: string;
    facilityName: string;
    totalTokens: number;
    completed: number;
    cancelled: number;
    avgWaitMins: number;
  }>;
  counterPerformance: Array<{
    counterId: string;
    label: string;
    staffName: string;
    facilityName: string;
    status: string;
    tokensHandled: number;
    completed: number;
    avgCycleMins: number;
  }>;
  centerComparison: Array<{
    facilityId: string;
    name: string;
    city: string;
    totalTokens: number;
    waiting: number;
    avgWaitMins: number;
    activeCounters: number;
  }>;
  hourlyTraffic: HourlyTrafficPoint[];
  sdgImpact: {
    sdg9InfraCalls: number;
    sdg11CorridorDensityReduction: string;
    sdg12PaperSlipsSaved: number;
  };
}

export type NotificationCategory = 'token' | 'turn' | 'swap' | 'grace' | 'account' | 'system';

export interface NotificationItem {
  id: string;
  facilityId: string;
  userId?: string;
  tokenId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  channel?: 'in-app' | 'sms' | 'email';
  isRead: boolean;
  createdAt: string;
}

export interface AnalyticsSummaryResponse {
  facilityId: string;
  hourlyTraffic: HourlyTrafficPoint[];
  peakHours: string[];
  recommendedHours: string[];
  recommendationText: string;
  queues: ApiQueue[];
  sdgImpact: {
    sdg9InfraCalls: number;
    sdg11CorridorDensityReduction: string;
    sdg12PaperSlipsSaved: number;
  };
}

const AUTH_TOKEN_KEY = 'smartqueue_auth_token';
const REFRESH_TOKEN_KEY = 'smartqueue_refresh_token';

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredTokens(token: string | null, refreshToken?: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    if (refreshToken !== undefined) {
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  } catch {
    // Ignore storage quota issues
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  const rt = getStoredRefreshToken();
  if (!rt) return null;
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setStoredTokens(null, null);
          return null;
        }
        const data = (await res.json()) as { token: string; refreshToken: string };
        setStoredTokens(data.token, data.refreshToken);
        return data.token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export class ApiError extends Error {
  status: number;
  suggestedRole?: UserRole;

  constructor(message: string, status: number, suggestedRole?: UserRole) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.suggestedRole = suggestedRole;
  }
}

async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<T> {
  const token = getStoredAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && retryOn401 && !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/refresh')) {
    const newAccess = await tryRefreshAccessToken();
    if (newAccess) {
      return apiRequest<T>(url, options, false);
    }
  }

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    suggestedRole?: UserRole;
  } & T;
  if (!res.ok) {
    throw new ApiError(
      payload.error || `Request failed (${res.status})`,
      res.status,
      payload.suggestedRole
    );
  }
  return payload;
}

export const api = {
  // Auth
  async register(body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ token: string; refreshToken: string; user: AuthUser }> {
    const res = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    setStoredTokens(res.token, res.refreshToken);
    return res;
  },

  async login(body: {
    email?: string;
    identifier?: string;
    password: string;
    expectedRole?: UserRole;
  }): Promise<{ token: string; refreshToken: string; user: AuthUser }> {
    const res = await apiRequest<{ token: string; refreshToken: string; user: AuthUser }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    setStoredTokens(res.token, res.refreshToken);
    return res;
  },

  async forgotPassword(body: {
    email: string;
    role: UserRole;
  }): Promise<{ ok: boolean; message: string }> {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getMe(): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>('/api/auth/me');
  },

  async updateProfile(body: {
    name: string;
    phone?: string;
    profilePhoto?: string;
  }): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async changePassword(body: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: boolean; message: string }> {
    return apiRequest<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async logout(): Promise<void> {
    const refreshToken = getStoredRefreshToken();
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
    setStoredTokens(null, null);
  },

  // Notifications
  async getNotifications(facilityId: string): Promise<{
    notifications: NotificationItem[];
    unreadCount: number;
  }> {
    return apiRequest(`/api/notifications?facilityId=${encodeURIComponent(facilityId)}`);
  },

  async markNotificationRead(id: string): Promise<{ notification: NotificationItem }> {
    return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead(facilityId: string): Promise<{ ok: boolean }> {
    return apiRequest('/api/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({ facilityId }),
    });
  },

  // Citizen
  async getCitizenOverview(): Promise<CitizenOverviewResponse> {
    return apiRequest('/api/citizen/overview');
  },

  async getCitizenHistory(): Promise<{ history: CitizenHistoryItem[] }> {
    return apiRequest('/api/citizen/history');
  },

  async getQueueState(facilityId: string): Promise<FacilitySnapshotResponse> {
    return apiRequest(`/api/queues/${encodeURIComponent(facilityId)}/state`);
  },

  async issueToken(
    facilityId: string,
    body: { queueId: string; channel: EntryChannel; citizenName?: string }
  ): Promise<{ token: ApiTokenRecord; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(`/api/queues/${encodeURIComponent(facilityId)}/tokens`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async cancelToken(
    facilityId: string,
    tokenId: string
  ): Promise<{ ok: boolean; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(
      `/api/queues/${encodeURIComponent(facilityId)}/tokens/${encodeURIComponent(tokenId)}/cancel`,
      { method: 'POST' }
    );
  },

  async acceptSwap(
    facilityId: string,
    swapId: string,
    targetTokenId: string
  ): Promise<{
    updatedTokenId: string;
    updatedNumber: number;
    trustScore: number;
    snapshot: FacilitySnapshotResponse;
  }> {
    return apiRequest(
      `/api/queues/${encodeURIComponent(facilityId)}/swaps/${encodeURIComponent(swapId)}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({ targetTokenId }),
      }
    );
  },

  async requestSwap(
    facilityId: string,
    tokenId: string,
    reason?: string
  ): Promise<{ swap: ApiSwapRequest; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(`/api/queues/${encodeURIComponent(facilityId)}/swaps/request`, {
      method: 'POST',
      body: JSON.stringify({ tokenId, reason }),
    });
  },

  async activateGrace(
    facilityId: string,
    tokenId: string
  ): Promise<{ graceExpiresAt: string; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(
      `/api/queues/${encodeURIComponent(facilityId)}/tokens/${encodeURIComponent(tokenId)}/grace`,
      { method: 'POST' }
    );
  },

  async checkInGrace(
    facilityId: string,
    tokenId: string
  ): Promise<{ trustScore: number; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(
      `/api/queues/${encodeURIComponent(facilityId)}/tokens/${encodeURIComponent(tokenId)}/check-in`,
      { method: 'POST' }
    );
  },

  // Operator
  async getOperatorWorkspace(): Promise<OperatorWorkspaceResponse> {
    return apiRequest('/api/operator/workspace');
  },

  async operatorCallNext(counterId: string): Promise<{
    calledTokenId: string;
    queueId: string;
    snapshot: FacilitySnapshotResponse;
  }> {
    return apiRequest(`/api/operator/counters/${encodeURIComponent(counterId)}/call-next`, {
      method: 'POST',
    });
  },

  async operatorTokenAction(
    counterId: string,
    tokenId: string,
    action: 'recall' | 'serve' | 'complete' | 'skip' | 'no-show'
  ): Promise<{ token: ApiTokenRecord; snapshot: FacilitySnapshotResponse }> {
    return apiRequest(
      `/api/operator/counters/${encodeURIComponent(counterId)}/tokens/${encodeURIComponent(
        tokenId
      )}/${action}`,
      { method: 'POST' }
    );
  },

  async operatorSetCounterStatus(
    counterId: string,
    status: 'Serving' | 'Busy' | 'Paused' | 'Closed'
  ): Promise<{ counter: ApiCounter }> {
    return apiRequest(`/api/operator/counters/${encodeURIComponent(counterId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async operatorPauseQueue(queueId: string, isPaused: boolean): Promise<{ queue: ApiQueue }> {
    return apiRequest(`/api/operator/queues/${encodeURIComponent(queueId)}/pause`, {
      method: 'PATCH',
      body: JSON.stringify({ isPaused }),
    });
  },

  // Admin
  async getAdminOverview(): Promise<AdminOverviewResponse> {
    return apiRequest('/api/admin/overview');
  },

  async adminListUsers(params?: {
    role?: string;
    status?: string;
    search?: string;
  }): Promise<{ users: AuthUser[] }> {
    const qs = new URLSearchParams();
    if (params?.role) qs.set('role', params.role);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    return apiRequest(`/api/admin/users?${qs.toString()}`);
  },

  async adminCreateUser(body: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: UserRole;
    assignedFacilityId?: string;
    assignedDepartmentId?: string;
    assignedCounterId?: string;
    shift?: string;
  }): Promise<{ user: AuthUser }> {
    return apiRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async adminUpdateUser(
    userId: string,
    body: {
      role?: UserRole;
      accountStatus?: AccountStatus;
      assignedFacilityId?: string;
      assignedDepartmentId?: string;
      assignedCounterId?: string;
      shift?: string;
    }
  ): Promise<{ user: AuthUser }> {
    return apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminListFacilities(): Promise<{ facilities: ApiFacility[] }> {
    return apiRequest('/api/admin/facilities');
  },

  async adminCreateFacility(body: {
    name: string;
    city: string;
    address?: string;
    phone?: string;
    workingHours?: string;
  }): Promise<{ facility: ApiFacility }> {
    return apiRequest('/api/admin/facilities', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async adminUpdateFacility(
    facilityId: string,
    body: Partial<ApiFacility>
  ): Promise<{ facility: ApiFacility }> {
    return apiRequest(`/api/admin/facilities/${encodeURIComponent(facilityId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminListDepartments(facilityId?: string): Promise<{ departments: ApiDepartment[] }> {
    const qs = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
    return apiRequest(`/api/admin/departments${qs}`);
  },

  async adminCreateDepartment(body: {
    facilityId: string;
    name: string;
    code?: string;
    floorOrWing?: string;
    description?: string;
  }): Promise<{ department: ApiDepartment }> {
    return apiRequest('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async adminUpdateDepartment(
    departmentId: string,
    body: Partial<ApiDepartment>
  ): Promise<{ department: ApiDepartment }> {
    return apiRequest(`/api/admin/departments/${encodeURIComponent(departmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminCreateQueue(body: {
    facilityId: string;
    departmentId?: string;
    name: string;
    prefix: string;
    location: string;
    priority: QueuePriority;
    avgServiceMinutes: number;
  }): Promise<{ queue: ApiQueue }> {
    return apiRequest('/api/admin/queues', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async adminUpdateQueue(
    queueId: string,
    body: Partial<ApiQueue>
  ): Promise<{ queue: ApiQueue }> {
    return apiRequest(`/api/admin/queues/${encodeURIComponent(queueId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminListCounters(facilityId?: string): Promise<{ counters: ApiCounter[] }> {
    const qs = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
    return apiRequest(`/api/admin/counters${qs}`);
  },

  async adminCreateCounter(body: {
    facilityId: string;
    departmentId?: string;
    queueId: string;
    label: string;
    assignedOperatorId?: string;
    staffName?: string;
    status?: CounterStatus;
  }): Promise<{ counter: ApiCounter }> {
    return apiRequest('/api/admin/counters', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async adminUpdateCounter(
    counterId: string,
    body: {
      status?: 'Serving' | 'Busy' | 'Paused' | 'Closed';
      queueId?: string;
      departmentId?: string;
      assignedOperatorId?: string;
      staffName?: string;
    }
  ): Promise<{ counter: ApiCounter }> {
    return apiRequest(`/api/admin/counters/${encodeURIComponent(counterId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminMonitorQueues(facilityId = 'all'): Promise<{
    queues: ApiQueue[];
    activeTokens: ApiTokenRecord[];
    surgeAlerts: Array<{
      facilityName: string;
      facilityId: string;
      queueId: string;
      queueName: string;
      waitingCount: number;
      standbyCounterId: string;
      standbyStaffName: string;
    }>;
  }> {
    return apiRequest(`/api/admin/queues/monitor?facilityId=${encodeURIComponent(facilityId)}`);
  },

  async adminGetReports(
    period: 'daily' | 'weekly' | 'monthly',
    facilityId = 'all'
  ): Promise<AdminReportsResponse> {
    return apiRequest(
      `/api/admin/reports?period=${encodeURIComponent(period)}&facilityId=${encodeURIComponent(
        facilityId
      )}`
    );
  },

  async adminGetSettings(): Promise<{ settings: SystemSettings }> {
    return apiRequest('/api/admin/settings');
  },

  async adminUpdateSettings(body: Partial<SystemSettings>): Promise<{ settings: SystemSettings }> {
    return apiRequest('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async adminGetAuditLogs(limit = 50): Promise<{ logs: AuditLogItem[] }> {
    return apiRequest(`/api/admin/audit-logs?limit=${limit}`);
  },

  async getAnalyticsSummary(facilityId: string): Promise<AnalyticsSummaryResponse> {
    return apiRequest(`/api/analytics/${encodeURIComponent(facilityId)}/summary`);
  },
};
