# CodexToDoTree

**Recursive task trees for Codex. Live progress in a browser, not a wall of chat updates.**

[中文文档](README.zh-CN.md) · [Complete workflow rules](docs/AGENTS.example.md) · [Workflow coverage](docs/workflow-coverage.md) · [Security](SECURITY.md)

![Synthetic task-tree demo](docs/images/demo.jpg)

A local-first MCP server, a live dashboard, and a reusable agent workflow. Plan major phases, break them into nested steps, adapt the plan as work evolves, and keep each conversation's progress separate.

## What You Get

- Recursive trees: up to 32 levels and 1,000 stages per work item, with expand/collapse, keyboard navigation, search, current execution path and smooth progress updates.
- Multiple conversations and work items, isolated by exact conversation ID. In-progress items stay first; completed work collapses by default.
- Honest acceptance gates: completed children do not silently complete their parent. Parents need their own verification evidence.
- One local service for many browser tabs. Live SSE updates, atomic persistence, reconnection and automatic idle shutdown.
- Optional, read-only native Codex project/archive sync. No message scraping, telemetry, API key or external CDN.
- Existing `mcp-tasks` Markdown/JSON can be watched without maintaining two independent plans.

This is an independent community project, not an official OpenAI product. The dashboard currently uses Chinese UI labels; task content can use any language. MCP works in compatible local clients. A Codex sidebar needs that client's browser-opening tool; the MCP cannot inject native UI.

## Quick Start

Prerequisites: **Node.js 22.13+ (24 LTS recommended)** and a local Codex/MCP client. No administrator access required. Git is optional if you download the repository ZIP instead.

```sh
git clone https://github.com/weipeng-droid/CodexToDoTree.git
cd CodexToDoTree
npm ci
npm run setup -- --apply --codex-metadata
npm run doctor
```

1. `setup --apply` installs **both** the MCP configuration and the complete global `AGENTS.md` workflow in your Codex home (`CODEX_HOME`, otherwise the default Codex profile). It preserves unrelated text/settings, creates local backups, and ensures sufficient instruction capacity. `npm run setup` without `--apply` is preview-only; preview is not installation.
2. `--codex-metadata` explicitly opts into read-only native project/archive sync, matching the full local workflow. Omit it if you do not want native metadata reads; task-label grouping still works, but native archive synchronization does not. The option stays enabled on subsequent upgrades; use `setup --apply --no-codex-metadata` to deliberately disable it without editing a protected block.
3. Require a passing `doctor`, then restart/reload the MCP client and begin a new Codex run. Run `codex mcp list` and look for `codex_todo_tree`. Doctor proves installation consistency, not model obedience or UI capability.
4. Start a new conversation and ask:

> Use CodexToDoTree for this task. Read the real CODEX_THREAD_ID, create 4-8 main phases with nested substeps, open this conversation's task dashboard, and keep it updated until verification is complete.

The agent calls `console_plan`, `console_open` and `console_update`. If Codex exposes its browser panel tool, the workflow opens the page on the right. Otherwise open the returned URL in your normal browser. A fresh URL alone shows an empty conversation until a plan is registered.

The installed workflow delegates substantial implementation, assigns each parent only its **direct children**, requires independent review, and hands acceptance upward. A parent never self-accepts its delegated node. Implementation/review/acceptance are serial because the current model permits one executing leaf per board. See the [complete protocol](docs/AGENTS.example.md) and [Chinese handoff handbook](docs/workflow.zh-CN.md). MCP initialization also supplies the same rule source, but does not silently install global files.

To inspect instructions without installing, use `npm run setup -- --instructions`. For a custom profile use `node bin/cli.mjs setup --apply --codex-home /absolute/profile --codex-metadata`, then `node bin/cli.mjs doctor --codex-home /absolute/profile`. These same commands work from an installed package with the `codex-todo-tree` binary. This repository provides source installation; it is **not** a claim the package has been published to the npm registry.

Codex's standard MCP configuration is documented in [the official MCP guide](https://developers.openai.com/codex/mcp). This project does not require an OpenAI API key.

### Enable Native Project and Archive Sync

```sh
npm run setup -- --apply --codex-metadata
npm run doctor
```

The installer updates its existing managed configuration instead of adding a duplicate server. It sets `CODEX_TODO_TREE_CODEX_METADATA="1"`. The service reads only registered conversations' ID, archive flag, title and project mapping from local Codex metadata every 3 seconds. Archived chats disappear; unarchiving restores the same tasks. Nothing is written to Codex's database. Read failures retain the last valid view and show a warning. Doctor reports this option's configuration, not proof that a particular native database version is supported.

This is an **opt-in, version-dependent adapter**, not an official stable API. Without it, task-supplied project labels provide grouping and native archives are not synchronized. Changing the option requires stopping this tool's existing service and reopening it; changing only the MCP process environment cannot reconfigure an already running shared service.

### CLI Without MCP

From this repository, use a real thread ID from your host. The following PowerShell example runs inside Codex:

```powershell
node bin/cli.mjs url --thread "$env:CODEX_THREAD_ID"
node bin/cli.mjs plan --board release --thread-title "Release" --title "Ship a release" --project "Example App" --steps "Inspect|Implement|Test|Deliver"
node bin/cli.mjs update --board release --step step-1 --status in_progress
node bin/cli.mjs update --board release --step step-1 --status done --evidence "Actual command and result, exit code 0"
node bin/cli.mjs add --board release --step api --parent step-2 --title "Implement the API"
node bin/cli.mjs list
```

In Bash, use `--thread "$CODEX_THREAD_ID"`. Outside Codex, pass your own explicit integration's `--thread` consistently; do not reuse another chat's ID. Evidence in examples is a placeholder, not a real test claim. Use `plan --file nested-plan.json` for nested JSON stages. See [the command reference](docs/reference.md).

## How Progress Works

```text
Project
  Conversation (exact thread ID)
    Work item (stable board ID)
      Main phase
        Subphase
          Executing leaf
```

Only one leaf per work item is explicitly in progress. Ancestors roll up automatically. Children done + parent not yet accepted = awaiting verification. Editing accepted children invalidates ancestor acceptance. Skipping needs a reason and preserves history. A new goal gets a new work item; debugging the same goal stays in its existing tree.

Work-item order: in progress, blocked, awaiting verification, todo, done, skipped. Within each group the latest update comes first. Progress measures accepted main phases, **not estimated time remaining**.

## Privacy and Lifetime

Data stays in a per-user application-data directory, outside your clone/npm install. Windows uses the local application-data folder, macOS Application Support, and Linux XDG data home (or its standard fallback). `CODEX_TODO_TREE_STATE` overrides this for a deliberate whole-installation choice; do not set it separately per conversation. The older `TASK_CONSOLE_STATE` remains an alias.

The service binds only to `127.0.0.1`, preferably port 47831, falling back if occupied. CLI/MCP writes require a local client key; the webpage is read-only. This is not a multi-user authorization boundary: another local program/user with access to the state directory can read it. Do not store secrets in task content.

An open live dashboard keeps the service alive. After the last page disconnects and no task read/write occurs for 60 seconds, the listener, timers, metadata worker and lock are released. Saved tasks remain. The next CLI/MCP call restarts the service. Do not stop it just because one conversation finishes.

No automatic startup hook runs merely because you click a historical chat. Auto-open is an agent action governed by the installed workflow rules. Cloud/remote executor localhost may not be reachable from your browser; use a same-machine local setup. Do not expose this unauthenticated read interface publicly.

## Development

```sh
npm ci
npm run check
npm test
npm run demo
```

`demo` uses synthetic data in an isolated ignored `work/` directory, never your real tasks. Stop it with Ctrl+C, or close all viewers and let it idle out. Tests exercise real stdio MCP, CLI, HTTP/SSE, tree acceptance, persistence, archive restoration and shutdown. CI covers Windows, macOS and Linux with Node 22/24; a configured CI matrix is not a claim all remote runs already passed.

The frontend is plain HTML/CSS/JavaScript, with no build step. Asset snapshots use one startup fingerprint; after code changes, run `node bin/cli.mjs stop`, reopen with `url`, and refresh once. Other open pages reconnect.

## Uninstall

Remove only the section between `# CodexToDoTree BEGIN/END` in `config.toml`, and between `<!-- CodexToDoTree BEGIN/END -->` in global `AGENTS.md`. Leave unrelated settings/rules and instruction capacity intact. Reload the client. Use `node bin/cli.mjs stop` only when other conversations no longer need the service. Removing source does not delete saved history; delete that separately only after backing it up.

## Upgrade and Recovery

- Update source, run `npm ci`, `npm run setup -- --apply` and `npm run doctor`, then reload. The installer replaces its one managed block, preserves a larger existing capacity and retained metadata opt-in, and does not duplicate rules. Stop/reopen the old shared broker once after changing code; do not stop it at ordinary task completion.
- Upgrading a manually configured 0.1 installation: first back up the profile. Remove **only** its old `codex_todo_tree` server/env section and the workflow text you manually added, preserving other content, then apply setup. An enabled legacy `task_console` must be deliberately migrated/disabled first. The installer refuses unmanaged conflicts rather than silently overwriting them or adding a second service.
- Nonempty `AGENTS.override.md`, invalid TOML, edited managed rules/settings, symlinks, malformed markers or an active setup lock cause explicit failure. Both managed blocks have integrity hashes; custom fields/env inside the managed MCP block are not silently discarded. Preserve them and deliberately migrate before setup. Resolve the specific conflict; do not delete all settings/state. Projects can also override guidance and must be inspected separately.
- Explicit `[agents] enabled=false` or a zero subagent limit makes doctor fail the complete-workflow check without changing that preference. Static checks report browser/subagent host capability as unverified; unavailable tools require honest degradation, not invented review/open results.
- Backups named `AGENTS.md.codex-todo-tree-*.bak` and `config.toml.codex-todo-tree-*.bak` stay in the user's profile. They may contain secrets: **never upload them**. Compare current edits before manually restoring a backup. Unrelated preferences added after backup must be preserved.
- Setup validates both proposed files before writing, uses a profile lock and snapshot checks, and attempts safe rollback on ordinary write failure. The lock coordinates this installer, not every editor; this is not an operating-system CAS or a power-loss-atomic two-file transaction. An interrupted process can leave its lock/partial managed installation. Confirm it stopped, inspect backups/current files, then recover and rerun doctor; never blindly remove another process's lock.

No MCP can guarantee identical behavior for every client, model, remote executor or policy. Missing subagent/browser capabilities must be reported, not fabricated. Hierarchical ownership is a workflow contract, **not actor ACL enforcement**; evidence strings do not prove commands ran. Persistent rules, runtime guidance, actual tests and independent review are complementary gates.

## License

MIT. See [LICENSE](LICENSE). Lucide icons are ISC-licensed and the MCP SDK is MIT-licensed; their packages retain their own notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
