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
import {
  CONTRACT_ACTIONS,
  Contract,
  ContractAction,
  ContractActionBody,
  NOTE_REQUIRED_ACTIONS,
} from './data/contract.models';
import { actionVariant, todayIso } from './data/contract-display';

export interface WorkflowRun {
  readonly action: ContractAction;
  readonly body: ContractActionBody;
}

/** Which extra inputs an action's dialog asks for. */
export function actionInputs(action: ContractAction): {
  readonly note: 'required' | 'optional';
  readonly date: 'effective' | 'newEnd' | null;
} {
  const note = NOTE_REQUIRED_ACTIONS.includes(action) ? 'required' : 'optional';
  switch (action) {
    case 'activate':
    case 'terminate':
    case 'expire':
      return { note, date: 'effective' };
    case 'renew':
      return { note, date: 'newEnd' };
    default:
      return { note, date: null };
  }
}

/** The renewed end date the dialog proposes: end date + renewal term, if both are known. */
export function proposedRenewalEnd(contract: Contract): string {
  if (!contract.end_date || !contract.renewal_term_months) {
    return '';
  }
  const [y, m, d] = contract.end_date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + contract.renewal_term_months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The approval workflow of a contract: one button per allowed action (draft ->
 * in review -> approved -> active, renew, terminate, expire). Each opens a
 * confirmation with the note and date the action takes; the parent runs it.
 */
@Component({
  selector: 'app-contract-workflow-bar',
  imports: [TranslocoPipe, Button, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actions().length) {
      <div class="flex flex-wrap items-center gap-2" data-testid="workflow-actions">
        @for (a of actions(); track a) {
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
      [confirmDisabled]="noteMissing()"
      initialFocus="#cf-action-note"
      (confirmed)="confirm()"
      (cancelled)="pending.set(null)"
    >
      @if (pending(); as a) {
        <div class="mt-3 flex flex-col gap-3 text-left">
          @if (inputs()?.date; as kind) {
            <label class="flex flex-col gap-1 text-[13px] font-semibold text-fg-muted">
              {{ 'contracts.actionDialog.' + kind | transloco }}
              <input
                type="date"
                class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
                [value]="date()"
                (change)="date.set($any($event.target).value)"
                data-testid="action-date"
              />
            </label>
          }
          <label class="flex flex-col gap-1 text-[13px] font-semibold text-fg-muted">
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
              class="rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg"
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

  protected readonly pending = signal<ContractAction | null>(null);
  protected readonly note = signal('');
  protected readonly date = signal('');

  protected readonly actions = computed(() =>
    CONTRACT_ACTIONS.filter((a) => this.contract().allowed_actions.includes(a)),
  );
  protected readonly inputs = computed(() => {
    const a = this.pending();
    return a ? actionInputs(a) : null;
  });
  protected readonly noteMissing = computed(
    () => this.inputs()?.note === 'required' && !this.note().trim(),
  );
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

  protected open(action: ContractAction): void {
    this.note.set('');
    const kind = actionInputs(action).date;
    this.date.set(
      kind === 'newEnd'
        ? proposedRenewalEnd(this.contract())
        : kind === 'effective'
          ? action === 'activate' && this.contract().signed_date
            ? this.contract().signed_date!
            : todayIso()
          : '',
    );
    this.pending.set(action);
  }

  protected confirm(): void {
    const action = this.pending();
    if (!action || this.noteMissing()) {
      return;
    }
    const kind = actionInputs(action).date;
    const note = this.note().trim();
    const date = this.date();
    const body: ContractActionBody = {
      ...(note ? { note } : {}),
      ...(kind === 'effective' && date ? { effective_date: date } : {}),
      ...(kind === 'newEnd' && date ? { new_end_date: date } : {}),
    };
    this.pending.set(null);
    this.run.emit({ action, body });
  }
}
