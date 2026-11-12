import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import {
  ConvertIntakeRequest,
  ConvertIntakeResponse,
  IntakeNoteInput,
  IntakeReport,
  IntakeReportFilters,
  IntakeReportList,
  IntakeSettings,
  IntakeSettingsInput,
  PublicIntake,
  PublicReceipt,
  PublicReportInput,
  PublicReportStatus,
} from './intake.models';

/** Coded failures are explained in place, so the generic toast is skipped. */
const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/**
 * The M03 anonymous / whistleblowing intake, signed-in side: the org's intake
 * link settings (`deviations:admin`) and the triage inbox (`deviations:intake`;
 * converting a report into a deviation also needs `deviations:write`).
 */
@Injectable({ providedIn: 'root' })
export class DeviationIntakeApi {
  private readonly api = inject(ApiService);

  /** The intake settings; before the first save the link is disabled with a fresh token. */
  getSettings(orgId: string): Observable<IntakeSettings> {
    return this.api.get<IntakeSettings>(`v1/orgs/${orgId}/deviation-intake`);
  }

  saveSettings(orgId: string, body: IntakeSettingsInput): Observable<IntakeSettings> {
    return this.api.put<IntakeSettings>(`v1/orgs/${orgId}/deviation-intake`, body, IN_PLACE);
  }

  /** A new random token: the old public link stops working (404 before the first save). */
  rotateToken(orgId: string): Observable<IntakeSettings> {
    return this.api.post<IntakeSettings>(
      `v1/orgs/${orgId}/deviation-intake/rotate-token`,
      {},
      IN_PLACE,
    );
  }

  listReports(orgId: string, filters: IntakeReportFilters = {}): Observable<IntakeReportList> {
    return this.api.get<IntakeReportList>(`v1/orgs/${orgId}/deviation-intake/reports`, {
      params: { status: filters.status, limit: filters.limit, offset: filters.offset },
    });
  }

  getReport(orgId: string, reportId: string): Observable<IntakeReport> {
    return this.api.get<IntakeReport>(`v1/orgs/${orgId}/deviation-intake/reports/${reportId}`);
  }

  triage(orgId: string, reportId: string, body: IntakeNoteInput = {}): Observable<IntakeReport> {
    return this.api.post<IntakeReport>(
      `v1/orgs/${orgId}/deviation-intake/reports/${reportId}/triage`,
      body,
      IN_PLACE,
    );
  }

  dismiss(orgId: string, reportId: string, body: IntakeNoteInput = {}): Observable<IntakeReport> {
    return this.api.post<IntakeReport>(
      `v1/orgs/${orgId}/deviation-intake/reports/${reportId}/dismiss`,
      body,
      IN_PLACE,
    );
  }

  convert(
    orgId: string,
    reportId: string,
    body: ConvertIntakeRequest,
  ): Observable<ConvertIntakeResponse> {
    return this.api.post<ConvertIntakeResponse>(
      `v1/orgs/${orgId}/deviation-intake/reports/${reportId}/convert`,
      body,
      IN_PLACE,
    );
  }
}

/**
 * The public, unauthenticated report form behind `/report/{token}`. No bearer is
 * needed (none is attached when signed out); the backend rate limits and stores no
 * request metadata. Every failure is explained on the page.
 */
@Injectable({ providedIn: 'root' })
export class PublicIntakeApi {
  private readonly api = inject(ApiService);

  /** 404 `intake_not_found` when the link is off, unknown or rotated. */
  get(token: string): Observable<PublicIntake> {
    return this.api.get<PublicIntake>(
      `v1/public/deviation-intake/${encodeURIComponent(token)}`,
      IN_PLACE,
    );
  }

  submit(token: string, body: PublicReportInput): Observable<PublicReceipt> {
    return this.api.post<PublicReceipt>(
      `v1/public/deviation-intake/${encodeURIComponent(token)}/reports`,
      body,
      IN_PLACE,
    );
  }

  /** 404 `receipt_not_found` for an unknown code. */
  status(token: string, receiptCode: string): Observable<PublicReportStatus> {
    return this.api.get<PublicReportStatus>(
      `v1/public/deviation-intake/${encodeURIComponent(token)}/reports/${encodeURIComponent(
        receiptCode.trim().toUpperCase(),
      )}`,
      IN_PLACE,
    );
  }
}
