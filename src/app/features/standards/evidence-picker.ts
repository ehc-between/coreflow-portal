import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  debounceTime,
  map,
  of,
  switchMap,
} from 'rxjs';
import { EntityTypesService, humanize } from '../../core/kit/entity-types.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { SearchApi } from '../../core/search/search-api';
import { SearchItem } from '../../core/search/search.models';
import { LinkEntityType } from '../../core/standards/standards.models';
import { groupByStandard } from '../../shared/requirement-links/requirement-label';
import { Icon } from '../../shared/ui/icon/icon';

/** A record picked as evidence. */
export interface EvidencePick {
  readonly entity_type: LinkEntityType;
  readonly entity_id: string;
  readonly label: string;
}

/** A record type the picker can narrow to ("Koble eksisterende" for one type). */
export interface PickerType {
  readonly entity_type: string;
  readonly label_key: string | null;
}

interface SearchOutcome {
  readonly results: readonly SearchItem[];
  readonly error: boolean;
}

/** Search hits that are not records (requirements themselves) are never evidence. */
const NOT_EVIDENCE = new Set(['standard_requirement']);
const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 30;

/** Hits grouped by owning module, in rank order of each module's best hit. */
export function groupHits(
  hits: readonly SearchItem[],
): readonly { readonly key: string; readonly items: readonly SearchItem[] }[] {
  return groupByStandard(hits, (h) => h.module || 'other');
}

/** A module's nav name (`modules.names.<key>`), else the humanised key. */
export function moduleName(module: string, translate: (key: string) => string): string {
  const key = `modules.names.${module}`;
  const label = translate(key);
  return label && label !== key ? label : humanize(module);
}

/**
 * Search box for linking any record the user can read as evidence for a
 * requirement (global search over every linkable type, results grouped by
 * module). `types` offers the types that usually evidence the requirement as
 * quick filters; `initialType` starts narrowed to one ("Koble eksisterende").
 * Records in `exclude` (already linked) are marked. Emits the picked record;
 * `cancelled` closes it.
 */
@Component({
  selector: 'app-evidence-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-tile border border-border bg-surface-2 p-2.5" data-testid="evidence-picker">
      <div class="mb-2 flex items-center gap-2">
        <input
          #box
          type="search"
          class="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
          [value]="query()"
          (input)="onQuery(box.value)"
          [placeholder]="'standards.reqs.evidence.searchPlaceholder' | transloco"
          [attr.aria-label]="'standards.reqs.evidence.searchPlaceholder' | transloco"
          data-testid="evidence-query"
        />
        <button
          type="button"
          class="flex rounded-md p-1 text-fg-subtle hover:text-fg"
          [attr.aria-label]="'standards.evidence.cancel' | transloco"
          (click)="cancelled.emit()"
        >
          <app-icon name="x" [size]="14" />
        </button>
      </div>
      @if (types().length > 0) {
        <div
          class="mb-2 flex flex-wrap gap-1"
          role="group"
          [attr.aria-label]="'standards.reqs.evidence.typeFilter' | transloco"
        >
          <button
            type="button"
            class="rounded-full border px-2.5 py-0.5 text-meta font-semibold"
            [class]="
              type() === null
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-fg-muted hover:text-fg'
            "
            [attr.aria-pressed]="type() === null"
            (click)="setType(null)"
          >
            {{ 'standards.reqs.evidence.allTypes' | transloco }}
          </button>
          @for (t of types(); track t.entity_type) {
            <button
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-meta font-semibold"
              [class]="
                type() === t.entity_type
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-fg-muted hover:text-fg'
              "
              [attr.aria-pressed]="type() === t.entity_type"
              data-testid="evidence-type"
              (click)="setType(t.entity_type)"
            >
              {{ typeLabel(t.entity_type, t.label_key) }}
            </button>
          }
        </div>
      }
      @if (searching()) {
        <p class="mt-1 text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (searchError()) {
        <p class="mt-1 text-meta text-fail" role="alert">
          {{ 'standards.evidence.searchError' | transloco }}
        </p>
      } @else if (query().trim() && results().length === 0) {
        <p class="mt-1 text-meta text-fg-muted">{{ 'standards.evidence.noResults' | transloco }}</p>
      } @else if (!query().trim()) {
        <p class="mt-1 text-meta text-fg-subtle">
          {{ 'standards.reqs.evidence.hint' | transloco }}
        </p>
      }
      @for (group of groups(); track group.key) {
        <div class="mt-2 text-micro font-bold tracking-wide text-fg-subtle uppercase">
          {{ moduleLabel(group.key) }}
        </div>
        <ul class="flex flex-col">
          @for (r of group.items; track r.entity_type + r.entity_id) {
            <li>
              <button
                type="button"
                class="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface disabled:opacity-60 disabled:hover:bg-transparent"
                [disabled]="isExcluded(r)"
                data-testid="evidence-result"
                (click)="pick(r)"
              >
                <span
                  class="flex-none text-micro font-semibold tracking-wide text-fg-subtle uppercase"
                  >{{ typeLabel(r.entity_type, r.label_key) }}</span
                >
                @if (r.code) {
                  <span class="flex-none font-mono text-meta text-fg-muted">{{ r.code }}</span>
                }
                <span class="min-w-0 flex-1 truncate text-ui text-fg">{{ r.title }}</span>
                @if (isExcluded(r)) {
                  <span class="flex-none text-micro text-fg-subtle">{{
                    'standards.reqs.picker.linked' | transloco
                  }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class EvidencePicker {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly language = inject(LanguageService);

  /** Types that usually evidence the requirement, offered as filters. */
  readonly types = input<readonly PickerType[]>([]);
  /** Start narrowed to this type. */
  readonly initialType = input<string | null>(null);
  /** `<entity_type>:<entity_id>` keys already linked. */
  readonly exclude = input<ReadonlySet<string>>(new Set());

  readonly picked = output<EvidencePick>();
  readonly cancelled = output<void>();

  protected readonly type = linkedSignal<string | null>(() => this.initialType());
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal(false);
  protected readonly groups = computed(() => groupHits(this.results()));

  private readonly search$ = new Subject<{ type: string | null; q: string }>();
  private readonly sub: Subscription;

  constructor() {
    this.entityTypes.ensureLoaded();
    this.sub = this.search$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap(({ type, q }) => this.run(type, q)),
      )
      .subscribe(({ results, error }) => {
        this.results.set(results);
        this.searchError.set(error);
        this.searching.set(false);
      });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
  }

  protected typeLabel(entityType: string, labelKey: string | null): string {
    return this.entityTypes.label(entityType, labelKey);
  }

  protected moduleLabel(module: string): string {
    return moduleName(module, (key) => this.language.translate(key));
  }

  protected isExcluded(r: SearchItem): boolean {
    return this.exclude().has(`${r.entity_type}:${r.entity_id}`);
  }

  protected setType(type: string | null): void {
    this.type.set(type);
    this.trigger();
  }

  protected onQuery(q: string): void {
    this.query.set(q);
    this.trigger();
  }

  protected pick(r: SearchItem): void {
    this.picked.emit({
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      label: r.code ? `${r.code} · ${r.title}` : r.title,
    });
  }

  private trigger(): void {
    const q = this.query().trim();
    this.searchError.set(false);
    if (!q) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.search$.next({ type: this.type(), q });
  }

  private run(type: string | null, q: string): Observable<SearchOutcome> {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return of({ results: [], error: false });
    }
    return this.search
      .search(orgId, q, { types: type ? [type] : undefined, limit: RESULT_LIMIT })
      .pipe(
        map(
          (res): SearchOutcome => ({
            results: res.items.filter(
              (hit) =>
                !NOT_EVIDENCE.has(hit.entity_type) &&
                this.entityTypes.info(hit.entity_type)?.linkable !== false,
            ),
            error: false,
          }),
        ),
        catchError(() => of<SearchOutcome>({ results: [], error: true })),
      );
  }
}
