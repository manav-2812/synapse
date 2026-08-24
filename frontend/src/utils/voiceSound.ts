/**
 * voiceSound.ts
 *
 * Synthesizes signature voice-to-text sound cues using the browser's
 * Web Audio API. Zero external audio files, zero network delay, 100% reliable.
 */

class VoiceSoundSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.ctx || this.ctx.state === "closed") {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch (err) {
      console.warn("[VoiceSound] Could not initialize AudioContext:", err);
      return null;
    }
  }

  /**
   * Warm rising two-tone chime when voice listening starts
   */
  playStart() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: D5 (587.33 Hz) - soft warm onset
    this.playBellTone(ctx, 587.33, now, 0.14, 0.12);
    // Tone 2: A5 (880.00 Hz) - rising note with gentle resonance
    this.playBellTone(ctx, 880.0, now + 0.085, 0.22, 0.15);
  }

  /**
   * Pleasant confirmation bell chime when speech is accepted
   */
  playDone() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    this.playBellTone(ctx, 659.25, now, 0.12, 0.1);
    // Tone 2: C6 (1046.5 Hz) - bright clean completion chime
    this.playBellTone(ctx, 1046.5, now + 0.075, 0.26, 0.16);
  }

  /**
   * Gentle subtle downward dismissal pop when listening is cancelled
   */
  playCancel() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);
    } catch {
      // Audio safety fallback
    }
  }

  private playBellTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    volume: number
  ) {
    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, startTime);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq * 2, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    } catch {
      // Audio safety fallback
    }
  }
}

export const voiceSound = new VoiceSoundSynthesizer();
