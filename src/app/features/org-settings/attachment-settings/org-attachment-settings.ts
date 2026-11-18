import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgApi } from '../../../core/org/org-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';

/**
 * Org-wide attachment safety settings (`org:manage`; the host gates rendering).
 * One switch: accept macro-enabled Office files (.docm, .xlsm, ...), which the
 * server refuses by default because macros can carry malware. Saves only this
 * field immediately and reverts if the server rejects it. Reloads on org switch.
 */
@Component({
  selector: 'app-org-attachment-settings',
  imports: [TranslocoPipe, Alert, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-testid="settings-attachments">
      <h2 class="mb-3 font-display text-section font-bold tracking-[-0.02em] text-fg">
        {{ 'settings.attachments.title' | transloco }}
      </h2>
      <app-card>
        @if (loading()) {
          <p class="text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (loadError()) {
          <app-alert>{{ 'settings.attachments.loadError' | transloco }}</app-alert>
        } @else {
          <div class="flex items-center gap-4">
            <div class="min-w-0 flex-1">
              <div id="macro-label" class="text-ui font-semibold text-fg">
                {{ 'settings.attachments.allowMacros' | transloco }}
              </div>
              <div id="macro-hint" class="mt-0.5 text-meta text-fg-muted">
                {{ 'settings.attachments.allowMacrosHint' | transloco }}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="macro-switch"
              [attr.aria-checked]="allowMacros()"
              aria-labelledby="macro-label"
              aria-describedby="macro-hint"
              [disabled]="saving()"
              (click)="toggle()"
              class="relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
              [class.bg-accent]="allowMacros()"
              [class.bg-border-strong]="!allowMacros()"
            >
              <span
                class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                [class.translate-x-5]="allowMacros()"
                [class.translate-x-0.5]="!allowMacros()"
              ></span>
            </button>
          </div>
        }
      </app-card>
    </section>
  `,
})
export class OrgAttachmentSettings {
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  protected readonly allowMacros = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.allowMacros.set(false);
      this.loadError.set(false);
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected toggle(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const previous = this.allowMacros();
    const next = !previous;
    this.allowMacros.set(next);
    this.saving.set(true);
    // Only this field: the other settings stay as they are on the server.
    this.orgApi.updateSettings(orgId, { allow_macro_attachments: next }).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.allowMacros.set(saved.allow_macro_attachments === true);
        this.toasts.success('settings.attachments.saved');
      },
      error: () => {
        this.saving.set(false);
        this.allowMacros.set(previous);
        this.toasts.error('settings.attachments.saveFailed');
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.orgApi.getSettings(orgId).subscribe({
      next: (settings) => {
        // Ignore a late answer for an org we've since left.
        if (this.selectedOrg.currentOrgId() !== orgId) {
          return;
        }
        // Fail closed against an older server that doesn't know the setting.
        this.allowMacros.set(settings.allow_macro_attachments === true);
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
