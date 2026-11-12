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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { RefSelect } from '../components/ref-select';
import { dateInputToIso, severityKey } from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences, NamedRef } from '../data/inspection-references';
import {
  CreateFindingRequest,
  Finding,
  InspectionDetail,
  SEVERITIES,
  Severity,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { parseAssignee } from './finding-panel';

export interface FindingDraft {
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly questionId: string;
  readonly ownerId: string;
  readonly dueDate: string;
  readonly actionTitle: string;
  readonly actionAssignee: string;
  readonly actionDue: string;
  readonly raiseDeviation: boolean;
}

export const EMPTY_FINDING: FindingDraft = {
  title: '',
  description: '',
  severity: 'medium',
  questionId: '',
  ownerId: '',
  dueDate: '',
  actionTitle: '',
  actionAssignee: '',
  actionDue: '',
  raiseDeviation: false,
};

export function toFindingRequest(d: FindingDraft): CreateFindingRequest {
  const actionTitle = d.actionTitle.trim();
  return {
    title: d.title.trim(),
    description: d.description.trim() || null,
    severity: d.severity,
    question_id: d.questionId || null,
    owner_user_id: d.ownerId || null,
    due_at: dateInputToIso(d.dueDate),
    action: actionTitle
      ? {
          title: actionTitle,
          assignee: parseAssignee(d.actionAssignee),
          due_at: dateInputToIso(d.actionDue),
        }
      : null,
    raise_deviation: d.raiseDeviation,
  };
}

/**
 * Raise a finding by hand on a started inspection: what was observed, severity, the
 * question it relates to, owner and due date, an optional first follow-up action
 * (an F2 task) and, with `deviations:write`, an immediate deviation.
 */
@Component({
  selector: 'app-finding-form',
  imports: [TranslocoPipe, FieldHelp, AssigneeSelect, Button, FormField, RefSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); save()">
      <app-form-field [label]="'inspections.fields.title' | transloco" inputId="ff-title">
        <input
          id="ff-title"
          required
          maxlength="255"
          [value]="draft().title"
          (input)="set('title', $any($event.target).value)"
          data-testid="finding-title"
        />
      </app-form-field>
      <app-form-field [label]="'inspections.fields.description' | transloco" inputId="ff-desc">
        <textarea
          id="ff-desc"
          rows="3"
          maxlength="20000"
          [value]="draft().description"
          (input)="set('description', $any($event.target).value)"
        ></textarea>
      </app-form-field>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <app-form-field [label]="'inspections.fields.severity' | transloco" inputId="ff-sev">
            <select id="ff-sev" (change)="set('severity', $any($event.target).value)">
              @for (s of severities; track s) {
                <option [value]="s" [selected]="s === draft().severity">
                  {{ severityKey(s) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-field-help scope="inspections" page="detail" field="severity" />
        </div>
        <app-form-field [label]="'inspections.fields.question' | transloco" inputId="ff-question">
          <app-ref-select
            inputId="ff-question"
            [options]="questionOptions()"
            [value]="draft().questionId"
            [noneLabel]="'inspections.findings.noQuestion' | transloco"
            (valueChange)="set('questionId', $event)"
          />
        </app-form-field>
        <app-form-field [label]="'inspections.fields.owner' | transloco" inputId="ff-owner">
          <app-ref-select
            inputId="ff-owner"
            [options]="references.users()"
            [value]="draft().ownerId"
            [noneLabel]="'inspections.form.noOwner' | transloco"
            (valueChange)="set('ownerId', $event)"
          />
        </app-form-field>
        <app-form-field [label]="'inspections.fields.dueAt' | transloco" inputId="ff-due">
          <input
            id="ff-due"
            type="date"
            [value]="draft().dueDate"
            (input)="set('dueDate', $any($event.target).value)"
          />
        </app-form-field>
      </div>

      <fieldset class="rounded-card border border-border p-3">
        <legend class="px-1 text-[13px] font-semibold text-fg-muted">
          {{ 'inspections.findings.firstAction' | transloco }}
        </legend>
        <div class="flex flex-col gap-2">
          <app-form-field
            [label]="'inspections.findings.actionTitle' | transloco"
            inputId="ff-action"
          >
            <input
              id="ff-action"
              maxlength="255"
              [value]="draft().actionTitle"
              (input)="set('actionTitle', $any($event.target).value)"
            />
          </app-form-field>
          @if (draft().actionTitle.trim()) {
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <app-form-field
                [label]="'inspections.findings.actionAssignee' | transloco"
                inputId="ff-assignee"
              >
                <app-assignee-select
                  inputId="ff-assignee"
                  [value]="draft().actionAssignee"
                  (valueChange)="set('actionAssignee', $event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'inspections.fields.dueAt' | transloco"
                inputId="ff-action-due"
              >
                <input
                  id="ff-action-due"
                  type="date"
                  [value]="draft().actionDue"
                  (input)="set('actionDue', $any($event.target).value)"
                />
              </app-form-field>
            </div>
          }
        </div>
      </fieldset>

      @if (canRaiseDeviation()) {
        <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--accent)]"
            [checked]="draft().raiseDeviation"
            (change)="set('raiseDeviation', $any($event.target).checked)"
          />
          {{ 'inspections.findings.raiseDeviation' | transloco }}
        </label>
      }

      <div class="flex justify-end gap-2">
        <app-button variant="ghost" (click)="cancelled.emit()">
          {{ 'inspections.actions.cancel' | transloco }}
        </app-button>
        <app-button
          type="submit"
          [loading]="saving()"
          [disabled]="!draft().title.trim()"
          data-testid="save-finding"
        >
          {{ 'inspections.findings.raise' | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class FindingForm {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly references = inject(InspectionReferences);

  readonly inspection = input.required<InspectionDetail>();
  /** Preselected question (e.g. "raise a finding" on an answer). */
  readonly questionId = input<string | null>(null);

  readonly saved = output<Finding>();
  readonly cancelled = output<void>();

  protected readonly severities = SEVERITIES;
  protected readonly severityKey = severityKey;
  protected readonly draft = linkedSignal<FindingDraft>(() => ({
    ...EMPTY_FINDING,
    questionId: this.questionId() ?? '',
  }));
  protected readonly saving = signal(false);

  protected readonly questionOptions = computed<NamedRef[]>(() =>
    this.inspection().questions.map((q, i) => ({ id: q.id, name: `${i + 1}. ${q.text}` })),
  );

  protected readonly canRaiseDeviation = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('deviations:write') ?? false,
  );

  constructor() {
    this.references.ensurePeople();
  }

  protected set<K extends keyof FindingDraft>(key: K, value: FindingDraft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d.title.trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.createFinding(orgId, this.inspection().id, toFindingRequest(d)).subscribe({
      next: (finding) => {
        this.saving.set(false);
        this.draft.set({ ...EMPTY_FINDING });
        this.notifications.success('inspections.notices.findingRaised', { code: finding.code });
        this.saved.emit(finding);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
