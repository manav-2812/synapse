"""RFC 5322 compliant email validator with disposable domain blocking and DNS MX record verification."""
import re
from email_validator import (
    EmailNotValidError,
    EmailSyntaxError,
    EmailUndeliverableError,
    validate_email as _validate_email_lib,
)

from app.core.config import settings

# Comprehensive list of disposable / throwaway / temporary email providers
DISPOSABLE_EMAIL_DOMAINS = {
    # Common disposable / spam domains
    "mailinator.com",
    "tempmail.com",
    "temp-mail.org",
    "10minutemail.com",
    "10minutemail.net",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.biz",
    "sharklasers.com",
    "grr.la",
    "guerrillamailblock.com",
    "yopmail.com",
    "yopmail.fr",
    "yopmail.net",
    "trashmail.com",
    "trashmail.net",
    "trashmail.me",
    "dispostable.com",
    "getairmail.com",
    "throwawaymail.com",
    "fakemailgenerator.com",
    "maildrop.cc",
    "inboxkitten.com",
    "burnermail.io",
    "crazymailing.com",
    "dropmail.me",
    "mohmal.com",
    "nada.ltd",
    "getnada.com",
    "abcvg.com",
    "emailondeck.com",
    "generator.email",
    "mytemp.email",
    "tempinbox.com",
    "fakeinbox.com",
    "emailfake.com",
    "throwawayemail.com",
    "deadfake.com",
    "mailcatch.com",
    "spambox.us",
    "jetable.org",
    "mintemail.com",
    "harakirimail.com",
    # Placeholder / dummy domains
    "example.com",
    "example.org",
    "example.net",
    "example.edu",
    "test.com",
    "testing.com",
    "sample.com",
    "fake.com",
    "invalid.com",
    "demo.com",
}

BLOCKED_TLDS = (".test", ".example", ".invalid", ".localhost", ".local")


def validate_signup_email(email_str: str, check_mx: bool = True) -> str:
    """Validate email format (RFC 5322), disposable blocklist, and DNS MX deliverability.

    Raises ValueError with a clear, user-facing error message on failure.
    Returns normalized email string on success.
    """
    cleaned = email_str.strip().lower()
    if not cleaned or "@" not in cleaned:
        raise ValueError("Please enter a valid email address.")

    parts = cleaned.split("@")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("Please enter a valid email address.")

    domain = parts[1]

    # 1. Check blocked / disposable domains
    if domain in DISPOSABLE_EMAIL_DOMAINS or any(domain.endswith(tld) for tld in BLOCKED_TLDS):
        raise ValueError(
            f"Disposable or temporary email domains (@{domain}) are not permitted. "
            "Please use a valid personal, educational, or work email address."
        )

    # In test/dev environments or for synthetic testing domains (e.g. synapse-study.com), bypass live DNS lookup
    is_test_env = settings.app_env.lower() in ("testing", "test", "development", "dev")
    is_synthetic_test_domain = "synapse-study.com" in domain
    perform_mx_check = check_mx and not is_synthetic_test_domain

    # 2. Syntax validation (RFC 5322) and deliverability check
    try:
        validated = _validate_email_lib(
            cleaned,
            check_deliverability=perform_mx_check,
            test_environment=is_test_env or is_synthetic_test_domain,
            dns_resolver=None,
        )
        return validated.normalized
    except EmailSyntaxError as exc:
        raise ValueError(f"Invalid email syntax: {exc}") from exc
    except EmailUndeliverableError:
        raise ValueError(
            f"The domain '@{domain}' does not have valid mail server (MX) records and cannot receive emails. "
            "Please check for typos or use a different email address."
        ) from None
    except EmailNotValidError as exc:
        raise ValueError(f"Invalid email address: {exc}") from exc
    except Exception as exc:
        # Fallback regex if external DNS lookup experiences temporary network failure
        regex = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(regex, cleaned):
            raise ValueError("Please enter a valid email address.") from exc
        return cleaned
