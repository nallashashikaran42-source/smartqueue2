export type UserRole = 'citizen' | 'operator' | 'admin';

export type LegacyOrInputRole = UserRole | 'staff' | 'CITIZEN' | 'OPERATOR' | 'ADMIN' | 'STAFF';

export type AccountStatus = 'active' | 'inactive';

export type QueuePriority = 'standard' | 'senior' | 'emergency' | 'appointment';

export type EntryChannel = 'App QR' | 'Missed Call' | 'SMS' | 'Audio Kiosk';

export type CounterStatus = 'Serving' | 'Busy' | 'Paused' | 'Closed';

export type TokenStatus =
  | 'Waiting'
  | 'Called'
  | 'Serving'
  | 'Grace'
  | 'Completed'
  | 'Cancelled'
  | 'Skipped'
  | 'NoShow';

export interface UserRecord {
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
  passwordHash: string;
  createdAt: string;
}

export interface PublicUser {
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

export interface OrganisationRecord {
  id: string;
  name: string;
  sector: 'healthcare' | 'civic' | 'passport' | 'banking' | 'other';
  createdAt: string;
}

export interface FacilityRecord {
  id: string;
  organisationId: string;
  name: string;
  city: string;
  code: string;
  address: string;
  phone?: string;
  workingHours: string;
  isActive: boolean;
  createdAt: string;
}

export interface DepartmentRecord {
  id: string;
  facilityId: string;
  name: string;
  code: string;
  floorOrWing: string;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceQueueRecord {
  id: string;
  facilityId: string;
  departmentId: string;
  prefix: string;
  name: string;
  location: string;
  priority: QueuePriority;
  fee: string;
  avgServiceMinutes: number;
  servingNumber: number;
  nextIssueNumber: number;
  predictionConfidence: number;
  isActive: boolean;
  isPaused: boolean;
}

export interface CounterRecord {
  id: string;
  facilityId: string;
  departmentId: string;
  label: string;
  staffName: string;
  assignedOperatorId?: string;
  queueId: string;
  status: CounterStatus;
  currentToken: string;
  avgCycleMins: number;
}

export interface TokenRecord {
  tokenId: string;
  facilityId: string;
  departmentId: string;
  queueId: string;
  queueName: string;
  counterId?: string;
  assignedOperatorId?: string;
  numberValue: number;
  citizenName: string;
  userId?: string;
  channel: EntryChannel;
  priority: QueuePriority;
  status: TokenStatus;
  joinedAt: string;
  calledAt?: string;
  servingStartedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  graceExpiresAt?: string;
  recallCount?: number;
  createdAtMs: number;
}

export interface SwapRequestRecord {
  id: string;
  facilityId: string;
  queueId: string;
  fromTokenId: string;
  fromCitizenName: string;
  fromNumber: number;
  reason: string;
  status: 'open' | 'accepted' | 'expired';
  acceptedByTokenId?: string;
  createdAt: string;
}

export interface HourlyTrafficRecord {
  hour: string;
  footfall: number;
  avgWaitMins: number;
  isPeak?: boolean;
  isRecommended?: boolean;
}

export type NotificationCategory =
  | 'token'
  | 'turn'
  | 'swap'
  | 'grace'
  | 'account'
  | 'system';

export interface NotificationRecord {
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

export interface SystemSettingsRecord {
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

export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: 'token' | 'counter' | 'queue' | 'department' | 'facility' | 'user' | 'settings';
  targetId: string;
  facilityId?: string;
  details: string;
  timestamp: string;
}

export interface RefreshSessionRecord {
  tokenId: string;
  userId: string;
  expiresAt: number;
  revoked: boolean;
  createdAt: string;
}

export interface SmartQueueDatabase {
  users: UserRecord[];
  organisations: OrganisationRecord[];
  facilities: FacilityRecord[];
  departments: DepartmentRecord[];
  queues: ServiceQueueRecord[];
  counters: CounterRecord[];
  tokens: TokenRecord[];
  swaps: SwapRequestRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  refreshSessions: RefreshSessionRecord[];
  settings: SystemSettingsRecord;
  hourlyTraffic: Record<string, HourlyTrafficRecord[]>;
  metrics: {
    baseInfraCalls: number;
    basePaperSlipsSaved: number;
    processedDelta: number;
  };
}
