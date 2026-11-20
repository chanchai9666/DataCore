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
  - Append-only JSONL with keyed HMAC-SHA256 chaining. The HMAC key uses the `DCK2` format (44-byte initialized record with epoch) and is stored alongside a signed anti-downgrade/anti-truncation anchor (`AuditAnchorState` covering both active logs and rotated archives, bound to `keyEpoch` and `keyFingerprint`) outside the log directory in `~/.datacore_audit_keys/` (`0600` permissions).
  - **Fail-Closed Verification & Migration:** Both the write path (`log()`, `rotate_log_file()`, `clear_logs()`) and `verify_integrity()` validate the anchor via `read_verified_anchor` before using or re-signing it, refusing to silently re-baseline corrupted or forged anchors. Log rotation rolls back atomically if the anchor update fails, `verify_integrity()` reconciles untracked valid HMAC-verified rotated archives if a crash occurred mid-rotation, and `clear_logs()` commits the empty anchor before deleting log files. Write-path fail-closed errors are exposed via `get_audit_health` and surfaced in the Audit Log UI. Legacy `DCK1` (32-byte) keys and pre-`DCK2` anchors are verified and automatically promoted to `DCK2` with `keyEpoch`/`keyFingerprint` binding on first verified access. If a transient anchor update failure causes active logs to advance beyond the anchor with a valid HMAC chain and matching prefix, `verify_integrity()` performs bounded forward-lag self-healing while continuing to reject log truncation (`count < activeEntries`) as fail-closed.
  - **Threat Model Boundary:** Anchor deletion is fail-closed for `DCK2`-initialized keys (including upgraded `DCK1` keys once migrated on first verified access), and the anchor detects archive tampering, tail truncation, key epoch/fingerprint mismatches, `DCK2`→`DCK1` key downgrades, and unkeyed whole-file SHA-256 rewrites. Because the HMAC key and anchor still reside in the same local user's home directory (to avoid OS Keychain authorization popups), an attacker already running with full write access as the same OS user could delete or modify both the log and key directory. Anchor rollback combined with log truncation to a previously anchored state is not detectable without an external timestamp or log forwarder; use SIEM export for that guarantee.
- **Read-Only Mode**:
  - Enforces server/driver read-only sessions where supported and blocks multi-statement writes, CTE writes, `SELECT ... INTO`, and mode-altering administrative statements (`PRAGMA`, `EXEC`, `CALL`, `COPY`, `ATTACH`, `DETACH`).
- **In-Transit TLS**:
  - New network connections created in the UI and backend SSL fallbacks default to `require` / `required` (legacy saved connections with explicit `prefer` display a warning in the Security Inspector; `verify-full` with a CA bundle is recommended for production). The Security Inspector reports `Unknown / Unverified` whenever the server does not explicitly report active TLS cipher/protocol details.
