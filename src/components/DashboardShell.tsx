import React, { useState } from 'react';
import { Menu, X, LogOut, Bell, ChevronRight } from 'lucide-react';
import type { AuthUser } from '../services/api';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface DashboardShellProps {
  roleLabel: string;
  roleSubtitle: string;
  user: AuthUser;
  navItems: SidebarNavItem[];
  activeNavId: string;
  onSelectNav: (id: string) => void;
  onLogout: () => void;
  unreadNotifications: number;
  onOpenNotifications: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  roleLabel,
  roleSubtitle,
  user,
  navItems,
  activeNavId,
  onSelectNav,
  onLogout,
  unreadNotifications,
  onOpenNotifications,
  headerAction,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = navItems.find((n) => n.id === activeNavId);

  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const handleNavClick = (id: string) => {
    onSelectNav(id);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-tight shrink-0">
              SQ
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 leading-none">SmartQueue</div>
              <div className="text-[11px] font-medium text-blue-700 mt-1">{roleLabel}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2.5 leading-snug">{roleSubtitle}</p>
      </div>

      {/* Navigation Links */}
      <nav aria-label={`${roleLabel} navigation`} className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.id === activeNavId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
                <span
                  className={`font-mono tabular-nums text-[11px] font-semibold ${
                    isActive ? 'text-blue-700' : 'text-slate-500'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User & Logout */}
      <div className="p-3 border-t border-slate-200 space-y-2">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          {user.profilePhoto ? (
            <img
              src={user.profilePhoto}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials || 'SQ'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar: Contextual Breadcrumb + Quick Actions */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
              <span className="font-semibold text-slate-500 whitespace-nowrap">SmartQueue</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-600 whitespace-nowrap hidden sm:inline">
                {roleLabel}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
              <span className="font-semibold text-slate-900 truncate">
                {activeItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label="Open notifications"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Bell className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">Alerts</span>
              {unreadNotifications > 0 && (
                <span className="font-mono tabular-nums font-semibold text-blue-600">
                  {unreadNotifications}
                </span>
              )}
            </button>
            {headerAction}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
