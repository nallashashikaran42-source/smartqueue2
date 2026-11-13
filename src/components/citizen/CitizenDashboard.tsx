import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Home,
  Ticket,
  Clock,
  Bell,
  History,
  User,
  Search,
  MapPin,
  Volume2,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  Building2,
} from 'lucide-react';
import {
  api,
  type ApiTokenRecord,
  type AuthUser,
  type CitizenHistoryItem,
  type CitizenOverviewResponse,
  type FacilitySnapshotResponse,
  type NotificationItem,
} from '../../services/api';
import { FREE_TIME_ACTIVITIES, type EntryChannel } from '../../data/smartQueueData';
import { useQueueSocket, type QueueWsMessage } from '../../hooks/useQueueSocket';
import { DashboardShell, type SidebarNavItem } from '../DashboardShell';
import { NotificationsView } from '../NotificationsView';
import { ProfileView } from '../ProfileView';
import { QrTicketSvg } from '../QrTicketSvg';

export type CitizenSection =
  | 'home'
  | 'take-token'
  | 'my-queue'
  | 'notifications'
  | 'history'
  | 'profile';

interface CitizenDashboardProps {
  user: AuthUser;
  section: CitizenSection;
  onNavigate: (section: CitizenSection) => void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onToast: (msg: string) => void;
}

export const CitizenDashboard: React.FC<CitizenDashboardProps> = ({
  user,
  section,
  onNavigate,
  onUserUpdated,
  onLogout,
  onToast,
}) => {
  const [overview, setOverview] = useState<CitizenOverviewResponse | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('vja-hospital');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedQueueId, setSelectedQueueId] = useState<string>('general-opd');
  const [selectedChannel, setSelectedChannel] = useState<EntryChannel>('App QR');
  const [searchQuery, setSearchQuery] = useState('');

  const [snapshot, setSnapshot] = useState<FacilitySnapshotResponse | null>(null);
  const [activeToken, setActiveToken] = useState<ApiTokenRecord | null>(null);
  const [history, setHistory] = useState<CitizenHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'Completed' | 'Cancelled'>('all');

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [ov, hist, notifRes] = await Promise.all([
        api.getCitizenOverview(),
        api.getCitizenHistory(),
        api.getNotifications('all'),
      ]);
      setOverview(ov);
      setHistory(hist.history);
      setNotifications(notifRes.notifications);
      setUnreadCount(notifRes.unreadCount);

      if (ov.activeToken) {
        setActiveToken(ov.activeToken);
        setSelectedFacilityId(ov.activeToken.facilityId);
      } else if (ov.centers.length > 0) {
        setSelectedFacilityId((prev) =>
          ov.centers.some((c) => c.facility.id === prev) ? prev : ov.centers[0].facility.id
        );
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load citizen workspace.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    api
      .getQueueState(selectedFacilityId)
      .then((snap) => {
        setSnapshot(snap);
        if (snap.queues.length > 0) {
          setSelectedQueueId((prev) =>
            snap.queues.some((q) => q.id === prev) ? prev : snap.queues[0].id
          );
        }
      })
      .catch(() => undefined);
  }, [selectedFacilityId]);

  const handleWsEvent = useCallback(
    (msg: QueueWsMessage) => {
      if (msg.event === 'notification:new') {
        const incoming = (msg.payload as { notification?: NotificationItem } | undefined)
          ?.notification;
        if (incoming && (!incoming.userId || incoming.userId === user.id)) {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === incoming.id)) return prev;
            return [incoming, ...prev].slice(0, 60);
          });
          setUnreadCount((prev) => prev + 1);
          onToast(incoming.title);
        }
        return;
      }

      const payload = msg.payload as { snapshot?: FacilitySnapshotResponse } | undefined;
      if (payload?.snapshot && msg.facilityId === selectedFacilityId) {
        setSnapshot(payload.snapshot);
      }
      // Refresh overview/history whenever any token lifecycle event happens
      if (msg.event.startsWith('token:') || msg.event.startsWith('grace:') || msg.event.startsWith('swap:')) {
        api
          .getCitizenOverview()
          .then((ov) => {
            setOverview(ov);
            setActiveToken(ov.activeToken);
          })
          .catch(() => undefined);
        api
          .getCitizenHistory()
          .then((res) => setHistory(res.history))
          .catch(() => undefined);
      }
    },
    [selectedFacilityId, user.id, onToast]
  );

  useQueueSocket(activeToken?.facilityId || selectedFacilityId, handleWsEvent);

  const centers = overview?.centers ?? [];
  const currentCenter =
    centers.find((c) => c.facility.id === selectedFacilityId) ?? centers[0];

  const filteredCenters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return centers;
    return centers.filter(
      (c) =>
        c.facility.name.toLowerCase().includes(q) ||
        c.facility.city.toLowerCase().includes(q) ||
        c.departments.some((d) => d.name.toLowerCase().includes(q)) ||
        c.queues.some((sq) => sq.name.toLowerCase().includes(q))
    );
  }, [centers, searchQuery]);

  const facilityQueues = snapshot?.queues ?? currentCenter?.queues ?? [];
  const facilityDepts = snapshot?.departments ?? currentCenter?.departments ?? [];
  const facilityCounters = snapshot?.counters ?? currentCenter?.counters ?? [];

  const filteredQueuesForBooking = useMemo(() => {
    return facilityQueues.filter(
      (q) => q.isActive && (selectedDeptId === 'all' || q.departmentId === selectedDeptId)
    );
  }, [facilityQueues, selectedDeptId]);

  const chosenQueue =
    filteredQueuesForBooking.find((q) => q.id === selectedQueueId) ??
    filteredQueuesForBooking[0] ??
    facilityQueues[0];

  const availableCountersForChosenQueue = useMemo(() => {
    if (!chosenQueue) return [];
    return facilityCounters.filter((c) => c.queueId === chosenQueue.id && c.status !== 'Closed');
  }, [facilityCounters, chosenQueue]);

  const handleIssueToken = async () => {
    if (!currentCenter || !chosenQueue) return;
    setIssuing(true);
    try {
      const res = await api.issueToken(currentCenter.facility.id, {
        queueId: chosenQueue.id,
        channel: selectedChannel,
        citizenName: user.name,
      });
      setSnapshot(res.snapshot);
      setActiveToken(res.token);
      onToast(`Token ${res.token.tokenId} booked successfully`);
      await loadAll();
      onNavigate('my-queue');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to generate token.');
    } finally {
      setIssuing(false);
    }
  };

  const handleCancelActiveToken = async () => {
    if (!activeToken) return;
    try {
      const res = await api.cancelToken(activeToken.facilityId, activeToken.tokenId);
      setSnapshot(res.snapshot);
      setActiveToken(null);
      onToast(`Token ${activeToken.tokenId} cancelled`);
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to cancel token.');
    }
  };

  const handleClaimGrace = async () => {
    if (!activeToken) return;
    try {
      const res = await api.checkInGrace(activeToken.facilityId, activeToken.tokenId);
      setSnapshot(res.snapshot);
      onToast('Checked in at counter. Grace turn honored.');
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to check in.');
    }
  };

  const handleAcceptSwap = async () => {
    if (!activeToken || !snapshot) return;
    const swap = snapshot.openSwaps.find((s) => s.queueId === activeToken.queueId);
    if (!swap) {
      onToast('No compatible swap offer available.');
      return;
    }
    try {
      const res = await api.acceptSwap(activeToken.facilityId, swap.id, activeToken.tokenId);
      setSnapshot(res.snapshot);
      onToast(`Swapped to ${res.updatedTokenId}`);
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Swap failed.');
    }
  };

  const speakStatus = () => {
    if (!activeToken || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const message =
      activeToken.status === 'Called' || activeToken.status === 'Serving'
        ? `Token ${activeToken.tokenId}, please proceed to ${activeToken.counterLabel || 'your assigned counter'} now.`
        : `Your token is ${activeToken.tokenId} in ${activeToken.queueName}. There are ${activeToken.aheadCount} people ahead, estimated wait ${activeToken.etaMinutes} minutes.`;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    onToast(`Voice announcement playing for ${activeToken.tokenId}`);
  };

  const handleMarkRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead('all');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    onToast('All notifications marked read');
  };

  const navItems: SidebarNavItem[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'take-token', label: 'Take Token', icon: <Ticket className="w-4 h-4" /> },
    {
      id: 'my-queue',
      label: 'My Queue',
      icon: <Clock className="w-4 h-4" />,
      badge: activeToken ? activeToken.tokenId : undefined,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile', icon: <User className="w-4 h-4" /> },
  ];

  const statusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Called':
      case 'Serving':
        return 'text-emerald-700 font-semibold';
      case 'Grace':
        return 'text-amber-700 font-semibold';
      case 'Cancelled':
      case 'Skipped':
      case 'NoShow':
        return 'text-red-700 font-semibold';
      case 'Completed':
        return 'text-blue-700 font-semibold';
      default:
        return 'text-slate-700 font-semibold';
    }
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return history;
    return history.filter((h) => h.status === historyFilter);
  }, [history, historyFilter]);

  return (
    <DashboardShell
      roleLabel="Citizen / Patient"
      roleSubtitle="Virtual Token & Queue Tracking"
      user={user}
      navItems={navItems}
      activeNavId={section}
      onSelectNav={(id) => onNavigate(id as CitizenSection)}
      onLogout={onLogout}
      unreadNotifications={unreadCount}
      onOpenNotifications={() => onNavigate('notifications')}
      headerAction={
        <button
          type="button"
          onClick={() => onNavigate(activeToken ? 'my-queue' : 'take-token')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          {activeToken ? `Token ${activeToken.tokenId}` : 'Take Token'}
        </button>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {/* SECTION A: HOME */}
          {section === 'home' && (
            <div className="space-y-6">
              {/* Welcome & Active Token Banner */}
              <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-stretch">
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      Patient Portal
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                      Welcome, {user.name}
                    </h1>
                    <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
                      Find a hospital or civic service center, check live wait times, and book a
                      digital token so you can wait comfortably anywhere.
                    </p>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search hospitals, departments, or services..."
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('take-token')}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Ticket className="w-4 h-4" />
                      <span>Take a Token</span>
                    </button>
                  </div>
                </div>

                {/* Current Queue Status Card */}
                {activeToken ? (
                  <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-blue-300">Active Digital Token</div>
                        <div className="font-mono tabular-nums text-4xl font-bold mt-1">
                          {activeToken.tokenId}
                        </div>
                        <div className="text-xs text-slate-300 mt-1">
                          {activeToken.queueName} · {activeToken.counterLabel || 'Counter Assigned'}
                        </div>
                      </div>
                      <span className="font-mono text-xs uppercase text-emerald-300 font-semibold">
                        {activeToken.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-4 my-4 border-y border-white/15 font-mono tabular-nums">
                      <div>
                        <div className="text-[11px] text-slate-400">People Ahead</div>
                        <div className="text-lg font-bold mt-0.5">{activeToken.aheadCount}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">Estimated Wait</div>
                        <div className="text-lg font-bold text-blue-300 mt-0.5">
                          {activeToken.etaMinutes} min
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate('my-queue')}
                      className="w-full inline-flex items-center justify-between px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <span>Open Live Queue Tracker</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-slate-300 rounded-xl p-6 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Current Queue Status
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 mt-1.5">No Active Token</h2>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                        You are not currently waiting in any queue. Pick a service center below to
                        generate your token.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('take-token')}
                      className="mt-5 w-full inline-flex items-center justify-between px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <span>Book a Digital Token</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>

              {/* Available Hospitals / Service Centers */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Available Hospitals &amp; Service Centers
                    </h2>
                    <p className="text-xs text-slate-500">
                      Select any center to browse its departments and live service queues
                    </p>
                  </div>
                </div>

                {filteredCenters.length === 0 ? (
                  <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
                    No service centers matched &ldquo;{searchQuery}&rdquo;.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {filteredCenters.map(({ facility, departments, queues }) => {
                      const totalWaiting = queues.reduce((s, q) => s + q.waitingCount, 0);
                      const minWait =
                        queues.length > 0
                          ? Math.min(...queues.map((q) => q.predictedWaitMins))
                          : 0;
                      return (
                        <div
                          key={facility.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-2">
                              <span className="font-mono font-semibold text-blue-600">
                                {facility.code}
                              </span>
                              <span>{facility.workingHours}</span>
                            </div>
                            <h3 className="text-base font-bold text-slate-900">{facility.name}</h3>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span>{facility.address}</span>
                            </p>

                            <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                Departments ({departments.length})
                              </div>
                              <div className="text-xs text-slate-700 line-clamp-2">
                                {departments.map((d) => d.name).join(' · ') || 'General Services'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <div className="font-mono tabular-nums text-xs text-slate-600">
                              <span className="font-semibold text-slate-900">{totalWaiting}</span>{' '}
                              waiting · from <span className="font-semibold text-blue-600">{minWait}m</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFacilityId(facility.id);
                                setSelectedDeptId('all');
                                onNavigate('take-token');
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SECTION B: TAKE TOKEN */}
          {section === 'take-token' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Digital Token Booking
                </p>
                <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Take a Token</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Choose your service center, department, service queue, and preferred check-in channel.
                </p>
              </div>

              {activeToken && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">
                        You already have an active token ({activeToken.tokenId}).
                      </span>{' '}
                      Duplicate active tokens are restricted while your current token is open.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('my-queue')}
                    className="px-3.5 py-2 bg-amber-900 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Go to My Queue
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-start">
                {/* Step 1-3: Facility, Department, Service */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div>
                    <label
                      htmlFor="citizen-facility-select"
                      className="block text-xs font-semibold text-slate-700 mb-2"
                    >
                      1. Select Hospital / Service Center
                    </label>
                    <select
                      id="citizen-facility-select"
                      value={selectedFacilityId}
                      onChange={(e) => {
                        setSelectedFacilityId(e.target.value);
                        setSelectedDeptId('all');
                      }}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    >
                      {centers.map((c) => (
                        <option key={c.facility.id} value={c.facility.id}>
                          {c.facility.name} — {c.facility.city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      2. Select Department
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDeptId('all')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          selectedDeptId === 'all'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        All Departments
                      </button>
                      {facilityDepts.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDeptId(d.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                            selectedDeptId === d.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      3. Select Service Queue
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filteredQueuesForBooking.map((q) => {
                        const isSelected = chosenQueue?.id === q.id;
                        return (
                          <button
                            key={q.id}
                            type="button"
                            disabled={q.isPaused}
                            onClick={() => setSelectedQueueId(q.id)}
                            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/60'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <span className="font-mono font-semibold text-blue-700">
                                {q.prefix}-SERIES
                              </span>
                              <span>{q.isPaused ? 'Paused' : q.fee}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-900 mt-1">{q.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {q.departmentName} · {q.location}
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between font-mono tabular-nums text-xs">
                              <span>
                                Waiting: <strong className="text-slate-900">{q.waitingCount}</strong>
                              </span>
                              <span>
                                Est: <strong className="text-blue-700">~{q.predictedWaitMins}m</strong>
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Step 4: Counters Preview + Channel + Confirm */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      Booking Summary
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-1">
                      {chosenQueue ? chosenQueue.name : 'Select a Service'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {currentCenter?.facility.name} · {chosenQueue?.location}
                    </p>
                  </div>

                  {/* Available Counters */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Available Counters ({availableCountersForChosenQueue.length})
                    </div>
                    {availableCountersForChosenQueue.length === 0 ? (
                      <p className="text-xs text-amber-700">
                        No counters currently open—token will queue for next available desk.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {availableCountersForChosenQueue.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span className="font-medium">
                              {c.label} · {c.staffName}
                            </span>
                            <span className="font-mono text-emerald-700 font-semibold">
                              {c.status} ({c.currentToken})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Channel Selection */}
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Preferred Notification Channel
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['App QR', 'SMS', 'Missed Call', 'Audio Kiosk'] as EntryChannel[]).map(
                        (ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => setSelectedChannel(ch)}
                            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                              selectedChannel === ch
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {ch}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={issuing || !chosenQueue || Boolean(activeToken)}
                    onClick={handleIssueToken}
                    className="w-full py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {issuing
                      ? 'Generating Token...'
                      : activeToken
                        ? 'Active Token Already Exists'
                        : 'Generate Digital Token'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION C: MY QUEUE */}
          {section === 'my-queue' && (
            <div className="space-y-6">
              {!activeToken ? (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-3">
                  <Ticket className="w-8 h-8 text-blue-600 mx-auto" />
                  <h2 className="text-xl font-bold text-slate-900">No Active Queue Token</h2>
                  <p className="text-sm text-slate-600">
                    Book a digital token to see live serving updates, people ahead, assigned
                    counter, and estimated wait time.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('take-token')}
                    className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Take a Token
                  </button>
                </div>
              ) : (
                <>
                  {/* Status Banner */}
                  {(activeToken.status === 'Called' ||
                    activeToken.status === 'Serving' ||
                    activeToken.status === 'Grace') && (
                    <div
                      role="status"
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        activeToken.status === 'Grace'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-bold">
                            {activeToken.status === 'Grace'
                              ? '5-Minute Grace Slot Active — Check In Now'
                              : activeToken.status === 'Serving'
                                ? `Now Serving Token ${activeToken.tokenId}`
                                : `Your Token ${activeToken.tokenId} Has Been Called!`}
                          </div>
                          <p className="text-xs opacity-85 mt-0.5">
                            Please proceed to {activeToken.counterLabel || 'your assigned counter'} ({activeToken.queueName}).
                          </p>
                        </div>
                      </div>
                      {activeToken.status === 'Grace' ? (
                        <button
                          type="button"
                          onClick={handleClaimGrace}
                          className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          Check In Now
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={speakStatus}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>Voice Alert</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
                    {/* Left: Ticket Card + Progress + Cancel */}
                    <div className="space-y-4">
                      <section className="bg-slate-900 text-white rounded-xl p-6">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="text-xs font-semibold text-blue-300">
                              {activeToken.queueName}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {activeToken.counterLabel || 'Counter Assigned'} · {activeToken.channel}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={speakStatus}
                            aria-label="Read token status aloud"
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-4 py-5 border-y border-white/15">
                          <div>
                            <div className="text-xs text-slate-400">Your Token Number</div>
                            <div className="font-mono tabular-nums text-5xl font-bold mt-1">
                              {activeToken.tokenId}
                            </div>
                            <div className="text-xs text-emerald-300 font-semibold mt-2">
                              Status: {activeToken.status}
                            </div>
                          </div>
                          <div className="p-2 bg-white rounded-lg shrink-0">
                            <QrTicketSvg
                              value={`${activeToken.facilityId}:${activeToken.tokenId}:${user.name}`}
                              size={84}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 pt-4 font-mono tabular-nums">
                          <div>
                            <div className="text-[11px] text-slate-400">Serving</div>
                            <div className="text-base font-bold text-blue-300 mt-0.5">
                              {snapshot?.queues.find((q) => q.id === activeToken.queueId)
                                ? `${snapshot.queues.find((q) => q.id === activeToken.queueId)!.prefix}-${
                                    snapshot.queues.find((q) => q.id === activeToken.queueId)!
                                      .servingNumber
                                  }`
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-400">Ahead</div>
                            <div className="text-base font-bold mt-0.5">{activeToken.aheadCount}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-slate-400">Est. Wait</div>
                            <div className="text-base font-bold mt-0.5">
                              {activeToken.etaMinutes} min
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Queue Progress */}
                      <section className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="font-semibold text-slate-900">Queue Progress</span>
                          <span className="font-mono tabular-nums font-semibold text-blue-600">
                            {activeToken.aheadCount === 0
                              ? 'Your Turn'
                              : `${activeToken.aheadCount} ahead`}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-300"
                            style={{
                              width: `${
                                activeToken.aheadCount === 0
                                  ? 100
                                  : Math.max(15, 100 - activeToken.aheadCount * 12)
                              }%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                          <span>Joined at {activeToken.joinedAt}</span>
                          <span>Counter: {activeToken.counterLabel || 'Auto-assigned'}</span>
                        </div>
                      </section>

                      {/* Peer Token Swap (if available) */}
                      {snapshot && snapshot.openSwaps.some((s) => s.queueId === activeToken.queueId) && (
                        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                              <span>Peer Token Swap Available</span>
                            </span>
                            <span className="font-mono text-xs font-semibold text-blue-600">
                              +20 Trust Pts
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Another visitor offered to swap positions in this queue. Accepting moves
                            you closer to the counter.
                          </p>
                          <button
                            type="button"
                            onClick={handleAcceptSwap}
                            className="w-full py-2 bg-slate-900 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            Accept Peer Swap
                          </button>
                        </section>
                      )}

                      <button
                        type="button"
                        onClick={handleCancelActiveToken}
                        disabled={!['Waiting', 'Called', 'Grace'].includes(activeToken.status)}
                        className="w-full py-2.5 min-h-[42px] inline-flex items-center justify-center gap-2 text-xs font-semibold text-red-700 hover:bg-red-50 bg-white border border-red-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancel My Token</span>
                      </button>
                    </div>

                    {/* Right: Free-Time Planner */}
                    <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-slate-200">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                            Wait Anywhere
                          </p>
                          <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                            Free-Time Planner
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            Use your waiting window comfortably nearby while live turn alerts stay active.
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-semibold text-blue-700">
                          {Math.max(0, activeToken.etaMinutes - 3)} MIN SAFE WINDOW
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {FREE_TIME_ACTIVITIES.map((act) => {
                          const fits = act.durationMinutes <= Math.max(0, activeToken.etaMinutes - 3);
                          const chosen = selectedActivityId === act.id;
                          return (
                            <button
                              key={act.id}
                              type="button"
                              onClick={() =>
                                setSelectedActivityId((prev) => (prev === act.id ? null : act.id))
                              }
                              className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                                chosen
                                  ? 'border-blue-600 bg-blue-50/50'
                                  : fits
                                    ? 'border-slate-200 bg-white hover:border-slate-300'
                                    : 'border-slate-200 bg-slate-50 opacity-65'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {act.title}
                                </span>
                                <span className="font-mono tabular-nums text-xs font-semibold text-blue-700 shrink-0">
                                  {act.durationMinutes}m
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{act.venue}</p>
                              <div className="flex items-center justify-between text-xs mt-3 pt-2.5 border-t border-slate-100">
                                <span className="text-slate-500">{act.distance}</span>
                                <span className={fits ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                  {chosen ? 'Selected' : fits ? 'Fits Window' : 'Tight Time'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION D: NOTIFICATIONS */}
          {section === 'notifications' && (
            <NotificationsView
              scopeLabel="Citizen Alerts"
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
              primaryCtaLabel="Take a Token"
              onPrimaryCta={() => onNavigate('take-token')}
            />
          )}

          {/* SECTION E: MY HISTORY */}
          {section === 'history' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    Visit Ledger
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">My Token History</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Previous tokens, visited hospitals/service centers, departments, and timestamps.
                  </p>
                </div>

                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  {(['all', 'Completed', 'Cancelled'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setHistoryFilter(tab)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        historyFilter === tab
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab === 'all' ? 'All Visits' : tab}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="p-10 bg-white border border-slate-200 rounded-xl text-center space-y-3">
                  <Building2 className="w-7 h-7 text-blue-600 mx-auto" />
                  <div className="text-lg font-semibold text-slate-900">No visit history yet</div>
                  <p className="text-xs text-slate-500">
                    Your completed and cancelled tokens will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Token</th>
                          <th className="py-3 px-4">Service Center</th>
                          <th className="py-3 px-4">Department &amp; Service</th>
                          <th className="py-3 px-4">Booked</th>
                          <th className="py-3 px-4">Completed / Closed</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredHistory.map((item) => (
                          <tr key={`${item.tokenId}-${item.createdAtMs}`} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900">
                              {item.tokenId}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{item.facilityName}</div>
                              <div className="text-slate-500">{item.facilityCity}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{item.queueName}</div>
                              <div className="text-slate-500">{item.departmentName}</div>
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                              {item.joinedAt}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                              {item.completedAt || item.cancelledAt || '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className={statusBadgeStyle(item.status)}>{item.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION F: MY PROFILE */}
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
