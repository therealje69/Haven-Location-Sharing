import React, { useState, useEffect } from 'react';
import { AppReleaseInfo, GoogleAuthProfile, ThemeMode, UserProfile, UserRole, formatPartnerDisplayName } from '../lib/types.js';
import { formatRefreshTime } from '../lib/tokenEngine.js';
import { playEASPreview, unlockEmergencyAudioChannel } from '../lib/easAudio.js';
import {
  User,
  Sun,
  Moon,
  Laptop,
  LogOut,
  LogIn,
  Volume2,
  Check,
  Clock,
  ShieldCheck,
  RefreshCw,
  Lock
} from 'lucide-react';

interface SettingsViewProps {
  myRole: UserRole;
  myProfile: UserProfile;
  partnerProfile: UserProfile;
  tokensRemaining: number;
  msUntilRefresh: number | null;
  appRelease: AppReleaseInfo;
  onUpdateProfile: (role: UserRole, update: Partial<UserProfile>) => Promise<void>;
  onResetTokens: () => Promise<void>;
  onToggleLogout: (loggedOut: boolean) => Promise<void>;
  onPushAppUpdate: () => Promise<void>;
  onOpenSetup: () => void;
  theme: 'day' | 'night';
  onThemeModeChange: (mode: ThemeMode) => void;
  currentThemeMode: ThemeMode;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  myRole,
  myProfile,
  partnerProfile,
  tokensRemaining,
  msUntilRefresh,
  appRelease,
  onUpdateProfile,
  onResetTokens,
  onToggleLogout,
  onPushAppUpdate,
  onOpenSetup,
  theme,
  onThemeModeChange,
  currentThemeMode,
}) => {
  const isDay = theme === 'day';

  const [name, setName] = useState(myProfile.name);
  const [nickname, setNickname] = useState(myProfile.nicknameForPartner || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testToneActive, setTestToneActive] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Strictly synchronize local form inputs when switching devices or when this device's profile updates
  useEffect(() => {
    setName(myProfile.name);
    setNickname(myProfile.nicknameForPartner || '');
  }, [myRole, myProfile.name, myProfile.nicknameForPartner]);

  const handleSaveNames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onUpdateProfile(myRole, {
      name: name.trim(),
      nicknameForPartner: nickname.trim(),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleToggleCriticalAlerts = async () => {
    unlockEmergencyAudioChannel();
    const nextVal = !(myProfile.criticalAlertsAllowed ?? true);
    await onUpdateProfile(myRole, { criticalAlertsAllowed: nextVal });
  };

  const handleGoogleAuthSim = async () => {
    if (myProfile.googleUser) {
      await onUpdateProfile(myRole, { googleUser: null });
    } else {
      const mockGoogle: GoogleAuthProfile = {
        email: `${myProfile.name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        name: myProfile.name,
        picture: 'https://lh3.googleusercontent.com/a/default-user',
      };
      await onUpdateProfile(myRole, { googleUser: mockGoogle });
    }
  };

  const handleResetTokensClick = async () => {
    await onResetTokens();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const handleTestTone = async () => {
    setTestToneActive(true);
    await playEASPreview(1800);
    setTestToneActive(false);
  };

  const handlePushUpdateClick = async () => {
    await onPushAppUpdate();
    setPushSuccess(true);
    setTimeout(() => setPushSuccess(false), 2500);
  };

  const previewPartnerDisplay = formatPartnerDisplayName(partnerProfile.name, nickname);
  const criticalEnabled = myProfile.criticalAlertsAllowed ?? true;

  return (
    <div className="h-full flex flex-col justify-between py-1 text-xs select-none overflow-y-auto no-scrollbar">
      <div className="space-y-2.5">
        {/* 1. Daily Check-in Balance (5 daily allowance) */}
        <div
          className={`p-3 rounded-2xl border ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#2DD4BF]"></span>
              <span className="font-bold tracking-tight text-xs font-['JetBrains_Mono',monospace]">Daily Check-ins</span>
            </div>
            <span className="font-mono text-xs font-bold text-[#3B82F6] dark:text-[#2DD4BF]">
              {tokensRemaining} of 5 ready
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-['Inter',sans-serif]">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{tokensRemaining === 5 ? 'Full allowance available' : `Next ready: ${formatRefreshTime(msUntilRefresh)}`}</span>
            </span>
            <button
              onClick={handleResetTokensClick}
              className="text-[10px] text-[#3B82F6] dark:text-[#2DD4BF] font-semibold hover:underline"
            >
              {resetSuccess ? 'Replenished!' : 'Replenish'}
            </button>
          </div>
        </div>

        {/* 2. Per-Device Name & Private Partner Nickname */}
        <form
          onSubmit={handleSaveNames}
          className={`p-3 rounded-2xl border space-y-2 ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs font-['JetBrains_Mono',monospace]">
              <User className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span>Your Identity & Nickname</span>
            </div>
            {savedSuccess && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved on your device
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5 truncate">
                Your Name (only you can edit):
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            <div>
              <label className="text-[10px] font-medium text-slate-500 block mb-0.5 truncate">
                Nickname for {partnerProfile.name}:
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder='Optional (e.g. The King)'
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400 gap-2">
            <div className="truncate">
              <span>Partner on your screen: </span>
              <strong className="text-slate-700 dark:text-slate-300">{previewPartnerDisplay}</strong>
              <span className="inline-flex items-center gap-0.5 ml-1 text-[9px] text-slate-400">
                (<Lock className="w-2.5 h-2.5 inline" /> {partnerProfile.name}'s name is locked to their phone)
              </span>
            </div>
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white font-semibold text-[10px] transition shrink-0"
            >
              Save
            </button>
          </div>
        </form>

        {/* 3. Critical Emergency Siren Override (100% Full Volume like Amber/Weather Alerts) */}
        <div
          className={`p-3 rounded-2xl border space-y-2 ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-rose-500" />
              <span className="font-bold text-xs font-['JetBrains_Mono',monospace]">Critical Alert Override</span>
            </div>
            <button
              type="button"
              onClick={handleToggleCriticalAlerts}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
                criticalEnabled
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {criticalEnabled ? '100% Full Volume ON' : 'Muted'}
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 gap-2">
            <span className="truncate">
              Plays urgent siren at full volume (Amber/Weather alert style).
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenSetup}
                className="text-[#3B82F6] dark:text-[#2DD4BF] font-semibold hover:underline"
              >
                Permissions
              </button>
              <button
                type="button"
                onClick={handleTestTone}
                className="text-rose-600 dark:text-rose-400 font-semibold hover:underline"
              >
                {testToneActive ? 'Playing...' : 'Test Siren'}
              </button>
            </div>
          </div>
        </div>

        {/* 4. Theme Mode (Day, Night, System) */}
        <div
          className={`p-2.5 rounded-2xl border ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div className="grid grid-cols-3 gap-1.5 font-['Inter',sans-serif]">
            <button
              type="button"
              onClick={() => onThemeModeChange('day')}
              className={`py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition ${
                currentThemeMode === 'day'
                  ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Day</span>
            </button>

            <button
              type="button"
              onClick={() => onThemeModeChange('night')}
              className={`py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition ${
                currentThemeMode === 'night'
                  ? 'bg-slate-800 border-[#3B82F6] text-[#2DD4BF] shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Night</span>
            </button>

            <button
              type="button"
              onClick={() => onThemeModeChange('system')}
              className={`py-1.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition ${
                currentThemeMode === 'system'
                  ? 'bg-blue-50 dark:bg-slate-800 border-blue-400 text-blue-700 dark:text-[#2DD4BF] shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>System</span>
            </button>
          </div>
        </div>

        {/* 5. Seamless OTA App Updates & Google Account */}
        <div
          className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div className="min-w-0">
            <div className="font-bold text-xs font-['JetBrains_Mono',monospace] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
              <span>Haven v{appRelease?.version || '1.2.0'}</span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              OTA updates preserve all settings without reinstalling
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePushUpdateClick}
              className="px-2 py-1 rounded-lg border border-blue-500/30 bg-blue-500/10 text-[#3B82F6] dark:text-[#2DD4BF] text-[10px] font-semibold flex items-center gap-1 hover:bg-blue-500/20 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{pushSuccess ? 'Update Pushed!' : 'Push OTA Update'}</span>
            </button>
            <button
              type="button"
              onClick={handleGoogleAuthSim}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                myProfile.googleUser
                  ? 'border border-slate-300 dark:border-slate-700 text-slate-500'
                  : 'bg-[#3B82F6] text-white'
              }`}
            >
              {myProfile.googleUser ? 'Linked' : 'Google'}
            </button>
          </div>
        </div>
      </div>

      {/* 6. Bottom Control: Log Out / Pause */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={() => onToggleLogout(!myProfile.isLoggedOut)}
          className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            myProfile.isLoggedOut
              ? 'bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white border-blue-600 shadow-sm'
              : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          {myProfile.isLoggedOut ? (
            <>
              <LogIn className="w-3.5 h-3.5" />
              <span>Log Back In (Ready for Check-ins)</span>
            </>
          ) : (
            <>
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Log Out (Pause Location Requests)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
