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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { ContextApi } from '../data/context-api';
import { AssigneeIn, AssigneeType, CommunicateRequest } from '../data/context.models';
import { contextErrorKey, dueDayToWire } from '../context-kinds';

/** `user:<id>` / `role:<key>` / `department:<id>` -> assignee, or null. */
export function decodeAssignee(value: string): AssigneeIn | null {
  const match = /^(user|role|department):(.+)$/.exec(value);
  return match ? { type: match[1] as AssigneeType, value: match[2] } : null;
}

/** The communicate request from the panel's fields (null while no assignee is picked). */
export function communicateBody(
  assignee: string,
  dueDay: string,
  message: string,
): CommunicateRequest | null {
  const decoded = decodeAssignee(assignee);
  if (!decoded) {
    return null;
  }
  return {
    assignee: decoded,
    due_at: dueDayToWire(dueDay),
    message: message.trim() || null,
  };
}

/**
 * "Communicate policy": asks a person, role or department to read and
 * acknowledge an approved policy (one acknowledgement task, ISO HS 5.2 / 7.3).
 */
@Component({
  selector: 'app-context-communicate-panel',
  imports: [TranslocoPipe, AssigneeSelect, Button, FormField, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'context.communicate.title' | transloco"
      [subtitle]="policyTitle()"
      [closeLabel]="'context.common.close' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); send()">
        <p class="text-[13px] text-fg-muted">{{ 'context.communicate.intro' | transloco }}</p>
        <app-form-field
          [label]="'context.communicate.assignee' | transloco"
          inputId="cf-comm-assignee"
        >
          <app-assignee-select
            inputId="cf-comm-assignee"
            [value]="assignee()"
            (valueChange)="assignee.set($event)"
          />
        </app-form-field>
        <app-form-field [label]="'context.communicate.due' | transloco" inputId="cf-comm-due">
          <input
            id="cf-comm-due"
            type="date"
            [value]="dueDay()"
            (input)="dueDay.set($any($event.target).value)"
          />
        </app-form-field>
        <app-form-field [label]="'context.communicate.message' | transloco" inputId="cf-comm-msg">
          <textarea
            id="cf-comm-msg"
            rows="4"
            maxlength="2000"
            [value]="message()"
            (input)="message.set($any($event.target).value)"
            [placeholder]="'context.communicate.messagePlaceholder' | transloco"
          ></textarea>
        </app-form-field>
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="closed.emit()">
            {{ 'context.common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [disabled]="!body()" [loading]="busy()">
            {{ 'context.communicate.send' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class CommunicatePanel {
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly open = input(false);
  readonly policyId = input.required<string>();
  readonly policyTitle = input('');
  readonly closed = output<void>();
  /** The acknowledgement task was created. */
  readonly sent = output<string>();

  protected readonly assignee = signal('');
  protected readonly dueDay = signal('');
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly body = computed(() =>
    communicateBody(this.assignee(), this.dueDay(), this.message()),
  );

  protected send(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const body = this.body();
    if (!orgId || !body || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.communicate(orgId, this.policyId(), body).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.assignee.set('');
        this.dueDay.set('');
        this.message.set('');
        this.notifications.success('context.communicate.sent');
        this.sent.emit(result.task_id);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }
}
