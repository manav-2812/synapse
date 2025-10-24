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

- **Password Hashing**: Stored using `bcrypt` via `passlib`; plaintext passwords are never logged or stored.
- **Stateless Authentication**: Short-lived JWT access tokens (20 min) signed with `HS256`.
- **Refresh Token Rotation**: Refresh tokens use single-use JTI tracking (`last_refresh_jti`). Reusing or presenting an invalid token immediately revokes active session credentials.
- **Tenant Data Isolation**: Multi-tenant data boundaries are enforced at the database repository level — queries are strictly scoped by `user_id`.
- **Upload Guardrails**: Strict extension allow-list (`.pdf`, `.docx`, `.txt`, `.png`, `.jpg`, `.jpeg`) and configurable file size limits (`MAX_UPLOAD_SIZE_MB`).
- **Rate Limiting**: API protection against abuse powered by `slowapi`.
- **Sanitized Responses**: Production exceptions return uniform JSON errors (`{"error": {"message", "code"}}`) without leaking internal stack traces.
