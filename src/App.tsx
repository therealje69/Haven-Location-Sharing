// Source: Google Maps Platform Code Assist
import React, { useEffect, useState, useCallback } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AppSyncState, ThemeMode, UserProfile, UserRole, isDefaultUnsetName } from './lib/types.js';
import { PhoneSimulatorFrame } from './components/PhoneSimulatorFrame.js';
import { DeviceView } from './components/DeviceView.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { HavenBrandHeader, HavenLogoIcon } from './components/HavenLogo.js';
import { PWAInstallButton } from './components/PWAInstallAndUpdate.js';
import { InstallAndPlayStoreModal } from './components/InstallAndPlayStoreModal.js';
import {
  Users,
  Smartphone,
  Package,
  ShieldCheck,
  Maximize2
} from 'lucide-react';

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramUser = urlParams.get('user') as UserRole | null;
  const paramStudio = urlParams.get('studio') === 'true';

  // Detect whether user is on a real mobile phone / standalone installed app
  const [isMobileOrStandalone, setIsMobileOrStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isMobileViewport = window.innerWidth < 768;
    const isMobileUA = /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
    return isStandalone || isMobileViewport || isMobileUA;
  });

  useEffect(() => {
    const handleResize = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const isMobileViewport = window.innerWidth < 768;
      const isMobileUA = /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
      setIsMobileOrStandalone(isStandalone || isMobileViewport || isMobileUA);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Bound role for this physical device (persisted in localStorage so installed APK/PWA launches directly into full-screen app)
  const [boundRole, setBoundRole] = useState<UserRole | null>(() => {
    if (paramUser === 'partner1' || paramUser === 'partner2') {
      localStorage.setItem('haven_bound_device_role', paramUser);
      return paramUser;
    }
    const saved = localStorage.getItem('haven_bound_device_role');
    if (saved === 'partner1' || saved === 'partner2') {
      return saved;
    }
    return null;
  });

  // View mode: if boundRole is set (or paramUser is passed) and not explicitly requesting studio, default to that user's app!
  const [viewMode, setViewMode] = useState<'dual' | 'partner1' | 'partner2'>(() => {
    if (paramStudio) return 'dual';
    if (paramUser === 'partner1' || paramUser === 'partner2') return paramUser;
    const saved = localStorage.getItem('haven_bound_device_role');
    if (saved === 'partner1' || saved === 'partner2') return saved;
    return 'dual';
  });

  // Whether to render full-screen native app without any studio header or phone bezel
  const [forceStudioChrome, setForceStudioChrome] = useState<boolean>(paramStudio);

  const [state, setState] = useState<AppSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
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
    const initialRole =
      paramUser === 'partner1' || paramUser === 'partner2'
        ? paramUser
        : (localStorage.getItem('haven_bound_device_role') as UserRole | null);
    if (initialRole === 'partner1' || initialRole === 'partner2') {
      const saved = localStorage.getItem(`haven_setup_completed_${initialRole}`);
      return saved ? null : initialRole;
    }
    return null;
  });

  // Bind this device to Partner 1 or Partner 2 and enter Full-Screen Native App Mode
  const handleSelectDeviceRole = (role: UserRole) => {
    localStorage.setItem('haven_bound_device_role', role);
    setBoundRole(role);
    setViewMode(role);
    setForceStudioChrome(false);
    const savedSetup = localStorage.getItem(`haven_setup_completed_${role}`);
    if (!savedSetup) {
      setOnboardingRole(role);
    }
  };

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

      // Prompt permissions on first load if user has not completed setup yet
      const targetRole: UserRole =
        paramUser === 'partner2' || localStorage.getItem('haven_bound_device_role') === 'partner2'
          ? 'partner2'
          : 'partner1';
      if (
        !data.profiles[targetRole].hasCompletedSetup &&
        !localStorage.getItem(`haven_setup_completed_${targetRole}`)
      ) {
        setOnboardingRole(targetRole);
      }
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
    const role = onboardingRole || boundRole || 'partner1';
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

  if (loading) {
    return (
      <div className={`min-h-dvh flex flex-col items-center justify-center ${isDay ? 'bg-slate-100 text-slate-900' : 'bg-[#091326] text-slate-100'}`}>
        <div className="w-8 h-8 rounded-full border-3 border-blue-600 border-t-transparent animate-spin mb-3" />
        <h2 className="text-sm font-bold tracking-tight text-blue-700 dark:text-blue-400">Connecting to Haven</h2>
        <p className="text-xs text-slate-400 mt-0.5">Setting up private connection...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-dvh bg-slate-100 flex flex-col items-center justify-center p-6 text-center text-slate-700">
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

  // CASE 1: On a real mobile phone / standalone PWA and no device role has been bound yet ->
  // Show a clean, native First-Time Phone Pairing Screen (NEVER the Dual-Phone Studio!)
  if (isMobileOrStandalone && !boundRole && viewMode === 'dual') {
    return (
      <div
        className={`h-dvh w-screen overflow-y-auto flex flex-col items-center justify-center p-6 select-none ${
          isDay ? 'bg-slate-50 text-slate-900' : 'bg-[#091326] text-slate-100'
        }`}
      >
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="flex flex-col items-center gap-2">
            <HavenLogoIcon size={48} />
            <h1 className="text-xl font-bold tracking-tight font-['JetBrains_Mono',monospace]">
              Haven
            </h1>
            <p className="text-xs text-slate-400 max-w-xs">
              A safe space for shared presence. Select which phone you are setting up right now:
            </p>
          </div>

          <div className="space-y-3 text-left">
            <button
              onClick={() => handleSelectDeviceRole('partner1')}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between transition shadow-sm ${
                isDay
                  ? 'bg-white border-slate-200 hover:border-blue-500'
                  : 'bg-slate-900/80 border-slate-800 hover:border-blue-500'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-[#3B82F6] dark:text-[#2DD4BF] uppercase tracking-wider">
                  Phone 1
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isDefaultUnsetName(state.profiles.partner1.name) ? 'text-slate-400/50' : ''
                  }`}
                >
                  {state.profiles.partner1.name}
                </div>
              </div>
              <Smartphone className="w-6 h-6 text-[#3B82F6]" />
            </button>

            <button
              onClick={() => handleSelectDeviceRole('partner2')}
              className={`w-full p-4 rounded-2xl border flex items-center justify-between transition shadow-sm ${
                isDay
                  ? 'bg-white border-slate-200 hover:border-blue-500'
                  : 'bg-slate-900/80 border-slate-800 hover:border-blue-500'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-[#3B82F6] dark:text-[#2DD4BF] uppercase tracking-wider">
                  Phone 2
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    isDefaultUnsetName(state.profiles.partner2.name) ? 'text-slate-400/50' : ''
                  }`}
                >
                  {state.profiles.partner2.name}
                </div>
              </div>
              <Smartphone className="w-6 h-6 text-[#2DD4BF]" />
            </button>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <PWAInstallButton isDay={isDay} />
            <button
              onClick={() => setShowInstallModal(true)}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-300"
            >
              <Package className="w-4 h-4 text-[#3B82F6]" />
              <span>Get Android .APK / Google Play Store Guide</span>
            </button>
          </div>
        </div>

        <InstallAndPlayStoreModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
          profiles={state.profiles}
          currentRole={boundRole}
          onSelectDeviceRole={(role) => {
            handleSelectDeviceRole(role);
            setShowInstallModal(false);
          }}
          isDay={isDay}
        />
      </div>
    );
  }

  // CASE 2: Full-Screen Native Single-Device App Mode!
  // Triggered whenever a user is bound to partner1/partner2 (and not forcing the desktop studio bar),
  // OR whenever on a mobile screen in partner1/partner2 view.
  const isNativeFullScreenApp =
    (viewMode === 'partner1' || viewMode === 'partner2') &&
    (isMobileOrStandalone || !forceStudioChrome);

  if (isNativeFullScreenApp) {
    const activeRole: UserRole = viewMode === 'partner2' ? 'partner2' : 'partner1';
    return (
      <APIProvider apiKey={mapsApiKey} solutionChannel="GMP_aistudio">
        <div
          className={`h-dvh w-screen overflow-hidden flex flex-col select-none ${
            isDay ? 'bg-slate-50 text-slate-900' : 'bg-[#091326] text-slate-100'
          }`}
        >
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

          <div className="flex-1 w-full max-w-md mx-auto h-full flex flex-col overflow-hidden shadow-xl">
            <DeviceView
              key={activeRole}
              myRole={activeRole}
              state={state}
              onRequestLocation={handleRequestLocation}
              onTriggerEmergency={handleTriggerEmergency}
              onResolveEmergency={handleResolveEmergency}
              onUpdateProfile={handleUpdateProfile}
              onResetTokens={handleResetTokens}
              onPushAppUpdate={handlePushAppUpdate}
              onOpenSetup={(role) => setOnboardingRole(role)}
              onOpenInstallModal={() => setShowInstallModal(true)}
              isRealDeviceMode={true}
              theme={resolvedTheme}
              currentThemeMode={themeMode}
              onThemeModeChange={setThemeMode}
            />
          </div>

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

          <InstallAndPlayStoreModal
            isOpen={showInstallModal}
            onClose={() => setShowInstallModal(false)}
            profiles={state.profiles}
            currentRole={activeRole}
            onSelectDeviceRole={(role) => {
              handleSelectDeviceRole(role);
              setShowInstallModal(false);
            }}
            onOpenDualSimulator={() => {
              setForceStudioChrome(true);
              setViewMode('dual');
            }}
            isDay={isDay}
          />
        </div>
      </APIProvider>
    );
  }

  // CASE 3: Desktop Dual-Phone Preview / Studio Mode
  return (
    <APIProvider apiKey={mapsApiKey} solutionChannel="GMP_aistudio">
      <div
        className={`h-screen w-screen overflow-hidden flex flex-col transition-colors duration-200 select-none ${
          isDay
            ? 'bg-slate-100 text-slate-900'
            : 'bg-[#091326] text-slate-100'
        }`}
      >
        {/* Google Maps Platform Quota Notice Banner */}
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
              onClick={() => handleSelectDeviceRole('partner1')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition text-[11px] ${
                viewMode === 'partner1'
                  ? isDay
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              <span className={isDefaultUnsetName(state.profiles.partner1.name) ? 'opacity-50' : ''}>
                {state.profiles.partner1.name}
              </span>
            </button>

            <button
              onClick={() => handleSelectDeviceRole('partner2')}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition text-[11px] ${
                viewMode === 'partner2'
                  ? isDay
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              <span className={isDefaultUnsetName(state.profiles.partner2.name) ? 'opacity-50' : ''}>
                {state.profiles.partner2.name}
              </span>
            </button>
          </div>

          {/* Right Actions: PWA Install + APK / Play Store & Phone Links */}
          <div className="flex items-center gap-1.5">
            <PWAInstallButton isDay={isDay} />
            <button
              onClick={() => setShowInstallModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm hover:opacity-95 transition"
            >
              <Package className="w-3.5 h-3.5" />
              <span className="font-['Inter',sans-serif]">Install / Get .APK</span>
            </button>
          </div>
        </header>

        {/* VIEWPORT AREA */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-2 sm:p-4">
          {viewMode === 'dual' ? (
            <div className="w-full max-w-4xl flex items-center justify-center gap-6 sm:gap-10">
              {/* Phone 1 (partner1) */}
              <div className="flex flex-col items-center">
                <div className="mb-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  <span className={isDefaultUnsetName(state.profiles.partner1.name) ? 'text-slate-400/50' : ''}>
                    {state.profiles.partner1.name}
                  </span>
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
                    onOpenInstallModal={() => setShowInstallModal(true)}
                    theme={resolvedTheme}
                    currentThemeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                  />
                </PhoneSimulatorFrame>
              </div>

              {/* Phone 2 (partner2) */}
              <div className="flex flex-col items-center">
                <div className="mb-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 tracking-wide flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  <span className={isDefaultUnsetName(state.profiles.partner2.name) ? 'text-slate-400/50' : ''}>
                    {state.profiles.partner2.name}
                  </span>
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
                    onOpenInstallModal={() => setShowInstallModal(true)}
                    theme={resolvedTheme}
                    currentThemeMode={themeMode}
                    onThemeModeChange={setThemeMode}
                  />
                </PhoneSimulatorFrame>
              </div>
            </div>
          ) : (
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
                  onOpenInstallModal={() => setShowInstallModal(true)}
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

        {/* INSTALL APP & ANDROID APK / PLAY STORE MODAL */}
        <InstallAndPlayStoreModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
          profiles={state.profiles}
          currentRole={boundRole}
          onSelectDeviceRole={(role) => {
            handleSelectDeviceRole(role);
            setShowInstallModal(false);
          }}
          isDay={isDay}
        />
      </div>
    </APIProvider>
  );
}
