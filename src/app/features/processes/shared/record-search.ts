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
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';

const MIN_QUERY = 2;
let nextId = 0;

/**
 * Search-as-you-type picker over records of the given types (F5 global search,
 * only records the caller may read). Shows each hit as an entity chip (type,
 * code, title) and emits the one picked. Keyboard: arrows move, Enter picks,
 * Escape clears. Used to link risks, KPIs, interested parties and other
 * records to a process.
 */
@Component({
  selector: 'app-process-record-search',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label [attr.for]="inputId" class="mb-1.5 block text-ui font-semibold text-fg-muted">
      {{ labelKey() | transloco }}
    </label>
    <div
      class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft"
    >
      <app-icon name="search" [size]="15" class="text-fg-subtle" />
      <input
        [id]="inputId"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-controls]="listId"
        [attr.aria-expanded]="results().length > 0"
        [attr.aria-activedescendant]="active() >= 0 ? listId + '-' + active() : null"
        class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
        [placeholder]="placeholderKey() | transloco"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKeydown($event)"
        data-testid="record-search-input"
      />
    </div>
    @if (query().trim().length >= minQuery) {
      <ul
        [id]="listId"
        role="listbox"
        class="mt-1.5 flex max-h-72 flex-col overflow-y-auto rounded-tile border border-border bg-surface p-1"
        data-testid="record-search-results"
      >
        @for (hit of results(); track hit.entity_type + hit.entity_id; let i = $index) {
          <li
            [id]="listId + '-' + i"
            role="option"
            [attr.aria-selected]="i === active()"
            class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-surface-2"
            [class.bg-surface-2]="i === active()"
            tabindex="-1"
            (click)="choose(hit)"
            (keydown.enter)="choose(hit)"
            (mousedown)="$event.preventDefault()"
          >
            <span class="pointer-events-none min-w-0 flex-1">
              <app-entity-chip [ref]="hit" />
            </span>
            @if (isExcluded(hit)) {
              <span class="text-meta text-fg-subtle">{{ 'processes.picker.linked' | transloco }}</span>
            }
          </li>
        } @empty {
          <li class="px-2.5 py-2 text-ui text-fg-muted">
            {{ (searching() ? 'common.loading' : 'processes.picker.noHits') | transloco }}
          </li>
        }
      </ul>
    } @else {
      <p class="mt-1.5 text-meta text-fg-subtle">{{ 'processes.picker.typeMore' | transloco }}</p>
    }
  `,
})
export class RecordSearch {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity types to search (e.g. `['risk', 'opportunity']`). */
  readonly types = input.required<readonly string[]>();
  readonly labelKey = input('processes.picker.search');
  readonly placeholderKey = input('processes.picker.placeholder');
  /** Records already linked: shown but not pickable. */
  readonly exclude = input<readonly string[]>([]);
  readonly picked = output<SearchHit>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly inputId = `cf-proc-search-${++nextId}`;
  protected readonly listId = `cf-proc-search-list-${nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly active = signal(-1);
  private readonly excluded = computed(() => new Set(this.exclude()));

  constructor() {
    const sub = toObservable(computed(() => ({ q: this.query().trim(), types: this.types() })))
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.q === b.q && a.types.join() === b.types.join()),
        switchMap(({ q, types }) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || q.length < MIN_QUERY) {
            return of<readonly SearchHit[]>([]);
          }
          this.searching.set(true);
          return this.api.search(orgId, q, { types, limit: 15 }).pipe(
            map((res) => res.items.filter((hit) => types.includes(hit.entity_type))),
            catchError(() => of<readonly SearchHit[]>([])),
          );
        }),
      )
      .subscribe((items) => {
        this.searching.set(false);
        this.results.set(items);
        this.active.set(items.length > 0 ? 0 : -1);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected isExcluded(hit: SearchHit): boolean {
    return this.excluded().has(hit.entity_id);
  }

  protected onInput(value: string): void {
    this.query.set(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.results();
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      this.active.set((this.active() + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      this.active.set((this.active() - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = items[this.active()];
      if (hit) {
        this.choose(hit);
      }
    } else if (event.key === 'Escape' && this.query()) {
      event.stopPropagation();
      this.query.set('');
    }
  }

  protected choose(hit: SearchHit): void {
    if (this.isExcluded(hit)) {
      return;
    }
    this.picked.emit(hit);
    this.query.set('');
    this.results.set([]);
  }
}
