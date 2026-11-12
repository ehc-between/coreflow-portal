import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import {
  actionNeedsNote,
  actionVariant,
  controlledStatusTone,
  orderedActions,
  reviewStateTone,
} from '../data/continuity-display';
import { ControlledAction, ControlledDetail } from '../data/continuity.models';

export interface ControlledActionRequest {
  readonly action: ControlledAction;
  readonly note: string | null;
}

/**
 * The document-control card of a BIA or continuity plan: status, version, who
 * submitted and approved it, the periodic review schedule, and the workflow actions
 * the caller may take (submit, approve, reject, review, retire, restore). Each
 * action asks for a note (required to reject) before `(acted)` fires.
 */
@Component({
  selector: 'app-continuity-controlled-panel',
  imports: [TranslocoPipe, LocalDayPipe, Alert, AskAbout, Badge, Button, Card, PromptDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = record();
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'continuity.control.title' | transloco }}
        </h2>
        <app-ask-about [prompt]="'continuity.ai.prompts.nextStep' | transloco" field="status" />
      </div>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
        <div>
          <dt class="text-[12px] text-fg-muted">{{ 'continuity.fields.status' | transloco }}</dt>
          <dd class="flex flex-wrap items-center gap-2 text-fg">
            <app-badge [tone]="statusTone(r.status)">
              {{ 'continuity.status.' + r.status | transloco }}
            </app-badge>
            <span class="text-[12.5px] text-fg-muted">
              {{ 'continuity.control.version' | transloco: { version: r.version } }}
            </span>
          </dd>
          <dd class="mt-1 text-[12.5px] text-fg-subtle">
            {{ 'continuity.statusHelp.' + r.status | transloco }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">{{ 'continuity.fields.approved' | transloco }}</dt>
          <dd class="text-fg">
            @if (r.approved_at) {
              {{
                'continuity.control.approvedOn'
                  | transloco
                    : { date: (r.approved_at | localDay), name: r.approved_by?.name ?? '–' }
              }}
            } @else {
              {{ 'continuity.control.notApproved' | transloco }}
            }
          </dd>
          @if (r.submitted_at && r.status === 'in_review') {
            <dd class="mt-1 text-[12.5px] text-fg-subtle">
              {{
                'continuity.control.submittedOn'
                  | transloco
                    : { date: (r.submitted_at | localDay), name: r.submitted_by?.name ?? '–' }
              }}
            </dd>
          }
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'continuity.fields.lastReviewed' | transloco }}
          </dt>
          <dd class="text-fg">
            {{ r.last_reviewed_on ? (r.last_reviewed_on | localDay) : '–' }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'continuity.fields.nextReview' | transloco }}
          </dt>
          <dd class="flex flex-wrap items-center gap-2 text-fg">
            @if (r.next_review_on) {
              <span>{{ r.next_review_on | localDay }}</span>
            }
            <app-badge [tone]="reviewTone(r.review_state)">
              {{ 'continuity.reviewState.' + r.review_state | transloco }}
            </app-badge>
          </dd>
          <dd class="mt-1 text-[12.5px] text-fg-subtle">
            {{ 'continuity.control.interval' | transloco: { months: r.review_interval_months } }}
          </dd>
        </div>
      </dl>

      @if (actions().length) {
        <div class="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          @for (action of actions(); track action) {
            <app-button
              size="sm"
              [variant]="variant(action)"
              [disabled]="busy()"
              (click)="open(action)"
            >
              {{ 'continuity.actions.' + action | transloco }}
            </app-button>
          }
        </div>
      }
      @if (error(); as key) {
        <div class="mt-3">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
    </app-card>

    <app-prompt-dialog
      [open]="pending() !== null"
      [title]="'continuity.actions.' + (pending() ?? 'submit') | transloco"
      [message]="'continuity.actionHelp.' + (pending() ?? 'submit') | transloco"
      [label]="'continuity.control.note' | transloco"
      [confirmLabel]="'continuity.actions.' + (pending() ?? 'submit') | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [confirmVariant]="pending() === 'reject' || pending() === 'retire' ? 'danger' : 'primary'"
      [required]="noteRequired()"
      [busy]="busy()"
      (confirmed)="confirm($event)"
      (cancelled)="pending.set(null)"
    />
  `,
})
export class ContinuityControlledPanel {
  readonly record = input.required<ControlledDetail>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly acted = output<ControlledActionRequest>();

  protected readonly statusTone = controlledStatusTone;
  protected readonly reviewTone = reviewStateTone;
  protected readonly variant = actionVariant;
  protected readonly pending = signal<ControlledAction | null>(null);
  protected readonly actions = computed(
    () => orderedActions(this.record().allowed_actions) as ControlledAction[],
  );
  protected readonly noteRequired = computed(() => actionNeedsNote(this.pending() ?? ''));

  /** Close the note dialog (the host calls this once the action succeeded). */
  close(): void {
    this.pending.set(null);
  }

  protected open(action: ControlledAction): void {
    this.pending.set(action);
  }

  protected confirm(note: string): void {
    const action = this.pending();
    if (action) {
      this.acted.emit({ action, note: note || null });
    }
  }
}
