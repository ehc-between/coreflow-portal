import { expect } from 'vitest';

/**
 * Key-parity check for translation and guidance files (en/nb must have the same keys
 * and structure; strings may differ). Use it in Vitest specs:
 *
 *   import en from '../../../assets/i18n/risk/en.json';
 *   import nb from '../../../assets/i18n/risk/nb.json';
 *   it('keeps en/nb at parity', () => expectKeyParity(en, nb));
 *
 * Objects must have identical key sets, arrays identical lengths, and each pair of
 * values the same kind (object / array / leaf). Leaves are compared by type only
 * (string vs number vs boolean), never by value. Failures name the offending path.
 */
export function expectKeyParity(a: unknown, b: unknown, path = ''): void {
  const problems = collectParityProblems(a, b, path);
  expect(problems, problems.join('\n')).toEqual([]);
}

/** The parity problems between `a` and `b` (empty when at parity). */
export function collectParityProblems(a: unknown, b: unknown, path = ''): string[] {
  const where = path || '<root>';
  const kindA = kindOf(a);
  const kindB = kindOf(b);
  if (kindA !== kindB) {
    return [`${where}: ${kindA} vs ${kindB}`];
  }
  if (kindA === 'array') {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) {
      return [`${where}: array length ${left.length} vs ${right.length}`];
    }
    return left.flatMap((item, i) => collectParityProblems(item, right[i], `${path}[${i}]`));
  }
  if (kindA === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const problems: string[] = [];
    for (const key of Object.keys(left)) {
      const sub = path ? `${path}.${key}` : key;
      if (!(key in right)) {
        problems.push(`${sub}: missing in second`);
      } else {
        problems.push(...collectParityProblems(left[key], right[key], sub));
      }
    }
    for (const key of Object.keys(right)) {
      if (!(key in left)) {
        problems.push(`${path ? `${path}.${key}` : key}: missing in first`);
      }
    }
    return problems;
  }
  return [];
}

function kindOf(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}
