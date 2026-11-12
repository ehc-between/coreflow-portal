import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DepartmentLead } from '../../../core/notifications/activity.models';
import { activityErrorKey } from '../../../core/notifications/activity-errors';
import { NotificationRulesApi } from '../../../core/notifications/notification-rules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgMember } from '../../../core/org/org.models';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';

/**
 * Department leads: the person overdue items in a department escalate to (and
 * the `department_lead` recipient of notification rules). Each change saves
 * immediately and reverts if the server rejects it.
 */
@Component({
  selector: 'app-department-leads',
  imports: [TranslocoPipe, RouterLink, Card, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="border-b border-border px-5 py-4">
        <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'activity.leads.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[13px] text-fg-muted">{{ 'activity.leads.subtitle' | transloco }}</p>
      </div>

      @if (leads().length === 0) {
        <div class="px-5 py-8 text-center" data-testid="leads-empty">
          <p class="text-[13.5px] font-semibold text-fg">
            {{ 'activity.leads.emptyTitle' | transloco }}
          </p>
          <p class="mx-auto mt-1 max-w-md text-[13px] text-fg-muted">
            {{ 'activity.leads.emptyBody' | transloco }}
          </p>
          <a
            routerLink="/settings"
            class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'activity.leads.emptyCta' | transloco }}
          </a>
        </div>
      } @else {
        <ul class="divide-y divide-border">
          @for (lead of leads(); track lead.department_id) {
            <li class="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
              <label
                [for]="'lead-' + lead.department_id"
                class="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg"
              >
                {{ lead.name }}
              </label>
              <select
                [id]="'lead-' + lead.department_id"
                data-testid="lead-select"
                [disabled]="saving().has(lead.department_id)"
                [value]="lead.lead_user_id ?? ''"
                (change)="change(lead, $event)"
                class="h-9 w-full rounded-[10px] border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-60 sm:w-64"
              >
                <option value="">{{ 'activity.leads.none' | transloco }}</option>
                @for (member of activeMembers(); track member.user_id) {
                  <option
                    [value]="member.user_id"
                    [selected]="member.user_id === lead.lead_user_id"
                  >
                    {{ member.full_name || member.email }}
                  </option>
                }
              </select>
            </li>
          }
        </ul>
      }
      @if (errorKey(); as e) {
        <div class="border-t border-border p-4">
          <app-alert data-testid="leads-error">{{ e | transloco }}</app-alert>
        </div>
      }
    </app-card>
  `,
})
export class DepartmentLeads {
  private readonly api = inject(NotificationRulesApi);
  private readonly toasts = inject(NotificationService);

  readonly orgId = input.required<string>();
  readonly leads = input<readonly DepartmentLead[]>([]);
  readonly members = input<readonly OrgMember[]>([]);
  readonly changed = output<DepartmentLead>();

  protected readonly saving = signal<ReadonlySet<string>>(new Set());
  protected readonly errorKey = signal<string | null>(null);
  protected readonly activeMembers = computed(() => this.members().filter((m) => m.is_active));

  protected change(lead: DepartmentLead, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const userId = select.value || null;
    if (userId === lead.lead_user_id) return;
    this.errorKey.set(null);
    this.setSaving(lead.department_id, true);
    this.api.setDepartmentLead(this.orgId(), lead.department_id, userId).subscribe({
      next: (saved) => {
        this.setSaving(lead.department_id, false);
        this.toasts.success('activity.leads.saved');
        this.changed.emit(saved);
      },
      error: (error: unknown) => {
        this.setSaving(lead.department_id, false);
        select.value = lead.lead_user_id ?? '';
        this.errorKey.set(activityErrorKey(error));
      },
    });
  }

  private setSaving(id: string, on: boolean): void {
    this.saving.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
