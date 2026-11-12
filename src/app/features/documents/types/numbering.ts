/** Default numbering pattern of a document type (backend default). */
export const DEFAULT_NUMBERING_PATTERN = '{prefix}-{seq:03}';

const SEQ = /\{seq(?::(\d+))?\}/g;

/**
 * Whether a numbering pattern is valid: exactly one `{seq}` / `{seq:N}` (N 1-8) and
 * only the `{prefix}`, `{year}` and `{seq…}` tokens. Mirrors the backend check, so the
 * form can explain the problem before saving.
 */
export function isValidPattern(pattern: string): boolean {
  const seqs = [...pattern.matchAll(SEQ)];
  if (seqs.length !== 1) {
    return false;
  }
  const width = seqs[0][1];
  if (width !== undefined) {
    const n = Number(width);
    if (n < 1 || n > 8) {
      return false;
    }
  }
  const rest = pattern.replace(SEQ, '').replace(/\{prefix\}|\{year\}/g, '');
  return !/[{}]/.test(rest);
}

/**
 * Preview the code a pattern gives (`{prefix}-{seq:03}` + `PR` + 7 -> `PR-007`).
 * Returns null for an invalid pattern.
 */
export function previewCode(
  pattern: string,
  prefix: string,
  seq: number,
  year = new Date().getFullYear(),
): string | null {
  const p = pattern.trim() || DEFAULT_NUMBERING_PATTERN;
  if (!isValidPattern(p)) {
    return null;
  }
  return p
    .replace(/\{prefix\}/g, prefix.trim())
    .replace(/\{year\}/g, String(year))
    .replace(SEQ, (_m, width: string | undefined) =>
      String(Math.max(1, Math.floor(seq))).padStart(width ? Number(width) : 0, '0'),
    );
}
