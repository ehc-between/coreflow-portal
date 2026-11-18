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
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
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
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, Card, FormField, Icon, ProjectRecordPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
      <app-card>
        <h2 class="mb-4 font-display text-card font-bold text-fg">
          {{ 'projects.form.sections.purpose' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="md:col-span-2">
            <app-form-field [label]="'projects.fields.title' | transloco" inputId="cf-p-title">
              <input
                id="cf-p-title"
                name="title"
                type="text"
                maxlength="255"
                required
                [value]="form().title"
                (input)="set('title', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['title']"
                [attr.aria-describedby]="shownErrors()['title'] ? 'cf-p-title-err' : null"
                data-testid="project-title"
              />
            </app-form-field>
            @if (shownErrors()['title']; as key) {
              <p id="cf-p-title-err" class="mt-1 text-meta text-fail-ink" role="alert">
                {{ key | transloco }}
              </p>
            }
          </div>
          <div>
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-p-kind" class="text-ui font-semibold text-fg-muted">{{
                'projects.fields.kind' | transloco
              }}</label>
              <app-field-help scope="projects" page="form" field="kind" />
            </div>
            <app-form-field inputId="cf-p-kind">
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
          </div>
          <div>
            <app-form-field [label]="'projects.fields.status' | transloco" inputId="cf-p-status">
              <select id="cf-p-status" (change)="setStatus($any($event.target).value)">
                @for (s of statuses; track s) {
                  <option [value]="s" [selected]="form().status === s">
                    {{ 'projects.status.' + s | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          <div class="md:col-span-2">
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-p-objective" class="text-ui font-semibold text-fg-muted">{{
                'projects.fields.objective' | transloco
              }}</label>
              <app-field-help scope="projects" page="form" field="objective" />
              <app-ask-about
                [prompt]="'projects.ask.objective' | transloco"
                field="objective"
                [fieldLabel]="'projects.fields.objective' | transloco"
                labelKey="projects.ask.objectiveLabel"
              />
            </div>
            <app-form-field inputId="cf-p-objective">
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
          </div>
          <div class="md:col-span-2">
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-p-scope" class="text-ui font-semibold text-fg-muted">{{
                'projects.fields.scope' | transloco
              }}</label>
              <app-field-help scope="projects" page="form" field="scope" />
            </div>
            <app-form-field inputId="cf-p-scope">
              <textarea
                id="cf-p-scope"
                name="scope"
                rows="3"
                maxlength="20000"
                [value]="form().scope"
                (input)="set('scope', $any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <div class="md:col-span-2">
            <app-form-field
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
          </div>
        </div>
      </app-card>

      <app-card>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-card font-bold text-fg">
              {{ 'projects.form.sections.change' | transloco }}
            </h2>
            <p class="mt-1 text-meta text-fg-muted">
              {{ 'projects.form.changeIntro' | transloco }}
            </p>
          </div>
          @if (!changeOpen()) {
            <app-button
              variant="secondary"
              size="sm"
              (click)="changeShown.set(true)"
              data-testid="show-change-planning"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'projects.form.showChange' | transloco }}
            </app-button>
          }
        </div>
        @if (changeOpen()) {
          <div class="mt-4 grid grid-cols-1 gap-4" data-testid="change-planning">
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-p-consequences" class="text-ui font-semibold text-fg-muted">{{
                  'projects.fields.changeConsequences' | transloco
                }}</label>
                <app-field-help scope="projects" page="form" field="change_consequences" />
                <app-ask-about
                  [prompt]="'projects.ask.consequences' | transloco"
                  field="change_consequences"
                  [fieldLabel]="'projects.fields.changeConsequences' | transloco"
                />
              </div>
              <app-form-field inputId="cf-p-consequences">
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
            </div>
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-p-resources" class="text-ui font-semibold text-fg-muted">{{
                  'projects.fields.changeResources' | transloco
                }}</label>
                <app-field-help scope="projects" page="form" field="change_resources" />
              </div>
              <app-form-field inputId="cf-p-resources">
                <textarea
                  id="cf-p-resources"
                  name="change_resources"
                  rows="2"
                  maxlength="20000"
                  [value]="form().change_resources"
                  (input)="set('change_resources', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>
            @if (mode() === 'create') {
              <div>
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span class="text-ui font-semibold text-fg-muted">{{
                    'projects.form.affected' | transloco
                  }}</span>
                  <app-field-help scope="projects" page="form" field="affected" />
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
              <div>
                <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span class="text-ui font-semibold text-fg-muted">{{
                    'projects.form.objectives' | transloco
                  }}</span>
                  <app-field-help scope="projects" page="form" field="objectives" />
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
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-card font-bold text-fg">
          {{ 'projects.form.sections.plan' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <app-form-field [label]="'projects.fields.startDate' | transloco" inputId="cf-p-start">
              <input
                id="cf-p-start"
                type="date"
                [value]="form().start_date"
                (change)="set('start_date', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['start_date']"
                data-testid="project-start"
              />
            </app-form-field>
            @if (shownErrors()['start_date']; as key) {
              <p class="mt-1 text-meta text-fail-ink">{{ key | transloco }}</p>
            }
          </div>
          <div>
            <app-form-field [label]="'projects.fields.dueDate' | transloco" inputId="cf-p-due">
              <input
                id="cf-p-due"
                type="date"
                [value]="form().due_date"
                (change)="set('due_date', $any($event.target).value)"
                [attr.aria-invalid]="!!shownErrors()['due_date']"
                [attr.aria-describedby]="shownErrors()['due_date'] ? 'cf-p-due-err' : null"
                data-testid="project-due"
              />
            </app-form-field>
            @if (shownErrors()['due_date']; as key) {
              <p id="cf-p-due-err" class="mt-1 text-meta text-fail-ink" data-testid="due-error">
                {{ key | transloco }}
              </p>
            }
          </div>
          <div>
            <app-form-field
              [label]="'projects.fields.priority' | transloco"
              inputId="cf-p-priority"
            >
              <select id="cf-p-priority" (change)="setPriority($any($event.target).value)">
                @for (p of priorities; track p) {
                  <option [value]="p" [selected]="form().priority === p">
                    {{ 'projects.priorities.' + p | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          </div>
          @if (mode() === 'edit') {
            <div>
              <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                <label for="cf-p-health" class="text-ui font-semibold text-fg-muted">{{
                  'projects.fields.health' | transloco
                }}</label>
                <app-field-help scope="projects" page="form" field="health" />
              </div>
              <app-form-field inputId="cf-p-health">
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
            </div>
          }
        </div>
      </app-card>

      <app-card>
        <h2 class="mb-4 font-display text-card font-bold text-fg">
          {{ 'projects.form.sections.people' | transloco }}
        </h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-p-owner" class="text-ui font-semibold text-fg-muted">{{
                'projects.fields.owner' | transloco
              }}</label>
              <app-field-help scope="projects" page="form" field="owner" />
            </div>
            <app-form-field inputId="cf-p-owner">
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
          </div>
          <div>
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
          </div>
        </div>

        @if (mode() === 'create') {
          <div class="mt-5 mb-2 flex flex-wrap items-center gap-1.5">
            <h3 class="text-body font-semibold text-fg">{{ 'projects.form.team' | transloco }}</h3>
            <app-field-help scope="projects" page="detail" field="team" />
          </div>
          <p class="mb-3 text-meta text-fg-muted">{{ 'projects.form.teamHint' | transloco }}</p>
          @if (form().members.length) {
            <ul class="mb-3 flex flex-col gap-2" data-testid="form-members">
              @for (m of form().members; track m.user_id) {
                <li
                  class="flex flex-wrap items-center gap-2 rounded-tile border border-border px-3 py-2 text-ui"
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
          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-[200px] flex-1">
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
            </div>
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
        }
      </app-card>

      <app-card>
        <h2 class="mb-2 font-display text-card font-bold text-fg">
          {{ 'projects.form.sections.security' | transloco }}
        </h2>
        <div class="flex flex-wrap items-center gap-1.5">
          <label class="flex min-h-8 items-center gap-2 text-body text-fg">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="form().security_relevant"
              (change)="set('security_relevant', $any($event.target).checked)"
              data-testid="project-security"
            />
            {{ 'projects.fields.securityRelevant' | transloco }}
          </label>
          <app-field-help scope="projects" page="form" field="security_relevant" />
        </div>
        @if (form().security_relevant) {
          <div class="mt-3">
            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
              <label for="cf-p-secreq" class="text-ui font-semibold text-fg-muted">{{
                'projects.fields.securityRequirements' | transloco
              }}</label>
              <app-field-help scope="projects" page="form" field="security_requirements" />
              <app-ask-about
                [prompt]="'projects.ask.securityRequirements' | transloco"
                field="security_requirements"
                [fieldLabel]="'projects.fields.securityRequirements' | transloco"
                [requirements]="securityRefs"
              />
            </div>
            <app-form-field inputId="cf-p-secreq">
              <textarea
                id="cf-p-secreq"
                name="security_requirements"
                rows="3"
                maxlength="20000"
                [value]="form().security_requirements"
                (input)="set('security_requirements', $any($event.target).value)"
              ></textarea>
            </app-form-field>
            <p class="mt-1 text-meta text-fg-subtle">
              {{ 'projects.form.securityChecklistHint' | transloco }}
            </p>
          </div>
        }
      </app-card>

      @if (mode() === 'edit') {
        <app-card>
          <app-form-field [label]="'projects.form.changeReason' | transloco" inputId="cf-p-reason">
            <input
              id="cf-p-reason"
              type="text"
              maxlength="2000"
              [value]="changeReason()"
              (input)="changeReason.set($any($event.target).value)"
            />
          </app-form-field>
          <p class="mt-1 text-meta text-fg-subtle">
            {{ 'projects.form.changeReasonHint' | transloco }}
          </p>
        </app-card>
      }

      @if (attempted() && hasErrors()) {
        <p class="text-ui text-fail-ink" role="alert" data-testid="form-error-summary">
          {{ 'projects.form.errors.summary' | transloco }}
        </p>
      }
      <div
        class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
      >
        <app-button variant="secondary" (click)="cancelled.emit()">
          {{ 'common.cancel' | transloco }}
        </app-button>
        <app-button type="submit" [loading]="busy()" [disabled]="busy()" data-testid="project-save">
          {{ (mode() === 'create' ? 'projects.form.create' : 'common.save') | transloco }}
        </app-button>
      </div>
    </form>
  `,
})
export class ProjectForm {
  private readonly assignees = inject(AssigneeOptionsService);

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

  protected submit(): void {
    this.attempted.set(true);
    if (this.hasErrors() || this.busy()) {
      return;
    }
    this.submitted.emit({ value: this.form(), changeReason: this.changeReason() });
  }
}
