import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { RuleSummary } from '../../shared/tasks/rule-summary';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { ENTITY_TYPE, RequirementProposal } from './data/obligation.models';
import { frameworkKey, obligationTypeKey } from './data/obligation-display';
import { isFramework, isObligationType } from './data/obligation-form-model';

export interface ProposalAccepted {
  readonly proposal: RequirementProposal;
  readonly chosen: readonly string[];
}

/** Keep only well-formed parts of an assist result (it is model output). */
export function normaliseProposal(raw: unknown): RequirementProposal | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const requirements = Array.isArray(r['requirements'])
    ? r['requirements']
        .map((item) =>
          item && typeof item === 'object'
            ? {
                text: str((item as Record<string, unknown>)['text']) ?? '',
                rationale: str((item as Record<string, unknown>)['rationale']),
              }
            : { text: str(item) ?? '', rationale: null },
        )
        .filter((item) => item.text)
    : [];
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);
  const type = str(r['obligation_type']);
  return {
    summary: str(r['summary']),
    obligation_type: isObligationType(type) ? type : null,
    applicability: str(r['applicability']),
    frameworks: list(r['frameworks']).filter(isFramework),
    requirements,
    evidence: list(r['evidence']),
    evaluation_rrule: str(r['evaluation_rrule']),
  };
}

/**
 * "Propose requirements" (assist `obligations.propose_requirements`): asks the
 * assistant which requirements apply, from the form text and/or the saved
 * obligation, and lets the user pick which proposals go into the form. Nothing is
 * saved until the form is.
 */
@Component({
  selector: 'app-obligation-proposal',
  imports: [TranslocoPipe, AiAssistButton, RuleSummary, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-end gap-1">
      <app-ai-assist-button
        assist="obligations.propose_requirements"
        labelKey="obligations.proposal.run"
        [input]="text() ? { text: text() } : {}"
        [entityType]="entityId() ? entityType : null"
        [entityId]="entityId()"
        [disabled]="!text() && !entityId()"
        (result)="onResult($event)"
        data-testid="propose-requirements"
      />
      @if (!text() && !entityId()) {
        <span class="text-[12px] text-fg-muted">{{
          'obligations.proposal.needText' | transloco
        }}</span>
      }
    </div>
    @if (proposal(); as p) {
      <section
        class="mt-3 w-full basis-full rounded-tile border border-accent/40 bg-accent-soft/40 p-4"
        aria-labelledby="cf-o-proposal-h"
        data-testid="proposal"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3
            id="cf-o-proposal-h"
            class="flex items-center gap-2 text-[14px] font-semibold text-fg"
          >
            <app-icon name="spark" [size]="14" class="text-accent" />
            {{ 'obligations.proposal.title' | transloco }}
          </h3>
          <app-button
            variant="ghost"
            size="sm"
            [attr.aria-label]="'obligations.proposal.dismiss' | transloco"
            (click)="proposal.set(null)"
          >
            <app-icon name="x" [size]="14" />
          </app-button>
        </div>
        <p class="mb-3 text-[12px] text-fg-muted">
          {{ 'obligations.proposal.review' | transloco }}
        </p>
        @if (p.summary) {
          <p class="mb-3 text-[13px] whitespace-pre-line text-fg">{{ p.summary }}</p>
        }
        <dl class="mb-3 grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
          @if (p.obligation_type) {
            <div>
              <dt class="text-fg-subtle">{{ 'obligations.fields.obligationType' | transloco }}</dt>
              <dd class="text-fg">{{ typeKey(p.obligation_type) | transloco }}</dd>
            </div>
          }
          @if (p.frameworks?.length) {
            <div>
              <dt class="text-fg-subtle">{{ 'obligations.fields.frameworks' | transloco }}</dt>
              <dd class="text-fg">
                @for (f of p.frameworks; track f; let last = $last) {
                  {{ frameworkKey(f) | transloco }}{{ last ? '' : ', ' }}
                }
              </dd>
            </div>
          }
          @if (p.evaluation_rrule) {
            <div>
              <dt class="text-fg-subtle">
                {{ 'obligations.proposal.frequency' | transloco }}
              </dt>
              <dd class="text-fg"><app-rule-summary [rrule]="p.evaluation_rrule" /></dd>
            </div>
          }
          @if (p.applicability) {
            <div class="sm:col-span-2">
              <dt class="text-fg-subtle">{{ 'obligations.fields.applicability' | transloco }}</dt>
              <dd class="whitespace-pre-line text-fg">{{ p.applicability }}</dd>
            </div>
          }
        </dl>
        @if (p.requirements?.length) {
          <fieldset>
            <legend class="mb-1 text-[13px] font-semibold text-fg">
              {{ 'obligations.proposal.requirements' | transloco }}
            </legend>
            <ul class="flex flex-col gap-2">
              @for (r of p.requirements; track $index; let i = $index) {
                <li>
                  <label class="flex items-start gap-2 text-[13px] text-fg">
                    <input
                      type="checkbox"
                      class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                      [checked]="selected().has(i)"
                      (change)="toggle(i, $any($event.target).checked)"
                    />
                    <span>
                      {{ r.text }}
                      @if (r.rationale) {
                        <span class="block text-[12px] text-fg-muted">{{ r.rationale }}</span>
                      }
                    </span>
                  </label>
                </li>
              }
            </ul>
          </fieldset>
        } @else {
          <p class="text-[13px] text-fg-muted">{{ 'obligations.proposal.none' | transloco }}</p>
        }
        @if (p.evidence?.length) {
          <div class="mt-3">
            <h4 class="mb-1 text-[13px] font-semibold text-fg">
              {{ 'obligations.proposal.evidence' | transloco }}
            </h4>
            <ul class="list-disc pl-5 text-[12.5px] text-fg-muted">
              @for (e of p.evidence; track $index) {
                <li>{{ e }}</li>
              }
            </ul>
          </div>
        }
        <div class="mt-3 flex flex-wrap justify-end gap-2">
          <app-button variant="ghost" size="sm" (click)="proposal.set(null)">
            {{ 'obligations.proposal.dismiss' | transloco }}
          </app-button>
          <app-button size="sm" (click)="accept()" data-testid="proposal-apply">
            {{ 'obligations.proposal.apply' | transloco: { count: selected().size } }}
          </app-button>
        </div>
      </section>
    }
  `,
  host: { class: 'contents' },
})
export class ObligationProposal {
  /** Text describing the obligation (unsaved form content). */
  readonly text = input('');
  /** The saved obligation, if any (the backend then reads it as context). */
  readonly entityId = input<string | null>(null);
  readonly accepted = output<ProposalAccepted>();

  protected readonly entityType = ENTITY_TYPE;
  protected readonly typeKey = obligationTypeKey;
  protected readonly frameworkKey = frameworkKey;
  protected readonly proposal = signal<RequirementProposal | null>(null);
  protected readonly selected = signal<ReadonlySet<number>>(new Set());
  private readonly chosen = computed(() => {
    const items = this.proposal()?.requirements ?? [];
    return items.filter((_, i) => this.selected().has(i)).map((r) => r.text);
  });

  protected onResult(raw: unknown): void {
    const proposal = normaliseProposal(raw);
    this.proposal.set(proposal);
    this.selected.set(new Set((proposal?.requirements ?? []).map((_, i) => i)));
  }

  protected toggle(index: number, on: boolean): void {
    const next = new Set(this.selected());
    if (on) {
      next.add(index);
    } else {
      next.delete(index);
    }
    this.selected.set(next);
  }

  protected accept(): void {
    const proposal = this.proposal();
    if (proposal) {
      this.accepted.emit({ proposal, chosen: this.chosen() });
      this.proposal.set(null);
    }
  }
}
