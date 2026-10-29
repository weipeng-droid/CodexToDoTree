import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './paths.mjs';

export const VERSION = '0.2.0';
export const AGENTS_BEGIN = '<!-- CodexToDoTree BEGIN -->';
export const AGENTS_END = '<!-- CodexToDoTree END -->';
export const CONFIG_BEGIN = '# CodexToDoTree BEGIN';
export const CONFIG_END = '# CodexToDoTree END';
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function workflowInstructions(root = ROOT) {
  return (await fs.readFile(path.join(ROOT, 'docs/AGENTS.example.md'), 'utf8')).replaceAll('<ABSOLUTE_REPO_DIR>', root.replaceAll('\\', '/')).trimEnd() + '\n';
}
export async function managedInstructions(root = ROOT) {
  const text = await workflowInstructions(root);
  return `${AGENTS_BEGIN}\n<!-- version=${VERSION}; sha256=${digest(text)} -->\n${text}${AGENTS_END}`;
}
