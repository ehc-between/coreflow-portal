import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { NotificationPreference } from '../../../core/notifications/user-notification.models';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { CategoryPreferences } from './category-preferences';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { QuietHours } from './quiet-hours';

/**
 * The signed-in user's notification settings: per-org daily email digest
 * (each toggle saves immediately and reverts if the server rejects it), the
 * per-category in-app / email choices for the selected org, and quiet hours.
 */
@Component({
  selector: 'app-notification-preferences',
  imports: [
    TranslocoPipe,
    Alert,
    Card,
    HelpStrip,
    PageHeader,
    WhyItMatters,
    CategoryPreferences,
    QuietHours,
  ],
  viewProviders: [provideSharedScope('activity')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-[808px] px-4 pt-5 pb-12 sm:px-8">
      <app-page-header
        titleKey="notifications.preferences.title"
        descriptionKey="notifications.preferences.subtitle"
      />

      <app-help-strip
        class="block"
        scope="settings"
        page="notification-preferences"
        lesson="following-records"
      />

      <app-category-preferences class="mt-5 block" [digestOff]="digestOff()" />

      <app-card class="mt-5 block" [padded]="false" data-testid="digest-card">
        <div class="border-b border-border px-4 py-3.5">
          <h2 class="text-body font-semibold text-fg">
            {{ 'notifications.preferences.digestTitle' | transloco }}
          </h2>
          <p class="mt-0.5 text-meta text-fg-muted">
            {{ 'notifications.preferences.digestSubtitle' | transloco }}
          </p>
        </div>
        @if (loading()) {
          <p data-testid="preferences-loading" class="px-4 py-6 text-ui text-fg-muted">
            {{ 'notifications.panel.loading' | transloco }}
          </p>
        } @else if (loadError()) {
          <div class="p-4">
            <app-alert>{{ 'notifications.preferences.loadError' | transloco }}</app-alert>
          </div>
        } @else if (items().length === 0) {
          <p data-testid="preferences-empty" class="px-4 py-6 text-ui text-fg-muted">
            {{ 'notifications.preferences.empty' | transloco }}
          </p>
        } @else {
          <ul class="divide-y divide-border">
            @for (pref of items(); track pref.org_id) {
              <li class="flex items-center gap-4 px-4 py-3.5">
                <div class="min-w-0 flex-1">
                  <div
                    [id]="'digest-label-' + pref.org_id"
                    class="truncate text-ui font-semibold text-fg"
                  >
                    {{ pref.org_name }}
                  </div>
                  <div class="text-meta text-fg-muted">
                    {{ 'notifications.preferences.emailDigest' | transloco }}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  [attr.aria-checked]="pref.email_digest"
                  [attr.aria-labelledby]="'digest-label-' + pref.org_id"
                  [attr.aria-describedby]="'digest-hint'"
                  [disabled]="saving().has(pref.org_id)"
                  (click)="toggle(pref)"
                  class="relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
                  [class.bg-accent]="pref.email_digest"
                  [class.bg-border-strong]="!pref.email_digest"
                >
                  <span
                    class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                    [class.translate-x-5]="pref.email_digest"
                    [class.translate-x-0.5]="!pref.email_digest"
                  ></span>
                </button>
              </li>
            }
          </ul>
          <p id="digest-hint" class="border-t border-border px-4 py-3 text-meta text-fg-muted">
            {{ 'notifications.preferences.emailDigestHint' | transloco }}
          </p>
        }
      </app-card>

      <app-quiet-hours class="mt-6 block" />

      <app-why-it-matters class="mt-6 block" scope="settings" page="notification-preferences" />
    </div>
  `,
})
export class NotificationPreferences implements OnInit {
  private readonly api = inject(UserNotificationsApi);
  private readonly toasts = inject(NotificationService);
  private readonly selectedOrg = inject(SelectedOrgService);
  /** The daily digest is off for the current org, so "digest" categories send no email. */
  protected readonly digestOff = computed(
    () =>
      this.items().find((p) => p.org_id === this.selectedOrg.currentOrgId())?.email_digest ===
      false,
  );

  protected readonly items = signal<readonly NotificationPreference[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  /** Org ids with a save in flight. */
  protected readonly saving = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    this.api.getPreferences().subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  protected toggle(pref: NotificationPreference): void {
    if (this.saving().has(pref.org_id)) {
      return;
    }
    const email_digest = !pref.email_digest;
    this.setDigest(pref.org_id, email_digest);
    this.setSaving(pref.org_id, true);
    this.api.updatePreference({ org_id: pref.org_id, email_digest }).subscribe({
      next: (res) => {
        this.setSaving(pref.org_id, false);
        const saved = res.items.find((p) => p.org_id === pref.org_id);
        if (saved) {
          this.setDigest(pref.org_id, saved.email_digest);
        }
        this.toasts.success('notifications.preferences.saved');
      },
      error: () => {
        this.setSaving(pref.org_id, false);
        this.setDigest(pref.org_id, pref.email_digest);
        this.toasts.error('notifications.preferences.saveFailed');
      },
    });
  }

  private setDigest(orgId: string, emailDigest: boolean): void {
    this.items.update((list) =>
      list.map((p) => (p.org_id === orgId ? { ...p, email_digest: emailDigest } : p)),
    );
  }

  private setSaving(orgId: string, on: boolean): void {
    this.saving.update((set) => {
      const next = new Set(set);
      if (on) {
        next.add(orgId);
      } else {
        next.delete(orgId);
      }
      return next;
    });
  }
}
