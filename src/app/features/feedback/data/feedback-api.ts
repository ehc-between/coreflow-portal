import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import { TaskList } from '../../../core/tasks/task.models';
import {
  CategoryList,
  ComplaintDeviationList,
  ComplaintDeviationQuery,
  DeviationLinks,
  ExportFormat,
  Feedback,
  FeedbackAction,
  FeedbackActionBody,
  FeedbackBulk,
  FeedbackBulkResult,
  FeedbackCreate,
  FeedbackKind,
  FeedbackList,
  FeedbackListQuery,
  FeedbackSettings,
  FeedbackStats,
  FeedbackUpdate,
  PublicResponseIn,
  PublicResponseOut,
  PublicSurvey,
  Reply,
  ReplyCreate,
  ReplyList,
  ResponseDue,
  ResponseToFeedback,
  Survey,
  SurveyAction,
  SurveyCreate,
  SurveyList,
  SurveyListQuery,
  SurveyResponseList,
  SurveyResponseQuery,
  SurveyResults,
  SurveyUpdate,
} from './feedback.models';

/** Pages show coded errors themselves, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

function csv(values: readonly string[] | undefined): string | undefined {
  return values?.length ? values.join(',') : undefined;
}

/** The filters of `GET feedback/items` (and its export): csv lists, unset values dropped. */
export function feedbackFilterParams(query: FeedbackListQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    kind: csv(query.kind),
    status: csv(query.status),
    channel: csv(query.channel),
    severity: csv(query.severity),
    owner: query.owner || undefined,
    survey_id: query.survey_id || undefined,
    department_id: query.department_id || undefined,
    category: query.category?.trim() || undefined,
    justified: query.justified,
    overdue: query.overdue,
    open: query.open,
    received_from: query.received_from || undefined,
    received_to: query.received_to || undefined,
    sentiment: csv(query.sentiment),
    source: csv(query.source),
    unanswered_days: query.unanswered_days,
  };
}

/** The query parameters of `GET feedback/surveys/{id}/responses`. */
export function responseListParams(query: SurveyResponseQuery): QueryParams {
  return {
    q: query.q?.trim() || undefined,
    low: query.low || undefined,
    has_feedback: query.has_feedback,
    limit: query.limit,
    offset: query.offset,
  };
}

/** The query parameters of `GET feedback/items` (filters plus sort and paging). */
export function feedbackListParams(query: FeedbackListQuery): QueryParams {
  return {
    ...feedbackFilterParams(query),
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

  replies(orgId: string, id: string): Observable<ReplyList> {
    return this.api.get<ReplyList>(`${this.base(orgId)}/items/${id}/replies`, IN_PLACE);
  }

  /** Log a reply sent to the customer; the backend also ticks `customer_informed`. */
  addReply(orgId: string, id: string, body: ReplyCreate): Observable<Reply> {
    return this.api.post<Reply>(`${this.base(orgId)}/items/${id}/replies`, body, IN_PLACE);
  }

  deleteReply(orgId: string, id: string, replyId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/items/${id}/replies/${replyId}`, IN_PLACE);
  }

  tasks(orgId: string, id: string): Observable<TaskList> {
    return this.api.get<TaskList>(`${this.base(orgId)}/items/${id}/tasks`, IN_PLACE);
  }

  /** Status change and / or assignment of many records; each is saved on its own. */
  bulk(orgId: string, body: FeedbackBulk): Observable<FeedbackBulkResult> {
    return this.api.post<FeedbackBulkResult>(`${this.base(orgId)}/items/bulk`, body, IN_PLACE);
  }

  /** Deviations of a customer-complaint type, cross-listed in the complaints view. */
  complaintDeviations(
    orgId: string,
    query: ComplaintDeviationQuery = {},
  ): Observable<ComplaintDeviationList> {
    return this.api.get<ComplaintDeviationList>(`${this.base(orgId)}/complaint-deviations`, {
      ...IN_PLACE,
      params: {
        q: query.q?.trim() || undefined,
        open: query.open,
        unlinked_only: query.unlinked_only,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  stats(orgId: string, from?: string, to?: string): Observable<FeedbackStats> {
    return this.api.get<FeedbackStats>(`${this.base(orgId)}/stats`, {
      ...IN_PLACE,
      params: { from: from || undefined, to: to || undefined },
    });
  }

  // --- settings, categories, default reply date --------------------------------------

  settings(orgId: string): Observable<FeedbackSettings> {
    return this.api.get<FeedbackSettings>(`${this.base(orgId)}/settings`, IN_PLACE);
  }

  saveSettings(orgId: string, body: FeedbackSettings): Observable<FeedbackSettings> {
    return this.api.put<FeedbackSettings>(
      `${this.base(orgId)}/settings`,
      {
        response_days: body.response_days,
        working_days: body.working_days,
        privacy_notice_url: body.privacy_notice_url,
      },
      IN_PLACE,
    );
  }

  /** Categories in use, most used first (for the category suggestions). */
  categories(orgId: string): Observable<CategoryList> {
    return this.api.get<CategoryList>(`${this.base(orgId)}/categories`, IN_PLACE);
  }

  /** The default reply date for a kind received on a day (from the module settings). */
  responseDue(orgId: string, kind: FeedbackKind, receivedOn?: string): Observable<ResponseDue> {
    return this.api.get<ResponseDue>(`${this.base(orgId)}/response-due`, {
      ...IN_PLACE,
      params: { kind, received_on: receivedOn || undefined },
    });
  }

  // --- exports (audit evidence) --------------------------------------------------------

  /** The feedback / complaint log, with the list filters. */
  exportLog(
    orgId: string,
    query: FeedbackListQuery,
    format: ExportFormat,
    lang: string,
  ): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/export`, {
      ...IN_PLACE,
      params: { ...feedbackFilterParams(query), format, lang },
    });
  }

  /** The insights figures and the monthly trend for a period. */
  exportStats(
    orgId: string,
    format: ExportFormat,
    lang: string,
    from?: string,
    to?: string,
  ): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/stats/export`, {
      ...IN_PLACE,
      params: { format, lang, from: from || undefined, to: to || undefined },
    });
  }

  /** One survey's figures per question plus every response. */
  exportSurvey(orgId: string, id: string, format: ExportFormat, lang: string): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/surveys/${id}/export`, {
      ...IN_PLACE,
      params: { format, lang },
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

  responses(
    orgId: string,
    id: string,
    limit = 25,
    offset = 0,
    query: SurveyResponseQuery = {},
  ): Observable<SurveyResponseList> {
    return this.api.get<SurveyResponseList>(`${this.base(orgId)}/surveys/${id}/responses`, {
      ...IN_PLACE,
      params: responseListParams({ ...query, limit, offset }),
    });
  }

  /** Turn one survey answer into a feedback record (409 `feedback_exists` when it is one). */
  responseToFeedback(
    orgId: string,
    id: string,
    responseId: string,
    body: ResponseToFeedback = {},
  ): Observable<Feedback> {
    return this.api.post<Feedback>(
      `${this.base(orgId)}/surveys/${id}/responses/${responseId}/feedback`,
      body,
      IN_PLACE,
    );
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
