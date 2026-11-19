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
  - **macOS Keychain Sync (Opt-In):** Stores the Master KEK in macOS Keychain via `security -i` stdin when Master Password mode is enabled.
- **Audit Logs (`~/.datacore/audit.jsonl`)**:
  - Append-only JSONL with keyed HMAC-SHA256 chaining (`.audit.hmac.key`, `0600` permissions) and automatic credential redaction.
- **Read-Only Mode**:
  - Enforces server/driver read-only sessions where supported and blocks multi-statement writes, CTE writes, `SELECT ... INTO`, and mode-altering administrative statements (`PRAGMA`, `EXEC`, `CALL`, `COPY`, `ATTACH`, `DETACH`).
- **In-Transit TLS**:
  - Remote network connections default to `ssl_mode = require`. The Security Inspector reports `Unknown / Unverified` whenever the server does not explicitly report active TLS cipher/protocol details.
