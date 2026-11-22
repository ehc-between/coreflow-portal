import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import {
  AcceptedSuggestion,
  FormSuggest,
  FormSuggestFieldDef,
} from '../../../shared/ask/form-suggest';
import { longDefs } from '../../../shared/ask/form-suggest-map';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  CONTEXT_SUGGEST_FIELDS,
  contextSuggestPatch,
  contextSuggestValues,
} from './context-suggest';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextFrameworks } from '../data/context-frameworks';
import {
  ADDRESSED_STATUSES,
  ANALYSIS_METHODS,
  ContextKind,
  EntityRef,
  LEVELS,
  PARTY_CATEGORIES,
  PARTY_TYPES,
  POLICY_KINDS,
  SuggestedParty,
} from '../data/context.models';
import { partyPriority, priorityBadge } from '../context-kinds';
import { FormRow } from '../ui/form-row';
import { FrameworkPicker } from '../ui/framework-picker';
import { PickedRecord, RecordSearch } from '../ui/record-search';
import { applySuggestedParty, suggestedParties } from './ai-apply';
import { AnalysisItemsEditor, itemsOutside } from './analysis-items-editor';
import { ContextDraft } from './context-draft';
import { ExclusionsEditor } from './exclusions-editor';
import { RaciEditor } from './raci-editor';
import { POLICY_SUGGEST_KEY, policyPatch, policySuggestValues } from './policy-suggest';

/**
 * The kind-specific part of the M01 form (everything except title, owner,
 * review settings and the change reason), with the module's AI buttons:
 * draft a SWOT / PESTEL, suggest interested parties, draft a policy or a scope
 * statement. AI output only fills the form; nothing is saved until "Save".
 * Fields that name records use pickers: processes, the policy document, the
 * excluded requirements of a scope.
 */
@Component({
  selector: 'app-context-kind-fields',
  imports: [
    TranslocoPipe,
    AskAbout,
    AiAssistButton,
    FormSuggest,
    EntityChip,
    Button,
    Icon,
    StatusBadge,
    FormRow,
    FrameworkPicker,
    RecordSearch,
    AnalysisItemsEditor,
    ExclusionsEditor,
    RaciEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    @switch (kind()) {
      @case ('analysis') {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-context-form-row
            labelKey="context.fields.method"
            inputId="f-method"
            [page]="page()"
            help="method"
            [required]="true"
          >
            <select
              id="f-method"
              [disabled]="editing()"
              (change)="setMethod($any($event.target).value)"
            >
              @for (m of methods; track m) {
                <option [value]="m" [selected]="m === draft().method">
                  {{ 'context.methods.' + m | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
        </div>
        <app-context-framework-picker
          labelKey="context.fields.appliesTo"
          hintKey="context.form.analysisFrameworksHint"
          allKey="context.fields.allFrameworks"
          [value]="draft().frameworks"
          (valueChange)="patch({ frameworks: $event })"
        />
        <app-context-form-row
          labelKey="context.fields.summary"
          inputId="f-summary"
          [page]="page()"
          help="summary"
        >
          <textarea
            id="f-summary"
            rows="4"
            maxlength="20000"
            [value]="draft().summary"
            (input)="patch({ summary: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="flex flex-wrap items-center gap-2">
          <app-form-suggest
            variant="field"
            suggestKey="context.analysis"
            [fields]="rewriteFields().analysis"
            [values]="recordValues()"
            [only]="['summary']"
            (applied)="draftChange.emit(applyRecord($event))"
          />
        </div>
        <app-context-analysis-items-editor
          [method]="draft().method"
          [items]="draft().items"
          (itemsChange)="patch({ items: $event })"
        />
      }

      @case ('party') {
        <div class="flex flex-wrap items-center gap-2">
          <app-ai-assist-button
            assist="context.suggest_parties"
            labelKey="context.ai.suggestParties"
            [input]="{
              framework: draft().frameworks[0] ?? null,
              notes: draft().description || null,
            }"
            (result)="suggestions.set(parseSuggestions($event))"
          />
          <span class="text-meta text-fg-muted">{{ 'context.ai.suggestHint' | transloco }}</span>
        </div>
        @if (suggestions().length) {
          <section
            class="rounded-card border border-accent-border bg-accent-soft/40 p-3"
            [attr.aria-label]="'context.ai.suggestionsTitle' | transloco"
          >
            <h3 class="mb-2 text-ui font-semibold text-fg">
              {{ 'context.ai.suggestionsTitle' | transloco }}
            </h3>
            <ul class="flex flex-col gap-1.5">
              @for (s of suggestions(); track s.name) {
                <li
                  class="flex flex-wrap items-center justify-between gap-2 rounded-tile bg-surface px-2.5 py-1.5"
                >
                  <span class="min-w-0 text-ui text-fg">
                    <span class="font-semibold">{{ s.name }}</span>
                    @if (s.needs) {
                      <span class="block truncate text-meta text-fg-muted">{{ s.needs }}</span>
                    }
                  </span>
                  <app-button size="sm" variant="secondary" (click)="useSuggestion(s)">
                    {{ 'context.ai.useSuggestion' | transloco }}
                  </app-button>
                </li>
              }
            </ul>
          </section>
        }
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-context-form-row
            labelKey="context.fields.category"
            inputId="f-category"
            [page]="page()"
            help="category"
          >
            <select id="f-category" (change)="patch({ category: $any($event.target).value })">
              @for (c of partyCategories; track c) {
                <option [value]="c" [selected]="c === draft().category">
                  {{ 'context.partyCategories.' + c | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
          <app-context-form-row
            labelKey="context.fields.partyType"
            inputId="f-ptype"
            [page]="page()"
            help="party_type"
          >
            <select id="f-ptype" (change)="patch({ party_type: $any($event.target).value })">
              @for (t of partyTypes; track t) {
                <option [value]="t" [selected]="t === draft().party_type">
                  {{ 'context.partyTypes.' + t | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
        </div>
        <app-context-form-row
          labelKey="context.fields.description"
          inputId="f-desc"
          [page]="page()"
          help="description"
        >
          <textarea
            id="f-desc"
            rows="2"
            maxlength="20000"
            [value]="draft().description"
            (input)="patch({ description: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <app-context-form-row
            labelKey="context.fields.needs"
            inputId="f-needs"
            [page]="page()"
            help="needs"
          >
            <textarea
              id="f-needs"
              rows="3"
              maxlength="20000"
              [value]="draft().needs"
              (input)="patch({ needs: $any($event.target).value })"
            ></textarea>
          </app-context-form-row>
          <app-context-form-row
            labelKey="context.fields.expectations"
            inputId="f-exp"
            [page]="page()"
            help="expectations"
          >
            <textarea
              id="f-exp"
              rows="3"
              maxlength="20000"
              [value]="draft().expectations"
              (input)="patch({ expectations: $any($event.target).value })"
            ></textarea>
          </app-context-form-row>
        </div>
        <app-context-form-row
          labelKey="context.fields.requirements"
          inputId="f-req"
          [page]="page()"
          help="requirements"
          hintKey="context.form.hints.requirements"
        >
          <textarea
            id="f-req"
            rows="2"
            maxlength="20000"
            [value]="draft().requirements"
            (input)="patch({ requirements: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="flex flex-col gap-1">
          <label class="flex min-h-6 items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4"
              aria-describedby="f-oblig-hint"
              [checked]="draft().is_compliance_obligation"
              (change)="patch({ is_compliance_obligation: $any($event.target).checked })"
            />
            {{ 'context.fields.isComplianceObligation' | transloco }}
            <app-ask-about
              [prompt]="'context.ai.prompts.obligation' | transloco"
              field="is_compliance_obligation"
              [fieldLabel]="'context.fields.isComplianceObligation' | transloco"
              [requirements]="['iso14001:6.1.3', 'iso45001:6.1.3']"
            />
          </label>
          <p id="f-oblig-hint" class="pl-6 text-meta text-fg-muted">
            {{ 'context.form.hints.obligation' | transloco }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <app-context-form-row
            labelKey="context.fields.influence"
            inputId="f-infl"
            [page]="page()"
            help="influence"
          >
            <select id="f-infl" (change)="patch({ influence: $any($event.target).value })">
              @for (l of levels; track l) {
                <option [value]="l" [selected]="l === draft().influence">
                  {{ 'context.levels.' + l | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
          <app-context-form-row
            labelKey="context.fields.interest"
            inputId="f-int"
            [page]="page()"
            help="interest"
          >
            <select id="f-int" (change)="patch({ interest: $any($event.target).value })">
              @for (l of levels; track l) {
                <option [value]="l" [selected]="l === draft().interest">
                  {{ 'context.levels.' + l | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
          <div>
            <p class="mb-1.5 text-ui font-semibold text-fg-muted">
              {{ 'context.fields.priority' | transloco }}
            </p>
            @let pr = priorityView();
            <app-status-badge [meaning]="pr.meaning" [value]="pr.value" [labelKey]="pr.labelKey" />
            <p class="mt-1 text-meta text-fg-muted">
              {{ 'context.priorityHints.' + priority() | transloco }}
            </p>
          </div>
        </div>
        <app-context-form-row
          labelKey="context.fields.addressedStatus"
          inputId="f-addr"
          [page]="page()"
          help="addressed_status"
        >
          <select id="f-addr" (change)="patch({ addressed_status: $any($event.target).value })">
            @for (a of addressed; track a) {
              <option [value]="a" [selected]="a === draft().addressed_status">
                {{ 'context.addressed.' + a | transloco }}
              </option>
            }
          </select>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.howAddressed"
          inputId="f-how"
          [page]="page()"
          help="how_addressed"
        >
          <textarea
            id="f-how"
            rows="3"
            maxlength="20000"
            [value]="draft().how_addressed"
            (input)="patch({ how_addressed: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.monitoring"
          inputId="f-monitor"
          [page]="page()"
          help="monitoring"
          hintKey="context.form.hints.monitoring"
        >
          <textarea
            id="f-monitor"
            rows="2"
            maxlength="20000"
            [value]="draft().monitoring"
            (input)="patch({ monitoring: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-framework-picker
          [value]="draft().frameworks"
          (valueChange)="patch({ frameworks: $event })"
        />
      }

      @case ('scope') {
        <app-context-form-row
          labelKey="context.fields.framework"
          inputId="f-sfw"
          [page]="page()"
          help="framework"
          [required]="true"
        >
          <select
            id="f-sfw"
            [disabled]="editing()"
            aria-required="true"
            (change)="patch({ framework: $any($event.target).value })"
          >
            <option value="" [selected]="!draft().framework" disabled>
              {{ 'context.fields.chooseFramework' | transloco }}
            </option>
            @for (fw of frameworkOrder(); track fw) {
              <option [value]="fw" [selected]="fw === draft().framework">
                {{ 'context.frameworks.' + fw | transloco }}
              </option>
            }
          </select>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.statement"
          inputId="f-stmt"
          [page]="page()"
          help="statement"
        >
          <textarea
            id="f-stmt"
            rows="6"
            maxlength="20000"
            [value]="draft().statement"
            (input)="patch({ statement: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="flex flex-wrap items-center gap-2">
          <app-form-suggest
            variant="field"
            suggestKey="context.scope"
            [fields]="rewriteFields().scope"
            [values]="recordValues()"
            [only]="['statement']"
            (applied)="draftChange.emit(applyRecord($event))"
          />
        </div>
        <app-context-form-row
          labelKey="context.fields.boundaries"
          inputId="f-bound"
          [page]="page()"
          help="boundaries"
        >
          <textarea
            id="f-bound"
            rows="3"
            maxlength="20000"
            [value]="draft().boundaries"
            (input)="patch({ boundaries: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.productsServices"
          inputId="f-prod"
          [page]="page()"
          help="products_services"
        >
          <textarea
            id="f-prod"
            rows="3"
            maxlength="20000"
            [value]="draft().products_services"
            (input)="patch({ products_services: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.processes"
          inputId="f-processes"
          [page]="page()"
          help="processes"
          hintKey="context.form.hints.processes"
        >
          @if (draft().processes.length) {
            <ul class="mb-2 flex flex-col gap-1.5">
              @for (p of draft().processes; track p.id) {
                <li class="flex items-center gap-2">
                  <app-entity-chip [ref]="processRef(p)" [showType]="false" class="min-w-0" />
                  <button
                    type="button"
                    class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [attr.aria-label]="'context.form.removeProcess' | transloco: { name: p.title }"
                    (click)="removeProcess(p.id)"
                  >
                    <app-icon name="x" [size]="13" />
                  </button>
                </li>
              }
            </ul>
          }
          <app-context-record-search
            inputId="f-processes"
            [types]="['process']"
            placeholderKey="context.form.processPlaceholder"
            noMatchesKey="context.form.noProcessMatches"
            [excluded]="processIds()"
            (picked)="addProcess($event)"
          />
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.sites"
          inputId="f-sites"
          [page]="page()"
          help="sites"
        >
          <textarea
            id="f-sites"
            rows="3"
            [value]="draft().sites"
            [placeholder]="'context.scope.sitesPlaceholder' | transloco"
            (input)="patch({ sites: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="flex items-start gap-1">
          <div class="min-w-0 flex-1">
            <app-context-exclusions-editor
              [exclusions]="draft().exclusions"
              [framework]="draft().framework"
              (exclusionsChange)="patch({ exclusions: $event })"
            />
          </div>
          <app-ask-about
            [prompt]="'context.ai.prompts.scopeExclusions' | transloco"
            field="exclusions"
            [fieldLabel]="'context.fields.exclusions' | transloco"
          />
        </div>
      }

      @case ('policy') {
        <app-context-form-row
          labelKey="context.fields.kind"
          inputId="f-pkind"
          [page]="page()"
          help="kind"
          [required]="true"
        >
          <select id="f-pkind" (change)="patch({ kind: $any($event.target).value })">
            @for (k of policyKinds; track k) {
              <option [value]="k" [selected]="k === draft().kind">
                {{ 'context.policyKinds.' + k | transloco }}
              </option>
            }
          </select>
        </app-context-form-row>
        <app-context-form-row
          labelKey="context.fields.statement"
          inputId="f-pstmt"
          [page]="page()"
          help="statement"
          hintKey="context.form.hints.policyStatement"
        >
          <textarea
            id="f-pstmt"
            rows="10"
            maxlength="20000"
            [value]="draft().statement"
            (input)="patch({ statement: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <div class="flex flex-wrap items-center gap-2">
          <app-form-suggest
            variant="field"
            [suggestKey]="policySuggestKey"
            [fields]="statementField"
            [values]="policyValues()"
            [only]="['statement']"
            (applied)="patch(policyPatch($event))"
          />
          <app-ask-about
            [prompt]="'context.ai.prompts.policyContent' | transloco"
            field="statement"
            [fieldLabel]="'context.fields.statement' | transloco"
            [requirements]="['hs:5.2']"
          />
        </div>
        <app-context-framework-picker
          [value]="draft().frameworks"
          (valueChange)="patch({ frameworks: $event })"
        />
        <app-context-form-row
          labelKey="context.policy.document"
          inputId="f-pdoc"
          [page]="page()"
          help="document"
          hintKey="context.policy.documentHint"
        >
          @if (existingDocuments().length) {
            <ul class="mb-2 flex flex-col gap-1.5">
              @for (doc of existingDocuments(); track doc.entity_id) {
                <li><app-entity-chip [ref]="doc" [statusText]="true" /></li>
              }
            </ul>
          }
          @if (draft().document; as doc) {
            <div
              class="flex items-center justify-between gap-2 rounded-tile border border-border bg-surface px-3 py-2"
            >
              <span class="min-w-0 truncate text-ui text-fg">
                <app-icon name="documents" [size]="14" class="mr-1 align-middle text-fg-subtle" />
                @if (doc.code) {
                  <span class="font-mono text-meta text-fg-muted">{{ doc.code }}</span>
                }
                {{ doc.title }}
              </span>
              <button
                type="button"
                class="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'context.policy.clearDocument' | transloco"
                (click)="patch({ document: null })"
              >
                <app-icon name="x" [size]="14" />
              </button>
            </div>
          } @else {
            <app-context-record-search
              inputId="f-pdoc"
              [types]="['document']"
              placeholderKey="context.policy.documentPlaceholder"
              noMatchesKey="context.policy.noDocumentMatches"
              [excluded]="existingDocumentIds()"
              (picked)="patch({ document: $event })"
            />
          }
        </app-context-form-row>
        <div class="flex flex-col gap-1">
          <label class="flex min-h-6 items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              class="h-4 w-4"
              aria-describedby="f-avail-hint"
              [checked]="draft().available_to_interested_parties"
              (change)="patch({ available_to_interested_parties: $any($event.target).checked })"
            />
            {{ 'context.fields.availableToParties' | transloco }}
          </label>
          <p id="f-avail-hint" class="pl-6 text-meta text-fg-muted">
            {{ 'context.form.hints.available' | transloco }}
          </p>
        </div>
      }

      @case ('responsibility') {
        <app-context-form-row
          labelKey="context.fields.process"
          inputId="f-rproc"
          [page]="page()"
          help="area"
          hintKey="context.form.hints.process"
        >
          @if (draft().process; as p) {
            <div class="flex items-center gap-2">
              <app-entity-chip [ref]="processRef(p)" [showType]="false" class="min-w-0" />
              <button
                type="button"
                class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="'context.form.removeProcess' | transloco: { name: p.title }"
                (click)="patch({ process: null })"
              >
                <app-icon name="x" [size]="13" />
              </button>
            </div>
          } @else {
            <app-context-record-search
              inputId="f-rproc"
              [types]="['process']"
              placeholderKey="context.form.processPlaceholder"
              noMatchesKey="context.form.noProcessMatches"
              (picked)="patch({ process: $event, area: '' })"
            />
          }
        </app-context-form-row>
        @if (!draft().process) {
          <app-context-form-row
            labelKey="context.fields.area"
            inputId="f-area"
            [page]="page()"
            hintKey="context.form.hints.area"
          >
            <input
              id="f-area"
              type="text"
              maxlength="255"
              [value]="draft().area"
              [placeholder]="'context.raci.areaPlaceholder' | transloco"
              (input)="patch({ area: $any($event.target).value })"
            />
          </app-context-form-row>
        }
        <app-context-form-row
          labelKey="context.fields.description"
          inputId="f-rdesc"
          [page]="page()"
          help="description"
        >
          <textarea
            id="f-rdesc"
            rows="3"
            maxlength="20000"
            [value]="draft().description"
            (input)="patch({ description: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-raci-editor
          [assignments]="draft().assignments"
          [showWarnings]="submitted()"
          (assignmentsChange)="patch({ assignments: $event })"
        />
        <app-context-form-row
          labelKey="context.fields.authorities"
          inputId="f-auth"
          [page]="page()"
          help="authorities"
        >
          <textarea
            id="f-auth"
            rows="3"
            maxlength="20000"
            [value]="draft().authorities"
            (input)="patch({ authorities: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <app-context-framework-picker
          [value]="draft().frameworks"
          (valueChange)="patch({ frameworks: $event })"
        />
      }
    }
  `,
})
export class KindFields {
  private readonly frameworks = inject(ContextFrameworks);

  readonly kind = input.required<ContextKind>();
  readonly draft = input.required<ContextDraft>();
  /** Editing an existing record (create-only fields are locked). */
  readonly editing = input(false);
  /** Guidance page key for field help. */
  readonly page = input('');
  /** The user tried to save (show warnings that wait for input otherwise). */
  readonly submitted = input(false);
  /** Documents the policy already carries (edit). */
  readonly existingDocuments = input<readonly EntityRef[]>([]);
  readonly draftChange = output<ContextDraft>();

  protected readonly methods = ANALYSIS_METHODS;
  protected readonly levels = LEVELS;
  protected readonly partyCategories = PARTY_CATEGORIES;
  protected readonly partyTypes = PARTY_TYPES;
  protected readonly addressed = ADDRESSED_STATUSES;
  protected readonly policyKinds = POLICY_KINDS;
  protected readonly frameworkOrder = this.frameworks.ordered;
  /** "Skriv om" on the policy statement (the whole form is suggested at the top). */
  protected readonly policySuggestKey = POLICY_SUGGEST_KEY;
  protected readonly statementField: readonly FormSuggestFieldDef[] = [
    { name: 'statement', labelKey: 'context.fields.statement', long: true },
  ];
  protected readonly policyValues = computed(() => policySuggestValues(this.draft()));
  protected readonly policyPatch = policyPatch;
  /** "Skriv om" on the long texts of the other kinds (whole form: at the top). */
  private readonly language = inject(LanguageService);
  protected readonly rewriteFields = computed(() => {
    const t = (key: string, params?: Record<string, unknown>): string =>
      this.language.translate(key, params);
    return {
      analysis: longDefs(CONTEXT_SUGGEST_FIELDS.analysis, t, ['summary']),
      scope: longDefs(CONTEXT_SUGGEST_FIELDS.scope, t, ['statement']),
    };
  });
  protected readonly recordValues = computed(() => {
    const kind = this.kind();
    return kind === 'policy' ? {} : contextSuggestValues(kind, this.draft());
  });
  protected applyRecord(accepted: AcceptedSuggestion): ContextDraft {
    const kind = this.kind();
    const draft = this.draft();
    return kind === 'policy' ? draft : { ...draft, ...contextSuggestPatch(kind, accepted, draft) };
  }

  protected readonly suggestions = signal<readonly SuggestedParty[]>([]);
  protected readonly priority = computed(() =>
    partyPriority(this.draft().influence, this.draft().interest),
  );
  protected readonly priorityView = computed(() => priorityBadge(this.priority()));
  protected readonly processIds = computed(() => this.draft().processes.map((p) => p.id));
  protected readonly existingDocumentIds = computed(() =>
    this.existingDocuments().map((doc) => doc.entity_id),
  );
  constructor() {
    this.frameworks.ensureLoaded();
  }

  protected patch(change: Partial<ContextDraft>): void {
    this.draftChange.emit({ ...this.draft(), ...change });
  }

  protected processRef(p: PickedRecord) {
    return {
      entity_type: 'process',
      entity_id: p.id,
      title: p.title,
      code: p.code,
      label_key: null,
      url: null,
      status: null,
      module: 'processes',
    };
  }

  protected addProcess(p: PickedRecord): void {
    if (!this.draft().processes.some((x) => x.id === p.id)) {
      this.patch({ processes: [...this.draft().processes, p] });
    }
  }

  protected removeProcess(id: string): void {
    this.patch({ processes: this.draft().processes.filter((p) => p.id !== id) });
  }

  protected setMethod(method: ContextDraft['method']): void {
    const draft = { ...this.draft(), method };
    const outside = new Set(itemsOutside(method, draft.items).map((i) => i.id));
    this.draftChange.emit({ ...draft, items: draft.items.filter((i) => !outside.has(i.id)) });
  }

  protected parseSuggestions(result: unknown): SuggestedParty[] {
    return suggestedParties(result);
  }

  protected useSuggestion(party: SuggestedParty): void {
    this.draftChange.emit(applySuggestedParty(this.draft(), party));
    this.suggestions.update((list) => list.filter((p) => p.name !== party.name));
  }
}
