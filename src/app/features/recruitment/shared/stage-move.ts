import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { PromptDialog } from '../../../shared/ui/prompt-dialog/prompt-dialog';
import { RecruitmentApi } from '../data/recruitment-api';
import { moveTargets } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ApplicationDetail,
  MoveStage,
  REJECTION_REASONS,
  RejectionReason,
  Stage,
} from '../data/recruitment.models';

let nextId = 0;

/**
 * "Move to stage" control for one application (keyboard-friendly alternative to
 * drag and drop). Rejecting asks for a job-related reason first. Moving past
 * screening before every criterion has a result is refused by the server
 * (`screening_incomplete`); the control then asks for a written reason, which is
 * stored on the application and logged, and retries with it.
 */
@Component({
  selector: 'app-stage-move',
  imports: [TranslocoPipe, ConfirmDialog, PromptDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block' },
  template: `
    @if (targets().length > 0) {
      <label class="sr-only" [attr.for]="uid">{{
        'recruitment.move.label' | transloco: { name: subject() }
      }}</label>
      <select
        #picker
        [id]="uid"
        class="h-9 w-full max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        [disabled]="disabled() || busy()"
        (change)="choose($any($event.target).value)"
        [attr.data-testid]="'move-' + applicationId()"
      >
        <option value="" selected>{{ 'recruitment.move.placeholder' | transloco }}</option>
        @for (t of targets(); track t) {
          <option [value]="t">{{ 'recruitment.stage.' + t | transloco }}</option>
        }
      </select>
    }
    <app-confirm-dialog
      [open]="rejecting()"
      [title]="'recruitment.move.rejectTitle' | transloco"
      [message]="'recruitment.move.rejectMessage' | transloco: { name: subject() }"
      [confirmLabel]="'recruitment.move.rejectConfirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      [confirmDisabled]="!reason()"
      (confirmed)="reject()"
      (cancelled)="cancelReject()"
    >
      <div class="mt-3 flex flex-col gap-2">
        <label class="text-ui font-semibold text-fg-muted" [attr.for]="uid + '-reason'">
          {{ 'recruitment.fields.rejectionReason' | transloco }}
          <span class="text-fail" aria-hidden="true">*</span>
        </label>
        <select
          [id]="uid + '-reason'"
          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          (change)="reason.set($any($event.target).value)"
        >
          <option value="" [selected]="!reason()">
            {{ 'recruitment.move.chooseReason' | transloco }}
          </option>
          @for (r of reasons; track r) {
            <option [value]="r" [selected]="r === reason()">
              {{ 'recruitment.rejectionReason.' + r | transloco }}
            </option>
          }
        </select>
        <label class="text-ui font-semibold text-fg-muted" [attr.for]="uid + '-note'">{{
          'recruitment.fields.rejectionNote' | transloco
        }}</label>
        <textarea
          [id]="uid + '-note'"
          rows="3"
          maxlength="2000"
          class="rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent"
          [value]="note()"
          (input)="note.set($any($event.target).value)"
        ></textarea>
      </div>
    </app-confirm-dialog>
    <app-prompt-dialog
      [open]="overrideFor() !== null"
      [title]="'recruitment.move.overrideTitle' | transloco"
      [message]="
        'recruitment.move.overrideMessage'
          | transloco: { count: missingCount(), stage: overrideStageLabel() }
      "
      [label]="'recruitment.move.overrideLabel' | transloco"
      [required]="true"
      [busy]="busy()"
      [confirmLabel]="'recruitment.move.overrideConfirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      (confirmed)="override($event)"
      (cancelled)="cancelOverride()"
    />
  `,
})
export class StageMove {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly applicationId = input.required<string>();
  readonly stage = input.required<Stage>();
  /** Who is moved (for the accessible label), e.g. the candidate's name or the code. */
  readonly name = input<string>('');
  readonly disabled = input(false);
  readonly moved = output<ApplicationDetail>();

  private readonly picker = viewChild<ElementRef<HTMLSelectElement>>('picker');

  protected readonly uid = `cf-move-${++nextId}`;
  protected readonly reasons = REJECTION_REASONS;
  protected readonly busy = signal(false);
  protected readonly rejecting = signal(false);
  protected readonly reason = signal<RejectionReason | ''>('');
  protected readonly note = signal('');
  /** The stage waiting for a screening override reason. */
  protected readonly overrideFor = signal<MoveStage | null>(null);
  protected readonly missingCount = signal(0);
  protected readonly targets = computed(() => moveTargets(this.stage()));
  protected readonly subject = computed(
    () => this.name() || this.language.translate('recruitment.move.thisApplication'),
  );
  protected readonly overrideStageLabel = computed(() => {
    const stage = this.overrideFor();
    return stage ? this.language.translate(`recruitment.stage.${stage}`) : '';
  });

  protected choose(value: string): void {
    if (!value) {
      return;
    }
    if (value === 'rejected') {
      this.reason.set('');
      this.note.set('');
      this.rejecting.set(true);
      return;
    }
    this.send(value as MoveStage, null, null, null);
  }

  protected cancelReject(): void {
    this.rejecting.set(false);
    this.resetPicker();
  }

  protected reject(): void {
    const reason = this.reason();
    if (reason) {
      this.send('rejected', reason, this.note().trim() || null, null);
    }
  }

  protected override(reason: string): void {
    const stage = this.overrideFor();
    if (stage && reason.trim()) {
      this.send(stage, null, null, reason.trim());
    }
  }

  protected cancelOverride(): void {
    this.overrideFor.set(null);
    this.resetPicker();
  }

  private send(
    stage: MoveStage,
    reason: RejectionReason | null,
    note: string | null,
    overrideReason: string | null,
  ): void {
    const orgId = this.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .move(orgId, this.applicationId(), {
        stage,
        rejection_reason: reason,
        note,
        ...(overrideReason ? { override_reason: overrideReason } : {}),
      })
      .subscribe({
        next: (app) => {
          this.busy.set(false);
          this.rejecting.set(false);
          this.overrideFor.set(null);
          this.resetPicker();
          this.toasts.success('recruitment.move.done', {
            stage: this.language.translate(`recruitment.stage.${app.stage}`),
          });
          this.moved.emit(app);
        },
        error: (err) => {
          this.busy.set(false);
          this.rejecting.set(false);
          const e = recruitmentError(err);
          if (e.key === 'recruitment.errors.screening_incomplete' && !overrideReason) {
            const missing = e.detail['missing'];
            this.missingCount.set(Array.isArray(missing) ? missing.length : 0);
            this.overrideFor.set(stage);
            return;
          }
          this.overrideFor.set(null);
          this.resetPicker();
          this.toasts.error(e.key);
        },
      });
  }

  private resetPicker(): void {
    const el = this.picker()?.nativeElement;
    if (el) {
      el.value = '';
    }
  }
}
