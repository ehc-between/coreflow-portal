import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  AuditEvent,
  AuditFacets,
  AuditFilters,
  AuditLogApi,
} from '../../../core/org/audit-log-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
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

/** Last segment of a dotted action (`risk.status_changed` → `status_changed`). */
export function actionVerb(action: string): string {
  const parts = action.split('.');
  return parts[parts.length - 1] ?? action;
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

interface FilterState {
  readonly q: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly actor_user_id: string;
  readonly actor_kind: string;
  readonly action: string;
  readonly from: string;
  readonly to: string;
}

const EMPTY: FilterState = {
  q: '',
  entity_type: '',
  entity_id: '',
  actor_user_id: '',
  actor_kind: '',
  action: '',
  from: '',
  to: '',
};

/**
 * `/settings/audit-log` (audit:read): the organisation's audit trail (ISO 27001
 * A.8.15). Filter by text, record type, person, who acted (person / assistant /
 * system), kind of change and dates; each row links to its record when the
 * reader may open it, and expands to show what changed. The filtered rows can be
 * exported as CSV. `?entity_type=&entity_id=` deep-links one record's history.
 */
@Component({
  selector: 'app-audit-log-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    Icon,
    LoadingState,
    PageHeader,
    HelpStrip,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="settings.audit.title"
        descriptionKey="settings.audit.description"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.audit.title' },
        ]"
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
      </app-page-header>
      <div class="mb-4">
        <app-help-strip scope="platform" page="settings-audit-log" />
      </div>

      <form
        class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
        (submit)="$event.preventDefault(); apply()"
        data-testid="audit-filters"
      >
        <label class="sr-only" for="audit-q">{{ 'settings.audit.search' | transloco }}</label>
        <input
          id="audit-q"
          type="search"
          autocomplete="off"
          [value]="draft().q"
          (input)="set('q', $any($event.target).value)"
          (keydown.enter)="apply()"
          [placeholder]="'settings.audit.searchPlaceholder' | transloco"
          class="h-9 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent sm:col-span-2"
        />
        <label class="sr-only" for="audit-type">{{ 'settings.audit.type' | transloco }}</label>
        <select
          id="audit-type"
          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
          (change)="set('entity_type', $any($event.target).value, true)"
        >
          <option value="" [selected]="!draft().entity_type">
            {{ 'settings.audit.allTypes' | transloco }}
          </option>
          @for (t of facets()?.entity_types ?? []; track t.entity_type) {
            <option [value]="t.entity_type" [selected]="draft().entity_type === t.entity_type">
              {{ typeLabel(t.entity_type, t.label_key) }} ({{ t.count }})
            </option>
          }
        </select>
        <label class="sr-only" for="audit-actor">{{ 'settings.audit.actor' | transloco }}</label>
        <select
          id="audit-actor"
          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
          (change)="set('actor_user_id', $any($event.target).value, true)"
        >
          <option value="" [selected]="!draft().actor_user_id">
            {{ 'settings.audit.allActors' | transloco }}
          </option>
          @for (a of facets()?.actors ?? []; track a.user_id) {
            <option [value]="a.user_id" [selected]="draft().actor_user_id === a.user_id">
              {{ a.name }} ({{ a.count }})
            </option>
          }
        </select>
        <label class="sr-only" for="audit-kind">{{ 'settings.audit.actorKind' | transloco }}</label>
        <select
          id="audit-kind"
          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
          (change)="set('actor_kind', $any($event.target).value, true)"
        >
          <option value="" [selected]="!draft().actor_kind">
            {{ 'settings.audit.allActorKinds' | transloco }}
          </option>
          @for (k of actorKinds; track k) {
            <option [value]="k" [selected]="draft().actor_kind === k">
              {{ 'settings.audit.actorKinds.' + k | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="audit-action">{{ 'settings.audit.action' | transloco }}</label>
        <select
          id="audit-action"
          class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg"
          (change)="set('action', $any($event.target).value, true)"
        >
          <option value="" [selected]="!draft().action">
            {{ 'settings.audit.allActions' | transloco }}
          </option>
          @for (g of facets()?.action_groups ?? []; track g.prefix) {
            <option [value]="g.prefix" [selected]="draft().action === g.prefix">
              {{ groupLabel(g.prefix) }} ({{ g.count }})
            </option>
          }
        </select>
        <div class="flex items-center gap-2">
          <label class="text-meta text-fg-muted" for="audit-from">{{
            'settings.audit.from' | transloco
          }}</label>
          <input
            id="audit-from"
            type="date"
            class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            [value]="draft().from"
            (change)="set('from', $any($event.target).value, true)"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-meta text-fg-muted" for="audit-to">{{
            'settings.audit.to' | transloco
          }}</label>
          <input
            id="audit-to"
            type="date"
            class="h-9 min-w-0 flex-1 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
            [value]="draft().to"
            (change)="set('to', $any($event.target).value, true)"
          />
        </div>
        <div class="flex items-center gap-2">
          <app-button type="submit" size="sm">{{ 'settings.audit.apply' | transloco }}</app-button>
          @if (filtered()) {
            <app-button variant="ghost" size="sm" (click)="clear()">{{
              'settings.audit.clear' | transloco
            }}</app-button>
          }
        </div>
      </form>

      @if (applied().entity_id) {
        <p class="mb-3 text-ui text-fg-muted" data-testid="audit-one-record">
          {{ 'settings.audit.oneRecord' | transloco }}
          <button type="button" class="font-semibold text-accent hover:underline" (click)="clear()">
            {{ 'settings.audit.showAll' | transloco }}
          </button>
        </p>
      }

      <app-card [padded]="false">
        @if (loading() && events().length === 0) {
          <app-loading-state [rows]="8" />
        } @else if (loadError()) {
          <app-error-state (retry)="load()" />
        } @else if (events().length === 0) {
          <app-empty-state
            icon="history"
            [titleKey]="filtered() ? 'settings.audit.noMatch' : 'settings.audit.emptyTitle'"
            [bodyKey]="filtered() ? null : 'settings.audit.emptyBody'"
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
                      <span class="block text-meta text-fg-subtle">{{
                        typeLabel(event.entity_type, event.entity_label_key)
                      }}</span>
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
    </div>
  `,
})
export class AuditLogPage {
  private readonly api = inject(AuditLogApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly pageSize = AUDIT_PAGE_SIZE;
  protected readonly actorKinds = ['user', 'ai', 'system'];

  protected readonly draft = signal<FilterState>(this.fromQuery());
  protected readonly applied = signal<FilterState>(this.draft());
  protected readonly offset = signal(0);
  protected readonly events = signal<readonly AuditEvent[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly facets = signal<AuditFacets | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly exporting = signal(false);

  protected readonly filtered = computed(() =>
    Object.values(this.applied()).some((v) => v.trim() !== ''),
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
        this.load();
      });
    });
  }

  protected set(key: keyof FilterState, value: string, applyNow = false): void {
    this.draft.update((current) => ({ ...current, [key]: value }));
    if (applyNow) this.apply();
  }

  protected apply(): void {
    this.applied.set(this.draft());
    this.offset.set(0);
    this.load();
  }

  protected clear(): void {
    this.draft.set(EMPTY);
    this.apply();
  }

  protected history(event: AuditEvent): void {
    this.draft.set({ ...EMPTY, entity_type: event.entity_type, entity_id: event.entity_id ?? '' });
    this.apply();
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

  protected actionLabel(event: AuditEvent): string {
    const verb = actionVerb(event.action);
    if ((AUDIT_VERBS as readonly string[]).includes(verb)) {
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

  private filters(): AuditFilters {
    return { ...this.applied() };
  }

  private fromQuery(): FilterState {
    const params = this.route.snapshot.queryParamMap;
    return {
      ...EMPTY,
      entity_type: params.get('entity_type') ?? '',
      entity_id: params.get('entity_id') ?? '',
      actor_user_id: params.get('actor_user_id') ?? '',
      q: params.get('q') ?? '',
    };
  }
}
