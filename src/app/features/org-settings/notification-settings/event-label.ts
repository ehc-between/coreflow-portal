/**
 * Turn a notification or timeline template ("Eiendel registrert: {{ code }}
 * {{ title }}") into a readable name for the kind of event ("Eiendel registrert").
 * Placeholders become "…"; a trailing ": …" (or "– …") and a placeholder between
 * two words are dropped; runs of ellipses collapse. Returns null for an empty result.
 */
export function eventLabelFromTemplate(template: string | null | undefined): string | null {
  if (!template) return null;
  let text = template
    .replace(/\{\{[^}]*\}\}/g, '…')
    .replace(/[«"“]\s*…\s*[»"”]/g, '…')
    .replace(/…(\s*…)+/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/\s*[:–-]\s*…\s*[.!]?$/, '').trim();
  // A placeholder between two words ("Avvik {{ code }} har endret status") is dropped,
  // so the kind reads "Avvik har endret status" rather than "Avvik … har endret status".
  text = text.replace(/(\p{L})\s+…\s+(?=\p{L})/gu, '$1 ');
  text = text
    .replace(/\(\s*…\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text === '…') return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Translation scope of a scoped key (`assets:notifications.x` → `assets`), else null. */
export function scopeOfKey(key: string | null | undefined): string | null {
  const match = /^([a-z][a-z0-9_/-]*):/.exec(key ?? '');
  return match ? match[1] : null;
}
