import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ClassificationResult } from '../data/ai-governance.models';
import {
  localRef,
  reasonText,
  riskExplainKey,
  riskKey,
  riskValue,
  roleKey,
} from '../data/ai-governance-display';
import { AiObligationList } from './obligation-list';

/**
 * The outcome of the classification rules: risk class, why, and the obligations
 * that follow (the org's own, plus the provider's duties when the org only
 * deploys the system). In the wizard it also says how the outcome compares with
 * the system's current class ("Nåværende: Høy risiko → Ny: Begrenset risiko").
 * Until the decisive steps have been answered (`decided` false) it says so
 * instead of showing a premature "Minimal risiko".
 */
@Component({
  selector: 'app-ai-classification-result',
  imports: [TranslocoPipe, StatusBadge, AiObligationList],
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
        @if (showChange() && r.current_risk_class && r.change && r.change !== 'new') {
          <div
            class="rounded-tile px-3 py-2 text-ui"
            [class]="r.change === 'down' ? 'bg-warn-soft text-fg' : 'bg-surface-2 text-fg'"
            data-testid="result-change"
          >
            <p class="flex flex-wrap items-center gap-1.5">
              <span class="font-semibold">{{ 'aiGovernance.result.current' | transloco }}</span>
              <app-status-badge
                meaning="severity"
                [value]="risk(r.current_risk_class)"
                [labelKey]="riskKey(r.current_risk_class)"
              />
              @if (decided()) {
                <span aria-hidden="true">→</span>
                <span class="font-semibold">{{ 'aiGovernance.result.new' | transloco }}</span>
                <app-status-badge
                  meaning="severity"
                  [value]="risk(r.risk_class)"
                  [labelKey]="riskKey(r.risk_class)"
                />
              }
            </p>
            @if (decided() && r.change === 'down') {
              <p class="mt-1 text-meta text-warn-ink">
                {{ 'aiGovernance.result.downgradeHint' | transloco }}
              </p>
            }
          </div>
        }

        @if (!decided()) {
          <p class="text-ui text-fg-muted" data-testid="result-undecided">
            {{ 'aiGovernance.result.undecided' | transloco }}
          </p>
        } @else {
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-ui font-semibold text-fg-muted">{{
              'aiGovernance.result.riskClass' | transloco
            }}</span>
            <app-status-badge
              meaning="severity"
              [value]="risk(r.risk_class)"
              [labelKey]="riskKey(r.risk_class)"
              data-testid="result-risk"
            />
            <span class="text-meta text-fg-muted">· {{ roleKey(r.role) | transloco }}</span>
            @if (r.gpai) {
              <span class="text-meta text-fg-muted"
                >·
                {{
                  (r.gpai_systemic_risk
                    ? 'aiGovernance.result.gpaiSystemic'
                    : 'aiGovernance.result.gpai'
                  ) | transloco
                }}</span
              >
            }
          </div>
          <p class="text-body text-fg">
            {{ explainKey() | transloco }}
          </p>
          @if (r.risk_class === 'prohibited') {
            <p
              class="rounded-tile bg-fail-soft px-3 py-2 text-ui font-semibold text-fail-ink"
              role="alert"
            >
              {{ 'aiGovernance.result.prohibitedWarning' | transloco }}
            </p>
          }
          @if (r.fria_required) {
            <p class="rounded-tile bg-warn-soft px-3 py-2 text-ui text-fg">
              {{ 'aiGovernance.result.friaRequired' | transloco }}
            </p>
          }
          @if (r.art6_3_exception_applied) {
            <p class="rounded-tile bg-info-soft px-3 py-2 text-ui text-fg">
              {{ 'aiGovernance.result.exceptionApplied' | transloco }}
            </p>
          }
          @if (reasons().length) {
            <div>
              <h3 class="mb-1.5 text-ui font-bold text-fg">
                {{ 'aiGovernance.result.reasons' | transloco }}
              </h3>
              <ul class="list-disc pl-5 text-ui text-fg-muted">
                @for (reason of reasons(); track $index) {
                  <li>{{ reason }}</li>
                }
              </ul>
            </div>
          }
          <div>
            <h3 class="mb-1 text-ui font-bold text-fg">
              {{
                (r.obligations.length === 1
                  ? 'aiGovernance.result.obligationsOne'
                  : 'aiGovernance.result.obligations'
                ) | transloco: { count: r.obligations.length }
              }}
            </h3>
            <app-ai-obligation-list [obligations]="r.obligations" [tracked]="false" />
          </div>
          @if (r.provider_obligations?.length) {
            <div data-testid="provider-obligations">
              <h3 class="mb-1 text-ui font-bold text-fg">
                {{ 'aiGovernance.result.providerObligations' | transloco }}
              </h3>
              <p class="mb-1 text-meta text-fg-muted">
                {{ 'aiGovernance.result.providerObligationsHint' | transloco }}
              </p>
              <app-ai-obligation-list [obligations]="r.provider_obligations!" [tracked]="false" />
            </div>
          }
        }
      </section>
    }
  `,
})
export class AiClassificationResult {
  private readonly language = inject(LanguageService);

  readonly result = input<ClassificationResult | null>(null);
  /** False until the decisive wizard steps have been visited. */
  readonly decided = input(true);
  /** Show the comparison with the system's current class (the wizard). */
  readonly showChange = input(false);
  /** The system is a built-in platform feature (CoreFlow is the provider). */
  readonly builtin = input(false);

  protected readonly risk = riskValue;
  protected readonly riskKey = riskKey;
  protected readonly roleKey = roleKey;

  protected readonly explainKey = computed(() => {
    const r = this.result();
    return r ? riskExplainKey(r.risk_class, r.role, this.builtin()) : '';
  });

  protected readonly reasons = computed(() =>
    (this.result()?.reasons ?? []).map((reason) => {
      const text = reasonText(reason);
      const item = text.itemKey ? this.language.translate(text.itemKey) : undefined;
      const ref = localRef(reason.ref, this.language.active());
      return this.language.translate(text.key, { ...text.params, ref, item });
    }),
  );
}
