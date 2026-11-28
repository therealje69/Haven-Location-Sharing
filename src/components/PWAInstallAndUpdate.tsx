import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Check, Smartphone } from 'lucide-react';
import { AppReleaseInfo, UserRole } from '../lib/types.js';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the device with the Web Push (VAPID) server so location check-ins
 * and urgent alerts wake up the phone and display pop-up notifications even when
 * the app is completely closed or the phone screen is off.
 */
export async function subscribeDeviceToWebPush(userId: UserRole): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return;
  }

  try {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
    if ('Notification' in window && Notification.permission !== 'granted') {
      return;
    }

    const vapidRes = await fetch('/api/push-vapid-key');
    if (!vapidRes.ok) return;
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }

    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription }),
    });
  } catch {
    // Graceful fallback if running in non-HTTPS or preview iframe
  }
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
 * When a new app version/build is published or pushed, installed users see
 * an "Accept Update" banner at the top of their app. Clicking it applies the new
 * code bundle in-place while preserving 100% of their settings and device identity.
 */
export const DeviceUpdateBanner: React.FC<DeviceUpdateBannerProps> = ({
  myRole,
  appRelease,
  isDay,
}) => {
  const CLIENT_CODE_VERSION = '1.4.0';
  const storageKey = `haven_installed_build_${myRole}`;
  const codeVersionKey = `haven_code_version_${myRole}`;

  const [installedBuildId, setInstalledBuildId] = useState<number>(() => {
    const currentServerBuild = appRelease?.buildId || 3;
    const savedCodeVersion = localStorage.getItem(codeVersionKey);
    const savedBuild = localStorage.getItem(storageKey);

    // If the user is loading this code version for the first time, they already have this build loaded
    if (savedCodeVersion !== CLIENT_CODE_VERSION || !savedBuild) {
      localStorage.setItem(codeVersionKey, CLIENT_CODE_VERSION);
      localStorage.setItem(storageKey, String(currentServerBuild));
      return currentServerBuild;
    }
    return parseInt(savedBuild, 10);
  });

  const [swNeedRefresh, setSwNeedRefresh] = useState(false);
  const [swUpdateFn, setSwUpdateFn] = useState<(() => Promise<void>) | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [justUpdatedVersion, setJustUpdatedVersion] = useState<string | null>(null);

  useEffect(() => {
    const currentServerBuild = appRelease?.buildId || 3;
    const savedCodeVersion = localStorage.getItem(`haven_code_version_${myRole}`);
    const savedBuild = localStorage.getItem(`haven_installed_build_${myRole}`);

    if (savedCodeVersion !== CLIENT_CODE_VERSION || !savedBuild) {
      localStorage.setItem(`haven_code_version_${myRole}`, CLIENT_CODE_VERSION);
      localStorage.setItem(`haven_installed_build_${myRole}`, String(currentServerBuild));
      setInstalledBuildId(currentServerBuild);
    } else {
      setInstalledBuildId(parseInt(savedBuild, 10));
    }
  }, [myRole]);

  // Register Service Worker in production and subscribe to background Web Push
  useEffect(() => {
    let mounted = true;
    if (import.meta.env.DEV) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            regs.forEach((reg) => reg.unregister().catch(() => {}));
          })
          .catch(() => {});
      }
      return;
    }

    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const updateSW = registerSW({
          onRegisteredSW(_swUrl, registration) {
            subscribeDeviceToWebPush(myRole).catch(() => {});
            if (registration) {
              // Periodically check for new published code updates every 60s
              setInterval(() => {
                registration.update().catch(() => {});
              }, 60 * 1000);
            }
          },
          onNeedRefresh() {
            if (mounted) {
              setSwNeedRefresh(true);
              setSwUpdateFn(() => () => updateSW(true));
            }
          },
          onOfflineReady() {},
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [myRole]);

  const hasNewRelease = appRelease && appRelease.buildId > installedBuildId;
  const showUpdatePrompt = hasNewRelease || swNeedRefresh;

  const handleAcceptUpdate = async () => {
    setIsUpdating(true);
    try {
      if (appRelease) {
        localStorage.setItem(storageKey, String(appRelease.buildId));
        localStorage.setItem(`haven_installed_version_${myRole}`, appRelease.version);
        setInstalledBuildId(appRelease.buildId);
      }
      if (swUpdateFn) {
        await swUpdateFn();
      } else if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
      setSwNeedRefresh(false);
      setJustUpdatedVersion(appRelease?.version || 'latest');
      setTimeout(() => {
        setJustUpdatedVersion(null);
      }, 3000);
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
            Updated to <strong>v{justUpdatedVersion}</strong> · New features applied
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
        {isUpdating ? 'Applying...' : 'Accept Update'}
      </button>
    </div>
  );
};
