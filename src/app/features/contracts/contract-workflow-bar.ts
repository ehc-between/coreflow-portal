import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import {
  CONTRACT_ACTIONS,
  Contract,
  ContractAction,
  ContractActionBody,
  NOTE_REQUIRED_ACTIONS,
  REVIEW_ANSWERS,
  ReviewAnswer,
} from './data/contract.models';
import { actionVariant, addMonthsIso, reviewItemKey, todayIso } from './data/contract-display';

export interface WorkflowRun {
  readonly action: ContractAction;
  readonly body: ContractActionBody;
}

/** Ending a contract: offered quietly under "End the contract", never as equal buttons. */
export const EXIT_ACTIONS: readonly ContractAction[] = ['terminate', 'expire'];
/** The next step forward in the lifecycle (one primary button). */
export const FORWARD_ACTIONS: readonly ContractAction[] = [
  'submit',
  'approve',
  'activate',
  'renew',
];

/** Which extra inputs an action's dialog asks for. */
export function actionInputs(action: ContractAction): {
  readonly note: 'required' | 'optional';
  readonly date: 'effective' | 'newEnd' | 'nextReview' | null;
} {
  const note = NOTE_REQUIRED_ACTIONS.includes(action) ? 'required' : 'optional';
  switch (action) {
    case 'activate':
    case 'terminate':
    case 'expire':
      return { note, date: 'effective' };
    case 'renew':
      return { note, date: 'newEnd' };
    case 'review':
      return { note, date: 'nextReview' };
    default:
      return { note, date: null };
  }
}

/** The renewed end date the dialog proposes: end date + renewal term, if both are known. */
export function proposedRenewalEnd(contract: Contract): string {
  if (!contract.end_date || !contract.renewal_term_months) {
    return '';
  }
  return addMonthsIso(contract.end_date, contract.renewal_term_months);
}

/** Answers of the approval checklist: every item answered, and none of them "no". */
export function reviewState(
  items: readonly string[],
  answers: Readonly<Record<string, ReviewAnswer>>,
): { readonly complete: boolean; readonly declined: boolean } {
  return {
    complete: items.every((key) => !!answers[key]),
    declined: items.some((key) => answers[key] === 'no'),
  };
}

/**
 * The approval workflow of a contract. The next forward step (submit, approve,
 * mark active, renew) is the one primary button; sending back and the periodic
 * review sit beside it, and ending the contract (terminate, mark expired) is in a
 * quieter "End the contract" menu. Each action opens a dialog with the note and
 * date it takes. Approving asks the contract's review questions (ISO 9001 8.2.3,
 * ISO 27001 A.5.20) and a required note; a "no" means send it back instead.
 */
@Component({
  selector: 'app-contract-workflow-bar',
  imports: [TranslocoPipe, Button, ConfirmDialog, MenuItem, OverflowMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (forward().length || side().length || exits().length) {
      <div class="flex flex-wrap items-center gap-2" data-testid="workflow-actions">
        @for (a of side(); track a) {
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="busy()"
            (click)="open(a)"
            [attr.data-testid]="'action-' + a"
          >
            {{ 'contracts.actions.' + a | transloco }}
          </app-button>
        }
        @if (exits().length) {
          <app-overflow-menu labelKey="contracts.actions.endMenu" data-testid="action-end-menu">
            @for (a of exits(); track a) {
              <button
                appMenuItem
                type="button"
                [danger]="a === 'terminate'"
                (click)="open(a)"
                [attr.data-testid]="'action-' + a"
              >
                {{ 'contracts.actions.' + a | transloco }}
              </button>
            }
          </app-overflow-menu>
        }
        @for (a of forward(); track a) {
          <app-button
            [variant]="variant(a)"
            size="sm"
            [disabled]="busy()"
            (click)="open(a)"
            [attr.data-testid]="'action-' + a"
          >
            {{ 'contracts.actions.' + a | transloco }}
          </app-button>
        }
      </div>
    }

    <app-confirm-dialog
      [open]="pending() !== null"
      [title]="dialogTitle()"
      [message]="dialogMessage()"
      [confirmLabel]="dialogConfirm()"
      [cancelLabel]="'common.cancel' | transloco"
      [confirmVariant]="pending() ? variant(pending()!) : 'primary'"
      [busy]="busy()"
      [confirmDisabled]="blocked()"
      [initialFocus]="pending() === 'approve' ? '#cf-review-0-yes' : '#cf-action-note'"
      (confirmed)="confirm()"
      (cancelled)="pending.set(null)"
    >
      @if (pending(); as a) {
        <div class="mt-3 flex flex-col gap-3 text-left">
          @if (a === 'approve') {
            @if (contract().submitted_by; as by) {
              <p class="text-meta text-fg-muted" data-testid="approve-submitter">
                {{ 'contracts.approve.submittedBy' | transloco: { name: by.name ?? '' } }}
              </p>
            }
            @if (reviewItems().length) {
              <fieldset class="flex flex-col gap-2" data-testid="approve-checklist">
                <legend class="mb-1 text-ui font-semibold text-fg">
                  {{ 'contracts.approve.checklistTitle' | transloco }}
                </legend>
                @for (key of reviewItems(); track key; let i = $index) {
                  <div
                    class="flex flex-col gap-1.5 rounded-tile border border-border px-3 py-2 sm:flex-row sm:items-center"
                    role="radiogroup"
                    [attr.aria-labelledby]="'cf-review-' + i + '-label'"
                  >
                    <span [id]="'cf-review-' + i + '-label'" class="flex-1 text-ui text-fg">
                      {{ itemKey(key) | transloco }}
                    </span>
                    <span class="flex gap-3">
                      @for (ans of answers; track ans) {
                        <label class="inline-flex items-center gap-1 text-meta text-fg">
                          <input
                            type="radio"
                            [id]="'cf-review-' + i + '-' + ans"
                            [name]="'cf-review-' + i"
                            class="h-4 w-4 accent-[var(--accent)]"
                            [checked]="answered()[key] === ans"
                            (change)="answer(key, ans)"
                            [attr.data-testid]="'review-' + key + '-' + ans"
                          />
                          {{ 'contracts.approve.answers.' + ans | transloco }}
                        </label>
                      }
                    </span>
                  </div>
                }
              </fieldset>
              @if (review().declined) {
                <p class="text-meta font-semibold text-warn-ink" role="alert">
                  {{ 'contracts.approve.declined' | transloco }}
                </p>
              }
            }
          }
          @if (inputs()?.date; as kind) {
            <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
              {{ 'contracts.actionDialog.' + kind | transloco }}
              <input
                type="date"
                class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                [value]="date()"
                (change)="date.set($any($event.target).value)"
                data-testid="action-date"
              />
            </label>
          }
          <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
            {{
              (inputs()?.note === 'required'
                ? 'contracts.actionDialog.noteRequired'
                : 'contracts.actionDialog.note'
              ) | transloco
            }}
            <textarea
              id="cf-action-note"
              rows="3"
              maxlength="2000"
              class="rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg"
              [value]="note()"
              (input)="note.set($any($event.target).value)"
              data-testid="action-note"
            ></textarea>
          </label>
        </div>
      }
    </app-confirm-dialog>
  `,
})
export class ContractWorkflowBar {
  private readonly language = inject(LanguageService);

  readonly contract = input.required<Contract>();
  readonly busy = input(false);
  readonly run = output<WorkflowRun>();

  protected readonly answers = REVIEW_ANSWERS;
  protected readonly itemKey = reviewItemKey;
  protected readonly pending = signal<ContractAction | null>(null);
  protected readonly note = signal('');
  protected readonly date = signal('');
  protected readonly answered = signal<Readonly<Record<string, ReviewAnswer>>>({});

  private readonly allowed = computed(() =>
    CONTRACT_ACTIONS.filter((a) => this.contract().allowed_actions.includes(a)),
  );
  /** The next step forward: at most one primary button. */
  protected readonly forward = computed(() =>
    this.allowed()
      .filter((a) => FORWARD_ACTIONS.includes(a))
      .slice(0, 1),
  );
  protected readonly side = computed(() =>
    this.allowed().filter((a) => !this.forward().includes(a) && !EXIT_ACTIONS.includes(a)),
  );
  protected readonly exits = computed(() => this.allowed().filter((a) => EXIT_ACTIONS.includes(a)));

  protected readonly reviewItems = computed(() => this.contract().review_items ?? []);
  protected readonly review = computed(() => reviewState(this.reviewItems(), this.answered()));
  protected readonly inputs = computed(() => {
    const a = this.pending();
    return a ? actionInputs(a) : null;
  });
  protected readonly blocked = computed(() => {
    if (this.inputs()?.note === 'required' && !this.note().trim()) {
      return true;
    }
    if (this.pending() === 'approve') {
      const r = this.review();
      return !r.complete || r.declined;
    }
    return false;
  });
  protected readonly dialogTitle = computed(() => {
    const a = this.pending();
    return a ? this.language.translate(`contracts.actionDialog.titles.${a}`) : '';
  });
  protected readonly dialogMessage = computed(() => {
    const a = this.pending();
    return a
      ? this.language.translate(`contracts.actionDialog.messages.${a}`, {
          code: this.contract().code,
        })
      : '';
  });
  protected readonly dialogConfirm = computed(() => {
    const a = this.pending();
    return a ? this.language.translate(`contracts.actions.${a}`) : '';
  });

  protected variant(action: ContractAction) {
    return actionVariant(action);
  }

  protected answer(key: string, value: ReviewAnswer): void {
    this.answered.update((a) => ({ ...a, [key]: value }));
  }

  /** Open an action's dialog (also used by the guided next steps). */
  open(action: ContractAction): void {
    this.note.set('');
    this.answered.set({});
    const c = this.contract();
    const kind = actionInputs(action).date;
    this.date.set(
      kind === 'newEnd'
        ? proposedRenewalEnd(c)
        : kind === 'nextReview'
          ? ''
          : kind === 'effective'
            ? action === 'activate' && c.signed_date
              ? c.signed_date
              : action === 'expire' && c.end_date
                ? c.end_date
                : todayIso()
            : '',
    );
    this.pending.set(action);
  }

  protected confirm(): void {
    const action = this.pending();
    if (!action || this.blocked()) {
      return;
    }
    const kind = actionInputs(action).date;
    const note = this.note().trim();
    const date = this.date();
    const answers = this.answered();
    const body: ContractActionBody = {
      ...(note ? { note } : {}),
      ...(kind === 'effective' && date ? { effective_date: date } : {}),
      ...(kind === 'newEnd' && date ? { new_end_date: date } : {}),
      ...(kind === 'nextReview' && date ? { next_review_date: date } : {}),
      ...(action === 'approve'
        ? { checklist: this.reviewItems().map((key) => ({ key, answer: answers[key] })) }
        : {}),
    };
    this.pending.set(null);
    this.run.emit({ action, body });
  }
}
