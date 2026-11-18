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
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { ModuleService } from '../../../core/modules/module.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { Icon } from '../../../shared/ui/icon/icon';
import { subjectTypeKey } from '../data/inspection-display';
import { SUBJECT_TYPES, SubjectType } from '../data/inspection.models';

/** The chosen subject (or none). */
export interface SubjectValue {
  readonly type: SubjectType | null;
  readonly id: string | null;
  readonly title: string | null;
}

export const NO_SUBJECT: SubjectValue = { type: null, id: null, title: null };

/** Module that must be on for each subject type (to offer it at all). */
const SUBJECT_MODULES: Readonly<Record<SubjectType, string>> = {
  asset: 'assets',
  process: 'processes',
  supplier: 'suppliers',
  risk: 'risk',
};

/** Read permission needed to search each subject register. */
const SUBJECT_PERMISSIONS: Readonly<Record<SubjectType, string>> = {
  asset: 'assets:read',
  process: 'processes:read',
  supplier: 'suppliers:read',
  risk: 'risk:read',
};

let nextId = 0;

/**
 * "What does this inspection check?": an optional asset, process, supplier or risk.
 * Pick the kind, then search that register by name or code. The subject becomes a
 * connection on both records, so the asset or risk page lists its inspections.
 * Kinds whose module is off are not offered.
 */
@Component({
  selector: 'app-subject-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      <select
        [id]="inputId()"
        class="cf-subject-select"
        [attr.aria-label]="'inspections.subject.type' | transloco"
        (change)="setType($any($event.target).value)"
        data-testid="subject-type"
      >
        <option value="" [selected]="!value().type">
          {{ 'inspections.subject.none' | transloco }}
        </option>
        @for (t of types(); track t) {
          <option [value]="t" [selected]="t === value().type">
            {{ typeKey(t) | transloco }}
          </option>
        }
      </select>
      @if (value().type; as type) {
        @if (value().id) {
          <div
            class="flex min-h-10 items-center gap-2 rounded-tile border border-border bg-surface px-3"
            data-testid="subject-chosen"
          >
            <span class="min-w-0 flex-1 truncate text-ui text-fg">{{
              value().title || ('inspections.subject.chosen' | transloco)
            }}</span>
            <button
              type="button"
              class="flex flex-none rounded-full p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail"
              [attr.aria-label]="'inspections.subject.remove' | transloco"
              (click)="clear()"
            >
              <app-icon name="x" [size]="13" />
            </button>
          </div>
        } @else {
          <div class="relative">
            <input
              type="search"
              role="combobox"
              autocomplete="off"
              class="cf-subject-select w-full"
              [id]="searchId"
              [value]="query()"
              [placeholder]="
                'inspections.subject.searchPlaceholder'
                  | transloco: { type: (typeKey(type) | transloco) }
              "
              [attr.aria-label]="'inspections.subject.search' | transloco"
              [attr.aria-expanded]="results().length > 0"
              [attr.aria-controls]="listId"
              aria-autocomplete="list"
              (input)="search($any($event.target).value)"
              (keydown.escape)="results.set([])"
              data-testid="subject-search"
            />
            @if (searching() || results().length > 0 || noHits()) {
              <ul
                [id]="listId"
                role="listbox"
                class="absolute top-11 right-0 left-0 z-30 max-h-64 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
              >
                @if (searching()) {
                  <li class="px-2 py-1.5 text-meta text-fg-muted">
                    {{ 'common.loading' | transloco }}
                  </li>
                } @else if (noHits()) {
                  <li class="px-2 py-1.5 text-meta text-fg-muted">
                    {{ 'inspections.subject.noHits' | transloco }}
                  </li>
                }
                @for (hit of results(); track hit.entity_id) {
                  <li
                    role="option"
                    tabindex="-1"
                    [attr.aria-selected]="false"
                    class="cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface-2"
                    (mousedown)="$event.preventDefault()"
                    (click)="pick(hit)"
                    (keydown.enter)="pick(hit)"
                    data-testid="subject-option"
                  >
                    <span class="block text-ui font-semibold text-fg">{{ hit.title }}</span>
                    @if (hit.code) {
                      <span class="block font-mono text-meta text-fg-subtle">{{ hit.code }}</span>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .cf-subject-select {
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13.5px;
        padding: 0 12px;
        outline: none;
      }
      .cf-subject-select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class SubjectPicker {
  private readonly searchApi = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly modules = inject(ModuleService);

  readonly value = input<SubjectValue>(NO_SUBJECT);
  /** Id of the kind select, so an `app-form-field` label points at it. */
  readonly inputId = input('');
  readonly valueChange = output<SubjectValue>();

  protected readonly searchId = `cf-subject-${++nextId}`;
  protected readonly listId = `${this.searchId}-list`;
  protected readonly typeKey = subjectTypeKey;
  protected readonly query = signal('');
  protected readonly results = signal<readonly SearchItem[]>([]);
  protected readonly searching = signal(false);
  protected readonly noHits = signal(false);
  private readonly search$ = new Subject<string>();

  /** Only the kinds whose module is switched on and the caller can read. */
  protected readonly types = computed<readonly SubjectType[]>(() => {
    const permissions = this.selectedOrg.currentOrg()?.permissions ?? [];
    return SUBJECT_TYPES.filter(
      (t) =>
        t === this.value().type ||
        (this.modules.isEnabled(SUBJECT_MODULES[t]) &&
          permissions.includes(SUBJECT_PERMISSIONS[t])),
    );
  });

  constructor() {
    const sub = this.search$
      .pipe(
        debounceTime(200),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          const type = this.value().type;
          if (!orgId || !type || !q.trim()) {
            return of([] as SearchItem[]);
          }
          return this.searchApi.search(orgId, q, { types: [type], limit: 10 }).pipe(
            map((r) => r.items.filter((i) => i.entity_type === type)),
            catchError(() => of([] as SearchItem[])),
          );
        }),
      )
      .subscribe((items) => {
        this.searching.set(false);
        this.results.set(items);
        this.noHits.set(items.length === 0 && !!this.query().trim());
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected setType(raw: string): void {
    const type = (SUBJECT_TYPES as readonly string[]).includes(raw) ? (raw as SubjectType) : null;
    this.reset();
    this.valueChange.emit({ type, id: null, title: null });
  }

  protected search(q: string): void {
    this.query.set(q);
    this.noHits.set(false);
    this.searching.set(!!q.trim());
    this.search$.next(q);
  }

  protected pick(hit: SearchItem): void {
    this.reset();
    this.valueChange.emit({
      type: hit.entity_type as SubjectType,
      id: hit.entity_id,
      title: hit.code ? `${hit.code} ${hit.title}` : hit.title,
    });
  }

  protected clear(): void {
    this.reset();
    this.valueChange.emit({ type: this.value().type, id: null, title: null });
  }

  private reset(): void {
    this.query.set('');
    this.results.set([]);
    this.searching.set(false);
    this.noHits.set(false);
  }
}
