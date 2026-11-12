import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem, SearchHit } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../ui/alert/alert';
import { Button } from '../ui/button/button';
import { SlideOver } from '../ui/slide-over/slide-over';
import { EntityChip } from './entity-chip';
import { linkTypeKey } from './kit-format';
import { provideKitScope } from './kit-scope';

/** Shortest query sent to the search API. */
export const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

let nextId = 0;

interface SearchState {
  readonly orgId: string | null;
  readonly q: string;
  readonly types: readonly string[];
  readonly open: boolean;
}

/**
 * Slide-over for linking the current record to another one: pick the
 * relationship, optionally narrow the record type, search (F5 global search)
 * and link a result. Results already linked with the chosen relationship, and
 * the record itself, are marked / left out. Failures are explained in place.
 */
@Component({
  selector: 'app-link-picker',
  imports: [TranslocoPipe, SlideOver, Button, Alert, EntityChip],
  providers: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="open()"
      [title]="'kit.picker.title' | transloco"
      [subtitle]="'kit.picker.subtitle' | transloco"
      [closeLabel]="'kit.picker.close' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      <div class="flex flex-col gap-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label [attr.for]="ids.linkType" class="text-[13px] font-semibold text-fg-muted">{{
              'kit.picker.linkType' | transloco
            }}</label>
            <select
              [id]="ids.linkType"
              [value]="linkType()"
              (change)="linkType.set($any($event.target).value)"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              data-testid="picker-link-type"
            >
              @for (type of allowedLinkTypes(); track type) {
                <option [value]="type" [selected]="type === linkType()">
                  {{ linkTypeName(type) | transloco }}
                </option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label [attr.for]="ids.entityType" class="text-[13px] font-semibold text-fg-muted">{{
              'kit.picker.entityType' | transloco
            }}</label>
            <select
              [id]="ids.entityType"
              [value]="targetType()"
              (change)="targetType.set($any($event.target).value)"
              class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
              data-testid="picker-entity-type"
            >
              <option value="">{{ 'kit.picker.allTypes' | transloco }}</option>
              @for (type of targetTypes(); track type.entity_type) {
                <option [value]="type.entity_type" [selected]="type.entity_type === targetType()">
                  {{ typeLabel(type.entity_type, type.label_key) }}
                </option>
              }
            </select>
          </div>
        </div>
        <p class="-mt-2 text-[12.5px] text-fg-subtle">
          {{ 'kit.picker.linkTypeHelp' | transloco: { relation: relationText() | transloco } }}
        </p>

        <div class="flex flex-col gap-1.5">
          <label [attr.for]="ids.query" class="text-[13px] font-semibold text-fg-muted">{{
            'kit.picker.search' | transloco
          }}</label>
          <input
            [id]="ids.query"
            type="search"
            autocomplete="off"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            [placeholder]="'kit.picker.searchPlaceholder' | transloco"
            class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
            data-testid="picker-query"
          />
        </div>

        @if (errorKey(); as key) {
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        }

        <div aria-live="polite">
          @if (unavailable()) {
            <p class="text-[13px] text-fg-muted">{{ 'kit.picker.unavailable' | transloco }}</p>
          } @else if (query().trim().length < minQuery) {
            <p class="text-[13px] text-fg-muted">{{ 'kit.picker.minChars' | transloco }}</p>
          } @else if (searching()) {
            <p class="text-[13px] text-fg-muted">{{ 'kit.picker.searching' | transloco }}</p>
          } @else if (results().length === 0) {
            <p class="text-[13px] text-fg-muted">{{ 'kit.picker.noResults' | transloco }}</p>
          } @else {
            <ul
              class="flex flex-col divide-y divide-border rounded-[10px] border border-border"
              [attr.aria-label]="'kit.picker.results' | transloco"
              data-testid="picker-results"
            >
              @for (hit of results(); track hit.entity_type + ':' + hit.entity_id) {
                <li class="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div class="min-w-0 flex-1">
                    <app-entity-chip [ref]="hitRef(hit)" />
                    @if (hit.snippet) {
                      <p class="mt-0.5 truncate text-[12px] text-fg-subtle">{{ hit.snippet }}</p>
                    }
                  </div>
                  @if (isLinked(hit)) {
                    <span class="flex-none text-[12px] font-semibold text-pass">{{
                      'kit.picker.linked' | transloco
                    }}</span>
                  } @else {
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="linkingKey() === keyOf(hit)"
                      [disabled]="linkingKey() !== null"
                      (click)="link(hit)"
                    >
                      {{ 'kit.picker.link' | transloco }}
                    </app-button>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </app-slide-over>
  `,
})
export class LinkPicker {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);

  readonly open = input(false);
  readonly sourceType = input.required<string>();
  readonly sourceId = input.required<string>();
  /** Restrict the relationships offered (default: every link type). */
  readonly linkTypes = input<readonly string[] | undefined>(undefined);
  /** Links the record already has, to mark results that are linked. */
  readonly existing = input<readonly LinkItem[]>([]);

  readonly linked = output<LinkItem>();
  readonly closed = output<void>();

  protected readonly minQuery = MIN_QUERY;
  protected readonly ids = {
    linkType: `cf-link-type-${++nextId}`,
    entityType: `cf-link-entity-${nextId}`,
    query: `cf-link-query-${nextId}`,
  };

  protected readonly linkType = signal('relates_to');
  protected readonly targetType = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly linkingKey = signal<string | null>(null);

  protected readonly allowedLinkTypes = computed(() => {
    const all = this.entityTypes.linkTypes();
    const only = this.linkTypes();
    return only && only.length > 0 ? all.filter((t) => only.includes(t)) : all;
  });

  protected readonly targetTypes = computed(() =>
    this.entityTypes.linkTargets().filter((t) => t.entity_type !== 'attachment'),
  );

  protected readonly relationText = computed(() => linkTypeKey(this.linkType(), 'outgoing'));

  private readonly searchState = computed<SearchState>(() => {
    const chosen = this.targetType();
    return {
      orgId: this.selectedOrg.currentOrgId(),
      q: this.query().trim(),
      types: chosen ? [chosen] : this.targetTypes().map((t) => t.entity_type),
      open: this.open(),
    };
  });

  constructor() {
    this.entityTypes.ensureLoaded();

    // Reset the form whenever the picker opens.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const allowed = this.allowedLinkTypes();
          this.linkType.set(allowed.includes('relates_to') ? 'relates_to' : (allowed[0] ?? ''));
          this.targetType.set('');
          this.query.set('');
          this.results.set([]);
          this.errorKey.set(null);
        });
      }
    });

    const sub = toObservable(this.searchState)
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(
          (a, b) =>
            a.orgId === b.orgId &&
            a.q === b.q &&
            a.open === b.open &&
            a.types.join(',') === b.types.join(','),
        ),
        tap((s) => this.searching.set(s.open && !!s.orgId && s.q.length >= MIN_QUERY)),
        switchMap((s) => {
          if (!s.open || !s.orgId || s.q.length < MIN_QUERY) {
            return of<readonly SearchHit[]>([]);
          }
          return this.api.search(s.orgId, s.q, { types: s.types, limit: 20 }).pipe(
            switchMap((res) => of(res.items)),
            catchError((error: unknown) => {
              if (error instanceof HttpErrorResponse && error.status === 404) {
                // Global search is not deployed on this server yet.
                this.unavailable.set(true);
              } else {
                this.errorKey.set(kitErrorKey(error));
              }
              return of<readonly SearchHit[]>([]);
            }),
          );
        }),
      )
      .subscribe((hits) => {
        this.searching.set(false);
        this.results.set(
          hits.filter(
            (h) => !(h.entity_type === this.sourceType() && h.entity_id === this.sourceId()),
          ),
        );
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected linkTypeName(type: string): string {
    return linkTypeKey(type, 'name');
  }

  protected typeLabel(type: string, labelKey: string | null): string {
    return this.entityTypes.label(type, labelKey);
  }

  protected keyOf(hit: SearchHit): string {
    return `${hit.entity_type}:${hit.entity_id}`;
  }

  protected hitRef(hit: SearchHit) {
    // The chip is informative here: linking, not navigating, is the action.
    return { ...hit, url: null };
  }

  protected isLinked(hit: SearchHit): boolean {
    const type = this.linkType();
    return this.existing().some(
      (l) =>
        l.link_type === type &&
        l.direction === 'outgoing' &&
        l.other.entity_type === hit.entity_type &&
        l.other.entity_id === hit.entity_id,
    );
  }

  protected link(hit: SearchHit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.linkingKey() !== null) {
      return;
    }
    this.linkingKey.set(this.keyOf(hit));
    this.errorKey.set(null);
    this.api
      .createLink(orgId, {
        source_type: this.sourceType(),
        source_id: this.sourceId(),
        target_type: hit.entity_type,
        target_id: hit.entity_id,
        link_type: this.linkType(),
      })
      .subscribe({
        next: (item) => {
          this.linkingKey.set(null);
          this.linked.emit(item);
        },
        error: (error: unknown) => {
          this.linkingKey.set(null);
          this.errorKey.set(kitErrorKey(error));
        },
      });
  }
}
