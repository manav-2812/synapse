# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within **Synapse**, please report it directly and responsibly rather than opening a public issue on GitHub.

- **Email**: [manavbaghhel@gmail.com](mailto:manavbaghhel@gmail.com)
- **Subject**: `[SECURITY] Vulnerability Report - Synapse`

### What to Include in Your Report

To help us investigate and resolve the issue quickly, please include:
1. Description of the vulnerability and its potential impact.
2. Step-by-step instructions or proof-of-concept to reproduce the issue.
3. Any suggested mitigation or fix if available.

### Response Commitment

- **Acknowledgment**: Within **48 hours** of receiving your report.
- **Triage & Fix**: Vulnerabilities will be prioritized, patched, and merged into the `main` branch promptly.
- **Public Disclosure**: Credit will be given to the reporter upon resolution (unless requested otherwise).

---

## Supported Versions

Only the latest release on the `main` branch is actively supported with security updates.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ Yes    |
| `< 1.0` | ❌ No     |

---

## Security Architecture & Controls

Synapse incorporates core security mechanisms by design:

- **Password Hashing & Constant-Time Login**: Passwords are salted and hashed using `bcrypt` (pinned `bcrypt==4.2.1`). Login authentication runs constant-time verification against real or precomputed dummy hashes (`DUMMY_PASSWORD_HASH`) to prevent user enumeration via timing side-channels.
- **Stateless Authentication & Token Lifecycle**: Short-lived JWT access tokens (20 minutes) signed with `HS256`.
- **Refresh Token Rotation**: Refresh tokens (7 days) use single-use `jti` tracking (`last_refresh_jti`). Reusing or presenting an invalid token immediately revokes the active session credentials.
- **Client Token Storage & Threat Model**:
  - *Current Design*: Access and refresh tokens are stored in browser storage (`localStorage` / `sessionStorage`) to facilitate cross-origin decoupled deployments (Vercel SPA $\leftrightarrow$ Render API).
  - *XSS Defense & CSP*: Risk is mitigated through strict Content Security Policies (`script-src 'self'`), zero runtime `eval`, and sanitized markup.
  - *Trade-off & Next Steps*: In client-accessible storage, any hypothetical XSS vulnerability can read tokens directly. The production enterprise migration path involves deploying a BFF (Backend-for-Frontend) or custom apex domain to serve tokens via `SameSite=Strict; HttpOnly; Secure` cookies with anti-CSRF headers.
- **Tenant Data Isolation**: Multi-tenant data boundaries are enforced at the database repository level — queries are strictly scoped by `user_id`. ChromaDB vector collections are isolated per user (`user_{user_id}`).
- **Upload Guardrails**: Strict extension allow-list (`.pdf`, `.docx`, `.txt`, `.png`, `.jpg`, `.jpeg`), size caps (`MAX_UPLOAD_SIZE_MB`), and randomized UUID storage filenames.
- **Rate Limiting & Brute-Force Safeguards**: `slowapi` rate limits API endpoints; automated account lockout triggers after 10 consecutive failed attempts (15-minute cooldown).
- **Sanitized Responses & Global Catch-All Handler**: Production exceptions and UUID validation errors return uniform JSON errors (`{"error": {"message", "code"}}`) without leaking internal stack traces.
