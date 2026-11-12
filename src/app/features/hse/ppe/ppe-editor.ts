import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { dayOf } from '../../../shared/tasks/task-display';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { HseApi } from '../data/hse-api';
import { hseErrorKey } from '../data/hse-errors';
import {
  PPE_CATEGORIES,
  PPE_SETTABLE_STATUSES,
  Ppe,
  PpeCategory,
  PpeFields,
  PpeSettableStatus,
} from '../data/hse.models';
import { dayToWire, textOrNull } from '../hse-format';
import { HSE_MODULE, HseDirectorySelect } from '../shared/hse-shared';

/** A positive whole number from an input value, or null when blank / invalid. */
export function positiveInt(value: string): number | null {
  const n = Number(value);
  return value.trim() && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `/hse/ppe/new` and `/hse/ppe/:id/edit`: a PPE register entry — what it is
 * (category, standard, manufacturer, serial), where it is and who is responsible,
 * and its inspection interval and expiry. On edit, the status can be set to in
 * stock, out of service or retired (issuing goes through the detail page).
 */
@Component({
  selector: 'app-ppe-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    Button,
    Card,
    FormField,
    Icon,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    HseDirectorySelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/hse/ppe', id()] : '/hse/ppe'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ (id() ? 'hse.common.backToRecord' : 'hse.ppe.list.back') | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'hse.ppe.edit.title' : 'hse.ppe.edit.newTitle') | transloco }}
        @if (code()) {
          <span class="ml-2 font-mono text-[14px] font-semibold text-fg-subtle">{{ code() }}</span>
        }
      </h1>
      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <app-guide-intro scope="hse" page="ppe-edit" />
        <app-why-it-matters scope="hse" page="ppe-edit" />
      </div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
          {{ 'hse.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <p class="py-10 text-center text-[14px] text-fail" role="alert">
          {{ 'hse.common.loadFailed' | transloco }}
        </p>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field [label]="'hse.ppe.fields.name' | transloco" inputId="ppe-name">
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
                </app-form-field>
                @if (submitted() && !name().trim()) {
                  <p class="mt-1 text-[12.5px] text-fail" role="alert">
                    {{ 'hse.ppe.edit.nameRequired' | transloco }}
                  </p>
                }
              </div>
              <div>
                <app-form-field
                  [label]="'hse.ppe.fields.category' | transloco"
                  inputId="ppe-category"
                >
                  <select
                    id="ppe-category"
                    [value]="category()"
                    (change)="category.set($any($event.target).value)"
                  >
                    @for (c of categories; track c) {
                      <option [value]="c" [selected]="c === category()">
                        {{ 'hse.ppeCategory.' + c | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help scope="hse" page="ppe-edit" field="category" />
              </div>
              <div>
                <app-form-field
                  [label]="'hse.ppe.fields.standard_ref' | transloco"
                  inputId="ppe-standard"
                >
                  <input
                    id="ppe-standard"
                    type="text"
                    maxlength="100"
                    [value]="standardRef()"
                    (input)="standardRef.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="hse" page="ppe-edit" field="standard_ref" />
              </div>
              <app-form-field
                [label]="'hse.ppe.fields.manufacturer' | transloco"
                inputId="ppe-manufacturer"
              >
                <input
                  id="ppe-manufacturer"
                  type="text"
                  maxlength="200"
                  [value]="manufacturer()"
                  (input)="manufacturer.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.ppe.fields.serial_number' | transloco"
                inputId="ppe-serial"
              >
                <input
                  id="ppe-serial"
                  type="text"
                  maxlength="100"
                  [value]="serial()"
                  (input)="serial.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.ppe.fields.quantity' | transloco"
                inputId="ppe-quantity"
              >
                <input
                  id="ppe-quantity"
                  type="number"
                  min="1"
                  step="1"
                  [value]="quantity()"
                  (input)="quantity.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.ppe.fields.location' | transloco"
                inputId="ppe-location"
              >
                <input
                  id="ppe-location"
                  type="text"
                  maxlength="200"
                  [value]="location()"
                  (input)="location.set($any($event.target).value)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.ppe.fields.responsible' | transloco"
                inputId="ppe-responsible"
              >
                <app-hse-directory-select
                  inputId="ppe-responsible"
                  kind="user"
                  [value]="responsibleId()"
                  [currentName]="responsibleName()"
                  (valueChange)="responsibleId.set($event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'hse.common.department' | transloco"
                inputId="ppe-department"
              >
                <app-hse-directory-select
                  inputId="ppe-department"
                  kind="department"
                  [value]="departmentId()"
                  (valueChange)="departmentId.set($event)"
                />
              </app-form-field>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'hse.ppe.fields.description' | transloco"
                  inputId="ppe-description"
                >
                  <textarea
                    id="ppe-description"
                    rows="3"
                    [value]="description()"
                    (input)="description.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
            </div>
          </app-card>

          <app-card>
            <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
              {{ 'hse.ppe.edit.inspectionSection' | transloco }}
            </h2>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <app-form-field
                  [label]="'hse.ppe.fields.inspection_interval_days' | transloco"
                  inputId="ppe-interval"
                >
                  <input
                    id="ppe-interval"
                    type="number"
                    min="1"
                    max="3650"
                    step="1"
                    [value]="interval()"
                    (input)="interval.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="hse" page="ppe-edit" field="inspection_interval_days" />
              </div>
              <div>
                <app-form-field
                  [label]="'hse.ppe.fields.next_inspection_at' | transloco"
                  inputId="ppe-next"
                >
                  <input
                    id="ppe-next"
                    type="date"
                    [value]="nextInspection()"
                    (input)="nextInspection.set($any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'hse.ppe.fields.expires_at' | transloco"
                  inputId="ppe-expires"
                >
                  <input
                    id="ppe-expires"
                    type="date"
                    [value]="expires()"
                    (input)="expires.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help scope="hse" page="ppe-edit" field="expires_at" />
              </div>
              @if (id()) {
                <div>
                  <app-form-field [label]="'hse.common.status' | transloco" inputId="ppe-status">
                    <select
                      id="ppe-status"
                      [value]="status()"
                      (change)="status.set($any($event.target).value)"
                    >
                      @if (currentStatus() === 'issued') {
                        <option value="">{{ 'hse.ppe.status.issued' | transloco }}</option>
                      }
                      @for (s of settable; track s) {
                        <option [value]="s" [selected]="s === status()">
                          {{ 'hse.ppe.status.' + s | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                  <app-field-help scope="hse" page="ppe-edit" field="status" />
                </div>
              }
              <div class="sm:col-span-3">
                <app-form-field [label]="'hse.ppe.fields.notes' | transloco" inputId="ppe-notes">
                  <textarea
                    id="ppe-notes"
                    rows="3"
                    [value]="notes()"
                    (input)="notes.set($any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
            </div>
          </app-card>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <a [routerLink]="id() ? ['/hse/ppe', id()] : '/hse/ppe'" tabindex="-1">
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

  protected readonly categories = PPE_CATEGORIES;
  protected readonly settable = PPE_SETTABLE_STATUSES;

  protected readonly id = signal<string | null>(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  protected readonly state = signal<'loading' | 'ready' | 'error'>(this.id() ? 'loading' : 'ready');
  protected readonly code = signal('');

  protected readonly name = signal('');
  protected readonly category = signal<PpeCategory>('head');
  protected readonly description = signal('');
  protected readonly standardRef = signal('');
  protected readonly manufacturer = signal('');
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

  constructor() {
    providePageContext(() => ({
      module: HSE_MODULE,
      entityType: 'ppe_item',
      entityId: this.id(),
      view: this.id() ? 'edit' : 'new',
      title: this.name() || null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.getPpe(orgId, id).subscribe({
            next: (ppe) => this.fill(ppe),
            error: () => this.state.set('error'),
          }),
        );
      }
    });
  }

  private fill(p: Ppe): void {
    this.code.set(p.code);
    this.name.set(p.name);
    this.category.set(p.category);
    this.description.set(p.description ?? '');
    this.standardRef.set(p.standard_ref ?? '');
    this.manufacturer.set(p.manufacturer ?? '');
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
      category: this.category(),
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
    };
  }

  protected save(): void {
    this.submitted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.name().trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = this.id();
    const fields = this.fields();
    const status = this.status();
    const changed = status && status !== this.currentStatus() ? { status } : {};
    const request = id
      ? this.api.updatePpe(orgId, id, { ...fields, ...changed })
      : this.api.createPpe(orgId, {
          ...fields,
          name: fields.name ?? '',
          category: this.category(),
        });
    request.subscribe({
      next: (ppe) => {
        this.saving.set(false);
        this.notifications.success(id ? 'hse.common.saved' : 'hse.ppe.created', { code: ppe.code });
        void this.router.navigate(['/hse/ppe', ppe.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(hseErrorKey(error));
      },
    });
  }
}
