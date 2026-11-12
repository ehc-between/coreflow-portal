import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { bandFor, levelLabel } from '../data/risk-display';
import { Matrix } from '../data/risk.models';
import { CellPosition, MatrixGrid } from './matrix-grid';
import { RatingBadge } from './rating-badge';

export interface RatingValue {
  readonly likelihood: number | null;
  readonly consequence: number | null;
}

let nextId = 0;

/**
 * Likelihood and consequence selection on the risk's matrix: two labelled selects
 * (keyboard and screen-reader friendly) plus the clickable matrix, and the resulting
 * score and level. Emits the pair on every change; "Clear" emits nulls.
 */
@Component({
  selector: 'app-rating-picker',
  imports: [TranslocoPipe, MatrixGrid, RatingBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="flex flex-col gap-3" [disabled]="disabled()">
      <legend class="mb-1 text-[13px] font-semibold text-fg">{{ legend() }}</legend>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted" [for]="lId">
          {{ 'risk.rating.likelihood' | transloco }}
          <select
            [id]="lId"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg"
            (change)="setLikelihood($any($event.target).value)"
          >
            <option value="" [selected]="value().likelihood === null">
              {{ 'risk.rating.choose' | transloco }}
            </option>
            @for (level of likelihoods(); track level.value) {
              <option [value]="level.value" [selected]="level.value === value().likelihood">
                {{ level.value }} · {{ level.label }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted" [for]="cId">
          {{ 'risk.rating.consequence' | transloco }}
          <select
            [id]="cId"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg"
            (change)="setConsequence($any($event.target).value)"
          >
            <option value="" [selected]="value().consequence === null">
              {{ 'risk.rating.choose' | transloco }}
            </option>
            @for (level of consequences(); track level.value) {
              <option [value]="level.value" [selected]="level.value === value().consequence">
                {{ level.value }} · {{ level.label }}
              </option>
            }
          </select>
        </label>
      </div>
      @if (showGrid()) {
        <app-matrix-grid
          mode="picker"
          [matrix]="matrix()"
          [selected]="selectedCell()"
          [secondary]="secondary()"
          [ariaLabel]="legend()"
          (cellSelected)="pick($event)"
        />
      }
      <div class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted" aria-live="polite">
        <span>{{ 'risk.rating.result' | transloco }}</span>
        <app-rating-badge
          [score]="preview()?.score"
          [level]="preview()?.level"
          [label]="preview()?.label"
          [color]="preview()?.color"
        />
        @if (aboveAppetite()) {
          <span class="font-semibold text-fail">{{ 'risk.rating.aboveAppetite' | transloco }}</span>
        }
        @if (value().likelihood !== null || value().consequence !== null) {
          <button
            type="button"
            class="ml-auto rounded-tile px-2 py-1 text-[12.5px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
            (click)="changed.emit({ likelihood: null, consequence: null })"
          >
            {{ 'risk.rating.clear' | transloco }}
          </button>
        }
      </div>
    </fieldset>
  `,
})
export class RatingPicker {
  private readonly language = inject(LanguageService);

  readonly matrix = input.required<Matrix>();
  readonly value = input<RatingValue>({ likelihood: null, consequence: null });
  readonly legend = input('');
  readonly secondary = input<CellPosition | null>(null);
  readonly showGrid = input(true);
  readonly disabled = input(false);

  readonly changed = output<RatingValue>();

  protected readonly lId = `risk-rating-l-${++nextId}`;
  protected readonly cId = `risk-rating-c-${nextId}`;

  private t = (key: string, params?: Record<string, unknown>) =>
    this.language.translate(key, params);

  protected readonly likelihoods = computed(() =>
    [...this.matrix().likelihood_levels]
      .sort((a, b) => a.value - b.value)
      .map((l) => ({ value: l.value, label: levelLabel(l, this.t) })),
  );
  protected readonly consequences = computed(() =>
    [...this.matrix().consequence_levels]
      .sort((a, b) => a.value - b.value)
      .map((l) => ({ value: l.value, label: levelLabel(l, this.t) })),
  );

  protected readonly selectedCell = computed<CellPosition | null>(() => {
    const { likelihood, consequence } = this.value();
    return likelihood !== null && consequence !== null ? { likelihood, consequence } : null;
  });

  protected readonly preview = computed(() => {
    const cell = this.selectedCell();
    if (!cell) {
      return null;
    }
    const band = bandFor(this.matrix(), cell.likelihood, cell.consequence);
    return {
      score: cell.likelihood * cell.consequence,
      level: band?.key ?? null,
      label: band?.label ?? null,
      color: band?.color ?? null,
    };
  });

  protected readonly aboveAppetite = computed(() => {
    const appetite = this.matrix().acceptable_max_score;
    const score = this.preview()?.score;
    return appetite !== null && score !== undefined && score > appetite;
  });

  protected setLikelihood(raw: string): void {
    this.changed.emit({
      likelihood: raw ? Number(raw) : null,
      consequence: this.value().consequence,
    });
  }

  protected setConsequence(raw: string): void {
    this.changed.emit({
      likelihood: this.value().likelihood,
      consequence: raw ? Number(raw) : null,
    });
  }

  protected pick(cell: CellPosition): void {
    this.changed.emit(cell);
  }
}
