import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  addDaysInput,
  fromDateInput,
  trainingErrorKey,
} from '../data/training-display';
import { AssignmentsCreated, Course } from '../data/training.models';
import { PeoplePicker } from '../shared/people-picker';

/**
 * `/training/assignments/new` ("Tildel opplæring"): assign a published course to
 * people with a due date. Also the target of the "deviation → training need"
 * flow (P4): the banner names the deviation, and the first new assignment is
 * linked back to it when saved. `?course=<id>` preselects the course.
 */
@Component({
  selector: 'app-assignment-new',
  imports: [
    FormsModule,
    TranslocoPipe,
    Alert,
    AskAbout,
    Button,
    DateInput,
    FormActions,
    FormField,
    FormSection,
    FieldHelp,
    FlowBanner,
    HelpStrip,
    PageHeader,
    PeoplePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="training.assignNew.title"
        descriptionKey="training.assignNew.subtitle"
        backLink="/training/assignments"
        [breadcrumbs]="[
          { labelKey: 'modules.names.training', link: '/training' },
          { labelKey: 'training.assignments.title', link: '/training/assignments' },
          { labelKey: 'training.assignNew.title' },
        ]"
      />
      <app-help-strip class="mb-5 block" scope="training" page="assignNew" />

      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
        @if (flow()) {
          <app-flow-banner [flow]="flow()" />
        }
        <app-form-section
          [title]="'training.assignNew.courseSection' | transloco"
          [description]="'training.assignNew.courseHint' | transloco"
        >
          <app-form-field
            span="full"
            [label]="'training.assign.course' | transloco"
            inputId="new-assign-course"
            [required]="true"
            [hint]="
              loaded() && courses().length === 0 ? ('training.assignNew.noCourses' | transloco) : ''
            "
          >
            <app-field-help
              label-suffix
              scope="training"
              page="assignNew"
              field="course"
              [label]="'training.assign.course' | transloco"
            />
            <select
              id="new-assign-course"
              name="course"
              [ngModel]="courseId()"
              (ngModelChange)="courseId.set($event)"
              required
            >
              <option value="">{{ 'training.assign.pickCourse' | transloco }}</option>
              @for (c of courses(); track c.id) {
                <option [value]="c.id">{{ c.code }} · {{ c.title }}</option>
              }
            </select>
          </app-form-field>
          <app-training-people-picker
            class="block sm:col-span-2"
            [legend]="'training.assign.people' | transloco"
            [selected]="selected()"
            (selectedChange)="selected.set($event)"
          />
          <app-form-field [label]="'training.assign.dueDate' | transloco" inputId="new-assign-due">
            <app-field-help
              label-suffix
              scope="training"
              page="assign"
              field="dueDate"
              [label]="'training.assign.dueDate' | transloco"
            />
            <app-ask-about
              label-suffix
              field="due_at"
              [prompt]="'training.ask.dueDate' | transloco"
            />
            <app-date-input
              inputId="new-assign-due"
              [value]="dueDate()"
              (changed)="dueDate.set($event)"
            />
          </app-form-field>
        </app-form-section>

        @if (result(); as r) {
          <app-alert tone="success">
            {{
              'training.assign.done' | transloco: { created: r.created, skipped: r.skipped.length }
            }}
          </app-alert>
        }

        <app-form-actions [message]="error() ? (error()! | transloco) : ''">
          <app-button variant="secondary" (click)="router.navigate(['/training/assignments'])">
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
        </app-form-actions>
      </form>
    </div>
  `,
})
export class AssignmentNew {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly flows = inject(CreateFlowService);
  protected readonly router = inject(Router);
  protected readonly access = inject(TrainingAccess);

  /** `?course=` preselects a course. */
  readonly course = input<string | undefined>(undefined);
  /** `?user=` preselects a person (U24: "Tildel opplæring" from a competence gap). */
  readonly user = input<string | undefined>(undefined);

  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'training_assignment',
  });
  protected readonly courses = signal<readonly Course[]>([]);
  protected readonly loaded = signal(false);
  protected readonly courseId = signal('');
  protected readonly selected = linkedSignal<ReadonlySet<string>>(
    () => new Set(this.user() ? [this.user() as string] : []),
  );
  protected readonly dueDate = signal(addDaysInput(30));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AssignmentsCreated | null>(null);

  protected readonly canSubmit = computed(
    () => !this.busy() && this.selected().size > 0 && !!this.courseId(),
  );

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_assignment',
      view: 'new',
      title: this.language.translate('training.assignNew.title'),
    }));
    effect(() => {
      const preset = this.course();
      if (preset) {
        untracked(() => this.courseId.set(preset));
      }
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.listCourses(orgId, { status: ['published'], limit: 200 }).subscribe({
          next: (res) => {
            this.courses.set(res.items);
            this.loaded.set(true);
          },
          error: () => {
            this.courses.set([]);
            this.loaded.set(true);
          },
        });
      });
    });
  }

  protected submit(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSubmit()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createAssignments(orgId, {
        course_id: this.courseId(),
        user_ids: [...this.selected()],
        due_at: fromDateInput(this.dueDate(), true),
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
          const first = res.items[0];
          if (first) {
            // The flow links one record back to its source: the first new assignment.
            this.flows.complete(first.id, 'training_assignment').subscribe();
            void this.router.navigate(
              res.items.length === 1
                ? ['/training/assignments', first.id]
                : ['/training/assignments'],
              res.items.length === 1 ? {} : { queryParams: { course: this.courseId() } },
            );
          }
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(trainingErrorKey(err));
        },
      });
  }
}
