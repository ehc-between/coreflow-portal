import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ReportingKey,
  ReportingObligation,
  ReportingUpdate,
} from '../../../core/deviations/deviation.models';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { NoticePanel } from '../../../shared/notices/notice-panel';
import {
  hoursLeft,
  isOpenObligation,
  localToUtc,
  nowLocal,
  obligationToneValue,
} from '../deviation-display';

/** One authority notification being recorded. */
export interface ReportingSave {
  readonly key: ReportingKey;
  readonly update: ReportingUpdate;
}

/**
 * "Meldeplikt" (audit finding 7): the authority notifications this deviation
 * triggers, computed by the API from its standards and severity (GDPR art. 33 to
 * Datatilsynet within 72 h, NIS2 art. 23 to the national CSIRT in three steps,
 * Arbeidsmiljøloven § 5-2 to Arbeidstilsynet). Each shows its legal basis, the
 * deadline with a countdown from when the deviation was detected, and lets the
 * owner record the notification (when, reference) or why none was needed. The
 * owner also gets an urgent task until it is recorded.
 */
@Component({
  selector: 'app-deviation-reporting',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, Button, Icon, StatusBadge, NoticePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border bg-surface p-5"
      [class]="anyOverdue() ? 'border-fail/40' : anyOpen() ? 'border-warn/40' : 'border-border'"
      aria-labelledby="dev-reporting-title"
      data-testid="reporting-panel"
    >
      <div class="mb-1 flex flex-wrap items-center gap-2">
        <app-icon name="shield" [size]="17" class="text-fg-muted" />
        <h2 id="dev-reporting-title" class="font-display text-section font-bold text-fg">
          {{ 'deviations.reporting.title' | transloco }}
        </h2>
      </div>
      <p class="mb-4 text-meta text-fg-muted">{{ 'deviations.reporting.intro' | transloco }}</p>

      <ul class="flex flex-col gap-3">
        @for (o of obligations(); track o.key) {
          <li class="rounded-tile border border-border p-3.5" [attr.data-obligation]="o.key">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-ui font-semibold text-fg">
                  {{ 'deviations.reporting.obligation.' + o.key | transloco }}
                </p>
                <p class="text-meta text-fg-muted">
                  {{ 'deviations.reporting.authority.' + o.authority | transloco }} ·
                  {{ 'deviations.reporting.article.' + o.key | transloco }}
                </p>
              </div>
              <app-status-badge
                meaning="lifecycle"
                [value]="toneValue(o.status)"
                [labelKey]="'deviations.reporting.status.' + o.status"
              />
            </div>

            @if (isOpen(o)) {
              <p
                class="mt-2 flex flex-wrap items-center gap-1.5 text-ui"
                [class]="o.status === 'overdue' ? 'font-semibold text-fail-ink' : 'text-fg'"
                data-testid="reporting-deadline"
              >
                <app-icon name="clock" [size]="14" />
                @if (o.immediately) {
                  {{ 'deviations.reporting.immediately' | transloco }}
                }
                @if (o.deadline_at) {
                  {{
                    'deviations.reporting.deadline'
                      | transloco: { date: (o.deadline_at | localDate) }
                  }}
                  @if (left(o); as h) {
                    ·
                    {{
                      (h.value < 0
                        ? 'deviations.reporting.lateBy'
                        : 'deviations.reporting.hoursLeft'
                      ) | transloco: { hours: h.abs }
                    }}
                  }
                }
              </p>
              <p class="mt-1 text-meta text-fg-muted">
                {{
                  (o.clock_source === 'detected_at'
                    ? 'deviations.reporting.clockDetected'
                    : 'deviations.reporting.clockRaised'
                  ) | transloco: { date: (o.clock_started_at | localDate) }
                }}
              </p>
            } @else if (o.status === 'notified') {
              <p class="mt-2 text-ui text-fg">
                {{
                  'deviations.reporting.notifiedOn'
                    | transloco: { date: (o.notified_at | localDate) }
                }}
                @if (o.reference) {
                  · {{ 'deviations.reporting.referenceShown' | transloco: { ref: o.reference } }}
                }
              </p>
            } @else if (o.status === 'not_required') {
              <p class="mt-2 text-ui whitespace-pre-line text-fg">
                {{
                  'deviations.reporting.notRequiredBecause'
                    | transloco: { reason: o.not_required_reason ?? '' }
                }}
              </p>
            }

            @if (o.task_id && isOpen(o)) {
              <a
                [routerLink]="['/tasks', o.task_id]"
                class="mt-1 inline-flex text-meta font-semibold text-accent hover:underline"
                >{{ 'deviations.reporting.openTask' | transloco }}</a
              >
            }

            @if (canEdit()) {
              @if (editing() === o.key) {
                <div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                  @if (mode() === 'notified') {
                    <div class="grid gap-3 sm:grid-cols-2">
                      <div class="flex flex-col gap-1">
                        <label
                          [for]="'rep-at-' + o.key"
                          class="text-meta font-semibold text-fg-muted"
                          >{{ 'deviations.reporting.notifiedAt' | transloco }}</label
                        >
                        <input
                          [id]="'rep-at-' + o.key"
                          type="datetime-local"
                          [max]="max"
                          [value]="notifiedAt()"
                          (change)="notifiedAt.set($any($event.target).value)"
                          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                        />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label
                          [for]="'rep-ref-' + o.key"
                          class="text-meta font-semibold text-fg-muted"
                          >{{ 'deviations.reporting.reference' | transloco }}</label
                        >
                        <input
                          [id]="'rep-ref-' + o.key"
                          type="text"
                          maxlength="200"
                          autocomplete="off"
                          [placeholder]="'deviations.reporting.referencePlaceholder' | transloco"
                          [value]="reference()"
                          (input)="reference.set($any($event.target).value)"
                          class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  } @else {
                    <div class="flex flex-col gap-1">
                      <label
                        [for]="'rep-why-' + o.key"
                        class="text-meta font-semibold text-fg-muted"
                        >{{ 'deviations.reporting.notRequiredReason' | transloco }}</label
                      >
                      <textarea
                        [id]="'rep-why-' + o.key"
                        rows="2"
                        maxlength="2000"
                        [placeholder]="
                          'deviations.reporting.notRequiredPlaceholder.' + o.key | transloco
                        "
                        [value]="reason()"
                        (input)="reason.set($any($event.target).value)"
                        class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
                      ></textarea>
                    </div>
                  }
                  <div class="flex flex-wrap justify-end gap-2">
                    <app-button variant="ghost" size="sm" (click)="cancel()">
                      {{ 'deviations.actions.cancel' | transloco }}
                    </app-button>
                    <app-button
                      size="sm"
                      [loading]="busy() === o.key"
                      [disabled]="!canSubmit()"
                      (click)="submit(o)"
                    >
                      {{ 'deviations.reporting.save' | transloco }}
                    </app-button>
                  </div>
                </div>
              } @else {
                <div class="mt-3 flex flex-wrap gap-2">
                  @if (isOpen(o)) {
                    <app-button size="sm" (click)="start(o, 'notified')">
                      <app-icon name="check" [size]="14" />
                      {{ 'deviations.reporting.recordNotified' | transloco }}
                    </app-button>
                    <app-button variant="secondary" size="sm" (click)="start(o, 'not_required')">
                      {{ 'deviations.reporting.recordNotRequired' | transloco }}
                    </app-button>
                  } @else if (o.status !== 'closed_unreported') {
                    <app-button variant="ghost" size="sm" (click)="reopen(o)">
                      {{ 'deviations.reporting.undo' | transloco }}
                    </app-button>
                  }
                </div>
              }
            }
          </li>
        }
      </ul>
    </section>
    @if (deviationId(); as id) {
      @if (hasNis2()) {
        <div class="mt-4">
          <app-notice-panel
            [path]="'deviations/' + id + '/notices'"
            [entityId]="id"
            [version]="version()"
            [canSave]="canEdit()"
          />
        </div>
      }
    }
  `,
})
export class DeviationReporting {
  readonly obligations = input.required<readonly ReportingObligation[]>();
  readonly canEdit = input(false);
  /** The obligation being saved (spinner). */
  readonly busy = input<ReportingKey | null>(null);
  /** U13: the deviation, for the NIS2 report drafts (Varsling) under the obligations. */
  readonly deviationId = input<string | null>(null);
  /** The deviation itself: a new copy (after a save) reloads the drafts. */
  readonly version = input<unknown>(null);
  readonly save = output<ReportingSave>();

  protected readonly max = nowLocal();
  protected readonly editing = signal<ReportingKey | null>(null);
  protected readonly mode = signal<'notified' | 'not_required'>('notified');
  protected readonly notifiedAt = signal('');
  protected readonly reference = signal('');
  protected readonly reason = signal('');

  protected readonly anyOpen = computed(() => this.obligations().some(isOpenObligation));
  protected readonly hasNis2 = computed(() =>
    this.obligations().some((o) => o.key.startsWith('nis2_')),
  );
  protected readonly anyOverdue = computed(() =>
    this.obligations().some((o) => o.status === 'overdue'),
  );
  protected readonly canSubmit = computed(() =>
    this.mode() === 'notified' ? !!localToUtc(this.notifiedAt()) : !!this.reason().trim(),
  );

  protected readonly isOpen = isOpenObligation;
  protected readonly toneValue = obligationToneValue;

  protected left(o: ReportingObligation): { value: number; abs: number } | null {
    const value = hoursLeft(o);
    return value === null ? null : { value, abs: Math.abs(value) };
  }

  protected start(o: ReportingObligation, mode: 'notified' | 'not_required'): void {
    this.mode.set(mode);
    this.notifiedAt.set(mode === 'notified' ? nowLocal() : '');
    this.reference.set('');
    this.reason.set('');
    this.editing.set(o.key);
  }

  protected cancel(): void {
    this.editing.set(null);
  }

  protected submit(o: ReportingObligation): void {
    if (!this.canSubmit()) {
      return;
    }
    const update: ReportingUpdate =
      this.mode() === 'notified'
        ? {
            notified_at: localToUtc(this.notifiedAt()),
            reference: this.reference().trim() || null,
            not_required_reason: null,
          }
        : { not_required_reason: this.reason().trim(), notified_at: null, reference: null };
    this.save.emit({ key: o.key, update });
    this.editing.set(null);
  }

  /** Clear what was recorded (a mistake), so the obligation is open again. */
  protected reopen(o: ReportingObligation): void {
    this.save.emit({
      key: o.key,
      update: { notified_at: null, reference: null, not_required_reason: null },
    });
  }
}
