import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { Icon } from '../ui/icon/icon';

/** Learning content shape for one page in the `activity` scope (`activity.guide.<page>.*`). */
export interface ActivityGuidePage {
  /** Number of intro steps (`step1` … `stepN`). */
  readonly steps: number;
  /** Clause references (`iso9001:7.4`); labels live at `activity.guide.clauses.<slug>`. */
  readonly clauses: readonly string[];
  /** Number of micro-lesson sections (`lesson.s1` … `lesson.sN`, each `heading` + `body`). */
  readonly lessonSections: number;
}

/** Content index for the pages this item ships. Keys must exist in en and nb. */
export const ACTIVITY_GUIDE_PAGES = {
  rules: { steps: 3, clauses: ['iso9001:7.4', 'iso27001:7.4', 'iso9001:5.3'], lessonSections: 3 },
  preferences: { steps: 3, clauses: ['iso9001:7.4', 'iso27001:7.4'], lessonSections: 2 },
} as const satisfies Record<string, ActivityGuidePage>;

export type ActivityGuidePageKey = keyof typeof ACTIVITY_GUIDE_PAGES;

/** i18n slug for a clause reference (`iso9001:7.4` -> `iso9001_7_4`). */
export function clauseSlug(ref: string): string {
  return ref.replace(/[^a-z0-9]+/gi, '_');
}

/**
 * Learning-mode panel for the notification pages: a page intro with steps, a
 * "why this matters" note with clause references (each opens the assistant
 * to explain it via the `explain` output), and a short micro-lesson with a check question.
 *
 * Interim until the platform guidance components land: the content lives in
 * the `activity` i18n scope in the same intro / why / lesson structure, so it
 * can move to `assets/guidance/<lang>/activity.json` unchanged.
 */
@Component({
  selector: 'app-activity-guide',
  imports: [TranslocoPipe, Icon],
  providers: [provideTranslocoScope('activity')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = 'activity.guide.' + page();
    <section
      class="rounded-card border border-accent-border bg-accent-soft/40 px-5 py-4"
      [attr.aria-labelledby]="p + '-title'"
      data-testid="activity-guide"
    >
      <div class="flex items-start gap-3">
        <span
          class="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-soft text-accent"
          aria-hidden="true"
        >
          <app-icon name="spark" [size]="15" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 [id]="p + '-title'" class="text-[14.5px] font-semibold text-fg">
              {{ p + '.title' | transloco }}
            </h2>
            <button
              type="button"
              data-testid="guide-toggle"
              [attr.aria-expanded]="expanded()"
              [attr.aria-controls]="p + '-body'"
              (click)="expanded.set(!expanded())"
              class="rounded-[7px] px-2 py-1 text-[12.5px] font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              {{ (expanded() ? 'activity.guide.hide' : 'activity.guide.show') | transloco }}
            </button>
          </div>
          <p class="mt-1 text-[13px] leading-relaxed text-fg-muted">
            {{ p + '.body' | transloco }}
          </p>

          @if (expanded()) {
            <div [id]="p + '-body'" class="mt-3 flex flex-col gap-4">
              <ol class="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-fg">
                @for (n of steps(); track n) {
                  <li>{{ p + '.step' + n | transloco }}</li>
                }
              </ol>

              <div>
                <h3 class="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase">
                  {{ 'activity.guide.whyTitle' | transloco }}
                </h3>
                <p class="mt-1 text-[13px] leading-relaxed text-fg-muted">
                  {{ p + '.why' | transloco }}
                </p>
                <ul
                  class="mt-2 flex flex-wrap gap-1.5"
                  [attr.aria-label]="'activity.guide.clausesLabel' | transloco"
                >
                  @for (ref of content().clauses; track ref) {
                    <li>
                      @if (aiAvailable()) {
                        <button
                          type="button"
                          data-testid="guide-clause"
                          (click)="explainClause(ref)"
                          [attr.title]="'activity.guide.explainClause' | transloco"
                          class="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-medium text-fg hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          {{ 'activity.guide.clauses.' + slug(ref) | transloco }}
                        </button>
                      } @else {
                        <span
                          class="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] font-medium text-fg"
                          >{{ 'activity.guide.clauses.' + slug(ref) | transloco }}</span
                        >
                      }
                    </li>
                  }
                </ul>
              </div>

              <details class="group rounded-tile border border-border bg-surface px-4 py-3">
                <summary
                  class="cursor-pointer text-[13px] font-semibold text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  {{ 'activity.guide.lessonLabel' | transloco }}:
                  {{ p + '.lesson.title' | transloco }}
                </summary>
                <div class="mt-3 flex flex-col gap-3">
                  @for (n of sections(); track n) {
                    <div>
                      <h4 class="text-[13px] font-semibold text-fg">
                        {{ p + '.lesson.s' + n + '.heading' | transloco }}
                      </h4>
                      <p class="mt-0.5 text-[13px] leading-relaxed text-fg-muted">
                        {{ p + '.lesson.s' + n + '.body' | transloco }}
                      </p>
                    </div>
                  }
                  <div class="rounded-tile bg-surface-2 px-3 py-2.5">
                    <p class="text-[13px] font-semibold text-fg">
                      {{ 'activity.guide.checkLabel' | transloco }}
                      {{ p + '.lesson.check.question' | transloco }}
                    </p>
                    @if (answerShown()) {
                      <p class="mt-1 text-[13px] text-fg-muted" data-testid="guide-answer">
                        {{ p + '.lesson.check.answer' | transloco }}
                      </p>
                    } @else {
                      <button
                        type="button"
                        (click)="answerShown.set(true)"
                        class="mt-1 rounded-[7px] px-1.5 py-0.5 text-[12.5px] font-medium text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      >
                        {{ 'activity.guide.showAnswer' | transloco }}
                      </button>
                    }
                  </div>
                </div>
              </details>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class ActivityGuide {
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);

  readonly page = input.required<ActivityGuidePageKey>();
  /** A ready-to-send assistant prompt explaining a clause; the host opens the assistant. */
  readonly explain = output<string>();

  protected readonly expanded = signal(true);
  protected readonly answerShown = signal(false);
  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly content = computed<ActivityGuidePage>(() => ACTIVITY_GUIDE_PAGES[this.page()]);
  protected readonly steps = computed(() => range(this.content().steps));
  protected readonly sections = computed(() => range(this.content().lessonSections));

  protected slug(ref: string): string {
    return clauseSlug(ref);
  }

  /** Ask the assistant to explain a clause in the context of notifications. */
  protected explainClause(ref: string): void {
    const clause = this.language.translate(`activity.guide.clauses.${clauseSlug(ref)}`);
    this.explain.emit(this.language.translate('activity.ai.explainClausePrompt', { clause }));
  }
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}
