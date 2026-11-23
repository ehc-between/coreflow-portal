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
import { LinkedRef } from '../data/hse.models';

const MIN_QUERY = 2;
let nextId = 0;

/**
 * Pick one record of another module (a supplier, a course) by searching for it.
 * Shows the picked record as an entity chip with "Change" / remove; otherwise a
 * search-as-you-type box over global search, narrowed to `entityType`. Keyboard:
 * arrows move, Enter picks, Escape clears.
 */
@Component({
  selector: 'app-hse-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (value(); as v) {
      <div
        class="flex min-h-10 flex-wrap items-center gap-2 rounded-tile border border-border bg-bg px-3 py-1.5"
        [attr.data-testid]="testId() + '-picked'"
      >
        <span class="min-w-0 flex-1">
          <app-entity-chip [ref]="chipRef(v)" />
        </span>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-tile px-2 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fail"
          [attr.aria-label]="'hse.picker.removeNamed' | transloco: { name: v.title || v.code }"
          (click)="valueChange.emit(null)"
        >
          <app-icon name="x" [size]="13" />
          {{ 'hse.picker.remove' | transloco }}
        </button>
      </div>
    } @else {
      <div
        class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft"
      >
        <app-icon name="search" [size]="15" class="text-fg-subtle" />
        <input
          [id]="inputId()"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          autocomplete="off"
          [attr.aria-controls]="listId"
          [attr.aria-expanded]="results().length > 0"
          [attr.aria-activedescendant]="active() >= 0 ? listId + '-' + active() : null"
          [attr.aria-describedby]="describedBy() || null"
          data-bare
          class="cf-bare h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
          [placeholder]="placeholderKey() | transloco"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          (keydown)="onKeydown($event)"
          [attr.data-testid]="testId() + '-input'"
        />
      </div>
      @if (query().trim().length >= minQuery) {
        <ul
          [id]="listId"
          role="listbox"
          class="mt-1.5 flex max-h-64 flex-col overflow-y-auto rounded-tile border border-border bg-surface p-1"
        >
          @for (hit of results(); track hit.entity_id; let i = $index) {
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
                <app-entity-chip [ref]="hit" [showType]="false" />
              </span>
            </li>
          } @empty {
            <li class="px-2.5 py-2 text-ui text-fg-muted">
              {{ (searching() ? 'hse.common.loading' : 'hse.picker.noHits') | transloco }}
            </li>
          }
        </ul>
      }
    }
  `,
})
export class HseRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity type to search (`supplier`, `course`). */
  readonly entityType = input.required<string>();
  readonly value = input<LinkedRef | null>(null);
  readonly inputId = input(`cf-hse-record-${++nextId}`);
  readonly placeholderKey = input('hse.picker.placeholder');
  readonly describedBy = input('');
  readonly testId = input('record-picker');
  readonly valueChange = output<LinkedRef | null>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly listId = `cf-hse-record-list-${++nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly active = signal(-1);

  constructor() {
    const sub = toObservable(computed(() => ({ q: this.query().trim(), type: this.entityType() })))
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.q === b.q && a.type === b.type),
        switchMap(({ q, type }) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || q.length < MIN_QUERY) {
            return of<readonly SearchHit[]>([]);
          }
          this.searching.set(true);
          return this.api.search(orgId, q, { types: [type], limit: 10 }).pipe(
            map((res) => res.items.filter((hit) => hit.entity_type === type)),
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

  protected chipRef(v: LinkedRef) {
    return {
      entity_type: this.entityType(),
      entity_id: v.id,
      title: v.title ?? v.code ?? '',
      code: v.code,
      url: v.url,
    };
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
    this.valueChange.emit({
      id: hit.entity_id,
      code: hit.code ?? null,
      title: hit.title,
      url: hit.url ?? null,
    });
    this.query.set('');
    this.results.set([]);
  }
}
