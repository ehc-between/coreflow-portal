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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RequirementLink } from '../../../core/standards/standards.models';
import { WatchButton } from '../../../shared/activity/watch-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { ReportsAsk } from '../components/ask-button';
import { ReportsNav } from '../components/reports-nav';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import {
  formatBytes,
  frameworkLabelKey,
  labelOr,
  localized,
  packReadiness,
  percentOf,
  scoreColor,
} from '../data/report-display';
import {
  AuditPack,
  AuditPackStandard,
  LinkedRecord,
  REPORTS_MODULE,
  REPORTS_PERMISSIONS,
} from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { pluralKey } from '../../../shared/i18n/plural';
import { auditPlanRef, packStandardKeys } from './audit-packs-list';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments'];

/** Coverage rows of a pack: one per standard, or the pack totals for older packs. */
export function packCoverage(pack: AuditPack): AuditPackStandard[] {
  const standards = pack.summary.standards;
  if (Array.isArray(standards) && standards.length) {
    return [...standards];
  }
  const s = pack.summary;
  if (typeof s.applicable !== 'number' && typeof s.requirements !== 'number') {
    return [];
  }
  return [
    {
      standard_key: pack.standard_key,
      framework: pack.framework,
      requirements: s.requirements ?? 0,
      applicable: s.applicable ?? 0,
      covered: s.covered ?? 0,
      evidence_links: s.evidence_links ?? 0,
      score: packReadiness(s.readiness) ?? 0,
    },
  ];
}

/**
 * `/reports/audit-packs/:id`: what a generated pack holds — requirement coverage per
 * standard in plain words ("9 av 364 gjeldende krav dokumentert"), the audit and
 * period it was made for, each file with its rows and size, the SHA-256 checksum —
 * plus download, delete, links, activity and comments.
 */
@Component({
  selector: 'app-audit-pack-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    LocalNumberPipe,
    WatchButton,
    WhyItMatters,
    EntityChip,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FieldItem,
    FieldList,
    LoadingState,
    MenuItem,
    ProgressBar,
    ReportsAsk,
    ReportsNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[860px] px-4 pt-8 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/reports/audit-packs"
          class="mt-3 inline-block text-ui font-semibold text-accent hover:underline"
        >
          {{ 'reports.packs.back' | transloco }}
        </a>
      </div>
    } @else if (pack(); as p) {
      <app-record-detail-layout
        entityType="audit_pack"
        [entityId]="p.id"
        [title]="p.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.reports', link: '/reports' },
          { labelKey: 'reports.nav.auditPacks', link: '/reports/audit-packs' },
          { label: p.title },
        ]"
        [tabs]="tabs"
        [canEdit]="canDelete()"
        backLink="/reports/audit-packs"
        backLabelKey="reports.packs.back"
      >
        <ng-container meta>
          <span>{{ 'modules.entities.audit_pack' | transloco }}</span>
          @for (key of standardKeys(); track key) {
            <app-badge tone="info">{{ standardName(key) }}</app-badge>
          }
        </ng-container>

        <app-watch-button secondary entityType="audit_pack" [entityId]="p.id" />
        <app-button
          primary
          [loading]="downloading()"
          (click)="download()"
          data-testid="pack-download"
        >
          {{ 'reports.packs.download' | transloco }}
        </app-button>
        @if (canDelete()) {
          <button type="button" overflow appMenuItem [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'reports.packs.delete' | transloco }}
          </button>
        }

        <app-reports-nav nav />

        <app-card class="mb-4 block">
          <section aria-labelledby="pack-coverage" data-testid="pack-coverage-card">
            <div class="mb-1 flex flex-wrap items-start justify-between gap-2">
              <h2 id="pack-coverage" class="text-card font-semibold text-fg">
                {{ 'reports.packs.coverageTitle' | transloco }}
              </h2>
              <app-reports-ask
                [prompt]="'reports.packs.askSummarise' | transloco: { title: p.title }"
              />
            </div>
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'reports.packs.coverageExplain' | transloco }}
            </p>
            <ul class="flex flex-col gap-3">
              @for (row of coverage(); track row.standard_key) {
                <li>
                  <div class="flex items-baseline justify-between gap-2 text-ui">
                    <span class="min-w-0 truncate font-semibold text-fg">{{
                      standardName(row.framework || row.standard_key)
                    }}</span>
                    <span class="flex-none font-mono text-fg-muted">{{ percent(row) }} %</span>
                  </div>
                  <app-progress-bar
                    class="mt-1 block"
                    [value]="percent(row)"
                    [color]="color(percent(row))"
                    [label]="standardName(row.framework || row.standard_key)"
                  />
                  <p class="mt-1 text-meta text-fg-muted">
                    {{
                      'reports.packs.coveredOf'
                        | transloco
                          : {
                              covered: row.covered,
                              applicable: row.applicable,
                              percent: percent(row),
                            }
                    }}
                    @if (row.requirements > row.applicable) {
                      ·
                      {{
                        plural('reports.packs.notApplicable', row.requirements - row.applicable)
                          | transloco: { count: row.requirements - row.applicable }
                      }}
                    }
                    ·
                    {{
                      plural('reports.packs.evidenceLinks', row.evidence_links)
                        | transloco: { count: row.evidence_links }
                    }}
                  </p>
                </li>
              } @empty {
                <li class="text-ui text-fg-muted">{{ 'reports.packs.noCoverage' | transloco }}</li>
              }
            </ul>
          </section>
        </app-card>

        <app-card class="mb-4 block">
          <h2 class="mb-3 text-card font-semibold text-fg">
            {{ 'reports.packs.aboutTitle' | transloco }}
          </h2>
          <app-field-list [columns]="2">
            <app-field-item labelKey="reports.packs.audit">
              @if (p.audit_plan; as plan) {
                <app-entity-chip [ref]="planRef(plan)" />
              } @else {
                <span class="text-fg-subtle">{{ 'reports.packs.noAudit' | transloco }}</span>
              }
            </app-field-item>
            <app-field-item labelKey="reports.packs.periodLabel">
              @if (p.period_start || p.period_end) {
                {{ p.period_start ? (p.period_start | localDay) : '…' }} –
                {{ p.period_end ? (p.period_end | localDay) : '…' }}
              } @else {
                <span class="text-fg-subtle">{{ 'reports.packs.noPeriod' | transloco }}</span>
              }
            </app-field-item>
            <app-field-item
              labelKey="reports.packs.generatedByLabel"
              [value]="p.generated_by?.name || ('reports.detail.unknownUser' | transloco)"
            />
            <app-field-item
              labelKey="reports.form.lang"
              [value]="'reports.langs.' + p.lang | transloco"
            />
            @if (policies() !== null) {
              <app-field-item labelKey="reports.packs.summary.policies" [value]="policies()" />
            }
            <app-field-item labelKey="reports.packs.size" [value]="size(p.size_bytes)" />
            @if (p.sha256) {
              <app-field-item labelKey="reports.packs.checksum" [wide]="true">
                <span class="block font-mono text-meta break-all" data-testid="pack-sha">{{
                  p.sha256
                }}</span>
                <span class="mt-0.5 block text-meta text-fg-muted">{{
                  'reports.packs.checksumAt'
                    | transloco: { date: (p.generated_at | localDate: 'y-MM-dd HH:mm:ss') }
                }}</span>
              </app-field-item>
            }
          </app-field-list>
        </app-card>

        <app-card [padded]="false" class="mb-4 block">
          <h2 class="border-b border-border px-4 py-3 text-card font-semibold text-fg">
            {{ 'reports.packs.contents' | transloco }}
          </h2>
          <ul class="divide-y divide-border md:hidden" data-testid="pack-contents-list">
            @for (file of p.contents; track file.path) {
              <li class="px-4 py-2.5">
                <p class="font-mono text-meta break-all text-fg">{{ file.path }}</p>
                <p class="mt-0.5 text-meta text-fg-muted">
                  {{ kindLabel(file.kind) }}
                  @if (file.rows !== null) {
                    · {{ plural('reports.runs.rows', file.rows) | transloco: { count: file.rows } }}
                  }
                  · {{ size(file.size_bytes) }}
                </p>
              </li>
            } @empty {
              <li class="px-4 py-4 text-center text-ui text-fg-muted">
                {{ 'reports.packs.noContents' | transloco }}
              </li>
            }
          </ul>
          <div class="hidden overflow-x-auto md:block">
            <table class="w-full text-left text-meta">
              <caption class="sr-only">
                {{
                  'reports.packs.contents' | transloco
                }}
              </caption>
              <thead class="bg-surface-2 text-fg-muted">
                <tr>
                  <th scope="col" class="px-3 py-2 font-semibold">
                    {{ 'reports.packs.file' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2 font-semibold">
                    {{ 'reports.packs.kind' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2 text-right font-semibold">
                    {{ 'reports.packs.rows' | transloco }}
                  </th>
                  <th scope="col" class="px-3 py-2 text-right font-semibold">
                    {{ 'reports.packs.size' | transloco }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                @for (file of p.contents; track file.path) {
                  <tr>
                    <td class="px-3 py-1.5 font-mono text-fg">{{ file.path }}</td>
                    <td class="px-3 py-1.5 text-fg-muted">{{ kindLabel(file.kind) }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-fg">
                      {{ file.rows === null ? '—' : (file.rows | localNumber) }}
                    </td>
                    <td class="px-3 py-1.5 text-right font-mono whitespace-nowrap text-fg-muted">
                      {{ size(file.size_bytes) }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="px-3 py-4 text-center text-fg-muted">
                      {{ 'reports.packs.noContents' | transloco }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </app-card>

        <app-why-it-matters scope="reports" page="auditPackDetail" />

        <app-supports-requirements
          aside-requirements
          entityType="audit_pack"
          [entityId]="p.id"
          [canEdit]="canDelete()"
          (linksChange)="onLinks($event)"
        />
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'reports.packs.deleteTitle' | transloco"
        [message]="'reports.packs.deleteMessage' | transloco: { title: p.title }"
        [confirmLabel]="'reports.packs.delete' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="deleting()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    }
  `,
})
export class AuditPackDetail {
  private readonly api = inject(ReportsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly plural = pluralKey;

  protected readonly pack = signal<AuditPack | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly requirementRefs = signal<readonly string[]>([]);

  /** The generator or a `reports:manage` holder may delete a pack. */
  protected readonly canDelete = computed(() => {
    const p = this.pack();
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return (
      !!p &&
      (granted.includes(REPORTS_PERMISSIONS.manage) || p.generated_by?.id === this.auth.user()?.id)
    );
  });

  protected readonly standardKeys = computed(() => {
    const p = this.pack();
    return p ? packStandardKeys(p) : [];
  });

  protected readonly coverage = computed(() => {
    const p = this.pack();
    return p ? packCoverage(p) : [];
  });

  protected readonly policies = computed(() => {
    const value = this.pack()?.summary.policies;
    return typeof value === 'number' ? value : null;
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'audit_pack',
      entityId: this.id(),
      view: 'detail',
      title: this.pack()?.title ?? null,
      standardKey: this.pack()?.standard_key ?? null,
      requirements: this.requirementRefs().length ? this.requirementRefs() : null,
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected onLinks(links: readonly RequirementLink[]): void {
    this.requirementRefs.set(
      links.filter((l) => l.status === 'confirmed').map((l) => l.requirement_ref),
    );
  }

  protected standardName(key: string): string {
    const own = localized(this.pack()?.standard_names?.[key], this.language.active(), '');
    return (
      own || labelOr((k) => this.language.translate(k), frameworkLabelKey(frameworkOf(key)), key)
    );
  }

  protected percent(row: AuditPackStandard): number {
    return row.applicable > 0 ? percentOf(row.covered, row.applicable) : Math.round(row.score);
  }

  protected color(score: number): string {
    return scoreColor(score);
  }

  protected planRef(plan: LinkedRecord) {
    return auditPlanRef(plan);
  }

  protected kindLabel(kind: string): string {
    return labelOr((k) => this.language.translate(k), `reports.packs.kinds.${kind}`, kind);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes, this.language.active());
  }

  protected download(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.pack();
    if (!orgId || !p || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.api.downloadAuditPack(orgId, p.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        saveBlob(blob, p.file_name || 'audit-pack.zip');
      },
      error: (error: unknown) => {
        this.downloading.set(false);
        void blobErrorKey(error).then((key) => this.notifications.error(key));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.pack();
    if (!orgId || !p || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteAuditPack(orgId, p.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('reports.packs.deleted');
        void this.router.navigate(['/reports/audit-packs']);
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.notifications.error(reportErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.pack.set(null);
    this.error.set(null);
    this.sub.add(
      this.api.getAuditPack(orgId, id).subscribe({
        next: (p) => this.pack.set(p),
        error: (error: unknown) => this.error.set(reportErrorKey(error)),
      }),
    );
  }
}
