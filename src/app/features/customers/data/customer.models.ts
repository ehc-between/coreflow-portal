import { EntityRefDto } from '../../../core/entities/entity.models';
import { CustomerRef, CustomerStatus } from '../../../shared/customers/customer.models';

/**
 * DTOs of the customers API (`/api/v1/orgs/{org_id}/customers`,
 * docs/customer-register-design.md §2.4 and §5.1). Mirrors
 * `app/modules/customers/schemas.py`.
 */

export interface UserRef {
  readonly id: string;
  readonly name: string;
}

/** A supplier with the same org. number ("Også leverandør", §2.6). */
export interface SupplierRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** The earliest renewal of the customer's active contracts. */
export interface NextRenewal {
  readonly date: string;
  readonly days: number;
  readonly contract_id: string;
  readonly code?: string | null;
  /** Last day to give notice (`end_date - notice_period_days`), when known. */
  readonly notice_by?: string | null;
}

/** Last Brønnøysund snapshot (`customer.registry`). */
export interface RegistrySnapshot {
  readonly bankrupt?: boolean | null;
  readonly under_liquidation?: boolean | null;
  readonly deleted_on?: string | null;
  readonly employees?: number | null;
  readonly registered_vat?: boolean | null;
  readonly checked_at?: string | null;
}

export interface CustomerContact {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly is_primary: boolean;
  readonly notes: string | null;
  readonly position: number;
}

export interface ContactIn {
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly is_primary: boolean;
  readonly notes: string | null;
}

/** The editable fields (create body; PATCH takes any subset). */
export interface CustomerFields {
  readonly name: string;
  readonly legal_name: string | null;
  readonly org_number: string | null;
  readonly org_form: string | null;
  readonly country: string | null;
  readonly address_line: string | null;
  readonly postal_code: string | null;
  readonly city: string | null;
  readonly industry_code: string | null;
  readonly industry_label: string | null;
  readonly segment: string | null;
  readonly status: CustomerStatus;
  readonly owner_user_id: string | null;
  readonly website: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly description: string | null;
  readonly customer_since: string | null;
  /** The lookup's snapshot, sent when the form used Brønnøysund. */
  readonly registry?: RegistrySnapshot | null;
}

export interface CustomerListItem {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly org_number: string | null;
  readonly status: CustomerStatus;
  readonly segment: string | null;
  readonly city: string | null;
  readonly owner: UserRef | null;
  readonly open_claims: number;
  readonly next_renewal: NextRenewal | null;
  readonly also_supplier: SupplierRef | null;
  readonly updated_at: string;
}

export interface CustomerPage {
  readonly items: readonly CustomerListItem[];
  readonly total: number;
}

export interface CustomerDetail {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly org_number: string | null;
  readonly org_form: string | null;
  readonly country: string | null;
  readonly address_line: string | null;
  readonly postal_code: string | null;
  readonly city: string | null;
  readonly industry_code: string | null;
  readonly industry_label: string | null;
  readonly segment: string | null;
  readonly status: CustomerStatus;
  readonly owner: UserRef | null;
  readonly department_id?: string | null;
  readonly website: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly description: string | null;
  readonly registry: RegistrySnapshot | null;
  readonly customer_since: string | null;
  readonly contacts: readonly CustomerContact[];
  readonly also_supplier: SupplierRef | null;
  /** False when a Norwegian org. number fails mod-11 (a warning only, D4). */
  readonly orgnr_checksum_ok: boolean | null;
  readonly can_edit: boolean;
  readonly can_manage: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CustomerSummary {
  readonly total?: number;
  readonly by_status?: Partial<Record<CustomerStatus, number>>;
  readonly pending_matches: number;
  readonly last_scan: ScanResult | null;
}

export interface ScanResult {
  readonly at?: string;
  readonly created: number;
  readonly linked: number;
  readonly pending: number;
  readonly skipped?: number;
}

/** `GET /registry/{orgnr}`: Brønnøysund data mapped to customer fields (§2.2). */
export interface RegistryLookup {
  readonly org_number: string;
  readonly name: string | null;
  readonly legal_name: string | null;
  readonly org_form: string | null;
  readonly address_line: string | null;
  readonly postal_code: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly industry_code: string | null;
  readonly industry_label: string | null;
  readonly website: string | null;
  readonly registry: RegistrySnapshot | null;
  readonly existing_customer: CustomerRef | null;
  readonly also_supplier: SupplierRef | null;
}

export const CUSTOMER_SORTS = ['name', '-updated', 'next_renewal'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface CustomerQuery {
  readonly q?: string;
  readonly status?: readonly CustomerStatus[];
  readonly segment?: string;
  readonly owner_user_id?: string;
  readonly has_open_claims?: boolean;
  readonly sort?: CustomerSort;
  readonly limit?: number;
  readonly offset?: number;
}

// --- The customer card (§5.1) -------------------------------------------

export const SECTION_KEYS = [
  'claims',
  'deviations',
  'contracts',
  'projects',
  'satisfaction',
  'requirements',
  'audits',
  'privacy',
  'property',
  'documents',
  'work',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Extra facts of one section item (`extra`). */
export interface SectionItemExtra {
  readonly due_on?: string | null;
  readonly days?: number | null;
  readonly severity?: string | null;
  readonly score?: number | null;
  /** `customers` scope key under `overview.badges`, e.g. `dpa`, `autoRenew`. */
  readonly badge_key?: string | null;
}

export interface SectionItem extends EntityRefDto {
  readonly extra?: SectionItemExtra | null;
}

export interface OverviewSection {
  readonly key: SectionKey | string;
  readonly module: string;
  readonly total: number;
  readonly open: number;
  readonly items: readonly SectionItem[];
  readonly list_url: string | null;
  readonly flow_key: string | null;
}

export interface SatisfactionPoint {
  readonly period: string;
  readonly score: number | null;
  readonly n: number;
}

export interface SatisfactionFact {
  readonly score: number | null;
  readonly trend: 'up' | 'down' | 'flat' | null;
  readonly points: readonly SatisfactionPoint[];
  readonly complaints_12m: number;
  readonly compliments_12m: number;
}

export interface AuditFact {
  readonly date: string;
  readonly audit_id: string;
  readonly code?: string | null;
  readonly open_findings?: number;
}

export interface OverviewFacts {
  readonly open_claims?: number;
  readonly open_deviations?: number;
  readonly active_contracts?: number;
  readonly next_renewal?: NextRenewal | null;
  readonly active_projects?: number;
  readonly satisfaction?: SatisfactionFact | null;
  readonly open_requirements?: number;
  readonly last_audit?: AuditFact | null;
  readonly next_audit?: { readonly date: string; readonly audit_id: string } | null;
  readonly processing?: number;
  readonly open_breaches?: number;
  readonly property_items?: number;
}

export interface CustomerOverview {
  readonly customer: CustomerRef;
  readonly facts: OverviewFacts;
  readonly sections: readonly OverviewSection[];
  readonly pending_matches: number;
}

// --- Review queue (§1.3, §6) -------------------------------------------------

export const MATCH_REASONS = ['same_core_name', 'similar_name', 'ambiguous'] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];
export type MatchStatus = 'pending' | 'accepted' | 'created' | 'dismissed';
export type MatchAction = 'accept' | 'create' | 'dismiss';

export interface MatchOut {
  readonly id: string;
  readonly field_key: string;
  readonly entity_type: string;
  readonly entity_id: string;
  /** The record the text was found in (null when the caller may not read it). */
  readonly entity: EntityRefDto | null;
  readonly source_text: string;
  readonly source_org_number: string | null;
  readonly proposed_customer_id: string | null;
  readonly reason: MatchReason;
  readonly score: number;
  readonly status: MatchStatus;
  readonly created_at?: string;
}

export interface MatchGroup {
  /** Null: the proposal is "create a new customer". */
  readonly proposed: CustomerRef | null;
  readonly proposed_name: string;
  readonly items: readonly MatchOut[];
}
