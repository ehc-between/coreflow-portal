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
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import {
  feedbackChannelKey,
  feedbackKindKey,
  feedbackSentimentKey,
  feedbackSeverityKey,
} from '../data/feedback-display';
import { FeedbackFormValue, validateFeedbackForm } from '../data/feedback-form-model';
import {
  FEEDBACK_CHANNELS,
  FEEDBACK_KINDS,
  FEEDBACK_SENTIMENTS,
  FEEDBACK_SEVERITIES,
} from '../data/feedback.models';

export interface FeedbackFormSubmit {
  readonly value: FeedbackFormValue;
  readonly changeReason: string;
}

const INPUT =
  'h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent';
const TEXTAREA =
  'w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13.5px] text-fg outline-none focus:border-accent';

/**
 * The feedback form (create and edit). `value` seeds the form; every edit is
 * emitted on `changed`. In edit mode the resolution and "customer informed"
 * fields are shown and a change reason is asked for (kept in the revision history).
 */
@Component({
  selector: 'app-feedback-form',
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, Card, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'feedback.form.sections.what' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset class="sm:col-span-2">
            <legend class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted">
              {{ 'feedback.fields.kind' | transloco }}
              <app-field-help scope="feedback" page="form" field="kind" />
            </legend>
            <div class="flex flex-wrap gap-2" role="radiogroup">
              @for (k of kinds; track k) {
                <label
                  class="inline-flex cursor-pointer items-center gap-2 rounded-tile border px-3 py-1.5 text-[13px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
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
                    (change)="set('kind', k)"
                    [attr.data-testid]="'kind-' + k"
                  />
                  {{ kindKey(k) | transloco }}
                </label>
              }
            </div>
          </fieldset>
          <div class="sm:col-span-2">
            <app-form-field [label]="'feedback.fields.title' | transloco" inputId="cf-fb-title">
              <input
                id="cf-fb-title"
                type="text"
                maxlength="255"
                required
                [class]="input"
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-fb-title-err' : null"
                data-testid="field-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as e) {
              <p id="cf-fb-title-err" class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
          <div class="sm:col-span-2">
            <label
              for="cf-fb-description"
              class="mb-1.5 block text-[13px] font-semibold text-fg-muted"
            >
              {{ 'feedback.fields.description' | transloco }}
            </label>
            <textarea
              id="cf-fb-description"
              rows="5"
              maxlength="20000"
              [class]="textarea"
              [value]="form().description"
              (input)="set('description', $any($event.target).value)"
            ></textarea>
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'feedback.form.descriptionHint' | transloco }}
            </p>
          </div>
          <app-form-field [label]="'feedback.fields.channel' | transloco" inputId="cf-fb-channel">
            <select
              id="cf-fb-channel"
              [class]="input"
              (change)="set('channel', $any($event.target).value)"
            >
              @for (c of channels; track c) {
                <option [value]="c" [selected]="form().channel === c">
                  {{ channelKey(c) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'feedback.fields.category' | transloco" inputId="cf-fb-category">
            <input
              id="cf-fb-category"
              type="text"
              maxlength="64"
              [class]="input"
              [value]="form().category"
              (input)="set('category', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <label
              for="cf-fb-severity"
              class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
            >
              {{ 'feedback.fields.severity' | transloco }}
              <app-field-help scope="feedback" page="form" field="severity" />
            </label>
            <select
              id="cf-fb-severity"
              [class]="input"
              (change)="set('severity', $any($event.target).value)"
            >
              <option value="" [selected]="!form().severity">
                {{ 'feedback.common.none' | transloco }}
              </option>
              @for (s of severities; track s) {
                <option [value]="s" [selected]="form().severity === s">
                  {{ severityKey(s) | transloco }}
                </option>
              }
            </select>
          </div>
          <app-form-field
            [label]="'feedback.fields.sentiment' | transloco"
            inputId="cf-fb-sentiment"
          >
            <select
              id="cf-fb-sentiment"
              [class]="input"
              (change)="set('sentiment', $any($event.target).value)"
            >
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
          <app-form-field
            [label]="'feedback.fields.productOrService' | transloco"
            inputId="cf-fb-product"
          >
            <input
              id="cf-fb-product"
              type="text"
              maxlength="255"
              [class]="input"
              [value]="form().product_or_service"
              (input)="set('product_or_service', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <app-form-field [label]="'feedback.fields.tags' | transloco" inputId="cf-fb-tags">
              <input
                id="cf-fb-tags"
                type="text"
                [class]="input"
                [value]="form().tags"
                (input)="set('tags', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['tags']"
              />
            </app-form-field>
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'feedback.form.tagsHint' | transloco }}
            </p>
            @if (shownErrors()['tags']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-1 flex items-center gap-1 font-display text-[16px] font-bold text-fg">
          {{ 'feedback.form.sections.customer' | transloco }}
          <app-field-help scope="feedback" page="form" field="customer" />
        </h2>
        <p class="mb-4 text-[12.5px] text-fg-muted">
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
              [class]="input"
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
              [class]="input"
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
                [class]="input"
                [value]="form().customer_email"
                (input)="set('customer_email', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['customer_email']"
              />
            </app-form-field>
            @if (shownErrors()['customer_email']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
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
              [class]="input"
              [value]="form().customer_phone"
              (input)="set('customer_phone', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <label
              for="cf-fb-score"
              class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
            >
              {{ 'feedback.fields.satisfactionScore' | transloco }}
              <app-field-help scope="feedback" page="form" field="satisfaction_score" />
            </label>
            <select
              id="cf-fb-score"
              [class]="input"
              (change)="set('satisfaction_score', $any($event.target).value)"
            >
              <option value="" [selected]="!form().satisfaction_score">
                {{ 'feedback.common.none' | transloco }}
              </option>
              @for (n of scores; track n) {
                <option [value]="n" [selected]="form().satisfaction_score === n">
                  {{ 'feedback.form.scoreOption.' + n | transloco }}
                </option>
              }
            </select>
          </div>
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-[16px] font-bold text-fg">
          {{ 'feedback.form.sections.handling' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field
            [label]="'feedback.fields.receivedOn' | transloco"
            inputId="cf-fb-received"
          >
            <input
              id="cf-fb-received"
              type="date"
              [class]="input"
              [value]="form().received_on"
              (change)="set('received_on', $any($event.target).value)"
            />
          </app-form-field>
          <div>
            <label
              for="cf-fb-due"
              class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
            >
              {{ 'feedback.fields.responseDueOn' | transloco }}
              <app-field-help scope="feedback" page="form" field="response_due_on" />
            </label>
            <input
              id="cf-fb-due"
              type="date"
              [class]="input"
              [value]="form().response_due_on"
              (change)="set('response_due_on', $any($event.target).value)"
              [attr.aria-invalid]="!!shownErrors()['response_due_on']"
            />
            @if (shownErrors()['response_due_on']; as e) {
              <p class="mt-1 text-[12px] text-fail">{{ e | transloco }}</p>
            }
          </div>
          <app-form-field [label]="'feedback.fields.owner' | transloco" inputId="cf-fb-owner">
            <select
              id="cf-fb-owner"
              [class]="input"
              (change)="set('owner_user_id', $any($event.target).value)"
            >
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
            <select
              id="cf-fb-dept"
              [class]="input"
              (change)="set('department_id', $any($event.target).value)"
            >
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

        @if (mode() === 'edit') {
          <div class="mt-4 flex flex-col gap-4">
            <div>
              <label
                for="cf-fb-resolution"
                class="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
              >
                {{ 'feedback.fields.resolution' | transloco }}
                <app-ask-about
                  [prompt]="'feedback.ask.resolution' | transloco"
                  field="resolution"
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
            <label class="inline-flex items-center gap-2 text-[13px] text-fg">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[var(--accent)]"
                [checked]="form().customer_informed"
                (change)="set('customer_informed', $any($event.target).checked)"
              />
              {{ 'feedback.fields.customerInformed' | transloco }}
            </label>
          </div>
        }
      </app-card>

      @if (mode() === 'edit') {
        <app-card>
          <app-form-field [label]="'feedback.form.changeReason' | transloco" inputId="cf-fb-reason">
            <input
              id="cf-fb-reason"
              type="text"
              maxlength="1000"
              [class]="input"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
          <p class="mt-1 text-[12px] text-fg-subtle">
            {{ 'feedback.form.changeReasonHint' | transloco }}
          </p>
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

  readonly value = input.required<FeedbackFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly changed = output<FeedbackFormValue>();
  readonly submitted = output<FeedbackFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly input = INPUT;
  protected readonly textarea = TEXTAREA;
  protected readonly kinds = FEEDBACK_KINDS;
  protected readonly channels = FEEDBACK_CHANNELS;
  protected readonly severities = FEEDBACK_SEVERITIES;
  protected readonly sentiments = FEEDBACK_SENTIMENTS;
  protected readonly scores = ['1', '2', '3', '4', '5'] as const;
  protected readonly kindKey = feedbackKindKey;
  protected readonly channelKey = feedbackChannelKey;
  protected readonly severityKey = feedbackSeverityKey;
  protected readonly sentimentKey = feedbackSentimentKey;

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  private readonly attempted = signal(false);

  protected readonly errors = computed(() => validateFeedbackForm(this.form()));
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

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected set<K extends keyof FeedbackFormValue>(key: K, value: FeedbackFormValue[K]): void {
    const next = { ...this.form(), [key]: value };
    this.form.set(next);
    this.changed.emit(next);
  }

  protected submit(): void {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length > 0 || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }
}
