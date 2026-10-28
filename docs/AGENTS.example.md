# CodexToDoTree Workflow

Merge these rules into your existing AGENTS.md. Do not replace unrelated instructions.
Run `npm run setup -- --instructions` to substitute your local install path below.

## Plan and Open

- For substantial multi-step work, read the exact `CODEX_THREAD_ID` from the current shell environment. Do not invent an ID or use a project path. If it is missing, ask for an explicit conversation ID and label it as a manual integration.
- Call `console_plan` with that `thread_id`, a stable `board_id`, a short conversation title, a project label and 4-8 major stages. Use nested `{id,title,children:[...]}` for complex stages. Different goals get different board IDs; the same goal's fixes and acceptance checks stay in its existing tree.
- On the first task in a conversation, call `console_open`. If `mcp__codex_app__open_in_codex` is available, open the returned URL in the current conversation's right browser panel with `placement="right"`, `target={type:"browser",url:returned_url}`. Do not pass another conversation's threadId. Otherwise provide the URL for a regular browser. Do not claim the panel opened when no host tool is available.
- Do not reopen an already open task tab every turn. Creating a plan and opening a URL are different operations; read `console_list` to verify registration.
- If MCP is unavailable, use the CLI at `<ABSOLUTE_REPO_DIR>/bin/cli.mjs`, passing the exact thread explicitly or allowing it to read CODEX_THREAD_ID. Use `url --thread <EXACT_THREAD_ID>`, `plan`, `update`, `add`, `move`, `rename`, `annotate`, `watch` and `list`. Never directly rewrite state files.

## Execute and Replan

- Update the dashboard through `console_update`. Start only one actual executing leaf per work item; ancestor status is derived. Do not mark parent and child explicitly in progress together.
- When a phase grows too large, add children with `action="add"`, `parent_id` pointing to that phase. Use move/rename to reorganize. Preserve abandoned steps as skipped with a reason; do not erase history.
- Mark blocked/skipped with a concrete note. Keep task titles, notes and evidence in the user's language, preserving commands, counts and exit codes.
- A done leaf needs real evidence. A parent needs all its children accepted and its own evidence; completed children alone leave the parent awaiting verification. Changing an accepted subtree invalidates the relevant parent's acceptance.
- Run relevant tests/build/lint and check exit codes before completion. For browser work verify the actual state or screenshot. Do not record invented test results or turn a translation into a new acceptance run.
- Keep progress primarily in the dashboard. Chat only needs concise updates for meaningful progress, changed assumptions, blockers, decisions and final delivery. Do not repeatedly paste the complete board into chat.

## Isolation and Resources

- All conversations on this machine use one shared state directory and service. Do not create a new service directory or a private TASK_CONSOLE_STATE for every project or chat. Multiple dashboard pages are scoped by thread ID.
- Do not stop the shared service when one task completes. Open pages keep it alive; after the last live page closes and 60 seconds pass without task reads/writes, it releases its listener, workers, timers and lock. The next call restarts it with saved history.
- Optional native Codex metadata sync hides archived conversations and groups by saved projects. It is read-only, opt-in and version dependent. Without it, task-supplied project labels are used and native archives are not known.
- Auto-open is an agent first-turn action, not a promise of a native chat-selection hook. Remote/cloud environments may not expose the local dashboard to the user's browser; never claim otherwise.
- Before publishing diagnostics, remove state files, client keys, local paths, personal names, conversation content and real screenshots. Only synthetic demo data belongs in public examples.
