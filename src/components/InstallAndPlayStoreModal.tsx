import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../lib/types.js';
import { usePWAInstall } from './PWAInstallAndUpdate.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { serializeHavenManifest } from '../lib/pwaManifest.js';
import {
  Download,
  Smartphone,
  Check,
  Copy,
  Package,
  ShieldCheck,
  Share2,
  Users,
  FileJson,
  Eye,
  EyeOff,
} from 'lucide-react';

interface InstallAndPlayStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Record<UserRole, UserProfile>;
  currentRole: UserRole | null;
  onSelectDeviceRole: (role: UserRole) => void;
  onOpenDualSimulator?: () => void;
  isDay: boolean;
}

export const InstallAndPlayStoreModal: React.FC<InstallAndPlayStoreModalProps> = ({
  isOpen,
  onClose,
  profiles,
  currentRole,
  onSelectDeviceRole,
  onOpenDualSimulator,
  isDay,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'install' | 'apk'>('install');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showManifestPreview, setShowManifestPreview] = useState(false);

  const [packageName, setPackageName] = useState('app.haven.locationshare');
  const [sha256Fingerprint, setSha256Fingerprint] = useState('');
  const [savedAssetLinks, setSavedAssetLinks] = useState(false);

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const manifestUrl = `${appOrigin}/manifest.json`;
  const manifestJsonText = serializeHavenManifest();
  const phone1Url = `${appOrigin}/?user=partner1`;
  const phone2Url = `${appOrigin}/?user=partner2`;

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/android-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (data.packageName) setPackageName(data.packageName);
          if (data.sha256Fingerprint) setSha256Fingerprint(data.sha256Fingerprint);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleSaveAssetLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/android-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName, sha256Fingerprint }),
      });
      setSavedAssetLinks(true);
      setTimeout(() => setSavedAssetLinks(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadManifest = (format: 'json' | 'webmanifest' = 'json') => {
    const filename = format === 'webmanifest' ? 'manifest.webmanifest' : 'manifest.json';
    const blob = new Blob([manifestJsonText], { type: 'application/manifest+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBubblewrapScript = () => {
    const scriptContent = `#!/usr/bin/env bash
# Haven Android APK & Google Play Store (.aab) Builder
# Prerequisite: Node.js 18+ and npx

echo "Building Haven Android APK & Play Store Bundle from ${appOrigin}..."
npx @bubblewrap/cli init --manifest="${appOrigin}/manifest.json"
npx @bubblewrap/cli build
echo "Done! Your installable app-release-signed.apk and app-release-bundle.aab (for Google Play Store) are ready."
`;
    const blob = new Blob([scriptContent], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-haven-apk.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div
        className={`w-full max-w-md max-h-[90dvh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${
          isDay
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-[#091326] border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-4 py-3.5 border-b flex items-center justify-between ${
            isDay ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-slate-900/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <HavenLogoIcon size={20} />
            <div>
              <h2 className="text-xs font-bold font-['JetBrains_Mono',monospace]">
                Install Haven & Android APK / Play Store
              </h2>
              <p className="text-[10px] text-slate-400">
                Full-screen phone app · Zero studio frame
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 rounded-lg text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Mode Tabs */}
        <div
          className={`grid grid-cols-2 gap-1.5 p-2.5 border-b text-xs font-semibold ${
            isDay ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <button
            onClick={() => setActiveTab('install')}
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition text-[11px] ${
              activeTab === 'install'
                ? 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>1. Direct Phone Install</span>
          </button>

          <button
            onClick={() => setActiveTab('apk')}
            className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition text-[11px] ${
              activeTab === 'apk'
                ? 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>2. Get .APK & Play Store</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto no-scrollbar space-y-3.5 text-xs">
          {activeTab === 'install' ? (
            <>
              {/* Step 1: Bind Which Phone This Is */}
              <div
                className={`p-3 rounded-2xl border space-y-2 ${
                  isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] flex items-center justify-between">
                  <span>Step 1: Which phone are you holding right now?</span>
                  <span className="text-[10px] text-[#2DD4BF] font-mono">Full-Screen Mode</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onSelectDeviceRole('partner1')}
                    className={`py-2.5 px-3 rounded-xl border text-left transition ${
                      currentRole === 'partner1'
                        ? 'border-[#3B82F6] bg-blue-500/15 text-[#3B82F6] dark:text-[#2DD4BF] font-bold'
                        : isDay
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="text-[10px] opacity-75">Phone 1</div>
                    <div className="text-xs font-bold truncate">{profiles.partner1.name}</div>
                  </button>

                  <button
                    onClick={() => onSelectDeviceRole('partner2')}
                    className={`py-2.5 px-3 rounded-xl border text-left transition ${
                      currentRole === 'partner2'
                        ? 'border-[#3B82F6] bg-blue-500/15 text-[#3B82F6] dark:text-[#2DD4BF] font-bold'
                        : isDay
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="text-[10px] opacity-75">Phone 2</div>
                    <div className="text-xs font-bold truncate">{profiles.partner2.name}</div>
                  </button>
                </div>
              </div>

              {/* Step 2: Install to Home Screen / Android WebAPK */}
              <div
                className={`p-3 rounded-2xl border space-y-2.5 ${
                  isDay ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-950/30 border-blue-900/50'
                }`}
              >
                <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <span>Step 2: Install Haven on This Phone</span>
                </div>

                {isInstalled ? (
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 font-semibold text-[11px] flex items-center gap-1.5">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Haven is installed on this device!</span>
                  </div>
                ) : isInstallable ? (
                  <button
                    onClick={install}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install Haven App Now</span>
                  </button>
                ) : (
                  <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {isIOS ? (
                      <p>
                        On iPhone Safari: Tap the <strong>Share</strong> icon at the bottom of the screen, then tap <strong>Add to Home Screen</strong>.
                      </p>
                    ) : (
                      <p>
                        On Android Chrome: Tap the <strong>⋮ (three dots menu)</strong> in the top-right corner and tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>). Android automatically compiles and installs a native WebAPK to your app drawer.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Send Direct Link to Partner's Phone */}
              <div
                className={`p-3 rounded-2xl border space-y-2 ${
                  isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
                  <span>Direct Links for Each Phone (No Studio View)</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#3B82F6] dark:text-[#2DD4BF]">
                        {profiles.partner1.name}'s Direct App Link:
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">{phone1Url}</div>
                    </div>
                    <button
                      onClick={() => copyText(phone1Url, 'p1')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#3B82F6] text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
                    >
                      {copiedKey === 'p1' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'p1' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-[#3B82F6] dark:text-[#2DD4BF]">
                        {profiles.partner2.name}'s Direct App Link:
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">{phone2Url}</div>
                    </div>
                    <button
                      onClick={() => copyText(phone2Url, 'p2')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#3B82F6] text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
                    >
                      {copiedKey === 'p2' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === 'p2' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {onOpenDualSimulator && (
                <button
                  onClick={() => {
                    onOpenDualSimulator();
                    onClose();
                  }}
                  className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Switch to Dual-Phone Studio Preview (Desktop Testing)</span>
                </button>
              )}
            </>
          ) : (
            <>
              {/* Web App Manifest Download & PWABuilder Readiness Card */}
              <div
                className={`p-3 rounded-2xl border space-y-2.5 ${
                  isDay ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-950/30 border-blue-900/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] text-[#3B82F6] dark:text-[#2DD4BF] flex items-center gap-1.5">
                    <FileJson className="w-3.5 h-3.5 shrink-0" />
                    <span>Web App Manifest (PWABuilder)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManifestPreview((prev) => !prev)}
                    className="text-[10px] font-semibold text-[#3B82F6] dark:text-[#2DD4BF] hover:underline flex items-center gap-1"
                  >
                    {showManifestPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showManifestPreview ? 'Hide JSON' : 'Preview'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Served live at <code>/manifest.json</code> and <code>/manifest.webmanifest</code> with 192px, 512px, and maskable PNG icons. Download or copy it directly below:
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadManifest('json')}
                    className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:from-[#2563EB] hover:to-[#1D4ED8] text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>manifest.json</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadManifest('webmanifest')}
                    className={`py-2 px-2.5 rounded-xl border font-bold text-[11px] flex items-center justify-center gap-1.5 transition ${
                      isDay
                        ? 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                        : 'bg-slate-900 border-blue-800/70 text-[#2DD4BF] hover:bg-slate-800'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>.webmanifest</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <code className="flex-1 p-1.5 rounded-lg bg-white/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[10px] truncate">
                    {manifestUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(manifestUrl, 'manifestUrl')}
                    className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                      isDay
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {copiedKey === 'manifestUrl' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'manifestUrl' ? 'Copied' : 'URL'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(manifestJsonText, 'manifestJson')}
                    className="px-2 py-1.5 rounded-lg bg-[#3B82F6] text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
                  >
                    {copiedKey === 'manifestJson' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'manifestJson' ? 'Copied' : 'JSON'}</span>
                  </button>
                </div>

                {showManifestPreview && (
                  <pre className="p-2.5 rounded-xl bg-slate-950 text-emerald-300 font-mono text-[10px] overflow-x-auto max-h-48 overflow-y-auto border border-slate-800 select-text">
                    {manifestJsonText}
                  </pre>
                )}

                <div
                  className={`p-2 rounded-xl text-[10px] leading-relaxed border ${
                    isDay
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-950/40 border-amber-800/50 text-amber-200'
                  }`}
                >
                  <strong>PWABuilder tip:</strong> Private AI Studio preview links (<code>ais-dev-*</code> / <code>ais-pre-*</code>) require Google sign-in, which prevents PWABuilder from reading the page and causes a &ldquo;No manifest&rdquo; error. Deploy the app to a public URL (no login wall) before scanning on <strong>pwabuilder.com</strong>, or use the downloaded <code>manifest.json</code> above.
                </div>
              </div>

              {/* Tab 2: Generate Downloadable .APK & Google Play Store .AAB */}
              <div
                className={`p-3 rounded-2xl border space-y-2 ${
                  isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] text-[#3B82F6] dark:text-[#2DD4BF]">
                  Generate Signed .APK & Google Play Store Bundle (.AAB)
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-300 leading-relaxed">
                  Haven is pre-configured with a Google Play Store <strong>Trusted Web Activity (TWA)</strong> manifest and <code>/.well-known/assetlinks.json</code> endpoint. You can generate a standalone <strong>.apk</strong> file (to install directly on both phones) and a <strong>.aab</strong> bundle (for Google Play Console) in 60 seconds:
                </p>

                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                  <li>
                    Copy your live published URL below:
                    <div className="mt-1 flex items-center gap-1.5">
                      <code className="flex-1 p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-950 font-mono text-[10px] truncate">
                        {appOrigin}
                      </code>
                      <button
                        onClick={() => copyText(appOrigin, 'origin')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#3B82F6] text-white text-[10px] font-bold shrink-0 flex items-center gap-1"
                      >
                        {copiedKey === 'origin' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'origin' ? 'Copied!' : 'Copy URL'}</span>
                      </button>
                    </div>
                  </li>
                  <li>
                    Go to <strong>pwabuilder.com</strong>, paste your public deployed URL, and click <strong>Start</strong>.
                  </li>
                  <li>
                    Click <strong>Package for stores</strong> → <strong>Android</strong> → <strong>Download Package</strong>.
                  </li>
                  <li>
                    Open the downloaded zip:
                    <ul className="list-disc list-inside pl-3 mt-1 space-y-0.5 text-[10px] text-slate-400">
                      <li><strong>Haven.apk</strong>: Send to your & your partner's phones to install directly.</li>
                      <li><strong>Haven.aab</strong>: Upload to <strong>play.google.com/console</strong> for the Google Play Store.</li>
                    </ul>
                  </li>
                </ol>

                <div className="pt-1 flex gap-2">
                  <button
                    onClick={handleDownloadBubblewrapScript}
                    className="w-full py-2 px-3 rounded-xl border border-blue-500/40 bg-blue-500/10 text-[#3B82F6] dark:text-[#2DD4BF] font-bold text-[11px] flex items-center justify-center gap-1.5 hover:bg-blue-500/20 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CLI Build Script (build-haven-apk.sh)</span>
                  </button>
                </div>
              </div>

              {/* Android Digital Asset Links (assetlinks.json) Config */}
              <form
                onSubmit={handleSaveAssetLinks}
                className={`p-3 rounded-2xl border space-y-2 ${
                  isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[11px] font-['JetBrains_Mono',monospace] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    <span>Android Full-Screen Signing (assetlinks.json)</span>
                  </div>
                  {savedAssetLinks && (
                    <span className="text-[10px] text-emerald-500 font-bold">Saved!</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Paste your Android package name & SHA-256 fingerprint from PWABuilder or Google Play Console so your installed APK runs full-screen with zero browser bar:
                </p>

                <div className="space-y-1.5">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Package ID:</label>
                    <input
                      type="text"
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                      placeholder="app.haven.locationshare"
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                        isDay
                          ? 'bg-white border-slate-200 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">SHA-256 Certificate Fingerprint:</label>
                    <input
                      type="text"
                      value={sha256Fingerprint}
                      onChange={(e) => setSha256Fingerprint(e.target.value)}
                      placeholder="AA:BB:CC:DD:..."
                      className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                        isDay
                          ? 'bg-white border-slate-200 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 rounded-xl bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold text-[11px] transition"
                >
                  Save to /.well-known/assetlinks.json
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
