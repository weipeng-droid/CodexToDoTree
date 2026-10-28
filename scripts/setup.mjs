import path from 'node:path';
import * as fs from 'node:fs/promises';
import { ROOT } from '../src/paths.mjs';

if(process.argv.includes('--instructions')) {
  console.log((await fs.readFile(path.join(ROOT,'docs/AGENTS.example.md'),'utf8')).replaceAll('<ABSOLUTE_REPO_DIR>',ROOT.replaceAll('\\','/')));
} else {
  const metadata=process.argv.includes('--codex-metadata');
  const toml=`[mcp_servers.codex_todo_tree]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(ROOT,'bin/mcp.mjs'))}]\nstartup_timeout_sec = 20\n${metadata?'\n[mcp_servers.codex_todo_tree.env]\nCODEX_TODO_TREE_CODEX_METADATA = "1"\n':''}`;
  console.log('Add the following section to your Codex config.toml. This command does not edit your configuration.\n');
  console.log(toml);
  console.log('Then merge the output of npm run setup -- --instructions into your AGENTS.md. Preserve unrelated rules.\nRestart/reload your MCP client and verify with codex mcp list.');
}
