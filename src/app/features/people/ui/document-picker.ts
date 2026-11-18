import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, of, skip, switchMap } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { Icon } from '../../../shared/ui/icon/icon';

/** The document chosen in a picker (enough to show and send it). */
export interface PickedDocument {
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
}

/**
 * Picks a controlled document (global search restricted to documents the caller may
 * read): the policy a person read, or the job description of a position. Shows the
 * chosen document with a clear button; the control is labelled by the host's
 * `app-people-field` (`inputId`).
 */
@Component({
  selector: 'app-people-document-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value(); as doc) {
      <div
        class="flex min-h-10 items-center justify-between gap-2 rounded-tile border border-border bg-surface px-3 py-2"
        data-testid="document-picked"
      >
        <span class="min-w-0 truncate text-ui text-fg">
          <app-icon name="documents" [size]="14" class="mr-1 align-middle text-fg-subtle" />
          @if (doc.code) {
            <span class="font-mono text-meta text-fg-muted">{{ doc.code }}</span>
          }
          {{ doc.title }}
        </span>
        <button
          type="button"
          class="inline-flex h-7 w-7 flex-none items-center justify-center rounded-tile text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'people.documents.clear' | transloco: { title: doc.title }"
          (click)="valueChange.emit(null)"
        >
          <app-icon name="x" [size]="14" />
        </button>
      </div>
    } @else {
      <input
        [id]="inputId()"
        type="search"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-controls]="inputId() + '-results'"
        [attr.aria-expanded]="results().length > 0"
        [value]="query()"
        [placeholder]="'people.documents.placeholder' | transloco"
        (input)="query.set($any($event.target).value)"
        (keydown.escape)="results.set([])"
        data-testid="document-search"
      />
      @if (results().length) {
        <ul
          [id]="inputId() + '-results'"
          role="listbox"
          class="mt-1 max-h-56 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
        >
          @for (item of results(); track item.entity_id) {
            <li role="option" [attr.aria-selected]="false">
              <button
                type="button"
                class="w-full rounded-tile px-2.5 py-1.5 text-left text-ui text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                (click)="pick(item)"
              >
                @if (item.code) {
                  <span class="font-mono text-meta text-fg-muted">{{ item.code }}</span>
                }
                {{ item.title }}
              </button>
            </li>
          }
        </ul>
      } @else if (searched() && query().trim()) {
        <p class="mt-1 text-meta text-fg-muted">{{ 'people.documents.noMatch' | transloco }}</p>
      }
    }
  `,
})
export class PeopleDocumentPicker {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly inputId = input.required<string>();
  readonly value = input<PickedDocument | null>(null);
  readonly valueChange = output<PickedDocument | null>();

  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searched = signal(false);

  constructor() {
    const sub = toObservable(this.query)
      .pipe(
        skip(1),
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId || !q.trim()) {
            return of(null);
          }
          return this.search
            .search(orgId, q, { types: ['document'], limit: 8 })
            .pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((response) => {
        this.results.set(response?.items ?? []);
        this.searched.set(response !== null);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected pick(item: SearchItem): void {
    this.results.set([]);
    this.query.set('');
    this.valueChange.emit({ id: item.entity_id, title: item.title, code: item.code });
  }
}
