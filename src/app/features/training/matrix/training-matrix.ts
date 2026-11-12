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
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Badge } from '../../../shared/ui/badge/badge';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, cellTone } from '../data/training-display';
import {
  CELL_STATUSES,
  COURSE_CATEGORIES,
  CourseCategory,
  Matrix,
  MatrixCell,
} from '../data/training.models';
import { FilterOption, FilterSelect } from '../shared/filter-select';
import { TrainingPeople } from '../shared/people';
import { TrainingNav } from '../training-nav';

/** Index cells by `<user>:<course>`. */
export function indexCells(cells: readonly MatrixCell[]): ReadonlyMap<string, MatrixCell> {
  return new Map(cells.map((c) => [`${c.user_id}:${c.course_id}`, c]));
}

/** Short symbol per cell status (the badge also carries the full label for screen readers). */
const SYMBOL: Readonly<Record<string, string>> = {
  compliant: '✓',
  expiring: '!',
  expired: '×',
  overdue: '×',
  assigned: '•',
  missing: '–',
};

/**
 * `/training/matrix` (oversee): the training matrix, people by courses, with the
 * status of each required course and the overall compliance percentage.
 */
@Component({
  selector: 'app-training-matrix',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    ProgressBar,
    GuideIntro,
    WhyItMatters,
    TourButton,
    TourStepDirective,
    FilterSelect,
    TrainingNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-nav />
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'training.matrix.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">
            {{ 'training.matrix.subtitle' | transloco }}
          </p>
        </div>
        <app-tour-button scope="training" tour="matrix" />
      </div>
      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <app-guide-intro scope="training" page="matrix" />
        <app-why-it-matters scope="training" page="matrix" />
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-2" [appTourStep]="'training-matrix-filters'">
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
      </div>

      @if (matrix(); as m) {
        <div class="mb-4 max-w-[420px]" [appTourStep]="'training-matrix-summary'">
          <p class="mb-1 text-[13px] text-fg">
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
          class="mb-3 flex flex-wrap gap-2 text-[12px]"
          [attr.aria-label]="'training.matrix.legend' | transloco"
        >
          @for (s of statuses; track s) {
            <li>
              <app-badge [tone]="tone(s)"
                >{{ symbol(s) }} {{ 'training.cell.' + s | transloco }}</app-badge
              >
            </li>
          }
        </ul>

        @if (m.users.length === 0 || m.courses.length === 0) {
          <p class="py-8 text-center text-[13.5px] text-fg-muted">
            {{ 'training.matrix.empty' | transloco }}
          </p>
        } @else {
          <div
            class="overflow-auto rounded-card border border-border bg-surface"
            data-testid="matrix"
          >
            <table class="text-[12.5px]">
              <caption class="sr-only">
                {{
                  'training.matrix.title' | transloco
                }}
              </caption>
              <thead>
                <tr class="border-b border-border">
                  <th
                    scope="col"
                    class="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold text-fg-muted"
                  >
                    {{ 'training.fields.person' | transloco }}
                  </th>
                  @for (c of m.courses; track c.id) {
                    <th
                      scope="col"
                      class="min-w-[90px] px-2 py-2 text-center font-semibold text-fg-muted"
                    >
                      <a
                        [routerLink]="['/training/courses', c.id]"
                        [attr.title]="c.title"
                        class="hover:text-accent"
                      >
                        {{ c.code }}
                      </a>
                      <span class="sr-only">{{ c.title }}</span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (u of m.users; track u.id) {
                  <tr class="border-b border-border last:border-0">
                    <th
                      scope="row"
                      class="sticky left-0 z-10 bg-surface px-3 py-1.5 text-left font-medium whitespace-nowrap text-fg"
                    >
                      {{ u.name }}
                    </th>
                    @for (c of m.courses; track c.id) {
                      @let cell = cellFor(u.id, c.id);
                      <td class="px-2 py-1.5 text-center">
                        @if (cell && cell.status !== 'missing') {
                          @if (cell.record_id) {
                            <a
                              [routerLink]="['/training/records', cell.record_id]"
                              [attr.aria-label]="cellLabel(u.name, c.title, cell.status)"
                            >
                              <app-badge [tone]="tone(cell.status)">{{
                                symbol(cell.status)
                              }}</app-badge>
                            </a>
                          } @else if (cell.assignment_id) {
                            <a
                              [routerLink]="['/training/assignments', cell.assignment_id]"
                              [attr.aria-label]="cellLabel(u.name, c.title, cell.status)"
                            >
                              <app-badge [tone]="tone(cell.status)">{{
                                symbol(cell.status)
                              }}</app-badge>
                            </a>
                          } @else {
                            <span
                              [attr.aria-label]="cellLabel(u.name, c.title, cell.status)"
                              role="img"
                            >
                              <app-badge [tone]="tone(cell.status)">{{
                                symbol(cell.status)
                              }}</app-badge>
                            </span>
                          }
                        } @else if (cell) {
                          <span
                            class="text-fg-subtle"
                            role="img"
                            [attr.aria-label]="cellLabel(u.name, c.title, 'missing')"
                            >–</span
                          >
                        } @else {
                          <span class="text-fg-subtle" aria-hidden="true">·</span>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else if (failed()) {
        <p class="text-[13.5px] text-fail" role="alert">
          {{ 'training.errors.loadFailed' | transloco }}
        </p>
      } @else {
        <p class="text-[13.5px] text-fg-muted" role="status">
          {{ 'training.common.loading' | transloco }}
        </p>
      }
    </div>
  `,
})
export class TrainingMatrix {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly directory = inject(TrainingPeople);

  protected readonly statuses = CELL_STATUSES;
  protected readonly category = signal<CourseCategory | ''>('');
  protected readonly department = signal('');
  protected readonly matrix = signal<Matrix | null>(null);
  protected readonly failed = signal(false);
  private readonly cells = computed(() => indexCells(this.matrix()?.cells ?? []));

  protected readonly categoryOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allCategories') },
    ...COURSE_CATEGORIES.map((c) => ({
      value: c,
      label: this.language.translate(`training.category.${c}`),
    })),
  ]);
  protected readonly departmentOptions = computed<FilterOption[]>(() => [
    { value: '', label: this.language.translate('training.filters.allDepartments') },
    ...this.directory.departments().map((d) => ({ value: d.id, label: d.name })),
  ]);

  private sub: Subscription | null = null;

  constructor() {
    providePageContext(() => ({ module: TRAINING_MODULE, view: 'dashboard', title: null }));
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
    this.directory.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const query = { category: this.category(), department_id: this.department() || undefined };
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

  protected setCategory(value: string): void {
    this.category.set(
      (COURSE_CATEGORIES as readonly string[]).includes(value) ? (value as CourseCategory) : '',
    );
  }

  protected cellFor(userId: string, courseId: string): MatrixCell | undefined {
    return this.cells().get(`${userId}:${courseId}`);
  }

  protected tone(status: string) {
    return cellTone(status);
  }

  protected symbol(status: string): string {
    return SYMBOL[status] ?? '';
  }

  protected cellLabel(person: string, course: string, status: string): string {
    return this.language.translate('training.matrix.cellLabel', {
      person,
      course,
      status: this.language.translate(`training.cell.${status}`),
    });
  }
}
