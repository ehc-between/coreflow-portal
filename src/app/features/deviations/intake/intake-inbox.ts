import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { hasAnyPermission } from '../../../core/auth/permission';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import {
  INTAKE_STATUSES,
  IntakeReport,
  IntakeSettings,
  IntakeStatus,
} from '../../../core/deviations/intake.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { DEVIATIONS_ROOT_CRUMB, parseUtc } from '../deviation-display';
import { DeviationFilter, FilterOption } from '../ui/filter-select';
import { DeviationsNavService } from '../ui/deviations-nav';

const PAGE_SIZE = 25;

/** The shared tone-map value of an intake report status. */
export function intakeStatusValue(status: string): string {
  switch (status) {
    case 'triaged':
      return 'in_progress';
    case 'converted':
      return 'done';
    case 'dismissed':
      return 'cancelled';
    default:
      return status;
  }
}

/** The next legal deadline of a whistleblowing report (receipt, then feedback), or null. */
export function nextDeadline(
  report: IntakeReport,
): { readonly kind: 'acknowledge' | 'feedback'; readonly at: string } | null {
  if (report.acknowledge_due_at && !report.acknowledged_at) {
    return { kind: 'acknowledge', at: report.acknowledge_due_at };
  }
  if (report.feedback_due_at && report.status !== 'dismissed') {
    return { kind: 'feedback', at: report.feedback_due_at };
  }
  return null;
}

/**
 * "Mottatte rapporter" — the triage inbox of the anonymous / whistleblowing intake
 * (`deviations:intake`) on the shared page frame: received reports, newest first,
 * filterable by status, with the legal deadlines of whistleblowing reports
 * (confirm receipt within 7 days, give feedback within 3 months). When the public
 * link is off, the empty state says so and offers to turn it on (finding 32).
 */
@Component({
  selector: 'app-intake-inbox',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    EmptyState,
    ErrorState,
    HelpStrip,
    LoadingState,
    LocalDatePipe,
    ModuleNav,
    PageHeader,
    Pager,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    DeviationFilter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.intake.inbox.title"
        descriptionKey="deviations.intake.inbox.subtitle"
        [breadcrumbs]="breadcrumbs"
        [settingsLink]="isAdmin() ? '/settings/modules/deviations/intake' : null"
      />
      <app-module-nav [items]="nav.items()" labelKey="modules.names.deviations" />
      <app-help-strip scope="deviations" page="intakeInbox" lesson="speaking-up" />

      @if (linkOff()) {
        <div
          class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-surface-2 px-4 py-3"
          data-testid="link-off"
        >
          <p class="text-ui text-fg">{{ 'deviations.intake.inbox.linkOff' | transloco }}</p>
          @if (isAdmin()) {
            <a routerLink="/settings/modules/deviations/intake" tabindex="-1">
              <app-button size="sm">{{ 'deviations.intake.inbox.turnOn' | transloco }}</app-button>
            </a>
          }
        </div>
      }

      <div class="mb-4 flex flex-wrap items-end gap-2">
        <app-deviation-filter
          labelKey="deviations.intake.inbox.status"
          allKey="deviations.intake.inbox.allStatuses"
          [options]="statusOptions"
          [value]="status()"
          (valueChange)="setStatus($any($event))"
        />
      </div>

      @if (error()) {
        <app-error-state (retry)="reload()" />
      } @else if (loading()) {
        <app-loading-state [rows]="4" />
      } @else if (items().length === 0) {
        @if (status()) {
          <app-empty-state
            icon="inbox"
            titleKey="deviations.intake.inbox.noneWithStatus"
            [bodyKey]="
              linkOff()
                ? 'deviations.intake.inbox.noneLinkOff'
                : 'deviations.intake.inbox.noneWithStatusBody'
            "
            [compact]="true"
          />
        } @else {
          <app-teaching-empty scope="deviations" page="intakeInbox" [showAction]="false" />
        }
      } @else {
        <div class="overflow-hidden rounded-card border border-border bg-surface">
          <app-record-row-header
            dateKind="created"
            [coverage]="false"
            [owner]="false"
            codeKey="deviations.intake.inbox.deviationColumn"
            titleKey="deviations.intake.inbox.reportColumn"
          />
          <div role="list" [attr.aria-label]="'deviations.intake.inbox.title' | transloco">
            @for (report of items(); track report.id) {
              <app-record-row
                [code]="report.deviation_code"
                [title]="report.title"
                [subtitle]="'deviations.intake.modes.' + report.mode | transloco"
                [link]="['/deviations/intake', report.id]"
                [date]="report.created_at"
                dateKind="created"
              >
                <app-status-badge
                  badges
                  meaning="lifecycle"
                  [value]="statusValue(report.status)"
                  [labelKey]="'deviations.intake.status.' + report.status"
                />
                @if (deadline(report); as d) {
                  <span
                    badges
                    class="text-meta"
                    [class]="isLate(d.at) ? 'font-semibold text-warn-ink' : 'text-fg-muted'"
                    >{{
                      'deviations.intake.deadline.' + d.kind
                        | transloco: { date: (d.at | localDate: 'mediumDate') }
                    }}</span
                  >
                }
              </app-record-row>
            }
          </div>
        </div>
        @if (total() > pageSize) {
          <div class="mt-3">
            <app-pager
              [offset]="offset()"
              [pageSize]="pageSize"
              [count]="items().length"
              [total]="total()"
              (pageChange)="goTo($event)"
            />
          </div>
        }
      }
    </div>
  `,
})
export class IntakeInboxPage {
  private readonly api = inject(DeviationIntakeApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly nav = inject(DeviationsNavService);

  protected readonly breadcrumbs = [
    DEVIATIONS_ROOT_CRUMB,
    { labelKey: 'deviations.intake.inbox.title' },
  ];
  protected readonly statusOptions: readonly FilterOption[] = INTAKE_STATUSES.map((s) => ({
    value: s,
    label: `deviations.intake.status.${s}`,
  }));
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = signal<IntakeStatus | ''>('new');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly IntakeReport[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly settings = signal<IntakeSettings | null>(null);

  protected readonly isAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'deviations:admin'),
  );
  /** The public link is known to be off (admins only can read the settings). */
  protected readonly linkOff = computed(() => this.settings()?.enabled === false);

  protected readonly statusValue = intakeStatusValue;
  protected readonly deadline = nextDeadline;

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'intake_report',
      view: 'list',
      title: this.language.translate('deviations.intake.inbox.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        this.offset.set(0);
        this.load(orgId);
        this.settings.set(null);
        if (this.isAdmin()) {
          this.api.getSettings(orgId).subscribe({
            next: (s) => this.settings.set(s),
            error: () => this.settings.set(null),
          });
        }
      }
    });
  }

  protected isLate(at: string): boolean {
    const date = parseUtc(at);
    return !!date && date.getTime() < Date.now();
  }

  protected setStatus(value: IntakeStatus | ''): void {
    this.status.set(value);
    this.offset.set(0);
    this.reload();
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
    this.reload();
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  private load(orgId: string): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .listReports(orgId, {
        status: this.status() || undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (list) => {
          this.items.set(list.items);
          this.total.set(list.total);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
