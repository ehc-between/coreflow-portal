import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { PrivacyApi } from './data/privacy-api';
import { DISPOSAL_METHODS, RetentionExecution, RetentionSchedule } from './data/privacy.models';
import { fromDateTimeInput, nowDateTimeInput } from './data/privacy-dates';
import { privacyError } from './data/privacy-errors';
import { PrivacyRefsService } from './data/privacy-refs.service';

/**
 * Proof that the retention rule is carried out (Art. 5(1)(e), ISO 27001 A.8.10): when
 * the deletion last ran and when it is due next, "Registrer gjennomført sletting" with
 * date, method, number of records and a reference to the evidence, and the
 * append-only log of every run. `openForm` opens the form at once (the overdue links
 * on the home page and in the gaps arrive with `?execute=1`).
 */
@Component({
  selector: 'app-privacy-retention-runs',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = schedule();
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 font-display text-card font-bold text-fg">
          <app-icon name="clock" [size]="16" />
          {{ 'privacy.retention.runsTitle' | transloco }}
        </h2>
        @if (s.execution_overdue) {
          <app-status-badge
            meaning="lifecycle"
            value="overdue"
            labelKey="privacy.retention.deletionOverdue"
          />
        }
      </div>
      <dl class="grid grid-cols-1 gap-3 text-ui sm:grid-cols-3" data-testid="retention-runs-facts">
        <div>
          <dt class="text-meta font-semibold text-fg-muted">
            {{ 'privacy.fields.last_executed_at' | transloco }}
          </dt>
          <dd class="mt-1 text-fg">
            @if (s.last_executed_at) {
              {{ s.last_executed_at | localDate }}
            } @else {
              <span class="text-fg-subtle">{{ 'privacy.retention.neverRun' | transloco }}</span>
            }
          </dd>
        </div>
        <div>
          <dt class="text-meta font-semibold text-fg-muted">
            {{ 'privacy.fields.next_execution_due_at' | transloco }}
          </dt>
          <dd
            class="mt-1"
            [class.text-warn-ink]="s.execution_overdue"
            [class.text-fg]="!s.execution_overdue"
          >
            @if (s.next_execution_due_at) {
              {{ s.next_execution_due_at | localDay: 'mediumDate' }}
            } @else {
              <span class="text-fg-subtle">{{ 'privacy.retention.noSchedule' | transloco }}</span>
            }
          </dd>
        </div>
        <div>
          <dt class="text-meta font-semibold text-fg-muted">
            {{ 'privacy.fields.execution_interval_months' | transloco }}
          </dt>
          <dd class="mt-1 text-fg">
            @if (s.execution_interval_months) {
              {{
                'privacy.retention.everyMonths' | transloco: { count: s.execution_interval_months }
              }}
            } @else {
              <span class="text-fg-subtle">{{ 'common.empty.notSet' | transloco }}</span>
            }
          </dd>
        </div>
      </dl>

      @if (canWrite()) {
        @if (s.status !== 'active') {
          <p class="mt-3 text-meta text-fg-subtle">
            {{ 'privacy.retention.activateFirst' | transloco }}
          </p>
        } @else if (!formOpen()) {
          <div class="mt-3">
            <app-button size="sm" (click)="open()" data-testid="retention-execute">
              <app-icon name="check" [size]="14" />
              {{ 'privacy.retention.execute' | transloco }}
            </app-button>
          </div>
        } @else {
          <form
            class="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2"
            (submit)="$event.preventDefault(); save()"
            data-testid="retention-execute-form"
          >
            <app-form-field [label]="'privacy.fields.executed_at' | transloco" inputId="cf-run-at">
              <input
                id="cf-run-at"
                type="datetime-local"
                [value]="executedAt()"
                (input)="executedAt.set($any($event.target).value)"
              />
            </app-form-field>
            <app-form-field [label]="'privacy.fields.method' | transloco" inputId="cf-run-method">
              <select id="cf-run-method" (change)="method.set($any($event.target).value)">
                @for (m of methods; track m) {
                  <option [value]="m" [selected]="method() === m">
                    {{ 'privacy.options.disposal.' + m | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field
              [label]="'privacy.fields.records_affected' | transloco"
              inputId="cf-run-count"
            >
              <input
                id="cf-run-count"
                type="number"
                min="0"
                [value]="count()"
                (input)="count.set($any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              [label]="'privacy.fields.evidence_reference' | transloco"
              inputId="cf-run-evidence"
            >
              <input
                id="cf-run-evidence"
                type="text"
                maxlength="255"
                [value]="evidence()"
                (input)="evidence.set($any($event.target).value)"
                [placeholder]="'privacy.retention.evidencePlaceholder' | transloco"
              />
            </app-form-field>
            <div class="sm:col-span-2">
              <app-form-field [label]="'privacy.fields.notes' | transloco" inputId="cf-run-notes">
                <textarea
                  id="cf-run-notes"
                  rows="2"
                  maxlength="10000"
                  [value]="notes()"
                  (input)="notes.set($any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
            @if (error(); as e) {
              <app-alert tone="error" class="sm:col-span-2">{{ e | transloco }}</app-alert>
            }
            <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <app-button variant="secondary" size="sm" (click)="formOpen.set(false)">
                {{ 'privacy.common.cancel' | transloco }}
              </app-button>
              <app-button
                type="submit"
                size="sm"
                [loading]="busy()"
                data-testid="retention-execute-save"
              >
                {{ 'privacy.retention.executeSave' | transloco }}
              </app-button>
            </div>
          </form>
        }
      }

      <h3 class="mt-5 mb-2 text-ui font-semibold text-fg">
        {{ 'privacy.retention.logTitle' | transloco }}
      </h3>
      @if (runs().length === 0) {
        <p class="text-meta text-fg-subtle" data-testid="retention-log-empty">
          {{ 'privacy.retention.logEmpty' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col divide-y divide-border" data-testid="retention-log">
          @for (run of runs(); track run.id) {
            <li class="py-2 text-ui">
              <p class="flex flex-wrap items-center gap-x-2 text-fg">
                <span class="font-semibold">{{ run.executed_at | localDate }}</span>
                <span class="text-fg-muted"
                  >· {{ 'privacy.options.disposal.' + run.method | transloco }}</span
                >
                @if (run.records_affected !== null) {
                  <span class="text-fg-muted">
                    ·
                    {{
                      'privacy.retention.recordsAffected'
                        | transloco: { count: run.records_affected }
                    }}</span
                  >
                }
                @if (userName(run.executed_by); as name) {
                  <span class="text-fg-subtle">· {{ name }}</span>
                }
              </p>
              @if (run.evidence_reference) {
                <p class="text-meta text-fg-muted">
                  {{
                    'privacy.retention.evidenceShown' | transloco: { ref: run.evidence_reference }
                  }}
                </p>
              }
              @if (run.notes) {
                <p class="text-meta whitespace-pre-line text-fg-muted">{{ run.notes }}</p>
              }
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class RetentionRuns {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notify = inject(NotificationService);
  private readonly refs = inject(PrivacyRefsService);

  readonly schedule = input.required<RetentionSchedule>();
  readonly canWrite = input(false);
  /** Open the "carried out" form on arrival (`?execute=1`). */
  readonly openForm = input(false);
  /** A run was logged: the parent reloads the rule (last / next run). */
  readonly logged = output<void>();

  protected readonly methods = DISPOSAL_METHODS;
  protected readonly runs = signal<readonly RetentionExecution[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly executedAt = signal(nowDateTimeInput());
  protected readonly method = signal<string>('delete');
  protected readonly count = signal('');
  protected readonly evidence = signal('');
  protected readonly notes = signal('');

  private readonly scheduleId = computed(() => this.schedule().id);
  private sub = new Subscription();
  private autoOpened = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.scheduleId();
      untracked(() => this.load(orgId, id));
    });
    effect(() => {
      if (
        this.openForm() &&
        this.canWrite() &&
        this.schedule().status === 'active' &&
        !this.autoOpened
      ) {
        this.autoOpened = true;
        untracked(() => this.open());
      }
    });
  }

  protected userName(id: string | null): string | null {
    return this.refs.userName(id);
  }

  protected open(): void {
    this.executedAt.set(nowDateTimeInput());
    this.method.set(this.schedule().disposal_method || 'delete');
    this.count.set('');
    this.evidence.set('');
    this.notes.set('');
    this.error.set(null);
    this.formOpen.set(true);
    queueMicrotask(() => document.getElementById('cf-run-at')?.focus());
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const count = this.count().trim();
    this.busy.set(true);
    this.error.set(null);
    this.api
      .logExecution(orgId, this.schedule().id, {
        executed_at: fromDateTimeInput(this.executedAt()),
        method: this.method() || null,
        records_affected:
          count && Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : null,
        evidence_reference: this.evidence().trim() || null,
        notes: this.notes().trim() || null,
      })
      .subscribe({
        next: (run) => {
          this.busy.set(false);
          this.formOpen.set(false);
          this.runs.update((list) => [run, ...list]);
          this.notify.success('privacy.notices.executionLogged', { code: this.schedule().code });
          this.logged.emit();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(privacyError(err).key);
        },
      });
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.executions(orgId, id).subscribe({
      next: (res) => this.runs.set(res.items),
      error: () => this.runs.set([]),
    });
  }
}
