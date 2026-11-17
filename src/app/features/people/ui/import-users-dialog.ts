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
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PeopleApi } from '../data/people-api';
import { peopleErrorKey } from '../data/people-errors';
import { UserMatch, UserMatches } from '../data/people.models';

/**
 * "Importer brukere som personer": the organisation's members who have no person
 * record yet (each can become one in one go), and the suggested links between
 * existing people and user accounts (same email, or an unambiguous name) with
 * "Koble til". Without the link, training, tasks and access reviews cannot reach
 * the person.
 */
@Component({
  selector: 'app-people-import-users-dialog',
  imports: [TranslocoPipe, Button, ConfirmDialog, LoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [open]="open()"
      [title]="'people.import.title' | transloco"
      [message]="'people.import.message' | transloco"
      [confirmLabel]="confirmKey() | transloco: { count: selected().size }"
      [cancelLabel]="'common.close' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="selected().size === 0"
      (confirmed)="importSelected()"
      (cancelled)="closed.emit()"
    >
      <div class="mt-4 flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        @if (!data()) {
          <app-loading-state [rows]="3" />
        } @else {
          @if (data()!.suggestions.length) {
            <section aria-labelledby="cf-imp-sugg">
              <h3 id="cf-imp-sugg" class="mb-1 text-ui font-semibold text-fg">
                {{ 'people.import.suggestionsTitle' | transloco }}
              </h3>
              <ul
                class="divide-y divide-border rounded-tile border border-border"
                data-testid="match-rows"
              >
                @for (m of data()!.suggestions; track m.employee_id) {
                  <li class="flex flex-wrap items-center gap-2 px-3 py-2 text-ui">
                    <span class="min-w-0 flex-1">
                      <span class="font-semibold text-fg">{{ m.employee_name }}</span>
                      <span class="text-fg-muted">
                        → {{ m.user.name ?? m.user.email }} ({{ m.user.email }})</span
                      >
                      <span class="block text-meta text-fg-subtle">{{
                        'people.import.reason.' + m.reason | transloco
                      }}</span>
                    </span>
                    <app-button
                      size="sm"
                      variant="secondary"
                      [disabled]="busy()"
                      (click)="link(m)"
                      [attr.data-testid]="'link-' + m.employee_id"
                    >
                      {{ 'people.account.link' | transloco }}
                    </app-button>
                  </li>
                }
              </ul>
            </section>
          }
          <section aria-labelledby="cf-imp-members">
            <h3 id="cf-imp-members" class="mb-1 text-ui font-semibold text-fg">
              {{ 'people.import.membersTitle' | transloco }}
            </h3>
            @if (candidates().length === 0) {
              <p class="text-ui text-fg-muted" data-testid="import-none">
                {{ 'people.import.none' | transloco }}
              </p>
            } @else {
              <label class="mb-1 flex items-center gap-2 text-meta text-fg-muted">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-[var(--accent)]"
                  [checked]="selected().size === candidates().length"
                  (change)="toggleAll($any($event.target).checked)"
                />
                {{ 'people.import.selectAll' | transloco }}
              </label>
              <ul
                class="divide-y divide-border rounded-tile border border-border"
                data-testid="import-rows"
              >
                @for (u of candidates(); track u.id) {
                  <li>
                    <label class="flex items-center gap-2 px-3 py-2 text-ui">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="selected().has(u.id)"
                        (change)="toggle(u.id, $any($event.target).checked)"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="font-semibold text-fg">{{ u.name ?? u.email }}</span>
                        <span class="block text-meta text-fg-muted">{{ u.email }}</span>
                      </span>
                    </label>
                  </li>
                }
              </ul>
              <label
                class="mt-3 flex flex-col gap-1 text-meta font-semibold text-fg-muted"
                for="cf-imp-status"
              >
                {{ 'people.import.statusLabel' | transloco }}
                <select
                  id="cf-imp-status"
                  class="h-10 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
                  (change)="status.set($any($event.target).value)"
                >
                  <option value="active" [selected]="status() === 'active'">
                    {{ 'people.status.active' | transloco }}
                  </option>
                  <option value="onboarding" [selected]="status() === 'onboarding'">
                    {{ 'people.status.onboarding' | transloco }}
                  </option>
                </select>
              </label>
            }
          </section>
        }
      </div>
    </app-confirm-dialog>
  `,
})
export class ImportUsersDialog {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly open = input(false);
  readonly done = output<void>();
  readonly closed = output<void>();

  protected readonly data = signal<UserMatches | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly status = signal<'active' | 'onboarding'>('active');
  protected readonly busy = signal(false);

  /** Members without a record that are not just the account of an existing person. */
  protected readonly candidates = computed(() =>
    (this.data()?.members_without_employee ?? []).filter((u) => !u.suggested),
  );
  protected readonly confirmKey = computed(() =>
    this.selected().size === 1 ? 'people.import.confirmOne' : 'people.import.confirm',
  );

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open) {
          this.load();
        }
      });
    });
  }

  protected toggle(id: string, on: boolean): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected toggleAll(on: boolean): void {
    this.selected.set(on ? new Set(this.candidates().map((u) => u.id)) : new Set());
  }

  protected link(match: UserMatch): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateEmployee(orgId, match.employee_id, { user_id: match.user.id }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('people.notices.accountLinked', {
          name: match.user.name ?? match.user.email,
        });
        this.load();
        this.done.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  protected importSelected(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const ids = [...this.selected()];
    if (!orgId || !ids.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.importUsers(orgId, { user_ids: ids, status: this.status() }).subscribe({
      next: (page) => {
        this.busy.set(false);
        this.selected.set(new Set());
        this.notifications.success(
          page.total === 1 ? 'people.notices.importedOne' : 'people.notices.imported',
          { count: page.total },
        );
        this.done.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.userMatches(orgId).subscribe({
      next: (data) => {
        this.data.set(data);
        this.selected.set(new Set());
      },
      error: () => this.data.set({ suggestions: [], members_without_employee: [] }),
    });
  }
}
