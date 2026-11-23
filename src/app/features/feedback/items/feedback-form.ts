import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { EntityRefDto } from '../../../core/entities/entity.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { CustomerPicker, CustomerRef, CustomersAvailability } from '../../../shared/customers';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { FeedbackApi } from '../data/feedback-api';
import {
  feedbackChannelKey,
  feedbackKindKey,
  feedbackSentimentKey,
  feedbackSeverityKey,
} from '../data/feedback-display';
import { FeedbackFormValue, YesNo, validateFeedbackForm } from '../data/feedback-form-model';
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SEVERITIES,
  FeedbackKind,
  ResponseDue,
} from '../data/feedback.models';
import { FeedbackSubjectPicker } from '../subject-picker';
import { YES_NO_OPTIONS } from './feedback-assessment';

export interface FeedbackFormSubmit {
  readonly value: FeedbackFormValue;
  readonly changeReason: string;
}

/**
 * The feedback form (create and edit). `value` seeds the form; every edit is
 * emitted on `changed`. The reply date is filled from the module's default
 * response time for the kind (until the user picks a date). In edit mode the
 * resolution, "customer informed", the complaint assessment and a change reason
 * (kept in the revision history) are shown.
 */
@Component({
  selector: 'app-feedback-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    Button,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    FeedbackSubjectPicker,
    CustomerPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'feedback.form.sections.what' | transloco"
        [description]="'feedback.form.sections.whatHint' | transloco"
      >
        <fieldset class="sm:col-span-2">
          <legend
            class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
          >
            {{ 'feedback.fields.kind' | transloco }}
            <app-field-help
              scope="feedback"
              page="form"
              field="kind"
              [label]="'feedback.fields.kind' | transloco"
            />
            <app-ask-about
              class="-my-0.5"
              [prompt]="'feedback.ask.kind' | transloco"
              field="kind"
              [fieldLabel]="'feedback.fields.kind' | transloco"
            />
          </legend>
          <div class="flex flex-wrap gap-2" role="radiogroup">
            @for (k of kinds; track k) {
              <label
                class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-tile border px-3.5 text-ui font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                [class]="
                  form().kind === k
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border text-fg-muted hover:text-fg'
                "
              >
                <input
                  type="radio"
                  name="cf-fb-kind"
                  class="sr-only"
                  [value]="k"
                  [checked]="form().kind === k"
                  (change)="setKind(k)"
                  [attr.data-testid]="'kind-' + k"
                />
                {{ kindKey(k) | transloco }}
              </label>
            }
          </div>
          <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
            {{ 'feedback.form.kindHint.' + form().kind | transloco }}
          </p>
        </fieldset>
        <app-form-field
          span="full"
          [label]="'feedback.fields.title' | transloco"
          inputId="cf-fb-title"
          [required]="true"
          [error]="shownErrors()['title'] ?? '' | transloco"
        >
          <input
            id="cf-fb-title"
            type="text"
            maxlength="255"
            required
            [value]="form().title"
            (input)="set('title', $any($event.target).value)"
            [placeholder]="'feedback.form.titlePlaceholder' | transloco"
            data-testid="field-title"
          />
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'feedback.fields.description' | transloco"
          inputId="cf-fb-description"
          [hint]="'feedback.form.descriptionHint' | transloco"
        >
          <textarea
            id="cf-fb-description"
            rows="5"
            maxlength="20000"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field [label]="'feedback.fields.channel' | transloco" inputId="cf-fb-channel">
          <select id="cf-fb-channel" (change)="set('channel', $any($event.target).value)">
            @for (c of channels; track c) {
              <option [value]="c" [selected]="form().channel === c">
                {{ channelKey(c) | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'feedback.fields.receivedOn' | transloco" inputId="cf-fb-received">
          <app-date-input
            inputId="cf-fb-received"
            [value]="form().received_on"
            (changed)="setReceived($event)"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'feedback.form.sections.about' | transloco"
        [description]="'feedback.form.aboutHint' | transloco"
      >
        <app-field-help
          title-suffix
          scope="feedback"
          page="form"
          field="subjects"
          [label]="'feedback.form.sections.about' | transloco"
        />
        <app-form-field
          span="full"
          [label]="'feedback.subjects.title' | transloco"
          [error]="shownErrors()['subjects'] ?? '' | transloco"
        >
          <app-feedback-subject-picker
            [picked]="form().subjects"
            (selected)="addSubject($event)"
            (removed)="removeSubject($event)"
          />
        </app-form-field>
        <app-form-field
          [label]="'feedback.fields.productOrService' | transloco"
          inputId="cf-fb-product"
        >
          <input
            id="cf-fb-product"
            type="text"
            maxlength="255"
            [value]="form().product_or_service"
            (input)="set('product_or_service', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'feedback.fields.category' | transloco"
          inputId="cf-fb-category"
          [hint]="'feedback.form.categoryHint' | transloco"
        >
          <input
            id="cf-fb-category"
            type="text"
            maxlength="64"
            list="cf-fb-category-options"
            autocomplete="off"
            [value]="form().category"
            (input)="set('category', $any($event.target).value)"
            data-testid="field-category"
          />
          <datalist id="cf-fb-category-options">
            @for (c of categories(); track c) {
              <option [value]="c"></option>
            }
          </datalist>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'feedback.fields.tags' | transloco"
          inputId="cf-fb-tags"
          [hint]="'feedback.form.tagsHint' | transloco"
          [error]="shownErrors()['tags'] ?? '' | transloco"
        >
          <input
            id="cf-fb-tags"
            type="text"
            [value]="form().tags"
            (input)="set('tags', $any($event.target).value)"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'feedback.form.sections.impact' | transloco"
        [description]="'feedback.form.impactHint' | transloco"
      >
        <app-form-field [label]="'feedback.fields.severity' | transloco" inputId="cf-fb-severity">
          <app-field-help
            label-suffix
            scope="feedback"
            page="form"
            field="severity"
            [label]="'feedback.fields.severity' | transloco"
          />
          <app-ask-about
            label-suffix
            class="-my-0.5"
            [prompt]="'feedback.ask.severity' | transloco"
            field="severity"
            [fieldLabel]="'feedback.fields.severity' | transloco"
          />
          <select id="cf-fb-severity" (change)="set('severity', $any($event.target).value)">
            <option value="" [selected]="!form().severity">
              {{ 'feedback.common.none' | transloco }}
            </option>
            @for (s of severities; track s) {
              <option [value]="s" [selected]="form().severity === s">
                {{ severityKey(s) | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          [label]="'feedback.fields.satisfactionScore' | transloco"
          inputId="cf-fb-score"
        >
          <app-field-help
            label-suffix
            scope="feedback"
            page="form"
            field="satisfaction_score"
            [label]="'feedback.fields.satisfactionScore' | transloco"
          />
          <select id="cf-fb-score" (change)="set('satisfaction_score', $any($event.target).value)">
            <option value="" [selected]="!form().satisfaction_score">
              {{ 'feedback.form.scoreUnknown' | transloco }}
            </option>
            @for (n of scores; track n) {
              <option [value]="n" [selected]="form().satisfaction_score === n">
                {{ 'feedback.form.scoreOption.' + n | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'feedback.fields.sentiment' | transloco" inputId="cf-fb-sentiment">
          <app-field-help
            label-suffix
            scope="feedback"
            page="form"
            field="sentiment"
            [label]="'feedback.fields.sentiment' | transloco"
          />
          <select id="cf-fb-sentiment" (change)="set('sentiment', $any($event.target).value)">
            <option value="" [selected]="!form().sentiment">
              {{ 'feedback.common.none' | transloco }}
            </option>
            @for (s of sentiments; track s) {
              <option [value]="s" [selected]="form().sentiment === s">
                {{ sentimentKey(s) | transloco }}
              </option>
            }
          </select>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'feedback.form.sections.customer' | transloco"
        [description]="'feedback.form.customerHint' | transloco"
      >
        <app-field-help
          title-suffix
          scope="feedback"
          page="form"
          field="customer"
          [label]="'feedback.form.sections.customer' | transloco"
        />
        @if (customers.enabled()) {
          <app-form-field
            span="full"
            [label]="'feedback.fields.customer' | transloco"
            inputId="cf-fb-customer"
          >
            <app-customer-picker
              inputId="cf-fb-customer"
              [value]="form().customer_id || null"
              [current]="form().customer"
              (valueChange)="set('customer_id', $event ?? '')"
              (refChange)="set('customer', $event)"
              data-testid="feedback-customer"
            />
          </app-form-field>
        }
        <app-form-field [label]="'feedback.fields.customerName' | transloco" inputId="cf-fb-cname">
          <input
            id="cf-fb-cname"
            type="text"
            maxlength="255"
            autocomplete="off"
            [value]="form().customer_name"
            (input)="set('customer_name', $any($event.target).value)"
          />
        </app-form-field>
        <!-- The free-text organisation gives way to the Kunde field; kept for old records. -->
        @if (!customers.enabled() || (!form().customer_id && form().customer_organisation)) {
          <app-form-field
            [label]="'feedback.fields.customerOrganisation' | transloco"
            inputId="cf-fb-corg"
          >
            <input
              id="cf-fb-corg"
              type="text"
              maxlength="255"
              autocomplete="off"
              [value]="form().customer_organisation"
              (input)="set('customer_organisation', $any($event.target).value)"
            />
          </app-form-field>
        }
        <app-form-field
          [label]="'feedback.fields.customerEmail' | transloco"
          inputId="cf-fb-cemail"
          [error]="shownErrors()['customer_email'] ?? '' | transloco"
        >
          <input
            id="cf-fb-cemail"
            type="email"
            autocomplete="off"
            [value]="form().customer_email"
            (input)="set('customer_email', $any($event.target).value)"
          />
        </app-form-field>
        <app-form-field
          [label]="'feedback.fields.customerPhone' | transloco"
          inputId="cf-fb-cphone"
        >
          <input
            id="cf-fb-cphone"
            type="tel"
            maxlength="64"
            autocomplete="off"
            [value]="form().customer_phone"
            (input)="set('customer_phone', $any($event.target).value)"
          />
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'feedback.form.sections.handling' | transloco"
        [description]="'feedback.form.sections.handlingHint' | transloco"
      >
        <app-form-field
          [label]="'feedback.fields.responseDueOn' | transloco"
          inputId="cf-fb-due"
          [error]="shownErrors()['response_due_on'] ?? '' | transloco"
        >
          <app-field-help
            label-suffix
            scope="feedback"
            page="form"
            field="response_due_on"
            [label]="'feedback.fields.responseDueOn' | transloco"
          />
          <app-date-input
            inputId="cf-fb-due"
            [value]="form().response_due_on"
            [invalid]="!!shownErrors()['response_due_on']"
            (changed)="setDue($event)"
            data-testid="field-due"
          />
          <p hint class="text-meta leading-snug text-fg-subtle" data-testid="due-hint">
            @if (defaultDue(); as d) {
              {{
                (d.days === null
                  ? 'feedback.form.dueNoDefault'
                  : d.working_days
                    ? 'feedback.form.dueDefaultWorking'
                    : 'feedback.form.dueDefault'
                ) | transloco: { days: d.days, kind: (kindKey(d.kind) | transloco) }
              }}
            } @else {
              {{ 'feedback.form.dueHint' | transloco }}
            }
          </p>
        </app-form-field>
        <app-form-field [label]="'feedback.fields.owner' | transloco" inputId="cf-fb-owner">
          <select id="cf-fb-owner" (change)="set('owner_user_id', $any($event.target).value)">
            <option value="" [selected]="!form().owner_user_id">
              {{
                (mode() === 'create' ? 'feedback.form.ownerMe' : 'feedback.form.ownerKeep')
                  | transloco
              }}
            </option>
            @if (ownerOrphan()) {
              <option [value]="form().owner_user_id" selected>
                {{ ownerName() || ('feedback.form.currentOwner' | transloco) }}
              </option>
            }
            @for (u of users(); track u.id) {
              <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                {{ u.label }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'feedback.fields.department' | transloco" inputId="cf-fb-dept">
          <select id="cf-fb-dept" (change)="set('department_id', $any($event.target).value)">
            <option value="" [selected]="!form().department_id">
              {{ 'feedback.common.none' | transloco }}
            </option>
            @for (d of departments(); track d.id) {
              <option [value]="d.id" [selected]="form().department_id === d.id">
                {{ d.label }}
              </option>
            }
          </select>
        </app-form-field>
      </app-form-section>

      @if (mode() === 'edit') {
        @if (form().kind === 'complaint') {
          <app-form-section
            [title]="'feedback.assessment.title' | transloco"
            [description]="'feedback.assessment.intro' | transloco"
            [columns]="1"
          >
            @for (q of assessment; track q.key) {
              <fieldset>
                <legend
                  class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
                >
                  {{ q.labelKey | transloco }}
                  <app-field-help
                    scope="feedback"
                    page="detail"
                    [field]="q.key"
                    [label]="q.labelKey | transloco"
                  />
                </legend>
                <div class="flex flex-wrap gap-2" role="radiogroup">
                  @for (o of choices; track o) {
                    <label [class]="choiceClass(form()[q.key] === o)">
                      <input
                        type="radio"
                        class="sr-only"
                        [name]="'cf-fb-' + q.key"
                        [checked]="form()[q.key] === o"
                        (change)="set(q.key, o)"
                      />
                      {{ 'feedback.assessment.answers.' + (o || 'unset') | transloco }}
                    </label>
                  }
                </div>
              </fieldset>
            }
            <app-form-field
              [label]="'feedback.assessment.rootCause' | transloco"
              inputId="cf-fb-root-cause"
            >
              <app-field-help
                label-suffix
                scope="feedback"
                page="detail"
                field="root_cause"
                [label]="'feedback.assessment.rootCause' | transloco"
              />
              <textarea
                id="cf-fb-root-cause"
                rows="3"
                maxlength="20000"
                [value]="form().root_cause"
                (input)="set('root_cause', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </app-form-section>
        }

        <app-form-section
          [title]="'feedback.form.sections.outcome' | transloco"
          [description]="'feedback.form.sections.outcomeHint' | transloco"
        >
          <app-form-field
            span="full"
            [label]="'feedback.fields.resolution' | transloco"
            inputId="cf-fb-resolution"
          >
            <app-ask-about
              label-suffix
              class="-my-0.5"
              [prompt]="'feedback.ask.resolution' | transloco"
              field="resolution"
              [fieldLabel]="'feedback.fields.resolution' | transloco"
            />
            <textarea
              id="cf-fb-resolution"
              rows="4"
              maxlength="20000"
              [value]="form().resolution"
              (input)="set('resolution', $any($event.target).value)"
            ></textarea>
          </app-form-field>
          <label
            class="flex h-10 cursor-pointer items-center gap-2.5 rounded-tile border border-border bg-bg px-3 text-ui text-fg sm:col-span-2"
          >
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().customer_informed"
              (change)="set('customer_informed', $any($event.target).checked)"
            />
            {{ 'feedback.fields.customerInformed' | transloco }}
          </label>
        </app-form-section>

        <app-form-section [columns]="1">
          <app-form-field
            [label]="'feedback.form.changeReason' | transloco"
            inputId="cf-fb-reason"
            [hint]="'feedback.form.changeReasonHint' | transloco"
          >
            <input
              id="cf-fb-reason"
              type="text"
              maxlength="1000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="attempted() && hasErrors() ? ('feedback.form.fixProblems' | transloco) : ''"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button
          type="submit"
          [loading]="busy()"
          [disabled]="busy()"
          data-testid="feedback-save"
        >
          {{ (mode() === 'create' ? 'feedback.form.create' : 'feedback.form.save') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class FeedbackForm {
  private readonly assignees = inject(AssigneeOptionsService);
  protected readonly customers = inject(CustomersAvailability);
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly value = input.required<FeedbackFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly changed = output<FeedbackFormValue>();
  readonly submitted = output<FeedbackFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly channels = FEEDBACK_CHANNELS;
  protected readonly severities = FEEDBACK_SEVERITIES;
  protected readonly sentiments = FEEDBACK_SENTIMENTS;
  protected readonly scores = ['1', '2', '3', '4', '5'] as const;
  protected readonly choices: readonly YesNo[] = [...YES_NO_OPTIONS, ''];
  protected readonly assessment = [
    { key: 'complaint_justified', labelKey: 'feedback.assessment.justified' },
    { key: 'corrective_action_required', labelKey: 'feedback.assessment.correctiveAction' },
    { key: 'customer_accepted', labelKey: 'feedback.assessment.customerAccepted' },
  ] as const;
  protected readonly kindKey = feedbackKindKey;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly sentimentKey = feedbackSentimentKey;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  protected readonly attempted = signal(false);
  protected readonly categories = signal<readonly string[]>([]);
  /** The default reply date last applied, for the hint under the field. */
  protected readonly defaultDue = signal<ResponseDue | null>(null);
  /** The user picked a reply date themselves: stop filling it in. */
  private readonly dueTouched = linkedSignal(
    () => this.mode() === 'edit' || !!this.value().response_due_on,
  );

  protected readonly errors = computed(() => validateFeedbackForm(this.form()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Format problems show at once; a missing title only after a submit attempt.
    if (this.attempted()) {
      return errors;
    }
    return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'title'));
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

  private dueRequest = new Subscription();

  constructor() {
    this.assignees.ensureLoaded();
    inject(DestroyRef).onDestroy(() => this.dueRequest.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (!orgId) {
        return;
      }
      untracked(() =>
        this.api.categories(orgId).subscribe({
          next: (res) => this.categories.set(res.items.map((c) => c.value)),
          error: () => this.categories.set([]),
        }),
      );
    });
    // The first default reply date for a new record.
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId && this.mode() === 'create') {
        untracked(() => this.fillDue());
      }
    });
  }

  protected choiceClass(active: boolean): string {
    const tone = active
      ? 'border-accent bg-accent-soft text-accent'
      : 'border-border text-fg-muted hover:text-fg';
    return `inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${tone}`;
  }

  protected set<K extends keyof FeedbackFormValue>(key: K, value: FeedbackFormValue[K]): void {
    const next = { ...this.form(), [key]: value };
    this.form.set(next);
    this.changed.emit(next);
  }

  protected setKind(kind: FeedbackKind): void {
    this.set('kind', kind);
    this.fillDue();
  }

  protected setReceived(day: string): void {
    this.set('received_on', day);
    this.fillDue();
  }

  protected setDue(day: string): void {
    this.dueTouched.set(!!day);
    this.defaultDue.set(null);
    this.set('response_due_on', day);
  }

  protected addSubject(ref: EntityRefDto): void {
    const list = this.form().subjects;
    if (!list.some((r) => r.entity_type === ref.entity_type && r.entity_id === ref.entity_id)) {
      this.set('subjects', [...list, ref]);
    }
  }

  protected removeSubject(ref: EntityRefDto): void {
    this.set(
      'subjects',
      this.form().subjects.filter(
        (r) => !(r.entity_type === ref.entity_type && r.entity_id === ref.entity_id),
      ),
    );
  }

  /** Prefill the Kunde field (create-from-customer, `?customer_id=`) unless already set. */
  patchCustomer(id: string | null, ref: CustomerRef | null = null): void {
    const current = this.form();
    if (!id || current.customer_id) {
      return;
    }
    const next: FeedbackFormValue = { ...current, customer_id: id, customer: ref };
    this.form.set(next);
    this.changed.emit(next);
  }

  /** Fill fields that are still empty (values from a create-from-here flow). */
  patchEmpty(values: Partial<Pick<FeedbackFormValue, 'title' | 'description'>>): void {
    const current = this.form();
    const next: FeedbackFormValue = {
      ...current,
      title: values.title && !current.title.trim() ? values.title.slice(0, 255) : current.title,
      description:
        values.description && !current.description.trim()
          ? values.description
          : current.description,
    };
    this.form.set(next);
    this.changed.emit(next);
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.hasErrors() || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }

  /** Fill the reply date from the module's default response time (until the user picks one). */
  private fillDue(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.dueTouched()) {
      return;
    }
    const { kind, received_on } = this.form();
    this.dueRequest.unsubscribe();
    this.dueRequest = this.api.responseDue(orgId, kind, received_on).subscribe({
      next: (due) => {
        if (this.dueTouched()) {
          return;
        }
        this.defaultDue.set(due);
        this.set('response_due_on', due.response_due_on ?? '');
      },
      error: () => this.defaultDue.set(null),
    });
  }
}
