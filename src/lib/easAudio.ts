/**
 * Emergency Alert System (EAS) & Notification Audio Synthesizer:
 * 1. Gentle Chime: Clear dual-harmonic chime for routine check-ins
 * 2. Full-Volume Emergency Siren: Maximum-output dual-tone (853 Hz + 960 Hz)
 *    Amber Alert / Severe Weather style attention signal with dynamic compression
 *    and pulsed cadence that plays at 100% hardware output.
 */

let audioCtx: AudioContext | null = null;
let osc1: OscillatorNode | null = null;
let osc2: OscillatorNode | null = null;
let osc3: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
let pulseInterval: number | null = null;
let isPlaying = false;
let audioUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Pre-unlocks the Web Audio channel on any user interaction or permission approval
 * so incoming emergency alerts can sound immediately at full volume.
 */
export function unlockEmergencyAudioChannel(): void {
  if (audioUnlocked && audioCtx && audioCtx.state === 'running') return;
  try {
    const ctx = getAudioContext();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
  } catch {
    // Will retry on next interaction
  }
}

// Automatically unlock audio context on first touch/click anywhere in the app
if (typeof window !== 'undefined') {
  const autoUnlock = () => {
    unlockEmergencyAudioChannel();
  };
  window.addEventListener('pointerdown', autoUnlock, { passive: true });
  window.addEventListener('keydown', autoUnlock, { passive: true });
}

/**
 * Plays a clear two-note chime (e.g. when a partner requests a routine check-in)
 */
export function playGentleChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Note 1: E5 (659.25 Hz)
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(659.25, now);
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.22, now + 0.05);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.75);

    // Note 2: B5 (987.77 Hz)
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(987.77, now + 0.15);
    g2.gain.setValueAtTime(0, now + 0.15);
    g2.gain.linearRampToValueAtTime(0.18, now + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(now + 0.15);
    o2.stop(now + 1.0);
  } catch {
    // Autoplay restrictions or unsupported
  }
}

/**
 * Starts the full-volume Emergency Alert System (EAS) siren.
 * Uses the standard 853 Hz + 960 Hz EAS dual-tone attention signal with
 * sawtooth/square harmonics and a DynamicsCompressorNode to drive 100% full output
 * like an Amber Alert / Flood Warning / Fire Warning.
 */
export function startEASSiren(volume = 1.0): void {
  if (isPlaying) return;

  try {
    const ctx = getAudioContext();
    const maxVolume = Math.max(0.85, Math.min(1.0, volume));

    // Dynamic compressor to maximize perceived loudness at 100% ceiling without clipping distortion
    compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.setValueAtTime(-12, ctx.currentTime);
    compressorNode.knee.setValueAtTime(6, ctx.currentTime);
    compressorNode.ratio.setValueAtTime(12, ctx.currentTime);
    compressorNode.attack.setValueAtTime(0.002, ctx.currentTime);
    compressorNode.release.setValueAtTime(0.15, ctx.currentTime);

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(maxVolume, ctx.currentTime);

    osc1 = ctx.createOscillator();
    osc2 = ctx.createOscillator();
    osc3 = ctx.createOscillator();

    // Sawtooth + Square wave combination produces the unmistakable piercing EAS Amber Alert timbre
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc3.type = 'sawtooth';

    osc1.frequency.setValueAtTime(853, ctx.currentTime);
    osc2.frequency.setValueAtTime(960, ctx.currentTime);
    osc3.frequency.setValueAtTime(1706, ctx.currentTime); // Upper harmonic for small phone speakers

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);
    gainNode.connect(compressorNode);
    compressorNode.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc3.start();
    isPlaying = true;

    // Alternating Amber Alert / EAS cadence (pulsed high-urgency pattern)
    let highPhase = true;
    pulseInterval = window.setInterval(() => {
      if (!gainNode || !audioCtx || !isPlaying) return;
      const t = audioCtx.currentTime;
      highPhase = !highPhase;
      gainNode.gain.setValueAtTime(highPhase ? maxVolume : maxVolume * 0.25, t);
    }, 450);
  } catch (err) {
    console.warn('Emergency audio playback failed:', err);
  }
}

/**
 * Stops the emergency siren immediately and cleans up nodes.
 */
export function stopEASSiren(): void {
  if (pulseInterval !== null) {
    clearInterval(pulseInterval);
    pulseInterval = null;
  }

  if (!isPlaying) return;

  try {
    if (gainNode && audioCtx) {
      gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    }
    if (osc1) {
      try { osc1.stop(); osc1.disconnect(); } catch {}
      osc1 = null;
    }
    if (osc2) {
      try { osc2.stop(); osc2.disconnect(); } catch {}
      osc2 = null;
    }
    if (osc3) {
      try { osc3.stop(); osc3.disconnect(); } catch {}
      osc3 = null;
    }
    if (gainNode) {
      try { gainNode.disconnect(); } catch {}
      gainNode = null;
    }
    if (compressorNode) {
      try { compressorNode.disconnect(); } catch {}
      compressorNode = null;
    }
    isPlaying = false;
  } catch {
    isPlaying = false;
  }
}

/**
 * Plays a full-volume preview test sound of the emergency siren.
 */
export function playEASPreview(durationMs = 2000): Promise<void> {
  unlockEmergencyAudioChannel();
  return new Promise((resolve) => {
    startEASSiren(1.0);
    setTimeout(() => {
      stopEASSiren();
      resolve();
    }, durationMs);
  });
}

export function isEASPlaying(): boolean {
  return isPlaying;
}
