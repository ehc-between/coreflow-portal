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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { Pager } from '../../shared/ui/pager/pager';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, checklistStatusTone, todayIso } from './data/people-display';
import {
  CHECKLIST_KINDS,
  CHECKLIST_STATUSES,
  Checklist,
  ChecklistKind,
  ChecklistQuery,
  ChecklistStatus,
} from './data/people.models';
import { PeopleLessonLink, PeopleSectionNav } from './people-section-nav';

const PAGE_SIZE = 25;

/**
 * Onboarding and offboarding checklists across the organisation
 * (`/people/checklists`), open ones first by default, with progress and due dates.
 * Checklists are started from an employee's page.
 */
@Component({
  selector: 'app-people-checklists-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    Badge,
    Card,
    Pager,
    ProgressBar,
    PeopleLessonLink,
    PeopleSectionNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'people.checklists.title' | transloco }}
      </h1>
      <div class="mt-1 mb-4 flex flex-col gap-2">
        <app-people-section-nav />
        <p class="text-[14px] text-fg-muted">{{ 'people.checklists.subtitle' | transloco }}</p>
        <app-guide-intro scope="people" page="checklists" />
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <label class="sr-only" for="cf-cl-kind">{{ 'people.filters.kind' | transloco }}</label>
        <select
          id="cf-cl-kind"
          [class]="selectClass"
          (change)="setKind($any($event.target).value)"
          data-testid="filter-kind"
        >
          <option value="" [selected]="!kind()">{{ 'people.filters.anyKind' | transloco }}</option>
          @for (k of kinds; track k) {
            <option [value]="k" [selected]="kind() === k">
              {{ 'people.checklistKinds.' + k | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="cf-cl-status">{{ 'people.filters.status' | transloco }}</label>
        <select
          id="cf-cl-status"
          [class]="selectClass"
          (change)="setStatus($any($event.target).value)"
          data-testid="filter-status"
        >
          <option value="" [selected]="!status()">
            {{ 'people.filters.statusOptions.all' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'people.checklistStatus.' + s | transloco }}
            </option>
          }
        </select>
      </div>

      @if (showEmpty()) {
        <app-card>
          <app-teaching-empty scope="people" page="checklists" [showAction]="false" />
        </app-card>
      } @else {
        <app-card [padded]="false">
          @switch (state()) {
            @case ('loading') {
              <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
                {{ 'people.common.loading' | transloco }}
              </p>
            }
            @case ('error') {
              <p class="py-10 text-center text-[14px] text-fail" role="alert">
                {{ 'people.common.loadFailed' | transloco }}
              </p>
            }
            @default {
              @if (rows().length === 0) {
                <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-match">
                  {{ 'people.checklists.noMatch' | transloco }}
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="checklist-rows">
                  @for (c of rows(); track c.id) {
                    <li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <div class="min-w-0 flex-1">
                        <a
                          [routerLink]="['/people/checklists', c.id]"
                          class="text-[13.5px] font-semibold text-fg hover:underline"
                          >{{ c.title }}</a
                        >
                        <p class="text-[12px] text-fg-subtle">
                          <a
                            [routerLink]="['/people/employees', c.employee_id]"
                            class="hover:underline"
                            >{{ c.employee_name }} ({{ c.employee_code }})</a
                          >
                          · {{ 'people.checklistKinds.' + c.kind | transloco }}
                          @if (c.due_date) {
                            ·
                            <span
                              [class.text-fail]="isOverdue(c)"
                              [class.font-semibold]="isOverdue(c)"
                              >{{
                                'people.checklists.due'
                                  | transloco: { date: (c.due_date | localDay) }
                              }}</span
                            >
                            @if (isOverdue(c)) {
                              <span class="sr-only">{{ 'people.common.overdue' | transloco }}</span>
                            }
                          }
                        </p>
                      </div>
                      <div class="w-full sm:w-[160px]">
                        <app-progress-bar
                          [value]="c.items_total ? (c.items_done / c.items_total) * 100 : 0"
                          [label]="
                            'people.checklists.progress'
                              | transloco: { done: c.items_done, total: c.items_total }
                          "
                        />
                        <p class="mt-1 text-[11.5px] text-fg-subtle">
                          {{
                            'people.checklists.progress'
                              | transloco: { done: c.items_done, total: c.items_total }
                          }}
                        </p>
                      </div>
                      <app-badge [tone]="tone(c.status)">{{
                        'people.checklistStatus.' + c.status | transloco
                      }}</app-badge>
                    </li>
                  }
                </ul>
                <div class="border-t border-border px-4 py-2.5">
                  <app-pager
                    [offset]="offset()"
                    [pageSize]="pageSize"
                    [count]="rows().length"
                    [total]="total()"
                    (pageChange)="offset.set($event)"
                  />
                </div>
              }
            }
          }
        </app-card>
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="checklists" />
        <app-people-lesson-link lesson="joiners-and-leavers" />
      </div>
    </div>
  `,
})
export class ChecklistsList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly kinds = CHECKLIST_KINDS;
  protected readonly statuses = CHECKLIST_STATUSES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly tone = checklistStatusTone;

  protected readonly kind = signal<ChecklistKind | ''>('');
  protected readonly status = signal<ChecklistStatus | ''>('open');
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Checklist[]>([]);
  protected readonly total = signal(0);
  private readonly today = todayIso();

  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' && this.total() === 0 && !this.kind() && this.status() === 'open',
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'people_checklist',
      view: 'list',
      title: this.language.translate('people.checklists.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: ChecklistQuery = {
        kind: this.kind() || undefined,
        status: this.status() ? [this.status() as ChecklistStatus] : undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected isOverdue(c: Checklist): boolean {
    return c.status === 'open' && !!c.due_date && c.due_date < this.today;
  }

  protected setKind(value: string): void {
    this.offset.set(0);
    this.kind.set(
      (CHECKLIST_KINDS as readonly string[]).includes(value) ? (value as ChecklistKind) : '',
    );
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (CHECKLIST_STATUSES as readonly string[]).includes(value) ? (value as ChecklistStatus) : '',
    );
  }

  private load(orgId: string | null, query: ChecklistQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listChecklists(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
