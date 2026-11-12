import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  GLOSSARY_SCOPE,
  GuidanceContentService,
} from '../../core/guidance/guidance-content.service';
import { GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ClauseChips } from '../../shared/guidance/clause-chips';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { LevelPicker } from '../../shared/guidance/level-picker';
import { TeachMe } from '../../shared/guidance/teach-me';
import { TourButton } from '../../shared/guidance/tour-button';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { KpiTile } from '../../shared/ui/kpi-tile/kpi-tile';
import {
  LESSON_SCOPES,
  LESSON_STATUSES,
  LessonStatus,
  buildCatalog,
  matchesQuery,
} from './lesson-catalog';

type LessonSort = 'title' | 'status';

const STATUS_TONE: Record<LessonStatus, BadgeTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  completed: 'pass',
};

const STATUS_ORDER: Record<LessonStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };

/**
 * `/account/learning`: the user's learning centre. Choose the learning level, see
 * progress, browse and filter the micro-lessons, and look terms up in the glossary.
 */
@Component({
  selector: 'app-learning-centre',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Card,
    KpiTile,
    ClauseChips,
    GuideIntro,
    LevelPicker,
    TeachMe,
    TourButton,
    TourStepDirective,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <div class="mb-[18px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'guidance.centre.title' | transloco }}
          </h1>
          <div class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'guidance.centre.subtitle' | transloco }}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="platform" tour="learning" />
          <app-teach-me topic="platform.learning" [subject]="'guidance.centre.title' | transloco" />
        </div>
      </div>

      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="platform" page="learning" />
        <app-why-it-matters scope="platform" page="learning" />
      </div>

      <div class="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div class="flex min-w-0 flex-col gap-5">
          <section
            appTourStep="learning-progress"
            data-testid="learning-progress"
            aria-labelledby="learning-progress-title"
          >
            <h2
              id="learning-progress-title"
              class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.centre.progressTitle' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <app-kpi-tile
                [label]="'guidance.centre.kpiCompleted' | transloco"
                [value]="
                  'guidance.centre.ofTotal'
                    | transloco: { done: completed(), total: catalog().length }
                "
              />
              <app-kpi-tile
                [label]="'guidance.centre.kpiInProgress' | transloco"
                [value]="inProgress()"
              />
              <app-kpi-tile
                [label]="'guidance.centre.kpiQuizzes' | transloco"
                [value]="progress.quizzesPassed()"
              />
            </div>
          </section>

          <section
            appTourStep="learning-lessons"
            data-testid="learning-lessons"
            aria-labelledby="learning-lessons-title"
          >
            <h2
              id="learning-lessons-title"
              class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.centre.lessonsTitle' | transloco }}
            </h2>
            <div class="mb-3 flex flex-wrap gap-2">
              <input
                type="search"
                data-testid="lesson-search"
                class="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
                [attr.aria-label]="'guidance.centre.searchLessons' | transloco"
                [placeholder]="'guidance.centre.searchLessons' | transloco"
                [value]="lessonQuery()"
                (input)="lessonQuery.set($any($event.target).value)"
              />
              <select
                data-testid="lesson-status-filter"
                class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg outline-none focus:border-accent"
                [attr.aria-label]="'guidance.centre.filterStatus' | transloco"
                [value]="statusFilter()"
                (change)="statusFilter.set($any($event.target).value)"
              >
                <option value="all">{{ 'guidance.centre.allStatuses' | transloco }}</option>
                @for (status of statuses; track status) {
                  <option [value]="status">
                    {{ 'guidance.status.' + status | transloco }}
                  </option>
                }
              </select>
              <select
                class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg outline-none focus:border-accent"
                [attr.aria-label]="'guidance.centre.sort' | transloco"
                [value]="sort()"
                (change)="sort.set($any($event.target).value)"
              >
                <option value="status">{{ 'guidance.centre.sortStatus' | transloco }}</option>
                <option value="title">{{ 'guidance.centre.sortTitle' | transloco }}</option>
              </select>
            </div>

            <app-card [padded]="false">
              @if (!filesLoaded()) {
                <p class="px-4 py-8 text-center text-[13.5px] text-fg-muted">
                  {{ 'guidance.loading' | transloco }}
                </p>
              } @else if (visibleLessons().length === 0) {
                <p
                  data-testid="lessons-empty"
                  class="px-4 py-8 text-center text-[13.5px] text-fg-muted"
                >
                  {{
                    (catalog().length === 0
                      ? 'guidance.centre.noLessons'
                      : 'guidance.centre.noMatches'
                    ) | transloco
                  }}
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (lesson of visibleLessons(); track lesson.lessonKey) {
                    <li>
                      <a
                        data-testid="lesson-row"
                        [routerLink]="['/account/learning', lesson.scope, lesson.key]"
                        class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-[13.5px] font-semibold text-accent">
                            {{ lesson.title }}
                          </span>
                          <span class="block text-[12.5px] text-fg-muted">
                            @if (lesson.minutes) {
                              {{
                                'guidance.lesson.minutes' | transloco: { minutes: lesson.minutes }
                              }}
                            }
                            @if (lesson.hasQuiz) {
                              · {{ 'guidance.centre.hasQuiz' | transloco }}
                            }
                          </span>
                        </span>
                        @if (lesson.progress?.quiz_passed) {
                          <app-badge tone="pass">
                            {{
                              'guidance.quiz.passedBadge'
                                | transloco: { score: lesson.progress?.quiz_score }
                            }}
                          </app-badge>
                        }
                        <app-badge [tone]="tone(lesson.status)">
                          {{ 'guidance.status.' + lesson.status | transloco }}
                        </app-badge>
                      </a>
                    </li>
                  }
                </ul>
              }
            </app-card>
          </section>
        </div>

        <div class="flex min-w-0 flex-col gap-5">
          <section
            appTourStep="learning-level"
            data-testid="learning-level"
            aria-labelledby="learning-level-title"
          >
            <h2
              id="learning-level-title"
              class="mb-1 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.centre.levelTitle' | transloco }}
            </h2>
            <p class="mb-3 text-[13px] text-fg-muted">
              {{
                'guidance.centre.levelCurrent'
                  | transloco
                    : { level: 'guidance.levels.' + guidance.level() + '.name' | transloco }
              }}
            </p>
            <app-level-picker
              [value]="guidance.personalLevel()"
              [includeDefault]="hasOrg()"
              [defaultLevel]="guidance.orgDefault()"
              [disabled]="guidance.saving()"
              (valueChange)="setLevel($event)"
            />
          </section>

          <section
            appTourStep="learning-glossary"
            data-testid="learning-glossary"
            aria-labelledby="learning-glossary-title"
          >
            <h2
              id="learning-glossary-title"
              class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.glossary.title' | transloco }}
            </h2>
            <input
              type="search"
              data-testid="glossary-search"
              class="mb-3 h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              [attr.aria-label]="'guidance.glossary.search' | transloco"
              [placeholder]="'guidance.glossary.search' | transloco"
              [value]="termQuery()"
              (input)="termQuery.set($any($event.target).value)"
            />
            <app-card [padded]="false">
              @if (terms().length === 0) {
                <p class="px-4 py-6 text-center text-[13px] text-fg-muted">
                  {{ 'guidance.glossary.noMatches' | transloco }}
                </p>
              } @else {
                <dl class="max-h-[560px] divide-y divide-border overflow-y-auto">
                  @for (entry of terms(); track entry.key) {
                    <div class="px-4 py-3" data-testid="glossary-entry">
                      <dt class="text-[13.5px] font-semibold text-fg">{{ entry.term }}</dt>
                      <dd class="mt-0.5 text-[12.5px] leading-snug text-fg-muted">
                        {{ entry.definition }}
                      </dd>
                      @if (entry.clauses?.length) {
                        <dd class="mt-1.5">
                          <app-clause-chips [clauses]="entry.clauses ?? []" />
                        </dd>
                      }
                    </div>
                  }
                </dl>
              }
            </app-card>
            <p class="mt-2 text-[12px] text-fg-subtle">
              {{ 'guidance.glossary.count' | transloco: { count: terms().length } }}
            </p>
          </section>
        </div>
      </div>
    </div>
  `,
})
export class LearningCentre {
  protected readonly guidance = inject(GuidanceService);
  protected readonly progress = inject(LearningProgressService);
  private readonly content = inject(GuidanceContentService);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly statuses = LESSON_STATUSES;
  protected readonly lessonQuery = signal('');
  protected readonly statusFilter = signal<LessonStatus | 'all'>('all');
  protected readonly sort = signal<LessonSort>('status');
  protected readonly termQuery = signal('');

  protected readonly hasOrg = computed(() => this.selectedOrg.currentOrgId() !== null);

  protected readonly filesLoaded = computed(() =>
    LESSON_SCOPES.every((scope) => this.content.readLoaded(scope)),
  );

  protected readonly catalog = computed(() =>
    buildCatalog(
      LESSON_SCOPES.map((scope) => ({ scope, file: this.content.readFile(scope) })),
      this.progress.byKey(),
    ),
  );
  protected readonly completed = computed(
    () => this.catalog().filter((l) => l.status === 'completed').length,
  );
  protected readonly inProgress = computed(
    () => this.catalog().filter((l) => l.status === 'in_progress').length,
  );

  protected readonly visibleLessons = computed(() => {
    const query = this.lessonQuery();
    const status = this.statusFilter();
    const sort = this.sort();
    return this.catalog()
      .filter((l) => (status === 'all' || l.status === status) && matchesQuery(l.title, query))
      .sort((a, b) =>
        sort === 'status'
          ? STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title),
      );
  });

  protected readonly terms = computed(() => {
    const query = this.termQuery();
    const glossary = this.content.readFile(GLOSSARY_SCOPE)?.glossary ?? {};
    return Object.entries(glossary)
      .map(([key, entry]) => ({ key, ...entry }))
      .filter((e) => matchesQuery(`${e.term} ${e.definition}`, query))
      .sort((a, b) => a.term.localeCompare(b.term));
  });

  constructor() {
    this.progress.ensureLoaded();
  }

  protected tone(status: LessonStatus): BadgeTone {
    return STATUS_TONE[status];
  }

  protected setLevel(level: GuidanceLevel | null): void {
    this.guidance.setLevel(level);
  }
}
