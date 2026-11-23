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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackKindKey } from '../data/feedback-display';
import { feedbackErrorKey } from '../data/feedback-errors';
import {
  FEEDBACK_ENTITY,
  FEEDBACK_KINDS,
  FeedbackKind,
  FeedbackSettings,
  PERM_MANAGE,
} from '../data/feedback.models';
import { ModuleConfigNav } from '../../../shared/ui/module-config-nav/module-config-nav';

/** Days per kind as form text ('' = no default deadline). */
export type DaysForm = Readonly<Record<FeedbackKind, string>>;

/** Field -> i18n error key. */
export function validateSettings(days: DaysForm, url: string): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const kind of FEEDBACK_KINDS) {
    const raw = days[kind].trim();
    if (raw && !/^\d+$/.test(raw)) {
      errors[kind] = 'feedback.settings.errors.days';
    } else if (raw && (Number(raw) < 1 || Number(raw) > 365)) {
      errors[kind] = 'feedback.settings.errors.days';
    }
  }
  if (url.trim() && !/^https?:\/\/\S+\.\S+/i.test(url.trim())) {
    errors['privacy_notice_url'] = 'feedback.settings.errors.url';
  }
  return errors;
}

export function toSettings(days: DaysForm, workingDays: boolean, url: string): FeedbackSettings {
  const response_days = Object.fromEntries(
    FEEDBACK_KINDS.map((k) => [k, days[k].trim() ? Number(days[k].trim()) : null]),
  ) as Record<FeedbackKind, number | null>;
  return { response_days, working_days: workingDays, privacy_notice_url: url.trim() || null };
}

/**
 * Customer feedback settings (`/settings/modules/feedback`): the default reply time per kind
 * (pre-fills the reply date of new feedback, so reminders and "overdue" work) and
 * the privacy notice linked from public surveys that ask for a name or e-mail.
 * Everyone can read them; `feedback:manage` can change them.
 */
@Component({
  selector: 'app-feedback-settings',
  imports: [
    ModuleConfigNav,
    TranslocoPipe,
    FieldHelp,
    Alert,
    Button,
    ErrorState,
    FormActions,
    FormField,
    FormSection,
    HelpStrip,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="feedback.settings.title"
        descriptionKey="feedback.settings.subtitle"
        [breadcrumbs]="[
          { labelKey: 'nav.settings', link: '/settings' },
          { labelKey: 'modules.names.feedback' },
          { labelKey: 'feedback.settings.crumb' },
        ]"
        backLink="/feedback"
        backLabelKey="feedback.common.backToList"
      />
      <app-module-config-nav module="feedback" />
      <app-help-strip scope="feedback" page="settings" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="5" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (!canManage()) {
            <app-alert tone="info" class="mb-4 block">{{
              'feedback.settings.readOnly' | transloco
            }}</app-alert>
          }
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <app-form-section
              [title]="'feedback.settings.responseTitle' | transloco"
              [description]="'feedback.settings.responseIntro' | transloco"
            >
              <app-field-help
                title-suffix
                scope="feedback"
                page="settings"
                field="response_days"
                [label]="'feedback.settings.responseTitle' | transloco"
              />
              @for (k of kinds; track k) {
                <app-form-field
                  [label]="kindKey(k) | transloco"
                  [inputId]="'cf-fbs-' + k"
                  [error]="errors()[k] ?? '' | transloco"
                >
                  <input
                    [id]="'cf-fbs-' + k"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="365"
                    [disabled]="!canManage()"
                    [value]="days()[k]"
                    (input)="setDays(k, $any($event.target).value)"
                    [placeholder]="'feedback.settings.noDefault' | transloco"
                    [attr.data-testid]="'days-' + k"
                  />
                </app-form-field>
              }
              <div class="sm:col-span-2">
                <label
                  class="flex h-10 cursor-pointer items-center gap-2.5 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [disabled]="!canManage()"
                    [checked]="workingDays()"
                    (change)="workingDays.set($any($event.target).checked)"
                    data-testid="working-days"
                  />
                  {{ 'feedback.settings.workingDays' | transloco }}
                </label>
                <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
                  {{ 'feedback.settings.emptyMeansNone' | transloco }}
                </p>
              </div>
            </app-form-section>

            <app-form-section
              [title]="'feedback.settings.privacyTitle' | transloco"
              [description]="'feedback.settings.privacyIntro' | transloco"
            >
              <app-field-help
                title-suffix
                scope="feedback"
                page="settings"
                field="privacy_notice_url"
                [label]="'feedback.settings.privacyTitle' | transloco"
              />
              <app-form-field
                span="full"
                [label]="'feedback.settings.privacyUrl' | transloco"
                inputId="cf-fbs-privacy"
                [error]="errors()['privacy_notice_url'] ?? '' | transloco"
              >
                <input
                  id="cf-fbs-privacy"
                  type="url"
                  maxlength="500"
                  inputmode="url"
                  [disabled]="!canManage()"
                  [value]="url()"
                  (input)="url.set($any($event.target).value)"
                  placeholder="https://"
                  data-testid="privacy-url"
                />
              </app-form-field>
            </app-form-section>

            @if (canManage()) {
              <app-form-actions>
                <app-button
                  type="submit"
                  [loading]="saving()"
                  [disabled]="saving() || hasErrors()"
                  data-testid="settings-save"
                >
                  {{ 'feedback.settings.save' | transloco }}
                </app-button>
              </app-form-actions>
            }
          </form>
        }
      }
    </div>
  `,
})
export class FeedbackSettingsPage {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly kindKey = feedbackKindKey;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly saving = signal(false);
  protected readonly days = signal<DaysForm>({
    complaint: '',
    compliment: '',
    suggestion: '',
    inquiry: '',
    other: '',
  });
  protected readonly workingDays = signal(true);
  protected readonly url = signal('');

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_MANAGE),
  );
  protected readonly errors = computed(() => validateSettings(this.days(), this.url()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'settings',
      title: this.language.translate('feedback.settings.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected setDays(kind: FeedbackKind, value: string): void {
    this.days.update((d) => ({ ...d, [kind]: value }));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.hasErrors() || !this.canManage()) {
      return;
    }
    this.saving.set(true);
    this.api
      .saveSettings(orgId, toSettings(this.days(), this.workingDays(), this.url()))
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.apply(s);
          this.notifications.success('feedback.notices.settingsSaved');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.error(feedbackErrorKey(error));
        },
      });
  }

  private apply(s: FeedbackSettings): void {
    const days = Object.fromEntries(
      FEEDBACK_KINDS.map((k) => [k, s.response_days[k] ? String(s.response_days[k]) : '']),
    ) as Record<FeedbackKind, string>;
    this.days.set(days);
    this.workingDays.set(s.working_days);
    this.url.set(s.privacy_notice_url ?? '');
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
