/**
 * IA v2 "Meld fra" / "Saker" DTOs, mirroring coreflow-core
 * `app/platform/speak_up/schemas.py` (`/v1/orgs/{org_id}/speak-up`, `/cases`).
 */

export const SPEAK_UP_TYPES = [
  'deviation',
  'near_miss',
  'data_breach',
  'security_incident',
  'complaint',
  'improvement',
] as const;
export type SpeakUpType = (typeof SPEAK_UP_TYPES)[number];

export const CASE_TYPES = [
  'deviation',
  'near_miss',
  'security_incident',
  'data_breach',
  'complaint',
  'improvement',
  'feedback',
  'intake',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export type Severity = 'low' | 'medium' | 'high';
export const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];

export type CaseTone = 'bad' | 'warn' | 'info' | 'ok' | 'plain';
export type CaseTab = 'open' | 'mine' | 'closed';
export const CASE_TABS: readonly CaseTab[] = ['open', 'mine', 'closed'];

/** Sub-kinds the proposal may set (mirrors quick create's HSE / security kinds). */
export const KINDS: Partial<Record<SpeakUpType, readonly string[]>> = {
  near_miss: [
    'near_miss',
    'injury',
    'occupational_illness',
    'dangerous_condition',
    'property_damage',
  ],
  security_incident: [
    'phishing',
    'malware',
    'unauthorised_access',
    'data_loss',
    'denial_of_service',
    'lost_device',
    'other',
  ],
};

export type AffectedType = 'customer' | 'supplier' | 'process' | 'asset';

export interface Affected {
  readonly entity_type: AffectedType;
  readonly id: string;
  readonly label: string;
}

export interface ProposedOwner {
  readonly user_id: string;
  readonly name: string;
  readonly reason: string | null;
}

export interface LegalDeadline {
  readonly key: string;
  readonly params: Record<string, unknown>;
  readonly at: string;
}

export interface Proposal {
  readonly type: SpeakUpType;
  readonly kind: string | null;
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly affected: readonly Affected[];
  readonly owner: ProposedOwner | null;
  readonly due_at: string | null;
  readonly deadline: LegalDeadline | null;
  readonly immediate_actions: string | null;
  readonly requirement_refs: readonly string[];
  readonly rationale: string | null;
}

export interface ProposeRequest {
  readonly text: string;
  readonly type_hint: SpeakUpType | null;
  readonly lang: 'nb' | 'en' | null;
}

export interface SpeakUpRequest {
  readonly type: SpeakUpType;
  readonly kind: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly severity: Severity;
  readonly owner_user_id: string | null;
  readonly due_at: string | null;
  readonly affected: readonly { readonly entity_type: AffectedType; readonly id: string }[];
  readonly immediate_actions: string | null;
  readonly customer_name: string | null;
}

export interface NextStep {
  readonly key: string;
  readonly params: Record<string, unknown>;
  readonly url: string | null;
}

export interface SpeakUpResult {
  readonly entity_type: string;
  readonly id: string;
  readonly code: string | null;
  readonly url: string | null;
  readonly owner_name: string | null;
  readonly next_steps: readonly NextStep[];
}

export interface CaseWhere {
  readonly kind: 'process' | 'department' | 'customer' | 'none';
  readonly label: string | null;
  readonly url: string | null;
}

export interface CaseItem {
  readonly entity_type: string;
  readonly id: string;
  readonly code: string | null;
  readonly title: string;
  readonly type: CaseType;
  readonly type_label: string;
  readonly reporter_name: string | null;
  readonly owner_name: string | null;
  readonly where: CaseWhere;
  readonly status: string;
  readonly status_label: string;
  readonly tone: CaseTone;
  readonly due_at: string | null;
  readonly created_at: string | null;
  readonly url: string;
  readonly module: string;
}

export interface CaseList {
  readonly items: readonly CaseItem[];
  readonly counts: { readonly open: number; readonly mine: number; readonly closed: number };
  readonly total: number;
  readonly intake_open: number | null;
}

export interface CaseQuery {
  readonly tab: CaseTab;
  readonly type: CaseType | null;
  readonly q: string | null;
  readonly limit: number;
  /** Rows to skip ("Vis flere" appends the next page). */
  readonly offset?: number;
  readonly lang: string | null;
}
