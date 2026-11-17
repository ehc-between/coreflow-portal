import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, of, skip, switchMap } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';

/** A record picked from the search (what the forms keep). */
export interface PickedRecord {
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
}

export function pickedFrom(item: SearchItem): PickedRecord {
  return { id: item.entity_id, title: item.title, code: item.code };
}

let nextId = 0;

/**
 * Search box over records of some types (global search, only what the caller
 * may read), e.g. the controlled document that carries a policy or the
 * processes inside a scope. Emits the picked record and clears itself. The
 * label is the host's `app-form-field`: give it the same `inputId`.
 */
@Component({
  selector: 'app-context-record-search',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <input
      [id]="inputId() || autoId"
      type="search"
      role="combobox"
      aria-autocomplete="list"
      [attr.aria-controls]="listId"
      [attr.aria-expanded]="results().length > 0"
      [attr.aria-describedby]="describedBy() || null"
      [value]="query()"
      [placeholder]="placeholderKey() | transloco"
      (input)="query.set($any($event.target).value)"
      (keydown.escape)="results.set([])"
    />
    @if (results().length) {
      <ul
        [id]="listId"
        role="listbox"
        class="mt-1 max-h-56 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
      >
        @for (item of results(); track item.entity_id) {
          <li role="option" [attr.aria-selected]="false">
            <button
              type="button"
              class="w-full rounded-md px-2.5 py-1.5 text-left text-ui text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              [disabled]="excluded().includes(item.entity_id)"
              (click)="pick(item)"
            >
              @if (item.code) {
                <span class="font-mono text-meta text-fg-muted">{{ item.code }}</span>
              }
              {{ item.title }}
            </button>
          </li>
        }
      </ul>
    } @else if (searched() && query().trim()) {
      <p class="mt-1 text-meta text-fg-muted" role="status">
        {{ noMatchesKey() | transloco }}
      </p>
    }
  `,
})
export class RecordSearch {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity types to search, e.g. `['document']` or `['process']`. */
  readonly types = input.required<readonly string[]>();
  readonly inputId = input('');
  readonly placeholderKey = input('context.search.placeholder');
  readonly noMatchesKey = input('context.search.noMatches');
  readonly describedBy = input('');
  /** Ids that are already chosen (shown, but not pickable). */
  readonly excluded = input<readonly string[]>([]);
  readonly picked = output<PickedRecord>();

  protected readonly autoId = `cf-record-search-${++nextId}`;
  protected readonly listId = `${this.autoId}-results`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searched = signal(false);

  constructor() {
    const sub = toObservable(this.query)
      .pipe(
        skip(1),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || !q.trim()) {
            return of(null);
          }
          return this.search
            .search(orgId, q, { types: [...this.types()], limit: 8 })
            .pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((response) => {
        this.results.set(response?.items ?? []);
        this.searched.set(response !== null);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected pick(item: SearchItem): void {
    this.results.set([]);
    this.query.set('');
    this.searched.set(false);
    this.picked.emit(pickedFrom(item));
  }
}
