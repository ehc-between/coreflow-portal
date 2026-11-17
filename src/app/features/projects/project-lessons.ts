import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, switchMap } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { FieldHelp } from '../../shared/guidance/field-help';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import {
  EntityRef,
  LESSON_CATEGORIES,
  Lesson,
  LessonCategory,
  LessonIn,
  isOneOf,
} from './data/project.models';
import { lessonCategoryBadge } from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';
import { ProjectRecordPicker } from './record-picker';

/** Record types a lesson can become (connect existing work). */
export const FOLLOW_UP_TYPES: readonly string[] = [
  'task',
  'risk',
  'opportunity',
  'deviation',
  'document',
];

export interface LessonDraft {
  readonly category: LessonCategory;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string;
}

export function emptyLessonDraft(patch: Partial<LessonDraft> = {}): LessonDraft {
  return { category: 'improve', title: '', description: '', recommendation: '', ...patch };
}

export function lessonBody(d: LessonDraft): LessonIn {
  return {
    category: d.category,
    title: d.title.trim(),
    description: d.description.trim() || null,
    recommendation: d.recommendation.trim() || null,
  };
}

/**
 * The lesson editor used inline in the lessons list and in the close-out dialog
 * (pure: emits the draft, the parent saves it).
 */
@Component({
  selector: 'app-lesson-editor',
  imports: [TranslocoPipe, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
      <app-form-field
        [label]="'projects.lessons.category' | transloco"
        [inputId]="idPrefix() + '-cat'"
      >
        <select [id]="idPrefix() + '-cat'" (change)="setCategory($any($event.target).value)">
          @for (c of categories; track c) {
            <option [value]="c" [selected]="value().category === c">
              {{ 'projects.lessonCategories.' + c | transloco }}
            </option>
          }
        </select>
      </app-form-field>
      <app-form-field
        [label]="'projects.lessons.what' | transloco"
        [inputId]="idPrefix() + '-title'"
      >
        <input
          [id]="idPrefix() + '-title'"
          type="text"
          maxlength="255"
          [value]="value().title"
          (input)="emit({ title: $any($event.target).value })"
          data-testid="lesson-title"
        />
      </app-form-field>
    </div>
    <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <app-form-field
        [label]="'projects.lessons.description' | transloco"
        [inputId]="idPrefix() + '-desc'"
      >
        <textarea
          [id]="idPrefix() + '-desc'"
          rows="2"
          maxlength="20000"
          [value]="value().description"
          (input)="emit({ description: $any($event.target).value })"
        ></textarea>
      </app-form-field>
      <app-form-field
        [label]="'projects.lessons.recommendation' | transloco"
        [inputId]="idPrefix() + '-rec'"
      >
        <textarea
          [id]="idPrefix() + '-rec'"
          rows="2"
          maxlength="20000"
          [value]="value().recommendation"
          (input)="emit({ recommendation: $any($event.target).value })"
        ></textarea>
      </app-form-field>
    </div>
  `,
})
export class LessonEditor {
  readonly value = input.required<LessonDraft>();
  readonly idPrefix = input('cf-lesson');
  readonly valueChange = output<LessonDraft>();

  protected readonly categories = LESSON_CATEGORIES;

  protected setCategory(value: string): void {
    if (isOneOf(LESSON_CATEGORIES, value)) {
      this.emit({ category: value });
    }
  }

  protected emit(patch: Partial<LessonDraft>): void {
    this.valueChange.emit({ ...this.value(), ...patch });
  }
}

/**
 * Lessons learned: what went well, what to improve, risks to remember. Recorded
 * while the project runs, at close-out or afterwards (also on a closed project).
 * A lesson leads somewhere (ISO 9001 10.3): it can become an improvement task,
 * a risk in the register, or be connected to existing work; those follow-ups are
 * shown on the lesson, and closed projects' lessons feed the management review.
 */
@Component({
  selector: 'app-project-lessons',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    FieldHelp,
    EntityChip,
    StatusBadge,
    Button,
    ConfirmDialog,
    ErrorState,
    Icon,
    LoadingState,
    LessonEditor,
    ProjectRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'projects.lessons.title' | transloco }}
        </h2>
        <app-field-help scope="projects" page="detail" field="lessons" />
      </div>
      @if (canContribute() && !draft()) {
        <app-button size="sm" variant="secondary" (click)="openNew()" data-testid="add-lesson">
          <app-icon name="plus" [size]="14" />
          {{ 'projects.lessons.add' | transloco }}
        </app-button>
      }
    </div>

    @if (draft(); as d) {
      <form
        class="mt-2 mb-3 rounded-tile border border-accent-border bg-accent-soft/40 p-3"
        (submit)="$event.preventDefault(); save()"
        novalidate
      >
        <app-lesson-editor
          [value]="d"
          idPrefix="cf-lesson-edit"
          (valueChange)="draft.set($event)"
        />
        <div class="mt-3 flex justify-end gap-2">
          <app-button variant="secondary" size="sm" (click)="cancel()">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            size="sm"
            [loading]="busy()"
            [disabled]="busy() || !d.title.trim()"
            data-testid="lesson-save"
          >
            {{ 'common.save' | transloco }}
          </app-button>
        </div>
      </form>
    }

    @switch (state()) {
      @case ('loading') {
        <app-loading-state [rows]="2" />
      }
      @case ('error') {
        <app-error-state (retry)="reload()" />
      }
      @default {
        @if (items().length === 0) {
          <p class="py-4 text-ui text-fg-muted" data-testid="lessons-empty">
            {{ 'projects.lessons.empty' | transloco }}
          </p>
        } @else {
          <ul class="mt-2 flex flex-col gap-2" data-testid="lessons">
            @for (l of items(); track l.id) {
              <li
                class="rounded-tile border border-border p-3"
                [attr.data-testid]="'lesson-' + l.id"
              >
                <div class="flex flex-wrap items-start gap-2">
                  <app-status-badge
                    [meaning]="badge(l.category).meaning"
                    [value]="badge(l.category).value"
                    [labelKey]="badge(l.category).labelKey"
                  />
                  <p class="min-w-0 flex-1 text-body font-semibold break-words text-fg">
                    {{ l.title }}
                  </p>
                  @if (canContribute()) {
                    <button
                      type="button"
                      class="min-h-7 rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft"
                      (click)="openEdit(l)"
                    >
                      {{ 'projects.common.edit' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fg"
                      [attr.aria-label]="
                        'projects.lessons.deleteNamed' | transloco: { title: l.title }
                      "
                      (click)="deleting.set(l)"
                    >
                      <app-icon name="trash" [size]="14" />
                    </button>
                  }
                </div>
                @if (l.description) {
                  <p class="mt-1.5 text-ui whitespace-pre-line text-fg-muted">
                    {{ l.description }}
                  </p>
                }
                @if (l.recommendation) {
                  <p class="mt-1.5 text-ui whitespace-pre-line text-fg">
                    <span class="font-semibold"
                      >{{ 'projects.lessons.recommendation' | transloco }}:</span
                    >
                    {{ l.recommendation }}
                  </p>
                }

                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                  <span class="text-meta font-semibold text-fg-muted">{{
                    'projects.lessons.followUps' | transloco
                  }}</span>
                  @for (f of l.follow_ups ?? []; track f.entity_type + f.entity_id) {
                    <span
                      class="inline-flex max-w-full items-center gap-1 rounded-full border border-border py-0.5 pr-1 pl-2"
                    >
                      <app-entity-chip [ref]="f" />
                      @if (canFollowUp()) {
                        <button
                          type="button"
                          class="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg"
                          [attr.aria-label]="
                            'projects.lessons.removeFollowUp'
                              | transloco: { name: f.code || f.title }
                          "
                          (click)="removeFollowUp(l, f)"
                        >
                          <app-icon name="x" [size]="12" />
                        </button>
                      }
                    </span>
                  } @empty {
                    <span class="text-meta text-fg-subtle" data-testid="lesson-no-follow-up">{{
                      'projects.lessons.noFollowUp' | transloco
                    }}</span>
                  }
                </div>
                @if (canFollowUp()) {
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class="inline-flex min-h-7 items-center gap-1 rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
                      [disabled]="busy()"
                      (click)="toTask(l)"
                      [attr.data-testid]="'lesson-to-task-' + l.id"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'projects.lessons.toTask' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-7 items-center gap-1 rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
                      [disabled]="flows.starting() !== null"
                      (click)="toRisk(l)"
                      [attr.data-testid]="'lesson-to-risk-' + l.id"
                    >
                      <app-icon name="risk" [size]="13" />
                      {{ 'projects.lessons.toRisk' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-7 items-center gap-1 rounded-tile px-2 py-1 text-meta font-semibold text-accent hover:bg-accent-soft"
                      [attr.aria-expanded]="connecting() === l.id"
                      (click)="connecting.set(connecting() === l.id ? null : l.id)"
                      [attr.data-testid]="'lesson-connect-' + l.id"
                    >
                      <app-icon name="link" [size]="13" />
                      {{ 'projects.lessons.connect' | transloco }}
                    </button>
                  </div>
                  @if (connecting() === l.id) {
                    <div class="mt-2">
                      <app-project-record-picker
                        [types]="followUpTypes"
                        [picked]="l.follow_ups ?? []"
                        [label]="'projects.lessons.connect' | transloco"
                        [placeholder]="'projects.lessons.connectPlaceholder' | transloco"
                        testId="lesson-picker"
                        (selected)="addFollowUp(l, $event)"
                      />
                    </div>
                  }
                }
                <p class="mt-1.5 text-meta text-fg-subtle">
                  {{
                    'projects.lessons.by'
                      | transloco
                        : { name: l.created_by?.name ?? '', date: (l.created_at | localDate) }
                  }}
                </p>
              </li>
            }
          </ul>
        }
      }
    }

    <app-confirm-dialog
      [open]="!!deleting()"
      [title]="'projects.lessons.deleteTitle' | transloco"
      [message]="'projects.lessons.deleteMessage' | transloco: { title: deleting()?.title ?? '' }"
      [confirmLabel]="'projects.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="deleting.set(null)"
    />
  `,
})
export class ProjectLessons {
  private readonly api = inject(ProjectsApi);
  private readonly tasksApi = inject(TasksApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly flows = inject(CreateFlowService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  /** Follow-ups (new task, risk, connect) are allowed on closed projects too. */
  readonly canFollowUp = input(false);
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly badge = lessonCategoryBadge;
  protected readonly followUpTypes = FOLLOW_UP_TYPES;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Lesson[]>([]);
  protected readonly draft = signal<LessonDraft | null>(null);
  protected readonly editing = signal<Lesson | null>(null);
  protected readonly deleting = signal<Lesson | null>(null);
  protected readonly connecting = signal<string | null>(null);
  protected readonly busy = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.projectId();
      this.refresh();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.projectId());
  }

  protected openNew(): void {
    this.editing.set(null);
    this.draft.set(emptyLessonDraft());
  }

  protected openEdit(l: Lesson): void {
    this.editing.set(l);
    this.draft.set(
      emptyLessonDraft({
        category: l.category,
        title: l.title,
        description: l.description ?? '',
        recommendation: l.recommendation ?? '',
      }),
    );
  }

  protected cancel(): void {
    this.draft.set(null);
    this.editing.set(null);
  }

  /** An improvement task on the project, recorded as what the lesson became. */
  protected toTask(l: Lesson): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    const description = [l.recommendation, l.description].filter(Boolean).join('\n\n');
    this.tasksApi
      .create(orgId, {
        title: this.language
          .translate('projects.lessons.taskTitle', { title: l.title })
          .slice(0, 255),
        description: description || null,
        entity_type: 'project',
        entity_id: this.projectId(),
      })
      .pipe(
        switchMap((task) =>
          this.api.addLessonFollowUp(orgId, this.projectId(), l.id, {
            entity_type: 'task',
            entity_id: task.id,
          }),
        ),
      )
      .subscribe({
        next: (lesson) => {
          this.busy.set(false);
          this.replace(lesson);
          this.notifications.success('projects.notices.lessonTask');
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(projectErrorKey(error));
        },
      });
  }

  /** Open the risk form prefilled from the lesson (linked back to the project on save). */
  protected toRisk(l: Lesson): void {
    const description = [l.description, l.recommendation].filter(Boolean).join('\n\n');
    void this.flows.start('project.to_risk', 'project', this.projectId(), {
      prefill: { title: l.title, ...(description ? { description } : {}) },
    });
  }

  protected addFollowUp(l: Lesson, ref: EntityRef): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.addLessonFollowUp(orgId, this.projectId(), l.id, ref).subscribe({
      next: (lesson) => {
        this.busy.set(false);
        this.connecting.set(null);
        this.replace(lesson);
        this.notifications.success('projects.notices.followUpAdded');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected removeFollowUp(l: Lesson, ref: EntityRef): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .removeLessonFollowUp(orgId, this.projectId(), l.id, ref.entity_type, ref.entity_id)
      .subscribe({
        next: (lesson) => {
          this.busy.set(false);
          this.replace(lesson);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(projectErrorKey(error));
        },
      });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !d.title.trim() || this.busy()) {
      return;
    }
    const existing = this.editing();
    const body = lessonBody(d);
    this.busy.set(true);
    const call = existing
      ? this.api.updateLesson(orgId, this.projectId(), existing.id, body)
      : this.api.addLesson(orgId, this.projectId(), body);
    call.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.items.update((list) =>
          existing ? list.map((i) => (i.id === saved.id ? saved : i)) : [...list, saved],
        );
        this.cancel();
        this.notifications.success('projects.notices.lessonSaved');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const l = this.deleting();
    if (!orgId || !l || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteLesson(orgId, this.projectId(), l.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.items.update((list) => list.filter((i) => i.id !== l.id));
        this.notifications.success('projects.notices.lessonDeleted');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(projectErrorKey(error));
      },
    });
  }

  private replace(lesson: Lesson): void {
    this.items.update((list) => list.map((i) => (i.id === lesson.id ? lesson : i)));
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.items().length) {
      this.state.set('loading');
    }
    this.request = this.api.lessons(orgId, id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
