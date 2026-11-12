import { FormulaError, evaluateFormula, formulaRefs, parseFormula } from './formula';

describe('formula', () => {
  it('evaluates arithmetic with precedence, brackets and unary minus', () => {
    expect(evaluateFormula('1 + 2 * 3', {})).toBe(7);
    expect(evaluateFormula('(1 + 2) * 3', {})).toBe(9);
    expect(evaluateFormula('-4 + 10 / 2', {})).toBe(1);
    expect(evaluateFormula('.5 * 4', {})).toBe(2);
  });

  it('reads numeric field values', () => {
    expect(evaluateFormula('likelihood * consequence', { likelihood: 3, consequence: 4 })).toBe(12);
  });

  it('is null for missing / non-numeric values, division by zero and bad syntax', () => {
    expect(evaluateFormula('a + 1', {})).toBeNull();
    expect(evaluateFormula('a + 1', { a: '2' })).toBeNull();
    expect(evaluateFormula('1 / 0', {})).toBeNull();
    expect(evaluateFormula('1 +', {})).toBeNull();
    expect(evaluateFormula('alert(1)', {})).toBeNull();
  });

  it('lists the referenced keys once', () => {
    expect(formulaRefs(parseFormula('a * b + a'))).toEqual(['a', 'b']);
  });

  it('rejects anything outside the grammar', () => {
    expect(() => parseFormula('')).toThrow(FormulaError);
    expect(() => parseFormula('a ** 2')).toThrow(FormulaError);
    expect(() => parseFormula('Math.max(1)')).toThrow(FormulaError);
    expect(() => parseFormula('(1 + 2')).toThrow(FormulaError);
  });
});
