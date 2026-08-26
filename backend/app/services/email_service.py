"""Email service: asynchronous SMTP email delivery with dev console fallback."""
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("email_service")


async def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """Send password reset email via SMTP if configured, else log and print to console."""
    if not settings.smtp_host:
        log.info(
            "password_reset_link_dev",
            recipient=to_email,
            reset_url=reset_link,
        )
        print(
            f"\n=======================================================\n"
            f"[SYNAPSE AUTH] Password reset link for {to_email}:\n"
            f"{reset_link}\n"
            f"=======================================================\n",
            flush=True,
        )
        return

    def _sync_send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset your Synapse password"
        msg["From"] = f"{settings.emails_from_name} <{settings.emails_from_email}>"
        msg["To"] = to_email

        text_body = (
            f"Hello,\n\n"
            f"You requested a password reset for your Synapse account.\n"
            f"Click the link below to set a new password:\n"
            f"{reset_link}\n\n"
            f"This link will expire in 15 minutes.\n"
            f"If you did not request this, please ignore this email.\n"
        )
        html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; color: #111827;">
    <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 24px; color: #09090b;">SYNAPSE</div>
    <h2 style="font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 12px; color: #111827;">Reset your password</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 24px;">
      We received a request to reset the password for your Synapse account. Click the button below to choose a new password.
    </p>
    <div style="margin-bottom: 28px;">
      <a href="{reset_link}" style="display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">Reset password</a>
    </div>
    <p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin-bottom: 8px;">
      Or copy and paste this link in your browser:
    </p>
    <p style="font-size: 12px; color: #3b82f6; word-break: break-all; margin-bottom: 24px;">
      {reset_link}
    </p>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0 16px;" />
    <p style="font-size: 11px; color: #9ca3af; line-height: 1.4; margin: 0;">
      This link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.emails_from_email, [to_email], msg.as_string())

    try:
        await asyncio.to_thread(_sync_send)
        log.info("email_sent", recipient=to_email, template="password_reset")
    except Exception as exc:
        log.error("email_send_failed", recipient=to_email, error=str(exc))
        print(
            f"\n[SYNAPSE AUTH ERROR] Failed to send email via SMTP ({exc}). Dev fallback reset link:\n{reset_link}\n",
            flush=True,
        )


async def send_verification_email(to_email: str, verify_link: str, full_name: str = "") -> None:
    """Send account email verification link via SMTP if configured, else print to console for dev."""
    name_greeting = f"Hi {full_name.strip().split()[0]}," if full_name.strip() else "Hello,"

    if not settings.smtp_host:
        log.info(
            "email_verification_link_dev",
            recipient=to_email,
            verify_url=verify_link,
        )
        print(
            f"\n=======================================================\n"
            f"[SYNAPSE AUTH] Email verification link for {to_email}:\n"
            f"{verify_link}\n"
            f"=======================================================\n",
            flush=True,
        )
        return

    def _sync_send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Verify your Synapse account"
        msg["From"] = f"{settings.emails_from_name} <{settings.emails_from_email}>"
        msg["To"] = to_email

        text_body = (
            f"{name_greeting}\n\n"
            f"Thank you for signing up for Synapse! Please verify your email address by clicking the link below:\n"
            f"{verify_link}\n\n"
            f"This link will expire in 24 hours.\n"
            f"If you did not sign up for Synapse, please ignore this email.\n"
        )
        html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; color: #111827;">
    <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 24px; color: #09090b;">SYNAPSE</div>
    <h2 style="font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 12px; color: #111827;">Verify your email address</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #4b5563; margin-bottom: 24px;">
      {name_greeting} thank you for creating a Synapse account. Click the button below to confirm your email and activate your workspace.
    </p>
    <div style="margin-bottom: 28px;">
      <a href="{verify_link}" style="display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 8px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em;">Verify my email</a>
    </div>
    <p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin-bottom: 8px;">
      Or copy and paste this link in your browser:
    </p>
    <p style="font-size: 12px; color: #3b82f6; word-break: break-all; margin-bottom: 24px;">
      {verify_link}
    </p>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0 16px;" />
    <p style="font-size: 11px; color: #9ca3af; line-height: 1.4; margin: 0;">
      This link will expire in 24 hours. If you did not create an account, you can safely ignore this email.
    </p>
  </div>
</body>
</html>"""

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.emails_from_email, [to_email], msg.as_string())

    try:
        await asyncio.to_thread(_sync_send)
        log.info("email_sent", recipient=to_email, template="email_verification")
    except Exception as exc:
        log.error("email_send_failed", recipient=to_email, error=str(exc))
        print(
            f"\n[SYNAPSE AUTH ERROR] Failed to send email via SMTP ({exc}). Dev fallback verification link:\n{verify_link}\n",
            flush=True,
        )

