import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, of, switchMap } from 'rxjs';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { CustomerOption, CustomerRef } from './customer.models';
import { CustomerRefApi } from './customer-ref-api';
import { CustomersAvailability } from './customers-availability';

const SEARCH_DEBOUNCE_MS = 200;
let nextId = 0;

/** One row of the open list: no customer, a customer, or "create «X»". */
type PickerRow =
  | { readonly kind: 'none'; readonly key: string }
  | { readonly kind: 'option'; readonly key: string; readonly option: CustomerOption }
  | { readonly kind: 'create'; readonly key: string; readonly name: string };

function toRef(o: CustomerOption | CustomerRef): CustomerRef {
  return { id: o.id, code: o.code, name: o.name, status: o.status, deleted: !!o.deleted };
}

/**
 * The "Kunde" field every module uses (docs/customer-register-design.md §3.3): a
 * combobox with typeahead over the customer register, "Ingen kunde", and
 * "Opprett kunden «X»" (quick create) for users with `customers:write`. Renders
 * nothing when the customers module is off. The caller puts it in its own
 * `app-form-field` (label key `customers.ref.label`, "Kunde") with the same
 * `inputId`.
 *
 *   <app-form-field [label]="'customers.ref.label' | transloco" inputId="dev-customer">
 *     <app-customer-picker inputId="dev-customer" [value]="customerId()"
 *       [current]="record()?.customer ?? null" (valueChange)="customerId.set($event)" />
 *   </app-form-field>
 *
 * `mode="filter"` is the list-toolbar variant (see `app-customer-filter`):
 * "Alle kunder" instead of "Ingen kunde", no quick create, toolbar styling.
 */
@Component({
  selector: 'app-customer-picker',
  imports: [TranslocoPipe],
  viewProviders: [provideSharedScope('customers')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '[class.hidden]': '!available.enabled()',
    '(document:pointerdown)': 'onDocumentPointer($event)',
  },
  template: `
    @if (available.enabled()) {
      <input
        type="text"
        role="combobox"
        autocomplete="off"
        [id]="id()"
        [value]="text()"
        [disabled]="disabled()"
        [required]="required()"
        [attr.aria-required]="required() || null"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeRowId()"
        [attr.aria-label]="ariaLabel() || null"
        aria-autocomplete="list"
        [placeholder]="
          (mode() === 'filter' ? 'customers.ref.filterAll' : 'customers.ref.placeholder')
            | transloco
        "
        [class]="
          mode() === 'filter'
            ? 'h-10 w-full min-w-[180px] rounded-tile border border-border bg-bg px-2.5 text-ui text-fg outline-none placeholder:text-fg focus:border-accent'
            : ''
        "
        (focus)="openList()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
        data-testid="customer-picker-input"
      />
      @if (open()) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
          data-testid="customer-picker-list"
        >
          @for (row of rows(); track row.key; let i = $index) {
            <li
              role="option"
              [id]="rowId(i)"
              [attr.aria-selected]="i === active()"
              class="flex cursor-pointer items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-ui"
              [class.bg-surface-2]="i === active()"
              (pointerdown)="$event.preventDefault()"
              tabindex="-1"
              (click)="choose(row)"
              (keydown.enter)="choose(row)"
              (pointerenter)="active.set(i)"
              [attr.data-testid]="'customer-option-' + row.kind"
            >
              @switch (row.kind) {
                @case ('none') {
                  <span class="text-fg-muted">{{
                    (mode() === 'filter' ? 'customers.ref.filterAll' : 'customers.ref.none')
                      | transloco
                  }}</span>
                }
                @case ('option') {
                  <span class="font-mono text-meta text-fg-subtle">{{ row.option.code }}</span>
                  <span class="min-w-0 flex-1 truncate text-fg">{{ row.option.name }}</span>
                  @if (row.option.org_number) {
                    <span class="text-meta text-fg-subtle">{{ row.option.org_number }}</span>
                  }
                }
                @case ('create') {
                  <span class="font-semibold text-accent">{{
                    'customers.ref.create' | transloco: { name: row.name }
                  }}</span>
                }
              }
            </li>
          } @empty {
            <li class="px-2.5 py-1.5 text-meta text-fg-muted" role="presentation">
              {{ (loading() ? 'customers.ref.searching' : 'customers.ref.noMatch') | transloco }}
            </li>
          }
        </ul>
      }
    }
  `,
})
export class CustomerPicker {
  private readonly api = inject(CustomerRefApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly available = inject(CustomersAvailability);

  /** Selected customer id (null = none). */
  readonly value = input<string | null | undefined>(null);
  /** The record's current customer ref, so the name shows without a lookup. */
  readonly current = input<CustomerRef | null | undefined>(null);
  readonly required = input(false);
  readonly disabled = input(false);
  /** id of the input, for the caller's `app-form-field` label. */
  readonly inputId = input<string | null | undefined>(null);
  /** Accessible name when there is no visible label (the filter). */
  readonly ariaLabel = input<string | null | undefined>(null);
  readonly mode = input<'field' | 'filter'>('field');

  readonly valueChange = output<string | null>();
  /** The chosen customer (null when cleared), for callers that show or prefill from it. */
  readonly refChange = output<CustomerRef | null>();

  private readonly fallbackId = `cf-customer-${nextId++}`;
  protected readonly listId = `${this.fallbackId}-list`;
  protected readonly id = computed(() => this.inputId() || this.fallbackId);

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly query = signal('');
  /** The user is typing (the input shows the query, not the selected name). */
  protected readonly editing = signal(false);
  protected readonly options = signal<readonly CustomerOption[]>([]);
  protected readonly active = signal(0);
  /** The last customer chosen here or found for `value`. */
  private readonly known = signal<CustomerRef | null>(null);

  protected readonly selected = computed<CustomerRef | null>(() => {
    const id = this.value();
    if (!id) {
      return null;
    }
    const current = this.current();
    if (current?.id === id) {
      return current;
    }
    const known = this.known();
    return known?.id === id ? known : null;
  });

  protected readonly text = computed(() =>
    this.editing() ? this.query() : (this.selected()?.name ?? ''),
  );

  protected readonly rows = computed<readonly PickerRow[]>(() => {
    const out: PickerRow[] = [];
    if (!this.required() || this.mode() === 'filter') {
      out.push({ kind: 'none', key: 'none' });
    }
    for (const option of this.options()) {
      out.push({ kind: 'option', key: option.id, option });
    }
    const name = this.query().trim();
    const exact = this.options().some((o) => o.name.trim().toLowerCase() === name.toLowerCase());
    if (this.mode() === 'field' && name && !exact && this.available.canWrite()) {
      out.push({ kind: 'create', key: 'create', name });
    }
    return out;
  });

  protected readonly activeRowId = computed(() =>
    this.open() && this.rows().length ? this.rowId(this.active()) : null,
  );

  private readonly searches = new Subject<string>();
  private createSub: Subscription | null = null;

  constructor() {
    this.searches
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          if (!orgId) {
            return of([] as readonly CustomerOption[]);
          }
          return this.api
            .options(orgId, q, this.value())
            .pipe(catchError(() => of([] as readonly CustomerOption[])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((options) => {
        this.options.set(options);
        this.loading.set(false);
        this.active.set(0);
        const id = untracked(() => this.value());
        const hit = id ? options.find((o) => o.id === id) : undefined;
        if (hit && !untracked(() => this.selected())) {
          this.known.set(toRef(hit));
        }
      });
    // A value set from outside (prefill by id) without a ref: look the name up once.
    effect(() => {
      const id = this.value();
      const enabled = this.available.enabled();
      if (id && enabled && !this.selected()) {
        untracked(() => this.search(''));
      }
    });
    inject(DestroyRef).onDestroy(() => this.createSub?.unsubscribe());
  }

  protected rowId(index: number): string {
    return `${this.fallbackId}-opt-${index}`;
  }

  protected openList(): void {
    if (this.disabled()) {
      return;
    }
    if (!this.open()) {
      this.open.set(true);
      this.search(this.editing() ? this.query() : '');
    }
  }

  protected onInput(text: string): void {
    this.editing.set(true);
    this.query.set(text);
    this.open.set(true);
    this.search(text);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.rows().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openList();
        } else if (count) {
          this.active.set((this.active() + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) {
          this.active.set((this.active() - 1 + count) % count);
        }
        break;
      case 'Enter': {
        const row = this.rows()[this.active()];
        if (this.open() && row) {
          event.preventDefault();
          this.choose(row);
        }
        break;
      }
      case 'Escape':
        if (this.open()) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        }
        break;
    }
  }

  protected onBlur(): void {
    this.close();
  }

  protected onDocumentPointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected choose(row: PickerRow): void {
    if (row.kind === 'none') {
      this.emit(null);
    } else if (row.kind === 'option') {
      this.emit(toRef(row.option));
    } else {
      this.create(row.name);
    }
  }

  private create(name: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.createSub) {
      return;
    }
    this.createSub = this.api.quickCreate(orgId, name).subscribe({
      next: (ref) => {
        this.createSub = null;
        this.notifications.success('customers.ref.created', { name: ref.name });
        this.emit(ref);
      },
      error: () => {
        this.createSub = null;
        this.notifications.error('customers.ref.createFailed');
      },
    });
  }

  private emit(ref: CustomerRef | null): void {
    this.known.set(ref);
    this.close();
    this.valueChange.emit(ref?.id ?? null);
    this.refChange.emit(ref);
  }

  private close(): void {
    this.open.set(false);
    this.editing.set(false);
    this.query.set('');
  }

  private search(q: string): void {
    this.loading.set(true);
    this.searches.next(q);
  }
}
