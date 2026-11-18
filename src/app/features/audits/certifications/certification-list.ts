import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { certificationStatusBadge } from '../data/audit-display';
import { AuditFrameworks } from '../data/audit-frameworks';
import { CERTIFICATION_STATUSES, Certification, ListResponse } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** Days before expiry at which a certificate is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 90;
/** Days before a surveillance audit at which it is flagged as coming up. */
export const SURVEILLANCE_WARNING_DAYS = 30;

/** Whether a certificate expires within the warning window (or has expired). */
export function expiresSoon(c: Pick<Certification, 'days_to_expiry'>): boolean {
  return c.days_to_expiry !== null && c.days_to_expiry <= EXPIRY_WARNING_DAYS;
}

/** Whether the next surveillance audit is within 30 days (or overdue). */
export function surveillanceSoon(c: Pick<Certification, 'days_to_surveillance'>): boolean {
  const days = c.days_to_surveillance;
  return days !== null && days !== undefined && days <= SURVEILLANCE_WARNING_DAYS;
}

/** "ISO 9001 (DNV)": the backend title, else framework and body. */
export function certificationTitle(
  c: Pick<Certification, 'title' | 'framework' | 'certification_body'>,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return (
    c.title ||
    t('audits.certification.titleFallback', {
      framework: t(`audits.frameworks.${c.framework}`),
      body: c.certification_body,
    })
  );
}

/**
 * `/audits/certifications`: certificates per standard with the certification
 * body, cycle dates (next surveillance, expiry) and status. The search box filters
 * the loaded list by title, body, certificate number and scope.
 */
@Component({
  selector: 'app-audit-certification-list',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    HelpStrip,
    Icon,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.certifications.title"
      descriptionKey="audits.certifications.subtitle"
      scope="audits"
      page="certifications"
      [breadcrumbs]="[
        { labelKey: 'modules.names.audits', link: '/audits' },
        { labelKey: 'audits.certifications.title' },
      ]"
      searchPlaceholderKey="audits.certifications.search"
      [query]="q()"
      [filters]="{ status: status(), framework: framework() }"
      [empty]="isEmpty()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      @if (access.canManage()) {
        <app-button primary (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'audits.certifications.new' | transloco }}
        </app-button>
      }
      <app-audits-nav nav />
      <app-help-strip help scope="audits" page="certifications" />

      <ng-container filters>
        <label class="sr-only" for="cert-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="cert-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="status.set($any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'audits.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.certificationStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="cert-framework">{{
          'audits.fields.framework' | transloco
        }}</label>
        <select
          id="cert-framework"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="framework.set($any($event.target).value)"
        >
          <option value="" [selected]="!framework()">
            {{ 'audits.filters.anyFramework' | transloco }}
          </option>
          @for (k of frameworkOptions(); track k) {
            <option [value]="k" [selected]="framework() === k">
              {{ 'audits.frameworks.' + k | transloco }}
            </option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" [rows]="3" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div role="list" [attr.aria-label]="'audits.certifications.title' | transloco">
              <app-record-row-header
                dateKind="date"
                codeKey="audits.fields.certificateNumber"
                titleKey="audits.fields.certification"
              />
              @for (c of rows(); track c.id) {
                @let sb = badge(c.status);
                <app-record-row
                  [code]="c.certificate_number"
                  [title]="title(c)"
                  [subtitle]="subtitle(c)"
                  [link]="['/audits/certifications', c.id]"
                  [owner]="c.owner?.name"
                  [date]="c.expires_at"
                  dateKind="date"
                  [overdue]="soon(c)"
                >
                  <app-coverage-chip coverage entityType="audit_certification" [entityId]="c.id" />
                  <app-status-badge
                    badges
                    [meaning]="sb.meaning"
                    [value]="sb.value"
                    [labelKey]="sb.labelKey"
                  />
                  @if (surveillance(c)) {
                    <app-status-badge
                      badges
                      meaning="lifecycle"
                      value="due"
                      labelKey="audits.certification.surveillanceIn"
                      [labelParams]="{ days: c.days_to_surveillance }"
                    />
                  }
                </app-record-row>
              }
            </div>
          } @else {
            <app-empty-state
              icon="search"
              titleKey="ui.empty.noResults"
              ctaKey="audits.filters.clear"
              ctaVariant="secondary"
              [compact]="true"
              (cta)="clearFilters()"
            />
          }
        }
      </app-card>

      <app-card empty>
        <app-teaching-empty
          scope="audits"
          page="certifications"
          [showAction]="access.canManage()"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="audits" page="certifications" />
    </app-record-list-page>
  `,
})
export class CertificationList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly frameworks = inject(AuditFrameworks);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Certification>>();
  protected readonly statuses = CERTIFICATION_STATUSES;
  protected readonly badge = certificationStatusBadge;
  protected readonly soon = expiresSoon;
  protected readonly surveillance = surveillanceSoon;

  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly framework = signal('');
  protected readonly frameworkOptions = computed(() =>
    this.frameworks.certifiable(this.framework() || null),
  );
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const items = this.data.value()?.items ?? [];
    return q
      ? items.filter((c) =>
          [c.title, c.certification_body, c.certificate_number, c.scope].some((v) =>
            v?.toLowerCase().includes(q),
          ),
        )
      : items;
  });
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.status() &&
      !this.framework() &&
      !this.q(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_certification',
      view: 'list',
      title: this.language.translate('audits.certifications.title'),
    }));
    effect(() => {
      this.access.orgId();
      this.status();
      this.framework();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (orgId) {
      this.data.load(
        this.api.listCertifications(orgId, {
          status: this.status() || undefined,
          framework: this.framework() || undefined,
          limit: 200,
        }),
        true,
      );
    }
  }

  protected title(c: Certification): string {
    return certificationTitle(c, (k, p) => this.language.translate(k, p));
  }

  protected subtitle(c: Certification): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    return c.days_to_expiry !== null
      ? t('audits.certification.expiresIn', { days: c.days_to_expiry })
      : t('audits.certification.noExpiry');
  }

  protected clearFilters(): void {
    this.q.set('');
    this.status.set('');
    this.framework.set('');
  }

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
    this.framework.set(view.filters['framework'] ?? '');
  }

  protected create(): void {
    void this.router.navigate(['/audits/certifications/new']);
  }
}
