import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import {
  AiGovernanceCatalog,
  AiActRole,
  ClassificationAnswers,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_SCOPE,
  annexIiiKey,
  prohibitedKey,
  roleKey,
  toggleIn,
  transparencyKey,
} from '../data/ai-governance-display';

export const WIZARD_STEPS = [
  'role',
  'prohibited',
  'highRisk',
  'transparency',
  'gpai',
  'deployer',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

type BoolKey =
  | 'annex_i_safety_component'
  | 'art6_3_exception'
  | 'profiling'
  | 'gpai'
  | 'gpai_systemic_risk'
  | 'deployer_public_service'
  | 'deployer_credit_or_insurance';
type ListKey = 'prohibited_practices' | 'annex_iii_areas' | 'transparency';

/**
 * The EU AI Act classification questions, one step at a time: role,
 * prohibited practices (Art. 5), high risk (Annex I / Annex III, Art. 6(3)),
 * transparency (Art. 50), general-purpose AI and deployer duties (Art. 27).
 * Edits `answers` (two-way); the page previews the outcome.
 */
@Component({
  selector: 'app-ai-classification-questions',
  imports: [TranslocoPipe, AskAbout, FieldHelp, Button, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let a = answers();
    @let cat = catalog();
    <div class="mb-4">
      <ol
        class="mb-2 flex flex-wrap gap-1.5"
        [attr.aria-label]="'aiGovernance.wizard.stepsLabel' | transloco"
      >
        @for (s of steps; track s; let i = $index) {
          <li>
            <button
              type="button"
              class="rounded-full border px-2.5 py-1 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [class]="
                i === index()
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border text-fg-muted hover:text-fg'
              "
              [attr.aria-current]="i === index() ? 'step' : null"
              (click)="index.set(i)"
              [attr.data-testid]="'wizard-step-' + s"
            >
              {{ i + 1 }}. {{ 'aiGovernance.wizard.steps.' + s + '.short' | transloco }}
            </button>
          </li>
        }
      </ol>
      <app-progress-bar
        [value]="progress()"
        [label]="
          'aiGovernance.wizard.progress' | transloco: { step: index() + 1, total: steps.length }
        "
      />
    </div>

    <fieldset class="flex flex-col gap-3" [disabled]="disabled()">
      <legend class="mb-1 w-full">
        <span class="flex items-center gap-2">
          <span class="font-display text-[17px] font-bold text-fg">{{
            'aiGovernance.wizard.steps.' + step() + '.title' | transloco
          }}</span>
          <app-ask-about
            [prompt]="'aiGovernance.wizard.steps.' + step() + '.ask' | transloco"
            [field]="step()"
            labelKey="aiGovernance.wizard.askAbout"
          />
        </span>
        <span class="mt-1 block text-[13px] text-fg-muted">{{
          'aiGovernance.wizard.steps.' + step() + '.body' | transloco
        }}</span>
      </legend>
      <app-field-help [scope]="scope" page="classify" [field]="step()" />

      @switch (step()) {
        @case ('role') {
          <div class="flex flex-col gap-1.5">
            @for (role of roles(); track role) {
              <label class="flex items-start gap-2 text-[13.5px] text-fg">
                <input
                  type="radio"
                  name="ai-role"
                  class="mt-1"
                  [value]="role"
                  [checked]="(a.role || defaultRole()) === role"
                  (change)="setRole(role)"
                />
                <span>
                  <span class="font-semibold">{{ roleKey(role) | transloco }}</span>
                  <span class="block text-[12.5px] text-fg-muted">{{
                    'aiGovernance.roleHelp.' + role | transloco
                  }}</span>
                </span>
              </label>
            }
          </div>
        }
        @case ('prohibited') {
          @for (item of cat?.prohibited_practices ?? []; track item.key) {
            <label class="flex items-start gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="mt-1"
                [checked]="a.prohibited_practices.includes(item.key)"
                (change)="toggle('prohibited_practices', item.key, $any($event.target).checked)"
              />
              <span>
                {{ prohibitedKey(item.key) | transloco }}
                <span class="text-[12px] text-fg-subtle">({{ item.ref }})</span>
              </span>
            </label>
          }
        }
        @case ('highRisk') {
          <label class="flex items-start gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="mt-1"
              [checked]="a.annex_i_safety_component"
              (change)="setBool('annex_i_safety_component', $any($event.target).checked)"
            />
            <span>{{ 'aiGovernance.wizard.q.annexI' | transloco }}</span>
          </label>
          <p class="mt-2 text-[13px] font-semibold text-fg-muted">
            {{ 'aiGovernance.wizard.q.annexIii' | transloco }}
          </p>
          @for (item of cat?.annex_iii_areas ?? []; track item.key) {
            <label class="flex items-start gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="mt-1"
                [checked]="a.annex_iii_areas.includes(item.key)"
                (change)="toggle('annex_iii_areas', item.key, $any($event.target).checked)"
              />
              <span>
                {{ annexIiiKey(item.key) | transloco }}
                <span class="text-[12px] text-fg-subtle">({{ item.ref }})</span>
              </span>
            </label>
          }
          @if (a.annex_iii_areas.length) {
            <div
              class="mt-2 flex flex-col gap-2 rounded-tile border border-border bg-surface-2 p-3"
            >
              <label class="flex items-start gap-2 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="mt-1"
                  [checked]="a.art6_3_exception"
                  (change)="setBool('art6_3_exception', $any($event.target).checked)"
                />
                <span>{{ 'aiGovernance.wizard.q.exception' | transloco }}</span>
              </label>
              <label class="flex items-start gap-2 text-[13.5px] text-fg">
                <input
                  type="checkbox"
                  class="mt-1"
                  [checked]="a.profiling"
                  (change)="setBool('profiling', $any($event.target).checked)"
                />
                <span>{{ 'aiGovernance.wizard.q.profiling' | transloco }}</span>
              </label>
            </div>
          }
        }
        @case ('transparency') {
          @for (item of cat?.transparency_triggers ?? []; track item.key) {
            <label class="flex items-start gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="mt-1"
                [checked]="a.transparency.includes(item.key)"
                (change)="toggle('transparency', item.key, $any($event.target).checked)"
              />
              <span>
                {{ transparencyKey(item.key) | transloco }}
                <span class="text-[12px] text-fg-subtle">({{ item.ref }})</span>
              </span>
            </label>
          }
        }
        @case ('gpai') {
          <label class="flex items-start gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="mt-1"
              [checked]="a.gpai"
              (change)="setBool('gpai', $any($event.target).checked)"
            />
            <span>{{ 'aiGovernance.wizard.q.gpai' | transloco }}</span>
          </label>
          @if (a.gpai) {
            <label class="flex items-start gap-2 text-[13.5px] text-fg">
              <input
                type="checkbox"
                class="mt-1"
                [checked]="a.gpai_systemic_risk"
                (change)="setBool('gpai_systemic_risk', $any($event.target).checked)"
              />
              <span>{{ 'aiGovernance.wizard.q.gpaiSystemic' | transloco }}</span>
            </label>
          }
        }
        @case ('deployer') {
          <label class="flex items-start gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="mt-1"
              [checked]="a.deployer_public_service"
              (change)="setBool('deployer_public_service', $any($event.target).checked)"
            />
            <span>{{ 'aiGovernance.wizard.q.publicService' | transloco }}</span>
          </label>
          <label class="flex items-start gap-2 text-[13.5px] text-fg">
            <input
              type="checkbox"
              class="mt-1"
              [checked]="a.deployer_credit_or_insurance"
              (change)="setBool('deployer_credit_or_insurance', $any($event.target).checked)"
            />
            <span>{{ 'aiGovernance.wizard.q.creditInsurance' | transloco }}</span>
          </label>
          <label class="mt-2 flex flex-col gap-1 text-[13px] font-semibold text-fg-muted">
            {{ 'aiGovernance.wizard.q.notes' | transloco }}
            <textarea
              rows="3"
              maxlength="4000"
              class="rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] font-normal text-fg"
              [value]="a.notes ?? ''"
              (input)="setNotes($any($event.target).value)"
            ></textarea>
          </label>
        }
      }
    </fieldset>

    <div class="mt-4 flex items-center justify-between gap-2">
      <app-button
        variant="secondary"
        size="sm"
        [disabled]="index() === 0"
        (click)="index.set(index() - 1)"
      >
        {{ 'aiGovernance.wizard.back' | transloco }}
      </app-button>
      @if (index() < steps.length - 1) {
        <app-button size="sm" (click)="index.set(index() + 1)" data-testid="wizard-next">
          {{ 'aiGovernance.wizard.next' | transloco }}
        </app-button>
      }
    </div>
  `,
})
export class AiClassificationQuestions {
  readonly answers = model.required<ClassificationAnswers>();
  readonly catalog = input<AiGovernanceCatalog | null>(null);
  /** The system's AI Act role, used when the answers name none. */
  readonly defaultRole = input<AiActRole>('deployer');
  readonly disabled = input(false);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly steps = WIZARD_STEPS;
  protected readonly index = signal(0);
  protected readonly step = computed<WizardStep>(() => WIZARD_STEPS[this.index()]);
  protected readonly progress = computed(() =>
    Math.round(((this.index() + 1) / WIZARD_STEPS.length) * 100),
  );
  protected readonly roles = computed(() => (this.catalog()?.roles ?? []) as readonly AiActRole[]);

  protected readonly roleKey = roleKey;
  protected readonly prohibitedKey = prohibitedKey;
  protected readonly annexIiiKey = annexIiiKey;
  protected readonly transparencyKey = transparencyKey;

  protected setRole(role: AiActRole): void {
    this.answers.update((a) => ({ ...a, role }));
  }

  protected setBool(key: BoolKey, on: boolean): void {
    this.answers.update((a) => {
      const next = { ...a, [key]: on };
      if (key === 'gpai' && !on) {
        next.gpai_systemic_risk = false;
      }
      return next;
    });
  }

  protected toggle(key: ListKey, value: string, on: boolean): void {
    this.answers.update((a) => {
      const next = { ...a, [key]: toggleIn(a[key], value, on) };
      if (key === 'annex_iii_areas' && next.annex_iii_areas.length === 0) {
        next.art6_3_exception = false;
        next.profiling = false;
      }
      return next;
    });
  }

  protected setNotes(notes: string): void {
    this.answers.update((a) => ({ ...a, notes: notes || null }));
  }
}
