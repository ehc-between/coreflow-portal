import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { RecurrencePicker } from '../../shared/tasks/recurrence-picker';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import {
  FRAMEWORKS,
  FrameworkKey,
  MAX_REQUIREMENTS,
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  ObligationStatus,
} from './data/obligation.models';
import { frameworkKey } from './data/obligation-display';
import {
  ObligationFormValue,
  isObligationType,
  validateObligationForm,
} from './data/obligation-form-model';

export interface ObligationFormSubmit {
  readonly value: ObligationFormValue;
  readonly changeReason: string;
}

/**
 * The obligation form (create and edit). `value` seeds the form and is re-applied
 * when the page replaces it (e.g. after accepting an AI proposal); every edit is
 * emitted on `changed`. Content projected as `[proposal]` sits next to the
 * requirements (the AI button). In edit mode a change reason is asked for, which
 * the revision history records.
 */
@Component({
  selector: 'app-obligation-form',
  imports: [TranslocoPipe, AskAbout, FieldHelp, RecurrencePicker, Button, Card, FormField, Icon],
  providers: [provideTranslocoScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'obligations.form.sections.basics' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <app-form-field [label]="'obligations.fields.title' | transloco" inputId="cf-o-title">
              <input
                id="cf-o-title"
                type="text"
                maxlength="255"
                required
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-o-title-err' : null"
                data-testid="obligation-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as key) {
              <p id="cf-o-title-err" class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.obligationType' | transloco"
              inputId="cf-o-type"
            >
              <select
                id="cf-o-type"
                (change)="setType($any($event.target).value)"
                data-testid="obligation-type"
              >
                @for (t of types; track t) {
                  <option [value]="t" [selected]="form().obligation_type === t">
                    {{ 'obligations.types.' + t | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="obligation_type" />
          </div>
          <div>
            <app-form-field [label]="'obligations.fields.status' | transloco" inputId="cf-o-status">
              <select id="cf-o-status" (change)="setStatus($any($event.target).value)">
                @for (s of statuses; track s) {
                  <option [value]="s" [selected]="form().status === s">
                    {{ 'obligations.status.' + s | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="status" />
          </div>
          <div>
            <app-form-field [label]="'obligations.fields.owner' | transloco" inputId="cf-o-owner">
              <select id="cf-o-owner" (change)="set('owner_user_id', $any($event.target).value)">
                @if (mode() === 'create') {
                  <option value="" [selected]="!form().owner_user_id">
                    {{ 'obligations.form.ownerMe' | transloco }}
                  </option>
                }
                @if (ownerOrphan()) {
                  <option [value]="form().owner_user_id" selected>
                    {{ ownerName() || ('obligations.form.currentOwner' | transloco) }}
                  </option>
                }
                @for (u of users(); track u.id) {
                  <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                    {{ u.label }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="owner" />
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.department' | transloco"
              inputId="cf-o-dept"
            >
              <select id="cf-o-dept" (change)="set('department_id', $any($event.target).value)">
                <option value="" [selected]="!form().department_id">
                  {{ 'obligations.form.noDepartment' | transloco }}
                </option>
                @for (d of departments(); track d.id) {
                  <option [value]="d.id" [selected]="form().department_id === d.id">
                    {{ d.label }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.fields.description' | transloco"
              inputId="cf-o-description"
            >
              <textarea
                id="cf-o-description"
                rows="3"
                maxlength="20000"
                [value]="form().description"
                (input)="set('description', $any($event.target).value)"
              ></textarea>
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="description" />
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'obligations.form.sections.source' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <app-form-field [label]="'obligations.fields.issuer' | transloco" inputId="cf-o-issuer">
              <input
                id="cf-o-issuer"
                type="text"
                maxlength="255"
                [value]="form().issuer"
                (input)="set('issuer', $any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="issuer" />
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.reference' | transloco"
              inputId="cf-o-reference"
            >
              <input
                id="cf-o-reference"
                type="text"
                maxlength="255"
                [value]="form().reference"
                (input)="set('reference', $any($event.target).value)"
              />
            </app-form-field>
            <app-field-help scope="obligations" page="form" field="reference" />
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.jurisdiction' | transloco"
              inputId="cf-o-jurisdiction"
            >
              <input
                id="cf-o-jurisdiction"
                type="text"
                maxlength="64"
                [placeholder]="'obligations.form.jurisdictionPlaceholder' | transloco"
                [value]="form().jurisdiction"
                (input)="set('jurisdiction', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.sourceUrl' | transloco"
              inputId="cf-o-source"
            >
              <input
                id="cf-o-source"
                type="url"
                maxlength="1000"
                inputmode="url"
                placeholder="https://"
                [value]="form().source_url"
                (input)="set('source_url', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.validFrom' | transloco"
              inputId="cf-o-from"
            >
              <input
                id="cf-o-from"
                type="date"
                [value]="form().valid_from"
                (change)="set('valid_from', $any($event.target).value)"
              />
            </app-form-field>
          </div>
          <div>
            <app-form-field
              [label]="'obligations.fields.validUntil' | transloco"
              inputId="cf-o-until"
            >
              <input
                id="cf-o-until"
                type="date"
                [value]="form().valid_until"
                (change)="set('valid_until', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['valid_until']"
                [attr.aria-describedby]="shownErrors()['valid_until'] ? 'cf-o-until-err' : null"
              />
            </app-form-field>
            @if (shownErrors()['valid_until']; as key) {
              <p id="cf-o-until-err" class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
            }
            <app-field-help scope="obligations" page="form" field="valid_until" />
          </div>
        </div>
      </app-card>

      <app-card>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-display text-[16px] font-bold text-fg">
            {{ 'obligations.form.sections.requirements' | transloco }}
          </h2>
          <ng-content select="[proposal]" />
        </div>
        <div class="flex flex-col gap-4">
          <div>
            <div class="flex items-end gap-1">
              <div class="flex-1">
                <app-form-field
                  [label]="'obligations.fields.applicability' | transloco"
                  inputId="cf-o-applicability"
                >
                  <textarea
                    id="cf-o-applicability"
                    rows="3"
                    maxlength="20000"
                    [value]="form().applicability"
                    (input)="set('applicability', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
              <app-ask-about
                [prompt]="'obligations.ask.applicability' | transloco"
                field="applicability"
              />
            </div>
            <app-field-help scope="obligations" page="form" field="applicability" />
          </div>

          <fieldset>
            <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
              {{ 'obligations.fields.requirements' | transloco }}
            </legend>
            <app-field-help scope="obligations" page="form" field="requirements" />
            @if (form().requirements.length === 0) {
              <p class="mt-2 text-[13px] text-fg-muted">
                {{ 'obligations.form.noRequirements' | transloco }}
              </p>
            }
            <ol class="mt-2 flex flex-col gap-2" data-testid="requirement-rows">
              @for (r of form().requirements; track $index; let i = $index) {
                <li class="flex items-start gap-2">
                  <span class="mt-2 w-6 flex-none text-right text-[12px] text-fg-subtle"
                    >{{ i + 1 }}.</span
                  >
                  <label class="sr-only" [for]="'cf-o-req-' + i">
                    {{ 'obligations.form.requirementLabel' | transloco: { n: i + 1 } }}
                  </label>
                  <textarea
                    [id]="'cf-o-req-' + i"
                    rows="2"
                    maxlength="1000"
                    class="min-w-0 flex-1 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
                    [value]="r"
                    (input)="setRequirement(i, $any($event.target).value)"
                  ></textarea>
                  <app-button
                    variant="ghost"
                    size="sm"
                    [attr.aria-label]="
                      'obligations.form.removeRequirement' | transloco: { n: i + 1 }
                    "
                    (click)="removeRequirement(i)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </app-button>
                </li>
              }
            </ol>
            <div class="mt-2">
              <app-button
                variant="secondary"
                size="sm"
                [disabled]="form().requirements.length >= maxRequirements"
                (click)="addRequirement()"
                data-testid="add-requirement"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'obligations.form.addRequirement' | transloco }}
              </app-button>
            </div>
            @if (shownErrors()['requirements']; as key) {
              <p class="mt-1 text-[12px] text-fail">
                {{ key | transloco: { max: maxRequirements } }}
              </p>
            }
          </fieldset>

          <fieldset>
            <legend class="mb-2 text-[13px] font-semibold text-fg-muted">
              {{ 'obligations.fields.frameworks' | transloco }}
            </legend>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              @for (f of frameworkOptions; track f) {
                <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="form().frameworks.includes(f)"
                    (change)="toggleFramework(f, $any($event.target).checked)"
                  />
                  {{ frameworkKey(f) | transloco }}
                </label>
              }
            </div>
            <app-field-help scope="obligations" page="form" field="frameworks" />
          </fieldset>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-2 font-display text-[16px] font-bold text-fg">
          {{ 'obligations.form.sections.evaluation' | transloco }}
        </h2>
        <app-field-help scope="obligations" page="form" field="evaluation" />
        <label class="mt-3 flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="form().evaluate"
            (change)="set('evaluate', $any($event.target).checked)"
            data-testid="obligation-evaluate"
          />
          {{ 'obligations.form.scheduleEvaluation' | transloco }}
        </label>
        @if (form().evaluate) {
          <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <app-recurrence-picker
                [rrule]="form().evaluation_rrule"
                (rruleChange)="set('evaluation_rrule', $event)"
                idPrefix="cf-o-rrule"
              />
              @if (shownErrors()['evaluation_rrule']; as key) {
                <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
              }
            </div>
            <div>
              <app-form-field
                [label]="'obligations.fields.evaluationStart' | transloco"
                inputId="cf-o-eval-start"
              >
                <input
                  id="cf-o-eval-start"
                  type="date"
                  [value]="form().evaluation_start"
                  (change)="set('evaluation_start', $any($event.target).value)"
                />
              </app-form-field>
              <p class="mt-1 text-[12px] text-fg-subtle">
                {{ 'obligations.form.evaluationStartHint' | transloco }}
              </p>
            </div>
            <div>
              <app-form-field
                [label]="'obligations.fields.evaluationLeadDays' | transloco"
                inputId="cf-o-lead"
              >
                <input
                  id="cf-o-lead"
                  type="number"
                  min="0"
                  max="366"
                  inputmode="numeric"
                  [value]="form().evaluation_lead_days"
                  (input)="set('evaluation_lead_days', $any($event.target).value)"
                  [attr.aria-invalid]="!!shownErrors()['evaluation_lead_days']"
                />
              </app-form-field>
              @if (shownErrors()['evaluation_lead_days']; as key) {
                <p class="mt-1 text-[12px] text-fail">{{ key | transloco }}</p>
              }
              <app-field-help scope="obligations" page="form" field="evaluation_lead_days" />
            </div>
          </div>
        } @else if (mode() === 'edit' && value().evaluate) {
          <p class="mt-2 text-[12.5px] text-warn" role="status">
            {{ 'obligations.form.scheduleStops' | transloco }}
          </p>
        }
      </app-card>

      @if (mode() === 'edit') {
        <app-card>
          <app-form-field
            [label]="'obligations.form.changeReason' | transloco"
            inputId="cf-o-reason"
          >
            <input
              id="cf-o-reason"
              type="text"
              maxlength="1000"
              [placeholder]="'obligations.form.changeReasonPlaceholder' | transloco"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
          @if (form().status === 'retired' && value().status !== 'retired') {
            <p class="mt-2 text-[12.5px] text-fg-muted">
              {{ 'obligations.form.retireNotice' | transloco }}
            </p>
          }
        </app-card>
      }

      <div class="flex flex-wrap justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button
          type="submit"
          [loading]="busy()"
          [disabled]="busy()"
          data-testid="obligation-save"
        >
          {{ (mode() === 'create' ? 'obligations.form.create' : 'common.save') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class ObligationForm {
  private readonly assignees = inject(AssigneeOptionsService);

  readonly value = input.required<ObligationFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly changed = output<ObligationFormValue>();
  readonly submitted = output<ObligationFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly types = OBLIGATION_TYPES;
  protected readonly statuses = OBLIGATION_STATUSES;
  protected readonly frameworkOptions = FRAMEWORKS;
  protected readonly frameworkKey = frameworkKey;
  protected readonly maxRequirements = MAX_REQUIREMENTS;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  private readonly attempted = signal(false);

  protected readonly errors = computed(() => validateObligationForm(this.form()));
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Format problems show as soon as they exist; a missing title only after submitting.
    return this.attempted()
      ? errors
      : Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'title'));
  });

  protected readonly users = computed(() =>
    this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label })),
  );
  protected readonly ownerOrphan = computed(() => {
    const id = this.form().owner_user_id;
    return !!id && !this.users().some((u) => u.id === id);
  });
  protected readonly departments = computed(() =>
    this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
  );

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected set<K extends keyof ObligationFormValue>(key: K, value: ObligationFormValue[K]): void {
    this.update({ [key]: value } as Partial<ObligationFormValue>);
  }

  protected setType(value: string): void {
    if (isObligationType(value)) {
      this.update({ obligation_type: value });
    }
  }

  protected setStatus(value: string): void {
    if ((OBLIGATION_STATUSES as readonly string[]).includes(value)) {
      this.update({ status: value as ObligationStatus });
    }
  }

  protected toggleFramework(framework: FrameworkKey, on: boolean): void {
    const current = this.form().frameworks.filter((f) => f !== framework);
    this.update({ frameworks: on ? [...current, framework] : current });
  }

  protected addRequirement(): void {
    const list = this.form().requirements;
    if (list.length < MAX_REQUIREMENTS) {
      this.update({ requirements: [...list, ''] });
    }
  }

  protected setRequirement(index: number, value: string): void {
    this.update({
      requirements: this.form().requirements.map((r, i) => (i === index ? value : r)),
    });
  }

  protected removeRequirement(index: number): void {
    this.update({ requirements: this.form().requirements.filter((_, i) => i !== index) });
  }

  protected submit(): void {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length > 0 || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }

  private update(patch: Partial<ObligationFormValue>): void {
    const next = { ...this.form(), ...patch };
    this.form.set(next);
    this.changed.emit(next);
  }
}
