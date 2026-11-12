import { textOrNull } from './people-display';
import {
  Employee,
  EmployeeCreate,
  EmployeeFields,
  EmployeeStatus,
  EmployeeUpdate,
  EmploymentType,
  ScreeningStatus,
} from './people.models';

/** The editable employee fields as form strings ('' = not set). */
export interface EmployeeFormValue {
  readonly full_name: string;
  readonly user_id: string;
  readonly employee_number: string;
  readonly email: string;
  readonly phone: string;
  readonly job_title: string;
  readonly position_id: string;
  readonly department_id: string;
  readonly manager_id: string;
  readonly employment_type: EmploymentType;
  readonly status: EmployeeStatus;
  readonly start_date: string;
  readonly end_date: string;
  readonly location: string;
  readonly confidentiality_signed_on: string;
  readonly security_terms_accepted_on: string;
  readonly screening_status: ScreeningStatus;
  readonly screening_completed_on: string;
  readonly notes: string;
}

export function emptyEmployeeForm(): EmployeeFormValue {
  return {
    full_name: '',
    user_id: '',
    employee_number: '',
    email: '',
    phone: '',
    job_title: '',
    position_id: '',
    department_id: '',
    manager_id: '',
    employment_type: 'permanent',
    status: 'onboarding',
    start_date: '',
    end_date: '',
    location: '',
    confidentiality_signed_on: '',
    security_terms_accepted_on: '',
    screening_status: 'not_required',
    screening_completed_on: '',
    notes: '',
  };
}

export function formFromEmployee(e: Employee): EmployeeFormValue {
  return {
    full_name: e.full_name,
    user_id: e.user?.id ?? '',
    employee_number: e.employee_number ?? '',
    email: e.email ?? '',
    phone: e.phone ?? '',
    job_title: e.job_title ?? '',
    position_id: e.position?.id ?? '',
    department_id: e.department?.id ?? '',
    manager_id: e.manager?.id ?? '',
    employment_type: e.employment_type,
    status: e.status,
    start_date: e.start_date ?? '',
    end_date: e.end_date ?? '',
    location: e.location ?? '',
    confidentiality_signed_on: e.confidentiality_signed_on ?? '',
    security_terms_accepted_on: e.security_terms_accepted_on ?? '',
    screening_status: e.screening_status,
    screening_completed_on: e.screening_completed_on ?? '',
    notes: e.notes ?? '',
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field -> i18n error key (empty when the form is valid). */
export function validateEmployeeForm(v: EmployeeFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.full_name.trim()) {
    errors['full_name'] = 'people.form.errors.fullNameRequired';
  }
  if (v.email.trim() && !EMAIL.test(v.email.trim())) {
    errors['email'] = 'people.form.errors.email';
  }
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    errors['end_date'] = 'people.form.errors.endBeforeStart';
  }
  return errors;
}

export function toEmployeeFields(v: EmployeeFormValue): EmployeeFields {
  return {
    full_name: v.full_name.trim(),
    user_id: v.user_id || null,
    employee_number: textOrNull(v.employee_number),
    email: textOrNull(v.email),
    phone: textOrNull(v.phone),
    job_title: textOrNull(v.job_title),
    position_id: v.position_id || null,
    department_id: v.department_id || null,
    manager_id: v.manager_id || null,
    employment_type: v.employment_type,
    status: v.status,
    start_date: v.start_date || null,
    end_date: v.end_date || null,
    location: textOrNull(v.location),
    confidentiality_signed_on: v.confidentiality_signed_on || null,
    security_terms_accepted_on: v.security_terms_accepted_on || null,
    screening_status: v.screening_status,
    screening_completed_on: v.screening_completed_on || null,
    notes: textOrNull(v.notes),
  };
}

export function toEmployeeCreate(v: EmployeeFormValue, startOnboarding: boolean): EmployeeCreate {
  return { ...toEmployeeFields(v), start_onboarding: startOnboarding };
}

/**
 * The PATCH body: only the fields that changed (so the revision history records what
 * the user actually edited), plus the change reason when given. Private fields the
 * caller could not see (`phone`, `notes` came back null) are only sent when typed in.
 */
export function toEmployeeUpdate(
  before: EmployeeFormValue,
  after: EmployeeFormValue,
  changeReason: string,
): EmployeeUpdate {
  const a = toEmployeeFields(before);
  const b = toEmployeeFields(after);
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(b) as (keyof EmployeeFields)[]) {
    if (a[key] !== b[key]) {
      body[key] = b[key];
    }
  }
  const reason = changeReason.trim();
  if (reason) {
    body['change_reason'] = reason;
  }
  return body as EmployeeUpdate;
}
