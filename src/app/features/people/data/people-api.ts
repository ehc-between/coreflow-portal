import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import {
  AwarenessIn,
  AwarenessRecord,
  Checklist,
  ChecklistCreate,
  ChecklistDetail,
  ChecklistItemIn,
  ChecklistItemUpdate,
  ChecklistQuery,
  ChecklistTemplates,
  Competence,
  CompetenceAssessment,
  CompetenceFields,
  CompetenceQuery,
  CompetenceUpdate,
  DisciplinaryCase,
  DisciplinaryIn,
  DisciplinaryUpdate,
  Employee,
  EmployeeCompetences,
  EmployeeCreate,
  EmployeeListQuery,
  EmployeeUpdate,
  Gap,
  GapQuery,
  Matrix,
  MatrixQuery,
  Page,
  PeopleSummary,
  PositionDetail,
  PositionFields,
  PositionQuery,
  PositionUpdate,
  Position,
  RequirementIn,
} from './people.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

const csv = (values: readonly string[] | undefined): string | undefined =>
  values?.length ? values.join(',') : undefined;

/** Query parameters of `GET people/employees` (csv lists, unset values dropped). */
export function employeeListParams(query: EmployeeListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: csv(query.status),
    position_id: query.position_id || undefined,
    department_id: query.department_id || undefined,
    manager_id: query.manager_id || undefined,
    user_id: query.user_id || undefined,
    employment_type: query.employment_type || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

export function matrixParams(query: MatrixQuery): QueryParams {
  return {
    department_id: query.department_id || undefined,
    position_id: query.position_id || undefined,
    competence_ids: csv(query.competence_ids),
    include_former: query.include_former ? true : undefined,
  };
}

export function gapParams(query: GapQuery): QueryParams {
  return {
    department_id: query.department_id || undefined,
    position_id: query.position_id || undefined,
    employee_id: query.employee_id || undefined,
    competence_ids: csv(query.competence_ids),
    status: csv(query.status),
    mandatory_only: query.mandatory_only ? true : undefined,
  };
}

/** People, roles and competence API (M09): `v1/orgs/{org}/people/...`. */
@Injectable({ providedIn: 'root' })
export class PeopleApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/people`;
  }

  summary(orgId: string): Observable<PeopleSummary> {
    return this.api.get<PeopleSummary>(`${this.base(orgId)}/summary`, IN_PLACE);
  }

  // --- employees ----------------------------------------------------------------------

  listEmployees(orgId: string, query: EmployeeListQuery = {}): Observable<Page<Employee>> {
    return this.api.get<Page<Employee>>(`${this.base(orgId)}/employees`, {
      ...IN_PLACE,
      params: employeeListParams(query),
    });
  }

  getEmployee(orgId: string, id: string): Observable<Employee> {
    return this.api.get<Employee>(`${this.base(orgId)}/employees/${id}`, IN_PLACE);
  }

  createEmployee(orgId: string, body: EmployeeCreate): Observable<Employee> {
    return this.api.post<Employee>(`${this.base(orgId)}/employees`, body, IN_PLACE);
  }

  updateEmployee(orgId: string, id: string, body: EmployeeUpdate): Observable<Employee> {
    return this.api.patch<Employee>(`${this.base(orgId)}/employees/${id}`, body, IN_PLACE);
  }

  deleteEmployee(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/employees/${id}`, IN_PLACE);
  }

  // --- held competences ---------------------------------------------------------------

  employeeCompetences(orgId: string, id: string): Observable<EmployeeCompetences> {
    return this.api.get<EmployeeCompetences>(
      `${this.base(orgId)}/employees/${id}/competences`,
      IN_PLACE,
    );
  }

  assessCompetence(
    orgId: string,
    id: string,
    competenceId: string,
    body: CompetenceAssessment,
  ): Observable<EmployeeCompetences> {
    return this.api.put<EmployeeCompetences>(
      `${this.base(orgId)}/employees/${id}/competences/${competenceId}`,
      body,
      IN_PLACE,
    );
  }

  removeCompetence(orgId: string, id: string, competenceId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/employees/${id}/competences/${competenceId}`,
      IN_PLACE,
    );
  }

  // --- awareness ----------------------------------------------------------------------

  awareness(orgId: string, id: string): Observable<Page<AwarenessRecord>> {
    return this.api.get<Page<AwarenessRecord>>(
      `${this.base(orgId)}/employees/${id}/awareness`,
      IN_PLACE,
    );
  }

  addAwareness(orgId: string, id: string, body: AwarenessIn): Observable<AwarenessRecord> {
    return this.api.post<AwarenessRecord>(
      `${this.base(orgId)}/employees/${id}/awareness`,
      body,
      IN_PLACE,
    );
  }

  updateAwareness(
    orgId: string,
    recordId: string,
    body: Partial<AwarenessIn>,
  ): Observable<AwarenessRecord> {
    return this.api.patch<AwarenessRecord>(
      `${this.base(orgId)}/awareness/${recordId}`,
      body,
      IN_PLACE,
    );
  }

  deleteAwareness(orgId: string, recordId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/awareness/${recordId}`, IN_PLACE);
  }

  // --- disciplinary (people:disciplinary) ---------------------------------------------

  disciplinary(orgId: string, id: string): Observable<Page<DisciplinaryCase>> {
    return this.api.get<Page<DisciplinaryCase>>(
      `${this.base(orgId)}/employees/${id}/disciplinary`,
      IN_PLACE,
    );
  }

  openDisciplinary(orgId: string, id: string, body: DisciplinaryIn): Observable<DisciplinaryCase> {
    return this.api.post<DisciplinaryCase>(
      `${this.base(orgId)}/employees/${id}/disciplinary`,
      body,
      IN_PLACE,
    );
  }

  updateDisciplinary(
    orgId: string,
    caseId: string,
    body: DisciplinaryUpdate,
  ): Observable<DisciplinaryCase> {
    return this.api.patch<DisciplinaryCase>(
      `${this.base(orgId)}/disciplinary/${caseId}`,
      body,
      IN_PLACE,
    );
  }

  deleteDisciplinary(orgId: string, caseId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/disciplinary/${caseId}`, IN_PLACE);
  }

  // --- checklists ---------------------------------------------------------------------

  checklistTemplates(orgId: string): Observable<ChecklistTemplates> {
    return this.api.get<ChecklistTemplates>(`${this.base(orgId)}/checklist-templates`, IN_PLACE);
  }

  listChecklists(orgId: string, query: ChecklistQuery = {}): Observable<Page<Checklist>> {
    return this.api.get<Page<Checklist>>(`${this.base(orgId)}/checklists`, {
      ...IN_PLACE,
      params: {
        employee_id: query.employee_id || undefined,
        kind: query.kind || undefined,
        status: csv(query.status),
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  startChecklist(orgId: string, employeeId: string, body: ChecklistCreate) {
    return this.api.post<ChecklistDetail>(
      `${this.base(orgId)}/employees/${employeeId}/checklists`,
      body,
      IN_PLACE,
    );
  }

  getChecklist(orgId: string, id: string): Observable<ChecklistDetail> {
    return this.api.get<ChecklistDetail>(`${this.base(orgId)}/checklists/${id}`, IN_PLACE);
  }

  addChecklistItem(orgId: string, id: string, body: ChecklistItemIn) {
    return this.api.post<ChecklistDetail>(
      `${this.base(orgId)}/checklists/${id}/items`,
      body,
      IN_PLACE,
    );
  }

  updateChecklistItem(
    orgId: string,
    id: string,
    itemId: string,
    body: ChecklistItemUpdate,
  ): Observable<ChecklistDetail> {
    return this.api.patch<ChecklistDetail>(
      `${this.base(orgId)}/checklists/${id}/items/${itemId}`,
      body,
      IN_PLACE,
    );
  }

  removeChecklistItem(orgId: string, id: string, itemId: string): Observable<ChecklistDetail> {
    return this.api.delete<ChecklistDetail>(
      `${this.base(orgId)}/checklists/${id}/items/${itemId}`,
      IN_PLACE,
    );
  }

  completeChecklist(orgId: string, id: string): Observable<ChecklistDetail> {
    return this.api.post<ChecklistDetail>(
      `${this.base(orgId)}/checklists/${id}/complete`,
      {},
      IN_PLACE,
    );
  }

  cancelChecklist(orgId: string, id: string): Observable<ChecklistDetail> {
    return this.api.post<ChecklistDetail>(
      `${this.base(orgId)}/checklists/${id}/cancel`,
      {},
      IN_PLACE,
    );
  }

  deleteChecklist(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/checklists/${id}`, IN_PLACE);
  }

  // --- positions ----------------------------------------------------------------------

  listPositions(orgId: string, query: PositionQuery = {}): Observable<Page<Position>> {
    return this.api.get<Page<Position>>(`${this.base(orgId)}/positions`, {
      ...IN_PLACE,
      params: {
        q: query.q?.trim() || undefined,
        status: query.status || undefined,
        department_id: query.department_id || undefined,
        risk_level: query.risk_level || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getPosition(orgId: string, id: string): Observable<PositionDetail> {
    return this.api.get<PositionDetail>(`${this.base(orgId)}/positions/${id}`, IN_PLACE);
  }

  createPosition(orgId: string, body: PositionFields): Observable<PositionDetail> {
    return this.api.post<PositionDetail>(`${this.base(orgId)}/positions`, body, IN_PLACE);
  }

  updatePosition(orgId: string, id: string, body: PositionUpdate): Observable<PositionDetail> {
    return this.api.patch<PositionDetail>(`${this.base(orgId)}/positions/${id}`, body, IN_PLACE);
  }

  replaceRequirements(
    orgId: string,
    id: string,
    requirements: readonly RequirementIn[],
    changeReason?: string,
  ): Observable<PositionDetail> {
    return this.api.put<PositionDetail>(
      `${this.base(orgId)}/positions/${id}/requirements`,
      { requirements, change_reason: changeReason || undefined },
      IN_PLACE,
    );
  }

  deletePosition(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/positions/${id}`, IN_PLACE);
  }

  // --- competences --------------------------------------------------------------------

  listCompetences(orgId: string, query: CompetenceQuery = {}): Observable<Page<Competence>> {
    return this.api.get<Page<Competence>>(`${this.base(orgId)}/competences`, {
      ...IN_PLACE,
      params: {
        q: query.q?.trim() || undefined,
        category: query.category || undefined,
        status: query.status || undefined,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getCompetence(orgId: string, id: string): Observable<Competence> {
    return this.api.get<Competence>(`${this.base(orgId)}/competences/${id}`, IN_PLACE);
  }

  createCompetence(orgId: string, body: CompetenceFields): Observable<Competence> {
    return this.api.post<Competence>(`${this.base(orgId)}/competences`, body, IN_PLACE);
  }

  updateCompetence(orgId: string, id: string, body: CompetenceUpdate): Observable<Competence> {
    return this.api.patch<Competence>(`${this.base(orgId)}/competences/${id}`, body, IN_PLACE);
  }

  deleteCompetence(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/competences/${id}`, IN_PLACE);
  }

  // --- matrix and gaps ----------------------------------------------------------------

  matrix(orgId: string, query: MatrixQuery = {}): Observable<Matrix> {
    return this.api.get<Matrix>(`${this.base(orgId)}/matrix`, {
      ...IN_PLACE,
      params: matrixParams(query),
    });
  }

  gaps(orgId: string, query: GapQuery = {}): Observable<Page<Gap>> {
    return this.api.get<Page<Gap>>(`${this.base(orgId)}/gaps`, {
      ...IN_PLACE,
      params: gapParams(query),
    });
  }
}
