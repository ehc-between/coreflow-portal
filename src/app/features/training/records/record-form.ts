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
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { SupplierOption, TrainingApi } from '../data/training-api';
import {
  TrainingAccess,
  addMonthsInput,
  fromDateInput,
  todayInput,
  trainingErrorKey,
} from '../data/training-display';
import { Course, ManualMethod, RecordCreate, TrainingRecord } from '../data/training.models';
import { TrainingPeople } from '../shared/people';

export interface ManualRecordForm {
  courseId: string;
  userId: string;
  completedOn: string;
  method: ManualMethod;
  passed: boolean;
  score: number | null;
  /** Empty: the course's validity decides (completed + validity months), or never. */
  expiresOn: string;
  notes: string;
  providerSupplierId: string;
  providerName: string;
  instructor: string;
  hours: number | null;
  location: string;
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
    providerSupplierId: '',
    providerName: '',
    instructor: '',
    hours: null,
    location: '',
  };
}

const blank = (value: string): string | null => value.trim() || null;

/** The `POST /records` body for the form, or null when a required field is missing. */
export function manualRecordPayload(form: ManualRecordForm): RecordCreate | null {
  const completed = fromDateInput(form.completedOn);
  if (!form.courseId || !form.userId || !completed) {
    return null;
  }
  const score =
    form.score === null || `${form.score}` === '' ? null : Math.round(Number(form.score));
  const hours = form.hours === null || `${form.hours}` === '' ? null : Number(form.hours);
  return {
    course_id: form.courseId,
    user_id: form.userId,
    completed_at: completed,
    method: form.method,
    passed: form.passed,
    score: score !== null && Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null,
    expires_at: fromDateInput(form.expiresOn),
    notes: blank(form.notes),
    provider_supplier_id: form.providerSupplierId || null,
    provider_name: form.providerSupplierId ? null : blank(form.providerName),
    instructor: blank(form.instructor),
    hours: hours !== null && Number.isFinite(hours) && hours >= 0 ? hours : null,
    location: blank(form.location),
  };
}

/** The expiry the backend applies when the field is left empty (completed + validity). */
export function defaultExpiry(
  completedOn: string,
  validityMonths: number | null | undefined,
): string {
  return validityMonths ? addMonthsInput(completedOn, validityMonths) : '';
}

/**
 * Slide-over for training managers to record training done outside CoreFlow
 * (classroom sessions, external providers): `POST /records`. Captures what an
 * auditor asks for — provider (a supplier), instructor, hours and place — and
 * explains the default expiry. Documentation (the certificate from the provider)
 * is attached on the record right after saving.
 */
@Component({
  selector: 'app-training-record-form',
  imports: [
    FormsModule,
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    AskAbout,
    Button,
    SlideOver,
    FieldHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'training.recordForm.title' | transloco"
      [closeLabel]="'training.common.close' | transloco"
      (closed)="closed.emit()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="flex flex-col gap-1.5">
          <label for="record-course" class="text-ui font-semibold text-fg-muted">
            {{ 'training.fields.course' | transloco }}
          </label>
          <select
            id="record-course"
            name="course"
            class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
            [ngModel]="form.courseId"
            (ngModelChange)="form.courseId = $event; courseId.set($event)"
          >
            <option value="">{{ 'training.assign.pickCourse' | transloco }}</option>
            @for (c of courses(); track c.id) {
              <option [value]="c.id">{{ c.code }} · {{ c.title }}</option>
            }
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="record-user" class="text-ui font-semibold text-fg-muted">
            {{ 'training.fields.person' | transloco }}
          </label>
          <select
            id="record-user"
            name="user"
            class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
            [(ngModel)]="form.userId"
          >
            <option value="">{{ 'training.recordForm.pickPerson' | transloco }}</option>
            @for (p of directory.people(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <div class="flex flex-col gap-1.5">
            <label for="record-method" class="text-ui font-semibold text-fg-muted">
              {{ 'training.fields.method' | transloco }}
            </label>
            <select
              id="record-method"
              name="method"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [(ngModel)]="form.method"
            >
              <option value="external">{{ 'training.method.external' | transloco }}</option>
              <option value="manual">{{ 'training.method.manual' | transloco }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="record-completed" class="text-ui font-semibold text-fg-muted">
              {{ 'training.fields.completed' | transloco }}
            </label>
            <input
              id="record-completed"
              name="completed"
              type="date"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [max]="today"
              [ngModel]="form.completedOn"
              (ngModelChange)="form.completedOn = $event; completedOn.set($event)"
            />
          </div>
        </div>

        <fieldset class="flex flex-col gap-3 rounded-tile border border-border p-3">
          <legend class="px-1 text-ui font-semibold text-fg">
            {{ 'training.recordForm.providerTitle' | transloco }}
          </legend>
          @if (suppliers().length) {
            <div class="flex flex-col gap-1.5">
              <label
                for="record-supplier"
                class="flex items-center gap-1.5 text-ui font-semibold text-fg-muted"
              >
                {{ 'training.fields.providerSupplier' | transloco }}
                <app-field-help scope="training" page="records" field="provider" />
              </label>
              <select
                id="record-supplier"
                name="supplier"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [(ngModel)]="form.providerSupplierId"
              >
                <option value="">{{ 'training.recordForm.noSupplier' | transloco }}</option>
                @for (s of suppliers(); track s.id) {
                  <option [value]="s.id">{{ s.code ? s.code + ' · ' : '' }}{{ s.name }}</option>
                }
              </select>
            </div>
          }
          @if (!form.providerSupplierId) {
            <div class="flex flex-col gap-1.5">
              <label for="record-provider" class="text-ui font-semibold text-fg-muted">
                {{ 'training.fields.providerName' | transloco }}
              </label>
              <input
                id="record-provider"
                name="provider"
                maxlength="255"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [placeholder]="'training.recordForm.providerPlaceholder' | transloco"
                [(ngModel)]="form.providerName"
              />
            </div>
          }
          <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <div class="flex flex-col gap-1.5">
              <label for="record-instructor" class="text-ui font-semibold text-fg-muted">
                {{ 'training.fields.instructor' | transloco }}
              </label>
              <input
                id="record-instructor"
                name="instructor"
                maxlength="200"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [(ngModel)]="form.instructor"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="record-hours" class="text-ui font-semibold text-fg-muted">
                {{ 'training.fields.hours' | transloco }}
              </label>
              <input
                id="record-hours"
                name="hours"
                type="number"
                min="0"
                step="0.5"
                class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [(ngModel)]="form.hours"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="record-location" class="text-ui font-semibold text-fg-muted">
              {{ 'training.fields.location' | transloco }}
            </label>
            <input
              id="record-location"
              name="location"
              maxlength="200"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [(ngModel)]="form.location"
            />
          </div>
        </fieldset>

        <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <div class="flex flex-col gap-1.5">
            <label for="record-score" class="text-ui font-semibold text-fg-muted">
              {{ 'training.fields.scoreOptional' | transloco }}
            </label>
            <input
              id="record-score"
              name="score"
              type="number"
              min="0"
              max="100"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [(ngModel)]="form.score"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              for="record-expires"
              class="flex items-center gap-1.5 text-ui font-semibold text-fg-muted"
            >
              {{ 'training.fields.expires' | transloco }}
              <app-field-help scope="training" page="records" field="expires" />
              <app-ask-about field="expires_at" [prompt]="'training.ask.validity' | transloco" />
            </label>
            <input
              id="record-expires"
              name="expires"
              type="date"
              class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
              [min]="form.completedOn"
              [(ngModel)]="form.expiresOn"
            />
          </div>
        </div>
        <p class="-mt-2 text-meta text-fg-muted" data-testid="record-expiry-hint">
          @if (suggestedExpiry(); as date) {
            {{ 'training.recordForm.expiryDefault' | transloco: { date: (date | localDay) } }}
          } @else if (selectedCourse()) {
            {{ 'training.recordForm.expiryNever' | transloco }}
          } @else {
            {{ 'training.recordForm.expiryPickCourse' | transloco }}
          }
        </p>

        <label class="flex min-h-8 items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            class="h-4 w-4 accent-accent"
            name="passed"
            [(ngModel)]="form.passed"
          />
          {{ 'training.recordForm.passed' | transloco }}
        </label>
        <div class="flex flex-col gap-1.5">
          <label for="record-notes" class="text-ui font-semibold text-fg-muted">
            {{ 'training.fields.notes' | transloco }}
          </label>
          <textarea
            id="record-notes"
            name="notes"
            rows="3"
            maxlength="5000"
            class="w-full min-w-0 rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
            [(ngModel)]="form.notes"
          ></textarea>
        </div>
        <p class="rounded-tile bg-info-soft/60 px-3 py-2 text-meta text-fg-muted">
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
  private readonly access = inject(TrainingAccess);
  protected readonly directory = inject(TrainingPeople);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly created = output<TrainingRecord>();

  protected readonly today = todayInput();
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly suppliers = signal<readonly SupplierOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly courseId = signal('');
  protected readonly completedOn = signal(todayInput());
  protected form = emptyManualRecord();

  protected readonly selectedCourse = computed(
    () => this.courses().find((c) => c.id === this.courseId()) ?? null,
  );
  protected readonly suggestedExpiry = computed(() =>
    defaultExpiry(this.completedOn(), this.selectedCourse()?.validity_months),
  );

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
    this.courseId.set('');
    this.completedOn.set(this.form.completedOn);
    this.error.set(null);
    this.directory.ensureLoaded();
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.listCourses(orgId, { status: ['published', 'archived'], limit: 200 }).subscribe({
      next: (res) => this.courses.set(res.items),
      error: () => this.courses.set([]),
    });
    if (this.access.canReadSuppliers()) {
      this.api.suppliers(orgId).subscribe({
        next: (res) => this.suppliers.set(res.items),
        error: () => this.suppliers.set([]),
      });
    }
  }
}
