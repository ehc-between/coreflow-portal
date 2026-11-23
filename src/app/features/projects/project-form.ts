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
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { AssigneeOptionsService } from '../../shared/tasks/assignee-options';
import { CustomerPicker, CustomerRef, CustomersAvailability } from '../../shared/customers';
import { Button } from '../../shared/ui/button/button';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { FormActions } from '../../shared/ui/form-actions/form-actions';
import { FormSection } from '../../shared/ui/form-section/form-section';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import {
  EntityRef,
  MEMBER_ROLES,
  MemberRole,
  OPEN_PROJECT_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_KINDS,
  PROJECT_PRIORITIES,
  isOneOf,
} from './data/project.models';
import {
  ProjectFormValue,
  RelatedPick,
  plansChange,
  validateProjectForm,
  withMember,
} from './data/project-form-model';
import { ProjectRecordPicker } from './record-picker';

export interface ProjectFormSubmit {
  readonly value: ProjectFormValue;
  readonly changeReason: string;
}

/** Record types a project can affect (ISO 9001 6.3: processes and documented information). */
export const AFFECTED_TYPES: readonly string[] = ['process', 'document'];
/** Record types a project can contribute to (quality and security objectives, KPIs). */
export const OBJECTIVE_TYPES: readonly string[] = ['objective', 'kpi'];

/** People sorted by name (the assignee list is not guaranteed to be). */
export function byLabel<T extends { readonly label: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The project form (create and edit): purpose, change planning (ISO 9001 6.3),
 * plan, people and information security. In create mode an initial team and the
 * records the project affects or contributes to can be added; in edit mode those
 * are managed on the detail page, and a change reason is asked for, which the
 * revision history records.
 */
@Component({
  selector: 'app-project-form',
  imports: [
    TranslocoPipe,
    AskAbout,
    FieldHelp,
    Button,
    DateInput,
    FormActions,
    FormSection,
    FormField,
    Icon,
    ProjectRecordPicker,
    CustomerPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-form-section
        [title]="'projects.form.sections.purpose' | transloco"
        [description]="'projects.form.sections.purposeHint' | transloco"
      >
        <app-form-field
          span="full"
          [label]="'projects.fields.title' | transloco"
          inputId="cf-p-title"
          [required]="true"
          [error]="shownErrors()['title'] ?? '' | transloco"
        >
          <input
            id="cf-p-title"
            name="title"
            type="text"
            maxlength="255"
            required
            [value]="form().title"
            (input)="set('title', $any($event.target).value)"
            data-testid="project-title"
          />
        </app-form-field>
        <app-form-field [label]="'projects.fields.kind' | transloco" inputId="cf-p-kind">
          <app-field-help
            label-suffix
            scope="projects"
            page="form"
            field="kind"
            [label]="'projects.fields.kind' | transloco"
          />
          <select
            id="cf-p-kind"
            (change)="setKind($any($event.target).value)"
            data-testid="project-kind"
          >
            @for (k of kinds; track k) {
              <option [value]="k" [selected]="form().kind === k">
                {{ 'projects.kinds.' + k | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'projects.fields.status' | transloco" inputId="cf-p-status">
          <select id="cf-p-status" (change)="setStatus($any($event.target).value)">
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="form().status === s">
                {{ 'projects.status.' + s | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'projects.fields.objective' | transloco"
          inputId="cf-p-objective"
        >
          <app-field-help
            label-suffix
            scope="projects"
            page="form"
            field="objective"
            [label]="'projects.fields.objective' | transloco"
          />
          <app-ask-about
            label-suffix
            [prompt]="'projects.ask.objective' | transloco"
            field="objective"
            [fieldLabel]="'projects.fields.objective' | transloco"
            labelKey="projects.ask.objectiveLabel"
          />
          <textarea
            id="cf-p-objective"
            name="objective"
            rows="3"
            maxlength="20000"
            [value]="form().objective"
            (input)="set('objective', $any($event.target).value)"
            data-testid="project-objective"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'projects.fields.scope' | transloco"
          inputId="cf-p-scope"
        >
          <app-field-help
            label-suffix
            scope="projects"
            page="form"
            field="scope"
            [label]="'projects.fields.scope' | transloco"
          />
          <textarea
            id="cf-p-scope"
            name="scope"
            rows="3"
            maxlength="20000"
            [value]="form().scope"
            (input)="set('scope', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        <app-form-field
          span="full"
          [label]="'projects.fields.description' | transloco"
          inputId="cf-p-description"
        >
          <textarea
            id="cf-p-description"
            name="description"
            rows="3"
            maxlength="20000"
            [value]="form().description"
            (input)="set('description', $any($event.target).value)"
          ></textarea>
        </app-form-field>
      </app-form-section>

      <app-form-section
        [title]="'projects.form.sections.change' | transloco"
        [description]="'projects.form.changeIntro' | transloco"
        [columns]="1"
      >
        @if (!changeOpen()) {
          <app-button
            class="justify-self-start"
            variant="secondary"
            size="sm"
            (click)="changeShown.set(true)"
            data-testid="show-change-planning"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'projects.form.showChange' | transloco }}
          </app-button>
        }
        @if (changeOpen()) {
          <div class="grid grid-cols-1 items-start gap-x-4 gap-y-5" data-testid="change-planning">
            <app-form-field
              [label]="'projects.fields.changeConsequences' | transloco"
              inputId="cf-p-consequences"
            >
              <app-field-help
                label-suffix
                scope="projects"
                page="form"
                field="change_consequences"
                [label]="'projects.fields.changeConsequences' | transloco"
              />
              <app-ask-about
                label-suffix
                [prompt]="'projects.ask.consequences' | transloco"
                field="change_consequences"
                [fieldLabel]="'projects.fields.changeConsequences' | transloco"
              />
              <textarea
                id="cf-p-consequences"
                name="change_consequences"
                rows="3"
                maxlength="20000"
                [value]="form().change_consequences"
                (input)="set('change_consequences', $any($event.target).value)"
                data-testid="project-consequences"
              ></textarea>
            </app-form-field>
            <app-form-field
              [label]="'projects.fields.changeResources' | transloco"
              inputId="cf-p-resources"
            >
              <app-field-help
                label-suffix
                scope="projects"
                page="form"
                field="change_resources"
                [label]="'projects.fields.changeResources' | transloco"
              />
              <textarea
                id="cf-p-resources"
                name="change_resources"
                rows="2"
                maxlength="20000"
                [value]="form().change_resources"
                (input)="set('change_resources', $any($event.target).value)"
              ></textarea>
            </app-form-field>
            @if (mode() === 'create') {
              <div class="flex flex-col gap-1.5">
                <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span class="text-ui leading-6 font-semibold text-fg-muted">{{
                    'projects.form.affected' | transloco
                  }}</span>
                  <app-field-help
                    scope="projects"
                    page="form"
                    field="affected"
                    [label]="'projects.form.affected' | transloco"
                  />
                </div>
                <app-project-record-picker
                  [types]="affectedTypes"
                  [picked]="pickedRefs('affected')"
                  [label]="'projects.form.affected' | transloco"
                  [placeholder]="'projects.form.affectedPlaceholder' | transloco"
                  testId="pick-affected"
                  (selected)="addRelated('affected', $event)"
                  (removed)="removeRelated('affected', $event)"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <div class="flex min-h-6 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span class="text-ui leading-6 font-semibold text-fg-muted">{{
                    'projects.form.objectives' | transloco
                  }}</span>
                  <app-field-help
                    scope="projects"
                    page="form"
                    field="objectives"
                    [label]="'projects.form.objectives' | transloco"
                  />
                </div>
                <app-project-record-picker
                  [types]="objectiveTypes"
                  [picked]="pickedRefs('objectives')"
                  [label]="'projects.form.objectives' | transloco"
                  [placeholder]="'projects.form.objectivesPlaceholder' | transloco"
                  testId="pick-objectives"
                  (selected)="addRelated('objectives', $event)"
                  (removed)="removeRelated('objectives', $event)"
                />
              </div>
            } @else {
              <p class="text-meta text-fg-subtle">
                {{ 'projects.form.relatedOnDetail' | transloco }}
              </p>
            }
          </div>
        }
      </app-form-section>

      <app-form-section
        [title]="'projects.form.sections.plan' | transloco"
        [description]="'projects.form.sections.planHint' | transloco"
      >
        <app-form-field
          [label]="'projects.fields.startDate' | transloco"
          inputId="cf-p-start"
          [error]="shownErrors()['start_date'] ?? '' | transloco"
        >
          <app-date-input
            inputId="cf-p-start"
            [value]="form().start_date"
            (valueChange)="set('start_date', $event ?? '')"
            data-testid="project-start"
          />
        </app-form-field>
        <app-form-field
          [label]="'projects.fields.dueDate' | transloco"
          inputId="cf-p-due"
          [error]="shownErrors()['due_date'] ?? '' | transloco"
        >
          <app-date-input
            inputId="cf-p-due"
            [value]="form().due_date"
            (valueChange)="set('due_date', $event ?? '')"
            data-testid="project-due"
          />
        </app-form-field>
        <app-form-field [label]="'projects.fields.priority' | transloco" inputId="cf-p-priority">
          <select id="cf-p-priority" (change)="setPriority($any($event.target).value)">
            @for (p of priorities; track p) {
              <option [value]="p" [selected]="form().priority === p">
                {{ 'projects.priorities.' + p | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        @if (mode() === 'edit') {
          <app-form-field [label]="'projects.fields.health' | transloco" inputId="cf-p-health">
            <app-field-help
              label-suffix
              scope="projects"
              page="form"
              field="health"
              [label]="'projects.fields.health' | transloco"
            />
            <select
              id="cf-p-health"
              (change)="setHealth($any($event.target).value)"
              data-testid="project-health"
            >
              <option value="" [selected]="!form().health">
                {{ 'projects.form.noHealth' | transloco }}
              </option>
              @for (h of healths; track h) {
                <option [value]="h" [selected]="form().health === h">
                  {{ 'projects.healths.' + h | transloco }}
                </option>
              }
            </select>
          </app-form-field>
        }
      </app-form-section>

      <app-form-section
        [title]="'projects.form.sections.people' | transloco"
        [description]="'projects.form.sections.peopleHint' | transloco"
      >
        <app-form-field [label]="'projects.fields.owner' | transloco" inputId="cf-p-owner">
          <app-field-help
            label-suffix
            scope="projects"
            page="form"
            field="owner"
            [label]="'projects.fields.owner' | transloco"
          />
          <select
            id="cf-p-owner"
            (change)="set('owner_user_id', $any($event.target).value)"
            data-testid="project-owner"
          >
            @if (mode() === 'create') {
              <option value="" [selected]="!form().owner_user_id">
                {{ 'projects.form.ownerMe' | transloco }}
              </option>
            }
            @if (ownerOrphan()) {
              <option [value]="form().owner_user_id" selected>
                {{ ownerName() || ('projects.form.currentOwner' | transloco) }}
              </option>
            }
            @for (u of users(); track u.id) {
              <option [value]="u.id" [selected]="form().owner_user_id === u.id">
                {{ u.label }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'projects.fields.department' | transloco" inputId="cf-p-dept">
          <select id="cf-p-dept" (change)="set('department_id', $any($event.target).value)">
            <option value="" [selected]="!form().department_id">
              {{ 'projects.form.noDepartment' | transloco }}
            </option>
            @for (d of departments(); track d.id) {
              <option [value]="d.id" [selected]="form().department_id === d.id">
                {{ d.label }}
              </option>
            }
          </select>
        </app-form-field>
        @if (customers.enabled()) {
          <app-form-field [label]="'projects.fields.customer' | transloco" inputId="cf-p-customer">
            <app-customer-picker
              inputId="cf-p-customer"
              [value]="form().customer_id || null"
              [current]="form().customer"
              (valueChange)="set('customer_id', $event ?? '')"
              (refChange)="set('customer', $event)"
              data-testid="project-customer"
            />
          </app-form-field>
        }

        @if (mode() === 'create') {
          <fieldset class="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <legend
              class="mb-1.5 flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted"
            >
              {{ 'projects.form.team' | transloco }}
              <app-field-help
                scope="projects"
                page="detail"
                field="team"
                [label]="'projects.form.team' | transloco"
              />
            </legend>
            <p class="text-meta leading-snug text-fg-subtle">
              {{ 'projects.form.teamHint' | transloco }}
            </p>
            @if (form().members.length) {
              <ul class="flex flex-col gap-2" data-testid="form-members">
                @for (m of form().members; track m.user_id) {
                  <li
                    class="flex flex-wrap items-center gap-2 rounded-tile border border-border px-3 py-1.5 text-ui"
                  >
                    <span class="min-w-0 flex-1 truncate text-fg">{{ userName(m.user_id) }}</span>
                    <label class="sr-only" [for]="'cf-p-role-' + m.user_id">
                      {{ 'projects.team.roleFor' | transloco: { name: userName(m.user_id) } }}
                    </label>
                    <select
                      [id]="'cf-p-role-' + m.user_id"
                      class="h-9 rounded-tile border border-border bg-bg px-2 text-ui"
                      (change)="setMemberRole(m.user_id, $any($event.target).value)"
                    >
                      @for (r of roles; track r) {
                        <option [value]="r" [selected]="m.role === r">
                          {{ 'projects.roles.' + r | transloco }}
                        </option>
                      }
                    </select>
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fg"
                      [attr.aria-label]="
                        'projects.team.removeNamed' | transloco: { name: userName(m.user_id) }
                      "
                      (click)="removeMember(m.user_id)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  </li>
                }
              </ul>
            }
            <div class="grid grid-cols-1 items-end gap-x-4 gap-y-2 sm:grid-cols-2">
              <app-form-field
                [label]="'projects.team.addPerson' | transloco"
                inputId="cf-p-add-member"
              >
                <select
                  id="cf-p-add-member"
                  (change)="pick.set($any($event.target).value)"
                  data-testid="add-member-user"
                >
                  <option value="" [selected]="!pick()">
                    {{ 'projects.team.choosePerson' | transloco }}
                  </option>
                  @for (u of addable(); track u.id) {
                    <option [value]="u.id" [selected]="pick() === u.id">{{ u.label }}</option>
                  }
                </select>
              </app-form-field>
              <div class="flex h-10 items-center">
                <app-button
                  variant="secondary"
                  [disabled]="!pick()"
                  (click)="addMember()"
                  data-testid="add-member"
                >
                  <app-icon name="userplus" [size]="14" />
                  {{ 'projects.team.add' | transloco }}
                </app-button>
              </div>
            </div>
          </fieldset>
        }
      </app-form-section>

      <app-form-section
        [title]="'projects.form.sections.security' | transloco"
        [description]="'projects.form.sections.securityHint' | transloco"
        [columns]="1"
      >
        <div
          class="flex h-10 items-center gap-1.5 rounded-tile border border-border bg-bg pr-2 pl-3"
        >
          <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().security_relevant"
              (change)="set('security_relevant', $any($event.target).checked)"
              data-testid="project-security"
            />
            {{ 'projects.fields.securityRelevant' | transloco }}
          </label>
          <app-field-help
            scope="projects"
            page="form"
            field="security_relevant"
            [label]="'projects.fields.securityRelevant' | transloco"
          />
        </div>
        @if (form().security_relevant) {
          <app-form-field
            [label]="'projects.fields.securityRequirements' | transloco"
            inputId="cf-p-secreq"
            [hint]="'projects.form.securityChecklistHint' | transloco"
          >
            <app-field-help
              label-suffix
              scope="projects"
              page="form"
              field="security_requirements"
              [label]="'projects.fields.securityRequirements' | transloco"
            />
            <app-ask-about
              label-suffix
              [prompt]="'projects.ask.securityRequirements' | transloco"
              field="security_requirements"
              [fieldLabel]="'projects.fields.securityRequirements' | transloco"
              [requirements]="securityRefs"
            />
            <textarea
              id="cf-p-secreq"
              name="security_requirements"
              rows="3"
              maxlength="20000"
              [value]="form().security_requirements"
              (input)="set('security_requirements', $any($event.target).value)"
            ></textarea>
          </app-form-field>
        }
      </app-form-section>

      @if (mode() === 'edit') {
        <app-form-section [columns]="1">
          <app-form-field
            [label]="'projects.form.changeReason' | transloco"
            inputId="cf-p-reason"
            [hint]="'projects.form.changeReasonHint' | transloco"
          >
            <input
              id="cf-p-reason"
              type="text"
              maxlength="2000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
        </app-form-section>
      }

      <app-form-actions
        [message]="attempted() && hasErrors() ? ('projects.form.errors.summary' | transloco) : ''"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="project-save">
          {{ (mode() === 'create' ? 'projects.form.create' : 'common.save') | transloco }}
        </app-button>
      </app-form-actions>
    </form>
  `,
})
export class ProjectForm {
  private readonly assignees = inject(AssigneeOptionsService);
  protected readonly customers = inject(CustomersAvailability);

  readonly value = input.required<ProjectFormValue>();
  readonly mode = input<'create' | 'edit'>('create');
  readonly busy = input(false);
  /** Display name of the current owner (shown when they are not in the people list). */
  readonly ownerName = input<string | null>(null);

  readonly submitted = output<ProjectFormSubmit>();
  readonly cancelled = output<void>();

  protected readonly kinds = PROJECT_KINDS;
  protected readonly statuses = OPEN_PROJECT_STATUSES;
  protected readonly priorities = PROJECT_PRIORITIES;
  protected readonly healths = PROJECT_HEALTHS;
  protected readonly roles = MEMBER_ROLES;
  protected readonly affectedTypes = AFFECTED_TYPES;
  protected readonly objectiveTypes = OBJECTIVE_TYPES;
  protected readonly securityRefs = ['iso27001:A.5.8'];

  protected readonly form = linkedSignal(() => this.value());
  protected readonly changeReason = signal('');
  protected readonly pick = signal('');
  protected readonly attempted = signal(false);
  /** The user opened change planning themselves. */
  protected readonly changeShown = signal(false);

  /** Change planning shows for improvement / implementation, or when it has content. */
  protected readonly changeOpen = computed(() => {
    const f = this.form();
    return (
      this.changeShown() ||
      plansChange(f.kind) ||
      !!f.change_consequences.trim() ||
      !!f.change_resources.trim() ||
      f.related.length > 0
    );
  });

  protected readonly errors = computed(() => validateProjectForm(this.form()));
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly shownErrors = computed(() => {
    const errors = this.errors();
    // Date problems show as soon as they exist; a missing title only after submitting.
    if (this.attempted()) {
      return errors;
    }
    return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== 'title'));
  });

  protected readonly users = computed(() =>
    byLabel(this.assignees.options().users.map((o) => ({ id: o.value.slice(5), label: o.label }))),
  );
  protected readonly addable = computed(() => {
    const taken = new Set(this.form().members.map((m) => m.user_id));
    return this.users().filter((u) => !taken.has(u.id));
  });
  protected readonly ownerOrphan = computed(() => {
    const id = this.form().owner_user_id;
    return !!id && !this.users().some((u) => u.id === id);
  });
  protected readonly departments = computed(() =>
    byLabel(
      this.assignees.options().departments.map((o) => ({ id: o.value.slice(11), label: o.label })),
    ),
  );

  constructor() {
    this.assignees.ensureLoaded();
  }

  protected userName(id: string): string {
    return this.users().find((u) => u.id === id)?.label ?? id;
  }

  protected pickedRefs(group: RelatedPick['group']): EntityRef[] {
    return this.form()
      .related.filter((r) => r.group === group)
      .map((r) => r.ref);
  }

  protected addRelated(group: RelatedPick['group'], ref: EntityRef): void {
    // A document the project changes is "relates_to"; an objective it serves is "implements".
    const link_type = group === 'objectives' ? 'implements' : 'relates_to';
    this.set('related', [...this.form().related, { ref, group, link_type }]);
  }

  protected removeRelated(group: RelatedPick['group'], ref: EntityRef): void {
    this.set(
      'related',
      this.form().related.filter(
        (r) =>
          !(
            r.group === group &&
            r.ref.entity_type === ref.entity_type &&
            r.ref.entity_id === ref.entity_id
          ),
      ),
    );
  }

  protected set<K extends keyof ProjectFormValue>(key: K, value: ProjectFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected setKind(value: string): void {
    if (isOneOf(PROJECT_KINDS, value)) {
      this.set('kind', value);
    }
  }

  protected setStatus(value: string): void {
    if (isOneOf(OPEN_PROJECT_STATUSES, value)) {
      this.set('status', value);
    }
  }

  protected setPriority(value: string): void {
    if (isOneOf(PROJECT_PRIORITIES, value)) {
      this.set('priority', value);
    }
  }

  protected setHealth(value: string): void {
    this.set('health', isOneOf(PROJECT_HEALTHS, value) ? value : '');
  }

  protected addMember(): void {
    const id = this.pick();
    if (id) {
      this.set('members', withMember(this.form().members, id, 'member'));
      this.pick.set('');
    }
  }

  protected setMemberRole(userId: string, role: string): void {
    if (isOneOf(MEMBER_ROLES, role)) {
      this.set('members', withMember(this.form().members, userId, role as MemberRole));
    }
  }

  protected removeMember(userId: string): void {
    this.set(
      'members',
      this.form().members.filter((m) => m.user_id !== userId),
    );
  }

  /** Patch values from outside (a create-from-here prefill), leaving typed values alone. */
  patchEmpty(
    values: Partial<Record<'title' | 'description' | 'objective' | 'scope', string>>,
  ): void {
    this.form.update((f) => {
      const next: Record<string, unknown> = { ...f };
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'string' && v && !(f as unknown as Record<string, string>)[k]) {
          next[k] = v;
        }
      }
      return next as unknown as ProjectFormValue;
    });
  }

  /** Prefill the Kunde field (create-from-customer, `?customer_id=`) unless already set. */
  patchCustomer(id: string | null, ref: CustomerRef | null = null): void {
    if (!id) {
      return;
    }
    this.form.update((f) => (f.customer_id ? f : { ...f, customer_id: id, customer: ref }));
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.hasErrors() || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }
}
