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
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { EntityTypesService } from '../../../core/kit/entity-types.service';
import { KitApi } from '../../../core/kit/kit-api';
import { SearchHit } from '../../../core/kit/kit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';
import { ORIGIN_TYPES, OriginRef, OriginType } from '../data/objectives.models';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
let nextId = 0;

/**
 * "Utgangspunkt": the records an objective comes from (the policy it delivers on,
 * the risks and opportunities it addresses, context issues, interested parties'
 * requirements, legal obligations). Picked records show as chips with a remove
 * button; a search over those six record types adds more. The form sends them as
 * `origins` (stored as `derived_from` links).
 */
@Component({
  selector: 'app-objectives-origin-picker',
  imports: [TranslocoPipe, EntityChip, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value().length) {
      <ul class="mb-2 flex flex-col gap-1.5" data-testid="origin-chips">
        @for (o of value(); track o.entity_type + o.entity_id) {
          <li
            class="flex items-center gap-2 rounded-tile border border-border bg-surface px-2.5 py-1.5"
          >
            <span class="min-w-0 flex-1"><app-entity-chip [ref]="o" /></span>
            <button
              type="button"
              class="inline-flex h-8 w-8 flex-none items-center justify-center rounded-tile text-fg-subtle hover:bg-surface-2 hover:text-fail-ink"
              [attr.aria-label]="
                'objectives.origins.remove' | transloco: { name: o.code || o.title }
              "
              (click)="remove(o)"
            >
              <app-icon name="x" [size]="14" />
            </button>
          </li>
        }
      </ul>
    }
    <div class="flex flex-col gap-2 sm:flex-row">
      <label class="sr-only" [attr.for]="ids.type">{{
        'objectives.origins.type' | transloco
      }}</label>
      <select
        [id]="ids.type"
        class="sm:max-w-[220px]"
        (change)="type.set($any($event.target).value)"
      >
        <option value="" [selected]="!type()">
          {{ 'objectives.origins.anyType' | transloco }}
        </option>
        @for (t of types; track t) {
          <option [value]="t" [selected]="type() === t">{{ typeLabel(t) }}</option>
        }
      </select>
      <label class="sr-only" [attr.for]="inputId() || ids.query">{{
        'objectives.origins.search' | transloco
      }}</label>
      <input
        [id]="inputId() || ids.query"
        type="search"
        autocomplete="off"
        [placeholder]="'objectives.origins.placeholder' | transloco"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        [attr.aria-describedby]="describedBy() || null"
        data-testid="origin-search"
      />
    </div>
    @if (query().trim().length >= minQuery) {
      <div class="mt-2 rounded-tile border border-border" aria-live="polite">
        @if (searching()) {
          <p class="px-3 py-2 text-meta text-fg-muted">
            {{ 'objectives.common.loading' | transloco }}
          </p>
        } @else if (results().length === 0) {
          <p class="px-3 py-2 text-meta text-fg-muted">
            {{ 'objectives.origins.noHits' | transloco }}
          </p>
        } @else {
          <ul class="divide-y divide-border" data-testid="origin-results">
            @for (hit of results(); track hit.entity_type + hit.entity_id) {
              <li class="flex items-center gap-2 px-3 py-2">
                <span class="min-w-0 flex-1"><app-entity-chip [ref]="hit" /></span>
                <button
                  type="button"
                  class="inline-flex h-8 flex-none items-center gap-1 rounded-tile px-2.5 text-ui font-semibold text-accent hover:bg-accent-soft"
                  (click)="add(hit)"
                >
                  <app-icon name="plus" [size]="13" />
                  {{ 'objectives.origins.add' | transloco }}
                </button>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class OriginPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);

  readonly value = input<readonly OriginRef[]>([]);
  /** Records that may not be picked (e.g. the flow's source, linked separately). */
  readonly exclude = input<readonly string[]>([]);
  readonly inputId = input('');
  readonly describedBy = input('');
  readonly valueChange = output<readonly OriginRef[]>();

  protected readonly types = ORIGIN_TYPES;
  protected readonly minQuery = MIN_QUERY;
  protected readonly ids = { type: `obj-origin-type-${++nextId}`, query: `obj-origin-q-${nextId}` };
  protected readonly type = signal<OriginType | ''>('');
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  private readonly hits = signal<readonly SearchHit[]>([]);

  protected readonly results = computed(() => {
    const picked = new Set([...this.value().map((o) => o.entity_id), ...this.exclude()]);
    return this.hits().filter((h) => !picked.has(h.entity_id));
  });

  constructor() {
    this.entityTypes.ensureLoaded();
    const state = computed(() => ({
      orgId: this.selectedOrg.currentOrgId(),
      q: this.query().trim(),
      type: this.type(),
    }));
    const sub = toObservable(state)
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged((a, b) => a.orgId === b.orgId && a.q === b.q && a.type === b.type),
        tap((s) => this.searching.set(!!s.orgId && s.q.length >= MIN_QUERY)),
        switchMap((s) =>
          !s.orgId || s.q.length < MIN_QUERY
            ? of<readonly SearchHit[]>([])
            : this.api
                .search(s.orgId, s.q, { types: s.type ? [s.type] : [...ORIGIN_TYPES], limit: 10 })
                .pipe(
                  switchMap((res) => of(res.items ?? [])),
                  catchError(() => of<readonly SearchHit[]>([])),
                ),
        ),
      )
      .subscribe((items) => {
        this.searching.set(false);
        this.hits.set(
          items.filter((h) => (ORIGIN_TYPES as readonly string[]).includes(h.entity_type)),
        );
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected typeLabel(type: string): string {
    return this.entityTypes.label(type);
  }

  protected add(hit: SearchHit): void {
    const ref: OriginRef = {
      entity_type: hit.entity_type,
      entity_id: hit.entity_id,
      title: hit.title,
      code: hit.code ?? null,
      url: hit.url ?? null,
      status: null,
      module: hit.module ?? null,
      label_key: hit.label_key ?? null,
    };
    this.valueChange.emit([...this.value(), ref]);
    this.query.set('');
  }

  protected remove(origin: OriginRef): void {
    this.valueChange.emit(
      this.value().filter(
        (o) => !(o.entity_type === origin.entity_type && o.entity_id === origin.entity_id),
      ),
    );
  }
}
