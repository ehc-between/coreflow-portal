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
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
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

const TEXTAREA =
  'w-full rounded-tile border border-border bg-bg px-3 py-2 text-body text-fg outline-none focus:border-accent';
const LABEL = 'mb-1.5 flex items-center gap-1 text-ui font-semibold text-fg-muted';

/**
 * The feedback form (create and edit). `value` seeds the form; every edit is
 * emitted on `changed`. The reply date is filled from the module's default
 * response time for the kind (until the user picks a date). In edit mode the
 * resolution, "customer informed", the complaint assessment and a change reason
 * (kept in the revision history) are shown.
 */
@Component({
  selector: 'app-feedback-form',
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, Card, FormField, FeedbackSubjectPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'feedback.form.sections.what' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset class="sm:col-span-2">
            <legend [class]="label">
              {{ 'feedback.fields.kind' | transloco }}
              <app-field-help scope="feedback" page="form" field="kind" />
              <app-ask-about
                [prompt]="'feedback.ask.kind' | transloco"
                field="kind"
                [fieldLabel]="'feedback.fields.kind' | transloco"
              />
            </legend>
            <div class="flex flex-wrap gap-2" role="radiogroup">
              @for (k of kinds; track k) {
                <label
                  class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
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
            <p class="mt-1.5 text-meta text-fg-subtle">
              {{ 'feedback.form.kindHint.' + form().kind | transloco }}
            </p>
          </fieldset>
          <div class="sm:col-span-2">
            <app-form-field [label]="'feedback.fields.title' | transloco" inputId="cf-fb-title">
              <input
                id="cf-fb-title"
                type="text"
                maxlength="255"
                required
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [placeholder]="'feedback.form.titlePlaceholder' | transloco"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-fb-title-err' : null"
                data-testid="field-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as e) {
              <p id="cf-fb-title-err" class="mt-1 text-meta text-fail">{{ e | transloco }}</p>
            }
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'feedback.fields.description' | transloco"
              inputId="cf-fb-description"
            >
              <textarea
                id="cf-fb-description"
                rows="5"
                maxlength="20000"
                [value]="form().description"
                (input)="set('description', $any($event.target).value)"
                aria-describedby="cf-fb-description-hint"
              ></textarea>
            </app-form-field>
            <p id="cf-fb-description-hint" class="mt-1 text-meta text-fg-subtle">
              {{ 'feedback.form.descriptionHint' | transloco }}
            </p>
          </div>
          <app-form-field [label]="'feedback.fields.channel' | transloco" inputId="cf-fb-channel">
            <select id="cf-fb-channel" (change)="set('channel', $any($event.target).value)">
              @for (c of channels; track c) {
                <option [value]="c" [selected]="form().channel === c">
                  {{ channelKey(c) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="'feedback.fields.receivedOn' | transloco"
            inputId="cf-fb-received"
          >
            <input
              id="cf-fb-received"
              type="date"
              [value]="form().received_on"
              (change)="setReceived($any($event.target).value)"
            />
          </app-form-field>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 flex items-center gap-1 font-display text-section font-bold text-fg">
          {{ 'feedback.form.sections.about' | transloco }}
          <app-field-help scope="feedback" page="form" field="subjects" />
        </h2>
        <p class="mb-4 text-meta text-fg-muted">{{ 'feedback.form.aboutHint' | transloco }}</p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <p [class]="label" id="cf-fb-subjects-label">
              {{ 'feedback.subjects.title' | transloco }}
            </p>
            <div role="group" aria-labelledby="cf-fb-subjects-label">
              <app-feedback-subject-picker
                [picked]="form().subjects"
                (selected)="addSubject($event)"
                (removed)="removeSubject($event)"
              />
            </div>
            @if (shownErrors()['subjects']; as e) {
              <p class="mt-1 text-meta text-fail">{{ e | transloco }}</p>
            }
          </div>
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
          <div>
            <app-form-field
              [label]="'feedback.fields.category' | transloco"
              inputId="cf-fb-category"
            >
              <input
                id="cf-fb-category"
                type="text"
                maxlength="64"
                list="cf-fb-category-options"
                autocomplete="off"
                [value]="form().category"
                (input)="set('category', $any($event.target).value)"
                aria-describedby="cf-fb-category-hint"
                data-testid="field-category"
              />
            </app-form-field>
            <datalist id="cf-fb-category-options">
              @for (c of categories(); track c) {
                <option [value]="c"></option>
              }
            </datalist>
            <p id="cf-fb-category-hint" class="mt-1 text-meta text-fg-subtle">
              {{ 'feedback.form.categoryHint' | transloco }}
            </p>
          </div>
          <div class="sm:col-span-2">
            <app-form-field [label]="'feedback.fields.tags' | transloco" inputId="cf-fb-tags">
              <input
                id="cf-fb-tags"
                type="text"
                [value]="form().tags"
                (input)="set('tags', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['tags']"
                aria-describedby="cf-fb-tags-hint"
              />
            </app-form-field>
            <p id="cf-fb-tags-hint" class="mt-1 text-meta text-fg-subtle">
              {{ 'feedback.form.tagsHint' | transloco }}
            </p>
            @if (shownErrors()['tags']; as e) {
              <p class="mt-1 text-meta text-fail">{{ e | transloco }}</p>
            }
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 font-display text-section font-bold text-fg">
          {{ 'feedback.form.sections.impact' | transloco }}
        </h2>
        <p class="mb-4 text-meta text-fg-muted">{{ 'feedback.form.impactHint' | transloco }}</p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label for="cf-fb-severity" [class]="label">
              {{ 'feedback.fields.severity' | transloco }}
              <app-field-help scope="feedback" page="form" field="severity" />
              <app-ask-about
                [prompt]="'feedback.ask.severity' | transloco"
                field="severity"
                [fieldLabel]="'feedback.fields.severity' | transloco"
              />
            </label>
            <app-form-field inputId="cf-fb-severity">
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
          </div>
          <div>
            <label for="cf-fb-score" [class]="label">
              {{ 'feedback.fields.satisfactionScore' | transloco }}
              <app-field-help scope="feedback" page="form" field="satisfaction_score" />
            </label>
            <app-form-field inputId="cf-fb-score">
              <select
                id="cf-fb-score"
                (change)="set('satisfaction_score', $any($event.target).value)"
              >
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
          </div>
          <div>
            <label for="cf-fb-sentiment" [class]="label">
              {{ 'feedback.fields.sentiment' | transloco }}
              <app-field-help scope="feedback" page="form" field="sentiment" />
            </label>
            <app-form-field inputId="cf-fb-sentiment">
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
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 flex items-center gap-1 font-display text-section font-bold text-fg">
          {{ 'feedback.form.sections.customer' | transloco }}
          <app-field-help scope="feedback" page="form" field="customer" />
        </h2>
        <p class="mb-4 text-meta text-fg-muted">
          {{ 'feedback.form.customerHint' | transloco }}
        </p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field
            [label]="'feedback.fields.customerName' | transloco"
            inputId="cf-fb-cname"
          >
            <input
              id="cf-fb-cname"
              type="text"
              maxlength="255"
              autocomplete="off"
              [value]="form().customer_name"
              (input)="set('customer_name', $any($event.target).value)"
            />
          </app-form-field>
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
          <div>
            <app-form-field
              [label]="'feedback.fields.customerEmail' | transloco"
              inputId="cf-fb-cemail"
            >
              <input
                id="cf-fb-cemail"
                type="email"
                autocomplete="off"
                [value]="form().customer_email"
                (input)="set('customer_email', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['customer_email']"
              />
            </app-form-field>
            @if (shownErrors()['customer_email']; as e) {
              <p class="mt-1 text-meta text-fail">{{ e | transloco }}</p>
            }
          </div>
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
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-section font-bold text-fg">
          {{ 'feedback.form.sections.handling' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="cf-fb-due" [class]="label">
              {{ 'feedback.fields.responseDueOn' | transloco }}
              <app-field-help scope="feedback" page="form" field="response_due_on" />
            </label>
            <app-form-field inputId="cf-fb-due">
              <input
                id="cf-fb-due"
                type="date"
                [value]="form().response_due_on"
                (change)="setDue($any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['response_due_on']"
                aria-describedby="cf-fb-due-hint"
                data-testid="field-due"
              />
            </app-form-field>
            <p id="cf-fb-due-hint" class="mt-1 text-meta text-fg-subtle" data-testid="due-hint">
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
            @if (shownErrors()['response_due_on']; as e) {
              <p class="mt-1 text-meta text-fail">{{ e | transloco }}</p>
            }
          </div>
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
        </div>
      </app-card>

      @if (mode() === 'edit') {
        @if (form().kind === 'complaint') {
          <app-card>
            <h2 class="mb-1 font-display text-section font-bold text-fg">
              {{ 'feedback.assessment.title' | transloco }}
            </h2>
            <p class="mb-4 text-meta text-fg-muted">
              {{ 'feedback.assessment.intro' | transloco }}
            </p>
            <div class="flex flex-col gap-4">
              @for (q of assessment; track q.key) {
                <fieldset>
                  <legend [class]="label">
                    {{ q.labelKey | transloco }}
                    <app-field-help scope="feedback" page="detail" [field]="q.key" />
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
              <div>
                <label for="cf-fb-root-cause" [class]="label">
                  {{ 'feedback.assessment.rootCause' | transloco }}
                  <app-field-help scope="feedback" page="detail" field="root_cause" />
                </label>
                <textarea
                  id="cf-fb-root-cause"
                  rows="3"
                  maxlength="20000"
                  [class]="textarea"
                  [value]="form().root_cause"
                  (input)="set('root_cause', $any($event.target).value)"
                ></textarea>
              </div>
            </div>
          </app-card>
        }

        <app-card>
          <h2 class="mb-4 font-display text-section font-bold text-fg">
            {{ 'feedback.form.sections.outcome' | transloco }}
          </h2>
          <div class="flex flex-col gap-4">
            <div>
              <label for="cf-fb-resolution" [class]="label">
                {{ 'feedback.fields.resolution' | transloco }}
                <app-ask-about
                  [prompt]="'feedback.ask.resolution' | transloco"
                  field="resolution"
                  [fieldLabel]="'feedback.fields.resolution' | transloco"
                />
              </label>
              <textarea
                id="cf-fb-resolution"
                rows="4"
                maxlength="20000"
                [class]="textarea"
                [value]="form().resolution"
                (input)="set('resolution', $any($event.target).value)"
              ></textarea>
            </div>
            <label class="inline-flex items-center gap-2 text-ui text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().customer_informed"
                (change)="set('customer_informed', $any($event.target).checked)"
              />
              {{ 'feedback.fields.customerInformed' | transloco }}
            </label>
            <app-form-field
              [label]="'feedback.form.changeReason' | transloco"
              inputId="cf-fb-reason"
            >
              <input
                id="cf-fb-reason"
                type="text"
                maxlength="1000"
                [value]="changeReason()"
                (input)="changeReason.set($any($event.target).value)"
                aria-describedby="cf-fb-reason-hint"
              />
            </app-form-field>
            <p id="cf-fb-reason-hint" class="-mt-3 text-meta text-fg-subtle">
              {{ 'feedback.form.changeReasonHint' | transloco }}
            </p>
          </div>
        </app-card>
      }

      @if (attempted() && hasErrors()) {
        <p class="text-ui text-fail" role="alert">{{ 'feedback.form.fixProblems' | transloco }}</p>
      }

      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
      >
        <app-button variant="ghost" (click)="cancelled.emit()">
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
      </div>
    </form>
  `,
})
export class FeedbackForm {
  private readonly assignees = inject(AssigneeOptionsService);
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

  protected readonly label = LABEL;
  protected readonly textarea = TEXTAREA;
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
