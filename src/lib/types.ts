export type UserRole = 'partner1' | 'partner2';
export type ThemeMode = 'day' | 'night' | 'system';

export interface LocationCoordinate {
  lat: number;
  lng: number;
  accuracy?: number;
  address?: string;
  city?: string;
  timestamp: number;
}

export interface PingRecord {
  id: string;
  requesterId: UserRole;
  targetId: UserRole;
  timestamp: number;
  expiresAt: number;
  type: 'standard' | 'emergency';
  location?: LocationCoordinate;
}

export interface EmergencySession {
  active: boolean;
  initiatedBy: UserRole;
  startedAt: number;
  resolvedAt?: number;
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: 'standard_ping' | 'emergency_override' | 'emergency_dismissed' | 'token_refreshed' | 'safety_battery_check';
  actor: UserRole;
  target: UserRole;
  title: string;
  message: string;
  tokensRemainingAfter: number;
  ephemeralSeconds?: number;
  locationSnapshot?: {
    lat: number;
    lng: number;
    approxAddress?: string;
  };
}

export interface GoogleAuthProfile {
  email: string;
  name: string;
  picture?: string;
}

export interface UserProfile {
  id: UserRole;
  name: string;
  nicknameForPartner?: string; // Optional nickname I gave to my partner (private to my own phone only)
  avatarColor: string;
  battery: number;
  isCharging: boolean;
  network: '5G' | 'LTE' | 'Wi-Fi' | 'Offline';
  lastSeen: number;
  currentLocation: LocationCoordinate;
  isLoggedOut: boolean; // If true, location checks are blocked with friendly offline message
  themeMode: ThemeMode;
  googleUser?: GoogleAuthProfile | null;
  hasCompletedSetup: boolean;
  criticalAlertsAllowed?: boolean; // Full-volume Emergency Alert Override permission (Amber/Weather alert style)
}

export interface AppReleaseInfo {
  version: string;
  buildId: number;
  publishedAt: number;
  releaseNotes: string;
}

export interface AppSyncState {
  version: number;
  appRelease: AppReleaseInfo;
  tokens: {
    partner1: number;
    partner2: number;
  };
  tokenRefreshTimes: {
    partner1: number | null;
    partner2: number | null;
  };
  activeEmergency: EmergencySession | null;
  activeView: {
    requesterId: UserRole;
    targetId: UserRole;
    expiresAt: number;
    mode: 'standard' | 'emergency';
    location: LocationCoordinate;
  } | null;
  profiles: {
    partner1: UserProfile;
    partner2: UserProfile;
  };
  pings: PingRecord[];
  auditLog: AuditLogEntry[];
}

/**
 * Formats a user's display name with optional partner nickname.
 * Example: `Jordan "The King"` or `Jordan`
 */
export function formatPartnerDisplayName(realName: string, nickname?: string): string {
  const trimmedNick = nickname?.trim();
  if (trimmedNick) {
    return `${realName} "${trimmedNick}"`;
  }
  return realName;
}
