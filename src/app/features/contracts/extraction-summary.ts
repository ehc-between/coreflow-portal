import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractExtraction, DPA_CLAUSE_KEYS, ExtractedObligation } from './data/contract.models';

function severityTone(severity: string | null | undefined): BadgeTone {
  switch ((severity ?? '').toLowerCase()) {
    case 'high':
    case 'critical':
      return 'fail';
    case 'medium':
      return 'warn';
    default:
      return 'neutral';
  }
}

/**
 * What the contract analysis found besides the register fields: suggested
 * obligations (optionally with an "Add" button), risks to review, and missing
 * processor-agreement clauses. Everything is a suggestion for a person to check.
 */
@Component({
  selector: 'app-contract-extraction-summary',
  imports: [TranslocoPipe, Badge, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 text-[13px]" data-testid="extraction-summary">
      <p class="text-[12.5px] text-fg-muted">{{ 'contracts.extract.reviewNotice' | transloco }}</p>

      <section>
        <h3 class="mb-1.5 text-[13px] font-semibold text-fg">
          {{ 'contracts.extract.obligations' | transloco }}
        </h3>
        @if (obligations().length) {
          <ul class="flex flex-col gap-1.5">
            @for (o of obligations(); track $index) {
              <li class="flex flex-wrap items-center gap-2 rounded-tile bg-surface-2 px-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="font-semibold text-fg">{{ o.title }}</span>
                  @if (o.party || o.due_date || o.recurring) {
                    <span class="block text-[12px] text-fg-muted">
                      @if (o.party) {
                        {{ 'contracts.extract.party' | transloco: { party: o.party } }}
                      }
                      @if (o.due_date) {
                        · {{ 'contracts.extract.due' | transloco: { date: o.due_date } }}
                      }
                      @if (o.recurring) {
                        · {{ 'contracts.extract.recurring' | transloco: { rule: o.recurring } }}
                      }
                    </span>
                  }
                </span>
                @if (canAddObligations()) {
                  <app-button variant="ghost" size="sm" (click)="addObligation.emit(o)">
                    <app-icon name="plus" [size]="13" />
                    {{ 'contracts.extract.addObligation' | transloco }}
                  </app-button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="text-fg-muted">{{ 'contracts.extract.noObligations' | transloco }}</p>
        }
      </section>

      <section>
        <h3 class="mb-1.5 text-[13px] font-semibold text-fg">
          {{ 'contracts.extract.risks' | transloco }}
        </h3>
        @if (risks().length) {
          <ul class="flex flex-col gap-1.5">
            @for (r of risks(); track $index) {
              <li class="rounded-tile bg-surface-2 px-3 py-2">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="font-semibold text-fg">{{ r.title }}</span>
                  @if (r.severity) {
                    <app-badge [tone]="tone(r.severity)">{{ r.severity }}</app-badge>
                  }
                </span>
                @if (r.explanation) {
                  <span class="mt-0.5 block text-[12.5px] text-fg-muted">{{ r.explanation }}</span>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="text-fg-muted">{{ 'contracts.extract.noRisks' | transloco }}</p>
        }
      </section>

      @if (missingClauses().length) {
        <section>
          <h3 class="mb-1.5 text-[13px] font-semibold text-fail">
            {{ 'contracts.extract.missingDpaClauses' | transloco }}
          </h3>
          <ul class="list-disc space-y-0.5 pl-5 text-fg">
            @for (key of missingClauses(); track key) {
              <li>{{ clauseKey(key) | transloco }}</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class ExtractionSummary {
  readonly result = input.required<ContractExtraction>();
  readonly canAddObligations = input(false);
  readonly addObligation = output<ExtractedObligation>();

  protected readonly obligations = computed(() =>
    (this.result().obligations ?? []).filter((o) => o?.title),
  );
  protected readonly risks = computed(() => (this.result().risks ?? []).filter((r) => r?.title));
  protected readonly missingClauses = computed(() => this.result().missing_dpa_clauses ?? []);
  protected readonly tone = severityTone;

  protected clauseKey(key: string): string {
    return dpaClauseKey(key);
  }
}

/** i18n key of a DPA clause key (unknown keys fall back to a generic label). */
export function dpaClauseKey(key: string): string {
  return (DPA_CLAUSE_KEYS as readonly string[]).includes(key)
    ? `contracts.dpaClauses.${key}`
    : 'contracts.dpaClauses.unknown';
}
