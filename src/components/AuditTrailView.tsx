import React, { useState } from 'react';
import { AuditLogEntry, UserProfile, UserRole, formatPartnerDisplayName } from '../lib/types.js';
import { formatRelativeTime } from '../lib/tokenEngine.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { Copy, Check } from 'lucide-react';

interface AuditTrailViewProps {
  auditLog: AuditLogEntry[];
  profiles: {
    partner1: UserProfile;
    partner2: UserProfile;
  };
  myRole: UserRole;
  theme: 'day' | 'night';
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  auditLog,
  profiles,
  myRole,
  theme,
}) => {
  const [copied, setCopied] = useState(false);
  const isDay = theme === 'day';

  const myProfile = profiles[myRole];
  const targetRole: UserRole = myRole === 'partner1' ? 'partner2' : 'partner1';
  const partnerProfile = profiles[targetRole];
  // Strictly use MY device's local nickname for my partner
  const partnerDisplayName = formatPartnerDisplayName(partnerProfile.name, myProfile.nicknameForPartner);

  const formatEntryMessageForMyDevice = (entry: AuditLogEntry): string => {
    const isMeActor = entry.actor === myRole;
    switch (entry.type) {
      case 'standard_ping':
        return isMeActor
          ? `You viewed ${partnerDisplayName}'s location.`
          : `${partnerDisplayName} viewed your location.`;
      case 'emergency_override':
        return isMeActor
          ? `You sent an urgent alert to ${partnerDisplayName}.`
          : `${partnerDisplayName} sent an urgent alert to check on you.`;
      case 'emergency_dismissed':
        return isMeActor
          ? `You marked yourself safe and closed urgent location sharing.`
          : `${partnerDisplayName} marked themselves safe and closed urgent location sharing.`;
      default:
        return entry.message;
    }
  };

  const handleCopy = () => {
    const text = auditLog
      .map(
        (e) =>
          `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.title} - ${formatEntryMessageForMyDevice(e)}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Only show the recent 4 items so it never overflows or requires a scroll wheel
  const recentItems = auditLog.slice(0, 4);

  return (
    <div className="h-full flex flex-col justify-between py-1 text-xs select-none overflow-y-auto no-scrollbar">
      <div className="space-y-2.5">
        {/* Header Card */}
        <div
          className={`p-3 rounded-2xl border flex items-center justify-between ${
            isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
          }`}
        >
          <div>
            <h3 className="font-bold text-xs flex items-center gap-1.5 font-['JetBrains_Mono',monospace]">
              <HavenLogoIcon size={16} />
              <span>Shared History</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 font-['Inter',sans-serif]">
              Open records of check-ins between you and {partnerDisplayName}.
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border flex items-center gap-1 transition ${
              isDay
                ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
                : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Export'}</span>
          </button>
        </div>

        {/* Recent Check-ins List (compact, fits without scrollbar) */}
        <div className="space-y-2">
          {recentItems.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              No recent check-ins yet.
            </div>
          ) : (
            recentItems.map((entry) => {
              const isEmergency = entry.type === 'emergency_override';
              const isMe = entry.actor === myRole;

              return (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded-xl border transition ${
                    isEmergency
                      ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                      : isDay
                      ? 'bg-white border-slate-200'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isEmergency ? 'bg-rose-500' : 'bg-blue-600'
                        }`}
                      ></span>
                      <span className="font-bold text-xs">{entry.title}</span>
                      <span className="text-[10px] text-slate-400">
                        {isMe ? '(by you)' : `(by ${partnerDisplayName})`}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400">
                      {formatRelativeTime(entry.timestamp, Date.now())}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                    {formatEntryMessageForMyDevice(entry)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-[10px] text-center text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
        Both of you can always see when a check-in occurred.
      </div>
    </div>
  );
};
