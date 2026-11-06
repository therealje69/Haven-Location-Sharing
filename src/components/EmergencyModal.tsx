import React, { useEffect } from 'react';
import { EmergencySession, UserProfile, UserRole, formatPartnerDisplayName } from '../lib/types.js';
import { startEASSiren, stopEASSiren, unlockEmergencyAudioChannel } from '../lib/easAudio.js';
import { PhoneCall, Volume2, ShieldCheck } from 'lucide-react';

interface EmergencyModalProps {
  emergency: EmergencySession | null;
  myRole: UserRole;
  profiles: {
    partner1: UserProfile;
    partner2: UserProfile;
  };
  onDismiss: () => void;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  emergency,
  myRole,
  profiles,
  onDismiss,
}) => {
  // The alert modal is meant for the target recipient whose phone sounds the full-volume alarm
  const isRecipientActive = Boolean(
    emergency && emergency.active && emergency.initiatedBy !== myRole
  );

  useEffect(() => {
    if (!isRecipientActive || !emergency) {
      stopEASSiren();
      return;
    }

    // Force-unlock and start 100% full-volume Emergency Alert System (EAS) siren
    unlockEmergencyAudioChannel();
    startEASSiren(1.0);

    // Trigger system-level critical notification if granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const initiatorId = emergency.initiatedBy;
        const initiatorName = profiles[initiatorId].name;
        const myNickForPartner = profiles[myRole].nicknameForPartner;
        const display = formatPartnerDisplayName(initiatorName, myNickForPartner);
        new Notification('🚨 URGENT HAVEN ALERT', {
          body: `${display} triggered an emergency check-in. Siren active at full volume.`,
          requireInteraction: true,
          tag: 'haven-emergency-alert',
        });
      } catch {
        // Fallback safe
      }
    }

    // Continuous vibration pattern until dismissed
    let vibInterval: number | null = null;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([900, 300, 900, 300, 900]);
        vibInterval = window.setInterval(() => {
          try {
            navigator.vibrate([900, 300, 900]);
          } catch {}
        }, 2500);
      } catch {
        // safe
      }
    }

    return () => {
      stopEASSiren();
      if (vibInterval !== null) clearInterval(vibInterval);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {}
      }
    };
  }, [isRecipientActive, emergency?.startedAt, myRole, profiles]);

  if (!isRecipientActive || !emergency) return null;

  const initiatorId = emergency.initiatedBy;
  const initiatorProfile = profiles[initiatorId];
  const myProfile = profiles[myRole];
  // Use MY private nickname for my partner on my phone
  const initiatorDisplayName = formatPartnerDisplayName(initiatorProfile.name, myProfile.nicknameForPartner);

  const handleDismiss = () => {
    stopEASSiren();
    onDismiss();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-fadeIn">
      <div className="relative w-full max-w-sm rounded-3xl p-5 border border-rose-500/50 shadow-2xl text-center space-y-3.5 overflow-hidden bg-[#241717] text-white">
        {/* Glow */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 bg-rose-500/25 rounded-full blur-2xl pointer-events-none" />

        {/* Top Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/25 text-rose-200 border border-rose-400/40 text-[10px] font-bold tracking-wider uppercase">
          <Volume2 className="w-3.5 h-3.5 animate-bounce text-rose-300" />
          <span>Full-Volume Critical Alert</span>
        </div>

        {/* Icon */}
        <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-50"></span>
          <div className="relative w-13 h-13 rounded-2xl bg-rose-600 shadow-lg flex items-center justify-center text-2xl">
            🚨
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold tracking-tight font-['JetBrains_Mono',monospace]">Urgent Check-in</h2>
          <p className="text-xs text-rose-200 font-medium mt-1 font-['Inter',sans-serif]">
            {initiatorDisplayName} sent an urgent alert to check on you.
          </p>
        </div>

        <div className="bg-black/45 border border-rose-900/60 rounded-2xl p-3 text-left space-y-1.5 text-xs text-rose-200 font-['Inter',sans-serif]">
          <p className="text-[11px] leading-relaxed">
            • Emergency siren is sounding at <strong>100% full volume</strong> (Critical Alert Override).
          </p>
          <p className="text-[11px] leading-relaxed">
            • Live location is shared with {initiatorDisplayName} until you mark yourself safe, which immediately closes location sharing.
          </p>
        </div>

        <div className="space-y-2 pt-1 font-['Inter',sans-serif]">
          <button
            onClick={handleDismiss}
            className="w-full py-3 rounded-xl bg-white hover:bg-stone-100 text-rose-950 font-bold text-xs shadow-lg active:scale-98 transition flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>I Am Safe (Stop Siren & Close Location)</span>
          </button>

          <a
            href="tel:911"
            className="w-full py-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition hover:text-white"
          >
            <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
            <span>Call 911 / Emergency</span>
          </a>
        </div>
      </div>
    </div>
  );
};
