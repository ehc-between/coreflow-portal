import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { ConnectionItem, LinkSuggestionItem } from '../../core/kit/connections.models';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { Alert } from '../ui/alert/alert';
import { Button } from '../ui/button/button';
import { ConfirmDialog } from '../ui/confirm-dialog/confirm-dialog';
import { Icon } from '../ui/icon/icon';
import { ConnectionMap } from './connection-map';
import { ConnectionsStore, provideConnectionsStore } from './connections-store';
import { EntityChip } from './entity-chip';
import { linkTypeKey, suggestionReasonKey } from './kit-format';
import { provideKitScope } from './kit-scope';
import { LinkPicker } from './link-picker';
import { OriginBadge } from './origin-badge';

/** Connections to one record type ("Risiko · 3"), records before tasks. */
interface TypeGroup {
  readonly key: string;
  readonly label: string;
  readonly kind: 'record' | 'task';
  readonly count: number;
  readonly items: readonly ConnectionItem[];
}

/**
 * Everything this record is connected to (P4 upgrade of the F8 related list):
 * grouped by record type, each connection with its relationship ("Caused by",
 * "Mitigated by", …) and how it came about ("Automatic", "Via field", "Source",
 * "AI suggestion"). Above the list: links the system suggests, to accept or
 * dismiss. Editors link records of any searchable type (picker) and remove the
 * links people made; field relations are changed on the record itself.
 * `linkTypes` limits the list and the picker to some relationships.
 */
@Component({
  selector: 'app-related-items',
  imports: [
    TranslocoPipe,
    Alert,
    Button,
    ConfirmDialog,
    Icon,
    EntityChip,
    OriginBadge,
    LinkPicker,
    ConnectionMap,
  ],
  providers: [provideConnectionsStore()],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" data-tour="kit-related">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-section font-bold text-fg">
          {{ 'kit.related.title' | transloco }}
          @if (total() > 0) {
            <span class="ml-1 text-ui font-semibold text-fg-subtle">{{ total() }}</span>
          }
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          @if (aiAvailable()) {
            <app-button size="sm" variant="ghost" (click)="suggest()">
              <app-icon name="spark" [size]="14" />
              {{ 'kit.related.suggest' | transloco }}
            </app-button>
          }
          @if (total() > 0 || requirementCount() > 0) {
            <app-button
              size="sm"
              variant="ghost"
              (click)="mapOpen.set(true)"
              data-testid="related-map"
            >
              <app-icon name="grid" [size]="14" />
              {{ 'kit.connections.showMap' | transloco }}
            </app-button>
          }
          @if (canEdit()) {
            <app-button
              size="sm"
              variant="secondary"
              (click)="pickerOpen.set(true)"
              data-testid="related-add"
            >
              <app-icon name="link" [size]="14" />
              {{ 'kit.related.add' | transloco }}
            </app-button>
          }
        </div>
      </div>

      @if (actionErrorKey(); as key) {
        <div class="mb-3">
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        </div>
      }

      @if (store.loading()) {
        <div class="flex flex-col gap-2" aria-busy="true">
          <span class="sr-only">{{ 'common.loading' | transloco }}</span>
          @for (row of [1, 2, 3]; track row) {
            <div class="h-10 animate-pulse rounded-tile bg-surface-2"></div>
          }
        </div>
      } @else if (store.errorKey(); as key) {
        <div class="rounded-tile border border-border px-4 py-4">
          <p class="text-ui text-fg-muted">{{ key | transloco }}</p>
          <button
            type="button"
            class="mt-1 text-ui font-semibold text-accent hover:underline"
            (click)="store.reload()"
          >
            {{ 'kit.connections.retry' | transloco }}
          </button>
        </div>
      } @else {
        @if (canEdit() && suggestions().length > 0) {
          <div
            class="mb-4 rounded-tile border border-dashed border-accent-border bg-accent-soft/40 p-3"
            data-testid="related-suggestions"
          >
            <h3 class="mb-2 flex items-center gap-1.5 text-ui font-semibold text-fg">
              <app-icon name="spark" [size]="14" />
              {{ 'kit.connections.suggestedTitle' | transloco: { count: suggestions().length } }}
            </h3>
            <p class="mb-2 text-meta text-fg-muted">
              {{ 'kit.connections.suggestedHint' | transloco }}
            </p>
            <ul
              class="flex flex-col divide-y divide-border rounded-tile border border-border bg-surface"
            >
              @for (s of suggestions(); track s.id) {
                <li
                  class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  data-testid="suggestion"
                >
                  <div class="min-w-0 flex-1">
                    <app-entity-chip [ref]="s.other" />
                    <p class="mt-0.5 text-micro text-fg-subtle">
                      {{ reasonKey(s.reason) | transloco }}
                    </p>
                  </div>
                  <div class="flex flex-none gap-2">
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="busyId() === s.id"
                      [disabled]="busyId() !== null"
                      (click)="decide(s, true)"
                    >
                      <app-icon name="check" [size]="14" />
                      {{ 'kit.connections.accept' | transloco }}
                    </app-button>
                    <app-button
                      size="sm"
                      variant="ghost"
                      [disabled]="busyId() !== null"
                      (click)="decide(s, false)"
                    >
                      {{ 'kit.connections.dismiss' | transloco }}
                    </app-button>
                  </div>
                </li>
              }
            </ul>
          </div>
        }

        @if (groups().length === 0) {
          <div
            class="rounded-tile border border-dashed border-border px-4 py-5"
            data-testid="related-empty"
          >
            <p class="text-ui font-semibold text-fg">{{ 'kit.related.empty' | transloco }}</p>
            <p class="mt-1 text-meta text-fg-muted">{{ 'kit.related.emptyHint' | transloco }}</p>
          </div>
        } @else {
          <div class="flex flex-col gap-4">
            @for (group of groups(); track group.key) {
              <div data-testid="related-group">
                <h3
                  class="mb-1.5 text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                >
                  {{ group.label }} · {{ group.count }}
                </h3>
                <ul class="flex flex-col divide-y divide-border rounded-tile border border-border">
                  @for (item of group.items; track itemKey(item)) {
                    <li
                      class="flex items-center justify-between gap-3 px-3 py-2"
                      data-testid="link"
                    >
                      <div class="min-w-0 flex-1">
                        <app-entity-chip
                          [ref]="item.other"
                          [statusText]="true"
                          [showType]="false"
                        />
                        @if (item.link_type !== 'relates_to' || item.origin !== 'user') {
                          <p
                            class="mt-0.5 flex flex-wrap items-center gap-1.5 text-micro text-fg-subtle"
                          >
                            @if (item.link_type !== 'relates_to') {
                              <span data-testid="link-relation">{{
                                relationKey(item) | transloco
                              }}</span>
                            }
                            <app-origin-badge [item]="item" />
                          </p>
                        }
                      </div>
                      @if (canEdit() && removable(item)) {
                        <button
                          type="button"
                          class="flex flex-none rounded-tile p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                          [attr.aria-label]="
                            'kit.related.removeNamed' | transloco: { title: item.other.title }
                          "
                          [disabled]="removingId() === item.link_id"
                          (click)="confirmRemove.set(item)"
                        >
                          <app-icon name="trash" [size]="15" />
                        </button>
                      }
                    </li>
                  }
                </ul>
                @if (group.count > group.items.length) {
                  <p class="mt-1 text-micro text-fg-subtle">
                    {{
                      'kit.related.moreInGroup'
                        | transloco: { shown: group.items.length, count: group.count }
                    }}
                  </p>
                }
              </div>
            }
          </div>
        }
      }
    </section>

    @if (canEdit()) {
      <app-link-picker
        [open]="pickerOpen()"
        [sourceType]="entityType()"
        [sourceId]="entityId()"
        [linkTypes]="linkTypes()"
        [existing]="existingLinks()"
        (linked)="onLinked()"
        (closed)="pickerOpen.set(false)"
      />
    }
    <app-connection-map
      [open]="mapOpen()"
      [entityType]="entityType()"
      [entityId]="entityId()"
      (closed)="mapOpen.set(false)"
    />

    <app-confirm-dialog
      [open]="confirmRemove() !== null"
      [title]="'kit.related.removeTitle' | transloco"
      [message]="
        'kit.related.removeMessage' | transloco: { title: confirmRemove()?.other?.title ?? '' }
      "
      [confirmLabel]="'kit.related.removeConfirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="removingId() !== null"
      (confirmed)="remove()"
      (cancelled)="confirmRemove.set(null)"
    />
  `,
})
export class RelatedItems {
  protected readonly store = inject(ConnectionsStore);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Whether the user can edit this record (link, unlink, decide suggestions). */
  readonly canEdit = input(false);
  /** Only show / offer these link types (default: all). */
  readonly linkTypes = input<readonly string[] | undefined>(undefined);

  protected readonly headingId = `cf-related-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly actionErrorKey = signal<string | null>(null);
  protected readonly pickerOpen = signal(false);
  protected readonly mapOpen = signal(false);
  protected readonly confirmRemove = signal<ConnectionItem | null>(null);
  protected readonly removingId = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly suggestions = computed(() => {
    const only = this.linkTypes();
    const all = this.store.suggestions();
    return only && only.length > 0 ? all.filter((s) => only.includes(s.link_type)) : all;
  });

  protected readonly groups = computed<readonly TypeGroup[]>(() => {
    const only = this.linkTypes();
    const filtered = !!only && only.length > 0;
    return this.store
      .groups()
      .map((g) => {
        const items = filtered ? g.items.filter((i) => only.includes(i.link_type)) : g.items;
        return {
          key: g.entity_type,
          label: this.entityTypes.label(g.entity_type, g.label_key),
          kind: g.kind,
          // With a filter the server total no longer applies.
          count: filtered ? items.length : Math.max(g.count, items.length),
          items,
        };
      })
      .filter((g) => g.items.length > 0);
  });

  protected readonly total = computed(() => this.groups().reduce((n, g) => n + g.count, 0));
  protected readonly requirementCount = computed(() => this.store.counts().requirements);

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

  protected itemKey(item: ConnectionItem): string {
    return item.link_id ?? `${item.origin}:${item.other.entity_type}:${item.other.entity_id}`;
  }

  protected relationKey(item: ConnectionItem): string {
    return linkTypeKey(item.link_type, item.direction);
  }

  protected reasonKey(reason: string): string {
    return suggestionReasonKey(reason);
  }

  /** Links people (or flows, rules, the assistant) made; field relations are not links. */
  protected removable(item: ConnectionItem): boolean {
    return !!item.link_id && item.origin !== 'structural';
  }

  protected onLinked(): void {
    this.pickerOpen.set(false);
    this.actionErrorKey.set(null);
    this.store.linked();
  }

  protected decide(s: LinkSuggestionItem, accept: boolean): void {
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

  protected remove(): void {
    const item = this.confirmRemove();
    if (!item?.link_id) {
      return;
    }
    const linkId = item.link_id;
    this.removingId.set(linkId);
    this.store.unlink(linkId).subscribe({
      next: () => {
        this.removingId.set(null);
        this.confirmRemove.set(null);
      },
      error: (error: unknown) => {
        this.removingId.set(null);
        this.confirmRemove.set(null);
        this.actionErrorKey.set(kitErrorKey(error));
      },
    });
  }

  protected suggest(): void {
    this.ask.showWith(
      this.language.translate('kit.ai.suggestRelated', {
        type: this.entityTypes.label(this.entityType()),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
    );
  }
}
