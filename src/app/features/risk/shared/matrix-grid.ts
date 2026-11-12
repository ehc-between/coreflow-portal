import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { bandFor, bandLabel, contrastText, levelLabel } from '../data/risk-display';
import { Matrix } from '../data/risk.models';

export interface CellPosition {
  readonly likelihood: number;
  readonly consequence: number;
}

export type MatrixGridMode = 'preview' | 'picker' | 'heatmap';

interface GridCell extends CellPosition {
  readonly key: string;
  readonly score: number;
  readonly color: string;
  readonly text: string;
  readonly bandText: string;
  readonly count: number;
  readonly withinAppetite: boolean;
}

interface GridRow {
  readonly likelihood: number;
  readonly label: string;
  readonly cells: readonly GridCell[];
}

/**
 * A likelihood x consequence matrix, coloured by band. Likelihood runs bottom to top,
 * consequence left to right. Modes:
 *  - `preview`: static (matrix editor);
 *  - `picker`: each cell is a button that emits `cellSelected` (rating a risk);
 *  - `heatmap`: cells show `counts["l:c"]` and emit `cellSelected` when non-empty.
 * Arrow keys move between cells (roving tab stop); Enter/Space selects.
 */
@Component({
  selector: 'app-matrix-grid',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="overflow-x-auto">
      <div
        class="grid min-w-[280px] gap-1"
        [style.grid-template-columns]="columns()"
        [attr.role]="mode() === 'preview' ? 'img' : 'group'"
        [attr.aria-label]="ariaLabel() || ('risk.matrix.gridLabel' | transloco)"
        data-testid="matrix-grid"
      >
        @for (row of rows(); track row.likelihood; let ri = $index) {
          <div
            class="flex items-center justify-end pr-1 text-right text-[11.5px] leading-tight text-fg-muted"
          >
            <span class="line-clamp-2">{{ row.likelihood }} · {{ row.label }}</span>
          </div>
          @for (cell of row.cells; track cell.key; let ci = $index) {
            @if (mode() === 'preview') {
              <div
                class="flex min-h-[38px] items-center justify-center rounded-[6px] text-[12px] font-semibold"
                [style.background]="cell.color"
                [style.color]="textColor(cell.color)"
                [attr.title]="cell.text"
                [class.ring-2]="cell.withinAppetite && showAppetite()"
                [class.ring-inset]="cell.withinAppetite && showAppetite()"
                [class.ring-white]="cell.withinAppetite && showAppetite()"
              >
                {{ cell.score }}
              </div>
            } @else {
              <button
                #cellButton
                type="button"
                class="flex min-h-[40px] items-center justify-center rounded-[6px] text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-default"
                [style.background]="cell.color"
                [style.color]="textColor(cell.color)"
                [class.opacity-60]="mode() === 'heatmap' && cell.count === 0"
                [class.ring-4]="isSelected(cell)"
                [class.ring-fg]="isSelected(cell)"
                [attr.aria-pressed]="mode() === 'picker' ? isSelected(cell) : null"
                [attr.aria-label]="cell.text"
                [attr.data-testid]="'cell-' + cell.key"
                [tabindex]="tabStop() === ri * columnsCount() + ci ? 0 : -1"
                [attr.aria-disabled]="mode() === 'heatmap' && cell.count === 0 ? true : null"
                (click)="choose(cell)"
                (keydown)="onKeydown($event, ri, ci)"
                (focus)="focused.set(ri * columnsCount() + ci)"
              >
                @if (mode() === 'heatmap') {
                  {{ cell.count || '' }}
                } @else if (isSelected(cell)) {
                  {{ cell.score }}
                } @else if (isSecondary(cell)) {
                  <span aria-hidden="true">○</span>
                }
              </button>
            }
          }
        }
        <div></div>
        @for (c of consequenceLabels(); track c.value) {
          <div class="pt-1 text-center text-[11.5px] leading-tight text-fg-muted">
            <span class="line-clamp-2">{{ c.value }} · {{ c.label }}</span>
          </div>
        }
      </div>
    </div>
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-fg-muted">
      <span>{{ 'risk.matrix.axes' | transloco }}</span>
      <ul class="flex flex-wrap gap-2" [attr.aria-label]="'risk.matrix.legend' | transloco">
        @for (band of legend(); track band.key) {
          <li class="inline-flex items-center gap-1">
            <span
              class="inline-block h-3 w-3 rounded-[3px]"
              [style.background]="band.color"
              aria-hidden="true"
            ></span>
            {{ band.text }}
          </li>
        }
      </ul>
    </div>
  `,
})
export class MatrixGrid {
  private readonly language = inject(LanguageService);

  readonly matrix =
    input.required<
      Pick<
        Matrix,
        'likelihood_levels' | 'consequence_levels' | 'bands' | 'cells' | 'acceptable_max_score'
      >
    >();
  readonly mode = input<MatrixGridMode>('preview');
  readonly counts = input<Readonly<Record<string, number>>>({});
  readonly selected = input<CellPosition | null>(null);
  /** A second marked cell (e.g. the inherent rating while picking the residual one). */
  readonly secondary = input<CellPosition | null>(null);
  readonly showAppetite = input(false);
  readonly ariaLabel = input<string | null>(null);

  readonly cellSelected = output<CellPosition>();

  private readonly cellButtons = viewChildren<ElementRef<HTMLButtonElement>>('cellButton');
  protected readonly focused = signal<number | null>(null);

  private t = (key: string, params?: Record<string, unknown>) =>
    this.language.translate(key, params);

  protected readonly columnsCount = computed(() => this.matrix().consequence_levels.length);

  protected readonly columns = computed(
    () => `minmax(72px, 0.9fr) repeat(${this.columnsCount()}, minmax(36px, 1fr))`,
  );

  protected readonly consequenceLabels = computed(() =>
    [...this.matrix().consequence_levels]
      .sort((a, b) => a.value - b.value)
      .map((level) => ({ value: level.value, label: levelLabel(level, this.t) })),
  );

  protected readonly rows = computed<readonly GridRow[]>(() => {
    const matrix = this.matrix();
    const counts = this.counts();
    const appetite = matrix.acceptable_max_score;
    const consequences = [...matrix.consequence_levels].sort((a, b) => a.value - b.value);
    return [...matrix.likelihood_levels]
      .sort((a, b) => b.value - a.value)
      .map((l) => {
        const lLabel = levelLabel(l, this.t);
        return {
          likelihood: l.value,
          label: lLabel,
          cells: consequences.map((c) => {
            const band = bandFor(matrix, l.value, c.value);
            const key = `${l.value}:${c.value}`;
            const score = l.value * c.value;
            const bandText = band ? bandLabel(band, this.t) : '';
            const count = counts[key] ?? 0;
            return {
              key,
              likelihood: l.value,
              consequence: c.value,
              score,
              color: band?.color ?? '#e5e7eb',
              bandText,
              count,
              withinAppetite: appetite !== null && score <= appetite,
              text: this.t('risk.matrix.cellLabel', {
                likelihood: lLabel,
                consequence: levelLabel(c, this.t),
                score,
                level: bandText,
                count,
              }),
            };
          }),
        };
      });
  });

  protected readonly legend = computed(() =>
    [...this.matrix().bands]
      .sort((a, b) => a.min_score - b.min_score)
      .map((band) => ({ key: band.key, color: band.color, text: bandLabel(band, this.t) })),
  );

  /** Index of the cell holding the tab stop: focused, else selected, else the first. */
  protected readonly tabStop = computed(() => {
    const focused = this.focused();
    if (focused !== null) {
      return focused;
    }
    const selected = this.selected();
    if (selected) {
      const rows = this.rows();
      const ri = rows.findIndex((r) => r.likelihood === selected.likelihood);
      const ci =
        ri >= 0 ? rows[ri].cells.findIndex((c) => c.consequence === selected.consequence) : -1;
      if (ri >= 0 && ci >= 0) {
        return ri * this.columnsCount() + ci;
      }
    }
    return 0;
  });

  protected textColor(color: string): string {
    return contrastText(color);
  }

  protected isSelected(cell: CellPosition): boolean {
    const s = this.selected();
    return !!s && s.likelihood === cell.likelihood && s.consequence === cell.consequence;
  }

  protected isSecondary(cell: CellPosition): boolean {
    const s = this.secondary();
    return !!s && s.likelihood === cell.likelihood && s.consequence === cell.consequence;
  }

  protected choose(cell: GridCell): void {
    if (this.mode() === 'heatmap' && cell.count === 0) {
      return;
    }
    this.cellSelected.emit({ likelihood: cell.likelihood, consequence: cell.consequence });
  }

  protected onKeydown(event: KeyboardEvent, ri: number, ci: number): void {
    const rows = this.rows().length;
    const cols = this.columnsCount();
    let r = ri;
    let c = ci;
    switch (event.key) {
      case 'ArrowUp':
        r = Math.max(0, ri - 1);
        break;
      case 'ArrowDown':
        r = Math.min(rows - 1, ri + 1);
        break;
      case 'ArrowLeft':
        c = Math.max(0, ci - 1);
        break;
      case 'ArrowRight':
        c = Math.min(cols - 1, ci + 1);
        break;
      case 'Home':
        c = 0;
        break;
      case 'End':
        c = cols - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const index = r * cols + c;
    this.focused.set(index);
    this.cellButtons()[index]?.nativeElement.focus();
  }
}
