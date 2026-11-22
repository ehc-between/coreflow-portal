import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { Term } from '../../../shared/guidance/term';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { frameworkOf } from '../../../shared/requirement-links/requirement-label';
import { FieldItem, FieldList } from '../../../shared/ui/field-list/field-list';
import { Icon } from '../../../shared/ui/icon/icon';
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
import {
  addressedBadge,
  needsFollowUp,
  priorityBadge,
  withoutTitleHeading,
} from '../context-kinds';
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
    Icon,
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
          @let stats = analysisStats();
          <section
            class="rounded-card border border-border bg-surface p-5"
            aria-labelledby="ctx-summary-title"
            data-testid="analysis-lead"
          >
            <h2
              id="ctx-summary-title"
              class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
            >
              {{ 'context.fields.summary' | transloco }}
            </h2>
            @if (r.summary?.trim()) {
              <div
                class="cf-prose mt-1.5 text-card leading-relaxed text-fg"
                [innerHTML]="r.summary | appMarkdown"
              ></div>
            } @else {
              <p class="mt-1.5 text-ui text-fg-subtle">{{ 'common.empty.notSet' | transloco }}</p>
            }
            <dl
              class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 text-ui"
              data-testid="analysis-facts"
            >
              <div class="flex items-baseline gap-1.5">
                <dt class="text-fg-muted">{{ 'context.fields.method' | transloco }}</dt>
                <dd class="font-semibold text-fg">
                  {{ 'context.methods.' + r.method | transloco }}
                </dd>
              </div>
              <div class="flex items-baseline gap-1.5">
                <dt class="text-fg-muted">{{ 'context.fields.appliesTo' | transloco }}</dt>
                <dd class="flex flex-wrap gap-1" data-testid="analysis-frameworks">
                  @for (fw of analysisFrameworks(r); track fw) {
                    <span
                      class="rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-meta font-semibold text-accent"
                    >
                      {{ 'context.frameworks.' + fw | transloco }}
                    </span>
                  } @empty {
                    <span
                      class="rounded-full border border-border px-2 py-0.5 text-meta font-semibold text-fg"
                    >
                      {{ 'context.fields.allFrameworks' | transloco }}
                    </span>
                  }
                </dd>
              </div>
              <div class="flex items-baseline gap-1.5">
                <dt class="text-fg-muted">{{ 'context.fields.items' | transloco }}</dt>
                <dd class="font-semibold text-fg">{{ stats.total }}</dd>
              </div>
              <div class="flex items-baseline gap-1.5">
                <dt class="text-fg-muted">{{ 'context.analysis.facts.followedUp' | transloco }}</dt>
                <dd class="font-semibold text-fg" data-testid="analysis-followed">
                  {{
                    'context.analysis.facts.ofTotal'
                      | transloco: { done: stats.handled, total: stats.total }
                  }}
                </dd>
              </div>
              @if (stats.open) {
                <div class="sm:ml-auto">
                  <dt class="sr-only">{{ 'context.fields.openFactors' | transloco }}</dt>
                  <dd>
                    <button
                      type="button"
                      class="inline-flex h-8 items-center gap-1.5 rounded-full border border-warn/50 bg-warn-soft px-3 text-ui font-semibold text-warn-ink hover:border-warn focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      [attr.aria-pressed]="onlyOpen()"
                      [title]="'context.analysis.facts.showOpen' | transloco"
                      data-testid="analysis-open-factors"
                      (click)="showOpen()"
                    >
                      <app-icon name="alert" [size]="14" />
                      {{ 'context.analysis.facts.open' | transloco: { count: stats.open } }}
                      <app-icon name="arrow" [size]="13" />
                    </button>
                  </dd>
                </div>
              } @else if (stats.total) {
                <div class="flex items-center gap-1.5 font-semibold text-pass-ink sm:ml-auto">
                  <dt class="sr-only">{{ 'context.fields.openFactors' | transloco }}</dt>
                  <dd class="flex items-center gap-1.5">
                    <app-icon name="checkcircle" [size]="15" />
                    {{ 'context.analysis.facts.allDone' | transloco }}
                  </dd>
                </div>
              }
            </dl>
          </section>
          <section aria-labelledby="ctx-factors-title">
            <h2
              id="ctx-factors-title"
              tabindex="-1"
              class="scroll-mt-4 font-display text-section font-bold text-fg outline-none"
            >
              {{ 'context.fields.items' | transloco }}
            </h2>
            <p class="mt-0.5 mb-3 text-meta text-fg-muted">
              {{ 'context.analysis.boardHint' | transloco }}
            </p>
            <app-context-analysis-board
              [analysis]="r"
              [canWrite]="canWrite()"
              [(onlyOpen)]="onlyOpen"
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
  /** Show only the factors that still need a follow-up (the strip's warning). */
  protected readonly onlyOpen = signal(false);

  /** The key facts of an analysis: factors, how many are followed up, how many must be. */
  protected readonly analysisStats = computed(() => {
    const r = this.analysis();
    const items = r?.items ?? [];
    return {
      total: items.length,
      handled: items.filter((item) => item.follow_ups?.length).length,
      open: r ? items.filter((item) => needsFollowUp(r.method, item)).length : 0,
    };
  });

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

  /** "1 ikke fulgt opp": filter the board to those factors and scroll to it. */
  protected showOpen(): void {
    this.onlyOpen.set(true);
    const heading = document.getElementById('ctx-factors-title');
    heading?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    heading?.focus({ preventScroll: true });
  }

  protected priority(r: InterestedParty) {
    return priorityBadge(r.priority);
  }

  protected addressed(r: InterestedParty) {
    return addressedBadge(r.addressed_status);
  }

  /** The standards an analysis applies to (legacy single value as fallback). */
  protected analysisFrameworks(r: ContextAnalysis): readonly string[] {
    if (r.frameworks?.length) {
      return r.frameworks;
    }
    return r.framework ? [r.framework] : [];
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
