import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { ClassificationResult } from '../data/ai-governance.models';
import { reasonText, riskKey, riskTone, roleKey } from '../data/ai-governance-display';
import { AiObligationList } from './obligation-list';

/** The outcome of the classification rules: risk class, why, and the obligations that follow. */
@Component({
  selector: 'app-ai-classification-result',
  imports: [TranslocoPipe, Badge, AiObligationList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (result(); as r) {
      <section
        class="flex flex-col gap-4"
        aria-live="polite"
        [attr.aria-label]="'aiGovernance.result.label' | transloco"
        data-testid="classification-result"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[13px] font-semibold text-fg-muted">{{
            'aiGovernance.result.riskClass' | transloco
          }}</span>
          <app-badge [tone]="tone(r.risk_class)" data-testid="result-risk">{{
            riskKey(r.risk_class) | transloco
          }}</app-badge>
          <app-badge tone="neutral">{{ roleKey(r.role) | transloco }}</app-badge>
          @if (r.gpai) {
            <app-badge tone="accent">{{
              (r.gpai_systemic_risk
                ? 'aiGovernance.result.gpaiSystemic'
                : 'aiGovernance.result.gpai'
              ) | transloco
            }}</app-badge>
          }
        </div>
        <p class="text-[13.5px] text-fg">
          {{ 'aiGovernance.riskExplain.' + r.risk_class | transloco }}
        </p>
        @if (r.risk_class === 'prohibited') {
          <p
            class="rounded-tile bg-fail-soft px-3 py-2 text-[13px] font-semibold text-fail"
            role="alert"
          >
            {{ 'aiGovernance.result.prohibitedWarning' | transloco }}
          </p>
        }
        @if (r.fria_required) {
          <p class="rounded-tile bg-warn-soft px-3 py-2 text-[13px] text-fg">
            {{ 'aiGovernance.result.friaRequired' | transloco }}
          </p>
        }
        @if (r.art6_3_exception_applied) {
          <p class="rounded-tile bg-info-soft px-3 py-2 text-[13px] text-fg">
            {{ 'aiGovernance.result.exceptionApplied' | transloco }}
          </p>
        }
        @if (reasons().length) {
          <div>
            <h3 class="mb-1.5 text-[13px] font-bold text-fg">
              {{ 'aiGovernance.result.reasons' | transloco }}
            </h3>
            <ul class="list-disc pl-5 text-[13px] text-fg-muted">
              @for (reason of reasons(); track $index) {
                <li>{{ reason }}</li>
              }
            </ul>
          </div>
        }
        <div>
          <h3 class="mb-1 text-[13px] font-bold text-fg">
            {{ 'aiGovernance.result.obligations' | transloco: { count: r.obligations.length } }}
          </h3>
          <app-ai-obligation-list [obligations]="r.obligations" [showTasks]="showTasks()" />
        </div>
      </section>
    }
  `,
})
export class AiClassificationResult {
  private readonly language = inject(LanguageService);

  readonly result = input<ClassificationResult | null>(null);
  readonly showTasks = input(false);

  protected readonly tone = riskTone;
  protected readonly riskKey = riskKey;
  protected readonly roleKey = roleKey;

  protected readonly reasons = computed(() =>
    (this.result()?.reasons ?? []).map((reason) => {
      const text = reasonText(reason);
      const item = text.itemKey ? this.language.translate(text.itemKey) : undefined;
      return this.language.translate(text.key, { ...text.params, item });
    }),
  );
}
