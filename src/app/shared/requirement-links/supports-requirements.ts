import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, Subscription, catchError, forkJoin, map, of, timer } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import {
  LinkEntityType,
  RequirementLabel,
  RequirementLink,
  RequirementSuggestion,
} from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';
import { RequirementCatalogueSearch, RequirementPick } from './requirement-catalogue-search';
import { RequirementChip } from './requirement-chip';
import { RequirementCoverageService } from './requirement-coverage.service';
import {
  compareNumbers,
  fallbackLabel,
  fixedShortName,
  frameworkOf,
  groupByStandard,
  positionText,
  shortNameKey,
} from './requirement-label';

/** A CAPA action whose links are shown under the deviation (structurally an `Action`). */
export interface LinkedAction {
  readonly id: string;
  readonly description: string;
}

/** One row of the panel: a stored link or a virtual suggestion. */
export interface PanelRow {
  /** Stable key: the link id, or `ref:<requirement ref>` for a virtual suggestion. */
  readonly key: string;
  readonly ref: string;
  readonly label: RequirementLabel;
  readonly status: 'confirmed' | 'suggested';
  readonly origin: string;
  readonly originField: string | null;
  /** The stored link, or null for a virtual suggestion. */
  readonly linkId: string | null;
  readonly entityId: string;
  readonly confidence: number | null;
  readonly rationale: string | null;
}

interface ActionGroup {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly ClauseRow[];
}

/** Confirmed rows shown before "Vis alle". */
export const CONFIRMED_PREVIEW = 8;
/** Wait after the links load before asking for suggestions (debounce per record visit). */
export const SUGGEST_DELAY_MS = 400;
/** Poll interval of an AI `record_map` job. */
const JOB_POLL_MS = 2000;

/** Field names with their own label (`standards.reqs.fields.<name>`); others use a generic one. */
const KNOWN_FIELDS = new Set([
  'clauses',
  'clause_ref',
  'clause_refs',
  'control_refs',
  'soa',
  'standards',
  'frameworks',
  'framework',
  'article_refs',
  'requirements',
  'contract_type',
  'aspect_evaluation',
  'emergency_preparedness',
  'drill_result',
  'monitoring',
  // Recruitment (A12): links that follow the record's own evidence.
  'screening_criteria',
  'approval',
  'privacy_notice',
  'screening',
  'checks',
  'offer',
]);

/** i18n key of a field's display name in "Fra feltet «…»". */
export function fieldLabelKey(field: string | null | undefined): string {
  return field && KNOWN_FIELDS.has(field)
    ? `standards.reqs.fields.${field}`
    : 'standards.reqs.fields.generic';
}

/** A stored link as a panel row (label from the backend, else a local fallback). */
export function linkRow(link: RequirementLink, short: (key: string) => string): PanelRow {
  return {
    key: link.id,
    ref: link.requirement_ref,
    label: link.label ?? fallbackLabel(link, short(link.standard_key)),
    status: link.status === 'suggested' ? 'suggested' : 'confirmed',
    origin: link.origin ?? (link.source === 'ai' ? 'ai' : 'manual'),
    originField: link.origin_field ?? null,
    linkId: link.id,
    entityId: link.entity_id,
    confidence: link.confidence ?? null,
    rationale: link.rationale ?? null,
  };
}

/**
 * Merge the record's stored suggestions with the `suggest` endpoint's list:
 * one row per requirement, stored rows first (they carry confirm / reject by
 * id), then the virtual ones. Refs the record already has a link for (any
 * status) come only from the stored rows, so a confirmed or rejected suggestion
 * never shows again.
 */
export function mergeSuggestions(
  stored: readonly PanelRow[],
  suggested: readonly RequirementSuggestion[],
  known: ReadonlySet<string>,
  entityId: string,
): PanelRow[] {
  const rows = [...stored];
  const seen = new Set(stored.map((r) => r.ref));
  for (const s of suggested) {
    // The record's own links are authoritative for stored rows (any status).
    if (!s.label || seen.has(s.ref) || known.has(s.ref)) {
      continue;
    }
    seen.add(s.ref);
    rows.push({
      key: s.link_id ?? `ref:${s.ref}`,
      ref: s.ref,
      label: s.label,
      status: 'suggested',
      origin: s.origin,
      originField: null,
      linkId: s.link_id,
      entityId,
      confidence: s.confidence ?? null,
      rationale: s.rationale ?? null,
    });
  }
  return rows;
}

/** Sort rows by standard, then clause number, then position in the clause. */
export function sortRows(rows: readonly PanelRow[]): PanelRow[] {
  return [...rows].sort(
    (a, b) =>
      a.label.short.localeCompare(b.label.short) ||
      compareNumbers(a.label.number, b.label.number) ||
      a.label.req_index - b.label.req_index,
  );
}

/**
 * The rows of one clause, shown as one line: "ISO 27001 · A.8.13 (alle 3 krav)"
 * instead of three lines with the same title.
 */
export interface ClauseRow {
  readonly key: string;
  readonly label: RequirementLabel;
  readonly status: 'confirmed' | 'suggested';
  /** 1-based positions of the linked requirements within the clause. */
  readonly positions: readonly number[];
  readonly rows: readonly PanelRow[];
  /** Every row comes from a record field: it is removed by editing that field. */
  readonly fromField: boolean;
  readonly originField: string | null;
  readonly rationale: string | null;
}

/** Group sorted rows of one status by clause (standard + clause number), order kept. */
export function groupByClause(rows: readonly PanelRow[]): ClauseRow[] {
  const groups = new Map<string, PanelRow[]>();
  for (const row of rows) {
    const key = `${row.status}|${row.entityId}|${row.label.standard_key}|${row.label.number}`;
    const list = groups.get(key);
    if (list) {
      list.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return [...groups].map(([key, list]) => {
    const fieldRows = list.filter((r) => r.origin === 'field');
    return {
      key,
      label: list[0].label,
      status: list[0].status,
      positions: list.map((r) => r.label.req_index),
      rows: list,
      fromField: fieldRows.length === list.length,
      originField: fieldRows[0]?.originField ?? null,
      rationale: list.find((r) => r.rationale)?.rationale ?? null,
    };
  });
}

/**
 * "Krav dette dokumenterer" for any record (plan 2.2): the requirements the
 * record is evidence for, as readable chips grouped by standard.
 *
 * - When nothing is confirmed yet, "Foreslåtte krav" appear by themselves
 *   (`POST requirement-links/suggest`, once per record visit): AI-ranked when
 *   AI is on, else the requirements this kind of record usually evidences.
 *   Each can be confirmed or rejected in one click, or all at once.
 * - "Legg til krav" searches the whole catalogue.
 * - Links a record field created (`origin: field`) say which field ("Fra
 *   feltet «Kontroller»") and are removed by editing that field, not here.
 *
 * Editing needs `standards:manage`, or `canEdit` from the host (the user may
 * edit the record). Renders nothing without `standards:read`.
 */
@Component({
  selector: 'app-supports-requirements',
  imports: [NgTemplateOutlet, TranslocoPipe, Icon, RequirementChip, RequirementCatalogueSearch],
  // The strings live in the `standards` scope; hosts don't load it themselves.
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (canRead()) {
      <section data-testid="supports-requirements" [attr.aria-labelledby]="headingId">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 [id]="headingId" class="flex items-center gap-2 text-card font-bold text-fg">
            {{ 'standards.reqs.title' | transloco }}
            @if (confirmed().length > 0) {
              <span
                class="rounded-full bg-surface-2 px-1.5 text-micro font-semibold text-fg-muted"
                data-testid="supports-count"
                >{{ confirmed().length }}</span
              >
            }
          </h2>
          @if (canManage() && !adding()) {
            <button
              type="button"
              class="inline-flex flex-none items-center gap-1 text-meta font-semibold text-accent hover:underline"
              data-testid="supports-add"
              (click)="adding.set(true)"
            >
              <app-icon name="plus" [size]="13" />
              {{ 'standards.reqs.add' | transloco }}
            </button>
          }
        </div>

        @if (adding()) {
          <div class="mb-3">
            <app-requirement-catalogue-search
              [frameworks]="frameworks()"
              [exclude]="knownRefs()"
              (picked)="add($event)"
              (cancelled)="adding.set(false)"
            />
          </div>
        }

        @if (loading()) {
          <p class="text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else {
          @if (confirmed().length === 0 && suggestions().length === 0 && !suggesting()) {
            <div class="rounded-tile border border-dashed border-border px-3 py-2.5">
              <p class="text-ui text-fg-muted" data-testid="supports-none">
                {{ 'standards.reqs.none' | transloco }}
              </p>
              <p class="mt-0.5 text-meta text-fg-subtle">
                {{ 'standards.reqs.noneHint' | transloco }}
              </p>
            </div>
          }

          @for (group of confirmedGroups(); track group.key) {
            <ul class="mb-2 flex flex-col gap-1.5" data-testid="supports-group">
              @for (row of group.items; track row.key) {
                <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }" />
              }
            </ul>
          }
          @if (hiddenConfirmed() > 0) {
            <button
              type="button"
              class="mb-2 text-meta font-semibold text-accent hover:underline"
              (click)="showAll.set(true)"
            >
              {{ 'standards.reqs.showAll' | transloco: { count: confirmed().length } }}
            </button>
          }

          @for (group of actionGroups(); track group.key) {
            <div
              class="mt-2.5 mb-1 truncate text-meta font-semibold text-fg-subtle"
              [title]="group.label"
              data-testid="action-group"
            >
              {{ 'standards.reqs.onAction' | transloco: { action: group.label } }}
            </div>
            <ul class="mb-2 flex flex-col gap-1.5">
              @for (row of group.rows; track row.key) {
                <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }" />
              }
            </ul>
          }

          @if (suggestions().length > 0 || suggesting()) {
            <div
              class="mt-3 rounded-tile border border-dashed border-accent-border bg-accent-soft/30 px-3 py-2.5"
              data-testid="suggested-requirements"
            >
              <div class="flex items-center justify-between gap-2">
                <h3 class="flex items-center gap-1.5 text-ui font-bold text-fg">
                  <app-icon name="spark" [size]="13" class="text-accent" />
                  {{ 'standards.reqs.suggestedTitle' | transloco }}
                </h3>
                @if (canManage() && suggestions().length > 1) {
                  <button
                    type="button"
                    class="flex-none text-meta font-semibold text-accent hover:underline disabled:opacity-60"
                    data-testid="confirm-all"
                    [disabled]="busy()"
                    (click)="confirmAll()"
                  >
                    {{ 'standards.reqs.confirmAll' | transloco: { count: suggestions().length } }}
                  </button>
                }
              </div>
              <p class="mt-0.5 mb-2 text-meta text-fg-muted">
                {{
                  (aiSuggestions()
                    ? 'standards.reqs.suggestedHintAi'
                    : 'standards.reqs.suggestedHint'
                  ) | transloco
                }}
              </p>
              @if (suggesting()) {
                <p class="mb-1 text-meta text-fg-muted" role="status">
                  {{ 'standards.reqs.suggesting' | transloco }}
                </p>
              }
              <ul class="flex flex-col gap-1.5">
                @for (row of suggestionClauses(); track row.key) {
                  <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }" />
                }
              </ul>
            </div>
          } @else if (canManage() && confirmed().length > 0 && !suggestRequested()) {
            <button
              type="button"
              class="mt-1 inline-flex items-center gap-1 text-meta font-semibold text-fg-muted hover:text-accent"
              data-testid="find-more"
              (click)="suggest()"
            >
              <app-icon name="spark" [size]="12" />
              {{ 'standards.reqs.findMore' | transloco }}
            </button>
          }
        }

        @if (errorKey(); as key) {
          <p class="mt-2 text-meta text-fail" role="alert">{{ key | transloco }}</p>
        }
      </section>

      <ng-template #rowTpl let-row>
        <li
          class="flex items-start gap-2 rounded-tile border px-2 py-1.5"
          [class]="
            row.status === 'suggested'
              ? 'border-dashed border-accent-border bg-surface'
              : 'border-border bg-surface'
          "
          data-testid="supports-row"
          [attr.data-status]="row.status"
        >
          <div class="min-w-0 flex-1">
            <app-requirement-chip
              [label]="row.label"
              [status]="row.status"
              [positions]="row.positions"
              [marker]="false"
              [showPosition]="false"
            />
            @if (row.label.title || position(row)) {
              <p class="mt-0.5 line-clamp-2 text-meta text-fg-muted" [title]="row.label.text ?? ''">
                {{ row.label.title }}
                @if (position(row); as pos) {
                  <span class="whitespace-nowrap text-fg-subtle">{{
                    pos.key | transloco: pos.params
                  }}</span>
                }
              </p>
            }
            @if (row.fromField) {
              <p
                class="mt-0.5 flex items-center gap-1 text-micro text-fg-subtle"
                [title]="'standards.reqs.fromFieldHint' | transloco"
                data-testid="from-field"
              >
                <app-icon name="lock" [size]="11" />
                {{
                  'standards.reqs.fromField'
                    | transloco: { field: (fieldKey(row.originField) | transloco) }
                }}
              </p>
            } @else if (row.status === 'suggested' && row.rationale) {
              <p class="mt-0.5 text-micro text-fg-subtle">{{ row.rationale }}</p>
            }
          </div>
          @if (canManage()) {
            <div class="flex flex-none items-center gap-0.5">
              @if (row.status === 'suggested') {
                <button
                  type="button"
                  class="flex rounded-md p-1 text-pass hover:bg-surface-2 disabled:opacity-60"
                  [attr.aria-label]="
                    'standards.reqs.confirmLabel' | transloco: { label: text(row) }
                  "
                  [title]="'standards.reqs.confirm' | transloco"
                  [disabled]="busy()"
                  data-testid="row-confirm"
                  (click)="confirm(row)"
                >
                  <app-icon name="check" [size]="14" />
                </button>
                <button
                  type="button"
                  class="flex rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                  [attr.aria-label]="'standards.reqs.rejectLabel' | transloco: { label: text(row) }"
                  [title]="'standards.reqs.reject' | transloco"
                  [disabled]="busy()"
                  data-testid="row-reject"
                  (click)="reject(row)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              } @else if (!row.fromField) {
                <button
                  type="button"
                  class="flex rounded-md p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                  [attr.aria-label]="'standards.reqs.remove' | transloco: { label: text(row) }"
                  [title]="'standards.reqs.removeShort' | transloco"
                  [disabled]="busy()"
                  data-testid="row-remove"
                  (click)="remove(row)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              }
            </div>
          }
        </li>
      </ng-template>
    }
  `,
})
export class SupportsRequirements {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly transloco = inject(TranslocoService);
  private readonly coverage = inject(RequirementCoverageService);

  readonly entityType = input.required<LinkEntityType>();
  readonly entityId = input.required<string>();
  /**
   * Whether the user may edit the record. With `true` they can manage its links
   * without `standards:manage` (the backend checks the same rule). Unset: only
   * `standards:manage` holders can.
   */
  readonly canEdit = input<boolean | null | undefined>(null);
  /** Framework keys the record is tagged with: narrows "Legg til krav" (e.g. `['iso27001']`). */
  readonly frameworks = input<readonly string[] | null | undefined>(null);
  /**
   * The record's CAPA actions (deviations only): links on each action
   * (entity_type `deviation_action`) are listed grouped under it.
   */
  readonly actions = input<readonly LinkedAction[]>([]);

  /**
   * The record's own links as shown (confirmed + suggested), whenever they
   * load or change — so a host can mirror them (e.g. the requirement chips).
   */
  readonly linksChange = output<readonly RequirementLink[]>();

  private static nextId = 0;
  protected readonly headingId = `cf-supports-${++SupportsRequirements.nextId}`;

  private readonly links = signal<readonly RequirementLink[]>([]);
  private readonly actionLinks = signal<readonly RequirementLink[]>([]);
  private readonly suggested = signal<readonly RequirementSuggestion[]>([]);
  protected readonly loading = signal(true);
  protected readonly suggesting = signal(false);
  protected readonly suggestRequested = signal(false);
  protected readonly aiSuggestions = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly showAll = signal(false);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canRead = computed(() => this.permissions().includes('standards:read'));
  protected readonly canManage = computed(
    () => this.canRead() && (this.permissions().includes('standards:manage') || !!this.canEdit()),
  );

  /** Links not rejected (what the record shows and the host mirrors). */
  private readonly visible = computed(() => this.links().filter((l) => l.status !== 'rejected'));
  private readonly shortOf = (key: string): string => this.shortName(key);

  protected readonly confirmed = computed(() =>
    sortRows(
      this.visible()
        .filter((l) => l.status === 'confirmed')
        .map((l) => linkRow(l, this.shortOf)),
    ),
  );

  /** Confirmed links, one row per clause. */
  private readonly confirmedClauses = computed(() => groupByClause(this.confirmed()));

  protected readonly hiddenConfirmed = computed(() =>
    this.showAll() ? 0 : Math.max(0, this.confirmedClauses().length - CONFIRMED_PREVIEW),
  );

  protected readonly confirmedGroups = computed(() => {
    const all = this.confirmedClauses();
    const rows = this.showAll() ? all : all.slice(0, CONFIRMED_PREVIEW);
    return groupByStandard(rows, (r) => r.label.standard_key);
  });

  /** Every ref the record has a row for, in any status (never suggested again). */
  protected readonly knownRefs = computed(
    () => new Set(this.links().map((l) => l.requirement_ref)) as ReadonlySet<string>,
  );

  protected readonly suggestions = computed(() => {
    const stored = this.visible()
      .filter((l) => l.status === 'suggested')
      .map((l) => linkRow(l, this.shortOf));
    return sortRows(mergeSuggestions(stored, this.suggested(), this.knownRefs(), this.entityId()));
  });

  /** Suggestions, one row per clause. */
  protected readonly suggestionClauses = computed(() => groupByClause(this.suggestions()));

  protected readonly actionGroups = computed<readonly ActionGroup[]>(() => {
    const shown = this.actionLinks().filter((l) => l.status !== 'rejected');
    return this.actions()
      .map((action) => ({
        key: action.id,
        label: action.description,
        rows: groupByClause(
          sortRows(
            shown.filter((l) => l.entity_id === action.id).map((l) => linkRow(l, this.shortOf)),
          ),
        ),
      }))
      .filter((g) => g.rows.length > 0);
  });

  /** Stable key of the action ids, so action links reload only when the set changes. */
  private readonly actionIds = computed(() =>
    this.actions()
      .map((a) => a.id)
      .join(','),
  );

  protected readonly fieldKey = fieldLabelKey;

  private sub: Subscription | null = null;
  private actionSub: Subscription | null = null;
  private suggestSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => this.linksChange.emit(visible));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canRead = this.canRead();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(canRead ? orgId : null, entityType, entityId));
    });
    effect(() => {
      const orgId = this.canRead() ? this.selectedOrg.currentOrgId() : null;
      const ids = this.actionIds();
      untracked(() => this.loadActionLinks(orgId, ids ? ids.split(',') : []));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.actionSub?.unsubscribe();
      this.suggestSub?.unsubscribe();
    });
  }

  /** "(alle 3 krav)" / "(krav 2 av 3)" under the chip, or null for one-requirement clauses. */
  protected position(row: ClauseRow) {
    return positionText(row.label, row.positions);
  }

  /** "ISO 27001 · A.8.13" for aria labels. */
  protected text(row: ClauseRow): string {
    return `${row.label.short} · ${row.label.number}`;
  }

  /** Ask for suggestions now (also run automatically when nothing is confirmed). */
  protected suggest(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canManage()) {
      return;
    }
    this.suggestSub?.unsubscribe();
    this.suggestRequested.set(true);
    this.suggesting.set(true);
    const entityType = this.entityType();
    const entityId = this.entityId();
    this.suggestSub = this.api
      .suggestRequirements(orgId, entityType, entityId)
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (!res) {
          this.suggesting.set(false);
          return;
        }
        this.suggested.set(res.suggestions);
        this.aiSuggestions.set(!!res.job_id);
        if (res.job_id) {
          this.watchJob(orgId, res.job_id, entityType, entityId);
        } else {
          this.suggesting.set(false);
        }
      });
  }

  protected add(pick: RequirementPick): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    forkJoin(
      pick.refs.map((ref) =>
        this.api.createLink(orgId, {
          requirement_ref: ref,
          entity_type: this.entityType(),
          entity_id: this.entityId(),
        }),
      ),
    ).subscribe({
      next: () => {
        this.adding.set(false);
        this.afterChange(orgId);
      },
      error: () => this.fail('standards.reqs.error'),
    });
  }

  /** Confirm every suggested requirement of a clause row. */
  protected confirm(row: ClauseRow): void {
    this.decide('confirm', row.rows);
  }

  /** Reject every suggested requirement of a clause row (hidden at once). */
  protected reject(row: ClauseRow): void {
    // A virtual rejection is stored too, so it never comes back.
    const refs = new Set(row.rows.map((r) => r.ref));
    this.suggested.update((list) => list.filter((s) => !refs.has(s.ref)));
    this.decide('reject', row.rows);
  }

  protected confirmAll(): void {
    this.decide('confirm', this.suggestions(), () => this.suggested.set([]));
  }

  /** Remove the manual links of a clause row (field links stay: the field owns them). */
  protected remove(row: ClauseRow): void {
    const ids = row.rows
      .filter((r) => r.origin !== 'field')
      .map((r) => r.linkId)
      .filter((id): id is string => !!id);
    if (ids.length === 0) {
      return;
    }
    this.run((orgId) =>
      forkJoin(ids.map((id) => this.api.deleteLink(orgId, id))).pipe(map(() => undefined)),
    );
  }

  /**
   * Confirm or reject rows: one stored link through its own endpoint, anything
   * else (several, or virtual suggestions) in one all-or-nothing bulk call.
   */
  private decide(action: 'confirm' | 'reject', rows: readonly PanelRow[], done?: () => void): void {
    const ids = rows.map((r) => r.linkId).filter((id): id is string => !!id);
    const items = rows.filter((r) => !r.linkId).map((r) => this.item(r));
    if (ids.length === 0 && items.length === 0) {
      return;
    }
    this.run((orgId) => {
      if (ids.length === 1 && items.length === 0) {
        const call =
          action === 'confirm'
            ? this.api.confirmLink(orgId, ids[0])
            : this.api.rejectLink(orgId, ids[0]);
        return call.pipe(map(() => undefined));
      }
      return this.api
        .bulkLinks(orgId, {
          action,
          ...(ids.length ? { ids } : {}),
          ...(items.length ? { items } : {}),
        })
        .pipe(map(() => undefined));
    }, done);
  }

  private item(row: PanelRow): {
    requirement_ref: string;
    entity_type: string;
    entity_id: string;
  } {
    return {
      requirement_ref: row.ref,
      entity_type: row.entityId === this.entityId() ? this.entityType() : 'deviation_action',
      entity_id: row.entityId,
    };
  }

  /** Run a mutation, then reload the links (labels and statuses come from the server). */
  private run(call: (orgId: string) => Observable<void>, done?: () => void): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    call(orgId).subscribe({
      next: () => {
        done?.();
        this.afterChange(orgId);
      },
      error: (err: unknown) =>
        this.fail(
          err instanceof HttpErrorResponse &&
            err.status === 409 &&
            (err.error as { detail?: { code?: string } } | null)?.detail?.code ===
              'managed_by_field'
            ? 'standards.reqs.managedByField'
            : 'standards.reqs.error',
        ),
    });
  }

  private afterChange(orgId: string): void {
    this.coverage.invalidate(this.entityType(), [this.entityId()]);
    this.refresh(orgId);
  }

  private fail(key: string): void {
    this.busy.set(false);
    this.errorKey.set(key);
  }

  /** Reload own + action links after a change (keeps the panel in place, no spinner). */
  private refresh(orgId: string): void {
    const ids = this.actionIds();
    forkJoin({
      links: this.api.listLinks(orgId, {
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
      actions: ids
        ? forkJoin(
            ids
              .split(',')
              .map((id) =>
                this.api
                  .listLinks(orgId, { entity_type: 'deviation_action', entity_id: id })
                  .pipe(catchError(() => of([] as RequirementLink[]))),
              ),
          )
        : of([] as RequirementLink[][]),
    }).subscribe({
      next: ({ links, actions }) => {
        this.links.set(links);
        this.actionLinks.set(actions.flat());
        this.busy.set(false);
      },
      error: () => this.fail('standards.reqs.error'),
    });
  }

  private load(orgId: string | null, entityType: LinkEntityType, entityId: string): void {
    this.sub?.unsubscribe();
    this.suggestSub?.unsubscribe();
    this.links.set([]);
    this.suggested.set([]);
    this.suggesting.set(false);
    this.suggestRequested.set(false);
    this.aiSuggestions.set(false);
    this.adding.set(false);
    this.showAll.set(false);
    this.errorKey.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = this.api
      .listLinks(orgId, { entity_type: entityType, entity_id: entityId })
      .subscribe({
        next: (links) => {
          this.links.set(links);
          this.loading.set(false);
          // Nothing confirmed yet: offer suggestions without being asked (once per visit).
          if (this.canManage() && !links.some((l) => l.status === 'confirmed')) {
            this.suggestSub = timer(SUGGEST_DELAY_MS).subscribe(() => this.suggest());
          }
        },
        error: () => {
          this.loading.set(false);
          this.errorKey.set('standards.reqs.loadError');
        },
      });
  }

  /** Follow an AI `record_map` job; when it ends, its stored suggestions are in the links. */
  private watchJob(orgId: string, jobId: string, entityType: string, entityId: string): void {
    this.suggestSub = this.api.pollJob(orgId, jobId, JOB_POLL_MS).subscribe({
      next: (job) => {
        if (job.status === 'done' || job.status === 'failed') {
          this.suggesting.set(false);
          if (job.status === 'done' && entityId === this.entityId()) {
            this.api
              .listLinks(orgId, { entity_type: entityType, entity_id: entityId })
              .pipe(catchError(() => of(null)))
              .subscribe((links) => links && this.links.set(links));
          }
        }
      },
      error: () => this.suggesting.set(false),
    });
  }

  private loadActionLinks(orgId: string | null, actionIds: readonly string[]): void {
    this.actionSub?.unsubscribe();
    if (!orgId || actionIds.length === 0) {
      this.actionLinks.set([]);
      return;
    }
    this.actionSub = forkJoin(
      actionIds.map((id) =>
        this.api
          .listLinks(orgId, { entity_type: 'deviation_action', entity_id: id })
          .pipe(catchError(() => of([] as RequirementLink[]))),
      ),
    ).subscribe((lists) => this.actionLinks.set(lists.flat()));
  }

  /** Short standard name for a link without a backend label. */
  private shortName(standardKey: string): string {
    const framework = frameworkOf(standardKey);
    const key = shortNameKey(framework);
    return key ? this.transloco.translate(key) : (fixedShortName(framework) ?? standardKey);
  }
}
