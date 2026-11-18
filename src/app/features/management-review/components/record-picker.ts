import { HttpErrorResponse } from '@angular/common/http';
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
import { catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { provideKitScope } from '../../../shared/kit/kit-scope';
import { Icon } from '../../../shared/ui/icon/icon';
import { RelatedRef } from '../data/management-review.models';

const MIN_QUERY = 2;
const MAX_ITEMS = 20;
let nextId = 0;

/** The record types a meeting or decision is about, never the review or meeting itself. */
const EXCLUDED_TYPES = new Set(['management_review', 'meeting', 'attachment']);

/**
 * Picks the records a meeting or a decision concerns ("Gjelder"): search every
 * linkable type, add hits as chips, remove them again. It only edits the list
 * (`value` / `valueChange`); the page sends it with the save, and the server
 * writes the links. Used where `app-link-picker` (which links at once) does not
 * fit: on new-record forms and inside the decision form.
 */
@Component({
  selector: 'app-mr-record-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (value().length) {
      <ul class="mb-2 flex flex-wrap gap-1.5" data-testid="mr-related-selected">
        @for (r of value(); track r.entity_type + ':' + r.entity_id) {
          <li
            class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2"
          >
            <app-entity-chip [ref]="chipRef(r)" />
            @if (!disabled()) {
              <button
                type="button"
                class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                [attr.aria-label]="
                  'managementReview.related.remove' | transloco: { name: r.code || r.title }
                "
                (click)="remove(r)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            }
          </li>
        }
      </ul>
    }
    @if (!disabled() && value().length < max) {
      <div class="relative">
        <label class="sr-only" [attr.for]="inputId">{{ label() }}</label>
        <input
          [id]="inputId"
          type="search"
          autocomplete="off"
          class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          [placeholder]="'managementReview.related.searchPlaceholder' | transloco"
          [value]="query()"
          [attr.aria-controls]="listId"
          [attr.aria-expanded]="open()"
          (input)="query.set($any($event.target).value)"
          (keydown.escape)="query.set('')"
          data-testid="mr-related-search"
        />
        @if (open()) {
          <div
            [id]="listId"
            class="absolute right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-pop"
            aria-live="polite"
          >
            @if (unavailable()) {
              <p class="px-2.5 py-2 text-meta text-fg-muted">
                {{ 'managementReview.related.unavailable' | transloco }}
              </p>
            } @else if (searching()) {
              <p class="px-2.5 py-2 text-meta text-fg-muted">
                {{ 'managementReview.related.searching' | transloco }}
              </p>
            } @else if (hits().length === 0) {
              <p class="px-2.5 py-2 text-meta text-fg-muted">
                {{ 'managementReview.related.noResults' | transloco }}
              </p>
            } @else {
              <ul [attr.aria-label]="'managementReview.related.results' | transloco">
                @for (hit of hits(); track hit.entity_type + ':' + hit.entity_id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full min-w-0 items-center gap-2 rounded-tile px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      (click)="add(hit)"
                    >
                      <app-entity-chip [ref]="chipRef(hit)" />
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
    }
  `,
})
export class RecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** The picked records. */
  readonly value = input<readonly RelatedRef[]>([]);
  readonly disabled = input(false);
  /** Accessible name of the search box. */
  readonly label = input('');
  readonly valueChange = output<readonly RelatedRef[]>();

  protected readonly max = MAX_ITEMS;
  protected readonly inputId = `mr-related-${++nextId}`;
  protected readonly listId = `${this.inputId}-list`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly unavailable = signal(false);

  protected readonly open = computed(() => this.query().trim().length >= MIN_QUERY);
  protected readonly hits = computed(() => {
    const picked = new Set(this.value().map((r) => `${r.entity_type}:${r.entity_id}`));
    return this.results().filter(
      (h) => !EXCLUDED_TYPES.has(h.entity_type) && !picked.has(`${h.entity_type}:${h.entity_id}`),
    );
  });

  constructor() {
    const sub = toObservable(
      computed(() => ({ orgId: this.selectedOrg.currentOrgId(), q: this.query().trim() })),
    )
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => a.orgId === b.orgId && a.q === b.q),
        tap((s) => this.searching.set(!!s.orgId && s.q.length >= MIN_QUERY)),
        switchMap((s) =>
          !s.orgId || s.q.length < MIN_QUERY
            ? of<readonly SearchHit[]>([])
            : this.api.search(s.orgId, s.q, { limit: 12 }).pipe(
                map((res) => res.items),
                catchError((error: unknown) => {
                  if (error instanceof HttpErrorResponse && error.status === 404) {
                    this.unavailable.set(true);
                  }
                  return of<readonly SearchHit[]>([]);
                }),
              ),
        ),
      )
      .subscribe((hits) => {
        this.searching.set(false);
        this.results.set(hits);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected chipRef(r: RelatedRef | SearchHit) {
    // Informative chips: picking, not navigating, is the action here.
    return { ...r, title: r.title, url: null };
  }

  protected add(hit: SearchHit): void {
    const ref: RelatedRef = {
      entity_type: hit.entity_type,
      entity_id: hit.entity_id,
      title: hit.title,
      code: hit.code ?? null,
      url: hit.url ?? null,
      module: hit.module ?? null,
      label_key: hit.label_key ?? null,
    };
    this.valueChange.emit([...this.value(), ref]);
    this.query.set('');
  }

  protected remove(ref: RelatedRef): void {
    this.valueChange.emit(
      this.value().filter(
        (r) => !(r.entity_type === ref.entity_type && r.entity_id === ref.entity_id),
      ),
    );
  }
}
