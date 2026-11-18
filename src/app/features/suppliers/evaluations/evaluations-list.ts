import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { decisionBadge, evaluationStatusBadge, scoreParams } from '../data/supplier-display';
import {
  EVALUATION_KINDS,
  EVALUATION_STATUSES,
  EvaluationKind,
  EvaluationListItem,
  EvaluationListQuery,
  EvaluationStatus,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from '../detail/start-evaluation-dialog';
import { suppliersNav } from '../shared/suppliers-nav';

const PAGE_SIZE = 25;

/** The status chips: open (draft + waiting for a decision), each status, or all. */
export type StatusFilter = EvaluationStatus | 'open' | '';

/** Count of a status chip from the per-status counts (open = draft + submitted). */
export function statusChipCount(
  counts: Readonly<Partial<Record<EvaluationStatus, number>>> | undefined,
  chip: StatusFilter,
): number | null {
  if (!counts) {
    return null;
  }
  if (chip === 'open') {
    return (counts.draft ?? 0) + (counts.submitted ?? 0);
  }
  if (chip === '') {
    return Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  }
  return counts[chip] ?? 0;
}

/**
 * Every supplier evaluation in the org (`/suppliers/evaluations`). Status chips with a
 * count each (open, draft, waiting for a decision, decided, cancelled, all), so decided
 * evaluations are one click away; filters on kind, evaluator (mine) and overdue. Rows
 * show the supplier, the kind, the score against its pass mark ("64 / 100 (grense 70)"),
 * the decision and the due or decision date. New evaluations start from a supplier's
 * page. `?status=completed` (or another chip) opens on that chip.
 */
@Component({
  selector: 'app-evaluations-list',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="suppliers.evaluationsPage.title"
        descriptionKey="suppliers.evaluationsPage.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.suppliers', link: '/suppliers' },
          { labelKey: 'suppliers.evaluationsPage.title' },
        ]"
        settingsLink="/settings/modules/suppliers"
      >
        <app-button secondary variant="ghost" (click)="askPriorities()">
          <app-icon name="spark" [size]="14" />
          {{ 'suppliers.ai.evaluationPriorities' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav labelKey="modules.names.suppliers" [items]="nav()" />
      <app-help-strip scope="suppliers" page="evaluations" lesson="evaluating-suppliers" />

      <div
        class="mb-3 flex flex-wrap gap-1.5"
        role="group"
        [attr.aria-label]="'suppliers.fields.status' | transloco"
        data-testid="status-chips"
      >
        @for (chip of chips; track chip) {
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-ui font-semibold"
            [class]="
              status() === chip
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-fg-muted hover:text-fg'
            "
            [attr.aria-pressed]="status() === chip"
            [attr.data-chip]="chip || 'all'"
            (click)="setStatus(chip)"
          >
            {{ chipLabel(chip) | transloco }}
            @if (chipCount(chip); as n) {
              <span
                class="rounded-full px-1.5 text-micro"
                [class]="status() === chip ? 'bg-white/20' : 'bg-bg'"
                >{{ n }}</span
              >
            }
          </button>
        }
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label class="sr-only" for="ev-f-kind">{{
          'suppliers.evaluations.kind' | transloco
        }}</label>
        <select
          id="ev-f-kind"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setKind($any($event.target).value)"
        >
          <option value="" [selected]="!kind()">
            {{ 'suppliers.evaluationsPage.anyKind' | transloco }}
          </option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">
              {{ 'suppliers.evaluationKind.' + k | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="ev-f-mine">
          {{ 'suppliers.evaluations.evaluator' | transloco }}
        </label>
        <select
          id="ev-f-mine"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setMine($any($event.target).value === 'me')"
        >
          <option value="" [selected]="!mine()">
            {{ 'suppliers.evaluationsPage.anyone' | transloco }}
          </option>
          <option value="me" [selected]="mine()">
            {{ 'suppliers.evaluationsPage.mine' | transloco }}
          </option>
        </select>
        <label class="inline-flex h-10 items-center gap-2 px-1 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4"
            [checked]="overdue()"
            (change)="setOverdue($any($event.target).checked)"
          />
          {{ 'suppliers.evaluationsPage.overdueOnly' | transloco }}
        </label>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (items().length === 0) {
              @if (isFiltered()) {
                <app-empty-state
                  icon="search"
                  titleKey="suppliers.evaluationsPage.noneTitle"
                  [bodyKey]="
                    status() === 'open'
                      ? 'suppliers.evaluationsPage.noneOpen'
                      : 'ui.empty.noResultsBody'
                  "
                  [ctaKey]="
                    status() === 'open'
                      ? 'suppliers.evaluationsPage.showAll'
                      : 'ui.empty.clearFilters'
                  "
                  ctaVariant="secondary"
                  (cta)="clearFilters()"
                />
              } @else {
                <app-teaching-empty
                  scope="suppliers"
                  page="evaluations"
                  [showAction]="true"
                  (action)="goToRegister()"
                />
              }
            } @else {
              <div role="list" data-testid="evaluation-rows">
                <app-record-row-header
                  codeKey="suppliers.evaluationsPage.supplierColumn"
                  [dateKind]="status() === 'completed' ? 'date' : 'due'"
                />
                @for (e of items(); track e.id) {
                  <app-record-row
                    [code]="e.supplier.code"
                    [title]="e.title"
                    [subtitle]="subtitle(e)"
                    [link]="['/suppliers', e.supplier.id, 'evaluations', e.id]"
                    [owner]="e.evaluator?.name"
                    [date]="isOpen(e) ? e.due_at : e.decided_at"
                    [dateKind]="isOpen(e) ? 'due' : 'date'"
                    [overdue]="e.overdue && isOpen(e)"
                  >
                    @let b = rowBadge(e);
                    <app-status-badge
                      badges
                      [meaning]="b.meaning"
                      [value]="b.value"
                      [labelKey]="
                        e.decision
                          ? 'suppliers.decision.' + e.decision
                          : 'suppliers.evaluationStatus.' + e.status
                      "
                    />
                    <app-coverage-chip
                      coverage
                      entityType="supplier_evaluation"
                      [entityId]="e.id"
                    />
                  </app-record-row>
                }
              </div>
              @if (total() > pageSize) {
                <div class="border-t border-border px-4 py-2.5">
                  <app-pager
                    [offset]="offset()"
                    [pageSize]="pageSize"
                    [count]="items().length"
                    [total]="total()"
                    (pageChange)="offset.set($event)"
                  />
                </div>
              }
            }
          }
        }
      </app-card>

      <div class="mt-8"><app-why-it-matters scope="suppliers" page="evaluations" /></div>
    </div>
  `,
})
export class EvaluationsList {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly chips: readonly StatusFilter[] = ['open', ...EVALUATION_STATUSES, ''];
  protected readonly kinds = EVALUATION_KINDS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly decision = decisionBadge;
  protected readonly statusBadge = evaluationStatusBadge;

  /** 'open' = draft + submitted (the default work view). */
  protected readonly status = signal<StatusFilter>(this.initialStatus());
  protected readonly kind = signal<EvaluationKind | ''>('');
  protected readonly mine = signal(false);
  protected readonly overdue = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly EvaluationListItem[]>([]);
  protected readonly total = signal(0);
  private readonly counts = signal<Readonly<Partial<Record<EvaluationStatus, number>>> | undefined>(
    undefined,
  );
  protected readonly isFiltered = computed(
    () => this.status() !== '' || !!this.kind() || this.mine() || this.overdue(),
  );
  protected readonly nav = computed(() => suppliersNav(statusChipCount(this.counts(), 'open')));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'suppliers',
      entityType: 'supplier_evaluation',
      view: 'list',
      title: this.language.translate('suppliers.evaluationsPage.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = questionnaireLang(this.language.active());
      const query = this.query();
      untracked(() => this.load(orgId, query, lang));
    });
  }

  private query(): EvaluationListQuery {
    const status = this.status();
    return {
      status: status === 'open' ? ['draft', 'submitted'] : status ? [status] : undefined,
      kind: this.kind() || undefined,
      evaluator: this.mine() ? 'me' : undefined,
      overdue: this.overdue() || undefined,
      limit: PAGE_SIZE,
      offset: this.offset(),
    };
  }

  private initialStatus(): StatusFilter {
    const raw = this.route.snapshot.queryParamMap.get('status');
    if (raw === 'all') {
      return '';
    }
    return raw && (EVALUATION_STATUSES as readonly string[]).includes(raw)
      ? (raw as EvaluationStatus)
      : 'open';
  }

  protected chipLabel(chip: StatusFilter): string {
    if (chip === 'open') {
      return 'suppliers.evaluationsPage.openOnly';
    }
    return chip ? `suppliers.evaluationStatus.${chip}` : 'suppliers.evaluationsPage.all';
  }

  protected chipCount(chip: StatusFilter): number | null {
    return statusChipCount(this.counts(), chip);
  }

  /** The decision when there is one, else the status. */
  protected rowBadge(e: EvaluationListItem) {
    return e.decision ? decisionBadge(e.decision) : evaluationStatusBadge(e.status);
  }

  protected isOpen(e: EvaluationListItem): boolean {
    return e.status === 'draft' || e.status === 'submitted';
  }

  /** Supplier · kind · score against the pass mark. */
  protected subtitle(e: EvaluationListItem): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [e.supplier.name, t(`suppliers.evaluationKind.${e.kind}`)];
    const score = scoreParams(e.score, e.pass_score, this.language.locale());
    if (score) {
      parts.push(
        t(score.pass === null ? 'suppliers.score.of100' : 'suppliers.score.withPass', score),
      );
    }
    return parts.join(' · ');
  }

  protected setStatus(value: StatusFilter): void {
    this.offset.set(0);
    this.status.set(value);
  }

  protected setKind(value: EvaluationKind | ''): void {
    this.offset.set(0);
    this.kind.set(value);
  }

  protected setMine(value: boolean): void {
    this.offset.set(0);
    this.mine.set(value);
  }

  protected setOverdue(value: boolean): void {
    this.offset.set(0);
    this.overdue.set(value);
  }

  protected clearFilters(): void {
    this.offset.set(0);
    this.status.set('');
    this.kind.set('');
    this.mine.set(false);
    this.overdue.set(false);
  }

  protected goToRegister(): void {
    void this.router.navigate(['/suppliers']);
  }

  protected askPriorities(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.evaluationPriorities'));
  }

  protected reload(): void {
    this.load(
      this.selectedOrg.currentOrgId(),
      this.query(),
      questionnaireLang(this.language.active()),
    );
  }

  private load(orgId: string | null, query: EvaluationListQuery, lang: 'en' | 'nb'): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listEvaluations(orgId, query, lang).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.counts.set(page.status_counts);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
