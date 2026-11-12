import { Severity } from './deviation.models';

/**
 * DTOs of the M03 anonymous / whistleblowing intake: the org's intake settings
 * (`deviations:admin`), the triage inbox (`deviations:intake`) and the public,
 * unauthenticated report form (coreflow-core `app/modules/deviations/schemas.py`).
 */

export const INTAKE_MODES = ['anonymous', 'whistleblowing'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

export const INTAKE_STATUSES = ['new', 'triaged', 'converted', 'dismissed'] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

/** The org's intake link settings. */
export interface IntakeSettings {
  readonly enabled: boolean;
  readonly mode: string;
  readonly token: string;
  /** Portal path of the public form, `/report/{token}`. */
  readonly public_path: string;
  readonly default_type_id: string | null;
  readonly instructions: string | null;
  readonly allow_contact: boolean;
  readonly updated_at: string | null;
}

/** Body of `PUT deviation-intake`. */
export interface IntakeSettingsInput {
  readonly enabled: boolean;
  readonly mode: IntakeMode;
  readonly default_type_id?: string | null;
  readonly instructions?: string | null;
  readonly allow_contact: boolean;
}

/** A received report, as seen by triage. */
export interface IntakeReport {
  readonly id: string;
  readonly mode: string;
  readonly title: string;
  readonly description: string;
  readonly occurred_on: string | null;
  readonly location: string | null;
  readonly contact: string | null;
  readonly status: string;
  readonly public_note: string | null;
  readonly deviation_id: string | null;
  readonly deviation_code: string | null;
  readonly triaged_by: string | null;
  readonly triaged_by_name: string | null;
  readonly triaged_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface IntakeReportList {
  readonly items: readonly IntakeReport[];
  readonly total: number;
}

export interface IntakeReportFilters {
  readonly status?: IntakeStatus;
  readonly limit?: number;
  readonly offset?: number;
}

/** Body of triage / dismiss: an optional note the reporter sees with their receipt. */
export interface IntakeNoteInput {
  readonly public_note?: string | null;
}

/** Body of `POST deviation-intake/reports/{id}/convert`. */
export interface ConvertIntakeRequest {
  readonly type_id?: string | null;
  readonly title?: string | null;
  readonly severity: Severity;
  readonly owner_user_id?: string | null;
  readonly department_id?: string | null;
  readonly public_note?: string | null;
  readonly data?: Record<string, unknown>;
}

export interface ConvertIntakeResponse {
  readonly report: IntakeReport;
  readonly deviation_id: string;
  readonly deviation_code: string;
}

// --- public (unauthenticated) ----------------------------------------------------------

/** What the public form shows about the receiving organisation. */
export interface PublicIntake {
  readonly org_name: string;
  readonly mode: string;
  readonly instructions: string | null;
  readonly allow_contact: boolean;
}

/** Body of `POST public/deviation-intake/{token}/reports`. */
export interface PublicReportInput {
  readonly title: string;
  readonly description: string;
  readonly occurred_on?: string | null;
  readonly location?: string | null;
  readonly contact?: string | null;
  /** Honeypot: always empty from a real form. */
  readonly website?: string;
}

export interface PublicReceipt {
  readonly receipt_code: string;
  readonly status: string;
  readonly received_at: string;
}

export interface PublicReportStatus {
  /** A converted report shows as `triaged`. */
  readonly status: string;
  readonly received_at: string;
  readonly updated_at: string;
  readonly public_note: string | null;
}
