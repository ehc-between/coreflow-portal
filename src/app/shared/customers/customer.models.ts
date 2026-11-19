/**
 * The customer reference other modules embed (docs/customer-register-design.md §2.4,
 * `CustomerRefOut` in `app/modules/customers/refs.py`). A record that has a
 * "Kunde" field returns `customer_id` plus `customer: CustomerRef | null`.
 */
export interface CustomerRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: CustomerStatus;
  /** Soft-deleted customers keep their references (shown with "slettet"). */
  readonly deleted: boolean;
}

/** One picker option (`GET /customers/options`): the ref plus the org. number. */
export interface CustomerOption extends CustomerRef {
  readonly org_number: string | null;
}

export const CUSTOMER_STATUSES = ['prospect', 'active', 'former'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** Read / write / manage permission keys of the customers module (seeded by the backend). */
export const CUSTOMERS_READ = 'customers:read';
export const CUSTOMERS_WRITE = 'customers:write';
export const CUSTOMERS_MANAGE = 'customers:manage';

/** Module key (`org_module.key`) and entity type of a customer. */
export const CUSTOMERS_MODULE = 'customers';
export const CUSTOMER_ENTITY = 'customer';

/** Portal path of a customer card. */
export function customerUrl(id: string): string {
  return `/customers/${id}`;
}

/**
 * The status badge of a customer: prospect reads as "new" (info), active as
 * in use (accent), former as archived (neutral). Labels live in the
 * `customers` scope (`customers.status.<status>`).
 */
export function customerStatusBadge(status: string | null | undefined): {
  readonly meaning: 'lifecycle';
  readonly value: string;
  readonly labelKey: string;
} {
  const value = status === 'prospect' ? 'new' : status === 'former' ? 'archived' : 'active';
  const known = (CUSTOMER_STATUSES as readonly string[]).includes(status ?? '');
  return {
    meaning: 'lifecycle',
    value,
    labelKey: `customers.status.${known ? status : 'active'}`,
  };
}
