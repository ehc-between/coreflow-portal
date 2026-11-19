import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConnectionItem, LinkSuggestionItem } from '../../core/kit/connections.models';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../ui/icon/icon';
import { ConnectionMap } from './connection-map';
import { ConnectionsStore, provideConnectionsStore } from './connections-store';
import { EntityChip } from './entity-chip';
import { linkTypeKey, suggestionReasonKey } from './kit-format';
import { provideKitScope } from './kit-scope';
import { LinkPicker } from './link-picker';
import { OriginBadge } from './origin-badge';

/** Items shown in the aside before "Show all". */
export const PANEL_TOP = 5;
/** Items shown by the compact panel of a record page (U29). */
export const PANEL_TOP_COMPACT = 3;
/** Suggestions shown in the aside before "Show all". */
const PANEL_SUGGESTIONS = 3;

interface PanelRow {
  readonly groupKey: string;
  readonly groupLabel: string;
  readonly groupCount: number;
  /** First row of its group (renders the group heading). */
  readonly first: boolean;
  readonly item: ConnectionItem;
}

/**
 * "Connected to" summary in a record's aside (P4): how many records,
 * requirements and tasks the record is connected to, the first five
 * connections grouped by type (with how each came about), the links the system
 * suggests (accept / dismiss), "Link to…", "Show map" and "Show all" (the
 * Related tab). Shares its data with the Related tab through
 * {@link ConnectionsStore}.
 *
 * `compact` (record pages, U29): the first three connections, "Link to…" and
 * "Show all" only. The record page offers the map and "Ask about the
 * connections" in its "Mer ⋯" menu and the suggestions in "Hva mangler".
 */
@Component({
  selector: 'app-connections-panel',
  imports: [TranslocoPipe, Icon, EntityChip, OriginBadge, LinkPicker, ConnectionMap],
  providers: [provideConnectionsStore()],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      [class]="
        variant() === 'section'
          ? 'block'
          : 'rounded-card border border-border bg-surface p-4 shadow-card'
      "
      [attr.data-variant]="variant()"
      [attr.aria-labelledby]="headingId"
      data-testid="connections-panel"
      data-tour="kit-connections"
    >
      <div class="mb-1 flex items-center justify-between gap-2">
        <h2
          [id]="headingId"
          class="font-display font-bold text-fg"
          [class]="variant() === 'section' ? 'text-ui' : 'text-card'"
        >
          {{ 'kit.connections.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <button
            type="button"
            class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
            (click)="pickerOpen.set(true)"
            data-testid="connections-link"
          >
            <app-icon name="link" [size]="13" />
            {{ 'kit.connections.linkTo' | transloco }}
          </button>
        }
      </div>

      @if (store.loading()) {
        <div class="flex flex-col gap-2 py-1" aria-busy="true">
          <span class="sr-only">{{ 'common.loading' | transloco }}</span>
          <div class="h-3 w-2/3 animate-pulse rounded bg-surface-2"></div>
          <div class="h-3 w-5/6 animate-pulse rounded bg-surface-2"></div>
          <div class="h-3 w-1/2 animate-pulse rounded bg-surface-2"></div>
        </div>
      } @else if (store.errorKey(); as key) {
        <p class="text-meta text-fg-muted">{{ key | transloco }}</p>
        <button
          type="button"
          class="mt-1 text-meta font-semibold text-accent hover:underline"
          (click)="store.reload()"
        >
          {{ 'kit.connections.retry' | transloco }}
        </button>
      } @else {
        @if (summary()) {
          <p class="text-meta text-fg-muted" data-testid="connections-summary">
            {{ summary() }}
          </p>
        }

        @if (actionErrorKey(); as key) {
          <p class="mt-2 text-meta text-fail-ink" role="alert">{{ key | transloco }}</p>
        }

        @if (canEdit() && suggestions().length > 0 && !compact()) {
          <div
            class="mt-3 rounded-tile border border-dashed border-accent-border bg-accent-soft/40 p-2.5"
            data-testid="connections-suggestions"
          >
            <p class="mb-1.5 flex items-center gap-1.5 text-meta font-semibold text-fg">
              <app-icon name="spark" [size]="13" />
              {{ 'kit.connections.suggestedTitle' | transloco: { count: suggestionTotal() } }}
            </p>
            <ul class="flex flex-col gap-2">
              @for (s of shownSuggestions(); track s.id) {
                <li class="flex flex-col gap-1" data-testid="connection-suggestion">
                  <app-entity-chip [ref]="s.other" [stacked]="true" />
                  <p class="text-micro text-fg-muted">{{ reasonKey(s.reason) | transloco }}</p>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="inline-flex min-h-6 items-center gap-1 rounded-tile border border-border bg-surface px-2 text-meta font-semibold text-fg hover:border-border-strong disabled:opacity-60"
                      [disabled]="busyId() !== null"
                      [attr.aria-label]="
                        'kit.connections.acceptNamed' | transloco: { title: s.other.title }
                      "
                      (click)="accept(s)"
                    >
                      <app-icon name="check" [size]="13" />
                      {{ 'kit.connections.accept' | transloco }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-6 items-center rounded-tile px-2 text-meta font-semibold text-fg-muted hover:text-fg disabled:opacity-60"
                      [disabled]="busyId() !== null"
                      [attr.aria-label]="
                        'kit.connections.dismissNamed' | transloco: { title: s.other.title }
                      "
                      (click)="dismiss(s)"
                    >
                      {{ 'kit.connections.dismiss' | transloco }}
                    </button>
                  </div>
                </li>
              }
            </ul>
            @if (suggestionTotal() > shownSuggestions().length && relatedTab()) {
              <button
                type="button"
                class="mt-2 text-meta font-semibold text-accent hover:underline"
                (click)="showAll.emit()"
              >
                {{ 'kit.connections.moreSuggestions' | transloco: { count: suggestionTotal() } }}
              </button>
            }
          </div>
        }

        @if (rows().length === 0) {
          <p
            class="text-meta text-fg-muted"
            [class.mt-3]="variant() !== 'section'"
            data-testid="connections-empty"
          >
            {{
              (variant() === 'section'
                ? 'kit.connections.emptyShort'
                : canEdit()
                  ? 'kit.connections.emptyEdit'
                  : 'kit.connections.empty'
              ) | transloco
            }}
          </p>
        } @else {
          <ul class="mt-3 flex flex-col gap-2.5" data-testid="connections-top">
            @for (row of rows(); track row.groupKey + ':' + row.item.other.entity_id) {
              <li class="flex min-w-0 flex-col gap-0.5" data-testid="connection-row">
                <app-entity-chip [ref]="row.item.other" [stacked]="true" />
                @if (hasDetail(row.item)) {
                  <span class="flex flex-wrap items-center gap-1.5 text-micro text-fg-subtle">
                    @if (row.item.link_type !== 'relates_to') {
                      {{ relationKey(row.item) | transloco }}
                    }
                    <app-origin-badge [item]="row.item" />
                  </span>
                }
              </li>
            }
          </ul>
        }

        <div
          class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden"
          [class.border-t]="variant() !== 'section'"
          [class.border-border]="variant() !== 'section'"
          [class.pt-3]="variant() !== 'section'"
        >
          @if (relatedTab() && total() > 0) {
            <button
              type="button"
              class="inline-flex min-h-6 items-center text-meta font-semibold text-accent hover:underline"
              (click)="showAll.emit()"
              data-testid="connections-show-all"
            >
              {{ 'kit.connections.showAll' | transloco: { count: total() } }}
            </button>
          }
          @if (!compact()) {
            <button
              type="button"
              class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
              (click)="mapOpen.set(true)"
              data-testid="connections-map"
            >
              <app-icon name="grid" [size]="13" />
              {{ 'kit.connections.showMap' | transloco }}
            </button>
          }
          @if (aiAvailable() && !compact()) {
            <button
              type="button"
              class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
              (click)="askAbout()"
              data-testid="connections-ask"
            >
              <app-icon name="spark" [size]="13" />
              {{ 'kit.connections.askAbout' | transloco }}
            </button>
          }
        </div>
      }
    </section>

    @if (canEdit()) {
      <app-link-picker
        [open]="pickerOpen()"
        [sourceType]="entityType()"
        [sourceId]="entityId()"
        [existing]="existingLinks()"
        (linked)="onLinked()"
        (closed)="pickerOpen.set(false)"
      />
    }
    @if (!compact()) {
      <app-connection-map
        [open]="mapOpen()"
        [entityType]="entityType()"
        [entityId]="entityId()"
        (closed)="mapOpen.set(false)"
      />
    }
  `,
})
export class ConnectionsPanel {
  protected readonly store = inject(ConnectionsStore);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Whether the user can edit this record (link, accept / dismiss suggestions). */
  readonly canEdit = input(false);
  /** Whether a Related tab exists to "show all" in. */
  readonly relatedTab = input(true);
  /** Record-page variant (U29): top three, no suggestions, map or ask here. */
  readonly compact = input(false);
  /**
   * `card` (own card) or `section` (a part of the record page's "Oppfølging" card,
   * docs/ux-guide.md §2.7): no frame, only counts above zero, no requirement counts
   * (the card lists the requirements right above) and a short empty state.
   */
  readonly variant = input<'card' | 'section'>('card');
  /** Entity types listed after the others in the top rows (e.g. an indicator's measurements). */
  readonly lastTypes = input<readonly string[]>([]);
  /** "Show all" / "more suggestions": open the Related tab. */
  readonly showAll = output<void>();

  protected readonly headingId = `cf-connections-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly pickerOpen = signal(false);
  protected readonly mapOpen = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly actionErrorKey = signal<string | null>(null);

  protected readonly total = computed(() => this.store.relatedCount());
  protected readonly suggestions = computed(() => this.store.suggestions());
  protected readonly suggestionTotal = computed(() =>
    Math.max(this.store.counts().suggestions, this.suggestions().length),
  );
  protected readonly shownSuggestions = computed(() =>
    this.suggestions().slice(0, PANEL_SUGGESTIONS),
  );

  protected readonly summary = computed(() => {
    const c = this.store.counts();
    const parts: string[] = [];
    const t = (key: string, count: number) =>
      this.language.translate(`kit.connections.counts.${key}`, { count });
    if (this.variant() === 'section') {
      if (c.records > 0) parts.push(t(c.records === 1 ? 'recordsOne' : 'records', c.records));
      if (c.tasks > 0) parts.push(t(c.tasks === 1 ? 'tasksOne' : 'tasks', c.tasks));
      return parts.join(' · ');
    }
    parts.push(t(c.records === 1 ? 'recordsOne' : 'records', c.records));
    if (this.store.full()) {
      parts.push(t(c.requirements === 1 ? 'requirementsOne' : 'requirements', c.requirements));
      const suggested = this.store.data().requirements.suggested;
      if (suggested > 0) {
        parts.push(
          t(suggested === 1 ? 'requirementSuggestionsOne' : 'requirementSuggestions', suggested),
        );
      }
    }
    parts.push(t(c.tasks === 1 ? 'tasksOne' : 'tasks', c.tasks));
    return parts.join(' · ');
  });

  /** The first {@link PANEL_TOP} connections, records before tasks, with group headings. */
  protected readonly rows = computed<readonly PanelRow[]>(() => {
    const top = this.compact() ? PANEL_TOP_COMPACT : PANEL_TOP;
    const out: PanelRow[] = [];
    const last = this.lastTypes();
    const groups = [...this.store.groups()].sort(
      (a, b) => Number(last.includes(a.entity_type)) - Number(last.includes(b.entity_type)),
    );
    for (const group of groups) {
      if (out.length >= top) {
        break;
      }
      const label = this.entityTypes.label(group.entity_type, group.label_key);
      group.items.slice(0, top - out.length).forEach((item, index) =>
        out.push({
          groupKey: group.entity_type,
          groupLabel: label,
          groupCount: group.count,
          first: index === 0,
          item,
        }),
      );
    }
    return out;
  });

  /** User links in the picker's shape, so it can mark already-linked results. */
  protected readonly existingLinks = computed<readonly LinkItem[]>(() =>
    this.store
      .groups()
      .flatMap((g) => g.items)
      .filter((i) => i.link_id)
      .map((i) => ({
        id: i.link_id as string,
        link_type: i.link_type,
        direction: i.direction,
        other: i.other,
        created_at: i.created_at ?? '',
        created_by: null,
      })),
  );

  constructor() {
    this.entityTypes.ensureLoaded();
    effect(() => {
      this.selectedOrg.currentOrgId();
      const type = this.entityType();
      const id = this.entityId();
      untracked(() => this.store.setRecord(type, id));
    });
  }

  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected askAbout(): void {
    this.ask.showWith(
      this.language.translate('kit.connections.askPrompt', {
        type: this.entityTypes.label(this.entityType()),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
    );
  }

  /** Whether a row needs its second line (a specific relationship or an origin badge). */
  protected hasDetail(item: ConnectionItem): boolean {
    return item.link_type !== 'relates_to' || (!!item.origin && item.origin !== 'user');
  }

  protected relationKey(item: ConnectionItem): string {
    return linkTypeKey(item.link_type, item.direction);
  }

  protected reasonKey(reason: string): string {
    return suggestionReasonKey(reason);
  }

  protected onLinked(): void {
    this.pickerOpen.set(false);
    this.store.linked();
  }

  protected accept(s: LinkSuggestionItem): void {
    this.decide(s, true);
  }

  protected dismiss(s: LinkSuggestionItem): void {
    this.decide(s, false);
  }

  private decide(s: LinkSuggestionItem, accept: boolean): void {
    this.busyId.set(s.id);
    this.actionErrorKey.set(null);
    (accept ? this.store.accept(s) : this.store.dismiss(s)).subscribe({
      next: () => this.busyId.set(null),
      error: (error: unknown) => {
        this.busyId.set(null);
        this.actionErrorKey.set(kitErrorKey(error));
        this.store.reload();
      },
    });
  }
}
