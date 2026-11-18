import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  GLOSSARY_SCOPE,
  GuidanceContentService,
} from '../../core/guidance/guidance-content.service';
import { GuidanceLevel, progressLessonKey } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LearningProgressService } from '../../core/guidance/learning-progress.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ClauseChips } from '../../shared/guidance/clause-chips';
import { LevelPicker } from '../../shared/guidance/level-picker';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { RecommendedLessons } from './recommended-lessons';
import {
  LESSON_SCOPES,
  LESSON_STATUSES,
  LessonStatus,
  buildCatalog,
  lessonStatus,
  matchesQuery,
} from './lesson-catalog';
import { startHere } from './start-here';

const STATUS_TONE: Record<LessonStatus, BadgeTone> = {
  not_started: 'neutral',
  in_progress: 'info',
  completed: 'pass',
};

const STATUS_ORDER: Record<LessonStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };

const TOGGLE_CLASS =
  'inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none';

/**
 * `/account/learning`: the user's learning centre (simplify U38). The first screen is
 * short: a page title, one help "?", a "Start her" path of five lessons filtered to the
 * org's modules, and the learning level. The full lesson library and the glossary open
 * on request.
 */
@Component({
  selector: 'app-learning-centre',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Card,
    ClauseChips,
    HelpStrip,
    Icon,
    LevelPicker,
    PageHeader,
    TourStepDirective,
    RecommendedLessons,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <app-page-header titleKey="nav.learning" descriptionKey="guidance.centre.subtitle" />
      <app-help-strip scope="platform" page="learning" tour="learning" lesson="learning-mode" />

      <div class="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div class="flex min-w-0 flex-col gap-5">
          <section
            appTourStep="learning-progress"
            data-testid="learning-start"
            aria-labelledby="learning-start-title"
          >
            <div class="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2
                id="learning-start-title"
                class="font-display text-section font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'guidance.centre.startTitle' | transloco }}
              </h2>
              @if (startLessons().length) {
                <span class="text-meta text-fg-muted" data-testid="learning-start-progress">
                  {{
                    'guidance.centre.startProgress'
                      | transloco: { done: startDone(), total: startLessons().length }
                  }}
                </span>
              }
            </div>
            <p class="mb-3 text-ui text-fg-muted">
              {{ 'guidance.centre.startSubtitle' | transloco }}
            </p>
            <app-card [padded]="false">
              @if (startLessons().length === 0) {
                <p class="px-4 py-8 text-center text-ui text-fg-muted">
                  {{ 'guidance.loading' | transloco }}
                </p>
              } @else {
                <ol class="divide-y divide-border">
                  @for (lesson of startLessons(); track lesson.lessonKey; let i = $index) {
                    <li>
                      <a
                        data-testid="start-lesson"
                        [routerLink]="['/account/learning', lesson.scope, lesson.key]"
                        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span
                          class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-meta font-bold"
                          [class]="
                            lesson.status === 'completed'
                              ? 'bg-pass text-white'
                              : 'bg-accent-soft text-accent'
                          "
                          aria-hidden="true"
                        >
                          @if (lesson.status === 'completed') {
                            <app-icon name="check" [size]="14" />
                          } @else {
                            {{ i + 1 }}
                          }
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block text-ui font-semibold text-accent">
                            {{ lesson.title }}
                          </span>
                          @if (lesson.minutes) {
                            <span class="block text-meta text-fg-muted">
                              {{
                                'guidance.lesson.minutes' | transloco: { minutes: lesson.minutes }
                              }}
                            </span>
                          }
                        </span>
                        @if (lesson.status === 'completed') {
                          <app-badge tone="pass">
                            {{ 'guidance.status.completed' | transloco }}
                          </app-badge>
                        }
                      </a>
                    </li>
                  }
                </ol>
              }
            </app-card>
          </section>

          <section
            appTourStep="learning-lessons"
            data-testid="learning-lessons"
            aria-labelledby="learning-lessons-title"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="learning-lessons-title"
                  class="font-display text-section font-bold tracking-[-0.02em] text-fg"
                >
                  {{ 'guidance.centre.lessonsTitle' | transloco }}
                </h2>
                <p class="mt-0.5 text-meta text-fg-muted" data-testid="learning-summary">
                  {{
                    'guidance.centre.summary'
                      | transloco
                        : {
                            done: completed(),
                            total: catalog().length,
                            quizzes: progress.quizzesPassed(),
                          }
                  }}
                </p>
              </div>
              <button
                type="button"
                data-testid="lessons-toggle"
                [class]="toggleClass"
                [attr.aria-expanded]="showLibrary()"
                aria-controls="learning-library"
                (click)="showLibrary.set(!showLibrary())"
              >
                {{
                  (showLibrary() ? 'guidance.centre.hideAll' : 'guidance.centre.showAll')
                    | transloco: { count: catalog().length }
                }}
              </button>
            </div>

            @if (showLibrary()) {
              <div id="learning-library" class="mt-3">
                <div class="mb-3 flex flex-wrap gap-2">
                  <input
                    type="search"
                    data-testid="lesson-search"
                    class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                    [attr.aria-label]="'guidance.centre.searchLessons' | transloco"
                    [placeholder]="'guidance.centre.searchLessons' | transloco"
                    [value]="lessonQuery()"
                    (input)="lessonQuery.set($any($event.target).value)"
                  />
                  <select
                    data-testid="lesson-area-filter"
                    class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent"
                    [attr.aria-label]="'guidance.centre.filterArea' | transloco"
                    [value]="areaFilter()"
                    (change)="areaFilter.set($any($event.target).value)"
                  >
                    <option value="all">{{ 'guidance.centre.allAreas' | transloco }}</option>
                    @for (area of areas(); track area) {
                      <option [value]="area">{{ 'guidance.scopes.' + area | transloco }}</option>
                    }
                  </select>
                  <select
                    data-testid="lesson-status-filter"
                    class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent"
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
                </div>

                <app-card [padded]="false">
                  @if (!filesLoaded()) {
                    <p class="px-4 py-8 text-center text-ui text-fg-muted">
                      {{ 'guidance.loading' | transloco }}
                    </p>
                  } @else if (visibleLessons().length === 0) {
                    <p
                      data-testid="lessons-empty"
                      class="px-4 py-8 text-center text-ui text-fg-muted"
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
                              <span class="block truncate text-ui font-semibold text-accent">
                                {{ lesson.title }}
                              </span>
                              <span class="block text-meta text-fg-muted">
                                @if (lesson.minutes) {
                                  {{
                                    'guidance.lesson.minutes'
                                      | transloco: { minutes: lesson.minutes }
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
                            @if (lesson.status !== 'not_started') {
                              <app-badge [tone]="tone(lesson.status)">
                                {{ 'guidance.status.' + lesson.status | transloco }}
                              </app-badge>
                            }
                          </a>
                        </li>
                      }
                    </ul>
                  }
                </app-card>
              </div>
            }
          </section>

          <app-recommended-lessons />
        </div>

        <div class="flex min-w-0 flex-col gap-5">
          <section
            appTourStep="learning-level"
            data-testid="learning-level"
            aria-labelledby="learning-level-title"
          >
            <h2
              id="learning-level-title"
              class="mb-1 font-display text-section font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.centre.levelTitle' | transloco }}
            </h2>
            <p class="mb-3 text-ui text-fg-muted">
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
              class="mb-2 font-display text-section font-bold tracking-[-0.02em] text-fg"
            >
              {{ 'guidance.glossary.title' | transloco }}
            </h2>
            <button
              type="button"
              data-testid="glossary-toggle"
              [class]="toggleClass"
              [attr.aria-expanded]="showGlossary()"
              aria-controls="learning-glossary-list"
              (click)="showGlossary.set(!showGlossary())"
            >
              {{
                (showGlossary() ? 'guidance.centre.hideGlossary' : 'guidance.centre.showGlossary')
                  | transloco: { count: glossarySize() }
              }}
            </button>
            @if (showGlossary()) {
              <div id="learning-glossary-list" class="mt-3">
                <input
                  type="search"
                  data-testid="glossary-search"
                  class="mb-3 h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  [attr.aria-label]="'guidance.glossary.search' | transloco"
                  [placeholder]="'guidance.glossary.search' | transloco"
                  [value]="termQuery()"
                  (input)="termQuery.set($any($event.target).value)"
                />
                <app-card [padded]="false">
                  @if (terms().length === 0) {
                    <p class="px-4 py-6 text-center text-ui text-fg-muted">
                      {{ 'guidance.glossary.noMatches' | transloco }}
                    </p>
                  } @else {
                    <dl class="max-h-[560px] divide-y divide-border overflow-y-auto">
                      @for (entry of terms(); track entry.key) {
                        <div class="px-4 py-3" data-testid="glossary-entry">
                          <dt class="text-ui font-semibold text-fg">{{ entry.term }}</dt>
                          <dd class="mt-0.5 text-meta leading-snug text-fg-muted">
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
                <p class="mt-2 text-meta text-fg-subtle">
                  {{ 'guidance.glossary.count' | transloco: { count: terms().length } }}
                </p>
              </div>
            }
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
  private readonly modules = inject(ModuleService);

  protected readonly toggleClass = TOGGLE_CLASS;
  protected readonly statuses = LESSON_STATUSES;
  protected readonly lessonQuery = signal('');
  protected readonly statusFilter = signal<LessonStatus | 'all'>('all');
  /** `all` or a guidance scope (a module, or the CoreFlow basics). */
  protected readonly areaFilter = signal('all');
  protected readonly termQuery = signal('');
  /** The full library and the glossary are folded until asked for (U38). */
  protected readonly showLibrary = signal(false);
  protected readonly showGlossary = signal(false);

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
  /** Areas (guidance scopes) that have at least one lesson, in catalogue order. */
  protected readonly areas = computed(() => [...new Set(this.catalog().map((l) => l.scope))]);
  protected readonly completed = computed(
    () => this.catalog().filter((l) => l.status === 'completed').length,
  );

  /** "Start her": five lessons for the org's modules, with the learner's progress. */
  protected readonly startLessons = computed(() => {
    const byKey = this.progress.byKey();
    return startHere((module) => this.modules.isEnabled(module)).flatMap((c) => {
      const lesson = this.content.readLesson(c.scope, c.key);
      if (!lesson) {
        return [];
      }
      const lessonKey = progressLessonKey(c.scope, c.key);
      return [
        {
          scope: c.scope,
          key: c.key,
          lessonKey,
          title: lesson.title,
          minutes: lesson.minutes ?? null,
          status: lessonStatus(byKey.get(lessonKey)),
        },
      ];
    });
  });
  protected readonly startDone = computed(
    () => this.startLessons().filter((l) => l.status === 'completed').length,
  );

  protected readonly visibleLessons = computed(() => {
    const query = this.lessonQuery();
    const status = this.statusFilter();
    const area = this.areaFilter();
    return this.catalog()
      .filter(
        (l) =>
          (status === 'all' || l.status === status) &&
          (area === 'all' || l.scope === area) &&
          matchesQuery(l.title, query),
      )
      .sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title),
      );
  });

  protected readonly glossarySize = computed(
    () => Object.keys(this.content.readFile(GLOSSARY_SCOPE)?.glossary ?? {}).length,
  );
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
