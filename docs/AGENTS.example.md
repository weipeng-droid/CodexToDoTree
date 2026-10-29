# CodexToDoTree Autonomous Execution Protocol

Before substantial implementation or browser operations, create and verify a 4-8 phase task tree using the real CODEX_THREAD_ID and a stable board_id. Each parent agent manages only its direct children; independent review and upper-parent acceptance are required. Keep one executing leaf per work item. Never claim tests, sidebar opening, or installation succeeded without actual evidence.

## 1. Plan Before Execute

- Inspect the goal and applicable instructions before changing code or operating a browser. Simple questions, read-only diagnosis and requests for a plan do not authorize implementation or require artificial phases.
- Read the exact `CODEX_THREAD_ID` from the current shell. Never invent an ID, use a project path, or borrow another conversation's ID. If unavailable, stop automatic integration and explicitly request the host's real integration ID.
- Call `console_plan` with the exact `thread_id`, stable `board_id`, conversation title, project and 4-8 major stages. Use `{id,title,children:[...]}` recursively for complex stages. Different goals get new boards; debugging, review and acceptance of the same goal stay in its existing tree.
- Read `console_list` to verify registration in this conversation. Opening a URL is not registration. Stages begin `todo`, become `in_progress` while executing, and require verification evidence before `done`.
- Use the user's language for objectives, titles, notes and evidence; retain commands, exit codes and counts. Never copy examples as real test evidence. Register existing dedicated `mcp-tasks` files through `console_watch`; do not maintain two independent plans or share one task file across conversations.

## 2. Open and Maintain the Dashboard

- On this conversation's first task call `console_open`. If `mcp__codex_app__open_in_codex` exists, open the returned URL in the CURRENT conversation with `placement="right"`, `target={type:"browser",url:returned_url}`. Do not pass another conversation's threadId. Otherwise return the URL for a normal browser and state that no sidebar was opened.
- Do not reopen an open tab every turn. Auto-open depends on first agent execution and host capabilities, not a native historical-chat selection hook. Remote/cloud localhost may be unreachable from the user's machine.
- Use `console_update` to maintain the tree. Chat needs concise updates for significant progress, replanning, blockers, decisions and delivery, not repeated boards, phase counters or progress bars.
- If MCP is unavailable, use `node "<ABSOLUTE_REPO_DIR>/bin/cli.mjs"` commands `url`, `plan`, `update`, `add`, `move`, `rename`, `annotate`, `watch`, `list`, with the real `--thread` or current `CODEX_THREAD_ID`. Nested plans support `plan --file nested-plan.json`. Confirm with `list`. Never rewrite state files directly.
- If MCP, CLI or browser tools fail, say what failed. Retain one dedicated conversation task file as a clearly labeled unsynchronized fallback. Never claim synchronization or substitute another conversation's data.

## 3. Hierarchical Agent Ownership

- Delegate clearly verifiable implementation subphases to subagents when available. The implementer self-tests; a DIFFERENT agent independently reviews actual changes and reruns risk-appropriate checks; the parent verifies integration. Self-testing is not independent review, and a returned agent is not accepted work.
- Every delegation carries `thread_id`, `board_id`, `step_id`, `owner_agent_id`, `tree_owner`, `owned_parent`, `writable_child_ids`, goal, inputs, criteria, allowed files, prohibited actions and result format. Agent runtime IDs never replace the original conversation ID.
- Each parent manages ONLY direct children of its `owned_parent`. The root has `owned_parent=null` and manages only root phases. Subphase owners maintain the next layer; do not write descendants, ancestors or siblings owned by another agent.
- The delegated `owned_parent` ITSELF is accepted by its upper parent, not its own responsible agent. Submit a handoff and suggested status upward. Automatic rollup and ancestor invalidation are system-derived, not cross-level writes.
- Use at most 4 active agents including root, obey actual host slots, and default to logical depth 3. Explain and replan deeper work. Root schedules recursive requests so waiting parents cannot exhaust capacity. Do not force models/reasoning or create user-visible chats as a workaround.
- Only ONE leaf per work item may be explicitly `in_progress`. Implementation, self-testing, independent review and acceptance hand off serially. Confirm the previous writer stopped; the next leaf's direct parent reads `console_list` before starting it. Do not create extra boards to disguise parallel execution.
- One file has one implementer at a time. Preserve other sessions' changes; pause if unsafe to integrate. Delegation does not expand permission to edit global settings, submit/push/publish, contact others, elevate permissions or perform destructive actions.

## 4. Handoff, Replanning and Recovery

- Handoffs contain identities/ownership above, completed/unfinished scope, files, input/diff SHA-256, actual commands and directories, exit codes/results, unverified environments, risks and proposed tree changes. Reviewers add `reviewer_agent_id`, reviewed fingerprint, `pass/rework/blocked`, located findings and independently rerun results. Empty output or unexplained approval is not acceptance.
- Each parent writes the handoff summary and real identifiers only into directly managed child evidence. Keep necessary full records in existing `_ai/` or documented diagnostic locations; never create a second drifting task-state source or store secrets.
- Prefer keeping coarse stages as parents and adding concrete children with `action="add",parent_id=...`; use `move`/`rename` to reorganize. Invalid approaches become `skipped` with a reason and brief explanation. Preserve history, never call nonexistent deletion tools. Skipping cancels unfinished descendants: do not skip a parent before adding children beneath it.
- Cross-parent moves require both owners' consent, stopped writers, recorded old/new owners and explicit scope transfer. Update `writable_child_ids`; do not use structural edits to bypass ownership.
- On review failure its direct parent records `blocked` with a reason; the implementation leaf's direct parent reopens implementation or adds a scoped fix. Coordinate across levels through handoffs, not cross-level writes.
- Changed implementation, dependencies or criteria invalidate OLD review. The model reopens affected ancestors, NOT completed review/acceptance siblings. Each direct owner must explicitly reopen its affected review/acceptance children, propagating requests to other levels. Review the NEW fingerprint; never reuse old pass evidence for new code.
- After two failed repair rounds for one problem, stop mechanical retries, record the blocker and replan that subtree. Retry only the smallest failed scope. Ask the user before significant scope, permission or cost expansion.
- After compaction/interruption read the existing tree, actual agent liveness, changes, fingerprints and ownership before continuing. Confirm a missing implementer stopped before replacing it. Its upper parent explicitly records transfer of tree/file ownership; never silently seize or rebuild a board to hide failure.
- If agents are unavailable/cancelled/timed out, record why. Parent takeover must be labeled as lacking independent review; never invent reviewers or approvals.

## 5. Verification and Delivery Gates

- Code changes require actual applicable tests, lint, type checks or builds with exit code 0. Browser work requires verified data/state transition or screenshot/network evidence. Failed/unavailable validation cannot become `done`; record blockers and unverified scope.
- A done leaf requires real evidence. A parent requires accepted effective children AND its own actual verification evidence; children alone leave it awaiting verification. Do not explicitly run both parent and leaf.
- The local parent accepts its direct acceptance leaf and hands the subdelivery upward. The upper parent checks review/integration before accepting that subdelivery node. Repeat upward; never self-accept `owned_parent`.
- `blocked`/`skipped` require concrete `note`. Skipping cannot silently waive a product criterion. Display translations (`annotate`) preserve original evidence/status/timestamps and are not new test runs.
- Deliver after effective stages are verified and required criteria resolved. Summarize (1) actual completed work and verification, (2) replanned/skipped steps and reasons, (3) changed files. Explicitly list limitations rather than claim full acceptance.

## 6. Shared Service, Installation and Limits

- Ordinary conversations share one per-user service/state directory, isolated by real thread IDs. Never deploy private service roots/ports per chat or project. `console_open`/CLI `url` reuse the healthy broker.
- Do not stop the shared service at one task's completion. After the last live page disconnects and 60 seconds without task reads/writes, listener, workers, timers and lock release; the next MCP/CLI call restores saved history. Direct browser navigation cannot start an exited process. Do not scan/kill unrelated Node processes.
- Native Codex project/archive sync is read-only, opt-in (`--codex-metadata`), version-dependent, every 3 seconds for registered conversations. Archives hide without deleting history and restore on unarchive. Read failure warns and retains last valid data, never pretends all chats are unarchived. Without opt-in grouping uses task labels and native archives are unknown.
- Work items sort in-progress, blocked, awaiting verification, todo, done, skipped, newest within each group. Startup assets share one build fingerprint. Maintainers use authenticated stop/reopen/refresh once after resource changes; ordinary tasks must not repeatedly restart.
- Persistent installation requires explicit `setup --apply` AND passing `doctor`. Registering MCP or receiving initialization guidance is not proof AGENTS.md was installed. Preserve unrelated settings/rules, respect `CODEX_HOME`/overrides, retain backups and reload the client/new Codex run. Old conversations are not guaranteed to hot reload.
- MCP validates state transitions and nonempty evidence, not actual command execution or actor ACLs. Ownership is a behavior protocol, not hard isolation. Doctor cannot prove future compliance, project overrides, total merged instruction size or sidebar availability. Never promise identical behavior in every client/model or zero defects.
- Never publish personal paths, private rules, credentials, chats, task state or real screenshots. Use synthetic examples. This workflow does not import unrelated SDK/business/account policies.
