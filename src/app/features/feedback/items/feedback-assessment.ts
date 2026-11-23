import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { YesNo, fromYesNo, yesNo } from '../data/feedback-form-model';
import { Feedback } from '../data/feedback.models';

export const YES_NO_OPTIONS = ['yes', 'no'] as const;

/** The i18n key of an assessment answer: yes, no or "not assessed yet". */
export function yesNoKey(value: boolean | null | undefined): string {
  return value === true
    ? 'feedback.assessment.answers.yes'
    : value === false
      ? 'feedback.assessment.answers.no'
      : 'feedback.assessment.answers.unset';
}

let nextId = 0;

/**
 * The complaint assessment (ISO 9001 10.2): was the complaint justified, what was
 * the root cause, is corrective action needed, and did the customer accept the
 * outcome. Shown on complaints only; editable in place. A justified complaint that
 * needs corrective action is a nonconformity: the page offers "Registrer avvik".
 */
@Component({
  selector: 'app-feedback-assessment',
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, Icon, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = feedback();
    <section [attr.aria-labelledby]="headingId" data-testid="feedback-assessment">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2
          [id]="headingId"
          class="flex items-center gap-1 font-display text-card font-bold text-fg"
        >
          {{ 'feedback.assessment.title' | transloco }}
          <app-ask-about
            [prompt]="'feedback.ask.assessment' | transloco"
            field="complaint_justified"
            [fieldLabel]="'feedback.assessment.justified' | transloco"
            [requirements]="['iso9001:10.2.1']"
          />
        </h2>
        @if (canEdit() && !editing()) {
          <app-button size="sm" variant="secondary" (click)="edit()" data-testid="assess">
            {{
              (f.complaint_justified === null
                ? 'feedback.assessment.start'
                : 'feedback.assessment.change'
              ) | transloco
            }}
          </app-button>
        }
      </div>
      <p class="mb-3 text-meta text-fg-muted">{{ 'feedback.assessment.intro' | transloco }}</p>

      @if (!editing()) {
        <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-ui sm:grid-cols-2">
          <div>
            <dt class="text-meta text-fg-subtle">
              {{ 'feedback.assessment.justified' | transloco }}
            </dt>
            <dd
              class="font-semibold"
              [class.text-fg]="f.complaint_justified !== null"
              [class.text-fg-muted]="f.complaint_justified === null"
              data-testid="assessment-justified"
            >
              {{ answerKey(f.complaint_justified) | transloco }}
            </dd>
          </div>
          <div>
            <dt class="text-meta text-fg-subtle">
              {{ 'feedback.assessment.correctiveAction' | transloco }}
            </dt>
            <dd class="text-fg">{{ answerKey(f.corrective_action_required) | transloco }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-meta text-fg-subtle">
              {{ 'feedback.assessment.rootCause' | transloco }}
            </dt>
            <dd class="whitespace-pre-line text-fg" data-testid="assessment-root-cause">
              {{ f.root_cause || ('feedback.assessment.noRootCause' | transloco) }}
            </dd>
          </div>
          <div>
            <dt class="text-meta text-fg-subtle">
              {{ 'feedback.assessment.customerAccepted' | transloco }}
            </dt>
            <dd class="text-fg">{{ answerKey(f.customer_accepted) | transloco }}</dd>
          </div>
        </dl>
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
          @for (q of questions; track q.key) {
            <fieldset>
              <legend
                class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
              >
                {{ q.labelKey | transloco }}
                <app-field-help scope="feedback" page="detail" [field]="q.help" />
              </legend>
              <div class="flex flex-wrap gap-2" role="radiogroup">
                @for (o of options; track o) {
                  <label
                    class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                    [class]="
                      draft()[q.key] === o
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-fg-muted hover:text-fg'
                    "
                  >
                    <input
                      type="radio"
                      class="sr-only"
                      [name]="radioName + q.key"
                      [checked]="draft()[q.key] === o"
                      (change)="setAnswer(q.key, o)"
                      [attr.data-testid]="q.key + '-' + o"
                    />
                    {{ 'feedback.assessment.answers.' + o | transloco }}
                  </label>
                }
              </div>
            </fieldset>
          }
          <app-form-field [label]="'feedback.assessment.rootCause' | transloco" [inputId]="causeId">
            <app-field-help
              label-suffix
              scope="feedback"
              page="detail"
              field="root_cause"
              [label]="'feedback.assessment.rootCause' | transloco"
            />
            <textarea
              [id]="causeId"
              rows="3"
              maxlength="20000"
              [value]="rootCause()"
              (input)="rootCause.set($any($event.target).value)"
              [placeholder]="'feedback.assessment.rootCausePlaceholder' | transloco"
              data-testid="assessment-root-cause-input"
            ></textarea>
          </app-form-field>
          <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <app-button variant="secondary" size="sm" (click)="editing.set(false)">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" size="sm" [loading]="busy()" [disabled]="busy()">
              <app-icon name="check" [size]="14" />
              {{ 'feedback.assessment.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </section>
  `,
})
export class FeedbackAssessment {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly feedback = input.required<Feedback>();
  readonly canEdit = input(false);
  readonly saved = output<Feedback>();

  private readonly uid = ++nextId;
  protected readonly headingId = `cf-fb-assess-${this.uid}`;
  protected readonly causeId = `cf-fb-assess-cause-${this.uid}`;
  protected readonly radioName = `cf-fb-assess-${this.uid}-`;
  protected readonly options = YES_NO_OPTIONS;
  protected readonly answerKey = yesNoKey;
  protected readonly questions = [
    {
      key: 'complaint_justified',
      labelKey: 'feedback.assessment.justified',
      help: 'complaint_justified',
    },
    {
      key: 'corrective_action_required',
      labelKey: 'feedback.assessment.correctiveAction',
      help: 'corrective_action_required',
    },
    {
      key: 'customer_accepted',
      labelKey: 'feedback.assessment.customerAccepted',
      help: 'customer_accepted',
    },
  ] as const;

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly draft = signal<Record<string, YesNo>>({});
  protected readonly rootCause = signal('');

  /** Open the assessment form (also used by the "what is missing" list). */
  edit(): void {
    const f = this.feedback();
    this.draft.set({
      complaint_justified: yesNo(f.complaint_justified),
      corrective_action_required: yesNo(f.corrective_action_required),
      customer_accepted: yesNo(f.customer_accepted),
    });
    this.rootCause.set(f.root_cause ?? '');
    this.editing.set(true);
  }

  protected setAnswer(key: string, value: YesNo): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const f = this.feedback();
    if (!orgId || this.busy()) {
      return;
    }
    const d = this.draft();
    this.busy.set(true);
    this.api
      .update(orgId, f.id, {
        complaint_justified: fromYesNo(d['complaint_justified'] ?? ''),
        corrective_action_required: fromYesNo(d['corrective_action_required'] ?? ''),
        customer_accepted: fromYesNo(d['customer_accepted'] ?? ''),
        root_cause: this.rootCause().trim() || null,
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.editing.set(false);
          this.notifications.success('feedback.notices.assessmentSaved');
          this.saved.emit(updated);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(feedbackErrorKey(error));
        },
      });
  }
}
