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
import { Subject, Subscription, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { AuditAccess } from '../data/audit-access';

/**
 * Search box that finds deviations (global search, `types=deviation`) and emits the
 * chosen one, so a finding can be linked to the deviation / CAPA that handles it.
 */
@Component({
  selector: 'app-audit-deviation-picker',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="sr-only" for="dev-search">{{
      'audits.findingDetail.searchDeviation' | transloco
    }}</label>
    <input
      id="dev-search"
      type="search"
      class="h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg"
      [placeholder]="'audits.findingDetail.searchDeviation' | transloco"
      (input)="queries.next($any($event.target).value)"
      autocomplete="off"
    />
    @if (results().length) {
      <ul
        class="mt-1 max-h-[220px] overflow-y-auto rounded-[10px] border border-border bg-surface"
        role="listbox"
      >
        @for (r of results(); track r.entity_id) {
          <li role="option" [attr.aria-selected]="false">
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-[13px] text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              [disabled]="excluded().includes(r.entity_id)"
              (click)="picked.emit(r.entity_id)"
            >
              @if (r.code) {
                <span class="mr-1 text-fg-subtle">{{ r.code }}</span>
              }
              {{ r.title }}
            </button>
          </li>
        }
      </ul>
    } @else if (searched()) {
      <p class="mt-1 text-[12.5px] text-fg-muted">{{ 'audits.common.noMatches' | transloco }}</p>
    }
  `,
})
export class DeviationPicker {
  private readonly search = inject(SearchApi);
  private readonly access = inject(AuditAccess);

  /** Deviation ids already linked (shown disabled). */
  readonly excluded = input<readonly string[]>([]);
  readonly picked = output<string>();

  protected readonly queries = new Subject<string>();
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searched = signal(false);
  private readonly sub: Subscription;

  constructor() {
    this.sub = this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) =>
          this.search
            .search(this.access.orgId() ?? '', q, { types: ['deviation'], limit: 10 })
            .pipe(map((res) => ({ q, items: res.items }))),
        ),
      )
      .subscribe({
        next: ({ q, items }) => {
          this.results.set(items);
          this.searched.set(!!q.trim());
        },
        error: () => this.results.set([]),
      });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
  }
}
