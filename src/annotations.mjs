import { createHash } from 'node:crypto';
import { InputError,text } from './validation.mjs';
export const sourceHash=value=>createHash('sha256').update(`task-console/translation-v1\0${value}`).digest('hex');
export function translated(source,annotation) {
  return annotation?.sourceHash===sourceHash(source || '')?annotation.text:source;
}
export function translation(source,value,name) {
  const result=text(value,name,6000);
  if(!/\p{Script=Han}/u.test(result))throw new InputError(`${name} must include a Chinese explanation.`);
  return {sourceHash:sourceHash(source),text:result};
}
