import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TaskList } from '../../../core/tasks/task.models';
import {
  DeviationLinks,
  Feedback,
  FeedbackAction,
  FeedbackActionBody,
  FeedbackCreate,
  FeedbackList,
  FeedbackListQuery,
  FeedbackStats,
  FeedbackUpdate,
  PublicResponseIn,
  PublicResponseOut,
  PublicSurvey,
  Survey,
  SurveyAction,
  SurveyCreate,
  SurveyList,
  SurveyListQuery,
  SurveyResponseList,
  SurveyResults,
  SurveyUpdate,
} from './feedback.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

function csv(values: readonly string[] | undefined): string | undefined {
  return values?.length ? values.join(',') : undefined;
}

/** The query parameters of `GET feedback/items` (csv lists, unset values dropped). */
export function feedbackListParams(query: FeedbackListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    kind: csv(query.kind),
    status: csv(query.status),
    channel: csv(query.channel),
    owner: query.owner || undefined,
    survey_id: query.survey_id || undefined,
    overdue: query.overdue,
    open: query.open,
    received_from: query.received_from || undefined,
    received_to: query.received_to || undefined,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** The query parameters of `GET feedback/surveys`. */
export function surveyListParams(query: SurveyListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    status: csv(query.status),
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Customer feedback and surveys API (M22): `v1/orgs/{org}/feedback/...`. */
@Injectable({ providedIn: 'root' })
export class FeedbackApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/feedback`;
  }

  // --- feedback register ---------------------------------------------------------------

  list(orgId: string, query: FeedbackListQuery = {}): Observable<FeedbackList> {
    return this.api.get<FeedbackList>(`${this.base(orgId)}/items`, {
      ...IN_PLACE,
      params: feedbackListParams(query),
    });
  }

  get(orgId: string, id: string): Observable<Feedback> {
    return this.api.get<Feedback>(`${this.base(orgId)}/items/${id}`, IN_PLACE);
  }

  create(orgId: string, body: FeedbackCreate): Observable<Feedback> {
    return this.api.post<Feedback>(`${this.base(orgId)}/items`, body, IN_PLACE);
  }

  update(orgId: string, id: string, body: FeedbackUpdate): Observable<Feedback> {
    return this.api.patch<Feedback>(`${this.base(orgId)}/items/${id}`, body, IN_PLACE);
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/items/${id}`, IN_PLACE);
  }

  action(
    orgId: string,
    id: string,
    action: FeedbackAction,
    body: FeedbackActionBody = {},
  ): Observable<Feedback> {
    return this.api.post<Feedback>(
      `${this.base(orgId)}/items/${id}/actions/${action}`,
      body,
      IN_PLACE,
    );
  }

  deviations(orgId: string, id: string): Observable<DeviationLinks> {
    return this.api.get<DeviationLinks>(`${this.base(orgId)}/items/${id}/deviations`, IN_PLACE);
  }

  linkDeviation(orgId: string, id: string, deviationId: string): Observable<DeviationLinks> {
    return this.api.post<DeviationLinks>(
      `${this.base(orgId)}/items/${id}/deviations`,
      { deviation_id: deviationId },
      IN_PLACE,
    );
  }

  unlinkDeviation(orgId: string, id: string, deviationId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/items/${id}/deviations/${deviationId}`,
      IN_PLACE,
    );
  }

  tasks(orgId: string, id: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/items/${id}/tasks`, IN_PLACE);
  }

  stats(orgId: string, from?: string, to?: string): Observable<FeedbackStats> {
    return this.api.get<FeedbackStats>(`${this.base(orgId)}/stats`, {
      ...IN_PLACE,
      params: { from: from || undefined, to: to || undefined },
    });
  }

  // --- surveys -------------------------------------------------------------------------

  listSurveys(orgId: string, query: SurveyListQuery = {}): Observable<SurveyList> {
    return this.api.get<SurveyList>(`${this.base(orgId)}/surveys`, {
      ...IN_PLACE,
      params: surveyListParams(query),
    });
  }

  getSurvey(orgId: string, id: string): Observable<Survey> {
    return this.api.get<Survey>(`${this.base(orgId)}/surveys/${id}`, IN_PLACE);
  }

  createSurvey(orgId: string, body: SurveyCreate): Observable<Survey> {
    return this.api.post<Survey>(`${this.base(orgId)}/surveys`, body, IN_PLACE);
  }

  updateSurvey(orgId: string, id: string, body: SurveyUpdate): Observable<Survey> {
    return this.api.patch<Survey>(`${this.base(orgId)}/surveys/${id}`, body, IN_PLACE);
  }

  deleteSurvey(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/surveys/${id}`, IN_PLACE);
  }

  surveyAction(orgId: string, id: string, action: SurveyAction): Observable<Survey> {
    return this.api.post<Survey>(
      `${this.base(orgId)}/surveys/${id}/actions/${action}`,
      {},
      IN_PLACE,
    );
  }

  regenerateLink(orgId: string, id: string): Observable<Survey> {
    return this.api.post<Survey>(`${this.base(orgId)}/surveys/${id}/regenerate-link`, {}, IN_PLACE);
  }

  results(orgId: string, id: string): Observable<SurveyResults> {
    return this.api.get<SurveyResults>(`${this.base(orgId)}/surveys/${id}/results`, IN_PLACE);
  }

  responses(orgId: string, id: string, limit = 25, offset = 0): Observable<SurveyResponseList> {
    return this.api.get<SurveyResponseList>(`${this.base(orgId)}/surveys/${id}/responses`, {
      ...IN_PLACE,
      params: { limit, offset },
    });
  }

  deleteResponse(orgId: string, id: string, responseId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/surveys/${id}/responses/${responseId}`,
      IN_PLACE,
    );
  }
}

/**
 * The public survey endpoints (`v1/public/surveys/{token}`), used by the
 * signed-out survey page. No org, no bearer needed.
 */
@Injectable({ providedIn: 'root' })
export class PublicSurveyApi {
  private readonly api = inject(ApiService);

  private base(token: string): string {
    return `v1/public/surveys/${encodeURIComponent(token)}`;
  }

  get(token: string): Observable<PublicSurvey> {
    return this.api.get<PublicSurvey>(this.base(token), IN_PLACE);
  }

  submit(token: string, body: PublicResponseIn): Observable<PublicResponseOut> {
    return this.api.post<PublicResponseOut>(`${this.base(token)}/responses`, body, IN_PLACE);
  }
}
