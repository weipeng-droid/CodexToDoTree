# Contributing

Start with an issue describing the problem and expected behavior. Keep changes focused; do not include personal task state or screenshots of real conversations.

## Local Checks

```sh
npm ci
npm run check
npm test
npm run demo
```

Use Node 22.13+; CI exercises Node 22 and 24 on Windows, Linux and macOS. Test fixtures and demo state are synthetic and stored in ignored `work/`. A passing build or configured matrix is not evidence a native client workflow was verified.

The domain lives in `src/model.mjs`/`src/tree.mjs`, persistence in `src/store.mjs`, transport/lifecycle in `src/server.mjs`, and the native metadata adapter in `src/catalog*.mjs`. Keep framework/host concerns outside the domain. `public/` is a read-only plain-JavaScript client. `src/mcp.mjs` and `src/cli.mjs` are thin adapters.

Use UTF-8 without BOM and LF. Add tests for changed contracts, acceptance rules, isolation and lifecycle. Do not bypass failing tests by recording fake completion evidence. The dashboard's evidence is submitted by the caller, not independent execution proof.

Before a pull request, inspect the exact file list and run `npm pack --dry-run --json`. Never commit `node_modules`, `work`, runtime state, client keys, endpoint files, database files, `.env`, private network addresses, local home paths, credentials or real task screenshots. The built-in privacy check is a guardrail, not a substitute for review.

The project is MIT-licensed. By contributing, you agree your contribution may be distributed under that license. Retain third-party notices. Be respectful and focus discussion on reproducible behavior and evidence.
