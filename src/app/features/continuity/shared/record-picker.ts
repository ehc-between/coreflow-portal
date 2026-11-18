import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LinkedRef } from '../data/continuity.models';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/**
 * Pick a record from another register (a process, supplier, asset, contract,
 * employee, document…) by searching for it: a combobox over the global search,
 * limited to `types`. The picked record shows as an entity chip with "Change" and
 * "Remove". `inputId` labels the search box from a surrounding `app-form-field`.
 *
 *   <app-continuity-record-picker inputId="bia-process" [types]="['process']"
 *       [value]="process()" (picked)="setProcess($event)" />
 */
@Component({
  selector: 'app-continuity-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    @if (value(); as v) {
      <div
        class="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-tile border border-border bg-bg px-3 py-1.5"
        data-testid="record-picker-value"
      >
        <app-entity-chip [ref]="v" [statusText]="true" />
        @if (!disabled()) {
          <span class="flex flex-none items-center gap-1">
            <button
              type="button"
              class="rounded-tile px-2 py-1 text-ui font-semibold text-accent hover:bg-surface-2"
              (click)="change()"
            >
              {{ 'continuity.picker.change' | transloco }}
            </button>
            <button
              type="button"
              class="rounded-tile px-2 py-1 text-ui font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
              [attr.aria-label]="'continuity.picker.removeNamed' | transloco: { name: v.title }"
              (click)="picked.emit(null)"
            >
              {{ 'continuity.picker.remove' | transloco }}
            </button>
          </span>
        }
      </div>
    } @else {
      <div
        class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
      >
        <app-icon name="search" [size]="15" class="text-fg-subtle" />
        <input
          [id]="inputId()"
          type="search"
          role="combobox"
          autocomplete="off"
          class="!h-full !border-0 !bg-transparent !p-0 !shadow-none"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="listId"
          [attr.aria-describedby]="describedBy() || null"
          [disabled]="disabled()"
          [placeholder]="placeholder() || ('continuity.picker.placeholder' | transloco)"
          [value]="query()"
          (input)="onInput($any($event.target).value)"
          (focus)="open.set(query().length >= minQuery)"
          (keydown)="onKeydown($event)"
          data-testid="record-picker-input"
        />
      </div>
      @if (open()) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
          data-testid="record-picker-results"
        >
          @if (loading()) {
            <li class="px-3 py-2 text-ui text-fg-muted">
              {{ 'continuity.common.loading' | transloco }}
            </li>
          } @else {
            @for (hit of hits(); track hit.entity_id; let i = $index) {
              <li
                role="option"
                [attr.aria-selected]="i === active()"
                class="cursor-pointer rounded-tile px-3 py-2"
                [class.bg-surface-2]="i === active()"
                tabindex="-1"
                (mousedown)="$event.preventDefault()"
                (click)="choose(hit)"
                (keydown.enter)="choose(hit)"
                (mouseenter)="active.set(i)"
              >
                <span class="flex flex-wrap items-baseline gap-2 text-ui">
                  <span class="text-micro font-semibold tracking-[0.04em] text-fg-subtle uppercase">
                    {{ typeLabel(hit) }}
                  </span>
                  @if (hit.code) {
                    <span class="font-mono text-meta text-fg-muted">{{ hit.code }}</span>
                  }
                  <span class="font-medium text-fg">{{ hit.title }}</span>
                </span>
              </li>
            } @empty {
              <li class="px-3 py-2 text-ui text-fg-muted">
                {{ (failed() ? 'continuity.picker.failed' : 'continuity.picker.none') | transloco }}
              </li>
            }
          }
        </ul>
      }
    }
  `,
})
export class ContinuityRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly inputId = input.required<string>();
  /** Entity types to search (e.g. `['supplier']`). */
  readonly types = input.required<readonly string[]>();
  readonly value = input<LinkedRef | null | undefined>(null);
  readonly disabled = input(false);
  readonly placeholder = input<string | null>(null);
  readonly describedBy = input('');
  readonly picked = output<LinkedRef | null>();

  private static nextId = 0;
  protected readonly listId = `cf-record-picker-${++ContinuityRecordPicker.nextId}`;
  protected readonly minQuery = MIN_QUERY;
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly hits = signal<readonly SearchHit[]>([]);
  protected readonly active = signal(0);
  private readonly typeKey = computed(() => this.types().join(','));

  constructor() {
    const sub = toObservable(computed(() => ({ q: this.query().trim(), types: this.typeKey() })))
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged((a, b) => a.q === b.q && a.types === b.types),
        tap(({ q }) => {
          this.failed.set(false);
          this.loading.set(q.length >= MIN_QUERY);
        }),
        switchMap(({ q, types }) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || q.length < MIN_QUERY) {
            return of([] as readonly SearchHit[]);
          }
          return this.api.search(orgId, q, { types: types.split(','), limit: 10 }).pipe(
            catchError(() => {
              this.failed.set(true);
              return of({ items: [] as readonly SearchHit[] });
            }),
            // Global search may return other types too; keep only the asked ones.
            switchMap((res) =>
              of(res.items.filter((h) => types.split(',').includes(h.entity_type))),
            ),
          );
        }),
      )
      .subscribe((items) => {
        this.loading.set(false);
        this.hits.set(items);
        this.active.set(0);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected typeLabel(hit: SearchHit): string {
    return this.entityTypes.label(hit.entity_type, hit.label_key);
  }

  protected onInput(text: string): void {
    this.query.set(text);
    this.open.set(text.trim().length >= MIN_QUERY);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const hits = this.hits();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        this.active.set(Math.min(this.active() + 1, Math.max(hits.length - 1, 0)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(Math.max(this.active() - 1, 0));
        break;
      case 'Enter':
        if (this.open() && hits[this.active()]) {
          event.preventDefault();
          this.choose(hits[this.active()]);
        }
        break;
      case 'Escape':
        if (this.open()) {
          event.stopPropagation();
          this.open.set(false);
        }
        break;
    }
  }

  protected choose(hit: SearchHit): void {
    this.open.set(false);
    this.query.set('');
    this.picked.emit({
      entity_type: hit.entity_type,
      entity_id: hit.entity_id,
      title: hit.title,
      code: hit.code ?? null,
      url: hit.url ?? null,
      module: hit.module ?? null,
      label_key: hit.label_key ?? null,
    });
  }

  protected change(): void {
    this.picked.emit(null);
    // Focus the search box once it renders.
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    );
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
