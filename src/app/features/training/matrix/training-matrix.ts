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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { toneFor } from '../../../shared/ui/tones';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  cellBadge,
  exportFileName,
  saveBlob,
} from '../data/training-display';
import {
  CELL_STATUSES,
  COURSE_CATEGORIES,
  CourseCategory,
  Matrix,
  MatrixCell,
  MatrixQuery,
  MatrixUser,
} from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { PrintChrome } from '../shared/print-chrome';
import { TrainingPeople } from '../shared/people';

/** Index cells by `<user>:<course>`. */
export function indexCells(cells: readonly MatrixCell[]): ReadonlyMap<string, MatrixCell> {
  return new Map(cells.map((c) => [`${c.user_id}:${c.course_id}`, c]));
}

/** Symbol per cell status; the cell always shows its word too, so colour is never the only signal. */
export const CELL_SYMBOL: Readonly<Record<string, string>> = {
  compliant: '✓',
  expiring: '!',
  expired: '×',
  overdue: '!',
  assigned: '•',
  missing: '–',
};

/** "Drift · Lagerarbeider" under a person's name in the matrix. */
export function personSubtitle(u: MatrixUser): string {
  return [u.department, u.position].filter((v) => !!v).join(' · ');
}

const TONE_CELL: Readonly<Record<string, string>> = {
  pass: 'bg-pass-soft text-pass-ink',
  warn: 'bg-warn-soft text-warn-ink',
  fail: 'bg-fail-soft text-fail-ink',
  info: 'bg-info-soft text-info-ink',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-surface-2 text-fg-muted',
};

/**
 * `/training/matrix` ("Kompetansematrise", for people who oversee training): who
 * has the required training in place, people × courses. Filter by category,
 * department or job position (People); each course shows its own percentage;
 * cells open the record or assignment behind them; names open the person's
 * training profile. Export as CSV or print with the legend.
 */
@Component({
  selector: 'app-training-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    PrintChrome,
    ProgressBar,
    TourStepDirective,
    WhyItMatters,
    FilterSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-print-chrome />
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="training.matrix.title"
        descriptionKey="training.matrix.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.matrix.title' },
        ]"
      >
        <app-button secondary variant="secondary" (click)="print()">
          {{ 'training.matrix.print' | transloco }}
        </app-button>
        <app-button secondary variant="secondary" [loading]="exporting()" (click)="exportCsv()">
          {{ 'training.export.csv' | transloco }}
        </app-button>
      </app-page-header>
      <app-module-nav [items]="access.navItems()" labelKey="training.nav.label" />
      <app-help-strip scope="training" page="matrix" tour="matrix" />
      @if (showCompetence()) {
        <!-- U35: the one competence matrix lives under People. -->
        <p class="mb-3 text-meta print:hidden">
          <a
            routerLink="/people/matrix"
            class="font-semibold text-accent hover:underline"
            data-testid="competence-matrix-link"
            >{{ 'training.matrix.competenceLink' | transloco }} →</a
          >
        </p>
      }

      <div
        class="mb-4 flex flex-wrap items-center gap-2 print:hidden"
        [appTourStep]="'training-matrix-filters'"
      >
        <app-training-filter
          [label]="'training.filters.category' | transloco"
          [value]="category()"
          [options]="categoryOptions()"
          (valueChange)="setCategory($event)"
        />
        @if (departmentOptions().length > 1) {
          <app-training-filter
            [label]="'training.filters.department' | transloco"
            [value]="department()"
            [options]="departmentOptions()"
            (valueChange)="department.set($event)"
          />
        }
        @if (positionOptions().length > 1) {
          <app-training-filter
            [label]="'training.filters.position' | transloco"
            [value]="position()"
            [options]="positionOptions()"
            testId="filter-position"
            (valueChange)="position.set($event)"
          />
        }
      </div>

      @if (matrix(); as m) {
        <div class="mb-4 max-w-[460px]" [appTourStep]="'training-matrix-summary'">
          <p class="mb-1 text-ui text-fg">
            {{
              'training.matrix.summary'
                | transloco
                  : {
                      compliant: m.summary.compliant,
                      required: m.summary.required,
                      pct: m.summary.pct,
                    }
            }}
          </p>
          <app-progress-bar
            [value]="m.summary.pct"
            [label]="'training.matrix.compliance' | transloco"
          />
        </div>

        <ul
          class="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-meta"
          [attr.aria-label]="'training.matrix.legend' | transloco"
          data-testid="matrix-legend"
        >
          @for (s of statuses; track s) {
            <li class="flex items-center gap-1.5">
              <span
                class="inline-flex h-6 min-w-6 items-center justify-center rounded-tile px-1 text-ui font-bold"
                [class]="cellClass(s)"
                aria-hidden="true"
                >{{ symbol(s) }}</span
              >
              <span class="text-fg">{{ 'training.cell.' + s | transloco }}</span>
              <span class="text-fg-muted"
                >– {{ 'training.matrix.legendHelp.' + s | transloco }}</span
              >
            </li>
          }
        </ul>

        @if (m.users.length === 0 || m.courses.length === 0) {
          <app-empty-state
            icon="grid"
            titleKey="training.matrix.emptyTitle"
            bodyKey="training.matrix.empty"
          />
        } @else {
          <div
            class="max-h-[70vh] overflow-auto rounded-card border border-border bg-surface print:max-h-none print:overflow-visible"
            data-testid="matrix"
          >
            <table class="border-separate border-spacing-0 text-ui">
              <caption class="sr-only">
                {{
                  'training.matrix.title' | transloco
                }}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    class="sticky top-0 left-0 z-30 min-w-[200px] border-b border-border bg-surface px-3 py-2 text-left align-bottom text-meta font-semibold text-fg-muted"
                  >
                    {{ 'training.fields.person' | transloco }}
                  </th>
                  @for (c of m.courses; track c.id) {
                    <th
                      scope="col"
                      class="sticky top-0 z-20 w-[128px] min-w-[128px] border-b border-l border-border bg-surface px-2 py-2 text-left align-bottom font-semibold"
                    >
                      <a
                        [routerLink]="['/training/courses', c.id]"
                        class="line-clamp-3 text-meta leading-snug text-fg hover:text-accent hover:underline"
                        [attr.title]="c.code + ' · ' + c.title"
                      >
                        {{ c.title }}
                      </a>
                      <span class="mt-0.5 block font-mono text-micro text-fg-subtle">{{
                        c.code
                      }}</span>
                      @if (c.pct !== undefined) {
                        <span
                          class="mt-1 block text-micro font-semibold"
                          [class.text-fg-muted]="c.pct === null"
                          [class.text-fg]="c.pct !== null"
                          data-testid="matrix-course-pct"
                        >
                          @if (c.pct === null) {
                            {{ 'training.matrix.notRequired' | transloco }}
                          } @else {
                            {{
                              'training.matrix.coursePct'
                                | transloco
                                  : {
                                      pct: c.pct,
                                      compliant: c.compliant ?? 0,
                                      required: c.required ?? 0,
                                    }
                            }}
                          }
                        </span>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (u of m.users; track u.id) {
                  <tr>
                    <th
                      scope="row"
                      class="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 text-left font-normal"
                    >
                      <a
                        [routerLink]="u.url ?? ['/training/people', u.id]"
                        class="font-semibold whitespace-nowrap text-fg hover:text-accent hover:underline"
                        >{{ displayName(u) }}</a
                      >
                      @if (subtitle(u); as sub) {
                        <span class="block text-meta whitespace-nowrap text-fg-muted">{{
                          sub
                        }}</span>
                      }
                    </th>
                    @for (c of m.courses; track c.id) {
                      @let cell = cellFor(u.id, c.id);
                      <td class="border-b border-l border-border p-1">
                        @if (cell && cell.status !== 'missing') {
                          @if (cell.record_id || cell.assignment_id) {
                            <a
                              [routerLink]="
                                cell.record_id
                                  ? ['/training/records', cell.record_id]
                                  : ['/training/assignments', cell.assignment_id]
                              "
                              class="flex h-9 items-center gap-1 rounded-tile px-2 text-meta font-semibold whitespace-nowrap hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                              [class]="cellClass(cell.status)"
                              [attr.aria-label]="cellLabel(u.name, c.title, cell.status)"
                            >
                              <span aria-hidden="true">{{ symbol(cell.status) }}</span>
                              <span aria-hidden="true">{{
                                'training.cell.' + cell.status | transloco
                              }}</span>
                            </a>
                          } @else {
                            <span
                              class="flex h-9 items-center gap-1 rounded-tile px-2 text-meta font-semibold whitespace-nowrap"
                              [class]="cellClass(cell.status)"
                              role="img"
                              [attr.aria-label]="cellLabel(u.name, c.title, cell.status)"
                            >
                              <span aria-hidden="true">{{ symbol(cell.status) }}</span>
                              <span aria-hidden="true">{{
                                'training.cell.' + cell.status | transloco
                              }}</span>
                            </span>
                          }
                        } @else if (cell) {
                          <span
                            class="flex h-9 items-center px-2 text-meta text-fg-subtle"
                            role="img"
                            [attr.aria-label]="cellLabel(u.name, c.title, 'missing')"
                            >–</span
                          >
                        } @else {
                          <span
                            class="flex h-9 items-center px-2 text-meta text-fg-subtle"
                            [attr.title]="'training.matrix.notRequiredCell' | transloco"
                            aria-hidden="true"
                            >·</span
                          >
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-2 text-meta text-fg-muted">{{ 'training.matrix.dotHelp' | transloco }}</p>
        }
      } @else if (failed()) {
        <app-error-state (retry)="reload()" />
      } @else {
        <app-loading-state [rows]="6" />
      }

      <div class="mt-8 print:hidden">
        <app-why-it-matters scope="training" page="matrix" />
      </div>
    </div>
  `,
})
export class TrainingMatrix {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(TrainingPeople);
  protected readonly access = inject(TrainingAccess);
  private readonly modules = inject(ModuleService);

  /** U35: link to the one competence matrix (People on, and allowed to read it). */
  protected readonly showCompetence = computed(
    () => this.modules.isEnabled('people') && this.access.canReadPeople(),
  );

  protected readonly statuses = CELL_STATUSES;
  protected readonly category = signal<CourseCategory | ''>('');
  protected readonly department = signal('');
  protected readonly position = signal('');
  protected readonly matrix = signal<Matrix | null>(null);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly subtitle = personSubtitle;
  private readonly tick = signal(0);
  private readonly cells = computed(() => indexCells(this.matrix()?.cells ?? []));
  /** Names shared by several people get their e-mail added. */
  private readonly sharedNames = computed(() => {
    const seen = new Map<string, number>();
    for (const u of this.matrix()?.users ?? []) {
      seen.set(u.name, (seen.get(u.name) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  });

  private readonly query = computed<MatrixQuery>(() => ({
    category: this.category(),
    department_id: this.department() || undefined,
    position_id: this.position() || undefined,
  }));

  protected readonly categoryOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allCategories') },
    ...COURSE_CATEGORIES.map((c) => ({
      value: c,
      label: this.language.translate(`training.category.${c}`),
    })),
  ]);
  protected readonly departmentOptions = computed<FilterOption[]>(() => {
    const fromMatrix = this.matrix()?.departments;
    const list = fromMatrix?.length
      ? fromMatrix
      : this.directory.departments().map((d) => ({ id: d.id, name: d.name }));
    return [
      { value: '', label: this.language.translate('training.filters.allDepartments') },
      ...list.map((d) => ({ value: d.id, label: d.name })),
    ];
  });
  protected readonly positionOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allPositions') },
    ...(this.matrix()?.positions ?? []).map((p) => ({ value: p.id, label: p.name })),
  ]);

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      view: 'dashboard',
      title: this.language.translate('training.matrix.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = this.query();
      this.tick();
      untracked(() => {
        this.sub?.unsubscribe();
        if (!orgId) {
          return;
        }
        this.failed.set(false);
        this.sub = this.api.matrix(orgId, query).subscribe({
          next: (m) => this.matrix.set(m),
          error: () => {
            this.matrix.set(null);
            this.failed.set(true);
          },
        });
      });
    });
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected setCategory(value: string): void {
    this.category.set(
      (COURSE_CATEGORIES as readonly string[]).includes(value) ? (value as CourseCategory) : '',
    );
  }

  protected cellFor(userId: string, courseId: string): MatrixCell | undefined {
    return this.cells().get(`${userId}:${courseId}`);
  }

  protected displayName(u: MatrixUser): string {
    return this.sharedNames().has(u.name) && u.email ? `${u.name} (${u.email})` : u.name;
  }

  protected cellClass(status: string): string {
    const badge = cellBadge(status);
    return TONE_CELL[toneFor(badge.meaning, badge.value)] ?? TONE_CELL['neutral'];
  }

  protected symbol(status: string): string {
    return CELL_SYMBOL[status] ?? '';
  }

  protected cellLabel(person: string, course: string, status: string): string {
    return this.language.translate('training.matrix.cellLabel', {
      person,
      course,
      status: this.language.translate(`training.cell.${status}`),
    });
  }

  protected print(): void {
    globalThis.print?.();
  }

  protected exportCsv(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportCsv(orgId, 'matrix', this.query(), this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, exportFileName('matrix'));
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('training.export.failed');
      },
    });
  }
}
