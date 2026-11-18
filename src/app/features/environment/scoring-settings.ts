import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskAbout } from '../../shared/ask/ask-about';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalDatePipe, LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { EnvironmentApi } from './data/environment-api';
import {
  LocalText,
  SCORING_METHODS,
  ScoringCriterionIn,
  ScoringMethod,
  ScoringMethodIn,
  ScoringMethodKind,
} from './data/environment.models';
import { environmentErrorKey, fieldErrors } from './data/environment-errors';
import { parseDecimal } from './data/form-models';
import {
  ENV_CRUMBS,
  ENV_MODULE,
  ENV_ROOT_CRUMB,
  EnvField,
  injectEnvPermissions,
} from './environment-shared';

export const MAX_CRITERIA = 10;
/** Most score levels described per criterion (the backend keeps any scale). */
export const MAX_DESCRIBED_LEVELS = 10;

/** One editable bilingual text. */
export interface TextDraft {
  readonly en: string;
  readonly nb: string;
}

export interface CriterionDraft {
  /** The stored key of an existing criterion ('' for a new one: the backend makes it). */
  readonly key: string;
  readonly label: TextDraft;
  readonly description: TextDraft;
  readonly weight: string;
  /** Score value (as text) -> what it means. */
  readonly levels: Readonly<Record<string, TextDraft>>;
}

export interface ScoringDraft {
  readonly method: ScoringMethodKind;
  readonly criteria: readonly CriterionDraft[];
  readonly scale_min: string;
  readonly scale_max: string;
  readonly threshold: string;
  readonly legal_requirement_significant: boolean;
  readonly emergency_significant: boolean;
}

function textDraft(t: LocalText | null | undefined): TextDraft {
  return { en: t?.['en'] ?? '', nb: t?.['nb'] ?? '' };
}

function textOut(t: TextDraft): Record<string, string> {
  const out: Record<string, string> = {};
  if (t.en.trim()) {
    out['en'] = t.en.trim();
  }
  if (t.nb.trim()) {
    out['nb'] = t.nb.trim();
  }
  return out;
}

export function emptyCriterion(): CriterionDraft {
  return {
    key: '',
    label: { en: '', nb: '' },
    description: { en: '', nb: '' },
    weight: '1',
    levels: {},
  };
}

export function draftFromMethod(m: ScoringMethod): ScoringDraft {
  return {
    method: m.method,
    criteria: m.criteria.map((c) => ({
      key: c.key,
      label: textDraft(c.label),
      description: textDraft(c.description),
      weight: String(c.weight),
      levels: Object.fromEntries(
        Object.entries(c.levels ?? {}).map(([level, text]) => [level, textDraft(text)]),
      ),
    })),
    scale_min: String(m.scale_min),
    scale_max: String(m.scale_max),
    threshold: String(m.threshold),
    legal_requirement_significant: m.legal_requirement_significant,
    emergency_significant: m.emergency_significant,
  };
}

/** The score values of the draft's scale (empty while the scale is invalid). */
export function draftScale(d: ScoringDraft): number[] {
  const min = Number(d.scale_min);
  const max = Number(d.scale_max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    return [];
  }
  return Array.from({ length: Math.min(max - min + 1, MAX_DESCRIBED_LEVELS) }, (_, i) => min + i);
}

/** Client-side checks mirroring the backend (`scoring.normalise_method`); field -> i18n key. */
export function validateScoringDraft(d: ScoringDraft): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  const min = Number(d.scale_min);
  const max = Number(d.scale_max);
  if (!Number.isInteger(min) || min < 0 || min > 99) {
    errors['scale_min'] = 'environment.scoring.errors.scaleMin';
  }
  if (!Number.isInteger(max) || max < 1 || max > 100) {
    errors['scale_max'] = 'environment.scoring.errors.scaleMax';
  } else if (Number.isInteger(min) && max <= min) {
    errors['scale_max'] = 'environment.scoring.errors.notAboveMin';
  }
  const threshold = parseDecimal(d.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) {
    errors['threshold'] = 'environment.scoring.errors.threshold';
  }
  if (d.criteria.length < 1 || d.criteria.length > MAX_CRITERIA) {
    errors['criteria'] = 'environment.scoring.errors.count';
  }
  const seen = new Set<string>();
  d.criteria.forEach((c, i) => {
    const name = (c.label.nb.trim() || c.label.en.trim()).toLowerCase();
    if (!name) {
      errors[`criteria.${i}.label`] = 'environment.scoring.errors.label';
    } else if (seen.has(name)) {
      errors[`criteria.${i}.label`] = 'environment.scoring.errors.duplicate';
    }
    seen.add(name);
    const w = parseDecimal(c.weight);
    if (!Number.isFinite(w) || w <= 0 || w > 10) {
      errors[`criteria.${i}.weight`] = 'environment.scoring.errors.weight';
    }
  });
  return errors;
}

/** The PUT body. Existing criteria keep their key; new ones get one from the backend. */
export function toScoringIn(d: ScoringDraft): ScoringMethodIn {
  const scale = new Set(draftScale(d).map(String));
  return {
    method: d.method,
    criteria: d.criteria.map((c): ScoringCriterionIn => {
      const levels: Record<string, Record<string, string>> = {};
      for (const [level, text] of Object.entries(c.levels)) {
        const out = textOut(text);
        if (scale.has(level) && Object.keys(out).length) {
          levels[level] = out;
        }
      }
      return {
        ...(c.key ? { key: c.key } : {}),
        label: textOut(c.label),
        description: textOut(c.description),
        weight: parseDecimal(c.weight),
        levels,
      };
    }),
    scale_min: Number(d.scale_min),
    scale_max: Number(d.scale_max),
    threshold: parseDecimal(d.threshold),
    legal_requirement_significant: d.legal_requirement_significant,
    emergency_significant: d.emergency_significant,
  };
}

/** Highest score the draft can give (sum of weight x max, or max to the power of n). */
export function draftMaxScore(d: ScoringDraft): number | null {
  const max = Number(d.scale_max);
  if (!Number.isFinite(max) || d.criteria.length === 0) {
    return null;
  }
  if (d.method === 'product') {
    return max ** d.criteria.length;
  }
  const total = d.criteria.reduce((acc, c) => acc + (parseDecimal(c.weight) || 0) * max, 0);
  return Math.round(total * 100) / 100;
}

/**
 * `/environment/scoring` (needs `environment:manage`): the organisation's method for
 * deciding which aspects are significant. Each criterion has a name, a short
 * description and what each score means (shown to assessors in the aspect form, so
 * different people score the same way); technical keys are made by the system and
 * never shown. Saving re-scores every aspect; "Endringslogg" lists who changed the
 * method, when, and how many aspects were re-scored.
 */
@Component({
  selector: 'app-env-scoring-settings',
  imports: [
    TranslocoPipe,
    LocalDatePipe,
    LocalNumberPipe,
    AskAbout,
    WhyItMatters,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    EnvField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="environment.scoring.title"
        descriptionKey="environment.scoring.subtitle"
        [breadcrumbs]="crumbs"
        titleTestId="scoring-title"
      />
      <app-module-nav
        class="mb-4 block"
        [items]="perms.nav()"
        labelKey="modules.names.environment"
      />
      <app-help-strip scope="environment" page="scoring" lesson="significance" />

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="errorKey()" (retry)="reload()" />
        }
        @default {
          @if (draft(); as d) {
            <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
              <form
                class="flex max-w-[760px] min-w-0 flex-1 flex-col gap-5"
                (submit)="$event.preventDefault(); askSave()"
                novalidate
              >
                @if (isDefault()) {
                  <p
                    class="rounded-tile border border-info/30 bg-info-soft px-4 py-3 text-ui text-info-ink"
                    role="status"
                  >
                    {{ 'environment.scoring.defaultNotice' | transloco }}
                  </p>
                }

                <app-card>
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-card font-bold text-fg">
                      {{ 'environment.scoring.basics' | transloco }}
                    </h2>
                    <app-ask-about
                      [prompt]="'environment.ask.scoringMethod' | transloco"
                      field="method"
                      [fieldLabel]="'environment.scoring.method' | transloco"
                      [requirements]="['iso14001:6.1.2']"
                    />
                  </div>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <app-env-field
                      class="sm:col-span-2"
                      labelKey="environment.scoring.method"
                      inputId="cf-env-s-method"
                      page="scoring"
                      help="method"
                    >
                      <select
                        id="cf-env-s-method"
                        (change)="set('method', $any($event.target).value)"
                        data-testid="scoring-method"
                      >
                        @for (m of methods; track m) {
                          <option [value]="m" [selected]="d.method === m">
                            {{ 'environment.scoring.methods.' + m | transloco }}
                          </option>
                        }
                      </select>
                    </app-env-field>
                    <app-env-field
                      labelKey="environment.scoring.scaleMin"
                      inputId="cf-env-s-min"
                      [errorKey]="errors()['scale_min']"
                    >
                      <input
                        id="cf-env-s-min"
                        type="number"
                        min="0"
                        max="99"
                        [value]="d.scale_min"
                        (input)="set('scale_min', $any($event.target).value)"
                        [attr.aria-invalid]="!!errors()['scale_min']"
                      />
                    </app-env-field>
                    <app-env-field
                      labelKey="environment.scoring.scaleMax"
                      inputId="cf-env-s-max"
                      [errorKey]="errors()['scale_max']"
                    >
                      <input
                        id="cf-env-s-max"
                        type="number"
                        min="1"
                        max="100"
                        [value]="d.scale_max"
                        (input)="set('scale_max', $any($event.target).value)"
                        [attr.aria-invalid]="!!errors()['scale_max']"
                      />
                    </app-env-field>
                    <app-env-field
                      labelKey="environment.scoring.threshold"
                      inputId="cf-env-s-threshold"
                      page="scoring"
                      help="threshold"
                      [errorKey]="errors()['threshold']"
                    >
                      <input
                        id="cf-env-s-threshold"
                        type="text"
                        inputmode="decimal"
                        [value]="d.threshold"
                        (input)="set('threshold', $any($event.target).value)"
                        [attr.aria-invalid]="!!errors()['threshold']"
                        data-testid="scoring-threshold"
                      />
                    </app-env-field>
                    <div class="flex items-end">
                      @if (maxScore(); as max) {
                        <p class="pb-2 text-ui text-fg-muted" data-testid="scoring-max">
                          {{
                            'environment.scoring.maxScore'
                              | transloco: { max: (max | localNumber: '1.0-2') }
                          }}
                        </p>
                      }
                    </div>
                  </div>
                </app-card>

                <app-card>
                  <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="font-display text-card font-bold text-fg">
                      {{ 'environment.scoring.criteria' | transloco }}
                    </h2>
                    @if (d.criteria.length < maxCriteria) {
                      <app-button
                        size="sm"
                        variant="secondary"
                        (click)="addCriterion()"
                        data-testid="add-criterion"
                      >
                        <app-icon name="plus" [size]="14" />
                        {{ 'environment.scoring.addCriterion' | transloco }}
                      </app-button>
                    }
                  </div>
                  <p class="mb-4 text-ui text-fg-muted">
                    {{ 'environment.scoring.criteriaHint' | transloco }}
                  </p>
                  @if (errors()['criteria']; as key) {
                    <p class="mb-2 text-meta font-semibold text-fail" role="alert">
                      {{ key | transloco }}
                    </p>
                  }
                  <div class="flex flex-col gap-4">
                    @for (c of d.criteria; track $index; let i = $index) {
                      <fieldset
                        class="rounded-tile border border-border p-4"
                        [attr.data-testid]="'criterion-' + i"
                      >
                        <legend class="px-1 text-ui font-semibold text-fg">
                          {{ 'environment.scoring.criterionN' | transloco: { n: i + 1 } }}
                        </legend>
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <app-env-field
                            labelKey="environment.scoring.labelNb"
                            [inputId]="'cf-env-s-nb-' + i"
                            [required]="true"
                            [errorKey]="errors()['criteria.' + i + '.label']"
                          >
                            <input
                              [id]="'cf-env-s-nb-' + i"
                              type="text"
                              maxlength="64"
                              [value]="c.label.nb"
                              (input)="setText(i, 'label', 'nb', $any($event.target).value)"
                              [attr.aria-invalid]="!!errors()['criteria.' + i + '.label']"
                            />
                          </app-env-field>
                          <app-env-field
                            labelKey="environment.scoring.labelEn"
                            [inputId]="'cf-env-s-en-' + i"
                          >
                            <input
                              [id]="'cf-env-s-en-' + i"
                              type="text"
                              maxlength="64"
                              [value]="c.label.en"
                              (input)="setText(i, 'label', 'en', $any($event.target).value)"
                            />
                          </app-env-field>
                          <app-env-field
                            labelKey="environment.scoring.descriptionNb"
                            [inputId]="'cf-env-s-dnb-' + i"
                          >
                            <textarea
                              [id]="'cf-env-s-dnb-' + i"
                              rows="2"
                              maxlength="500"
                              [value]="c.description.nb"
                              (input)="setText(i, 'description', 'nb', $any($event.target).value)"
                            ></textarea>
                          </app-env-field>
                          <app-env-field
                            labelKey="environment.scoring.descriptionEn"
                            [inputId]="'cf-env-s-den-' + i"
                          >
                            <textarea
                              [id]="'cf-env-s-den-' + i"
                              rows="2"
                              maxlength="500"
                              [value]="c.description.en"
                              (input)="setText(i, 'description', 'en', $any($event.target).value)"
                            ></textarea>
                          </app-env-field>
                          <app-env-field
                            labelKey="environment.scoring.weight"
                            [inputId]="'cf-env-s-w-' + i"
                            page="scoring"
                            help="weight"
                            [errorKey]="errors()['criteria.' + i + '.weight']"
                          >
                            <input
                              [id]="'cf-env-s-w-' + i"
                              type="text"
                              inputmode="decimal"
                              [value]="c.weight"
                              [disabled]="d.method === 'product'"
                              (input)="setCriterion(i, { weight: $any($event.target).value })"
                              [attr.aria-invalid]="!!errors()['criteria.' + i + '.weight']"
                            />
                          </app-env-field>
                        </div>
                        <details class="mt-4" [open]="levelsMissing(c)">
                          <summary class="cursor-pointer text-ui font-semibold text-accent">
                            {{
                              'environment.scoring.levelsTitle'
                                | transloco: { min: d.scale_min, max: d.scale_max }
                            }}
                          </summary>
                          <p class="mt-1 mb-3 text-meta text-fg-muted">
                            {{ 'environment.scoring.levelsHint' | transloco }}
                          </p>
                          <div class="flex flex-col gap-2">
                            @for (v of scale(); track v) {
                              <div
                                class="grid grid-cols-[32px_1fr] items-start gap-2 sm:grid-cols-[32px_1fr_1fr]"
                              >
                                <span
                                  class="mt-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-ui font-semibold text-fg"
                                  >{{ v }}</span
                                >
                                <label
                                  class="sr-only"
                                  [attr.for]="'cf-env-s-l-' + i + '-' + v + '-nb'"
                                >
                                  {{ 'environment.scoring.levelLabelNb' | transloco: { n: v } }}
                                </label>
                                <input
                                  [id]="'cf-env-s-l-' + i + '-' + v + '-nb'"
                                  type="text"
                                  maxlength="200"
                                  class="cf-level"
                                  [placeholder]="
                                    'environment.scoring.levelPlaceholderNb' | transloco
                                  "
                                  [value]="c.levels[v]?.nb ?? ''"
                                  (input)="setLevel(i, v, 'nb', $any($event.target).value)"
                                />
                                <label
                                  class="sr-only"
                                  [attr.for]="'cf-env-s-l-' + i + '-' + v + '-en'"
                                >
                                  {{ 'environment.scoring.levelLabelEn' | transloco: { n: v } }}
                                </label>
                                <input
                                  [id]="'cf-env-s-l-' + i + '-' + v + '-en'"
                                  type="text"
                                  maxlength="200"
                                  class="cf-level col-start-2 sm:col-start-auto"
                                  [placeholder]="
                                    'environment.scoring.levelPlaceholderEn' | transloco
                                  "
                                  [value]="c.levels[v]?.en ?? ''"
                                  (input)="setLevel(i, v, 'en', $any($event.target).value)"
                                />
                              </div>
                            }
                          </div>
                        </details>
                        <div class="mt-3 flex justify-end">
                          <app-button
                            variant="ghost"
                            size="sm"
                            [disabled]="d.criteria.length <= 1"
                            (click)="removeCriterion(i)"
                          >
                            <app-icon name="trash" [size]="14" />
                            {{ 'environment.scoring.removeCriterion' | transloco: { n: i + 1 } }}
                          </app-button>
                        </div>
                      </fieldset>
                    }
                  </div>
                </app-card>

                <app-card>
                  <h2 class="mb-3 font-display text-card font-bold text-fg">
                    {{ 'environment.scoring.rules' | transloco }}
                  </h2>
                  <div class="flex flex-col gap-2">
                    <label class="flex items-start gap-2 text-body text-fg">
                      <input
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                        [checked]="d.legal_requirement_significant"
                        (change)="set('legal_requirement_significant', $any($event.target).checked)"
                      />
                      {{ 'environment.scoring.legalRule' | transloco }}
                    </label>
                    <label class="flex items-start gap-2 text-body text-fg">
                      <input
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                        [checked]="d.emergency_significant"
                        (change)="set('emergency_significant', $any($event.target).checked)"
                      />
                      {{ 'environment.scoring.emergencyRule' | transloco }}
                    </label>
                  </div>
                </app-card>

                <div
                  class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0"
                >
                  @if (hasErrors()) {
                    <p class="mr-auto text-meta font-semibold text-fail" role="alert">
                      {{ 'environment.form.fixErrors' | transloco: { count: errorCount() } }}
                    </p>
                  }
                  <app-button variant="secondary" (click)="reset()">
                    {{ 'environment.scoring.reset' | transloco }}
                  </app-button>
                  <app-button
                    type="submit"
                    [loading]="saving()"
                    [disabled]="saving() || hasErrors()"
                    data-testid="scoring-save"
                  >
                    {{ 'common.save' | transloco }}
                  </app-button>
                </div>
              </form>

              <aside class="flex w-full flex-col gap-4 lg:w-[300px] lg:flex-none">
                <app-card data-testid="scoring-history">
                  <h2 class="mb-2 font-display text-card font-bold text-fg">
                    {{ 'environment.scoring.history' | transloco }}
                  </h2>
                  @if (loaded(); as m) {
                    @if (m.updated_at) {
                      <p class="mb-3 text-meta text-fg-muted">
                        {{
                          'environment.scoring.lastChanged'
                            | transloco
                              : {
                                  date: (m.updated_at | localDate),
                                  name:
                                    m.updated_by_name || ('environment.common.unknown' | transloco),
                                }
                        }}
                      </p>
                    }
                    @if (m.history?.length) {
                      <ol class="flex flex-col gap-3">
                        @for (h of m.history; track $index) {
                          <li class="border-l-2 border-border pl-3 text-ui">
                            <span class="block font-semibold text-fg">{{ h.at | localDate }}</span>
                            <span class="block text-meta text-fg-muted">
                              {{ h.actor_name || ('environment.common.unknown' | transloco) }}
                            </span>
                            @if (h.threshold !== null) {
                              <span class="block text-meta text-fg-muted">
                                {{
                                  'environment.scoring.historyThreshold'
                                    | transloco: { value: (h.threshold | localNumber: '1.0-2') }
                                }}
                              </span>
                            }
                            @if (h.criteria.length) {
                              <span class="block text-meta text-fg-muted">
                                {{
                                  'environment.scoring.historyCriteria'
                                    | transloco: { names: h.criteria.join(', ') }
                                }}
                              </span>
                            }
                            @if (h.recomputed !== null) {
                              <span class="block text-meta text-fg-muted">
                                {{
                                  'environment.scoring.historyRecomputed'
                                    | transloco: { count: h.recomputed }
                                }}
                              </span>
                            }
                          </li>
                        }
                      </ol>
                    } @else {
                      <p class="text-ui text-fg-muted">
                        {{ 'environment.scoring.noHistory' | transloco }}
                      </p>
                    }
                  }
                </app-card>
                <app-why-it-matters scope="environment" page="scoring" />
              </aside>
            </div>
          }
        }
      }
    </div>

    <app-confirm-dialog
      [open]="confirming()"
      [title]="'environment.scoring.confirmTitle' | transloco"
      [message]="'environment.scoring.confirmMessage' | transloco"
      [confirmLabel]="'common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="saving()"
      (confirmed)="save()"
      (cancelled)="confirming.set(false)"
    />
  `,
  styles: [
    `
      .cf-level {
        width: 100%;
        min-height: 36px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        padding: 0 10px;
        outline: none;
      }
      .cf-level:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class ScoringSettings {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly perms = injectEnvPermissions();
  protected readonly crumbs = [ENV_ROOT_CRUMB, { labelKey: ENV_CRUMBS.scoring.labelKey }];
  protected readonly methods = SCORING_METHODS;
  protected readonly maxCriteria = MAX_CRITERIA;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('ui.error.body');
  protected readonly loaded = signal<ScoringMethod | null>(null);
  protected readonly draft = signal<ScoringDraft | null>(null);
  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  private readonly serverErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly isDefault = computed(() => !!this.loaded()?.is_default);
  protected readonly errors = computed(() => {
    const d = this.draft();
    const server = Object.fromEntries(
      Object.keys(this.serverErrors()).map((k) => [k, 'environment.scoring.errors.server']),
    );
    return { ...server, ...(d ? validateScoringDraft(d) : {}) };
  });
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);
  protected readonly hasErrors = computed(() => this.errorCount() > 0);
  protected readonly maxScore = computed(() => {
    const d = this.draft();
    return d ? draftMaxScore(d) : null;
  });
  protected readonly scale = computed(() => {
    const d = this.draft();
    return d ? draftScale(d) : [];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: ENV_MODULE,
      view: 'settings',
      title: this.language.translate('environment.scoring.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  /** Open the score descriptions while any value of the scale is undescribed. */
  protected levelsMissing(c: CriterionDraft): boolean {
    return this.scale().some((v) => !c.levels[String(v)]?.nb && !c.levels[String(v)]?.en);
  }

  protected set<K extends keyof ScoringDraft>(key: K, value: ScoringDraft[K]): void {
    this.serverErrors.set({});
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected setCriterion(index: number, patch: Partial<CriterionDraft>): void {
    const d = this.draft();
    if (d) {
      this.set(
        'criteria',
        d.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      );
    }
  }

  protected setText(
    index: number,
    field: 'label' | 'description',
    lang: 'en' | 'nb',
    value: string,
  ): void {
    const c = this.draft()?.criteria[index];
    if (c) {
      this.setCriterion(index, { [field]: { ...c[field], [lang]: value } });
    }
  }

  protected setLevel(index: number, level: number, lang: 'en' | 'nb', value: string): void {
    const c = this.draft()?.criteria[index];
    if (c) {
      const key = String(level);
      const current = c.levels[key] ?? { en: '', nb: '' };
      this.setCriterion(index, { levels: { ...c.levels, [key]: { ...current, [lang]: value } } });
    }
  }

  protected addCriterion(): void {
    const d = this.draft();
    if (d && d.criteria.length < MAX_CRITERIA) {
      this.set('criteria', [...d.criteria, emptyCriterion()]);
    }
  }

  protected removeCriterion(index: number): void {
    const d = this.draft();
    if (d && d.criteria.length > 1) {
      this.set(
        'criteria',
        d.criteria.filter((_, i) => i !== index),
      );
    }
  }

  protected reset(): void {
    const m = this.loaded();
    this.serverErrors.set({});
    this.draft.set(m ? draftFromMethod(m) : null);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  protected askSave(): void {
    if (!this.hasErrors()) {
      this.confirming.set(true);
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || this.saving() || this.hasErrors()) {
      return;
    }
    this.saving.set(true);
    this.api.updateScoring(orgId, toScoringIn(d)).subscribe({
      next: (m) => {
        this.saving.set(false);
        this.confirming.set(false);
        this.loaded.set(m);
        this.draft.set(draftFromMethod(m));
        this.notifications.success('environment.notices.scoringSaved', {
          count: m.recomputed ?? 0,
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.confirming.set(false);
        this.serverErrors.set(fieldErrors(error));
        this.notifications.error(environmentErrorKey(error));
      },
    });
  }

  private load(orgId: string | null): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.scoring(orgId).subscribe({
      next: (m) => {
        this.loaded.set(m);
        this.draft.set(draftFromMethod(m));
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(environmentErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
