/**
 * useVoiceInput
 *
 * Encapsulates browser Web Speech API (SpeechRecognition) and Web Audio API
 * MediaStream for voice-to-text input with real-time waveform visualization
 * and synthesized sound cues.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceSound } from "../utils/voiceSound";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type VoiceInputError =
  | "permission-denied"
  | "recognition-error"
  | null;

export interface UseVoiceInputReturn {
  /** Whether the browser supports the Web Speech API */
  isSupported: boolean;
  /** Whether recognition is actively listening */
  isListening: boolean;
  /** Current transcript (interim + finalised chunks combined) */
  transcript: string;
  /** Active microphone MediaStream for live waveform visualization */
  audioStream: MediaStream | null;
  /** Latest error state, if any */
  error: VoiceInputError;
  /** Start listening; calls back on each transcript update */
  startListening: (onTranscript: (text: string) => void) => void;
  /** Confirm/save the voice transcription (plays done sound) */
  confirmListening: () => void;
  /** Cancel the voice transcription (discards input and plays cancel sound) */
  cancelListening: () => void;
  /** Stop listening manually (alias for confirm) */
  stopListening: () => void;
  /** Clear the error state */
  clearError: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSpeechRecognition():
  | (new () => SpeechRecognitionInstance)
  | null {
  if (typeof window === "undefined") return null;
  return (
    (
      window as typeof window & {
        SpeechRecognition?: new () => SpeechRecognitionInstance;
      }
    ).SpeechRecognition ??
    (
      window as typeof window & {
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      }
    ).webkitSpeechRecognition ??
    null
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceInput(): UseVoiceInputReturn {
  const RecognitionCtor = getSpeechRecognition();
  const isSupported = RecognitionCtor !== null;

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<VoiceInputError>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  // Ref to the active recognition instance so we can abort on unmount / manual stop
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Ref to active media stream tracks
  const streamRef = useRef<MediaStream | null>(null);
  // Accumulated final transcript segments across multiple `onresult` events
  const finalTranscriptRef = useRef<string>("");
  // Stable ref to the latest callback so we never capture stale closures
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);
  // Flag to know whether recognition ended because user cancelled
  const isCancelledRef = useRef<boolean>(false);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setAudioStream(null);
  }, []);

  // Abort and cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      cleanupStream();
    };
  }, [cleanupStream]);

  const confirmListening = useCallback(() => {
    isCancelledRef.current = false;
    voiceSound.playDone();

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    cleanupStream();
    setIsListening(false);
  }, [cleanupStream]);

  const cancelListening = useCallback(() => {
    isCancelledRef.current = true;
    voiceSound.playCancel();

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    cleanupStream();
    setIsListening(false);
  }, [cleanupStream]);

  const stopListening = useCallback(() => {
    confirmListening();
  }, [confirmListening]);

  const startListening = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (!RecognitionCtor) return;

      // Tear down any existing session first
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      cleanupStream();

      setError(null);
      isCancelledRef.current = false;
      finalTranscriptRef.current = "";
      onTranscriptRef.current = onTranscript;

      // Play rising start sound
      voiceSound.playStart();

      // Acquire mic stream for real-time visualizer
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
          streamRef.current = stream;
          setAudioStream(stream);
        }
      } catch (err) {
        console.warn("[useVoiceInput] MediaStream acquisition notice:", err);
      }

      const recognition = new RecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false; // auto-stops on natural pause
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (isCancelledRef.current) return;

        let interim = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscriptRef.current +=
              result[0].transcript.trimEnd() + " ";
          } else {
            interim += result[0].transcript;
          }
        }

        const combined = (finalTranscriptRef.current + interim).trimStart();
        onTranscriptRef.current?.(combined);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const code = event.error;

        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("permission-denied");
        } else if (code === "no-speech" || code === "audio-capture") {
          // Silent recovery on natural timeout
        } else {
          console.error("[useVoiceInput] SpeechRecognition error:", code, event);
          setError("recognition-error");
        }

        recognitionRef.current = null;
        cleanupStream();
        setIsListening(false);
      };

      recognition.onend = () => {
        if (!isCancelledRef.current && isListening) {
          // Play subtle done sound when browser finishes listening on silence
          voiceSound.playDone();
        }
        recognitionRef.current = null;
        cleanupStream();
        setIsListening(false);
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (err) {
        console.error("[useVoiceInput] Failed to start recognition:", err);
        setError("recognition-error");
        recognitionRef.current = null;
        cleanupStream();
        setIsListening(false);
      }
    },
    [RecognitionCtor, cleanupStream, isListening]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isSupported,
    isListening,
    transcript: "",
    audioStream,
    error,
    startListening,
    confirmListening,
    cancelListening,
    stopListening,
    clearError,
  };
}
