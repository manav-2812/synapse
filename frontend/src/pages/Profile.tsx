import { useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Icon } from "../components/ui/Icon";
import { Tip } from "../components/Tip";
import { TIP } from "../components/tips";

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.profile_image_url ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [goal, setGoal] = useState<number>(user?.daily_study_goal_minutes ?? 30);
  const [goalBusy, setGoalBusy] = useState(false);

  if (!user) return null;

  function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function savePhoto() {
    if (!avatarFile) return;
    setAvatarBusy(true);
    try {
      const updated = await authApi.uploadAvatar(avatarFile);
      setAvatarFile(null);
      await refreshUser();
      void updated;
      toast("success", "Photo updated", "Your profile photo has been saved.");
    } catch (err) {
      toast("error", "Upload failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveDetails() {
    if (!name.trim()) {
      toast("error", "Missing name", "Please enter your name.");
      return;
    }
    const emailChanged = email.trim() !== user!.email;
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
      toast("success", "Profile saved", "Your details have been updated.");
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
      toast("success", "Password updated", "You'll be asked to sign in again after this session.");
    } catch (err) {
      toast("error", "Couldn't update", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setPwBusy(false);
    }
  }

  const initial = (user.full_name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="stack profile-page">
      <Tip
        id={TIP.profileTheme}
        title="Make it yours"
        icon="moon"
      >
        Toggle light or dark from the top bar — your choice is saved
        across visits.
      </Tip>
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p className="page-sub muted">Manage your photo, account details, and password.</p>
        </div>
      </div>

      <section className="card profile-photo-card">
        <div className="profile-photo">
          {avatarPreview ? (
            <img src={avatarPreview} alt="Profile" className="profile-photo-img" />
          ) : (
            <div className="profile-photo-fallback">{initial}</div>
          )}
        </div>
        <div className="profile-photo-actions">
          <h2 className="section-title">Profile photo</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
            PNG, JPG, or WebP · up to 5 MB.
          </p>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={15} /> Choose image
            </Button>
            <Button
              onClick={() => void savePhoto()}
              loading={avatarBusy}
              disabled={!avatarFile}
            >
              Save photo
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={onPickAvatar}
          />
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Account details</h2>
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Current password (required to change email)"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter to confirm email change"
        />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
          <Button onClick={() => void saveDetails()} loading={detailsBusy}>
            Save details
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Study goal</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 12 }}>
          Set a daily study target in minutes. Your dashboard tracks progress toward it.
        </p>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <Input
            label="Daily goal (minutes)"
            type="number"
            min={0}
            value={goal === 0 ? "" : String(goal)}
            onChange={(e) => setGoal(e.target.value === "" ? 0 : Number(e.target.value))}
            style={{ maxWidth: 200 }}
          />
          <Button onClick={() => void saveGoal()} loading={goalBusy}>
            Save goal
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Change password</h2>
        <Input
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="secondary" onClick={() => void changePassword()} loading={pwBusy}>
            Update password
          </Button>
        </div>
      </section>
    </div>
  );
}
