import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  SecurityContext,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { marked } from 'marked';
import { entityTypeLabel } from '../../core/search/entity-label';
import { internalLink } from '../../core/search/internal-link';
import { LanguageService } from '../../core/i18n/language.service';
import { fallbackContext } from '../../core/ai/page-context';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import { Icon } from '../../shared/ui/icon/icon';
import { AskActionCardView } from './ask-action-card';
import { AskFeedback } from './ask-feedback';
import { moduleFromUrl, recordIcon } from './ask-icons';
import { statusLabel } from './ask-status';
import { suggestionKeys, suggestionSet } from './ask-suggestions';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { AskPanelService, AskTurn } from './ask-panel.service';

marked.setOptions({ gfm: true, breaks: true });

/** Records shown under an answer before "Show all". */
export const RECORDS_COLLAPSED = 5;

/** A record or cited source under an answer, ready for `app-entity-chip`. */
export interface AnswerRecord extends EntityChipRef {
  readonly icon: string;
}

/**
 * The records an answer is about: the `link` events first (records the assistant
 * listed, opened or cited), then cited sources not already among them. Each keeps
 * an in-app url only (anything else renders as plain text). Pure, so it is easy
 * to test and cheap to call from the template.
 */
export function answerRecords(turn: Pick<AskTurn, 'links' | 'sources'>): AnswerRecord[] {
  const out: AnswerRecord[] = [];
  const seen = new Set<string>();
  const add = (ref: Omit<AnswerRecord, 'icon' | 'module'>) => {
    const key = `${ref.entity_type}:${ref.entity_id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const url = internalLink(ref.url) ? ref.url : null;
    const module = moduleFromUrl(url);
    out.push({
      ...ref,
      url,
      module,
      icon: recordIcon(ref.entity_type, module),
    });
  };
  for (const link of turn.links ?? []) {
    add({
      entity_type: link.entity_type,
      entity_id: link.entity_id,
      title: link.title,
      code: link.code,
      url: link.url,
    });
  }
  for (const source of turn.sources ?? []) {
    const entityType = source.entity_type ?? 'document';
    add({
      entity_type: entityType,
      entity_id: source.id,
      title: source.title,
      code: source.doc_code || null,
      url: source.url ?? (entityType === 'document' ? `/documents/${source.id}` : null),
    });
  }
  return out;
}

/**
 * Ask CoreFlow slide-over. A thin view over {@link AskPanelService}: it renders the
 * service's conversation thread (each assistant turn streams as sanitized markdown)
 * and forwards user actions (submit, pick, stop, new chat) to the service. A 503
 * renders a friendly "not set up yet" state.
 *
 * P2:
 * - the working label is translated from the status event's category (and record
 *   type), never shown in English in an nb session;
 * - answers separate text from different model turns, and turns are divided;
 * - the records an answer is about (link events + cited sources) render as
 *   `app-entity-chip` rows with module icons, collapsed after five;
 * - record links inside the answer text navigate in-app;
 * - every finished answer can be copied and rated (thumbs up / down + why);
 * - the empty state offers "Forslag" that fit the page (a requirement, a record,
 *   a list, a form, the dashboard …).
 *
 * F5: a chip names the page the assistant is told about (detachable per
 * conversation), a banner shows tutor mode, and proposed changes render as
 * Confirm / Discard cards ({@link AskActionCardView}). Strings live in the global
 * `ask.*` keys and the `search` + `ask` scopes.
 *
 * Closing the panel (×, Esc, backdrop) only MINIMIZES it — `hide()` keeps the
 * stream running in the service. Zoneless: stream events land in signals.
 */
@Component({
  selector: 'app-ask-panel',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    Icon,
    AskActionCardView,
    AskFeedback,
    EntityChip,
  ],
  viewProviders: [provideSharedScope('search', 'ask')],
  host: { '(document:keydown.escape)': 'onEscape()', '(click)': 'onLinkClick($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Answer markdown is rendered through innerHTML, so its table styles cannot be
  // view-encapsulated; every selector is scoped to the panel instead.
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-ask-panel .cf-prose table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      border-collapse: collapse;
      margin: 0.5rem 0;
      font-size: var(--text-ui);
    }
    app-ask-panel .cf-prose th,
    app-ask-panel .cf-prose td {
      padding: 0.375rem 0.75rem 0.375rem 0;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    app-ask-panel .cf-prose th {
      color: var(--fg-muted);
      font-size: var(--text-meta);
      font-weight: 600;
      white-space: nowrap;
    }
    app-ask-panel .cf-prose a {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  `,
  template: `
    @if (panel.open()) {
      <div class="fixed inset-0 z-[40] flex justify-end">
        <button
          type="button"
          (click)="close()"
          [attr.aria-label]="'ask.minimize' | transloco"
          class="absolute inset-0 cursor-default bg-black/30"
        ></button>
        <aside
          class="animate-cf-slide-in relative flex h-full w-full max-w-[480px] flex-col border-l border-border bg-surface shadow-pop"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'ask.title' | transloco"
        >
          <header class="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent"
            >
              <app-icon name="spark" [size]="16" />
            </span>
            <h2 class="flex-1 font-display text-card font-bold tracking-[-0.02em] text-fg">
              {{ 'ask.title' | transloco }}
            </h2>
            @if (thread().length > 0) {
              <button
                type="button"
                (click)="newChat()"
                [attr.aria-label]="'ask.newChat' | transloco"
                [title]="'ask.newChat' | transloco"
                class="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <app-icon name="plus" [size]="18" />
              </button>
            }
            <button
              type="button"
              (click)="close()"
              [attr.aria-label]="'ask.minimize' | transloco"
              [title]="'ask.minimize' | transloco"
              class="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <app-icon name="x" [size]="18" />
            </button>
          </header>

          @if (state() !== 'not-configured') {
            @if (panel.mode() === 'tutor') {
              <div
                class="flex flex-none items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-ui text-accent"
                role="status"
              >
                <app-icon name="training" [size]="15" />
                <span class="min-w-0 flex-1 truncate font-semibold">
                  @if (panel.topic(); as topic) {
                    {{ 'search.tutor.bannerTopic' | transloco: { topic } }}
                  } @else {
                    {{ 'search.tutor.banner' | transloco }}
                  }
                </span>
                <button
                  type="button"
                  (click)="panel.exitTutor()"
                  class="flex-none rounded-md px-2 py-1 font-semibold hover:bg-surface"
                >
                  {{ 'search.tutor.exit' | transloco }}
                </button>
              </div>
            }
            @if (contextTitle(); as title) {
              <div
                class="flex flex-none items-center gap-2 border-b border-border px-4 py-2 text-ui"
              >
                <span class="flex flex-none text-fg-subtle"
                  ><app-icon name="link" [size]="14"
                /></span>
                @if (panel.usePageContext()) {
                  <span class="min-w-0 flex-1 truncate text-fg-muted">
                    {{ 'search.context.using' | transloco: { title } }}
                  </span>
                  <button
                    type="button"
                    (click)="panel.setUsePageContext(false)"
                    class="flex-none rounded-md px-2 py-1 font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    {{ 'search.context.detach' | transloco }}
                  </button>
                } @else {
                  <span class="min-w-0 flex-1 truncate text-fg-subtle">
                    {{ 'search.context.detached' | transloco }}
                  </span>
                  <button
                    type="button"
                    (click)="panel.setUsePageContext(true)"
                    class="flex-none rounded-md px-2 py-1 font-semibold text-accent hover:bg-accent-soft"
                  >
                    {{ 'search.context.attach' | transloco }}
                  </button>
                }
              </div>
            }
          }

          <div #scroll class="flex-1 overflow-y-auto px-4 py-4">
            @if (state() === 'not-configured') {
              <div class="flex flex-col items-center gap-3 py-10 text-center">
                <span
                  class="flex h-11 w-11 items-center justify-center rounded-card border border-border bg-surface-2 text-fg-muted"
                >
                  <app-icon name="spark" [size]="20" />
                </span>
                <p class="text-body font-semibold text-fg">
                  {{ 'ask.notConfigured.title' | transloco }}
                </p>
                <p class="max-w-[280px] text-ui text-fg-muted">
                  {{ 'ask.notConfigured.body' | transloco }}
                </p>
              </div>
            } @else if (thread().length === 0) {
              <p class="text-body text-fg-muted">{{ 'ask.panel.intro' | transloco }}</p>
              <div class="mt-4 rounded-tile border border-border bg-bg px-3.5 py-3">
                <p class="text-ui font-semibold text-fg" id="ask-suggest-title">
                  {{ suggestTitleKey() | transloco }}
                </p>
                <ul class="mt-2 flex flex-col gap-1" aria-labelledby="ask-suggest-title">
                  @for (key of suggestions(); track key) {
                    <li>
                      <button
                        type="button"
                        (click)="pickSuggestion(key)"
                        class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-ui text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        <span class="flex flex-none pt-0.5 text-accent"
                          ><app-icon name="spark" [size]="13"
                        /></span>
                        <span>{{ key | transloco }}</span>
                      </button>
                    </li>
                  }
                </ul>
              </div>
              <p class="mt-3 flex gap-2 text-ui text-fg-subtle">
                <span class="flex flex-none pt-px"><app-icon name="lock" [size]="14" /></span>
                <span>{{ 'search.intro.confirmNote' | transloco }}</span>
              </p>
              <p class="mt-1.5 flex gap-2 text-ui text-fg-subtle">
                <span class="flex flex-none pt-px"><app-icon name="spark" [size]="14" /></span>
                <span>{{ 'search.intro.shortcut' | transloco }}</span>
              </p>
              @if (panel.mode() !== 'tutor') {
                <button
                  type="button"
                  (click)="teachMe()"
                  class="mt-3 inline-flex items-center gap-1.5 rounded-tile border border-border px-3 py-1.5 text-ui font-semibold text-fg hover:border-accent hover:text-accent"
                >
                  <app-icon name="training" [size]="15" />
                  {{ 'search.tutor.teachMePage' | transloco }}
                </button>
              }
            } @else {
              <div class="flex flex-col gap-4">
                @for (turn of thread(); track turn.id; let first = $first) {
                  @if (turn.role === 'user') {
                    <div
                      class="flex justify-end"
                      [class.border-t]="!first"
                      [class.border-border]="!first"
                      [class.pt-4]="!first"
                    >
                      <div
                        class="max-w-[88%] rounded-tile rounded-br-sm bg-accent-soft px-3 py-2 text-body whitespace-pre-wrap text-fg"
                        [textContent]="turn.text"
                      ></div>
                    </div>
                  } @else {
                    <div class="flex flex-col gap-2">
                      @if (turn.text) {
                        <div class="cf-prose" [innerHTML]="render(turn.text)"></div>
                      }

                      @if (turn.status === 'error') {
                        <p
                          role="alert"
                          class="rounded-tile border border-fail/30 bg-fail-soft px-3 py-2 text-ui font-medium text-fail-ink"
                        >
                          {{ 'ask.error.body' | transloco }}
                        </p>
                      }

                      @if (turn.question; as q) {
                        <div class="mt-0.5 flex flex-col gap-2">
                          <p class="text-body font-medium text-fg">{{ q.question }}</p>
                          @if (!streaming()) {
                            <div class="flex flex-wrap gap-1.5">
                              @for (option of q.options; track option) {
                                <button
                                  type="button"
                                  (click)="pick(option)"
                                  [attr.aria-label]="'ask.chooseOption' | transloco: { option }"
                                  class="rounded-tile border border-border bg-bg px-3 py-1.5 text-ui font-medium text-fg hover:border-accent hover:bg-accent-soft hover:text-accent"
                                >
                                  {{ option }}
                                </button>
                              }
                            </div>
                          }
                        </div>
                      }

                      @let records = recordsOf(turn);
                      @if (records.length) {
                        <section class="mt-1" [attr.aria-label]="'ask.records.heading' | transloco">
                          <div
                            class="mb-1.5 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
                          >
                            {{ 'ask.records.heading' | transloco }}
                          </div>
                          <ul class="flex flex-col gap-1">
                            @for (
                              record of visibleRecords(turn.id, records);
                              track record.entity_type + record.entity_id
                            ) {
                              <li
                                class="flex min-w-0 items-center gap-2 rounded-tile border border-border bg-bg px-2.5 py-1.5 hover:border-border-strong"
                              >
                                <span class="flex flex-none text-fg-subtle"
                                  ><app-icon [name]="record.icon" [size]="15"
                                /></span>
                                <app-entity-chip class="min-w-0 flex-1" [ref]="record" />
                              </li>
                            }
                          </ul>
                          @if (records.length > collapsedCount) {
                            <button
                              type="button"
                              (click)="toggleRecords(turn.id)"
                              class="mt-1 rounded-md px-1.5 py-1 text-meta font-semibold text-accent hover:bg-accent-soft"
                            >
                              @if (expanded().has(turn.id)) {
                                {{ 'ask.records.showFewer' | transloco }}
                              } @else {
                                {{ 'ask.records.showAll' | transloco: { count: records.length } }}
                              }
                            </button>
                          }
                        </section>
                      }

                      @for (card of turn.actions ?? []; track card.action_id) {
                        <app-ask-action-card
                          class="mt-1 block"
                          [card]="card"
                          (confirmed)="panel.confirmAction($event)"
                          (discarded)="panel.rejectAction($event)"
                          (navigated)="close()"
                        />
                      }

                      @if (turn.proposal; as draft) {
                        <div
                          class="mt-1 rounded-tile border border-accent-border bg-accent-soft px-3 py-2.5 text-ui text-accent"
                        >
                          <div class="font-semibold">{{ 'ask.proposal.added' | transloco }}</div>
                          <a
                            routerLink="/review"
                            (click)="close()"
                            class="mt-0.5 inline-flex items-center gap-1 font-semibold underline"
                          >
                            {{ 'ask.proposal.link' | transloco }}
                            <app-icon name="arrow" [size]="14" />
                          </a>
                        </div>
                      }

                      @if (turn.status === 'done' && turn.text) {
                        <app-ask-feedback [turn]="turn" />
                      }
                    </div>
                  }
                }

                @if (streaming()) {
                  <div class="flex items-center gap-2 text-ui text-fg-muted" role="status">
                    <span class="flex flex-none text-accent">
                      <app-icon name="spark" [size]="15" class="animate-cf-pulse" />
                    </span>
                    <span class="animate-cf-pulse">{{
                      workingLabel() ?? ('ask.workingInThread' | transloco)
                    }}</span>
                  </div>
                }
              </div>
            }
          </div>

          @if (state() !== 'not-configured') {
            <form
              class="flex flex-none items-end gap-2 border-t border-border px-4 py-3"
              (ngSubmit)="submit()"
            >
              <textarea
                #input
                [(ngModel)]="question"
                name="question"
                rows="1"
                [placeholder]="'ask.placeholder' | transloco"
                [attr.aria-label]="'ask.title' | transloco"
                (keydown.enter)="onEnter($event)"
                class="max-h-32 min-h-[40px] flex-1 resize-none rounded-tile border border-border bg-bg px-3 py-2.5 text-body text-fg outline-none focus:border-accent"
              ></textarea>
              @if (streaming()) {
                <button
                  type="button"
                  (click)="stop()"
                  class="flex h-10 w-10 flex-none items-center justify-center rounded-tile border border-border bg-surface text-fg-muted hover:bg-surface-2"
                  [attr.aria-label]="'ask.stop' | transloco"
                >
                  <app-icon name="x" [size]="18" />
                </button>
              } @else {
                <button
                  type="submit"
                  [disabled]="!canSubmit()"
                  class="flex h-10 w-10 flex-none items-center justify-center rounded-tile border border-transparent bg-accent text-white hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
                  [attr.aria-label]="'ask.send' | transloco"
                >
                  <app-icon name="send" [size]="17" />
                </button>
              }
            </form>
          }
        </aside>
      </div>
    }
  `,
})
export class AskPanel {
  protected readonly panel = inject(AskPanelService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly scrollRef = viewChild<ElementRef<HTMLElement>>('scroll');

  protected readonly question = signal('');
  protected readonly collapsedCount = RECORDS_COLLAPSED;
  /** Answers whose record list is expanded past {@link RECORDS_COLLAPSED}. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly state = this.panel.state;
  protected readonly thread = this.panel.thread;
  protected readonly streaming = this.panel.streaming;

  protected readonly canSubmit = computed(
    () => this.question().trim().length > 0 && !this.streaming(),
  );

  /** The in-flight status in the UI language (null: show the generic label). */
  protected readonly workingLabel = computed<string | null>(() => {
    const status = this.panel.working();
    if (!status) {
      return null;
    }
    return statusLabel(
      status,
      (key, params) => this.language.translate(key, params),
      (entityType) => this.knownTypeLabel(entityType),
      this.language.active(),
    );
  });

  /** The current url (pages that register no context still get fitting suggestions). */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The page the suggestions are for (none once the user detached it). */
  private readonly suggestionContext = computed(() =>
    this.panel.usePageContext()
      ? (this.panel.pageContext() ?? fallbackContext(this.url() ?? ''))
      : null,
  );

  /** "Forslag" for the current page, as `ask` scope keys. */
  protected readonly suggestions = computed(() => suggestionKeys(this.suggestionContext()));

  protected readonly suggestTitleKey = computed(() =>
    suggestionSet(this.suggestionContext()) === 'general'
      ? 'ask.panel.suggestTitleGeneral'
      : 'ask.panel.suggestTitle',
  );

  /** What the page context chip names: the record title, else the record type. */
  protected readonly contextTitle = computed<string | null>(() => {
    const ctx = this.panel.pageContext();
    if (!ctx) {
      return null;
    }
    if (ctx.title?.trim()) {
      return ctx.title.trim();
    }
    return ctx.entityType ? this.typeLabel(ctx.entityType) : null;
  });

  constructor() {
    // Focus the question box when the panel opens (once the input exists).
    effect(() => {
      const input = this.inputRef()?.nativeElement;
      if (this.panel.open() && input) {
        queueMicrotask(() => input.focus());
      }
    });

    // Keep the conversation pinned to the bottom as turns are added and as the
    // latest answer streams in — but not when an older answer is rated or its
    // record list expanded (the key only changes with new content).
    const progress = computed(() => {
      const turns = this.thread();
      const last = turns.at(-1);
      return `${turns.length}:${last?.text.length ?? 0}:${last?.links?.length ?? 0}:${last?.actions?.length ?? 0}:${this.panel.working()?.category ?? ''}`;
    });
    // Also re-pin when the panel opens (the scroll container is (re)created then,
    // and rendered markdown grows the height after the first frame).
    effect(() => {
      void progress();
      void this.panel.open();
      const el = this.scrollRef()?.nativeElement;
      if (!el) {
        return;
      }
      const pin = () => {
        el.scrollTop = el.scrollHeight;
      };
      queueMicrotask(pin);
      requestAnimationFrame(() => requestAnimationFrame(pin));
    });
  }

  protected typeLabel(entityType: string): string {
    return entityTypeLabel(
      (key) => this.language.translate(key),
      `modules.entities.${entityType}`,
      entityType,
    );
  }

  /** A record type's label, or null when no translation is known for it. */
  private knownTypeLabel(entityType: string): string | null {
    for (const key of [`modules.entities.${entityType}`, `search.types.${entityType}`]) {
      const label = this.language.translate(key);
      if (label && label !== key) {
        return label;
      }
    }
    return null;
  }

  protected recordsOf(turn: AskTurn): AnswerRecord[] {
    return answerRecords(turn);
  }

  protected visibleRecords(turnId: number, records: AnswerRecord[]): AnswerRecord[] {
    return this.expanded().has(turnId) ? records : records.slice(0, RECORDS_COLLAPSED);
  }

  protected toggleRecords(turnId: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }

  protected pickSuggestion(key: string): void {
    this.panel.send(this.language.translate(key));
  }

  protected teachMe(): void {
    this.panel.openTutor();
  }

  protected render(text: string): SafeHtml {
    const html = this.sanitizer.sanitize(
      SecurityContext.HTML,
      marked.parse(text, { async: false }),
    );
    return html ?? '';
  }

  /**
   * Link clicks inside the panel (one host listener; Enter on a focused link fires
   * a click too, so keyboard users get the same):
   * - links inside an answer (`[RSK-1 Title](/risk/…)`) navigate in-app with the
   *   router instead of reloading the app; external links open in a new tab;
   * - after following an answer link or a record chip the panel is minimised so
   *   the page is visible (the conversation is kept).
   * Modified clicks (open in new tab, …) keep the browser's behaviour.
   */
  protected onLinkClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.('a');
    const href = anchor?.getAttribute('href');
    if (!anchor || !href) {
      return;
    }
    if (anchor.closest('.cf-prose')) {
      event.preventDefault();
      if (internalLink(href)) {
        void this.router.navigateByUrl(href);
        this.close();
      } else if (/^https?:\/\//i.test(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } else if (anchor.closest('app-entity-chip')) {
      // The chip navigates itself; minimise so the record is visible.
      this.close();
    }
  }

  protected onEscape(): void {
    if (this.panel.open()) {
      this.close();
    }
  }

  protected onEnter(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey || keyEvent.isComposing) {
      return;
    }
    event.preventDefault();
    this.submit();
  }

  protected submit(): void {
    const text = this.question().trim();
    if (!text) {
      return;
    }
    this.question.set('');
    this.panel.send(text);
  }

  protected pick(option: string): void {
    this.panel.send(option);
  }

  protected stop(): void {
    this.panel.stop();
  }

  protected newChat(): void {
    this.panel.newChat();
    this.question.set('');
    this.expanded.set(new Set());
    queueMicrotask(() => this.inputRef()?.nativeElement.focus());
  }

  /** Minimize: hide the view, keep the stream and thread alive in the service. */
  protected close(): void {
    this.panel.hide();
  }
}
