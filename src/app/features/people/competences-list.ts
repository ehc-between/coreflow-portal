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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../shared/kit/record-list-page';
import { SavedView } from '../../shared/kit/saved-views.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { Pager } from '../../shared/ui/pager/pager';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, countKey, hasPerm } from './data/people-display';
import { CoverageChip } from '../../shared/requirement-links/coverage-chip';
import { RecordRow, RecordRowHeader } from '../../shared/ui/record-row/record-row';
import {
  COMPETENCE_CATEGORIES,
  Competence,
  CompetenceCategory,
  CompetenceQuery,
  PERM_MANAGE,
  RECORD_STATUSES,
  RecordStatus,
} from './data/people.models';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PEOPLE_NAV, PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

const PAGE_SIZE = 50;

/** The competence catalogue (`/people/competences`): search, category and status filters. */
@Component({
  selector: 'app-people-competences-list',
  imports: [
    TranslocoPipe,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    Badge,
    CoverageChip,
    RecordRow,
    RecordRowHeader,
    Button,
    Card,
    Icon,
    Pager,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      exportRegister="competences"
      titleKey="people.competences.title"
      descriptionKey="people.competences.subtitle"
      [breadcrumbs]="[root, { labelKey: 'people.competences.title' }]"
      [settingsLink]="settingsLink"
      scope="people"
      page="competences"
      searchPlaceholderKey="people.competences.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <app-module-nav nav [items]="nav" labelKey="people.sections.label" />
      <app-help-strip help scope="people" page="competences" lesson="competence-basics" />

      @if (canManage()) {
        <app-button primary (click)="newCompetence()" data-testid="new-competence">
          <app-icon name="plus" [size]="15" />
          {{ 'people.competences.new' | transloco }}
        </app-button>
      }

      <label filters class="sr-only" for="cf-comp-cat">
        {{ 'people.filters.category' | transloco }}
      </label>
      <select
        filters
        id="cf-comp-cat"
        [class]="selectClass"
        (change)="setCategory($any($event.target).value)"
        data-testid="filter-category"
      >
        <option value="" [selected]="!category()">
          {{ 'people.filters.anyCategory' | transloco }}
        </option>
        @for (c of categories; track c) {
          <option [value]="c" [selected]="category() === c">
            {{ 'people.categories.' + c | transloco }}
          </option>
        }
      </select>
      <label filters class="sr-only" for="cf-comp-status">
        {{ 'people.filters.status' | transloco }}
      </label>
      <select
        filters
        id="cf-comp-status"
        [class]="selectClass"
        (change)="setStatus($any($event.target).value)"
      >
        <option value="" [selected]="!status()">
          {{ 'people.filters.statusOptions.all' | transloco }}
        </option>
        @for (s of statuses; track s) {
          <option [value]="s" [selected]="status() === s">
            {{ 'people.recordStatus.' + s | transloco }}
          </option>
        }
      </select>

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
                {{ 'people.competences.noMatch' | transloco }}
              </p>
            } @else {
              <div role="list" data-testid="competence-rows">
                <app-record-row-header titleKey="people.fields.name" [owner]="false" />
                @for (c of rows(); track c.id) {
                  <app-record-row
                    [title]="c.name"
                    [subtitle]="subtitle(c)"
                    [link]="['/people/competences', c.id]"
                  >
                    <app-coverage-chip coverage entityType="competence" [entityId]="c.id" />
                    <ng-container ngProjectAs="[badges]">
                      @if (c.status !== 'active') {
                        <app-status-badge
                          meaning="lifecycle"
                          [value]="c.status"
                          [labelKey]="'people.recordStatus.' + c.status"
                        />
                      }
                      <app-badge tone="neutral">{{
                        'people.categories.' + c.category | transloco
                      }}</app-badge>
                    </ng-container>
                  </app-record-row>
                }
              </div>
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

      <app-why-it-matters below scope="people" page="competences" />

      <div empty class="flex flex-col gap-6">
        <app-card>
          <app-teaching-empty
            scope="people"
            page="competences"
            [showAction]="canManage()"
            (action)="newCompetence()"
          />
        </app-card>
        <app-why-it-matters scope="people" page="competences" />
      </div>
    </app-record-list-page>
  `,
})
export class CompetencesList {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly categories = COMPETENCE_CATEGORIES;
  protected readonly statuses = RECORD_STATUSES;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );

  protected readonly q = signal('');
  protected readonly category = signal<CompetenceCategory | ''>('');
  protected readonly status = signal<RecordStatus | ''>('active');
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly Competence[]>([]);
  protected readonly total = signal(0);

  protected readonly showEmpty = computed(
    () =>
      this.state() === 'ready' &&
      this.total() === 0 &&
      !this.q() &&
      !this.category() &&
      this.status() === 'active',
  );
  protected readonly viewFilters = computed<Readonly<Record<string, string>>>(() => ({
    category: this.category(),
    status: this.status(),
  }));

  protected readonly nav = PEOPLE_NAV;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;

  private lastQuery: CompetenceQuery = {};
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'competence',
      view: 'list',
      title: this.language.translate('people.competences.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query: CompetenceQuery = {
        q: this.q() || undefined,
        category: this.category() || undefined,
        status: this.status() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      untracked(() => this.load(orgId, query));
    });
  }

  protected setQuery(value: string): void {
    this.offset.set(0);
    this.q.set(value.trim());
  }

  protected setCategory(value: string): void {
    this.offset.set(0);
    this.category.set(
      (COMPETENCE_CATEGORIES as readonly string[]).includes(value)
        ? (value as CompetenceCategory)
        : '',
    );
  }

  protected setStatus(value: string): void {
    this.offset.set(0);
    this.status.set(
      (RECORD_STATUSES as readonly string[]).includes(value) ? (value as RecordStatus) : '',
    );
  }

  protected applyView(view: SavedView): void {
    this.setCategory(view.filters['category'] ?? '');
    this.setStatus(view.filters['status'] ?? 'active');
  }

  protected newCompetence(): void {
    void this.router.navigate(['/people/competences/new']);
  }

  protected subtitle(c: Competence): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      c.validity_months
        ? t(countKey('people.competences.validFor', c.validity_months), {
            months: c.validity_months,
          })
        : t('people.competences.noExpiry'),
      t(countKey('people.competences.usedBy', c.position_count), { count: c.position_count }),
      t(countKey('people.competences.heldBy', c.holder_count), { count: c.holder_count }),
    ];
    return parts.join(' · ');
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.lastQuery);
  }

  private load(orgId: string | null, query: CompetenceQuery): void {
    this.request.unsubscribe();
    this.lastQuery = query;
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listCompetences(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
