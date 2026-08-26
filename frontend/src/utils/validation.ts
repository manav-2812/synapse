/**
 * Certified Email Domain Validation
 * Ensures that accounts use legitimate email domains and blocks dummy, test, and disposable domains.
 */

const DISPOSABLE_DOMAINS = new Set([
  // Popular disposable / spam providers
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
  // Placeholder & test domains
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
]);

const BLOCKED_TLDS = [".test", ".example", ".invalid", ".localhost", ".local"];

export function validateCertifiedEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return "Email address is required.";
  }

  // RFC 5322 compatible email regex
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(trimmed)) {
    return "Please enter a valid email address (e.g. name@example.edu or name@gmail.com).";
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2) {
    return "Please enter a valid email address.";
  }

  const domain = parts[1];

  // Must have at least 2 alpha characters for the TLD
  const tldPart = domain.split(".").pop();
  if (!tldPart || tldPart.length < 2 || !/^[a-zA-Z]+$/.test(tldPart)) {
    return "Please enter a valid top-level domain (e.g. .com, .edu, .org).";
  }

  if (DISPOSABLE_DOMAINS.has(domain) || BLOCKED_TLDS.some((tld) => domain.endsWith(tld))) {
    return `Disposable or placeholder domains (@${domain}) are not permitted. Please use a valid personal, educational, or work email.`;
  }

  return null;
}
