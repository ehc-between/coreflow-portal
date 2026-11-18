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
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { ClausePicker } from '../../../shared/requirement-links/clause-picker';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { InspectionField } from '../components/inspection-field';
import { QuestionPreview } from '../components/question-preview';
import {
  EditableQuestion,
  maxScore,
  moveItem,
  newQuestion,
  nextKey,
  normaliseQuestion,
  questionProblems,
  toEditable,
  toQuestionInput,
} from '../data/answer-model';
import {
  INSPECTIONS_SETTINGS_LINK,
  questionTypeKey,
  severityKey,
} from '../data/inspection-display';
import { inspectionErrorKey, problemIndexesOf } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_GENERATE_CHECKLIST,
  GeneratedChecklist,
  INSPECTIONS_MODULE,
  QUESTION_TYPES,
  SUPPORTED_FRAMEWORKS,
  Question,
  QuestionType,
  SEVERITIES,
  Severity,
  TEMPLATE_CATEGORIES,
  TEMPLATE_ENTITY_TYPE,
  TemplateDetail,
  TemplateFields,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';
import { QuestionEditor } from './question-editor';

export interface TemplateForm {
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly frameworks: readonly string[];
  /** '' = no pass mark (any failed answer fails the inspection). */
  readonly passThreshold: string;
  readonly autoDeviation: boolean;
  /** Findings of at least this severity become deviations (with `autoDeviation`). */
  readonly deviationMinSeverity: Severity;
  readonly deviationTypeId: string;
  readonly changeReason: string;
}

export const EMPTY_TEMPLATE_FORM: TemplateForm = {
  title: '',
  description: '',
  category: '',
  frameworks: [],
  passThreshold: '',
  autoDeviation: true,
  deviationMinSeverity: 'high',
  deviationTypeId: '',
  changeReason: '',
};

export function formFromTemplate(t: TemplateDetail): TemplateForm {
  return {
    title: t.title,
    description: t.description ?? '',
    category: t.category ?? '',
    frameworks: t.frameworks,
    passThreshold: t.pass_threshold === null ? '' : String(t.pass_threshold),
    autoDeviation: t.auto_deviation,
    deviationMinSeverity: t.deviation_min_severity ?? 'high',
    deviationTypeId: t.deviation_type_id ?? '',
    changeReason: '',
  };
}

/** Parse the pass mark input: null when empty, NaN when invalid. */
export function parseThreshold(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

export function toTemplateFields(
  form: TemplateForm,
  questions: readonly EditableQuestion[],
): TemplateFields {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    category: form.category || null,
    frameworks: form.frameworks,
    questions: questions.map(toQuestionInput),
    pass_threshold: parseThreshold(form.passThreshold),
    auto_deviation: form.autoDeviation,
    deviation_min_severity: form.deviationMinSeverity,
    deviation_type_id: form.autoDeviation ? form.deviationTypeId || null : null,
    change_reason: form.changeReason.trim() || null,
  };
}

/**
 * The checklist template builder (`/inspections/templates/new`, `/:id/edit`): title,
 * description, category, the standards it is for (only those the module supports,
 * and the org has switched on), the pass mark, and when findings become deviations
 * (from a chosen severity); then the questions as one-line summaries that open for
 * editing (add by type, reorder, duplicate, remove), each citing the clauses it
 * documents. The assistant can draft a checklist from a description or a clause;
 * nothing is saved until the designer saves. Needs `inspections:templates`. Editing
 * an active template's questions or pass mark raises its version (inspections
 * already planned keep their own copy).
 */
@Component({
  selector: 'app-template-builder',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    TourStepDirective,
    WhyItMatters,
    ClausePicker,
    Alert,
    Button,
    Card,
    EmptyState,
    FormField,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
    SlideOver,
    InspectionField,
    QuestionPreview,
    QuestionEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="id() ? 'inspections.builder.editTitle' : 'inspections.builder.newTitle'"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink"
      >
        <ng-container ngProjectAs="[meta]">
          @if (original(); as t) {
            <span class="font-mono">{{ t.code }}</span>
            <span aria-hidden="true">·</span>
            <span>{{
              'inspections.templates.versionShort' | transloco: { version: t.version }
            }}</span>
          }
        </ng-container>
        <app-button
          secondary
          variant="secondary"
          (click)="aiOpen.set(true)"
          appTourStep="inspections-builder-ai"
          data-testid="open-generate"
        >
          <app-icon name="spark" [size]="15" />
          {{ 'inspections.builder.generate' | transloco }}
        </app-button>
      </app-page-header>
      <app-help-strip
        scope="inspections"
        page="builder"
        tour="builder"
        lesson="inspection-basics"
      />

      @if (original()?.status === 'archived') {
        <app-alert tone="info">{{ 'inspections.errors.template_archived' | transloco }}</app-alert>
      } @else if (id() && !original()) {
        @if (loadFailed()) {
          <app-empty-state
            icon="search"
            titleKey="inspections.templates.notFoundTitle"
            bodyKey="inspections.templates.notFound"
            ctaKey="inspections.templates.backToTemplates"
            ctaLink="/inspections/templates"
          />
        } @else {
          <app-loading-state [rows]="5" />
        }
      } @else {
        <form
          class="flex flex-col gap-5"
          (submit)="$event.preventDefault(); save(false)"
          novalidate
        >
          <app-card>
            <div class="flex flex-col gap-5">
              <app-inspection-field
                labelKey="inspections.fields.title"
                inputId="tb-title"
                page="builder"
                help="title"
              >
                <input
                  id="tb-title"
                  required
                  maxlength="255"
                  [value]="form().title"
                  (input)="set('title', $any($event.target).value)"
                  [attr.aria-invalid]="attempted() && !form().title.trim()"
                  data-testid="template-title-input"
                />
              </app-inspection-field>
              @if (attempted() && !form().title.trim()) {
                <p class="-mt-4 text-meta text-fail" role="alert">
                  {{ 'inspections.builder.problems.titleRequired' | transloco }}
                </p>
              }
              <app-inspection-field
                labelKey="inspections.fields.description"
                inputId="tb-description"
                [optional]="true"
              >
                <textarea
                  id="tb-description"
                  rows="3"
                  maxlength="20000"
                  [value]="form().description"
                  (input)="set('description', $any($event.target).value)"
                ></textarea>
              </app-inspection-field>
              <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <app-inspection-field labelKey="inspections.fields.category" inputId="tb-category">
                  <select id="tb-category" (change)="set('category', $any($event.target).value)">
                    <option value="" [selected]="!form().category">
                      {{ 'inspections.builder.noCategory' | transloco }}
                    </option>
                    @if (customCategory(); as custom) {
                      <option [value]="custom" selected>{{ custom }}</option>
                    }
                    @for (c of categories; track c) {
                      <option [value]="c" [selected]="c === form().category">
                        {{ 'inspections.category.' + c | transloco }}
                      </option>
                    }
                  </select>
                </app-inspection-field>
                <div>
                  <app-inspection-field
                    labelKey="inspections.fields.passThreshold"
                    inputId="tb-threshold"
                    page="builder"
                    help="passThreshold"
                    [optional]="true"
                  >
                    <input
                      id="tb-threshold"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      inputmode="decimal"
                      [value]="form().passThreshold"
                      [attr.aria-invalid]="thresholdInvalid()"
                      (input)="set('passThreshold', $any($event.target).value)"
                      appTourStep="inspections-builder-threshold"
                    />
                  </app-inspection-field>
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'inspections.builder.passThresholdHint' | transloco }}
                  </p>
                </div>
              </div>
              <fieldset>
                <legend
                  class="mb-1.5 flex items-center gap-1.5 text-ui font-semibold text-fg-muted"
                >
                  {{ 'inspections.fields.frameworks' | transloco }}
                  <app-field-help scope="inspections" page="builder" field="frameworks" />
                </legend>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  @for (fw of frameworkOptions(); track fw.key) {
                    <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="form().frameworks.includes(fw.key)"
                        (change)="toggleFramework(fw.key, $any($event.target).checked)"
                        [attr.data-testid]="'framework-' + fw.key"
                      />
                      {{ 'inspections.frameworks.' + fw.key | transloco }}
                      @if (!fw.enabled) {
                        <span class="text-meta text-fg-subtle">{{
                          'inspections.builder.notEnabled' | transloco
                        }}</span>
                      }
                    </label>
                  }
                </div>
                <p class="mt-1 text-meta text-fg-muted">
                  {{ 'inspections.builder.frameworksHint' | transloco }}
                </p>
              </fieldset>

              <fieldset class="rounded-card border border-border p-3.5">
                <legend class="px-1 text-ui font-semibold text-fg-muted">
                  {{ 'inspections.builder.followUp' | transloco }}
                </legend>
                <p class="mb-3 text-meta text-fg-muted">
                  {{ 'inspections.builder.findingVsDeviation' | transloco }}
                </p>
                <label class="inline-flex min-h-8 items-center gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="form().autoDeviation"
                    (change)="set('autoDeviation', $any($event.target).checked)"
                    data-testid="auto-deviation"
                  />
                  {{ 'inspections.fields.autoDeviation' | transloco }}
                  <app-field-help scope="inspections" page="builder" field="autoDeviation" />
                </label>
                @if (form().autoDeviation) {
                  <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <app-form-field
                      [label]="'inspections.fields.deviationMinSeverity' | transloco"
                      inputId="tb-minsev"
                    >
                      <select
                        id="tb-minsev"
                        (change)="set('deviationMinSeverity', $any($event.target).value)"
                        data-testid="deviation-min-severity"
                      >
                        @for (s of severities; track s) {
                          <option [value]="s" [selected]="s === form().deviationMinSeverity">
                            {{ 'inspections.builder.severityAndUp.' + s | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    @if (deviationTypes().length > 0) {
                      <app-form-field
                        [label]="'inspections.fields.deviationType' | transloco"
                        inputId="tb-devtype"
                      >
                        <select
                          id="tb-devtype"
                          (change)="set('deviationTypeId', $any($event.target).value)"
                        >
                          <option value="" [selected]="!form().deviationTypeId">
                            {{ 'inspections.templates.defaultType' | transloco }}
                          </option>
                          @for (t of deviationTypes(); track t.id) {
                            <option [value]="t.id" [selected]="t.id === form().deviationTypeId">
                              {{ t.name }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                    }
                  </div>
                }
              </fieldset>
            </div>
          </app-card>

          <section [attr.aria-label]="'inspections.builder.questionsHeading' | transloco">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="flex items-center gap-1.5 text-section font-bold text-fg">
                {{ 'inspections.builder.questionsHeading' | transloco }}
                <app-field-help scope="inspections" page="builder" field="questionType" />
              </h2>
              <span class="text-meta text-fg-muted">
                {{ 'inspections.templates.questions' | transloco: { count: questions().length } }}
                · {{ 'inspections.builder.maxScore' | transloco: { value: maxScore() } }}
              </span>
            </div>
            <datalist [id]="sectionListId">
              @for (s of sections(); track s) {
                <option [value]="s"></option>
              }
            </datalist>
            <div class="flex flex-col gap-2" data-testid="question-list">
              @for (q of questions(); track q.key; let i = $index) {
                <app-question-editor
                  [question]="q"
                  [index]="i"
                  [total]="questions().length"
                  [showProblems]="attempted()"
                  [serverInvalid]="serverInvalid().has(q.key)"
                  [sectionListId]="sectionListId"
                  [frameworks]="form().frameworks"
                  (changed)="updateQuestion(q.key, $event)"
                  (move)="moveQuestion(i, $event)"
                  (remove)="removeQuestion(q.key)"
                  (duplicate)="duplicateQuestion(i)"
                />
              } @empty {
                <app-card>
                  <p class="text-center text-body text-fg-muted">
                    {{ 'inspections.builder.empty' | transloco }}
                  </p>
                </app-card>
              }
            </div>
            <div
              class="mt-3 flex flex-wrap items-center gap-2"
              appTourStep="inspections-builder-add"
            >
              <span class="text-ui font-semibold text-fg-muted">
                {{ 'inspections.builder.add' | transloco }}
              </span>
              @for (t of types; track t) {
                <app-button
                  variant="secondary"
                  size="sm"
                  (click)="addQuestion(t)"
                  [attr.data-testid]="'add-' + t"
                >
                  <app-icon name="plus" [size]="13" />
                  {{ typeKey(t) | transloco }}
                </app-button>
              }
            </div>
          </section>

          @if (original()?.status === 'active') {
            <app-card>
              <app-form-field
                [label]="'inspections.fields.changeReason' | transloco"
                inputId="tb-reason"
              >
                <input
                  id="tb-reason"
                  maxlength="2000"
                  [value]="form().changeReason"
                  (input)="set('changeReason', $any($event.target).value)"
                />
              </app-form-field>
              <p class="mt-1.5 text-meta text-fg-muted">
                {{ 'inspections.builder.versionNotice' | transloco }}
              </p>
            </app-card>
          }

          @if (attempted() && problemCount() > 0) {
            <app-alert tone="error">{{
              'inspections.builder.fixProblems' | transloco: { count: problemCount() }
            }}</app-alert>
          }

          <div
            class="sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:-mx-8 sm:px-8"
          >
            <a [routerLink]="id() ? ['/inspections/templates', id()] : '/inspections/templates'">
              <app-button variant="secondary">{{
                'inspections.actions.cancel' | transloco
              }}</app-button>
            </a>
            <app-button
              type="submit"
              [variant]="canPublishOnSave() ? 'secondary' : 'primary'"
              [loading]="saving()"
              data-testid="save-template"
            >
              {{
                (original()?.status === 'active'
                  ? 'inspections.actions.save'
                  : 'inspections.builder.saveDraft'
                ) | transloco
              }}
            </app-button>
            @if (canPublishOnSave()) {
              <app-button [loading]="saving()" (click)="save(true)" data-testid="save-publish">
                {{ 'inspections.builder.savePublish' | transloco }}
              </app-button>
            }
          </div>
        </form>
      }
      <div class="mt-8"><app-why-it-matters scope="inspections" page="builder" /></div>
    </div>

    <app-slide-over
      [open]="aiOpen()"
      [title]="'inspections.builder.generateTitle' | transloco"
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="620"
      (closed)="aiOpen.set(false)"
    >
      <div class="flex flex-col gap-3">
        <p class="text-ui text-fg-muted">
          {{ 'inspections.builder.generateIntro' | transloco }}
        </p>
        <app-form-field
          [label]="'inspections.builder.generateDescription' | transloco"
          inputId="gen-description"
        >
          <textarea
            id="gen-description"
            rows="4"
            maxlength="4000"
            [value]="aiDescription()"
            (input)="aiDescription.set($any($event.target).value)"
            [placeholder]="'inspections.builder.generatePlaceholder' | transloco"
          ></textarea>
        </app-form-field>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
          <div>
            <label for="gen-clause" class="mb-1.5 block text-ui font-semibold text-fg-muted">
              {{ 'inspections.builder.generateClause' | transloco }}
            </label>
            <app-clause-picker
              inputId="gen-clause"
              [multiple]="false"
              [frameworks]="supportedFrameworks"
              placeholderKey="inspections.builder.clausePlaceholder"
              [ngModel]="aiClause() || null"
              (ngModelChange)="aiClause.set($event ?? '')"
            />
          </div>
          <app-form-field
            [label]="'inspections.builder.generateCount' | transloco"
            inputId="gen-count"
          >
            <input
              id="gen-count"
              type="number"
              min="3"
              max="40"
              [value]="aiCount()"
              (change)="aiCount.set(clampCount($any($event.target).value))"
            />
          </app-form-field>
        </div>
        <div>
          <app-ai-assist-button
            [assist]="generateAssist"
            labelKey="inspections.builder.generateRun"
            variant="primary"
            size="md"
            [input]="aiInput()"
            [disabled]="!aiInputReady()"
            (result)="onGenerated($event)"
          />
        </div>
        @if (generated(); as g) {
          <div
            class="mt-2 rounded-card border border-border bg-surface-2 p-3"
            data-testid="generated"
          >
            <h3 class="mb-1 text-card font-bold text-fg">{{ g.title }}</h3>
            @if (g.description) {
              <p class="mb-2 text-ui text-fg-muted">{{ g.description }}</p>
            }
            <app-question-preview [questions]="g.questions" />
            <div class="mt-3 flex flex-wrap gap-2">
              <app-button size="sm" (click)="applyGenerated('replace')" data-testid="use-generated">
                {{ 'inspections.builder.useGenerated' | transloco }}
              </app-button>
              @if (questions().length > 0) {
                <app-button variant="secondary" size="sm" (click)="applyGenerated('append')">
                  {{ 'inspections.builder.appendGenerated' | transloco }}
                </app-button>
              }
            </div>
            <p class="mt-2 text-meta text-fg-subtle">
              {{ 'inspections.builder.generatedNotice' | transloco }}
            </p>
          </div>
        }
      </div>
    </app-slide-over>
  `,
})
export class TemplateBuilder {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(InspectionReferences);
  private readonly language = inject(LanguageService);

  /** Route param on `:id/edit`; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly types = QUESTION_TYPES;
  protected readonly categories = TEMPLATE_CATEGORIES;
  protected readonly severities = SEVERITIES;
  protected readonly typeKey = questionTypeKey;
  protected readonly severityKey = severityKey;
  protected readonly generateAssist = ASSIST_GENERATE_CHECKLIST;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly sectionListId = 'tb-sections';
  protected readonly supportedFrameworks = SUPPORTED_FRAMEWORKS;

  protected readonly original = signal<TemplateDetail | null>(null);
  protected readonly form = signal<TemplateForm>(EMPTY_TEMPLATE_FORM);
  protected readonly questions = signal<readonly EditableQuestion[]>([]);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly serverInvalid = signal<ReadonlySet<string>>(new Set());

  protected readonly aiOpen = signal(false);
  protected readonly aiDescription = signal('');
  protected readonly aiClause = signal('');
  protected readonly aiCount = signal(12);
  protected readonly generated = signal<{
    title: string;
    description: string | null;
    category: string | null;
    passThreshold: number | null;
    questions: readonly Question[];
  } | null>(null);

  protected readonly deviationTypes = this.references.deviationTypes;

  protected readonly breadcrumbs = computed(() => {
    const t = this.original();
    return [
      { labelKey: 'modules.names.inspections', link: '/inspections' },
      { labelKey: 'inspections.templates.title', link: '/inspections/templates' },
      ...(t ? [{ label: t.title, link: `/inspections/templates/${t.id}` }] : []),
      { labelKey: this.id() ? 'inspections.builder.editTitle' : 'inspections.builder.newTitle' },
    ];
  });

  /**
   * The standards to offer: those the org has switched on, plus any the template
   * already names; all four (marked) when none is on yet.
   */
  protected readonly frameworkOptions = computed(() => {
    const all = this.references.frameworks();
    const chosen = this.form().frameworks;
    const enabled = all.filter((f) => f.enabled || chosen.includes(f.key));
    return enabled.length ? enabled : all;
  });

  protected readonly sections = computed(() => [
    ...new Set(
      this.questions()
        .map((q) => q.section?.trim())
        .filter((s): s is string => !!s),
    ),
  ]);

  protected readonly maxScore = computed(() => maxScore(this.questions()));

  protected readonly customCategory = computed(() => {
    const c = this.form().category;
    return c && !(TEMPLATE_CATEGORIES as readonly string[]).includes(c) ? c : null;
  });

  protected readonly thresholdInvalid = computed(() =>
    Number.isNaN(parseThreshold(this.form().passThreshold) as number),
  );

  protected readonly problemCount = computed(
    () =>
      (this.form().title.trim() ? 0 : 1) +
      (this.thresholdInvalid() ? 1 : 0) +
      this.questions().filter((q) => questionProblems(q).length > 0).length,
  );

  /** "Save and publish" is offered for new templates and drafts. */
  protected readonly canPublishOnSave = computed(
    () => !this.original() || this.original()?.status === 'draft',
  );

  protected readonly aiInput = computed<Record<string, unknown>>(() => ({
    description: this.aiDescription().trim() || undefined,
    clause_ref: this.aiClause().trim() || undefined,
    question_count: this.aiCount(),
  }));

  protected readonly aiInputReady = computed(
    () => !!this.aiDescription().trim() || !!this.aiClause().trim(),
  );

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: TEMPLATE_ENTITY_TYPE,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.form().title ||
        this.language.translate(
          this.id() ? 'inspections.builder.editTitle' : 'inspections.builder.newTitle',
        ),
      requirements: [...new Set(this.questions().flatMap((q) => q.clause_refs))],
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      if (orgId && id) {
        untracked(() =>
          this.api.getTemplate(orgId, id).subscribe({
            next: (t) => {
              this.original.set(t);
              this.form.set(formFromTemplate(t));
              this.questions.set(toEditable(t.questions));
            },
            error: () => this.loadFailed.set(true),
          }),
        );
      }
    });
    this.references.ensureDeviationTypes();
    this.references.ensureFrameworks();
  }

  protected set<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleFramework(fw: string, on: boolean): void {
    const current = this.form().frameworks.filter((f) => f !== fw);
    this.set('frameworks', on ? [...current, fw].slice(0, 8) : current);
  }

  protected addQuestion(type: QuestionType): void {
    const last = this.questions()[this.questions().length - 1];
    this.questions.update((qs) => [
      ...qs,
      { ...newQuestion(type, last?.section ?? null), key: nextKey() },
    ]);
  }

  protected updateQuestion(key: string, change: Partial<Question>): void {
    this.questions.update((qs) => qs.map((q) => (q.key === key ? { ...q, ...change } : q)));
    if (this.serverInvalid().has(key)) {
      const next = new Set(this.serverInvalid());
      next.delete(key);
      this.serverInvalid.set(next);
    }
  }

  protected moveQuestion(index: number, delta: -1 | 1): void {
    this.questions.update((qs) => moveItem(qs, index, index + delta));
  }

  protected removeQuestion(key: string): void {
    this.questions.update((qs) => qs.filter((q) => q.key !== key));
  }

  protected duplicateQuestion(index: number): void {
    this.questions.update((qs) => {
      const copy = { ...qs[index], id: '', key: nextKey() };
      return [...qs.slice(0, index + 1), copy, ...qs.slice(index + 1)];
    });
  }

  protected clampCount(raw: string): number {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(3, Math.min(40, n)) : 12;
  }

  protected onGenerated(data: unknown): void {
    const g = (data ?? {}) as GeneratedChecklist;
    const questions = (g.questions ?? [])
      .map((q) => normaliseQuestion({ ...q, id: '' }))
      .filter((q) => q.text.trim())
      .map((q, i) => ({ ...q, id: `g${i + 1}` }));
    this.generated.set({
      title: g.title ?? '',
      description: g.description ?? null,
      category: g.category ?? null,
      passThreshold: typeof g.pass_threshold === 'number' ? g.pass_threshold : null,
      questions,
    });
  }

  protected applyGenerated(mode: 'replace' | 'append'): void {
    const g = this.generated();
    if (!g) {
      return;
    }
    const rows = toEditable(g.questions.map((q) => ({ ...q, id: '' })));
    this.questions.update((qs) => (mode === 'replace' ? rows : [...qs, ...rows]));
    this.form.update((f) => ({
      ...f,
      title: f.title.trim() ? f.title : g.title,
      description: f.description.trim() ? f.description : (g.description ?? ''),
      category: f.category || g.category || '',
      passThreshold:
        f.passThreshold || g.passThreshold === null ? f.passThreshold : String(g.passThreshold),
    }));
    this.generated.set(null);
    this.aiOpen.set(false);
    this.notifications.info('inspections.notices.generatedApplied');
  }

  protected save(publish: boolean): void {
    this.attempted.set(true);
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    if (this.problemCount() > 0) {
      if (!this.form().title.trim()) {
        document.getElementById('tb-title')?.focus();
      }
      return;
    }
    if (publish && this.questions().length === 0) {
      this.notifications.error('inspections.errors.questions_required');
      return;
    }
    const fields = toTemplateFields(this.form(), this.questions());
    const original = this.original();
    this.saving.set(true);
    const call = original
      ? this.api.updateTemplate(orgId, original.id, fields)
      : this.api.createTemplate(orgId, { ...fields, status: publish ? 'active' : 'draft' });
    call.subscribe({
      next: (saved) => {
        if (original && publish && saved.status === 'draft') {
          this.api.publishTemplate(orgId, saved.id, fields.change_reason).subscribe({
            next: (published) => this.finish(published, true),
            error: (e: unknown) => this.fail(e),
          });
          return;
        }
        this.finish(saved, publish);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private finish(saved: TemplateDetail, published: boolean): void {
    this.saving.set(false);
    if (published) {
      this.references.ensureTemplates(true);
    }
    this.notifications.success(
      published ? 'inspections.notices.published' : 'inspections.notices.templateSaved',
    );
    void this.router.navigate(['/inspections/templates', saved.id]);
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    const indexes = problemIndexesOf(error);
    if (indexes.length) {
      const rows = this.questions();
      this.serverInvalid.set(
        new Set(indexes.map((i) => rows[i]?.key).filter((k): k is string => !!k)),
      );
    }
    this.notifications.error(inspectionErrorKey(error));
  }
}
