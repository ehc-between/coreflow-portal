import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ANSWER_FEEDBACK_COMMENT_MAX,
  ANSWER_FEEDBACK_REASONS,
  AnswerRating,
} from '../../core/ai/ai.models';
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService, AskTurn } from './ask-panel.service';

/**
 * The row under a finished answer (P2): copy the answer, and rate it with thumbs up
 * or down. A thumbs-down is saved at once and then offers "what was wrong?" reason
 * chips and an optional comment; sending them replaces the rating (the server keeps
 * one rating per answer and user). Shown only when the server returned a `run_id`.
 */
@Component({
  selector: 'app-ask-feedback',
  imports: [FormsModule, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = turn();
    @let fb = t.feedback;
    <div class="flex flex-wrap items-center gap-1 text-meta text-fg-subtle">
      <button
        type="button"
        (click)="copy()"
        [attr.aria-label]="'ask.turn.copy' | transloco"
        [title]="'ask.turn.copy' | transloco"
        class="inline-flex h-7 items-center gap-1 rounded-md px-1.5 hover:bg-surface-2 hover:text-fg"
      >
        @if (copied()) {
          <app-icon name="check" [size]="14" />
        } @else {
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        }
        @if (copied()) {
          <span>{{ 'ask.turn.copied' | transloco }}</span>
        }
      </button>
      @if (t.runId) {
        <span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
        <span class="sr-only">{{ 'ask.feedback.question' | transloco }}</span>
        <button
          type="button"
          (click)="rate('up')"
          [attr.aria-pressed]="fb?.rating === 'up'"
          [attr.aria-label]="'ask.feedback.up' | transloco"
          [title]="'ask.feedback.up' | transloco"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-2 hover:text-fg"
          [class.text-accent]="fb?.rating === 'up'"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Z" />
            <path
              d="M7 10l4-8a3 3 0 0 1 3 3v4h5.2a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 17.8 21H7"
              [attr.fill]="fb?.rating === 'up' ? 'currentColor' : 'none'"
              [attr.fill-opacity]="fb?.rating === 'up' ? 0.15 : null"
            />
          </svg>
        </button>
        <button
          type="button"
          (click)="rate('down')"
          [attr.aria-pressed]="fb?.rating === 'down'"
          [attr.aria-label]="'ask.feedback.down' | transloco"
          [title]="'ask.feedback.down' | transloco"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-2 hover:text-fg"
          [class.text-accent]="fb?.rating === 'down'"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Z" />
            <path
              d="M17 14l-4 8a3 3 0 0 1-3-3v-4H4.8a2 2 0 0 1-2-2.3l1.4-8A2 2 0 0 1 6.2 3H17"
              [attr.fill]="fb?.rating === 'down' ? 'currentColor' : 'none'"
              [attr.fill-opacity]="fb?.rating === 'down' ? 0.15 : null"
            />
          </svg>
        </button>
        <span class="ml-1" role="status" aria-live="polite">
          @if (fb?.state === 'saving') {
            {{ 'ask.feedback.saving' | transloco }}
          } @else if (fb?.state === 'error') {
            <span class="text-fail-ink">{{ 'ask.feedback.error' | transloco }}</span>
          } @else if (fb?.state === 'saved' && !askWhy()) {
            {{ 'ask.feedback.thanks' | transloco }}
          }
        </span>
      }
    </div>

    @if (askWhy()) {
      <form
        class="mt-2 flex flex-col gap-2 rounded-tile border border-border bg-bg px-3 py-2.5"
        (ngSubmit)="sendDetails()"
      >
        <p class="text-ui font-semibold text-fg" id="ask-why-{{ t.id }}">
          {{ 'ask.feedback.whyTitle' | transloco }}
        </p>
        <div class="flex flex-wrap gap-1.5" role="group" [attr.aria-labelledby]="'ask-why-' + t.id">
          @for (reason of reasons; track reason) {
            <button
              type="button"
              (click)="toggleReason(reason)"
              [attr.aria-pressed]="reason === selectedReason()"
              class="rounded-full border px-2.5 py-1 text-meta font-medium"
              [class]="
                reason === selectedReason()
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg'
              "
            >
              {{ 'ask.feedback.reasons.' + reason | transloco }}
            </button>
          }
        </div>
        <label class="flex flex-col gap-1 text-meta text-fg-muted">
          {{ 'ask.feedback.commentLabel' | transloco }}
          <textarea
            [(ngModel)]="comment"
            name="comment"
            rows="2"
            [maxlength]="commentMax"
            [placeholder]="'ask.feedback.commentPlaceholder' | transloco"
            class="resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-ui text-fg outline-none focus:border-accent"
          ></textarea>
        </label>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            (click)="closeWhy()"
            class="rounded-md px-2.5 py-1.5 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            {{ 'ask.feedback.cancel' | transloco }}
          </button>
          <button
            type="submit"
            [disabled]="!canSend()"
            class="rounded-md bg-accent px-3 py-1.5 text-ui font-semibold text-white hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ 'ask.feedback.send' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
})
export class AskFeedback {
  private readonly panel = inject(AskPanelService);

  readonly turn = input.required<AskTurn>();

  protected readonly reasons = ANSWER_FEEDBACK_REASONS;
  protected readonly commentMax = ANSWER_FEEDBACK_COMMENT_MAX;

  protected readonly copied = signal(false);
  protected readonly askWhy = signal(false);
  protected readonly selectedReason = signal<string | null>(null);
  protected readonly comment = signal('');

  protected readonly canSend = computed(
    () => !!this.selectedReason() || this.comment().trim().length > 0,
  );

  protected rate(rating: AnswerRating): void {
    this.panel.rateAnswer(this.turn().id, rating);
    this.askWhy.set(rating === 'down');
    if (rating === 'up') {
      this.selectedReason.set(null);
      this.comment.set('');
    }
  }

  protected toggleReason(reason: string): void {
    this.selectedReason.update((current) => (current === reason ? null : reason));
  }

  protected sendDetails(): void {
    if (!this.canSend()) {
      return;
    }
    this.panel.rateAnswer(this.turn().id, 'down', {
      reason: this.selectedReason(),
      comment: this.comment().trim() || null,
    });
    this.askWhy.set(false);
  }

  protected closeWhy(): void {
    this.askWhy.set(false);
  }

  protected copy(): void {
    const text = this.turn().text;
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard || !text) {
      return;
    }
    clipboard.writeText(text).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => undefined,
    );
  }
}
