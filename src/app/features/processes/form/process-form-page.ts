import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { SearchHit } from '../../../core/kit/kit.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AcceptedSuggestion, FormSuggest } from '../../../shared/ask/form-suggest';
import { suggestDefs, suggestValues } from '../../../shared/ask/form-suggest-map';
import {
  PROCESS_SUGGEST_FIELDS,
  PROCESS_SUGGEST_KEY,
  processSuggestPatch,
} from './process-suggest';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Term } from '../../../shared/guidance/term';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { DateInput } from '../../../shared/ui/date-input/date-input';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { FormSection } from '../../../shared/ui/form-section/form-section';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { categoryKey, frameworkKey } from '../data/process-display';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import {
  Kpi,
  PROCESS_CATEGORIES,
  PROCESS_ENTITY_TYPE,
  PROCESS_FRAMEWORKS,
  PROCESS_MODULE,
  ProcessCategory,
  ProcessDetail,
  TURTLE_LIST_FIELDS,
  TurtleListField,
} from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import { RecordSearch } from '../shared/record-search';
import { ProcessField } from './process-field';
import {
  ProcessFormValue,
  emptyForm,
  formFromDetail,
  toCreateRequest,
  toUpdateRequest,
  validateForm,
} from './process-form-model';
import { StringListEditor } from './string-list-editor';

type TextField =
  | 'title'
  | 'code'
  | 'purpose'
  | 'scope'
  | 'owner_user_id'
  | 'department_id'
  | 'parent_id'
  | 'review_interval_months'
  | 'next_review_at';

/**
 * Create (`/processes/new`, "Ny prosess") and edit (`/processes/:id/edit`) a
 * process: the basics (title, code, category, owner, department, parent,
 * purpose, scope, the standards it serves), the process on one page (inputs,
 * outputs, resources, competence, methods, risks and KPIs, where each KPI can be
 * linked to a KPI in "Mål og KPI-er"), and the review cycle. Every field has a
 * visible hint and a "?" with more help; "Foreslå prosess" at the top proposes the
 * whole form (reviewed field by field before it is used). Editing sends only the changed fields with
 * an optional change reason. `?fromRequirement=` opens it as evidence for a
 * requirement (P1/P4 create-from-here).
 */
@Component({
  selector: 'app-process-form-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    FormSuggest,
    AskAbout,
    FieldHelp,
    Term,
    WhyItMatters,
    FlowBanner,
    Alert,
    Button,
    DateInput,
    ErrorState,
    FormActions,
    FormField,
    FormSection,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    ProcessField,
    RecordSearch,
    StringListEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'processes.form.editTitle' : 'processes.form.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="id() ? ['/processes', id()] : '/processes'"
        [backLabelKey]="id() ? 'processes.form.backToProcess' : 'processes.form.backToList'"
      />
      <app-flow-banner [flow]="flow()" />
      <app-help-strip scope="processes" page="form" />

      @if (loadError()) {
        <app-error-state (retry)="reload()" />
      } @else if (id() && !original()) {
        <app-loading-state [rows]="6" />
      } @else {
        <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); submit()" novalidate>
          <app-form-suggest
            [suggestKey]="suggestKey"
            labelKey="ask.formSuggest.labels.process"
            [fields]="suggestFields()"
            [values]="suggestValues()"
            [context]="{ from: 'processes' }"
            [editing]="!!id()"
            [titleOnly]="canDraft() && !form().purpose.trim() && !form().inputs.length"
            (applied)="applySuggestion($event)"
          />
          <app-form-section
            [title]="'processes.form.sections.basics' | transloco"
            [description]="
              (id() ? 'processes.form.sections.basicsHint' : 'processes.form.draftHint') | transloco
            "
          >
            <div
              class="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:col-span-2 sm:grid-cols-[1fr_170px]"
            >
              <app-process-field
                labelKey="processes.fields.title"
                inputId="pf-title"
                [required]="true"
                help="title"
                hintKey="processes.form.hints.title"
              >
                <input
                  id="pf-title"
                  required
                  maxlength="255"
                  [attr.aria-invalid]="attempted() && !form().title.trim()"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                  data-testid="field-title"
                />
              </app-process-field>
              <app-process-field
                labelKey="processes.fields.code"
                inputId="pf-code"
                help="code"
                [optional]="!id()"
              >
                <input
                  id="pf-code"
                  maxlength="32"
                  [placeholder]="'processes.form.codePlaceholder' | transloco"
                  [value]="form().code"
                  (input)="set('code', $any($event.target).value)"
                />
              </app-process-field>
            </div>
            <app-process-field
              labelKey="processes.fields.category"
              inputId="pf-category"
              help="category"
              hintKey="processes.form.hints.category"
            >
              <select id="pf-category" (change)="setCategory($any($event.target).value)">
                @for (c of categories; track c) {
                  <option [value]="c" [selected]="c === form().category">
                    {{ categoryKey(c) | transloco }}
                  </option>
                }
              </select>
            </app-process-field>
            <app-process-field
              labelKey="processes.fields.owner"
              inputId="pf-owner"
              help="owner"
              hintKey="processes.form.hints.owner"
            >
              <select id="pf-owner" (change)="set('owner_user_id', $any($event.target).value)">
                <option value="" [selected]="!form().owner_user_id">
                  {{ 'processes.form.noOwner' | transloco }}
                </option>
                @if (orphanOwner(); as orphan) {
                  <option [value]="orphan.id" selected>{{ orphan.name }}</option>
                }
                @for (u of references.users(); track u.id) {
                  <option [value]="u.id" [selected]="u.id === form().owner_user_id">
                    {{ u.name }}
                  </option>
                }
              </select>
            </app-process-field>
            <app-process-field
              labelKey="processes.fields.department"
              inputId="pf-department"
              [optional]="true"
            >
              <select id="pf-department" (change)="set('department_id', $any($event.target).value)">
                <option value="" [selected]="!form().department_id">
                  {{ 'processes.form.noDepartment' | transloco }}
                </option>
                @if (orphanDepartment(); as orphan) {
                  <option [value]="orphan.id" selected>{{ orphan.name }}</option>
                }
                @for (d of references.departments(); track d.id) {
                  <option [value]="d.id" [selected]="d.id === form().department_id">
                    {{ d.name }}
                  </option>
                }
              </select>
            </app-process-field>
            <app-process-field
              labelKey="processes.fields.parent"
              inputId="pf-parent"
              help="parent"
              [optional]="true"
            >
              <select id="pf-parent" (change)="set('parent_id', $any($event.target).value)">
                <option value="" [selected]="!form().parent_id">
                  {{ 'processes.form.noParent' | transloco }}
                </option>
                @for (p of parentOptions(); track p.id) {
                  <option [value]="p.id" [selected]="p.id === form().parent_id">
                    {{ p.code }} · {{ p.title }}
                  </option>
                }
              </select>
            </app-process-field>
            <app-process-field
              span="full"
              labelKey="processes.fields.purpose"
              inputId="pf-purpose"
              help="purpose"
              hintKey="processes.form.hints.purpose"
            >
              <app-ask-about
                label-extra
                [prompt]="'processes.form.askPurpose' | transloco"
                field="purpose"
              />
              <textarea
                id="pf-purpose"
                rows="3"
                maxlength="10000"
                [value]="form().purpose"
                (input)="set('purpose', $any($event.target).value)"
              ></textarea>
            </app-process-field>
            <app-process-field
              span="full"
              labelKey="processes.fields.scope"
              inputId="pf-scope"
              help="scope"
              hintKey="processes.form.hints.scope"
            >
              <app-ask-about
                label-extra
                [prompt]="'processes.form.askScope' | transloco"
                field="scope"
              />
              <textarea
                id="pf-scope"
                rows="2"
                maxlength="10000"
                [value]="form().scope"
                (input)="set('scope', $any($event.target).value)"
              ></textarea>
            </app-process-field>
            <fieldset class="sm:col-span-2">
              <legend class="flex min-h-6 items-center gap-1.5 text-ui font-semibold text-fg-muted">
                {{ 'processes.fields.frameworks' | transloco }}
                <app-field-help
                  scope="processes"
                  page="form"
                  field="frameworks"
                  [label]="'processes.fields.frameworks' | transloco"
                />
              </legend>
              <div
                class="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4"
                data-testid="field-frameworks"
              >
                @for (key of frameworks; track key) {
                  <label
                    class="flex h-10 cursor-pointer items-center gap-2 rounded-tile border px-3 text-ui font-medium focus-within:ring-2 focus-within:ring-accent"
                    [class]="
                      form().frameworks.includes(key)
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border text-fg hover:border-border-strong'
                    "
                  >
                    <input
                      type="checkbox"
                      [checked]="form().frameworks.includes(key)"
                      (change)="toggleFramework(key, $any($event.target).checked)"
                    />
                    {{ frameworkKey(key) | transloco }}
                  </label>
                }
              </div>
              <p class="mt-1.5 text-meta leading-snug text-fg-subtle">
                {{ 'processes.form.hints.frameworks' | transloco }}
              </p>
            </fieldset>
          </app-form-section>

          <app-form-section
            [title]="'processes.turtle.titleLead' | transloco"
            [description]="'processes.form.turtleHint' | transloco"
          >
            <span title-suffix class="font-normal text-fg-muted"
              >(<app-term key="turtle" scope="processes">{{
                'processes.turtle.titleTerm' | transloco
              }}</app-term
              >)</span
            >
            @for (field of listFields; track field) {
              <app-form-field
                [label]="'processes.fields.' + field | transloco"
                [hint]="'processes.form.hints.' + field | transloco"
              >
                <app-field-help
                  label-suffix
                  scope="processes"
                  page="form"
                  [field]="field"
                  [label]="'processes.fields.' + field | transloco"
                />
                <app-string-list-editor
                  [name]="field"
                  [label]="'processes.fields.' + field | transloco"
                  [items]="form()[field]"
                  (itemsChange)="setList(field, $event)"
                />
              </app-form-field>
            }
            @if (id()) {
              <p class="rounded-tile bg-surface-2 px-3 py-2 text-meta text-fg-muted sm:col-span-2">
                {{ 'processes.form.linkOnPage' | transloco }}
              </p>
            }

            <div class="border-t border-border pt-5 sm:col-span-2">
              <div class="mb-1 flex min-h-6 items-center gap-1.5">
                <h3 class="text-card font-bold text-fg">
                  {{ 'processes.fields.kpis' | transloco }}
                </h3>
                <app-field-help
                  scope="processes"
                  page="form"
                  field="kpis"
                  [label]="'processes.fields.kpis' | transloco"
                />
                <span class="ml-auto">
                  <app-ask-about [prompt]="'processes.form.askKpis' | transloco" field="kpis" />
                </span>
              </div>
              <p class="text-meta text-fg-muted">{{ 'processes.form.hints.kpis' | transloco }}</p>
              <div class="mt-2 flex flex-col gap-2">
                @for (kpi of form().kpis; track $index; let i = $index) {
                  <div class="rounded-tile border border-border p-2" data-testid="kpi-row">
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                      <input
                        class="cf-kpi col-span-2 sm:col-span-1"
                        maxlength="200"
                        [attr.aria-label]="'processes.kpi.name' | transloco"
                        [placeholder]="'processes.kpi.name' | transloco"
                        [value]="kpi.name"
                        (input)="setKpi(i, { name: $any($event.target).value })"
                      />
                      <input
                        class="cf-kpi"
                        maxlength="200"
                        [attr.aria-label]="'processes.kpi.target' | transloco"
                        [placeholder]="'processes.kpi.target' | transloco"
                        [value]="kpi.target ?? ''"
                        (input)="setKpi(i, { target: $any($event.target).value })"
                      />
                      <input
                        class="cf-kpi"
                        maxlength="50"
                        [attr.aria-label]="'processes.kpi.unit' | transloco"
                        [placeholder]="'processes.kpi.unit' | transloco"
                        [value]="kpi.unit ?? ''"
                        (input)="setKpi(i, { unit: $any($event.target).value })"
                      />
                      <input
                        class="cf-kpi"
                        maxlength="50"
                        [attr.aria-label]="'processes.kpi.frequency' | transloco"
                        [placeholder]="'processes.kpi.frequency' | transloco"
                        [value]="kpi.frequency ?? ''"
                        (input)="setKpi(i, { frequency: $any($event.target).value })"
                      />
                      <button
                        type="button"
                        class="flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        [attr.aria-label]="'processes.kpi.remove' | transloco: { name: kpi.name }"
                        (click)="removeKpi(i)"
                      >
                        <app-icon name="x" [size]="14" />
                      </button>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-2 text-meta">
                      @if (kpi.kpi_id) {
                        <span
                          class="inline-flex items-center gap-1.5 text-fg"
                          data-testid="kpi-linked"
                        >
                          <app-icon name="link" [size]="13" class="text-accent" />
                          {{
                            'processes.kpi.linkedTo' | transloco: { title: kpiLabel(kpi.kpi_id) }
                          }}
                        </span>
                        <button
                          type="button"
                          class="font-semibold text-accent hover:underline"
                          (click)="setKpi(i, { kpi_id: null })"
                        >
                          {{ 'processes.kpi.unlink' | transloco }}
                        </button>
                      } @else if (linkingKpi() === i) {
                        <div class="w-full">
                          <app-process-record-search
                            [types]="kpiTypes"
                            labelKey="processes.kpi.searchLabel"
                            placeholderKey="processes.kpi.searchPlaceholder"
                            (picked)="linkKpi(i, $event)"
                          />
                          <button
                            type="button"
                            class="mt-1 font-semibold text-fg-muted hover:text-fg"
                            (click)="linkingKpi.set(null)"
                          >
                            {{ 'common.cancel' | transloco }}
                          </button>
                        </div>
                      } @else {
                        <span class="text-fg-muted">{{
                          'processes.kpi.notLinked' | transloco
                        }}</span>
                        <button
                          type="button"
                          class="font-semibold text-accent hover:underline"
                          (click)="linkingKpi.set(i)"
                          data-testid="kpi-link"
                        >
                          {{ 'processes.kpi.link' | transloco }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
              @if (form().kpis.length < 50) {
                <app-button class="mt-3" variant="secondary" size="sm" (click)="addKpi()">
                  <app-icon name="plus" [size]="14" />
                  {{ 'processes.kpi.add' | transloco }}
                </app-button>
              }
            </div>
          </app-form-section>

          <app-form-section
            [title]="'processes.form.sections.review' | transloco"
            [description]="'processes.form.hints.review' | transloco"
          >
            <app-process-field
              labelKey="processes.fields.reviewInterval"
              inputId="pf-interval"
              help="reviewInterval"
            >
              <input
                id="pf-interval"
                type="number"
                min="1"
                max="60"
                step="1"
                [value]="form().review_interval_months"
                (input)="set('review_interval_months', $any($event.target).value)"
              />
            </app-process-field>
            <app-process-field
              labelKey="processes.fields.nextReview"
              inputId="pf-next-review"
              help="nextReview"
              [optional]="true"
            >
              <app-date-input
                inputId="pf-next-review"
                [value]="form().next_review_at"
                (valueChange)="set('next_review_at', $event ?? '')"
              />
            </app-process-field>
          </app-form-section>
          @if (id()) {
            <app-form-section [columns]="1">
              <app-process-field
                labelKey="processes.fields.changeReason"
                inputId="pf-reason"
                help="changeReason"
                [optional]="true"
              >
                <input
                  id="pf-reason"
                  maxlength="1000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-process-field>
            </app-form-section>
          }

          @if (problems().length > 0 && attempted()) {
            <app-alert tone="error">
              <p class="font-semibold">{{ 'processes.form.errors.intro' | transloco }}</p>
              <ul class="list-disc pl-4">
                @for (p of problems(); track p) {
                  <li>{{ p | transloco }}</li>
                }
              </ul>
            </app-alert>
          }

          <app-form-actions
            [message]="
              attempted() && problems().length ? ('processes.form.errors.intro' | transloco) : ''
            "
          >
            <a [routerLink]="id() ? ['/processes', id()] : ['/processes']">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving()"
              data-testid="submit"
            >
              {{ (id() ? 'processes.form.save' : 'processes.form.create') | transloco }}
            </app-button>
          </app-form-actions>
        </form>
        <app-why-it-matters class="mt-8 block" scope="processes" page="form" />
      }
    </div>
  `,
  styles: [
    `
      .cf-kpi {
        width: 100%;
        height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 10px;
        outline: none;
      }
      .cf-kpi:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ProcessFormPage {
  private readonly api = inject(ProcessesApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);
  protected readonly language = inject(LanguageService);
  protected readonly references = inject(ProcessReferences);

  /** Route param; set on `/processes/:id/edit`, absent on `/processes/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly categories = PROCESS_CATEGORIES;
  protected readonly frameworks = PROCESS_FRAMEWORKS;
  protected readonly categoryKey = categoryKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly listFields = TURTLE_LIST_FIELDS;
  protected readonly entityType = PROCESS_ENTITY_TYPE;
  protected readonly kpiTypes = ['kpi'];

  /** A create-from-here / "document this requirement" flow the form was opened with. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: PROCESS_ENTITY_TYPE,
  });

  protected readonly form = signal<ProcessFormValue>(emptyForm(this.auth.user()?.id ?? ''));
  protected readonly original = signal<ProcessDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly changeReason = signal('');
  protected readonly linkingKpi = signal<number | null>(null);
  /** Labels of KPI records picked in this session (id -> "KPI-3 Title"). */
  private readonly kpiLabels = signal<Readonly<Record<string, string>>>({});

  protected readonly problems = computed(() => validateForm(this.form()));
  protected readonly canDraft = computed(() => this.form().title.trim().length > 0);

  protected readonly breadcrumbs = computed(() => {
    const original = this.original();
    const crumbs: { labelKey?: string; label?: string; link?: string | readonly unknown[] }[] = [
      { labelKey: 'modules.names.processes', link: '/processes' },
    ];
    if (original) {
      crumbs.push({ label: original.title, link: ['/processes', original.id] });
    }
    crumbs.push({ labelKey: this.id() ? 'processes.form.editTitle' : 'processes.form.newTitle' });
    return crumbs;
  });

  protected readonly parentOptions = computed(() => {
    const id = this.id();
    return this.references.processes().filter((p) => p.id !== id && p.status !== 'retired');
  });

  /** The current owner when the member list doesn't include them (e.g. no `documents:read`). */
  protected readonly orphanOwner = computed(() => {
    const original = this.original()?.owner;
    const value = this.form().owner_user_id;
    if (!original || original.id !== value || this.references.users().some((u) => u.id === value)) {
      return null;
    }
    return { id: original.id, name: original.name ?? original.id };
  });

  protected readonly orphanDepartment = computed(() => {
    const original = this.original()?.department;
    const value = this.form().department_id;
    if (
      !original ||
      original.id !== value ||
      this.references.departments().some((d) => d.id === value)
    ) {
      return null;
    }
    return { id: original.id, name: original.name ?? original.id };
  });

  protected readonly suggestKey = PROCESS_SUGGEST_KEY;
  protected readonly suggestFields = computed(() =>
    suggestDefs(PROCESS_SUGGEST_FIELDS, (key, params) => this.language.translate(key, params)),
  );
  protected readonly suggestValues = computed(() =>
    suggestValues(PROCESS_SUGGEST_FIELDS, this.form(), { id: this.id() ?? null }),
  );

  constructor() {
    providePageContext(() => {
      const id = this.id();
      return {
        module: PROCESS_MODULE,
        entityType: id ? PROCESS_ENTITY_TYPE : null,
        entityId: id ?? null,
        view: id ? 'edit' : 'new',
        title: this.form().title || null,
      };
    });

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.references.ensurePeople();
        this.references.ensureProcesses();
        if (id) {
          this.load(orgId, id);
        }
      });
    });

    // Prefill a new process from the flow it was opened with (title / description).
    effect(() => {
      const flow = this.flow();
      if (!flow || this.id()) {
        return;
      }
      untracked(() => {
        const prefill = flow.prefill;
        this.form.update((f) => ({
          ...f,
          title: f.title || (typeof prefill.title === 'string' ? prefill.title : ''),
          purpose:
            f.purpose ||
            (typeof prefill['purpose'] === 'string'
              ? prefill['purpose']
              : typeof prefill.description === 'string'
                ? prefill.description
                : ''),
        }));
      });
    });
  }

  private load(orgId: string, id: string): void {
    this.loadError.set(null);
    this.api.get(orgId, id).subscribe({
      next: (process) => {
        this.original.set(process);
        this.form.set(formFromDetail(process));
        const labels: Record<string, string> = {};
        for (const s of process.kpi_status ?? []) {
          if (s.kpi_id) {
            labels[s.kpi_id] = [s.code, s.title].filter(Boolean).join(' ') || s.name;
          }
        }
        this.kpiLabels.set(labels);
      },
      error: (error) => this.loadError.set(processErrorKey(error)),
    });
  }

  protected reload(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const id = this.id();
    if (orgId && id) {
      this.load(orgId, id);
    }
  }

  protected kpiLabel(id: string): string {
    return this.kpiLabels()[id] ?? this.language.translate('processes.kpi.aKpi');
  }

  protected set(field: TextField, value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  protected setCategory(value: string): void {
    this.form.update((f) => ({ ...f, category: value as ProcessCategory }));
  }

  protected toggleFramework(key: string, on: boolean): void {
    this.form.update((f) => ({
      ...f,
      frameworks: on
        ? PROCESS_FRAMEWORKS.filter((k) => k === key || f.frameworks.includes(k))
        : f.frameworks.filter((k) => k !== key),
    }));
  }

  protected setList(field: TurtleListField, items: readonly string[]): void {
    this.form.update((f) => ({ ...f, [field]: items }));
  }

  protected addKpi(): void {
    this.form.update((f) => ({ ...f, kpis: [...f.kpis, { name: '' }] }));
  }

  protected setKpi(index: number, patch: Partial<Kpi>): void {
    this.form.update((f) => ({
      ...f,
      kpis: f.kpis.map((k, i) => (i === index ? { ...k, ...patch } : k)),
    }));
  }

  protected linkKpi(index: number, hit: SearchHit): void {
    this.kpiLabels.update((labels) => ({
      ...labels,
      [hit.entity_id]: [hit.code, hit.title].filter(Boolean).join(' '),
    }));
    const current = this.form().kpis[index];
    this.setKpi(index, { kpi_id: hit.entity_id, name: current?.name.trim() || hit.title });
    this.linkingKpi.set(null);
  }

  protected removeKpi(index: number): void {
    this.form.update((f) => ({ ...f, kpis: f.kpis.filter((_, i) => i !== index) }));
  }

  /** Accepted whole-form suggestions fill the form; nothing is saved until "Save". */
  protected applySuggestion(accepted: AcceptedSuggestion): void {
    const change = processSuggestPatch(accepted);
    this.form.update((f) => ({ ...f, ...change }));
  }

  protected submit(): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving() || this.problems().length > 0) {
      return;
    }
    const original = this.original();
    const id = this.id();
    if (id && original) {
      const patch = toUpdateRequest(this.form(), original, this.changeReason());
      if (Object.keys(patch).length === 0) {
        void this.router.navigate(['/processes', id]);
        return;
      }
      this.saving.set(true);
      this.api.update(orgId, id, patch).subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.notifications.success('processes.notices.saved');
          void this.router.navigate(['/processes', saved.id]);
        },
        error: (error) => this.fail(error),
      });
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, toCreateRequest(this.form())).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.references.ensureProcesses(true);
        if (this.flow()) {
          this.flows.complete(created.id, PROCESS_ENTITY_TYPE).subscribe();
        }
        this.notifications.success('processes.notices.created', { code: created.code });
        void this.router.navigate(['/processes', created.id]);
      },
      error: (error) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.notifications.error(processErrorKey(error));
  }
}
