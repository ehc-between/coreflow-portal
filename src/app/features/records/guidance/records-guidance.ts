import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RecordsGuidanceService } from '../../../core/records/records-guidance.service';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { AskPanelService } from '../../ask/ask-panel.service';

/*
 * Learning-mode pieces for the record designer, rendering the F6 content
 * format from `assets/guidance/<lang>/records.json`. Interim stand-ins with the
 * same roles as the platform's `<app-guide-intro>`, `<app-why-it-matters>`,
 * `<app-field-help>`, `<app-teaching-empty>` and `<app-lesson>`; the integrator
 * swaps them once F6 is on main.
 */

const COLLAPSE_KEY = 'coreflow.records.guide.collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(COLLAPSE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/** Page intro with steps; collapsible, and the choice is remembered per page. */
@Component({
  selector: 'app-records-guide-intro',
  imports: [TranslocoPipe, Icon, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as intro) {
      <aside
        class="rounded-card border border-accent-border bg-accent-soft/50 px-4 py-3"
        [attr.aria-label]="'records.guide.introLabel' | transloco"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 text-left"
          [attr.aria-expanded]="!collapsed()"
          (click)="toggle()"
        >
          <span class="flex text-accent"><app-icon name="spark" [size]="16" /></span>
          <span class="flex-1 text-[13.5px] font-semibold text-fg">{{ intro.title }}</span>
          <span class="text-[12px] font-semibold text-accent">
            {{ (collapsed() ? 'records.guide.show' : 'records.guide.hide') | transloco }}
          </span>
        </button>
        @if (!collapsed()) {
          <div
            class="mt-2 text-[13px] leading-relaxed text-fg-muted"
            [innerHTML]="intro.body | appMarkdown"
          ></div>
          @if (intro.steps?.length) {
            <ol class="mt-2 list-decimal pl-5 text-[13px] leading-relaxed text-fg-muted">
              @for (step of intro.steps; track $index) {
                <li>{{ step }}</li>
              }
            </ol>
          }
        }
      </aside>
    }
  `,
})
export class RecordsGuideIntro {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly page = input.required<string>();

  private readonly state = signal(readCollapsed());
  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.intro ?? null,
  );
  protected readonly collapsed = computed(() => this.state()[this.page()] === true);

  protected toggle(): void {
    const next = { ...this.state(), [this.page()]: !this.collapsed() };
    this.state.set(next);
    try {
      globalThis.localStorage?.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode); the toggle still works for this visit.
    }
  }
}

/** "Why this matters" with clause chips that open the assistant to explain the clause. */
@Component({
  selector: 'app-records-why',
  imports: [TranslocoPipe, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as why) {
      <section
        class="rounded-card border border-border bg-surface p-4"
        [attr.aria-label]="'records.guide.whyTitle' | transloco"
      >
        <h2 class="mb-1.5 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
          {{ 'records.guide.whyTitle' | transloco }}
        </h2>
        <div
          class="text-[13px] leading-relaxed text-fg-muted"
          [innerHTML]="why.body | appMarkdown"
        ></div>
        @if (why.clauses?.length) {
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (clause of why.clauses; track clause) {
              <button
                type="button"
                class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
                [attr.aria-label]="
                  'records.guide.explainClause' | transloco: { clause: clauseLabel(clause) }
                "
                (click)="explain(clause)"
              >
                {{ clauseLabel(clause) }}
              </button>
            }
          </div>
        }
      </section>
    }
  `,
})
export class RecordsWhy {
  private readonly guidance = inject(RecordsGuidanceService);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);

  readonly page = input.required<string>();

  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.why ?? null,
  );

  /** `iso9001:4.4` -> `ISO 9001 4.4`, `hs:7.5` -> `HS 7.5`. */
  protected clauseLabel(ref: string): string {
    const [framework, clause] = ref.split(':');
    const name = framework
      .replace(/^iso(\d+)/i, 'ISO $1')
      .replace(/^hs$/i, 'HS')
      .toUpperCase();
    return clause ? `${name} ${clause}` : name;
  }

  protected explain(ref: string): void {
    this.ask.showWith(
      this.transloco.translate('records.guide.clausePrompt', { clause: this.clauseLabel(ref) }),
    );
  }
}

/** Inline field help (and an example, when the content has one). */
@Component({
  selector: 'app-records-field-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as help) {
      <p class="text-[11.5px] leading-snug text-fg-subtle">
        {{ help.help }}
        @if (help.example) {
          <span class="block italic">{{ help.example }}</span>
        }
      </p>
    }
  `,
})
export class RecordsFieldHelp {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly page = input.required<string>();
  readonly field = input.required<string>();

  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.fields?.[this.field()] ?? null,
  );
}

/** Empty state that teaches: what this list is for, and a call to action. */
@Component({
  selector: 'app-records-teaching-empty',
  imports: [Button, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as empty) {
      <div class="px-6 py-10 text-center">
        <h3 class="font-display text-[16px] font-bold text-fg">{{ empty.title }}</h3>
        <div
          class="mx-auto mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-fg-muted"
          [innerHTML]="empty.body | appMarkdown"
        ></div>
        @if (empty.cta && showAction()) {
          <div class="mt-4">
            <app-button (click)="action.emit()">{{ empty.cta }}</app-button>
          </div>
        }
      </div>
    }
  `,
})
export class RecordsTeachingEmpty {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly page = input.required<string>();
  readonly showAction = input(true);
  readonly action = output<void>();

  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.empty ?? null,
  );
}

/** A micro-lesson: a button that opens the lesson (sections + a short quiz) in a side panel. */
@Component({
  selector: 'app-records-lesson',
  imports: [TranslocoPipe, Button, Icon, SlideOver, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as lesson) {
      <app-button variant="ghost" size="sm" (click)="open.set(true)">
        <app-icon name="training" [size]="15" />
        {{ 'records.guide.lessonButton' | transloco: { minutes: lesson.minutes } }}
      </app-button>
      <app-slide-over
        [open]="open()"
        [title]="lesson.title"
        [subtitle]="'records.guide.lessonMinutes' | transloco: { minutes: lesson.minutes }"
        [closeLabel]="'records.guide.close' | transloco"
        [width]="560"
        (closed)="open.set(false)"
      >
        <div class="flex flex-col gap-5">
          @for (section of lesson.sections; track $index) {
            <section>
              <h3 class="font-display text-[15px] font-bold text-fg">{{ section.heading }}</h3>
              <div
                class="mt-1 text-[13.5px] leading-relaxed text-fg-muted"
                [innerHTML]="section.body | appMarkdown"
              ></div>
            </section>
          }
          @if (lesson.quiz?.length) {
            <section class="rounded-tile border border-border p-3">
              <h3 class="mb-2 text-[12px] font-bold tracking-[0.06em] text-fg-subtle uppercase">
                {{ 'records.guide.quiz' | transloco }}
              </h3>
              @for (q of lesson.quiz; track $index; let qi = $index) {
                <fieldset class="mb-4 last:mb-0">
                  <legend class="mb-1.5 text-[13.5px] font-semibold text-fg">
                    {{ q.question }}
                  </legend>
                  @for (option of q.options; track $index; let oi = $index) {
                    <label
                      class="flex cursor-pointer items-center gap-2 py-0.5 text-[13px] text-fg"
                    >
                      <input
                        type="radio"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [name]="'quiz-' + qi"
                        [checked]="answers()[qi] === oi"
                        (change)="answer(qi, oi)"
                      />
                      {{ option }}
                    </label>
                  }
                  @if (answers()[qi] !== undefined) {
                    <p
                      class="mt-1 text-[12.5px] font-medium"
                      [class.text-pass]="answers()[qi] === q.answer"
                      [class.text-fail]="answers()[qi] !== q.answer"
                      role="status"
                    >
                      {{
                        (answers()[qi] === q.answer
                          ? 'records.guide.correct'
                          : 'records.guide.incorrect'
                        ) | transloco
                      }}
                      @if (q.explanation) {
                        <span class="block font-normal text-fg-muted">{{ q.explanation }}</span>
                      }
                    </p>
                  }
                </fieldset>
              }
            </section>
          }
        </div>
      </app-slide-over>
    }
  `,
})
export class RecordsLesson {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly lesson = input.required<string>();

  protected readonly open = signal(false);
  protected readonly answers = signal<Record<number, number>>({});
  protected readonly content = computed(
    () => this.guidance.content()?.lessons?.[this.lesson()] ?? null,
  );

  protected answer(question: number, option: number): void {
    this.answers.update((all) => ({ ...all, [question]: option }));
  }
}
