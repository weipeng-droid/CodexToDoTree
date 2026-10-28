# Security and Privacy

## Intended Deployment

Single-user, same-machine development. The broker binds only to loopback and is not designed for public hosting, reverse-proxy exposure, multi-user isolation or untrusted plugins. Host/Origin checks and a local bearer key protect writes from ordinary cross-site requests; readable loopback endpoints are not an authorization boundary against local processes.

No telemetry, remote synchronization, analytics, cloud account or API key is required. Dependencies are installed from the package registry by npm; runtime assets are served locally without a CDN.

Task state can contain titles, evidence, notes, watched file paths and conversation IDs. Treat the state directory as private. The client key is not sent to browser JavaScript. Files use restrictive creation modes where supported and inherited filesystem permissions; there is no promise of OS-protected encryption or per-SID isolation.

## Native Metadata Opt-In

`CODEX_TODO_TREE_CODEX_METADATA=1` enables a version-dependent read-only adapter for local Codex metadata. It selects only registered thread IDs and the fields needed for archive/title/project navigation. It never reads chat messages, previews, auth configuration or credentials and never writes Codex's database. The project map is read from the local global state file in memory; only selected project fields are used. No source metadata file is copied into dashboard state or logs.

Missing/unsupported metadata leaves the last valid projection and a visible warning. Do not infer that metadata synchronization is working merely because the dashboard renders. The generic workflow remains usable with native metadata disabled.

## Persistence and Recovery

Task updates are serialized and atomically published before live notification. Corrupt committed state fails startup instead of silently replacing history. Source files registered through watch are read-only and limited to explicit Markdown/JSON files; links/junctions are rejected. A task source is data, never executable instructions.

The process lock uses the recorded PID to prevent competing brokers. It is a same-user coordination mechanism, not tamper-proof ownership attestation. If a stale lock refers to a reused live PID, diagnose it manually; do not indiscriminately kill Node processes.

## Reporting

For a suspected vulnerability, use the repository's **Security → Advisories → Report a vulnerability** when private reporting is available. If it is unavailable, create a minimal public issue asking for a private channel **without exploit details, credentials or real state files**. Do not post tokens, home paths, personal conversations, client keys, database files or private screenshots.

## Public-Artifact Gate

Run `npm run check`, inspect `npm pack --dry-run --json`, and visually review any images. The privacy guard catches common credential, private-network and home-path patterns but is not a guarantee. Maintainers must also inspect changed files, the exact upload manifest and Git history. Only synthetic demo screenshots belong in this repository.
