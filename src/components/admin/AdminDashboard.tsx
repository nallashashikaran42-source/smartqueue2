import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderTree,
  MonitorCheck,
  Activity,
  BarChart3,
  Bell,
  Settings,
  User,
  Plus,
  Search,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import {
  api,
  type AdminOverviewResponse,
  type AdminReportsResponse,
  type ApiCounter,
  type ApiDepartment,
  type ApiFacility,
  type ApiQueue,
  type ApiTokenRecord,
  type AuditLogItem,
  type AuthUser,
  type NotificationItem,
  type SystemSettings,
  type UserRole,
} from '../../services/api';
import type { QueuePriority } from '../../data/smartQueueData';
import { useQueueSocket, type QueueWsMessage } from '../../hooks/useQueueSocket';
import { DashboardShell, type SidebarNavItem } from '../DashboardShell';
import { NotificationsView } from '../NotificationsView';
import { ProfileView } from '../ProfileView';

export type AdminSection =
  | 'overview'
  | 'users'
  | 'centers'
  | 'departments'
  | 'counters'
  | 'queues'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'profile';

interface AdminDashboardProps {
  user: AuthUser;
  section: AdminSection;
  onNavigate: (section: AdminSection) => void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onToast: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  section,
  onNavigate,
  onUserUpdated,
  onLogout,
  onToast,
}) => {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [facilities, setFacilities] = useState<ApiFacility[]>([]);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [counters, setCounters] = useState<ApiCounter[]>([]);
  const [monitorData, setMonitorData] = useState<{
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
  } | null>(null);
  const [reports, setReports] = useState<AdminReportsResponse | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [centerFilter, setCenterFilter] = useState('all');
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [reportFacility, setReportFacility] = useState('all');

  // Create User Form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('operator');
  const [newUserFacilityId, setNewUserFacilityId] = useState('vja-hospital');
  const [newUserDeptId, setNewUserDeptId] = useState('');
  const [newUserCounterId, setNewUserCounterId] = useState('');
  const [newUserShift, setNewUserShift] = useState('Morning (08:00 – 14:00)');

  // Create Facility Form
  const [newFacName, setNewFacName] = useState('');
  const [newFacCity, setNewFacCity] = useState('');
  const [newFacAddress, setNewFacAddress] = useState('');
  const [newFacPhone, setNewFacPhone] = useState('');
  const [newFacHours, setNewFacHours] = useState('08:00 – 18:00');

  // Create Department Form
  const [newDeptFacilityId, setNewDeptFacilityId] = useState('vja-hospital');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptFloor, setNewDeptFloor] = useState('Ground Floor');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  // Create Queue / Service Form
  const [newQueueFacilityId, setNewQueueFacilityId] = useState('vja-hospital');
  const [newQueueDeptId, setNewQueueDeptId] = useState('');
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueuePrefix, setNewQueuePrefix] = useState('');
  const [newQueueLocation, setNewQueueLocation] = useState('');
  const [newQueuePriority, setNewQueuePriority] = useState<QueuePriority>('standard');
  const [newQueueAvgMins, setNewQueueAvgMins] = useState(5);

  // Create Counter Form
  const [newCntFacilityId, setNewCntFacilityId] = useState('vja-hospital');
  const [newCntQueueId, setNewCntQueueId] = useState('');
  const [newCntLabel, setNewCntLabel] = useState('');
  const [newCntOperatorId, setNewCntOperatorId] = useState('');

  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadOverviewAndNotifs = useCallback(async () => {
    try {
      const [ov, facRes, deptRes, cntRes, notifRes] = await Promise.all([
        api.getAdminOverview(),
        api.adminListFacilities(),
        api.adminListDepartments(),
        api.adminListCounters(),
        api.getNotifications('all'),
      ]);
      setOverview(ov);
      setFacilities(facRes.facilities);
      setDepartments(deptRes.departments);
      setCounters(cntRes.counters);
      setNotifications(notifRes.notifications);
      setUnreadCount(notifRes.unreadCount);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.adminListUsers({
        role: userRoleFilter,
        status: userStatusFilter,
        search: userSearch,
      });
      setUsers(res.users);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load users.');
    }
  }, [userRoleFilter, userStatusFilter, userSearch, onToast]);

  const loadMonitor = useCallback(async () => {
    try {
      const res = await api.adminMonitorQueues(centerFilter);
      setMonitorData(res);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load live queues.');
    }
  }, [centerFilter, onToast]);

  const loadReports = useCallback(async () => {
    try {
      const res = await api.adminGetReports(reportPeriod, reportFacility);
      setReports(res);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load reports.');
    }
  }, [reportPeriod, reportFacility, onToast]);

  const loadSettingsAndLogs = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([api.adminGetSettings(), api.adminGetAuditLogs(60)]);
      setSettings(sRes.settings);
      setAuditLogs(lRes.logs);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load settings.');
    }
  }, [onToast]);

  useEffect(() => {
    loadOverviewAndNotifs();
    loadUsers();
    loadMonitor();
    loadReports();
    loadSettingsAndLogs();
  }, [loadOverviewAndNotifs, loadUsers, loadMonitor, loadReports, loadSettingsAndLogs]);

  const handleWsEvent = useCallback(
    (msg: QueueWsMessage) => {
      if (msg.event === 'notification:new') {
        const payload = msg.payload as { notification?: NotificationItem } | undefined;
        const incoming = payload?.notification;
        if (incoming) {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === incoming.id)) return prev;
            return [incoming, ...prev].slice(0, 80);
          });
          setUnreadCount((prev) => prev + 1);
        }
        return;
      }

      loadOverviewAndNotifs();
      if (section === 'queues') loadMonitor();
      if (section === 'reports') loadReports();
    },
    [section, loadOverviewAndNotifs, loadMonitor, loadReports]
  );

  useQueueSocket('all', handleWsEvent);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-user');
    try {
      const res = await api.adminCreateUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        phone: newUserPhone.trim() || undefined,
        role: newUserRole,
        assignedFacilityId: newUserRole === 'operator' ? newUserFacilityId : undefined,
        assignedDepartmentId:
          newUserRole === 'operator' && newUserDeptId ? newUserDeptId : undefined,
        assignedCounterId:
          newUserRole === 'operator' && newUserCounterId ? newUserCounterId : undefined,
        shift: newUserRole === 'operator' ? newUserShift : undefined,
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      await Promise.all([loadUsers(), loadOverviewAndNotifs()]);
      onToast(`Created ${res.user.role} account for ${res.user.name}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleUserStatus = async (target: AuthUser) => {
    const nextStatus = target.accountStatus === 'active' ? 'inactive' : 'active';
    setBusyAction(`user-status:${target.id}`);
    try {
      await api.adminUpdateUser(target.id, { accountStatus: nextStatus });
      await Promise.all([loadUsers(), loadOverviewAndNotifs()]);
      onToast(`${target.name} marked ${nextStatus}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update user status.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleChangeUserRole = async (target: AuthUser, role: UserRole) => {
    setBusyAction(`user-role:${target.id}`);
    try {
      await api.adminUpdateUser(target.id, { role });
      await Promise.all([loadUsers(), loadOverviewAndNotifs()]);
      onToast(`Updated ${target.name} role to ${role}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update role.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-facility');
    try {
      const res = await api.adminCreateFacility({
        name: newFacName.trim(),
        city: newFacCity.trim(),
        address: newFacAddress.trim() || undefined,
        phone: newFacPhone.trim() || undefined,
        workingHours: newFacHours.trim() || '08:00 – 18:00',
      });
      setNewFacName('');
      setNewFacCity('');
      setNewFacAddress('');
      setNewFacPhone('');
      await loadOverviewAndNotifs();
      onToast(`Added service center "${res.facility.name}"`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to add service center.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleFacilityActive = async (fac: ApiFacility) => {
    setBusyAction(`fac:${fac.id}`);
    try {
      await api.adminUpdateFacility(fac.id, { isActive: !fac.isActive });
      await loadOverviewAndNotifs();
      onToast(`${fac.name} is now ${!fac.isActive ? 'Active' : 'Inactive'}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update facility.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-dept');
    try {
      const res = await api.adminCreateDepartment({
        facilityId: newDeptFacilityId,
        name: newDeptName.trim(),
        code: newDeptCode.trim() || undefined,
        floorOrWing: newDeptFloor.trim() || undefined,
        description: newDeptDesc.trim() || undefined,
      });
      setNewDeptName('');
      setNewDeptCode('');
      setNewDeptDesc('');
      await loadOverviewAndNotifs();
      onToast(`Created department "${res.department.name}"`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to create department.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('create-queue');
    try {
      const res = await api.adminCreateQueue({
        facilityId: newQueueFacilityId,
        departmentId: newQueueDeptId || undefined,
        name: newQueueName.trim(),
        prefix: newQueuePrefix.trim().toUpperCase(),
        location: newQueueLocation.trim(),
        priority: newQueuePriority,
        avgServiceMinutes: newQueueAvgMins,
      });
      setNewQueueName('');
      setNewQueuePrefix('');
      setNewQueueLocation('');
      await Promise.all([loadOverviewAndNotifs(), loadMonitor()]);
      onToast(`Created service queue "${res.queue.name}" (${res.queue.prefix}-series)`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to create service queue.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleQueuePause = async (q: ApiQueue) => {
    setBusyAction(`queue-pause:${q.id}`);
    try {
      await api.adminUpdateQueue(q.id, { isPaused: !q.isPaused });
      await Promise.all([loadOverviewAndNotifs(), loadMonitor()]);
      onToast(`${q.name} ${!q.isPaused ? 'paused' : 'resumed'}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update queue.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetQueueId =
      newCntQueueId ||
      monitorData?.queues.find((q) => q.facilityId === newCntFacilityId)?.id ||
      '';
    if (!targetQueueId) {
      onToast('Create or select a service queue for this center first.');
      return;
    }
    setBusyAction('create-counter');
    try {
      const op = users.find((u) => u.id === newCntOperatorId);
      const res = await api.adminCreateCounter({
        facilityId: newCntFacilityId,
        queueId: targetQueueId,
        label: newCntLabel.trim(),
        assignedOperatorId: op?.id,
        staffName: op?.name,
        status: 'Serving',
      });
      setNewCntLabel('');
      await Promise.all([loadOverviewAndNotifs(), loadMonitor()]);
      onToast(`Created counter "${res.counter.label}"`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to create counter.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCounterStatusChange = async (
    counter: ApiCounter,
    status: 'Serving' | 'Busy' | 'Paused' | 'Closed'
  ) => {
    setBusyAction(`cnt:${counter.id}`);
    try {
      await api.adminUpdateCounter(counter.id, { status });
      await Promise.all([loadOverviewAndNotifs(), loadMonitor()]);
      onToast(`${counter.label} updated to ${status}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update counter.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAssignCounterOperator = async (counter: ApiCounter, operatorId: string) => {
    const op = users.find((u) => u.id === operatorId);
    setBusyAction(`cnt-op:${counter.id}`);
    try {
      await api.adminUpdateCounter(counter.id, {
        assignedOperatorId: op?.id || '',
        staffName: op?.name || 'Unassigned',
      });
      await Promise.all([loadOverviewAndNotifs(), loadUsers()]);
      onToast(`Assigned ${op?.name || 'Unassigned'} to ${counter.label}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to assign operator.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusyAction('save-settings');
    try {
      const res = await api.adminUpdateSettings(settings);
      setSettings(res.settings);
      await loadSettingsAndLogs();
      onToast('Platform queue settings saved');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsv = () => {
    if (!reports) return;
    const rows = [
      ['Metric', 'Value'],
      ['Period', reports.period],
      ['Facility Scope', reports.facilityId],
      ['Total Generated', String(reports.summary.totalGenerated)],
      ['Completed', String(reports.summary.completed)],
      ['Cancelled/No-Show', String(reports.summary.cancelled)],
      ['Active', String(reports.summary.active)],
      ['Completion Rate %', String(reports.summary.completionRate)],
      [],
      ['Center', 'City', 'Total Tokens', 'Waiting', 'Avg Wait (min)', 'Active Counters'],
      ...reports.centerComparison.map((c) => [
        c.name,
        c.city,
        String(c.totalTokens),
        String(c.waiting),
        String(c.avgWaitMins),
        String(c.activeCounters),
      ]),
      [],
      ['Department', 'Center', 'Total Tokens', 'Completed', 'Cancelled', 'Avg Wait (min)'],
      ...reports.departmentPerformance.map((d) => [
        d.departmentName,
        d.facilityName,
        String(d.totalTokens),
        String(d.completed),
        String(d.cancelled),
        String(d.avgWaitMins),
      ]),
    ];

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartqueue-${reports.period}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Downloaded analytics CSV report');
  };

  const handleMarkNotificationRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllNotificationsRead = async () => {
    await api.markAllNotificationsRead('all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    onToast('All notifications marked read');
  };

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'users', label: 'User Management', icon: <Users className="w-4 h-4" /> },
    { id: 'centers', label: 'Service Centers', icon: <Building2 className="w-4 h-4" /> },
    { id: 'departments', label: 'Departments', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'counters', label: 'Counters', icon: <MonitorCheck className="w-4 h-4" /> },
    {
      id: 'queues',
      label: 'Queue Monitor',
      icon: <Activity className="w-4 h-4" />,
      badge: overview?.kpis.waitingTokens || undefined,
    },
    { id: 'reports', label: 'Reports & SDGs', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadCount || undefined,
    },
    { id: 'settings', label: 'Settings & Logs', icon: <Settings className="w-4 h-4" /> },
    { id: 'profile', label: 'Admin Profile', icon: <User className="w-4 h-4" /> },
  ];

  const operatorUsers = users.filter((u) => u.role === 'operator');

  return (
    <DashboardShell
      roleLabel="Administrator"
      roleSubtitle="Platform Governance & Multi-Center Control"
      user={user}
      navItems={navItems}
      activeNavId={section}
      onSelectNav={(id) => onNavigate(id as AdminSection)}
      onLogout={onLogout}
      unreadNotifications={unreadCount}
      onOpenNotifications={() => onNavigate('notifications')}
      headerAction={
        <button
          type="button"
          onClick={() => onNavigate('queues')}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          Live Queue Monitor
        </button>
      }
    >
      {loading && !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* 1. OVERVIEW */}
          {section === 'overview' && overview && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    System Command Center
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Platform Overview · {user.name}
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Live cross-center telemetry, active staffing, and platform queue throughput.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  <span>Full Analytics &amp; Export</span>
                </button>
              </div>

              {/* 10 Platform KPIs */}
              <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Citizens', val: overview.kpis.totalCitizens, accent: 'text-slate-900' },
                  { label: 'Total Operators', val: overview.kpis.totalOperators, accent: 'text-slate-900' },
                  { label: 'Service Centers', val: overview.kpis.totalFacilities, accent: 'text-slate-900' },
                  { label: 'Departments', val: overview.kpis.totalDepartments, accent: 'text-slate-900' },
                  {
                    label: 'Active Counters',
                    val: `${overview.kpis.activeCounters}/${overview.kpis.totalCounters}`,
                    accent: 'text-blue-600',
                  },
                  { label: 'Tokens Today', val: overview.kpis.totalTokensToday, accent: 'text-slate-900' },
                  { label: 'Waiting Tokens', val: overview.kpis.waitingTokens, accent: 'text-blue-600' },
                  { label: 'Completed Tokens', val: overview.kpis.completedTokens, accent: 'text-emerald-700' },
                  { label: 'Cancelled / NoShow', val: overview.kpis.cancelledTokens, accent: 'text-amber-700' },
                  { label: 'Avg Wait Time', val: `${overview.kpis.avgWaitMins} min`, accent: 'text-slate-900' },
                ].map((kpi) => (
                  <div key={kpi.label} className="p-4 bg-white border border-slate-200 rounded-xl">
                    <div className="text-xs font-medium text-slate-500">{kpi.label}</div>
                    <div className={`font-mono tabular-nums text-2xl font-bold mt-1 ${kpi.accent}`}>
                      {kpi.val}
                    </div>
                  </div>
                ))}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                {/* Centers Status */}
                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900">Service Center Health</h2>
                    <button
                      type="button"
                      onClick={() => onNavigate('centers')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Manage Centers
                    </button>
                  </div>
                  <div className="space-y-3">
                    {overview.centersSummary.map((c) => (
                      <div
                        key={c.facilityId}
                        className="p-4 border border-slate-200 rounded-lg flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{c.name}</span>
                            {c.hasSurge && (
                              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Surge Alert
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {c.city} · {c.isActive ? 'Active' : 'Inactive'} · {c.activeCounters}/{c.totalCounters} counters open
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-sm font-bold text-slate-900">{c.waiting} waiting</div>
                          <div className="text-xs text-blue-600">~{c.avgWaitMins} min avg</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Peak Traffic Chart & Recent Audit */}
                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900">Hourly Footfall Distribution</h2>
                    <span className="text-xs text-slate-500">Primary Hub</span>
                  </div>
                  <div className="flex items-end gap-2 h-36 pt-2">
                    {overview.hourlyTraffic.map((pt) => {
                      const maxVal = Math.max(
                        1,
                        ...overview.hourlyTraffic.map((p) => p.footfall)
                      );
                      const heightPct = Math.max(10, Math.round((pt.footfall / maxVal) * 100));
                      return (
                        <div key={pt.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <span className="font-mono tabular-nums text-[10px] text-slate-500">
                            {pt.footfall}
                          </span>
                          <div
                            className={`w-full rounded-t ${
                              pt.isPeak
                                ? 'bg-amber-500'
                                : pt.isRecommended
                                  ? 'bg-emerald-500'
                                  : 'bg-blue-600'
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            {pt.hour.replace(' ', '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Recent Audit Trail
                      </h3>
                      <button
                        type="button"
                        onClick={() => onNavigate('settings')}
                        className="text-xs font-semibold text-blue-600 cursor-pointer"
                      >
                        View All
                      </button>
                    </div>
                    {overview.recentAuditLogs.slice(0, 4).map((log) => (
                      <div key={log.id} className="text-xs flex items-start justify-between gap-2">
                        <span className="text-slate-700 truncate">
                          <strong className="text-slate-900">{log.actorName}</strong>: {log.details}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* 2. USER MANAGEMENT */}
          {section === 'users' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Role-Based Access Control
                </p>
                <h1 className="text-2xl font-bold text-slate-900">User &amp; Staff Management</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Create Operator or Admin accounts, assign counters &amp; shifts, and manage account status.
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_380px] gap-6 items-start">
                <div className="space-y-4">
                  {/* Search & Filters */}
                  <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
                        placeholder="Search by name, email, or user ID..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <select
                      aria-label="Filter by role"
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="all">All Roles</option>
                      <option value="citizen">Citizen</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                    <select
                      aria-label="Filter by status"
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button
                      type="button"
                      onClick={loadUsers}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Users Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-3 px-4">User</th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">Assignment</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {users.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900">{u.name}</div>
                                <div className="text-slate-500">{u.email}</div>
                                <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                                  {u.id}
                                </div>
                              </td>
                              <td className="py-3.5 px-4">
                                <select
                                  aria-label={`Role for ${u.name}`}
                                  disabled={u.id === user.id || busyAction !== null}
                                  value={u.role}
                                  onChange={(e) =>
                                    handleChangeUserRole(u, e.target.value as UserRole)
                                  }
                                  className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white font-semibold capitalize"
                                >
                                  <option value="citizen">citizen</option>
                                  <option value="operator">operator</option>
                                  <option value="admin">admin</option>
                                </select>
                              </td>
                              <td className="py-3.5 px-4 text-slate-600">
                                {u.role === 'operator' ? (
                                  <>
                                    <div>{u.assignedFacilityId || 'Unassigned center'}</div>
                                    <div className="text-[11px] text-slate-400">
                                      {u.assignedCounterId || 'No counter'} · {u.shift || 'Day'}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`font-semibold capitalize ${
                                    u.accountStatus === 'active'
                                      ? 'text-emerald-700'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {u.accountStatus}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <button
                                  type="button"
                                  disabled={u.id === user.id || busyAction !== null}
                                  onClick={() => handleToggleUserStatus(u)}
                                  className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 cursor-pointer"
                                >
                                  {u.accountStatus === 'active' ? 'Deactivate' : 'Activate'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Create Staff/Admin Form */}
                <form
                  onSubmit={handleCreateUser}
                  className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
                >
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                    <Plus className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Create Operator / Admin</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="e.g. Suresh Babu"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="operator2@smartqueue.local"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Min 6 chars"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="operator">Token Operator</option>
                        <option value="admin">Administrator</option>
                        <option value="citizen">Citizen</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="+91 98480 00000"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>

                  {newUserRole === 'operator' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Assigned Service Center
                        </label>
                        <select
                          value={newUserFacilityId}
                          onChange={(e) => setNewUserFacilityId(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          {facilities.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} ({f.city})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Department
                          </label>
                          <select
                            value={newUserDeptId}
                            onChange={(e) => setNewUserDeptId(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="">Auto</option>
                            {departments
                              .filter((d) => d.facilityId === newUserFacilityId)
                              .map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Counter
                          </label>
                          <select
                            value={newUserCounterId}
                            onChange={(e) => setNewUserCounterId(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="">Unassigned</option>
                            {counters
                              .filter((c) => c.facilityId === newUserFacilityId)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Shift Schedule
                        </label>
                        <input
                          type="text"
                          value={newUserShift}
                          onChange={(e) => setNewUserShift(e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {busyAction === 'create-user' ? 'Creating...' : 'Create User Account'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 3. SERVICE CENTERS */}
          {section === 'centers' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Hospitals &amp; Civic Hubs
                </p>
                <h1 className="text-2xl font-bold text-slate-900">Service Center Management</h1>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_380px] gap-6 items-start">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {facilities.map((fac) => (
                    <div
                      key={fac.id}
                      className="p-5 bg-white border border-slate-200 rounded-xl space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-bold text-slate-900">{fac.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {fac.city} · {fac.code}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            fac.isActive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {fac.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 space-y-1">
                        <div>Address: {fac.address}</div>
                        <div>Hours: {fac.workingHours}</div>
                        {fac.phone && <div>Phone: {fac.phone}</div>}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <div className="text-slate-400">Depts</div>
                          <div className="font-mono font-bold text-slate-900">
                            {fac.departmentsCount ?? 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Waiting</div>
                          <div className="font-mono font-bold text-blue-600">
                            {fac.waitingCount ?? 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Avg Wait</div>
                          <div className="font-mono font-bold text-slate-900">
                            {fac.avgWaitMins ?? 0}m
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => handleToggleFacilityActive(fac)}
                        className="w-full py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                      >
                        {fac.isActive ? 'Disable Service Center' : 'Enable Service Center'}
                      </button>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleCreateFacility}
                  className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
                >
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                    <Plus className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Add Service Center</h2>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Center Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newFacName}
                      onChange={(e) => setNewFacName(e.target.value)}
                      placeholder="e.g. Regional Eye & Dental Hub"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        required
                        value={newFacCity}
                        onChange={(e) => setNewFacCity(e.target.value)}
                        placeholder="Visakhapatnam"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Working Hours
                      </label>
                      <input
                        type="text"
                        value={newFacHours}
                        onChange={(e) => setNewFacHours(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      value={newFacAddress}
                      onChange={(e) => setNewFacAddress(e.target.value)}
                      placeholder="Campus Block / Road"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={newFacPhone}
                      onChange={(e) => setNewFacPhone(e.target.value)}
                      placeholder="+91 891 255 4400"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {busyAction === 'create-facility' ? 'Creating...' : 'Create Service Center'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 4. DEPARTMENTS & SERVICES */}
          {section === 'departments' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Department &amp; Service Catalog
                </p>
                <h1 className="text-2xl font-bold text-slate-900">Departments &amp; Service Queues</h1>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_380px] gap-6 items-start">
                <div className="space-y-4">
                  {departments.map((dept) => (
                    <div
                      key={dept.id}
                      className="p-5 bg-white border border-slate-200 rounded-xl space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-bold text-slate-900">
                            {dept.name} <span className="font-mono text-xs text-blue-600">({dept.code})</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {dept.facilityName} · {dept.floorOrWing}
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{dept.description}</p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            dept.isActive ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {dept.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </div>

                      {dept.services && dept.services.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Assigned Services ({dept.services.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {dept.services.map((svc) => (
                              <div
                                key={svc.id}
                                className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <div className="font-semibold text-slate-900">{svc.name}</div>
                                  <div className="text-slate-500">
                                    {svc.prefix}-Series · {svc.location}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleQueuePause(svc)}
                                  className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[11px] font-semibold cursor-pointer"
                                >
                                  {svc.isPaused ? 'Resume' : 'Pause'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  <form
                    onSubmit={handleCreateDepartment}
                    className="p-6 bg-white border border-slate-200 rounded-xl space-y-3.5"
                  >
                    <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
                      Create Department
                    </h2>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Service Center
                      </label>
                      <select
                        value={newDeptFacilityId}
                        onChange={(e) => setNewDeptFacilityId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        {facilities.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          required
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="Cardiology"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Code
                        </label>
                        <input
                          type="text"
                          value={newDeptCode}
                          onChange={(e) => setNewDeptCode(e.target.value)}
                          placeholder="CARD"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Floor / Wing
                      </label>
                      <input
                        type="text"
                        value={newDeptFloor}
                        onChange={(e) => setNewDeptFloor(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={newDeptDesc}
                        onChange={(e) => setNewDeptDesc(e.target.value)}
                        placeholder="Cardiac consultation & ECG desk"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busyAction !== null}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Create Department
                    </button>
                  </form>

                  <form
                    onSubmit={handleCreateQueue}
                    className="p-6 bg-white border border-slate-200 rounded-xl space-y-3.5"
                  >
                    <h2 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-200">
                      Add Service Queue
                    </h2>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Service Center
                      </label>
                      <select
                        value={newQueueFacilityId}
                        onChange={(e) => setNewQueueFacilityId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        {facilities.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department
                      </label>
                      <select
                        value={newQueueDeptId}
                        onChange={(e) => setNewQueueDeptId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">Default Department</option>
                        {departments
                          .filter((d) => d.facilityId === newQueueFacilityId)
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Service Name
                      </label>
                      <input
                        type="text"
                        required
                        value={newQueueName}
                        onChange={(e) => setNewQueueName(e.target.value)}
                        placeholder="ECG Screening"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Prefix
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={3}
                          value={newQueuePrefix}
                          onChange={(e) => setNewQueuePrefix(e.target.value)}
                          placeholder="C"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Priority
                        </label>
                        <select
                          value={newQueuePriority}
                          onChange={(e) => setNewQueuePriority(e.target.value as QueuePriority)}
                          className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="standard">Standard</option>
                          <option value="senior">Senior</option>
                          <option value="emergency">Emergency</option>
                          <option value="appointment">Appointment</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Avg Min
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={newQueueAvgMins}
                          onChange={(e) => setNewQueueAvgMins(Number(e.target.value))}
                          className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Room / Location
                      </label>
                      <input
                        type="text"
                        required
                        value={newQueueLocation}
                        onChange={(e) => setNewQueueLocation(e.target.value)}
                        placeholder="Room 204 · Wing B"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={busyAction !== null}
                      className="w-full py-2.5 bg-slate-900 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Add Service Queue
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* 5. COUNTER MANAGEMENT */}
          {section === 'counters' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Counter Staffing &amp; Status
                </p>
                <h1 className="text-2xl font-bold text-slate-900">Counter Management</h1>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_360px] gap-6 items-start">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Counter</th>
                          <th className="py-3 px-4">Service Queue</th>
                          <th className="py-3 px-4">Assigned Operator</th>
                          <th className="py-3 px-4">Current</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {counters.map((cnt) => (
                          <tr key={cnt.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{cnt.label}</div>
                              <div className="text-slate-500">{cnt.facilityName}</div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700">{cnt.queueName}</td>
                            <td className="py-3.5 px-4">
                              <select
                                aria-label={`Assign operator for ${cnt.label}`}
                                value={cnt.assignedOperatorId || ''}
                                onChange={(e) => handleAssignCounterOperator(cnt, e.target.value)}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white text-xs"
                              >
                                <option value="">{cnt.staffName || 'Unassigned'}</option>
                                {operatorUsers.map((op) => (
                                  <option key={op.id} value={op.id}>
                                    {op.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {cnt.currentToken}
                            </td>
                            <td className="py-3.5 px-4">
                              <select
                                aria-label={`Status for ${cnt.label}`}
                                value={cnt.status}
                                onChange={(e) =>
                                  handleCounterStatusChange(
                                    cnt,
                                    e.target.value as 'Serving' | 'Busy' | 'Paused' | 'Closed'
                                  )
                                }
                                className="px-2.5 py-1.5 border border-slate-200 rounded-md bg-white font-semibold"
                              >
                                <option value="Serving">Serving</option>
                                <option value="Busy">Busy</option>
                                <option value="Paused">Paused</option>
                                <option value="Closed">Closed</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <form
                  onSubmit={handleCreateCounter}
                  className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
                >
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                    <Plus className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Add New Counter</h2>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Service Center
                    </label>
                    <select
                      value={newCntFacilityId}
                      onChange={(e) => setNewCntFacilityId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {facilities.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Service Queue
                    </label>
                    <select
                      value={newCntQueueId}
                      onChange={(e) => setNewCntQueueId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">First available queue</option>
                      {(monitorData?.queues || [])
                        .filter((q) => q.facilityId === newCntFacilityId)
                        .map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name} ({q.prefix}-series)
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Counter Label
                    </label>
                    <input
                      type="text"
                      required
                      value={newCntLabel}
                      onChange={(e) => setNewCntLabel(e.target.value)}
                      placeholder="Counter 05"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assign Operator
                    </label>
                    <select
                      value={newCntOperatorId}
                      onChange={(e) => setNewCntOperatorId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Select Operator (optional)</option>
                      {operatorUsers.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Create Counter
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 6. QUEUE MONITORING */}
          {section === 'queues' && monitorData && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    Cross-Center Telemetry
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">Live Queue Monitoring</h1>
                </div>

                <select
                  aria-label="Filter queues by center"
                  value={centerFilter}
                  onChange={(e) => setCenterFilter(e.target.value)}
                  className="px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
                >
                  <option value="all">All Service Centers</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.city})
                    </option>
                  ))}
                </select>
              </div>

              {monitorData.surgeAlerts.length > 0 && (
                <div className="space-y-3">
                  {monitorData.surgeAlerts.map((alert) => (
                    <div
                      key={alert.queueId}
                      className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-950">
                          <div className="font-bold">
                            Overloaded Queue Surge · {alert.facilityName} ({alert.queueName})
                          </div>
                          <div className="text-amber-800 mt-0.5">
                            {alert.waitingCount} citizens waiting. Standby desk available:{' '}
                            {alert.standbyStaffName}.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.adminUpdateCounter(alert.standbyCounterId, {
                            status: 'Serving',
                          });
                          loadMonitor();
                          loadOverviewAndNotifs();
                          onToast(`Opened overflow counter for ${alert.queueName}`);
                        }}
                        className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Open Overflow Counter
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {monitorData.queues.map((q) => (
                  <div
                    key={q.id}
                    className="p-5 bg-white border border-slate-200 rounded-xl space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{q.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {q.facilityName} · {q.location}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          q.isPaused
                            ? 'text-amber-700'
                            : q.overloaded
                              ? 'text-red-700'
                              : 'text-emerald-700'
                        }`}
                      >
                        {q.isPaused ? 'Paused' : q.overloaded ? 'High Load' : 'Normal'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                      <div>
                        <div className="text-slate-400">Serving</div>
                        <div className="font-mono font-bold text-slate-900">
                          {q.prefix}-{q.servingNumber}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Waiting</div>
                        <div className="font-mono font-bold text-blue-600">{q.waitingCount}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">ETA</div>
                        <div className="font-mono font-bold text-slate-900">
                          ~{q.predictedWaitMins}m
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleQueuePause(q)}
                      className="w-full py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      {q.isPaused ? 'Resume Queue' : 'Pause Queue'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. REPORTS & ANALYTICS */}
          {section === 'reports' && reports && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    Performance &amp; SDG Impact
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">Reports &amp; Analytics</h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                    {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setReportPeriod(p)}
                        className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-md cursor-pointer ${
                          reportPeriod === p
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Report facility filter"
                    value={reportFacility}
                    onChange={(e) => setReportFacility(e.target.value)}
                    className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="all">All Service Centers</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Generated ({reports.period})</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {reports.summary.totalGenerated}
                  </div>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Completed</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
                    {reports.summary.completed}
                  </div>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Cancelled / NoShow</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
                    {reports.summary.cancelled}
                  </div>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs text-slate-500">Active Waiting</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-blue-600 mt-1">
                    {reports.summary.active}
                  </div>
                </div>
                <div className="p-4 bg-white border border-slate-200 rounded-xl col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-500">Completion Rate</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {reports.summary.completionRate}%
                  </div>
                </div>
              </div>

              {/* SDG Alignment Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-semibold text-blue-600">SDG 9 · Digital Infrastructure</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {reports.sdgImpact.sdg9InfraCalls}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Automated queue predictions &amp; real-time turn dispatches
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-semibold text-emerald-700">SDG 11 · Corridor Decongestion</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {reports.sdgImpact.sdg11CorridorDensityReduction}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Physical waiting-hall crowd reduction via remote waiting
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-semibold text-slate-700">SDG 12 · Zero Paper Waste</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {reports.sdgImpact.sdg12PaperSlipsSaved}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Thermal paper queue slips eliminated across service hubs
                  </div>
                </div>
              </div>

              {/* Department & Counter Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 font-bold text-sm text-slate-900">
                    Department Performance
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2.5 px-4">Department</th>
                          <th className="py-2.5 px-4">Total</th>
                          <th className="py-2.5 px-4">Done</th>
                          <th className="py-2.5 px-4">Avg Wait</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reports.departmentPerformance.map((d) => (
                          <tr key={d.departmentId}>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{d.departmentName}</div>
                              <div className="text-slate-400">{d.facilityName}</div>
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums">{d.totalTokens}</td>
                            <td className="py-3 px-4 font-mono tabular-nums text-emerald-700">
                              {d.completed}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums">{d.avgWaitMins}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 font-bold text-sm text-slate-900">
                    Counter Performance
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2.5 px-4">Counter</th>
                          <th className="py-2.5 px-4">Operator</th>
                          <th className="py-2.5 px-4">Handled</th>
                          <th className="py-2.5 px-4">Cycle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reports.counterPerformance.map((c) => (
                          <tr key={c.counterId}>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{c.label}</div>
                              <div className="text-slate-400">{c.facilityName}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-700">{c.staffName}</td>
                            <td className="py-3 px-4 font-mono tabular-nums">{c.tokensHandled}</td>
                            <td className="py-3 px-4 font-mono tabular-nums">{c.avgCycleMins}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 8. NOTIFICATIONS */}
          {section === 'notifications' && (
            <NotificationsView
              scopeLabel="Platform Notifications"
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              primaryCtaLabel="Back to Overview"
              onPrimaryCta={() => onNavigate('overview')}
            />
          )}

          {/* 9. SETTINGS & AUDIT LOGS */}
          {section === 'settings' && settings && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Platform Rules &amp; Auditability
                </p>
                <h1 className="text-2xl font-bold text-slate-900">System Settings &amp; Audit Logs</h1>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 items-start">
                <form
                  onSubmit={handleSaveSettings}
                  className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
                >
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Queue &amp; Notification Rules</h2>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Organisation Name
                    </label>
                    <input
                      type="text"
                      value={settings.organisationName}
                      onChange={(e) =>
                        setSettings({ ...settings, organisationName: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Max Active Tokens / Citizen
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={settings.maxActiveTokensPerCitizen}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxActiveTokensPerCitizen: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Grace Period (Mins)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.gracePeriodMinutes}
                        onChange={(e) =>
                          setSettings({ ...settings, gracePeriodMinutes: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Working Hours Start
                      </label>
                      <input
                        type="text"
                        value={settings.workingHoursStart}
                        onChange={(e) =>
                          setSettings({ ...settings, workingHoursStart: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Working Hours End
                      </label>
                      <input
                        type="text"
                        value={settings.workingHoursEnd}
                        onChange={(e) =>
                          setSettings({ ...settings, workingHoursEnd: e.target.value })
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    {[
                      {
                        key: 'allowPeerSwaps' as const,
                        label: 'Allow citizen-to-citizen peer token swaps',
                      },
                      {
                        key: 'enableInAppNotifications' as const,
                        label: 'Enable real-time in-app turn notifications',
                      },
                      {
                        key: 'enableSmsNotifications' as const,
                        label: 'Enable SMS turn alerts (when gateway configured)',
                      },
                      {
                        key: 'enableEmailNotifications' as const,
                        label: 'Enable Email receipt alerts (when SMTP configured)',
                      },
                    ].map((toggle) => (
                      <label
                        key={toggle.key}
                        className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={settings[toggle.key]}
                          onChange={(e) =>
                            setSettings({ ...settings, [toggle.key]: e.target.checked })
                          }
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>{toggle.label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {busyAction === 'save-settings' ? 'Saving...' : 'Save Settings'}
                  </button>
                </form>

                {/* Audit Logs Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-blue-600" />
                      <h2 className="text-base font-bold text-slate-900">System Audit Logs</h2>
                    </div>
                    <span className="text-xs text-slate-500">{auditLogs.length} entries</span>
                  </div>
                  <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="px-5 py-3.5 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-blue-700">{log.action}</span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-slate-800">{log.details}</div>
                        <div className="text-[11px] text-slate-500">
                          Actor: {log.actorName} ({log.actorRole}) · Target: {log.targetType}:
                          {log.targetId}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 10. ADMIN PROFILE */}
          {section === 'profile' && (
            <ProfileView
              currentUser={user}
              onUserUpdated={onUserUpdated}
              onNotify={onToast}
              onLogout={onLogout}
            />
          )}
        </>
      )}
    </DashboardShell>
  );
};
