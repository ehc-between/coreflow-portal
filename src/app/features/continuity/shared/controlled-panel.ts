import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { actionNeedsNote, actionVariant, badge, orderedActions } from '../data/continuity-display';
import { ControlledAction, ControlledDetail } from '../data/continuity.models';

export interface ControlledActionRequest {
  readonly action: ControlledAction;
  readonly note: string | null;
}

/** What the approval row can say about a record. */
export type ApprovalState = 'dated' | 'by' | 'undated' | 'none';

/**
 * The approval row: a date (and who), only who (older records without a date), an
 * approved record without either, or not approved. Never "not approved yet" next to
 * an "approved" badge.
 */
export function approvalState(r: ControlledDetail): ApprovalState {
  if (r.approved_at) {
    return 'dated';
  }
  if (r.approved_by?.name) {
    return 'by';
  }
  return r.status === 'approved' ? 'undated' : 'none';
}

/**
 * The document-control card of a BIA or continuity plan: status, version, who
 * submitted and approved it, the periodic review schedule, and the workflow actions
 * the caller may take (submit, approve, reject, review, restore). Each action asks
 * for a note (required to reject) before `(acted)` fires. Retiring is offered in the
 * page header's "More" menu, which calls `open('retire')`.
 */
@Component({
  selector: 'app-continuity-controlled-panel',
  imports: [TranslocoPipe, LocalDayPipe, Alert, AskAbout, Button, Card, PromptDialog, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = record();
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'continuity.control.title' | transloco }}
        </h2>
        <app-ask-about [prompt]="'continuity.ai.prompts.nextStep' | transloco" field="status" />
      </div>
      <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-2">
        <div>
          <dt class="text-meta text-fg-muted">{{ 'continuity.fields.status' | transloco }}</dt>
          <dd class="flex flex-wrap items-center gap-2 text-fg">
            <app-status-badge
              [meaning]="statusBadge().meaning"
              [value]="statusBadge().value"
              [labelKey]="'continuity.status.' + r.status"
            />
            <span class="text-meta text-fg-muted">
              {{ 'continuity.control.version' | transloco: { version: r.version } }}
            </span>
          </dd>
          <dd class="mt-1 text-meta text-fg-subtle">
            {{ 'continuity.statusHelp.' + r.status | transloco }}
          </dd>
        </div>
        <div>
          <dt class="text-meta text-fg-muted">{{ 'continuity.fields.approved' | transloco }}</dt>
          <dd class="text-fg" data-testid="approval">
            @switch (approval()) {
              @case ('dated') {
                {{
                  'continuity.control.approvedOn'
                    | transloco
                      : {
                          date: (r.approved_at | localDay),
                          name:
                            r.approved_by?.name || ('continuity.common.unknownPerson' | transloco),
                        }
                }}
              }
              @case ('by') {
                {{ 'continuity.control.approvedBy' | transloco: { name: r.approved_by?.name } }}
              }
              @case ('undated') {
                {{ 'continuity.control.approvedUndated' | transloco }}
              }
              @default {
                {{ 'continuity.control.notApproved' | transloco }}
              }
            }
          </dd>
          @if (r.submitted_at && r.status === 'in_review') {
            <dd class="mt-1 text-meta text-fg-subtle">
              {{
                'continuity.control.submittedOn'
                  | transloco
                    : {
                        date: (r.submitted_at | localDay),
                        name:
                          r.submitted_by?.name || ('continuity.common.unknownPerson' | transloco),
                      }
              }}
            </dd>
          }
        </div>
        <div>
          <dt class="text-meta text-fg-muted">
            {{ 'continuity.fields.lastReviewed' | transloco }}
          </dt>
          <dd class="text-fg">
            {{
              r.last_reviewed_on
                ? (r.last_reviewed_on | localDay)
                : ('continuity.common.notYet' | transloco)
            }}
          </dd>
        </div>
        <div>
          <dt class="text-meta text-fg-muted">
            {{ 'continuity.fields.nextReview' | transloco }}
          </dt>
          <dd class="flex flex-wrap items-center gap-2 text-fg">
            @if (r.next_review_on) {
              <span>{{ r.next_review_on | localDay }}</span>
            }
            <app-status-badge
              [meaning]="reviewBadge().meaning"
              [value]="reviewBadge().value"
              [labelKey]="'continuity.reviewState.' + r.review_state"
            />
          </dd>
          <dd class="mt-1 text-meta text-fg-subtle">
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
      [confirmVariant]="pending() === 'reject' ? 'danger' : 'primary'"
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

  protected readonly variant = actionVariant;
  protected readonly pending = signal<ControlledAction | null>(null);
  /** Retiring sits in the page header's "More" menu (it can be undone). */
  protected readonly actions = computed(
    () =>
      orderedActions(this.record().allowed_actions).filter(
        (a) => a !== 'retire',
      ) as ControlledAction[],
  );
  protected readonly statusBadge = computed(() => badge.controlled(this.record().status));
  protected readonly reviewBadge = computed(() => badge.review(this.record().review_state));
  protected readonly approval = computed(() => approvalState(this.record()));
  protected readonly noteRequired = computed(() => actionNeedsNote(this.pending() ?? ''));

  /** Close the note dialog (the host calls this once the action succeeded). */
  close(): void {
    this.pending.set(null);
  }

  /** Ask for the note of an action (the header's "Retire" menu item calls this too). */
  open(action: ControlledAction): void {
    this.pending.set(action);
  }

  protected confirm(note: string): void {
    const action = this.pending();
    if (action) {
      this.acted.emit({ action, note: note || null });
    }
  }
}
