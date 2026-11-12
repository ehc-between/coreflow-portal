import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { DeviationIntakeApi } from '../../../core/deviations/intake-api';
import {
  INTAKE_STATUSES,
  IntakeReport,
  IntakeStatus,
} from '../../../core/deviations/intake.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge, BadgeTone } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { DeviationPageGuide } from '../guide/deviation-page-guide';

const PAGE_SIZE = 25;

/** Badge tone of an intake report status. */
export function intakeStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'new':
      return 'info';
    case 'triaged':
      return 'warn';
    case 'converted':
      return 'pass';
    default:
      return 'neutral';
  }
}

/**
 * The triage inbox of the anonymous / whistleblowing intake
 * (`deviations:intake`): received reports, newest first, filterable by status.
 * Each opens the report detail to triage, dismiss or convert it into a deviation.
 */
@Component({
  selector: 'app-intake-inbox',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Badge,
    Button,
    Card,
    Icon,
    Pager,
    LocalDatePipe,
    TeachingEmpty,
    DeviationPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/deviations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.backToList' | transloco }}
      </a>
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg sm:text-[26px]">
            {{ 'deviations.intake.inbox.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'deviations.intake.inbox.subtitle' | transloco }}
          </p>
        </div>
        <a *appHasPermission="'deviations:admin'" routerLink="/deviations/intake/settings">
          <app-button variant="secondary">
            <app-icon name="sliders" [size]="15" />
            {{ 'deviations.intake.settings.link' | transloco }}
          </app-button>
        </a>
      </div>

      <app-deviation-page-guide class="mb-5" page="intakeInbox" lesson="speaking-up" />

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label for="intake-status" class="text-[13px] font-semibold text-fg-muted">
          {{ 'deviations.intake.inbox.status' | transloco }}
        </label>
        <select
          id="intake-status"
          [ngModel]="status()"
          (ngModelChange)="setStatus($event)"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
        >
          <option value="">{{ 'deviations.intake.inbox.allStatuses' | transloco }}</option>
          @for (option of statuses; track option) {
            <option [value]="option">{{ 'deviations.intake.status.' + option | transloco }}</option>
          }
        </select>
      </div>

      <app-card [padded]="false">
        @if (loading()) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          @if (status()) {
            <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
              {{ 'deviations.intake.inbox.noneWithStatus' | transloco }}
            </p>
          } @else {
            <app-teaching-empty scope="deviations" page="intakeInbox" [showAction]="false" />
          }
        } @else {
          <ul>
            @for (report of items(); track report.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/deviations/intake', report.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{ report.title }}</span>
                    <span class="block text-[12.5px] text-fg-muted">
                      {{ 'deviations.intake.modes.' + report.mode | transloco }}
                      · {{ report.created_at | localDate: 'medium' }}
                    </span>
                  </span>
                  @if (report.deviation_code) {
                    <span class="font-mono text-[12px] text-fg-subtle">{{
                      report.deviation_code
                    }}</span>
                  }
                  <app-badge [tone]="tone(report.status)">{{
                    'deviations.intake.status.' + report.status | transloco
                  }}</app-badge>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>

      @if (!loading() && total() > pageSize) {
        <div class="mt-4">
          <app-pager
            [offset]="offset()"
            [pageSize]="pageSize"
            [count]="items().length"
            [total]="total()"
            (pageChange)="goTo($event)"
          />
        </div>
      }
    </div>
  `,
})
export class IntakeInboxPage {
  private readonly api = inject(DeviationIntakeApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly statuses = INTAKE_STATUSES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = signal<IntakeStatus | ''>('new');
  protected readonly offset = signal(0);
  protected readonly items = signal<readonly IntakeReport[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);

  constructor() {
    providePageContext(() => ({ module: 'deviations', view: 'list', title: null }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        this.offset.set(0);
        this.load(orgId);
      }
    });
  }

  protected tone(status: string): BadgeTone {
    return intakeStatusTone(status);
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

  private reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.load(orgId);
    }
  }

  private load(orgId: string): void {
    this.loading.set(true);
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
        error: () => this.loading.set(false),
      });
  }
}
