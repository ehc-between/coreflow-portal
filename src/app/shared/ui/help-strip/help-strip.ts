import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../../core/guidance/guidance.service';
import {
  PageHelpRegistry,
  PageWhyEntry,
  firstSentence,
} from '../../../core/guidance/page-help.registry';
import { termKeys } from '../../../core/guidance/term-tokens';
import { TutorService } from '../../../core/guidance/tutor.service';
import { RecordPageContext } from '../../kit/record-page-context';
import { GuidanceText } from '../../guidance/guidance-text';
import { LessonView } from '../../guidance/lesson';
import { TourService } from '../../guidance/tour.service';
import { WhyItMatters } from '../../guidance/why-it-matters';
import { Icon } from '../icon/icon';
import { SlideOver } from '../slide-over/slide-over';

/**
 * The one help entry point of a page (docs/ux-guide.md rule 7; simplify U38, "change
 * what is shown, not how much text"). The page shows a single line and a "?" button;
 * everything that teaches sits behind the "?" in a side panel:
 *
 * - the page intro and its steps (`pages.<page>.intro`),
 * - "Omvisning" — the interactive tour (`tour`),
 * - "Leksjon · 5 min" — the micro-lesson (`lesson`), opened inside the panel,
 * - "Forklar denne siden" — the assistant as tutor for this page,
 * - "Hvorfor dette er viktig" — the why-notes of the page. `<app-why-it-matters>` on the
 *   same page renders nothing while a strip is present and shows up here instead.
 *
 *   <app-help-strip scope="risk" page="list" tour="register" lesson="risk-basics" />
 *
 * Beginners see the first sentence of the intro and a labelled "Slik fungerer siden"
 * button; standard and expert users see the intro title and a compact "?". The line is
 * one row on desktop (at most two on phones), so the work starts in the first screen.
 *
 * On a record page (`app-record-detail-layout`, U29) the line is not shown at all: the
 * layout puts the "?" in the page header and it opens this strip's panel.
 */
@Component({
  selector: 'app-help-strip',
  imports: [TranslocoPipe, Icon, SlideOver, LessonView, WhyItMatters, GuidanceText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "inRecordPage ? 'contents' : 'mb-5 block empty:hidden'" },
  template: `
    @if (visible()) {
      @if (!inRecordPage) {
        <section
          data-testid="help-strip"
          class="flex items-center gap-3 rounded-card border border-info/25 bg-info-soft/60 px-3 py-1.5 sm:px-4"
          [attr.aria-label]="'ui.help.label' | transloco"
        >
          <span
            class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-info text-meta font-bold text-white"
            aria-hidden="true"
            >i</span
          >
          <p
            data-testid="help-strip-lead"
            class="line-clamp-2 min-w-0 flex-1 text-ui text-fg sm:line-clamp-1"
            [class.font-semibold]="!beginner()"
          >
            @if (lead(); as text) {
              <app-guidance-text
                [text]="text"
                [scope]="scope()"
                [inline]="true"
                [tooltips]="false"
              />
            } @else {
              {{ 'ui.help.title' | transloco }}
            }
          </p>
          <button
            type="button"
            data-testid="help-strip-toggle"
            class="inline-flex h-8 flex-none items-center gap-1.5 rounded-tile border border-border bg-surface px-2.5 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            aria-haspopup="dialog"
            [attr.aria-expanded]="panelOpen()"
            [attr.aria-label]="beginner() ? null : ('ui.help.open' | transloco)"
            [title]="'ui.help.open' | transloco"
            (click)="openPanel()"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full border border-current text-meta leading-none font-bold"
              aria-hidden="true"
              >?</span
            >
            @if (beginner()) {
              <span class="hidden sm:inline">{{ 'ui.help.open' | transloco }}</span>
              <span class="sr-only sm:hidden">{{ 'ui.help.open' | transloco }}</span>
            }
          </button>
        </section>
      }

      <app-slide-over
        [open]="panelOpen()"
        [title]="panelTitle() || ('ui.help.title' | transloco)"
        [subtitle]="'ui.help.open' | transloco"
        [closeLabel]="'common.dismiss' | transloco"
        [width]="560"
        (closed)="closePanel()"
      >
        @if (panelOpen()) {
          @if (openLesson(); as open) {
            <button
              type="button"
              data-testid="help-strip-back"
              class="mb-3 inline-flex h-8 items-center gap-1.5 rounded-tile px-2 text-ui font-semibold text-accent hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              (click)="openLesson.set(null)"
            >
              <span aria-hidden="true">←</span> {{ 'ui.help.back' | transloco }}
            </button>
            <app-lesson [scope]="open.scope" [lesson]="open.key" />
          } @else {
            <div data-testid="help-panel" class="flex flex-col gap-5">
              @if (intro(); as i) {
                <div>
                  <app-guidance-text
                    class="cf-prose text-ui text-fg-muted"
                    [text]="i.body"
                    [scope]="scope()"
                  />
                  @if (i.steps?.length) {
                    <ol class="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-ui text-fg">
                      @for (step of i.steps; track $index) {
                        <li class="cf-prose">
                          <app-guidance-text
                            [text]="step"
                            [scope]="scope()"
                            [inline]="true"
                            [seen]="stepSeen()[$index]"
                          />
                        </li>
                      }
                    </ol>
                  }
                </div>
              }
              @if (hasTour() || lessonContent() || canExplain()) {
                <div class="flex flex-wrap items-center gap-2" data-testid="help-strip-actions">
                  @if (hasTour()) {
                    <button
                      type="button"
                      data-testid="help-strip-tour"
                      class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
                      class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      (click)="openLesson.set({ scope: scope(), key: lesson()! })"
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
                      class="inline-flex h-9 items-center gap-1.5 rounded-tile border border-accent-border bg-accent-soft px-3 text-ui font-semibold text-accent hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      (click)="explain()"
                    >
                      <app-icon name="spark" [size]="14" />
                      {{ 'ui.help.explain' | transloco }}
                    </button>
                  }
                </div>
              }
              @if (moreLessons().length) {
                <section data-testid="help-strip-more-lessons">
                  <h3 class="text-meta font-bold tracking-wide text-fg-subtle uppercase">
                    {{ 'ui.help.moreLessons' | transloco }}
                  </h3>
                  <ul class="mt-2 flex flex-col gap-1.5">
                    @for (item of moreLessons(); track item.scope + '.' + item.key) {
                      <li>
                        <button
                          type="button"
                          data-testid="help-strip-more-lesson"
                          class="inline-flex min-h-8 items-center gap-1.5 text-left text-ui font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          (click)="openLesson.set({ scope: item.scope, key: item.key })"
                        >
                          <app-icon name="book" [size]="14" />
                          {{ item.title }}
                          @if (item.minutes) {
                            <span class="font-normal text-fg-subtle">{{
                              'ui.help.minutes' | transloco: { minutes: item.minutes }
                            }}</span>
                          }
                        </button>
                      </li>
                    }
                  </ul>
                </section>
              }
              @for (why of whyNotes(); track why.scope + '.' + why.page) {
                <app-why-it-matters
                  [inPanel]="true"
                  [scope]="why.scope"
                  [page]="why.page"
                  [frameworks]="why.frameworks"
                />
              }
            </div>
          }
        }
      </app-slide-over>
    }
  `,
})
export class HelpStrip {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);
  private readonly tutor = inject(TutorService);
  private readonly tours = inject(TourService);
  private readonly availability = inject(AiAvailability);
  private readonly registry = inject(PageHelpRegistry);
  private readonly recordPage = inject(RecordPageContext, { optional: true });
  /** On a record page the layout's header "?" opens the panel (no line here). */
  protected readonly inRecordPage = !!this.recordPage;

  /** Guidance scope (the module's portal path, e.g. `risk`). */
  readonly scope = input.required<string>();
  /** Page key in the guidance file (`pages.<page>`). */
  readonly page = input.required<string>();
  readonly tour = input<string | null | undefined>(null);
  readonly lesson = input<string | null | undefined>(null);
  /** Readable page name for "Forklar denne siden" (defaults to the intro title). */
  readonly subject = input<string | null | undefined>(null);

  protected readonly panelOpen = signal(false);
  /** The lesson shown inside the panel (the page's own or one handed over). */
  protected readonly openLesson = signal<{ scope: string; key: string } | null>(null);
  protected readonly beginner = this.guidance.isBeginner;

  protected readonly intro = computed(
    () => this.content.readPage(this.scope(), this.page())?.intro ?? null,
  );
  private readonly ownWhy = computed(
    () => this.content.readPage(this.scope(), this.page())?.why ?? null,
  );
  /** Beginners: the intro's first sentence; others: the intro title. */
  protected readonly lead = computed(() => {
    const intro = this.intro();
    if (!intro) {
      return '';
    }
    return this.beginner() ? firstSentence(intro.body) || intro.title : intro.title;
  });
  protected readonly panelTitle = computed(() => this.intro()?.title ?? '');
  /** Per step: the term keys already explained in the body and the steps above it. */
  protected readonly stepSeen = computed<string[][]>(() => {
    const intro = this.intro();
    const seen = termKeys(intro?.body);
    return (intro?.steps ?? []).map((step) => {
      const before = [...seen];
      seen.push(...termKeys(step));
      return before;
    });
  });
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
    () =>
      !!this.intro() ||
      !!this.ownWhy() ||
      this.hasTour() ||
      !!this.lessonContent() ||
      this.moreLessons().length > 0 ||
      this.canExplain(),
  );
  /** Lessons other widgets on the page handed over ("Lær mer" cards), minus the strip's own. */
  protected readonly moreLessons = computed(() =>
    this.registry
      .lessonEntries()
      .filter((e) => !(e.scope === this.scope() && e.key === this.lesson()))
      .map((e) => ({ ...e, lesson: this.content.readLesson(e.scope, e.key) }))
      .filter((e) => e.lesson !== null)
      .map((e) => ({
        scope: e.scope,
        key: e.key,
        title: e.lesson!.title,
        minutes: e.lesson!.minutes ?? null,
      })),
  );
  /** The page's own why-note first, then the ones other widgets on the page handed over. */
  protected readonly whyNotes = computed<PageWhyEntry[]>(() => {
    const own: PageWhyEntry = { scope: this.scope(), page: this.page(), frameworks: null };
    const others = this.registry
      .whyEntries()
      .filter((e) => !(e.scope === own.scope && e.page === own.page));
    const registeredOwn = this.registry
      .whyEntries()
      .find((e) => e.scope === own.scope && e.page === own.page);
    return [registeredOwn ?? own, ...others];
  });

  constructor() {
    inject(DestroyRef).onDestroy(this.registry.addStrip());
    const page = this.recordPage;
    if (page) {
      const open = () => this.openPanel();
      effect(() => page.help.set(this.visible() ? open : null));
      inject(DestroyRef).onDestroy(() => {
        if (page.help() === open) {
          page.help.set(null);
        }
      });
    }
  }

  protected openPanel(): void {
    this.openLesson.set(null);
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.openLesson.set(null);
  }

  protected startTour(): void {
    const tour = this.tour();
    if (tour) {
      this.closePanel();
      void this.tours.start(this.scope(), tour);
    }
  }

  protected explain(): void {
    const subject = this.subject() || this.intro()?.title || null;
    this.closePanel();
    this.tutor.teach(`${this.scope()}.${this.page()}`, subject);
  }
}
