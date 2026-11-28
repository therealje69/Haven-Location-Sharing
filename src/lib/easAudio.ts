/**
 * Haven Attention Chime & Hardware Full-Volume Alert Engine:
 * 1. Routine Check-in Chime: Soft, warm two-note harmonic chime.
 * 2. Urgent Attention Chime-Pulse: A commanding, non-grating harmonic triad pulse
 *    (C5 -> E5 -> G5 -> C6) using smooth triangle + sine waves with dynamic compression
 *    AND an HTML5 <audio> PCM WAV stream tied to navigator.mediaSession so it routes
 *    through the hardware media/alarm output at 100% volume even when the screen is off
 *    or another app is in the foreground.
 */

let audioCtx: AudioContext | null = null;
let pulseInterval: number | null = null;
let isPlaying = false;
let audioUnlocked = false;
let htmlAudioElement: HTMLAudioElement | null = null;
let urgentWavDataUri: string | null = null;
let wakeLockSentinel: any = null;

/**
 * Requests the browser/OS AudioSession 'playback' mode where supported (e.g. iOS Safari/WebKit)
 * so emergency alerts bypass the hardware mute/silent switch and route through the media speaker.
 */
function configureCriticalAudioSession(): void {
  try {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      const session = (navigator as unknown as { audioSession?: { type?: string } }).audioSession;
      if (session && session.type !== 'playback') {
        session.type = 'playback';
      }
    }
  } catch {
    // Not supported on this browser
  }
}

function getAudioContext(): AudioContext {
  configureCriticalAudioSession();
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Generates a 16-bit PCM WAV data URI containing the urgent 4-note harmonic chime-pulse
 * at 100% normalized amplitude. Playing this via HTML5 <audio> routes audio through the
 * OS media/alarm channel so it stays audible when the screen is off or backgrounded.
 */
function getUrgentChimeWavDataUri(): string {
  if (urgentWavDataUri) return urgentWavDataUri;

  const sampleRate = 22050;
  const durationSeconds = 1.4;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // 4-note rising attention chime (C5 -> E5 -> G5 -> C6) + resonant hold
  const notes = [
    { freq: 523.25, start: 0.0, end: 0.22 },
    { freq: 659.25, start: 0.2, end: 0.42 },
    { freq: 783.99, start: 0.4, end: 0.64 },
    { freq: 1046.5, start: 0.62, end: 1.15 },
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    for (const n of notes) {
      if (t >= n.start && t <= n.end) {
        const localT = t - n.start;
        const noteLen = n.end - n.start;
        // Smooth attack & decay envelope (no clicks or harshness)
        const attack = Math.min(1, localT / 0.018);
        const release = Math.min(1, (noteLen - localT) / 0.06);
        const env = attack * release;

        // Warm fundamental + octave overtone (pleasant yet highly audible at 0 dBFS on phone speakers)
        const fundamental = Math.sin(2 * Math.PI * n.freq * localT);
        const overtone = 0.42 * Math.sin(2 * Math.PI * (n.freq * 2) * localT);
        const fifth = 0.18 * Math.sin(2 * Math.PI * (n.freq * 1.5) * localT);

        // Soft-clip saturation pushes RMS loudness close to 0 dBFS without harsh square-wave clipping
        const raw = (fundamental + overtone + fifth) * env * 1.15;
        sample += Math.tanh(raw);
      }
    }

    const clamped = Math.max(-0.99, Math.min(0.99, sample));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  urgentWavDataUri = `data:audio/wav;base64,${btoa(binary)}`;
  return urgentWavDataUri;
}

/**
 * Pre-unlocks both the Web Audio Context and the HTML5 MediaSession <audio> channel
 * so incoming background/lock-screen alerts sound at 100% volume immediately.
 */
export function unlockEmergencyAudioChannel(): void {
  try {
    const ctx = getAudioContext();
    if (!audioUnlocked || ctx.state !== 'running') {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioUnlocked = true;
    }

    configureCriticalAudioSession();

    if (!htmlAudioElement && typeof Audio !== 'undefined') {
      htmlAudioElement = new Audio(getUrgentChimeWavDataUri());
      htmlAudioElement.setAttribute('playsinline', 'true');
      (htmlAudioElement as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      htmlAudioElement.loop = true;
      htmlAudioElement.volume = 1.0;
      htmlAudioElement.preload = 'auto';
      // Prime and immediately pause so mobile OS whitelists this element for background playback
      htmlAudioElement.muted = true;
      htmlAudioElement
        .play()
        .then(() => {
          if (htmlAudioElement && !isPlaying) {
            htmlAudioElement.pause();
            htmlAudioElement.currentTime = 0;
            htmlAudioElement.muted = false;
          }
        })
        .catch(() => {
          if (htmlAudioElement) htmlAudioElement.muted = false;
        });
    }

    // Request Screen WakeLock when available so phone stays responsive
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !wakeLockSentinel) {
      (navigator as any).wakeLock
        .request('screen')
        .then((sentinel: any) => {
          wakeLockSentinel = sentinel;
          sentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        })
        .catch(() => {});
    }
  } catch {
    // Will retry on next interaction
  }
}

if (typeof window !== 'undefined') {
  const autoUnlock = () => {
    unlockEmergencyAudioChannel();
  };
  window.addEventListener('pointerdown', autoUnlock, { passive: true });
  window.addEventListener('keydown', autoUnlock, { passive: true });
}

/**
 * Plays a soft two-note chime when a routine location check-in occurs.
 */
export function playGentleChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(587.33, now); // D5
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.25, now + 0.04);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start(now);
    o1.stop(now + 0.7);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(880.0, now + 0.14); // A5
    g2.gain.setValueAtTime(0, now + 0.14);
    g2.gain.linearRampToValueAtTime(0.22, now + 0.19);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start(now + 0.14);
    o2.stop(now + 0.95);
  } catch {
    // Autoplay fallback
  }
}

/**
 * Plays a single cycle of the urgent harmonic attention chime on the Web Audio graph
 * at 100% compressed output.
 */
function playUrgentHarmonicCycle(volume = 1.0): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const maxVol = Math.max(0.9, Math.min(1.0, volume));

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-10, now);
    compressor.knee.setValueAtTime(4, now);
    compressor.ratio.setValueAtTime(10, now);
    compressor.attack.setValueAtTime(0.003, now);
    compressor.release.setValueAtTime(0.12, now);
    compressor.connect(ctx.destination);

    // 4-note rising attention triad (C5 -> E5 -> G5 -> C6)
    const sequence = [
      { freq: 523.25, offset: 0.0, dur: 0.22 },
      { freq: 659.25, offset: 0.2, dur: 0.22 },
      { freq: 783.99, offset: 0.4, dur: 0.24 },
      { freq: 1046.5, offset: 0.62, dur: 0.52 },
    ];

    for (const step of sequence) {
      const start = now + step.offset;
      const stop = start + step.dur;

      const oscMain = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const noteGain = ctx.createGain();

      // Triangle + Sine produces a warm, clear, non-grating chime that projects strongly
      oscMain.type = 'triangle';
      oscHarmonic.type = 'sine';

      oscMain.frequency.setValueAtTime(step.freq, start);
      oscHarmonic.frequency.setValueAtTime(step.freq * 2, start);

      noteGain.gain.setValueAtTime(0.001, start);
      noteGain.gain.linearRampToValueAtTime(maxVol, start + 0.02);
      noteGain.gain.setValueAtTime(maxVol * 0.9, stop - 0.06);
      noteGain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscMain.connect(noteGain);
      oscHarmonic.connect(noteGain);
      noteGain.connect(compressor);

      oscMain.start(start);
      oscHarmonic.start(start);
      oscMain.stop(stop + 0.02);
      oscHarmonic.stop(stop + 0.02);
    }
  } catch (err) {
    console.warn('WebAudio attention cycle error:', err);
  }
}

/**
 * Starts the full-volume Urgent Attention Chime-Pulse.
 *Simultaneously drives Web Audio API + HTML5 <audio> MediaSession stream at 100% gain
 * so it sounds even when the phone is backgrounded or the screen is off.
 */
export function startEASSiren(volume = 1.0): void {
  if (isPlaying) return;
  isPlaying = true;

  try {
    configureCriticalAudioSession();

    // 1. Start HTML5 <audio> MediaSession loop (penetrates silent switch on iOS & background/lock screen)
    if (!htmlAudioElement && typeof Audio !== 'undefined') {
      htmlAudioElement = new Audio(getUrgentChimeWavDataUri());
      htmlAudioElement.setAttribute('playsinline', 'true');
      (htmlAudioElement as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    if (htmlAudioElement) {
      htmlAudioElement.muted = false;
      htmlAudioElement.volume = 1.0;
      htmlAudioElement.loop = true;
      htmlAudioElement.currentTime = 0;
      htmlAudioElement.play().catch(() => {});
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Urgent Check-in Alert',
          artist: 'Haven',
          album: 'Critical Alert Override',
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    }

    // 2. Start Web Audio API compressed chime-pulse loop
    playUrgentHarmonicCycle(volume);
    pulseInterval = window.setInterval(() => {
      if (!isPlaying) return;
      playUrgentHarmonicCycle(volume);
    }, 1400);
  } catch (err) {
    console.warn('Emergency audio playback failed:', err);
  }
}

/**
 * Stops the urgent attention chime immediately.
 */
export function stopEASSiren(): void {
  if (pulseInterval !== null) {
    clearInterval(pulseInterval);
    pulseInterval = null;
  }

  isPlaying = false;

  try {
    if (htmlAudioElement) {
      htmlAudioElement.pause();
      htmlAudioElement.currentTime = 0;
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    }
  } catch {
    // ignore
  }
}

/**
 * Plays a full-volume preview of the new Urgent Attention Chime-Pulse.
 */
export function playEASPreview(durationMs = 2600): Promise<void> {
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
