import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { AuditAccess } from '../data/audit-access';
import { certificationStatusTone } from '../data/audit-display';
import {
  CERTIFICATION_STATUSES,
  Certification,
  FRAMEWORKS,
  ListResponse,
} from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** Days before expiry at which a certificate is flagged as expiring soon. */
export const EXPIRY_WARNING_DAYS = 90;

/** Whether a certificate expires within the warning window (or has expired). */
export function expiresSoon(c: Pick<Certification, 'days_to_expiry'>): boolean {
  return c.days_to_expiry !== null && c.days_to_expiry <= EXPIRY_WARNING_DAYS;
}

/**
 * `/audits/certifications`: certificates per framework with the certification body,
 * cycle dates (issued, next surveillance, expiry) and status. The search box filters the
 * loaded list by body, certificate number and scope.
 */
@Component({
  selector: 'app-audit-certification-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.certifications.title"
      scope="audits"
      page="certifications"
      searchPlaceholderKey="audits.certifications.search"
      [query]="q()"
      [filters]="{ status: status(), framework: framework() }"
      [empty]="isEmpty()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <app-audits-nav />
        <div class="mt-4 flex flex-col gap-3">
          <app-guide-intro scope="audits" page="certifications" />
          <app-why-it-matters scope="audits" page="certifications" />
        </div>
      </div>
      @if (access.canManage()) {
        <app-button toolbar size="sm" (click)="create()">{{
          'audits.certifications.new' | transloco
        }}</app-button>
      }
      <div filters class="flex flex-wrap gap-2">
        <label class="sr-only" for="cert-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="cert-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
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
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="framework.set($any($event.target).value)"
        >
          <option value="" [selected]="!framework()">
            {{ 'audits.filters.anyFramework' | transloco }}
          </option>
          @for (k of frameworks; track k) {
            <option [value]="k" [selected]="framework() === k">
              {{ 'audits.frameworks.' + k | transloco }}
            </option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
        @if (data.state() === 'ready') {
          <ul class="divide-y divide-border">
            @for (c of rows(); track c.id) {
              <li
                class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <a [routerLink]="['/audits/certifications', c.id]" class="min-w-0 flex-1">
                  <span class="block text-[14px] font-semibold text-fg hover:text-accent">
                    {{ 'audits.frameworks.' + c.framework | transloco }} ·
                    {{ c.certification_body }}
                  </span>
                  @if (c.certificate_number) {
                    <span class="text-[12px] text-fg-subtle">{{ c.certificate_number }}</span>
                  }
                </a>
                <span class="text-[12.5px] text-fg-muted">
                  {{ 'audits.certification.nextSurveillance' | transloco }}:
                  {{ (c.next_surveillance_at | localDay) || '–' }}
                </span>
                <span
                  class="text-[12.5px]"
                  [class.text-fail]="soon(c)"
                  [class.text-fg-muted]="!soon(c)"
                >
                  {{ 'audits.fields.expiresAt' | transloco }}:
                  {{ (c.expires_at | localDay) || '–' }}
                </span>
                <app-badge [tone]="tone(c.status)">{{
                  'audits.certificationStatus.' + c.status | transloco
                }}</app-badge>
              </li>
            } @empty {
              <li class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'audits.common.noMatches' | transloco }}
              </li>
            }
          </ul>
        }
      </app-card>

      <app-teaching-empty
        empty
        scope="audits"
        page="certifications"
        [showAction]="access.canManage()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class CertificationList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Certification>>();
  protected readonly statuses = CERTIFICATION_STATUSES;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly tone = certificationStatusTone;
  protected readonly soon = expiresSoon;

  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly framework = signal('');
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const items = this.data.value()?.items ?? [];
    return q
      ? items.filter((c) =>
          [c.certification_body, c.certificate_number, c.scope].some((v) =>
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

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
    this.framework.set(view.filters['framework'] ?? '');
  }

  protected create(): void {
    void this.router.navigate(['/audits/certifications/new']);
  }
}
