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
import { debounceTime, distinctUntilChanged, of, switchMap, catchError, skip } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DraftDocument } from './context-draft';

/**
 * Picks the controlled document that carries a policy (global search restricted
 * to documents the caller may read). Create only: the backend links it with a
 * `relates_to` entity link; more documents can be linked later under "Related".
 */
@Component({
  selector: 'app-context-document-picker',
  imports: [TranslocoPipe, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value(); as doc) {
      <div
        class="flex items-center justify-between gap-2 rounded-tile border border-border bg-surface px-3 py-2"
      >
        <span class="min-w-0 truncate text-[13px] text-fg">
          <app-icon name="documents" [size]="14" class="mr-1 align-middle text-fg-subtle" />
          @if (doc.code) {
            <span class="font-mono text-[12px] text-fg-muted">{{ doc.code }}</span>
          }
          {{ doc.title }}
        </span>
        <button
          type="button"
          class="rounded-[6px] p-1 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'context.policy.clearDocument' | transloco"
          (click)="valueChange.emit(null)"
        >
          <app-icon name="x" [size]="14" />
        </button>
      </div>
    } @else {
      <app-form-field [label]="'context.policy.document' | transloco" inputId="cf-policy-doc">
        <input
          id="cf-policy-doc"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="cf-policy-doc-results"
          [attr.aria-expanded]="results().length > 0"
          [value]="query()"
          [placeholder]="'context.policy.documentPlaceholder' | transloco"
          (input)="query.set($any($event.target).value)"
        />
      </app-form-field>
      @if (results().length) {
        <ul
          id="cf-policy-doc-results"
          role="listbox"
          class="mt-1 max-h-56 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
        >
          @for (item of results(); track item.entity_id) {
            <li role="option" [attr.aria-selected]="false">
              <button
                type="button"
                class="w-full rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                (click)="pick(item)"
              >
                @if (item.code) {
                  <span class="font-mono text-[12px] text-fg-muted">{{ item.code }}</span>
                }
                {{ item.title }}
              </button>
            </li>
          }
        </ul>
      } @else if (searched() && query().trim()) {
        <p class="mt-1 text-[12.5px] text-fg-muted">
          {{ 'context.policy.noDocumentMatches' | transloco }}
        </p>
      }
    }
  `,
})
export class DocumentPicker {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly value = input<DraftDocument | null>(null);
  readonly valueChange = output<DraftDocument | null>();

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
