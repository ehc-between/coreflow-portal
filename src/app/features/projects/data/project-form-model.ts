import {
  MemberIn,
  MemberRole,
  OpenProjectStatus,
  ProjectCreate,
  ProjectDetail,
  ProjectHealth,
  ProjectKind,
  ProjectPriority,
  ProjectUpdate,
  isOpenProjectStatus,
} from './project.models';

/** Editable project fields as form strings ('' = not set). */
export interface ProjectFormValue {
  readonly title: string;
  readonly description: string;
  readonly objective: string;
  readonly scope: string;
  readonly kind: ProjectKind;
  readonly status: OpenProjectStatus;
  readonly priority: ProjectPriority;
  readonly health: ProjectHealth | '';
  /** '' = the caller (create) / unchanged owner (edit cannot clear it). */
  readonly owner_user_id: string;
  readonly department_id: string;
  readonly start_date: string;
  readonly due_date: string;
  readonly security_relevant: boolean;
  readonly security_requirements: string;
  /** Initial team (create only). */
  readonly members: readonly MemberIn[];
}

export function emptyProjectForm(patch: Partial<ProjectFormValue> = {}): ProjectFormValue {
  return {
    title: '',
    description: '',
    objective: '',
    scope: '',
    kind: 'general',
    status: 'proposed',
    priority: 'normal',
    health: '',
    owner_user_id: '',
    department_id: '',
    start_date: '',
    due_date: '',
    security_relevant: false,
    security_requirements: '',
    members: [],
    ...patch,
  };
}

export function formFromProject(p: ProjectDetail): ProjectFormValue {
  return emptyProjectForm({
    title: p.title,
    description: p.description ?? '',
    objective: p.objective ?? '',
    scope: p.scope ?? '',
    kind: p.kind,
    status: isOpenProjectStatus(p.status) ? p.status : 'active',
    priority: p.priority,
    health: p.health ?? '',
    owner_user_id: p.owner?.id ?? '',
    department_id: p.department_id ?? '',
    start_date: p.start_date ?? '',
    due_date: p.due_date ?? '',
    security_relevant: p.security_relevant,
    security_requirements: p.security_requirements ?? '',
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Field -> i18n error key. Title, date format and date order are checked. */
export function validateProjectForm(v: ProjectFormValue): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (!v.title.trim()) {
    errors['title'] = 'projects.form.errors.titleRequired';
  }
  for (const key of ['start_date', 'due_date'] as const) {
    if (v[key] && !DATE.test(v[key])) {
      errors[key] = 'projects.form.errors.invalidDate';
    }
  }
  if (!errors['start_date'] && !errors['due_date'] && v.start_date && v.due_date) {
    if (v.due_date < v.start_date) {
      errors['due_date'] = 'projects.form.errors.dueBeforeStart';
    }
  }
  return errors;
}

/** Whether a date range is in order ('' on either side counts as fine). */
export function datesInOrder(start: string, end: string): boolean {
  return !start || !end || end >= start;
}

function text(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

export function toCreateRequest(v: ProjectFormValue): ProjectCreate {
  return {
    title: v.title.trim(),
    description: text(v.description),
    objective: text(v.objective),
    scope: text(v.scope),
    kind: v.kind,
    status: v.status,
    priority: v.priority,
    health: v.health || null,
    ...(v.owner_user_id ? { owner_user_id: v.owner_user_id } : {}),
    department_id: v.department_id || null,
    start_date: v.start_date || null,
    due_date: v.due_date || null,
    security_relevant: v.security_relevant,
    security_requirements: v.security_relevant ? text(v.security_requirements) : null,
    members: dedupeMembers(v.members, v.owner_user_id),
  };
}

/** Only the fields that changed (PATCH semantics: a sent `null` clears the field). */
export function toUpdateRequest(
  before: ProjectFormValue,
  after: ProjectFormValue,
  changeReason: string,
): ProjectUpdate {
  const a = toCreateRequest(after);
  const b = toCreateRequest(before);
  const changes: Record<string, unknown> = {};
  const keys = [
    'title',
    'description',
    'objective',
    'scope',
    'kind',
    'status',
    'priority',
    'health',
    'department_id',
    'start_date',
    'due_date',
    'security_relevant',
    'security_requirements',
  ] as const;
  for (const key of keys) {
    if (a[key] !== b[key]) {
      changes[key] = a[key] ?? null;
    }
  }
  // The owner cannot be cleared; only a new choice is sent.
  if (after.owner_user_id && after.owner_user_id !== before.owner_user_id) {
    changes['owner_user_id'] = after.owner_user_id;
  }
  if (Object.keys(changes).length && changeReason.trim()) {
    changes['change_reason'] = changeReason.trim();
  }
  return changes as ProjectUpdate;
}

/** One entry per user, the owner left out (the backend makes the owner a manager). */
export function dedupeMembers(members: readonly MemberIn[], ownerId: string): MemberIn[] {
  const seen = new Set<string>(ownerId ? [ownerId] : []);
  const out: MemberIn[] = [];
  for (const m of members) {
    if (m.user_id && !seen.has(m.user_id)) {
      seen.add(m.user_id);
      out.push({ user_id: m.user_id, role: m.role });
    }
  }
  return out;
}

export function withMember(
  members: readonly MemberIn[],
  userId: string,
  role: MemberRole,
): MemberIn[] {
  return members.some((m) => m.user_id === userId)
    ? members.map((m) => (m.user_id === userId ? { user_id: userId, role } : m))
    : [...members, { user_id: userId, role }];
}
