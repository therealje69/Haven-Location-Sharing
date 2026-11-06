import React, { useState, useRef, useEffect } from 'react';
import { AppSyncState, ThemeMode, UserProfile, UserRole, formatPartnerDisplayName } from '../lib/types.js';
import { formatDynamicNotificationTime } from '../lib/tokenEngine.js';
import { GoogleMapView } from './GoogleMapView.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { AuditTrailView } from './AuditTrailView.js';
import { SettingsView } from './SettingsView.js';
import { EmergencyModal } from './EmergencyModal.js';
import { DeviceUpdateBanner } from './PWAInstallAndUpdate.js';
import { playGentleChime, unlockEmergencyAudioChannel } from '../lib/easAudio.js';
import {
  MapPin,
  Clock,
  Settings,
  Battery,
  BatteryCharging,
  AlertTriangle,
  X,
  Lock
} from 'lucide-react';

interface DeviceViewProps {
  myRole: UserRole;
  state: AppSyncState;
  onRequestLocation: (role: UserRole) => Promise<void>;
  onTriggerEmergency: (role: UserRole) => Promise<void>;
  onResolveEmergency: (role: UserRole) => Promise<void>;
  onUpdateProfile: (role: UserRole, update: Partial<UserProfile>) => Promise<void>;
  onResetTokens: () => Promise<void>;
  onPushAppUpdate: () => Promise<void>;
  onOpenSetup: (role: UserRole) => void;
  theme: 'day' | 'night';
  currentThemeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export const DeviceView: React.FC<DeviceViewProps> = ({
  myRole,
  state,
  onRequestLocation,
  onTriggerEmergency,
  onResolveEmergency,
  onUpdateProfile,
  onResetTokens,
  onPushAppUpdate,
  onOpenSetup,
  theme,
  currentThemeMode,
  onThemeModeChange,
}) => {
  const [currentTab, setCurrentTab] = useState<'map' | 'history' | 'settings'>('map');
  const [dismissedPingId, setDismissedPingId] = useState<string | null>(() => {
    return localStorage.getItem(`haven_dismissed_ping_${myRole}`) || null;
  });

  // Synchronize dismissedPingId if myRole changes
  useEffect(() => {
    setDismissedPingId(localStorage.getItem(`haven_dismissed_ping_${myRole}`) || null);
  }, [myRole]);

  // Current time ticker for dynamic relative time updates ("just now", "a minute ago", etc.)
  const [nowTime, setNowTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Request browser Notification permission once if available
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // 3-second hold logic for Emergency Override
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdIntervalRef = useRef<number | null>(null);

  const targetRole: UserRole = myRole === 'partner1' ? 'partner2' : 'partner1';
  const myProfile = state.profiles[myRole];
  const partnerProfile = state.profiles[targetRole];

  const isDay = theme === 'day';
  const myTokens = state.tokens[myRole];
  const nextRefresh = state.tokenRefreshTimes[myRole];
  const msUntilRefresh = nextRefresh ? Math.max(0, nextRefresh - Date.now()) : null;

  // Format partner display name with MY device's optional private nickname: e.g. Jordan "The King" or Jordan
  const partnerDisplayName = formatPartnerDisplayName(partnerProfile.name, myProfile.nicknameForPartner);

  // Active view status:
  // 1. Standard 1-minute ping requested by this device
  const activeStandardPingByMe = state.pings
    .filter((p) => p.requesterId === myRole && p.type === 'standard' && p.expiresAt > Date.now())
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];

  // 2. Active emergency initiated by this device (immediately closes when partner marks themselves safe)
  const isEmergencyActiveForMe = Boolean(
    state.activeEmergency?.active && state.activeEmergency.initiatedBy === myRole
  );

  const activeExpiresAt = activeStandardPingByMe ? activeStandardPingByMe.expiresAt : 0;
  const isViewActive = isEmergencyActiveForMe || activeExpiresAt > Date.now();

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

  // Fire sound and native Web Notification if available when a new check-in happens
  const lastFiredPingIdRef = useRef<string | null>(latestPingForMe?.id || null);
  useEffect(() => {
    if (latestPingForMe && latestPingForMe.id !== lastFiredPingIdRef.current) {
      lastFiredPingIdRef.current = latestPingForMe.id;
      playGentleChime();

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const reqName = formatPartnerDisplayName(partnerProfile.name, myProfile.nicknameForPartner);
          new Notification('Haven', {
            body: `${reqName} requested your location`,
          });
        } catch {
          // Fallback safe
        }
      }
    }
  }, [latestPingForMe?.id, partnerProfile.name, myProfile.nicknameForPartner]);

  // Determine if popup banner should display
  const shouldShowNotification =
    latestPingForMe &&
    latestPingForMe.id !== dismissedPingId &&
    (nowTime - latestPingForMe.timestamp < 30 * 24 * 3600 * 1000);

  const handleDismissAlert = () => {
    if (latestPingForMe) {
      localStorage.setItem(`haven_dismissed_ping_${myRole}`, latestPingForMe.id);
      setDismissedPingId(latestPingForMe.id);
    }
  };

  // Handle Emergency Hold
  const startHold = () => {
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
        isDay
          ? 'bg-slate-50 text-slate-900'
          : 'bg-[#091326] text-slate-100'
      }`}
    >
      {/* SEAMLESS OVER-THE-AIR (OTA) APP UPDATE BANNER */}
      <DeviceUpdateBanner
        myRole={myRole}
        appRelease={state.appRelease}
        isDay={isDay}
      />

      {/* INCOMING LOCATION REQUEST POPUP BANNER (Dynamic relative time, no time constraints) */}
      {shouldShowNotification && latestPingForMe && (
        <div
          className={`px-3.5 py-2.5 flex items-center justify-between text-xs font-medium border-b animate-slideDown z-40 ${
            isDay
              ? 'bg-blue-50/95 border-blue-200 text-blue-950 shadow-sm'
              : 'bg-[#091326]/95 border-blue-900/60 text-blue-100 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2 truncate min-w-0 mr-2">
            <HavenLogoIcon size={18} className="shrink-0" />
            <div className="truncate text-xs">
              <span className="font-semibold">{partnerDisplayName}</span>
              <span className="opacity-90"> requested your location</span>
              <span className="text-[11px] text-[#2DD4BF] dark:text-[#2DD4BF] ml-1.5 font-mono">
                · {formatDynamicNotificationTime(latestPingForMe.timestamp, nowTime)}
              </span>
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

      {/* COMPACT TOP HEADER: Logo only on upper-left (no account owner name text) */}
      <header
        className={`px-3.5 py-2.5 border-b flex items-center justify-between z-10 ${
          isDay
            ? 'bg-white/90 border-slate-200'
            : 'bg-[#091326]/90 border-slate-800'
        }`}
      >
        <div className="flex items-center">
          <HavenLogoIcon size={24} />
        </div>

        {/* Partner Connection & Battery Status */}
        <div className="text-right">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-medium ${
              isDay ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
          >
            <span className="font-semibold truncate max-w-[130px]">{partnerDisplayName}</span>
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

      {/* MAIN VIEWPORT (Clean, fits above the fold, smoothly scrollable without scrollbars if needed) */}
      <main className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col justify-between">
        {currentTab === 'map' && (
          <div className="h-full flex flex-col justify-between gap-2.5">
            {/* Interactive Map Area (Powered by Google Maps Platform via @vis.gl/react-google-maps) */}
            <div className="flex-1 w-full min-h-[220px] max-h-[310px]">
              <GoogleMapView
                partnerLocation={partnerProfile.currentLocation}
                partnerDisplayName={partnerDisplayName}
                isLocked={!isViewActive}
                isEmergency={isEmergencyActiveForMe}
                timeRemainingSeconds={timeRemainingSeconds}
                myRole={myRole}
                theme={theme}
                isPartnerLoggedOut={partnerProfile.isLoggedOut}
              />
            </div>

            {/* ACTION DECK */}
            <div className="space-y-2 pt-0.5">
              {isEmergencyActiveForMe ? (
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
                    isDay ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{partnerDisplayName} is resting offline</span>
                </div>
              ) : (
                <>
                  {/* Primary Action Button: "See [name]" with brand gradient */}
                  <button
                    onClick={() => onRequestLocation(myRole)}
                    disabled={myTokens <= 0 || isViewActive}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:from-[#2563EB] hover:to-[#1D4ED8] active:scale-98 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition font-['Inter',sans-serif]"
                  >
                    <span>See {partnerDisplayName}</span>
                  </button>

                  {/* 3-Second Hold Urgent Alert Button */}
                  <div
                    className={`relative rounded-xl overflow-hidden border ${
                      isDay
                        ? 'border-slate-200 bg-white'
                        : 'border-slate-800 bg-[#091326]'
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

        {currentTab === 'history' && (
          <AuditTrailView
            auditLog={state.auditLog}
            profiles={state.profiles}
            myRole={myRole}
            theme={theme}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            key={myRole}
            myRole={myRole}
            myProfile={myProfile}
            partnerProfile={partnerProfile}
            tokensRemaining={myTokens}
            msUntilRefresh={msUntilRefresh}
            appRelease={state.appRelease}
            onUpdateProfile={onUpdateProfile}
            onResetTokens={onResetTokens}
            onToggleLogout={handleToggleLogout}
            onPushAppUpdate={onPushAppUpdate}
            onOpenSetup={() => onOpenSetup(myRole)}
            theme={theme}
            onThemeModeChange={onThemeModeChange}
            currentThemeMode={currentThemeMode}
          />
        )}
      </main>

      {/* COMPACT BOTTOM NAVIGATION BAR ("Settings" only) */}
      <nav
        className={`px-3 py-1.5 border-t flex items-center justify-around text-[10px] font-semibold z-10 ${
          isDay
            ? 'bg-white/95 border-slate-200'
            : 'bg-[#091326]/95 border-slate-800'
        }`}
      >
        <button
          onClick={() => setCurrentTab('map')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            currentTab === 'map'
              ? 'text-[#3B82F6] dark:text-[#2DD4BF] bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Check-in</span>
        </button>

        <button
          onClick={() => setCurrentTab('history')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            currentTab === 'history'
              ? 'text-[#3B82F6] dark:text-[#2DD4BF] bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>History</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            currentTab === 'settings'
              ? 'text-[#3B82F6] dark:text-[#2DD4BF] bg-blue-500/10'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </nav>

      {/* FULL-SCREEN EAS URGENT ALERT MODAL */}
      <EmergencyModal
        emergency={state.activeEmergency}
        myRole={myRole}
        profiles={state.profiles}
        onDismiss={() => onResolveEmergency(myRole)}
      />
    </div>
  );
};
