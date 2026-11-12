import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { WatchButton } from '../../../shared/activity/watch-button';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { AuditAccess } from '../data/audit-access';
import { certificationStatusTone, planStatusTone } from '../data/audit-display';
import { CertificationDetail } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { expiresSoon } from './certification-list';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const CERTIFICATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  framework: 'audits.fields.framework',
  certification_body: 'audits.fields.certificationBody',
  certificate_number: 'audits.fields.certificateNumber',
  status: 'audits.fields.status',
  scope: 'audits.fields.scope',
  issued_at: 'audits.fields.issuedAt',
  expires_at: 'audits.fields.expiresAt',
  next_surveillance_at: 'audits.certification.nextSurveillance',
  owner_user_id: 'audits.fields.owner',
};

/**
 * `/audits/certifications/:id`: a certificate's cycle (issue, surveillance, expiry)
 * and the external audits held for it, plus related records, activity and history.
 */
@Component({
  selector: 'app-audit-certification-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    RecordDetailLayout,
    WatchButton,
    GuideIntro,
    WhyItMatters,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as c) {
      <app-record-detail-layout
        entityType="audit_certification"
        [entityId]="c.id"
        [tabs]="tabs"
        [canEdit]="access.canManage()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/certifications"
        backLabelKey="audits.certifications.back"
      >
        <div header>
          @if (c.certificate_number) {
            <p class="text-[12.5px] font-semibold text-fg-subtle">{{ c.certificate_number }}</p>
          }
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'audits.frameworks.' + c.framework | transloco }} · {{ c.certification_body }}
          </h1>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            <app-badge [tone]="tone(c.status)">{{
              'audits.certificationStatus.' + c.status | transloco
            }}</app-badge>
            @if (c.days_to_expiry !== null) {
              <app-badge [tone]="soon(c) ? 'fail' : 'neutral'">
                {{ 'audits.certification.expiresIn' | transloco: { days: c.days_to_expiry } }}
              </app-badge>
            }
          </div>
        </div>
        <div actions class="flex flex-wrap items-center gap-2">
          <app-watch-button entityType="audit_certification" [entityId]="c.id" />
          @if (access.canWrite()) {
            <a
              [routerLink]="['/audits/plans/new']"
              [queryParams]="{ certification: c.id, kind: 'external' }"
              class="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'audits.certification.planAudit' | transloco }}
            </a>
          }
          @if (access.canManage()) {
            <a
              [routerLink]="['/audits/certifications', c.id, 'edit']"
              class="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
            >
              {{ 'audits.common.edit' | transloco }}
            </a>
            <app-button size="sm" variant="ghost" (click)="deleting.set(true)">{{
              'audits.common.delete' | transloco
            }}</app-button>
          }
        </div>

        <div class="flex flex-col gap-4">
          <app-guide-intro scope="audits" page="certificationDetail" />
          <app-card>
            <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.issuedAt' | transloco }}
                </dt>
                <dd class="text-fg">{{ (c.issued_at | localDay) || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.certification.nextSurveillance' | transloco }}
                </dt>
                <dd class="text-fg">{{ (c.next_surveillance_at | localDay) || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.expiresAt' | transloco }}
                </dt>
                <dd [class.text-fail]="soon(c)" class="text-fg">
                  {{ (c.expires_at | localDay) || '–' }}
                </dd>
              </div>
              <div class="sm:col-span-3">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.scope' | transloco }}
                </dt>
                <dd class="whitespace-pre-line text-fg">{{ c.scope || '–' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'audits.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">{{ c.owner?.name || '–' }}</dd>
              </div>
              @if (c.notes) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'audits.fields.notes' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ c.notes }}</dd>
                </div>
              }
            </dl>
          </app-card>
          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'audits.certification.audits' | transloco: { count: c.audits.length } }}
            </h2>
            @if (c.audits.length) {
              <ul class="divide-y divide-border">
                @for (a of c.audits; track a.id) {
                  <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                    <a
                      [routerLink]="['/audits/plans', a.id]"
                      class="min-w-0 flex-1 text-[13.5px] font-semibold text-fg hover:text-accent"
                    >
                      <span class="text-fg-subtle">{{ a.code }}</span> {{ a.title }}
                    </a>
                    <span class="text-[12.5px] text-fg-muted">{{
                      a.planned_start | localDay
                    }}</span>
                    <app-badge [tone]="planTone(a.status)">{{
                      'audits.planStatus.' + a.status | transloco
                    }}</app-badge>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-muted">
                {{ 'audits.certification.noAudits' | transloco }}
              </p>
            }
          </app-card>
        </div>
        <div aside>
          <app-why-it-matters scope="audits" page="certificationDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
      </div>
    }
    <app-confirm-dialog
      [open]="deleting()"
      [title]="'audits.certification.deleteTitle' | transloco"
      [message]="'audits.certification.deleteMessage' | transloco"
      [confirmLabel]="'audits.common.delete' | transloco"
      [cancelLabel]="'audits.common.cancel' | transloco"
      [busy]="saving.busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(false)"
    />
  `,
})
export class CertificationDetailPage {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CERTIFICATION_FIELD_LABELS;
  protected readonly tone = certificationStatusTone;
  protected readonly planTone = planStatusTone;
  protected readonly soon = expiresSoon;
  protected readonly data = loadable<CertificationDetail>();
  protected readonly saving = mutator();
  protected readonly deleting = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_certification',
      entityId: this.id(),
      view: 'detail',
      title: this.data.value()?.certification_body ?? null,
    }));
    effect(() => {
      this.access.orgId();
      this.id();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(this.api.getCertification(orgId, this.id()));
    }
  }

  protected remove(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    this.saving.run(this.api.deleteCertification(orgId, this.id()), {
      success: 'audits.notices.certificationDeleted',
      next: () => void this.router.navigate(['/audits/certifications']),
      error: () => {
        this.deleting.set(false);
      },
    });
  }
}
