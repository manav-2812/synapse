import React, { useEffect, useRef, useState } from "react";

interface VoiceWaveformProps {
  audioStream: MediaStream | null;
  isListening: boolean;
  className?: string;
}

// Total number of discrete points across the waveform line
const NUM_POINTS = 48;

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  audioStream,
  isListening,
  className = "",
}) => {
  const [pointHeights, setPointHeights] = useState<number[]>(() =>
    new Array(NUM_POINTS).fill(3)
  );

  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const currentHeightsRef = useRef<number[]>(new Array(NUM_POINTS).fill(3));

  useEffect(() => {
    if (!isListening) {
      const resting = new Array(NUM_POINTS).fill(3);
      currentHeightsRef.current = resting;
      setPointHeights(resting);
      return;
    }

    let isCancelled = false;
    let time = 0;

    // Set up Web Audio API Analyser if audioStream is available
    if (audioStream && audioStream.active) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;

        if (AudioCtx) {
          const ctx = new AudioCtx();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.75;

          const source = ctx.createMediaStreamSource(audioStream);
          source.connect(analyser);

          audioContextRef.current = ctx;
          analyserRef.current = analyser;
          sourceRef.current = source;
        }
      } catch (err) {
        console.warn("[VoiceWaveform] Analyser setup fallback:", err);
      }
    }

    const dataArray = new Uint8Array(64);

    const updateWaveform = () => {
      if (isCancelled) return;

      // Increment continuous time for fluid traveling wave animation
      time += 0.055;

      let audioEnergy = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        let count = 0;
        for (let i = 2; i < 28; i++) {
          sum += dataArray[i];
          count++;
        }
        audioEnergy = count > 0 ? sum / count / 255 : 0;
      }

      const nextHeights: number[] = new Array(NUM_POINTS);

      for (let i = 0; i < NUM_POINTS; i++) {
        // Normalized position from 0 (far left) to 1 (far right)
        const x = i / (NUM_POINTS - 1);

        // Center-focused bell curve envelope so the outer ends remain dots
        // and the active bars fluidly form and move in the middle area
        const distFromCenter = Math.abs(x - 0.5);
        const envelope = Math.max(
          0,
          Math.exp(-Math.pow(distFromCenter / 0.26, 2)) - 0.05
        );

        // Fluid traveling harmonics (multiple moving waves flowing left-to-right)
        const wave1 = Math.sin(x * 14 - time * 3.8);
        const wave2 = Math.sin(x * 22 + time * 2.4);
        const wave3 = Math.cos(x * 28 - time * 4.6);
        const wave4 = Math.sin(x * 8 - time * 1.8);

        // Combined organic wave pattern in [0, 1]
        const rawWave = (wave1 * 0.4 + wave2 * 0.3 + wave3 * 0.2 + wave4 * 0.1 + 1) / 2;

        let targetHeight = 3;

        if (envelope > 0.02) {
          if (audioEnergy > 0.035) {
            // User is actively speaking: map frequency bins and energy to peaks
            const freqBin = Math.min(
              dataArray.length - 1,
              Math.floor(distFromCenter * 2 * 22) + 2
            );
            const freqValue = dataArray[freqBin] / 255;
            const speechMod = Math.pow(freqValue, 1.2) * (1 + audioEnergy * 2.5);

            // Dynamic moving peaks that dance with voice
            const dynamicScale = 8 + rawWave * 20 * (1 + speechMod * 1.4);
            targetHeight = 3 + envelope * dynamicScale;
          } else {
            // Ambient / Idle state: smooth, hypnotic continuous moving wave
            const idleScale = 6 + rawWave * 16;
            targetHeight = 3 + envelope * idleScale;
          }
        }

        // Clamp between 3px (dot) and 28px (max bar)
        targetHeight = Math.max(3, Math.min(28, targetHeight));

        // Smooth spring / lerp interpolation for silky 60fps movement
        const current = currentHeightsRef.current[i] ?? 3;
        nextHeights[i] = current * 0.35 + targetHeight * 0.65;
      }

      currentHeightsRef.current = nextHeights;
      setPointHeights([...nextHeights]);

      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    animationFrameRef.current = requestAnimationFrame(updateWaveform);

    return () => {
      isCancelled = true;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [audioStream, isListening]);

  return (
    <div
      className={`voice-waveform ${className}`}
      aria-label="Voice input waveform"
      role="presentation"
    >
      {pointHeights.map((height, index) => {
        const isBar = height > 4.2;

        return (
          <span
            key={index}
            className={`voice-wave-item ${isBar ? "is-bar" : "is-dot"}`}
            style={{
              height: isBar ? `${Math.round(height * 10) / 10}px` : "3px",
            }}
          />
        );
      })}
    </div>
  );
};
