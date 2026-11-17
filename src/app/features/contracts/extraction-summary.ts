import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  ContractExtraction,
  DPA_CLAUSE_KEYS,
  ExtractedObligation,
  ExtractedRisk,
} from './data/contract.models';

/**
 * What the contract analysis found besides the register fields: suggested
 * obligations (optionally with an "Add" button), risks to review, and missing
 * processor-agreement clauses. Everything is a suggestion for a person to check.
 * On a saved contract (`canCreate`) a risk can go straight into the risk register
 * and a missing clause becomes a follow-up task, both linked to the contract.
 */
@Component({
  selector: 'app-contract-extraction-summary',
  imports: [TranslocoPipe, Button, Icon, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 text-ui" data-testid="extraction-summary">
      <p class="text-meta text-fg-muted">{{ 'contracts.extract.reviewNotice' | transloco }}</p>

      <section>
        <h3 class="mb-1.5 text-ui font-semibold text-fg">
          {{ 'contracts.extract.obligations' | transloco }}
        </h3>
        @if (obligations().length) {
          <ul class="flex flex-col gap-1.5">
            @for (o of obligations(); track $index) {
              <li class="flex flex-wrap items-center gap-2 rounded-tile bg-surface-2 px-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="font-semibold text-fg">{{ o.title }}</span>
                  @if (o.party || o.due_date || o.recurring) {
                    <span class="block text-meta text-fg-muted">
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
        <h3 class="mb-1.5 text-ui font-semibold text-fg">
          {{ 'contracts.extract.risks' | transloco }}
        </h3>
        @if (risks().length) {
          <ul class="flex flex-col gap-1.5">
            @for (r of risks(); track $index) {
              <li class="flex flex-wrap items-start gap-2 rounded-tile bg-surface-2 px-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-fg">{{ r.title }}</span>
                    @if (r.severity) {
                      <app-status-badge meaning="severity" [value]="r.severity.toLowerCase()" />
                    }
                  </span>
                  @if (r.explanation) {
                    <span class="mt-0.5 block text-meta text-fg-muted">{{ r.explanation }}</span>
                  }
                </span>
                @if (canCreate()) {
                  <app-button
                    variant="ghost"
                    size="sm"
                    (click)="createRisk.emit(r)"
                    data-testid="extraction-to-risk"
                  >
                    <app-icon name="risk" [size]="13" />
                    {{ 'contracts.extract.toRisk' | transloco }}
                  </app-button>
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
          <h3 class="mb-1.5 text-ui font-semibold text-fail">
            {{ 'contracts.extract.missingDpaClauses' | transloco }}
          </h3>
          <ul class="flex flex-col gap-1.5 text-fg">
            @for (key of missingClauses(); track key) {
              <li class="flex flex-wrap items-center gap-2 rounded-tile bg-surface-2 px-3 py-1.5">
                <span class="min-w-0 flex-1">{{ clauseKey(key) | transloco }}</span>
                @if (canCreate()) {
                  <app-button
                    variant="ghost"
                    size="sm"
                    (click)="createTask.emit(key)"
                    data-testid="extraction-to-task"
                  >
                    <app-icon name="plus" [size]="13" />
                    {{ 'contracts.extract.toTask' | transloco }}
                  </app-button>
                }
              </li>
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
  /** Offer "Add to the risk register" / "Create task" (the contract exists). */
  readonly canCreate = input(false);
  readonly createRisk = output<ExtractedRisk>();
  /** A missing Art. 28(3) clause key to follow up. */
  readonly createTask = output<string>();

  protected readonly obligations = computed(() =>
    (this.result().obligations ?? []).filter((o) => o?.title),
  );
  protected readonly risks = computed(() => (this.result().risks ?? []).filter((r) => r?.title));
  protected readonly missingClauses = computed(() => this.result().missing_dpa_clauses ?? []);

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
