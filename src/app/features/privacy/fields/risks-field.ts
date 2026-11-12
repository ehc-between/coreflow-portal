import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { DpiaRisk, LEVELS, Level } from '../data/privacy.models';

const MAX_RISKS = 50;

/** The DPIA risk table: each risk to the people affected, its level, mitigation and residual level. */
@Component({
  selector: 'app-privacy-risks-field',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-3">
      <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
        {{ 'privacy.fields.risks' | transloco }}
      </legend>
      @if (value().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'privacy.dpia.noRisks' | transloco }}</p>
      }
      @for (risk of value(); track $index; let i = $index) {
        <div class="rounded-tile border border-border p-3" [attr.data-testid]="'risk-' + i">
          <div class="flex items-start gap-2">
            <label class="sr-only" [for]="'cf-risk-desc-' + i">
              {{ 'privacy.dpia.riskDescription' | transloco }}
            </label>
            <textarea
              [id]="'cf-risk-desc-' + i"
              rows="2"
              maxlength="1000"
              class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent"
              [placeholder]="'privacy.dpia.riskDescription' | transloco"
              [value]="risk.description"
              (input)="patch(i, { description: $any($event.target).value })"
            ></textarea>
            <button
              type="button"
              class="inline-flex h-8 w-8 flex-none items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'privacy.dpia.removeRisk' | transloco: { n: i + 1 }"
              (click)="remove(i)"
            >
              <app-icon name="trash" [size]="14" />
            </button>
          </div>
          <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            @for (dim of dims; track dim) {
              <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
                {{ 'privacy.dpia.' + dim | transloco }}
                <select
                  class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13px] font-normal text-fg"
                  (change)="setLevel(i, dim, $any($event.target).value)"
                >
                  @if (dim === 'residual') {
                    <option value="" [selected]="!risk.residual">
                      {{ 'privacy.common.notSet' | transloco }}
                    </option>
                  }
                  @for (l of levels; track l) {
                    <option [value]="l" [selected]="risk[dim] === l">
                      {{ 'privacy.options.level.' + l | transloco }}
                    </option>
                  }
                </select>
              </label>
            }
          </div>
          <label class="mt-2 flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'privacy.dpia.mitigation' | transloco }}
            <textarea
              rows="2"
              maxlength="2000"
              class="rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] font-normal text-fg outline-none focus:border-accent"
              [value]="risk.mitigation ?? ''"
              (input)="patch(i, { mitigation: $any($event.target).value })"
            ></textarea>
          </label>
        </div>
      }
      @if (value().length < max) {
        <div>
          <app-button variant="secondary" size="sm" (click)="add()" data-testid="add-risk">
            <app-icon name="plus" [size]="14" />
            {{ 'privacy.dpia.addRisk' | transloco }}
          </app-button>
        </div>
      }
    </fieldset>
  `,
})
export class RisksField {
  readonly value = input<readonly DpiaRisk[]>([]);
  readonly valueChange = output<readonly DpiaRisk[]>();

  protected readonly levels = LEVELS;
  protected readonly dims = ['likelihood', 'severity', 'residual'] as const;
  protected readonly max = MAX_RISKS;

  protected add(): void {
    this.valueChange.emit([
      ...this.value(),
      { description: '', likelihood: 'medium', severity: 'medium', mitigation: '', residual: null },
    ]);
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.value().filter((_, i) => i !== index));
  }

  protected patch(index: number, change: Partial<DpiaRisk>): void {
    this.valueChange.emit(this.value().map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  protected setLevel(
    index: number,
    dim: 'likelihood' | 'severity' | 'residual',
    value: string,
  ): void {
    const level = (LEVELS as readonly string[]).includes(value) ? (value as Level) : null;
    if (dim === 'residual') {
      this.patch(index, { residual: level });
    } else if (level) {
      this.patch(index, { [dim]: level });
    }
  }
}
