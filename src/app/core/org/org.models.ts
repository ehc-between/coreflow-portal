/** A member of the current organisation. */
export interface OrgMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  /** Whether the account is enabled (a super-admin can deactivate it globally). */
  readonly is_active: boolean;
  readonly roles: readonly string[];
  /** A26: platform operators (service super-admins) are not staff of the organisation. */
  readonly is_platform_operator?: boolean;
  readonly joined_at?: string | null;
  readonly last_active_at?: string | null;
  readonly mfa_enabled?: boolean;
  readonly departments?: readonly MemberDepartment[];
  /** The member's entry in the People register (`employee.user_id`). */
  readonly person?: MemberPerson | null;
}

/** A department a member belongs to. */
export interface MemberDepartment {
  readonly id: string;
  readonly name: string;
}

/** A member's People-register entry; `url` is a portal route. */
export interface MemberPerson {
  readonly id: string;
  readonly code: string;
  readonly url: string;
}

/** A role from the org role catalogue. `grantable` is whether the caller may
 *  assign / invite with it (the backend blocks privilege escalation). */
export interface OrgRole {
  readonly key: string;
  readonly name: string;
  readonly permissions: readonly string[];
  readonly grantable: boolean;
}

/** A pending invitation into the org. */
export interface OrgInvitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly status: string;
  readonly created_at: string;
  readonly expires_at: string;
  /** A26 (optional until every backend ships it). */
  readonly invited_by_name?: string | null;
  readonly department_id?: string | null;
  readonly department_name?: string | null;
}

/** Request body for inviting a user into the org. */
export interface CreateOrgInvitationRequest {
  readonly email: string;
  readonly role_key: string;
  /** Optional: the department the person joins when they accept. */
  readonly department_id?: string | null;
}

/** `POST v1/orgs/{org}/invitations/bulk`: up to 50 addresses with one role. */
export interface BulkInvitationRequest {
  readonly emails: readonly string[];
  readonly role_key: string;
  readonly department_id?: string | null;
}

export interface BulkInvitationSkipped {
  readonly email: string;
  /** `already_invited` | `already_member`. */
  readonly code: string;
}

export interface BulkInvitationResponse {
  readonly created: readonly CreatedOrgInvitation[];
  readonly skipped: readonly BulkInvitationSkipped[];
}

/** Response from creating an invitation (the accept URL is only returned once). */
export interface CreatedOrgInvitation {
  readonly id: string;
  readonly email: string;
  readonly role_key: string;
  readonly status: string;
  readonly expires_at: string;
  /**
   * Development-only convenience link. Null everywhere else: the token is only
   * ever delivered by email, never to the inviter.
   */
  readonly accept_url: string | null;
}

/** A member after a role change. */
export interface OrgMemberDetail {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string | null;
  readonly is_active: boolean;
  readonly roles: readonly string[];
}

/** A row in the departments list. */
export interface DepartmentSummary {
  readonly id: string;
  readonly name: string;
  readonly member_count: number;
  /** A26: the department lead (reminder escalation target); null = escalations reach nobody. */
  readonly lead_user_id?: string | null;
  readonly lead_name?: string | null;
  /** People-register entries placed in this department. */
  readonly employee_count?: number;
}

/** A member of a department (no roles in this context). */
export interface DepartmentMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
}

/** Full department detail, including its members. */
export interface DepartmentDetail {
  readonly id: string;
  readonly name: string;
  readonly members: readonly DepartmentMember[];
  /** A26 (optional until every backend ships it). */
  readonly lead?: DepartmentLeadInfo | null;
  readonly employees?: readonly DepartmentEmployee[];
  /** No lead: overdue reminders that escalate to the department lead reach nobody. */
  readonly escalation_gap?: boolean;
}

export interface DepartmentLeadInfo {
  readonly user_id: string;
  readonly name: string | null;
  readonly email: string;
  /** False when the lead is not (yet) a member of the department itself. */
  readonly is_member: boolean;
}

/** A People-register entry in a department; `url` is a portal route. */
export interface DepartmentEmployee {
  readonly id: string;
  readonly code: string;
  readonly full_name: string;
  readonly job_title: string | null;
  readonly user_id: string | null;
  readonly url: string;
}

// --- A26: role matrix ------------------------------------------------------------------

/** `GET v1/orgs/{org}/roles/matrix` (users:invite, org:manage or audit:read). */
export interface RoleMatrix {
  readonly roles: readonly RoleMatrixRole[];
  readonly modules: readonly RoleMatrixModule[];
}

export interface RoleMatrixRole extends OrgRole {
  /** Active staff members holding the role (platform operators excluded). */
  readonly member_count: number;
}

export interface RoleMatrixModule {
  readonly key: string;
  /** Global i18n key of the module name, e.g. `modules.names.risk`. */
  readonly name_key: string;
  readonly enabled: boolean;
  readonly permissions: readonly RoleMatrixPermission[];
}

export interface RoleMatrixPermission {
  readonly key: string;
  readonly action: string;
  readonly description: string;
}

/** Org-wide settings (`GET`/`PUT v1/orgs/{org}/settings`, `org:manage`). */
export interface OrgSettingsDto {
  /** Documents must be approved by someone other than their author. */
  readonly require_document_segregation: boolean;
  /**
   * Require a second factor: "off", of "all" members, or of members holding any
   * of `mfa_required_roles` (role keys). Members it applies to get no permissions
   * in this org until they sign in with (or enrol) a second factor.
   */
  readonly mfa_policy: OrgMfaPolicy;
  readonly mfa_required_roles: readonly string[];
  /** Accept macro-enabled Office attachments (.docm, .xlsm, ...). Default false. */
  readonly allow_macro_attachments: boolean;
}

/** Who an org requires a second factor of. */
export type OrgMfaPolicy = 'off' | 'all' | 'roles';

/** `PUT v1/orgs/{org}/settings` body: omitted fields stay unchanged. */
export type OrgSettingsUpdate = Partial<OrgSettingsDto>;
