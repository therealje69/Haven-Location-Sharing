import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Check, Smartphone } from 'lucide-react';
import { AppReleaseInfo, UserRole } from '../lib/types.js';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{ isDay: boolean }> = ({ isDay }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-xs hover:opacity-95 transition font-['Inter',sans-serif]"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 transition font-['Inter',sans-serif] ${
            isDay
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-[#3B82F6]" />
          <span className="hidden sm:inline">Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div
              className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-3 ${
                isDay ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#091326] border-slate-800 text-slate-100'
              }`}
            >
              <h3 className="text-sm font-bold font-['JetBrains_Mono',monospace]">Install Haven on iPhone</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-['Inter',sans-serif]">
                1. Tap the <strong>Share</strong> button in Safari.<br />
                2. Tap <strong>Add to Home Screen</strong>. All settings and updates will sync automatically.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-xl bg-[#3B82F6] text-white text-xs font-semibold"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

interface DeviceUpdateBannerProps {
  myRole: UserRole;
  appRelease: AppReleaseInfo;
  isDay: boolean;
}

/**
 * Per-device Over-The-Air (OTA) Update Notification Banner.
 * When a new app version/build is pushed by the publisher (or Service Worker detects an update),
 * the installed user sees a non-destructive "Update Available" banner on their device.
 * Accepting the update applies the new build while preserving 100% of user settings, names,
 * private nicknames, and permissions without requiring reinstallation.
 */
export const DeviceUpdateBanner: React.FC<DeviceUpdateBannerProps> = ({
  myRole,
  appRelease,
  isDay,
}) => {
  const storageKey = `haven_installed_build_${myRole}`;
  const [installedBuildId, setInstalledBuildId] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : 1;
  });

  const [swNeedRefresh, setSwNeedRefresh] = useState(false);
  const [swUpdateFn, setSwUpdateFn] = useState<(() => Promise<void>) | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [justUpdatedVersion, setJustUpdatedVersion] = useState<string | null>(null);

  // Sync when myRole changes
  useEffect(() => {
    const saved = localStorage.getItem(`haven_installed_build_${myRole}`);
    setInstalledBuildId(saved ? parseInt(saved, 10) : 1);
  }, [myRole]);

  // Register Service Worker for real PWA OTA asset updates
  useEffect(() => {
    let mounted = true;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onNeedRefresh() {
            if (mounted) {
              setSwNeedRefresh(true);
              setSwUpdateFn(() => () => updateSW(true));
            }
          },
          onOfflineReady() {},
        });
      })
      .catch(() => {
        // Fallback if SW registration is unavailable in restricted iframe
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasNewRelease = appRelease && appRelease.buildId > installedBuildId;
  const showUpdatePrompt = hasNewRelease || swNeedRefresh;

  const handleAcceptUpdate = async () => {
    setIsUpdating(true);
    try {
      // Preserve all existing localStorage settings; only advance installed build ID
      if (appRelease) {
        localStorage.setItem(storageKey, String(appRelease.buildId));
        localStorage.setItem(`haven_installed_version_${myRole}`, appRelease.version);
        setInstalledBuildId(appRelease.buildId);
      }
      if (swUpdateFn) {
        await swUpdateFn();
      }
      setSwNeedRefresh(false);
      setJustUpdatedVersion(appRelease?.version || 'latest');
      setTimeout(() => {
        setJustUpdatedVersion(null);
      }, 3500);
    } finally {
      setIsUpdating(false);
    }
  };

  if (justUpdatedVersion) {
    return (
      <div
        className={`px-3.5 py-2 flex items-center justify-between text-[11px] font-medium border-b z-40 animate-fadeIn ${
          isDay
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="truncate">
            Updated to <strong>v{justUpdatedVersion}</strong> · Settings preserved
          </span>
        </div>
      </div>
    );
  }

  if (!showUpdatePrompt) return null;

  return (
    <div
      className={`px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-medium border-b z-40 animate-slideDown ${
        isDay
          ? 'bg-indigo-50/95 border-indigo-200 text-indigo-950'
          : 'bg-indigo-950/80 border-indigo-800/70 text-indigo-100'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw className={`w-3.5 h-3.5 text-[#3B82F6] shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
        <div className="truncate text-[11px]">
          <span className="font-bold">Update v{appRelease.version}</span>
          <span className="opacity-80 ml-1">· {appRelease.releaseNotes}</span>
        </div>
      </div>
      <button
        onClick={handleAcceptUpdate}
        disabled={isUpdating}
        className="px-2.5 py-1 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[10px] font-bold shrink-0 shadow-xs transition cursor-pointer"
      >
        {isUpdating ? 'Updating...' : 'Accept Update'}
      </button>
    </div>
  );
};
