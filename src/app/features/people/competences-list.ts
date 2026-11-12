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
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
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
import { FILTER_SELECT_CLASS, hasPerm, recordStatusTone } from './data/people-display';
import {
  COMPETENCE_CATEGORIES,
  Competence,
  CompetenceCategory,
  CompetenceQuery,
  PERM_MANAGE,
  RECORD_STATUSES,
  RecordStatus,
} from './data/people.models';
import { PeopleLessonLink, PeopleSectionNav } from './people-section-nav';

const PAGE_SIZE = 50;

/** The competence catalogue (`/people/competences`): search, category and status filters. */
@Component({
  selector: 'app-people-competences-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    TeachingEmpty,
    WhyItMatters,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    PeopleLessonLink,
    PeopleSectionNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="people.competences.title"
      scope="people"
      page="competences"
      searchPlaceholderKey="people.competences.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="setQuery($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-1 flex flex-col gap-2">
        <app-people-section-nav />
        <p class="text-[14px] text-fg-muted">{{ 'people.competences.subtitle' | transloco }}</p>
        <app-guide-intro scope="people" page="competences" />
      </div>

      @if (canManage()) {
        <app-button toolbar size="sm" (click)="newCompetence()" data-testid="new-competence">
          <app-icon name="plus" [size]="14" />
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
                {{ 'people.competences.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="competence-rows">
                @for (c of rows(); track c.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/people/competences', c.id]"
                        class="text-[13.5px] font-semibold text-fg hover:underline"
                        >{{ c.name }}</a
                      >
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        <span>{{ 'people.categories.' + c.category | transloco }}</span>
                        @if (c.validity_months) {
                          <span>{{
                            'people.competences.validFor' | transloco: { months: c.validity_months }
                          }}</span>
                        }
                        <span>{{
                          'people.competences.usedBy' | transloco: { count: c.position_count }
                        }}</span>
                        <span>{{
                          'people.competences.heldBy' | transloco: { count: c.holder_count }
                        }}</span>
                      </span>
                    </div>
                    <app-badge [tone]="statusTone(c.status)">{{
                      'people.recordStatus.' + c.status | transloco
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

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="competences" />
        <app-people-lesson-link lesson="competence-basics" />
      </div>

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
        <app-people-lesson-link lesson="competence-basics" />
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
  protected readonly statusTone = recordStatusTone;

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

  private load(orgId: string | null, query: CompetenceQuery): void {
    this.request.unsubscribe();
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
