import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { PrivacyApi } from './data/privacy-api';
import { DpaCoverageOut } from './data/privacy.models';

/** GDPR Art. 28(3) clause keys (labels `privacy.dpaClauses.<key>`). */
export const DPA_CLAUSE_KEYS = [
  'subject_matter_and_duration',
  'documented_instructions',
  'confidentiality',
  'security_measures',
  'sub_processors',
  'data_subject_rights',
  'compliance_assistance',
  'breach_notification',
  'deletion_or_return',
  'audits_and_information',
  'international_transfers',
] as const;

const REASONS = ['unsigned', 'clauses_missing', 'clauses_unconfirmed', 'no_dpa'];
const STATUSES = ['not_required', 'covered', 'incomplete', 'missing'];

export function dpaClauseLabelKey(key: string): string {
  return (DPA_CLAUSE_KEYS as readonly string[]).includes(key)
    ? `privacy.dpaClauses.${key}`
    : 'privacy.dpaClauses.unknown';
}

export function coverageTone(status: string): BadgeTone {
  switch (status) {
    case 'covered':
      return 'pass';
    case 'incomplete':
      return 'warn';
    case 'missing':
      return 'fail';
    default:
      return 'neutral';
  }
}

/**
 * A processor's data processing agreement coverage, from the contracts linked to it
 * (Related): covered only by a signed agreement with every Art. 28(3) clause
 * confirmed. Lists the missing clauses and each linked agreement with what is wrong.
 */
@Component({
  selector: 'app-privacy-processor-dpa-coverage',
  imports: [RouterLink, TranslocoPipe, Badge, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'privacy.dpaCoverage.title' | transloco }}
        </h2>
        @if (coverage(); as c) {
          <app-badge [tone]="tone(c.status)" data-testid="dpa-coverage-status">
            {{ 'privacy.dpaCoverage.status.' + c.status | transloco }}
          </app-badge>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[13px] text-fg-muted" role="status">
            {{ 'privacy.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="text-[13px] text-fg-muted">
            {{ 'privacy.dpaCoverage.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (coverage(); as c) {
            <p class="text-[13px] text-fg-muted">
              {{ 'privacy.dpaCoverage.explain.' + c.status | transloco }}
            </p>
            @if (c.missing_clauses.length) {
              <h3 class="mt-3 mb-1 text-[13px] font-semibold text-fail">
                {{ 'privacy.dpaCoverage.missingClauses' | transloco }}
              </h3>
              <ul
                class="list-disc space-y-0.5 pl-5 text-[13px] text-fg"
                data-testid="dpa-coverage-missing"
              >
                @for (key of c.missing_clauses; track key) {
                  <li>{{ clauseKey(key) | transloco }}</li>
                }
              </ul>
            }
            @if (c.contracts.length) {
              <ul class="mt-3 flex flex-col gap-2" data-testid="dpa-coverage-contracts">
                @for (k of c.contracts; track k.id) {
                  <li class="rounded-tile border border-border px-3 py-2 text-[13px]">
                    <div class="flex flex-wrap items-center gap-2">
                      <a
                        [routerLink]="['/contracts', k.id]"
                        class="flex-1 font-semibold text-accent hover:underline"
                      >
                        <span class="font-mono">{{ k.code }}</span> · {{ k.title }}
                      </a>
                      <app-badge [tone]="tone(k.dpa_status)">
                        {{ 'privacy.dpaCoverage.status.' + statusOf(k.dpa_status) | transloco }}
                      </app-badge>
                    </div>
                    @if (k.reasons.length) {
                      <ul class="mt-1 list-disc pl-5 text-[12.5px] text-fg-muted">
                        @for (r of k.reasons; track r) {
                          <li>
                            {{
                              'privacy.dpaCoverage.reasons.' + reasonOf(r)
                                | transloco
                                  : {
                                      missing: k.missing_clauses.length,
                                      unconfirmed: k.unconfirmed_clauses.length,
                                    }
                            }}
                          </li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ul>
            } @else if (c.status === 'missing') {
              <p class="mt-2 text-[12.5px] font-semibold text-fg">
                {{ 'privacy.dpaCoverage.linkCta' | transloco }}
              </p>
            }
          }
        }
      }
    </app-card>
  `,
})
export class ProcessorDpaCoverage {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly processorId = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly coverage = signal<DpaCoverageOut | null>(null);
  protected readonly tone = coverageTone;
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.processorId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected clauseKey(key: string): string {
    return dpaClauseLabelKey(key);
  }

  protected statusOf(status: string): string {
    return STATUSES.includes(status) ? status : 'missing';
  }

  protected reasonOf(reason: string): string {
    return REASONS.includes(reason) ? reason : 'no_dpa';
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.dpaCoverage(orgId, id).subscribe({
      next: (c) => {
        this.coverage.set(c);
        this.state.set('ready');
      },
      error: () => {
        this.coverage.set(null);
        this.state.set('error');
      },
    });
  }
}
