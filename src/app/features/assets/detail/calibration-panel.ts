import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Attachments } from '../../../shared/attachments/attachments';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  addMonths,
  blankToNull,
  calibrationTone,
  dayOrNull,
  resultTone,
} from '../data/asset-display';
import { assetErrorKey } from '../data/asset-errors';
import {
  AssetDetail,
  CALIBRATION_RESULTS,
  Calibration,
  CalibrationRequest,
  CalibrationResult,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';

interface CalibrationDraft {
  performed_on: string;
  result: CalibrationResult;
  performed_by: string;
  certificate_number: string;
  notes: string;
  impact_assessment: string;
  next_due_on: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const blankDraft = (): CalibrationDraft => ({
  performed_on: today(),
  result: 'pass',
  performed_by: '',
  certificate_number: '',
  notes: '',
  impact_assessment: '',
  next_due_on: '',
});

/** The request body of a calibration draft (an empty next due date lets the backend use the interval). */
export function calibrationBody(d: CalibrationDraft): CalibrationRequest {
  return {
    performed_on: d.performed_on,
    result: d.result,
    performed_by: blankToNull(d.performed_by),
    certificate_number: blankToNull(d.certificate_number),
    notes: blankToNull(d.notes),
    impact_assessment: blankToNull(d.impact_assessment),
    next_due_on: dayOrNull(d.next_due_on),
  };
}

/**
 * Calibration of a measuring instrument (ISO 9001 7.1.5): the status and next due
 * date, the calibration history with results and certificates, recording a new
 * calibration (the next due date defaults to the date plus the interval) and the
 * impact assessment a failed calibration needs (were earlier results affected?).
 */
@Component({
  selector: 'app-asset-calibration-panel',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    Attachments,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FieldHelp,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-[15px] font-bold text-fg">
          {{ 'assets.calibration.title' | transloco }}
        </h2>
        @if (canWrite() && !formOpen()) {
          <app-button size="sm" (click)="openForm()">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.calibration.record' | transloco }}
          </app-button>
        }
      </div>

      <dl class="mb-4 grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-3">
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'assets.fields.calibrationStatus' | transloco }}
          </dt>
          <dd>
            <app-badge [tone]="statusTone(asset().calibration_status)">
              {{
                'assets.calibrationStatus.' + (asset().calibration_status ?? 'not_scheduled')
                  | transloco
              }}
            </app-badge>
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'assets.fields.lastCalibratedOn' | transloco }}
          </dt>
          <dd class="text-fg">
            {{ asset().last_calibrated_on ? (asset().last_calibrated_on | localDay) : '–' }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'assets.fields.nextCalibrationDue' | transloco }}
          </dt>
          <dd
            class="text-fg"
            [class.text-fail]="asset().calibration_status === 'overdue'"
            [class.font-semibold]="asset().calibration_status === 'overdue'"
          >
            {{ asset().next_calibration_due ? (asset().next_calibration_due | localDay) : '–' }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'assets.fields.calibrationInterval' | transloco }}
          </dt>
          <dd class="text-fg">
            @if (asset().calibration_interval_months; as months) {
              {{ 'assets.calibration.everyMonths' | transloco: { months } }}
            } @else {
              {{ 'assets.calibration.noInterval' | transloco }}
            }
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">
            {{ 'assets.fields.measurementRange' | transloco }}
          </dt>
          <dd class="text-fg">{{ asset().measurement_range || '–' }}</dd>
        </div>
        <div>
          <dt class="text-[12px] text-fg-muted">{{ 'assets.fields.accuracy' | transloco }}</dt>
          <dd class="text-fg">{{ asset().accuracy || '–' }}</dd>
        </div>
      </dl>

      @if (formOpen()) {
        <form
          class="mb-4 rounded-tile border border-border p-3"
          (submit)="$event.preventDefault(); save()"
          novalidate
          data-testid="calibration-form"
        >
          <h3 class="mb-3 text-[13.5px] font-semibold text-fg">
            {{
              (editingId() ? 'assets.calibration.editTitle' : 'assets.calibration.newTitle')
                | transloco
            }}
          </h3>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field [label]="'assets.fields.performedOn' | transloco" inputId="cal-date">
              <input
                id="cal-date"
                type="date"
                required
                [attr.aria-invalid]="showErrors() && !d().performed_on"
                [value]="d().performed_on"
                (input)="set('performed_on', $any($event.target).value)"
              />
            </app-form-field>
            <div>
              <app-field-help scope="assets" page="detail" field="calibration_result" />
              <app-form-field [label]="'assets.fields.result' | transloco" inputId="cal-result">
                <select id="cal-result" (change)="set('result', $any($event.target).value)">
                  @for (r of results; track r) {
                    <option [value]="r" [selected]="d().result === r">
                      {{ 'assets.calibrationResult.' + r | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            </div>
            <app-form-field [label]="'assets.fields.performedBy' | transloco" inputId="cal-by">
              <input
                id="cal-by"
                type="text"
                maxlength="255"
                [placeholder]="'assets.calibration.performedByPlaceholder' | transloco"
                [value]="d().performed_by"
                (input)="set('performed_by', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              [label]="'assets.fields.certificateNumber' | transloco"
              inputId="cal-cert"
            >
              <input
                id="cal-cert"
                type="text"
                maxlength="120"
                [value]="d().certificate_number"
                (input)="set('certificate_number', $any($event.target).value)"
              />
            </app-form-field>
            <div class="sm:col-span-2">
              <app-form-field [label]="'assets.fields.nextDueOn' | transloco" inputId="cal-next">
                <input
                  id="cal-next"
                  type="date"
                  aria-describedby="cal-next-hint"
                  [value]="d().next_due_on"
                  (input)="set('next_due_on', $any($event.target).value)"
                />
              </app-form-field>
              <p id="cal-next-hint" class="mt-1 text-[12px] text-fg-subtle">
                @if (defaultNextDue(); as date) {
                  {{ 'assets.calibration.nextDueDefault' | transloco: { date: (date | localDay) } }}
                } @else {
                  {{ 'assets.calibration.nextDueNoInterval' | transloco }}
                }
              </p>
            </div>
            @if (d().result === 'fail' || d().impact_assessment) {
              <div class="sm:col-span-2">
                <app-field-help scope="assets" page="detail" field="impact_assessment" />
                <app-form-field
                  [label]="'assets.fields.impactAssessment' | transloco"
                  inputId="cal-impact"
                >
                  <textarea
                    id="cal-impact"
                    rows="3"
                    maxlength="10000"
                    aria-describedby="cal-impact-hint"
                    [value]="d().impact_assessment"
                    (input)="set('impact_assessment', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <p id="cal-impact-hint" class="mt-1 text-[12px] text-fg-subtle">
                  {{ 'assets.calibration.impactHint' | transloco }}
                </p>
              </div>
            }
            <div class="sm:col-span-2">
              <app-form-field [label]="'assets.fields.notes' | transloco" inputId="cal-notes">
                <textarea
                  id="cal-notes"
                  rows="2"
                  maxlength="10000"
                  [value]="d().notes"
                  (input)="set('notes', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
          </div>
          @if (error(); as key) {
            <p class="mt-2 text-[12.5px] text-fail" role="alert">{{ key | transloco }}</p>
          }
          <div class="mt-3 flex justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="closeForm()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [loading]="busy()">
              {{ 'assets.calibration.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      <h3 class="mb-2 text-[13px] font-semibold text-fg-muted">
        {{ 'assets.calibration.history' | transloco }}
      </h3>
      @if (items().length === 0) {
        <p class="text-[13px] text-fg-subtle">{{ 'assets.calibration.none' | transloco }}</p>
      } @else {
        <ul class="flex flex-col gap-2" data-testid="calibration-rows">
          @for (c of items(); track c.id) {
            <li
              [id]="'calibration-' + c.id"
              class="rounded-tile border px-3 py-2.5"
              [class.border-accent]="c.id === highlight()"
              [class.border-border]="c.id !== highlight()"
            >
              <div class="flex flex-wrap items-center gap-2 text-[13px]">
                <app-badge [tone]="resTone(c.result)">
                  {{ 'assets.calibrationResult.' + c.result | transloco }}
                </app-badge>
                <span class="font-semibold text-fg">{{ c.performed_on | localDay }}</span>
                @if (c.performed_by) {
                  <span class="text-fg-muted">{{ c.performed_by }}</span>
                }
                @if (c.certificate_number) {
                  <span class="text-fg-muted">
                    {{
                      'assets.calibration.certificate' | transloco: { number: c.certificate_number }
                    }}
                  </span>
                }
                @if (c.next_due_on) {
                  <span class="text-fg-subtle">
                    {{
                      'assets.calibration.nextDue' | transloco: { date: (c.next_due_on | localDay) }
                    }}
                  </span>
                }
                @if (c.needs_impact_assessment) {
                  <app-badge tone="fail">
                    <app-icon name="alert" [size]="12" />
                    {{ 'assets.calibration.needsImpact' | transloco }}
                  </app-badge>
                }
                <span class="ml-auto flex gap-1">
                  <app-button
                    variant="ghost"
                    size="sm"
                    [attr.aria-expanded]="openFiles() === c.id"
                    (click)="toggleFiles(c.id)"
                  >
                    {{ 'assets.calibration.certificates' | transloco }}
                  </app-button>
                  @if (canWrite()) {
                    <app-button variant="ghost" size="sm" (click)="edit(c)">
                      {{ 'assets.common.edit' | transloco }}
                    </app-button>
                    <app-button
                      variant="ghost"
                      size="sm"
                      [attr.aria-label]="
                        'assets.calibration.deleteLabel'
                          | transloco: { date: (c.performed_on | localDay) }
                      "
                      (click)="toDelete.set(c)"
                    >
                      <app-icon name="trash" [size]="14" />
                    </app-button>
                  }
                </span>
              </div>
              @if (c.impact_assessment) {
                <p class="mt-1.5 text-[12.5px] text-fg-muted">
                  <span class="font-semibold"
                    >{{ 'assets.fields.impactAssessment' | transloco }}:</span
                  >
                  {{ c.impact_assessment }}
                </p>
              }
              @if (c.notes) {
                <p class="mt-1 text-[12.5px] text-fg-muted">{{ c.notes }}</p>
              }
              @if (openFiles() === c.id) {
                <div class="mt-2">
                  <app-attachments
                    entityType="calibration"
                    [entityId]="c.id"
                    [canEdit]="canWrite()"
                    [compact]="true"
                  />
                </div>
              }
            </li>
          }
        </ul>
      }
    </app-card>

    <app-confirm-dialog
      [open]="!!toDelete()"
      [title]="'assets.calibration.deleteTitle' | transloco"
      [message]="'assets.calibration.deleteMessage' | transloco"
      [confirmLabel]="'assets.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="toDelete.set(null)"
    />
  `,
})
export class AssetCalibrationPanel {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly asset = input.required<AssetDetail>();
  readonly canWrite = input(false);
  /** A calibration to highlight and scroll to (`?calibration=<id>`). */
  readonly highlight = input<string | null>(null);
  readonly changed = output<void>();

  protected readonly results = CALIBRATION_RESULTS;
  protected readonly statusTone = calibrationTone;
  protected readonly resTone = resultTone;

  protected readonly items = signal<readonly Calibration[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly d = signal<CalibrationDraft>(blankDraft());
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toDelete = signal<Calibration | null>(null);
  protected readonly openFiles = signal<string | null>(null);

  protected readonly defaultNextDue = computed(() => {
    const months = this.asset().calibration_interval_months;
    return months ? addMonths(this.d().performed_on, months) : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const asset = this.asset();
      untracked(() => this.load(orgId, asset.id));
    });
  }

  protected set<K extends keyof CalibrationDraft>(key: K, value: CalibrationDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected openForm(): void {
    this.editingId.set(null);
    this.d.set(blankDraft());
    this.error.set(null);
    this.showErrors.set(false);
    this.formOpen.set(true);
  }

  protected edit(c: Calibration): void {
    this.editingId.set(c.id);
    this.d.set({
      performed_on: c.performed_on,
      result: c.result,
      performed_by: c.performed_by ?? '',
      certificate_number: c.certificate_number ?? '',
      notes: c.notes ?? '',
      impact_assessment: c.impact_assessment ?? '',
      next_due_on: c.next_due_on ?? '',
    });
    this.error.set(null);
    this.showErrors.set(false);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  protected toggleFiles(id: string): void {
    this.openFiles.update((open) => (open === id ? null : id));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.d();
    if (!orgId || this.busy()) {
      return;
    }
    if (!dayOrNull(d.performed_on)) {
      this.showErrors.set(true);
      this.error.set('assets.calibration.dateRequired');
      return;
    }
    const editing = this.editingId();
    const body = calibrationBody(d);
    this.busy.set(true);
    this.error.set(null);
    const call = editing
      ? this.api.updateCalibration(orgId, editing, body)
      : this.api.addCalibration(orgId, this.asset().id, body);
    call.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.closeForm();
        this.notifications.success(
          c.result === 'fail' ? 'assets.calibration.savedFailed' : 'assets.calibration.saved',
        );
        this.load(orgId, this.asset().id);
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(assetErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.toDelete();
    if (!orgId || !target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteCalibration(orgId, target.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toDelete.set(null);
        this.notifications.success('assets.calibration.deleted');
        this.load(orgId, this.asset().id);
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toDelete.set(null);
        this.notifications.error(assetErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, assetId: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.request = this.api.listCalibrations(orgId, assetId).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.scrollToHighlight();
      },
      error: () => this.items.set([]),
    });
  }

  private scrollToHighlight(): void {
    const id = this.highlight();
    if (!id) {
      return;
    }
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>(
        `#calibration-${CSS.escape(id)}`,
      );
      el?.scrollIntoView?.({ block: 'center' });
    });
  }
}
