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
import { LessonView } from '../../../shared/guidance/lesson';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { ContinuityApi } from '../data/continuity-api';
import { readinessTone } from '../data/continuity-display';
import {
  ICT_STATUSES,
  IctListItem,
  IctListQuery,
  IctStatus,
  READINESS_STATES,
  ReadinessState,
} from '../data/continuity.models';
import { ContinuityNav } from '../shared/continuity-nav';
import { ContinuityDuration } from '../shared/duration';

const PAGE_SIZE = 25;

export interface IctFilters {
  readonly status: IctStatus | '';
  readonly readiness: ReadinessState | '';
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[]): T | '' =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : '';

export function ictFiltersFromView(values: Readonly<Record<string, string>>): IctFilters {
  return {
    status: pick(values['status'], ICT_STATUSES),
    readiness: pick(values['readiness'], READINESS_STATES),
  };
}

export function ictQuery(q: string, f: IctFilters, offset: number): IctListQuery {
  return {
    q: q || undefined,
    status: f.status || undefined,
    readiness: f.readiness ? [f.readiness] : undefined,
    limit: PAGE_SIZE,
    offset,
  };
}

/**
 * ICT readiness (`/continuity/ict-systems`, ISO 27001 A.5.30): each ICT service with
 * its achievable RTO/RPO against what the dependent BIAs require, its last test and
 * its readiness (ready, attention, gap) with the issues found.
 */
@Component({
  selector: 'app-ict-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    ContinuityDuration,
    ContinuityNav,
    GuideIntro,
    Icon,
    LessonView,
    Pager,
    RecordListPage,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="continuity.ict.title"
      scope="continuity"
      page="ict"
      searchPlaceholderKey="continuity.ict.searchPlaceholder"
      [query]="q()"
      [filters]="viewFilters()"
      [empty]="showEmpty()"
      (search)="search($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <p class="mt-1 text-[14px] text-fg-muted">{{ 'continuity.ict.subtitle' | transloco }}</p>
        <app-continuity-nav />
      </div>

      <ng-container toolbar>
        <app-tour-button scope="continuity" tour="ict" />
        <app-button variant="ghost" size="sm" (click)="askReadiness()">
          <app-icon name="spark" [size]="14" />
          {{ 'continuity.ai.readiness' | transloco }}
        </app-button>
        @if (canWrite()) {
          <app-button size="sm" appTourStep="continuity-ict-new" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.ict.new' | transloco }}
          </app-button>
        }
      </ng-container>

      <ng-container filters>
        <div class="flex flex-wrap items-center gap-2" appTourStep="continuity-ict-filters">
          <label class="sr-only" for="ict-f-readiness">{{
            'continuity.fields.readiness' | transloco
          }}</label>
          <select
            id="ict-f-readiness"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('readiness', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().readiness">
              {{ 'continuity.filters.anyReadiness' | transloco }}
            </option>
            @for (r of readinessStates; track r) {
              <option [value]="r" [selected]="filters().readiness === r">
                {{ 'continuity.readiness.' + r | transloco }}
              </option>
            }
          </select>
          <label class="sr-only" for="ict-f-status">{{
            'continuity.fields.status' | transloco
          }}</label>
          <select
            id="ict-f-status"
            class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="setFilter('status', $any($event.target).value)"
          >
            <option value="" [selected]="!filters().status">
              {{ 'continuity.filters.anyStatus' | transloco }}
            </option>
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="filters().status === s">
                {{ 'continuity.ictStatus.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </ng-container>

      <div class="mb-4 flex flex-col gap-3">
        <app-guide-intro scope="continuity" page="ict" />
        <div><app-lesson scope="continuity" lesson="ict-readiness" /></div>
      </div>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'continuity.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'continuity.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'continuity.filters.noMatch' | transloco }}
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="ict-rows">
                @for (row of rows(); track row.id) {
                  <li class="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <div class="min-w-0 flex-1">
                      <a
                        [routerLink]="['/continuity/ict-systems', row.id]"
                        class="flex items-baseline gap-2 text-[13.5px] font-semibold text-fg hover:underline"
                      >
                        <span class="font-mono text-[12px] text-fg-muted">{{ row.code }}</span>
                        <span class="truncate">{{ row.name }}</span>
                      </a>
                      <span
                        class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-fg-subtle"
                      >
                        @if (row.provider) {
                          <span>{{ row.provider }}</span>
                        }
                        <span>
                          {{ 'continuity.ict.rtoVsRequired' | transloco }}:
                          <app-continuity-duration [minutes]="row.achievable_rto_minutes" />
                          /
                          <app-continuity-duration [minutes]="row.readiness.required_rto_minutes" />
                        </span>
                        <span>
                          {{
                            'continuity.ict.dependentBias'
                              | transloco: { count: row.readiness.dependent_bia_count }
                          }}
                        </span>
                        @if (row.last_tested_on) {
                          <span>
                            {{
                              'continuity.ict.lastTested'
                                | transloco: { date: (row.last_tested_on | localDay) }
                            }}
                          </span>
                        }
                      </span>
                    </div>
                    <span class="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
                      <app-badge [tone]="tone(row.readiness.state)">
                        {{ 'continuity.readiness.' + row.readiness.state | transloco }}
                      </app-badge>
                      @for (issue of row.readiness.issues; track issue) {
                        <span
                          class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted"
                        >
                          {{ 'continuity.readinessIssue.' + issue | transloco }}
                        </span>
                      }
                    </span>
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

      <div class="mt-6">
        <app-why-it-matters scope="continuity" page="ict" />
      </div>

      <div empty class="flex flex-col gap-4">
        <app-guide-intro scope="continuity" page="ict" />
        <app-teaching-empty
          scope="continuity"
          page="ict"
          [showAction]="canWrite()"
          (action)="create()"
        />
        <app-why-it-matters scope="continuity" page="ict" />
      </div>
    </app-record-list-page>
  `,
})
export class IctList {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);
  private readonly router = inject(Router);

  protected readonly statuses = ICT_STATUSES;
  protected readonly readinessStates = READINESS_STATES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly tone = readinessTone;

  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('continuity:write'),
  );

  protected readonly q = signal('');
  protected readonly filters = signal<IctFilters>({ status: '', readiness: '' });
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly rows = signal<readonly IctListItem[]>([]);
  protected readonly total = signal(0);

  protected readonly viewFilters = computed(
    () => ({ ...this.filters() }) as Record<string, string>,
  );
  private readonly isFiltered = computed(
    () => !!this.q() || Object.values(this.filters()).some((v) => !!v),
  );
  protected readonly showEmpty = computed(
    () => this.state() === 'ready' && this.total() === 0 && !this.isFiltered(),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_ict_system',
      view: 'list',
      title: this.language.translate('continuity.ict.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = ictQuery(this.q(), this.filters(), this.offset());
      untracked(() => this.load(orgId, query));
    });
  }

  protected search(text: string): void {
    this.offset.set(0);
    this.q.set(text.trim());
  }

  protected setFilter<K extends keyof IctFilters>(key: K, value: string): void {
    this.offset.set(0);
    this.filters.update((f) => ictFiltersFromView({ ...f, [key]: value }));
  }

  protected applyView(view: SavedView): void {
    this.offset.set(0);
    this.filters.set(ictFiltersFromView(view.filters));
  }

  protected create(): void {
    void this.router.navigate(['/continuity/ict-systems/new']);
  }

  protected askReadiness(): void {
    this.ask.showWith(this.language.translate('continuity.ai.prompts.readiness'));
  }

  private load(orgId: string | null, query: IctListQuery): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listIct(orgId, query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
