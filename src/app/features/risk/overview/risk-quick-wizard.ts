import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { RiskApi } from '../data/risk-api';
import { riskErrorKey } from '../data/risk-errors';
import { Matrix, Risk, RiskCreate } from '../data/risk.models';

/** The wizard's three answers. */
export interface QuickRiskAnswers {
  readonly title: string;
  readonly likelihood: number | null;
  readonly consequence: number | null;
}

/** The create body for the three answers; `null` until all three are given. */
export function quickRiskBody(a: QuickRiskAnswers): RiskCreate | null {
  const title = a.title.trim();
  if (!title || a.likelihood === null || a.consequence === null) {
    return null;
  }
  return {
    title,
    inherent_likelihood: a.likelihood,
    inherent_consequence: a.consequence,
  };
}

/**
 * U34 "Hva kan gå galt?": the beginner's way to a first risk. Three questions on one
 * card (what can go wrong, how likely, how bad) using the default matrix's own level
 * labels, and one button that adds the risk. Typing plus three clicks: pick likelihood,
 * pick consequence, add.
 */
@Component({
  selector: 'app-risk-quick-wizard',
  imports: [TranslocoPipe, Button, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <form
        data-testid="risk-quick-wizard"
        aria-labelledby="risk-quick-title"
        (submit)="$event.preventDefault(); save()"
      >
        <h2 id="risk-quick-title" class="font-display text-section font-bold text-fg">
          {{ 'risk.quick.title' | transloco }}
        </h2>
        <p class="mt-1 text-ui text-fg-muted">{{ 'risk.quick.intro' | transloco }}</p>

        <label for="risk-quick-what" class="mt-4 block text-ui font-semibold text-fg">
          1. {{ 'risk.quick.what' | transloco }}
        </label>
        <input
          id="risk-quick-what"
          type="text"
          class="mt-1 h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          [placeholder]="'risk.quick.whatPlaceholder' | transloco"
          [value]="title()"
          (input)="title.set($any($event.target).value)"
          data-testid="risk-quick-what"
        />

        <fieldset class="mt-4">
          <legend class="text-ui font-semibold text-fg">
            2. {{ 'risk.quick.likely' | transloco }}
          </legend>
          <div class="mt-1 flex flex-wrap gap-1.5">
            @for (level of matrix().likelihood_levels; track level.value) {
              <button
                type="button"
                class="min-h-9 rounded-full border px-3 text-meta font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                [class]="
                  likelihood() === level.value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-fg-muted hover:bg-surface-2'
                "
                [attr.aria-pressed]="likelihood() === level.value"
                [attr.title]="level.description ?? null"
                [attr.data-testid]="'risk-quick-likely-' + level.value"
                (click)="likelihood.set(level.value)"
              >
                {{ level.label }}
              </button>
            }
          </div>
        </fieldset>

        <fieldset class="mt-4">
          <legend class="text-ui font-semibold text-fg">
            3. {{ 'risk.quick.bad' | transloco }}
          </legend>
          <div class="mt-1 flex flex-wrap gap-1.5">
            @for (level of matrix().consequence_levels; track level.value) {
              <button
                type="button"
                class="min-h-9 rounded-full border px-3 text-meta font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
                [class]="
                  consequence() === level.value
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-fg-muted hover:bg-surface-2'
                "
                [attr.aria-pressed]="consequence() === level.value"
                [attr.title]="level.description ?? null"
                [attr.data-testid]="'risk-quick-bad-' + level.value"
                (click)="consequence.set(level.value)"
              >
                {{ level.label }}
              </button>
            }
          </div>
        </fieldset>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <app-button
            type="submit"
            size="sm"
            [disabled]="!ready() || saving()"
            [loading]="saving()"
            data-testid="risk-quick-save"
          >
            {{ 'risk.quick.save' | transloco }}
          </app-button>
          <span class="text-meta text-fg-muted">{{ 'risk.quick.later' | transloco }}</span>
        </div>
      </form>
    </app-card>
  `,
})
export class RiskQuickWizard {
  private readonly api = inject(RiskApi);
  private readonly toasts = inject(NotificationService);

  readonly orgId = input.required<string>();
  readonly matrix = input.required<Matrix>();
  /** The register the overview is filtered on (its matrix is the one shown); empty = default. */
  readonly registerId = input('');
  readonly created = output<Risk>();

  protected readonly title = signal('');
  protected readonly likelihood = signal<number | null>(null);
  protected readonly consequence = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected ready(): boolean {
    return this.body() !== null;
  }

  private body(): RiskCreate | null {
    return quickRiskBody({
      title: this.title(),
      likelihood: this.likelihood(),
      consequence: this.consequence(),
    });
  }

  protected save(): void {
    const body = this.body();
    if (!body || this.saving()) {
      return;
    }
    this.saving.set(true);
    const registerId = this.registerId();
    this.api
      .createRisk(this.orgId(), registerId ? { ...body, register_id: registerId } : body)
      .subscribe({
        next: (risk) => {
          this.saving.set(false);
          this.toasts.success('risk.quick.saved');
          this.created.emit(risk);
        },
        error: (e: unknown) => {
          this.saving.set(false);
          this.toasts.error(riskErrorKey(e));
        },
      });
  }
}
