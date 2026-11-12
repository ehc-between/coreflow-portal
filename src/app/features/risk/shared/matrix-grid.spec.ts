import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Matrix } from '../data/risk.models';
import { CellPosition, MatrixGrid } from './matrix-grid';

const MATRIX: Pick<
  Matrix,
  'likelihood_levels' | 'consequence_levels' | 'bands' | 'cells' | 'acceptable_max_score'
> = {
  likelihood_levels: [
    { value: 1, label: 'Unlikely', key: 'unlikely' },
    { value: 2, label: 'Possible', key: 'possible' },
    { value: 3, label: 'Likely', key: 'likely' },
  ],
  consequence_levels: [
    { value: 1, label: 'Minor', key: 'minor' },
    { value: 2, label: 'Moderate', key: 'moderate' },
    { value: 3, label: 'Severe', key: 'severe' },
  ],
  bands: [
    { key: 'low', label: 'Low', min_score: 1, color: '#16a34a' },
    { key: 'high', label: 'High', min_score: 6, color: '#dc2626' },
  ],
  cells: {},
  acceptable_max_score: 2,
};

function setup(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [MatrixGrid, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MatrixGrid);
  fixture.componentRef.setInput('matrix', MATRIX);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  const picked: CellPosition[] = [];
  fixture.componentInstance.cellSelected.subscribe((c) => picked.push(c));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, picked };
}

describe('MatrixGrid', () => {
  it('renders a static preview with one cell per pair', () => {
    const { el } = setup({});
    expect(el.querySelectorAll('[data-testid^="cell-"]').length).toBe(0);
    expect(el.textContent).toContain('9');
    expect(el.querySelector('[role="img"]')).toBeTruthy();
  });

  it('emits the picked cell and marks it pressed', () => {
    const { el, fixture, picked } = setup({ mode: 'picker' });
    const cell = el.querySelector<HTMLButtonElement>('[data-testid="cell-3:2"]')!;
    cell.click();
    expect(picked).toEqual([{ likelihood: 3, consequence: 2 }]);
    fixture.componentRef.setInput('selected', { likelihood: 3, consequence: 2 });
    fixture.detectChanges();
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    expect(cell.tabIndex).toBe(0);
  });

  it('shows heat map counts and ignores empty cells', () => {
    const { el, picked } = setup({ mode: 'heatmap', counts: { '1:1': 4 } });
    const full = el.querySelector<HTMLButtonElement>('[data-testid="cell-1:1"]')!;
    const empty = el.querySelector<HTMLButtonElement>('[data-testid="cell-3:3"]')!;
    expect(full.textContent?.trim()).toBe('4');
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    empty.click();
    full.click();
    expect(picked).toEqual([{ likelihood: 1, consequence: 1 }]);
  });

  it('moves focus with the arrow keys', () => {
    const { el, fixture } = setup({ mode: 'picker' });
    const first = el.querySelector<HTMLButtonElement>('[data-testid="cell-3:1"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('cell-3:2');
  });
});
