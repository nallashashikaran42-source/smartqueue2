import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  Headset,
  Building2,
  ArrowRight,
  Clock,
  QrCode,
  BellRing,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Loader2,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { api, ApiError, type AuthUser, type UserRole } from '../services/api';

interface AuthGateProps {
  onAuthenticated: (user: AuthUser) => void;
}

type CitizenAuthMode = 'login' | 'signup' | 'forgot';
type StaffAuthMode = 'login' | 'forgot';

const ROLE_META: Record<
  UserRole,
  {
    title: string;
    shortLabel: string;
    subtitle: string;
    identifierLabel: string;
    identifierPlaceholder: string;
    submitLabel: string;
    badgeText: string;
  }
> = {
  citizen: {
    title: 'Citizen / Patient Login',
    shortLabel: 'Citizen / Patient',
    subtitle: 'Access hospital and civic service queues, book digital tokens, and track live turns.',
    identifierLabel: 'Email Address',
    identifierPlaceholder: 'you@example.com',
    submitLabel: 'Sign In',
    badgeText: 'Public Citizen Portal',
  },
  operator: {
    title: 'Token Operator Login',
    shortLabel: 'Token Operator',
    subtitle: 'Manage your assigned service counter, call next tokens, and update queue status.',
    identifierLabel: 'Operator Email or Assigned ID',
    identifierPlaceholder: 'operator@organisation.org or usr-id',
    submitLabel: 'Operator Sign In',
    badgeText: 'Authorized Counter Staff',
  },
  admin: {
    title: 'Administrator Login',
    shortLabel: 'Administrator',
    subtitle: 'Govern service centers, departments, staff accounts, queue rules, and analytics.',
    identifierLabel: 'Administrator Email',
    identifierPlaceholder: 'admin@organisation.org',
    submitLabel: 'Admin Sign In',
    badgeText: 'Secure Governance Console',
  },
};

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('citizen');
  const [citizenMode, setCitizenMode] = useState<CitizenAuthMode>('login');
  const [staffMode, setStaffMode] = useState<StaffAuthMode>('login');

  const [name, setName] = useState('');
  const [emailOrId, setEmailOrId] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedRole, setSuggestedRole] = useState<UserRole | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const activeMode = selectedRole === 'citizen' ? citizenMode : staffMode;
  const meta = ROLE_META[selectedRole];

  const resetMessages = () => {
    setError(null);
    setSuggestedRole(null);
    setInfoMessage(null);
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setCitizenMode('login');
    setStaffMode('login');
    setShowPassword(false);
    resetMessages();
  };

  const handleSwitchToSuggestedRole = () => {
    if (!suggestedRole) return;
    setSelectedRole(suggestedRole);
    setCitizenMode('login');
    setStaffMode('login');
    setSuggestedRole(null);
    setError(null);
    setInfoMessage(
      `Switched to ${ROLE_META[suggestedRole].shortLabel}. Click ${ROLE_META[suggestedRole].submitLabel} to continue.`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (activeMode === 'forgot') {
      if (!emailOrId.trim()) {
        setError('Please enter your email address.');
        return;
      }
      setLoading(true);
      try {
        const res = await api.forgotPassword({
          email: emailOrId.trim(),
          role: selectedRole,
        });
        setInfoMessage(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to process password request.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selectedRole === 'citizen' && citizenMode === 'signup') {
      if (!name.trim()) {
        setError('Full name is required to create a citizen account.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      setLoading(true);
      try {
        const res = await api.register({
          name: name.trim(),
          email: emailOrId.trim(),
          password,
          phone: phone.trim() || undefined,
        });
        onAuthenticated(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Citizen registration failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!emailOrId.trim() || !password) {
      setError('Please enter both your login credentials and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({
        identifier: emailOrId.trim(),
        password,
        expectedRole: selectedRole,
      });
      onAuthenticated(res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.suggestedRole) {
          setSuggestedRole(err.suggestedRole);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              SQ
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">SmartQueue</span>
          </div>
          <span className="text-xs font-medium text-slate-500">
            Role-Based Digital Queue Platform
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-5 sm:px-10 py-8 lg:py-12 grid grid-cols-1 lg:grid-cols-[1.05fr_490px] gap-10 lg:gap-12 items-center">
        {/* Left: Role Architecture Overview */}
        <section className="space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
              Citizen · Token Operator · Administrator
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 leading-[1.08] tracking-tight">
              Secure Role-Based Queue Access
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-4 max-w-xl leading-relaxed">
              Choose your role portal to sign in. Every session is verified against the database to
              issue scoped JWT credentials and route you directly to your dedicated workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`p-5 bg-white border rounded-xl transition-colors ${
                selectedRole === 'citizen' ? 'border-blue-600' : 'border-slate-200'
              }`}
            >
              <QrCode className="w-5 h-5 text-blue-600 mb-3" />
              <div className="text-sm font-semibold text-slate-900">Citizen / Patient</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Public registration available. Book virtual tokens, track wait ETAs, and manage
                visit history.
              </p>
            </div>
            <div
              className={`p-5 bg-white border rounded-xl transition-colors ${
                selectedRole === 'operator' ? 'border-blue-600' : 'border-slate-200'
              }`}
            >
              <Clock className="w-5 h-5 text-blue-600 mb-3" />
              <div className="text-sm font-semibold text-slate-900">Token Operator</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Administrator-authorized staff. Call next, recall, serve, and manage assigned
                service counters.
              </p>
            </div>
            <div
              className={`p-5 bg-white border rounded-xl transition-colors ${
                selectedRole === 'admin' ? 'border-blue-600' : 'border-slate-200'
              }`}
            >
              <BellRing className="w-5 h-5 text-blue-600 mb-3" />
              <div className="text-sm font-semibold text-slate-900">Administrator</div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Securely provisioned governance for centers, departments, operators, analytics, and
                audit logs.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-500">
            <span className="text-blue-700 font-semibold">1. Select Role Portal</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span>2. Verify DB Account &amp; Role</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span>3. Issue JWT Tokens</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span>4. Route to Role Dashboard</span>
          </div>
        </section>

        {/* Right: Multi-Role Authentication Card */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          {/* Selectable Role Tabs */}
          <div
            role="tablist"
            aria-label="Select login role"
            className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'citizen'}
              onClick={() => handleSelectRole('citizen')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedRole === 'citizen'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Citizen</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'operator'}
              onClick={() => handleSelectRole('operator')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedRole === 'operator'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Headset className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Operator</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'admin'}
              onClick={() => handleSelectRole('admin')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedRole === 'admin'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Admin</span>
            </button>
          </div>

          {/* Role Header */}
          <div className="pb-4 mb-5 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  {activeMode === 'signup'
                    ? 'Register as Citizen'
                    : activeMode === 'forgot'
                      ? 'Password Assistance'
                      : meta.title}
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-blue-700">{meta.badgeText}</span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{meta.subtitle}</p>
          </div>

          {/* Citizen Sign In / Register Switch */}
          {selectedRole === 'citizen' && citizenMode !== 'forgot' && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
              <button
                type="button"
                onClick={() => {
                  setCitizenMode('login');
                  resetMessages();
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  citizenMode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setCitizenMode('signup');
                  resetMessages();
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  citizenMode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register as Citizen
              </button>
            </div>
          )}

          {/* Error & Info Banners */}
          {error && (
            <div
              role="alert"
              className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 space-y-2"
            >
              <div>{error}</div>
              {suggestedRole && (
                <button
                  type="button"
                  onClick={handleSwitchToSuggestedRole}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-100 text-red-900 border border-red-300 rounded-md text-[11px] font-semibold cursor-pointer"
                >
                  <span>Switch to {ROLE_META[suggestedRole].shortLabel} Login</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="mb-4 p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-900 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {selectedRole === 'citizen' && citizenMode === 'signup' && (
              <>
                <div>
                  <label
                    htmlFor="authgate-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Full Name
                  </label>
                  <input
                    id="authgate-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
                <div>
                  <label
                    htmlFor="authgate-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Mobile Number (Optional)
                  </label>
                  <input
                    id="authgate-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98480 12345"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="authgate-identifier"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                {activeMode === 'forgot' ? 'Registered Email Address' : meta.identifierLabel}
              </label>
              <input
                id="authgate-identifier"
                type={selectedRole === 'operator' && activeMode === 'login' ? 'text' : 'email'}
                required
                autoComplete="username"
                value={emailOrId}
                onChange={(e) => setEmailOrId(e.target.value)}
                placeholder={meta.identifierPlaceholder}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>

            {activeMode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="authgate-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  {activeMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        if (selectedRole === 'citizen') {
                          setCitizenMode('forgot');
                        } else {
                          setStaffMode('forgot');
                        }
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="authgate-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={
                      activeMode === 'signup' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full pl-3.5 pr-11 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {loading
                  ? 'Verifying...'
                  : activeMode === 'forgot'
                    ? 'Request Password Assistance'
                    : activeMode === 'signup'
                      ? 'Create Citizen Account'
                      : meta.submitLabel}
              </span>
            </button>

            {activeMode === 'forgot' && (
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  if (selectedRole === 'citizen') {
                    setCitizenMode('login');
                  } else {
                    setStaffMode('login');
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to {meta.shortLabel} Sign In</span>
              </button>
            )}
          </form>

          {/* Role-Appropriate Provisioning Notice */}
          <div className="mt-6 pt-4 border-t border-slate-200 flex items-start gap-2.5 text-xs text-slate-500">
            {selectedRole === 'citizen' ? (
              <>
                <KeyRound className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Only Citizen / Patient accounts can register publicly. Signed-in users are
                  automatically routed to <span className="font-mono text-slate-700">/citizen/dashboard</span>.
                </span>
              </>
            ) : selectedRole === 'operator' ? (
              <>
                <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Token Operator accounts are created and assigned to centers, departments, and
                  counters exclusively by an authorized Administrator.
                </span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Administrator accounts are securely provisioned. Public registration is disabled
                  for administrative access.
                </span>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
