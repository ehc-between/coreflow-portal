import { CriterionDraft } from '../shared/criteria-editor';
import { blankToNull, fromLocalInput, toLocalInput } from './recruitment-display';
import {
  EmploymentType,
  RequisitionCreate,
  RequisitionDetail,
  RequisitionUpdate,
  RoleRisk,
} from './recruitment.models';

/** The requisition form's editable state (strings as typed into the inputs). */
export interface RequisitionDraft {
  readonly title: string;
  readonly description: string;
  readonly justification: string;
  readonly department_id: string;
  readonly location: string;
  readonly employment_type: EmploymentType;
  readonly headcount: number;
  readonly role_risk: RoleRisk;
  readonly target_start_date: string;
  readonly hiring_manager_user_id: string;
  readonly recruiter_user_id: string;
  readonly screening_criteria: readonly CriterionDraft[];
  readonly posting_title: string;
  readonly posting_text: string;
  /** `datetime-local` value (local time). */
  readonly posting_closes_at: string;
}

export function emptyRequisitionDraft(): RequisitionDraft {
  return {
    title: '',
    description: '',
    justification: '',
    department_id: '',
    location: '',
    employment_type: 'permanent',
    headcount: 1,
    role_risk: 'medium',
    target_start_date: '',
    hiring_manager_user_id: '',
    recruiter_user_id: '',
    screening_criteria: [],
    posting_title: '',
    posting_text: '',
    posting_closes_at: '',
  };
}

export function draftFromRequisition(req: RequisitionDetail): RequisitionDraft {
  return {
    title: req.title,
    description: req.description ?? '',
    justification: req.justification ?? '',
    department_id: req.department_id ?? '',
    location: req.location ?? '',
    employment_type: req.employment_type,
    headcount: req.headcount,
    role_risk: req.role_risk,
    target_start_date: req.target_start_date ?? '',
    hiring_manager_user_id: req.hiring_manager?.id ?? '',
    recruiter_user_id: req.recruiter?.id ?? '',
    screening_criteria: req.screening_criteria.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description ?? '',
    })),
    posting_title: req.posting_title ?? '',
    posting_text: req.posting_text ?? '',
    posting_closes_at: toLocalInput(req.posting_closes_at),
  };
}

/** The create body for a draft (blank criteria rows are dropped). */
export function requisitionPayload(draft: RequisitionDraft): RequisitionCreate {
  return {
    title: draft.title.trim(),
    description: blankToNull(draft.description),
    justification: blankToNull(draft.justification),
    department_id: draft.department_id || null,
    location: blankToNull(draft.location),
    employment_type: draft.employment_type,
    headcount: Math.max(1, Math.min(500, Math.round(Number(draft.headcount) || 1))),
    role_risk: draft.role_risk,
    target_start_date: draft.target_start_date || null,
    hiring_manager_user_id: draft.hiring_manager_user_id || null,
    recruiter_user_id: draft.recruiter_user_id || null,
    screening_criteria: draft.screening_criteria
      .filter((c) => c.label.trim() !== '')
      .map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        label: c.label.trim(),
        description: blankToNull(c.description),
      })),
    posting_title: blankToNull(draft.posting_title),
    posting_text: blankToNull(draft.posting_text),
    posting_closes_at: fromLocalInput(draft.posting_closes_at),
  };
}

/**
 * Only the fields that differ from the saved requisition (a PATCH body), so
 * locked fields that were not touched are never sent after approval.
 */
export function requisitionChanges(
  original: RequisitionDetail,
  draft: RequisitionDraft,
  changeReason: string,
): RequisitionUpdate {
  const before = requisitionPayload(draftFromRequisition(original));
  const after = requisitionPayload(draft);
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof RequisitionCreate)[]) {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) {
      changes[key] = after[key];
    }
  }
  const reason = blankToNull(changeReason);
  if (reason) {
    changes['change_reason'] = reason;
  }
  return changes as RequisitionUpdate;
}

/** Whether a PATCH body changes anything besides the reason. */
export function hasChanges(update: RequisitionUpdate): boolean {
  return Object.keys(update).some((k) => k !== 'change_reason');
}
