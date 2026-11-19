import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { CustomerPicker } from './customer-picker';
import { CustomersAvailability } from './customers-availability';

/**
 * The "Kunde" list filter (docs/customer-register-design.md §3.3): the picker's
 * typeahead in toolbar styling with "Alle kunder". The caller binds the value to
 * `?customer_id=` and passes it to its list endpoint. Renders nothing when the
 * customers module is off or the user may not read customers.
 *
 *   <app-customer-filter filters [value]="customerId()" (valueChange)="setCustomer($event)" />
 */
@Component({
  selector: 'app-customer-filter',
  imports: [TranslocoPipe, CustomerPicker],
  viewProviders: [provideSharedScope('customers')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.hidden]': '!available.canRead()', class: 'block' },
  template: `
    @if (available.canRead()) {
      <app-customer-picker
        mode="filter"
        [value]="value()"
        [ariaLabel]="'customers.ref.filterLabel' | transloco"
        (valueChange)="valueChange.emit($event)"
        data-testid="customer-filter"
      />
    }
  `,
})
export class CustomerFilter {
  protected readonly available = inject(CustomersAvailability);

  readonly value = input<string | null | undefined>(null);
  readonly valueChange = output<string | null>();
}
