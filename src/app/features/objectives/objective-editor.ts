import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { OwnerSelect } from './components/owner-select';
import { ObjectivesApi } from './data/objectives-api';
import { objectivesErrorKey } from './data/objectives-errors';
import {
  ASSIST_SUGGEST_SMART,
  MANAGEMENT_SYSTEMS,
  ManagementSystem,
  NEW_OBJECTIVE_STATUSES,
  OBJECTIVE_STATUSES,
  ObjectiveDetail,
  ObjectiveStatus,
  SmartSuggestions,
  SuggestedObjective,
  UpdateObjectiveRequest,
} from './data/objectives.models';
import {
  OBJECTIVES_MODULE,
  OBJECTIVES_SCOPE,
  addMonthsIso,
  isClosedObjective,
  managementSystemKey,
  objectiveStatusKey,
  textOrNull,
  todayIso,
} from './objectives-display';

/** Editable values of the objective form (text inputs as strings). */
export interface ObjectiveFormValue {
  readonly title: string;
  readonly description: string;
  readonly management_system: ManagementSystem | '';
  readonly status: ObjectiveStatus;
  readonly owner_user_id: string | null;
  readonly department_id: string | null;
  readonly target: string;
  readonly plan: string;
  readonly resources: string;
  readonly evaluation_method: string;
  readonly start_date: string;
  readonly due_date: string;
  readonly progress: string;
  readonly closing_note: string;
}

export const EMPTY_OBJECTIVE_FORM: ObjectiveFormValue = {
  title: '',
  description: '',
  management_system: '',
  status: 'draft',
  owner_user_id: null,
  department_id: null,
  target: '',
  plan: '',
  resources: '',
  evaluation_method: '',
  start_date: '',
  due_date: '',
  progress: '',
  closing_note: '',
};

export function objectiveToForm(o: ObjectiveDetail): ObjectiveFormValue {
  return {
    title: o.title,
    description: o.description ?? '',
    management_system: o.management_system ?? '',
    status: o.status,
    owner_user_id: o.owner?.id ?? null,
    department_id: o.department_id,
    target: o.target ?? '',
    plan: o.plan ?? '',
    resources: o.resources ?? '',
    evaluation_method: o.evaluation_method ?? '',
    start_date: o.start_date ?? '',
    due_date: o.due_date ?? '',
    progress: o.progress === null ? '' : String(o.progress),
    closing_note: o.closing_note ?? '',
  };
}

/** The API payload for a form value (empty text is null). */
export function objectivePayload(
  f: ObjectiveFormValue,
): Required<Omit<UpdateObjectiveRequest, 'change_reason'>> {
  const progress = f.progress.trim() === '' ? null : Math.round(Number(f.progress));
  return {
    title: f.title.trim(),
    description: textOrNull(f.description),
    management_system: f.management_system || null,
    status: f.status,
    owner_user_id: f.owner_user_id,
    department_id: f.department_id,
    target: textOrNull(f.target),
    plan: textOrNull(f.plan),
    resources: textOrNull(f.resources),
    evaluation_method: textOrNull(f.evaluation_method),
    start_date: f.start_date || null,
    due_date: f.due_date || null,
    progress,
    closing_note: textOrNull(f.closing_note),
  };
}

/** Only the fields that differ from `before` (so unchanged values are not re-sent). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      out[key] = after[key];
    }
  }
  return out;
}

let nextId = 0;

/**
 * `/objectives/new` and `/objectives/:id/edit`: the objective form (title,
 * management system, owner, SMART target, plan, resources, how results are
 * evaluated, dates and progress). New objectives can start from AI-suggested
 * SMART objectives; edits record a change reason in the revision history.
 */
@Component({
  selector: 'app-objective-editor',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    OwnerSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/objectives', id()] : ['/objectives']"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{
          (id() ? 'objectives.common.backToObjective' : 'objectives.common.backToList') | transloco
        }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ (id() ? 'objectives.form.editTitle' : 'objectives.form.newTitle') | transloco }}
      </h1>

      <div class="mb-4"><app-guide-intro [scope]="scope" page="form" /></div>

      @if (state() === 'loading') {
        <p class="py-10 text-center text-[14px] text-fg-muted">
          {{ 'objectives.common.loading' | transloco }}
        </p>
      } @else if (state() === 'error') {
        <app-alert tone="error">{{ 'objectives.common.loadFailed' | transloco }}</app-alert>
      } @else {
        @if (!id()) {
          <app-card class="mb-4 block">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <h2 class="font-display text-[15px] font-bold text-fg">
                  {{ 'objectives.ai.smartTitle' | transloco }}
                </h2>
                <p class="text-[13px] text-fg-muted">{{ 'objectives.ai.smartHint' | transloco }}</p>
              </div>
              <app-ai-assist-button
                [assist]="suggestAssist"
                labelKey="objectives.ai.suggestSmart"
                [input]="suggestInput()"
                (result)="onSuggestions($event)"
              />
            </div>
            @if (suggestions().length) {
              <ul class="mt-3 flex flex-col gap-2" data-testid="smart-suggestions">
                @for (s of suggestions(); track $index) {
                  <li class="rounded-[10px] border border-border p-3">
                    <p class="text-[13.5px] font-semibold text-fg">{{ s.title }}</p>
                    @if (s.target) {
                      <p class="mt-0.5 text-[12.5px] text-fg-muted">{{ s.target }}</p>
                    }
                    @if (s.kpis?.length) {
                      <p class="mt-1 text-[12px] text-fg-subtle">
                        {{ 'objectives.ai.suggestedKpis' | transloco }}
                        {{ kpiNames(s) }}
                      </p>
                    }
                    <div class="mt-2">
                      <app-button size="sm" variant="secondary" (click)="applySuggestion(s)">
                        {{ 'objectives.ai.useSuggestion' | transloco }}
                      </app-button>
                    </div>
                  </li>
                }
              </ul>
              <p class="mt-2 text-[12px] text-fg-subtle">
                {{ 'objectives.ai.suggestionNote' | transloco }}
              </p>
            }
          </app-card>
        }

        <app-card>
          <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
            @if (errorKey(); as key) {
              <app-alert tone="error">{{ key | transloco }}</app-alert>
            }

            <div>
              <app-form-field
                [label]="'objectives.fields.title' | transloco"
                [inputId]="fid('title')"
              >
                <input
                  [id]="fid('title')"
                  type="text"
                  maxlength="255"
                  required
                  autocomplete="off"
                  [attr.aria-invalid]="titleMissing() || null"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                />
              </app-form-field>
              <app-field-help [scope]="scope" page="form" field="title" />
              @if (titleMissing()) {
                <p class="mt-1 text-[12.5px] text-fail">
                  {{ 'objectives.errors.title_required' | transloco }}
                </p>
              }
            </div>

            <div>
              <app-form-field
                [label]="'objectives.fields.description' | transloco"
                [inputId]="fid('description')"
              >
                <textarea
                  [id]="fid('description')"
                  rows="3"
                  maxlength="20000"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-form-field>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'objectives.fields.managementSystem' | transloco"
                  [inputId]="fid('ms')"
                >
                  <select
                    [id]="fid('ms')"
                    (change)="set('management_system', $any($event.target).value)"
                  >
                    <option value="" [selected]="!form().management_system">
                      {{ 'objectives.form.noSystem' | transloco }}
                    </option>
                    @for (m of systems; track m) {
                      <option [value]="m" [selected]="form().management_system === m">
                        {{ systemKey(m) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="managementSystem" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.status' | transloco"
                  [inputId]="fid('status')"
                >
                  <select [id]="fid('status')" (change)="set('status', $any($event.target).value)">
                    @for (s of statuses(); track s) {
                      <option [value]="s" [selected]="form().status === s">
                        {{ statusKey(s) | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="status" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.owner' | transloco"
                  [inputId]="fid('owner')"
                >
                  <app-objectives-owner-select
                    kind="user"
                    [inputId]="fid('owner')"
                    [value]="form().owner_user_id"
                    [currentName]="ownerName()"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="owner" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.department' | transloco"
                  [inputId]="fid('department')"
                >
                  <app-objectives-owner-select
                    kind="department"
                    [inputId]="fid('department')"
                    [value]="form().department_id"
                    (valueChange)="set('department_id', $event)"
                  />
                </app-form-field>
              </div>
            </div>

            <div>
              <div class="flex items-end gap-1">
                <div class="min-w-0 flex-1">
                  <app-form-field
                    [label]="'objectives.fields.target' | transloco"
                    [inputId]="fid('target')"
                  >
                    <textarea
                      [id]="fid('target')"
                      rows="2"
                      maxlength="5000"
                      [value]="form().target"
                      (input)="set('target', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <app-ask-about
                  field="target"
                  labelKey="objectives.ai.askTarget"
                  [prompt]="askTargetPrompt()"
                />
              </div>
              <app-field-help [scope]="scope" page="form" field="target" />
            </div>

            <div>
              <app-form-field
                [label]="'objectives.fields.plan' | transloco"
                [inputId]="fid('plan')"
              >
                <textarea
                  [id]="fid('plan')"
                  rows="4"
                  maxlength="20000"
                  [value]="form().plan"
                  (input)="set('plan', $any($event.target).value)"
                ></textarea>
              </app-form-field>
              <app-field-help [scope]="scope" page="form" field="plan" />
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <app-form-field
                  [label]="'objectives.fields.resources' | transloco"
                  [inputId]="fid('resources')"
                >
                  <textarea
                    [id]="fid('resources')"
                    rows="3"
                    maxlength="5000"
                    [value]="form().resources"
                    (input)="set('resources', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="resources" />
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.evaluationMethod' | transloco"
                  [inputId]="fid('evaluation')"
                >
                  <textarea
                    [id]="fid('evaluation')"
                    rows="3"
                    maxlength="5000"
                    [value]="form().evaluation_method"
                    (input)="set('evaluation_method', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="evaluationMethod" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <app-form-field
                  [label]="'objectives.fields.startDate' | transloco"
                  [inputId]="fid('start')"
                >
                  <input
                    [id]="fid('start')"
                    type="date"
                    [value]="form().start_date"
                    (change)="set('start_date', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.dueDate' | transloco"
                  [inputId]="fid('due')"
                >
                  <input
                    [id]="fid('due')"
                    type="date"
                    [attr.aria-invalid]="datesInvalid() || null"
                    [value]="form().due_date"
                    (change)="set('due_date', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="dueDate" />
                @if (datesInvalid()) {
                  <p class="mt-1 text-[12.5px] text-fail">
                    {{ 'objectives.errors.invalid_dates' | transloco }}
                  </p>
                }
              </div>
              <div>
                <app-form-field
                  [label]="'objectives.fields.progress' | transloco"
                  [inputId]="fid('progress')"
                >
                  <input
                    [id]="fid('progress')"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    inputmode="numeric"
                    [attr.aria-invalid]="progressInvalid() || null"
                    [value]="form().progress"
                    (input)="set('progress', $any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="progress" />
                @if (progressInvalid()) {
                  <p class="mt-1 text-[12.5px] text-fail">
                    {{ 'objectives.form.progressRange' | transloco }}
                  </p>
                }
              </div>
            </div>

            @if (closed()) {
              <div>
                <app-form-field
                  [label]="'objectives.fields.closingNote' | transloco"
                  [inputId]="fid('closing')"
                >
                  <textarea
                    [id]="fid('closing')"
                    rows="3"
                    maxlength="5000"
                    [value]="form().closing_note"
                    (input)="set('closing_note', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="closingNote" />
              </div>
            }

            @if (id()) {
              <div>
                <app-form-field
                  [label]="'objectives.fields.changeReason' | transloco"
                  [inputId]="fid('reason')"
                >
                  <input
                    [id]="fid('reason')"
                    type="text"
                    maxlength="1000"
                    [value]="changeReason()"
                    (input)="changeReason.set($any($event.target).value)"
                  />
                </app-form-field>
                <app-field-help [scope]="scope" page="form" field="changeReason" />
              </div>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <app-button variant="ghost" (click)="cancel()">
                {{ 'common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="saving()" [disabled]="saving()">
                {{ (id() ? 'objectives.form.save' : 'objectives.form.create') | transloco }}
              </app-button>
            </div>
          </form>
        </app-card>

        <div class="mt-6"><app-why-it-matters [scope]="scope" page="form" /></div>
      }
    </div>
  `,
})
export class ObjectiveEditor {
  private readonly api = inject(ObjectivesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Route param `:id` when editing (absent on `/objectives/new`). */
  readonly id = input<string | undefined>(undefined);

  protected readonly scope = OBJECTIVES_SCOPE;
  protected readonly systems = MANAGEMENT_SYSTEMS;
  protected readonly systemKey = managementSystemKey;
  protected readonly statusKey = objectiveStatusKey;
  protected readonly suggestAssist = ASSIST_SUGGEST_SMART;
  private readonly uid = ++nextId;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly original = signal<ObjectiveDetail | null>(null);
  protected readonly form = signal<ObjectiveFormValue>(EMPTY_OBJECTIVE_FORM);
  protected readonly changeReason = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly suggestions = signal<readonly SuggestedObjective[]>([]);

  protected readonly statuses = computed<readonly ObjectiveStatus[]>(() =>
    this.id() ? OBJECTIVE_STATUSES : NEW_OBJECTIVE_STATUSES,
  );
  protected readonly closed = computed(() => isClosedObjective(this.form().status));
  protected readonly titleMissing = computed(() => this.submitted() && !this.form().title.trim());
  protected readonly datesInvalid = computed(() => {
    const { start_date, due_date } = this.form();
    return !!start_date && !!due_date && due_date < start_date;
  });
  protected readonly progressInvalid = computed(() => {
    const text = this.form().progress.trim();
    if (!text) {
      return false;
    }
    const n = Number(text);
    return !Number.isFinite(n) || n < 0 || n > 100;
  });
  protected readonly ownerName = computed(() => this.original()?.owner?.name ?? null);
  protected readonly suggestInput = computed(() => {
    const f = this.form();
    const focus = [f.title, f.description]
      .map((t) => t.trim())
      .filter(Boolean)
      .join('. ');
    return {
      management_system: f.management_system || undefined,
      focus: focus || undefined,
      count: 3,
    };
  });
  protected readonly askTargetPrompt = computed(() =>
    this.language.translate('objectives.ai.prompts.askTarget', {
      title: this.form().title || '-',
      target: this.form().target || '-',
    }),
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: OBJECTIVES_MODULE,
      entityType: 'objective',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected fid(name: string): string {
    return `obj-${this.uid}-${name}`;
  }

  protected set<K extends keyof ObjectiveFormValue>(key: K, value: ObjectiveFormValue[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected kpiNames(s: SuggestedObjective): string {
    return (s.kpis ?? []).map((k) => k.name).join(', ');
  }

  protected onSuggestions(result: unknown): void {
    const list = (result as SmartSuggestions | null)?.objectives;
    this.suggestions.set(Array.isArray(list) ? list.filter((s) => !!s?.title) : []);
  }

  protected applySuggestion(s: SuggestedObjective): void {
    const start = this.form().start_date || todayIso();
    const months = Number(s.due_in_months);
    this.form.update((f) => ({
      ...f,
      title: s.title,
      description: s.description ?? f.description,
      target: s.target ?? f.target,
      plan: s.plan ?? f.plan,
      resources: s.resources ?? f.resources,
      evaluation_method: s.evaluation_method ?? f.evaluation_method,
      start_date: start,
      due_date: Number.isFinite(months) && months > 0 ? addMonthsIso(start, months) : f.due_date,
    }));
    this.notifications.success('objectives.notices.suggestionApplied');
  }

  protected cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/objectives', id] : ['/objectives']);
  }

  protected save(): void {
    this.submitted.set(true);
    this.errorKey.set(null);
    const orgId = this.selectedOrg.currentOrgId();
    if (
      !orgId ||
      this.saving() ||
      this.titleMissing() ||
      this.datesInvalid() ||
      this.progressInvalid()
    ) {
      return;
    }
    const payload = objectivePayload(this.form());
    const original = this.original();
    const id = this.id();
    this.saving.set(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { closing_note, status, ...createFields } = payload;
    const call =
      id && original
        ? this.api.update(orgId, id, {
            ...changedFields(objectivePayload(objectiveToForm(original)), payload),
            change_reason: textOrNull(this.changeReason()),
          })
        : this.api.create(orgId, {
            ...createFields,
            title: payload.title ?? '',
            status: status === 'active' ? 'active' : 'draft',
          });
    call.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.notifications.success(id ? 'objectives.notices.saved' : 'objectives.notices.created');
        void this.router.navigate(['/objectives', saved.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorKey.set(objectivesErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.request.unsubscribe();
    if (!orgId || !id) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, id).subscribe({
      next: (o) => {
        if (!o.can_edit) {
          void this.router.navigate(['/objectives', id]);
          return;
        }
        this.original.set(o);
        this.form.set(objectiveToForm(o));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
