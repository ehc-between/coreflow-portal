import {
  ChangeDetectionStrategy,
  Component,
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
import { fromDateInput, todayInput, trainingErrorKey } from '../data/training-display';
import { Course, ManualMethod, RecordCreate, TrainingRecord } from '../data/training.models';
import { TrainingPeople } from '../shared/people';

export interface ManualRecordForm {
  courseId: string;
  userId: string;
  completedOn: string;
  method: ManualMethod;
  passed: boolean;
  score: number | null;
  expiresOn: string;
  notes: string;
}

export function emptyManualRecord(): ManualRecordForm {
  return {
    courseId: '',
    userId: '',
    completedOn: todayInput(),
    method: 'external',
    passed: true,
    score: null,
    expiresOn: '',
    notes: '',
  };
}

/** The `POST /records` body for the form, or null when a required field is missing. */
export function manualRecordPayload(form: ManualRecordForm): RecordCreate | null {
  const completed = fromDateInput(form.completedOn);
  if (!form.courseId || !form.userId || !completed) {
    return null;
  }
  const score =
    form.score === null || `${form.score}` === '' ? null : Math.round(Number(form.score));
  return {
    course_id: form.courseId,
    user_id: form.userId,
    completed_at: completed,
    method: form.method,
    passed: form.passed,
    score: score !== null && Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null,
    expires_at: fromDateInput(form.expiresOn),
    notes: form.notes.trim() || null,
  };
}

/**
 * Slide-over for training managers to record training done outside CoreFlow
 * (classroom sessions, external providers): `POST /records`.
 */
@Component({
  selector: 'app-training-record-form',
  imports: [FormsModule, TranslocoPipe, Alert, Button, FormField, SlideOver, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'training.recordForm.title' | transloco"
      [closeLabel]="'training.common.close' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()">
        <app-form-field [label]="'training.fields.course' | transloco" inputId="record-course">
          <select id="record-course" name="course" [(ngModel)]="form.courseId">
            <option value="">{{ 'training.assign.pickCourse' | transloco }}</option>
            @for (c of courses(); track c.id) {
              <option [value]="c.id">{{ c.code }} · {{ c.title }}</option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'training.fields.person' | transloco" inputId="record-user">
          <select id="record-user" name="user" [(ngModel)]="form.userId">
            <option value="">{{ 'training.rules.pick' | transloco }}</option>
            @for (p of directory.people(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </app-form-field>
        <div class="grid gap-3 sm:grid-cols-2">
          <app-form-field [label]="'training.fields.method' | transloco" inputId="record-method">
            <select id="record-method" name="method" [(ngModel)]="form.method">
              <option value="external">{{ 'training.method.external' | transloco }}</option>
              <option value="manual">{{ 'training.method.manual' | transloco }}</option>
            </select>
          </app-form-field>
          <app-form-field
            [label]="'training.fields.completed' | transloco"
            inputId="record-completed"
          >
            <input
              id="record-completed"
              name="completed"
              type="date"
              [max]="today"
              [(ngModel)]="form.completedOn"
            />
          </app-form-field>
          <app-form-field [label]="'training.fields.score' | transloco" inputId="record-score">
            <input
              id="record-score"
              name="score"
              type="number"
              min="0"
              max="100"
              [(ngModel)]="form.score"
            />
          </app-form-field>
          <app-form-field [label]="'training.fields.expires' | transloco" inputId="record-expires">
            <input id="record-expires" name="expires" type="date" [(ngModel)]="form.expiresOn" />
          </app-form-field>
        </div>
        <app-field-help scope="training" page="records" field="expires" />
        <label class="flex items-center gap-2 text-[13.5px] text-fg">
          <input type="checkbox" class="accent-accent" name="passed" [(ngModel)]="form.passed" />
          {{ 'training.recordForm.passed' | transloco }}
        </label>
        <app-form-field [label]="'training.fields.notes' | transloco" inputId="record-notes">
          <textarea
            id="record-notes"
            name="notes"
            rows="3"
            maxlength="5000"
            [(ngModel)]="form.notes"
          ></textarea>
        </app-form-field>
        <p class="text-[12.5px] text-fg-muted">
          {{ 'training.recordForm.evidenceHint' | transloco }}
        </p>

        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex flex-wrap justify-end gap-2">
          <app-button variant="secondary" (click)="closed.emit()">
            {{ 'training.common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()" data-testid="record-submit">
            {{ 'training.recordForm.submit' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>
  `,
})
export class RecordForm {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly directory = inject(TrainingPeople);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly created = output<TrainingRecord>();

  protected readonly today = todayInput();
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected form = emptyManualRecord();

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const body = manualRecordPayload(this.form);
    if (!orgId || this.busy()) {
      return;
    }
    if (!body) {
      this.error.set('training.recordForm.required');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.createRecord(orgId, body).subscribe({
      next: (record) => {
        this.busy.set(false);
        this.notifications.success('training.recordForm.created');
        this.created.emit(record);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private reset(): void {
    this.form = emptyManualRecord();
    this.error.set(null);
    this.directory.ensureLoaded();
    const orgId = this.selectedOrg.currentOrgId();
    if (orgId) {
      this.api.listCourses(orgId, { status: ['published', 'archived'], limit: 200 }).subscribe({
        next: (res) => this.courses.set(res.items),
        error: () => this.courses.set([]),
      });
    }
  }
}
