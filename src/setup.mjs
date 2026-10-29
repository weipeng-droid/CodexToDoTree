import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { ROOT } from './paths.mjs';
import { rejectLinks } from './store.mjs';
import { AGENTS_BEGIN, AGENTS_END, CONFIG_BEGIN, CONFIG_END, VERSION, digest, managedInstructions } from './workflow.mjs';

const serverName = 'codex_todo_tree';
export const codexHome = value => path.resolve(value || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
function fail(message) { throw new Error(message); }
function toml(text) {
  try { return parse(text); }
  catch { fail('Invalid TOML configuration; original content withheld. Fix it before setup.'); }
}
function decode(bytes) {
  try {
    if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) fail('Unsupported UTF-8 BOM; preserve a backup and normalize encoding first.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const bare = text.replaceAll('\r\n', '');
    if (bare.includes('\r') || text.includes('\r\n') && bare.includes('\n')) fail('Unsupported mixed line endings; normalize a backup first.');
    return text;
  } catch { fail('Unsupported text encoding or line endings; original content withheld.'); }
}
async function read(file) {
  await rejectLinks(file);
  try { return await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function block(text, begin, end) {
  const normalized = text.replaceAll('\r\n', '\n');
  const starts = normalized.split('\n').filter(line => line === begin).length;
  const ends = normalized.split('\n').filter(line => line === end).length;
  if (!starts && !ends) return null;
  if (starts !== 1 || ends !== 1) fail('Incomplete or duplicate CodexToDoTree managed markers; resolve manually without deleting unrelated rules.');
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const originalStart = new RegExp(`^${escape(begin)}\\r?$`, 'm').exec(text).index;
  const endStart = new RegExp(`^${escape(end)}\\r?$`, 'm').exec(text).index;
  if (endStart < originalStart) fail('Invalid managed marker order.');
  const originalEnd = endStart + end.length;
  return { start: originalStart, end: originalEnd, text: text.slice(originalStart, originalEnd).replaceAll('\r\n', '\n') };
}
function rulesIntegrity(owned) {
  if (!owned) return;
  const match = /^<!-- CodexToDoTree BEGIN -->\n<!-- version=([^;]+); sha256=([a-f0-9]{64}) -->\n([\s\S]*)<!-- CodexToDoTree END -->$/.exec(owned.text);
  if (!match || digest(match[3]) !== match[2]) fail('Managed workflow rules were edited or corrupted; preserve them and resolve the block before setup.');
}
function configIntegrity(owned) {
  const match = /^# CodexToDoTree BEGIN\n# version=([^;]+); sha256=([a-f0-9]{64})\n([\s\S]*)# CodexToDoTree END$/.exec(owned.text);
  if (!match || digest(match[3]) !== match[2]) fail('Managed configuration was edited or corrupted; preserve custom settings and resolve the block before setup.');
}
function unrelatedSettings(config) {
  const other = { ...config };
  delete other.project_doc_max_bytes;
  if (other.mcp_servers && typeof other.mcp_servers === 'object') {
    other.mcp_servers = { ...other.mcp_servers };
    delete other.mcp_servers[serverName];
    if (!Object.keys(other.mcp_servers).length) delete other.mcp_servers;
  }
  return other;
}
function validateOwnedConfig(text, parsed, owned) {
  configIntegrity(owned);
  const isolated = toml(owned.text);
  if (Object.keys(isolated).some(key => key !== 'mcp_servers') || Object.keys(isolated.mcp_servers || {}).some(key => key !== serverName)) fail('Managed configuration contains unrelated settings; resolve manually before setup.');
  const server = isolated.mcp_servers?.[serverName];
  if (!server || Object.keys(server).some(key => !['command', 'args', 'startup_timeout_sec', 'env'].includes(key)) || Object.keys(server.env || {}).some(key => !['CODEX_HOME', 'CODEX_TODO_TREE_CODEX_METADATA'].includes(key))) fail('Managed configuration contains custom settings; preserve them and migrate deliberately before setup.');
  const remainder = toml(text.slice(0, owned.start) + text.slice(owned.end));
  // Text markers can also occur inside TOML strings; prove ownership using parsed tables.
  if (!parsed.mcp_servers?.[serverName] || remainder.mcp_servers?.[serverName] !== undefined || !isDeepStrictEqual(parsed.mcp_servers[serverName], server) || !isDeepStrictEqual(unrelatedSettings(parsed), unrelatedSettings(remainder))) fail('Managed markers do not identify one complete real MCP table; original content was not modified.');
}
function merge(text, owned, generated) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const content = generated.replaceAll('\n', eol);
  return owned ? text.slice(0, owned.start) + content + text.slice(owned.end) : text + (text && !text.endsWith('\n') ? eol : '') + (text ? eol : '') + content + eol;
}
export function serverConfiguration(metadata = false, home = null, root = ROOT) {
  const env = { ...(home ? { CODEX_HOME: home } : {}), ...(metadata ? { CODEX_TODO_TREE_CODEX_METADATA: '1' } : {}) };
  const body = `[mcp_servers.${serverName}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(root, 'bin/mcp.mjs'))}]\nstartup_timeout_sec = 20\n\n[mcp_servers.${serverName}.env]\n${Object.entries(env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`;
  return `${CONFIG_BEGIN}\n# version=${VERSION}; sha256=${digest(body)}\n${body}${CONFIG_END}`;
}
function capacityText(text, wanted) {
  const config = toml(text), capacity = config.project_doc_max_bytes ?? 32768;
  if (!Number.isSafeInteger(capacity) || capacity <= 0) fail('project_doc_max_bytes must be a positive safe integer.');
  if (capacity >= wanted) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  if (config.project_doc_max_bytes === undefined) return `project_doc_max_bytes = ${wanted}${eol}${text}`;
  let root = true, found = false;
  const lines = text.split(eol).map(line => {
    if (!root || !line.trim() || line.trim().startsWith('#')) return line;
    if (line.includes('"""') || line.includes("'''")) fail('Root multiline TOML requires manual capacity adjustment before setup.');
    if (/^\s*\[/.test(line)) { root = false; return line; }
    if (/^\s*(?:project_doc_max_bytes|"project_doc_max_bytes"|'project_doc_max_bytes')\s*=/.test(line)) {
      found = true;
      const comment = line.indexOf('#');
      return `project_doc_max_bytes = ${wanted}${comment < 0 ? '' : ' ' + line.slice(comment)}`;
    }
    return line;
  });
  if (!found) fail('Unsupported capacity syntax; adjust the root project_doc_max_bytes manually.');
  return lines.join(eol);
}
async function snapshot(home) {
  const names = ['AGENTS.md', 'config.toml', 'AGENTS.override.md'];
  const bytes = await Promise.all(names.map(name => read(path.join(home, name))));
  return Object.fromEntries(names.map((name, i) => [name, bytes[i]]));
}
function unchanged(a, b) {
  return Object.keys(a).every(key => a[key] === null ? b[key] === null : b[key] !== null && a[key].equals(b[key]));
}
async function candidate(home, previous, metadata, disableMetadata, root) {
  const agents = decode(previous['AGENTS.md'] || Buffer.alloc(0)), config = decode(previous['config.toml'] || Buffer.alloc(0));
  if (previous['AGENTS.override.md'] && decode(previous['AGENTS.override.md']).trim()) fail('Nonempty AGENTS.override.md takes precedence. Merge or remove that override deliberately before setup.');
  const oldRules = block(agents, AGENTS_BEGIN, AGENTS_END), oldConfig = block(config, CONFIG_BEGIN, CONFIG_END);
  rulesIntegrity(oldRules);
  const parsed = toml(config);
  if (parsed.mcp_servers?.task_console && parsed.mcp_servers.task_console.enabled !== false) fail('An enabled task_console service already exists. Migrate it deliberately; setup will not install a duplicate task service.');
  if (parsed.mcp_servers?.[serverName] && !oldConfig) fail('An unmanaged codex_todo_tree configuration already exists. Back it up and remove only that server section before applying setup; unrelated settings must remain.');
  // Validate that the managed config block owns no unrelated root or server fields.
  if (oldConfig) validateOwnedConfig(config, parsed, oldConfig);
  const nextAgents = merge(agents, oldRules, await managedInstructions(root));
  const effectiveMetadata = disableMetadata ? false : metadata || parsed.mcp_servers?.[serverName]?.env?.CODEX_TODO_TREE_CODEX_METADATA === '1';
  const nextConfig = capacityText(merge(config, oldConfig, serverConfiguration(effectiveMetadata, home, root)), Math.max(65536, Buffer.byteLength(nextAgents, 'utf8') + 16384));
  const configured = toml(nextConfig), expected = toml(serverConfiguration(effectiveMetadata, home, root)).mcp_servers[serverName];
  if (!isDeepStrictEqual(configured.mcp_servers?.[serverName], expected) || !isDeepStrictEqual(unrelatedSettings(parsed), unrelatedSettings(configured))) fail('Candidate configuration did not preserve unrelated settings or install the expected MCP table; no files were written.');
  return { 'AGENTS.md': Buffer.from(nextAgents), 'config.toml': Buffer.from(nextConfig) };
}
async function replace(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await rejectLinks(file);
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await fs.rename(temporary, file); } finally { await fs.unlink(temporary).catch(() => {}); }
}
// The commit adapter allows deterministic failure/race tests without changing real user profiles.
export async function setup({ home: input, apply = false, metadata = false, disableMetadata = false, root = ROOT } = {}, { commit = replace } = {}) {
  if (metadata && disableMetadata) fail('Choose either --codex-metadata or --no-codex-metadata, not both.');
  const home = codexHome(input);
  const previous = await snapshot(home), next = await candidate(home, previous, metadata, disableMetadata, root);
  const changed = Object.keys(next).filter(name => !previous[name] || !previous[name].equals(next[name]));
  if (!apply) return { applied: false, version: VERSION, changes: changed, configuration: serverConfiguration(toml(decode(next['config.toml'])).mcp_servers[serverName].env.CODEX_TODO_TREE_CODEX_METADATA === '1', home, root), instructionBytes: next['AGENTS.md'].length, next: 'Run setup --apply, then doctor, then reload the MCP client/new Codex run.' };
  if (!changed.length) return { applied: true, changed: false, version: VERSION, backups: [], reloadRequired: true };
  await rejectLinks(home); await fs.mkdir(home, { recursive: true });
  const lockPath = path.join(home, '.codex-todo-tree.setup.lock');
  await rejectLinks(lockPath);
  let lock;
  try { lock = await fs.open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('Another setup holds the profile lock. Do not remove it until that process has stopped.'); throw error; }
  const written = [], backups = [], transaction = randomUUID();
  const lockToken = Buffer.from(JSON.stringify({ pid: process.pid, transaction }));
  try {
    await lock.writeFile(lockToken);
    if (!unchanged(previous, await snapshot(home))) fail('Profile changed during setup; retry after reviewing the new configuration.');
    for (const name of changed) {
      if (previous[name]) {
        const backup = `${name}.codex-todo-tree-${transaction}.bak`;
        await fs.writeFile(path.join(home, backup), previous[name], { flag: 'wx', mode: 0o600 });
        backups.push(backup);
      }
    }
    for (const name of changed) {
      const current = await snapshot(home);
      const expected = { ...previous, ...Object.fromEntries(written.map(key => [key, next[key]])) };
      if (!unchanged(expected, current)) fail('Profile changed before commit; refusing stale overwrite.');
      await commit(path.join(home, name), next[name]); written.push(name);
    }
    return { applied: true, changed: true, version: VERSION, backups, reloadRequired: true };
  } catch (error) {
    let conflict = false;
    for (const name of written.reverse()) {
      const current = await read(path.join(home, name));
      if (!current || !current.equals(next[name])) { conflict = true; continue; }
      if (previous[name]) await replace(path.join(home, name), previous[name]); else await fs.unlink(path.join(home, name));
    }
    if (conflict) fail('Setup interrupted by external edits; those edits were preserved. Inspect profile and retained backups before retrying.');
    throw error;
  } finally {
    await lock.close();
    const currentLock = await read(lockPath).catch(() => null);
    if (currentLock?.equals(lockToken)) await fs.unlink(lockPath).catch(() => {});
  }
}
export async function doctor({ home: input, root = ROOT } = {}) {
  const home = codexHome(input), errors = [], warnings = [];
  let data, agents = '', config, rulesInstalled = false;
  try {
    data = await snapshot(home);
    if (!data['AGENTS.md'] || !data['config.toml']) fail('Global rules or configuration missing; run setup --apply.');
    agents = decode(data['AGENTS.md']); const configurationText = decode(data['config.toml']); config = toml(configurationText);
    const managedConfig = block(configurationText, CONFIG_BEGIN, CONFIG_END);
    if (!managedConfig) errors.push('Managed MCP configuration missing; run setup --apply after resolving unmanaged conflicts.');
    else validateOwnedConfig(configurationText, config, managedConfig);
    if (data['AGENTS.override.md'] && decode(data['AGENTS.override.md']).trim()) errors.push('Global AGENTS.override.md overrides the installed workflow.');
    const actual = block(agents, AGENTS_BEGIN, AGENTS_END);
    rulesIntegrity(actual);
    rulesInstalled = !!actual && actual.text === await managedInstructions(root);
    if (!rulesInstalled) errors.push('Managed workflow missing, edited, outdated or installed for another path; run setup --apply after resolving edits.');
    const target = config.mcp_servers?.[serverName];
    if (!target || target.enabled === false || target.command !== process.execPath || !Array.isArray(target.args) || target.args.length !== 1 || target.args[0] !== path.join(root, 'bin/mcp.mjs')) errors.push('MCP executable/path does not match this installation.');
    if (target?.env?.CODEX_HOME !== home) errors.push('MCP profile discovery does not match this Codex home.');
    if (config.mcp_servers?.task_console && config.mcp_servers.task_console.enabled !== false) errors.push('An enabled legacy task_console service may duplicate this installation.');
    if (config.agents?.enabled === false || config.agents?.max_concurrent_threads_per_session === 0 || config.agents?.max_threads === 0) errors.push('Subagents are explicitly disabled in this profile; the full independent-agent workflow is unavailable. User preferences were not changed.');
    const capacity = config.project_doc_max_bytes ?? 32768;
    if (!Number.isSafeInteger(capacity) || capacity < Buffer.byteLength(agents, 'utf8')) errors.push('Global rules exceed a valid project_doc_max_bytes capacity.');
    await fs.access(path.join(root, 'bin/mcp.mjs'));
  } catch (error) {
    errors.push(error.code ? `Installation files unavailable (${error.code}).` : error.message);
  }
  warnings.push('Reload the MCP client/new Codex run after setup. Existing chats may not hot reload; project instructions and host capabilities must be checked separately.');
  warnings.push('No actor ACL, automatic UI injection, proof of model compliance, or guarantee of identical behavior across clients.');
  warnings.push('metadataEnabled reports configuration only; the version-dependent native adapter must still be checked in the live dashboard.');
  return { ok: errors.length === 0, version: VERSION, rulesInstalled, agentsBytes: Buffer.byteLength(agents), maxBytes: config?.project_doc_max_bytes ?? 32768, metadataEnabled: config?.mcp_servers?.[serverName]?.env?.CODEX_TODO_TREE_CODEX_METADATA === '1', capabilities: { subagents: 'Host tool availability not verified by static doctor', sidebar: 'Host browser tool availability not verified by static doctor' }, errors, warnings };
}
