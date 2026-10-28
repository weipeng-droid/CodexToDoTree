# Command and MCP Reference

Use an exact conversation ID from the calling host. Every mutation is scoped by `(thread_id, board_id)`. State files are an implementation detail, not an editing API.

## MCP Tools

| Tool | Required input | Purpose |
| --- | --- | --- |
| `console_open` | `thread_id` | Start/reuse the local broker and return this conversation's URL. Does not itself open host UI. |
| `console_plan` | `thread_id`, `board_id`, `thread_title`, `title`, `steps` | Create a new work item; all stages start todo. |
| `console_update` | `thread_id`, `board_id`, `step_id` | Update status, add/move/rename stages, or annotate Chinese display. |
| `console_watch` | identity, `thread_title`, `title`, `source_path` | Watch one dedicated existing task file, without writing it. |
| `console_list` | `thread_id` unless `all=true` | Read compact state; `detail=true` includes full stage records. |

`console_plan.steps` accepts strings or nested objects:

```json
[
  {"id":"inspect","title":"Inspect","children":["Read the code","Confirm criteria"]},
  {"id":"build","title":"Implement"},
  {"id":"verify","title":"Verify"},
  {"id":"deliver","title":"Deliver"}
]
```

String child IDs are generated deterministically from their parent and position on creation. Use the returned IDs for updates, not title matching. IDs stay stable when moved or renamed. Trees are bounded at 32 levels/1,000 stages. Root input accepts 1-100 stages for general MCP use; the recommended long-task workflow uses 4-8 main phases.

`console_update` supports:

- `action="update"` (default), `status="todo"|"in_progress"|"blocked"|"done"|"skipped"`, `note`, `evidence`.
- `action="add"`, `step_id`, `parent_id` (`null` for root), `title`, optional `index`.
- `action="move"`, `step_id`, `parent_id`, optional `index`.
- `action="rename"`, `step_id`, `title`.
- `action="annotate"`, `title_zh` and/or `evidence_zh`: display-only Chinese translation, bound to original SHA-256. Source evidence and timestamps remain unchanged; stale translations are ignored.
- Optional `expected_revision` rejects stale writes rather than overwriting concurrent progress.

`blocked`/`skipped` need a reason in `note`. `done` needs actual nonempty `evidence`; the tool does not run the test for you. Parents require accepted children and their own proof. Reopening clears previous acceptance. Do not translate a record by claiming the test ran again.

## CLI

Run `node bin/cli.mjs <command>`. Installed binaries are `codex-todo-tree` and `codex-todo-tree-mcp`.

```sh
node bin/cli.mjs url --thread EXACT_THREAD_ID
node bin/cli.mjs plan --thread EXACT_THREAD_ID --board feature --thread-title "Feature work" --title "Implement feature" --project "Example" --steps "Inspect|Build|Verify|Deliver"
node bin/cli.mjs plan --thread EXACT_THREAD_ID --board another --thread-title "Feature work" --title "Another goal" --file nested-plan.json
node bin/cli.mjs update --thread EXACT_THREAD_ID --board feature --step step-1 --status in_progress
node bin/cli.mjs update --thread EXACT_THREAD_ID --board feature --step step-1 --status done --evidence "Actual test result and exit code"
node bin/cli.mjs add --thread EXACT_THREAD_ID --board feature --step child --parent step-2 --title "Implement contract"
node bin/cli.mjs move --thread EXACT_THREAD_ID --board feature --step child --parent step-3 --index 0
node bin/cli.mjs rename --thread EXACT_THREAD_ID --board feature --step child --title "Verify contract"
node bin/cli.mjs annotate --thread EXACT_THREAD_ID --board feature --step step-1 --evidence-zh "实际测试结果和退出码的中文说明"
node bin/cli.mjs list --thread EXACT_THREAD_ID
node bin/cli.mjs list --all
```

`--thread` may be omitted only when `CODEX_THREAD_ID` is set. No cwd-based fallback exists. Explicit `list --all` returns visible registered conversations; archived native conversations remain hidden when metadata sync is enabled.

`serve` runs in the foreground for diagnostics. `stop` uses an authenticated local shutdown request; it preserves committed state but disconnects all dashboard tabs for this installation. Normal task completion must not call it.

## Existing mcp-tasks Files

```sh
node bin/cli.mjs watch --thread EXACT_THREAD_ID --board imported --thread-title "Imported work" --title "Existing plan" --project "Example" --file /absolute/example/tasks.md
```

Only explicitly registered `.md`/`.json` files are watched. Use dedicated files, not one shared task file for different conversations. Markdown state sections and JSON `groups` such as `To Do`, `In Progress`, `Done`, `Blocked`, `Skipped` are supported. YAML/arbitrary formats are not. Legacy sections render flat because the format does not establish trustworthy parent IDs. Use native nested plans for recursive trees.

Source removal/corruption preserves the last good projection and warns until recovery. The source is read-only to this tool, except display-only annotations stored in the dashboard's own state. A source claiming Done is not proof this dashboard independently tested it.

## Configuration

| Variable | Meaning |
| --- | --- |
| `CODEX_TODO_TREE_STATE` | Deliberate whole-installation state root override. Leave unset for normal users. |
| `TASK_CONSOLE_STATE` | Legacy alias; new variable wins if both exist. |
| `CODEX_TODO_TREE_CODEX_METADATA=1` | Opt in to native local project/title/archive metadata. Default off. |
| `CODEX_HOME` | Optional custom native Codex configuration directory for metadata discovery. |
| `TASK_CONSOLE_IDLE_MS` | Test/diagnostic idle timeout override, minimum 50 ms. Normal default 60,000 ms. |

One state directory means one shared broker. Different installations/versions use the same per-user default, so stop the old broker once when upgrading before opening the new code. Frontend files are an immutable startup snapshot identified by a build hash. Requests for a different asset version fail clearly instead of mixing modules.

## Troubleshooting

- **No tasks:** verify `console_plan` succeeded and `console_list` returns the exact thread; opening a page alone does not register work.
- **MCP not visible:** reload/restart the client; confirm absolute Node/install paths and Node version with `npm run setup`, then `codex mcp list`.
- **No sidebar:** the host must expose a browser-opening tool. Open the returned URL in a normal browser if unavailable. No native UI injection is performed.
- **Archived chat still visible:** metadata is opt-in. Set the env option, restart the existing shared broker once, and check the metadata warning icon. Unsupported native formats fail visibly.
- **Project renamed/moved:** native metadata takes precedence when enabled. Without it, grouping uses task project labels.
- **Connection lost:** leave the page open; it reconnects. For changed code, stop/reopen/refresh once. Never delete state to fix a connection.
- **Store corruption:** startup refuses a silent reset. Back up the directory and diagnose the affected file; do not overwrite committed progress with empty state.
- **Remote/cloud localhost:** run the service and browser on the same machine. This project does not configure tunnels or public hosting.
