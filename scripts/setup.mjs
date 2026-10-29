import { runSetupCommand } from '../src/setup-cli.mjs';
try { await runSetupCommand('setup', process.argv.slice(2)); }
catch (error) { console.error(error.code ? `Setup failed (${error.code}).` : error.message); process.exitCode = 1; }
