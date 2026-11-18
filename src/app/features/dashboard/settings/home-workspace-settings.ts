import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';
import { HomeApi } from '../data/home-api';
import { RoleWorkspace, WORKSPACE_KEYS, WorkspaceKey } from '../data/home.models';

/**
 * Org settings: which home page ("startside") each RBAC role starts on (U07,
 * `GET` / `PUT /home/workspaces`, `org:manage`; renders nothing without it). One
 * select per role; a change saves at once and reverts if the server says no.
 * Choosing the default removes the override.
 */
@Component({
  selector: 'app-home-workspace-settings',
  imports: [TranslocoPipe, Alert, Card],
  viewProviders: [provideSharedScope('home')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canManage()) {
      <section data-testid="settings-home-workspaces" class="mt-8" aria-labelledby="home-ws-title">
        <h2
          id="home-ws-title"
          class="mb-1 font-display text-section font-bold tracking-[-0.02em] text-fg"
        >
          {{ 'home.workspace.settings.title' | transloco }}
        </h2>
        <p class="mb-3 text-ui text-fg-muted">{{ 'home.workspace.settings.hint' | transloco }}</p>
        <app-card>
          @if (loading()) {
            <p class="text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (loadError()) {
            <app-alert>{{ 'home.workspace.settings.loadError' | transloco }}</app-alert>
          } @else {
            <ul class="flex flex-col divide-y divide-border">
              @for (row of roles(); track row.role) {
                <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <label
                    [for]="'home-ws-' + row.role"
                    class="min-w-0 flex-1 text-ui font-semibold text-fg"
                    >{{ row.name }}</label
                  >
                  <select
                    [id]="'home-ws-' + row.role"
                    class="min-h-10 rounded-tile border border-border bg-surface px-2 text-ui text-fg"
                    [attr.data-testid]="'home-ws-select-' + row.role"
                    [disabled]="saving() === row.role"
                    (change)="choose(row, $any($event.target))"
                  >
                    @for (ws of workspaces; track ws) {
                      <option [value]="ws" [selected]="row.workspace === ws">
                        {{ 'home.workspace.names.' + ws | transloco }}
                        @if (ws === row.default_workspace) {
                          {{ 'home.workspace.settings.default' | transloco }}
                        }
                      </option>
                    }
                  </select>
                  <p class="w-full text-meta text-fg-muted">
                    {{ 'home.workspace.settings.descriptions.' + row.workspace | transloco }}
                  </p>
                </li>
              }
            </ul>
          }
        </app-card>
      </section>
    }
  `,
})
export class HomeWorkspaceSettings {
  private readonly api = inject(HomeApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  protected readonly workspaces = WORKSPACE_KEYS;
  protected readonly roles = signal<readonly RoleWorkspace[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  /** The role being saved. */
  protected readonly saving = signal<string | null>(null);
  protected readonly canManage = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('org:manage') === true,
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canManage = this.canManage();
      untracked(() => {
        this.roles.set([]);
        this.loadError.set(false);
        if (orgId && canManage) {
          this.load(orgId);
        }
      });
    });
  }

  protected choose(row: RoleWorkspace, select: HTMLSelectElement): void {
    const value = select.value;
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !(WORKSPACE_KEYS as readonly string[]).includes(value)) {
      return;
    }
    const next = value as WorkspaceKey;
    const previous = this.roles();
    this.roles.update((rows) =>
      rows.map((r) => (r.role === row.role ? { ...r, workspace: next } : r)),
    );
    this.saving.set(row.role);
    const mapping = { [row.role]: next === row.default_workspace ? null : next };
    this.api.setWorkspaces(orgId, mapping).subscribe({
      next: (saved) => {
        this.saving.set(null);
        this.roles.set(saved.roles);
        this.toasts.success('home.workspace.settings.saved', { role: row.name });
      },
      error: () => {
        this.saving.set(null);
        this.roles.set(previous);
        // The bound options did not change, so put the select back by hand.
        select.value = row.workspace;
        this.toasts.error('home.workspace.settings.saveFailed');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.api.workspaces(orgId).subscribe({
      next: (settings) => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.roles.set(settings.roles);
        this.loading.set(false);
      },
      error: () => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}
