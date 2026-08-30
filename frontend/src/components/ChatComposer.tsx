import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { Icon } from "./ui/Icon";
import { DocumentScopePicker } from "./DocumentScopePicker";
import { VoiceWaveform } from "./VoiceWaveform";
import type { VoiceInputError } from "../hooks/useVoiceInput";
import type { Dispatch, SetStateAction } from "react";

interface ChatComposerProps {
  // Voice dictation state
  isListening: boolean;
  audioStream: MediaStream | null;
  handleVoiceCancel: () => void;
  handleVoiceConfirm: () => void;
  voiceSupported: boolean;
  handleVoiceToggle: () => void;
  voiceError: VoiceInputError;
  clearVoiceError: () => void;

  // Text input
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  onKey: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;

  // Source mode toggles
  insightMode: boolean;
  setInsightMode: Dispatch<SetStateAction<boolean>>;
  webMode: boolean;
  setWebMode: Dispatch<SetStateAction<boolean>>;

  // Document scope picker
  scopeIds: string[];
  setScopeIds: Dispatch<SetStateAction<string[]>>;

  // Model selector
  modelMenuRef: RefObject<HTMLDivElement | null>;
  selectedModel: string;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  showModelMenu: boolean;
  setShowModelMenu: Dispatch<SetStateAction<boolean>>;

  // Send
  busy: boolean;
  send: (overrideText?: string) => Promise<void>;
}

/**
 * The composer area at the bottom of the chat view.
 *
 * Renders either the voice-dictation overlay (when `isListening` is true) or
 * the standard text input with the source-mode toggle, document-scope picker,
 * model selector, mic button and send button. Also renders any voice-error
 * banners below the composer.
 *
 * Extracted verbatim from the `renderComposerContent` helper in Chat.tsx.
 * Zero visual or functional changes.
 */
export function ChatComposer({
  isListening,
  audioStream,
  handleVoiceCancel,
  handleVoiceConfirm,
  voiceSupported,
  handleVoiceToggle,
  voiceError,
  clearVoiceError,
  input,
  setInput,
  onKey,
  textareaRef,
  insightMode,
  setInsightMode,
  webMode,
  setWebMode,
  scopeIds,
  setScopeIds,
  modelMenuRef,
  selectedModel,
  setSelectedModel,
  showModelMenu,
  setShowModelMenu,
  busy,
  send,
}: ChatComposerProps) {
  return (
    <>
      {isListening ? (
        <div className="voice-dictation-card" role="region" aria-label="Voice input active">
          <div className="voice-dictation-top">
            <span className="voice-dictation-label">Listening...</span>
          </div>
          <div className="voice-dictation-body">
            <div className="voice-waveform-wrap">
              <VoiceWaveform audioStream={audioStream} isListening={isListening} />
            </div>
            <div className="voice-dictation-actions">
              <button
                type="button"
                className="voice-cancel-btn"
                onClick={handleVoiceCancel}
                title="Cancel voice input (Esc)"
                aria-label="Cancel voice input"
              >
                <Icon name="close" size={17} />
              </button>
              <button
                type="button"
                className="voice-confirm-btn"
                onClick={handleVoiceConfirm}
                title="Confirm voice input (Enter)"
                aria-label="Confirm voice input"
              >
                <Icon name="check" size={17} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="composer">
          <textarea
            ref={textareaRef}
            placeholder="How can I help you today?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            className="composer-textarea"
          />

          <div className="composer-bottom-bar">
            {/* ── Left Side: Segmented Source Toggle Switch (Insight vs Web) ── */}
            <div className="composer-bottom-left">
              <div className="composer-source-segmented" role="radiogroup" aria-label="Knowledge source switch">
                <button
                  type="button"
                  className={`composer-source-seg-btn${insightMode ? " active" : ""}`}
                  title="Insight Source — answers strictly from your uploaded documents"
                  aria-checked={insightMode}
                  role="radio"
                  onClick={() => {
                    setInsightMode(true);
                    setWebMode(false);
                  }}
                >
                  <Icon name="search" size={13} className="source-seg-icon" />
                  <span>Insight Source</span>
                </button>

                <button
                  type="button"
                  className={`composer-source-seg-btn${webMode ? " active" : ""}`}
                  title="Web Source — answers from live web search"
                  aria-checked={webMode}
                  role="radio"
                  onClick={() => {
                    setWebMode(true);
                    setInsightMode(false);
                  }}
                >
                  <Icon name="globe" size={13} className="source-seg-icon" />
                  <span>Web Source</span>
                </button>
              </div>
            </div>

            {/* ── Right Side: Document Picker -> Model -> Mic -> Send ── */}
            <div className="composer-bottom-right">
              {/* Select Document (styled same as model selector pill) */}
              <div className="composer-scope-wrapper">
                <DocumentScopePicker
                  value={scopeIds}
                  onChange={setScopeIds}
                  allowUpload
                  popupDirection="up"
                  size="sm"
                  minimal
                />
              </div>

              {/* Model Selector Pill */}
              <div ref={modelMenuRef} className="composer-model-dropdown-wrap">
                <button
                  type="button"
                  className="composer-model-pill"
                  onClick={() => setShowModelMenu(!showModelMenu)}
                  title="Select AI Model / Pipeline"
                >
                  <span>{selectedModel}</span>
                  <Icon name="chevronDown" size={13} />
                </button>

                {showModelMenu && (
                  <div className="composer-model-menu">
                    {[
                      {
                        id: "synapse-hybrid",
                        name: "Synapse Hybrid RAG",
                        desc: "Dense Vector + BM25 keyword retrieval",
                      },
                      {
                        id: "custom-models",
                        name: "Custom Models (Coming Soon)",
                        desc: "Fine-tuned domain models",
                        disabled: true,
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        disabled={m.disabled}
                        className={`cm-item ${selectedModel === m.name ? "active" : ""} ${m.disabled ? "disabled" : ""}`}
                        onClick={() => {
                          if (!m.disabled) {
                            setSelectedModel(m.name);
                            setShowModelMenu(false);
                          }
                        }}
                      >
                        <div className="cm-item-text">
                          <span className="cm-item-title">{m.name}</span>
                          <span className="cm-item-desc">{m.desc}</span>
                        </div>
                        {selectedModel === m.name && <Icon name="check" size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Microphone Voice Button */}
              <button
                type="button"
                className={`composer-voice-btn${!voiceSupported ? " is-disabled" : ""}`}
                title={
                  !voiceSupported
                    ? "Voice input isn't supported in this browser — try Chrome or Edge."
                    : "Start voice input"
                }
                aria-label="Start voice input"
                disabled={!voiceSupported}
                onClick={handleVoiceToggle}
              >
                <Icon name="mic" size={17} />
              </button>

              {/* Send Button */}
              {input.trim() && (
                <button
                  type="button"
                  className="composer-send-btn"
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  title="Send (Enter)"
                  aria-label="Send message"
                >
                  {busy ? (
                    <span className="spinner spinner-sm" />
                  ) : (
                    <Icon name="send" size={14} />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Voice error feedback ── */}
      {voiceError === "permission-denied" && (
        <div className="voice-status-row voice-status-error" role="alert">
          <Icon name="mic" size={13} />
          <span>
            Microphone access was blocked. Enable it in your browser&rsquo;s site
            settings and try again.
          </span>
          <button
            type="button"
            className="voice-status-dismiss"
            aria-label="Dismiss"
            onClick={clearVoiceError}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
      {voiceError === "recognition-error" && (
        <div className="voice-status-row voice-status-error" role="alert">
          <Icon name="mic" size={13} />
          <span>Voice input failed — please try again or type your question.</span>
          <button
            type="button"
            className="voice-status-dismiss"
            aria-label="Dismiss"
            onClick={clearVoiceError}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </>
  );
}
