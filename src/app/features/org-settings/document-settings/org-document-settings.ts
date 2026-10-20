import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgApi } from '../../../core/org/org-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';

/**
 * Org-wide document control settings (`org:manage`; the host gates rendering).
 * Currently a single switch: require an approver other than the author
 * (segregation of duties). Saves immediately and reverts if the server rejects
 * it. Reloads on org switch.
 */
@Component({
  selector: 'app-org-document-settings',
  imports: [TranslocoPipe, Alert, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-testid="settings-documents">
      <h2 class="mb-3 font-display text-[18px] font-bold tracking-[-0.02em] text-fg">
        {{ 'settings.documents.title' | transloco }}
      </h2>
      <app-card>
        @if (loading()) {
          <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (loadError()) {
          <app-alert>{{ 'settings.documents.loadError' | transloco }}</app-alert>
        } @else {
          <div class="flex items-center gap-4">
            <div class="min-w-0 flex-1">
              <div id="segregation-label" class="text-[13.5px] font-semibold text-fg">
                {{ 'settings.documents.segregation' | transloco }}
              </div>
              <div id="segregation-hint" class="mt-0.5 text-[12.5px] text-fg-muted">
                {{ 'settings.documents.segregationHint' | transloco }}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="segregation-switch"
              [attr.aria-checked]="segregation()"
              aria-labelledby="segregation-label"
              aria-describedby="segregation-hint"
              [disabled]="saving()"
              (click)="toggle()"
              class="relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
              [class.bg-accent]="segregation()"
              [class.bg-border-strong]="!segregation()"
            >
              <span
                class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                [class.translate-x-5]="segregation()"
                [class.translate-x-0.5]="!segregation()"
              ></span>
            </button>
          </div>
        }
      </app-card>
    </section>
  `,
})
export class OrgDocumentSettings {
  private readonly orgApi = inject(OrgApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);

  protected readonly segregation = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.segregation.set(false);
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
    const previous = this.segregation();
    const next = !previous;
    this.segregation.set(next);
    this.saving.set(true);
    this.orgApi.updateSettings(orgId, { require_document_segregation: next }).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.segregation.set(saved.require_document_segregation);
        this.toasts.success('settings.documents.saved');
      },
      error: () => {
        this.saving.set(false);
        this.segregation.set(previous);
        this.toasts.error('settings.documents.saveFailed');
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
        this.segregation.set(settings.require_document_segregation);
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
