import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { RecruitmentApi } from '../data/recruitment-api';
import { blankToNull, riskTone } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import { MODULE_KEY, ROLE_RISKS, RecruitmentSettings } from '../data/recruitment.models';
import { RecruitmentLessonButton } from '../shared/recruitment-lesson-button';
import { RecruitmentNav } from '../shared/recruitment-nav';

const MIN_DAYS = 30;
const MAX_DAYS = 3650;

/** GDPR settings of the module: privacy notice, retention periods and the erasure run. */
@Component({
  selector: 'app-recruitment-settings',
  imports: [
    TranslocoPipe,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    LocalDatePipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    RecruitmentLessonButton,
    RecruitmentNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
        <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
          {{ 'recruitment.settings.title' | transloco }}
        </h1>
        <app-recruitment-lesson-button lesson="candidate-privacy" />
      </div>
      <app-recruitment-nav />
      <app-guide-intro class="mb-4" scope="recruitment" page="settings" />

      @if (loadError(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else if (!settings()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'recruitment.settings.retentionSection' | transloco }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'recruitment.fields.retentionDays' | transloco"
                  inputId="set-retention"
                >
                  <input
                    id="set-retention"
                    type="number"
                    [min]="minDays"
                    [max]="maxDays"
                    [value]="retentionDays()"
                    (input)="retentionDays.set(+$any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="recruitment" page="settings" field="retention_days" />
              </div>
              <div>
                <app-form-field
                  [label]="'recruitment.fields.talentPoolDays' | transloco"
                  inputId="set-pool"
                >
                  <input
                    id="set-pool"
                    type="number"
                    [min]="minDays"
                    [max]="maxDays"
                    [value]="poolDays()"
                    (input)="poolDays.set(+$any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="recruitment" page="settings" field="talent_pool_days" />
              </div>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'recruitment.settings.noticeSection' | transloco }}
            </h2>
            <div class="flex flex-col gap-4">
              <app-form-field
                [label]="'recruitment.fields.noticeVersion' | transloco"
                inputId="set-version"
              >
                <input
                  id="set-version"
                  maxlength="32"
                  [value]="noticeVersion()"
                  (input)="noticeVersion.set($any($event.target).value)"
                />
              </app-form-field>
              <div>
                <app-form-field
                  [label]="'recruitment.fields.noticeText' | transloco"
                  inputId="set-notice"
                >
                  <textarea
                    id="set-notice"
                    rows="10"
                    maxlength="20000"
                    [value]="noticeText()"
                    (input)="noticeText.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help scope="recruitment" page="settings" field="privacy_notice" />
              </div>
            </div>
          </app-card>

          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-[12.5px] text-fg-subtle">
              @if (settings()!.updated_at) {
                {{
                  'recruitment.settings.updatedAt'
                    | transloco: { date: (settings()!.updated_at | localDate: 'medium') }
                }}
              }
            </span>
            <app-button type="submit" [loading]="saving()" [disabled]="!valid()">
              {{ 'recruitment.common.save' | transloco }}
            </app-button>
          </div>
        </form>

        <app-card class="mt-5 block">
          <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
            {{ 'recruitment.settings.policySection' | transloco }}
          </h2>
          <p class="mb-3 text-[13px] text-fg-muted">
            {{ 'recruitment.settings.policyIntro' | transloco }}
          </p>
          <dl class="flex flex-col gap-2 text-[13px]">
            @for (risk of risks; track risk) {
              <div class="flex flex-wrap items-center gap-2">
                <dt class="w-[110px]">
                  <app-badge [tone]="riskTone(risk)">{{
                    'recruitment.roleRisk.' + risk | transloco
                  }}</app-badge>
                </dt>
                <dd class="flex-1 text-fg">
                  @for (c of settings()!.check_policy[risk] ?? []; track c; let last = $last) {
                    {{ 'recruitment.checkType.' + c | transloco }}{{ last ? '' : ', ' }}
                  }
                </dd>
              </div>
            }
          </dl>
        </app-card>

        <app-card class="mt-5 block">
          <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
            {{ 'recruitment.settings.purgeSection' | transloco }}
          </h2>
          <p class="mb-3 text-[13px] text-fg-muted">
            {{ 'recruitment.settings.purgeIntro' | transloco }}
          </p>
          <app-button variant="danger" (click)="purging.set(true)" data-testid="purge">
            {{ 'recruitment.settings.purge' | transloco }}
          </app-button>
        </app-card>
      }
      <app-why-it-matters class="mt-6 block" scope="recruitment" page="settings" />
    </div>

    <app-confirm-dialog
      [open]="purging()"
      [title]="'recruitment.settings.purgeTitle' | transloco"
      [message]="'recruitment.settings.purgeMessage' | transloco"
      [confirmLabel]="'recruitment.settings.purge' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="saving()"
      (confirmed)="purge()"
      (cancelled)="purging.set(false)"
    />
  `,
})
export class RecruitmentSettingsPage {
  private readonly api = inject(RecruitmentApi);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  protected readonly risks = ROLE_RISKS;
  protected readonly riskTone = riskTone;
  protected readonly minDays = MIN_DAYS;
  protected readonly maxDays = MAX_DAYS;

  protected readonly settings = signal<RecruitmentSettings | null>(null);
  protected readonly retentionDays = signal(180);
  protected readonly poolDays = signal(730);
  protected readonly noticeText = signal('');
  protected readonly noticeVersion = signal('');
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly purging = signal(false);

  constructor() {
    providePageContext(() => ({ module: MODULE_KEY, view: 'settings' }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      if (!orgId) {
        return;
      }
      const sub = this.api.getSettings(orgId).subscribe({
        next: (s) => this.apply(s),
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected valid(): boolean {
    const ok = (n: number) => Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS;
    return ok(this.retentionDays()) && ok(this.poolDays());
  }

  private apply(s: RecruitmentSettings): void {
    this.settings.set(s);
    this.retentionDays.set(s.retention_days);
    this.poolDays.set(s.talent_pool_days);
    this.noticeText.set(s.privacy_notice ?? '');
    this.noticeVersion.set(s.privacy_notice_version ?? '');
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || !this.valid() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.api
      .updateSettings(orgId, {
        retention_days: this.retentionDays(),
        talent_pool_days: this.poolDays(),
        privacy_notice: blankToNull(this.noticeText()),
        privacy_notice_version: blankToNull(this.noticeVersion()),
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.apply(s);
          this.toasts.success('recruitment.settings.saved');
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(recruitmentError(err).key);
        },
      });
  }

  protected purge(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.saving.set(true);
    this.api.purgeExpired(orgId).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.purging.set(false);
        this.toasts.success('recruitment.settings.purged', { count: res.erased });
      },
      error: (err) => {
        this.saving.set(false);
        this.purging.set(false);
        this.toasts.error(recruitmentError(err).key);
      },
    });
  }
}
