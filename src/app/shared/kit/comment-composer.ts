import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
  OnInit,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_MENTIONS,
  MentionCandidate,
} from '../../core/kit/kit.models';
import { Button } from '../ui/button/button';
import {
  ActiveMention,
  activeMention,
  filterCandidates,
  insertMention,
  mentionsInBody,
} from './mentions';
import { provideKitScope } from './kit-scope';

let nextId = 0;

/** What a composer submits: the trimmed body and the ids of people still mentioned in it. */
export interface CommentDraft {
  readonly body: string;
  readonly mentions: readonly string[];
}

/**
 * Comment text area with an `@mention` menu (arrow keys + Enter / Tab to pick,
 * Escape to close) and a character counter. Ctrl/Cmd + Enter submits. Used for
 * new comments, replies and edits.
 */
@Component({
  selector: 'app-comment-composer',
  imports: [TranslocoPipe, Button],
  providers: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex flex-col gap-2">
      <textarea
        #area
        [id]="id"
        [rows]="rows()"
        [value]="body()"
        [attr.aria-label]="labelKey() | transloco"
        [attr.placeholder]="'kit.comments.placeholder' | transloco"
        [attr.maxlength]="max"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="menuOpen()"
        [attr.aria-controls]="menuId"
        [attr.aria-activedescendant]="menuOpen() ? optionId(activeIndex()) : null"
        class="w-full resize-y rounded-[8px] border border-border bg-bg px-2.5 py-2 text-[13px] text-fg outline-none focus:border-accent"
        (input)="onInput()"
        (click)="refreshMention()"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
        data-testid="comment-input"
      ></textarea>

      @if (menuOpen()) {
        <ul
          [id]="menuId"
          role="listbox"
          [attr.aria-label]="'kit.comments.mentionList' | transloco"
          class="absolute top-full left-0 z-20 mt-1 max-h-60 w-full max-w-[320px] overflow-y-auto rounded-[10px] border border-border bg-surface py-1 shadow-card"
          data-testid="mention-menu"
        >
          @for (person of matches(); track person.id; let i = $index) {
            <li
              [id]="optionId(i)"
              role="option"
              [attr.aria-selected]="i === activeIndex()"
              class="cursor-pointer px-3 py-1.5 text-[13px]"
              [class.bg-accent-soft]="i === activeIndex()"
              (mousedown)="$event.preventDefault(); pick(person)"
              (mouseenter)="activeIndex.set(i)"
            >
              <span class="font-medium text-fg">{{ person.name }}</span>
              @if (person.email) {
                <span class="ml-1.5 text-[11.5px] text-fg-subtle">{{ person.email }}</span>
              }
            </li>
          } @empty {
            <li class="px-3 py-1.5 text-[12.5px] text-fg-muted">
              {{ 'kit.comments.mentionNone' | transloco }}
            </li>
          }
        </ul>
      }

      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11.5px] text-fg-subtle" aria-hidden="true">
          @if (body().length > max * 0.8) {
            {{ 'kit.comments.characters' | transloco: { count: body().length, max } }}
          }
        </span>
        <div class="flex items-center gap-2">
          @if (showCancel()) {
            <app-button size="sm" variant="ghost" (click)="cancelled.emit()">
              {{ 'kit.comments.cancel' | transloco }}
            </app-button>
          }
          <app-button
            size="sm"
            [disabled]="!canSubmit()"
            [loading]="busy()"
            (click)="submit()"
            data-testid="comment-submit"
          >
            {{ (busy() ? 'kit.comments.posting' : submitKey()) | transloco }}
          </app-button>
        </div>
      </div>
    </div>
  `,
})
export class CommentComposer implements OnInit {
  readonly candidates = input<readonly MentionCandidate[]>([]);
  /** Accessible name of the text area (a `kit` i18n key). */
  readonly labelKey = input('kit.comments.label');
  readonly submitKey = input('kit.comments.post');
  readonly initialBody = input('');
  readonly initialMentions = input<readonly MentionCandidate[]>([]);
  readonly busy = input(false);
  readonly showCancel = input(false);
  readonly rows = input(3);
  readonly autofocus = input(false);

  readonly submitted = output<CommentDraft>();
  readonly cancelled = output<void>();

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');

  protected readonly max = COMMENT_MAX_LENGTH;
  protected readonly id = `cf-comment-${++nextId}`;
  protected readonly menuId = `${this.id}-mentions`;

  protected readonly body = signal('');
  private readonly chosen = signal<readonly MentionCandidate[]>([]);
  private readonly mention = signal<ActiveMention | null>(null);
  protected readonly activeIndex = signal(0);

  protected readonly matches = computed(() => {
    const mention = this.mention();
    return mention ? filterCandidates(this.candidates(), mention.query) : [];
  });

  protected readonly menuOpen = computed(
    () => this.mention() !== null && this.candidates().length > 0,
  );

  protected readonly canSubmit = computed(() => {
    const text = this.body().trim();
    return !this.busy() && text.length > 0 && text.length <= COMMENT_MAX_LENGTH;
  });

  ngOnInit(): void {
    this.body.set(this.initialBody());
    this.chosen.set(this.initialMentions());
    if (this.autofocus()) {
      queueMicrotask(() => this.area().nativeElement.focus());
    }
  }

  /** Empty the composer (after a successful post). */
  clear(): void {
    this.body.set('');
    this.chosen.set([]);
    this.mention.set(null);
    this.area().nativeElement.value = '';
  }

  focus(): void {
    this.area().nativeElement.focus();
  }

  protected optionId(index: number): string {
    return `${this.menuId}-${index}`;
  }

  protected onInput(): void {
    this.body.set(this.area().nativeElement.value);
    this.refreshMention();
  }

  protected refreshMention(): void {
    const el = this.area().nativeElement;
    const next = activeMention(el.value, el.selectionStart ?? el.value.length);
    const prev = this.mention();
    if (next?.query !== prev?.query || next?.start !== prev?.start) {
      this.activeIndex.set(0);
    }
    this.mention.set(next);
  }

  protected onBlur(): void {
    this.mention.set(null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.menuOpen()) {
      const count = this.matches().length;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.activeIndex.set(count ? (this.activeIndex() + 1) % count : 0);
          return;
        case 'ArrowUp':
          event.preventDefault();
          this.activeIndex.set(count ? (this.activeIndex() - 1 + count) % count : 0);
          return;
        case 'Enter':
        case 'Tab': {
          const person = this.matches()[this.activeIndex()];
          if (person) {
            event.preventDefault();
            this.pick(person);
            return;
          }
          break;
        }
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          this.mention.set(null);
          return;
      }
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    }
  }

  protected pick(person: MentionCandidate): void {
    const mention = this.mention();
    const el = this.area().nativeElement;
    if (!mention) {
      return;
    }
    const result = insertMention(
      el.value,
      mention,
      el.selectionStart ?? el.value.length,
      person.name,
    );
    el.value = result.text;
    el.setSelectionRange(result.caret, result.caret);
    this.body.set(result.text);
    this.chosen.update((list) => (list.some((p) => p.id === person.id) ? list : [...list, person]));
    this.mention.set(null);
    el.focus();
  }

  protected submit(): void {
    if (!this.canSubmit()) {
      return;
    }
    const body = this.body().trim();
    const mentions = mentionsInBody(body, this.chosen())
      .slice(0, COMMENT_MAX_MENTIONS)
      .map((p) => p.id);
    this.submitted.emit({ body, mentions });
  }
}
