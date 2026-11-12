import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Badge } from '../../../shared/ui/badge/badge';
import {
  ContextAnalysis,
  ContextKind,
  ContextRecord,
  InterestedParty,
  Policy,
  Responsibility,
  ScopeStatement,
} from '../data/context.models';
import { addressedTone, levelTone, priorityTone } from '../context-kinds';
import { AnalysisBoard } from '../ui/analysis-board';
import { TextBlock } from '../ui/text-block';
import { RaciChips } from '../ui/raci-chips';
import { FieldHeading } from '../ui/field-heading';

/** The "Details" tab body of an M01 record, per kind. */
@Component({
  selector: 'app-context-record-body',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    EntityChip,
    Badge,
    AnalysisBoard,
    TextBlock,
    RaciChips,
    FieldHeading,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  template: `
    @switch (kind()) {
      @case ('analysis') {
        @if (analysis(); as r) {
          <div class="flex flex-wrap gap-2">
            <app-badge tone="accent">{{ 'context.methods.' + r.method | transloco }}</app-badge>
            @if (r.framework) {
              <app-badge>{{ 'context.frameworks.' + r.framework | transloco }}</app-badge>
            }
          </div>
          <app-context-text-block
            labelKey="context.fields.summary"
            [text]="r.summary"
            [markdown]="true"
          />
          <app-context-analysis-board [method]="r.method" [items]="r.items" />
        }
      }
      @case ('party') {
        @if (party(); as r) {
          <div class="flex flex-wrap gap-2">
            <app-badge>{{ 'context.partyCategories.' + r.category | transloco }}</app-badge>
            <app-badge>{{ 'context.partyTypes.' + r.party_type | transloco }}</app-badge>
            <app-badge [tone]="priorityTone(r.priority)">
              {{ 'context.priorities.' + r.priority | transloco }}
            </app-badge>
            <app-badge [tone]="addressedTone(r.addressed_status)">
              {{ 'context.addressed.' + r.addressed_status | transloco }}
            </app-badge>
            @if (r.is_compliance_obligation) {
              <app-badge tone="info">{{ 'context.party.obligation' | transloco }}</app-badge>
            }
          </div>
          <dl class="grid grid-cols-2 gap-3 text-[13px] sm:max-w-[420px]">
            <div>
              <dt class="text-[12px] font-semibold text-fg-subtle">
                {{ 'context.fields.influence' | transloco }}
              </dt>
              <dd>
                <app-badge [tone]="levelTone(r.influence)">{{
                  'context.levels.' + r.influence | transloco
                }}</app-badge>
              </dd>
            </div>
            <div>
              <dt class="text-[12px] font-semibold text-fg-subtle">
                {{ 'context.fields.interest' | transloco }}
              </dt>
              <dd>
                <app-badge [tone]="levelTone(r.interest)">{{
                  'context.levels.' + r.interest | transloco
                }}</app-badge>
              </dd>
            </div>
          </dl>
          <p class="text-[12.5px] text-fg-muted">
            {{ 'context.priorityHints.' + r.priority | transloco }}
          </p>
          <app-context-text-block labelKey="context.fields.description" [text]="r.description" />
          <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <app-context-text-block labelKey="context.fields.needs" [text]="r.needs" />
            <app-context-text-block
              labelKey="context.fields.expectations"
              [text]="r.expectations"
            />
          </div>
          <app-context-text-block labelKey="context.fields.requirements" [text]="r.requirements" />
          <app-context-text-block labelKey="context.fields.howAddressed" [text]="r.how_addressed" />
          <ng-container *ngTemplateOutlet="frameworks; context: { $implicit: r.frameworks }" />
        }
      }
      @case ('scope') {
        @if (scope(); as r) {
          <div class="flex flex-wrap gap-2">
            <app-badge tone="accent">{{
              'context.frameworks.' + r.framework | transloco
            }}</app-badge>
          </div>
          <app-context-text-block
            labelKey="context.fields.statement"
            [text]="r.statement"
            [markdown]="true"
          />
          <app-context-text-block labelKey="context.fields.boundaries" [text]="r.boundaries" />
          <app-context-text-block
            labelKey="context.fields.productsServices"
            [text]="r.products_services"
          />
          <section>
            <app-context-field-heading role="heading" aria-level="3">
              {{ 'context.fields.sites' | transloco }}
            </app-context-field-heading>
            @if (r.sites.length) {
              <ul class="flex flex-wrap gap-1.5">
                @for (site of r.sites; track site) {
                  <li>
                    <app-badge>{{ site }}</app-badge>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-subtle">{{ 'context.common.notSet' | transloco }}</p>
            }
          </section>
          <section>
            <app-context-field-heading role="heading" aria-level="3">
              {{ 'context.fields.exclusions' | transloco }}
            </app-context-field-heading>
            @if (r.exclusions.length) {
              <ul class="flex flex-col gap-2">
                @for (exclusion of r.exclusions; track $index) {
                  <li class="rounded-tile border border-border p-2.5 text-[13px]">
                    <span class="font-mono font-semibold text-fg">{{ exclusion.clause }}</span>
                    <p class="mt-0.5 whitespace-pre-line text-fg-muted">
                      {{ exclusion.justification }}
                    </p>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-subtle">
                {{ 'context.scope.noExclusions' | transloco }}
              </p>
            }
          </section>
        }
      }
      @case ('policy') {
        @if (policy(); as r) {
          <div class="flex flex-wrap gap-2">
            <app-badge tone="accent">{{ 'context.policyKinds.' + r.kind | transloco }}</app-badge>
          </div>
          <app-context-text-block
            labelKey="context.fields.statement"
            [text]="r.statement"
            [markdown]="true"
          />
          <section>
            <app-context-field-heading role="heading" aria-level="3">
              {{ 'context.fields.documents' | transloco }}
            </app-context-field-heading>
            @if (r.documents.length) {
              <ul class="flex flex-wrap gap-1.5">
                @for (doc of r.documents; track doc.entity_id) {
                  <li><app-entity-chip [ref]="doc" /></li>
                }
              </ul>
            } @else {
              <p class="text-[13px] text-fg-subtle">
                {{ 'context.policy.noDocuments' | transloco }}
              </p>
            }
          </section>
          <ng-container *ngTemplateOutlet="frameworks; context: { $implicit: r.frameworks }" />
        }
      }
      @case ('responsibility') {
        @if (raci(); as r) {
          @if (r.area) {
            <div class="flex flex-wrap gap-2">
              <app-badge>{{ r.area }}</app-badge>
            </div>
          }
          @for (warning of r.warnings; track warning) {
            <p
              class="rounded-tile border border-warn bg-warn-soft px-3 py-2 text-[13px] text-fg"
              role="note"
            >
              {{ 'context.raci.warningText.' + warning | transloco }}
            </p>
          }
          <section>
            <app-context-field-heading role="heading" aria-level="3">
              {{ 'context.fields.assignments' | transloco }}
            </app-context-field-heading>
            <app-context-raci-chips [assignments]="r.assignments" />
          </section>
          <app-context-text-block labelKey="context.fields.description" [text]="r.description" />
          <app-context-text-block labelKey="context.fields.authorities" [text]="r.authorities" />
          <ng-container *ngTemplateOutlet="frameworks; context: { $implicit: r.frameworks }" />
        }
      }
    }

    <ng-template #frameworks let-list>
      <section>
        <app-context-field-heading role="heading" aria-level="3">
          {{ 'context.fields.frameworks' | transloco }}
        </app-context-field-heading>
        @if (list.length) {
          <ul class="flex flex-wrap gap-1.5">
            @for (fw of list; track fw) {
              <li>
                <app-badge>{{ 'context.frameworks.' + fw | transloco }}</app-badge>
              </li>
            }
          </ul>
        } @else {
          <p class="text-[13px] text-fg-subtle">{{ 'context.common.notSet' | transloco }}</p>
        }
      </section>
    </ng-template>
  `,
})
export class RecordBody {
  readonly kind = input.required<ContextKind>();
  readonly record = input.required<ContextRecord>();

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

  protected readonly levelTone = levelTone;
  protected readonly priorityTone = priorityTone;
  protected readonly addressedTone = addressedTone;
}
