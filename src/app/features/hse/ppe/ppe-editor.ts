import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { dayOf } from '../../../shared/tasks/task-display';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  LinkedRef,
  PPE_CATEGORIES,
  PPE_SETTABLE_STATUSES,
  Ppe,
  PpeCategory,
  PpeFields,
  PpeSettableStatus,
} from '../data/hse.models';
import { dayToWire, intervalText, textOrNull } from '../hse-format';
import { HseRecordPicker } from '../shared/record-picker';
import {
  HSE_CRUMBS,
  HSE_MODULE,
  HSE_ROOT_CRUMB,
  HseDirectorySelect,
  HseField,
} from '../shared/hse-shared';

/** A positive whole number from an input value, or null when blank / invalid. */
export function positiveInt(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isInteger(n) && n > 0 ? n : null;
}

/** Common inspection intervals offered as one-click choices (days). */
export const INTERVAL_PRESETS = [30, 90, 182, 365] as const;

/**
 * `/hse/ppe/new` and `/hse/ppe/:id/edit`: a PPE register entry. What it is
 * (category — no default, so nothing is filed wrongly — standard, supplier from
 * the Suppliers register, manufacturer, serial), how many (an individual item or
 * a batch, explained), where it is and who is responsible, the course a holder
 * must have done, and its inspection interval and expiry. On edit the status can
 * be set to in stock, out of service or retired (issuing goes through the item).
 */
@Component({
  selector: 'app-ppe-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AskAbout,
    Button,
    Card,
    ErrorState,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    HseDirectorySelect,
    HseField,
    HseRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-28 sm:px-8 sm:pt-7 sm:pb-12">
      <app-page-header
        [titleKey]="id() ? 'hse.ppe.edit.title' : 'hse.ppe.edit.newTitle'"
        [breadcrumbs]="breadcrumbs()"
      >
        @if (code()) {
          <span meta class="font-mono">{{ code() }}</span>
        }
      </app-page-header>
      <app-help-strip scope="hse" page="ppe-edit" lesson="ppe-last-line" />

      @if (state() === 'loading') {
        <app-loading-state [rows]="6" />
      } @else if (state() === 'error') {
        <app-error-state
          titleKey="hse.common.notFoundTitle"
          bodyKey="hse.common.notFound"
          (retry)="reload()"
        />
      } @else {
        <app-flow-banner [flow]="flow()" />
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <h2 class="mb-4 font-display text-card font-bold text-fg">
              {{ 'hse.ppe.edit.whatSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.name"
                inputId="ppe-name"
                page="ppe-edit"
                [required]="true"
                [errorKey]="submitted() && !name().trim() ? 'hse.ppe.edit.nameRequired' : null"
              >
                <input
                  id="ppe-name"
                  type="text"
                  required
                  maxlength="200"
                  autocomplete="off"
                  [value]="name()"
                  (input)="name.set($any($event.target).value)"
                  [attr.aria-invalid]="submitted() && !name().trim()"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.ppe.fields.category"
                inputId="ppe-category"
                page="ppe-edit"
                help="category"
                [required]="true"
                [errorKey]="submitted() && !category() ? 'hse.errors.invalid_category' : null"
              >
                <select
                  id="ppe-category"
                  required
                  (change)="category.set($any($event.target).value)"
                  [attr.aria-invalid]="submitted() && !category()"
                  data-testid="ppe-category"
                >
                  <option value="" disabled [selected]="!category()">
                    {{ 'hse.ppe.edit.pickCategory' | transloco }}
                  </option>
                  @for (c of categories; track c) {
                    <option [value]="c" [selected]="c === category()">
                      {{ 'hse.ppeCategory.' + c | transloco }}
                    </option>
                  }
                </select>
              </app-hse-field>
              <app-hse-field
                labelKey="hse.ppe.fields.standard_ref"
                inputId="ppe-standard"
                page="ppe-edit"
                help="standard_ref"
                hintKey="hse.ppe.edit.standardHint"
              >
                <app-ask-about
                  label-extra
                  [prompt]="'hse.ppe.ai.standardPrompt' | transloco"
                  [fieldLabel]="'hse.ppe.fields.standard_ref' | transloco"
                  labelKey="hse.ppe.ai.askStandard"
                />
                <input
                  id="ppe-standard"
                  type="text"
                  maxlength="100"
                  aria-describedby="ppe-standard-hint"
                  [value]="standardRef()"
                  (input)="standardRef.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.supplier"
                inputId="ppe-supplier"
                page="ppe-edit"
                help="supplier"
                hintKey="hse.ppe.edit.supplierHint"
              >
                <app-hse-record-picker
                  entityType="supplier"
                  inputId="ppe-supplier"
                  placeholderKey="hse.ppe.edit.supplierPlaceholder"
                  describedBy="ppe-supplier-hint"
                  [value]="supplier()"
                  (valueChange)="supplier.set($event)"
                  testId="ppe-supplier"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.ppe.fields.manufacturer" inputId="ppe-manufacturer">
                <input
                  id="ppe-manufacturer"
                  type="text"
                  maxlength="200"
                  [value]="manufacturer()"
                  (input)="manufacturer.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.ppe.fields.serial_number" inputId="ppe-serial">
                <input
                  id="ppe-serial"
                  type="text"
                  maxlength="100"
                  [value]="serial()"
                  (input)="serial.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.ppe.fields.quantity"
                inputId="ppe-quantity"
                page="ppe-edit"
                help="quantity"
                hintKey="hse.ppe.edit.quantityHint"
              >
                <input
                  id="ppe-quantity"
                  type="number"
                  min="1"
                  step="1"
                  aria-describedby="ppe-quantity-hint"
                  [value]="quantity()"
                  (input)="quantity.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.description"
                inputId="ppe-description"
              >
                <textarea
                  id="ppe-description"
                  rows="3"
                  [value]="description()"
                  (input)="description.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-card font-bold text-fg">
              {{ 'hse.ppe.edit.whoSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-hse-field labelKey="hse.ppe.fields.location" inputId="ppe-location">
                <input
                  id="ppe-location"
                  type="text"
                  maxlength="200"
                  [value]="location()"
                  (input)="location.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.ppe.fields.responsible" inputId="ppe-responsible">
                <app-hse-directory-select
                  inputId="ppe-responsible"
                  kind="user"
                  [value]="responsibleId()"
                  [currentName]="responsibleName()"
                  (valueChange)="responsibleId.set($event)"
                />
              </app-hse-field>
              <app-hse-field labelKey="hse.common.department" inputId="ppe-department">
                <app-hse-directory-select
                  inputId="ppe-department"
                  kind="department"
                  [value]="departmentId()"
                  (valueChange)="departmentId.set($event)"
                />
              </app-hse-field>
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.required_course"
                inputId="ppe-course"
                page="ppe-edit"
                help="required_course"
                hintKey="hse.ppe.edit.courseHint"
              >
                <app-hse-record-picker
                  entityType="course"
                  inputId="ppe-course"
                  placeholderKey="hse.ppe.edit.coursePlaceholder"
                  describedBy="ppe-course-hint"
                  [value]="course()"
                  (valueChange)="course.set($event)"
                  testId="ppe-course"
                />
              </app-hse-field>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-4 font-display text-card font-bold text-fg">
              {{ 'hse.ppe.edit.inspectionSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.inspection_interval"
                inputId="ppe-interval"
                page="ppe-edit"
                help="inspection_interval_days"
                hintKey="hse.ppe.edit.intervalHint"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    id="ppe-interval"
                    class="max-w-[120px]"
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    aria-describedby="ppe-interval-hint"
                    [value]="interval()"
                    (input)="interval.set($any($event.target).value)"
                  />
                  <span class="text-ui text-fg-muted">{{ 'hse.ppe.edit.days' | transloco }}</span>
                  @for (d of presets; track d) {
                    <button
                      type="button"
                      class="inline-flex h-8 items-center rounded-full border px-3 text-meta font-semibold"
                      [class]="
                        interval() === '' + d
                          ? 'border-accent-border bg-accent-soft text-accent'
                          : 'border-border text-fg-muted hover:text-fg'
                      "
                      [attr.aria-pressed]="interval() === '' + d"
                      (click)="interval.set('' + d)"
                    >
                      {{ presetLabel(d) }}
                    </button>
                  }
                </div>
              </app-hse-field>
              <app-hse-field labelKey="hse.ppe.fields.next_inspection_at" inputId="ppe-next">
                <input
                  id="ppe-next"
                  type="date"
                  [value]="nextInspection()"
                  (input)="nextInspection.set($any($event.target).value)"
                />
              </app-hse-field>
              <app-hse-field
                labelKey="hse.ppe.fields.expires_at"
                inputId="ppe-expires"
                page="ppe-edit"
                help="expires_at"
              >
                <input
                  id="ppe-expires"
                  type="date"
                  [value]="expires()"
                  (input)="expires.set($any($event.target).value)"
                />
              </app-hse-field>
              @if (id()) {
                <app-hse-field
                  labelKey="hse.common.status"
                  inputId="ppe-status"
                  page="ppe-edit"
                  help="status"
                >
                  <select id="ppe-status" (change)="status.set($any($event.target).value)">
                    @if (currentStatus() === 'issued') {
                      <option value="" [selected]="!status()">
                        {{ 'hse.ppe.status.issued' | transloco }}
                      </option>
                    }
                    @for (s of settable; track s) {
                      <option [value]="s" [selected]="s === status()">
                        {{ 'hse.ppe.status.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-hse-field>
              }
              <app-hse-field
                class="sm:col-span-2"
                labelKey="hse.ppe.fields.notes"
                inputId="ppe-notes"
              >
                <textarea
                  id="ppe-notes"
                  rows="3"
                  [value]="notes()"
                  (input)="notes.set($any($event.target).value)"
                ></textarea>
              </app-hse-field>
            </div>
          </app-card>

          <div
            class="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0"
          >
            <a [routerLink]="backLink()" tabindex="-1" (click)="cancelFlow()">
              <app-button variant="secondary">{{ 'hse.common.cancel' | transloco }}</app-button>
            </a>
            <app-button type="submit" [loading]="saving()" [disabled]="saving()">
              {{ (id() ? 'hse.common.save' : 'hse.ppe.edit.create') | transloco }}
            </app-button>
          </div>
        </form>
      }
    </div>
  `,
})
export class PpeEditor {
  private readonly api = inject(HseApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);
  private readonly route = inject(ActivatedRoute);

  readonly id = input<string | undefined>(undefined);

  protected readonly categories = PPE_CATEGORIES;
  protected readonly settable = PPE_SETTABLE_STATUSES;
  protected readonly presets = INTERVAL_PRESETS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>(
    inject(ActivatedRoute).snapshot.paramMap.has('id') ? 'loading' : 'ready',
  );
  protected readonly code = signal('');
  protected readonly name = signal('');
  /** No default: a placeholder makes the user choose (filed wrongly otherwise). */
  protected readonly category = signal<PpeCategory | ''>('');
  protected readonly description = signal('');
  protected readonly standardRef = signal('');
  protected readonly manufacturer = signal('');
  protected readonly supplier = signal<LinkedRef | null>(null);
  protected readonly course = signal<LinkedRef | null>(null);
  protected readonly serial = signal('');
  protected readonly quantity = signal('1');
  protected readonly location = signal('');
  protected readonly responsibleId = signal('');
  protected readonly responsibleName = signal<string | null>(null);
  protected readonly departmentId = signal('');
  protected readonly interval = signal('');
  protected readonly nextInspection = signal('');
  protected readonly expires = signal('');
  protected readonly notes = signal('');
  /** '' keeps the current status (e.g. issued). */
  protected readonly status = signal<PpeSettableStatus | ''>('');
  protected readonly currentStatus = signal<string>('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);

  private readonly flowSource = signal<Signal<FlowContext | null> | null>(null);
  protected readonly flow = computed(() => this.flowSource()?.() ?? null);

  protected readonly breadcrumbs = computed(() => {
    const id = this.id();
    return id
      ? [
          HSE_ROOT_CRUMB,
          HSE_CRUMBS.ppe,
          { label: this.code() || '…', link: ['/hse/ppe', id] },
          { labelKey: 'hse.common.edit' },
        ]
      : [HSE_ROOT_CRUMB, HSE_CRUMBS.ppe, { labelKey: 'hse.ppe.edit.newTitle' }];
  });
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id ? ['/hse/ppe', id] : ['/hse/ppe'];
  });

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'ppe_item',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.name() || this.language.translate('hse.ppe.edit.newTitle'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (id) {
          this.load(orgId, id);
        } else if (!this.flowSource()) {
          this.flowSource.set(this.flows.consume(this.route, { targetType: 'ppe_item' }));
        }
      });
    });
    effect(() => {
      const flow = this.flow();
      if (flow && !this.id()) {
        untracked(() => {
          const title = flow.prefill.title;
          if (typeof title === 'string' && title && !this.name()) {
            this.name.set(title);
          }
          const description = flow.prefill.description;
          if (typeof description === 'string' && description && !this.description()) {
            this.description.set(description);
          }
        });
      }
    });
  }

  private load(orgId: string | null, id: string): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.getPpe(orgId, id).subscribe({
      next: (ppe) => this.fill(ppe),
      error: () => this.state.set('error'),
    });
  }

  protected reload(): void {
    const id = this.id();
    if (id) {
      this.load(this.selectedOrg.currentOrgId(), id);
    }
  }

  protected presetLabel(days: number): string {
    const text = intervalText(days);
    return text ? this.language.translate(text.key, text.params) : String(days);
  }

  private fill(p: Ppe): void {
    this.code.set(p.code);
    this.name.set(p.name);
    this.category.set(p.category);
    this.description.set(p.description ?? '');
    this.standardRef.set(p.standard_ref ?? '');
    this.manufacturer.set(p.manufacturer ?? '');
    this.supplier.set(
      p.supplier ??
        (p.supplier_id ? { id: p.supplier_id, code: null, title: null, url: null } : null),
    );
    this.course.set(
      p.required_course ??
        (p.required_course_id
          ? { id: p.required_course_id, code: null, title: null, url: null }
          : null),
    );
    this.serial.set(p.serial_number ?? '');
    this.quantity.set(String(p.quantity));
    this.location.set(p.location ?? '');
    this.responsibleId.set(p.responsible?.id ?? '');
    this.responsibleName.set(p.responsible?.name ?? null);
    this.departmentId.set(p.department_id ?? '');
    this.interval.set(p.inspection_interval_days ? String(p.inspection_interval_days) : '');
    this.nextInspection.set(dayOf(p.next_inspection_at));
    this.expires.set(dayOf(p.expires_at));
    this.notes.set(p.notes ?? '');
    this.currentStatus.set(p.status);
    this.status.set(p.status === 'issued' ? '' : p.status);
    this.state.set('ready');
  }

  private fields(): PpeFields {
    return {
      name: this.name().trim(),
      description: textOrNull(this.description()),
      standard_ref: textOrNull(this.standardRef()),
      manufacturer: textOrNull(this.manufacturer()),
      serial_number: textOrNull(this.serial()),
      quantity: positiveInt(this.quantity()) ?? 1,
      location: textOrNull(this.location()),
      responsible_user_id: this.responsibleId() || null,
      department_id: this.departmentId() || null,
      inspection_interval_days: positiveInt(this.interval()),
      next_inspection_at: dayToWire(this.nextInspection()),
      expires_at: dayToWire(this.expires()),
      notes: textOrNull(this.notes()),
      supplier_id: this.supplier()?.id ?? null,
      required_course_id: this.course()?.id ?? null,
    };
  }

  protected cancelFlow(): void {
    if (!this.id() && this.flow()) {
      this.flows.cancel();
    }
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    const category = this.category();
    if (!orgId || !this.name().trim() || !category || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = this.id();
    const fields = this.fields();
    const status = this.status();
    const changed = status && status !== this.currentStatus() ? { status } : {};
    const request = id
      ? this.api.updatePpe(orgId, id, { ...fields, category, ...changed })
      : this.api.createPpe(orgId, { ...fields, name: fields.name ?? '', category });
    request.subscribe({
      next: (ppe) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.ppe.created', { code: ppe.code });
        if (!id && this.flow()) {
          this.flows.complete(ppe.id, 'ppe_item').subscribe();
        }
        void this.router.navigate(['/hse/ppe', ppe.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
