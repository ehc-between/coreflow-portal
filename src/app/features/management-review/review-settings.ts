import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { FieldLabel } from './components/field-label';
import { ManagementReviewApi } from './data/management-review-api';
import { mrErrorKey } from './data/management-review-errors';
import { MrSettings, MrSettingsUpdate } from './data/management-review.models';
import { MR_MODULE, MR_SCOPE } from './management-review-display';
import { ModuleConfigNav } from '../../shared/ui/module-config-nav/module-config-nav';
import { moduleConfigCrumbs } from '../../core/modules/module-config';

/** The interval options offered (months); any 1-36 value from the API is kept. */
export const INTERVAL_OPTIONS = [3, 6, 12, 18, 24, 36] as const;

/** Validate the form: whole months 1-36, reminder days 0-180 (else the i18n key of the error). */
export function settingsPatch(
  before: MrSettings,
  months: string,
  days: string,
): MrSettingsUpdate | string {
  const m = Number(months);
  const d = Number(days);
  if (!Number.isInteger(m) || m < 1 || m > 36) {
    return 'managementReview.settings.invalidInterval';
  }
  if (!Number.isInteger(d) || d < 0 || d > 180) {
    return 'managementReview.settings.invalidReminder';
  }
  const out: { review_interval_months?: number; reminder_days?: number } = {};
  if (m !== before.review_interval_months) out.review_interval_months = m;
  if (d !== before.reminder_days) out.reminder_days = d;
  return out;
}

/**
 * `/settings/modules/management-review` (the gear on every page of the module): how
 * often top management reviews the management system and how early CoreFlow
 * reminds you. The next review is due one interval after the last signed one;
 * from the reminder window it shows on the home page and in Mitt arbeid.
 */
@Component({
  selector: 'app-mr-review-settings',
  imports: [
    ModuleConfigNav,
    TranslocoPipe,
    Alert,
    Button,
    Card,
    ErrorState,
    FormField,
    HelpStrip,
    LoadingState,
    PageHeader,
    FieldLabel,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="managementReview.settings.title"
        descriptionKey="managementReview.settings.description"
        [breadcrumbs]="crumbs"
      />
      <app-module-config-nav module="management_review" />
      <app-help-strip [scope]="scope" page="settings" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (settings(); as s) {
            <form novalidate (submit)="$event.preventDefault(); save()">
              <app-card>
                <div class="flex flex-col gap-5">
                  @if (errorKey(); as key) {
                    <app-alert tone="error">{{ key | transloco }}</app-alert>
                  }
                  @if (!s.can_manage) {
                    <app-alert tone="info">{{
                      'managementReview.settings.readOnly' | transloco
                    }}</app-alert>
                  }
                  <div>
                    <app-mr-field-label
                      controlId="mr-interval"
                      [label]="'managementReview.settings.interval' | transloco"
                      page="settings"
                      field="interval"
                    />
                    <app-form-field inputId="mr-interval">
                      <select
                        id="mr-interval"
                        [disabled]="!s.can_manage"
                        (change)="months.set($any($event.target).value)"
                        data-testid="mr-interval"
                      >
                        @for (m of intervalOptions(); track m) {
                          <option [value]="m" [selected]="months() === '' + m">
                            {{ 'managementReview.settings.months' | transloco: { months: m } }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                  </div>
                  <div>
                    <app-mr-field-label
                      controlId="mr-reminder"
                      [label]="'managementReview.settings.reminder' | transloco"
                      page="settings"
                      field="reminder"
                    />
                    <app-form-field inputId="mr-reminder">
                      <input
                        id="mr-reminder"
                        type="number"
                        min="0"
                        max="180"
                        step="1"
                        [disabled]="!s.can_manage"
                        [value]="days()"
                        (input)="days.set($any($event.target).value)"
                        data-testid="mr-reminder"
                      />
                    </app-form-field>
                    <p class="mt-1 text-meta text-fg-subtle">
                      {{ 'managementReview.settings.reminderHint' | transloco: { days: days() } }}
                    </p>
                  </div>
                </div>
              </app-card>
              @if (s.can_manage) {
                <div class="mt-4 flex justify-end">
                  <app-button
                    type="submit"
                    [variant]="dirty() ? 'primary' : 'secondary'"
                    [loading]="saving()"
                    [disabled]="!dirty()"
                    data-testid="mr-settings-save"
                  >
                    {{ 'managementReview.settings.save' | transloco }}
                  </app-button>
                </div>
              }
            </form>
          }
        }
      }
    </div>
  `,
})
export class ReviewSettingsPage {
  private readonly api = inject(ManagementReviewApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  protected readonly scope = MR_SCOPE;
  protected readonly crumbs = [
    ...moduleConfigCrumbs('management_review'),
    { labelKey: 'managementReview.settings.title' },
  ];

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly settings = signal<MrSettings | null>(null);
  protected readonly months = signal('12');
  protected readonly days = signal('60');
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly intervalOptions = computed(() => {
    const current = Number(this.months());
    return INTERVAL_OPTIONS.includes(current as (typeof INTERVAL_OPTIONS)[number]) ||
      !Number.isInteger(current)
      ? [...INTERVAL_OPTIONS]
      : [...INTERVAL_OPTIONS, current].sort((a, b) => a - b);
  });
  protected readonly dirty = computed(() => {
    const s = this.settings();
    const patch = s ? settingsPatch(s, this.months(), this.days()) : {};
    return typeof patch === 'string' || Object.keys(patch).length > 0;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: MR_MODULE,
      view: 'settings',
      title: this.language.translate('managementReview.settings.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const s = this.settings();
    if (!orgId || !s || this.saving()) {
      return;
    }
    const patch = settingsPatch(s, this.months(), this.days());
    if (typeof patch === 'string') {
      this.errorKey.set(patch);
      return;
    }
    this.errorKey.set(null);
    this.saving.set(true);
    this.api.updateSettings(orgId, patch).subscribe({
      next: (fresh) => {
        this.saving.set(false);
        this.apply(fresh);
        this.notifications.success('managementReview.notices.settingsSaved');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(mrErrorKey(error));
      },
    });
  }

  private apply(s: MrSettings): void {
    this.settings.set(s);
    this.months.set(String(s.review_interval_months));
    this.days.set(String(s.reminder_days));
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.settings(orgId).subscribe({
      next: (s) => {
        this.apply(s);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
