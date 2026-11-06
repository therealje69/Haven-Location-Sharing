import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTokenStatus,
  canRequestLocation,
  formatTimeMMSS,
  formatRefreshTime,
  formatDynamicNotificationTime,
  createAuditLogEntry,
  MAX_DAILY_TOKENS,
  ROLLING_WINDOW_MS
} from './tokenEngine.js';
import { PingRecord } from './types.js';

test('initial state provides full token allowance', () => {
  const pings: PingRecord[] = [];
  const now = 1700000000000;
  const status = calculateTokenStatus(pings, 'partner1', now);

  assert.equal(status.tokensRemaining, 5);
  assert.equal(status.usedInWindow, 0);
  assert.equal(status.nextRefreshAt, null);
  assert.equal(status.msUntilNextRefresh, null);

  const check = canRequestLocation(pings, 'partner1', now);
  assert.equal(check.allowed, true);
});

test('spending 1 token reduces remaining count to 4 and sets refresh timer', () => {
  const now = 1700000000000;
  const pings: PingRecord[] = [
    {
      id: 'ping-1',
      requesterId: 'partner1',
      targetId: 'partner2',
      timestamp: now,
      expiresAt: now + 60000,
      type: 'standard',
    },
  ];

  const status = calculateTokenStatus(pings, 'partner1', now);
  assert.equal(status.tokensRemaining, 4);
  assert.equal(status.usedInWindow, 1);
  assert.equal(status.nextRefreshAt, now + ROLLING_WINDOW_MS);
  assert.equal(status.msUntilNextRefresh, ROLLING_WINDOW_MS);
});

test('enforces 1-minute cooldown block between spending tokens', () => {
  const now = 1700000000000;
  const pings: PingRecord[] = [
    {
      id: 'ping-1',
      requesterId: 'partner1',
      targetId: 'partner2',
      timestamp: now,
      expiresAt: now + 60000,
      type: 'standard',
    },
  ];

  // 30 seconds later (within 1 minute cooldown block): must be denied
  const duringCooldown = canRequestLocation(pings, 'partner1', now + 30000, false);
  assert.equal(duringCooldown.allowed, false);
  assert.match(duringCooldown.reason ?? '', /Cooldown active/);

  // Emergency override ignores cooldown
  const emergencyCheck = canRequestLocation(pings, 'partner1', now + 30000, true);
  assert.equal(emergencyCheck.allowed, true);

  // 61 seconds later (cooldown elapsed): must be allowed
  const afterCooldown = canRequestLocation(pings, 'partner1', now + 61000, false);
  assert.equal(afterCooldown.allowed, true);
});

test('spending 5 tokens blocks routine requests but emergency override passes', () => {
  const baseTime = 1700000000000;
  // 5 pings spaced 2 minutes apart to satisfy 1-minute cooldown
  const pings: PingRecord[] = [0, 1, 2, 3, 4].map((i) => ({
    id: `ping-${i + 1}`,
    requesterId: 'partner1' as const,
    targetId: 'partner2' as const,
    timestamp: baseTime + i * 120000,
    expiresAt: baseTime + i * 120000 + 60000,
    type: 'standard' as const,
  }));

  const now = baseTime + 4 * 120000 + 70000; // 70s after 5th ping (cooldown clear)
  const status = calculateTokenStatus(pings, 'partner1', now);
  assert.equal(status.tokensRemaining, 0);
  assert.equal(status.usedInWindow, 5);

  // Standard request must be denied because 5/5 tokens used
  const standardCheck = canRequestLocation(pings, 'partner1', now, false);
  assert.equal(standardCheck.allowed, false);
  assert.match(standardCheck.reason ?? '', /Daily limit reached/);

  // Emergency override MUST be permitted even with 0 tokens
  const emergencyCheck = canRequestLocation(pings, 'partner1', now, true);
  assert.equal(emergencyCheck.allowed, true);
});

test('tokens replenish after rolling 24-hour expiration', () => {
  const baseTime = 1700000000000;
  const pings: PingRecord[] = [
    {
      id: 'ping-1',
      requesterId: 'partner1',
      targetId: 'partner2',
      timestamp: baseTime,
      expiresAt: baseTime + 60000,
      type: 'standard',
    },
  ];

  // 24 hours + 1 second later
  const laterTime = baseTime + ROLLING_WINDOW_MS + 1000;
  const status = calculateTokenStatus(pings, 'partner1', laterTime);

  assert.equal(status.tokensRemaining, 5);
  assert.equal(status.usedInWindow, 0);
  assert.equal(status.nextRefreshAt, null);
});

test('formatTimeMMSS formats accurately', () => {
  assert.equal(formatTimeMMSS(120), '02:00');
  assert.equal(formatTimeMMSS(65), '01:05');
  assert.equal(formatTimeMMSS(9), '00:09');
  assert.equal(formatTimeMMSS(0), '00:00');
  assert.equal(formatTimeMMSS(-5), '00:00');
});

test('formatRefreshTime returns descriptive string', () => {
  assert.equal(formatRefreshTime(null), 'Ready');
  assert.equal(formatRefreshTime(0), 'Ready');
  assert.equal(formatRefreshTime(1000 * 60 * 45), '45m');
  assert.equal(formatRefreshTime(1000 * 60 * 60 * 3 + 1000 * 60 * 15), '3h 15m');
});

test('formatDynamicNotificationTime returns accurate relative intervals', () => {
  const now = 1700000000000;
  // 10 seconds ago
  assert.equal(formatDynamicNotificationTime(now - 10_000, now), 'just now');
  // 1 minute ago
  assert.equal(formatDynamicNotificationTime(now - 65_000, now), 'a minute ago');
  // 5 minutes ago
  assert.equal(formatDynamicNotificationTime(now - 5 * 60_000, now), '5 minutes ago');
  // 1 hour ago
  assert.equal(formatDynamicNotificationTime(now - 65 * 60_000, now), 'an hour ago');
  // 4 hours ago
  assert.equal(formatDynamicNotificationTime(now - 4 * 3600_000, now), '4 hours ago');
  // 12 hours ago
  assert.equal(formatDynamicNotificationTime(now - 12 * 3600_000, now), '12 hours ago');
  // 24 hours ago
  assert.equal(formatDynamicNotificationTime(now - 25 * 3600_000, now), '24 hours ago');
  // Over 24 hours ago (e.g. 3 days ago)
  assert.equal(formatDynamicNotificationTime(now - 3 * 24 * 3600_000, now), 'over 24 hours ago');
  // 1 month or more (32 days ago)
  assert.equal(formatDynamicNotificationTime(now - 32 * 24 * 3600_000, now), 'a very long timez ago');
});

test('createAuditLogEntry formats standard and emergency events', () => {
  const standard = createAuditLogEntry({
    id: 'audit-1',
    type: 'standard_ping',
    actor: 'partner1',
    target: 'partner2',
    actorName: 'Partner A',
    targetName: 'Partner B',
    tokensRemainingAfter: 2,
    now: 1700000000000,
  });
  assert.equal(standard.title, 'Location Viewed');
  assert.equal(standard.tokensRemainingAfter, 2);

  const emergency = createAuditLogEntry({
    id: 'audit-2',
    type: 'emergency_override',
    actor: 'partner2',
    target: 'partner1',
    actorName: 'Partner B',
    targetName: 'Partner A',
    tokensRemainingAfter: 0,
    now: 1700000005000,
  });
  assert.match(emergency.title, /Urgent Alert/);
  assert.equal(emergency.actor, 'partner2');
});
