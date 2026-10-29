# Workflow Coverage and Acceptance

`AGENTS.example.md` is the canonical public protocol. Setup renders it into a managed global block with an integrity hash; MCP initialization renders the same source. Installation and runtime guidance therefore cannot silently drift into two separate rule copies. No private machine-specific policy is imported.

| Requirement from the complete local workflow | Public canonical section | Verification |
| --- | --- | --- |
| Plan before code/browser work; 4-8 main phases; recursive decomposition | 1, 4 | Rule-source coverage test; real MCP nested-plan tests |
| Real thread ID, stable board ID, multiple goals and conversations | 1, 2 | Existing model/MCP/CLI isolation tests |
| Existing dedicated task-file watch without duplicate state | 1, 2 | Existing watched-source tests |
| Register first, verify list, then open host-specific sidebar or fallback | 1, 2 | MCP instructions and console_open tests; host opening remains an agent action |
| No chat board spam; honest unavailable-tool fallback | 2 | Canonical rules and documentation review |
| Direct-child tree ownership; root only manages major phases | 3 | Canonical coverage; real subagents depend on host capabilities, not actor ACL enforcement |
| Own assigned parent requires upper-level acceptance | 3, 5 | Existing parent/child evidence gates and review of ownership wording |
| Implementer self-test, different reviewer, parent integration acceptance | 3, 5 | Canonical coverage; actual agent compliance is not statically provable |
| Identity, file scope, fingerprints and structured handoff results | 3, 4 | Source integrity in doctor and handoff handbook |
| Single executing leaf, agent budget, bounded recursive requests | 3 | Existing single-leaf tests; agent scheduling remains a workflow rule |
| Dynamic add/move/rename/skipped; cross-parent consent | 4 | Existing tree movement/history tests; consent remains a workflow contract |
| Rework, two-round retry limit and explicit stale-sibling reopening | 4 | Canonical rules; existing ancestor invalidation tests do not claim automatic sibling reopening |
| Compaction recovery, liveness checks and explicit ownership transfer | 4 | Canonical rules and documentation review |
| Actual tests exit 0, browser state evidence, no invented completion | 5 | Existing nonempty-evidence/parent gates; MCP does not execute tests for the agent |
| Changed files, replanning reasons and verified results at delivery | 5 | Complete canonical delivery requirements |
| One service, idle release, safe startup fingerprint and restart | 6 | Existing lifecycle, multi-viewer, asset snapshot and shutdown tests |
| Native archive/project opt-in and visible metadata failures | 6 | Existing catalog/workspace tests; live adapter version still needs checking |
| Full persistent global rules installed, not merely printed | 6 | New setup/doctor tests and packed clean-install smoke |
| Backups, unrelated preference preservation, capacity, overrides | 6 | New setup preview/apply/idempotency/upgrade/failure tests |
| Init guidance from same source; explicit missing-install warning | 6 | Real MCP initialize and console_doctor tests |
| Privacy, no credentials/private paths/history in public source | 6 | Privacy guard and separate review of the existing synthetic image |

## What Passing Checks Mean

`npm run check`, `npm test` and `npm run package:smoke` validate code, installation and protocol paths. Doctor confirms the current managed source hash, configured executable/path, global capacity and absence of a global override. It does not read conversation bodies, prove future model obedience, or validate every project's instruction chain. Missing subagent/browser capabilities must produce an explicit fallback, not a fabricated approval/open result.

The installer uses full TOML parsing and conservative text-preserving edits. Its advisory lock/snapshot checks and ordinary-failure rollback are not power-loss atomicity or an OS-level compare-and-swap against arbitrary editors. Profiles with conflicting unmanaged settings, edited blocks or unsupported layouts fail visibly and require deliberate recovery. See the README upgrade/recovery steps before manually restoring backups.
