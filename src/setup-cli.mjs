import { parseArgs } from 'node:util';
import { setup, doctor } from './setup.mjs';
import { workflowInstructions } from './workflow.mjs';

export async function runSetupCommand(action, args) {
  const { values } = parseArgs({ args, options: { apply: { type: 'boolean', default: false }, instructions: { type: 'boolean', default: false }, 'codex-home': { type: 'string' }, 'codex-metadata': { type: 'boolean', default: false }, 'no-codex-metadata': { type: 'boolean', default: false } } });
  if (action === 'doctor' && (values.apply || values.instructions || values['codex-metadata'] || values['no-codex-metadata'])) throw new Error('doctor is read-only and accepts only --codex-home.');
  if (values.instructions) {
    if (values.apply) throw new Error('--instructions cannot be combined with --apply.');
    console.log(await workflowInstructions()); return;
  }
  const result = await (action === 'doctor' ? doctor({ home: values['codex-home'] }) : setup({ home: values['codex-home'], apply: values.apply, metadata: values['codex-metadata'], disableMetadata: values['no-codex-metadata'] }));
  if (action === 'setup' && !values.apply) {
    console.log('Preview only: no configuration or rules were written.');
    console.log(result.configuration);
    console.log(JSON.stringify({ ...result, configuration: undefined }, null, 2));
  } else console.log(JSON.stringify(result, null, 2));
  if (action === 'doctor' && !result.ok) process.exitCode = 1;
}
