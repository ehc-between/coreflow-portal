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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Pager } from '../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, todayIso } from './data/people-display';
import {
  CHECKLIST_KINDS,
  CHECKLIST_STATUSES,
  Checklist,
  ChecklistKind,
  ChecklistQuery,
  ChecklistStatus,
} from './data/people.models';
import { PEOPLE_NAV, PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

const PAGE_SIZE = 25;

/**
 * Joiner and leaver checklists across the organisation (`/people/checklists`, "Oppstart
 * og avslutning"), open ones first, with the person, progress and due date. They are
 * started from the person's page; the default items are edited under settings.
 */
@Component({
  selector: 'app-people-checklists-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    CoverageChip,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="people.checklists.title"
        descriptionKey="people.checklists.subtitle"
        [breadcrumbs]="[root, { labelKey: 'people.checklists.title' }]"
        [settingsLink]="settingsLink"
      />
      <app-module-nav [items]="nav" labelKey="people.sections.label" />
      <app-help-strip scope="people" page="checklists" lesson="joiners-and-leavers" />

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
              <app-loading-state [rows]="5" />
            }
            @case ('error') {
              <app-error-state (retry)="reload()" />
            }
            @default {
              @if (rows().length === 0) {
                <p class="px-4 py-10 text-center text-body text-fg-muted" data-testid="no-match">
                  {{ 'people.checklists.noMatch' | transloco }}
                </p>
              } @else {
                <div role="list" data-testid="checklist-rows">
                  <app-record-row-header titleKey="people.fields.checklistTitle" dateKind="due" />
                  @for (c of rows(); track c.id) {
                    <app-record-row
                      [title]="c.title"
                      [subtitle]="subtitle(c)"
                      [link]="['/people/checklists', c.id]"
                      [owner]="c.owner?.name"
                      [date]="c.due_date"
                      dateKind="due"
                      [overdue]="isOverdue(c)"
                    >
                      <app-coverage-chip coverage entityType="people_checklist" [entityId]="c.id" />
                      <ng-container ngProjectAs="[badges]">
                        <app-status-badge
                          meaning="lifecycle"
                          [value]="c.status"
                          [labelKey]="'people.checklistStatus.' + c.status"
                        />
                        <app-status-badge
                          meaning="progress"
                          [value]="progress(c)"
                          labelKey="people.checklists.progress"
                          [labelParams]="{ done: c.items_done, total: c.items_total }"
                        />
                      </ng-container>
                    </app-record-row>
                  }
                </div>
                <div class="border-t border-border px-4 pb-3" [class.hidden]="total() <= pageSize">
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

      <div class="mt-8"><app-why-it-matters scope="people" page="checklists" /></div>
    </div>
  `,
})
export class ChecklistsList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  protected readonly nav = PEOPLE_NAV;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly kinds = CHECKLIST_KINDS;
  protected readonly statuses = CHECKLIST_STATUSES;
  protected readonly pageSize = PAGE_SIZE;

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

  private lastQuery: ChecklistQuery = {};
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

  protected subtitle(c: Checklist): string {
    return `${c.employee_name} · ${this.language.translate(`people.checklistKinds.${c.kind}`)}`;
  }

  protected progress(c: Checklist): string {
    return `${c.items_total ? Math.round((c.items_done / c.items_total) * 100) : 0}`;
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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.lastQuery);
  }

  private load(orgId: string | null, query: ChecklistQuery): void {
    this.request.unsubscribe();
    this.lastQuery = query;
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
