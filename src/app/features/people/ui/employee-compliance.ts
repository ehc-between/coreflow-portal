import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { PeopleApi } from '../data/people-api';
import { complianceLook } from '../data/people-display';
import { ComplianceItem, Employee, EmployeeCompliance } from '../data/people.models';
import { PeopleClause } from './clause-label';
import { PeopleAsk } from './people-ask';

/** Where a control is put in order: the form, a section of the page, or the checklist. */
export type ComplianceFix = 'edit' | 'competences' | 'awareness' | 'offboarding';

const FIX: Readonly<Record<string, ComplianceFix>> = {
  confidentiality: 'edit',
  security_terms: 'edit',
  screening: 'edit',
  post_employment: 'edit',
  competence: 'competences',
  awareness: 'awareness',
  access_revoked: 'offboarding',
  equipment_returned: 'offboarding',
};

/** The one line under a control: when it was done, what is due, or what is missing. */
export interface ComplianceDetailText {
  readonly key: string;
  readonly params: { readonly count?: number; readonly date?: string; readonly recheck?: string };
}

export function complianceDetail(item: ComplianceItem): ComplianceDetailText {
  const base = `people.compliance.detail.${item.status}`;
  if (item.key === 'competence') {
    if (item.status === 'ok' && item.expiring) {
      return {
        key: 'people.compliance.detail.competenceExpiring',
        params: { count: item.expiring },
      };
    }
    if (item.status !== 'ok' && item.status !== 'not_required') {
      return { key: 'people.compliance.detail.competenceGaps', params: { count: item.gaps ?? 0 } };
    }
  }
  if (item.key === 'equipment_returned' && item.outstanding) {
    return {
      key: 'people.compliance.detail.assetsOutstanding',
      params: { count: item.outstanding },
    };
  }
  if (item.status === 'due' && item.recheck_on) {
    return { key: 'people.compliance.detail.recheckDue', params: { date: item.recheck_on } };
  }
  if (item.status === 'ok' && item.recheck_on) {
    return {
      key: 'people.compliance.detail.okUntil',
      params: { date: item.done_on ?? '', recheck: item.recheck_on },
    };
  }
  return { key: base, params: { date: item.done_on ?? '' } };
}

/**
 * "Krav for denne personen": each people control (confidentiality A.6.6, security
 * terms A.6.2, background check A.6.1, competence 7.2, awareness 7.3/A.6.3 and, for
 * leavers, post-employment duties, access and equipment) with its status, the date
 * it was done and the requirement it documents — so the record says plainly what
 * an auditor would check and what is still missing.
 */
@Component({
  selector: 'app-people-employee-compliance',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    ErrorState,
    LoadingState,
    StatusBadge,
    PeopleClause,
    PeopleAsk,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-compliance-h" id="compliance">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-compliance-h" class="text-card font-bold text-fg">
          {{ 'people.compliance.title' | transloco }}
        </h2>
        <span class="flex items-center gap-2">
          @if (data(); as d) {
            <span
              class="text-meta font-semibold"
              [class.text-warn-ink]="d.open > 0"
              [class.text-pass]="d.open === 0"
              data-testid="compliance-open"
            >
              {{ openKey(d.open) | transloco: { count: d.open } }}
            </span>
          }
          <app-people-ask
            [prompt]="'people.ask.securityTerms' | transloco"
            [field]="'people.compliance.title' | transloco"
          />
        </span>
      </div>
      <p class="mb-3 text-meta text-fg-muted">{{ 'people.compliance.subtitle' | transloco }}</p>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          <ul class="divide-y divide-border" data-testid="compliance-items">
            @for (item of data()?.items ?? []; track item.key) {
              <li class="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                <div class="min-w-0 flex-1">
                  <p class="flex flex-wrap items-center gap-2">
                    <span class="text-body font-semibold text-fg">{{
                      'people.compliance.keys.' + item.key | transloco
                    }}</span>
                    <app-status-badge
                      [meaning]="look(item.status).meaning"
                      [value]="look(item.status).value"
                      [labelKey]="'people.compliance.status.' + item.status"
                      [attr.data-testid]="'compliance-' + item.key"
                    />
                  </p>
                  <p class="text-meta text-fg-muted">
                    @let d = detail(item);
                    {{
                      d.key
                        | transloco
                          : {
                              count: d.params.count,
                              date: d.params.date ? (d.params.date | localDay) : '',
                              recheck: d.params.recheck ? (d.params.recheck | localDay) : '',
                            }
                    }}
                  </p>
                  @if (
                    item.key === 'screening' && (scope().length || employee().screening_legal_basis)
                  ) {
                    <p class="text-meta text-fg-subtle" data-testid="screening-scope">
                      @if (scope().length) {
                        {{ 'people.fields.screeningScope' | transloco }}: {{ scopeText() }}
                      }
                      @if (employee().screening_legal_basis; as basis) {
                        · {{ 'people.fields.screeningLegalBasis' | transloco }}: {{ basis }}
                      }
                    </p>
                  }
                  <p class="mt-0.5 flex flex-wrap gap-x-3 text-meta text-fg-subtle">
                    @for (ref of item.clause_refs; track ref) {
                      <app-people-clause [ref]="ref" />
                    }
                  </p>
                </div>
                @if (canEdit() && item.status !== 'ok' && item.status !== 'not_required') {
                  <button
                    type="button"
                    class="self-start text-meta font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    (click)="fix.emit(fixFor(item))"
                    [attr.data-testid]="'compliance-fix-' + item.key"
                  >
                    {{ 'people.compliance.fix.' + fixFor(item) | transloco }}
                  </button>
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class EmployeeComplianceCard {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly employee = input.required<Employee>();
  readonly canEdit = input(false);
  /** Bumped by the page after changes elsewhere on it. */
  readonly refresh = input(0);
  readonly fix = output<ComplianceFix>();
  /** The loaded controls (the page passes the documented clauses to the assistant). */
  readonly loaded = output<EmployeeCompliance>();

  protected readonly look = complianceLook;
  protected readonly detail = complianceDetail;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EmployeeCompliance | null>(null);

  protected readonly scope = computed(() => this.employee().screening_scope ?? []);
  protected readonly scopeText = computed(() =>
    this.scope()
      .map((s) => this.language.translate(`people.screeningScopes.${s}`))
      .join(', '),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const e = this.employee();
      this.refresh();
      untracked(() => this.load(orgId, e.id));
    });
  }

  protected openKey(open: number): string {
    if (open === 0) {
      return 'people.compliance.allInOrder';
    }
    return open === 1 ? 'people.compliance.openOne' : 'people.compliance.open';
  }

  protected fixFor(item: ComplianceItem): ComplianceFix {
    return FIX[item.key] ?? 'edit';
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employee().id);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.data()) {
      this.state.set('loading');
    }
    this.request = this.api.compliance(orgId, id).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
        this.loaded.emit(data);
      },
      error: () => this.state.set('error'),
    });
  }
}
