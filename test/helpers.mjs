import * as fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/paths.mjs';
export async function fixture(t) {
  const base = path.resolve(ROOT, 'work/test-fixtures');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'console-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
export const examplePlan = (overrides = {}) => ({ action: 'plan', thread_id: 'test-thread-a', thread_title: '测试对话 A', board_id: 'work-1', title: '构建控制台', project: '任务控制台', steps: ['检查环境', '实现状态服务', '验证界面'], ...overrides });
