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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { localized } from '../../core/standards/standards-data';
import { CatalogueClause, RequirementDetail } from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';

/** Requirements picked to link. */
export interface RequirementPick {
  readonly refs: readonly string[];
}

const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 20;

/**
 * "Legg til krav": search the catalogue of the org's enabled standards by
 * clause number, ref or title (en / nb), pick a clause, then one of its
 * requirements or all of them. Emits the requirement refs to link. Refs in
 * `exclude` (already linked, or rejected) are marked and cannot be picked.
 */
@Component({
  selector: 'app-requirement-catalogue-search',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('standards')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-tile border border-border bg-surface-2 p-2" data-testid="catalogue-search">
      @if (clause(); as c) {
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="flex rounded-md p-1 text-fg-subtle hover:text-fg"
            [attr.aria-label]="'standards.reqs.picker.back' | transloco"
            (click)="clause.set(null)"
          >
            <app-icon name="back" [size]="14" />
          </button>
          <span class="min-w-0 flex-1 truncate text-ui font-semibold text-fg"
            >{{ c.short }} · {{ c.number }} {{ c.title }}</span
          >
          <button
            type="button"
            class="flex rounded-md p-1 text-fg-subtle hover:text-fg"
            [attr.aria-label]="'standards.reqs.picker.cancel' | transloco"
            (click)="cancelled.emit()"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
        @if (detailLoading()) {
          <p class="mt-1.5 text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else {
          <p class="mt-1.5 text-meta text-fg-subtle">
            {{ 'standards.reqs.picker.chooseRequirement' | transloco }}
          </p>
          <ul class="mt-1 flex max-h-64 flex-col overflow-y-auto">
            @if (open().length > 1) {
              <li>
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left text-ui font-semibold text-accent hover:bg-surface"
                  data-testid="pick-all"
                  (click)="picked.emit({ refs: open() })"
                >
                  {{ 'standards.reqs.picker.all' | transloco: { count: open().length } }}
                </button>
              </li>
            }
            @for (req of requirements(); track req.ref; let i = $index) {
              <li>
                <button
                  type="button"
                  class="w-full rounded-md px-2 py-1.5 text-left hover:bg-surface disabled:opacity-60 disabled:hover:bg-transparent"
                  [disabled]="exclude().has(req.ref)"
                  data-testid="pick-requirement"
                  (click)="picked.emit({ refs: [req.ref] })"
                >
                  <span class="block text-micro font-semibold text-fg-subtle">
                    {{
                      'standards.reqs.positionLong'
                        | transloco: { index: i + 1, count: requirements().length }
                    }}
                    @if (exclude().has(req.ref)) {
                      · {{ 'standards.reqs.picker.linked' | transloco }}
                    }
                  </span>
                  <span class="line-clamp-3 block text-ui text-fg">{{ text(req) }}</span>
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <div class="flex items-center gap-1.5">
          <input
            #box
            type="search"
            class="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 text-ui text-fg outline-none focus:border-accent"
            [value]="query()"
            (input)="onQuery(box.value)"
            [placeholder]="'standards.reqs.picker.placeholder' | transloco"
            [attr.aria-label]="'standards.reqs.picker.placeholder' | transloco"
            data-testid="catalogue-query"
          />
          <button
            type="button"
            class="flex rounded-md p-1 text-fg-subtle hover:text-fg"
            [attr.aria-label]="'standards.reqs.picker.cancel' | transloco"
            (click)="cancelled.emit()"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
        @if (searching()) {
          <p class="mt-1.5 text-meta text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (error()) {
          <p class="mt-1.5 text-meta text-fail" role="alert">
            {{ 'standards.reqs.picker.error' | transloco }}
          </p>
        } @else if (query().trim() && results().length === 0) {
          <p class="mt-1.5 text-meta text-fg-muted">
            {{ 'standards.reqs.picker.noResultsEnabled' | transloco }}
          </p>
        } @else if (!query().trim()) {
          <p class="mt-1.5 text-meta text-fg-subtle">
            {{ 'standards.reqs.picker.hint' | transloco }}
          </p>
        }
        <ul class="mt-1 flex max-h-64 flex-col overflow-y-auto">
          @for (c of results(); track c.clause_ref) {
            <li>
              <button
                type="button"
                class="w-full rounded-md px-2 py-1.5 text-left hover:bg-surface"
                data-testid="catalogue-result"
                (click)="choose(c)"
              >
                <span class="block text-ui font-semibold text-fg"
                  >{{ c.short }} · {{ c.number }}</span
                >
                <span class="line-clamp-2 block text-meta text-fg-muted">{{ c.title }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class RequirementCatalogueSearch {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  /** Framework keys to search; all enabled standards when empty. */
  readonly frameworks = input<readonly string[] | null | undefined>(null);
  /** Requirement refs that cannot be picked (already on the record). */
  readonly exclude = input<ReadonlySet<string>>(new Set());

  readonly picked = output<RequirementPick>();
  readonly cancelled = output<void>();

  protected readonly query = signal('');
  protected readonly results = signal<readonly CatalogueClause[]>([]);
  protected readonly searching = signal(false);
  protected readonly error = signal(false);
  protected readonly clause = signal<CatalogueClause | null>(null);
  protected readonly requirements = signal<readonly RequirementDetail[]>([]);
  protected readonly detailLoading = signal(false);

  /** Requirements of the chosen clause that can still be linked. */
  protected readonly open = computed(() =>
    this.requirements()
      .map((r) => r.ref)
      .filter((ref) => !this.exclude().has(ref)),
  );

  private readonly search$ = new Subject<string>();
  private readonly sub: Subscription;
  private detailSub: Subscription | null = null;

  constructor() {
    this.sub = this.search$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || !q) {
            return of({ items: [] as CatalogueClause[], error: false });
          }
          return this.api
            .searchCatalogue(orgId, q, {
              frameworks: this.frameworks() ?? undefined,
              limit: RESULT_LIMIT,
            })
            .pipe(
              // Only enabled standards produce evidence; heading clauses carry no requirements.
              map((items) => ({
                items: items.filter((c) => c.enabled && c.requirement_count > 0),
                error: false,
              })),
              catchError(() => of({ items: [] as CatalogueClause[], error: true })),
            );
        }),
      )
      .subscribe(({ items, error }) => {
        this.results.set(items);
        this.error.set(error);
        this.searching.set(false);
      });
    inject(DestroyRef).onDestroy(() => {
      this.sub.unsubscribe();
      this.detailSub?.unsubscribe();
    });
  }

  protected text(req: RequirementDetail): string {
    return localized(req.text, this.language.active());
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    const q = value.trim();
    this.error.set(false);
    if (!q) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.search$.next(q);
  }

  /** Pick a clause: one requirement links at once, several are offered to choose from. */
  protected choose(c: CatalogueClause): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.clause.set(c);
    this.requirements.set([]);
    this.detailLoading.set(true);
    this.detailSub?.unsubscribe();
    this.detailSub = this.api.getClause(orgId, c.standard_key, c.number).subscribe({
      next: (detail) => {
        this.detailLoading.set(false);
        const reqs = detail.requirements;
        if (reqs.length === 1 && !this.exclude().has(reqs[0].ref)) {
          this.picked.emit({ refs: [reqs[0].ref] });
          return;
        }
        this.requirements.set(reqs);
      },
      error: () => {
        this.detailLoading.set(false);
        this.clause.set(null);
        this.error.set(true);
      },
    });
  }
}
