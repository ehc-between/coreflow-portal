import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDatePipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { startOfDay } from '../../../shared/tasks/task-display';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import {
  MONITORING_KINDS,
  MONITORING_RESULTS,
  MonitoringCreate,
  MonitoringEntry,
  MonitoringKind,
  MonitoringResult,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_SCOPE,
  monitoringKindKey,
  monitoringResultKey,
  monitoringTone,
} from '../data/ai-governance-display';

const PAGE_SIZE = 10;

interface Draft {
  kind: MonitoringKind;
  metric: string;
  value: string;
  threshold: string;
  result: MonitoringResult;
  notes: string;
  measured: string;
}

const emptyDraft = (): Draft => ({
  kind: 'accuracy',
  metric: '',
  value: '',
  threshold: '',
  result: 'pass',
  notes: '',
  measured: '',
});

/** Parse a number input; '' and non-numbers become null. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Accuracy / robustness / bias / drift monitoring of an AI system (Art. 15 and
 * the post-market monitoring plan, Art. 72): the measurements log with a quick
 * entry form. A failed result raises an alert for the system's owner.
 */
@Component({
  selector: 'app-ai-system-monitoring',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-[15px] font-bold text-fg">
          {{ 'aiGovernance.monitoring.title' | transloco }}
          <app-field-help [scope]="scope" page="systemDetail" field="monitoring" />
        </h2>
        @if (canWrite() && !formOpen()) {
          <app-button size="sm" variant="secondary" (click)="formOpen.set(true)">
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.monitoring.add' | transloco }}
          </app-button>
        }
      </div>

      @if (formOpen()) {
        <form
          class="mb-4 grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-3"
          (submit)="$event.preventDefault(); save()"
          data-testid="monitoring-form"
        >
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.kind' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="patch({ kind: $any($event.target).value })"
            >
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="draft().kind === k">
                  {{ kindKey(k) | transloco }}
                </option>
              }
            </select>
          </label>
          <label
            class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-1 lg:col-span-2"
          >
            {{ 'aiGovernance.monitoring.metric' | transloco }}
            <input
              type="text"
              required
              maxlength="120"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [placeholder]="'aiGovernance.monitoring.metricPlaceholder' | transloco"
              [value]="draft().metric"
              (input)="patch({ metric: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.value' | transloco }}
            <input
              type="text"
              inputmode="decimal"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [value]="draft().value"
              (input)="patch({ value: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.threshold' | transloco }}
            <input
              type="text"
              inputmode="decimal"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [value]="draft().threshold"
              (input)="patch({ threshold: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.result' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="patch({ result: $any($event.target).value })"
            >
              @for (r of results; track r) {
                <option [value]="r" [selected]="draft().result === r">
                  {{ resultKey(r) | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.measuredAt' | transloco }}
            <input
              type="date"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [value]="draft().measured"
              (input)="patch({ measured: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] font-semibold text-fg-muted sm:col-span-2">
            {{ 'aiGovernance.monitoring.notes' | transloco }}
            <input
              type="text"
              maxlength="4000"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-[13px] font-normal text-fg"
              [value]="draft().notes"
              (input)="patch({ notes: $any($event.target).value })"
            />
          </label>
          <div class="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
            <app-button size="sm" variant="ghost" (click)="close()">{{
              'aiGovernance.common.cancel' | transloco
            }}</app-button>
            <app-button
              size="sm"
              type="submit"
              [disabled]="!draft().metric.trim()"
              [loading]="saving()"
            >
              {{ 'aiGovernance.monitoring.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @if (state() === 'error') {
        <p class="text-[13px] text-fail">{{ 'aiGovernance.common.loadFailed' | transloco }}</p>
      } @else if (state() === 'ready' && entries().length === 0) {
        <p class="text-[13px] text-fg-muted">{{ 'aiGovernance.monitoring.empty' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border" data-testid="monitoring-list">
          @for (e of entries(); track e.id) {
            <li class="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13.5px] font-semibold text-fg">
                  {{ e.metric }}
                  <span class="ml-1 text-[12px] font-normal text-fg-subtle">{{
                    kindKey(e.kind) | transloco
                  }}</span>
                </p>
                <p class="text-[12px] text-fg-muted">
                  @if (e.value !== null) {
                    {{
                      'aiGovernance.monitoring.valueLine'
                        | transloco: { value: (e.value | localNumber) }
                    }}
                  }
                  @if (e.threshold !== null) {
                    ·
                    {{
                      'aiGovernance.monitoring.thresholdLine'
                        | transloco: { value: (e.threshold | localNumber) }
                    }}
                  }
                  · {{ e.measured_at | localDate }}
                  @if (e.recorded_by) {
                    · {{ e.recorded_by.name }}
                  }
                </p>
                @if (e.notes) {
                  <p class="mt-0.5 text-[12.5px] text-fg">{{ e.notes }}</p>
                }
              </div>
              <div class="flex items-center gap-2">
                <app-badge [tone]="tone(e.result)">{{ resultKey(e.result) | transloco }}</app-badge>
                @if (canWrite()) {
                  <button
                    type="button"
                    class="rounded-[8px] p-1 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.aria-label]="
                      'aiGovernance.monitoring.delete' | transloco: { metric: e.metric }
                    "
                    (click)="pendingDelete.set(e)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                }
              </div>
            </li>
          }
        </ul>
        @if (total() > pageSize) {
          <div class="mt-2">
            <app-pager
              [offset]="offset()"
              [pageSize]="pageSize"
              [count]="entries().length"
              [total]="total()"
              (pageChange)="offset.set($event)"
            />
          </div>
        }
      }
    </app-card>

    <app-confirm-dialog
      [open]="!!pendingDelete()"
      [title]="'aiGovernance.monitoring.deleteTitle' | transloco"
      [message]="
        'aiGovernance.monitoring.deleteMessage'
          | transloco: { metric: pendingDelete()?.metric ?? '' }
      "
      [confirmLabel]="'aiGovernance.common.delete' | transloco"
      [cancelLabel]="'aiGovernance.common.cancel' | transloco"
      [busy]="deleting()"
      (confirmed)="remove()"
      (cancelled)="pendingDelete.set(null)"
    />
  `,
})
export class AiSystemMonitoring {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly systemId = input.required<string>();
  readonly canWrite = input(false);
  /** An entry was recorded or removed (the page may refresh its activity). */
  readonly changed = output<void>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly kinds = MONITORING_KINDS;
  protected readonly results = MONITORING_RESULTS;
  protected readonly kindKey = monitoringKindKey;
  protected readonly resultKey = monitoringResultKey;
  protected readonly tone = monitoringTone;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly entries = signal<readonly MonitoringEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly formOpen = signal(false);
  protected readonly draft = signal<Draft>(emptyDraft());
  protected readonly saving = signal(false);
  protected readonly pendingDelete = signal<MonitoringEntry | null>(null);
  protected readonly deleting = signal(false);
  private readonly reload = signal(0);

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.systemId();
      const offset = this.offset();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.listMonitoring(orgId, id, { limit: PAGE_SIZE, offset }).subscribe({
          next: (page) => {
            this.entries.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected close(): void {
    this.formOpen.set(false);
    this.draft.set(emptyDraft());
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d.metric.trim() || this.saving()) {
      return;
    }
    const body: MonitoringCreate = {
      kind: d.kind,
      metric: d.metric.trim(),
      value: parseNumber(d.value),
      threshold: parseNumber(d.threshold),
      result: d.result,
      notes: d.notes.trim() || null,
      measured_at: d.measured ? startOfDay(d.measured) : null,
    };
    this.saving.set(true);
    this.api.addMonitoring(orgId, this.systemId(), body).subscribe({
      next: (entry) => {
        this.saving.set(false);
        this.close();
        this.notifications.success(
          entry.result === 'fail'
            ? 'aiGovernance.monitoring.savedAlert'
            : 'aiGovernance.monitoring.saved',
        );
        this.offset.set(0);
        this.reload.update((n) => n + 1);
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const entry = this.pendingDelete();
    if (!orgId || !entry) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteMonitoring(orgId, this.systemId(), entry.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.reload.update((n) => n + 1);
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
