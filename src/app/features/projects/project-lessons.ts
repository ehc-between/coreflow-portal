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
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import {
  LESSON_CATEGORIES,
  Lesson,
  LessonCategory,
  LessonIn,
  isOneOf,
} from './data/project.models';
import { lessonCategoryTone } from './data/project-display';
import { projectErrorKey } from './data/project-errors';
import { ProjectsApi } from './data/projects-api';

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
 */
@Component({
  selector: 'app-project-lessons',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    FieldHelp,
    Badge,
    Button,
    ConfirmDialog,
    Icon,
    LessonEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-display text-[15px] font-bold text-fg">
        {{ 'projects.lessons.title' | transloco }}
      </h2>
      @if (canContribute() && !draft()) {
        <app-button size="sm" variant="secondary" (click)="openNew()" data-testid="add-lesson">
          <app-icon name="plus" [size]="14" />
          {{ 'projects.lessons.add' | transloco }}
        </app-button>
      }
    </div>
    <app-field-help scope="projects" page="detail" field="lessons" />

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
          <app-button variant="ghost" size="sm" (click)="cancel()">
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
        <p class="py-4 text-[13px] text-fg-muted" role="status">
          {{ 'projects.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <p class="py-4 text-[13px] text-fail" role="alert">
          {{ 'projects.common.loadFailed' | transloco }}
        </p>
      }
      @default {
        @if (items().length === 0) {
          <p class="py-4 text-[13px] text-fg-muted" data-testid="lessons-empty">
            {{ 'projects.lessons.empty' | transloco }}
          </p>
        } @else {
          <ul class="mt-2 flex flex-col gap-2" data-testid="lessons">
            @for (l of items(); track l.id) {
              <li class="rounded-tile border border-border p-3">
                <div class="flex flex-wrap items-start gap-2">
                  <app-badge [tone]="tone(l.category)">{{
                    'projects.lessonCategories.' + l.category | transloco
                  }}</app-badge>
                  <p class="min-w-0 flex-1 text-[13.5px] font-semibold break-words text-fg">
                    {{ l.title }}
                  </p>
                  @if (canContribute()) {
                    <button
                      type="button"
                      class="rounded-[8px] px-2 py-1 text-[12px] font-semibold text-accent hover:bg-accent-soft"
                      (click)="openEdit(l)"
                    >
                      {{ 'projects.common.edit' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg"
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
                  <p class="mt-1.5 text-[13px] whitespace-pre-line text-fg-muted">
                    {{ l.description }}
                  </p>
                }
                @if (l.recommendation) {
                  <p class="mt-1.5 text-[13px] whitespace-pre-line text-fg">
                    <span class="font-semibold"
                      >{{ 'projects.lessons.recommendation' | transloco }}:</span
                    >
                    {{ l.recommendation }}
                  </p>
                }
                <p class="mt-1.5 text-[11.5px] text-fg-subtle">
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
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly projectId = input.required<string>();
  readonly canContribute = input(false);
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Lesson[]>([]);
  protected readonly draft = signal<LessonDraft | null>(null);
  protected readonly editing = signal<Lesson | null>(null);
  protected readonly deleting = signal<Lesson | null>(null);
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

  protected tone(category: string) {
    return lessonCategoryTone(category);
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
