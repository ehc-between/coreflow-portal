import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';

const MIN_QUERY = 2;
const MAX_CHOSEN = 20;
let nextId = 0;

/**
 * Pick records of other modules before the record exists (e.g. the processes,
 * documents, suppliers and risks a change affects): a search over the given types
 * (global search) that adds results to a removable chip list. The value is the list
 * of chosen search hits; the parent sends `{entity_type, entity_id}` on save.
 */
@Component({
  selector: 'app-asset-related-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <div class="relative">
        <input
          [id]="inputId()"
          type="search"
          autocomplete="off"
          role="combobox"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="listId"
          [attr.aria-describedby]="describedBy() || null"
          [placeholder]="'assets.related.searchPlaceholder' | transloco"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown.escape)="query.set('')"
        />
        @if (open()) {
          <ul
            [id]="listId"
            role="listbox"
            class="absolute right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
          >
            @for (hit of results(); track hit.entity_type + hit.entity_id) {
              <li role="option" [attr.aria-selected]="false">
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui hover:bg-surface-2"
                  (click)="add(hit)"
                >
                  <span
                    class="flex-none text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase"
                    >{{ typeLabel(hit.entity_type) }}</span
                  >
                  @if (hit.code) {
                    <span class="flex-none font-mono text-meta text-fg-muted">{{ hit.code }}</span>
                  }
                  <span class="min-w-0 truncate text-fg">{{ hit.title }}</span>
                </button>
              </li>
            } @empty {
              <li class="px-2.5 py-1.5 text-meta text-fg-muted">
                {{ 'assets.related.noResults' | transloco }}
              </li>
            }
          </ul>
        }
      </div>
      @if (value().length) {
        <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="'assets.related.chosen' | transloco">
          @for (r of value(); track r.entity_type + r.entity_id) {
            <li
              class="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5"
            >
              <app-entity-chip
                [ref]="{
                  entity_type: r.entity_type,
                  entity_id: r.entity_id,
                  code: r.code,
                  title: r.title,
                  url: null,
                }"
                [showType]="true"
              />
              <button
                type="button"
                class="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg"
                [attr.aria-label]="'assets.related.remove' | transloco: { name: r.title }"
                (click)="remove(r)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AssetRelatedPicker {
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);

  readonly inputId = input('');
  readonly describedBy = input('');
  /** Entity types to search (e.g. process, document, supplier, risk). */
  readonly types = input.required<readonly string[]>();
  readonly value = input<readonly SearchHit[]>([]);
  readonly valueChange = output<readonly SearchHit[]>();

  protected readonly listId = `ast-related-list-${++nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly open = computed(() => this.query().trim().length >= MIN_QUERY);

  constructor() {
    const sub = toObservable(this.query)
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          const text = q.trim();
          if (!orgId || text.length < MIN_QUERY) {
            return of({ items: [] as readonly SearchHit[] });
          }
          return this.kit
            .search(orgId, text, { types: this.types(), limit: 12 })
            .pipe(catchError(() => of({ items: [] as readonly SearchHit[] })));
        }),
      )
      .subscribe((res) => {
        const taken = new Set(this.value().map((v) => `${v.entity_type}:${v.entity_id}`));
        this.results.set(
          res.items.filter(
            (h) =>
              this.types().includes(h.entity_type) && !taken.has(`${h.entity_type}:${h.entity_id}`),
          ),
        );
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected typeLabel(type: string): string {
    return this.entityTypes.label(type, null);
  }

  protected add(hit: SearchHit): void {
    const current = this.value();
    if (current.length >= MAX_CHOSEN) {
      return;
    }
    this.valueChange.emit([...current, hit]);
    this.query.set('');
    this.results.set([]);
  }

  protected remove(hit: SearchHit): void {
    this.valueChange.emit(
      this.value().filter(
        (v) => !(v.entity_type === hit.entity_type && v.entity_id === hit.entity_id),
      ),
    );
  }
}
