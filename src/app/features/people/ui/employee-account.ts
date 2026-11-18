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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { PeopleApi } from '../data/people-api';
import { peopleErrorKey } from '../data/people-errors';
import { Employee, UserMatch } from '../data/people.models';

/**
 * Shown on a person without a user account: why the link matters (training, tasks
 * and access reviews reach people through their account) and, when CoreFlow found a
 * member with the same email or name, a one-click "Koble til" for that account.
 */
@Component({
  selector: 'app-people-employee-account',
  imports: [RouterLink, TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col gap-2 rounded-card border border-warn/30 bg-warn-soft/60 px-4 py-3 sm:flex-row sm:items-center"
      data-testid="account-missing"
    >
      <app-icon name="people" [size]="18" class="flex-none text-warn-ink" />
      <div class="min-w-0 flex-1 text-ui">
        <p class="font-semibold text-fg">{{ 'people.account.missingTitle' | transloco }}</p>
        @if (match(); as m) {
          <p class="text-fg-muted" data-testid="account-match">
            {{
              'people.account.match.' + m.reason
                | transloco: { name: m.user.name ?? m.user.email, email: m.user.email }
            }}
          </p>
        } @else {
          <p class="text-fg-muted">{{ 'people.account.missingBody' | transloco }}</p>
        }
      </div>
      @if (canEdit()) {
        @if (match(); as m) {
          <app-button size="sm" (click)="link(m)" [loading]="busy()" data-testid="account-link">
            {{ 'people.account.link' | transloco }}
          </app-button>
        } @else {
          <a [routerLink]="['/people/employees', employee().id, 'edit']">
            <app-button size="sm" variant="secondary">{{
              'people.account.choose' | transloco
            }}</app-button>
          </a>
        }
      }
    </div>
  `,
})
export class EmployeeAccount {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly employee = input.required<Employee>();
  readonly canEdit = input(false);
  readonly linked = output<Employee>();

  private readonly matches = signal<readonly UserMatch[]>([]);
  protected readonly busy = signal(false);
  protected readonly match = computed(
    () => this.matches().find((m) => m.employee_id === this.employee().id) ?? null,
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.employee();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.userMatches(orgId).subscribe({
          next: (m) => this.matches.set(m.suggestions),
          error: () => this.matches.set([]),
        });
      });
    });
  }

  protected link(match: UserMatch): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateEmployee(orgId, this.employee().id, { user_id: match.user.id }).subscribe({
      next: (employee) => {
        this.busy.set(false);
        this.notifications.success('people.notices.accountLinked', {
          name: match.user.name ?? match.user.email,
        });
        this.linked.emit(employee);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }
}
