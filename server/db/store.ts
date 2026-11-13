import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../config/env.ts';
import {
  hashPassword,
  normalizeRole,
  registerUserActiveChecker,
} from '../middleware/authMiddleware.ts';
import type {
  HourlyTrafficRecord,
  SmartQueueDatabase,
  SystemSettingsRecord,
} from '../models/types.ts';

const DEFAULT_HOURLY_TRAFFIC: HourlyTrafficRecord[] = [
  { hour: '8 AM', footfall: 28, avgWaitMins: 8 },
  { hour: '9 AM', footfall: 52, avgWaitMins: 14 },
  { hour: '10 AM', footfall: 84, avgWaitMins: 24, isPeak: true },
  { hour: '11 AM', footfall: 98, avgWaitMins: 31, isPeak: true },
  { hour: '12 PM', footfall: 68, avgWaitMins: 19 },
  { hour: '1 PM', footfall: 44, avgWaitMins: 12 },
  { hour: '2 PM', footfall: 24, avgWaitMins: 6, isRecommended: true },
  { hour: '3 PM', footfall: 34, avgWaitMins: 9, isRecommended: true },
  { hour: '4 PM', footfall: 48, avgWaitMins: 13 },
];

export function createDefaultSettings(): SystemSettingsRecord {
  return {
    organisationName: 'Andhra Pradesh Public Health & Civic Network',
    maxActiveTokensPerCitizen: 1,
    gracePeriodMinutes: 5,
    allowPeerSwaps: true,
    enableInAppNotifications: true,
    enableSmsNotifications: true,
    enableEmailNotifications: true,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    updatedAt: new Date().toISOString(),
  };
}

export function createSeedDatabase(): SmartQueueDatabase {
  const nowIso = new Date().toISOString();
  const baseMs = Date.now();

  return {
    users: [
      {
        id: 'usr-citizen-demo',
        name: 'Karthikeya Rao',
        email: 'citizen@smartqueue.local',
        phone: '+91 98480 11223',
        role: 'citizen',
        accountStatus: 'active',
        trustScore: 98,
        passwordHash: hashPassword('citizen123'),
        createdAt: nowIso,
      },
      {
        id: 'usr-operator-demo',
        name: 'Dr. K. Venkatesh',
        email: 'operator@smartqueue.local',
        phone: '+91 98480 77889',
        role: 'operator',
        accountStatus: 'active',
        organisationId: 'org-ap-health',
        assignedFacilityId: 'vja-hospital',
        assignedDepartmentId: 'dept-opd',
        assignedCounterId: 'c2',
        shift: 'Morning (08:00 – 14:00)',
        permissions: ['call_next', 'recall', 'serve', 'complete', 'skip', 'no_show', 'toggle_counter'],
        trustScore: 100,
        passwordHash: hashPassword('operator123'),
        createdAt: nowIso,
      },
      {
        id: 'usr-operator-senior',
        name: 'Dr. Priya Sharma',
        email: 'staff@smartqueue.local',
        phone: '+91 98480 66554',
        role: 'operator',
        accountStatus: 'active',
        organisationId: 'org-ap-health',
        assignedFacilityId: 'vja-hospital',
        assignedDepartmentId: 'dept-priority',
        assignedCounterId: 'c1',
        shift: 'Morning (08:00 – 14:00)',
        permissions: ['call_next', 'recall', 'serve', 'complete', 'skip', 'no_show', 'toggle_counter'],
        trustScore: 100,
        passwordHash: hashPassword('staff123'),
        createdAt: nowIso,
      },
      {
        id: 'usr-admin-demo',
        name: 'Ananya Deshmukh',
        email: 'admin@smartqueue.local',
        phone: '+91 98480 44556',
        role: 'admin',
        accountStatus: 'active',
        organisationId: 'org-ap-health',
        shift: 'Full Day Admin',
        permissions: ['all'],
        trustScore: 100,
        passwordHash: hashPassword('admin123'),
        createdAt: nowIso,
      },
    ],
    organisations: [
      {
        id: 'org-ap-health',
        name: 'Andhra Pradesh Public Health & Civic Network',
        sector: 'healthcare',
        createdAt: nowIso,
      },
      {
        id: 'org-vja-municipal',
        name: 'Vijayawada Municipal Civic Services',
        sector: 'civic',
        createdAt: nowIso,
      },
    ],
    facilities: [
      {
        id: 'vja-hospital',
        organisationId: 'org-ap-health',
        name: 'District Govt Civil Hospital',
        city: 'Vijayawada',
        code: 'SQ-VJA-01',
        address: 'MG Road, Governorpet, Vijayawada',
        phone: '+91 866 257 4401',
        workingHours: '08:00 – 18:00',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'eseva-center',
        organisationId: 'org-vja-municipal',
        name: 'Municipal Civic e-Seva Kendra',
        city: 'Vijayawada Central',
        code: 'SQ-CIV-04',
        address: 'Eluru Road Civic Complex, Vijayawada',
        phone: '+91 866 242 9900',
        workingHours: '09:00 – 17:30',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'passport-kendra',
        organisationId: 'org-vja-municipal',
        name: 'Regional Passport Seva Kendra',
        city: 'Benz Circle',
        code: 'SQ-PSK-02',
        address: 'NH-16 Service Plaza, Benz Circle',
        phone: '+91 866 249 3310',
        workingHours: '09:30 – 17:00',
        isActive: true,
        createdAt: nowIso,
      },
    ],
    departments: [
      {
        id: 'dept-opd',
        facilityId: 'vja-hospital',
        name: 'Outpatient Consultation (OPD)',
        code: 'OPD',
        floorOrWing: 'Ground Floor · East Wing',
        description: 'General medicine, follow-ups, and diagnostics referral.',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'dept-priority',
        facilityId: 'vja-hospital',
        name: 'Senior & Priority Care',
        code: 'SNR',
        floorOrWing: 'Ground Floor · Room 101',
        description: 'Dedicated low-wait desk for senior citizens and assisted visitors.',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'dept-emergency',
        facilityId: 'vja-hospital',
        name: 'Emergency & Trauma Triage',
        code: 'EMG',
        floorOrWing: 'Trauma Bay · Gate 1',
        description: 'Immediate acute screening and stabilization.',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'dept-appointments',
        facilityId: 'vja-hospital',
        name: 'Pre-Booked Appointments',
        code: 'APT',
        floorOrWing: 'First Floor · Desk 5',
        description: 'Scheduled specialist consultations and QR check-ins.',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'dept-eseva-civic',
        facilityId: 'eseva-center',
        name: 'Revenue & Utility Services',
        code: 'REV',
        floorOrWing: 'Hall A · Counters 1–4',
        description: 'Property tax, water bills, and municipal certificates.',
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 'dept-psk-docs',
        facilityId: 'passport-kendra',
        name: 'Passport Verification & Biometrics',
        code: 'PSK',
        floorOrWing: 'Bay A · Ground Floor',
        description: 'Document verification and biometric enrollment.',
        isActive: true,
        createdAt: nowIso,
      },
    ],
    queues: [
      {
        id: 'general-opd',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        prefix: 'A',
        name: 'General OPD',
        location: 'Room 104',
        priority: 'standard',
        fee: '₹0 fee',
        avgServiceMinutes: 3.5,
        servingNumber: 36,
        nextIssueNumber: 42,
        predictionConfidence: 92,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'senior-citizen',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        prefix: 'S',
        name: 'Senior Citizen Express',
        location: 'Room 101',
        priority: 'senior',
        fee: 'Priority Desk',
        avgServiceMinutes: 4.0,
        servingNumber: 12,
        nextIssueNumber: 15,
        predictionConfidence: 96,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'emergency-triage',
        facilityId: 'vja-hospital',
        departmentId: 'dept-emergency',
        prefix: 'E',
        name: 'Emergency Triage',
        location: 'Trauma Bay',
        priority: 'emergency',
        fee: 'Immediate Slot',
        avgServiceMinutes: 2.0,
        servingNumber: 4,
        nextIssueNumber: 5,
        predictionConfidence: 98,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'online-appointment',
        facilityId: 'vja-hospital',
        departmentId: 'dept-appointments',
        prefix: 'Q',
        name: 'Online Pre-Booked',
        location: 'Desk 5',
        priority: 'appointment',
        fee: 'QR / Booking ID',
        avgServiceMinutes: 3.0,
        servingNumber: 20,
        nextIssueNumber: 24,
        predictionConfidence: 94,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'eseva-bills',
        facilityId: 'eseva-center',
        departmentId: 'dept-eseva-civic',
        prefix: 'B',
        name: 'Utility & Property Tax',
        location: 'Desk 2',
        priority: 'standard',
        fee: 'Standard',
        avgServiceMinutes: 3.0,
        servingNumber: 14,
        nextIssueNumber: 19,
        predictionConfidence: 93,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'eseva-senior',
        facilityId: 'eseva-center',
        departmentId: 'dept-eseva-civic',
        prefix: 'S',
        name: 'Senior Pension Desk',
        location: 'Desk 1',
        priority: 'senior',
        fee: 'Priority Desk',
        avgServiceMinutes: 4.0,
        servingNumber: 7,
        nextIssueNumber: 10,
        predictionConfidence: 95,
        isActive: true,
        isPaused: false,
      },
      {
        id: 'psk-verify',
        facilityId: 'passport-kendra',
        departmentId: 'dept-psk-docs',
        prefix: 'P',
        name: 'Document Verification',
        location: 'Bay A',
        priority: 'appointment',
        fee: 'Slot Confirmed',
        avgServiceMinutes: 5.0,
        servingNumber: 22,
        nextIssueNumber: 27,
        predictionConfidence: 95,
        isActive: true,
        isPaused: false,
      },
    ],
    counters: [
      {
        id: 'c1',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        label: 'Counter 1',
        staffName: 'Dr. Priya Sharma',
        assignedOperatorId: 'usr-operator-senior',
        queueId: 'senior-citizen',
        status: 'Serving',
        currentToken: 'S-12',
        avgCycleMins: 4,
      },
      {
        id: 'c2',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        label: 'Counter 2',
        staffName: 'Dr. K. Venkatesh',
        assignedOperatorId: 'usr-operator-demo',
        queueId: 'general-opd',
        status: 'Serving',
        currentToken: 'A-36',
        avgCycleMins: 3.5,
      },
      {
        id: 'c3',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        label: 'Counter 3',
        staffName: 'Dr. Anita Rao (Standby)',
        queueId: 'general-opd',
        status: 'Closed',
        currentToken: '—',
        avgCycleMins: 3.5,
      },
      {
        id: 'c4',
        facilityId: 'vja-hospital',
        departmentId: 'dept-emergency',
        label: 'Counter 4',
        staffName: 'Triage Nurse Desk',
        queueId: 'emergency-triage',
        status: 'Serving',
        currentToken: 'E-04',
        avgCycleMins: 2,
      },
      {
        id: 'c-eseva-1',
        facilityId: 'eseva-center',
        departmentId: 'dept-eseva-civic',
        label: 'Desk 1',
        staffName: 'M. Rajasekhar',
        queueId: 'eseva-senior',
        status: 'Serving',
        currentToken: 'S-7',
        avgCycleMins: 4,
      },
      {
        id: 'c-eseva-2',
        facilityId: 'eseva-center',
        departmentId: 'dept-eseva-civic',
        label: 'Desk 2',
        staffName: 'S. Padma',
        queueId: 'eseva-bills',
        status: 'Serving',
        currentToken: 'B-14',
        avgCycleMins: 3,
      },
      {
        id: 'c-psk-1',
        facilityId: 'passport-kendra',
        departmentId: 'dept-psk-docs',
        label: 'Bay A',
        staffName: 'Verifier Officer 1',
        queueId: 'psk-verify',
        status: 'Serving',
        currentToken: 'P-22',
        avgCycleMins: 5,
      },
    ],
    tokens: [
      {
        tokenId: 'A-34',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        assignedOperatorId: 'usr-operator-demo',
        numberValue: 34,
        citizenName: 'Karthikeya Rao',
        userId: 'usr-citizen-demo',
        channel: 'App QR',
        priority: 'standard',
        status: 'Completed',
        joinedAt: '09:15 AM',
        calledAt: '09:26 AM',
        servingStartedAt: '09:27 AM',
        completedAt: '09:31 AM',
        createdAtMs: baseMs - 110 * 60000,
      },
      {
        tokenId: 'S-10',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        queueId: 'senior-citizen',
        queueName: 'Senior Citizen Express',
        counterId: 'c1',
        assignedOperatorId: 'usr-operator-senior',
        numberValue: 10,
        citizenName: 'Karthikeya Rao',
        userId: 'usr-citizen-demo',
        channel: 'App QR',
        priority: 'senior',
        status: 'Cancelled',
        joinedAt: 'Yesterday, 2:10 PM',
        cancelledAt: 'Yesterday, 2:18 PM',
        createdAtMs: baseMs - 24 * 60 * 60000,
      },
      {
        tokenId: 'A-35',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        assignedOperatorId: 'usr-operator-demo',
        numberValue: 35,
        citizenName: 'Mohan Krishna',
        channel: 'SMS',
        priority: 'standard',
        status: 'Completed',
        joinedAt: '10:12 AM',
        calledAt: '10:25 AM',
        servingStartedAt: '10:26 AM',
        completedAt: '10:30 AM',
        createdAtMs: baseMs - 45 * 60000,
      },
      {
        tokenId: 'A-36',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        assignedOperatorId: 'usr-operator-demo',
        numberValue: 36,
        citizenName: 'Srinivas Rao',
        channel: 'App QR',
        priority: 'standard',
        status: 'Serving',
        joinedAt: '10:34 AM',
        calledAt: '10:48 AM',
        servingStartedAt: '10:49 AM',
        createdAtMs: baseMs - 24 * 60000,
      },
      {
        tokenId: 'A-37',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        numberValue: 37,
        citizenName: 'Lakshmi Devi',
        channel: 'Missed Call',
        priority: 'standard',
        status: 'Waiting',
        joinedAt: '10:36 AM',
        createdAtMs: baseMs - 22 * 60000,
      },
      {
        tokenId: 'A-38',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        numberValue: 38,
        citizenName: 'Venkata Narayana',
        channel: 'SMS',
        priority: 'standard',
        status: 'Waiting',
        joinedAt: '10:39 AM',
        createdAtMs: baseMs - 19 * 60000,
      },
      {
        tokenId: 'A-39',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        numberValue: 39,
        citizenName: 'Ramesh Kumar',
        channel: 'App QR',
        priority: 'standard',
        status: 'Waiting',
        joinedAt: '10:42 AM',
        createdAtMs: baseMs - 16 * 60000,
      },
      {
        tokenId: 'A-40',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        numberValue: 40,
        citizenName: 'Padmavathi M.',
        channel: 'SMS',
        priority: 'standard',
        status: 'Waiting',
        joinedAt: '10:45 AM',
        createdAtMs: baseMs - 13 * 60000,
      },
      {
        tokenId: 'A-41',
        facilityId: 'vja-hospital',
        departmentId: 'dept-opd',
        queueId: 'general-opd',
        queueName: 'General OPD',
        counterId: 'c2',
        numberValue: 41,
        citizenName: 'Anil Kumar',
        channel: 'App QR',
        priority: 'standard',
        status: 'Waiting',
        joinedAt: '10:48 AM',
        createdAtMs: baseMs - 10 * 60000,
      },
      {
        tokenId: 'S-12',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        queueId: 'senior-citizen',
        queueName: 'Senior Citizen Express',
        counterId: 'c1',
        assignedOperatorId: 'usr-operator-senior',
        numberValue: 12,
        citizenName: 'Subbaiah Naidu',
        channel: 'Audio Kiosk',
        priority: 'senior',
        status: 'Serving',
        joinedAt: '10:41 AM',
        calledAt: '10:50 AM',
        servingStartedAt: '10:51 AM',
        createdAtMs: baseMs - 17 * 60000,
      },
      {
        tokenId: 'S-13',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        queueId: 'senior-citizen',
        queueName: 'Senior Citizen Express',
        counterId: 'c1',
        numberValue: 13,
        citizenName: 'Satyavati Devi',
        channel: 'Audio Kiosk',
        priority: 'senior',
        status: 'Waiting',
        joinedAt: '10:44 AM',
        createdAtMs: baseMs - 14 * 60000,
      },
      {
        tokenId: 'S-14',
        facilityId: 'vja-hospital',
        departmentId: 'dept-priority',
        queueId: 'senior-citizen',
        queueName: 'Senior Citizen Express',
        counterId: 'c1',
        numberValue: 14,
        citizenName: 'Rama Rao',
        channel: 'Missed Call',
        priority: 'senior',
        status: 'Waiting',
        joinedAt: '10:49 AM',
        createdAtMs: baseMs - 9 * 60000,
      },
      {
        tokenId: 'E-04',
        facilityId: 'vja-hospital',
        departmentId: 'dept-emergency',
        queueId: 'emergency-triage',
        queueName: 'Emergency Triage',
        counterId: 'c4',
        numberValue: 4,
        citizenName: 'Kiran Babu',
        channel: 'Audio Kiosk',
        priority: 'emergency',
        status: 'Serving',
        joinedAt: '10:50 AM',
        calledAt: '10:51 AM',
        servingStartedAt: '10:51 AM',
        createdAtMs: baseMs - 8 * 60000,
      },
      {
        tokenId: 'Q-21',
        facilityId: 'vja-hospital',
        departmentId: 'dept-appointments',
        queueId: 'online-appointment',
        queueName: 'Online Pre-Booked',
        numberValue: 21,
        citizenName: 'Ayesha Begum',
        channel: 'App QR',
        priority: 'appointment',
        status: 'Waiting',
        joinedAt: '10:46 AM',
        createdAtMs: baseMs - 12 * 60000,
      },
      {
        tokenId: 'Q-22',
        facilityId: 'vja-hospital',
        departmentId: 'dept-appointments',
        queueId: 'online-appointment',
        queueName: 'Online Pre-Booked',
        numberValue: 22,
        citizenName: 'Harish Varma',
        channel: 'App QR',
        priority: 'appointment',
        status: 'Waiting',
        joinedAt: '10:51 AM',
        createdAtMs: baseMs - 7 * 60000,
      },
      {
        tokenId: 'Q-23',
        facilityId: 'vja-hospital',
        departmentId: 'dept-appointments',
        queueId: 'online-appointment',
        queueName: 'Online Pre-Booked',
        numberValue: 23,
        citizenName: 'Meera Reddy',
        channel: 'App QR',
        priority: 'appointment',
        status: 'Waiting',
        joinedAt: '10:53 AM',
        createdAtMs: baseMs - 5 * 60000,
      },
    ],
    swaps: [
      {
        id: 'swap-ramesh-a39',
        facilityId: 'vja-hospital',
        queueId: 'general-opd',
        fromTokenId: 'A-39',
        fromCitizenName: 'Ramesh Kumar',
        fromNumber: 39,
        reason: 'Needs 10 extra minutes at pharmacy before consultation',
        status: 'open',
        createdAt: nowIso,
      },
    ],
    hourlyTraffic: {
      'vja-hospital': DEFAULT_HOURLY_TRAFFIC,
      'eseva-center': DEFAULT_HOURLY_TRAFFIC.map((p) => ({
        ...p,
        footfall: Math.max(15, Math.round(p.footfall * 0.72)),
        avgWaitMins: Math.max(4, Math.round(p.avgWaitMins * 0.75)),
      })),
      'passport-kendra': DEFAULT_HOURLY_TRAFFIC.map((p) => ({
        ...p,
        footfall: Math.max(18, Math.round(p.footfall * 0.65)),
        avgWaitMins: Math.max(5, Math.round(p.avgWaitMins * 0.85)),
      })),
    },
    notifications: [
      {
        id: 'notif-welcome-1',
        facilityId: 'vja-hospital',
        title: 'SmartQueue Live Telemetry Active',
        message:
          'You can generate a virtual token anytime and wait comfortably outside the corridor.',
        category: 'system',
        channel: 'in-app',
        isRead: false,
        createdAt: nowIso,
      },
      {
        id: 'notif-swap-open',
        facilityId: 'vja-hospital',
        tokenId: 'A-39',
        title: 'Peer Swap Request Available',
        message:
          'Ramesh Kumar (Token A-39) is offering a fairness swap on General OPD (+3 turns).',
        category: 'swap',
        channel: 'in-app',
        isRead: false,
        createdAt: nowIso,
      },
    ],
    auditLogs: [
      {
        id: 'audit-seed-1',
        actorId: 'usr-admin-demo',
        actorName: 'Ananya Deshmukh',
        actorRole: 'admin',
        action: 'SYSTEM_INITIALIZED',
        targetType: 'settings',
        targetId: 'global',
        facilityId: 'vja-hospital',
        details: 'SmartQueue multi-role platform initialized with 3 active service centers.',
        timestamp: nowIso,
      },
    ],
    refreshSessions: [],
    settings: createDefaultSettings(),
    metrics: {
      baseInfraCalls: 1840,
      basePaperSlipsSaved: 4280,
      processedDelta: 0,
    },
  };
}

class DatabaseStore {
  private data: SmartQueueDatabase;

  constructor() {
    this.data = this.loadFromDisk();
    registerUserActiveChecker((userId) => {
      const user = this.data.users.find((u) => u.id === userId);
      if (!user || user.accountStatus === 'inactive') {
        return { active: false };
      }
      return {
        active: true,
        role: normalizeRole(user.role),
        orgId: user.organisationId,
      };
    });
  }

  private loadFromDisk(): SmartQueueDatabase {
    const seed = createSeedDatabase();
    try {
      if (fs.existsSync(ENV.DB_FILE_PATH)) {
        const raw = fs.readFileSync(ENV.DB_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<SmartQueueDatabase>;
        if (parsed && Array.isArray(parsed.facilities) && Array.isArray(parsed.queues)) {
          const users = (parsed.users || seed.users).map((u) => ({
            ...u,
            role: normalizeRole(u.role),
            accountStatus: u.accountStatus || 'active',
          }));
          for (const seedUser of seed.users) {
            if (!users.some((u) => u.email.toLowerCase() === seedUser.email.toLowerCase())) {
              users.push(seedUser);
            }
          }
          const facilities = parsed.facilities.map((f) => ({
            ...f,
            workingHours: f.workingHours || '08:00 – 18:00',
            isActive: f.isActive !== false,
          }));
          const departments =
            Array.isArray(parsed.departments) && parsed.departments.length > 0
              ? parsed.departments
              : seed.departments;
          const queues = parsed.queues.map((q) => {
            const fallbackDept =
              departments.find((d) => d.facilityId === q.facilityId)?.id || 'dept-opd';
            return {
              ...q,
              departmentId: q.departmentId || fallbackDept,
              isActive: q.isActive !== false,
              isPaused: Boolean(q.isPaused),
            };
          });
          const counters = (parsed.counters || seed.counters).map((c) => {
            const q = queues.find((fq) => fq.id === c.queueId);
            return {
              ...c,
              departmentId: c.departmentId || q?.departmentId || 'dept-opd',
            };
          });
          const tokens = (parsed.tokens || seed.tokens).map((t) => {
            const q = queues.find((fq) => fq.id === t.queueId);
            return {
              ...t,
              departmentId: t.departmentId || q?.departmentId || 'dept-opd',
            };
          });
          return {
            users,
            organisations: parsed.organisations || seed.organisations,
            facilities,
            departments,
            queues,
            counters,
            tokens,
            swaps: parsed.swaps || seed.swaps,
            notifications: Array.isArray(parsed.notifications)
              ? parsed.notifications
              : seed.notifications,
            auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : seed.auditLogs,
            refreshSessions: Array.isArray(parsed.refreshSessions) ? parsed.refreshSessions : [],
            settings: parsed.settings || createDefaultSettings(),
            hourlyTraffic: parsed.hourlyTraffic || seed.hourlyTraffic,
            metrics: parsed.metrics || seed.metrics,
          };
        }
      }
    } catch {
      // Fallback to fresh seed database if file is unreadable or corrupt
    }
    this.persist(seed);
    return seed;
  }

  private persist(snapshot: SmartQueueDatabase): void {
    try {
      const dir = path.dirname(ENV.DB_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${ENV.DB_FILE_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tempPath, ENV.DB_FILE_PATH);
    } catch (err) {
      console.error('Failed to persist SmartQueue database:', err);
    }
  }

  getState(): SmartQueueDatabase {
    return this.data;
  }

  save(): void {
    this.persist(this.data);
  }

  reset(): SmartQueueDatabase {
    const fresh = createSeedDatabase();
    this.data = fresh;
    this.persist(this.data);
    return this.data;
  }
}

export const dbStore = new DatabaseStore();
