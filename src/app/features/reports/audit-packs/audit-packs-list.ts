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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { FrameworkSelect } from '../components/framework-select';
import { ReportsLessonButton } from '../components/reports-lesson-button';
import { blobErrorKey, reportErrorKey, saveBlob } from '../data/report-errors';
import { formatBytes, frameworkLabelKey, labelOr, scoreTone } from '../data/report-display';
import { AuditPack, FrameworkKey, REPORTS_MODULE } from '../data/reports.models';
import { ReportsApi } from '../data/reports-api';
import { GeneratePackDialog } from './generate-pack-dialog';

const PAGE_SIZE = 25;

/**
 * `/reports/audit-packs` (`reports:audit_pack`): one-click audit packs per
 * standard — a zip with the Statement of Applicability, policies, registers,
 * the evidence index, readiness and a checksummed manifest — and the packs
 * generated so far, newest first.
 */
@Component({
  selector: 'app-audit-packs-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    GuideIntro,
    TeachingEmpty,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    FrameworkSelect,
    ReportsLessonButton,
    GeneratePackDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'reports.packs.title' | transloco }}
          </h1>
          <p class="mt-1 text-[13.5px] text-fg-muted">{{ 'reports.packs.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <app-tour-button scope="reports" tour="auditPacks" />
          <app-reports-lesson-button lesson="audit-ready" />
          <app-button [appTourStep]="'reports-generate-pack'" (click)="generateOpen.set(true)">
            <app-icon name="plus" [size]="15" />
            {{ 'reports.packs.generate' | transloco }}
          </app-button>
        </div>
      </header>

      <app-guide-intro class="mb-4 block" scope="reports" page="auditPacks" />

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <app-framework-select
          [value]="framework()"
          (valueChange)="framework.set($event); offset.set(0)"
        />
      </div>

      @if (error(); as key) {
        <app-card>
          <p class="py-6 text-center text-[13.5px] text-fg-muted" role="alert">
            {{ key | transloco }}
          </p>
        </app-card>
      } @else if (!loaded()) {
        <p class="py-10 text-center text-[13.5px] text-fg-muted" role="status">
          {{ 'reports.common.loading' | transloco }}
        </p>
      } @else if (items().length === 0) {
        <app-card>
          <app-teaching-empty scope="reports" page="auditPacks" (action)="generateOpen.set(true)" />
        </app-card>
      } @else {
        <app-card [padded]="false">
          <ul class="divide-y divide-border" data-testid="audit-packs">
            @for (pack of items(); track pack.id) {
              <li
                class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="min-w-0">
                  <a
                    [routerLink]="['/reports/audit-packs', pack.id]"
                    class="font-semibold text-fg hover:text-accent hover:underline"
                  >
                    {{ pack.title }}
                  </a>
                  <p
                    class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-muted"
                  >
                    @if (pack.framework) {
                      <app-badge tone="info">{{ frameworkName(pack.framework) }}</app-badge>
                    }
                    @if (pack.summary.readiness !== null && pack.summary.readiness !== undefined) {
                      <app-badge [tone]="tone(pack.summary.readiness)">
                        {{
                          'reports.packs.readiness' | transloco: { score: pack.summary.readiness }
                        }}
                      </app-badge>
                    }
                    <span>{{ pack.generated_at | localDate: 'medium' }}</span>
                    @if (pack.generated_by?.name; as by) {
                      <span>· {{ by }}</span>
                    }
                    <span>· {{ size(pack.size_bytes) }}</span>
                  </p>
                </div>
                <app-button
                  variant="secondary"
                  size="sm"
                  [loading]="downloading() === pack.id"
                  [disabled]="!!downloading()"
                  (click)="download(pack)"
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

      <app-why-it-matters class="mt-6 block" scope="reports" page="auditPacks" />
    </div>

    <app-generate-pack-dialog
      [open]="generateOpen()"
      (closed)="generateOpen.set(false)"
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

  protected readonly pageSize = PAGE_SIZE;
  protected readonly framework = signal<FrameworkKey | null>(null);
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly AuditPack[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal<string | null>(null);
  protected readonly generateOpen = signal(false);

  private readonly orgId = computed(() => this.selectedOrg.currentOrgId());
  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({ module: REPORTS_MODULE, entityType: 'audit_pack', view: 'list' }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.orgId();
      const framework = this.framework();
      const offset = this.offset();
      untracked(() => this.load(orgId, framework, offset));
    });
  }

  protected frameworkName(framework: string): string {
    return labelOr((k) => this.language.translate(k), frameworkLabelKey(framework), framework);
  }

  protected tone(score: number | null | undefined) {
    return scoreTone(score);
  }

  protected size(bytes: number): string {
    return formatBytes(bytes, this.language.active());
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
    void this.router.navigate(['/reports/audit-packs', pack.id]);
  }

  private load(orgId: string | null, framework: FrameworkKey | null, offset: number): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.error.set(null);
    this.sub.add(
      this.api.listAuditPacks(orgId, { framework, limit: PAGE_SIZE, offset }).subscribe({
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
