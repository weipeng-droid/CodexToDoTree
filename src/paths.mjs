import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function defaultState({platform=process.platform,env=process.env,home=os.homedir()}={}) {
  if(platform==='win32')return path.join(env.LOCALAPPDATA || path.join(home,'AppData','Local'),'CodexToDoTree');
  if(platform==='darwin')return path.join(home,'Library','Application Support','CodexToDoTree');
  return path.join(env.XDG_DATA_HOME || path.join(home,'.local','share'),'codex-todo-tree');
}
export const STATE = path.resolve(process.env.CODEX_TODO_TREE_STATE || process.env.TASK_CONSOLE_STATE || defaultState());
