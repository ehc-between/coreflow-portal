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
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService } from './ask-panel.service';

marked.setOptions({ gfm: true, breaks: true });

/**
 * Ask CoreFlow slide-over. A thin view over {@link AskPanelService}: it renders the
 * service's conversation thread (each assistant turn streams token-by-token as
 * sanitized markdown, lists cited documents, surfaces a queued draft, and offers
 * clickable option chips) and forwards user actions (submit, pick, stop, new chat)
 * to the service. A 503 renders a friendly "not set up yet" state.
 *
 * Closing the panel (×, Esc, backdrop) only MINIMIZES it — `hide()` keeps the
 * stream running in the service, so a long draft survives navigating away. The
 * stream is aborted only via explicit Stop or New chat. Zoneless: stream events
 * land in the service's signals.
 */
@Component({
  selector: 'app-ask-panel',
  imports: [FormsModule, RouterLink, TranslocoPipe, Icon],
  host: { '(document:keydown.escape)': 'onEscape()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .cf-prose {
      font-size: 14px;
      line-height: 1.55;
      color: var(--fg);
    }
    .cf-prose > :first-child {
      margin-top: 0;
    }
    .cf-prose > :last-child {
      margin-bottom: 0;
    }
    .cf-prose p {
      margin: 0.5em 0;
    }
    .cf-prose h1,
    .cf-prose h2,
    .cf-prose h3,
    .cf-prose h4 {
      margin: 0.9em 0 0.4em;
      font-weight: 700;
      line-height: 1.3;
      color: var(--fg);
    }
    .cf-prose h1 {
      font-size: 1.15em;
    }
    .cf-prose h2 {
      font-size: 1.08em;
    }
    .cf-prose h3,
    .cf-prose h4 {
      font-size: 1em;
    }
    .cf-prose strong {
      font-weight: 700;
    }
    .cf-prose em {
      font-style: italic;
    }
    .cf-prose ul,
    .cf-prose ol {
      margin: 0.5em 0;
      padding-left: 1.25em;
    }
    .cf-prose ul {
      list-style: disc;
    }
    .cf-prose ol {
      list-style: decimal;
    }
    .cf-prose li {
      margin: 0.2em 0;
    }
    .cf-prose li::marker {
      color: var(--fg-muted);
    }
    .cf-prose a {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .cf-prose code {
      font-family: var(--font-mono);
      font-size: 0.88em;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0.08em 0.32em;
    }
    .cf-prose pre {
      margin: 0.6em 0;
      padding: 0.7em 0.85em;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-tile);
      overflow-x: auto;
    }
    .cf-prose pre code {
      background: none;
      border: none;
      padding: 0;
      font-size: 0.85em;
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
                              <li>
                                <a
                                  [routerLink]="['/documents', source.id]"
                                  (click)="close()"
                                  class="flex items-center gap-2 rounded-tile border border-border bg-bg px-3 py-2 text-[13px] hover:border-border-strong"
                                >
                                  <span class="flex flex-none text-fg-subtle"
                                    ><app-icon name="documents" [size]="15"
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
