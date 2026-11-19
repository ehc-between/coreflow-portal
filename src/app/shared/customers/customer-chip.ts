import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CustomerRef, customerUrl } from './customer.models';
import { CustomersAvailability } from './customers-availability';

/**
 * A record's customer (docs/customer-register-design.md §3.3): the name (plus
 * "slettet" for a deleted customer), a link to the customer card when the user
 * may read customers, plain text otherwise, and "–" for no customer (tables).
 */
@Component({
  selector: 'app-customer-chip',
  imports: [RouterLink, TranslocoPipe],
  viewProviders: [provideSharedScope('customers')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0 max-w-full items-baseline gap-1.5' },
  template: `
    @if (ref(); as r) {
      @if (linkable()) {
        <a
          [routerLink]="url()"
          class="min-w-0 truncate font-semibold text-accent hover:underline"
          [attr.title]="r.code"
          data-testid="customer-chip"
          >{{ r.name }}</a
        >
      } @else {
        <span
          class="min-w-0 truncate text-fg"
          [attr.title]="available.canRead() ? r.code : ('customers.ref.noAccess' | transloco)"
          data-testid="customer-chip"
          >{{ r.name }}</span
        >
      }
      @if (r.deleted) {
        <span class="text-meta text-fg-subtle" data-testid="customer-chip-deleted">{{
          'customers.ref.deleted' | transloco
        }}</span>
      }
    } @else {
      <span class="text-fg-subtle" aria-hidden="true">–</span>
    }
  `,
})
export class CustomerChip {
  protected readonly available = inject(CustomersAvailability);

  readonly ref = input<CustomerRef | null | undefined>(null);

  protected readonly linkable = computed(() => {
    const r = this.ref();
    return !!r && !r.deleted && this.available.canRead();
  });
  protected readonly url = computed(() => {
    const r = this.ref();
    return r ? customerUrl(r.id) : '';
  });
}
