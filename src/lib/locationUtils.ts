import type { AuditLogEntry, LocationCoordinate } from './types.ts';

export const MAX_HISTORY_EVENTS = 25;

const RAW_COORDINATE_REGEX =
  /^\s*-?\d{1,3}(?:\.\d+)?°?\s*,\s*-?\d{1,3}(?:\.\d+)?°?\s*$/;

/**
 * Detects whether a location label is raw latitude/longitude coordinates
 * (e.g. "37.7955°, -122.3937°" or "37.7955, -122.3937") or a generic GPS placeholder.
 */
export function isRawCoordinateString(text?: string | null): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (RAW_COORDINATE_REGEX.test(trimmed)) return true;
  if (trimmed.toLowerCase() === 'live gps signal') return true;
  return false;
}

/**
 * Builds an official Google Maps cross-platform URL that opens the exact pin
 * in the Google Maps app or browser.
 */
export function buildGoogleMapsUrl(lat: number, lng: number, placeId?: string): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lat},${lng}`
  )}`;
  if (placeId && placeId.trim()) {
    return `${base}&query_place_id=${encodeURIComponent(placeId.trim())}`;
  }
  return base;
}

/**
 * Formats a LocationCoordinate into a human-readable Google Maps location string,
 * never displaying raw latitude/longitude numbers as the visible address.
 */
export function getDisplayLocationText(loc?: LocationCoordinate | null): {
  primary: string;
  secondary?: string;
} {
  if (!loc) {
    return { primary: 'Location on Google Maps' };
  }

  const address = !isRawCoordinateString(loc.address) ? loc.address!.trim() : '';
  const city = !isRawCoordinateString(loc.city) ? loc.city!.trim() : '';

  if (address && city && !address.toLowerCase().includes(city.toLowerCase())) {
    return { primary: address, secondary: city };
  }
  if (address) {
    return { primary: address };
  }
  if (city) {
    return { primary: city };
  }
  return { primary: 'Pinned on Google Maps' };
}

/**
 * Returns the most recent N audit events (default: 25) ordered newest-first.
 */
export function getRecentAuditEntries(
  auditLog: AuditLogEntry[],
  limit = MAX_HISTORY_EVENTS
): AuditLogEntry[] {
  if (!Array.isArray(auditLog)) return [];
  return [...auditLog]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, Math.max(0, limit));
}
