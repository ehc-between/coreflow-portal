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
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Attachments } from '../../../shared/attachments/attachments';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  addMonths,
  blankToNull,
  calibrationBadge,
  dayOrNull,
  resultBadge,
} from '../data/asset-display';
import { assetErrorKey } from '../data/asset-errors';
import {
  AssetDetail,
  CALIBRATION_RESULTS,
  CALIBRATION_TRACE_FIELDS,
  Calibration,
  CalibrationRequest,
  CalibrationResult,
  CalibrationTrace,
} from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { AssetSupplierSelect, SupplierOptionsService } from '../shared/supplier-select';

type TraceField = (typeof CALIBRATION_TRACE_FIELDS)[number];

export interface CalibrationDraft {
  performed_on: string;
  result: CalibrationResult;
  performed_by: string;
  supplier_id: string;
  certificate_number: string;
  notes: string;
  impact_assessment: string;
  next_due_on: string;
  as_found: string;
  as_left: string;
  measurement_uncertainty: string;
  reference_standard: string;
  method: string;
  environment: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function blankCalibrationDraft(): CalibrationDraft {
  return {
    performed_on: today(),
    result: 'pass',
    performed_by: '',
    supplier_id: '',
    certificate_number: '',
    notes: '',
    impact_assessment: '',
    next_due_on: '',
    as_found: '',
    as_left: '',
    measurement_uncertainty: '',
    reference_standard: '',
    method: '',
    environment: '',
  };
}

export function calibrationDraftFrom(c: Calibration): CalibrationDraft {
  return {
    performed_on: c.performed_on,
    result: c.result,
    performed_by: c.performed_by ?? '',
    supplier_id: c.supplier_id ?? '',
    certificate_number: c.certificate_number ?? '',
    notes: c.notes ?? '',
    impact_assessment: c.impact_assessment ?? '',
    next_due_on: c.next_due_on ?? '',
    as_found: c.as_found ?? '',
    as_left: c.as_left ?? '',
    measurement_uncertainty: c.measurement_uncertainty ?? '',
    reference_standard: c.reference_standard ?? '',
    method: c.method ?? '',
    environment: c.environment ?? '',
  };
}

/** The request body of a calibration draft (an empty next due date lets the backend use the interval). */
export function calibrationBody(d: CalibrationDraft): CalibrationRequest {
  return {
    performed_on: d.performed_on,
    result: d.result,
    performed_by: blankToNull(d.performed_by),
    supplier_id: d.supplier_id || null,
    certificate_number: blankToNull(d.certificate_number),
    notes: blankToNull(d.notes),
    impact_assessment: blankToNull(d.impact_assessment),
    next_due_on: dayOrNull(d.next_due_on),
    as_found: blankToNull(d.as_found),
    as_left: blankToNull(d.as_left),
    measurement_uncertainty: blankToNull(d.measurement_uncertainty),
    reference_standard: blankToNull(d.reference_standard),
    method: blankToNull(d.method),
    environment: blankToNull(d.environment),
  };
}

/** Whether a calibration has any traceability detail filled in. */
export function hasTrace(c: CalibrationTrace): boolean {
  return CALIBRATION_TRACE_FIELDS.some((f) => !!c[f]);
}

const TRACE_LABELS: Readonly<Record<TraceField, string>> = {
  as_found: 'assets.fields.asFound',
  as_left: 'assets.fields.asLeft',
  measurement_uncertainty: 'assets.fields.measurementUncertainty',
  reference_standard: 'assets.fields.referenceStandard',
  method: 'assets.fields.method',
  environment: 'assets.fields.environment',
};

/**
 * Calibration of a measuring instrument (ISO 9001 7.1.5): status and next due date,
 * the history with result, laboratory (from the Suppliers register), certificate and
 * traceability (as found / as left, uncertainty, reference standard, method,
 * conditions); recording a calibration (the next due date defaults to the date plus
 * the interval) and the impact assessment a failed calibration needs. A failed
 * calibration can become a deviation in one click ("Registrer avvik").
 */
@Component({
  selector: 'app-asset-calibration-panel',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    AssetSupplierSelect,
    Attachments,
    Button,
    Card,
    ConfirmDialog,
    EntityChip,
    FieldHelp,
    FieldItem,
    FieldList,
    FormField,
    Icon,
    StatusBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-card font-bold text-fg" id="calibration-heading">
          {{ 'assets.calibration.title' | transloco }}
        </h2>
        @if (canWrite() && !formOpen()) {
          <app-button size="sm" variant="secondary" (click)="openForm()">
            <app-icon name="plus" [size]="14" />
            {{ 'assets.calibration.record' | transloco }}
          </app-button>
        }
      </div>

      <app-field-list [columns]="3" class="mb-4">
        <app-field-item labelKey="assets.fields.calibrationStatus">
          <app-status-badge
            [meaning]="statusBadge(asset().calibration_status).meaning"
            [value]="statusBadge(asset().calibration_status).value"
            [labelKey]="
              'assets.calibrationStatus.' + (asset().calibration_status ?? 'not_scheduled')
            "
          />
        </app-field-item>
        <app-field-item
          labelKey="assets.fields.lastCalibratedOn"
          [value]="asset().last_calibrated_on | localDay"
          empty="none"
        />
        <app-field-item labelKey="assets.fields.nextCalibrationDue">
          @if (asset().next_calibration_due) {
            <span
              [class.font-semibold]="asset().calibration_status === 'overdue'"
              [class.text-fail-ink]="asset().calibration_status === 'overdue'"
              >{{ asset().next_calibration_due | localDay }}</span
            >
            <span class="block text-meta text-fg-subtle">{{
              'assets.calibration.nextDueSource' | transloco
            }}</span>
          }
        </app-field-item>
        <app-field-item labelKey="assets.fields.calibrationInterval">
          @if (asset().calibration_interval_months; as months) {
            {{ 'assets.calibration.everyMonths' | transloco: { months } }}
          } @else {
            <span class="text-fg-subtle">{{ 'assets.calibration.noInterval' | transloco }}</span>
          }
        </app-field-item>
        <app-field-item
          labelKey="assets.fields.measurementRange"
          [value]="asset().measurement_range"
        />
        <app-field-item labelKey="assets.fields.accuracy" [value]="asset().accuracy" />
      </app-field-list>

      @if (formOpen()) {
        <form
          class="mb-4 rounded-tile border border-border p-4"
          (submit)="$event.preventDefault(); save()"
          novalidate
          data-testid="calibration-form"
          [attr.aria-label]="
            (editingId() ? 'assets.calibration.editTitle' : 'assets.calibration.newTitle')
              | transloco
          "
        >
          <h3 class="mb-3 text-body font-semibold text-fg">
            {{
              (editingId() ? 'assets.calibration.editTitle' : 'assets.calibration.newTitle')
                | transloco
            }}
          </h3>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <app-form-field
              [label]="'assets.fields.performedOn' | transloco"
              inputId="cal-date"
              [required]="true"
            >
              <input
                id="cal-date"
                type="date"
                required
                aria-required="true"
                [attr.lang]="lang()"
                [attr.aria-invalid]="showErrors() && !d().performed_on"
                [value]="d().performed_on"
                (input)="set('performed_on', $any($event.target).value)"
              />
            </app-form-field>
            <app-form-field
              [label]="'assets.fields.result' | transloco"
              inputId="cal-result"
              [required]="true"
            >
              <app-field-help
                label-suffix
                scope="assets"
                page="detail"
                field="calibration_result"
              />
              <select id="cal-result" (change)="set('result', $any($event.target).value)">
                @for (r of results; track r) {
                  <option [value]="r" [selected]="d().result === r">
                    {{ 'assets.calibrationResultOption.' + r | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            @if (suppliers.available()) {
              <app-form-field
                [label]="'assets.fields.calibrationLab' | transloco"
                inputId="cal-lab"
              >
                <app-field-help label-suffix scope="assets" page="detail" field="calibration_lab" />
                <app-asset-supplier-select
                  inputId="cal-lab"
                  emptyLabelKey="assets.calibration.noLab"
                  [value]="d().supplier_id"
                  [currentLabel]="editingSupplier()"
                  (valueChange)="set('supplier_id', $event)"
                />
              </app-form-field>
            }
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
            <div>
              <app-form-field [label]="'assets.fields.nextDueOn' | transloco" inputId="cal-next">
                <input
                  id="cal-next"
                  type="date"
                  aria-describedby="cal-next-hint"
                  [attr.lang]="lang()"
                  [value]="d().next_due_on"
                  (input)="set('next_due_on', $any($event.target).value)"
                />
              </app-form-field>
              <p id="cal-next-hint" class="mt-1 text-meta text-fg-subtle">
                @if (defaultNextDue(); as date) {
                  {{ 'assets.calibration.nextDueDefault' | transloco: { date: (date | localDay) } }}
                } @else {
                  {{ 'assets.calibration.nextDueNoInterval' | transloco }}
                }
              </p>
            </div>
          </div>

          <details class="mt-4 rounded-tile border border-border px-3 py-2" [open]="traceOpen()">
            <summary class="cursor-pointer text-ui font-semibold text-fg">
              {{ 'assets.calibration.traceTitle' | transloco }}
              <span class="ml-1 font-normal text-fg-muted">{{
                'assets.calibration.traceHint' | transloco
              }}</span>
            </summary>
            <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              @for (f of traceFields; track f) {
                <app-form-field [label]="traceLabel(f) | transloco" [inputId]="'cal-' + f">
                  <input
                    [id]="'cal-' + f"
                    type="text"
                    [attr.maxlength]="f === 'measurement_uncertainty' ? 120 : 255"
                    [placeholder]="'assets.calibration.placeholders.' + f | transloco"
                    [value]="d()[f]"
                    (input)="set(f, $any($event.target).value)"
                  />
                </app-form-field>
              }
            </div>
          </details>

          @if (d().result === 'fail' || d().impact_assessment) {
            <div class="mt-4">
              <app-form-field
                [label]="'assets.fields.impactAssessment' | transloco"
                inputId="cal-impact"
              >
                <app-field-help
                  label-suffix
                  scope="assets"
                  page="detail"
                  field="impact_assessment"
                />
                <textarea
                  id="cal-impact"
                  rows="3"
                  maxlength="10000"
                  aria-describedby="cal-impact-hint"
                  [value]="d().impact_assessment"
                  (input)="set('impact_assessment', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <p id="cal-impact-hint" class="mt-1 text-meta text-fg-subtle">
                {{ 'assets.calibration.impactHint' | transloco }}
              </p>
            </div>
          }
          <div class="mt-4">
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
          @if (error(); as key) {
            <p class="mt-2 text-meta text-fail-ink" role="alert">{{ key | transloco }}</p>
          }
          <div class="mt-4 flex justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="closeForm()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [loading]="busy()">
              {{ 'assets.calibration.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      <h3 class="mb-2 text-ui font-semibold text-fg-muted">
        {{ 'assets.calibration.history' | transloco }}
      </h3>
      @if (items().length === 0) {
        <p class="text-ui text-fg-subtle">{{ 'assets.calibration.none' | transloco }}</p>
      } @else {
        <ul class="flex flex-col gap-2" data-testid="calibration-rows">
          @for (c of items(); track c.id) {
            <li
              [id]="'calibration-' + c.id"
              class="rounded-tile border px-3 py-2.5"
              [class.border-accent]="c.id === highlight()"
              [class.border-border]="c.id !== highlight()"
            >
              <div class="flex flex-wrap items-center gap-2 text-ui">
                <app-status-badge
                  [meaning]="resBadge(c.result).meaning"
                  [value]="resBadge(c.result).value"
                  [labelKey]="'assets.calibrationResult.' + c.result"
                />
                <span class="font-semibold text-fg">{{ c.performed_on | localDay }}</span>
                @if (c.supplier; as lab) {
                  <app-entity-chip
                    [ref]="{
                      entity_type: 'supplier',
                      entity_id: lab.id,
                      code: lab.code,
                      title: lab.name,
                      url: lab.url,
                    }"
                  />
                } @else if (c.performed_by) {
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
                  <app-status-badge
                    meaning="lifecycle"
                    value="failed"
                    labelKey="assets.calibration.needsImpact"
                  />
                }
              </div>
              @if (hasTrace(c)) {
                <dl class="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-meta sm:grid-cols-2">
                  @for (f of traceFields; track f) {
                    @if (c[f]) {
                      <div class="flex gap-1.5">
                        <dt class="text-fg-muted">{{ traceLabel(f) | transloco }}:</dt>
                        <dd class="text-fg">{{ c[f] }}</dd>
                      </div>
                    }
                  }
                </dl>
              }
              @if (c.impact_assessment) {
                <p class="mt-1.5 text-meta text-fg-muted">
                  <span class="font-semibold"
                    >{{ 'assets.fields.impactAssessment' | transloco }}:</span
                  >
                  {{ c.impact_assessment }}
                </p>
              }
              @if (c.notes) {
                <p class="mt-1 text-meta text-fg-muted">{{ c.notes }}</p>
              }
              <div class="mt-2 flex flex-wrap items-center gap-1">
                <app-button
                  variant="ghost"
                  size="sm"
                  [attr.aria-expanded]="openFiles() === c.id"
                  (click)="toggleFiles(c.id)"
                >
                  <app-icon name="documents" [size]="13" />
                  {{ 'assets.calibration.certificates' | transloco }}
                </app-button>
                @if (c.result === 'fail' && canCreateDeviation()) {
                  <app-button
                    variant="secondary"
                    size="sm"
                    data-testid="calibration-to-deviation"
                    (click)="toDeviation(c)"
                  >
                    {{ 'assets.calibration.toDeviation' | transloco }}
                  </app-button>
                }
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
              </div>
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
  private readonly flows = inject(CreateFlowService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly suppliers = inject(SupplierOptionsService);

  readonly asset = input.required<AssetDetail>();
  readonly canWrite = input(false);
  /** Whether the caller may raise deviations (shows "Registrer avvik" on failed results). */
  readonly canCreateDeviation = input(false);
  /** A calibration to highlight and scroll to (`?calibration=<id>`). */
  readonly highlight = input<string | null>(null);
  /** UI language, for the native date inputs (`lang` attribute). */
  readonly lang = input('nb');
  readonly changed = output<void>();

  protected readonly results = CALIBRATION_RESULTS;
  protected readonly traceFields = CALIBRATION_TRACE_FIELDS;
  protected readonly statusBadge = calibrationBadge;
  protected readonly resBadge = resultBadge;
  protected readonly hasTrace = hasTrace;

  protected readonly items = signal<readonly Calibration[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly d = signal<CalibrationDraft>(blankCalibrationDraft());
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toDelete = signal<Calibration | null>(null);
  protected readonly openFiles = signal<string | null>(null);
  protected readonly traceOpen = signal(false);

  protected readonly defaultNextDue = computed(() => {
    const months = this.asset().calibration_interval_months;
    return months ? addMonths(this.d().performed_on, months) : null;
  });
  protected readonly editingSupplier = computed(() => {
    const id = this.editingId();
    return this.items().find((c) => c.id === id)?.supplier?.name ?? null;
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

  protected traceLabel(f: TraceField): string {
    return TRACE_LABELS[f];
  }

  protected set<K extends keyof CalibrationDraft>(key: K, value: CalibrationDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  /** Open the "record a calibration" form (also used by the page's primary action). */
  openForm(): void {
    this.editingId.set(null);
    const last = this.items()[0];
    // Reuse the laboratory and method of the last calibration: they rarely change.
    this.d.set({
      ...blankCalibrationDraft(),
      supplier_id: last?.supplier_id ?? '',
      performed_by: last && !last.supplier_id ? (last.performed_by ?? '') : '',
      reference_standard: last?.reference_standard ?? '',
      method: last?.method ?? '',
    });
    this.traceOpen.set(false);
    this.error.set(null);
    this.showErrors.set(false);
    this.formOpen.set(true);
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector<HTMLElement>('#cal-date');
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    });
  }

  protected edit(c: Calibration): void {
    this.editingId.set(c.id);
    this.d.set(calibrationDraftFrom(c));
    this.traceOpen.set(hasTrace(c));
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

  protected toDeviation(c: Calibration): void {
    void this.flows.start('calibration.to_deviation', 'calibration', c.id);
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
