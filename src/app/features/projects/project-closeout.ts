import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  CLOSE_OUTCOMES,
  CloseOutcome,
  OBJECTIVE_MET,
  ObjectiveMet,
  OpenItemsDetail,
  ProjectCloseBody,
  ProjectDetail,
  isOneOf,
} from './data/project.models';
import { openItemsOf, projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { LessonDraft, LessonEditor, emptyLessonDraft, lessonBody } from './project-lessons';

/** Objective check and approval at close-out (ISO 9001 6.3 / 8.3.5). */
export interface CloseObjective {
  readonly met: ObjectiveMet | null;
  readonly evidence: string;
  readonly approverId: string;
}

/** The close-out request: lessons without a title are dropped. */
export function closeBody(
  outcome: CloseOutcome,
  summary: string,
  lessons: readonly LessonDraft[],
  objective: CloseObjective = { met: null, evidence: '', approverId: '' },
): ProjectCloseBody {
  const completed = outcome === 'completed';
  return {
    outcome,
    closeout_summary: summary.trim() || null,
    lessons: lessons.filter((l) => l.title.trim()).map(lessonBody),
    ...(completed && objective.met ? { objective_met: objective.met } : {}),
    ...(completed && objective.evidence.trim()
      ? { objective_evidence: objective.evidence.trim() }
      : {}),
    ...(objective.approverId ? { approver_user_id: objective.approverId } : {}),
  };
}

/** Whether the close-out can be sent: completing needs a summary and the objective check. */
export function canSubmitClose(
  outcome: CloseOutcome | null,
  summary: string,
  met: ObjectiveMet | null = 'yes',
): boolean {
  if (outcome === 'cancelled') {
    return true;
  }
  return outcome === 'completed' && !!summary.trim() && met !== null;
}

/** What still blocks a completed close-out (open counts), from the detail. */
export function closeChecklist(
  p: ProjectDetail,
): readonly { readonly key: string; readonly open: number }[] {
  const items = p.open_items;
  const progress = p.progress;
  const reviewActions = items?.open_review_actions ?? progress.review_actions_open ?? 0;
  const openTasks = items?.open_tasks ?? progress.tasks_open;
  return [
    {
      key: 'milestones',
      open:
        items?.open_milestones ?? Math.max(0, progress.milestones_total - progress.milestones_done),
    },
    { key: 'reviews', open: items?.pending_design_reviews ?? progress.design_reviews_pending },
    { key: 'reviewActions', open: reviewActions },
    // Review actions are tasks too; count the other tasks here.
    { key: 'tasks', open: Math.max(0, openTasks - reviewActions) },
  ];
}

/**
 * Close a project (side panel): completed or cancelled, the objective check
 * (met / partly / not, with evidence and who approved it), a close-out summary,
 * and the lessons learned. Completing is refused while milestones, design
 * reviews, review actions or tasks are open: the panel says so up front and
 * offers to show the open work; cancelling cancels the open tasks.
 */
@Component({
  selector: 'app-project-closeout',
  imports: [TranslocoPipe, FieldHelp, Alert, Button, FormField, Icon, SlideOver, LessonEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'projects.closeout.title' | transloco: { code: project().code }"
      [subtitle]="'projects.closeout.subtitle' | transloco"
      [closeLabel]="'projects.common.close' | transloco"
      [width]="600"
      (closed)="cancelled.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="rounded-tile border border-border bg-surface-2 p-3">
          <p class="text-meta font-semibold text-fg-muted">
            {{ 'projects.fields.objective' | transloco }}
          </p>
          <p class="mt-0.5 text-body whitespace-pre-line text-fg" data-testid="closeout-objective">
            {{ project().objective || ('projects.closeout.noObjective' | transloco) }}
          </p>
        </div>

        @if (blocked()) {
          <app-alert tone="info" data-testid="closeout-blocked">
            <p>{{ 'projects.closeout.blocked' | transloco }}</p>
            <ul class="mt-1 list-disc pl-5">
              @for (c of openChecklist(); track c.key) {
                <li>{{ 'projects.closeout.checklist.' + c.key | transloco: { count: c.open } }}</li>
              }
            </ul>
            <button
              type="button"
              class="mt-2 inline-flex min-h-7 items-center gap-1 font-semibold underline-offset-2 hover:underline"
              (click)="showOpenWork.emit()"
              data-testid="closeout-show-open"
            >
              {{ 'projects.closeout.showOpen' | transloco }}
              <app-icon name="arrow" [size]="13" />
            </button>
          </app-alert>
        }

        <fieldset>
          <legend class="mb-2 text-ui font-semibold text-fg-muted">
            {{ 'projects.closeout.outcome' | transloco }}
          </legend>
          <div class="flex flex-col gap-2">
            @for (o of outcomes; track o) {
              <label
                class="flex cursor-pointer items-start gap-2 rounded-tile border border-border p-3 text-body"
                [class.border-accent]="outcome() === o"
                [class.opacity-60]="o === 'completed' && blocked()"
              >
                <input
                  type="radio"
                  name="cf-close-outcome"
                  class="mt-1 accent-[var(--accent)]"
                  [value]="o"
                  [checked]="outcome() === o"
                  [disabled]="o === 'completed' && blocked()"
                  (change)="setOutcome(o)"
                  [attr.data-testid]="'outcome-' + o"
                />
                <span>
                  <span class="block font-semibold text-fg">{{
                    'projects.closeout.outcomes.' + o | transloco
                  }}</span>
                  <span class="block text-meta text-fg-muted">{{
                    'projects.closeout.outcomeHints.' + o | transloco
                  }}</span>
                </span>
              </label>
            }
          </div>
        </fieldset>

        @if (outcome() === 'completed') {
          <fieldset data-testid="closeout-objective-met">
            <legend
              class="mb-2 flex flex-wrap items-center gap-1.5 text-ui font-semibold text-fg-muted"
            >
              {{ 'projects.closeout.objectiveQuestion' | transloco }}
              <app-field-help scope="projects" page="closeout" field="objective_met" />
            </legend>
            <div class="flex flex-wrap gap-2">
              @for (m of metValues; track m) {
                <label
                  class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-tile border border-border px-3 text-body"
                  [class.border-accent]="met() === m"
                >
                  <input
                    type="radio"
                    name="cf-close-met"
                    class="accent-[var(--accent)]"
                    [checked]="met() === m"
                    (change)="met.set(m)"
                    [attr.data-testid]="'met-' + m"
                  />
                  {{ 'projects.closeout.objectiveMet.' + m | transloco }}
                </label>
              }
            </div>
          </fieldset>
          <app-form-field
            [label]="'projects.fields.objectiveEvidence' | transloco"
            inputId="cf-close-evidence"
          >
            <textarea
              id="cf-close-evidence"
              rows="3"
              maxlength="20000"
              [placeholder]="'projects.closeout.evidencePlaceholder' | transloco"
              [value]="evidence()"
              (input)="evidence.set($any($event.target).value)"
              data-testid="closeout-evidence"
            ></textarea>
          </app-form-field>
        }

        @if (outcome()) {
          <div>
            <app-form-field
              [label]="'projects.fields.closeoutApprovedBy' | transloco"
              inputId="cf-close-approver"
            >
              <select
                id="cf-close-approver"
                (change)="approverId.set($any($event.target).value)"
                data-testid="closeout-approver"
              >
                <option value="" [selected]="!approverId()">
                  {{ 'projects.closeout.noApprover' | transloco }}
                </option>
                @for (u of users(); track u.id) {
                  <option [value]="u.id" [selected]="approverId() === u.id">{{ u.label }}</option>
                }
              </select>
            </app-form-field>
            <p class="mt-1 text-meta text-fg-subtle">
              {{ 'projects.closeout.approverHint' | transloco }}
            </p>
          </div>

          <div>
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-close-summary" class="text-ui font-semibold text-fg-muted">{{
                (outcome() === 'completed'
                  ? 'projects.closeout.summaryRequired'
                  : 'projects.closeout.summary'
                ) | transloco
              }}</label>
              <app-field-help scope="projects" page="closeout" field="summary" />
            </div>
            <app-form-field inputId="cf-close-summary">
              <textarea
                id="cf-close-summary"
                rows="5"
                maxlength="20000"
                [value]="summary()"
                (input)="summary.set($any($event.target).value)"
                [attr.aria-required]="outcome() === 'completed'"
                data-testid="closeout-summary"
              ></textarea>
            </app-form-field>
          </div>

          <div>
            <h3 class="mb-1 text-body font-semibold text-fg">
              {{ 'projects.closeout.lessons' | transloco }}
            </h3>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'projects.closeout.lessonsHint' | transloco }}
            </p>
            <div class="flex flex-col gap-3">
              @for (l of lessons(); track $index; let i = $index) {
                <div class="rounded-tile border border-border p-3">
                  <app-lesson-editor
                    [value]="l"
                    [idPrefix]="'cf-close-lesson-' + i"
                    (valueChange)="setLesson(i, $event)"
                  />
                  <div class="mt-2 flex justify-end">
                    <button
                      type="button"
                      class="min-h-7 rounded-tile px-2 py-1 text-meta font-semibold text-fg-muted hover:bg-surface-2"
                      (click)="removeLesson(i)"
                    >
                      {{ 'projects.closeout.removeLesson' | transloco }}
                    </button>
                  </div>
                </div>
              }
            </div>
            <app-button
              class="mt-2 inline-block"
              variant="secondary"
              size="sm"
              (click)="addLesson()"
              data-testid="closeout-add-lesson"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'projects.closeout.addLesson' | transloco }}
            </app-button>
          </div>
        }

        @if (openItems(); as items) {
          <app-alert tone="error" data-testid="closeout-open-items">
            {{
              'projects.closeout.openItems'
                | transloco
                  : {
                      milestones: items.open_milestones,
                      reviews: items.pending_design_reviews,
                      tasks: items.open_tasks,
                    }
            }}
          </app-alert>
        }

        @if (missingHint(); as hint) {
          <p class="text-meta text-fg-muted" data-testid="closeout-missing">
            {{ hint | transloco }}
          </p>
        }

        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <app-button variant="secondary" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            [variant]="outcome() === 'cancelled' ? 'danger' : 'primary'"
            [loading]="busy()"
            [disabled]="busy() || !canSubmit()"
            data-testid="closeout-submit"
          >
            {{ 'projects.closeout.submit.' + (outcome() ?? 'none') | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class ProjectCloseout {
  private readonly api = inject(ProjectsApi);
  private readonly assignees = inject(AssigneeOptionsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly project = input.required<ProjectDetail>();
  readonly open = input(false);
  readonly closed = output<ProjectDetail>();
  readonly cancelled = output<void>();
  /** "Vis åpent arbeid": the page closes the panel and shows the plan. */
  readonly showOpenWork = output<void>();

  protected readonly outcomes = CLOSE_OUTCOMES;
  protected readonly metValues = OBJECTIVE_MET;
  protected readonly outcome = signal<CloseOutcome | null>('completed');
  protected readonly summary = signal('');
  protected readonly met = signal<ObjectiveMet | null>(null);
  protected readonly evidence = signal('');
  protected readonly approverId = signal('');
  protected readonly lessons = signal<readonly LessonDraft[]>([]);
  protected readonly busy = signal(false);
  protected readonly openItems = signal<OpenItemsDetail | null>(null);

  protected readonly checklist = computed(() => closeChecklist(this.project()));
  protected readonly openChecklist = computed(() => this.checklist().filter((c) => c.open > 0));
  /** Completing is not possible yet (open work). */
  protected readonly blocked = computed(() => this.openChecklist().length > 0);
  protected readonly canSubmit = computed(() =>
    canSubmitClose(this.outcome(), this.summary(), this.met()),
  );
  /** What is still missing before "Avslutt som fullført" can be pressed. */
  protected readonly missingHint = computed(() => {
    if (this.outcome() !== 'completed') {
      return this.outcome() ? null : 'projects.closeout.chooseOutcome';
    }
    if (this.met() === null) {
      return 'projects.closeout.missingObjective';
    }
    return this.summary().trim() ? null : 'projects.closeout.missingSummary';
  });
  protected readonly users = computed(() =>
    this.assignees
      .options()
      .users.map((o) => ({ id: o.value.slice(5), label: o.label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  constructor() {
    this.assignees.ensureLoaded();
    effect(() => {
      if (this.open()) {
        untracked(() => {
          // No default choice while completing is blocked.
          this.outcome.set(this.blocked() ? null : 'completed');
          this.summary.set('');
          this.met.set(null);
          this.evidence.set('');
          this.approverId.set('');
          this.lessons.set([emptyLessonDraft({ category: 'went_well' })]);
          this.openItems.set(null);
        });
      }
    });
  }

  protected setOutcome(value: string): void {
    if (isOneOf(CLOSE_OUTCOMES, value)) {
      this.outcome.set(value);
      this.openItems.set(null);
    }
  }

  protected addLesson(): void {
    this.lessons.update((l) => [...l, emptyLessonDraft()]);
  }

  protected setLesson(index: number, value: LessonDraft): void {
    this.lessons.update((l) => l.map((x, i) => (i === index ? value : x)));
  }

  protected removeLesson(index: number): void {
    this.lessons.update((l) => l.filter((_, i) => i !== index));
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const outcome = this.outcome();
    if (!orgId || !outcome || this.busy() || !this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.openItems.set(null);
    const body = closeBody(outcome, this.summary(), this.lessons(), {
      met: this.met(),
      evidence: this.evidence(),
      approverId: this.approverId(),
    });
    this.api.close(orgId, this.project().id, body).subscribe({
      next: (project) => {
        this.busy.set(false);
        this.notifications.success(`projects.notices.closed.${body.outcome}`, {
          code: project.code,
        });
        this.closed.emit(project);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const items = openItemsOf(error);
        if (items) {
          this.openItems.set(items);
        } else {
          this.notifications.error(projectErrorKey(error));
        }
      },
    });
  }
}
