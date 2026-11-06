import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  AppReleaseInfo,
  AppSyncState,
  AuditLogEntry,
  EmergencySession,
  LocationCoordinate,
  PingRecord,
  UserProfile,
  UserRole,
} from './src/lib/types.js';
import {
  calculateTokenStatus,
  canRequestLocation,
  createAuditLogEntry,
  MAX_DAILY_TOKENS,
  STANDARD_VIEW_DURATION_MS
} from './src/lib/tokenEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.resolve(DATA_DIR, 'haven-state.json');

const defaultLocations: Record<UserRole, LocationCoordinate> = {
  partner1: {
    lat: 37.7955,
    lng: -122.3937,
    accuracy: 8,
    address: 'Ferry Building, The Embarcadero',
    city: 'San Francisco, CA',
    timestamp: Date.now() - 1000 * 60 * 15,
  },
  partner2: {
    lat: 37.7596,
    lng: -122.4269,
    accuracy: 12,
    address: 'Mission Dolores Park, 19th & Dolores St',
    city: 'San Francisco, CA',
    timestamp: Date.now() - 1000 * 60 * 8,
  },
};

let profiles: Record<UserRole, UserProfile> = {
  partner1: {
    id: 'partner1',
    name: 'Jordan',
    nicknameForPartner: '',
    avatarColor: 'amber',
    battery: 88,
    isCharging: false,
    network: '5G',
    lastSeen: Date.now(),
    currentLocation: defaultLocations.partner1,
    isLoggedOut: false,
    themeMode: 'day',
    googleUser: null,
    hasCompletedSetup: true,
    criticalAlertsAllowed: true,
  },
  partner2: {
    id: 'partner2',
    name: 'Taylor',
    nicknameForPartner: '',
    avatarColor: 'sage',
    battery: 64,
    isCharging: true,
    network: 'Wi-Fi',
    lastSeen: Date.now(),
    currentLocation: defaultLocations.partner2,
    isLoggedOut: false,
    themeMode: 'day',
    googleUser: null,
    hasCompletedSetup: true,
    criticalAlertsAllowed: true,
  },
};

let pings: PingRecord[] = [
  {
    id: 'seed-ping-1',
    requesterId: 'partner1',
    targetId: 'partner2',
    timestamp: Date.now() - 18 * 60 * 60 * 1000,
    expiresAt: Date.now() - 18 * 60 * 60 * 1000 + STANDARD_VIEW_DURATION_MS,
    type: 'standard',
    location: defaultLocations.partner2,
  },
];

let activeEmergency: EmergencySession | null = null;
let activeView: AppSyncState['activeView'] = null;
let stateVersion = 1;

let appRelease: AppReleaseInfo = {
  version: '1.2.0',
  buildId: 1,
  publishedAt: Date.now(),
  releaseNotes: 'All settings & permissions preserved',
};

let auditLog: AuditLogEntry[] = [
  {
    id: 'audit-seed-0',
    timestamp: Date.now() - 24 * 60 * 60 * 1000,
    type: 'safety_battery_check',
    actor: 'partner1',
    target: 'partner2',
    title: 'Haven Connected',
    message: `Mutual connection active. ${MAX_DAILY_TOKENS} gentle daily check-ins available.`,
    tokensRemainingAfter: MAX_DAILY_TOKENS,
  },
  {
    id: 'audit-seed-1',
    timestamp: Date.now() - 18 * 60 * 60 * 1000,
    type: 'standard_ping',
    actor: 'partner1',
    target: 'partner2',
    title: 'Location Viewed',
    message: 'Jordan requested Taylor\'s location.',
    tokensRemainingAfter: MAX_DAILY_TOKENS - 1,
    ephemeralSeconds: 60,
    locationSnapshot: {
      lat: defaultLocations.partner2.lat,
      lng: defaultLocations.partner2.lng,
      approxAddress: defaultLocations.partner2.address,
    },
  },
];

// Load persisted state across updates/restarts so users never lose settings
function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (raw.profiles?.partner1 && raw.profiles?.partner2) {
        profiles = {
          partner1: { ...profiles.partner1, ...raw.profiles.partner1 },
          partner2: { ...profiles.partner2, ...raw.profiles.partner2 },
        };
      }
      if (Array.isArray(raw.pings)) pings = raw.pings;
      if (Array.isArray(raw.auditLog)) auditLog = raw.auditLog;
      if (raw.appRelease) appRelease = raw.appRelease;
    }
  } catch (err) {
    console.warn('Could not load persisted state:', err);
  }
}

function savePersistedState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ profiles, pings, auditLog, appRelease }, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.warn('Could not save persisted state:', err);
  }
}

loadPersistedState();

type SSEClient = { id: number; res: express.Response };
let sseClients: SSEClient[] = [];
let nextClientId = 1;

function broadcastStateUpdate() {
  stateVersion++;
  savePersistedState();
  const state = buildStatePayload();
  const data = `data: ${JSON.stringify(state)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(data);
    } catch {
      // client disconnected
    }
  });
}

function buildStatePayload(): AppSyncState {
  const now = Date.now();

  if (activeView && activeView.mode === 'standard' && now > activeView.expiresAt) {
    activeView = null;
  }

  const p1Status = calculateTokenStatus(pings, 'partner1', now);
  const p2Status = calculateTokenStatus(pings, 'partner2', now);

  return {
    version: stateVersion,
    appRelease,
    tokens: {
      partner1: p1Status.tokensRemaining,
      partner2: p2Status.tokensRemaining,
    },
    tokenRefreshTimes: {
      partner1: p1Status.nextRefreshAt,
      partner2: p2Status.nextRefreshAt,
    },
    activeEmergency,
    activeView,
    profiles,
    pings,
    auditLog,
  };
}

// Maps Config endpoint
app.get('/api/maps-config', (req, res) => {
  res.json({
    apiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '',
  });
});

// 1. Get State
app.get('/api/state', (req, res) => {
  res.json(buildStatePayload());
});

// 2. Request Location (Standard 1 Token, 1-Minute Cooldown & Window)
app.post('/api/request-location', (req, res) => {
  const { requesterId } = req.body as { requesterId: UserRole };
  if (!requesterId || !profiles[requesterId]) {
    res.status(400).json({ error: 'Valid requesterId is required' });
    return;
  }

  const targetId: UserRole = requesterId === 'partner1' ? 'partner2' : 'partner1';
  const target = profiles[targetId];

  // If partner is logged out, location cannot be checked
  if (target.isLoggedOut) {
    res.status(403).json({
      error: `${target.name} is currently signed out or resting offline. Location check-in is paused.`,
    });
    return;
  }

  const now = Date.now();
  const authCheck = canRequestLocation(pings, requesterId, now, false);
  if (!authCheck.allowed) {
    res.status(429).json({ error: authCheck.reason });
    return;
  }

  const expiresAt = now + STANDARD_VIEW_DURATION_MS;
  const targetLocation = target.currentLocation;

  const newPing: PingRecord = {
    id: `ping-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    requesterId,
    targetId,
    timestamp: now,
    expiresAt,
    type: 'standard',
    location: targetLocation,
  };
  pings.push(newPing);

  activeView = {
    requesterId,
    targetId,
    expiresAt,
    mode: 'standard',
    location: targetLocation,
  };

  const statusAfter = calculateTokenStatus(pings, requesterId, now);

  const requesterName = profiles[requesterId].name;
  const targetName = target.name;

  const auditEntry = createAuditLogEntry({
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'standard_ping',
    actor: requesterId,
    target: targetId,
    actorName: requesterName,
    targetName: targetName,
    tokensRemainingAfter: statusAfter.tokensRemaining,
    location: targetLocation,
    now,
  });
  auditLog.unshift(auditEntry);

  broadcastStateUpdate();
  res.json({
    success: true,
    activeView,
    tokensRemaining: statusAfter.tokensRemaining,
    expiresInSeconds: 60,
  });
});

// 3. Emergency / Urgent Check-in Override
app.post('/api/emergency', (req, res) => {
  const { requesterId, reason } = req.body as { requesterId: UserRole; reason?: string };
  if (!requesterId || !profiles[requesterId]) {
    res.status(400).json({ error: 'Valid requesterId is required' });
    return;
  }

  const targetId: UserRole = requesterId === 'partner1' ? 'partner2' : 'partner1';
  const now = Date.now();

  activeEmergency = {
    active: true,
    initiatedBy: requesterId,
    startedAt: now,
    reason: reason || 'Urgent alert triggered by partner',
  };

  const targetLocation = profiles[targetId].currentLocation;

  pings.push({
    id: `ping-emerg-${Date.now()}`,
    requesterId,
    targetId,
    timestamp: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    type: 'emergency',
    location: targetLocation,
  });

  activeView = {
    requesterId,
    targetId,
    expiresAt: now + 24 * 60 * 60 * 1000,
    mode: 'emergency',
    location: targetLocation,
  };

  const statusAfter = calculateTokenStatus(pings, requesterId, now);

  const requesterName = profiles[requesterId].name;
  const targetName = profiles[targetId].name;

  const auditEntry = createAuditLogEntry({
    id: `audit-emerg-${Date.now()}`,
    type: 'emergency_override',
    actor: requesterId,
    target: targetId,
    actorName: requesterName,
    targetName: targetName,
    tokensRemainingAfter: statusAfter.tokensRemaining,
    location: targetLocation,
    now,
  });
  auditLog.unshift(auditEntry);

  broadcastStateUpdate();
  res.json({ success: true, activeEmergency, activeView });
});

// 4. Resolve Emergency Override (Immediately closes emergency location view & stops siren)
app.post('/api/resolve-emergency', (req, res) => {
  const { userId } = req.body as { userId: UserRole };
  const actor = userId || (activeEmergency?.initiatedBy === 'partner1' ? 'partner2' : 'partner1');
  const now = Date.now();

  if (activeEmergency) {
    const initiatedBy = activeEmergency.initiatedBy;
    const targetId = initiatedBy === 'partner1' ? 'partner2' : 'partner1';

    const actorName = profiles[actor]?.name || actor;
    const otherId = initiatedBy === actor ? targetId : initiatedBy;
    const targetName = profiles[otherId]?.name || 'Partner';

    const auditEntry = createAuditLogEntry({
      id: `audit-resolved-${Date.now()}`,
      type: 'emergency_dismissed',
      actor,
      target: otherId,
      actorName: actorName,
      targetName: targetName,
      tokensRemainingAfter: calculateTokenStatus(pings, actor, now).tokensRemaining,
      now,
    });
    auditLog.unshift(auditEntry);
  }

  // Immediately expire all active emergency pings so location locks right away
  pings = pings.map((p) =>
    p.type === 'emergency' && p.expiresAt > now ? { ...p, expiresAt: now } : p
  );

  activeEmergency = null;
  activeView = null;

  broadcastStateUpdate();
  res.json({ success: true, resolved: true });
});

// 5. Update Profile
// STRICT ISOLATION: A user (userId) can ONLY edit their own name (profiles[userId].name)
// and their own private nickname for the other person (profiles[userId].nicknameForPartner).
// This never alters the other person's name or the other person's nickname field.
app.post('/api/update-profile', (req, res) => {
  const {
    userId,
    name,
    nicknameForPartner,
    battery,
    isCharging,
    network,
    location,
    currentLocation,
    isLoggedOut,
    themeMode,
    googleUser,
    hasCompletedSetup,
    criticalAlertsAllowed,
  } = req.body as {
    userId: UserRole;
    name?: string;
    nicknameForPartner?: string;
    battery?: number;
    isCharging?: boolean;
    network?: UserProfile['network'];
    location?: LocationCoordinate;
    currentLocation?: LocationCoordinate;
    isLoggedOut?: boolean;
    themeMode?: UserProfile['themeMode'];
    googleUser?: UserProfile['googleUser'];
    hasCompletedSetup?: boolean;
    criticalAlertsAllowed?: boolean;
  };

  if (!userId || (userId !== 'partner1' && userId !== 'partner2')) {
    res.status(400).json({ error: 'Valid userId required' });
    return;
  }

  // Only update this specific user's real name
  if (name !== undefined && name.trim()) {
    profiles[userId].name = name.trim();
  }

  // Only update this specific user's private nickname for the partner
  if (nicknameForPartner !== undefined) {
    profiles[userId].nicknameForPartner = nicknameForPartner.trim();
  }

  if (battery !== undefined) profiles[userId].battery = Math.min(100, Math.max(0, battery));
  if (isCharging !== undefined) profiles[userId].isCharging = isCharging;
  if (network !== undefined) profiles[userId].network = network;
  if (isLoggedOut !== undefined) profiles[userId].isLoggedOut = isLoggedOut;
  if (themeMode !== undefined) profiles[userId].themeMode = themeMode;
  if (googleUser !== undefined) profiles[userId].googleUser = googleUser;
  if (hasCompletedSetup !== undefined) profiles[userId].hasCompletedSetup = hasCompletedSetup;
  if (criticalAlertsAllowed !== undefined) profiles[userId].criticalAlertsAllowed = criticalAlertsAllowed;

  const loc = currentLocation || location;
  if (loc !== undefined) {
    profiles[userId].currentLocation = {
      ...loc,
      timestamp: Date.now(),
    };
    if (activeView && activeView.targetId === userId) {
      activeView.location = profiles[userId].currentLocation;
    }
  }
  profiles[userId].lastSeen = Date.now();

  broadcastStateUpdate();
  res.json({ success: true, profile: profiles[userId] });
});

// 6. Push Over-The-Air (OTA) App Update to all installed users without losing settings
app.post('/api/push-update', (req, res) => {
  const { releaseNotes } = (req.body || {}) as { releaseNotes?: string };
  const nextBuildId = (appRelease?.buildId || 1) + 1;
  const parts = (appRelease?.version || '1.2.0').split('.').map((n) => parseInt(n, 10) || 0);
  parts[2] = (parts[2] || 0) + 1;
  const nextVersion = parts.join('.');

  appRelease = {
    version: nextVersion,
    buildId: nextBuildId,
    publishedAt: Date.now(),
    releaseNotes: releaseNotes || 'Latest improvements ready · Settings preserved',
  };

  broadcastStateUpdate();
  res.json({ success: true, appRelease });
});

// 7. Reset Demo Tokens (Preserves user names, nicknames, and setup)
app.post('/api/reset-demo', (req, res) => {
  pings = [];
  activeEmergency = null;
  activeView = null;
  auditLog.unshift({
    id: `audit-reset-${Date.now()}`,
    timestamp: Date.now(),
    type: 'token_refreshed',
    actor: 'partner1',
    target: 'partner2',
    title: 'Check-ins Refreshed',
    message: 'Daily check-in allowance replenished for both partners.',
    tokensRemainingAfter: MAX_DAILY_TOKENS,
  });
  broadcastStateUpdate();
  res.json({ success: true, message: `Tokens reset to ${MAX_DAILY_TOKENS}` });
});

// 8. SSE Events
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = nextClientId++;
  sseClients.push({ id: clientId, res });

  res.write(`data: ${JSON.stringify(buildStatePayload())}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Haven server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
