import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import {
  ADDRESSED_STATUSES,
  ANALYSIS_METHODS,
  ContextKind,
  FRAMEWORK_KEYS,
  LEVELS,
  PARTY_CATEGORIES,
  PARTY_TYPES,
  POLICY_KINDS,
  SuggestedParty,
} from '../data/context.models';
import { partyPriority, priorityTone } from '../context-kinds';
import { FormRow } from '../ui/form-row';
import { FrameworkPicker } from '../ui/framework-picker';
import { applyAnalysisDraft, applySuggestedParty, suggestedParties } from './ai-apply';
import { AnalysisItemsEditor, itemsOutside } from './analysis-items-editor';
import { ContextDraft } from './context-draft';
import { DocumentPicker } from './document-picker';
import { ExclusionsEditor } from './exclusions-editor';
import { RaciEditor } from './raci-editor';

/**
 * The kind-specific part of the M01 form (everything except title, owner,
 * review settings and the change reason), with the module's AI buttons:
 * draft a SWOT / PESTLE, suggest interested parties, draft a policy or a scope
 * statement. AI output only fills the form; nothing is saved until "Save".
 */
@Component({
  selector: 'app-context-kind-fields',
  imports: [
    TranslocoPipe,
    AskAbout,
    AiAssistButton,
    Badge,
    Button,
    FormRow,
    FrameworkPicker,
    AnalysisItemsEditor,
    DocumentPicker,
    ExclusionsEditor,
    RaciEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @switch (kind()) {
      @case ('analysis') {
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-context-form-row
            labelKey="context.fields.method"
            inputId="f-method"
            [page]="page()"
            help="method"
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
          <app-context-form-row
            labelKey="context.fields.framework"
            inputId="f-framework"
            [page]="page()"
            help="framework"
          >
            <select id="f-framework" (change)="patch({ framework: $any($event.target).value })">
              <option value="" [selected]="!draft().framework">
                {{ 'context.fields.allFrameworks' | transloco }}
              </option>
              @for (fw of frameworks; track fw) {
                <option [value]="fw" [selected]="fw === draft().framework">
                  {{ 'context.frameworks.' + fw | transloco }}
                </option>
              }
            </select>
          </app-context-form-row>
        </div>
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
          <app-ai-assist-button
            assist="context.draft_analysis"
            labelKey="context.ai.draftAnalysis"
            [input]="{
              method: draft().method,
              framework: draft().framework || null,
              notes: draft().summary || null,
            }"
            (result)="draftChange.emit(applyAnalysis($event))"
          />
          <span class="text-[12px] text-fg-subtle">{{ 'context.ai.draftHint' | transloco }}</span>
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
          <span class="text-[12px] text-fg-subtle">{{ 'context.ai.suggestHint' | transloco }}</span>
        </div>
        @if (suggestions().length) {
          <section
            class="rounded-card border border-accent-border bg-accent-soft/40 p-3"
            [attr.aria-label]="'context.ai.suggestionsTitle' | transloco"
          >
            <h3 class="mb-2 text-[13px] font-semibold text-fg">
              {{ 'context.ai.suggestionsTitle' | transloco }}
            </h3>
            <ul class="flex flex-col gap-1.5">
              @for (s of suggestions(); track s.name) {
                <li
                  class="flex flex-wrap items-center justify-between gap-2 rounded-tile bg-surface px-2.5 py-1.5"
                >
                  <span class="min-w-0 text-[13px] text-fg">
                    <span class="font-semibold">{{ s.name }}</span>
                    @if (s.needs) {
                      <span class="block truncate text-[12px] text-fg-muted">{{ s.needs }}</span>
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
        >
          <textarea
            id="f-req"
            rows="2"
            maxlength="20000"
            [value]="draft().requirements"
            (input)="patch({ requirements: $any($event.target).value })"
          ></textarea>
        </app-context-form-row>
        <label class="flex items-center gap-2 text-[13px] text-fg">
          <input
            type="checkbox"
            class="h-4 w-4"
            [checked]="draft().is_compliance_obligation"
            (change)="patch({ is_compliance_obligation: $any($event.target).checked })"
          />
          {{ 'context.fields.isComplianceObligation' | transloco }}
        </label>
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
            <p class="mb-1.5 text-[13px] font-semibold text-fg-muted">
              {{ 'context.fields.priority' | transloco }}
            </p>
            <app-badge [tone]="priorityTone(priority())">{{
              'context.priorities.' + priority() | transloco
            }}</app-badge>
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'context.priorityHints.' + priority() | transloco }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
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
        >
          <select
            id="f-sfw"
            [disabled]="editing()"
            (change)="patch({ framework: $any($event.target).value })"
          >
            <option value="" [selected]="!draft().framework" disabled>
              {{ 'context.fields.chooseFramework' | transloco }}
            </option>
            @for (fw of frameworks; track fw) {
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
          <app-ai-assist-button
            assist="context.draft_scope"
            labelKey="context.ai.draftScope"
            [disabled]="!draft().framework"
            [input]="{ framework: draft().framework, notes: notesForScope() }"
            (text)="patch({ statement: $event })"
          />
          <app-ask-about
            [prompt]="'context.ai.prompts.scopeExclusions' | transloco"
            field="exclusions"
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
        <app-context-exclusions-editor
          [exclusions]="draft().exclusions"
          (exclusionsChange)="patch({ exclusions: $event })"
        />
      }

      @case ('policy') {
        <app-context-form-row
          labelKey="context.fields.kind"
          inputId="f-pkind"
          [page]="page()"
          help="kind"
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
          <app-ai-assist-button
            assist="context.draft_policy"
            labelKey="context.ai.draftPolicy"
            [input]="{ kind: draft().kind, notes: draft().title || null }"
            (text)="patch({ statement: $event })"
          />
          <span class="text-[12px] text-fg-subtle">{{ 'context.ai.draftHint' | transloco }}</span>
        </div>
        <app-context-framework-picker
          [value]="draft().frameworks"
          (valueChange)="patch({ frameworks: $event })"
        />
        @if (!editing()) {
          <div>
            <app-context-document-picker
              [value]="draft().document"
              (valueChange)="patch({ document: $event })"
            />
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'context.policy.documentHint' | transloco }}
            </p>
          </div>
        }
      }

      @case ('responsibility') {
        <app-context-form-row
          labelKey="context.fields.area"
          inputId="f-area"
          [page]="page()"
          help="area"
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
  readonly kind = input.required<ContextKind>();
  readonly draft = input.required<ContextDraft>();
  /** Editing an existing record (create-only fields are locked). */
  readonly editing = input(false);
  /** Guidance page key for field help. */
  readonly page = input('');
  readonly draftChange = output<ContextDraft>();

  protected readonly methods = ANALYSIS_METHODS;
  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly levels = LEVELS;
  protected readonly partyCategories = PARTY_CATEGORIES;
  protected readonly partyTypes = PARTY_TYPES;
  protected readonly addressed = ADDRESSED_STATUSES;
  protected readonly policyKinds = POLICY_KINDS;
  protected readonly priorityTone = priorityTone;

  protected readonly suggestions = signal<readonly SuggestedParty[]>([]);
  protected readonly priority = computed(() =>
    partyPriority(this.draft().influence, this.draft().interest),
  );
  protected readonly notesForScope = computed(() => {
    const d = this.draft();
    return [d.title, d.products_services, d.sites].filter((s) => s.trim()).join('\n') || null;
  });

  protected patch(change: Partial<ContextDraft>): void {
    this.draftChange.emit({ ...this.draft(), ...change });
  }

  protected setMethod(method: ContextDraft['method']): void {
    const draft = { ...this.draft(), method };
    const outside = new Set(itemsOutside(method, draft.items).map((i) => i.id));
    this.draftChange.emit({ ...draft, items: draft.items.filter((i) => !outside.has(i.id)) });
  }

  protected applyAnalysis(result: unknown): ContextDraft {
    return applyAnalysisDraft(this.draft(), result);
  }

  protected parseSuggestions(result: unknown): SuggestedParty[] {
    return suggestedParties(result);
  }

  protected useSuggestion(party: SuggestedParty): void {
    this.draftChange.emit(applySuggestedParty(this.draft(), party));
    this.suggestions.update((list) => list.filter((p) => p.name !== party.name));
  }
}
