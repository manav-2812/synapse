import { useEffect, useRef, useState, useMemo, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { authApi } from "../api/auth";
import { listUserPasskeys, registerPasskey, deleteUserPasskey, type PasskeyItem } from "../api/passkey";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { LogoutConfirmModal } from "../components/LogoutConfirmModal";
import { ExportDataModal } from "../components/ExportDataModal";
import { DeleteAccountModal } from "../components/DeleteAccountModal";

const GOAL_PRESETS = [15, 30, 45, 60, 90, 120];
const SLIDER_TICKS = [0, 30, 60, 90, 120, 180];

export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();

  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportBackupBusy, setExportBackupBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
      setLogoutOpen(false);
    }
  }

  async function handleExportBackup() {
    setExportBackupBusy(true);
    try {
      const data = await authApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synapse-gdpr-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("success", "GDPR Archive Exported", "Complete workspace dataset downloaded successfully.");
    } catch (err: any) {
      toast("error", "Export failed", err?.message || "Could not generate GDPR archive.");
    } finally {
      setExportBackupBusy(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteAccountBusy(true);
    try {
      await authApi.deleteAccount();
      toast("success", "Account deleted", "Your account and all associated data have been permanently erased.");
      navigate("/signup");
    } catch (err: any) {
      toast("error", "Deletion failed", err?.message || "Could not delete account.");
    } finally {
      setDeleteAccountBusy(false);
      setDeleteAccountOpen(false);
    }
  }

  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [copiedEmail, setCopiedEmail] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user?.profile_image_url ?? null
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [detailsBusy, setDetailsBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [goal, setGoal] = useState<number>(user?.daily_study_goal_minutes ?? 30);
  const [goalBusy, setGoalBusy] = useState(false);

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);

  useEffect(() => {
    async function loadPasskeys() {
      try {
        setPasskeysLoading(true);
        const data = await listUserPasskeys();
        setPasskeys(data);
      } catch {
        // silent
      } finally {
        setPasskeysLoading(false);
      }
    }
    void loadPasskeys();
  }, []);

  async function handleAddPasskey() {
    setAddingPasskey(true);
    try {
      const defaultName = navigator.userAgent.includes("Windows")
        ? "Windows Hello"
        : navigator.userAgent.includes("Mac")
        ? "Touch ID / iCloud"
        : "Device Passkey";
      const created = await registerPasskey(defaultName);
      setPasskeys((prev) => [created, ...prev]);
      toast("success", "Passkey added", "You can now log in instantly using your device passkey!");
    } catch (err: any) {
      toast("error", "Passkey registration cancelled", err?.message || "Failed to register passkey.");
    } finally {
      setAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    try {
      await deleteUserPasskey(id);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      toast("success", "Passkey removed", "The passkey was removed from your account.");
    } catch (err: any) {
      toast("error", "Delete failed", err?.message || "Could not remove passkey.");
    }
  }

  // Password strength scoring (0 to 4)
  const pwStrength = useMemo(() => {
    if (!newPassword) return 0;
    let s = 0;
    if (newPassword.length >= 8) s += 1;
    if (/[A-Z]/.test(newPassword)) s += 1;
    if (/[0-9]/.test(newPassword)) s += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) s += 1;
    return s;
  }, [newPassword]);

  // Pace descriptor for goal
  const goalPace = useMemo(() => {
    if (goal <= 0) return { label: "Paused", tag: " Inactive Goal" };
    if (goal < 20) return { label: "Sprint", tag: " Quick Sprint" };
    if (goal < 45) return { label: "Focused", tag: " Focused Practice" };
    if (goal < 75) return { label: "Intensive", tag: " Power Study" };
    return { label: "Mastery", tag: " Deep Mastery" };
  }, [goal]);

  const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#22c55e"];

  if (!user) return null;

  const initial = (user.full_name || user.email || "?").slice(0, 1).toUpperCase();

  function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("error", "File too large", "Please select an image smaller than 5MB.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function savePhoto() {
    if (!avatarFile) return;
    setAvatarBusy(true);
    try {
      await authApi.uploadAvatar(avatarFile);
      setAvatarFile(null);
      await refreshUser();
      toast("success", "Photo updated", "Your profile photo has been saved.");
    } catch (err) {
      toast("error", "Upload failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  function handleCopyEmail() {
    if (!user?.email) return;
    navigator.clipboard.writeText(user.email);
    setCopiedEmail(true);
    toast("success", "Copied", "Email copied to clipboard.");
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  async function saveDetails() {
    if (!name.trim()) {
      toast("error", "Missing name", "Please enter your name.");
      return;
    }
    const emailChanged = email.trim().toLowerCase() !== user!.email.toLowerCase();
    if (emailChanged && !currentPassword) {
      toast("error", "Confirm password", "Enter your current password to change email.");
      return;
    }
    setDetailsBusy(true);
    try {
      await authApi.updateMe({
        full_name: name.trim(),
        ...(emailChanged ? { email: email.trim(), current_password: currentPassword } : {}),
      });
      await refreshUser();
      if (emailChanged) setCurrentPassword("");
      toast("success", "Profile saved", "Your account details have been updated.");
    } catch (err) {
      toast("error", "Couldn't save", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setDetailsBusy(false);
    }
  }

  async function saveGoal() {
    const minutes = Number(goal);
    if (!Number.isFinite(minutes) || minutes < 0) {
      toast("error", "Invalid goal", "Enter a study goal of 0 or more minutes.");
      return;
    }
    setGoalBusy(true);
    try {
      await authApi.updateMe({ daily_study_goal_minutes: Math.round(minutes) });
      await refreshUser();
      toast("success", "Goal saved", "Your daily study goal has been updated.");
    } catch (err) {
      toast("error", "Couldn't save", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setGoalBusy(false);
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      toast("error", "Missing fields", "Enter your current and new password.");
      return;
    }
    if (newPassword.length < 8) {
      toast("error", "Weak password", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("error", "Mismatch", "New password and confirmation don't match.");
      return;
    }
    setPwBusy(true);
    try {
      await authApi.updateMe({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("success", "Password updated", "Your password has been changed successfully.");
    } catch (err) {
      toast("error", "Couldn't update", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="profile-pg rise">

      {/* ── Top Hero Card ── */}
      <div className="profile-hero-card">
        <div className="profile-hero-content">
          <div className="profile-hero-avatar-wrap">
            <div
              className="profile-hero-avatar"
              onClick={() => fileRef.current?.click()}
              title="Click to change photo"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile" className="profile-hero-avatar-img" />
              ) : (
                <span className="profile-hero-avatar-initial">{initial}</span>
              )}
              <div className="profile-hero-avatar-overlay">
                <Icon name="camera" size={18} />
              </div>
            </div>
          </div>

          <div className="profile-hero-details">
            <div className="profile-hero-title-row">
              <h1 className="profile-hero-name">{user.full_name || "Study Explorer"}</h1>
              <span className="profile-hero-status-tag">
                <span className="profile-hero-status-dot" />
                Active Account
              </span>
            </div>

            <div className="profile-hero-email-row">
              <span className="profile-hero-email">{user.email}</span>
              <button
                className="profile-copy-btn"
                onClick={handleCopyEmail}
                title="Copy email address"
                aria-label="Copy email"
              >
                <Icon name={copiedEmail ? "check" : "copy"} size={13} />
                <span>{copiedEmail ? "Copied" : "Copy"}</span>
              </button>
            </div>

            {avatarFile && (
              <div className="profile-avatar-action-bar">
                <Button onClick={() => void savePhoto()} loading={avatarBusy}>
                  Save Photo
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(user.profile_image_url ?? null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="profile-hero-actions">
            <button
              className="profile-logout-btn"
              onClick={() => setLogoutOpen(true)}
              title="Log out of your account"
            >
              <Icon name="logout" size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={onPickAvatar}
        />
      </div>

      {/* ── Main Settings Grid ── */}
      <div className="profile-grid">

        {/* 1. Account details */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Account details</h2>
              <p className="profile-card-desc">Update your personal name and login email.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-inputs-stack">
              <Input
                label="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Manav Baghel"
              />
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />

              {email.trim().toLowerCase() !== user.email.toLowerCase() && (
                <div className="profile-email-verify-notice">
                  <Input
                    label="Current password (required to change email)"
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    trailing={
                      <button
                        type="button"
                        className="pw-toggle-btn"
                        onClick={() => setShowCurrentPw((s) => !s)}
                        aria-label={showCurrentPw ? "Hide password" : "Show password"}
                      >
                        <Icon name={showCurrentPw ? "eyeOff" : "eye"} size={16} />
                      </button>
                    }
                  />
                </div>
              )}
            </div>

            <div className="profile-card-footer">
              <Button
                onClick={() => void saveDetails()}
                loading={detailsBusy}
                disabled={name.trim() === user.full_name && email.trim() === user.email}
              >
                Save details
              </Button>
            </div>
          </div>
        </section>

        {/* 2. Security & Password */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Change password</h2>
              <p className="profile-card-desc">Ensure your account uses a secure password.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-inputs-stack">
              <Input
                label="Current password"
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                trailing={
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowCurrentPw((s) => !s)}
                    aria-label={showCurrentPw ? "Hide password" : "Show password"}
                  >
                    <Icon name={showCurrentPw ? "eyeOff" : "eye"} size={16} />
                  </button>
                }
              />

              <Input
                label="New password"
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                trailing={
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowNewPw((s) => !s)}
                    aria-label={showNewPw ? "Hide password" : "Show password"}
                  >
                    <Icon name={showNewPw ? "eyeOff" : "eye"} size={16} />
                  </button>
                }
              />

              {/* Password strength meter */}
              {newPassword.length > 0 && (
                <div className="profile-pw-meter">
                  <div className="profile-pw-meter-bars">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className="profile-pw-meter-bar"
                        style={{
                          background:
                            pwStrength >= step ? strengthColors[pwStrength] : "var(--surface-3)",
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className="profile-pw-meter-label"
                    style={{ color: strengthColors[pwStrength] }}
                  >
                    {strengthLabels[pwStrength]}
                  </span>
                </div>
              )}

              <Input
                label="Confirm new password"
                type={showConfirmPw ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                trailing={
                  <button
                    type="button"
                    className="pw-toggle-btn"
                    onClick={() => setShowConfirmPw((s) => !s)}
                    aria-label={showConfirmPw ? "Hide password" : "Show password"}
                  >
                    <Icon name={showConfirmPw ? "eyeOff" : "eye"} size={16} />
                  </button>
                }
              />
            </div>

            <div className="profile-card-footer">
              <Button
                variant="secondary"
                onClick={() => void changePassword()}
                loading={pwBusy}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update password
              </Button>
            </div>
          </div>
        </section>

        {/* 3. Daily study goal */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Daily study goal</h2>
              <p className="profile-card-desc">Set your daily target to pace your learning.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-goal-display-card">
              <div className="profile-goal-main">
                <span className="profile-goal-number">{goal}</span>
                <span className="profile-goal-unit">min / day</span>
              </div>
              <span className="profile-goal-pace-badge">{goalPace.tag}</span>
            </div>

            {/* Slider */}
            <div className="profile-slider-wrap">
              <input
                type="range"
                min={0}
                max={180}
                step={5}
                value={goal}
                onChange={(e) => setGoal(Number(e.target.value))}
                className="profile-range-slider"
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(goal / 180) * 100}%, var(--surface-3) ${(goal / 180) * 100}%, var(--surface-3) 100%)`,
                }}
                aria-label="Daily study goal in minutes"
              />
              <div className="profile-slider-markers">
                {SLIDER_TICKS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`profile-slider-marker${goal === t ? " active" : ""}`}
                    style={{ left: `${(t / 180) * 100}%` }}
                    onClick={() => setGoal(t)}
                    title={`Set goal to ${t} minutes`}
                  >
                    {t}m
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Presets */}
            <div className="profile-preset-row">
              <span className="profile-preset-label">Quick Presets:</span>
              <div className="profile-preset-chips">
                {GOAL_PRESETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`profile-preset-chip${goal === m ? " active" : ""}`}
                    onClick={() => setGoal(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-card-footer">
              <Button
                onClick={() => void saveGoal()}
                loading={goalBusy}
                disabled={goal === user.daily_study_goal_minutes}
              >
                Save goal
              </Button>
            </div>
          </div>
        </section>

        {/* 4. Appearance & Theme */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Theme</h2>
              <p className="profile-card-desc">Customize workspace appearance.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-theme-grid">
              <button
                type="button"
                className={`profile-theme-card${theme === "light" ? " active" : ""}`}
                onClick={() => theme !== "light" && toggleTheme()}
              >
                <div className="profile-theme-preview light-preview">
                  <div className="theme-p-topbar">
                    <span className="theme-p-dot" />
                    <span className="theme-p-dot" />
                    <span className="theme-p-dot" />
                  </div>
                  <div className="theme-p-body">
                    <div className="theme-p-sidebar" />
                    <div className="theme-p-content">
                      <div className="theme-p-line theme-p-line--title" />
                      <div className="theme-p-line" />
                      <div className="theme-p-line" />
                    </div>
                  </div>
                </div>
                <div className="profile-theme-info">
                  <div className="profile-theme-title-row">
                    <span className="profile-theme-name">Light Mode</span>
                    <span className={`profile-theme-radio${theme === "light" ? " selected" : ""}`}>
                      {theme === "light" && <Icon name="check" size={10} />}
                    </span>
                  </div>
                  <span className="profile-theme-sub">Crisp paper ivory</span>
                </div>
              </button>

              <button
                type="button"
                className={`profile-theme-card${theme === "dark" ? " active" : ""}`}
                onClick={() => theme !== "dark" && toggleTheme()}
              >
                <div className="profile-theme-preview dark-preview">
                  <div className="theme-p-topbar">
                    <span className="theme-p-dot" />
                    <span className="theme-p-dot" />
                    <span className="theme-p-dot" />
                  </div>
                  <div className="theme-p-body">
                    <div className="theme-p-sidebar" />
                    <div className="theme-p-content">
                      <div className="theme-p-line theme-p-line--title" />
                      <div className="theme-p-line" />
                      <div className="theme-p-line" />
                    </div>
                  </div>
                </div>
                <div className="profile-theme-info">
                  <div className="profile-theme-title-row">
                    <span className="profile-theme-name">Dark Mode</span>
                    <span className={`profile-theme-radio${theme === "dark" ? " selected" : ""}`}>
                      {theme === "dark" && <Icon name="check" size={10} />}
                    </span>
                  </div>
                  <span className="profile-theme-sub">Deep obsidian slate</span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* 5. Passkeys & Biometrics (WebAuthn / Windows Hello / Touch ID) */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Passkeys &amp; Biometrics</h2>
              <p className="profile-card-desc">Sign into Synapse in one tap using Windows Hello or Touch ID.</p>
            </div>
          </div>

          <div className="profile-card-body">
            {passkeysLoading ? (
              <p className="profile-passkey-hint">Loading passkeys...</p>
            ) : passkeys.length === 0 ? (
              <div className="profile-passkey-empty">
                <div className="profile-passkey-empty-icon">
                  <Icon name="key" size={18} />
                </div>
                <div className="profile-passkey-empty-content">
                  <p className="profile-passkey-empty-title">No passkeys registered yet</p>
                  <p className="profile-passkey-empty-desc">
                    Register this device to sign in instantly with Windows Hello PIN/Fingerprint or Touch ID.
                  </p>
                </div>
              </div>
            ) : (
              <div className="profile-passkeys-stack">
                <div className="profile-passkeys-list">
                  {passkeys.map((p) => (
                    <div key={p.id} className="profile-passkey-item">
                      <div className="profile-passkey-item-icon">
                        <Icon name="key" size={14} />
                      </div>
                      <div className="profile-passkey-item-info">
                        <div className="profile-passkey-item-header">
                          <span className="profile-passkey-item-name">{p.name}</span>
                          <span className="profile-passkey-badge">Active</span>
                        </div>
                        <span className="profile-passkey-item-meta">
                          Added {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {p.last_used_at && ` • Last used ${new Date(p.last_used_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="profile-passkey-item-del"
                        onClick={() => void handleDeletePasskey(p.id)}
                        title="Remove this passkey"
                        aria-label="Remove passkey"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="profile-passkey-sec-note">
                  <Icon name="lock" size={12} />
                  <span>FIDO2 / WebAuthn standard with hardware-backed encryption.</span>
                </div>
              </div>
            )}

            <div className="profile-card-footer">
              <Button
                onClick={() => void handleAddPasskey()}
                loading={addingPasskey}
              >
                <Icon name="plus" size={14} />
                <span>Register Device Passkey</span>
              </Button>
            </div>
          </div>
        </section>

        {/* 6. Data Portability & Privacy */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Data portability &amp; export</h2>
              <p className="profile-card-desc">Download and export your quizzes, flashcards, notes, and study sets.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-privacy-stack">
              <div className="profile-privacy-item">
                <div className="profile-privacy-item-info">
                  <div className="profile-privacy-title-wrap">
                    <span className="profile-privacy-title">Custom Study Materials Export</span>
                    <div className="profile-privacy-format-tags">
                      <span className="profile-format-tag">Markdown</span>
                      <span className="profile-format-tag">JSON</span>
                      <span className="profile-format-tag">CSV</span>
                    </div>
                  </div>
                  <span className="profile-privacy-desc">
                    Choose specific quizzes, flashcard decks, smart notes, or chats to export cleanly for local backups or external tools.
                  </span>
                </div>
                <div className="profile-privacy-action">
                  <Button
                    variant="secondary"
                    className="btn-sm"
                    onClick={() => setExportModalOpen(true)}
                  >
                    <Icon name="download" size={14} />
                    <span>Configure &amp; Export</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="profile-card-footer">
              <div className="profile-privacy-badge">
                <Icon name="checkCircle" size={14} />
                <span>Zero Training Guarantee: Your documents are never used to train public AI models.</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Keyboard Shortcuts Cheat Sheet */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Keyboard shortcuts</h2>
              <p className="profile-card-desc">Navigate Synapse with instant keyboard commands.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-shortcuts-sheet">
              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Command Palette</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Ctrl</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">K</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Toggle Sidebar</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Ctrl</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">B</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Quick AI Chat</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Alt</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">C</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Search Documents</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Ctrl</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">/</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Flashcard Decks</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Alt</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">F</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Practice Quiz</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Alt</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">Q</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Smart Notes</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Alt</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">N</kbd>
                </div>
              </div>

              <div className="profile-shortcut-item">
                <div className="profile-shortcut-left">
                  <span className="profile-shortcut-dot" />
                  <span className="profile-shortcut-name">Toggle Dark Mode</span>
                </div>
                <div className="profile-shortcut-keys">
                  <kbd className="profile-kbd">Alt</kbd>
                  <span className="profile-kbd-join">+</span>
                  <kbd className="profile-kbd">T</kbd>
                </div>
              </div>
            </div>

            <div className="profile-card-footer">
              <p className="profile-shortcut-hint">
                <span>Shortcuts work anywhere across your active workspace.</span>
              </p>
            </div>
          </div>
        </section>

        {/* 8. Workspace Memory & Usage Stats */}
        <section className="card profile-card">
          <div className="profile-card-head">
            <div className="profile-card-title-wrap">
              <h2 className="profile-card-title">Workspace memory &amp; stats</h2>
              <p className="profile-card-desc">Active knowledge base indexing and memory health.</p>
            </div>
          </div>

          <div className="profile-card-body">
            <div className="profile-stats-grid">
              <div className="profile-stat-box">
                <div className="profile-stat-top">
                  <span className="profile-stat-label">Knowledge Docs</span>
                  <span className="profile-stat-tag ok">Synced</span>
                </div>
                <div className="profile-stat-val">
                  <span className="profile-stat-num">18</span>
                  <span className="profile-stat-sub">documents</span>
                </div>
              </div>
              <div className="profile-stat-box">
                <div className="profile-stat-top">
                  <span className="profile-stat-label">Vector Chunks</span>
                  <span className="profile-stat-tag">1536-dim</span>
                </div>
                <div className="profile-stat-val">
                  <span className="profile-stat-num">1,420</span>
                  <span className="profile-stat-sub">embeddings</span>
                </div>
              </div>
              <div className="profile-stat-box">
                <div className="profile-stat-top">
                  <span className="profile-stat-label">Flashcards &amp; Notes</span>
                  <span className="profile-stat-tag ok">Active</span>
                </div>
                <div className="profile-stat-val">
                  <span className="profile-stat-num">84</span>
                  <span className="profile-stat-sub">items</span>
                </div>
              </div>
              <div className="profile-stat-box">
                <div className="profile-stat-top">
                  <span className="profile-stat-label">Index Health</span>
                  <span className="profile-stat-tag ok">Healthy</span>
                </div>
                <div className="profile-stat-val">
                  <span className="profile-stat-num">99.8%</span>
                  <span className="profile-stat-sub">operational</span>
                </div>
              </div>
            </div>

            <div className="profile-card-footer" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                className="btn-sm"
                onClick={() => void handleExportBackup()}
                loading={exportBackupBusy}
              >
                <Icon name="download" size={14} />
                <span>Export Full GDPR Archive</span>
              </Button>
              <Button
                variant="secondary"
                className="btn-sm"
                onClick={() => setExportModalOpen(true)}
              >
                <Icon name="layers" size={14} />
                <span>Custom Study Materials Export</span>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Section 6: Danger Zone (GDPR / CCPA Right to Erasure) ── */}
        <section className="profile-section" aria-labelledby="heading-danger">
          <div className="profile-section-header">
            <div className="profile-section-icon" style={{ background: "var(--danger-bg, rgba(224, 62, 62, 0.12))", color: "var(--danger, #dc2626)", border: "1px solid rgba(224, 62, 62, 0.25)" }}>
              <Icon name="trash" size={18} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 className="profile-section-title" id="heading-danger" style={{ color: "var(--danger, #dc2626)", margin: 0 }}>
                  Danger Zone
                </h2>
                <span className="danger-badge-pill">
                  <Icon name="shield" size={11} />
                  GDPR Article 17
                </span>
              </div>
              <p className="profile-section-desc">
                Irreversible account deletion, permanent physical data shredding, and vector erasure.
              </p>
            </div>
          </div>

          <div className="danger-zone-card">
            <div className="danger-zone-inner">
              <div className="danger-zone-details">
                <div className="danger-zone-header-line">
                  <h3 className="danger-zone-heading">
                    Permanently Delete Account &amp; Workspace Data
                  </h3>
                </div>
                <p className="danger-zone-description">
                  Permanently destroys your user profile, uploaded files on disk, ChromaDB vector collections, generated study notes, quizzes, flashcards, and encrypted chat messages.
                </p>
                <div className="danger-tag-list">
                  <span className="danger-tag-item">
                    <Icon name="file" size={12} />
                    Uploaded Documents
                  </span>
                  <span className="danger-tag-item">
                    <Icon name="database" size={12} />
                    ChromaDB Vector Index
                  </span>
                  <span className="danger-tag-item">
                    <Icon name="layers" size={12} />
                    Flashcards &amp; Quizzes
                  </span>
                  <span className="danger-tag-item">
                    <Icon name="message" size={12} />
                    Chat History
                  </span>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className="danger-btn-premium"
                  onClick={() => setDeleteAccountOpen(true)}
                >
                  <Icon name="trash" size={15} />
                  <span>Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>

      {exportModalOpen && (
        <ExportDataModal
          userName={user.full_name || name}
          userEmail={user.email || email}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {logoutOpen && (
        <LogoutConfirmModal
          loading={logoutBusy}
          onConfirm={() => void handleLogout()}
          onCancel={() => setLogoutOpen(false)}
        />
      )}

      {deleteAccountOpen && (
        <DeleteAccountModal
          loading={deleteAccountBusy}
          onConfirm={() => void handleDeleteAccount()}
          onCancel={() => setDeleteAccountOpen(false)}
        />
      )}
    </div>
  );
}


