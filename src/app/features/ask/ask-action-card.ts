import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { internalLink } from '../../core/search/internal-link';
import { Badge, BadgeTone } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { ActionCardState, AskActionCard } from './ask-panel.service';

const STATE_TONE: Record<ActionCardState, BadgeTone> = {
  pending: 'accent',
  confirming: 'accent',
  rejecting: 'neutral',
  confirmed: 'pass',
  rejected: 'neutral',
  expired: 'warn',
  failed: 'fail',
  forbidden: 'fail',
  gone: 'neutral',
  error: 'fail',
};

/**
 * Confirmation card for a change the assistant proposed (confirm-before-write).
 * Shows what would change (summary, preview title and fields) and offers
 * Confirm / Discard while the proposal is pending; afterwards it shows the
 * outcome and, when the change produced a record, a link to it.
 * Used inside the Ask panel (which provides the `search` translation scope).
 */
@Component({
  selector: 'app-ask-action-card',
  imports: [RouterLink, TranslocoPipe, Badge, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = card();
    <section
      class="rounded-tile border border-accent-border bg-surface px-3 py-3 text-[13px]"
      [attr.aria-label]="'search.action.cardLabel' | transloco"
    >
      <div class="mb-1.5 flex items-center gap-2">
        <span class="flex flex-none text-accent"><app-icon name="sliders" [size]="15" /></span>
        <span class="flex-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
          {{ 'search.action.heading' | transloco }}
        </span>
        <app-badge [tone]="tone()">{{ 'search.action.state.' + c.state | transloco }}</app-badge>
      </div>

      @if (c.preview.title) {
        <p class="font-semibold text-fg">{{ c.preview.title }}</p>
      }
      <p class="mt-0.5 text-fg-muted">{{ c.summary }}</p>

      @if (c.preview.fields.length) {
        <dl class="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
          @for (field of c.preview.fields; track $index) {
            <dt class="text-fg-subtle">{{ field.label }}</dt>
            <dd class="min-w-0 break-words text-fg">{{ field.value }}</dd>
          }
        </dl>
      }

      @switch (c.state) {
        @case ('confirmed') {
          <p class="mt-2.5 text-pass" role="status">
            {{ c.result?.message || ('search.action.done' | transloco) }}
          </p>
          @if (resultLink(); as link) {
            <a
              [routerLink]="link.path"
              [queryParams]="link.queryParams"
              (click)="navigated.emit()"
              class="mt-1 inline-flex items-center gap-1 font-semibold text-accent underline"
            >
              {{ 'search.action.openResult' | transloco }}
              <app-icon name="arrow" [size]="14" />
            </a>
          }
        }
        @case ('rejected') {
          <p class="mt-2.5 text-fg-muted" role="status">
            {{ 'search.action.discarded' | transloco }}
          </p>
        }
        @case ('expired') {
          <p class="mt-2.5 text-warn" role="status">{{ 'search.action.expired' | transloco }}</p>
        }
        @case ('failed') {
          <p class="mt-2.5 text-fail" role="alert">
            {{ c.message || ('search.action.failed' | transloco) }}
          </p>
        }
        @case ('forbidden') {
          <p class="mt-2.5 text-fail" role="alert">
            {{ 'search.action.forbidden' | transloco }}
          </p>
        }
        @case ('gone') {
          <p class="mt-2.5 text-fg-muted" role="status">{{ 'search.action.gone' | transloco }}</p>
        }
        @default {
          @if (c.state === 'error') {
            <p class="mt-2.5 text-fail" role="alert">{{ 'search.action.error' | transloco }}</p>
          } @else {
            <p class="mt-2.5 text-[12px] text-fg-subtle">
              {{ 'search.action.hint' | transloco }}
            </p>
          }
          <div class="mt-2 flex flex-wrap gap-2">
            <app-button
              size="sm"
              [loading]="c.state === 'confirming'"
              [disabled]="busy()"
              (click)="onConfirm()"
            >
              <app-icon name="check" [size]="15" />
              {{ 'search.action.confirm' | transloco }}
            </app-button>
            <app-button
              size="sm"
              variant="secondary"
              [loading]="c.state === 'rejecting'"
              [disabled]="busy()"
              (click)="onDiscard()"
            >
              {{ 'search.action.discard' | transloco }}
            </app-button>
          </div>
        }
      }
    </section>
  `,
})
export class AskActionCardView {
  readonly card = input.required<AskActionCard>();

  /** The user confirmed the change. */
  readonly confirmed = output<string>();
  /** The user discarded the change. */
  readonly discarded = output<string>();
  /** The user followed the result link (the panel minimizes). */
  readonly navigated = output<void>();

  protected readonly tone = computed(() => STATE_TONE[this.card().state]);
  protected readonly busy = computed(
    () => this.card().state === 'confirming' || this.card().state === 'rejecting',
  );
  protected readonly resultLink = computed(() => internalLink(this.card().result?.url));

  protected onConfirm(): void {
    if (!this.busy()) {
      this.confirmed.emit(this.card().action_id);
    }
  }

  protected onDiscard(): void {
    if (!this.busy()) {
      this.discarded.emit(this.card().action_id);
    }
  }
}
