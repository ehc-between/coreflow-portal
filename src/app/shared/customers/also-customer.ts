import { HttpContext } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../core/http/error.interceptor';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { CustomerRef, customerUrl } from './customer.models';
import { customersPath } from './customer-ref-api';
import { CustomersAvailability } from './customers-availability';

/**
 * The org. number as the register compares it: a leading `NO` and a trailing `MVA`
 * dropped, digits only for Norwegian numbers; else trimmed upper case without
 * spaces. Null when nothing is left.
 */
export function normaliseOrgNumber(raw: string | null | undefined): string | null {
  let value = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!value) {
    return null;
  }
  value = value.replace(/^NO/, '').replace(/MVA$/, '');
  const digits = value.replace(/\D/g, '');
  if (digits.length === 9 && /^[\d.\- ]+$/.test(value)) {
    return digits;
  }
  return value || null;
}

/**
 * "Også kunde → CUS-0004" on a supplier card (docs/customer-register-design.md
 * §2.6, §3.2): the customer with the same org. number, from
 * `GET /customers/by-org-number/{orgnr}`. Shown only when the customers module is
 * on and the user may read customers. Emits `resolved` (the customer, or null
 * when there is none) so the page can offer "Registrer som kunde".
 */
@Component({
  selector: 'app-also-customer',
  imports: [RouterLink, TranslocoPipe],
  viewProviders: [provideSharedScope('customers')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block empty:hidden' },
  template: `
    @if (customer(); as c) {
      <a
        [routerLink]="link()"
        class="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-meta font-semibold text-fg hover:border-accent"
        data-testid="also-customer"
      >
        {{ 'customers.alsoCustomer' | transloco: { code: c.code } }}
        <span aria-hidden="true">→</span>
      </a>
    }
  `,
})
export class AlsoCustomer {
  private readonly api = inject(ApiService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly available = inject(CustomersAvailability);

  /** The supplier's registration number (any formatting). */
  readonly orgNumber = input<string | null | undefined>(null);
  readonly resolved = output<CustomerRef | null>();

  protected readonly customer = signal<CustomerRef | null>(null);
  protected readonly link = computed(() => {
    const c = this.customer();
    return c ? customerUrl(c.id) : '';
  });

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const orgnr = normaliseOrgNumber(this.orgNumber());
      const allowed = this.available.canRead();
      untracked(() => this.load(orgId, orgnr, allowed));
    });
  }

  private load(orgId: string | null, orgnr: string | null, allowed: boolean): void {
    this.sub.unsubscribe();
    this.customer.set(null);
    if (!orgId || !allowed) {
      return;
    }
    if (!orgnr) {
      this.resolved.emit(null);
      return;
    }
    this.sub = this.api
      .get<CustomerRef>(`${customersPath(orgId)}/by-org-number/${encodeURIComponent(orgnr)}`, {
        context: new HttpContext().set(SKIP_ERROR_TOAST, true),
      })
      .subscribe({
        next: (ref) => {
          const found = ref && !ref.deleted ? ref : null;
          this.customer.set(found);
          this.resolved.emit(found);
        },
        error: () => this.resolved.emit(null),
      });
  }
}
