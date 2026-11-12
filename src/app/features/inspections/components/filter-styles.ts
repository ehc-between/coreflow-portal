/** Styles of the native filter `<select>`s (class `cf-filter`) on the inspections list pages. */
export const FILTER_STYLES = `
  .cf-filter {
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 13.5px;
    padding: 0 10px;
    outline: none;
  }
  .cf-filter:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .cf-check {
    display: inline-flex;
    height: 40px;
    align-items: center;
    gap: 8px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    padding: 0 12px;
    font-size: 13px;
    color: var(--fg);
  }
`;

/** Restores a filter value, ignoring values outside `allowed`. */
export function pick<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
