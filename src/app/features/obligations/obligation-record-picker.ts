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
import { KitApi } from '../../core/kit/kit-api';
import { SearchHit } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EntityChip } from '../../shared/kit/entity-chip';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { provideSharedScope } from '../../core/i18n/shared-scope';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
let nextId = 0;

/** Record types never offered as evidence (the register itself). */
const NEVER = new Set(['compliance_obligation', 'obligation_duty', 'attachment']);

/**
 * Inline search over every readable record (global search), for picking evidence or a
 * deviation without leaving the form. Emits the picked hit; the caller decides what
 * it means (evidence for an evaluation, documentation for a duty, a linked deviation).
 * Records in `exclude` (`<type>:<id>`) are shown as already chosen.
 */
@Component({
  selector: 'app-obligation-record-picker',
  imports: [TranslocoPipe, EntityChip, Button, Icon],
  viewProviders: [provideSharedScope('kit')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2" data-testid="record-picker">
      <label [attr.for]="inputId" class="sr-only">{{ labelKey() | transloco }}</label>
      <div
        class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
      >
        <app-icon name="search" [size]="15" class="text-fg-subtle" />
        <input
          [id]="inputId"
          type="search"
          autocomplete="off"
          class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-placeholder"
          [value]="query()"
          [placeholder]="placeholderKey() | transloco"
          (input)="query.set($any($event.target).value)"
          (keydown.escape)="query.set('')"
          data-testid="record-picker-query"
        />
      </div>
      <div aria-live="polite">
        @if (query().trim().length >= minQuery) {
          @if (unavailable()) {
            <p class="text-meta text-fg-muted">{{ 'kit.picker.unavailable' | transloco }}</p>
          } @else if (searching()) {
            <p class="text-meta text-fg-muted">{{ 'kit.picker.searching' | transloco }}</p>
          } @else if (failed()) {
            <p class="text-meta text-fail-ink" role="alert">
              {{ 'obligations.common.loadFailed' | transloco }}
            </p>
          } @else if (results().length === 0) {
            <p class="text-meta text-fg-muted">{{ 'kit.picker.noResults' | transloco }}</p>
          } @else {
            <ul
              class="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-tile border border-border bg-surface"
              data-testid="record-picker-results"
            >
              @for (hit of results(); track keyOf(hit)) {
                <li class="flex items-center justify-between gap-3 px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <app-entity-chip [ref]="chipRef(hit)" />
                  </div>
                  @if (isChosen(hit)) {
                    <span class="flex-none text-meta font-semibold text-pass-ink">{{
                      'obligations.picker.chosen' | transloco
                    }}</span>
                  } @else {
                    <app-button
                      size="sm"
                      variant="secondary"
                      [disabled]="busy()"
                      (click)="pick(hit)"
                      [attr.data-testid]="'record-picker-pick-' + hit.entity_id"
                    >
                      {{ actionKey() | transloco }}
                    </app-button>
                  }
                </li>
              }
            </ul>
          }
        } @else {
          <p class="text-meta text-fg-subtle">{{ hintKey() | transloco }}</p>
        }
      </div>
    </div>
  `,
})
export class ObligationRecordPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** Limit the search to these record types (default: every searchable type). */
  readonly types = input<readonly string[] | null>(null);
  /** Already chosen records, as `<entity_type>:<entity_id>`. */
  readonly exclude = input<readonly string[]>([]);
  readonly labelKey = input('obligations.picker.label');
  readonly placeholderKey = input('obligations.picker.placeholder');
  readonly hintKey = input('obligations.picker.hint');
  readonly actionKey = input('obligations.picker.choose');
  readonly busy = input(false);

  readonly picked = output<SearchHit>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly inputId = `cf-ob-picker-${++nextId}`;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly failed = signal(false);
  protected readonly unavailable = signal(false);

  private readonly state = computed(() => ({
    orgId: this.selectedOrg.currentOrgId(),
    q: this.query().trim(),
    types: this.types() ?? [],
  }));

  constructor() {
    const sub = toObservable(this.state)
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(
          (a, b) => a.orgId === b.orgId && a.q === b.q && a.types.join() === b.types.join(),
        ),
        tap((s) => {
          this.failed.set(false);
          this.searching.set(!!s.orgId && s.q.length >= MIN_QUERY);
        }),
        switchMap((s) => {
          if (!s.orgId || s.q.length < MIN_QUERY) {
            return of<readonly SearchHit[]>([]);
          }
          return this.api.search(s.orgId, s.q, { types: s.types, limit: 15 }).pipe(
            map((res) => res.items.filter((h) => !NEVER.has(h.entity_type))),
            catchError((error: unknown) => {
              if (error instanceof HttpErrorResponse && error.status === 404) {
                this.unavailable.set(true);
              } else {
                this.failed.set(true);
              }
              return of<readonly SearchHit[]>([]);
            }),
          );
        }),
      )
      .subscribe((hits) => {
        this.searching.set(false);
        this.results.set(hits);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected keyOf(hit: SearchHit): string {
    return `${hit.entity_type}:${hit.entity_id}`;
  }

  protected isChosen(hit: SearchHit): boolean {
    return this.exclude().includes(this.keyOf(hit));
  }

  protected chipRef(hit: SearchHit) {
    // Picking, not navigating, is the action here.
    return { ...hit, url: null };
  }

  protected pick(hit: SearchHit): void {
    this.picked.emit(hit);
  }

  /** Clear the search (after a pick). */
  clear(): void {
    this.query.set('');
    this.results.set([]);
  }
}
