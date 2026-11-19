# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in DataCore, please report it responsibly by opening a private security advisory on GitHub (`Security` -> `Advisories` -> `Report a vulnerability`) rather than filing a public issue.

Please include:
- A clear description of the vulnerability and potential impact
- Steps to reproduce or a minimal proof of concept
- Affected version or commit hash

We aim to acknowledge reports within 48 hours and provide a remediation timeline once verified.

## Security Architecture Notes

- **Local Credential Vault (`~/.datacore/vault.enc`)**:
  - **DCV1 (Default):** AES-256-GCM encryption with a machine-bound obfuscation key (`0600` POSIX permissions). Protects against casual plaintext exposure on disk, but is not resistant to local attackers with user-level access on the same machine.
  - **DCV2 (Master Password Mode):** AES-256-GCM with an Argon2id-derived Key Encryption Key (KEK). Recommended for production credentials. Configurable in **Connection Security**.
  - **macOS Keychain Sync (Opt-In):** Stores the Master Password (used to derive the KEK via Argon2id) in macOS Keychain via `security -i` stdin when Master Password mode is enabled and unlocked.
- **Audit Logs (`~/.datacore/audit.jsonl`)**:
  - Append-only JSONL with keyed HMAC-SHA256 chaining. The HMAC key uses the `DCK2` format (44-byte initialized record with bootstrap epoch) and is stored alongside a signed anti-downgrade/anti-truncation anchor (`AuditAnchorState` covering both active logs and rotated archives) outside the log directory in `~/.datacore_audit_keys/` (`0600` permissions, fail-closed verification).
  - **Threat Model Boundary:** Protects against tampering by other OS users, anchor deletion (`DCK2` fail-closed), archive tampering, tail truncation, and unkeyed whole-file SHA-256 rewrites; because the HMAC key resides in the same local user's home directory (to avoid OS Keychain popups), an attacker already running with full write access as the same OS user could delete or modify both the log and key directory. For high-assurance compliance, export or forward audit logs to an external SIEM.
- **Read-Only Mode**:
  - Enforces server/driver read-only sessions where supported and blocks multi-statement writes, CTE writes, `SELECT ... INTO`, and mode-altering administrative statements (`PRAGMA`, `EXEC`, `CALL`, `COPY`, `ATTACH`, `DETACH`).
- **In-Transit TLS**:
  - New network connections created in the UI and backend SSL fallbacks default to `require` / `required` (legacy saved connections with explicit `prefer` display a warning in the Security Inspector; `verify-full` with a CA bundle is recommended for production). The Security Inspector reports `Unknown / Unverified` whenever the server does not explicitly report active TLS cipher/protocol details.
