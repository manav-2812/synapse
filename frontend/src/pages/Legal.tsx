import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { BrandLogo } from "../components/ui/BrandLogo";
import { useTheme } from "../hooks/useTheme";
import "../styles/auth.css";

export default function Legal() {
  const location = useLocation();
  const { themeMode, setThemeMode } = useTheme();

  const isPrivacyInitial = location.pathname.includes("privacy");
  const [activeTab, setActiveTab] = useState<"terms" | "privacy">(
    isPrivacyInitial ? "privacy" : "terms"
  );

  useEffect(() => {
    if (location.pathname.includes("privacy")) {
      setActiveTab("privacy");
    } else if (location.pathname.includes("terms")) {
      setActiveTab("terms");
    }
  }, [location.pathname]);

  return (
    <main className="notion-page" style={{ minHeight: "100vh", padding: "24px 16px 48px", justifyContent: "flex-start" }}>
      {/* Topbar with Theme Switcher and Back to Sign In */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "760px", margin: "0 auto 24px auto" }}>
        <Link to="/login" className="notion-forgot-link" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500 }}>
          <Icon name="arrowLeft" size={14} />
          <span>Back to Synapse</span>
        </Link>
        <div className="notion-theme-segmented" role="radiogroup" aria-label="Theme mode switcher">
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "light" ? "active" : ""}`}
            onClick={() => setThemeMode("light")}
            title="Light mode"
            aria-label="Light mode"
          >
            <Icon name="sun" size={14} />
          </button>
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "system" ? "active" : ""}`}
            onClick={() => setThemeMode("system")}
            title="System preference"
            aria-label="System preference"
          >
            <Icon name="monitor" size={14} />
          </button>
          <button
            type="button"
            className={`notion-theme-btn ${themeMode === "dark" ? "active" : ""}`}
            onClick={() => setThemeMode("dark")}
            title="Dark mode"
            aria-label="Dark mode"
          >
            <Icon name="moon" size={14} />
          </button>
        </div>
      </header>

      {/* Main Legal Card Container */}
      <div className="notion-legal-card">
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <div style={{ width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandLogo size={26} />
          </div>
          <span className="notion-brand-name">SYNAPSE</span>
        </div>

        {/* Tab Switcher */}
        <div className="notion-legal-tabs" style={{ marginBottom: "28px", display: "inline-flex" }}>
          <button
            type="button"
            className={`notion-legal-tab ${activeTab === "terms" ? "active" : ""}`}
            onClick={() => setActiveTab("terms")}
          >
            <Icon name="fileText" size={14} />
            <span>Terms of Service</span>
          </button>
          <button
            type="button"
            className={`notion-legal-tab ${activeTab === "privacy" ? "active" : ""}`}
            onClick={() => setActiveTab("privacy")}
          >
            <Icon name="lock" size={14} />
            <span>Privacy Policy</span>
          </button>
        </div>

        {/* Document Content */}
        {activeTab === "terms" ? (
          <article className="notion-legal-doc">
            <div className="notion-legal-banner">
              <h1>Terms of Service</h1>
              <p className="notion-legal-meta">
                Effective Date: August 2026 • Version 1.1
              </p>
            </div>

            <section className="notion-legal-section">
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing or registering for Synapse (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not access or use the Service. Synapse provides an intelligent workspace for document analysis, AI-powered notes, flashcards, and quizzes.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>2. User Accounts &amp; Workspace Security</h2>
              <p>
                You are responsible for maintaining the confidentiality of your workspace credentials (password and passkeys) and for all activities that occur under your account. You agree to immediately notify us of any unauthorized use of your account.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>3. Document Uploads &amp; Knowledge Processing</h2>
              <p>
                You retain all ownership and intellectual property rights in the study materials, documents, PDFs, and notes you upload to Synapse. By uploading documents, you grant Synapse a limited license solely to extract text, compute vector embeddings, generate study notes, and power retrieval-augmented generation (RAG) for your workspace.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>4. AI Generation &amp; Academic Integrity</h2>
              <p>
                Synapse utilizes state-of-the-art language models (such as Groq, Google Gemini, and OpenRouter) to assist with synthesis, practice quizzes, and conceptual tutoring. AI outputs are meant to assist and accelerate your study; users should independently verify factual accuracy for critical academic examinations.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>5. Termination &amp; Data Portability</h2>
              <p>
                You may export your study materials, flashcards, and notes at any time. You may delete your account whenever you choose through your profile settings, which permanently purges your vector embeddings, database records, and document files.
              </p>
            </section>
          </article>
        ) : (
          <article className="notion-legal-doc">
            <div className="notion-legal-banner">
              <h1>Privacy Policy</h1>
              <p className="notion-legal-meta">
                Effective Date: August 2026 • Version 1.1
              </p>
            </div>

            <section className="notion-legal-section">
              <h2>1. Information We Collect</h2>
              <p>
                We collect information you provide directly to us: your email address, full name, encrypted password hash (via bcrypt), WebAuthn passkey public credentials, and uploaded study materials (PDF, DOCX, TXT, images). For OAuth logins (Google and Microsoft), we receive your verified email and display name to authenticate your account.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>2. How We Use Your Data</h2>
              <p>
                Your data is used exclusively to deliver the Synapse workspace features: indexing study materials with localized embeddings, providing conversational retrieval answers, generating personalized flashcards and quizzes, and calculating study streaks. We do not sell your personal data or uploaded documents to third-party advertisers.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>3. AI Model Providers &amp; Processing</h2>
              <p>
                To generate answers, summaries, and quizzes, relevant document excerpts are sent via encrypted HTTPS API requests to inference providers (Google Gemini, Groq, OpenRouter). Document text is processed ephemerally for completion generation and is not used to train foundational public models.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>4. Security &amp; Data Protection</h2>
              <p>
                Synapse implements end-to-end security best practices, including TLS 1.3 encryption in transit, isolated per-user vector namespaces, salted bcrypt password hashing, and encrypted database connections in production.
              </p>
            </section>

            <section className="notion-legal-section">
              <h2>5. Your Rights &amp; Deletion</h2>
              <p>
                You have the right to access, export, or permanently delete your account data at any time through the Synapse profile settings. Deletion immediately and irrevocably wipes your documents, embeddings, and chat history.
              </p>
            </section>
          </article>
        )}

        <div className="notion-legal-card-footer">
          <span>&copy; 2026 Synapse. All rights reserved.</span>
          <Link to="/login" className="notion-link-bold" style={{ fontSize: "12px" }}>
            Return to Sign In &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
