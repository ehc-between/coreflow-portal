/** Kontakter API types (coreflow-core `app/platform/contacts`, IA v2 §6.5). */

export type ContactRole = 'customer' | 'supplier' | 'processor';
export type ContactTone = 'ok' | 'warn' | 'bad' | 'plain';
export type ContactTab = 'all' | 'customers' | 'suppliers' | 'processors' | 'agreements';

export const CONTACT_ROLES: readonly ContactRole[] = ['customer', 'supplier', 'processor'];
export const CONTACT_TABS: readonly ContactTab[] = [
  'all',
  'customers',
  'suppliers',
  'processors',
  'agreements',
];
export const CONTACT_STATUS_KEYS = [
  'approved',
  'conditional',
  'active',
  'missing_dpa',
  'blocked',
  'prospect',
  'former',
] as const;
export const CONTACT_NEXT_KEYS = [
  'signDpa',
  'evaluationOverdue',
  'noticeIn',
  'evaluationIn',
  'dpaPending',
  'openComplaints',
  'renewsOn',
] as const;
export const CONTACT_SENTENCE_KEYS = [
  'dpaMissing',
  'evaluationOverdue',
  'dpaSignedRenewal',
  'renewal',
  'dpaPending',
  'openComplaints',
  'dpaSigned',
  'evaluationDue',
  'prospect',
  'former',
  'allGood',
] as const;

export interface ContactStatus {
  readonly key: string;
  readonly tone: ContactTone;
}

export interface ContactNext {
  readonly key: string;
  readonly params: Record<string, unknown>;
  readonly tone: ContactTone;
  readonly due_at: string | null;
}

export interface ContactRow {
  readonly key: string;
  readonly name: string;
  readonly org_number: string | null;
  readonly place: string | null;
  readonly country: string | null;
  readonly roles: readonly ContactRole[];
  readonly refs: {
    readonly customer_id: string | null;
    readonly supplier_ids: readonly string[];
    readonly processor_ids: readonly string[];
    readonly contract_ids: readonly string[];
  };
  readonly status: ContactStatus;
  readonly next: ContactNext | null;
}

export interface ContactCounts {
  readonly all: number;
  readonly customer: number;
  readonly supplier: number;
  readonly processor: number;
  readonly agreements: number;
}

export interface ContactList {
  readonly items: readonly ContactRow[];
  readonly counts: ContactCounts;
  readonly total: number;
  readonly roles: readonly ContactRole[];
  readonly agreements_enabled: boolean;
}

export interface ContactAgreement {
  readonly id: string;
  /** Null: a processor's typed DPA (shown as "Databehandleravtale"). */
  readonly title: string | null;
  readonly code: string | null;
  readonly kind: 'contract' | 'dpa';
  readonly contract_type: string | null;
  readonly status: string;
  readonly signed_on: string | null;
  readonly renews_at: string | null;
  readonly notice_period_days: number | null;
  readonly notice_at: string | null;
  readonly days_to_notice: number | null;
  readonly tone: ContactTone;
  readonly url: string;
}

export interface ContactPersonalData {
  readonly id: string;
  readonly title: string;
  readonly country: string | null;
  readonly transfer_countries: readonly string[];
  readonly url: string;
}

export interface ContactRisk {
  readonly id: string;
  readonly title: string;
  readonly level: string | null;
  readonly after_treatment: boolean;
  readonly tone: ContactTone;
  readonly status: string | null;
  readonly url: string | null;
}

export interface ContactEvaluation {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly result: string | null;
  readonly date: string | null;
  readonly url: string;
}

export interface ContactIncident {
  readonly entity_type: string;
  readonly id: string;
  readonly title: string;
  readonly code: string | null;
  readonly status: string | null;
  readonly open: boolean;
  readonly label_key: string | null;
  readonly url: string | null;
}

export interface ContactCard {
  readonly key: string;
  readonly name: string;
  readonly org_number: string | null;
  readonly place: string | null;
  readonly country: string | null;
  readonly roles: readonly ContactRole[];
  readonly status: ContactStatus;
  readonly next: ContactNext | null;
  readonly sentence: {
    readonly purpose: string | null;
    readonly key: string;
    readonly params: Record<string, unknown>;
  };
  readonly agreements: readonly ContactAgreement[];
  readonly personal_data: readonly ContactPersonalData[];
  readonly risks: readonly ContactRisk[];
  readonly evaluations: readonly ContactEvaluation[];
  readonly next_evaluation_at: string | null;
  readonly incidents: readonly ContactIncident[];
  readonly customer: {
    readonly open_complaints: number;
    readonly open_deviations: number;
    readonly projects: number;
    readonly satisfaction: number | null;
    readonly customer_since: string | null;
  } | null;
  readonly members: readonly {
    readonly kind: ContactRole;
    readonly id: string;
    readonly name: string;
    readonly status: string;
  }[];
  readonly links: {
    readonly customer: string | null;
    readonly supplier: string | null;
    readonly processor: string | null;
  };
  readonly visible: {
    readonly contracts: boolean;
    readonly privacy: boolean;
    readonly suppliers: boolean;
  };
  readonly requirement_refs: Record<string, readonly string[]>;
}
