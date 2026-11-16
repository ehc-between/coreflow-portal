import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import { TutorService } from '../../../core/guidance/tutor.service';
import { LessonView } from '../../guidance/lesson';
import { TourService } from '../../guidance/tour.service';
import { MarkdownPipe } from '../../markdown/markdown.pipe';
import { Icon } from '../icon/icon';
import { SlideOver } from '../slide-over/slide-over';

let nextId = 0;

type Stored = 'open' | 'closed' | 'seen' | null;

/**
 * The one place a page offers learning (docs/ux-guide.md, rule 7): a single
 * collapsible row with the page intro from the guidance file and up to three
 * actions, always with the same names:
 *
 * - "Omvisning" — the interactive tour (`tour`),
 * - "Leksjon · 5 min" — the micro-lesson (`lesson`), opened in a side panel,
 * - "Forklar denne siden" — the assistant as tutor for this page.
 *
 *   <app-help-strip scope="risk" page="list" tour="register" lesson="risk-basics" />
 *
 * Expanded for beginners and on the first visit; after that it remembers what the
 * user chose (localStorage `coreflow.help.<scope>.<page>`). On phones it starts
 * collapsed so the list is in the first screen.
 */
@Component({
  selector: 'app-help-strip',
  imports: [TranslocoPipe, MarkdownPipe, Icon, SlideOver, LessonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mb-5 block empty:hidden' },
  template: `
    @if (visible()) {
      <section
        data-testid="help-strip"
        class="rounded-card border border-info/25 bg-info-soft/60"
        [attr.aria-label]="'ui.help.label' | transloco"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <button
            type="button"
            data-testid="help-strip-toggle"
            class="flex min-h-8 min-w-0 flex-1 items-center gap-2.5 rounded-tile text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="panelId"
            (click)="toggle()"
          >
            <span
              class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-info text-meta font-bold text-white"
              aria-hidden="true"
              >i</span
            >
            <span class="min-w-0 flex-1 truncate text-ui font-semibold text-fg">
              {{ intro()?.title || ('ui.help.title' | transloco) }}
            </span>
            <span
              class="flex flex-none text-fg-subtle transition-transform motion-reduce:transition-none"
              [class.rotate-180]="expanded()"
              aria-hidden="true"
              ><app-icon name="chevron" [size]="15"
            /></span>
          </button>
          <div
            class="flex-wrap items-center gap-2"
            [class]="expanded() ? 'flex' : 'hidden sm:flex'"
            data-testid="help-strip-actions"
          >
            @if (hasTour()) {
              <button
                type="button"
                data-testid="help-strip-tour"
                class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                (click)="startTour()"
              >
                <app-icon name="arrow" [size]="14" />
                {{ 'ui.help.tour' | transloco }}
              </button>
            }
            @if (lessonContent(); as l) {
              <button
                type="button"
                data-testid="help-strip-lesson"
                class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                (click)="lessonOpen.set(true)"
              >
                <app-icon name="book" [size]="14" />
                @if (l.minutes) {
                  {{ 'ui.help.lessonMinutes' | transloco: { minutes: l.minutes } }}
                } @else {
                  {{ 'ui.help.lesson' | transloco }}
                }
              </button>
            }
            @if (canExplain()) {
              <button
                type="button"
                data-testid="help-strip-explain"
                class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-accent-border bg-accent-soft px-3 text-ui font-semibold text-accent hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                (click)="explain()"
              >
                <app-icon name="spark" [size]="14" />
                {{ 'ui.help.explain' | transloco }}
              </button>
            }
          </div>
        </div>
        @if (expanded() && intro(); as i) {
          <div [id]="panelId" class="border-t border-info/20 px-4 pt-3 pb-4 sm:pl-[52px]">
            <div class="cf-prose text-ui text-fg-muted" [innerHTML]="i.body | appMarkdown"></div>
            @if (i.steps?.length) {
              <ol class="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-ui text-fg">
                @for (step of i.steps; track $index) {
                  <li class="cf-prose" [innerHTML]="step | appMarkdown"></li>
                }
              </ol>
            }
          </div>
        }
      </section>

      @if (lesson(); as key) {
        <app-slide-over
          [open]="lessonOpen()"
          [title]="lessonContent()?.title ?? ''"
          [subtitle]="
            lessonContent()?.minutes
              ? ('ui.help.lessonMinutes' | transloco: { minutes: lessonContent()?.minutes })
              : ''
          "
          [closeLabel]="'common.dismiss' | transloco"
          [width]="560"
          (closed)="lessonOpen.set(false)"
        >
          @if (lessonOpen()) {
            <app-lesson [scope]="scope()" [lesson]="key" />
          }
        </app-slide-over>
      }
    }
  `,
})
export class HelpStrip {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);
  private readonly tutor = inject(TutorService);
  private readonly tours = inject(TourService);
  private readonly availability = inject(AiAvailability);

  /** Guidance scope (the module's portal path, e.g. `risk`). */
  readonly scope = input.required<string>();
  /** Page key in the guidance file (`pages.<page>`). */
  readonly page = input.required<string>();
  readonly tour = input<string | null | undefined>(null);
  readonly lesson = input<string | null | undefined>(null);
  /** Readable page name for "Forklar denne siden" (defaults to the intro title). */
  readonly subject = input<string | null | undefined>(null);

  protected readonly panelId = `cf-help-strip-${++nextId}`;
  protected readonly lessonOpen = signal(false);

  protected readonly intro = computed(
    () => this.content.readPage(this.scope(), this.page())?.intro ?? null,
  );
  protected readonly hasTour = computed(() => {
    const tour = this.tour();
    return !!tour && this.content.readTour(this.scope(), tour).length > 0;
  });
  protected readonly lessonContent = computed(() => {
    const lesson = this.lesson();
    return lesson ? this.content.readLesson(this.scope(), lesson) : null;
  });
  protected readonly canExplain = computed(() => !this.availability.unavailable());
  protected readonly visible = computed(
    () => !!this.intro() || this.hasTour() || !!this.lessonContent() || this.canExplain(),
  );

  private readonly storageKey = computed(() => `coreflow.help.${this.scope()}.${this.page()}`);

  protected readonly expanded = linkedSignal(() => {
    const stored = readStored(this.storageKey());
    if (stored === 'open') {
      return true;
    }
    if (stored === 'closed' || isNarrow()) {
      return false;
    }
    if (this.guidance.isBeginner()) {
      return true;
    }
    if (stored === 'seen') {
      return false;
    }
    // First visit: open once, collapsed on later visits unless the user opens it.
    writeStored(this.storageKey(), 'seen');
    return true;
  });

  protected toggle(): void {
    const next = !this.expanded();
    this.expanded.set(next);
    writeStored(this.storageKey(), next ? 'open' : 'closed');
  }

  protected startTour(): void {
    const tour = this.tour();
    if (tour) {
      void this.tours.start(this.scope(), tour);
    }
  }

  protected explain(): void {
    const subject = this.subject() || this.intro()?.title || null;
    this.tutor.teach(`${this.scope()}.${this.page()}`, subject);
  }
}

function readStored(key: string): Stored {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === 'open' || value === 'closed' || value === 'seen' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: Exclude<Stored, null>): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Best effort (private mode).
  }
}

function isNarrow(): boolean {
  return globalThis.matchMedia?.('(max-width: 639px)').matches ?? false;
}
