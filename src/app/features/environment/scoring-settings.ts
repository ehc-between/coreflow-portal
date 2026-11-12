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
import { FieldHelp } from '../../shared/guidance/field-help';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { LocalNumberPipe } from '../../shared/locale/locale-pipes';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { EnvironmentApi } from './data/environment-api';
import {
  SCORING_METHODS,
  ScoringMethod,
  ScoringMethodIn,
  ScoringMethodKind,
} from './data/environment.models';
import { environmentErrorKey, fieldErrors } from './data/environment-errors';
import { parseDecimal } from './data/form-models';
import { EnvironmentTabs } from './environment-tabs';
import { EnvLessonLink } from './lesson-link';

export const MAX_CRITERIA = 10;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export interface CriterionDraft {
  readonly key: string;
  readonly en: string;
  readonly nb: string;
  readonly weight: string;
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

export function draftFromMethod(m: ScoringMethod): ScoringDraft {
  return {
    method: m.method,
    criteria: m.criteria.map((c) => ({
      key: c.key,
      en: c.label['en'] ?? '',
      nb: c.label['nb'] ?? '',
      weight: String(c.weight),
    })),
    scale_min: String(m.scale_min),
    scale_max: String(m.scale_max),
    threshold: String(m.threshold),
    legal_requirement_significant: m.legal_requirement_significant,
    emergency_significant: m.emergency_significant,
  };
}

/** A key from a label: lower case ascii, words joined with `_` (max 32 chars). */
export function keyFromLabel(label: string): string {
  const key = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 32);
  return key;
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
    if (!KEY_PATTERN.test(c.key) || seen.has(c.key)) {
      errors[`criteria.${i}.key`] = 'environment.scoring.errors.key';
    }
    seen.add(c.key);
    if (!c.en.trim() && !c.nb.trim()) {
      errors[`criteria.${i}.label`] = 'environment.scoring.errors.label';
    }
    const w = parseDecimal(c.weight);
    if (!Number.isFinite(w) || w <= 0 || w > 10) {
      errors[`criteria.${i}.weight`] = 'environment.scoring.errors.weight';
    }
  });
  return errors;
}

export function toScoringIn(d: ScoringDraft): ScoringMethodIn {
  return {
    method: d.method,
    criteria: d.criteria.map((c) => {
      const label: Record<string, string> = {};
      if (c.en.trim()) {
        label['en'] = c.en.trim();
      }
      if (c.nb.trim()) {
        label['nb'] = c.nb.trim();
      }
      return { key: c.key, label, weight: parseDecimal(c.weight) };
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
 * `/environment/scoring` (needs `environment:manage`): the organisation's
 * significance scoring method for aspects. Saving re-scores every aspect, and
 * each change in score or significance is recorded in the aspect's history.
 */
@Component({
  selector: 'app-env-scoring-settings',
  imports: [
    TranslocoPipe,
    LocalNumberPipe,
    AskAbout,
    FieldHelp,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    EnvironmentTabs,
    EnvLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-environment-tabs />
    <div class="mx-auto max-w-[960px] px-4 pt-5 pb-12 sm:px-8">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1
            class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            data-testid="scoring-title"
          >
            {{ 'environment.scoring.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'environment.scoring.subtitle' | transloco }}
          </p>
        </div>
        <app-ask-about [prompt]="'environment.ask.scoringMethod' | transloco" />
      </div>
      <div class="mb-5"><app-guide-intro scope="environment" page="scoring" /></div>

      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'environment.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (draft(); as d) {
            @if (isDefault()) {
              <div class="mb-4">
                <app-alert tone="info">{{
                  'environment.scoring.defaultNotice' | transloco
                }}</app-alert>
              </div>
            }
            <form
              class="flex flex-col gap-5"
              (submit)="$event.preventDefault(); askSave()"
              novalidate
            >
              <app-card>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'environment.scoring.method' | transloco"
                      inputId="cf-env-s-method"
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
                    </app-form-field>
                    <app-field-help scope="environment" page="scoring" field="method" />
                  </div>
                  <div>
                    <app-form-field
                      [label]="'environment.scoring.scaleMin' | transloco"
                      inputId="cf-env-s-min"
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
                    </app-form-field>
                    @if (errors()['scale_min']; as key) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                    }
                  </div>
                  <div>
                    <app-form-field
                      [label]="'environment.scoring.scaleMax' | transloco"
                      inputId="cf-env-s-max"
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
                    </app-form-field>
                    @if (errors()['scale_max']; as key) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                    }
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'environment.scoring.threshold' | transloco"
                      inputId="cf-env-s-threshold"
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
                    </app-form-field>
                    @if (errors()['threshold']; as key) {
                      <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                    }
                    <app-field-help scope="environment" page="scoring" field="threshold" />
                  </div>
                  <div class="flex items-end sm:col-span-2">
                    @if (maxScore(); as max) {
                      <p class="text-[13px] text-fg-muted" data-testid="scoring-max">
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
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="font-display text-[16px] font-bold text-fg">
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
                @if (errors()['criteria']; as key) {
                  <p class="mb-2 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                }
                @for (c of d.criteria; track $index; let i = $index) {
                  <fieldset
                    class="mb-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_100px_auto] sm:items-start"
                  >
                    <legend class="sr-only">
                      {{ 'environment.scoring.criterionN' | transloco: { n: i + 1 } }}
                    </legend>
                    <div>
                      <app-form-field
                        [label]="'environment.scoring.labelEn' | transloco"
                        [inputId]="'cf-env-s-en-' + i"
                      >
                        <input
                          [id]="'cf-env-s-en-' + i"
                          type="text"
                          maxlength="64"
                          [value]="c.en"
                          (input)="setLabel(i, 'en', $any($event.target).value)"
                          [attr.aria-invalid]="!!errors()['criteria.' + i + '.label']"
                        />
                      </app-form-field>
                      @if (errors()['criteria.' + i + '.label']; as key) {
                        <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                      }
                    </div>
                    <app-form-field
                      [label]="'environment.scoring.labelNb' | transloco"
                      [inputId]="'cf-env-s-nb-' + i"
                    >
                      <input
                        [id]="'cf-env-s-nb-' + i"
                        type="text"
                        maxlength="64"
                        [value]="c.nb"
                        (input)="setLabel(i, 'nb', $any($event.target).value)"
                      />
                    </app-form-field>
                    <div>
                      <app-form-field
                        [label]="'environment.scoring.key' | transloco"
                        [inputId]="'cf-env-s-key-' + i"
                      >
                        <input
                          [id]="'cf-env-s-key-' + i"
                          type="text"
                          maxlength="32"
                          [value]="c.key"
                          (input)="setCriterion(i, { key: $any($event.target).value })"
                          [attr.aria-invalid]="!!errors()['criteria.' + i + '.key']"
                          class="font-mono"
                        />
                      </app-form-field>
                      @if (errors()['criteria.' + i + '.key']; as key) {
                        <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                      }
                    </div>
                    <div>
                      <app-form-field
                        [label]="'environment.scoring.weight' | transloco"
                        [inputId]="'cf-env-s-w-' + i"
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
                      </app-form-field>
                      @if (errors()['criteria.' + i + '.weight']; as key) {
                        <p class="mt-1 text-[12px] text-fail" role="alert">{{ key | transloco }}</p>
                      }
                    </div>
                    <div class="sm:pt-6">
                      <app-button
                        variant="ghost"
                        size="sm"
                        [disabled]="d.criteria.length <= 1"
                        [attr.aria-label]="
                          'environment.scoring.removeCriterion' | transloco: { n: i + 1 }
                        "
                        (click)="removeCriterion(i)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </app-button>
                    </div>
                  </fieldset>
                }
                <app-field-help scope="environment" page="scoring" field="criteria" />
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-[16px] font-bold text-fg">
                  {{ 'environment.scoring.rules' | transloco }}
                </h2>
                <div class="flex flex-col gap-2">
                  <label class="flex items-center gap-2 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="d.legal_requirement_significant"
                      (change)="set('legal_requirement_significant', $any($event.target).checked)"
                    />
                    {{ 'environment.scoring.legalRule' | transloco }}
                  </label>
                  <label class="flex items-center gap-2 text-[13.5px] text-fg">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-[var(--accent)]"
                      [checked]="d.emergency_significant"
                      (change)="set('emergency_significant', $any($event.target).checked)"
                    />
                    {{ 'environment.scoring.emergencyRule' | transloco }}
                  </label>
                </div>
              </app-card>

              <div class="flex flex-wrap justify-end gap-2">
                <app-button variant="ghost" (click)="reset()">
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
          }
        }
      }

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="environment" page="scoring" />
        <app-env-lesson-link lesson="significance" />
      </div>
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
})
export class ScoringSettings {
  private readonly api = inject(EnvironmentApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly methods = SCORING_METHODS;
  protected readonly maxCriteria = MAX_CRITERIA;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('environment.common.loadFailed');
  private readonly loaded = signal<ScoringMethod | null>(null);
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
  protected readonly hasErrors = computed(() => Object.keys(this.errors()).length > 0);
  protected readonly maxScore = computed(() => {
    const d = this.draft();
    return d ? draftMaxScore(d) : null;
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'environment',
      view: 'settings',
      title: this.language.translate('environment.scoring.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
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

  /** Editing the English label of a new criterion also fills in its key. */
  protected setLabel(index: number, lang: 'en' | 'nb', value: string): void {
    const c = this.draft()?.criteria[index];
    if (!c) {
      return;
    }
    const isNew = !this.loaded()?.criteria.some((x) => x.key === c.key);
    const patch: Partial<CriterionDraft> = { [lang]: value };
    if (isNew && lang === 'en' && (c.key === '' || c.key === keyFromLabel(c.en))) {
      Object.assign(patch, { key: keyFromLabel(value) });
    }
    this.setCriterion(index, patch);
  }

  protected addCriterion(): void {
    const d = this.draft();
    if (d && d.criteria.length < MAX_CRITERIA) {
      this.set('criteria', [...d.criteria, { key: '', en: '', nb: '', weight: '1' }]);
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
