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
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';
import {
  CLOSE_OUTCOMES,
  CloseOutcome,
  OpenItemsDetail,
  ProjectCloseBody,
  ProjectDetail,
  isOneOf,
} from './data/project.models';
import { openItemsOf, projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { LessonDraft, LessonEditor, emptyLessonDraft, lessonBody } from './project-lessons';

/** The close-out request: lessons without a title are dropped. */
export function closeBody(
  outcome: CloseOutcome,
  summary: string,
  lessons: readonly LessonDraft[],
): ProjectCloseBody {
  return {
    outcome,
    closeout_summary: summary.trim() || null,
    lessons: lessons.filter((l) => l.title.trim()).map(lessonBody),
  };
}

/** Whether the close-out can be sent: completing needs a summary. */
export function canSubmitClose(outcome: CloseOutcome, summary: string): boolean {
  return outcome === 'cancelled' || !!summary.trim();
}

/**
 * Close a project (side panel): completed or cancelled, a close-out summary, and
 * the lessons learned. Completing is refused while milestones, design reviews or
 * tasks are open (the counts are shown); cancelling cancels the open tasks.
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
        <fieldset>
          <legend class="mb-2 text-[13px] font-semibold text-fg-muted">
            {{ 'projects.closeout.outcome' | transloco }}
          </legend>
          <div class="flex flex-col gap-2">
            @for (o of outcomes; track o) {
              <label
                class="flex cursor-pointer items-start gap-2 rounded-tile border border-border p-3 text-[13.5px]"
                [class.border-accent]="outcome() === o"
              >
                <input
                  type="radio"
                  name="cf-close-outcome"
                  class="mt-0.5 accent-[var(--accent)]"
                  [value]="o"
                  [checked]="outcome() === o"
                  (change)="setOutcome(o)"
                  [attr.data-testid]="'outcome-' + o"
                />
                <span>
                  <span class="block font-semibold text-fg">{{
                    'projects.closeout.outcomes.' + o | transloco
                  }}</span>
                  <span class="block text-[12.5px] text-fg-muted">{{
                    'projects.closeout.outcomeHints.' + o | transloco
                  }}</span>
                </span>
              </label>
            }
          </div>
        </fieldset>

        @if (outcome() === 'completed') {
          <ul class="flex flex-col gap-1 text-[12.5px]" data-testid="closeout-checklist">
            @for (c of checklist(); track c.key) {
              <li
                class="flex items-center gap-2"
                [class.text-fail]="c.open > 0"
                [class.text-fg-muted]="c.open === 0"
              >
                <app-icon [name]="c.open > 0 ? 'alert' : 'checkcircle'" [size]="14" />
                {{ 'projects.closeout.checklist.' + c.key | transloco: { count: c.open } }}
              </li>
            }
          </ul>
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

        <div>
          <app-form-field
            [label]="
              (outcome() === 'completed'
                ? 'projects.closeout.summaryRequired'
                : 'projects.closeout.summary'
              ) | transloco
            "
            inputId="cf-close-summary"
          >
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
          <app-field-help scope="projects" page="closeout" field="summary" />
        </div>

        <div>
          <h3 class="mb-1 text-[13.5px] font-semibold text-fg">
            {{ 'projects.closeout.lessons' | transloco }}
          </h3>
          <p class="mb-2 text-[12.5px] text-fg-muted">
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
                    class="rounded-[8px] px-2 py-1 text-[12px] font-semibold text-fg-muted hover:bg-surface-2"
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

        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <app-button variant="ghost" (click)="cancelled.emit()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            [variant]="outcome() === 'cancelled' ? 'danger' : 'primary'"
            [loading]="busy()"
            [disabled]="busy() || !canSubmit()"
            data-testid="closeout-submit"
          >
            {{ 'projects.closeout.submit.' + outcome() | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class ProjectCloseout {
  private readonly api = inject(ProjectsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly project = input.required<ProjectDetail>();
  readonly open = input(false);
  readonly closed = output<ProjectDetail>();
  readonly cancelled = output<void>();

  protected readonly outcomes = CLOSE_OUTCOMES;
  protected readonly outcome = signal<CloseOutcome>('completed');
  protected readonly summary = signal('');
  protected readonly lessons = signal<readonly LessonDraft[]>([]);
  protected readonly busy = signal(false);
  protected readonly openItems = signal<OpenItemsDetail | null>(null);
  protected readonly canSubmit = computed(() => canSubmitClose(this.outcome(), this.summary()));

  /** What still blocks a completed close-out, from the project's progress. */
  protected readonly checklist = computed(() => {
    const p = this.project().progress;
    return [
      { key: 'milestones', open: Math.max(0, p.milestones_total - p.milestones_done) },
      { key: 'reviews', open: p.design_reviews_pending },
      { key: 'tasks', open: p.tasks_open },
    ];
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.outcome.set('completed');
          this.summary.set('');
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
    if (!orgId || this.busy() || !this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.openItems.set(null);
    const body = closeBody(this.outcome(), this.summary(), this.lessons());
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
