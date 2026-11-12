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
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { PeopleApi } from './data/people-api';
import { FILTER_SELECT_CLASS, cellClass, cellStatusTone } from './data/people-display';
import { PeopleLookups } from './data/people-lookups';
import {
  CELL_STATUSES,
  CellStatus,
  GAP_STATUSES,
  Gap,
  GapStatus,
  Matrix,
  MatrixCell,
} from './data/people.models';
import { PeopleLessonLink, PeopleSectionNav } from './people-section-nav';

/** Short visual marker of a matrix cell (always paired with a screen-reader label). */
export const CELL_SYMBOL: Readonly<Record<CellStatus, string>> = {
  met: '✓',
  gap: '!',
  missing: '✗',
  expired: '⌛',
  not_required: '·',
};

/**
 * The competence matrix and gap analysis (`/people/matrix`): who holds which
 * competence at what level against what their position requires, filterable by
 * department and position; the gap list shows only what is missing, short or expired.
 */
@Component({
  selector: 'app-people-competence-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    AskAbout,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Badge,
    Card,
    PeopleLessonLink,
    PeopleSectionNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ 'people.matrix.title' | transloco }}
        </h1>
        <div class="flex items-center gap-2">
          <app-ask-about [prompt]="'people.ask.gaps' | transloco" />
          <app-tour-button scope="people" tour="matrix" />
        </div>
      </div>
      <div class="mt-1 mb-4 flex flex-col gap-2">
        <app-people-section-nav />
        <p class="text-[14px] text-fg-muted">{{ 'people.matrix.subtitle' | transloco }}</p>
        <app-guide-intro scope="people" page="matrix" />
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2" appTourStep="people-matrix-filters">
        <div
          class="inline-flex rounded-[10px] border border-border bg-bg p-0.5"
          role="group"
          [attr.aria-label]="'people.matrix.viewLabel' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              class="h-9 rounded-[8px] px-3 text-[13px] font-semibold"
              [class]="view() === v ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'"
              [attr.aria-pressed]="view() === v"
              (click)="view.set(v)"
              [attr.data-testid]="'view-' + v"
            >
              {{ 'people.matrix.views.' + v | transloco }}
            </button>
          }
        </div>
        <label class="sr-only" for="cf-mx-pos">{{ 'people.filters.position' | transloco }}</label>
        <select
          id="cf-mx-pos"
          [class]="selectClass"
          (change)="positionId.set($any($event.target).value)"
          data-testid="filter-position"
        >
          <option value="" [selected]="!positionId()">
            {{ 'people.filters.anyPosition' | transloco }}
          </option>
          @for (p of lookups.positions(); track p.id) {
            <option [value]="p.id" [selected]="positionId() === p.id">{{ p.title }}</option>
          }
        </select>
        @if (lookups.departments().length) {
          <label class="sr-only" for="cf-mx-dept">{{
            'people.filters.department' | transloco
          }}</label>
          <select
            id="cf-mx-dept"
            [class]="selectClass"
            (change)="departmentId.set($any($event.target).value)"
          >
            <option value="" [selected]="!departmentId()">
              {{ 'people.filters.anyDepartment' | transloco }}
            </option>
            @for (d of lookups.departments(); track d.id) {
              <option [value]="d.id" [selected]="departmentId() === d.id">{{ d.label }}</option>
            }
          </select>
        }
        @if (view() === 'matrix') {
          <label
            class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="includeFormer()"
              (change)="includeFormer.set($any($event.target).checked)"
            />
            {{ 'people.matrix.includeFormer' | transloco }}
          </label>
        } @else {
          <label class="sr-only" for="cf-gap-status">{{
            'people.filters.status' | transloco
          }}</label>
          <select
            id="cf-gap-status"
            [class]="selectClass"
            (change)="gapStatus.set($any($event.target).value)"
            data-testid="filter-gap-status"
          >
            <option value="" [selected]="!gapStatus()">
              {{ 'people.matrix.anyGap' | transloco }}
            </option>
            @for (s of gapStatuses; track s) {
              <option [value]="s" [selected]="gapStatus() === s">
                {{ 'people.cellStatus.' + s | transloco }}
              </option>
            }
          </select>
          <label
            class="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="mandatoryOnly()"
              (change)="mandatoryOnly.set($any($event.target).checked)"
              data-testid="mandatory-only"
            />
            {{ 'people.matrix.mandatoryOnly' | transloco }}
          </label>
        }
      </div>

      <app-card [padded]="view() === 'matrix' && !matrixEmpty()">
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
            @if (view() === 'matrix') {
              @if (matrixEmpty()) {
                <app-teaching-empty scope="people" page="matrix" [showAction]="false" />
              } @else if (matrix(); as m) {
                <div class="mb-3 flex flex-wrap gap-3 text-[12px] text-fg-muted" aria-hidden="true">
                  @for (s of cellStatuses; track s) {
                    <span class="inline-flex items-center gap-1">
                      <span
                        class="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[11px] font-bold"
                        [class]="cellClass(s)"
                        >{{ symbol[s] }}</span
                      >
                      {{ 'people.cellStatus.' + s | transloco }}
                    </span>
                  }
                </div>
                <div
                  class="overflow-x-auto"
                  role="region"
                  tabindex="0"
                  [attr.aria-label]="'people.matrix.title' | transloco"
                >
                  <table
                    class="border-separate border-spacing-0 text-[12.5px]"
                    data-testid="matrix"
                  >
                    <caption class="sr-only">
                      {{
                        'people.matrix.caption' | transloco
                      }}
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          class="sticky left-0 z-10 min-w-[180px] border-b border-border bg-surface py-2 pr-3 text-left font-semibold text-fg-subtle"
                        >
                          {{ 'people.matrix.employee' | transloco }}
                        </th>
                        @for (c of m.competences; track c.id) {
                          <th
                            scope="col"
                            class="h-[120px] w-10 min-w-10 border-b border-border px-1 pb-2 align-bottom font-semibold text-fg-muted"
                          >
                            <a
                              [routerLink]="['/people/competences', c.id]"
                              class="inline-block max-h-[110px] overflow-hidden text-ellipsis whitespace-nowrap [writing-mode:vertical-rl] rotate-180 hover:text-fg"
                              [title]="c.name"
                              >{{ c.name }}</a
                            >
                          </th>
                        }
                        <th
                          scope="col"
                          class="border-b border-border px-2 pb-2 align-bottom font-semibold text-fg-subtle"
                        >
                          {{ 'people.matrix.gaps' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of m.rows; track row.employee_id) {
                        <tr>
                          <th
                            scope="row"
                            class="sticky left-0 z-10 border-b border-border bg-surface py-1.5 pr-3 text-left font-normal"
                          >
                            <a
                              [routerLink]="['/people/employees', row.employee_id]"
                              class="font-semibold text-fg hover:underline"
                              >{{ row.full_name }}</a
                            >
                            @if (row.position?.name; as pos) {
                              <span class="block text-[11.5px] text-fg-subtle">{{ pos }}</span>
                            }
                          </th>
                          @for (cell of row.cells; track cell.competence_id) {
                            <td class="border-b border-border p-0.5 text-center">
                              <span
                                class="inline-flex h-7 w-8 items-center justify-center rounded-[6px] text-[12px] font-bold"
                                [class]="cellClass(cell.status)"
                                [title]="cellLabel(cell)"
                              >
                                <span aria-hidden="true">{{
                                  cell.level !== null && cell.status !== 'not_required'
                                    ? cell.level
                                    : symbol[cell.status]
                                }}</span>
                                <span class="sr-only">{{ cellLabel(cell) }}</span>
                              </span>
                            </td>
                          }
                          <td
                            class="border-b border-border px-2 text-center font-semibold"
                            [class.text-warn]="row.gap_count > 0"
                          >
                            {{ row.gap_count }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="mt-3 text-[12px] text-fg-subtle">
                  {{ 'people.matrix.cellHint' | transloco }}
                </p>
              }
            } @else {
              @if (gaps().length === 0) {
                <p class="py-10 text-center text-[14px] text-fg-muted" data-testid="no-gaps">
                  {{ 'people.matrix.noGaps' | transloco }}
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="gap-rows">
                  @for (g of gaps(); track g.employee_id + g.competence_id) {
                    <li class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <div class="min-w-0 flex-1">
                        <a
                          [routerLink]="['/people/employees', g.employee_id]"
                          [queryParams]="{ tab: 'competences' }"
                          class="text-[13.5px] font-semibold text-fg hover:underline"
                          >{{ g.employee_name }}</a
                        >
                        <p class="text-[12px] text-fg-subtle">
                          {{ g.competence_name }} ·
                          {{
                            'people.matrix.gapLevels'
                              | transloco
                                : {
                                    required: ('people.levels.' + g.required_level | transloco),
                                    held:
                                      g.level !== null
                                        ? ('people.levels.' + g.level | transloco)
                                        : ('people.matrix.none' | transloco),
                                  }
                          }}
                          @if (g.expires_on) {
                            ·
                            {{
                              'people.competences.expires'
                                | transloco: { date: (g.expires_on | localDay) }
                            }}
                          }
                          @if (g.position?.name; as pos) {
                            · {{ pos }}
                          }
                        </p>
                      </div>
                      <span class="flex items-center gap-2">
                        @if (g.mandatory) {
                          <span class="text-[11.5px] text-fg-subtle">{{
                            'people.competences.mandatory' | transloco
                          }}</span>
                        }
                        <app-badge [tone]="cellTone(g.status)">{{
                          'people.cellStatus.' + g.status | transloco
                        }}</app-badge>
                      </span>
                    </li>
                  }
                </ul>
                <p class="border-t border-border px-4 py-2.5 text-[12px] text-fg-subtle">
                  {{ 'people.matrix.gapTotal' | transloco: { count: gapTotal() } }}
                </p>
              }
            }
          }
        }
      </app-card>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="people" page="matrix" />
        <app-people-lesson-link lesson="competence-basics" />
      </div>
    </div>
  `,
})
export class CompetenceMatrix {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly lookups = inject(PeopleLookups);

  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly views = ['matrix', 'gaps'] as const;
  protected readonly cellStatuses = CELL_STATUSES;
  protected readonly gapStatuses = GAP_STATUSES;
  protected readonly symbol = CELL_SYMBOL;
  protected readonly cellClass = cellClass;
  protected readonly cellTone = cellStatusTone;

  protected readonly view = signal<'matrix' | 'gaps'>('matrix');
  protected readonly positionId = signal('');
  protected readonly departmentId = signal('');
  protected readonly includeFormer = signal(false);
  protected readonly gapStatus = signal<GapStatus | ''>('');
  protected readonly mandatoryOnly = signal(false);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly matrix = signal<Matrix | null>(null);
  protected readonly gaps = signal<readonly Gap[]>([]);
  protected readonly gapTotal = signal(0);

  protected readonly matrixEmpty = computed(() => {
    const m = this.matrix();
    return !!m && (m.rows.length === 0 || m.competences.length === 0);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'competence',
      view: 'other',
      title: this.language.translate('people.matrix.title'),
    }));
    effect(() => {
      this.selectedOrg.currentOrgId();
      untracked(() => this.lookups.ensureLoaded());
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const view = this.view();
      const filters = {
        position_id: this.positionId() || undefined,
        department_id: this.departmentId() || undefined,
      };
      const includeFormer = this.includeFormer();
      const gapStatus = this.gapStatus();
      const mandatoryOnly = this.mandatoryOnly();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.request =
          view === 'matrix'
            ? this.api.matrix(orgId, { ...filters, include_former: includeFormer }).subscribe({
                next: (m) => {
                  this.matrix.set(m);
                  this.state.set('ready');
                },
                error: () => this.state.set('error'),
              })
            : this.api
                .gaps(orgId, {
                  ...filters,
                  status: gapStatus ? [gapStatus] : undefined,
                  mandatory_only: mandatoryOnly,
                })
                .subscribe({
                  next: (page) => {
                    this.gaps.set(page.items);
                    this.gapTotal.set(page.total);
                    this.state.set('ready');
                  },
                  error: () => this.state.set('error'),
                });
      });
    });
  }

  protected cellLabel(cell: MatrixCell): string {
    const name = this.matrix()?.competences.find((c) => c.id === cell.competence_id)?.name ?? '';
    return this.language.translate('people.matrix.cellLabel', {
      competence: name,
      status: this.language.translate(`people.cellStatus.${cell.status}`),
      level:
        cell.level !== null
          ? this.language.translate(`people.levels.${cell.level}`)
          : this.language.translate('people.matrix.none'),
      required:
        cell.required_level !== null
          ? this.language.translate(`people.levels.${cell.required_level}`)
          : this.language.translate('people.matrix.notRequired'),
    });
  }
}
