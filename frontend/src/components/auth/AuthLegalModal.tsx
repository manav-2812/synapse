import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Icon } from "../ui/Icon";

export type LegalType = "terms" | "privacy" | null;

interface Props {
  type: LegalType;
  onClose: () => void;
}

export function AuthLegalModal({ type, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">("terms");

  // Sync activeTab only when modal is opened with a new type
  useEffect(() => {
    if (type) {
      setActiveTab(type);
    }
  }, [type]);

  return (
    <Modal
      open={type !== null}
      onClose={onClose}
      title=""
    >
      <div className="notion-legal-modal-inner">
        {/* Custom Header with Tabs */}
        <div className="notion-legal-modal-head">
          <div className="notion-legal-tabs">
            <button
              type="button"
              className={`notion-legal-tab${activeTab === "terms" ? " active" : ""}`}
              onClick={() => setActiveTab("terms")}
            >
              <Icon name="fileText" size={14} />
              <span>Terms &amp; Conditions</span>
            </button>
            <button
              type="button"
              className={`notion-legal-tab${activeTab === "privacy" ? " active" : ""}`}
              onClick={() => setActiveTab("privacy")}
            >
              <Icon name="lock" size={14} />
              <span>Privacy Policy</span>
            </button>
          </div>
          <button type="button" className="notion-legal-close" onClick={onClose} aria-label="Close modal">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div className="notion-legal-modal-scroll">
          {activeTab === "terms" ? (
            <div className="notion-legal-doc">
              <div className="notion-legal-banner">
                <h3>Synapse Terms of Service</h3>
                <p className="notion-legal-meta">Last updated: August 2026 • Version 1.1</p>
              </div>

              <section className="notion-legal-section">
                <h4>1. Acceptance of Terms</h4>
                <p>
                  By accessing or using Synapse (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not access or use the Service. Synapse provides an intelligent workspace for document analysis, AI-powered notes, flashcards, and quizzes.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>2. User Accounts & Workspace Security</h4>
                <p>
                  You are responsible for maintaining the confidentiality of your workspace credentials and for all activities that occur under your account. You agree to immediately notify us of any unauthorized use of your account.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>3. Document Uploads & Knowledge Processing</h4>
                <p>
                  You retain all ownership and intellectual property rights in the study materials, documents, and notes you upload to Synapse. By uploading documents, you grant Synapse a limited license solely to index, process embeddings, generate study notes, and power retrieval-augmented generation (RAG) for your workspace.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>4. AI Generation & Academic Integrity</h4>
                <p>
                  Synapse utilizes state-of-the-art language models to assist with synthesis, practice quizzes, and conceptual tutoring. AI outputs are meant to assist and accelerate your study; users should independently verify factual accuracy for critical academic examinations.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>5. Termination & Data Portability</h4>
                <p>
                  You may export your study materials, flashcards, and notes at any time. You may terminate your account whenever you choose through the profile settings, which permanently purges your vector embeddings and document store.
                </p>
              </section>
            </div>
          ) : (
            <div className="notion-legal-doc">
              <div className="notion-legal-banner">
                <h3>Synapse Privacy Policy</h3>
                <p className="notion-legal-meta">Last updated: August 2026 • Version 1.1 • GDPR &amp; CCPA Compliant</p>
              </div>

              <section className="notion-legal-section">
                <h4>1. Information We Collect</h4>
                <p>
                  We collect information you provide directly, including your name, email address, password hash, and the documents, text, and study files you upload to your private workspace.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>2. Zero Model Training on User Documents</h4>
                <p>
                  <strong>We do not use your private documents, notes, or chat queries to train third-party AI models.</strong> All document chunks and vector embeddings are stored in tenant-isolated secure database partitions accessible only by your authenticated session.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>3. Secure Vector Search &amp; RAG</h4>
                <p>
                  When you ask questions in Chat or generate flashcards, relevant snippets from your documents are retrieved via encrypted semantic vectors and passed ephemerally to the LLM solely to generate your response.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>4. Data Encryption &amp; Storage</h4>
                <p>
                  All data in transit is encrypted using TLS 1.3. Uploaded documents and vector representations in SQLite/PostgreSQL are encrypted at rest with industry-standard AES-256 protocols.
                </p>
              </section>

              <section className="notion-legal-section">
                <h4>5. Your Privacy Rights</h4>
                <p>
                  Under international privacy frameworks, you have the right to request a complete export of your personal data, request corrections, or permanently delete your account and all associated documents.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="notion-legal-modal-foot">
          <button type="button" className="notion-legal-done-btn" onClick={onClose}>
            I understand
          </button>
        </div>
      </div>
    </Modal>
  );
}
