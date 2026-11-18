import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TeachingEmpty } from '../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { gapParams, matrixParams, PeopleApi } from './data/people-api';
import {
  FILTER_SELECT_CLASS,
  cellClass,
  cellLook,
  countKey,
  downloadBlob,
  hasPerm,
} from './data/people-display';
import { PeopleLookups } from './data/people-lookups';
import {
  CELL_STATUSES,
  CellStatus,
  GAP_STATUSES,
  Gap,
  GapStatus,
  Matrix,
  MatrixCell,
  MatrixRow,
  PERM_WRITE,
} from './data/people.models';
import { AssessDialog, AssessTarget } from './ui/assess-dialog';
import { GapActionDialog, GapTarget } from './ui/gap-action-dialog';
import { GapActions } from './ui/gap-actions';
import { PeopleAsk } from './ui/people-ask';
import { PEOPLE_NAV, PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

/** Short visual marker of a matrix cell (always paired with a screen-reader label). */
export const CELL_SYMBOL: Readonly<Record<CellStatus, string>> = {
  met: '✓',
  gap: '!',
  missing: '✗',
  expired: '⌛',
  not_required: '·',
};

/**
 * The competence matrix and gaps (`/people/matrix`): who holds which competence at
 * what level against what their position requires. Columns are numbered with a
 * legend of the full names; every cell opens the assessment for that person and
 * competence. The gap view lists only what is missing, short or expired, with
 * "Lukk gapet" and the open actions. Both views export to CSV.
 */
@Component({
  selector: 'app-people-competence-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    Badge,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    AssessDialog,
    GapActionDialog,
    GapActions,
    PeopleAsk,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="people.matrix.title"
        descriptionKey="people.matrix.subtitle"
        [breadcrumbs]="[root, { labelKey: 'people.matrix.title' }]"
        [settingsLink]="settingsLink"
      >
        <ng-container ngProjectAs="[secondary]">
          <app-people-ask
            [prompt]="'people.ask.gaps' | transloco"
            [field]="'people.matrix.title' | transloco"
            labelKey="people.ask.gapsLabel"
          />
          <app-button
            variant="secondary"
            (click)="export()"
            [loading]="exporting()"
            data-testid="matrix-export"
          >
            {{ 'people.matrix.export' | transloco }}
          </app-button>
        </ng-container>
      </app-page-header>
      <app-module-nav [items]="nav" labelKey="people.sections.label" />
      <app-help-strip scope="people" page="matrix" tour="matrix" lesson="competence-basics" />

      <div class="mb-4 flex flex-wrap items-center gap-2" appTourStep="people-matrix-filters">
        <div
          class="inline-flex rounded-tile border border-border bg-bg p-0.5"
          role="group"
          [attr.aria-label]="'people.matrix.viewLabel' | transloco"
        >
          @for (v of views; track v) {
            <button
              type="button"
              class="h-9 rounded-lg px-3 text-ui font-semibold"
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
            class="inline-flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
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
            class="inline-flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
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
            <app-loading-state [rows]="5" />
          }
          @case ('error') {
            <app-error-state (retry)="reload()" />
          }
          @default {
            @if (view() === 'matrix') {
              @if (matrixEmpty()) {
                <app-teaching-empty scope="people" page="matrix" [showAction]="false" />
              } @else if (matrix(); as m) {
                <div class="mb-3 flex flex-wrap gap-3 text-meta text-fg-muted" aria-hidden="true">
                  @for (s of cellStatuses; track s) {
                    <span class="inline-flex items-center gap-1">
                      <span
                        class="inline-flex h-5 w-5 items-center justify-center rounded text-micro font-bold"
                        [class]="cellClass(s)"
                        >{{ symbol[s] }}</span
                      >
                      {{ 'people.cellStatus.' + s | transloco }}
                    </span>
                  }
                </div>
                <h2 class="sr-only">{{ 'people.matrix.legendTitle' | transloco }}</h2>
                <ol
                  class="mb-3 grid grid-cols-1 gap-x-4 gap-y-1 text-meta sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="matrix-legend"
                >
                  @for (c of m.competences; track c.id; let i = $index) {
                    <li class="flex min-w-0 items-baseline gap-1.5">
                      <span class="w-5 flex-none text-right font-mono font-bold text-fg-subtle">{{
                        i + 1
                      }}</span>
                      <a
                        [routerLink]="['/people/competences', c.id]"
                        class="min-w-0 text-fg hover:underline"
                        >{{ c.name }}</a
                      >
                    </li>
                  }
                </ol>
                <div
                  class="overflow-x-auto"
                  role="region"
                  tabindex="0"
                  [attr.aria-label]="'people.matrix.title' | transloco"
                >
                  <table class="border-separate border-spacing-0 text-meta" data-testid="matrix">
                    <caption class="sr-only">
                      {{
                        'people.matrix.caption' | transloco
                      }}
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          class="sticky left-0 z-10 min-w-[160px] border-b border-border bg-surface py-2 pr-3 text-left font-semibold text-fg-subtle"
                        >
                          {{ 'people.matrix.employee' | transloco }}
                        </th>
                        @for (c of m.competences; track c.id; let i = $index) {
                          <th
                            scope="col"
                            class="w-10 min-w-10 border-b border-border px-0.5 pb-2 text-center align-bottom font-mono font-bold text-fg-muted"
                            [title]="c.name"
                          >
                            <span aria-hidden="true">{{ i + 1 }}</span>
                            <span class="sr-only">{{ c.name }}</span>
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
                              <span class="block text-meta text-fg-subtle">{{ pos }}</span>
                            }
                          </th>
                          @for (cell of row.cells; track cell.competence_id) {
                            <td class="border-b border-border p-0.5 text-center">
                              @if (canWrite()) {
                                <button
                                  type="button"
                                  class="inline-flex h-8 w-9 items-center justify-center rounded-md text-ui font-bold hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                                  [class]="cellClass(cell.status)"
                                  [attr.aria-label]="cellAction(row, cell)"
                                  [title]="cellLabel(cell)"
                                  (click)="openCell(row, cell)"
                                  [attr.data-testid]="
                                    'cell-' + row.employee_id + '-' + cell.competence_id
                                  "
                                >
                                  <span aria-hidden="true">{{ cellText(cell) }}</span>
                                </button>
                              } @else {
                                <a
                                  [routerLink]="['/people/employees', row.employee_id]"
                                  [queryParams]="{ section: 'competences' }"
                                  class="inline-flex h-8 w-9 items-center justify-center rounded-md text-ui font-bold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                                  [class]="cellClass(cell.status)"
                                  [attr.aria-label]="row.full_name + ': ' + cellLabel(cell)"
                                  [title]="cellLabel(cell)"
                                >
                                  <span aria-hidden="true">{{ cellText(cell) }}</span>
                                </a>
                              }
                            </td>
                          }
                          <td
                            class="border-b border-border px-2 text-center font-semibold"
                            [class.text-warn-ink]="row.gap_count > 0"
                          >
                            {{ row.gap_count }}
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <p class="mt-3 text-meta text-fg-muted">
                  {{
                    (canWrite() ? 'people.matrix.cellHintEdit' : 'people.matrix.cellHint')
                      | transloco
                  }}
                </p>
              }
            } @else {
              @if (gaps().length === 0) {
                <p class="py-10 text-center text-body text-fg-muted" data-testid="no-gaps">
                  {{ 'people.matrix.noGaps' | transloco }}
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="gap-rows">
                  @for (g of gaps(); track g.employee_id + g.competence_id) {
                    <li class="px-4 py-3">
                      <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <div class="min-w-0 flex-1">
                          <a
                            [routerLink]="['/people/employees', g.employee_id]"
                            [queryParams]="{ section: 'competences' }"
                            class="text-body font-semibold text-fg hover:underline"
                            >{{ g.employee_name }}</a
                          >
                          <p class="text-meta text-fg-muted">
                            <span class="font-semibold text-fg">{{ g.competence_name }}</span>
                            ·
                            {{
                              'people.matrix.gapLevels'
                                | transloco
                                  : {
                                      required: g.required_level,
                                      held:
                                        g.level !== null
                                          ? g.level
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
                        <span class="flex flex-wrap items-center gap-2">
                          @if (g.mandatory) {
                            <app-badge tone="neutral">{{
                              'people.competences.mandatory' | transloco
                            }}</app-badge>
                          }
                          <app-status-badge
                            [meaning]="look(g.status).meaning"
                            [value]="look(g.status).value"
                            [labelKey]="'people.cellStatus.' + g.status"
                          />
                          @let course = (g.suggested_courses ?? [])[0];
                          @if (
                            canAssignTraining() && g.can_assign_training && g.user_id && course
                          ) {
                            <a
                              routerLink="/training/assignments/new"
                              [queryParams]="{ course: course.id, user: g.user_id }"
                              class="inline-flex min-h-8 items-center rounded-tile border border-border px-2.5 text-meta font-semibold text-accent hover:bg-surface-2"
                              [attr.title]="course.code + ' ' + course.title"
                              [attr.data-testid]="
                                'assign-training-' + g.employee_id + '-' + g.competence_id
                              "
                            >
                              {{
                                'people.matrix.assignTraining' | transloco: { course: course.title }
                              }}
                            </a>
                          }
                          @if (canWrite() && !(g.actions ?? []).length) {
                            <app-button
                              size="sm"
                              variant="secondary"
                              (click)="openGap(g)"
                              [attr.data-testid]="
                                'close-gap-' + g.employee_id + '-' + g.competence_id
                              "
                            >
                              {{ 'people.gapActions.open' | transloco }}
                            </app-button>
                          }
                        </span>
                      </div>
                      <app-people-gap-actions
                        [actions]="g.actions ?? []"
                        [canEdit]="canWrite()"
                        (changed)="reload()"
                      />
                    </li>
                  }
                </ul>
                <p class="border-t border-border px-4 py-2.5 text-meta text-fg-muted">
                  {{
                    countKey('people.matrix.gapTotal', gapTotal())
                      | transloco: { count: gapTotal() }
                  }}
                </p>
              }
            }
          }
        }
      </app-card>

      <div class="mt-8"><app-why-it-matters scope="people" page="matrix" /></div>
    </div>

    <app-people-assess-dialog
      [target]="assessing()"
      (saved)="onAssessed()"
      (closed)="assessing.set(null)"
    />
    <app-people-gap-action-dialog
      [target]="closingGap()"
      (created)="onGapAction()"
      (closed)="closingGap.set(null)"
    />
  `,
})
export class CompetenceMatrix {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly lookups = inject(PeopleLookups);

  protected readonly nav = PEOPLE_NAV;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly selectClass = FILTER_SELECT_CLASS;
  protected readonly views = ['matrix', 'gaps'] as const;
  protected readonly cellStatuses = CELL_STATUSES;
  protected readonly gapStatuses = GAP_STATUSES;
  protected readonly symbol = CELL_SYMBOL;
  protected readonly cellClass = cellClass;
  protected readonly look = cellLook;
  protected readonly countKey = countKey;

  /** `?view=gaps` (U24: the "Kompetansegap" tile opens the gap list). */
  private readonly viewParam = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('view') ?? undefined,
  );
  protected readonly view = linkedSignal<'matrix' | 'gaps'>(() =>
    this.viewParam() === 'gaps' ? 'gaps' : 'matrix',
  );
  protected readonly positionId = signal('');
  protected readonly departmentId = signal('');
  protected readonly includeFormer = signal(false);
  protected readonly gapStatus = signal<GapStatus | ''>('');
  protected readonly mandatoryOnly = signal(false);
  protected readonly exporting = signal(false);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly matrix = signal<Matrix | null>(null);
  protected readonly gaps = signal<readonly Gap[]>([]);
  protected readonly gapTotal = signal(0);
  protected readonly assessing = signal<AssessTarget | null>(null);
  protected readonly closingGap = signal<GapTarget | null>(null);
  private readonly bump = signal(0);

  protected readonly canWrite = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_WRITE),
  );
  /** U24: gap -> course -> "Tildel opplæring" needs the training assign permission. */
  protected readonly canAssignTraining = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, 'training:assign'),
  );

  protected readonly matrixEmpty = computed(() => {
    const m = this.matrix();
    return !!m && (m.rows.length === 0 || m.competences.length === 0);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'people',
      entityType: 'competence_gap',
      view: 'other',
      title: this.language.translate('people.matrix.title'),
      requirements: ['hs:7.2'],
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
      this.bump();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId) {
          return;
        }
        if (this.state() !== 'ready') {
          this.state.set('loading');
        }
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

  protected reload(): void {
    this.bump.update((n) => n + 1);
  }

  protected cellText(cell: MatrixCell): string {
    return cell.level !== null && cell.status !== 'not_required'
      ? `${cell.level}`
      : CELL_SYMBOL[cell.status];
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

  protected cellAction(row: MatrixRow, cell: MatrixCell): string {
    return this.language.translate('people.matrix.cellAction', {
      name: row.full_name,
      label: this.cellLabel(cell),
    });
  }

  protected openCell(row: MatrixRow, cell: MatrixCell): void {
    this.assessing.set({
      employeeId: row.employee_id,
      employeeName: row.full_name,
      row: null,
      competenceId: cell.competence_id,
      requiredLevel: cell.required_level,
    });
  }

  protected openGap(g: Gap): void {
    this.closingGap.set({
      employeeId: g.employee_id,
      employeeName: g.employee_name,
      competenceId: g.competence_id,
      competenceName: g.competence_name,
      // The gap list does not say; the backend refuses training without an account.
      hasUser: true,
    });
  }

  protected onAssessed(): void {
    this.assessing.set(null);
    this.reload();
  }

  protected onGapAction(): void {
    this.closingGap.set(null);
    this.reload();
  }

  protected export(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    const filters = {
      position_id: this.positionId() || undefined,
      department_id: this.departmentId() || undefined,
    };
    const kind = this.view() === 'matrix' ? 'matrix' : 'gaps';
    const params =
      kind === 'matrix'
        ? matrixParams({ ...filters, include_former: this.includeFormer() })
        : gapParams({
            ...filters,
            status: this.gapStatus() ? [this.gapStatus() as GapStatus] : undefined,
            mandatory_only: this.mandatoryOnly(),
          });
    this.exporting.set(true);
    this.api.exportCsv(orgId, kind, params).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        downloadBlob(blob, kind === 'matrix' ? 'competence-matrix.csv' : 'competence-gaps.csv');
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('people.errors.exportFailed');
      },
    });
  }
}
