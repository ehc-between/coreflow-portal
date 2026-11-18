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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { RiskApi } from '../data/risk-api';
import { TranslateFn, bandLabel, levelLabel } from '../data/risk-display';
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
import { Badge } from '../../../shared/ui/badge/badge';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../../shared/ui/overflow-menu/overflow-menu';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { RiskPermissions } from '../shared/risk-permissions';
import { RiskField } from '../shared/risk-field';

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
type Axis = 'likelihoodLevels' | 'consequenceLevels';

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

/**
 * The editable copy of a matrix. With `t`, labels that are still the template's
 * English defaults are shown in the user's language, exactly as every grid shows
 * them, so what the editor shows is what gets saved.
 */
export function matrixToDraft(m: Matrix, t?: TranslateFn): MatrixDraft {
  const levels = (list: readonly MatrixLevel[]) =>
    t ? list.map((l) => ({ ...l, label: levelLabel(l, t) })) : list;
  return {
    name: m.name,
    description: m.description ?? '',
    likelihood_levels: levels(m.likelihood_levels),
    consequence_levels: levels(m.consequence_levels),
    bands: t ? m.bands.map((b) => ({ ...b, label: bandLabel(b, t) })) : m.bands,
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
    RiskField,
    NgTemplateOutlet,
    TranslocoPipe,
    FieldHelp,
    RecordDetailLayout,
    Alert,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    MatrixGrid,
    Badge,
    ErrorState,
    HelpStrip,
    LoadingState,
    MenuItem,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #editor>
      <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
        <fieldset class="flex flex-col gap-5" [disabled]="!perms.canManage()">
          <app-card>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <app-risk-field inputId="matrix-name" labelKey="risk.matrices.name">
                <input
                  id="matrix-name"
                  required
                  maxlength="255"
                  [value]="draft().name"
                  (input)="patch({ name: $any($event.target).value })"
                />
              </app-risk-field>
              @if (!id()) {
                <app-risk-field
                  inputId="matrix-template"
                  labelKey="risk.matrices.template"
                  helpPage="matrixEditor"
                  helpField="template"
                >
                  <select id="matrix-template" (change)="applyTemplate($any($event.target).value)">
                    @for (t of templateKeys; track t) {
                      <option [value]="t" [selected]="t === template()">
                        {{ 'risk.matrices.templates.' + t | transloco }}
                      </option>
                    }
                  </select>
                </app-risk-field>
              }
              <div class="sm:col-span-2">
                <app-risk-field inputId="matrix-description" labelKey="risk.fields.description">
                  <textarea
                    id="matrix-description"
                    rows="2"
                    [value]="draft().description"
                    (input)="patch({ description: $any($event.target).value })"
                  ></textarea>
                </app-risk-field>
              </div>
              <app-risk-field
                inputId="matrix-appetite"
                labelKey="risk.matrices.appetite"
                helpPage="matrixEditor"
                helpField="appetite"
              >
                <input
                  id="matrix-appetite"
                  type="number"
                  min="0"
                  [max]="maxScore()"
                  [value]="draft().acceptable_max_score"
                  (input)="patch({ acceptable_max_score: $any($event.target).value })"
                />
              </app-risk-field>
              <label class="inline-flex items-center gap-2 self-end pb-2 text-ui text-fg">
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
                  <h2 class="flex items-center gap-1.5 font-display text-section font-bold text-fg">
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
                @if (missingDescriptions(axis); as missing) {
                  <div
                    class="mb-3 flex flex-wrap items-center gap-2 rounded-tile bg-warn-soft px-3 py-2 text-meta text-warn-ink"
                    [attr.data-testid]="'matrix-missing-' + axis"
                  >
                    <span class="min-w-0 flex-1">{{
                      'risk.matrices.missingDescriptions' | transloco: { count: missing }
                    }}</span>
                    @if (perms.canManage() && suggestionFor(axis)) {
                      <button
                        type="button"
                        class="font-semibold underline-offset-2 hover:underline"
                        (click)="fillDescriptions(axis)"
                      >
                        {{ 'risk.matrices.fillDescriptions' | transloco }}
                      </button>
                    }
                  </div>
                }
                <ol class="flex flex-col gap-2">
                  @for (level of levels(axis); track level.value; let i = $index) {
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-2.5 w-5 flex-none text-center text-meta font-semibold text-fg-muted"
                      >
                        {{ level.value }}
                      </span>
                      <div class="flex min-w-0 flex-1 flex-col gap-1">
                        <label class="sr-only" [for]="axis + '-label-' + i">
                          {{ 'risk.matrices.levelLabel' | transloco: { value: level.value } }}
                        </label>
                        <input
                          [id]="axis + '-label-' + i"
                          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
                          maxlength="64"
                          [value]="level.label"
                          (input)="setLevel(axis, i, { label: $any($event.target).value })"
                        />
                        <label class="sr-only" [for]="axis + '-desc-' + i">
                          {{ 'risk.matrices.levelDescription' | transloco: { value: level.value } }}
                        </label>
                        <input
                          [id]="axis + '-desc-' + i"
                          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-meta text-fg"
                          maxlength="500"
                          [placeholder]="descriptionPlaceholder(axis, i)"
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
              <h2 class="flex items-center gap-1.5 font-display text-section font-bold text-fg">
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
                    class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
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
                    class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
            <p class="mt-2 text-meta text-fg-subtle">
              {{ 'risk.matrices.bandHint' | transloco }}
            </p>
          </app-card>

          <app-card>
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-section font-bold text-fg">
                {{ 'risk.matrices.preview' | transloco }}
              </h2>
              <label class="inline-flex items-center gap-2 text-ui text-fg-muted">
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
            <p class="mt-1 text-meta text-fg-subtle">
              {{ 'risk.matrices.appetiteHint' | transloco }}
            </p>
            @if (customCells()) {
              <div class="mt-4 overflow-x-auto">
                <table class="text-meta">
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
                              class="h-8 w-[88px] rounded-tile border border-border bg-bg px-1 text-meta text-fg"
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
              <app-risk-field inputId="matrix-change-reason" labelKey="risk.fields.changeReason">
                <input
                  id="matrix-change-reason"
                  maxlength="2000"
                  [value]="changeReason()"
                  (input)="changeReason.set($any($event.target).value)"
                />
              </app-risk-field>
              <p class="mt-2 text-meta text-fg-muted">
                {{ 'risk.matrices.recalcNote' | transloco }}
              </p>
            </app-card>
          }
        </fieldset>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco: errorParams() }}</app-alert>
        }
        @if (perms.canManage()) {
          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="ghost" (click)="cancel()">{{
              'risk.common.cancel' | transloco
            }}</app-button>
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
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-loading-state [rows]="6" />
      </div>
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-error-state (retry)="reload()" />
      </div>
    } @else if (id(); as matrixId) {
      <app-record-detail-layout
        entityType="risk_matrix"
        [entityId]="matrixId"
        [title]="original()?.name"
        [breadcrumbs]="[
          { labelKey: 'nav.settings', link: '/settings' },
          { labelKey: 'modules.names.risk' },
          { labelKey: 'risk.matrices.title', link: '/settings/modules/risk/matrices' },
          { label: original()?.name ?? '' },
        ]"
        [tabs]="tabs"
        [createFlows]="false"
        [canEdit]="perms.canManage()"
        [includeAudit]="perms.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/settings/modules/risk/matrices"
        backLabelKey="risk.matrices.back"
      >
        <ng-container ngProjectAs="[meta]">
          <span>{{
            'risk.matrices.usedBy' | transloco: { count: original()?.register_count ?? 0 }
          }}</span>
          @if (original()?.is_default) {
            <app-badge tone="accent">{{ 'risk.matrices.default' | transloco }}</app-badge>
          }
        </ng-container>
        @if (perms.canManage()) {
          <button appMenuItem overflow [danger]="true" (click)="deleteOpen.set(true)">
            {{ 'risk.common.delete' | transloco }}
          </button>
        }
        <ng-container *ngTemplateOutlet="editor" />
        <app-help-strip aside-learn scope="risk" page="matrixEditor" lesson="risk-matrix" />
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1000px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
        <app-page-header
          titleKey="risk.matrices.newTitle"
          [breadcrumbs]="[
            { labelKey: 'nav.settings', link: '/settings' },
            { labelKey: 'modules.names.risk' },
            { labelKey: 'risk.matrices.title', link: '/settings/modules/risk/matrices' },
            { labelKey: 'risk.matrices.newTitle' },
          ]"
        />
        <app-help-strip scope="risk" page="matrixEditor" lesson="risk-matrix" />
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
      templates: this.api
        .matrixTemplates(orgId, this.language.active())
        .pipe(catchError(() => of({ items: [] as MatrixTemplate[] }))),
      matrix: id ? this.api.getMatrix(orgId, id) : of(null),
    }).subscribe({
      next: ({ templates, matrix }) => {
        this.templates.set(templates.items);
        this.original.set(matrix);
        if (matrix) {
          this.draft.set(matrixToDraft(matrix, this.t));
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

  protected reload(): void {
    this.load(this.perms.orgId(), this.id());
  }

  protected cancel(): void {
    void this.router.navigate(['/settings/modules/risk/matrices']);
  }

  /** The template with as many levels on this axis (for example descriptions). */
  protected suggestionFor(axis: Axis): readonly MatrixLevel[] | null {
    const count = this.levels(axis).length;
    for (const tpl of this.templates()) {
      const list = axis === 'likelihoodLevels' ? tpl.likelihood_levels : tpl.consequence_levels;
      if (list.length === count && list.some((l) => !!l.description)) {
        return list;
      }
    }
    return null;
  }

  /** Levels without "what it means in practice": an undefined risk criterion. */
  protected missingDescriptions(axis: Axis): number {
    return this.levels(axis).filter((l) => !l.description?.trim()).length;
  }

  protected descriptionPlaceholder(axis: Axis, index: number): string {
    const example = this.suggestionFor(axis)?.[index]?.description;
    return example
      ? this.t('risk.matrices.descriptionExample', { example })
      : this.t('risk.matrices.descriptionPlaceholder');
  }

  /** Fill the empty level descriptions with the template's examples. */
  protected fillDescriptions(axis: Axis): void {
    const suggestion = this.suggestionFor(axis);
    if (!suggestion) {
      return;
    }
    this.setLevels(
      axis,
      this.levels(axis).map((l, i) =>
        l.description?.trim() ? l : { ...l, description: suggestion[i]?.description ?? '' },
      ),
    );
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
      : this.api.createMatrix(orgId, {
          ...body,
          lang: this.language.active() === 'nb' ? 'nb' : 'en',
        });
    request.subscribe({
      next: (matrix) => {
        this.saving.set(false);
        this.toasts.success('risk.notices.matrixSaved', { name: matrix.name });
        if (id) {
          this.original.set(matrix);
          this.draft.set(matrixToDraft(matrix, this.t));
          this.changeReason.set('');
        } else {
          void this.router.navigate(['/settings/modules/risk/matrices', matrix.id]);
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
      ? { ...draftBody(matrixToDraft(original, this.t)) }
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
        void this.router.navigate(['/settings/modules/risk/matrices']);
      },
      error: (e: unknown) => this.errorKey.set(riskErrorKey(e)),
    });
  }
}

/** Cell overrides are only sent while "customise cells" is on. */
function customCellsOrNone(draft: MatrixDraft, custom: boolean): MatrixDraft {
  return custom ? draft : { ...draft, cells: {} };
}
