import React, { useState } from 'react';
import { UserRole } from '../lib/types.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { unlockEmergencyAudioChannel } from '../lib/easAudio.js';
import { MapPin, Bell, Volume2, ArrowRight, Check } from 'lucide-react';

interface OnboardingModalProps {
  myRole: UserRole;
  defaultName: string;
  partnerRealName: string;
  defaultNickname?: string;
  onComplete: (name: string, nicknameForPartner: string, criticalAlertsAllowed: boolean) => Promise<void>;
  onClose?: () => void;
  theme: 'day' | 'night';
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  defaultName,
  partnerRealName,
  defaultNickname = '',
  onComplete,
  onClose,
  theme,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(defaultName || '');
  const [nickname, setNickname] = useState(defaultNickname || '');
  const [locationAllowed, setLocationAllowed] = useState(true);
  const [notificationsAllowed, setNotificationsAllowed] = useState(true);
  const [criticalAlertsAllowed, setCriticalAlertsAllowed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isDay = theme === 'day';

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name to continue');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleFinish = async () => {
    if (!name.trim()) return;
    if (!locationAllowed || !notificationsAllowed || !criticalAlertsAllowed) {
      setError('Please approve all required safety and critical alert permissions to complete setup.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      // Unlock full-volume emergency audio channel and request system notification permission
      unlockEmergencyAudioChannel();
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => {});
      }
      await onComplete(name.trim(), nickname.trim(), criticalAlertsAllowed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm select-none animate-fadeIn">
      <div
        className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4 ${
          isDay
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-[#091326] border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="text-center space-y-1 relative">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 top-0 text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-lg"
            >
              ✕
            </button>
          )}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-1">
            <HavenLogoIcon size={26} />
          </div>
          <h2 className="text-lg font-bold tracking-tight font-['JetBrains_Mono',monospace]">Welcome to Haven</h2>
          <p className="text-xs text-slate-400 font-['Inter',sans-serif]">
            {step === 1 ? 'Step 1 of 2 · Your Device Identity' : 'Step 2 of 2 · Safety & Critical Alert Permissions'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="space-y-3.5 font-['Inter',sans-serif]">
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Your Name <span className="text-blue-600">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan"
                autoFocus
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                    : 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Only editable on your phone. {partnerRealName} will see this name on their device.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Your Nickname for {partnerRealName} <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder='e.g. The King'
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                    : 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Private to your screen only: shown as <strong>{partnerRealName}{nickname.trim() ? ` "${nickname.trim()}"` : ''}</strong>. Does not change {partnerRealName}'s device.
              </p>
            </div>

            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-md shadow-blue-500/20"
            >
              <span>Continue to Permissions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <div className="space-y-3 font-['Inter',sans-serif]">
            <div className="space-y-2">
              {/* 1. Location Access */}
              <div
                onClick={() => setLocationAllowed(!locationAllowed)}
                className={`p-2.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  locationAllowed
                    ? isDay
                      ? 'bg-blue-50/70 border-blue-200'
                      : 'bg-blue-950/25 border-blue-800/40'
                    : isDay
                    ? 'bg-white border-slate-200'
                    : 'bg-[#091326] border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-[#3B82F6] shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Location Access</div>
                    <div className="text-[10px] text-slate-400">Shares precise location only during an active check-in</div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 ${
                    locationAllowed ? 'bg-[#3B82F6]' : 'border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {locationAllowed && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              {/* 2. Check-in Notifications */}
              <div
                onClick={() => setNotificationsAllowed(!notificationsAllowed)}
                className={`p-2.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  notificationsAllowed
                    ? isDay
                      ? 'bg-blue-50/70 border-blue-200'
                      : 'bg-blue-950/25 border-blue-800/40'
                    : isDay
                    ? 'bg-white border-slate-200'
                    : 'bg-[#091326] border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-[#3B82F6] shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Explicit Check-in Notifications</div>
                    <div className="text-[10px] text-slate-400">Pop-up alert whenever your partner views your location</div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 ${
                    notificationsAllowed ? 'bg-[#3B82F6]' : 'border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {notificationsAllowed && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>

              {/* 3. Critical Emergency Alert Override (Amber/Weather Alert Full-Volume Siren) */}
              <div
                onClick={() => setCriticalAlertsAllowed(!criticalAlertsAllowed)}
                className={`p-2.5 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                  criticalAlertsAllowed
                    ? isDay
                      ? 'bg-rose-50/80 border-rose-200'
                      : 'bg-rose-950/30 border-rose-800/50'
                    : isDay
                    ? 'bg-white border-slate-200'
                    : 'bg-[#091326] border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/15 text-rose-500 shrink-0">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Critical Emergency Siren (Full Volume)</div>
                    <div className="text-[10px] text-slate-400">
                      Sounds emergency alert at 100% volume (like Amber / Weather alerts) regardless of phone volume state
                    </div>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 ${
                    criticalAlertsAllowed ? 'bg-rose-600' : 'border border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {criticalAlertsAllowed && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
            </div>

            {error && <p className="text-[11px] text-rose-500 font-medium">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                  isDay
                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-md shadow-blue-500/20"
              >
                <HavenLogoIcon size={16} />
                <span>{isSubmitting ? 'Setting up...' : 'Approve & Start Haven'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
