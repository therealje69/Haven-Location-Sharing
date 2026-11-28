import React, { useState, useRef, useEffect } from 'react';
import {
  AppSyncState,
  ThemeMode,
  UserProfile,
  UserRole,
  formatPartnerDisplayName,
  isDefaultUnsetName,
} from '../lib/types.js';
import { formatDynamicNotificationTime } from '../lib/tokenEngine.js';
import { GoogleMapView } from './GoogleMapView.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { SettingsView } from './SettingsView.js';
import { EmergencyModal } from './EmergencyModal.js';
import { DeviceUpdateBanner, subscribeDeviceToWebPush } from './PWAInstallAndUpdate.js';
import {
  playGentleChime,
  startEASSiren,
  unlockEmergencyAudioChannel,
} from '../lib/easAudio.js';
import {
  MapPin,
  Settings,
  Battery,
  BatteryCharging,
  AlertTriangle,
  X,
  Lock,
  Volume2,
} from 'lucide-react';

interface DeviceViewProps {
  myRole: UserRole;
  state: AppSyncState;
  onRequestLocation: (role: UserRole) => Promise<void>;
  onTriggerEmergency: (role: UserRole) => Promise<void>;
  onResolveEmergency: (role: UserRole) => Promise<void>;
  onUpdateProfile: (role: UserRole, update: Partial<UserProfile>) => Promise<void>;
  onPushAppUpdate: () => Promise<void>;
  onOpenSetup: (role: UserRole) => void;
  onOpenInstallModal?: () => void;
  isRealDeviceMode?: boolean;
  theme: 'day' | 'night';
  currentThemeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

/**
 * Helper to display a system-level OS notification via ServiceWorkerRegistration
 * (which displays over any open app and on the lock screen when the screen is off)
 * with fallback to the standard Notification constructor.
 */
async function triggerSystemPopupNotification(
  title: string,
  options: NotificationOptions & { renotify?: boolean; vibrate?: number[] }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          ...options,
        });
        return;
      }
    }
  } catch {
    // Fallback to window Notification below
  }

  try {
    new Notification(title, options);
  } catch {
    // Safe fallback
  }
}

export const DeviceView: React.FC<DeviceViewProps> = ({
  myRole,
  state,
  onRequestLocation,
  onTriggerEmergency,
  onResolveEmergency,
  onUpdateProfile,
  onPushAppUpdate,
  onOpenSetup,
  onOpenInstallModal,
  isRealDeviceMode = false,
  theme,
  currentThemeMode,
  onThemeModeChange,
}) => {
  const [currentTab, setCurrentTab] = useState<'map' | 'settings'>('map');
  const [activeTopBannerPing, setActiveTopBannerPing] = useState<{
    id: string;
    timestamp: number;
  } | null>(null);
  const topBannerTimerRef = useRef<number | null>(null);

  const targetRole: UserRole = myRole === 'partner1' ? 'partner2' : 'partner1';
  const myProfile = state.profiles[myRole];
  const partnerProfile = state.profiles[targetRole];

  // Mandatory Emergency Override Permission Check
  const isPermissionDeclined = myProfile.criticalAlertsAllowed === false;
  const [showDeclinedPopup, setShowDeclinedPopup] = useState<boolean>(isPermissionDeclined);

  useEffect(() => {
    if (isPermissionDeclined) {
      setShowDeclinedPopup(true);
    } else {
      setShowDeclinedPopup(false);
    }
  }, [isPermissionDeclined]);

  useEffect(() => {
    setActiveTopBannerPing(null);
    if (topBannerTimerRef.current !== null) {
      clearTimeout(topBannerTimerRef.current);
      topBannerTimerRef.current = null;
    }
  }, [myRole]);

  // Current time ticker for dynamic relative time updates
  const [nowTime, setNowTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Register device for background Web Push (works when app is completely closed or screen is off)
  useEffect(() => {
    if (!isPermissionDeclined) {
      subscribeDeviceToWebPush(myRole).catch(() => {});
    }
  }, [myRole, isPermissionDeclined]);

  // Listen for Service Worker background push messages to immediately trigger full-volume audio
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'HAVEN_BACKGROUND_PUSH') {
        const payload = data.payload || {};
        if (payload.targetRole && payload.targetRole !== myRole) return;
        if (payload.type === 'emergency_alert') {
          unlockEmergencyAudioChannel();
          startEASSiren(1.0);
        } else if (payload.type === 'standard_ping') {
          playGentleChime();
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [myRole]);

  // Background Web Worker Heartbeat Poller:
  // Because mobile browsers throttle main-thread timers when the screen is off or another app is open,
  // this dedicated Worker thread polls /api/state in the background so incoming location views and
  // emergency alerts fire the lock-screen pop-up and 100% volume chime immediately.
  const bgKnownPingIdRef = useRef<string | null>(null);
  const bgKnownEmergencyStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined' || isPermissionDeclined) {
      return;
    }

    const workerCode = `
      let timer = null;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(async () => {
            try {
              const res = await fetch('/api/state');
              if (res.ok) {
                const state = await res.json();
                self.postMessage({ type: 'BG_STATE', state });
              }
            } catch {}
          }, 3000);
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
          timer = null;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      if (e.data?.type !== 'BG_STATE' || !e.data.state) return;
      const bgState: AppSyncState = e.data.state;

      // Check for incoming routine location check-in targeting myRole
      const latestPing = (bgState.pings || [])
        .filter((p) => p.targetId === myRole && p.type === 'standard')
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (latestPing) {
        if (bgKnownPingIdRef.current === null) {
          bgKnownPingIdRef.current = latestPing.id;
        } else if (latestPing.id !== bgKnownPingIdRef.current) {
          bgKnownPingIdRef.current = latestPing.id;
          if (document.hidden) {
            const reqProfile = bgState.profiles[latestPing.requesterId];
            const myProf = bgState.profiles[myRole];
            const reqName = formatPartnerDisplayName(reqProfile.name, myProf.nicknameForPartner);
            playGentleChime();
            triggerSystemPopupNotification('Haven', {
              body: `${reqName} viewed your location`,
              tag: `haven-ping-${latestPing.id}`,
              renotify: true,
              vibrate: [250, 120, 250],
            });
          }
        }
      }

      // Check for incoming emergency alert targeting myRole
      const emerg = bgState.activeEmergency;
      if (emerg && emerg.active && emerg.initiatedBy !== myRole) {
        if (bgKnownEmergencyStartRef.current !== emerg.startedAt) {
          bgKnownEmergencyStartRef.current = emerg.startedAt;
          unlockEmergencyAudioChannel();
          startEASSiren(1.0);
          const reqProfile = bgState.profiles[emerg.initiatedBy];
          const myProf = bgState.profiles[myRole];
          const reqName = formatPartnerDisplayName(reqProfile.name, myProf.nicknameForPartner);
          triggerSystemPopupNotification('URGENT ALERT — Haven', {
            body: `${reqName} sent an urgent alert to check on you.`,
            tag: 'haven-emergency-alert',
            requireInteraction: true,
            renotify: true,
            vibrate: [600, 150, 600, 150, 900, 150, 600, 150, 900],
          });
        }
      } else {
        bgKnownEmergencyStartRef.current = null;
      }
    };

    worker.postMessage('start');

    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [myRole, isPermissionDeclined]);

  // Real Hardware GPS & Battery Sync when running in single-device mode on a phone
  useEffect(() => {
    if (!isRealDeviceMode || typeof window === 'undefined' || isPermissionDeclined) return;

    let watchId: number | null = null;
    let lastGeoSync = 0;

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const now = Date.now();
          if (now - lastGeoSync < 15000) return;
          lastGeoSync = now;
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const accuracy = Math.round(pos.coords.accuracy || 10);

          let resolvedAddress = '';
          let resolvedCity = '';
          let resolvedPlaceId: string | undefined;

          try {
            const geoRes = await fetch(
              `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
            );
            if (geoRes.status === 429) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            } else if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData?.address) resolvedAddress = geoData.address;
              if (geoData?.city) resolvedCity = geoData.city;
              if (geoData?.placeId) resolvedPlaceId = geoData.placeId;
            }
          } catch {
            // Server will also attempt reverse geocoding on /api/update-profile
          }

          onUpdateProfile(myRole, {
            currentLocation: {
              lat,
              lng,
              accuracy,
              address: resolvedAddress,
              city: resolvedCity,
              placeId: resolvedPlaceId,
              timestamp: now,
            },
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
      );
    }

    const navWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (type: string, fn: () => void) => void;
      }>;
    };

    if (typeof navWithBattery.getBattery === 'function') {
      navWithBattery
        .getBattery()
        .then((batt) => {
          const syncBattery = () => {
            onUpdateProfile(myRole, {
              battery: Math.round(batt.level * 100),
              isCharging: Boolean(batt.charging),
            });
          };
          syncBattery();
          batt.addEventListener('levelchange', syncBattery);
          batt.addEventListener('chargingchange', syncBattery);
        })
        .catch(() => {});
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isRealDeviceMode, myRole, isPermissionDeclined]);

  // 3-second hold logic for Emergency Override
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdIntervalRef = useRef<number | null>(null);

  const isDay = theme === 'day';
  const myTokens = state.tokens[myRole];
  const nextRefresh = state.tokenRefreshTimes[myRole];
  const msUntilRefresh = nextRefresh ? Math.max(0, nextRefresh - Date.now()) : null;

  const isPartnerNameUnset =
    isDefaultUnsetName(partnerProfile.name) && !myProfile.nicknameForPartner?.trim();
  const partnerDisplayName = formatPartnerDisplayName(
    partnerProfile.name,
    myProfile.nicknameForPartner
  );

  // Active view status
  const activeStandardPingByMe = state.pings
    .filter((p) => p.requesterId === myRole && p.type === 'standard' && p.expiresAt > Date.now())
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];

  const isEmergencyActiveForMe = Boolean(
    state.activeEmergency?.active && state.activeEmergency.initiatedBy === myRole
  );

  const activeExpiresAt = activeStandardPingByMe ? activeStandardPingByMe.expiresAt : 0;
  const isViewActive =
    !isPermissionDeclined && (isEmergencyActiveForMe || activeExpiresAt > Date.now());

  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);

  useEffect(() => {
    if (isEmergencyActiveForMe) {
      setTimeRemainingSeconds(9999);
      return;
    }

    if (!activeExpiresAt || activeExpiresAt <= Date.now()) {
      setTimeRemainingSeconds(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((activeExpiresAt - Date.now()) / 1000));
      setTimeRemainingSeconds(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [activeExpiresAt, isEmergencyActiveForMe]);

  // Find the latest location request where my location was requested (by partner)
  const latestPingForMe = state.pings
    .filter((p) => p.targetId === myRole && p.type === 'standard')
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  // Fire chime, high-priority OS heads-up notification, and temporary 8-second top banner on new check-in
  const lastFiredPingIdRef = useRef<string | null>(
    latestPingForMe && Date.now() - latestPingForMe.timestamp > 10000 ? latestPingForMe.id : null
  );
  useEffect(() => {
    if (latestPingForMe && latestPingForMe.id !== lastFiredPingIdRef.current) {
      lastFiredPingIdRef.current = latestPingForMe.id;
      bgKnownPingIdRef.current = latestPingForMe.id;
      if (!isPermissionDeclined) {
        playGentleChime();
        const reqName = formatPartnerDisplayName(
          partnerProfile.name,
          myProfile.nicknameForPartner
        );
        triggerSystemPopupNotification('Haven', {
          body: `${reqName} viewed your location`,
          tag: `haven-ping-${latestPingForMe.id}`,
          renotify: true,
          requireInteraction: false,
          silent: false,
          vibrate: [220, 100, 220],
        });

        // Show temporary floating top-of-screen pop-up banner for 8 seconds
        setActiveTopBannerPing({
          id: latestPingForMe.id,
          timestamp: latestPingForMe.timestamp,
        });
        if (topBannerTimerRef.current !== null) {
          clearTimeout(topBannerTimerRef.current);
        }
        topBannerTimerRef.current = window.setTimeout(() => {
          setActiveTopBannerPing(null);
          topBannerTimerRef.current = null;
        }, 8000);
      }
    }
  }, [
    latestPingForMe?.id,
    latestPingForMe?.timestamp,
    partnerProfile.name,
    myProfile.nicknameForPartner,
    isPermissionDeclined,
  ]);

  useEffect(() => {
    return () => {
      if (topBannerTimerRef.current !== null) {
        clearTimeout(topBannerTimerRef.current);
      }
    };
  }, []);

  const shouldShowNotification = !isPermissionDeclined && Boolean(activeTopBannerPing);

  const handleDismissAlert = () => {
    if (topBannerTimerRef.current !== null) {
      clearTimeout(topBannerTimerRef.current);
      topBannerTimerRef.current = null;
    }
    setActiveTopBannerPing(null);
  };

  const handlePrimaryCheckInClick = () => {
    if (isPermissionDeclined) {
      setShowDeclinedPopup(true);
      return;
    }
    onRequestLocation(myRole);
  };

  // Handle Emergency Hold
  const startHold = () => {
    if (isPermissionDeclined) {
      setShowDeclinedPopup(true);
      return;
    }
    unlockEmergencyAudioChannel();
    setIsHolding(true);
    setHoldProgress(0);
    const startTime = Date.now();
    const duration = 3000;

    holdIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setHoldProgress(progress);

      if (elapsed >= duration) {
        clearInterval(holdIntervalRef.current!);
        holdIntervalRef.current = null;
        setIsHolding(false);
        setHoldProgress(0);
        onTriggerEmergency(myRole);
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  };

  const handleToggleLogout = async (loggedOut: boolean) => {
    await onUpdateProfile(myRole, { isLoggedOut: loggedOut });
  };

  return (
    <div
      className={`relative flex flex-col h-full w-full select-none overflow-hidden transition-colors duration-200 ${
        isDay ? 'bg-slate-50 text-slate-900' : 'bg-[#091326] text-slate-100'
      }`}
    >
      {/* SEAMLESS OVER-THE-AIR (OTA) APP UPDATE BANNER */}
      <DeviceUpdateBanner
        myRole={myRole}
        appRelease={state.appRelease}
        isDay={isDay}
      />

      {/* TEMPORARY TOP-OF-SCREEN HEADS-UP POP-UP BANNER (Auto-dismisses after 8s) */}
      {shouldShowNotification && activeTopBannerPing && (
        <div
          role="status"
          aria-live="polite"
          className={`absolute top-2.5 left-2.5 right-2.5 px-3 py-2 rounded-2xl flex items-center justify-between gap-2 text-xs font-medium border shadow-xl backdrop-blur-md animate-slideDown z-50 ${
            isDay
              ? 'bg-white/95 border-blue-200 text-blue-950 shadow-blue-900/10'
              : 'bg-slate-900/95 border-blue-700/70 text-blue-50 shadow-black/40'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <HavenLogoIcon size={18} className="shrink-0" />
            <div className="min-w-0 flex-1 leading-snug">
              <div className="text-[11px] break-words">
                <span className={`font-semibold ${isPartnerNameUnset ? 'opacity-50 text-slate-400' : ''}`}>
                  {partnerDisplayName}
                </span>
                <span className="opacity-90"> viewed your location</span>
              </div>
              <div className="text-[10px] text-[#2DD4BF] font-mono mt-0.5">
                {formatDynamicNotificationTime(activeTopBannerPing.timestamp, nowTime)}
              </div>
            </div>
          </div>
          <button
            onClick={handleDismissAlert}
            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md transition shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" />
          </button>
        </div>
      )}

      {/* COMPACT TOP HEADER: Logo only on upper-left */}
      <header
        className={`px-3.5 py-2.5 border-b flex items-center justify-between z-10 ${
          isDay ? 'bg-white/90 border-slate-200' : 'bg-[#091326]/90 border-slate-800'
        }`}
      >
        <div className="flex items-center">
          <HavenLogoIcon size={24} />
        </div>

        {/* Partner Connection & Battery Status */}
        <div className="text-right">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-medium ${
              isDay
                ? 'bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
          >
            <span
              className={`font-semibold truncate max-w-[130px] ${
                isPartnerNameUnset ? 'text-slate-400/50' : ''
              }`}
            >
              {partnerDisplayName}
            </span>
            <span className="text-slate-400">·</span>
            {partnerProfile.isLoggedOut ? (
              <span className="text-slate-400 text-[10px]">Offline</span>
            ) : (
              <div className="flex items-center gap-0.5 text-emerald-600 dark:text-[#2DD4BF]">
                {partnerProfile.isCharging ? (
                  <BatteryCharging className="w-3 h-3" />
                ) : (
                  <Battery className="w-3 h-3" />
                )}
                <span className="font-mono text-[10px]">{partnerProfile.battery}%</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col justify-between">
        {currentTab === 'map' && (
          <div className="h-full flex flex-col justify-between gap-2.5">
            {/* Interactive Map Area */}
            <div className={`flex-1 w-full min-h-[220px] ${isRealDeviceMode ? '' : 'max-h-[310px]'}`}>
              <GoogleMapView
                partnerLocation={partnerProfile.currentLocation}
                partnerDisplayName={partnerDisplayName}
                isLocked={!isViewActive || isPermissionDeclined}
                isEmergency={isEmergencyActiveForMe && !isPermissionDeclined}
                timeRemainingSeconds={timeRemainingSeconds}
                myRole={myRole}
                theme={theme}
                isPartnerLoggedOut={partnerProfile.isLoggedOut}
              />
            </div>

            {/* ACTION DECK */}
            <div className="space-y-2 pt-0.5">
              {isPermissionDeclined ? (
                <>
                  <button
                    onClick={() => setShowDeclinedPopup(true)}
                    className="w-full py-3 px-4 rounded-xl bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed"
                  >
                    <span>See </span>
                    <span className={isPartnerNameUnset ? 'opacity-50' : ''}>
                      {partnerDisplayName}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowDeclinedPopup(true)}
                    className={`w-full py-2.5 px-3 rounded-xl border text-center font-bold text-[11px] text-slate-400 flex items-center justify-center gap-1.5 cursor-not-allowed ${
                      isDay ? 'border-slate-200 bg-slate-100' : 'border-slate-800 bg-slate-900'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Hold 3s for Urgent Alert</span>
                  </button>
                </>
              ) : isEmergencyActiveForMe ? (
                <button
                  onClick={() => onResolveEmergency(myRole)}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition"
                >
                  <AlertTriangle className="w-4 h-4 text-white" />
                  <span>End Urgent Alert</span>
                </button>
              ) : partnerProfile.isLoggedOut ? (
                <div
                  className={`w-full py-3 px-4 rounded-xl border text-center text-xs font-semibold flex items-center justify-center gap-2 ${
                    isDay
                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{partnerDisplayName} is resting offline</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={handlePrimaryCheckInClick}
                    disabled={myTokens <= 0 || isViewActive}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:from-[#2563EB] hover:to-[#1D4ED8] active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition font-['Inter',sans-serif]"
                  >
                    <span>See </span>
                    <span className={isPartnerNameUnset ? 'text-white/60' : ''}>
                      {partnerDisplayName}
                    </span>
                  </button>

                  {/* 3-Second Hold Urgent Alert Button */}
                  <div
                    className={`relative rounded-xl overflow-hidden border ${
                      isDay ? 'border-slate-200 bg-white' : 'border-slate-800 bg-[#091326]'
                    }`}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-rose-600/35 transition-all duration-75 pointer-events-none"
                      style={{ width: `${holdProgress}%` }}
                    />

                    <button
                      onMouseDown={startHold}
                      onMouseUp={cancelHold}
                      onMouseLeave={cancelHold}
                      onTouchStart={startHold}
                      onTouchEnd={cancelHold}
                      className="relative w-full py-2.5 px-3 text-center font-bold text-[11px] text-rose-600 dark:text-rose-400 hover:opacity-90 flex items-center justify-center gap-1.5 select-none active:scale-[0.99] transition font-['Inter',sans-serif]"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>
                        {isHolding
                          ? `Holding... ${Math.round(holdProgress)}%`
                          : 'Hold 3s for Urgent Alert'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {currentTab === 'settings' && (
          <SettingsView
            key={myRole}
            myRole={myRole}
            myProfile={myProfile}
            partnerProfile={partnerProfile}
            profiles={state.profiles}
            auditLog={isPermissionDeclined ? [] : state.auditLog}
            tokensRemaining={myTokens}
            msUntilRefresh={msUntilRefresh}
            appRelease={state.appRelease}
            onUpdateProfile={onUpdateProfile}
            onToggleLogout={handleToggleLogout}
            onPushAppUpdate={onPushAppUpdate}
            onOpenSetup={() => onOpenSetup(myRole)}
            onOpenInstallModal={onOpenInstallModal}
            theme={theme}
            onThemeModeChange={onThemeModeChange}
            currentThemeMode={currentThemeMode}
          />
        )}
      </main>

      {/* COMPACT BOTTOM NAVIGATION BAR (History moved inside Settings) */}
      <nav
        className={`px-3 py-1.5 border-t flex items-center justify-around text-[10px] font-semibold z-10 ${
          isDay ? 'bg-white/95 border-slate-200' : 'bg-[#091326]/95 border-slate-800'
        }`}
      >
        <button
          onClick={() => {
            if (isPermissionDeclined) {
              setShowDeclinedPopup(true);
              return;
            }
            setCurrentTab('map');
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-6 rounded-xl transition ${
            currentTab === 'map'
              ? 'text-[#3B82F6] dark:text-[#2DD4BF] bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Check-in</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-6 rounded-xl transition ${
            currentTab === 'settings'
              ? 'text-[#3B82F6] dark:text-[#2DD4BF] bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </nav>

      {/* POP-UP NOTIFICATION WHEN EMERGENCY OVERRIDE PERMISSION IS DECLINED */}
      {showDeclinedPopup && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div
            className={`w-full max-w-xs rounded-3xl p-5 border shadow-2xl text-center space-y-3.5 ${
              isDay
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-[#091326] border-slate-800 text-slate-100'
            }`}
          >
            <div className="mx-auto w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
              <Volume2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-medium leading-relaxed font-['Inter',sans-serif]">
              Haven will only work properly if the Emergency Alert Override setting is enabled.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeclinedPopup(false)}
                className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition ${
                  isDay
                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  unlockEmergencyAudioChannel();
                  await onUpdateProfile(myRole, { criticalAlertsAllowed: true });
                  setShowDeclinedPopup(false);
                }}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white text-xs font-semibold shadow-sm transition"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN URGENT ALERT MODAL */}
      <EmergencyModal
        emergency={isPermissionDeclined ? null : state.activeEmergency}
        myRole={myRole}
        profiles={state.profiles}
        onDismiss={() => onResolveEmergency(myRole)}
      />
    </div>
  );
};
