import React, { useState } from 'react';
import { UserRole, isDefaultUnsetName } from '../lib/types.js';
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
  defaultNickname = '',
  onComplete,
  onClose,
  theme,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(() => (isDefaultUnsetName(defaultName) ? '' : defaultName));
  const [nickname, setNickname] = useState(defaultNickname || '');
  const [locationAllowed, setLocationAllowed] = useState(true);
  const [notificationsAllowed, setNotificationsAllowed] = useState(true);
  const [criticalAlertsAllowed, setCriticalAlertsAllowed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDay = theme === 'day';

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleFinish = async (overrideCriticalAllowed?: boolean) => {
    const finalCriticalAllowed =
      overrideCriticalAllowed !== undefined ? overrideCriticalAllowed : criticalAlertsAllowed;
    const finalName = name.trim() || 'Name';

    setIsSubmitting(true);
    try {
      if (finalCriticalAllowed) {
        unlockEmergencyAudioChannel();
      }
      if (
        notificationsAllowed &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default'
      ) {
        await Notification.requestPermission().catch(() => {});
      }
      await onComplete(finalName, nickname.trim(), finalCriticalAllowed);
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
          <h2 className="text-lg font-bold tracking-tight font-['JetBrains_Mono',monospace]">Haven</h2>
          <p className="text-xs text-slate-400 font-['Inter',sans-serif]">
            {step === 1 ? 'Profile' : 'Permissions'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNextStep} className="space-y-3.5 font-['Inter',sans-serif]">
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium placeholder:text-slate-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Partner Nickname <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Nickname"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium placeholder:text-slate-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isDay
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-100'
                }`}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-md shadow-blue-500/20"
            >
              <span>Continue</span>
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
                    <div className="text-[10px] text-slate-400">Shares location during check-ins</div>
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

              {/* 2. Background Notifications */}
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
                    <div className="text-xs font-semibold">Background Notifications</div>
                    <div className="text-[10px] text-slate-400">Alerts when your location is viewed</div>
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

              {/* 3. Emergency Override */}
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
                    <div className="text-xs font-semibold">Emergency Alert Override</div>
                    <div className="text-[10px] text-slate-400">
                      Full-volume alert and lock-screen pop-up
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

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleFinish(false)}
                disabled={isSubmitting}
                className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                  isDay
                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => handleFinish(criticalAlertsAllowed)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] hover:to-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.99] shadow-md shadow-blue-500/20"
              >
                <HavenLogoIcon size={16} />
                <span>{isSubmitting ? 'Saving...' : 'Continue'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
