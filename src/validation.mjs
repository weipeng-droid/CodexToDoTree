export class InputError extends Error {}
export function text(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${name} must be a nonempty string (max ${max}).`);
  return value.trim();
}
