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
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { EntityLinkRef } from '../../core/chat/chat.models';
import { SearchApi } from '../../core/search/search-api';
import { SearchItem } from '../../core/search/search.models';
import { EntityChip } from '../../shared/kit/entity-chip';
import { SlideOver } from '../../shared/ui/slide-over/slide-over';

/**
 * "Koble til post": finds records through the global search API (only
 * readable records come back) and returns the chosen record's ref. The
 * composer turns it into a `[](cf:record/<type>/<id>)` token on send.
 */
@Component({
  selector: 'app-chat-record-link-picker',
  imports: [TranslocoPipe, SlideOver, EntityChip],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'chat.picker.title' | transloco"
      [closeLabel]="'chat.reactions.close' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      <label class="block text-meta font-semibold text-fg" for="chat-record-search">{{
        'chat.picker.search' | transloco
      }}</label>
      <input
        id="chat-record-search"
        type="search"
        autocomplete="off"
        class="mt-1 h-10 w-full rounded-tile border border-border bg-surface px-3 text-ui text-fg focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
        [value]="query()"
        (input)="onInput($event)"
        data-testid="chat-record-search"
      />
      <p class="mt-2 text-meta text-fg-muted">{{ 'chat.picker.hint' | transloco }}</p>

      <ul class="mt-3 flex flex-col gap-1" aria-live="polite">
        @for (item of results(); track item.entity_type + item.entity_id) {
          <li>
            <button
              type="button"
              class="flex w-full min-w-0 items-center justify-between gap-3 rounded-tile border border-border px-3 py-2 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              data-testid="chat-record-result"
              (click)="choose(item)"
            >
              <app-entity-chip
                class="pointer-events-none min-w-0"
                [ref]="chipRef(item)"
                [stacked]="true"
              />
              <span class="flex-none text-meta font-semibold text-accent">{{
                'chat.picker.link' | transloco
              }}</span>
            </button>
          </li>
        } @empty {
          <li class="py-6 text-center text-meta text-fg-subtle">
            {{ (query().trim() ? 'chat.picker.empty' : 'chat.picker.start') | transloco }}
          </li>
        }
      </ul>
    </app-slide-over>
  `,
})
export class RecordLinkPicker {
  private readonly search = inject(SearchApi);
  private readonly store = inject(ChatStore);

  readonly open = input(false);
  readonly picked = output<EntityLinkRef>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  private readonly input$ = new Subject<string>();

  constructor() {
    const sub = this.input$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.store.orgId();
          if (!orgId || !q.trim()) {
            return of({ items: [] as SearchItem[] });
          }
          return this.search
            .search(orgId, q, { limit: 12 })
            .pipe(catchError(() => of({ items: [] as SearchItem[] })));
        }),
      )
      .subscribe((res) =>
        // Chat itself is not a linkable record.
        this.results.set(res.items.filter((i) => !i.entity_type.startsWith('chat_'))),
      );
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.input$.next(value);
  }

  protected chipRef(item: SearchItem) {
    return { ...item, url: null };
  }

  protected choose(item: SearchItem): void {
    this.picked.emit({ entity_type: item.entity_type, entity_id: item.entity_id });
    this.query.set('');
    this.results.set([]);
  }
}
