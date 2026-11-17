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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { EntityChip, EntityChipRef } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';

const DEBOUNCE_MS = 200;
/** Types that are not records to link to (requirements are linked in their own field). */
const EXCLUDED_TYPES = new Set(['standard_requirement', 'standard', 'guidance', 'howto']);

let nextId = 0;

/**
 * Picks records to connect a new document to (its process, the risk it
 * controls, the obligation it meets …) before the document exists. Searches
 * every record type the user may read (global search); picked records show as
 * entity chips and are sent with the create request, which links them. `types`
 * narrows the search (e.g. `['process']`).
 */
@Component({
  selector: 'app-record-picker',
  imports: [TranslocoPipe, Icon, EntityChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (value().length > 0) {
      <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="record-picker-value">
        @for (ref of value(); track ref.entity_type + ref.entity_id) {
          <li class="inline-flex max-w-full items-center gap-1">
            <app-entity-chip [ref]="ref" />
            <button
              type="button"
              class="flex flex-none rounded-full p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail"
              [attr.aria-label]="'documents.link.removeRecord' | transloco: { title: ref.title }"
              (click)="remove(ref)"
            >
              <app-icon name="x" [size]="12" />
            </button>
          </li>
        }
      </ul>
    }
    <div class="relative">
      <input
        type="search"
        role="combobox"
        autocomplete="off"
        [id]="inputId() || autoId"
        [value]="query()"
        [placeholder]="'documents.link.recordPlaceholder' | transloco"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        aria-autocomplete="list"
        (input)="onInput($any($event.target).value)"
        (keydown.escape)="open.set(false)"
        data-testid="record-picker-input"
      />
      @if (open()) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          @if (searching()) {
            <li class="px-3 py-2 text-ui text-fg-muted">{{ 'common.loading' | transloco }}</li>
          } @else {
            @for (hit of results(); track hit.entity_type + hit.entity_id) {
              <li role="option" [attr.aria-selected]="false">
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col items-start rounded-tile px-3 py-2 text-left hover:bg-surface-2"
                  (click)="pick(hit)"
                  data-testid="record-picker-option"
                >
                  <span class="text-micro font-semibold text-fg-subtle">{{
                    hit.label_key | transloco
                  }}</span>
                  <span class="w-full truncate text-ui text-fg">
                    @if (hit.code) {
                      <span class="font-mono text-meta text-fg-subtle">{{ hit.code }}</span>
                    }
                    {{ hit.title }}
                  </span>
                </button>
              </li>
            } @empty {
              <li class="px-3 py-2 text-ui text-fg-muted">
                {{ 'documents.link.noRecords' | transloco }}
              </li>
            }
          }
        </ul>
      }
    </div>
  `,
})
export class RecordPicker {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly value = input<readonly EntityChipRef[]>([]);
  readonly types = input<readonly string[] | null>(null);
  readonly inputId = input<string | null>(null);
  readonly max = input(20);
  readonly valueChange = output<readonly EntityChipRef[]>();

  protected readonly autoId = `record-picker-${++nextId}`;
  protected readonly listId = `${this.autoId}-list`;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly searching = signal(false);
  private readonly hits = signal<readonly SearchItem[]>([]);

  protected readonly results = computed(() => {
    const picked = new Set(this.value().map((r) => `${r.entity_type}:${r.entity_id}`));
    return this.hits().filter(
      (hit) =>
        !EXCLUDED_TYPES.has(hit.entity_type) && !picked.has(`${hit.entity_type}:${hit.entity_id}`),
    );
  });

  private readonly query$ = new Subject<string>();

  constructor() {
    const sub = this.query$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || !q.trim()) {
            return of({ items: [], counts: {} });
          }
          return this.search
            .search(orgId, q, { types: this.types() ?? undefined, limit: 12 })
            .pipe(catchError(() => of({ items: [], counts: {} })));
        }),
      )
      .subscribe((res) => {
        this.hits.set(res.items);
        this.searching.set(false);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected onInput(text: string): void {
    this.query.set(text);
    const q = text.trim();
    this.open.set(q.length > 0);
    this.searching.set(q.length > 0);
    this.query$.next(q);
  }

  protected pick(hit: SearchItem): void {
    if (this.value().length >= this.max()) {
      return;
    }
    const ref: EntityChipRef = {
      entity_type: hit.entity_type,
      entity_id: hit.entity_id,
      title: hit.title,
      code: hit.code,
      url: hit.url,
      label_key: hit.label_key,
      module: hit.module,
    };
    this.valueChange.emit([...this.value(), ref]);
    this.query.set('');
    this.open.set(false);
    this.hits.set([]);
  }

  protected remove(ref: EntityChipRef): void {
    this.valueChange.emit(
      this.value().filter(
        (r) => !(r.entity_type === ref.entity_type && r.entity_id === ref.entity_id),
      ),
    );
  }
}
