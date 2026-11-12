import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  SecurityContext,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { marked } from 'marked';
import { entityTypeIcon, entityTypeLabel } from '../../core/search/entity-label';
import { InternalLink, internalLink } from '../../core/search/internal-link';
import { LanguageService } from '../../core/i18n/language.service';
import { AskSource } from '../../core/ai/ai.models';
import { Icon } from '../../shared/ui/icon/icon';
import { AskActionCardView } from './ask-action-card';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { AskPanelService } from './ask-panel.service';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Ask CoreFlow slide-over. A thin view over {@link AskPanelService}: it renders the
 * service's conversation thread (each assistant turn streams token-by-token as
 * sanitized markdown, lists cited documents, surfaces a queued draft, and offers
 * clickable option chips) and forwards user actions (submit, pick, stop, new chat)
 * to the service. A 503 renders a friendly "not set up yet" state.
 *
 * F5: a chip names the page the assistant is told about (detachable per
 * conversation), a banner shows tutor mode, records the assistant opened render
 * as links, and proposed changes render as Confirm / Discard cards
 * ({@link AskActionCardView}). The empty state teaches what to ask and that
 * nothing changes without confirmation. Strings beyond the global ask keys live
 * in the search scope.
 *
 * Closing the panel (×, Esc, backdrop) only MINIMIZES it — `hide()` keeps the
 * stream running in the service, so a long draft survives navigating away. The
 * stream is aborted only via explicit Stop or New chat. Zoneless: stream events
 * land in the service's signals.
 */
@Component({
  selector: 'app-ask-panel',
  imports: [FormsModule, RouterLink, TranslocoPipe, Icon, AskActionCardView],
  viewProviders: [provideSharedScope('search')],
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        >
          <header class="flex flex-none items-center gap-2.5 border-b border-border px-4 py-3">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-[8px] bg-accent-soft text-accent"
            >
              <app-icon name="spark" [size]="16" />
            </span>
            <span class="flex-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
              {{ 'ask.title' | transloco }}
            </span>
            @if (thread().length > 0) {
              <button
                type="button"
                (click)="newChat()"
                [attr.aria-label]="'ask.newChat' | transloco"
                [title]="'ask.newChat' | transloco"
                class="flex h-8 w-8 items-center justify-center rounded-[9px] text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <app-icon name="plus" [size]="18" />
              </button>
            }
            <button
              type="button"
              (click)="close()"
              [attr.aria-label]="'ask.minimize' | transloco"
              [title]="'ask.minimize' | transloco"
              class="flex h-8 w-8 items-center justify-center rounded-[9px] text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <app-icon name="x" [size]="18" />
            </button>
          </header>

          @if (state() !== 'not-configured') {
            @if (panel.mode() === 'tutor') {
              <div
                class="flex flex-none items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-[12.5px] text-accent"
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
                  class="flex-none rounded-[7px] px-2 py-1 font-semibold hover:bg-surface"
                >
                  {{ 'search.tutor.exit' | transloco }}
                </button>
              </div>
            }
            @if (contextTitle(); as title) {
              <div
                class="flex flex-none items-center gap-2 border-b border-border px-4 py-2 text-[12.5px]"
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
                    class="flex-none rounded-[7px] px-2 py-1 font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
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
                    class="flex-none rounded-[7px] px-2 py-1 font-semibold text-accent hover:bg-accent-soft"
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
                <p class="text-[14px] font-semibold text-fg">
                  {{ 'ask.notConfigured.title' | transloco }}
                </p>
                <p class="max-w-[280px] text-[13px] text-fg-muted">
                  {{ 'ask.notConfigured.body' | transloco }}
                </p>
              </div>
            } @else if (thread().length === 0) {
              <p class="text-[13.5px] text-fg-muted">{{ 'ask.intro' | transloco }}</p>
              <div class="mt-4 rounded-tile border border-border bg-bg px-3.5 py-3">
                <p class="text-[12.5px] font-semibold text-fg">
                  {{ 'search.intro.tryTitle' | transloco }}
                </p>
                <ul class="mt-2 flex flex-col gap-1.5">
                  @for (key of exampleKeys; track key) {
                    <li>
                      <button
                        type="button"
                        (click)="pickExample(key)"
                        class="w-full rounded-[8px] px-2 py-1.5 text-left text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
                      >
                        {{ key | transloco }}
                      </button>
                    </li>
                  }
                </ul>
              </div>
              <p class="mt-3 flex gap-2 text-[12.5px] text-fg-subtle">
                <span class="flex flex-none pt-px"><app-icon name="lock" [size]="14" /></span>
                <span>{{ 'search.intro.confirmNote' | transloco }}</span>
              </p>
              <p class="mt-1.5 flex gap-2 text-[12.5px] text-fg-subtle">
                <span class="flex flex-none pt-px"><app-icon name="spark" [size]="14" /></span>
                <span>{{ 'search.intro.shortcut' | transloco }}</span>
              </p>
              @if (panel.mode() !== 'tutor') {
                <button
                  type="button"
                  (click)="teachMe()"
                  class="mt-3 inline-flex items-center gap-1.5 rounded-tile border border-border px-3 py-1.5 text-[13px] font-semibold text-fg hover:border-accent hover:text-accent"
                >
                  <app-icon name="training" [size]="15" />
                  {{ 'search.tutor.teachMePage' | transloco }}
                </button>
              }
            } @else {
              <div class="flex flex-col gap-4">
                @for (turn of thread(); track turn.id) {
                  @if (turn.role === 'user') {
                    <div class="flex justify-end">
                      <div
                        class="max-w-[88%] rounded-tile rounded-br-[4px] bg-accent-soft px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap text-fg"
                      >
                        {{ turn.text }}
                      </div>
                    </div>
                  } @else {
                    <div class="flex flex-col gap-2">
                      @if (turn.text) {
                        <div class="cf-prose" [innerHTML]="render(turn.text)"></div>
                      }

                      @if (turn.status === 'error') {
                        <p
                          role="alert"
                          class="rounded-tile border border-fail/30 bg-fail-soft px-3 py-2 text-[13px] font-medium text-fail"
                        >
                          {{ 'ask.error.body' | transloco }}
                        </p>
                      }

                      @if (turn.question; as q) {
                        <div class="mt-0.5 flex flex-col gap-2">
                          <p class="text-[13.5px] font-medium text-fg">{{ q.question }}</p>
                          @if (!streaming()) {
                            <div class="flex flex-wrap gap-1.5">
                              @for (option of q.options; track option) {
                                <button
                                  type="button"
                                  (click)="pick(option)"
                                  [attr.aria-label]="'ask.chooseOption' | transloco: { option }"
                                  class="rounded-tile border border-border bg-bg px-3 py-1.5 text-[13px] font-medium text-fg hover:border-accent hover:bg-accent-soft hover:text-accent"
                                >
                                  {{ option }}
                                </button>
                              }
                            </div>
                          }
                        </div>
                      }

                      @if (turn.sources?.length) {
                        <div class="mt-1">
                          <div
                            class="mb-2 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                          >
                            {{ 'ask.sources' | transloco }}
                          </div>
                          <ul class="flex flex-col gap-1.5">
                            @for (source of turn.sources; track source.id) {
                              @let sourceLink = linkForSource(source);
                              <li>
                                <a
                                  [routerLink]="sourceLink.path"
                                  [queryParams]="sourceLink.queryParams"
                                  (click)="close()"
                                  class="flex items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-[13px] hover:border-border-strong"
                                >
                                  <span class="flex flex-none text-fg-subtle"
                                    ><app-icon
                                      [name]="iconFor(source.entity_type ?? 'document')"
                                      [size]="15"
                                  /></span>
                                  <span class="min-w-0 flex-1">
                                    <span class="truncate font-semibold text-fg">{{
                                      source.title
                                    }}</span>
                                    @if (source.doc_code) {
                                      <span class="ml-1.5 text-[12px] text-fg-subtle">{{
                                        source.doc_code
                                      }}</span>
                                    }
                                  </span>
                                </a>
                              </li>
                            }
                          </ul>
                        </div>
                      }

                      @if (turn.links?.length) {
                        <div class="mt-1">
                          <div
                            class="mb-2 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                          >
                            {{ 'search.links.heading' | transloco }}
                          </div>
                          <ul class="flex flex-col gap-1.5">
                            @for (link of turn.links; track link.entity_type + link.entity_id) {
                              @if (routeFor(link.url); as target) {
                                <li>
                                  <a
                                    [routerLink]="target.path"
                                    [queryParams]="target.queryParams"
                                    (click)="close()"
                                    class="flex items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-[13px] hover:border-accent"
                                  >
                                    <span class="flex flex-none text-accent"
                                      ><app-icon [name]="iconFor(link.entity_type)" [size]="15"
                                    /></span>
                                    <span class="min-w-0 flex-1">
                                      <span class="block truncate font-semibold text-fg">{{
                                        link.title
                                      }}</span>
                                      <span class="block truncate text-[12px] text-fg-subtle">
                                        {{ typeLabel(link.entity_type) }}
                                        @if (link.code) {
                                          · {{ link.code }}
                                        }
                                      </span>
                                    </span>
                                    <span class="flex flex-none text-fg-subtle"
                                      ><app-icon name="arrow" [size]="14"
                                    /></span>
                                  </a>
                                </li>
                              }
                            }
                          </ul>
                        </div>
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
                          class="mt-1 rounded-tile border border-accent-border bg-accent-soft px-3 py-2.5 text-[13px] text-accent"
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
                    </div>
                  }
                }

                @if (streaming()) {
                  <div class="flex items-center gap-2 text-[13.5px] text-fg-muted">
                    <span class="flex flex-none text-accent">
                      <app-icon name="spark" [size]="15" class="animate-cf-pulse" />
                    </span>
                    <span class="animate-cf-pulse">{{
                      working() ?? ('ask.workingInThread' | transloco)
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
                class="max-h-32 min-h-[40px] flex-1 resize-none rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-fg outline-none focus:border-accent"
              ></textarea>
              @if (streaming()) {
                <button
                  type="button"
                  (click)="stop()"
                  class="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-border bg-surface text-fg-muted hover:bg-surface-2"
                  [attr.aria-label]="'ask.stop' | transloco"
                >
                  <app-icon name="x" [size]="18" />
                </button>
              } @else {
                <button
                  type="submit"
                  [disabled]="!canSubmit()"
                  class="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-transparent bg-accent text-white hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
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

  private readonly inputRef = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly scrollRef = viewChild<ElementRef<HTMLElement>>('scroll');

  protected readonly question = signal('');

  protected readonly state = this.panel.state;
  protected readonly thread = this.panel.thread;
  protected readonly streaming = this.panel.streaming;
  protected readonly working = this.panel.working;

  protected readonly canSubmit = computed(
    () => this.question().trim().length > 0 && !this.streaming(),
  );

  private readonly language = inject(LanguageService);

  /** Example questions shown on the empty conversation (teaching empty state). */
  protected readonly exampleKeys = [
    'search.intro.examples.find',
    'search.intro.examples.explain',
    'search.intro.examples.thisPage',
    'search.intro.examples.create',
  ] as const;

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

  protected typeLabel(entityType: string): string {
    return entityTypeLabel(
      (key) => this.language.translate(key),
      `modules.entities.${entityType}`,
      entityType,
    );
  }

  protected iconFor(entityType: string): string {
    return entityTypeIcon(entityType);
  }

  protected routeFor(url: string | null | undefined): InternalLink | null {
    return internalLink(url);
  }

  /** A source links to its `url` when given, else (documents) to `/documents/<id>`. */
  protected linkForSource(source: AskSource): InternalLink {
    return internalLink(source.url) ?? { path: `/documents/${source.id}`, queryParams: null };
  }

  protected pickExample(key: string): void {
    this.panel.send(this.language.translate(key));
  }

  protected teachMe(): void {
    this.panel.openTutor();
  }

  constructor() {
    effect(() => {
      if (this.panel.open()) {
        queueMicrotask(() => this.inputRef()?.nativeElement.focus());
      }
    });

    // Keep the conversation pinned to the bottom as turns are added and as the
    // latest answer streams in. Reading the thread + latest text tracks both.
    effect(() => {
      const turns = this.thread();
      void turns.at(-1)?.text;
      void this.working();
      queueMicrotask(() => {
        const el = this.scrollRef()?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  protected render(text: string): SafeHtml {
    const html = this.sanitizer.sanitize(
      SecurityContext.HTML,
      marked.parse(text, { async: false }),
    );
    return html ?? '';
  }

  protected onEscape(): void {
    if (this.panel.open()) {
      this.close();
    }
  }

  protected onEnter(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey) {
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
    queueMicrotask(() => this.inputRef()?.nativeElement.focus());
  }

  /** Minimize: hide the view, keep the stream and thread alive in the service. */
  protected close(): void {
    this.panel.hide();
  }
}
