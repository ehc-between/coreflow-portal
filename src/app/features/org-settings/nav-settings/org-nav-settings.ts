import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgApi } from '../../../core/org/org-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ShellPreferencesService } from '../../../core/shell/shell-preferences.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';

/**
 * The organisation's menu (U03, `org:manage`; renders nothing without it): one
 * switch for the new, simpler menu (`coreflow.nav.v2`, saved as `nav_v2` in the org
 * settings). Off by default until the round's acceptance gate passes; every member
 * can still switch back for themselves in the account menu. Saves immediately and
 * reverts if the server says no.
 */
@Component({
  selector: 'app-org-nav-settings',
  imports: [TranslocoPipe, Alert, Card],
  viewProviders: [provideSharedScope('shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canManage()) {
      <section data-testid="settings-nav-v2" class="mt-8" aria-labelledby="nav-v2-title">
        <h2
          id="nav-v2-title"
          class="mb-3 font-display text-section font-bold tracking-[-0.02em] text-fg"
        >
          {{ 'shell.orgSettings.title' | transloco }}
        </h2>
        <app-card>
          @if (loading()) {
            <p class="text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (loadError()) {
            <app-alert>{{ 'shell.orgSettings.loadError' | transloco }}</app-alert>
          } @else {
            <div class="flex items-center gap-4">
              <div class="min-w-0 flex-1">
                <div id="nav-v2-label" class="text-ui font-semibold text-fg">
                  {{ 'shell.orgSettings.label' | transloco }}
                </div>
                <div id="nav-v2-hint" class="mt-0.5 text-meta text-fg-muted">
                  {{ 'shell.orgSettings.hint' | transloco }}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                data-testid="nav-v2-switch"
                [attr.aria-checked]="enabled()"
                aria-labelledby="nav-v2-label"
                aria-describedby="nav-v2-hint"
                [disabled]="saving()"
                (click)="toggle()"
                class="relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
                [class.bg-accent]="enabled()"
                [class.bg-border-strong]="!enabled()"
              >
                <span
                  class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                  [class.translate-x-5]="enabled()"
                  [class.translate-x-0.5]="!enabled()"
                ></span>
              </button>
            </div>
          }
        </app-card>
      </section>
    }
  `,
})
export class OrgNavSettings {
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly injector = inject(Injector);
  private readonly toasts = inject(NotificationService);

  protected readonly enabled = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly canManage = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('org:manage') === true,
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canManage = this.canManage();
      untracked(() => {
        this.enabled.set(false);
        this.loadError.set(false);
        if (orgId && canManage) {
          this.load(orgId);
        }
      });
    });
  }

  protected toggle(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const previous = this.enabled();
    const next = !previous;
    this.enabled.set(next);
    this.saving.set(true);
    this.orgApi.updateSettings(orgId, { nav_v2: next }).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.enabled.set(saved.nav_v2 === true);
        this.toasts.success(next ? 'shell.orgSettings.savedOn' : 'shell.orgSettings.savedOff');
        // The admin's own menu follows the new default unless they chose otherwise.
        this.injector.get(ShellPreferencesService).reload();
      },
      error: () => {
        this.saving.set(false);
        this.enabled.set(previous);
        this.toasts.error('shell.orgSettings.saveFailed');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.orgApi.getSettings(orgId).subscribe({
      next: (settings) => {
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        this.enabled.set(settings.nav_v2 === true);
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
