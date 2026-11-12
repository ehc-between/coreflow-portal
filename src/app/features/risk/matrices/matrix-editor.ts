import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { bandLabel, levelLabel } from '../data/risk-display';
import { riskErrorKey } from '../data/risk-errors';
import {
  MATRIX_TEMPLATES,
  Matrix,
  MatrixBand,
  MatrixCreate,
  MatrixLevel,
  MatrixTemplate,
  MatrixTemplateKey,
  MatrixUpdate,
} from '../data/risk.models';
import { MatrixGrid } from '../shared/matrix-grid';
import { RiskPageGuide } from '../shared/risk-page-guide';
import { RiskPermissions } from '../shared/risk-permissions';

export interface MatrixDraft {
  readonly name: string;
  readonly description: string;
  readonly likelihood_levels: readonly MatrixLevel[];
  readonly consequence_levels: readonly MatrixLevel[];
  readonly bands: readonly MatrixBand[];
  readonly cells: Readonly<Record<string, string>>;
  readonly acceptable_max_score: string;
  readonly is_default: boolean;
}

const MIN_LEVELS = 2;
const MAX_LEVELS = 10;
const MAX_BANDS = 8;
const TABS: readonly RecordTab[] = ['details', 'activity', 'revisions'];

export const MATRIX_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'risk.matrices.name',
  description: 'risk.fields.description',
  likelihood_levels: 'risk.matrices.likelihoodLevels',
  consequence_levels: 'risk.matrices.consequenceLevels',
  bands: 'risk.matrices.bands',
  cells: 'risk.matrices.cells',
  acceptable_max_score: 'risk.matrices.appetite',
  is_default: 'risk.matrices.isDefault',
};

/** A band key from a label: lowercase snake_case starting with a letter (max 32). */
export function bandKey(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^[^a-z]+|_+$/g, '')
      .slice(0, 28) || 'band';
  let key = base;
  for (let i = 2; taken.includes(key); i++) {
    key = `${base}_${i}`;
  }
  return key;
}

/** Renumber levels 1..n in their current order. */
function renumber(levels: readonly MatrixLevel[]): MatrixLevel[] {
  return levels.map((l, i) => ({ ...l, value: i + 1 }));
}

export function matrixToDraft(m: Matrix): MatrixDraft {
  return {
    name: m.name,
    description: m.description ?? '',
    likelihood_levels: m.likelihood_levels,
    consequence_levels: m.consequence_levels,
    bands: m.bands,
    cells: m.cells,
    acceptable_max_score: m.acceptable_max_score !== null ? String(m.acceptable_max_score) : '',
    is_default: m.is_default,
  };
}

export function draftBody(d: MatrixDraft): MatrixCreate {
  const maxScore = d.likelihood_levels.length * d.consequence_levels.length;
  const cells: Record<string, string> = {};
  for (const [key, band] of Object.entries(d.cells)) {
    const [l, c] = key.split(':').map(Number);
    if (band && l <= d.likelihood_levels.length && c <= d.consequence_levels.length) {
      cells[key] = band;
    }
  }
  const clean = (levels: readonly MatrixLevel[]) =>
    levels.map((l) => ({
      value: l.value,
      label: l.label.trim(),
      ...(l.key ? { key: l.key } : {}),
      ...(l.description?.trim() ? { description: l.description.trim() } : {}),
    }));
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    likelihood_levels: clean(d.likelihood_levels),
    consequence_levels: clean(d.consequence_levels),
    bands: [...d.bands]
      .map((b) => ({ ...b, label: b.label.trim(), min_score: Math.min(maxScore, b.min_score) }))
      .sort((a, b) => a.min_score - b.min_score),
    cells,
    acceptable_max_score: d.acceptable_max_score === '' ? null : Number(d.acceptable_max_score),
    is_default: d.is_default,
  };
}

/**
 * Create (from a 5x5 / 4x4 / 3x3 template) or edit a risk matrix: level labels and
 * descriptions, score bands with colours, optional per-cell overrides and the risk
 * appetite (highest acceptable score), with a live preview. Changing bands
 * recalculates existing risks' levels; the number of levels can't change while
 * risks are rated on the matrix. Non-managers see it read-only.
 */
@Component({
  selector: 'app-matrix-editor',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    RecordDetailLayout,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    MatrixGrid,
    RiskPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #editor>
      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
        <app-risk-page-guide page="matrixEditor" lesson="risk-matrix" />
        <fieldset class="flex flex-col gap-5" [disabled]="!perms.canManage()">
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-form-field [label]="'risk.matrices.name' | transloco" inputId="matrix-name">
                <input
                  id="matrix-name"
                  required
                  maxlength="255"
                  [value]="draft().name"
                  (input)="patch({ name: $any($event.target).value })"
                />
              </app-form-field>
              @if (!id()) {
                <app-form-field
                  [label]="'risk.matrices.template' | transloco"
                  inputId="matrix-template"
                >
                  <select id="matrix-template" (change)="applyTemplate($any($event.target).value)">
                    @for (t of templateKeys; track t) {
                      <option [value]="t" [selected]="t === template()">
                        {{ 'risk.matrices.templates.' + t | transloco }}
                      </option>
                    }
                  </select>
                  <app-field-help scope="risk" page="matrixEditor" field="template" />
                </app-form-field>
              }
              <div class="sm:col-span-2">
                <app-form-field
                  [label]="'risk.fields.description' | transloco"
                  inputId="matrix-description"
                >
                  <textarea
                    id="matrix-description"
                    rows="2"
                    [value]="draft().description"
                    (input)="patch({ description: $any($event.target).value })"
                  ></textarea>
                </app-form-field>
              </div>
              <app-form-field
                [label]="'risk.matrices.appetite' | transloco"
                inputId="matrix-appetite"
              >
                <input
                  id="matrix-appetite"
                  type="number"
                  min="0"
                  [max]="maxScore()"
                  [value]="draft().acceptable_max_score"
                  (input)="patch({ acceptable_max_score: $any($event.target).value })"
                />
                <app-field-help scope="risk" page="matrixEditor" field="appetite" />
              </app-form-field>
              <label class="inline-flex items-center gap-2 self-end pb-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  [checked]="draft().is_default"
                  (change)="patch({ is_default: $any($event.target).checked })"
                />
                {{ 'risk.matrices.isDefault' | transloco }}
              </label>
            </div>
          </app-card>

          <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
            @for (axis of axes; track axis) {
              <app-card>
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h2 class="flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
                    {{ 'risk.matrices.' + axis | transloco }}
                    <app-field-help scope="risk" page="matrixEditor" [field]="axis" />
                  </h2>
                  @if (perms.canManage()) {
                    <app-button
                      size="sm"
                      variant="ghost"
                      [disabled]="levels(axis).length >= maxLevels"
                      (click)="addLevel(axis)"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'risk.matrices.addLevel' | transloco }}
                    </app-button>
                  }
                </div>
                <ol class="flex flex-col gap-2">
                  @for (level of levels(axis); track level.value; let i = $index) {
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-2.5 w-5 flex-none text-center text-[12.5px] font-semibold text-fg-muted"
                      >
                        {{ level.value }}
                      </span>
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <label class="sr-only" [for]="axis + '-label-' + i">
                          {{ 'risk.matrices.levelLabel' | transloco: { value: level.value } }}
                        </label>
                        <input
                          [id]="axis + '-label-' + i"
                          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-[13px] text-fg"
                          maxlength="64"
                          [value]="level.label"
                          (input)="setLevel(axis, i, { label: $any($event.target).value })"
                        />
                        <label class="sr-only" [for]="axis + '-desc-' + i">
                          {{ 'risk.matrices.levelDescription' | transloco: { value: level.value } }}
                        </label>
                        <input
                          [id]="axis + '-desc-' + i"
                          class="h-8 rounded-tile border border-border bg-bg px-2.5 text-[12.5px] text-fg-muted"
                          maxlength="500"
                          [placeholder]="'risk.matrices.descriptionPlaceholder' | transloco"
                          [value]="level.description ?? ''"
                          (input)="setLevel(axis, i, { description: $any($event.target).value })"
                        />
                      </div>
                      @if (perms.canManage()) {
                        <button
                          type="button"
                          class="mt-1.5 rounded-tile p-1.5 text-fg-subtle hover:text-fail disabled:opacity-40"
                          [disabled]="levels(axis).length <= minLevels"
                          [attr.aria-label]="
                            'risk.matrices.removeLevel' | transloco: { value: level.value }
                          "
                          (click)="removeLevel(axis, i)"
                        >
                          <app-icon name="x" [size]="14" />
                        </button>
                      }
                    </li>
                  }
                </ol>
              </app-card>
            }
          </div>

          <app-card>
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="flex items-center gap-1.5 font-display text-[16px] font-bold text-fg">
                {{ 'risk.matrices.bands' | transloco }}
                <app-field-help scope="risk" page="matrixEditor" field="bands" />
              </h2>
              @if (perms.canManage()) {
                <app-button
                  size="sm"
                  variant="ghost"
                  [disabled]="draft().bands.length >= maxBands"
                  (click)="addBand()"
                >
                  <app-icon name="plus" [size]="13" />
                  {{ 'risk.matrices.addBand' | transloco }}
                </app-button>
              }
            </div>
            <ul class="flex flex-col gap-2">
              @for (band of draft().bands; track $index; let i = $index) {
                <li class="grid grid-cols-[40px_minmax(0,1fr)_90px_32px] items-center gap-2">
                  <label class="sr-only" [for]="'band-color-' + i">{{
                    'risk.matrices.bandColor' | transloco
                  }}</label>
                  <input
                    [id]="'band-color-' + i"
                    type="color"
                    class="h-9 w-10 cursor-pointer rounded-tile border border-border bg-bg"
                    [value]="band.color"
                    (input)="setBand(i, { color: $any($event.target).value })"
                  />
                  <label class="sr-only" [for]="'band-label-' + i">{{
                    'risk.matrices.bandLabel' | transloco
                  }}</label>
                  <input
                    [id]="'band-label-' + i"
                    class="h-9 rounded-tile border border-border bg-bg px-2.5 text-[13px] text-fg"
                    maxlength="64"
                    [value]="band.label"
                    (input)="setBand(i, { label: $any($event.target).value })"
                  />
                  <label class="sr-only" [for]="'band-min-' + i">{{
                    'risk.matrices.bandMin' | transloco
                  }}</label>
                  <input
                    [id]="'band-min-' + i"
                    type="number"
                    min="1"
                    [max]="maxScore()"
                    class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                    [value]="band.min_score"
                    [attr.title]="'risk.matrices.bandMin' | transloco"
                    (input)="setBand(i, { min_score: +$any($event.target).value || 1 })"
                  />
                  @if (perms.canManage()) {
                    <button
                      type="button"
                      class="rounded-tile p-1.5 text-fg-subtle hover:text-fail disabled:opacity-40"
                      [disabled]="draft().bands.length <= 1"
                      [attr.aria-label]="
                        'risk.matrices.removeBand' | transloco: { label: band.label }
                      "
                      (click)="removeBand(i)"
                    >
                      <app-icon name="x" [size]="14" />
                    </button>
                  }
                </li>
              }
            </ul>
            <p class="mt-2 text-[12px] text-fg-subtle">
              {{ 'risk.matrices.bandHint' | transloco }}
            </p>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-[16px] font-bold text-fg">
                {{ 'risk.matrices.preview' | transloco }}
              </h2>
              <label class="inline-flex items-center gap-2 text-[13px] text-fg-muted">
                <input
                  type="checkbox"
                  [checked]="customCells()"
                  (change)="customCells.set($any($event.target).checked)"
                />
                {{ 'risk.matrices.customiseCells' | transloco }}
              </label>
            </div>
            <app-matrix-grid
              [matrix]="previewMatrix()"
              [showAppetite]="true"
              [ariaLabel]="'risk.matrices.preview' | transloco"
            />
            <p class="mt-1 text-[12px] text-fg-subtle">
              {{ 'risk.matrices.appetiteHint' | transloco }}
            </p>
            @if (customCells()) {
              <div class="mt-4 overflow-x-auto">
                <table class="text-[12px]">
                  <caption class="sr-only">
                    {{
                      'risk.matrices.cells' | transloco
                    }}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="px-1 text-left text-fg-muted">
                        {{ 'risk.matrices.lc' | transloco }}
                      </th>
                      @for (c of consequenceValues(); track c) {
                        <th scope="col" class="px-1 text-fg-muted">{{ c }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of likelihoodValuesDesc(); track l) {
                      <tr>
                        <th scope="row" class="px-1 text-fg-muted">{{ l }}</th>
                        @for (c of consequenceValues(); track c) {
                          <td class="p-0.5">
                            <label class="sr-only" [for]="'cell-' + l + '-' + c">
                              {{ 'risk.matrices.cellOverride' | transloco: { l: l, c: c } }}
                            </label>
                            <select
                              [id]="'cell-' + l + '-' + c"
                              class="h-8 w-[88px] rounded-tile border border-border bg-bg px-1 text-[12px] text-fg"
                              (change)="setCell(l, c, $any($event.target).value)"
                            >
                              <option value="" [selected]="!draft().cells[l + ':' + c]">
                                {{ 'risk.matrices.auto' | transloco }}
                              </option>
                              @for (b of bandOptions(); track b.key) {
                                <option
                                  [value]="b.key"
                                  [selected]="draft().cells[l + ':' + c] === b.key"
                                >
                                  {{ b.text }}
                                </option>
                              }
                            </select>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </app-card>

          @if (id()) {
            <app-card>
              <app-form-field
                [label]="'risk.fields.changeReason' | transloco"
                inputId="matrix-change-reason"
              >
                <input
                  id="matrix-change-reason"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-form-field>
              <p class="mt-2 text-[12.5px] text-fg-muted">
                {{ 'risk.matrices.recalcNote' | transloco }}
              </p>
            </app-card>
          }
        </fieldset>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco: errorParams() }}</app-alert>
        }
        @if (perms.canManage()) {
          <div class="flex flex-wrap justify-between gap-2">
            @if (id()) {
              <app-button variant="danger" size="sm" (click)="deleteOpen.set(true)">
                <app-icon name="trash" [size]="14" />
                {{ 'risk.common.delete' | transloco }}
              </app-button>
            } @else {
              <span></span>
            }
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="saving() || !draft().name.trim()"
            >
              {{ (id() ? 'risk.common.save' : 'risk.matrices.create') | transloco }}
            </app-button>
          </div>
        }
      </form>
    </ng-template>

    @if (state() === 'loading') {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'risk.common.loading' | transloco }}
      </p>
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-alert tone="error">{{ 'risk.common.loadFailed' | transloco }}</app-alert>
      </div>
    } @else if (id(); as matrixId) {
      <app-record-detail-layout
        entityType="risk_matrix"
        [entityId]="matrixId"
        [tabs]="tabs"
        [canEdit]="perms.canManage()"
        [includeAudit]="perms.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/risk/matrices"
        backLabelKey="risk.matrices.back"
      >
        <div header>
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ original()?.name }}
          </h1>
          <p class="mt-1 text-[12.5px] text-fg-muted">
            {{ 'risk.matrices.usedBy' | transloco: { count: original()?.register_count ?? 0 } }}
          </p>
        </div>
        <ng-container *ngTemplateOutlet="editor" />
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1000px] px-4 pt-6 pb-12 sm:px-8">
        <a
          routerLink="/risk/matrices"
          class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'risk.matrices.back' | transloco }}
        </a>
        <h1
          class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
        >
          {{ 'risk.matrices.newTitle' | transloco }}
        </h1>
        <ng-container *ngTemplateOutlet="editor" />
      </div>
    }

    <app-confirm-dialog
      [open]="deleteOpen()"
      [title]="'risk.matrices.deleteTitle' | transloco"
      [message]="'risk.matrices.deleteMessage' | transloco: { name: original()?.name ?? '' }"
      [confirmLabel]="'risk.common.delete' | transloco"
      [cancelLabel]="'risk.common.cancel' | transloco"
      (confirmed)="remove()"
      (cancelled)="deleteOpen.set(false)"
    />
  `,
})
export class MatrixEditorPage {
  private readonly api = inject(RiskApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(RiskPermissions);

  readonly id = input<string | undefined>(undefined);

  protected readonly tabs = TABS;
  protected readonly fieldLabels = MATRIX_FIELD_LABELS;
  protected readonly templateKeys = MATRIX_TEMPLATES;
  protected readonly axes = ['likelihoodLevels', 'consequenceLevels'] as const;
  protected readonly minLevels = MIN_LEVELS;
  protected readonly maxLevels = MAX_LEVELS;
  protected readonly maxBands = MAX_BANDS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly original = signal<Matrix | null>(null);
  private readonly templates = signal<readonly MatrixTemplate[]>([]);
  protected readonly template = signal<MatrixTemplateKey>('5x5');
  protected readonly draft = signal<MatrixDraft>({
    name: '',
    description: '',
    likelihood_levels: [],
    consequence_levels: [],
    bands: [],
    cells: {},
    acceptable_max_score: '',
    is_default: false,
  });
  protected readonly customCells = signal(false);
  protected readonly changeReason = signal('');
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly errorParams = signal<Record<string, unknown>>({});
  protected readonly deleteOpen = signal(false);
  private sub: Subscription | null = null;

  private t = (key: string, params?: Record<string, unknown>) =>
    this.language.translate(key, params);

  protected readonly maxScore = computed(
    () => this.draft().likelihood_levels.length * this.draft().consequence_levels.length,
  );

  protected readonly previewMatrix = computed(() => {
    const body = draftBody(this.draft());
    return {
      likelihood_levels: body.likelihood_levels ?? [],
      consequence_levels: body.consequence_levels ?? [],
      bands: body.bands ?? [],
      cells: body.cells ?? {},
      acceptable_max_score: body.acceptable_max_score ?? null,
    };
  });

  protected readonly bandOptions = computed(() =>
    this.draft().bands.map((b) => ({ key: b.key, text: bandLabel(b, this.t) })),
  );
  protected readonly consequenceValues = computed(() =>
    this.draft().consequence_levels.map((l) => l.value),
  );
  protected readonly likelihoodValuesDesc = computed(() =>
    this.draft()
      .likelihood_levels.map((l) => l.value)
      .reverse(),
  );

  constructor() {
    providePageContext(() => ({
      module: 'risk',
      entityType: 'risk_matrix',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.original()?.name ?? this.language.translate('risk.matrices.newTitle'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, id: string | undefined): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.sub = forkJoin({
      templates: id ? of({ items: [] as MatrixTemplate[] }) : this.api.matrixTemplates(orgId),
      matrix: id ? this.api.getMatrix(orgId, id) : of(null),
    }).subscribe({
      next: ({ templates, matrix }) => {
        this.templates.set(templates.items);
        this.original.set(matrix);
        if (matrix) {
          this.draft.set(matrixToDraft(matrix));
          this.customCells.set(Object.keys(matrix.cells).length > 0);
        } else {
          this.applyTemplate('5x5');
        }
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected applyTemplate(key: string): void {
    const template = this.templates().find((t) => t.key === key);
    if (!template) {
      return;
    }
    this.template.set(template.key);
    // Template labels are English defaults; store them in the user's language.
    const localise = (levels: readonly MatrixLevel[]) =>
      levels.map((l) => ({ ...l, label: levelLabel(l, this.t) }));
    this.draft.update((d) => ({
      ...d,
      name: d.name || this.t('risk.matrices.templateName', { size: template.key }),
      likelihood_levels: localise(template.likelihood_levels),
      consequence_levels: localise(template.consequence_levels),
      bands: template.bands.map((b) => ({ ...b, label: bandLabel(b, this.t) })),
      cells: {},
      acceptable_max_score:
        template.acceptable_max_score !== null ? String(template.acceptable_max_score) : '',
    }));
  }

  protected patch(change: Partial<MatrixDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected levels(axis: 'likelihoodLevels' | 'consequenceLevels'): readonly MatrixLevel[] {
    return axis === 'likelihoodLevels'
      ? this.draft().likelihood_levels
      : this.draft().consequence_levels;
  }

  private setLevels(axis: 'likelihoodLevels' | 'consequenceLevels', levels: MatrixLevel[]): void {
    this.patch(
      axis === 'likelihoodLevels' ? { likelihood_levels: levels } : { consequence_levels: levels },
    );
  }

  protected setLevel(
    axis: 'likelihoodLevels' | 'consequenceLevels',
    index: number,
    change: Partial<MatrixLevel>,
  ): void {
    // A renamed template level is the org's own label now; keep the key for history.
    this.setLevels(
      axis,
      this.levels(axis).map((l, i) => (i === index ? { ...l, ...change } : l)),
    );
  }

  protected addLevel(axis: 'likelihoodLevels' | 'consequenceLevels'): void {
    const levels = this.levels(axis);
    if (levels.length >= MAX_LEVELS) {
      return;
    }
    this.setLevels(
      axis,
      renumber([...levels, { value: levels.length + 1, label: String(levels.length + 1) }]),
    );
  }

  protected removeLevel(axis: 'likelihoodLevels' | 'consequenceLevels', index: number): void {
    const levels = this.levels(axis);
    if (levels.length <= MIN_LEVELS) {
      return;
    }
    this.setLevels(axis, renumber(levels.filter((_, i) => i !== index)));
  }

  protected setBand(index: number, change: Partial<MatrixBand>): void {
    this.patch({
      bands: this.draft().bands.map((b, i) => (i === index ? { ...b, ...change } : b)),
    });
  }

  protected addBand(): void {
    const bands = this.draft().bands;
    if (bands.length >= MAX_BANDS) {
      return;
    }
    const label = this.t('risk.matrices.newBand');
    const top = bands.reduce((max, b) => Math.max(max, b.min_score), 1);
    this.patch({
      bands: [
        ...bands,
        {
          key: bandKey(
            label,
            bands.map((b) => b.key),
          ),
          label,
          min_score: Math.min(this.maxScore(), top + 1),
          color: '#7c3aed',
        },
      ],
    });
  }

  protected removeBand(index: number): void {
    const bands = this.draft().bands;
    if (bands.length <= 1) {
      return;
    }
    const removed = bands[index].key;
    const cells = Object.fromEntries(
      Object.entries(this.draft().cells).filter(([, key]) => key !== removed),
    );
    this.patch({ bands: bands.filter((_, i) => i !== index), cells });
  }

  protected setCell(l: number, c: number, band: string): void {
    const cells = { ...this.draft().cells };
    if (band) {
      cells[`${l}:${c}`] = band;
    } else {
      delete cells[`${l}:${c}`];
    }
    this.patch({ cells });
  }

  protected save(): void {
    const orgId = this.perms.orgId();
    const draft = this.draft();
    if (!orgId || !draft.name.trim()) {
      return;
    }
    const body = draftBody(customCellsOrNone(draft, this.customCells()));
    const id = this.id();
    this.saving.set(true);
    this.errorKey.set(null);
    const request = id
      ? this.api.updateMatrix(orgId, id, this.changedFields(body))
      : this.api.createMatrix(orgId, body);
    request.subscribe({
      next: (matrix) => {
        this.saving.set(false);
        this.toasts.success('risk.notices.matrixSaved', { name: matrix.name });
        if (id) {
          this.original.set(matrix);
          this.draft.set(matrixToDraft(matrix));
          this.changeReason.set('');
        } else {
          void this.router.navigate(['/risk/matrices', matrix.id]);
        }
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.errorKey.set(riskErrorKey(e));
      },
    });
  }

  private changedFields(body: MatrixCreate): MatrixUpdate {
    const original = this.original();
    const before: Record<string, unknown> = original
      ? { ...draftBody(matrixToDraft(original)) }
      : {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
        out[key] = value;
      }
    }
    if (this.changeReason().trim()) {
      out['change_reason'] = this.changeReason().trim();
    }
    return out as MatrixUpdate;
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    const id = this.id();
    this.deleteOpen.set(false);
    if (!orgId || !id) {
      return;
    }
    this.api.deleteMatrix(orgId, id).subscribe({
      next: () => {
        this.toasts.success('risk.notices.matrixDeleted');
        void this.router.navigate(['/risk/matrices']);
      },
      error: (e: unknown) => this.errorKey.set(riskErrorKey(e)),
    });
  }
}

/** Cell overrides are only sent while "customise cells" is on. */
function customCellsOrNone(draft: MatrixDraft, custom: boolean): MatrixDraft {
  return custom ? draft : { ...draft, cells: {} };
}
