import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Term } from '../../../shared/guidance/term';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  ContextAnalysis,
  ContextKind,
  ContextRecord,
  InterestedParty,
  Policy,
  Responsibility,
  ScopeExclusion,
  ScopeStatement,
} from '../data/context.models';
import { addressedBadge, priorityBadge, withoutTitleHeading } from '../context-kinds';
import { AnalysisBoard } from '../ui/analysis-board';
import { RaciChips } from '../ui/raci-chips';
import { PartyRegisters } from './party-registers';
import { PolicyPanels } from './policy-panels';

/** The number of an exclusion for display (`iso9001:8.3` -> `8.3`). */
export function exclusionNumber(exclusion: ScopeExclusion): string {
  if (exclusion.number) {
    return exclusion.number;
  }
  const at = exclusion.clause.indexOf(':');
  return at >= 0 ? exclusion.clause.slice(at + 1) : exclusion.clause;
}

/** The standard of an exclusion (`iso9001:8.3` -> `iso9001`), else the scope's own. */
export function exclusionFramework(exclusion: ScopeExclusion, fallback: string): string {
  const at = exclusion.clause.indexOf(':');
  return at > 0 ? frameworkOf(exclusion.clause.slice(0, at)) : fallback;
}

/**
 * The "Details" tab body of an M01 record, per kind: labelled fields
 * (`app-field-list`), long texts as readable paragraphs, and the parts that
 * connect the record to the rest of CoreFlow (factor follow-ups, policy
 * document / objectives / acknowledgements, the registers behind a party, the
 * processes and excluded requirements of a scope, the RACI).
 */
@Component({
  selector: 'app-context-record-body',
  imports: [
    RouterLink,
    TranslocoPipe,
    Term,
    EntityChip,
    MarkdownPipe,
    FieldItem,
    FieldList,
    StatusBadge,
    AnalysisBoard,
    RaciChips,
    PartyRegisters,
    PolicyPanels,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    @switch (kind()) {
      @case ('analysis') {
        @if (analysis(); as r) {
          <app-field-list [columns]="3">
            <app-field-item
              labelKey="context.fields.method"
              [value]="'context.methods.' + r.method | transloco"
            />
            <app-field-item
              labelKey="context.fields.framework"
              [value]="
                (r.framework ? 'context.frameworks.' + r.framework : 'context.fields.allFrameworks')
                  | transloco
              "
            />
            <app-field-item labelKey="context.fields.openFactors" [value]="r.open_factors ?? 0" />
            <app-field-item labelKey="context.fields.summary" [wide]="true">
              @if (r.summary?.trim()) {
                <div class="cf-prose text-body text-fg" [innerHTML]="r.summary | appMarkdown"></div>
              }
            </app-field-item>
          </app-field-list>
          <section aria-labelledby="ctx-factors-title">
            <h2 id="ctx-factors-title" class="font-display text-section font-bold text-fg">
              {{ 'context.fields.items' | transloco }}
            </h2>
            <p class="mt-0.5 mb-3 text-ui text-fg-muted">
              {{ 'context.analysis.boardHint' | transloco }}
            </p>
            <app-context-analysis-board
              [analysis]="r"
              [canWrite]="canWrite()"
              (changed)="changed.emit($event)"
            />
          </section>
        }
      }
      @case ('party') {
        @if (party(); as r) {
          <app-field-list [columns]="3">
            <app-field-item
              labelKey="context.fields.category"
              [value]="'context.partyCategories.' + r.category | transloco"
            />
            <app-field-item
              labelKey="context.fields.partyType"
              [value]="'context.partyTypes.' + r.party_type | transloco"
            />
            <app-field-item labelKey="context.fields.isComplianceObligation">
              {{
                (r.is_compliance_obligation ? 'context.common.yes' : 'context.common.no')
                  | transloco
              }}
            </app-field-item>
            <app-field-item labelKey="context.fields.influence">
              {{ 'context.levels.' + r.influence | transloco }}
            </app-field-item>
            <app-field-item labelKey="context.fields.interest">
              {{ 'context.levels.' + r.interest | transloco }}
            </app-field-item>
            <app-field-item labelKey="context.fields.priority">
              @let pr = priority(r);
              <app-status-badge
                [meaning]="pr.meaning"
                [value]="pr.value"
                [labelKey]="pr.labelKey"
              />
              <span class="mt-1 block text-meta text-fg-muted">{{
                'context.priorityHints.' + r.priority | transloco
              }}</span>
            </app-field-item>
            <app-field-item labelKey="context.fields.addressedStatus">
              @let ad = addressed(r);
              <app-status-badge
                [meaning]="ad.meaning"
                [value]="ad.value"
                [labelKey]="ad.labelKey"
              />
            </app-field-item>
            <app-field-item
              labelKey="context.fields.description"
              [wide]="true"
              [value]="r.description"
              [multiline]="true"
            />
            <app-field-item labelKey="context.fields.needs" [value]="r.needs" [multiline]="true" />
            <app-field-item
              labelKey="context.fields.expectations"
              [value]="r.expectations"
              [multiline]="true"
            />
            <app-field-item
              labelKey="context.fields.requirements"
              [wide]="true"
              [value]="r.requirements"
              [multiline]="true"
            />
            <app-field-item
              labelKey="context.fields.howAddressed"
              [wide]="true"
              [value]="r.how_addressed"
              [multiline]="true"
            />
            <app-field-item
              labelKey="context.fields.monitoring"
              [wide]="true"
              [value]="r.monitoring"
              [multiline]="true"
            />
            <app-field-item labelKey="context.fields.frameworks" [wide]="true">
              @if (r.frameworks.length) {
                {{ frameworkNames(r.frameworks) }}
              }
            </app-field-item>
          </app-field-list>
          <app-context-party-registers [party]="r" [canEdit]="r.can_edit" />
        }
      }
      @case ('scope') {
        @if (scope(); as r) {
          @if (r.warnings?.includes('soa_missing')) {
            <p
              role="note"
              class="rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-ui text-warn-ink"
            >
              {{ 'context.scope.soaMissing' | transloco }}
              <a routerLink="/standards/soa" class="ml-1 font-semibold underline">{{
                'context.scope.openSoa' | transloco
              }}</a>
            </p>
          }
          <app-field-list [columns]="2">
            <app-field-item
              labelKey="context.fields.framework"
              [value]="'context.frameworks.' + r.framework | transloco"
            />
            <app-field-item labelKey="context.fields.sites">
              @if (r.sites.length) {
                {{ r.sites.join(', ') }}
              }
            </app-field-item>
            <app-field-item labelKey="context.fields.statement" [wide]="true">
              @if (statementOf(r)) {
                <div
                  class="cf-prose text-body text-fg"
                  [innerHTML]="statementOf(r) | appMarkdown"
                ></div>
              }
            </app-field-item>
            <app-field-item
              labelKey="context.fields.boundaries"
              [wide]="true"
              [value]="r.boundaries"
              [multiline]="true"
            />
            <app-field-item
              labelKey="context.fields.productsServices"
              [wide]="true"
              [value]="r.products_services"
              [multiline]="true"
            />
            <app-field-item labelKey="context.fields.processes" [wide]="true" empty="none">
              @if (r.processes?.length) {
                <ul class="flex flex-col gap-1.5">
                  @for (process of r.processes; track process.entity_id) {
                    <li><app-entity-chip [ref]="process" /></li>
                  }
                </ul>
              }
            </app-field-item>
          </app-field-list>
          <section aria-labelledby="scope-excl-title">
            <h2 id="scope-excl-title" class="font-display text-section font-bold text-fg">
              {{ 'context.fields.exclusions' | transloco }}
            </h2>
            <p class="mt-0.5 mb-2 text-ui text-fg-muted">
              {{ 'context.scope.exclusionsHint' | transloco }}
            </p>
            @if (r.exclusions.length) {
              <ul class="flex flex-col gap-2">
                @for (exclusion of r.exclusions; track exclusion.clause) {
                  <li class="rounded-tile border border-border p-3 text-ui">
                    <span class="font-semibold text-fg">{{
                      exclusionLabel(exclusion, r.framework)
                    }}</span>
                    <p class="mt-0.5 whitespace-pre-line text-fg-muted">
                      {{ exclusion.justification }}
                    </p>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-ui text-fg-muted">{{ 'context.scope.noExclusions' | transloco }}</p>
            }
          </section>
        }
      }
      @case ('policy') {
        @if (policy(); as r) {
          <app-field-list [columns]="2">
            <app-field-item
              labelKey="context.fields.kind"
              [value]="'context.policyKinds.' + r.kind | transloco"
            />
            <app-field-item labelKey="context.fields.availableToParties">
              {{
                (r.available_to_interested_parties
                  ? 'context.policy.available'
                  : 'context.policy.internalOnly'
                ) | transloco
              }}
            </app-field-item>
            <app-field-item labelKey="context.fields.statement" [wide]="true">
              @if (statementOf(r)) {
                <div
                  class="cf-prose text-body text-fg"
                  [innerHTML]="statementOf(r) | appMarkdown"
                ></div>
              }
            </app-field-item>
            <app-field-item labelKey="context.fields.frameworks" [wide]="true">
              @if (r.frameworks.length) {
                {{ frameworkNames(r.frameworks) }}
              }
            </app-field-item>
          </app-field-list>
          <app-context-policy-panels
            [policy]="r"
            [canEdit]="r.can_edit"
            [canWrite]="canWrite()"
            (changed)="changed.emit($event)"
            (communicate)="communicate.emit()"
          />
        }
      }
      @case ('responsibility') {
        @if (raci(); as r) {
          @for (warning of r.warnings; track warning) {
            <p
              role="note"
              class="rounded-tile border border-warn/40 bg-warn-soft px-3 py-2 text-ui text-warn-ink"
            >
              {{ 'context.raci.warningText.' + warning | transloco }}
            </p>
          }
          <section aria-labelledby="raci-assign-title">
            <h2 id="raci-assign-title" class="mb-1 font-display text-section font-bold text-fg">
              {{ 'context.fields.assignments' | transloco }}
            </h2>
            <p class="mb-3 text-ui text-fg-muted">
              <app-term key="raci" scope="context">{{
                'context.raci.termLabel' | transloco
              }}</app-term
              >:
              {{ 'context.raci.legend' | transloco }}
            </p>
            <app-context-raci-chips [assignments]="r.assignments" />
          </section>
          <app-field-list [columns]="2">
            <app-field-item labelKey="context.fields.process">
              @if (r.process) {
                <app-entity-chip [ref]="r.process" />
              } @else if (r.area) {
                {{ r.area }}
              }
            </app-field-item>
            <app-field-item labelKey="context.fields.frameworks">
              @if (r.frameworks.length) {
                {{ frameworkNames(r.frameworks) }}
              }
            </app-field-item>
            <app-field-item
              labelKey="context.fields.description"
              [wide]="true"
              [value]="r.description"
              [multiline]="true"
            />
            <app-field-item
              labelKey="context.fields.authorities"
              [wide]="true"
              [value]="r.authorities"
              [multiline]="true"
            />
          </app-field-list>
        }
      }
    }
  `,
})
export class RecordBody {
  private readonly language = inject(LanguageService);

  readonly kind = input.required<ContextKind>();
  readonly record = input.required<ContextRecord>();
  /** `context:write` (follow-ups, reminders). */
  readonly canWrite = input(false);
  /** The record changed through one of the panels (follow-up removed, document linked). */
  readonly changed = output<ContextRecord>();
  /** "Kommuniser" from the acknowledgement panel. */
  readonly communicate = output<void>();

  protected readonly analysis = computed(() =>
    this.kind() === 'analysis' ? (this.record() as ContextAnalysis) : null,
  );
  protected readonly party = computed(() =>
    this.kind() === 'party' ? (this.record() as InterestedParty) : null,
  );
  protected readonly scope = computed(() =>
    this.kind() === 'scope' ? (this.record() as ScopeStatement) : null,
  );
  protected readonly policy = computed(() =>
    this.kind() === 'policy' ? (this.record() as Policy) : null,
  );
  protected readonly raci = computed(() =>
    this.kind() === 'responsibility' ? (this.record() as Responsibility) : null,
  );

  protected priority(r: InterestedParty) {
    return priorityBadge(r.priority);
  }

  protected addressed(r: InterestedParty) {
    return addressedBadge(r.addressed_status);
  }

  protected frameworkNames(keys: readonly string[]): string {
    return keys.map((key) => this.language.translate(`context.frameworks.${key}`)).join(', ');
  }

  /** The statement without a heading that repeats the title. */
  protected statementOf(r: Policy | ScopeStatement): string {
    return withoutTitleHeading(r.statement, r.title).trim();
  }

  /** "ISO 9001 · 8.3" for an excluded requirement. */
  protected exclusionLabel(exclusion: ScopeExclusion, scopeFramework: string): string {
    const framework = exclusionFramework(exclusion, scopeFramework);
    const name = this.language.translate(`context.frameworks.${framework}`);
    const number = exclusionNumber(exclusion);
    const known = name && name !== `context.frameworks.${framework}`;
    return known ? `${name} · ${number}` : number;
  }
}
