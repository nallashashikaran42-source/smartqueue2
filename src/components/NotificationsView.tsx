import React, { useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import type { NotificationItem } from '../services/api';

interface NotificationsViewProps {
  scopeLabel: string;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  primaryCtaLabel?: string;
  onPrimaryCta?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  scopeLabel,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  primaryCtaLabel,
  onPrimaryCta,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const visibleList =
    filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleMarkSingle = async (id: string) => {
    setBusyId(id);
    try {
      await onMarkRead(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            {scopeLabel}
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-600 mt-1">
            Real-time queue status updates, turn alerts, and account notifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <button
            type="button"
            disabled={unreadCount === 0 || markingAll}
            onClick={handleMarkAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[38px] text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{markingAll ? 'Updating...' : 'Mark All Read'}</span>
          </button>
        </div>
      </div>

      {visibleList.length === 0 ? (
        <div className="p-10 bg-white border border-slate-200 rounded-xl text-center space-y-3">
          <Bell className="w-6 h-6 text-blue-600 mx-auto" />
          <div className="text-lg font-semibold text-slate-900">
            {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {filter === 'unread'
              ? 'Every queue alert and system notice has been read.'
              : 'Live turn alerts and token confirmations will appear here automatically.'}
          </p>
          {primaryCtaLabel && onPrimaryCta && (
            <div>
              <button
                type="button"
                onClick={onPrimaryCta}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                {primaryCtaLabel}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleList.map((item) => (
            <article
              key={item.id}
              className={`p-5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                item.isRead
                  ? 'bg-white border-slate-200'
                  : 'bg-blue-50/50 border-blue-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`font-semibold capitalize ${
                      item.isRead ? 'text-slate-500' : 'text-blue-700'
                    }`}
                  >
                    {item.category}
                  </span>
                  {item.tokenId && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono font-semibold text-slate-700">
                        Token {item.tokenId}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(item.createdAt)}</span>
                  {!item.isRead && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-blue-700">Unread</span>
                    </>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
              </div>

              {!item.isRead && (
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => handleMarkSingle(item.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-semibold bg-white hover:bg-slate-900 hover:text-white text-slate-800 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{busyId === item.id ? 'Saving...' : 'Mark Read'}</span>
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
