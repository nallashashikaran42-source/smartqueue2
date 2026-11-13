import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ListOrdered,
  Play,
  Sliders,
  History,
  Bell,
  User,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  UserX,
  PauseCircle,
  PlayCircle,
  Search,
  Volume2,
  Clock,
} from 'lucide-react';
import {
  api,
  type AuthUser,
  type NotificationItem,
  type OperatorLiveQueueItem,
  type OperatorWorkspaceResponse,
  type TokenStatus,
} from '../../services/api';
import { useQueueSocket, type QueueWsMessage } from '../../hooks/useQueueSocket';
import { DashboardShell, type SidebarNavItem } from '../DashboardShell';
import { NotificationsView } from '../NotificationsView';
import { ProfileView } from '../ProfileView';

export type OperatorSection =
  | 'overview'
  | 'live-queue'
  | 'token-management'
  | 'counter'
  | 'history'
  | 'notifications'
  | 'profile';

interface OperatorDashboardProps {
  user: AuthUser;
  section: OperatorSection;
  onNavigate: (section: OperatorSection) => void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => Promise<void>;
  onToast: (msg: string) => void;
}

const STATUS_STYLE: Record<TokenStatus, string> = {
  Waiting: 'text-slate-700 bg-slate-100',
  Called: 'text-blue-700 bg-blue-50',
  Serving: 'text-emerald-700 bg-emerald-50',
  Grace: 'text-amber-700 bg-amber-50',
  Completed: 'text-emerald-800 bg-emerald-50',
  Cancelled: 'text-slate-500 bg-slate-100',
  Skipped: 'text-amber-800 bg-amber-50',
  NoShow: 'text-red-700 bg-red-50',
};

export const OperatorDashboard: React.FC<OperatorDashboardProps> = ({
  user,
  section,
  onNavigate,
  onUserUpdated,
  onLogout,
  onToast,
}) => {
  const [workspace, setWorkspace] = useState<OperatorWorkspaceResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'Waiting' | 'Called' | 'Serving' | 'Grace'>('all');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'Completed' | 'Skipped' | 'NoShow' | 'Cancelled'>('all');

  const facilityId = workspace?.facility.id || user.assignedFacilityId || 'vja-hospital';

  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await api.getOperatorWorkspace();
      setWorkspace(ws);
      const notifRes = await api.getNotifications(ws.facility.id);
      setNotifications(notifRes.notifications);
      setUnreadCount(notifRes.unreadCount);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load operator workspace.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleWsEvent = useCallback(
    (msg: QueueWsMessage) => {
      if (msg.facilityId !== facilityId && msg.facilityId !== 'all') return;

      if (msg.event === 'notification:new') {
        const payload = msg.payload as { notification?: NotificationItem } | undefined;
        const incoming = payload?.notification;
        if (incoming && (!incoming.userId || incoming.userId === user.id)) {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === incoming.id)) return prev;
            return [incoming, ...prev].slice(0, 60);
          });
          setUnreadCount((prev) => prev + 1);
        }
        return;
      }

      loadWorkspace();
    },
    [facilityId, user.id, loadWorkspace]
  );

  useQueueSocket(facilityId, handleWsEvent);

  const counter = workspace?.counter || null;
  const queue = workspace?.queue || null;

  const activeCurrentToken: OperatorLiveQueueItem | null = useMemo(() => {
    if (!workspace) return null;
    if (counter?.currentToken && counter.currentToken !== '—') {
      const match = workspace.liveQueue.find((t) => t.tokenId === counter.currentToken);
      if (match) return match;
    }
    return (
      workspace.liveQueue.find((t) => t.status === 'Serving') ||
      workspace.liveQueue.find((t) => t.status === 'Called') ||
      workspace.liveQueue.find((t) => t.status === 'Grace') ||
      null
    );
  }, [workspace, counter]);

  const speakCallout = (tokenId: string, label: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `Attention. Token ${tokenId}, please proceed to ${label}.`
      );
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore speech synthesis errors
    }
  };

  const handleCallNext = async () => {
    if (!counter) {
      onToast('No counter assigned to your account.');
      return;
    }
    setBusyAction('call-next');
    try {
      const res = await api.operatorCallNext(counter.id);
      await loadWorkspace();
      onToast(`Called token ${res.calledTokenId} at ${counter.label}`);
      speakCallout(res.calledTokenId, counter.label);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to call next token.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTokenAction = async (
    tokenId: string,
    action: 'recall' | 'serve' | 'complete' | 'skip' | 'no-show'
  ) => {
    if (!counter) return;
    setBusyAction(`${action}:${tokenId}`);
    try {
      await api.operatorTokenAction(counter.id, tokenId, action);
      await loadWorkspace();
      const labelMap = {
        recall: `Recalled token ${tokenId}`,
        serve: `Started serving ${tokenId}`,
        complete: `Completed token ${tokenId}`,
        skip: `Skipped token ${tokenId}`,
        'no-show': `Marked ${tokenId} as No Show`,
      };
      onToast(labelMap[action]);
      if (action === 'recall') {
        speakCallout(tokenId, counter.label);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : `Action '${action}' failed.`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCounterStatus = async (status: 'Serving' | 'Busy' | 'Paused' | 'Closed') => {
    if (!counter) return;
    setBusyAction(`status:${status}`);
    try {
      await api.operatorSetCounterStatus(counter.id, status);
      await loadWorkspace();
      onToast(`${counter.label} status updated to ${status}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update counter status.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleQueuePause = async () => {
    if (!queue) return;
    setBusyAction('pause-queue');
    try {
      const nextPaused = !queue.isPaused;
      await api.operatorPauseQueue(queue.id, nextPaused);
      await loadWorkspace();
      onToast(nextPaused ? `${queue.name} paused` : `${queue.name} resumed`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to toggle queue pause state.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllNotificationsRead = async () => {
    await api.markAllNotificationsRead(facilityId);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    onToast('All notifications marked read');
  };

  const filteredLiveQueue = useMemo(() => {
    const items = workspace?.liveQueue || [];
    const q = queueSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (queueFilter !== 'all' && item.status !== queueFilter) return false;
      if (!q) return true;
      return (
        item.tokenId.toLowerCase().includes(q) ||
        item.citizenLabel.toLowerCase().includes(q) ||
        item.queueName.toLowerCase().includes(q)
      );
    });
  }, [workspace, queueSearch, queueFilter]);

  const filteredHistory = useMemo(() => {
    const items = workspace?.history || [];
    if (historyFilter === 'all') return items;
    return items.filter((item) => item.status === historyFilter);
  }, [workspace, historyFilter]);

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'live-queue',
      label: 'Live Queue',
      icon: <ListOrdered className="w-4 h-4" />,
      badge: workspace?.metrics.waitingTokens || undefined,
    },
    { id: 'token-management', label: 'Token Desk', icon: <Play className="w-4 h-4" /> },
    { id: 'counter', label: 'Counter Control', icon: <Sliders className="w-4 h-4" /> },
    { id: 'history', label: 'Service History', icon: <History className="w-4 h-4" /> },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: unreadCount || undefined,
    },
    { id: 'profile', label: 'My Profile', icon: <User className="w-4 h-4" /> },
  ];

  const renderTokenActionButtons = (item: OperatorLiveQueueItem, compact = false) => {
    const canRecall = ['Called', 'Grace', 'Serving'].includes(item.status);
    const canServe = ['Waiting', 'Called', 'Grace'].includes(item.status);
    const canComplete = ['Called', 'Serving', 'Grace'].includes(item.status);
    const canSkip = ['Waiting', 'Called', 'Grace'].includes(item.status);
    const canNoShow = ['Waiting', 'Called', 'Grace'].includes(item.status);
    const btnPad = compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs';

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!canRecall || busyAction !== null}
          onClick={() => handleTokenAction(item.tokenId, 'recall')}
          className={`inline-flex items-center gap-1 ${btnPad} font-semibold rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 cursor-pointer`}
        >
          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
          <span>Recall</span>
        </button>
        <button
          type="button"
          disabled={!canServe || busyAction !== null}
          onClick={() => handleTokenAction(item.tokenId, 'serve')}
          className={`inline-flex items-center gap-1 ${btnPad} font-semibold rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white cursor-pointer`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Start Serving</span>
        </button>
        <button
          type="button"
          disabled={!canComplete || busyAction !== null}
          onClick={() => handleTokenAction(item.tokenId, 'complete')}
          className={`inline-flex items-center gap-1 ${btnPad} font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white cursor-pointer`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Complete</span>
        </button>
        <button
          type="button"
          disabled={!canSkip || busyAction !== null}
          onClick={() => handleTokenAction(item.tokenId, 'skip')}
          className={`inline-flex items-center gap-1 ${btnPad} font-semibold rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed text-amber-800 cursor-pointer`}
        >
          <SkipForward className="w-3.5 h-3.5" />
          <span>Skip</span>
        </button>
        <button
          type="button"
          disabled={!canNoShow || busyAction !== null}
          onClick={() => handleTokenAction(item.tokenId, 'no-show')}
          className={`inline-flex items-center gap-1 ${btnPad} font-semibold rounded-md border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed text-red-700 cursor-pointer`}
        >
          <UserX className="w-3.5 h-3.5" />
          <span>No Show</span>
        </button>
      </div>
    );
  };

  const headerAction = counter ? (
    <button
      type="button"
      disabled={busyAction !== null || counter.status === 'Closed' || counter.status === 'Paused' || queue?.isPaused}
      onClick={handleCallNext}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
    >
      <SkipForward className="w-3.5 h-3.5" />
      <span>{busyAction === 'call-next' ? 'Calling...' : 'Call Next Token'}</span>
    </button>
  ) : undefined;

  return (
    <DashboardShell
      roleLabel="Token Operator"
      roleSubtitle={
        workspace
          ? `${workspace.facility.name} · ${counter?.label || 'Assigned Desk'}`
          : 'Counter Operations Desk'
      }
      user={user}
      navItems={navItems}
      activeNavId={section}
      onSelectNav={(id) => onNavigate(id as OperatorSection)}
      onLogout={onLogout}
      unreadNotifications={unreadCount}
      onOpenNotifications={() => onNavigate('notifications')}
      headerAction={headerAction}
    >
      {loading && !workspace ? (
        <div className="space-y-4">
          <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      ) : !workspace ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-center space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Operator Assignment Pending</h2>
          <p className="text-sm text-slate-600">
            Contact an Administrator to assign a service center, department, and counter to your account.
          </p>
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <section className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    {workspace.operator.todayDate} · {workspace.operator.shift}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">
                    Operator Desk · {workspace.operator.name}
                  </h1>
                  <p className="text-sm text-slate-600">
                    {workspace.facility.name} ({workspace.facility.city})
                    {workspace.department ? ` · ${workspace.department.name}` : ''}
                    {counter ? ` · ${counter.label}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('token-management')}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Open Token Desk
                  </button>
                  <button
                    type="button"
                    disabled={
                      !counter ||
                      busyAction !== null ||
                      counter.status === 'Closed' ||
                      counter.status === 'Paused' ||
                      queue?.isPaused
                    }
                    onClick={handleCallNext}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>Call Next Token</span>
                  </button>
                </div>
              </section>

              {/* Daily KPI Grid */}
              <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-medium text-slate-500">Total Tokens Today</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {workspace.metrics.totalTokensToday}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-medium text-slate-500">Waiting in Queue</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-blue-600 mt-1">
                    {workspace.metrics.waitingTokens}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-medium text-slate-500">Completed Today</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
                    {workspace.metrics.completedTokens}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl">
                  <div className="text-xs font-medium text-slate-500">Skipped / No-Show</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-1">
                    {workspace.metrics.skippedTokens}
                  </div>
                </div>
                <div className="p-5 bg-white border border-slate-200 rounded-xl col-span-2 lg:col-span-1">
                  <div className="text-xs font-medium text-slate-500">Avg Wait Time</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
                    {workspace.metrics.avgWaitMins} min
                  </div>
                </div>
              </section>

              {/* Current Counter & Active Token Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Active Token at Counter</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {queue?.name || 'Assigned Queue'} · {queue?.location}
                      </p>
                    </div>
                    {counter && (
                      <span className="text-xs font-semibold text-slate-700">
                        Counter Status: <span className="text-blue-700">{counter.status}</span>
                      </span>
                    )}
                  </div>

                  {activeCurrentToken ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div>
                          <div className="text-xs text-slate-500">Token Number</div>
                          <div className="font-mono tabular-nums text-3xl font-bold text-slate-900 mt-0.5">
                            {activeCurrentToken.tokenId}
                          </div>
                          <div className="text-sm font-medium text-slate-700 mt-1">
                            {activeCurrentToken.citizenLabel} · {activeCurrentToken.channel}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold ${
                              STATUS_STYLE[activeCurrentToken.status]
                            }`}
                          >
                            {activeCurrentToken.status}
                          </span>
                          <div className="text-xs text-slate-500">
                            Joined {activeCurrentToken.joinedAt}
                          </div>
                        </div>
                      </div>

                      {renderTokenActionButtons(activeCurrentToken)}
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
                      <div className="text-sm font-semibold text-slate-800">
                        No token is currently called or serving at {counter?.label || 'this counter'}.
                      </div>
                      <p className="text-xs text-slate-500">
                        {workspace.metrics.waitingTokens > 0
                          ? `${workspace.metrics.waitingTokens} citizen(s) are waiting in queue.`
                          : 'Waiting list is currently empty.'}
                      </p>
                      <button
                        type="button"
                        disabled={!counter || busyAction !== null || counter.status === 'Closed' || counter.status === 'Paused'}
                        onClick={handleCallNext}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>Call Next Token</span>
                      </button>
                    </div>
                  )}
                </section>

                {/* Next Waiting Preview */}
                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Next in Queue</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Privacy-safe minimal passenger roster
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('live-queue')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      View Full Queue
                    </button>
                  </div>

                  {workspace.liveQueue.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No active tokens waiting in this queue.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {workspace.liveQueue.slice(0, 5).map((item) => (
                        <div key={item.tokenId} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                                {item.tokenId}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  STATUS_STYLE[item.status]
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 truncate mt-0.5">
                              {item.citizenLabel} · Joined {item.joinedAt}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums text-xs text-slate-500 shrink-0">
                            {item.waitMinsSoFar}m wait
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* LIVE QUEUE */}
          {section === 'live-queue' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    {workspace.facility.name} · {queue?.name || 'Assigned Queue'}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">Live Queue Roster</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Process incoming digital and walk-in tokens in real time.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      placeholder="Search token or citizen..."
                      className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 w-56"
                    />
                  </div>
                  <select
                    aria-label="Filter queue status"
                    value={queueFilter}
                    onChange={(e) =>
                      setQueueFilter(
                        e.target.value as 'all' | 'Waiting' | 'Called' | 'Serving' | 'Grace'
                      )
                    }
                    className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">All Active ({workspace.liveQueue.length})</option>
                    <option value="Waiting">Waiting</option>
                    <option value="Called">Called</option>
                    <option value="Serving">Serving</option>
                    <option value="Grace">Grace</option>
                  </select>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Token</th>
                        <th className="py-3 px-4">Patient / Citizen</th>
                        <th className="py-3 px-4">Service</th>
                        <th className="py-3 px-4">Generated</th>
                        <th className="py-3 px-4">Wait</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredLiveQueue.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                            No tokens match the current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredLiveQueue.map((item) => (
                          <tr key={item.tokenId} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-slate-900">
                              {item.tokenId}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-900">{item.citizenLabel}</div>
                              <div className="text-[11px] text-slate-500">{item.channel}</div>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-slate-700">{item.queueName}</td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                              {item.joinedAt}
                            </td>
                            <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                              {item.waitMinsSoFar} min
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                  STATUS_STYLE[item.status]
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">{renderTokenActionButtons(item, true)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TOKEN MANAGEMENT DESK */}
          {section === 'token-management' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    {counter?.label || 'Assigned Desk'} · {queue?.name || 'Service Queue'}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">Token Management Desk</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Call, recall, start serving, complete, skip, or mark tokens as no-show.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    !counter ||
                    busyAction !== null ||
                    counter.status === 'Closed' ||
                    counter.status === 'Paused' ||
                    queue?.isPaused
                  }
                  onClick={handleCallNext}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Call Next Token</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
                <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Current Active Token
                    </span>
                    {activeCurrentToken && counter && (
                      <button
                        type="button"
                        onClick={() => speakCallout(activeCurrentToken.tokenId, counter.label)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Announce Token</span>
                      </button>
                    )}
                  </div>

                  {activeCurrentToken ? (
                    <>
                      <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-4">
                        <div>
                          <div className="font-mono tabular-nums text-4xl font-bold text-slate-900">
                            {activeCurrentToken.tokenId}
                          </div>
                          <div className="text-sm font-semibold text-slate-800 mt-1">
                            {activeCurrentToken.citizenLabel}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {activeCurrentToken.queueName} · Joined {activeCurrentToken.joinedAt}
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <span
                            className={`inline-block px-3 py-1 rounded-md text-xs font-semibold ${
                              STATUS_STYLE[activeCurrentToken.status]
                            }`}
                          >
                            {activeCurrentToken.status}
                          </span>
                          {activeCurrentToken.recallCount > 0 && (
                            <div className="text-xs text-slate-500">
                              Recalled {activeCurrentToken.recallCount}x
                            </div>
                          )}
                        </div>
                      </div>

                      {renderTokenActionButtons(activeCurrentToken)}
                    </>
                  ) : (
                    <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-3">
                      <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                      <div className="text-sm font-semibold text-slate-800">
                        Desk idle — ready for next token
                      </div>
                      <button
                        type="button"
                        disabled={!counter || busyAction !== null || counter.status === 'Closed' || counter.status === 'Paused'}
                        onClick={handleCallNext}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>Call Next Token</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Waiting Queue Stack */}
                <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900">Waiting Stack</h2>
                    <span className="font-mono tabular-nums text-xs font-semibold text-slate-500">
                      {workspace.liveQueue.filter((t) => t.status === 'Waiting').length} waiting
                    </span>
                  </div>

                  {workspace.liveQueue.filter((t) => t.status === 'Waiting').length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No waiting tokens in queue.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {workspace.liveQueue
                        .filter((t) => t.status === 'Waiting')
                        .slice(0, 6)
                        .map((item) => (
                          <div
                            key={item.tokenId}
                            className="p-3.5 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-sm text-slate-900">
                                  {item.tokenId}
                                </span>
                                <span className="text-xs text-slate-600">{item.citizenLabel}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {item.channel} · Waiting {item.waitMinsSoFar} min
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handleTokenAction(item.tokenId, 'serve')}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Serve
                              </button>
                              <button
                                type="button"
                                disabled={busyAction !== null}
                                onClick={() => handleTokenAction(item.tokenId, 'skip')}
                                className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* COUNTER MANAGEMENT */}
          {section === 'counter' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-slate-200">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Assigned Counter &amp; Queue Controls
                </p>
                <h1 className="text-2xl font-bold text-slate-900">Counter Management</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Control availability for your assigned counter and temporarily pause or resume intake.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {counter?.label || 'No Counter Assigned'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {workspace.department?.name} · {workspace.facility.name}
                      </p>
                    </div>
                    {counter && (
                      <span className="font-mono text-xs font-semibold text-blue-700">
                        {counter.status}
                      </span>
                    )}
                  </div>

                  {counter && (
                    <div className="grid grid-cols-2 gap-3">
                      {(['Serving', 'Busy', 'Paused', 'Closed'] as const).map((statusOption) => {
                        const isSelected = counter.status === statusOption;
                        return (
                          <button
                            key={statusOption}
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => handleCounterStatus(statusOption)}
                            className={`p-4 rounded-xl border text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="text-sm font-bold text-slate-900">{statusOption}</div>
                            <div className="text-xs text-slate-500 mt-1">
                              {statusOption === 'Serving' && 'Counter open and calling tokens'}
                              {statusOption === 'Busy' && 'Handling current complex case'}
                              {statusOption === 'Paused' && 'Short operator break'}
                              {statusOption === 'Closed' && 'Shift ended / closed desk'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="p-6 bg-white border border-slate-200 rounded-xl space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {queue?.name || 'Assigned Queue'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {queue?.location} · {queue?.prefix}-series
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        queue?.isPaused ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {queue?.isPaused ? 'Paused' : 'Accepting Tokens'}
                    </span>
                  </div>

                  {queue && (
                    <>
                      <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div>
                          <div className="text-xs text-slate-500">Waiting</div>
                          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                            {queue.waitingCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Est. Wait</div>
                          <div className="font-mono tabular-nums text-lg font-bold text-blue-600 mt-0.5">
                            ~{queue.predictedWaitMins}m
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Counters Open</div>
                          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                            {queue.activeCounters}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={handleToggleQueuePause}
                        className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          queue.isPaused
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}
                      >
                        {queue.isPaused ? (
                          <>
                            <PlayCircle className="w-4 h-4" />
                            <span>Resume Queue Intake</span>
                          </>
                        ) : (
                          <>
                            <PauseCircle className="w-4 h-4" />
                            <span>Pause Assigned Queue</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* SERVICE HISTORY */}
          {section === 'history' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    {queue?.name || 'Assigned Queue'}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900">Service History</h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Log of completed, skipped, no-show, and cancelled tokens for your assigned queue.
                  </p>
                </div>

                <select
                  aria-label="Filter service history"
                  value={historyFilter}
                  onChange={(e) =>
                    setHistoryFilter(
                      e.target.value as 'all' | 'Completed' | 'Skipped' | 'NoShow' | 'Cancelled'
                    )
                  }
                  className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All Records ({workspace.history.length})</option>
                  <option value="Completed">Completed</option>
                  <option value="Skipped">Skipped</option>
                  <option value="NoShow">No Show</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Token</th>
                        <th className="py-3 px-4">Citizen</th>
                        <th className="py-3 px-4">Channel</th>
                        <th className="py-3 px-4">Joined</th>
                        <th className="py-3 px-4">Completed</th>
                        <th className="py-3 px-4">Wait</th>
                        <th className="py-3 px-4">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                            No service history entries match this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredHistory.map((item) => (
                          <tr key={item.tokenId} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                              {item.tokenId}
                            </td>
                            <td className="py-3.5 px-4 text-slate-800">{item.citizenLabel}</td>
                            <td className="py-3.5 px-4 text-xs text-slate-600">{item.channel}</td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                              {item.joinedAt}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                              {item.completedAt || '—'}
                            </td>
                            <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700">
                              {item.waitMins} min
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                  STATUS_STYLE[item.status]
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section === 'notifications' && (
            <NotificationsView
              scopeLabel={workspace.facility.name}
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              primaryCtaLabel="Back to Token Desk"
              onPrimaryCta={() => onNavigate('token-management')}
            />
          )}

          {/* PROFILE */}
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
