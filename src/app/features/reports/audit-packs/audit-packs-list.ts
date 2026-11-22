import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toneFor } from '../../../shared/ui/tones';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { FrameworkSelect } from '../components/framework-select';
import { ReportsNav } from '../components/reports-nav';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  formatBytes,
  frameworkLabelKey,
  labelOr,
  localized,
  packReadiness,
} from '../data/report-display';
import {
  AuditPack,
  FrameworkKey,
  LinkedRecord,
  REPORTS_MODULE,
  isFrameworkKey,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { StandardOptions } from '../data/standard-options';
import { GeneratePackDialog, PackPrefill, prefillFromFlow } from './generate-pack-dialog';

const PAGE_SIZE = 25;

/** The standards of a pack (multi-standard packs list several), oldest packs have one. */
export function packStandardKeys(pack: AuditPack): string[] {
  return pack.standard_keys?.length ? [...pack.standard_keys] : [pack.standard_key];
}

/** The audit plan of a pack as an entity chip reference. */
export function auditPlanRef(plan: LinkedRecord) {
  return {
    entity_type: 'audit_plan',
    entity_id: plan.id,
    title: plan.title ?? '',
    code: plan.code,
    url: plan.url,
    module: 'audits',
  };
}

/**
 * `/reports/audit-packs` (`reports:audit_pack`): one-click audit packs — a zip with
 * the Statement of Applicability, the evidence index, requirement coverage, the
 * registers an auditor of those standards expects, approved policies and a
 * checksummed manifest — for one or more standards, optionally for an audit and a
 * period, and the packs made so far, newest first. Opened from an audit
 * ("Lag revisjonspakke", `?flow=`), the drawer starts prefilled with the audit and
 * its standards; `?audit_plan_id=` lists the packs of one audit.
 */
@Component({
  selector: 'app-audit-packs-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    TeachingEmpty,
    TourStepDirective,
    WhyItMatters,
    EntityChip,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    Pager,
    FrameworkSelect,
    ReportsNav,
    GeneratePackDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="reports.packs.title"
        descriptionKey="reports.packs.subtitle"
        [breadcrumbs]="[
          { labelKey: 'reports.hub.title', link: '/reports' },
          { labelKey: 'reports.nav.auditPacks' },
        ]"
      >
        <app-button primary [appTourStep]="'reports-generate-pack'" (click)="openGenerate()">
          <app-icon name="plus" [size]="15" />
          {{ 'reports.packs.generate' | transloco }}
        </app-button>
      </app-page-header>
      <app-reports-nav />
      <app-help-strip scope="reports" page="auditPacks" tour="auditPacks" lesson="audit-ready" />

      <div class="mb-4 flex flex-wrap items-center gap-2" role="search">
        <app-framework-select
          [options]="frameworkOptions()"
          [value]="framework()"
          (valueChange)="framework.set($event); offset.set(0)"
        />
        @if (auditPlanId()) {
          <span
            class="inline-flex min-h-10 items-center gap-2 rounded-tile border border-border bg-surface px-3 text-ui text-fg"
          >
            {{ 'reports.packs.forAudit' | transloco }}
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fg"
              [attr.aria-label]="'reports.packs.clearAudit' | transloco"
              (click)="clearAudit()"
            >
              <app-icon name="x" [size]="14" />
            </button>
          </span>
        }
      </div>

      @if (error(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="4" />
      } @else if (items().length === 0) {
        @if (framework() || auditPlanId()) {
          <app-empty-state
            titleKey="ui.empty.noResults"
            bodyKey="ui.empty.noResultsBody"
            ctaKey="ui.empty.clearFilters"
            ctaVariant="secondary"
            (cta)="clearFilters()"
          />
        } @else {
          <app-card>
            <app-teaching-empty scope="reports" page="auditPacks" (action)="openGenerate()" />
          </app-card>
        }
      } @else {
        <app-card [padded]="false">
          <ul class="divide-y divide-border" data-testid="audit-packs">
            @for (pack of items(); track pack.id) {
              <li
                class="relative flex flex-col gap-2 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <a
                    [routerLink]="['/reports/audit-packs', pack.id]"
                    class="block text-body font-semibold text-fg after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-tile focus-visible:after:ring-2 focus-visible:after:ring-accent"
                  >
                    {{ pack.title }}
                  </a>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
                    @for (key of standardKeys(pack); track key) {
                      <app-badge tone="info">{{ standardName(pack, key) }}</app-badge>
                    }
                    @if (readiness(pack); as score) {
                      <app-badge [tone]="tone(score)" data-testid="pack-coverage">
                        {{ 'reports.packs.readiness' | transloco: { score } }}
                      </app-badge>
                    } @else if (readiness(pack) === 0) {
                      <app-badge data-testid="pack-coverage">
                        {{ 'reports.packs.readiness' | transloco: { score: 0 } }}
                      </app-badge>
                    }
                    @if (pack.audit_plan; as plan) {
                      <span class="relative z-10"><app-entity-chip [ref]="planRef(plan)" /></span>
                    }
                  </div>
                  <p class="mt-1 text-meta text-fg-subtle">
                    @if (pack.period_start || pack.period_end) {
                      {{
                        'reports.packs.period'
                          | transloco
                            : {
                                from: pack.period_start ? (pack.period_start | localDay) : '…',
                                to: pack.period_end ? (pack.period_end | localDay) : '…',
                              }
                      }}
                      ·
                    }
                    {{ pack.generated_at | localDate }}
                    @if (pack.generated_by?.name; as by) {
                      · {{ by }}
                    }
                    · {{ size(pack.size_bytes) }}
                  </p>
                </div>
                <app-button
                  class="relative z-10 self-start sm:self-center"
                  variant="secondary"
                  size="sm"
                  [loading]="downloading() === pack.id"
                  [disabled]="!!downloading()"
                  (click)="download(pack)"
                  [attr.aria-label]="
                    'reports.packs.downloadLabel' | transloco: { title: pack.title }
                  "
                >
                  {{ 'reports.packs.download' | transloco }}
                </app-button>
              </li>
            }
          </ul>
        </app-card>
        <app-pager
          class="mt-3 block"
          [offset]="offset()"
          [pageSize]="pageSize"
          [count]="items().length"
          [total]="total()"
          (pageChange)="offset.set($event)"
        />
      }

      <app-why-it-matters class="mt-8 block" scope="reports" page="auditPacks" />
    </div>

    <app-generate-pack-dialog
      [open]="generateOpen()"
      [flow]="flow()"
      [prefill]="prefill()"
      (closed)="closeGenerate()"
      (generated)="onGenerated($event)"
    />
  `,
})
export class AuditPacksList {
  private readonly api = inject(ReportsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly flows = inject(CreateFlowService);
  private readonly standardOptions = inject(StandardOptions);

  /** `?audit_plan_id=` (component input binding): only the packs of one audit. */
  readonly audit_plan_id = input<string | undefined>(undefined);

  /** "Lag revisjonspakke" from an audit (`?flow=`). */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'audit_pack',
  });
  protected readonly prefill = computed<PackPrefill | null>(() => prefillFromFlow(this.flow()));

  protected readonly pageSize = PAGE_SIZE;
  protected readonly framework = signal<FrameworkKey | null>(null);
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly AuditPack[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly generateOpen = signal(false);
  private readonly auditCleared = signal(false);

  protected readonly auditPlanId = computed(() =>
    this.auditCleared() ? null : this.audit_plan_id() || null,
  );

  protected readonly frameworkOptions = computed<readonly FrameworkKey[]>(() => {
    const keys = this.standardOptions
      .items()
      .map((s) => s.framework || frameworkOf(s.standard_key))
      .filter(isFrameworkKey);
    return keys.length ? [...new Set(keys)] : (['iso9001', 'iso27001', 'gdpr'] as FrameworkKey[]);
  });

  private readonly orgId = computed(() => this.selectedOrg.currentOrgId());
  private sub = new Subscription();

  constructor() {
    this.standardOptions.ensure();
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'audit_pack',
      view: 'list',
      title: this.language.translate('reports.packs.title'),
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.orgId();
      const framework = this.framework();
      const plan = this.auditPlanId();
      const offset = this.offset();
      untracked(() => this.load(orgId, framework, plan, offset));
    });
    // Arriving from an audit: open the drawer with the audit and its standards.
    effect(() => {
      if (this.flow()) {
        untracked(() => this.generateOpen.set(true));
      }
    });
  }

  protected standardKeys(pack: AuditPack): string[] {
    return packStandardKeys(pack);
  }

  protected standardName(pack: AuditPack, key: string): string {
    const own = localized(pack.standard_names?.[key], this.language.active(), '');
    return (
      own || labelOr((k) => this.language.translate(k), frameworkLabelKey(frameworkOf(key)), key)
    );
  }

  protected readiness(pack: AuditPack): number | null {
    return packReadiness(pack.summary.readiness);
  }

  protected planRef(plan: LinkedRecord) {
    return auditPlanRef(plan);
  }

  protected tone(score: number) {
    return toneFor('progress', score);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes, this.language.active());
  }

  protected openGenerate(): void {
    this.generateOpen.set(true);
  }

  protected closeGenerate(): void {
    this.generateOpen.set(false);
    if (this.flow()) {
      this.flows.cancel();
    }
  }

  protected clearAudit(): void {
    this.auditCleared.set(true);
    this.offset.set(0);
    void this.router.navigate([], {
      queryParams: { audit_plan_id: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearFilters(): void {
    this.framework.set(null);
    if (this.auditPlanId()) {
      this.clearAudit();
    }
  }

  protected reload(): void {
    this.load(this.orgId(), this.framework(), this.auditPlanId(), this.offset());
  }

  protected download(pack: AuditPack): void {
    const orgId = this.orgId();
    if (!orgId || this.downloading()) {
      return;
    }
    this.downloading.set(pack.id);
    this.api.downloadAuditPack(orgId, pack.id).subscribe({
      next: (blob) => {
        this.downloading.set(null);
        saveBlob(blob, pack.file_name || 'audit-pack.zip');
      },
      error: (error: unknown) => {
        this.downloading.set(null);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  protected onGenerated(pack: AuditPack): void {
    this.generateOpen.set(false);
    this.notifications.success('reports.packs.generated');
    if (this.flow()) {
      // Ends the flow: "Koblet til AUD-…" (the pack also shows on the audit structurally).
      this.flows.complete(pack.id, 'audit_pack').subscribe();
    }
    void this.router.navigate(['/reports/audit-packs', pack.id]);
  }

  private load(
    orgId: string | null,
    framework: FrameworkKey | null,
    auditPlanId: string | null,
    offset: number,
  ): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.error.set(null);
    this.sub.add(
      this.api
        .listAuditPacks(orgId, { framework, audit_plan_id: auditPlanId, limit: PAGE_SIZE, offset })
        .subscribe({
          next: (list) => {
            this.items.set(list.items);
            this.total.set(list.total);
            this.loaded.set(true);
          },
          error: (error: unknown) => {
            this.error.set(reportErrorKey(error));
            this.loaded.set(true);
          },
        }),
    );
  }
}
