import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, getStoredAuthToken, type AuthUser, type UserRole } from './services/api';
import { AuthGate } from './components/AuthGate';
import { CitizenDashboard, type CitizenSection } from './components/citizen/CitizenDashboard';
import { OperatorDashboard, type OperatorSection } from './components/operator/OperatorDashboard';
import { AdminDashboard, type AdminSection } from './components/admin/AdminDashboard';

const CITIZEN_SECTIONS: CitizenSection[] = [
  'home',
  'take-token',
  'my-queue',
  'notifications',
  'history',
  'profile',
];

const OPERATOR_SECTIONS: OperatorSection[] = [
  'overview',
  'live-queue',
  'token-management',
  'counter',
  'history',
  'notifications',
  'profile',
];

const ADMIN_SECTIONS: AdminSection[] = [
  'overview',
  'users',
  'centers',
  'departments',
  'counters',
  'queues',
  'reports',
  'notifications',
  'settings',
  'profile',
];

function getDefaultSectionForRole(role: UserRole): string {
  return role === 'citizen' ? 'home' : 'overview';
}

function getPathSlugForSection(role: UserRole, section: string): string {
  if ((role === 'citizen' && section === 'home') || (role !== 'citizen' && section === 'overview')) {
    return 'dashboard';
  }
  return section;
}

function isValidSectionForRole(role: UserRole, section: string): boolean {
  if (role === 'citizen') return CITIZEN_SECTIONS.includes(section as CitizenSection);
  if (role === 'operator') return OPERATOR_SECTIONS.includes(section as OperatorSection);
  return ADMIN_SECTIONS.includes(section as AdminSection);
}

function resolveRouteForUser(
  role: UserRole,
  pathname: string
): { section: string; unauthorizedAttempt: boolean; normalizedPath: string } {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const pathRole = parts[0];
  const pathSection = parts[1];

  const isRolePath = pathRole === 'citizen' || pathRole === 'operator' || pathRole === 'admin';
  const unauthorizedAttempt = Boolean(isRolePath && pathRole !== role);

  const normalizedIncoming =
    pathSection === 'dashboard' ? getDefaultSectionForRole(role) : pathSection;

  const validSection =
    !unauthorizedAttempt &&
    pathRole === role &&
    normalizedIncoming &&
    isValidSectionForRole(role, normalizedIncoming)
      ? normalizedIncoming
      : getDefaultSectionForRole(role);

  const pathSlug = getPathSlugForSection(role, validSection);

  return {
    section: validSection,
    unauthorizedAttempt,
    normalizedPath: `/${role}/${pathSlug}`,
  };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(getStoredAuthToken()));
  const [activeSection, setActiveSection] = useState<string>('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncRouteForUser = useCallback(
    (user: AuthUser, pathname: string) => {
      const resolved = resolveRouteForUser(user.role, pathname);
      setActiveSection(resolved.section);
      if (window.location.pathname !== resolved.normalizedPath) {
        window.history.replaceState(null, '', resolved.normalizedPath);
      }
      if (resolved.unauthorizedAttempt) {
        showToast('Access restricted: redirected to your authorized role dashboard.');
      }
    },
    [showToast]
  );

  // Check session on startup
  useEffect(() => {
    let active = true;
    const token = getStoredAuthToken();
    if (!token) {
      setAuthChecking(false);
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/login');
      }
      return;
    }

    api
      .getMe()
      .then(({ user }) => {
        if (!active) return;
        setCurrentUser(user);
        syncRouteForUser(user, window.location.pathname);
      })
      .catch(() => {
        api.logout().catch(() => undefined);
        if (active && window.location.pathname !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });

    return () => {
      active = false;
    };
  }, [syncRouteForUser]);

  // Listen to browser back/forward URL navigation to enforce role route guards
  useEffect(() => {
    const onPopState = () => {
      if (!currentUser) {
        if (window.location.pathname !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
        return;
      }
      syncRouteForUser(currentUser, window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [currentUser, syncRouteForUser]);

  const navigateSection = useCallback(
    (nextSection: string) => {
      if (!currentUser) return;
      const safeSection = isValidSectionForRole(currentUser.role, nextSection)
        ? nextSection
        : getDefaultSectionForRole(currentUser.role);
      setActiveSection(safeSection);
      const nextPath = `/${currentUser.role}/${getPathSlugForSection(currentUser.role, safeSection)}`;
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
    },
    [currentUser]
  );

  const handleAuthenticated = useCallback(
    (user: AuthUser) => {
      setCurrentUser(user);
      const defaultSec = getDefaultSectionForRole(user.role);
      setActiveSection(defaultSec);
      window.history.replaceState(null, '', `/${user.role}/dashboard`);
      showToast(`Signed in as ${user.name} (${user.role})`);
    },
    [showToast]
  );

  const handleLogout = useCallback(async () => {
    await api.logout();
    setCurrentUser(null);
    setActiveSection('home');
    window.history.replaceState(null, '', '/login');
    showToast('Signed out cleanly');
  }, [showToast]);

  const toastBanner = toastMessage ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-5 right-5 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 flex items-center gap-3 text-xs font-medium"
    >
      <Bell className="w-4 h-4 text-blue-400 shrink-0" />
      <span>{toastMessage}</span>
    </div>
  ) : null;

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm mx-auto">
            SQ
          </div>
          <div className="text-lg font-bold">SmartQueue</div>
          <div className="text-xs font-medium text-slate-500">Verifying session...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        {toastBanner}
        <AuthGate onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  // Strictly render ONLY the dashboard matching the authenticated user's role
  if (currentUser.role === 'citizen') {
    const citizenSec: CitizenSection = CITIZEN_SECTIONS.includes(activeSection as CitizenSection)
      ? (activeSection as CitizenSection)
      : 'home';
    return (
      <>
        {toastBanner}
        <CitizenDashboard
          user={currentUser}
          section={citizenSec}
          onNavigate={navigateSection}
          onUserUpdated={setCurrentUser}
          onLogout={handleLogout}
          onToast={showToast}
        />
      </>
    );
  }

  if (currentUser.role === 'operator') {
    const operatorSec: OperatorSection = OPERATOR_SECTIONS.includes(activeSection as OperatorSection)
      ? (activeSection as OperatorSection)
      : 'overview';
    return (
      <>
        {toastBanner}
        <OperatorDashboard
          user={currentUser}
          section={operatorSec}
          onNavigate={navigateSection}
          onUserUpdated={setCurrentUser}
          onLogout={handleLogout}
          onToast={showToast}
        />
      </>
    );
  }

  const adminSec: AdminSection = ADMIN_SECTIONS.includes(activeSection as AdminSection)
    ? (activeSection as AdminSection)
    : 'overview';

  return (
    <>
      {toastBanner}
      <AdminDashboard
        user={currentUser}
        section={adminSec}
        onNavigate={navigateSection}
        onUserUpdated={setCurrentUser}
        onLogout={handleLogout}
        onToast={showToast}
      />
    </>
  );
}
