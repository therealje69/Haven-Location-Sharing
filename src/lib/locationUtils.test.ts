import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HISTORY_EVENTS,
  buildGoogleMapsUrl,
  getDisplayLocationText,
  getRecentAuditEntries,
  isRawCoordinateString,
} from './locationUtils.ts';
import type { AuditLogEntry } from './types.ts';

test('isRawCoordinateString identifies raw coordinate strings and placeholders', () => {
  assert.equal(isRawCoordinateString('37.7955°, -122.3937°'), true);
  assert.equal(isRawCoordinateString('37.7955, -122.3937'), true);
  assert.equal(isRawCoordinateString('-33.8688, 151.2093'), true);
  assert.equal(isRawCoordinateString('Live GPS Signal'), true);
  assert.equal(isRawCoordinateString(''), true);
  assert.equal(isRawCoordinateString(undefined), true);

  assert.equal(isRawCoordinateString('Ferry Building, The Embarcadero'), false);
  assert.equal(isRawCoordinateString('1600 Amphitheatre Pkwy, Mountain View, CA'), false);
});

test('getDisplayLocationText never leaks raw coordinates to UI', () => {
  const rawLoc = getDisplayLocationText({
    lat: 37.7955,
    lng: -122.3937,
    address: '37.7955°, -122.3937°',
    city: 'Live GPS Signal',
    timestamp: Date.now(),
  });
  assert.equal(rawLoc.primary, 'Pinned on Google Maps');
  assert.equal(rawLoc.secondary, undefined);

  const realLoc = getDisplayLocationText({
    lat: 37.7955,
    lng: -122.3937,
    address: 'Ferry Building, The Embarcadero',
    city: 'San Francisco, CA',
    timestamp: Date.now(),
  });
  assert.equal(realLoc.primary, 'Ferry Building, The Embarcadero');
  assert.equal(realLoc.secondary, 'San Francisco, CA');
});

test('buildGoogleMapsUrl constructs valid universal Google Maps link', () => {
  assert.equal(
    buildGoogleMapsUrl(37.7955, -122.3937),
    'https://www.google.com/maps/search/?api=1&query=37.7955%2C-122.3937'
  );
  assert.equal(
    buildGoogleMapsUrl(37.7955, -122.3937, 'ChIJabc123'),
    'https://www.google.com/maps/search/?api=1&query=37.7955%2C-122.3937&query_place_id=ChIJabc123'
  );
});

test('getRecentAuditEntries returns newest 25 events only', () => {
  assert.equal(MAX_HISTORY_EVENTS, 25);
  const entries: AuditLogEntry[] = Array.from({ length: 40 }, (_, i) => ({
    id: `entry-${i}`,
    timestamp: 1000 + i * 100,
    type: 'standard_ping',
    actor: 'partner1',
    target: 'partner2',
    title: 'Location Viewed',
    message: `Event ${i}`,
    tokensRemainingAfter: 7,
  }));

  const recent = getRecentAuditEntries(entries);
  assert.equal(recent.length, 25);
  assert.equal(recent[0].id, 'entry-39');
  assert.equal(recent[24].id, 'entry-15');
});
