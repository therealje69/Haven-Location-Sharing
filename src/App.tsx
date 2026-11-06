// Source: Google Maps Platform Code Assist
import React, { useEffect, useState, useCallback } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AppSyncState, ThemeMode, UserProfile, UserRole } from './lib/types.js';
import { PhoneSimulatorFrame } from './components/PhoneSimulatorFrame.js';
import { DeviceView } from './components/DeviceView.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { HavenBrandHeader, HavenLogoIcon } from './components/HavenLogo.js';
import { PWAInstallButton } from './components/PWAInstallAndUpdate.js';
import {
  Users,
  Smartphone,
  QrCode,
  Link,
  Check,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramUser = urlParams.get('user') as UserRole | null;

  const [viewMode, setViewMode] = useState<'dual' | 'partner1' | 'partner2'>(
    paramUser === 'partner1' || paramUser === 'partner2' ? paramUser : 'dual'
  );

  const [state, setState] = useState<AppSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );

  // Google Maps Platform client-side quota defense listener
  useEffect(() => {
    const onQuota = () => setShowQuotaWarning(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Theme Management: day | night | system
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('haven_theme_mode') as ThemeMode) || 'day';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'day' | 'night'>('day');

  useEffect(() => {
    const updateTheme = () => {
      if (themeMode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setResolvedTheme(prefersDark ? 'night' : 'day');
      } else {
        setResolvedTheme(themeMode);
      }
    };

    updateTheme();
    localStorage.setItem('haven_theme_mode', themeMode);

    if (themeMode === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', updateTheme);
      return () => media.removeEventListener('change', updateTheme);
    }
  }, [themeMode]);

  // Onboarding / Permissions modal role (null when closed)
  const [onboardingRole, setOnboardingRole] = useState<UserRole | null>(() => {
    if (paramUser === 'partner1' || paramUser === 'partner2') {
      const saved = localStorage.getItem(`haven_setup_completed_${paramUser}`);
      return saved ? null : paramUser;
    }
    return null;
  });

  // Fetch initial state and maps configuration together before mounting APIProvider
  const fetchState = useCallback(async () => {
    try {
      const [res, mapsRes] = await Promise.all([
        fetch('/api/state'),
        fetch('/api/maps-config').catch(() => null),
      ]);
      if (!res.ok) throw new Error('Failed to load state');
      const data: AppSyncState = await res.json();

      if (mapsRes && mapsRes.ok) {
        const mapsData = await mapsRes.json().catch(() => ({}));
        if (mapsData.apiKey) {
          setMapsApiKey(mapsData.apiKey);
        }
      }

      setState(data);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  }, []);

  // Subscribe to SSE updates
  useEffect(() => {
    fetchState();

    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const updatedState: AppSyncState = JSON.parse(event.data);
        setState(updatedState);
      } catch (err) {
        console.error('SSE JSON error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [fetchState]);

  // Actions
  const handleRequestLocation = async (requesterId: UserRole) => {
    try {
      const res = await fetch('/api/request-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId }),
      });
      if (!res.ok) {
        const errData = await res.json();
        console.warn(errData.error || 'Check-in is currently unavailable');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerEmergency = async (requesterId: UserRole) => {
    try {
      await fetch('/api/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveEmergency = async (userId: UserRole) => {
    try {
      await fetch('/api/resolve-emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Strictly isolated profile update for a single user role (partner1 or partner2)
  const handleUpdateProfile = async (userId: UserRole, update: Partial<UserProfile>) => {
    if (update.name !== undefined) {
      localStorage.setItem(`haven_user_name_${userId}`, update.name);
    }
    if (update.nicknameForPartner !== undefined) {
      localStorage.setItem(`haven_partner_nickname_${userId}`, update.nicknameForPartner);
    }
    if (update.isLoggedOut !== undefined) {
      localStorage.setItem(`haven_logged_out_${userId}`, update.isLoggedOut ? 'true' : 'false');
    }

    // Optimistic update strictly scoped to [userId]
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: {
          ...prev.profiles,
          [userId]: {
            ...prev.profiles[userId],
            ...update,
          },
        },
      };
    });

    try {
      await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...update }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetTokens = async () => {
    try {
      await fetch('/api/reset-demo', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePushAppUpdate = async () => {
    try {
      await fetch('/api/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseNotes: 'New update ready · Settings preserved' }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleOnboardingComplete = async (
    name: string,
    nicknameForPartner: string,
    criticalAlertsAllowed: boolean
  ) => {
    const role = onboardingRole || 'partner1';
    localStorage.setItem(`haven_setup_completed_${role}`, 'true');
    await handleUpdateProfile(role, {
      name,
      nicknameForPartner,
      criticalAlertsAllowed,
      hasCompletedSetup: true,
    });
    setOnboardingRole(null);
  };

  const isDay = resolvedTheme === 'day';
  const appUrl = window.location.origin;

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDay ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
        <div className="w-8 h-8 rounded-full border-3 border-blue-600 border-t-transparent animate-spin mb-3" />
        <h2 className="text-sm font-bold tracking-tight text-blue-700 dark:text-blue-400">Connecting to Haven</h2>
        <p className="text-xs text-slate-400 mt-0.5">Setting up private connection...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 text-center text-slate-700">
        <ShieldCheck className="w-10 h-10 text-blue-600 mb-3" />
        <h2 className="text-base font-bold">Connecting...</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">{error}</p>
        <button
          onClick={fetchState}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <APIProvider apiKey={mapsApiKey} solutionChannel="GMP_aistudio">
      <div
        className={`h-screen w-screen overflow-hidden flex flex-col transition-colors duration-200 select-none ${
          isDay
            ? 'bg-slate-100 text-slate-900'
            : 'bg-[#091326] text-slate-100'
        }`}
      >
        {/* Google Maps Platform Quota Notice Banner (Section 8 Case A defense) */}
        {showQuotaWarning && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs text-center sticky top-0 z-50 flex items-center justify-between">
            <span>
              Google Maps Platform quota reached. Visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-100 hover:text-white"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
            <button
              onClick={() => setShowQuotaWarning(false)}
              className="text-amber-200 hover:text-white ml-2 text-sm font-bold"
              aria-label="Dismiss quota notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* TOP COMPACT BAR */}
        <header
          className={`px-4 py-2 border-b flex items-center justify-between gap-2 flex-shrink-0 z-40 transition-colors ${
            isDay
              ? 'bg-white/90 border-slate-200'
              : 'bg-[#091326]/90 border-slate-800'
          }`}
        >
          <HavenBrandHeader />

          {/* View Mode Switcher */}
          <div
            className={`flex items-center gap-1 p-0.5 rounded-xl border text-xs font-semibold ${
              isDay ? 'bg-slate-200/60 border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              onClick={() => setViewMode('dual')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition text-[11px] ${
                viewMode === 'dual'
                  ? isDay
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span className="hidden sm:inline">Dual View</span>
            </button>

            <button
              onClick={() => setViewMode('partner1')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition text-[11px] ${
                viewMode === 'partner1'
                  ? isDay
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>{state.profiles.partner1.name}</span>
            </button>

            <button
              onClick={() => setViewMode('partner2')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition text-[11px] ${
                viewMode === 'partner2'
                  ? isDay
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>{state.profiles.partner2.name}</span>
            </button>
          </div>

          {/* Right Actions: PWA Install + Link real phone */}
          <div className="flex items-center gap-1.5">
            <PWAInstallButton isDay={isDay} />
            <button
              onClick={() => setShowPairModal(true)}
              className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition ${
                isDay
                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 text-[#2DD4BF]" />
              <span className="hidden sm:inline font-['Inter',sans-serif]">Open on Phone</span>
            </button>
          </div>
        </header>

        {/* VIEWPORT AREA: Strictly zero vertical scroll, fits completely on screen */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-2 sm:p-4">
          {viewMode === 'dual' ? (
            /* DUAL SIMULATOR: Fits comfortably in 640px height */
            <div className="w-full max-w-4xl flex items-center justify-center gap-6 sm:gap-10">
              {/* Phone 1: Jordan (partner1) */}
              <div className="flex flex-col items-center">
                <div className="mb-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  <span>{state.profiles.partner1.name}</span>
                </div>
                <PhoneSimulatorFrame profile={state.profiles.partner1} isSimulatorMode={true} theme={resolvedTheme}>
                  <DeviceView
                    key="partner1"
                    myRole="partner1"
                    state={state}
                    onRequestLocation={handleRequestLocation}
                    onTriggerEmergency={handleTriggerEmergency}
                    onResolveEmergency={handleResolveEmergency}
                    onUpdateProfile={handleUpdateProfile}
                    onResetTokens={handleResetTokens}
                    onPushAppUpdate={handlePushAppUpdate}
                    onOpenSetup={(role) => setOnboardingRole(role)}
                    theme={resolvedTheme}
                    currentThemeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                  />
                </PhoneSimulatorFrame>
              </div>

              {/* Phone 2: Taylor (partner2) */}
              <div className="flex flex-col items-center">
                <div className="mb-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  <span>{state.profiles.partner2.name}</span>
                </div>
                <PhoneSimulatorFrame profile={state.profiles.partner2} isSimulatorMode={true} theme={resolvedTheme}>
                  <DeviceView
                    key="partner2"
                    myRole="partner2"
                    state={state}
                    onRequestLocation={handleRequestLocation}
                    onTriggerEmergency={handleTriggerEmergency}
                    onResolveEmergency={handleResolveEmergency}
                    onUpdateProfile={handleUpdateProfile}
                    onResetTokens={handleResetTokens}
                    onPushAppUpdate={handlePushAppUpdate}
                    onOpenSetup={(role) => setOnboardingRole(role)}
                    theme={resolvedTheme}
                    currentThemeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                  />
                </PhoneSimulatorFrame>
              </div>
            </div>
          ) : (
            /* SINGLE PHONE VIEW: Keyed by viewMode so switching users never leaks input state */
            <div className="w-full max-w-[360px] h-[640px]">
              <PhoneSimulatorFrame profile={state.profiles[viewMode]} isSimulatorMode={true} theme={resolvedTheme}>
                <DeviceView
                  key={viewMode}
                  myRole={viewMode}
                  state={state}
                  onRequestLocation={handleRequestLocation}
                  onTriggerEmergency={handleTriggerEmergency}
                  onResolveEmergency={handleResolveEmergency}
                  onUpdateProfile={handleUpdateProfile}
                  onResetTokens={handleResetTokens}
                  onPushAppUpdate={handlePushAppUpdate}
                  onOpenSetup={(role) => setOnboardingRole(role)}
                  theme={resolvedTheme}
                  currentThemeMode={themeMode}
                  onThemeModeChange={setThemeMode}
                />
              </PhoneSimulatorFrame>
            </div>
          )}
        </div>

        {/* INITIAL ONBOARDING & CRITICAL ALERT PERMISSIONS MODAL */}
        {onboardingRole && (
          <OnboardingModal
            key={onboardingRole}
            myRole={onboardingRole}
            defaultName={state.profiles[onboardingRole].name}
            partnerRealName={state.profiles[onboardingRole === 'partner1' ? 'partner2' : 'partner1'].name}
            defaultNickname={state.profiles[onboardingRole].nicknameForPartner || ''}
            onComplete={handleOnboardingComplete}
            onClose={() => setOnboardingRole(null)}
            theme={resolvedTheme}
          />
        )}

        {/* PAIR PHONES MODAL */}
        {showPairModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div
              className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-3.5 ${
                isDay
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-[#091326] border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm font-['JetBrains_Mono',monospace]">
                  <HavenLogoIcon size={18} />
                  <span>Open on Your Phone</span>
                </div>
                <button
                  onClick={() => setShowPairModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed font-['Inter',sans-serif]">
                Open Haven on both phones. Updates pushed to the app will appear as an in-app update banner without losing any settings:
              </p>

              <div className="space-y-2 text-xs font-['Inter',sans-serif]">
                <div className={`p-2.5 rounded-xl border ${isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="font-semibold text-[#3B82F6] dark:text-[#2DD4BF] text-[11px] mb-0.5">Phone 1 ({state.profiles.partner1.name}):</div>
                  <div className="font-mono text-[10px] text-slate-400 truncate">{`${appUrl}/?user=partner1`}</div>
                </div>

                <div className={`p-2.5 rounded-xl border ${isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
                  <div className="font-semibold text-[#3B82F6] dark:text-[#2DD4BF] text-[11px] mb-0.5">Phone 2 ({state.profiles.partner2.name}):</div>
                  <div className="font-mono text-[10px] text-slate-400 truncate">{`${appUrl}/?user=partner2`}</div>
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(appUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold rounded-xl transition flex items-center justify-center gap-1.5 text-xs shadow-md shadow-blue-500/20 font-['Inter',sans-serif]"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy Main App Link'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </APIProvider>
  );
}
