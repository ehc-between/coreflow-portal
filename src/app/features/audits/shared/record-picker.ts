import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { SearchApi } from '../../../core/search/search-api';
import { SearchItem } from '../../../core/search/search.models';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Icon } from '../../../shared/ui/icon/icon';
import { AuditAccess } from '../data/audit-access';
import { EntityRef } from '../data/audit.models';

let nextId = 0;

/** A search hit as an entity ref (for chips and payloads). */
export function searchItemToRef(item: SearchItem): EntityRef {
  return {
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    title: item.title,
    code: item.code,
    url: item.url,
    status: null,
    module: item.module,
    label_key: item.label_key,
  };
}

/**
 * Search box over other modules' records (global search limited to `types`) that
 * emits the record the user picks: an audited process, a criteria document, the
 * deviation that handles a finding, evidence for a checklist question, a course…
 * An empty query lists the newest records of those types.
 */
@Component({
  selector: 'app-audit-record-picker',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <label class="sr-only" [attr.for]="id">{{ placeholderKey() | transloco }}</label>
    <div
      class="flex h-10 items-center gap-2 rounded-tile border border-border bg-bg px-3 focus-within:border-accent"
    >
      <app-icon name="search" [size]="15" class="text-fg-subtle" />
      <input
        [id]="inputId() || id"
        type="search"
        class="h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-placeholder"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [placeholder]="placeholderKey() | transloco"
        [value]="text()"
        (input)="onInput($any($event.target).value)"
        (focus)="onInput(text())"
        (keydown.escape)="open.set(false)"
        autocomplete="off"
        data-testid="audit-record-picker"
      />
    </div>
    @if (open()) {
      <ul
        [id]="listId"
        role="listbox"
        class="absolute right-0 left-0 z-30 mt-1 max-h-[240px] overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
      >
        @for (r of results(); track r.entity_id) {
          <li role="option" [attr.aria-selected]="false" [attr.aria-disabled]="isExcluded(r)">
            <button
              type="button"
              class="flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-ui text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50"
              [disabled]="isExcluded(r)"
              (click)="pick(r)"
            >
              @if (r.code) {
                <span class="flex-none font-mono text-meta text-fg-subtle">{{ r.code }}</span>
              }
              <span class="min-w-0 flex-1 truncate">{{ r.title }}</span>
              @if (types().length > 1) {
                <span class="flex-none text-meta text-fg-subtle">{{
                  r.label_key | transloco
                }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="px-2.5 py-2 text-meta text-fg-muted">
            {{
              (!text().trim()
                ? 'audits.common.typeToSearch'
                : searching()
                  ? 'audits.common.searching'
                  : 'audits.common.noMatches'
              ) | transloco
            }}
          </li>
        }
      </ul>
    }
  `,
})
export class AuditRecordPicker {
  private readonly search = inject(SearchApi);
  private readonly access = inject(AuditAccess);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Entity types to search (`process`, `document`, `deviation`, `supplier`, `course`…). */
  readonly types = input.required<readonly string[]>();
  /** Record ids already chosen (shown disabled). */
  readonly excluded = input<readonly string[]>([]);
  readonly placeholderKey = input('audits.common.searchRecords');
  readonly inputId = input('');
  readonly picked = output<EntityRef>();

  protected readonly id = `audit-record-picker-${++nextId}`;
  protected readonly listId = `${this.id}-list`;
  protected readonly text = signal('');
  protected readonly open = signal(false);
  protected readonly searching = signal(false);
  protected readonly results = signal<readonly SearchItem[]>([]);
  private readonly excludedSet = computed(() => new Set(this.excluded()));
  private readonly queries = new Subject<string>();
  private readonly sub: Subscription;

  constructor() {
    this.sub = this.queries
      .pipe(
        debounceTime(200),
        switchMap((q) =>
          this.search
            .search(this.access.orgId() ?? '', q, { types: [...this.types()], limit: 12 })
            .pipe(
              map((res) => res.items),
              catchError(() => of([] as readonly SearchItem[])),
            ),
        ),
      )
      .subscribe((items) => {
        this.searching.set(false);
        this.results.set(items);
      });
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected isExcluded(r: SearchItem): boolean {
    return this.excludedSet().has(r.entity_id);
  }

  protected onInput(q: string): void {
    this.text.set(q);
    this.open.set(true);
    this.searching.set(!!q.trim());
    this.queries.next(q.trim());
  }

  protected pick(r: SearchItem): void {
    this.picked.emit(searchItemToRef(r));
    this.text.set('');
    this.open.set(false);
  }
}

/**
 * Several records of other modules as removable chips plus a picker to add more,
 * e.g. the processes an audit covers. The value is the list of entity refs.
 */
@Component({
  selector: 'app-audit-record-select',
  imports: [TranslocoPipe, EntityChip, Icon, AuditRecordPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    @if (value().length) {
      <ul class="flex flex-wrap gap-1.5" [attr.aria-label]="labelKey() | transloco">
        @for (r of value(); track r.entity_id) {
          <li class="inline-flex max-w-full items-center gap-1">
            <app-entity-chip [ref]="r" [showType]="false" />
            <button
              type="button"
              class="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fail-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="'audits.common.removeItem' | transloco: { name: r.title }"
              (click)="remove(r)"
            >
              <app-icon name="x" [size]="13" />
            </button>
          </li>
        }
      </ul>
    }
    @if (value().length < max()) {
      <app-audit-record-picker
        [types]="types()"
        [inputId]="inputId()"
        [excluded]="ids()"
        [placeholderKey]="placeholderKey()"
        (picked)="add($event)"
      />
    }
  `,
})
export class AuditRecordSelect {
  readonly types = input.required<readonly string[]>();
  readonly value = input<readonly EntityRef[]>([]);
  readonly labelKey = input('audits.common.chosen');
  readonly placeholderKey = input('audits.common.searchRecords');
  readonly inputId = input('');
  readonly max = input(100);
  readonly valueChange = output<EntityRef[]>();

  protected readonly ids = computed(() => this.value().map((r) => r.entity_id));

  protected add(ref: EntityRef): void {
    if (!this.ids().includes(ref.entity_id)) {
      this.valueChange.emit([...this.value(), ref]);
    }
  }

  protected remove(ref: EntityRef): void {
    this.valueChange.emit(this.value().filter((r) => r.entity_id !== ref.entity_id));
  }
}
