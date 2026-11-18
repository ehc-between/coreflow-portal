import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { certificationStatusBadge, leadAuditorName, planStatusBadge } from '../data/audit-display';
import { CertificationDetail } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';
import { mutator } from '../shared/mutator';
import { certificationTitle, expiresSoon, surveillanceSoon } from './certification-list';

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
  supplier_id: 'audits.fields.certificationBody',
  certificate_number: 'audits.fields.certificateNumber',
  status: 'audits.fields.status',
  scope: 'audits.fields.scope',
  issued_at: 'audits.fields.issuedAt',
  expires_at: 'audits.fields.expiresAt',
  next_surveillance_at: 'audits.certification.nextSurveillance',
  owner_user_id: 'audits.fields.owner',
};

/**
 * `/audits/certifications/:id`: a certificate and its cycle (issued, surveillance,
 * expiry), the certification body as a supplier, the requirements it documents
 * and the external audits held for it.
 */
@Component({
  selector: 'app-audit-certification-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    RecordDetailLayout,
    WatchButton,
    AskAbout,
    WhyItMatters,
    EntityChip,
    Badge,
    Card,
    ConfirmDialog,
    FieldItem,
    FieldList,
    HelpStrip,
    Icon,
    MenuItem,
    StatusBadge,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.value(); as c) {
      @let sb = badge(c.status);
      <app-record-detail-layout
        entityType="audit_certification"
        [entityId]="c.id"
        [title]="title()"
        [breadcrumbs]="[
          { labelKey: 'modules.names.audits', link: '/audits' },
          { labelKey: 'audits.certifications.title', link: '/audits/certifications' },
          { label: title() },
        ]"
        [tabs]="tabs"
        [requirementsPanel]="true"
        [canEdit]="access.canManage()"
        [includeAudit]="access.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/audits/certifications"
        backLabelKey="audits.certifications.back"
      >
        <ng-container ngProjectAs="[meta]">
          @if (c.certificate_number) {
            <span class="font-mono">{{ c.certificate_number }}</span>
          }
          <app-status-badge [meaning]="sb.meaning" [value]="sb.value" [labelKey]="sb.labelKey" />
          @if (c.days_to_expiry !== null) {
            <app-badge [tone]="soon(c) ? 'warn' : 'neutral'">
              {{ 'audits.certification.expiresIn' | transloco: { days: c.days_to_expiry } }}
            </app-badge>
          }
          @if (surveillance(c)) {
            <app-badge tone="warn">
              {{
                'audits.certification.surveillanceIn' | transloco: { days: c.days_to_surveillance }
              }}
            </app-badge>
          }
          <app-ask-about
            [prompt]="'audits.certification.askAbout' | transloco: { title: title() }"
          />
          <app-watch-button entityType="audit_certification" [entityId]="c.id" />
        </ng-container>

        @if (access.canWrite()) {
          <a
            primary
            [routerLink]="['/audits/plans/new']"
            [queryParams]="{ certification: c.id, kind: 'external', frameworks: c.framework }"
            class="inline-flex h-8 items-center gap-1.5 rounded-tile bg-accent px-3 text-ui font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'audits.certification.planAudit' | transloco }}
          </a>
        }
        @if (access.canManage()) {
          <a
            secondary
            [routerLink]="['/audits/certifications', c.id, 'edit']"
            class="inline-flex h-8 items-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold text-fg hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {{ 'audits.common.edit' | transloco }}
          </a>
        }
        @if (access.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="deleting.set(true)">
            {{ 'audits.common.delete' | transloco }}
          </button>
        }

        <app-audits-nav nav />
        <app-help-strip help scope="audits" page="certificationDetail" />

        <div class="flex flex-col gap-5">
          <app-card>
            <h2 class="mb-4 font-display text-section font-bold text-fg">
              {{ 'audits.certification.about' | transloco }}
            </h2>
            <app-field-list [columns]="3">
              <app-field-item
                labelKey="audits.fields.framework"
                [value]="'audits.frameworks.' + c.framework | transloco"
              />
              <app-field-item labelKey="audits.fields.certificationBody">
                @if (c.supplier; as s) {
                  <app-entity-chip [ref]="s" [showType]="false" />
                } @else {
                  {{ c.certification_body }}
                }
              </app-field-item>
              <app-field-item
                labelKey="audits.fields.certificateNumber"
                [value]="c.certificate_number"
              />
              <app-field-item labelKey="audits.fields.issuedAt" [value]="c.issued_at | localDay" />
              <app-field-item
                labelKey="audits.certification.nextSurveillance"
                [value]="c.next_surveillance_at | localDay"
              />
              <app-field-item labelKey="audits.fields.expiresAt">
                @if (c.expires_at) {
                  <span [class]="soon(c) ? 'font-semibold text-warn-ink' : ''">
                    {{ c.expires_at | localDay }}
                  </span>
                }
              </app-field-item>
              <app-field-item
                labelKey="audits.fields.scope"
                [value]="c.scope"
                [wide]="true"
                [multiline]="true"
              />
              <app-field-item labelKey="audits.fields.owner" [value]="c.owner?.name" />
              @if (c.notes) {
                <app-field-item
                  labelKey="audits.fields.notes"
                  [value]="c.notes"
                  [wide]="true"
                  [multiline]="true"
                />
              }
            </app-field-list>
          </app-card>
          <app-card>
            <h2 class="mb-3 font-display text-section font-bold text-fg">
              {{ 'audits.certification.audits' | transloco: { count: c.audits.length } }}
            </h2>
            @if (c.audits.length) {
              <ul class="divide-y divide-border">
                @for (a of c.audits; track a.id) {
                  @let ab = planBadge(a.status);
                  <li class="flex flex-wrap items-center gap-2 py-2">
                    <a
                      [routerLink]="['/audits/plans', a.id]"
                      class="min-w-0 flex-1 basis-[220px] text-body font-semibold text-fg hover:text-accent"
                    >
                      <span class="font-mono text-meta font-normal text-fg-subtle">{{
                        a.code
                      }}</span>
                      {{ a.title }}
                    </a>
                    <span class="text-meta text-fg-muted">{{ a.planned_start | localDay }}</span>
                    <span class="text-meta text-fg-muted">{{ lead(a) }}</span>
                    <app-status-badge
                      [meaning]="ab.meaning"
                      [value]="ab.value"
                      [labelKey]="ab.labelKey"
                    />
                  </li>
                }
              </ul>
            } @else {
              <p class="text-body text-fg-muted">
                {{ 'audits.certification.noAudits' | transloco }}
              </p>
            }
          </app-card>
        </div>
        <div aside-learn>
          <app-why-it-matters scope="audits" page="certificationDetail" />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
        <app-audit-load-state [state]="data.state()" [rows]="5" (retry)="load()" />
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
  private readonly language = inject(LanguageService);
  protected readonly access = inject(AuditAccess);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = CERTIFICATION_FIELD_LABELS;
  protected readonly badge = certificationStatusBadge;
  protected readonly planBadge = planStatusBadge;
  protected readonly lead = leadAuditorName;
  protected readonly soon = expiresSoon;
  protected readonly surveillance = surveillanceSoon;
  protected readonly data = loadable<CertificationDetail>();
  protected readonly saving = mutator();
  protected readonly deleting = signal(false);
  protected readonly title = computed(() => {
    const c = this.data.value();
    return c ? certificationTitle(c, (k, p) => this.language.translate(k, p)) : '';
  });

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_certification',
      entityId: this.id(),
      view: 'detail',
      title: this.title() || null,
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
