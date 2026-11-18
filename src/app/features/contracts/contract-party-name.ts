import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, Subscription, catchError, debounceTime, of, switchMap } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { SearchApi } from '../../core/search/search-api';
import { SearchItem } from '../../core/search/search.models';
import { Icon } from '../../shared/ui/icon/icon';

/** What the party name field reports: the name, and the supplier it is linked to (or null). */
export interface PartyNameValue {
  readonly name: string;
  readonly supplier_id: string | null;
  /** "SUP-0001 Nordic Cloud AS", for showing the link before saving. */
  readonly supplier_label: string | null;
}

/**
 * The name of a contract party as a type-ahead over the supplier register: picking
 * a supplier links the party to it (`supplier_id`), so the contract shows on the
 * supplier page and the DPA check can match it. Free text stays possible (customers,
 * our own organisation); when no supplier matches, "Register supplier" opens the
 * supplier form in a new tab. The server also links an exact org-number or name
 * match on save.
 */
@Component({
  selector: 'app-contract-party-name',
  imports: [RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input
      [id]="inputId()"
      type="text"
      maxlength="255"
      autocomplete="off"
      role="combobox"
      [attr.aria-expanded]="suggestions().length > 0"
      [attr.aria-controls]="inputId() + '-list'"
      aria-autocomplete="list"
      [value]="name()"
      (input)="type($any($event.target).value)"
      (keydown.escape)="suggestions.set([])"
      (blur)="closeSoon()"
      class="h-10 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
      data-testid="party-name"
    />
    @if (suggestions().length) {
      <ul
        [id]="inputId() + '-list'"
        role="listbox"
        class="absolute right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-tile border border-border bg-surface p-1 shadow-pop"
      >
        @for (s of suggestions(); track s.entity_id) {
          <li role="option" [attr.aria-selected]="supplierId() === s.entity_id">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui text-fg hover:bg-surface-2"
              (mousedown)="$event.preventDefault()"
              (click)="pick(s)"
              [attr.data-testid]="'party-suggestion-' + (s.code ?? s.entity_id)"
            >
              <span class="font-mono text-meta text-fg-subtle">{{ s.code }}</span>
              <span class="min-w-0 flex-1 truncate">{{ s.title }}</span>
            </button>
          </li>
        }
      </ul>
    }
    @if (supplierId()) {
      <p
        class="mt-1 flex flex-wrap items-center gap-2 text-meta text-pass-ink"
        data-testid="party-linked"
      >
        <app-icon name="link" [size]="12" />
        {{ 'contracts.parties.linkedTo' | transloco: { supplier: supplierLabel() ?? '' } }}
        <button
          type="button"
          class="font-semibold text-accent hover:underline"
          (click)="unlink()"
          data-testid="party-unlink"
        >
          {{ 'contracts.parties.unlink' | transloco }}
        </button>
      </p>
    } @else if (searched() && name().trim().length >= 2 && !isInternal()) {
      <p class="mt-1 text-meta text-fg-muted" data-testid="party-no-supplier">
        {{ 'contracts.parties.notInRegister' | transloco }}
        <a
          routerLink="/suppliers/new"
          target="_blank"
          rel="noopener"
          class="font-semibold text-accent hover:underline"
          >{{ 'contracts.parties.registerSupplier' | transloco }}</a
        >
      </p>
    }
  `,
})
export class ContractPartyName {
  private readonly search = inject(SearchApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly inputId = input.required<string>();
  readonly name = input('');
  readonly supplierId = input<string | null>(null);
  readonly supplierLabel = input<string | null>(null);
  /** Our own organisation is never a supplier: no register hint. */
  readonly isInternal = input(false);
  readonly changed = output<PartyNameValue>();

  protected readonly suggestions = signal<readonly SearchItem[]>([]);
  protected readonly searched = signal(false);

  private readonly queries = new Subject<string>();
  private readonly sub: Subscription;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.sub = this.queries
      .pipe(
        debounceTime(250),
        switchMap((q) => {
          const orgId = this.selectedOrg.currentOrgId();
          return orgId && q.trim().length >= 2
            ? this.search
                .search(orgId, q, { types: ['supplier'], limit: 6 })
                .pipe(catchError(() => of({ items: [], counts: {} })))
            : of({ items: [], counts: {} });
        }),
      )
      .subscribe((res) => {
        this.searched.set(true);
        this.suggestions.set(res.items.filter((i) => i.entity_type === 'supplier'));
      });
    inject(DestroyRef).onDestroy(() => {
      this.sub.unsubscribe();
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
      }
    });
  }

  protected type(value: string): void {
    // Typing a different name drops a link made by picking.
    this.changed.emit({ name: value, supplier_id: null, supplier_label: null });
    this.searched.set(false);
    if (!this.isInternal()) {
      this.queries.next(value);
    }
  }

  protected pick(s: SearchItem): void {
    this.suggestions.set([]);
    this.changed.emit({
      name: s.title,
      supplier_id: s.entity_id,
      supplier_label: [s.code, s.title].filter(Boolean).join(' '),
    });
  }

  protected unlink(): void {
    this.changed.emit({ name: this.name(), supplier_id: null, supplier_label: null });
  }

  protected closeSoon(): void {
    this.closeTimer = setTimeout(() => this.suggestions.set([]), 150);
  }
}
