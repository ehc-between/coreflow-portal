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
import { KitApi } from '../../core/kit/kit-api';
import { SearchHit } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EntityChip } from '../../shared/kit/entity-chip';
import { Icon } from '../../shared/ui/icon/icon';
import { PickedRecord } from './data/form-models';

const MIN_QUERY = 2;
let nextId = 0;

/** Add a record to a picked list (no duplicates). */
export function addPicked(list: readonly PickedRecord[], hit: PickedRecord): PickedRecord[] {
  return list.some((r) => r.id === hit.id) ? [...list] : [...list, hit];
}

/**
 * Pick records of another type by searching for them (global search narrowed to
 * `entityType`): compliance obligations for an aspect, the aspects a plan covers,
 * the process of an activity. Picked records show as entity chips with a remove
 * button. `multiple=false` keeps one record. Keyboard: arrows move, Enter picks,
 * Escape clears the search.
 */
@Component({
  selector: 'app-env-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-2" [attr.data-testid]="testId()">
      @if (value().length) {
        <ul class="flex flex-col gap-1.5" [attr.aria-labelledby]="labelledBy() || null">
          @for (r of value(); track r.id) {
            <li
              class="flex min-h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 py-1.5"
              [attr.data-testid]="testId() + '-picked'"
            >
              <span class="min-w-0 flex-1">
                <app-entity-chip [ref]="chipRef(r)" [showType]="false" />
              </span>
              <button
                type="button"
                class="inline-flex h-8 flex-none items-center gap-1 rounded-tile px-2 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="
                  'environment.picker.removeNamed' | transloco: { name: r.code || r.title }
                "
                (click)="remove(r.id)"
              >
                <app-icon name="x" [size]="13" />
                <span class="hidden sm:inline">{{ 'environment.picker.remove' | transloco }}</span>
              </button>
            </li>
          }
        </ul>
      }
      @if (multiple() || value().length === 0) {
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
            data-bare
            [attr.aria-controls]="listId"
            [attr.aria-expanded]="open()"
            [attr.aria-activedescendant]="active() >= 0 ? listId + '-' + active() : null"
            [attr.aria-describedby]="describedBy() || null"
            class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none"
            [placeholder]="placeholderKey() | transloco"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (keydown)="onKeydown($event)"
            [attr.data-testid]="testId() + '-input'"
          />
        </div>
        @if (open()) {
          <ul
            [id]="listId"
            role="listbox"
            class="flex max-h-64 flex-col overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-card"
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
                {{
                  (searching() ? 'environment.picker.searching' : 'environment.picker.noHits')
                    | transloco
                }}
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class EnvRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Entity type to search (`compliance_obligation`, `env_aspect`, `process`). */
  readonly entityType = input.required<string>();
  readonly value = input<readonly PickedRecord[]>([]);
  readonly multiple = input(true);
  readonly inputId = input(`cf-env-picker-${++nextId}`);
  readonly placeholderKey = input('environment.picker.placeholder');
  readonly describedBy = input('');
  readonly labelledBy = input('');
  readonly testId = input('record-picker');
  readonly valueChange = output<readonly PickedRecord[]>();

  protected readonly listId = `cf-env-picker-list-${++nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly active = signal(-1);
  protected readonly open = computed(() => this.query().trim().length >= MIN_QUERY);

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
        const picked = new Set(this.value().map((r) => r.id));
        const fresh = items.filter((hit) => !picked.has(hit.entity_id));
        this.searching.set(false);
        this.results.set(fresh);
        this.active.set(fresh.length > 0 ? 0 : -1);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected chipRef(r: PickedRecord) {
    return {
      entity_type: this.entityType(),
      entity_id: r.id,
      title: r.title,
      code: r.code,
      url: r.url ?? null,
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
    const record: PickedRecord = {
      id: hit.entity_id,
      code: hit.code ?? null,
      title: hit.title,
      url: hit.url ?? null,
    };
    this.valueChange.emit(this.multiple() ? addPicked(this.value(), record) : [record]);
    this.query.set('');
    this.results.set([]);
  }

  protected remove(id: string): void {
    this.valueChange.emit(this.value().filter((r) => r.id !== id));
  }
}
