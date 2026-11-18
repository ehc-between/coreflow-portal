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
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Pager } from '../../../shared/ui/pager/pager';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import {
  MONITORING_KINDS,
  MONITORING_RESULTS,
  MonitoringCreate,
  MonitoringEntry,
  MonitoringKind,
  MonitoringMetric,
  MonitoringResult,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_SCOPE,
  monitoringKindKey,
  monitoringResultKey,
  monitoringValue,
} from '../data/ai-governance-display';

const PAGE_SIZE = 10;

interface Draft {
  kind: MonitoringKind;
  metric: string;
  value: string;
  threshold: string;
  /** '' = judge it from the metric definition (else "information"). */
  result: MonitoringResult | '';
  notes: string;
  measured: string;
}

const emptyDraft = (): Draft => ({
  kind: 'accuracy',
  metric: '',
  value: '',
  threshold: '',
  result: '',
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
 * the post-market monitoring plan, Art. 72; ISO/IEC 42001 9.1): the system's
 * defined metrics (with thresholds) and the measurements log with a quick entry
 * form. Picking a defined metric fills in its kind and threshold; the result is
 * left empty so the server judges it (pass / fail against the definition, else
 * information). A failed measurement offers to report an AI incident.
 */
@Component({
  selector: 'app-ai-system-monitoring',
  imports: [
    TranslocoPipe,
    FieldHelp,
    LocalDatePipe,
    LocalNumberPipe,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Pager,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card data-testid="system-monitoring">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-section font-bold text-fg">
          {{ 'aiGovernance.monitoring.title' | transloco }}
          <app-field-help
            [scope]="scope"
            page="systemDetail"
            field="monitoring"
            [label]="'aiGovernance.monitoring.title' | transloco"
          />
        </h2>
        @if (canWrite() && !formOpen()) {
          <app-button size="sm" variant="secondary" (click)="formOpen.set(true)">
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.monitoring.add' | transloco }}
          </app-button>
        }
      </div>

      @if (metrics().length) {
        <div class="mb-3">
          <h3 class="mb-1 text-ui font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.defined' | transloco }}
          </h3>
          <ul class="flex flex-wrap gap-1.5" data-testid="monitoring-metrics">
            @for (m of metrics(); track m.key ?? m.metric) {
              <li
                class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-meta text-fg"
              >
                {{ m.metric }}
                @if (m.threshold !== null) {
                  <span class="text-fg-muted">
                    ·
                    {{
                      (m.direction === 'max'
                        ? 'aiGovernance.monitoring.atMost'
                        : 'aiGovernance.monitoring.atLeast'
                      ) | transloco: { value: (m.threshold | localNumber), unit: m.unit ?? '' }
                    }}
                  </span>
                }
              </li>
            }
          </ul>
        </div>
      } @else if (highRisk() && canWrite()) {
        <p class="mb-3 text-meta text-fg-muted">
          {{ 'aiGovernance.monitoring.noMetrics' | transloco }}
        </p>
      }

      @if (failed(); as f) {
        <app-alert tone="error" class="mb-3">
          <span class="flex flex-wrap items-center gap-2">
            {{ 'aiGovernance.monitoring.failedAlert' | transloco: { metric: f.metric } }}
            @if (canWrite()) {
              <app-button
                size="sm"
                variant="secondary"
                (click)="reportIncident.emit(); failed.set(null)"
              >
                {{ 'aiGovernance.monitoring.reportIncident' | transloco }}
              </app-button>
            }
          </span>
        </app-alert>
      }

      @if (formOpen()) {
        <form
          class="mb-4 grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-3"
          (submit)="$event.preventDefault(); save()"
          (keydown.escape)="close()"
          data-testid="monitoring-form"
        >
          @if (metrics().length) {
            <label
              class="flex flex-col gap-1 text-meta font-semibold text-fg-muted sm:col-span-2 lg:col-span-3"
            >
              {{ 'aiGovernance.monitoring.pickMetric' | transloco }}
              <select
                class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
                (change)="pickMetric($any($event.target).value)"
                data-testid="monitoring-pick"
              >
                <option value="">{{ 'aiGovernance.monitoring.otherMetric' | transloco }}</option>
                @for (m of metrics(); track m.key ?? m.metric; let i = $index) {
                  <option [value]="i">{{ m.metric }}</option>
                }
              </select>
            </label>
          }
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.kind' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
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
            class="flex flex-col gap-1 text-meta font-semibold text-fg-muted sm:col-span-1 lg:col-span-2"
          >
            {{ 'aiGovernance.monitoring.metric' | transloco }}
            <input
              type="text"
              required
              maxlength="120"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
              [placeholder]="'aiGovernance.monitoring.metricPlaceholder' | transloco"
              [value]="draft().metric"
              (input)="patch({ metric: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.value' | transloco }}
            <input
              type="text"
              inputmode="decimal"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
              [value]="draft().value"
              (input)="patch({ value: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.threshold' | transloco }}
            <input
              type="text"
              inputmode="decimal"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
              [value]="draft().threshold"
              (input)="patch({ threshold: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.result' | transloco }}
            <select
              class="h-9 rounded-tile border border-border bg-bg px-2 text-ui font-normal text-fg"
              (change)="patch({ result: $any($event.target).value })"
              data-testid="monitoring-result"
            >
              <option value="" [selected]="draft().result === ''">
                {{ 'aiGovernance.monitoring.resultAuto' | transloco }}
              </option>
              @for (r of results; track r) {
                <option [value]="r" [selected]="draft().result === r">
                  {{ resultKey(r) | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted">
            {{ 'aiGovernance.monitoring.measuredAt' | transloco }}
            <input
              type="date"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
              [value]="draft().measured"
              (input)="patch({ measured: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-meta font-semibold text-fg-muted sm:col-span-2">
            {{ 'aiGovernance.monitoring.notes' | transloco }}
            <input
              type="text"
              maxlength="4000"
              class="h-9 rounded-tile border border-border bg-bg px-3 text-ui font-normal text-fg"
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
        <p class="text-ui text-fail-ink">{{ 'aiGovernance.common.loadFailed' | transloco }}</p>
      } @else if (state() === 'ready' && entries().length === 0) {
        <p class="text-ui text-fg-muted">{{ 'aiGovernance.monitoring.empty' | transloco }}</p>
      } @else {
        <ul class="divide-y divide-border" data-testid="monitoring-list">
          @for (e of entries(); track e.id) {
            <li class="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-body font-semibold text-fg">
                  {{ e.metric }}
                  <span class="ml-1 text-meta font-normal text-fg-subtle">{{
                    kindKey(e.kind) | transloco
                  }}</span>
                </p>
                <p class="text-meta text-fg-muted">
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
                  · {{ e.measured_at | localDate: 'mediumDate' }}
                  @if (e.recorded_by) {
                    · {{ e.recorded_by.name }}
                  }
                </p>
                @if (e.notes) {
                  <p class="mt-0.5 text-ui text-fg">{{ e.notes }}</p>
                }
              </div>
              <div class="flex items-center gap-2">
                <app-status-badge
                  meaning="compliance"
                  [value]="resultValue(e.result)"
                  [labelKey]="resultKey(e.result)"
                />
                @if (canWrite()) {
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:text-fail-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
      confirmVariant="danger"
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
  /** The system's metric definitions (threshold + direction). */
  readonly metrics = input<readonly MonitoringMetric[]>([]);
  readonly highRisk = input(false);
  /** An entry was recorded or removed (the page may refresh its activity). */
  readonly changed = output<void>();
  /** "Meld som KI-hendelse" after a failed measurement. */
  readonly reportIncident = output<void>();

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly kinds = MONITORING_KINDS;
  protected readonly results = MONITORING_RESULTS;
  protected readonly kindKey = monitoringKindKey;
  protected readonly resultKey = monitoringResultKey;
  protected readonly resultValue = monitoringValue;
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
  /** The last measurement recorded here that did not pass. */
  protected readonly failed = signal<MonitoringEntry | null>(null);
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

  protected pickMetric(index: string): void {
    const m = index === '' ? null : this.metrics()[Number(index)];
    if (!m) {
      this.patch({ metric: '', threshold: '' });
      return;
    }
    this.patch({
      metric: m.metric,
      kind: m.kind,
      threshold: m.threshold === null ? '' : String(m.threshold),
    });
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
      ...(d.result ? { result: d.result } : {}),
      notes: d.notes.trim() || null,
      measured_at: d.measured ? startOfDay(d.measured) : null,
    };
    this.saving.set(true);
    this.api.addMonitoring(orgId, this.systemId(), body).subscribe({
      next: (entry) => {
        this.saving.set(false);
        this.close();
        this.failed.set(entry.result === 'fail' ? entry : null);
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
