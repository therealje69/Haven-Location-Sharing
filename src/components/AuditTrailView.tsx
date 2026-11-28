import React, { useState } from 'react';
import { AuditLogEntry, UserProfile, UserRole, formatPartnerDisplayName } from '../lib/types.js';
import { formatRelativeTime } from '../lib/tokenEngine.js';
import {
  MAX_HISTORY_EVENTS,
  buildGoogleMapsUrl,
  getRecentAuditEntries,
  isRawCoordinateString,
} from '../lib/locationUtils.js';
import { HavenLogoIcon } from './HavenLogo.js';
import { ArrowLeft, Copy, Check, ExternalLink, MapPin } from 'lucide-react';

interface AuditTrailViewProps {
  auditLog: AuditLogEntry[];
  profiles: {
    partner1: UserProfile;
    partner2: UserProfile;
  };
  myRole: UserRole;
  theme: 'day' | 'night';
  onBack?: () => void;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({
  auditLog,
  profiles,
  myRole,
  theme,
  onBack,
}) => {
  const [copied, setCopied] = useState(false);
  const isDay = theme === 'day';

  const myProfile = profiles[myRole];
  const targetRole: UserRole = myRole === 'partner1' ? 'partner2' : 'partner1';
  const partnerProfile = profiles[targetRole];
  // Strictly use MY device's local nickname for my partner
  const partnerDisplayName = formatPartnerDisplayName(
    partnerProfile.name,
    myProfile.nicknameForPartner
  );

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

  // Strictly show the most recent 25 events
  const recentItems = getRecentAuditEntries(auditLog, MAX_HISTORY_EVENTS);

  const handleCopy = () => {
    const text = recentItems
      .map((e) => {
        const locLabel =
          e.locationSnapshot?.approxAddress &&
          !isRawCoordinateString(e.locationSnapshot.approxAddress)
            ? ` (${e.locationSnapshot.approxAddress})`
            : '';
        return `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.title} - ${formatEntryMessageForMyDevice(e)}${locLabel}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col py-1 text-xs select-none overflow-hidden">
      {/* Header Card */}
      <div
        className={`p-3 rounded-2xl border flex items-center justify-between gap-2 shrink-0 mb-2.5 ${
          isDay ? 'bg-white border-slate-200' : 'bg-[#091326] border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Settings"
              className={`p-1.5 rounded-xl border shrink-0 transition ${
                isDay
                  ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
                  : 'border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="min-w-0">
            <h3 className="font-bold text-xs flex items-center gap-1.5 font-['JetBrains_Mono',monospace]">
              <HavenLogoIcon size={16} />
              <span>History</span>
              <span className="text-[10px] font-mono text-slate-400 font-normal">
                ({recentItems.length}/{MAX_HISTORY_EVENTS})
              </span>
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate font-['Inter',sans-serif]">
              Most recent {MAX_HISTORY_EVENTS} events with {partnerDisplayName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border flex items-center gap-1 shrink-0 transition ${
            isDay
              ? 'border-slate-200 hover:bg-slate-100 text-slate-600'
              : 'border-slate-700 hover:bg-slate-800 text-slate-300'
          }`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Export'}</span>
        </button>
      </div>

      {/* Scrollable Recent 25 Events List */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2 pr-0.5">
        {recentItems.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            No recent check-ins yet.
          </div>
        ) : (
          recentItems.map((entry) => {
            const isEmergency = entry.type === 'emergency_override';
            const isMe = entry.actor === myRole;
            const snapshot = entry.locationSnapshot;
            const hasSafeAddress =
              snapshot?.approxAddress && !isRawCoordinateString(snapshot.approxAddress);
            const mapsUrl = snapshot
              ? buildGoogleMapsUrl(snapshot.lat, snapshot.lng, snapshot.placeId)
              : null;

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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isEmergency ? 'bg-rose-500' : 'bg-blue-600'
                      }`}
                    ></span>
                    <span className="font-bold text-xs truncate">{entry.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {isMe ? '(you)' : `(${partnerDisplayName})`}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {formatRelativeTime(entry.timestamp, Date.now())}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {formatEntryMessageForMyDevice(entry)}
                </p>

                {snapshot && mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium hover:underline max-w-full ${
                      isDay ? 'text-blue-600' : 'text-[#2DD4BF]'
                    }`}
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {hasSafeAddress ? snapshot.approxAddress : 'View on Google Maps'}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="text-[10px] text-center text-slate-400 pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 shrink-0">
        Showing up to the {MAX_HISTORY_EVENTS} most recent shared events.
      </div>
    </div>
  );
};
