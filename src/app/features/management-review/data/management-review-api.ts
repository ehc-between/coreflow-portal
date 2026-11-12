import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AgendaItemIn,
  AttendeeIn,
  AttendeeUpdate,
  CreateMeetingRequest,
  CreateReviewRequest,
  DecisionIn,
  InputCategory,
  InputUpdate,
  MeetingDetail,
  MeetingListQuery,
  MeetingSummary,
  Page,
  ReviewDetail,
  ReviewListQuery,
  ReviewReport,
  ReviewSummary,
  SignRequest,
  UpdateMeetingRequest,
  UpdateReviewRequest,
} from './management-review.models';

/** Mutations skip the generic toast: callers show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values?: readonly string[]) => (values?.length ? values.join(',') : undefined);

/**
 * Management reviews and meetings (M07), under `v1/orgs/{org}/management-review`.
 * Permissions: `management_review:read` to read, `:write` to create and edit,
 * `:manage` to delete, cancel and reopen minutes, `:sign` to sign a review.
 * While the module is disabled every call is a 404 `module_disabled`.
 */
@Injectable({ providedIn: 'root' })
export class ManagementReviewApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/management-review`;
  }

  private review(orgId: string, id: string): string {
    return `${this.base(orgId)}/reviews/${id}`;
  }

  private meeting(orgId: string, id: string): string {
    return `${this.base(orgId)}/meetings/${id}`;
  }

  inputCategories(orgId: string): Observable<readonly InputCategory[]> {
    return this.api.get<readonly InputCategory[]>(`${this.base(orgId)}/input-categories`);
  }

  // --- reviews -----------------------------------------------------------------------

  listReviews(orgId: string, query: ReviewListQuery = {}): Observable<Page<ReviewSummary>> {
    return this.api.get<Page<ReviewSummary>>(`${this.base(orgId)}/reviews`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        framework: query.framework,
        owner: query.owner,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getReview(orgId: string, id: string): Observable<ReviewDetail> {
    return this.api.get<ReviewDetail>(this.review(orgId, id));
  }

  createReview(orgId: string, body: CreateReviewRequest): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.base(orgId)}/reviews`, body, skipToast());
  }

  updateReview(orgId: string, id: string, body: UpdateReviewRequest): Observable<ReviewDetail> {
    return this.api.patch<ReviewDetail>(this.review(orgId, id), body, skipToast());
  }

  deleteReview(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(this.review(orgId, id), skipToast());
  }

  compile(orgId: string, id: string): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/compile`, {}, skipToast());
  }

  addInput(
    orgId: string,
    id: string,
    body: { title: string; notes?: string | null },
  ): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/inputs`, body, skipToast());
  }

  updateInput(
    orgId: string,
    id: string,
    inputId: string,
    body: InputUpdate,
  ): Observable<ReviewDetail> {
    return this.api.patch<ReviewDetail>(
      `${this.review(orgId, id)}/inputs/${inputId}`,
      body,
      skipToast(),
    );
  }

  deleteInput(orgId: string, id: string, inputId: string): Observable<ReviewDetail> {
    return this.api.delete<ReviewDetail>(
      `${this.review(orgId, id)}/inputs/${inputId}`,
      skipToast(),
    );
  }

  start(orgId: string, id: string): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/start`, {}, skipToast());
  }

  submit(orgId: string, id: string): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/submit`, {}, skipToast());
  }

  returnReview(orgId: string, id: string, reason: string | null): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/return`, { reason }, skipToast());
  }

  cancel(orgId: string, id: string, reason: string | null): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/cancel`, { reason }, skipToast());
  }

  sign(orgId: string, id: string, body: SignRequest): Observable<ReviewDetail> {
    return this.api.post<ReviewDetail>(`${this.review(orgId, id)}/sign`, body, skipToast());
  }

  report(orgId: string, id: string): Observable<ReviewReport> {
    return this.api.get<ReviewReport>(`${this.review(orgId, id)}/report`);
  }

  // --- meetings ----------------------------------------------------------------------

  listMeetings(orgId: string, query: MeetingListQuery = {}): Observable<Page<MeetingSummary>> {
    return this.api.get<Page<MeetingSummary>>(`${this.base(orgId)}/meetings`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        kind: csv(query.kind),
        from: query.from,
        to: query.to,
        include_reviews: query.include_reviews,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getMeeting(orgId: string, id: string): Observable<MeetingDetail> {
    return this.api.get<MeetingDetail>(this.meeting(orgId, id));
  }

  createMeeting(orgId: string, body: CreateMeetingRequest): Observable<MeetingDetail> {
    return this.api.post<MeetingDetail>(`${this.base(orgId)}/meetings`, body, skipToast());
  }

  updateMeeting(orgId: string, id: string, body: UpdateMeetingRequest): Observable<MeetingDetail> {
    return this.api.patch<MeetingDetail>(this.meeting(orgId, id), body, skipToast());
  }

  deleteMeeting(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(this.meeting(orgId, id), skipToast());
  }

  replaceAgenda(
    orgId: string,
    id: string,
    items: readonly AgendaItemIn[],
    changeReason?: string | null,
  ): Observable<MeetingDetail> {
    return this.api.put<MeetingDetail>(
      `${this.meeting(orgId, id)}/agenda`,
      { items, change_reason: changeReason ?? null },
      skipToast(),
    );
  }

  addAttendee(orgId: string, id: string, body: AttendeeIn): Observable<MeetingDetail> {
    return this.api.post<MeetingDetail>(`${this.meeting(orgId, id)}/attendees`, body, skipToast());
  }

  updateAttendee(
    orgId: string,
    id: string,
    attendeeId: string,
    body: AttendeeUpdate,
  ): Observable<MeetingDetail> {
    return this.api.patch<MeetingDetail>(
      `${this.meeting(orgId, id)}/attendees/${attendeeId}`,
      body,
      skipToast(),
    );
  }

  removeAttendee(orgId: string, id: string, attendeeId: string): Observable<MeetingDetail> {
    return this.api.delete<MeetingDetail>(
      `${this.meeting(orgId, id)}/attendees/${attendeeId}`,
      skipToast(),
    );
  }

  addDecision(orgId: string, id: string, body: DecisionIn): Observable<MeetingDetail> {
    return this.api.post<MeetingDetail>(`${this.meeting(orgId, id)}/decisions`, body, skipToast());
  }

  updateDecision(
    orgId: string,
    id: string,
    decisionId: string,
    body: DecisionIn,
  ): Observable<MeetingDetail> {
    return this.api.patch<MeetingDetail>(
      `${this.meeting(orgId, id)}/decisions/${decisionId}`,
      body,
      skipToast(),
    );
  }

  deleteDecision(orgId: string, id: string, decisionId: string): Observable<MeetingDetail> {
    return this.api.delete<MeetingDetail>(
      `${this.meeting(orgId, id)}/decisions/${decisionId}`,
      skipToast(),
    );
  }

  approveMinutes(orgId: string, id: string): Observable<MeetingDetail> {
    return this.api.post<MeetingDetail>(
      `${this.meeting(orgId, id)}/minutes/approve`,
      {},
      skipToast(),
    );
  }

  reopenMinutes(orgId: string, id: string, reason: string | null): Observable<MeetingDetail> {
    return this.api.post<MeetingDetail>(
      `${this.meeting(orgId, id)}/minutes/reopen`,
      { reason },
      skipToast(),
    );
  }
}
