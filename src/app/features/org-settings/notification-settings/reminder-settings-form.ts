import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ESCALATION_DAYS_MAX,
  ESCALATION_DAYS_MIN,
  NotificationSettings,
  REMINDER_DAYS_MAX,
} from '../../../core/notifications/activity.models';
import { activityErrorKey } from '../../../core/notifications/activity-errors';
import { NotificationRulesApi } from '../../../core/notifications/notification-rules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgRole } from '../../../core/org/org.models';
import { relevantRoles } from '../../../core/org/roles';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Switch } from '../../../shared/ui/switch/switch';

/**
 * Org-wide due-date reminder and escalation settings: how many days ahead a
 * reminder goes out, after how many overdue days an item escalates (and again
 * per further period), and to whom (the department lead and / or a role).
 */
@Component({
  selector: 'app-reminder-settings-form',
  imports: [
    TranslocoPipe,
    ReactiveFormsModule,
    FormActions,
    FormField,
    FormSection,
    Switch,
    Button,
    Alert,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="flex flex-col gap-5"
      [formGroup]="form"
      (ngSubmit)="save()"
      data-testid="reminder-settings"
    >
      <app-form-section
        [title]="'activity.reminders.title' | transloco"
        [description]="'activity.reminders.subtitle' | transloco"
      >
        <app-form-field
          inputId="reminder-days"
          [label]="'activity.reminders.reminderDays' | transloco"
          [hint]="'activity.reminders.reminderDaysHelp' | transloco: { max: reminderMax }"
        >
          <input
            id="reminder-days"
            type="number"
            min="0"
            [max]="reminderMax"
            formControlName="reminder_days"
          />
        </app-form-field>
        <app-form-field
          inputId="escalation-days"
          [label]="'activity.reminders.escalationDays' | transloco"
          [hint]="'activity.reminders.escalationDaysHelp' | transloco: { max: escalationMax }"
        >
          <input
            id="escalation-days"
            type="number"
            [min]="escalationMin"
            [max]="escalationMax"
            formControlName="escalation_days"
          />
        </app-form-field>
        <app-form-field
          span="full"
          inputId="escalation-role"
          [label]="'activity.reminders.escalationRole' | transloco"
          [hint]="'activity.reminders.escalationRoleHelp' | transloco"
        >
          <select id="escalation-role" formControlName="escalation_role_key">
            <option [ngValue]="null">{{ 'activity.reminders.noRole' | transloco }}</option>
            @for (role of shownRoles(); track role.key) {
              <option [ngValue]="role.key">{{ roleLabel(role) }}</option>
            }
          </select>
        </app-form-field>
        <div class="sm:col-span-2">
          <div class="flex min-h-10 items-center rounded-tile border border-border px-3">
            <app-switch
              [checked]="form.controls.escalate_to_department_lead.value"
              (checkedChange)="form.controls.escalate_to_department_lead.setValue($event)"
            >
              {{ 'activity.reminders.escalateToLead' | transloco }}
            </app-switch>
          </div>
          <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
            {{ 'activity.reminders.escalateToLeadHelp' | transloco }}
          </p>
        </div>
      </app-form-section>

      @if (invalid()) {
        <app-alert tone="info">{{ 'activity.reminders.invalid' | transloco }}</app-alert>
      }
      @if (errorKey(); as e) {
        <app-alert data-testid="settings-error">{{ e | transloco }}</app-alert>
      }

      <app-form-actions>
        <app-button type="submit" [loading]="saving()" data-testid="settings-save">
          {{ 'activity.reminders.save' | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class ReminderSettingsForm {
  private readonly api = inject(NotificationRulesApi);
  private readonly toasts = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  readonly orgId = input.required<string>();
  readonly settings = input<NotificationSettings | null>(null);
  readonly roles = input<readonly OrgRole[]>([]);
  /** Translated role name (host-provided so it follows the org's role catalogue). */
  readonly roleName = input<(role: OrgRole) => string>((role) => role.name);
  readonly saved = output<NotificationSettings>();

  /** U37: the named roles (plus the one already chosen), not the whole global catalogue. */
  protected readonly shownRoles = computed(() => {
    const chosen = this.settings()?.escalation_role_key;
    return relevantRoles(this.roles(), chosen ? [chosen] : []);
  });
  protected readonly reminderMax = REMINDER_DAYS_MAX;
  protected readonly escalationMin = ESCALATION_DAYS_MIN;
  protected readonly escalationMax = ESCALATION_DAYS_MAX;

  protected readonly form = this.fb.nonNullable.group({
    reminder_days: [3, [Validators.required, Validators.min(0), Validators.max(REMINDER_DAYS_MAX)]],
    escalation_days: [
      3,
      [
        Validators.required,
        Validators.min(ESCALATION_DAYS_MIN),
        Validators.max(ESCALATION_DAYS_MAX),
      ],
    ],
    escalation_role_key: this.fb.control<string | null>(null),
    escalate_to_department_lead: true,
  });

  protected readonly saving = signal(false);
  protected readonly invalid = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  constructor() {
    effect(() => {
      const settings = this.settings();
      untracked(() => {
        if (settings) this.form.reset(settings);
      });
    });
  }

  protected roleLabel(role: OrgRole): string {
    return this.roleName()(role);
  }

  protected save(): void {
    if (this.saving()) return;
    this.errorKey.set(null);
    if (this.form.invalid) {
      this.invalid.set(true);
      this.form.markAllAsTouched();
      return;
    }
    this.invalid.set(false);
    const value = this.form.getRawValue();
    const body: NotificationSettings = {
      reminder_days: Math.trunc(Number(value.reminder_days)),
      escalation_days: Math.trunc(Number(value.escalation_days)),
      escalation_role_key: value.escalation_role_key || null,
      escalate_to_department_lead: value.escalate_to_department_lead,
    };
    this.saving.set(true);
    this.api.updateSettings(this.orgId(), body).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.form.reset(saved);
        this.toasts.success('activity.reminders.saved');
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(activityErrorKey(error));
      },
    });
  }
}
