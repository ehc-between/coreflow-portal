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
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { TrainingApi } from '../data/training-api';
import { addDaysInput, fromDateInput, trainingErrorKey } from '../data/training-display';
import { AssignmentsCreated, Course } from '../data/training.models';
import { TrainingPeople, filterPeople } from './people';

/**
 * Slide-over to assign a published course to people with a due date
 * (`POST /assignments`, `training:assign`). Pass `course` to fix the course;
 * otherwise the user picks one of the published courses.
 */
@Component({
  selector: 'app-training-assign-dialog',
  imports: [FormsModule, TranslocoPipe, Alert, Button, FormField, SlideOver, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'training.assign.title' | transloco"
      [subtitle]="fixedCourse()?.title ?? ''"
      [closeLabel]="'training.common.close' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
        @if (!fixedCourse()) {
          <app-form-field [label]="'training.assign.course' | transloco" inputId="assign-course">
            <select id="assign-course" name="course" [(ngModel)]="courseId" required>
              <option value="">{{ 'training.assign.pickCourse' | transloco }}</option>
              @for (c of courses(); track c.id) {
                <option [value]="c.id">{{ c.code }} · {{ c.title }}</option>
              }
            </select>
          </app-form-field>
        }

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
            {{ 'training.assign.people' | transloco }}
          </legend>
          <label for="assign-search" class="sr-only">{{
            'training.assign.search' | transloco
          }}</label>
          <input
            id="assign-search"
            name="search"
            type="search"
            class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent"
            [placeholder]="'training.assign.search' | transloco"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
          <div class="flex items-center justify-between text-[12.5px] text-fg-muted">
            <span>{{ 'training.assign.selected' | transloco: { count: selected().size } }}</span>
            <button
              type="button"
              class="font-semibold text-accent hover:underline"
              (click)="selectAllVisible()"
            >
              {{ 'training.assign.selectAll' | transloco }}
            </button>
          </div>
          <ul
            class="max-h-[280px] overflow-y-auto rounded-[10px] border border-border"
            data-testid="assign-people"
          >
            @for (person of visiblePeople(); track person.id) {
              <li class="border-b border-border last:border-0">
                <label
                  class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-fg hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    class="accent-accent"
                    [checked]="selected().has(person.id)"
                    (change)="toggle(person.id)"
                  />
                  {{ person.name }}
                </label>
              </li>
            } @empty {
              <li class="px-3 py-2 text-[13px] text-fg-muted">
                {{ 'training.assign.noPeople' | transloco }}
              </li>
            }
          </ul>
        </fieldset>

        <app-form-field [label]="'training.assign.dueDate' | transloco" inputId="assign-due">
          <input id="assign-due" name="due" type="date" [(ngModel)]="dueDate" />
        </app-form-field>
        <app-field-help scope="training" page="assign" field="dueDate" />

        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        @if (result(); as r) {
          <app-alert tone="success">
            {{
              'training.assign.done' | transloco: { created: r.created, skipped: r.skipped.length }
            }}
          </app-alert>
        }

        <div class="flex flex-wrap justify-end gap-2">
          <app-button variant="secondary" (click)="closed.emit()">
            {{ 'training.common.cancel' | transloco }}
          </app-button>
          <app-button
            type="submit"
            [loading]="busy()"
            [disabled]="!canSubmit()"
            data-testid="assign-submit"
          >
            {{ 'training.assign.submit' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class AssignDialog {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly directory = inject(TrainingPeople);

  readonly open = input(false);
  /** The course to assign (hides the course picker). */
  readonly course = input<Pick<Course, 'id' | 'title'> | null>(null);
  readonly closed = output<void>();
  readonly assigned = output<AssignmentsCreated>();

  protected readonly fixedCourse = computed(() => this.course());
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly search = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AssignmentsCreated | null>(null);
  protected courseId = '';
  protected dueDate = addDaysInput(30);

  protected readonly visiblePeople = computed(() =>
    filterPeople(this.directory.people(), this.search()),
  );

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      untracked(() => this.reset());
    });
  }

  protected canSubmit(): boolean {
    return !this.busy() && this.selected().size > 0 && !!(this.fixedCourse()?.id || this.courseId);
  }

  protected toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected selectAllVisible(): void {
    this.selected.update((set) => new Set([...set, ...this.visiblePeople().map((p) => p.id)]));
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const courseId = this.fixedCourse()?.id || this.courseId;
    if (!orgId || !this.canSubmit() || !courseId) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createAssignments(orgId, {
        course_id: courseId,
        user_ids: [...this.selected()],
        due_at: fromDateInput(this.dueDate, true),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.result.set(res);
          this.selected.set(new Set());
          this.notifications.success('training.assign.done', {
            created: res.created,
            skipped: res.skipped.length,
          });
          this.assigned.emit(res);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(trainingErrorKey(err));
        },
      });
  }

  private reset(): void {
    this.search.set('');
    this.selected.set(new Set());
    this.error.set(null);
    this.result.set(null);
    this.courseId = '';
    this.dueDate = addDaysInput(30);
    this.directory.ensureLoaded();
    const orgId = this.selectedOrg.currentOrgId();
    if (!this.fixedCourse() && orgId) {
      this.api.listCourses(orgId, { status: ['published'], limit: 200 }).subscribe({
        next: (res) => this.courses.set(res.items),
        error: () => this.courses.set([]),
      });
    }
  }
}
