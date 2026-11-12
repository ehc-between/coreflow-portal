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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { Alert } from '../ui/alert/alert';
import { Button } from '../ui/button/button';
import { ConfirmDialog } from '../ui/confirm-dialog/confirm-dialog';
import { Icon } from '../ui/icon/icon';
import { EntityChip } from './entity-chip';
import { linkTypeKey } from './kit-format';
import { provideKitScope } from './kit-scope';
import { LinkPicker } from './link-picker';

/** Links sharing one relationship wording, e.g. every "Caused by". */
interface LinkGroup {
  readonly key: string;
  readonly labelKey: string;
  readonly items: readonly LinkItem[];
}

/**
 * Typed links between this record and any other (entity links, F8): grouped by
 * relationship as read from this record ("Caused by", "Mitigated by", …), each
 * linking to the other record's page. Editors can link a record (search picker)
 * and remove links. `linkTypes` limits both the list and the picker.
 */
@Component({
  selector: 'app-related-items',
  imports: [TranslocoPipe, Alert, Button, ConfirmDialog, Icon, EntityChip, LinkPicker],
  providers: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" data-tour="kit-related">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'kit.related.title' | transloco }}
          @if (items().length > 0) {
            <span class="ml-1 text-[13px] font-semibold text-fg-subtle">{{ items().length }}</span>
          }
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          @if (aiAvailable()) {
            <app-button size="sm" variant="ghost" (click)="suggest()">
              <app-icon name="spark" [size]="14" />
              {{ 'kit.related.suggest' | transloco }}
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

      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (loadErrorKey(); as key) {
        <p class="text-[13px] text-fg-muted">{{ key | transloco }}</p>
      } @else if (items().length === 0) {
        <div
          class="rounded-[10px] border border-dashed border-border px-4 py-5"
          data-testid="related-empty"
        >
          <p class="text-[13.5px] font-semibold text-fg">{{ 'kit.related.empty' | transloco }}</p>
          <p class="mt-1 text-[12.5px] text-fg-muted">{{ 'kit.related.emptyHint' | transloco }}</p>
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          @for (group of groups(); track group.key) {
            <div>
              <h3
                class="mb-1.5 text-[11.5px] font-semibold tracking-[0.04em] text-fg-subtle uppercase"
              >
                {{ group.labelKey | transloco }}
              </h3>
              <ul class="flex flex-col divide-y divide-border rounded-[10px] border border-border">
                @for (link of group.items; track link.id) {
                  <li class="flex items-center justify-between gap-3 px-3 py-2" data-testid="link">
                    <div class="min-w-0 flex-1">
                      <app-entity-chip [ref]="link.other" />
                      @if (link.created_by?.name; as name) {
                        <p class="mt-0.5 text-[11.5px] text-fg-subtle">
                          {{ 'kit.related.linkedBy' | transloco: { name } }}
                        </p>
                      }
                    </div>
                    @if (canEdit()) {
                      <button
                        type="button"
                        class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                        [attr.aria-label]="
                          'kit.related.removeNamed' | transloco: { title: link.other.title }
                        "
                        [disabled]="removingId() === link.id"
                        (click)="confirmRemove.set(link)"
                      >
                        <app-icon name="trash" [size]="15" />
                      </button>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </section>

    @if (canEdit()) {
      <app-link-picker
        [open]="pickerOpen()"
        [sourceType]="entityType()"
        [sourceId]="entityId()"
        [linkTypes]="linkTypes()"
        [existing]="items()"
        (linked)="onLinked($event)"
        (closed)="pickerOpen.set(false)"
      />
    }

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
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Whether the user can edit this record (link + unlink). */
  readonly canEdit = input(false);
  /** Only show / offer these link types (default: all). */
  readonly linkTypes = input<readonly string[] | undefined>(undefined);

  protected readonly headingId = `cf-related-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly items = signal<readonly LinkItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly actionErrorKey = signal<string | null>(null);
  protected readonly pickerOpen = signal(false);
  protected readonly confirmRemove = signal<LinkItem | null>(null);
  protected readonly removingId = signal<string | null>(null);

  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly groups = computed<readonly LinkGroup[]>(() => {
    const groups = new Map<string, LinkItem[]>();
    for (const link of this.items()) {
      const labelKey = linkTypeKey(link.link_type, link.direction);
      const list = groups.get(labelKey) ?? [];
      list.push(link);
      groups.set(labelKey, list);
    }
    return [...groups.entries()].map(([labelKey, items]) => ({ key: labelKey, labelKey, items }));
  });

  private loadSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      const linkTypes = this.linkTypes();
      untracked(() => this.load(orgId, entityType, entityId, linkTypes));
    });
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  protected onLinked(link: LinkItem): void {
    this.items.update((items) => [link, ...items.filter((i) => i.id !== link.id)]);
    this.pickerOpen.set(false);
    this.actionErrorKey.set(null);
  }

  protected remove(): void {
    const link = this.confirmRemove();
    const orgId = this.selectedOrg.currentOrgId();
    if (!link || !orgId) {
      return;
    }
    this.removingId.set(link.id);
    this.api.deleteLink(orgId, link.id).subscribe({
      next: () => {
        this.removingId.set(null);
        this.confirmRemove.set(null);
        this.items.update((items) => items.filter((i) => i.id !== link.id));
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

  private load(
    orgId: string | null,
    entityType: string,
    entityId: string,
    linkTypes: readonly string[] | undefined,
  ): void {
    this.loadSub?.unsubscribe();
    this.items.set([]);
    this.loadErrorKey.set(null);
    this.actionErrorKey.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadSub = this.api.links(orgId, entityType, entityId, linkTypes).subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadErrorKey.set(kitErrorKey(error));
        this.loading.set(false);
      },
    });
  }
}
