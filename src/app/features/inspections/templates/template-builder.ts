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
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FRAMEWORK_KEYS } from '../../../core/standards/frameworks-data';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TourButton } from '../../../shared/guidance/tour-button';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
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
import { questionTypeKey } from '../data/inspection-display';
import { inspectionErrorKey, problemIndexesOf } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_GENERATE_CHECKLIST,
  GeneratedChecklist,
  INSPECTIONS_MODULE,
  QUESTION_TYPES,
  Question,
  QuestionType,
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
    deviation_type_id: form.autoDeviation ? form.deviationTypeId || null : null,
    change_reason: form.changeReason.trim() || null,
  };
}

/**
 * The checklist template builder (`/inspections/templates/new`, `/:id/edit`): title,
 * description, category, frameworks, the pass mark and automatic deviations, and the
 * question list (add by type, edit, reorder, duplicate, remove). The assistant can
 * draft a checklist from a description, a standard clause or a question count; the
 * draft is previewed and nothing is saved until the designer saves. Needs
 * `inspections:templates`. Editing an active template's questions or pass mark raises
 * its version (inspections already planned keep their own copy).
 */
@Component({
  selector: 'app-template-builder',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    GuideIntro,
    TourButton,
    TourStepDirective,
    WhyItMatters,
    Alert,
    Button,
    Card,
    FormField,
    Icon,
    SlideOver,
    QuestionPreview,
    QuestionEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[980px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7">
      <a
        [routerLink]="id() ? ['/inspections/templates', id()] : '/inspections/templates'"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'inspections.builder.back' | transloco }}
      </a>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{
              (id() ? 'inspections.builder.editTitle' : 'inspections.builder.newTitle') | transloco
            }}
          </h1>
          @if (original(); as t) {
            <p class="mt-1 text-[13px] text-fg-muted">
              {{ t.code }} ·
              {{ 'inspections.templates.version' | transloco: { version: t.version } }}
            </p>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          <app-tour-button scope="inspections" tour="builder" />
          <app-button
            variant="secondary"
            (click)="aiOpen.set(true)"
            appTourStep="inspections-builder-ai"
            data-testid="open-generate"
          >
            <app-icon name="spark" [size]="15" />
            {{ 'inspections.builder.generate' | transloco }}
          </app-button>
        </div>
      </div>

      <app-guide-intro class="mb-4 block" scope="inspections" page="builder" />

      @if (original()?.status === 'archived') {
        <app-alert tone="error">{{ 'inspections.errors.template_archived' | transloco }}</app-alert>
      } @else if (id() && !original()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save(false)">
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="sm:col-span-2">
                <app-form-field [label]="'inspections.fields.title' | transloco" inputId="tb-title">
                  <input
                    id="tb-title"
                    required
                    maxlength="255"
                    [value]="form().title"
                    (input)="set('title', $any($event.target).value)"
                    [attr.aria-invalid]="attempted() && !form().title.trim()"
                    data-testid="template-title-input"
                  />
                </app-form-field>
                <app-field-help scope="inspections" page="builder" field="title" />
              </div>
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'inspections.fields.description' | transloco"
                  inputId="tb-description"
                >
                  <textarea
                    id="tb-description"
                    rows="3"
                    maxlength="20000"
                    [value]="form().description"
                    (input)="set('description', $any($event.target).value)"
                  ></textarea>
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'inspections.fields.category' | transloco"
                  inputId="tb-category"
                >
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
                </app-form-field>
              </div>
              <div>
                <app-form-field
                  [label]="'inspections.fields.passThreshold' | transloco"
                  inputId="tb-threshold"
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
                </app-form-field>
                <app-field-help scope="inspections" page="builder" field="passThreshold" />
              </div>
              <fieldset class="sm:col-span-2">
                <legend class="mb-1.5 text-[13px] font-semibold text-fg-muted">
                  {{ 'inspections.fields.frameworks' | transloco }}
                </legend>
                <div class="flex flex-wrap gap-x-4 gap-y-2">
                  @for (fw of frameworks; track fw) {
                    <label class="inline-flex items-center gap-2 text-[13px] text-fg">
                      <input
                        type="checkbox"
                        class="h-4 w-4 accent-[var(--accent)]"
                        [checked]="form().frameworks.includes(fw)"
                        (change)="toggleFramework(fw, $any($event.target).checked)"
                      />
                      {{ 'inspections.frameworks.' + fw | transloco }}
                    </label>
                  }
                </div>
              </fieldset>
              <div class="sm:col-span-2">
                <label class="inline-flex items-center gap-2 text-[13.5px] text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="form().autoDeviation"
                    (change)="set('autoDeviation', $any($event.target).checked)"
                    data-testid="auto-deviation"
                  />
                  {{ 'inspections.fields.autoDeviation' | transloco }}
                </label>
                <app-field-help scope="inspections" page="builder" field="autoDeviation" />
              </div>
              @if (form().autoDeviation && deviationTypes().length > 0) {
                <div>
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
                </div>
              }
            </div>
          </app-card>

          <section [attr.aria-label]="'inspections.builder.questionsHeading' | transloco">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-[16px] font-bold text-fg">
                {{ 'inspections.builder.questionsHeading' | transloco }}
                <span class="text-[13px] font-normal text-fg-muted">
                  ·
                  {{ 'inspections.templates.questions' | transloco: { count: questions().length } }}
                  · {{ 'inspections.builder.maxScore' | transloco: { value: maxScore() } }}
                </span>
              </h2>
              <app-field-help scope="inspections" page="builder" field="questionType" />
            </div>
            <datalist [id]="sectionListId">
              @for (s of sections(); track s) {
                <option [value]="s"></option>
              }
            </datalist>
            <div class="flex flex-col gap-3" data-testid="question-list">
              @for (q of questions(); track q.key; let i = $index) {
                <app-question-editor
                  [question]="q"
                  [index]="i"
                  [total]="questions().length"
                  [showProblems]="attempted()"
                  [serverInvalid]="serverInvalid().has(q.key)"
                  [sectionListId]="sectionListId"
                  (changed)="updateQuestion(q.key, $event)"
                  (move)="moveQuestion(i, $event)"
                  (remove)="removeQuestion(q.key)"
                  (duplicate)="duplicateQuestion(i)"
                />
              } @empty {
                <app-card>
                  <p class="text-center text-[13.5px] text-fg-muted">
                    {{ 'inspections.builder.empty' | transloco }}
                  </p>
                </app-card>
              }
            </div>
            <div
              class="mt-3 flex flex-wrap items-center gap-2"
              appTourStep="inspections-builder-add"
            >
              <span class="text-[13px] font-semibold text-fg-muted">
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
              <p class="mt-1.5 text-[12.5px] text-fg-muted">
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
            class="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8"
          >
            <a [routerLink]="id() ? ['/inspections/templates', id()] : '/inspections/templates'">
              <app-button variant="ghost">{{
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
      <app-why-it-matters class="mt-6 block" scope="inspections" page="builder" />
    </div>

    <app-slide-over
      [open]="aiOpen()"
      [title]="'inspections.builder.generateTitle' | transloco"
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="620"
      (closed)="aiOpen.set(false)"
    >
      <div class="flex flex-col gap-3">
        <p class="text-[13px] text-fg-muted">
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
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <app-form-field
            [label]="'inspections.builder.generateClause' | transloco"
            inputId="gen-clause"
          >
            <input
              id="gen-clause"
              maxlength="64"
              placeholder="iso45001:9.1.1"
              [value]="aiClause()"
              (input)="aiClause.set($any($event.target).value)"
            />
          </app-form-field>
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
            <h3 class="mb-1 text-[14px] font-bold text-fg">{{ g.title }}</h3>
            @if (g.description) {
              <p class="mb-2 text-[13px] text-fg-muted">{{ g.description }}</p>
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
            <p class="mt-2 text-[12px] text-fg-subtle">
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

  /** Route param on `:id/edit`; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly types = QUESTION_TYPES;
  protected readonly categories = TEMPLATE_CATEGORIES;
  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly typeKey = questionTypeKey;
  protected readonly generateAssist = ASSIST_GENERATE_CHECKLIST;
  protected readonly sectionListId = 'tb-sections';

  protected readonly original = signal<TemplateDetail | null>(null);
  protected readonly form = signal<TemplateForm>(EMPTY_TEMPLATE_FORM);
  protected readonly questions = signal<readonly EditableQuestion[]>([]);
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
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
      title: this.form().title || null,
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
            error: (e: unknown) => this.notifications.error(inspectionErrorKey(e)),
          }),
        );
      }
    });
    this.references.ensureDeviationTypes();
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
    if (!orgId || this.saving() || this.problemCount() > 0) {
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
