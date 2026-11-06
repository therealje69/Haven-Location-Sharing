import { AuditLogEntry, EmergencySession, LocationCoordinate, PingRecord, UserRole } from './types.js';

export const MAX_DAILY_TOKENS = 5;
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TOKEN_COOLDOWN_MS = 60 * 1000; // 1 minute (60 seconds) cooldown between calls
export const STANDARD_VIEW_DURATION_MS = 60 * 1000; // 60 seconds (1 minute)
export const EMERGENCY_HOLD_DURATION_MS = 3000; // 3 seconds

/**
 * Filters pings for a specific user within the 24-hour rolling window.
 */
export function getPingsInRollingWindow(
  pings: PingRecord[],
  userId: UserRole,
  now: number
): PingRecord[] {
  const windowStart = now - ROLLING_WINDOW_MS;
  return pings.filter(
    (p) => p.requesterId === userId && p.type === 'standard' && p.timestamp >= windowStart
  );
}

/**
 * Calculates remaining tokens and the timestamp when the oldest token will replenish.
 */
export function calculateTokenStatus(
  pings: PingRecord[],
  userId: UserRole,
  now: number
): {
  tokensRemaining: number;
  usedInWindow: number;
  nextRefreshAt: number | null;
  msUntilNextRefresh: number | null;
} {
  const activePings = getPingsInRollingWindow(pings, userId, now);
  activePings.sort((a, b) => a.timestamp - b.timestamp);

  const usedInWindow = activePings.length;
  const tokensRemaining = Math.max(0, MAX_DAILY_TOKENS - usedInWindow);

  let nextRefreshAt: number | null = null;
  let msUntilNextRefresh: number | null = null;

  if (activePings.length > 0) {
    const oldest = activePings[0];
    nextRefreshAt = oldest.timestamp + ROLLING_WINDOW_MS;
    msUntilNextRefresh = Math.max(0, nextRefreshAt - now);
  }

  return {
    tokensRemaining,
    usedInWindow,
    nextRefreshAt,
    msUntilNextRefresh,
  };
}

/**
 * Checks if a user is authorized to request location.
 * Enforces 1-minute cooldown block and 5 daily limit.
 */
export function canRequestLocation(
  pings: PingRecord[],
  userId: UserRole,
  now: number,
  isEmergency = false
): { allowed: boolean; reason?: string } {
  if (isEmergency) {
    return { allowed: true };
  }

  // Check 1-minute cooldown block since most recent standard request
  const userPings = pings
    .filter((p) => p.requesterId === userId && p.type === 'standard')
    .sort((a, b) => b.timestamp - a.timestamp);

  if (userPings.length > 0) {
    const lastPing = userPings[0];
    const timeSinceLast = now - lastPing.timestamp;
    if (timeSinceLast < TOKEN_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((TOKEN_COOLDOWN_MS - timeSinceLast) / 1000);
      return {
        allowed: false,
        reason: `Cooldown active. Please wait ${secondsLeft}s before spending another token.`,
      };
    }
  }

  const { tokensRemaining, nextRefreshAt } = calculateTokenStatus(pings, userId, now);
  if (tokensRemaining <= 0) {
    const refreshDateStr = nextRefreshAt
      ? new Date(nextRefreshAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'in a little while';
    return {
      allowed: false,
      reason: `Daily limit reached (5/5 used). Next check-in is available at ${refreshDateStr}. Urgent check-in is still available if you need help.`,
    };
  }

  return { allowed: true };
}

/**
 * Formats seconds into MM:SS format.
 */
export function formatTimeMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats milliseconds remaining into friendly string.
 */
export function formatRefreshTime(ms: number | null): string {
  if (ms === null || ms <= 0) return 'Ready';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Formats a relative timestamp (e.g. "Just now", "4m ago").
 */
export function formatRelativeTime(timestamp: number, now: number): string {
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

/**
 * Formats notification relative time dynamically:
 * "just now", "a minute ago", "5 minutes ago", "an hour ago", "4 hours ago",
 * "12 hours ago", "24 hours ago", "over 24 hours ago", or "a very long timez ago" (after 1 month).
 */
export function formatDynamicNotificationTime(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // 1 month or more (>= 30 days)
  if (diffDays >= 30) {
    return 'a very long timez ago';
  }

  // Over 24 hours (28+ hours or multiple days)
  if (diffHours >= 28) {
    return 'over 24 hours ago';
  }

  // Around 24 hours (24h - 27h)
  if (diffHours >= 24) {
    return '24 hours ago';
  }

  // 2 to 23 hours
  if (diffHours >= 2) {
    return `${diffHours} hours ago`;
  }

  // 1 hour
  if (diffHours === 1) {
    return 'an hour ago';
  }

  // 2 to 59 minutes
  if (diffMinutes >= 2) {
    return `${diffMinutes} minutes ago`;
  }

  // 1 minute
  if (diffMinutes === 1) {
    return 'a minute ago';
  }

  // Less than 1 minute
  return 'just now';
}

/**
 * Generates an Audit Log Entry
 */
export function createAuditLogEntry(params: {
  id: string;
  type: AuditLogEntry['type'];
  actor: UserRole;
  target: UserRole;
  actorName: string;
  targetName: string;
  tokensRemainingAfter: number;
  location?: LocationCoordinate;
  now: number;
}): AuditLogEntry {
  const { id, type, actor, target, actorName, targetName, tokensRemainingAfter, location, now } = params;

  let title = '';
  let message = '';
  let ephemeralSeconds: number | undefined;

  switch (type) {
    case 'standard_ping':
      title = 'Location Viewed';
      message = `${actorName} viewed ${targetName}'s location.`;
      ephemeralSeconds = 120;
      break;
    case 'emergency_override':
      title = 'Urgent Alert Triggered';
      message = `${actorName} sent an urgent alert to ${targetName}.`;
      break;
    case 'emergency_dismissed':
      title = 'Marked Safe';
      message = `${actorName} confirmed they are safe and closed the urgent alert.`;
      break;
    case 'safety_battery_check':
      title = 'Status Synced';
      message = `Battery and connection status synced between both of you.`;
      break;
    case 'token_refreshed':
      title = 'Check-in Ready';
      message = `A check-in is now ready for ${actorName}.`;
      break;
  }

  return {
    id,
    timestamp: now,
    type,
    actor,
    target,
    title,
    message,
    tokensRemainingAfter,
    ephemeralSeconds,
    locationSnapshot: location
      ? {
          lat: location.lat,
          lng: location.lng,
          approxAddress: location.address || location.city,
        }
      : undefined,
  };
}
