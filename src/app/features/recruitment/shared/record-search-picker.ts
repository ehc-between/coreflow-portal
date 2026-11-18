import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { Icon } from '../../../shared/ui/icon/icon';

let nextId = 0;

/**
 * Find one record of another module by code or title (global search, limited to
 * `types`) and pick it: the privacy notice in Documents, a People position, the
 * record of processing, the DPIA or the AI system. Only records the caller can
 * read are found.
 */
@Component({
  selector: 'app-record-search-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="sr-only" [attr.for]="uid">{{ labelKey() | transloco }}</label>
    <div
      class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
    >
      <app-icon name="search" [size]="15" class="text-fg-subtle" />
      <input
        [id]="uid"
        type="search"
        autocomplete="off"
        class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
        [placeholder]="placeholderKey() | transloco"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        [attr.data-testid]="testId()"
      />
    </div>
    @if (query().trim()) {
      <ul
        class="mt-1 flex max-h-[240px] flex-col overflow-y-auto rounded-tile border border-border bg-surface"
        role="listbox"
        [attr.aria-label]="labelKey() | transloco"
      >
        @for (item of results(); track item.entity_id) {
          <li role="option" [attr.aria-selected]="false">
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              (click)="pick(item)"
            >
              @if (item.code) {
                <span class="font-mono text-meta text-fg-subtle">{{ item.code }}</span>
              }
              <span class="min-w-0 flex-1 truncate font-semibold text-fg">{{ item.title }}</span>
            </button>
          </li>
        } @empty {
          <li class="px-3 py-2 text-ui text-fg-muted">
            {{ (searching() ? 'common.loading' : 'recruitment.picker.none') | transloco }}
          </li>
        }
      </ul>
    }
  `,
})
export class RecordSearchPicker {
  private readonly search = inject(SearchApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  /** Entity types to search (e.g. `['document']`). */
  readonly types = input.required<readonly string[]>();
  readonly labelKey = input('recruitment.picker.label');
  readonly placeholderKey = input('recruitment.picker.placeholder');
  readonly testId = input<string | null>(null);
  readonly picked = output<SearchItem>();

  protected readonly uid = `cf-rec-pick-${++nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searching = signal(false);
  private readonly input$ = new Subject<string>();

  constructor() {
    const sub = this.input$
      .pipe(
        debounceTime(250),
        switchMap((q) => {
          const orgId = this.orgId();
          if (!orgId || !q.trim()) {
            return of({ items: [] as readonly SearchItem[] });
          }
          this.searching.set(true);
          return this.search
            .search(orgId, q, { types: this.types(), limit: 10 })
            .pipe(catchError(() => of({ items: [] as readonly SearchItem[] })));
        }),
      )
      .subscribe((res) => {
        this.searching.set(false);
        this.results.set(res.items.filter((i) => this.types().includes(i.entity_type)));
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.input$.next(value);
  }

  protected pick(item: SearchItem): void {
    this.picked.emit(item);
    this.query.set('');
    this.results.set([]);
  }
}
