import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  AUDIT_OUTPUTS_CATEGORY,
  AUDIT_PLATFORM_MODULE,
  AuditEvent,
  AuditFacets,
  AuditFilters,
  AuditLogApi,
} from '../../../core/org/audit-log-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Pager } from '../../../shared/ui/pager/pager';
import { saveBlob } from '../download';

/** Rows per page. */
export const AUDIT_PAGE_SIZE = 50;

/** Actions with a translated verb (`settings.audit.verbs.<verb>`); others use the summary. */
export const AUDIT_VERBS = [
  'created',
  'updated',
  'deleted',
  'restored',
  'archived',
  'approved',
  'rejected',
  'submitted',
  'published',
  'status_changed',
  'owner_changed',
  'assigned',
  'closed',
  'reopened',
  'linked',
  'unlinked',
  'enabled',
  'disabled',
  'exported',
  'generated',
  'downloaded',
  'shared',
  'invited',
  'revoked',
  'accepted',
  'role_changed',
  'removed',
  'login_succeeded',
  'login_failed',
  'logout',
  'password_changed',
  'synced',
] as const;

/** Whole actions with their own wording (`settings.audit.verbs.<value>`). */
export const AUDIT_ACTION_VERBS: Readonly<Record<string, string>> = {
  'generated_output.created': 'outputCreated',
  'generated_output.downloaded': 'downloaded',
  'output_share.created': 'shareCreated',
  'output_share.revoked': 'shareRevoked',
};

/** Last segment of a dotted action (`risk.status_changed` → `status_changed`). */
export function actionVerb(action: string): string {
  const parts = action.split('.');
  return parts[parts.length - 1] ?? action;
}

/** The verb key of an action: a whole-action wording first, then its last segment. */
export function actionVerbKey(action: string): string | null {
  const whole = AUDIT_ACTION_VERBS[action];
  if (whole) return whole;
  const verb = actionVerb(action);
  return (AUDIT_VERBS as readonly string[]).includes(verb) ? verb : null;
}

/**
 * i18n keys that may name an entity type or action group, best first: the backend
 * label key, the audit log's own platform types, the module entity names and the terms.
 */
export function typeLabelKeys(entityType: string, labelKey?: string | null): string[] {
  return [
    ...(labelKey ? [labelKey] : []),
    `settings.audit.types.${entityType}`,
    `modules.entities.${entityType}`,
    `terms.${entityType}.one`,
  ];
}

/** i18n key of a module filter option (the platform bucket has its own name). */
export function moduleLabelKey(module: string, nameKey?: string | null): string {
  return nameKey || `modules.names.${module}`;
}

/** Snapshot fields that hold an entity type key (`entity_type`, `target_entity_type`). */
export function isEntityTypeField(field: string): boolean {
  return field === 'entity_type' || field.endsWith('_entity_type');
}

/** Changed field names between `before` and `after` (a row's snapshot diff). */
export function changedFields(event: Pick<AuditEvent, 'before' | 'after'>): string[] {
  const keys = new Set([...Object.keys(event.before ?? {}), ...Object.keys(event.after ?? {})]);
  return [...keys].filter(
    (key) =>
      JSON.stringify(event.before?.[key] ?? null) !== JSON.stringify(event.after?.[key] ?? null),
  );
}

/** Render one snapshot value for the details list. */
export function snapshotValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** Every filter of the page; each is also a query parameter of `/settings/audit-log`. */
export const AUDIT_FILTER_KEYS = [
  'q',
  'category',
  'module',
  'actor_user_id',
  'action',
  'output_key',
  'entity_type',
  'entity_id',
  'actor_kind',
  'from',
  'to',
] as const;

export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];
export type AuditFilterState = Readonly<Record<AuditFilterKey, string>>;

export const EMPTY_AUDIT_FILTERS: AuditFilterState = Object.fromEntries(
  AUDIT_FILTER_KEYS.map((key) => [key, '']),
) as AuditFilterState;

/** The filter state in a URL (unknown params ignored, `category` only `outputs`). */
export function auditStateFromParams(params: Pick<ParamMap, 'get'>): AuditFilterState {
  const state = Object.fromEntries(
    AUDIT_FILTER_KEYS.map((key) => [key, (params.get(key) ?? '').trim()]),
  ) as Record<AuditFilterKey, string>;
  if (state.category !== AUDIT_OUTPUTS_CATEGORY) state.category = '';
  return state;
}

/** Query params for a filter state: blank values dropped. */
export function auditStateToParams(state: Partial<AuditFilterState>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of AUDIT_FILTER_KEYS) {
    const value = state[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * The filters that sit under "Flere filtre" in a view. The documents view shows
 * "Dokument" next to module and person; the full log shows "Type endring" there.
 */
export function moreFilterKeys(outputsView: boolean): readonly AuditFilterKey[] {
  return [
    outputsView ? 'action' : 'output_key',
    'entity_type',
    'actor_kind',
    'from',
    'to',
  ] as const;
}

/** How many "Flere filtre" filters are set (shown on the button). */
export function moreFiltersCount(state: AuditFilterState): number {
  return moreFilterKeys(state.category === AUDIT_OUTPUTS_CATEGORY).filter((key) => !!state[key])
    .length;
}

/**
 * `/settings/audit-log` (audit:read): the organisation's audit trail (ISO 27001
 * A.8.15). Two views: every change, and the documents that were made, exported,
 * downloaded or shared (`?category=outputs`). Search plus module, person and one
 * more filter; the rest under "Flere filtre". Every filter is a query param, so
 * counts elsewhere can link to a filtered log (`?module=privacy&output_key=privacy.ropa`)
 * and "Eksporter" downloads exactly the rows shown as CSV. Each row links to its
 * record when the reader may open it, and expands to show what changed.
 */
@Component({
  selector: 'app-audit-log-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    Pager,
    RecordListPage,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="settings.audit.title"
      descriptionKey="settings.audit.description"
      scope="settings"
      page="audit-log"
      searchPlaceholderKey="settings.audit.searchPlaceholder"
      [breadcrumbs]="[{ labelKey: 'settings.hub.title', link: '/settings' }]"
      [query]="applied().q"
      [filters]="savedFilters()"
      [moreFiltersActive]="moreActive()"
      (search)="patch({ q: $event })"
      (viewApplied)="applyView($event)"
    >
      <app-button
        secondary
        variant="secondary"
        data-testid="audit-export"
        [loading]="exporting()"
        (click)="exportCsv()"
      >
        <app-icon name="download" [size]="15" />
        {{ 'settings.audit.export' | transloco }}
      </app-button>

      <div
        nav
        class="mb-5 flex gap-1 border-b border-border"
        role="group"
        [attr.aria-label]="'settings.audit.views' | transloco"
      >
        @for (view of views; track view.key) {
          <button
            type="button"
            class="-mb-px flex min-h-10 items-center gap-1.5 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            [class]="
              outputsView() === view.outputs
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            "
            [attr.aria-pressed]="outputsView() === view.outputs"
            [attr.data-testid]="view.testId"
            (click)="showView(view.outputs)"
          >
            {{ view.labelKey | transloco }}
            @if (view.outputs && outputsCount() !== null) {
              <span
                class="rounded-full bg-surface-2 px-1.5 py-px text-micro font-semibold text-fg-muted"
                >{{ outputsCount() }}</span
              >
            }
          </button>
        }
      </div>

      <app-help-strip help scope="platform" page="settings-audit-log" />

      <label filters class="sr-only" for="audit-module">{{
        'settings.audit.module' | transloco
      }}</label>
      <select
        filters
        id="audit-module"
        data-testid="audit-module"
        class="h-10 w-full rounded-tile sm:w-auto sm:max-w-[12rem] border border-border bg-bg px-2.5 text-ui text-fg"
        (change)="patch({ module: $any($event.target).value })"
      >
        <option value="" [selected]="!applied().module">
          {{ 'settings.audit.allModules' | transloco }}
        </option>
        @for (m of moduleOptions(); track m.module) {
          <option [value]="m.module" [selected]="applied().module === m.module">
            {{ m.label }} ({{ m.count }})
          </option>
        }
      </select>
      <label filters class="sr-only" for="audit-actor">{{
        'settings.audit.actor' | transloco
      }}</label>
      <select
        filters
        id="audit-actor"
        data-testid="audit-actor"
        class="h-10 w-full rounded-tile sm:w-auto sm:max-w-[12rem] border border-border bg-bg px-2.5 text-ui text-fg"
        (change)="patch({ actor_user_id: $any($event.target).value })"
      >
        <option value="" [selected]="!applied().actor_user_id">
          {{ 'settings.audit.allActors' | transloco }}
        </option>
        @for (a of facets()?.actors ?? []; track a.user_id) {
          <option [value]="a.user_id" [selected]="applied().actor_user_id === a.user_id">
            {{ a.name }} ({{ a.count }})
          </option>
        }
      </select>
      <ng-container ngProjectAs="[filters]">
        <ng-container *ngTemplateOutlet="outputsView() ? outputSelect : actionSelect" />
      </ng-container>

      <div more-filters class="flex flex-col gap-3">
        @if (outputsView()) {
          <ng-container *ngTemplateOutlet="actionSelect; context: { stacked: true }" />
        } @else {
          <ng-container *ngTemplateOutlet="outputSelect; context: { stacked: true }" />
        }
        <label class="flex flex-col gap-1 text-meta text-fg-muted" for="audit-type">
          {{ 'settings.audit.type' | transloco }}
          <select
            id="audit-type"
            class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
            (change)="patch({ entity_type: $any($event.target).value, entity_id: '' })"
          >
            <option value="" [selected]="!applied().entity_type">
              {{ 'settings.audit.allTypes' | transloco }}
            </option>
            @for (t of facets()?.entity_types ?? []; track t.entity_type) {
              <option [value]="t.entity_type" [selected]="applied().entity_type === t.entity_type">
                {{ typeLabel(t.entity_type, t.label_key) }} ({{ t.count }})
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-meta text-fg-muted" for="audit-kind">
          {{ 'settings.audit.actorKind' | transloco }}
          <select
            id="audit-kind"
            class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
            (change)="patch({ actor_kind: $any($event.target).value })"
          >
            <option value="" [selected]="!applied().actor_kind">
              {{ 'settings.audit.allActorKinds' | transloco }}
            </option>
            @for (k of actorKinds; track k) {
              <option [value]="k" [selected]="applied().actor_kind === k">
                {{ 'settings.audit.actorKinds.' + k | transloco }}
              </option>
            }
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-meta text-fg-muted" for="audit-from">
            {{ 'settings.audit.from' | transloco }}
            <input
              id="audit-from"
              type="date"
              class="h-9 min-w-0 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              [value]="applied().from"
              (change)="patch({ from: $any($event.target).value })"
            />
          </label>
          <label class="flex flex-col gap-1 text-meta text-fg-muted" for="audit-to">
            {{ 'settings.audit.to' | transloco }}
            <input
              id="audit-to"
              type="date"
              class="h-9 min-w-0 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
              [value]="applied().to"
              (change)="patch({ to: $any($event.target).value })"
            />
          </label>
        </div>
      </div>

      <ng-template #actionSelect let-stacked="stacked">
        <label
          [class]="stacked ? 'flex flex-col gap-1 text-meta text-fg-muted' : 'contents'"
          for="audit-action"
        >
          <span [class.sr-only]="!stacked">{{ 'settings.audit.action' | transloco }}</span>
          <select
            id="audit-action"
            data-testid="audit-action"
            [class]="
              (stacked ? 'h-9 w-full' : 'h-10 w-full sm:w-auto sm:max-w-[12rem]') +
              ' rounded-tile border border-border bg-bg px-2.5 text-ui text-fg'
            "
            (change)="patch({ action: $any($event.target).value })"
          >
            <option value="" [selected]="!applied().action">
              {{ 'settings.audit.allActions' | transloco }}
            </option>
            @for (g of facets()?.action_groups ?? []; track g.prefix) {
              <option [value]="g.prefix" [selected]="applied().action === g.prefix">
                {{ groupLabel(g.prefix) }} ({{ g.count }})
              </option>
            }
            @if (applied().action && !actionKnown()) {
              <option [value]="applied().action" selected>{{ applied().action }}</option>
            }
          </select>
        </label>
      </ng-template>

      <ng-template #outputSelect let-stacked="stacked">
        <label
          [class]="stacked ? 'flex flex-col gap-1 text-meta text-fg-muted' : 'contents'"
          for="audit-output"
        >
          <span [class.sr-only]="!stacked">{{ 'settings.audit.output' | transloco }}</span>
          <select
            id="audit-output"
            data-testid="audit-output"
            [class]="
              (stacked ? 'h-9 w-full' : 'h-10 w-full sm:w-auto sm:max-w-[12rem]') +
              ' rounded-tile border border-border bg-bg px-2.5 text-ui text-fg'
            "
            (change)="patch({ output_key: $any($event.target).value })"
          >
            <option value="" [selected]="!applied().output_key">
              {{ 'settings.audit.allOutputs' | transloco }}
            </option>
            @for (o of facets()?.outputs ?? []; track o.output_key) {
              <option [value]="o.output_key" [selected]="applied().output_key === o.output_key">
                {{ outputLabel(o.output_key) }} ({{ o.count }})
              </option>
            }
            @if (applied().output_key && !outputKnown()) {
              <option [value]="applied().output_key" selected>
                {{ outputLabel(applied().output_key) }}
              </option>
            }
          </select>
        </label>
      </ng-template>

      @if (applied().entity_id) {
        <p class="mb-3 text-ui text-fg-muted" data-testid="audit-one-record">
          {{ 'settings.audit.oneRecord' | transloco }}
          <button type="button" class="font-semibold text-accent hover:underline" (click)="clear()">
            {{ 'settings.audit.showAll' | transloco }}
          </button>
        </p>
      }

      @if (total() !== null && !loadError()) {
        <p class="mb-2 text-meta text-fg-muted" data-testid="audit-total" aria-live="polite">
          {{
            (outputsView() ? 'settings.audit.totalOutputs' : 'settings.audit.total')
              | transloco: { count: total() }
          }}
          @if (filtered()) {
            ·
            <button
              type="button"
              class="font-semibold text-accent hover:underline"
              (click)="clear()"
            >
              {{ 'ui.empty.clearFilters' | transloco }}
            </button>
          }
        </p>
      }

      <app-card [padded]="false">
        @if (loading() && events().length === 0) {
          <app-loading-state [rows]="8" />
        } @else if (loadError()) {
          <app-error-state (retry)="load()" />
        } @else if (events().length === 0) {
          <app-empty-state
            [icon]="outputsView() ? 'documents' : 'history'"
            [titleKey]="emptyTitleKey()"
            [bodyKey]="emptyBodyKey()"
            [compact]="true"
          />
        } @else {
          <ul>
            @for (event of events(); track event.id) {
              <li class="border-b border-border last:border-b-0" data-testid="audit-row">
                <details class="group">
                  <summary
                    class="grid cursor-pointer list-none grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    <span class="text-meta text-fg-muted">{{ event.created_at | localDate }}</span>
                    <span class="min-w-0">
                      <span class="font-semibold text-fg">{{ actionLabel(event) }}</span>
                      <span
                        class="mt-0.5 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted"
                      >
                        @if (event.actor_name) {
                          {{ event.actor_name }}
                        } @else if (event.actor_kind !== 'system') {
                          {{ 'settings.audit.actorKinds.system' | transloco }}
                        }
                        @if (event.actor_kind === 'ai') {
                          <app-badge tone="info">{{
                            'settings.audit.actorKinds.ai' | transloco
                          }}</app-badge>
                        } @else if (event.actor_kind === 'system') {
                          <app-badge tone="neutral">{{
                            'settings.audit.actorKinds.system' | transloco
                          }}</app-badge>
                        }
                      </span>
                    </span>
                    <span class="min-w-0 text-ui">
                      <span
                        class="flex flex-wrap items-center gap-1.5 text-meta text-fg-subtle"
                        data-testid="audit-row-meta"
                      >
                        <!-- In the documents view every row is a document: no badge. -->
                        @if (event.is_output && !outputsView()) {
                          <app-badge tone="accent">{{
                            'settings.audit.outputBadge' | transloco
                          }}</app-badge>
                        }
                        @if (event.module) {
                          <span>{{ moduleName(event.module) }}</span>
                        }
                        <!-- A generated document is already named by its title below. -->
                        @if (event.entity_type !== 'generated_output' || !event.module) {
                          @if (event.module) {
                            <span aria-hidden="true">·</span>
                          }
                          <span>{{ typeLabel(event.entity_type, event.entity_label_key) }}</span>
                        }
                      </span>
                      @if (event.entity; as entity) {
                        @if (entity.url) {
                          <a
                            [routerLink]="entity.url"
                            class="font-semibold text-accent hover:underline"
                            (click)="$event.stopPropagation()"
                          >
                            @if (entity.code) {
                              <span class="font-mono text-meta">{{ entity.code }}</span>
                            }
                            {{ entity.title }}
                          </a>
                        } @else {
                          <span class="text-fg">
                            @if (entity.code) {
                              <span class="font-mono text-meta">{{ entity.code }}</span>
                            }
                            {{ entity.title }}</span
                          >
                        }
                      } @else if (event.output_key) {
                        <span class="text-fg">{{ outputLabel(event.output_key) }}</span>
                      }
                    </span>
                  </summary>
                  <div
                    class="border-t border-border bg-surface-2 px-4 py-3 text-meta text-fg-muted"
                  >
                    <p class="text-ui text-fg">{{ event.summary }}</p>
                    @if (changes(event); as fields) {
                      @if (fields.length) {
                        <dl
                          class="mt-2 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1"
                        >
                          @for (field of fields; track field) {
                            <dt class="truncate font-mono">{{ field }}</dt>
                            <dd class="min-w-0 break-words">
                              <span class="line-through">{{
                                fieldValue(field, event.before?.[field])
                              }}</span>
                              →
                              <span class="text-fg">{{
                                fieldValue(field, event.after?.[field])
                              }}</span>
                            </dd>
                          }
                        </dl>
                      }
                    }
                    <p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-fg-subtle">
                      <span
                        >{{ 'settings.audit.technical' | transloco }}:
                        <span class="font-mono">{{ event.action }}</span></span
                      >
                      @if (event.ip) {
                        <span
                          >IP <span class="font-mono">{{ event.ip }}</span></span
                        >
                      }
                      @if (event.entity_id) {
                        <button
                          type="button"
                          class="font-semibold text-accent hover:underline"
                          (click)="history(event)"
                        >
                          {{ 'settings.audit.recordHistory' | transloco }}
                        </button>
                      }
                      @if (event.output_key && applied().output_key !== event.output_key) {
                        <button
                          type="button"
                          class="font-semibold text-accent hover:underline"
                          data-testid="audit-same-output"
                          (click)="sameOutput(event)"
                        >
                          {{ 'settings.audit.sameOutput' | transloco }}
                        </button>
                      }
                    </p>
                  </div>
                </details>
              </li>
            }
          </ul>
        }
      </app-card>

      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="events().length"
        [total]="total()"
        (pageChange)="goTo($event)"
      />
    </app-record-list-page>
  `,
})
export class AuditLogPage {
  private readonly api = inject(AuditLogApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly pageSize = AUDIT_PAGE_SIZE;
  protected readonly actorKinds = ['user', 'ai', 'system'];
  protected readonly views = [
    { key: 'all', outputs: false, labelKey: 'settings.audit.viewAll', testId: 'audit-view-all' },
    {
      key: 'outputs',
      outputs: true,
      labelKey: 'settings.audit.viewOutputs',
      testId: 'audit-view-outputs',
    },
  ] as const;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** The applied filters: the URL is the only source, so links and Back work. */
  protected readonly applied = computed(() => auditStateFromParams(this.params()), {
    equal: (a, b) => AUDIT_FILTER_KEYS.every((key) => a[key] === b[key]),
  });
  protected readonly outputsView = computed(
    () => this.applied().category === AUDIT_OUTPUTS_CATEGORY,
  );

  protected readonly offset = signal(0);
  protected readonly events = signal<readonly AuditEvent[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly facets = signal<AuditFacets | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly exporting = signal(false);

  /** Any filter beyond the chosen view. */
  protected readonly filtered = computed(() => {
    const state = this.applied();
    return AUDIT_FILTER_KEYS.some((key) => key !== 'category' && state[key] !== '');
  });
  protected readonly moreActive = computed(() => moreFiltersCount(this.applied()));
  /** Filters stored with a saved view (the search text is stored on its own). */
  protected readonly savedFilters = computed(() =>
    auditStateToParams({ ...this.applied(), q: '' }),
  );
  protected readonly outputsCount = computed(
    () =>
      this.facets()?.categories?.find((c) => c.category === AUDIT_OUTPUTS_CATEGORY)?.count ?? null,
  );
  /** Module options, by name; "Plattform og innstillinger" last. */
  protected readonly moduleOptions = computed(() => {
    this.language.active();
    const options = (this.facets()?.modules ?? []).map((m) => ({
      module: m.module,
      count: m.count,
      label: this.moduleName(m.module, m.name_key),
    }));
    const selected = this.applied().module;
    if (selected && !options.some((o) => o.module === selected)) {
      options.push({ module: selected, count: 0, label: this.moduleName(selected) });
    }
    return options.sort(
      (a, b) =>
        Number(a.module === AUDIT_PLATFORM_MODULE) - Number(b.module === AUDIT_PLATFORM_MODULE) ||
        a.label.localeCompare(b.label),
    );
  });
  protected readonly actionKnown = computed(() =>
    (this.facets()?.action_groups ?? []).some((g) => g.prefix === this.applied().action),
  );
  protected readonly outputKnown = computed(() =>
    (this.facets()?.outputs ?? []).some((o) => o.output_key === this.applied().output_key),
  );
  protected readonly emptyTitleKey = computed(() =>
    this.filtered()
      ? 'settings.audit.noMatch'
      : this.outputsView()
        ? 'settings.audit.emptyOutputsTitle'
        : 'settings.audit.emptyTitle',
  );
  protected readonly emptyBodyKey = computed(() =>
    this.filtered()
      ? 'ui.empty.noResultsBody'
      : this.outputsView()
        ? 'settings.audit.emptyOutputsBody'
        : 'settings.audit.emptyBody',
  );

  private generation = 0;

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'audit_event',
      view: 'list',
      title: this.language.translate('settings.audit.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.facets.set(null);
        if (!orgId) return;
        this.api.facets(orgId).subscribe({
          next: (facets) => this.facets.set(facets),
          // Older backends have no facets: the filters fall back to text and dates.
          error: () => this.facets.set(null),
        });
      });
    });

    // A new org or new filters start again at the first page. The old rows go, so a
    // slow answer never shows last view's rows under the new view's heading.
    effect(() => {
      this.orgId();
      this.applied();
      untracked(() => {
        this.offset.set(0);
        this.events.set([]);
        this.total.set(null);
        this.load();
      });
    });
  }

  /** Change some filters (blank removes one); the list follows the URL. */
  protected patch(change: Partial<AuditFilterState>): void {
    this.navigate({ ...this.applied(), ...change });
  }

  protected showView(outputs: boolean): void {
    if (outputs === this.outputsView()) return;
    // The document filter only means something in the documents view.
    this.patch(outputs ? { category: AUDIT_OUTPUTS_CATEGORY } : { category: '', output_key: '' });
  }

  protected clear(): void {
    this.navigate({ ...EMPTY_AUDIT_FILTERS, category: this.applied().category });
  }

  protected applyView(view: SavedView): void {
    this.navigate({ ...EMPTY_AUDIT_FILTERS, ...view.filters, q: view.query });
  }

  protected history(event: AuditEvent): void {
    this.navigate({
      ...EMPTY_AUDIT_FILTERS,
      entity_type: event.entity_type,
      entity_id: event.entity_id ?? '',
    });
  }

  protected sameOutput(event: AuditEvent): void {
    this.navigate({
      ...EMPTY_AUDIT_FILTERS,
      category: AUDIT_OUTPUTS_CATEGORY,
      output_key: event.output_key ?? '',
    });
  }

  protected goTo(offset: number): void {
    this.offset.set(offset);
    this.load();
  }

  protected typeLabel(entityType: string, labelKey: string | null | undefined): string {
    for (const key of typeLabelKeys(entityType, labelKey)) {
      const label = this.language.translate(key);
      if (label !== key) return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return entityType.replace(/_/g, ' ');
  }

  protected groupLabel(prefix: string): string {
    const type = prefix.replace(/\.$/, '');
    return this.typeLabel(type, null);
  }

  protected moduleName(module: string, nameKey?: string | null): string {
    const key = moduleLabelKey(module, nameKey);
    const label = this.language.translate(key);
    return label !== key ? label : module.replace(/_/g, ' ');
  }

  /** "Personvern: ropa" — the module's name and the rest of the key. */
  protected outputLabel(outputKey: string): string {
    const [module, ...rest] = outputKey.split('.');
    const name = rest.join('.').replace(/[_.]/g, ' ').trim();
    const moduleName = this.moduleName(module ?? outputKey);
    return name ? `${moduleName}: ${name}` : moduleName;
  }

  protected actionLabel(event: AuditEvent): string {
    const verb = actionVerbKey(event.action);
    if (verb) {
      return this.language.translate(`settings.audit.verbs.${verb}`);
    }
    // Summaries are written in English by the server: show them as the label only in
    // English, and as detail (when the row is opened) otherwise.
    return this.language.active() === 'en' && event.summary
      ? event.summary
      : this.language.translate('settings.audit.verbs.other');
  }

  protected changes(event: AuditEvent): string[] {
    return changedFields(event);
  }

  /**
   * A changed value for the diff. Entity type fields (`entity_type`, `source_entity_type`,
   * …) show the readable type name ("Anvendelseserklæring" for `soa_entry`) when there is
   * one; everything else is the stored value.
   */
  protected fieldValue(field: string, v: unknown): string {
    if (typeof v === 'string' && v && isEntityTypeField(field)) {
      for (const key of typeLabelKeys(v)) {
        const label = this.language.translate(key);
        if (label !== key) return label.charAt(0).toUpperCase() + label.slice(1);
      }
    }
    return snapshotValue(v);
  }

  protected load(): void {
    const orgId = this.orgId();
    if (!orgId) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.api.list(orgId, this.filters(), AUDIT_PAGE_SIZE, this.offset()).subscribe({
      next: (page) => {
        if (generation !== this.generation) return;
        this.events.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  protected exportCsv(): void {
    const orgId = this.orgId();
    if (!orgId || this.exporting()) return;
    this.exporting.set(true);
    this.api.exportCsv(orgId, this.filters()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
      },
      error: () => {
        this.exporting.set(false);
        this.notifications.error('settings.audit.exportFailed');
      },
    });
  }

  private navigate(state: Partial<AuditFilterState>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: auditStateToParams(state),
      replaceUrl: false,
    });
  }

  private filters(): AuditFilters {
    return auditStateToParams(this.applied());
  }
}
