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
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import { formatBytes, frameworkLabelKey, labelOr, scoreColor } from '../data/report-display';
import { AuditPack, REPORTS_MODULE, REPORTS_PERMISSIONS } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';

const TABS: readonly RecordTab[] = ['details', 'related', 'activity', 'comments'];

/** Summary counters shown on the pack, in display order. */
export const SUMMARY_FIELDS = [
  'requirements',
  'applicable',
  'covered',
  'evidence_links',
  'policies',
] as const;

/**
 * `/reports/audit-packs/:id`: what a generated pack contains (each file with its
 * rows and size), its readiness summary and SHA-256 checksum, download and
 * delete, plus links, activity and comments.
 */
@Component({
  selector: 'app-audit-pack-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalNumberPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    ProgressRing,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as key) {
      <div class="mx-auto max-w-[860px] px-4 pt-8 sm:px-8">
        <app-alert>{{ key | transloco }}</app-alert>
        <a
          routerLink="/reports/audit-packs"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'reports.packs.back' | transloco }}
        </a>
      </div>
    } @else if (pack(); as p) {
      <app-record-detail-layout
        entityType="audit_pack"
        [entityId]="p.id"
        [tabs]="tabs"
        [canEdit]="canDelete()"
        backLink="/reports/audit-packs"
        backLabelKey="reports.packs.back"
      >
        <div header class="min-w-0">
          <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
            @if (p.framework) {
              <app-badge tone="info">{{ frameworkName(p.framework) }}</app-badge>
            }
            <span>{{ 'modules.entities.audit_pack' | transloco }}</span>
          </p>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ p.title }}
          </h1>
        </div>
        <ng-container actions>
          <app-watch-button entityType="audit_pack" [entityId]="p.id" />
          <app-button [loading]="downloading()" (click)="download()">
            {{ 'reports.packs.download' | transloco }}
          </app-button>
          @if (canDelete()) {
            <app-button variant="ghost" (click)="deleteOpen.set(true)">
              <span class="sr-only">{{ 'reports.packs.delete' | transloco }}</span>
              <app-icon name="trash" [size]="15" />
            </app-button>
          }
        </ng-container>

        <app-guide-intro class="mb-4 block" scope="reports" page="auditPackDetail" />

        <app-card class="mb-4 block">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            @if (readiness() !== null) {
              <app-progress-ring
                [value]="readiness() ?? 0"
                [size]="84"
                [color]="ringColor()"
                [label]="'reports.metric.readinessLabel' | transloco: { score: readiness() }"
              />
            }
            <dl class="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              @for (field of summaryFields; track field) {
                @if (summaryValue(field) !== null) {
                  <div class="rounded-[8px] bg-surface-2 px-3 py-2">
                    <dt class="text-[11.5px] text-fg-muted">
                      {{ 'reports.packs.summary.' + field | transloco }}
                    </dt>
                    <dd class="font-mono text-[16px] font-semibold text-fg">
                      {{ summaryValue(field) | localNumber }}
                    </dd>
                  </div>
                }
              }
            </dl>
          </div>
          <p class="mt-4 text-[12.5px] text-fg-muted">
            {{
              'reports.packs.generatedBy'
                | transloco
                  : {
                      name: p.generated_by?.name || ('reports.detail.unknownUser' | transloco),
                      date: (p.generated_at | localDate: 'medium'),
                    }
            }}
            · {{ 'reports.langs.' + p.lang | transloco }} · {{ size(p.size_bytes) }}
          </p>
          @if (p.sha256) {
            <div class="mt-2">
              <p class="text-[12px] font-semibold text-fg-muted">
                {{ 'reports.packs.checksum' | transloco }}
              </p>
              <p class="font-mono text-[11.5px] break-all text-fg" data-testid="pack-sha">
                {{ p.sha256 }}
              </p>
            </div>
          }
          <div class="mt-3 flex justify-end">
            <app-ask-about
              [prompt]="'reports.packs.askSummarise' | transloco: { title: p.title }"
            />
          </div>
        </app-card>

        <app-card [padded]="false" class="mb-4 block">
          <h2 class="border-b border-border px-4 py-2.5 text-[14px] font-semibold text-fg">
            {{ 'reports.packs.contents' | transloco }}
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-[12.5px]">
              <caption class="sr-only">
                {{
                  'reports.packs.contents' | transloco
                }}
              </caption>
              <thead class="bg-surface-2 text-[11.5px] tracking-[0.04em] text-fg-subtle uppercase">
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
                    <td class="px-3 py-1.5 font-mono text-[12px] text-fg">{{ file.path }}</td>
                    <td class="px-3 py-1.5 text-fg-muted">{{ kindLabel(file.kind) }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-fg">{{ file.rows ?? '—' }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-fg-muted">
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

        <ng-container aside>
          <app-card>
            <app-supports-requirements entityType="audit_pack" [entityId]="p.id" />
          </app-card>
        </ng-container>
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
      <p class="py-16 text-center text-[13.5px] text-fg-muted" role="status">
        {{ 'reports.common.loading' | transloco }}
      </p>
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
  protected readonly summaryFields = SUMMARY_FIELDS;

  protected readonly pack = signal<AuditPack | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);

  /** The generator or a `reports:manage` holder may delete a pack. */
  protected readonly canDelete = computed(() => {
    const p = this.pack();
    const granted = this.selectedOrg.currentOrg()?.permissions ?? [];
    return (
      !!p &&
      (granted.includes(REPORTS_PERMISSIONS.manage) || p.generated_by?.id === this.auth.user()?.id)
    );
  });

  protected readonly readiness = computed(() => {
    const value = this.pack()?.summary.readiness;
    return typeof value === 'number' ? value : null;
  });
  protected readonly ringColor = computed(() => scoreColor(this.readiness()));

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: REPORTS_MODULE,
      entityType: 'audit_pack',
      entityId: this.id(),
      view: 'detail',
      title: this.pack()?.title ?? null,
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected summaryValue(field: string): number | null {
    const value = this.pack()?.summary[field];
    return typeof value === 'number' ? value : null;
  }

  protected frameworkName(framework: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(framework), framework);
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
