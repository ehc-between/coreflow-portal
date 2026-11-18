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
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { TrainingApi } from '../data/training-api';
import { addDaysInput, fromDateInput, trainingErrorKey } from '../data/training-display';
import { AssignmentsCreated, Course } from '../data/training.models';
import { PeoplePicker } from './people-picker';

/**
 * Slide-over to assign a published course to people with a due date
 * (`POST /assignments`, `training:assign`). Pass `course` to fix the course;
 * otherwise the user picks one of the published courses.
 */
@Component({
  selector: 'app-training-assign-dialog',
  imports: [FormsModule, TranslocoPipe, Alert, Button, SlideOver, FieldHelp, PeoplePicker],
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
          <div class="flex flex-col gap-1.5">
            <label for="assign-course" class="text-ui font-semibold text-fg-muted">
              {{ 'training.assign.course' | transloco }}
            </label>
            <select
              id="assign-course"
              name="course"
              class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [(ngModel)]="courseId"
              required
            >
              <option value="">{{ 'training.assign.pickCourse' | transloco }}</option>
              @for (c of courses(); track c.id) {
                <option [value]="c.id">{{ c.code }} · {{ c.title }}</option>
              }
            </select>
          </div>
        }

        <app-training-people-picker
          [legend]="'training.assign.people' | transloco"
          [(selected)]="selected"
        />

        <div class="flex flex-col gap-1.5">
          <label
            for="assign-due"
            class="flex items-center gap-1.5 text-ui font-semibold text-fg-muted"
          >
            {{ 'training.assign.dueDate' | transloco }}
            <app-field-help scope="training" page="assign" field="dueDate" />
          </label>
          <input
            id="assign-due"
            name="due"
            type="date"
            class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
            [(ngModel)]="dueDate"
          />
        </div>

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
            {{
              (selected().size === 1 ? 'training.assign.submitOne' : 'training.assign.submit')
                | transloco: { count: selected().size }
            }}
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

  readonly open = input(false);
  /** The course to assign (hides the course picker). */
  readonly course = input<Pick<Course, 'id' | 'title'> | null>(null);
  readonly closed = output<void>();
  readonly assigned = output<AssignmentsCreated>();

  protected readonly fixedCourse = computed(() => this.course());
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AssignmentsCreated | null>(null);
  protected courseId = '';
  protected dueDate = addDaysInput(30);

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
    this.selected.set(new Set());
    this.error.set(null);
    this.result.set(null);
    this.courseId = '';
    this.dueDate = addDaysInput(30);
    const orgId = this.selectedOrg.currentOrgId();
    if (!this.fixedCourse() && orgId) {
      this.api.listCourses(orgId, { status: ['published'], limit: 200 }).subscribe({
        next: (res) => this.courses.set(res.items),
        error: () => this.courses.set([]),
      });
    }
  }
}
