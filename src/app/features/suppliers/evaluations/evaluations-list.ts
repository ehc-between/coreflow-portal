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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { decisionTone, evaluationStatusTone } from '../data/supplier-display';
import {
  EVALUATION_KINDS,
  EVALUATION_STATUSES,
  EvaluationKind,
  EvaluationListItem,
  EvaluationListQuery,
  EvaluationStatus,
} from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { SuppliersNav } from '../shared/suppliers-nav';

const PAGE_SIZE = 25;

/**
 * Every supplier evaluation in the org (`/suppliers/evaluations`): filter by status,
 * kind, evaluator (mine) and overdue; each links to the evaluation and its supplier.
 * New evaluations are started from a supplier's page.
 */
@Component({
  selector: 'app-evaluations-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    GuideIntro,
    Icon,
    Pager,
    SuppliersNav,
    TeachingEmpty,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'suppliers.evaluationsPage.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'suppliers.evaluationsPage.subtitle' | transloco }}
          </p>
          <app-suppliers-nav />
        </div>
        <app-button variant="ghost" size="sm" (click)="askPriorities()">
          <app-icon name="spark" [size]="14" />
          {{ 'suppliers.ai.evaluationPriorities' | transloco }}
        </app-button>
      </header>

      <div class="mb-4"><app-guide-intro scope="suppliers" page="evaluations" /></div>

      <div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'suppliers.fields.status' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setStatus($any($event.target).value)"
          >
            <option value="open" [selected]="status() === 'open'">
              {{ 'suppliers.evaluationsPage.openOnly' | transloco }}
            </option>
            <option value="" [selected]="status() === ''">
              {{ 'suppliers.filters.anyStatus' | transloco }}
            </option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="status() === s">
                {{ 'suppliers.evaluationStatus.' + s | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'suppliers.evaluations.kind' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
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
        </label>
        <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
          {{ 'suppliers.evaluations.evaluator' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setMine($any($event.target).value === 'me')"
          >
            <option value="" [selected]="!mine()">
              {{ 'suppliers.evaluationsPage.anyone' | transloco }}
            </option>
            <option value="me" [selected]="mine()">
              {{ 'suppliers.evaluationsPage.mine' | transloco }}
            </option>
          </select>
        </label>
        <label class="flex items-center gap-2 self-end pb-2 text-[13px] text-fg">
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
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'suppliers.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'suppliers.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (items().length === 0) {
              @if (isFiltered()) {
                <p class="py-10 text-center text-[14px] text-fg-muted">
                  {{ 'suppliers.filters.noMatch' | transloco }}
                </p>
              } @else {
                <app-teaching-empty
                  scope="suppliers"
                  page="evaluations"
                  [showAction]="true"
                  (action)="goToRegister()"
                />
              }
            } @else {
              <ul class="divide-y divide-border">
                @for (e of items(); track e.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/suppliers', e.supplier.id, 'evaluations', e.id]"
                        class="block truncate text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        {{ e.title }}
                      </a>
                      <span class="flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                        <a [routerLink]="['/suppliers', e.supplier.id]" class="hover:underline">
                          <span class="font-mono">{{ e.supplier.code }}</span> {{ e.supplier.name }}
                        </a>
                        <span>{{ 'suppliers.evaluationKind.' + e.kind | transloco }}</span>
                        @if (e.evaluator?.name; as name) {
                          <span>{{ name }}</span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (e.score !== null) {
                        <span>{{
                          'suppliers.list.score'
                            | transloco: { score: (e.score | localNumber: '1.0-1') }
                        }}</span>
                      }
                      @if (e.decision) {
                        <app-badge [tone]="decisionTone(e.decision)">
                          {{ 'suppliers.decision.' + e.decision | transloco }}
                        </app-badge>
                      } @else {
                        <app-badge [tone]="statusTone(e.status)">
                          {{ 'suppliers.evaluationStatus.' + e.status | transloco }}
                        </app-badge>
                      }
                      <span
                        class="inline-flex w-[110px] items-center justify-end gap-1"
                        [class.text-fail]="e.overdue"
                        [class.font-semibold]="e.overdue"
                      >
                        @if (e.overdue) {
                          <app-icon name="alert" [size]="13" />
                          <span class="sr-only">{{ 'suppliers.common.overdue' | transloco }}</span>
                        }
                        {{ e.due_at ? (e.due_at | localDay) : '–' }}
                      </span>
                    </span>
                  </li>
                }
              </ul>
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
      </app-card>

      <div class="mt-6"><app-why-it-matters scope="suppliers" page="evaluations" /></div>
    </div>
  `,
})
export class EvaluationsList {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statuses = EVALUATION_STATUSES;
  protected readonly kinds = EVALUATION_KINDS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusTone = evaluationStatusTone;
  protected readonly decisionTone = decisionTone;

  /** 'open' = draft + submitted (the default work view). */
  protected readonly status = signal<EvaluationStatus | 'open' | ''>('open');
  protected readonly kind = signal<EvaluationKind | ''>('');
  protected readonly mine = signal(false);
  protected readonly overdue = signal(false);
  protected readonly offset = signal(0);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly EvaluationListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly isFiltered = computed(
    () => this.status() !== 'open' || !!this.kind() || this.mine() || this.overdue(),
  );

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
      const status = this.status();
      const query: EvaluationListQuery = {
        status: status === 'open' ? ['draft', 'submitted'] : status ? [status] : undefined,
        kind: this.kind() || undefined,
        evaluator: this.mine() ? 'me' : undefined,
        overdue: this.overdue() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected setStatus(value: EvaluationStatus | 'open' | ''): void {
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

  protected goToRegister(): void {
    void this.router.navigate(['/suppliers']);
  }

  protected askPriorities(): void {
    this.ask.showWith(this.language.translate('suppliers.ai.prompts.evaluationPriorities'));
  }

  private load(orgId: string | null, query: EvaluationListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listEvaluations(orgId, query).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
