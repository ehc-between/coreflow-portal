/** A member of the current organisation. */
export interface OrgMember {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly roles: readonly string[];
}

/** A row in the departments list. */
export interface DepartmentSummary {
  readonly id: string;
  readonly name: string;
  readonly member_count: number;
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
}
