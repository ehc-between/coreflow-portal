import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AccessReview,
  AccessReviewDetail,
  AccessReviewListQuery,
  Asset,
  AssetDetail,
  AssetListQuery,
  Calibration,
  CalibrationRequest,
  ChangeDetail,
  ChangeListQuery,
  ChangeRequest,
  CreateAccessReviewRequest,
  CreateAssetRequest,
  CreateChangeRequest,
  Items,
  Page,
  ReviewItem,
  ReviewItemInput,
  ReviewItemUpdate,
  UpdateAccessReviewRequest,
  UpdateAssetRequest,
  UpdateChangeRequest,
} from './asset.models';

/** Mutations skip the generic toast: pages show a translated, code-specific message. */
const skipToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

const csv = (values: readonly string[] | undefined) =>
  values && values.length ? values.join(',') : undefined;

/**
 * The M19 assets API: the asset inventory with calibration records, access reviews
 * with their accounts, and change requests (whose workflow runs on the generic
 * `workflow-instances` endpoints, used through `<app-workflow-panel>`). Every call
 * goes through ApiService (base URL, bearer, error handling).
 *
 * Permissions: `assets:read` to read; `assets:write` to register and edit assets,
 * record calibrations and raise or edit change requests; `assets:manage` to delete
 * and to plan access reviews; the reviewer of an access review may work it with
 * read access only. `assets:approve` is needed to reject a change.
 */
@Injectable({ providedIn: 'root' })
export class AssetsApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}/assets`;
  }

  // --- assets --------------------------------------------------------------------------

  list(orgId: string, query: AssetListQuery = {}): Observable<Page<Asset>> {
    return this.api.get<Page<Asset>>(this.base(orgId), {
      params: {
        q: query.q || undefined,
        type: csv(query.type),
        classification: csv(query.classification),
        lifecycle: csv(query.lifecycle),
        owner: query.owner || undefined,
        department_id: query.department_id || undefined,
        requires_calibration: query.requires_calibration,
        calibration_due_within_days: query.calibration_due_within_days,
        contains_personal_data: query.contains_personal_data,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  get(orgId: string, id: string): Observable<AssetDetail> {
    return this.api.get<AssetDetail>(`${this.base(orgId)}/${id}`);
  }

  create(orgId: string, body: CreateAssetRequest): Observable<AssetDetail> {
    return this.api.post<AssetDetail>(this.base(orgId), body, skipToast());
  }

  update(orgId: string, id: string, body: UpdateAssetRequest): Observable<AssetDetail> {
    return this.api.patch<AssetDetail>(`${this.base(orgId)}/${id}`, body, skipToast());
  }

  delete(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/${id}`, skipToast());
  }

  // --- calibration ---------------------------------------------------------------------

  calibrationsDue(orgId: string, withinDays = 60): Observable<Items<Asset>> {
    return this.api.get<Items<Asset>>(`${this.base(orgId)}/calibrations-due`, {
      params: { within_days: withinDays },
    });
  }

  listCalibrations(orgId: string, assetId: string): Observable<Items<Calibration>> {
    return this.api.get<Items<Calibration>>(`${this.base(orgId)}/${assetId}/calibrations`);
  }

  addCalibration(
    orgId: string,
    assetId: string,
    body: CalibrationRequest,
  ): Observable<Calibration> {
    return this.api.post<Calibration>(
      `${this.base(orgId)}/${assetId}/calibrations`,
      body,
      skipToast(),
    );
  }

  updateCalibration(
    orgId: string,
    calibrationId: string,
    body: Partial<CalibrationRequest>,
  ): Observable<Calibration> {
    return this.api.patch<Calibration>(
      `${this.base(orgId)}/calibrations/${calibrationId}`,
      body,
      skipToast(),
    );
  }

  deleteCalibration(orgId: string, calibrationId: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/calibrations/${calibrationId}`, skipToast());
  }

  // --- access reviews ------------------------------------------------------------------

  listReviews(orgId: string, query: AccessReviewListQuery = {}): Observable<Page<AccessReview>> {
    return this.api.get<Page<AccessReview>>(`${this.base(orgId)}/access-reviews`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        reviewer: query.reviewer || undefined,
        system_asset_id: query.system_asset_id || undefined,
        due_within_days: query.due_within_days,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getReview(orgId: string, id: string): Observable<AccessReviewDetail> {
    return this.api.get<AccessReviewDetail>(`${this.base(orgId)}/access-reviews/${id}`);
  }

  createReview(orgId: string, body: CreateAccessReviewRequest): Observable<AccessReviewDetail> {
    return this.api.post<AccessReviewDetail>(
      `${this.base(orgId)}/access-reviews`,
      body,
      skipToast(),
    );
  }

  updateReview(
    orgId: string,
    id: string,
    body: UpdateAccessReviewRequest,
  ): Observable<AccessReviewDetail> {
    return this.api.patch<AccessReviewDetail>(
      `${this.base(orgId)}/access-reviews/${id}`,
      body,
      skipToast(),
    );
  }

  deleteReview(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/access-reviews/${id}`, skipToast());
  }

  startReview(orgId: string, id: string): Observable<AccessReviewDetail> {
    return this.api.post<AccessReviewDetail>(
      `${this.base(orgId)}/access-reviews/${id}/start`,
      {},
      skipToast(),
    );
  }

  completeReview(orgId: string, id: string, attestation: string): Observable<AccessReviewDetail> {
    return this.api.post<AccessReviewDetail>(
      `${this.base(orgId)}/access-reviews/${id}/complete`,
      { attestation },
      skipToast(),
    );
  }

  cancelReview(orgId: string, id: string, reason: string): Observable<AccessReviewDetail> {
    return this.api.post<AccessReviewDetail>(
      `${this.base(orgId)}/access-reviews/${id}/cancel`,
      { reason },
      skipToast(),
    );
  }

  addReviewItems(
    orgId: string,
    id: string,
    items: readonly ReviewItemInput[],
  ): Observable<Items<ReviewItem>> {
    return this.api.post<Items<ReviewItem>>(
      `${this.base(orgId)}/access-reviews/${id}/items`,
      { items },
      skipToast(),
    );
  }

  importMembers(orgId: string, id: string): Observable<Items<ReviewItem>> {
    return this.api.post<Items<ReviewItem>>(
      `${this.base(orgId)}/access-reviews/${id}/items/import-members`,
      {},
      skipToast(),
    );
  }

  updateReviewItem(
    orgId: string,
    reviewId: string,
    itemId: string,
    body: ReviewItemUpdate,
  ): Observable<ReviewItem> {
    return this.api.patch<ReviewItem>(
      `${this.base(orgId)}/access-reviews/${reviewId}/items/${itemId}`,
      body,
      skipToast(),
    );
  }

  deleteReviewItem(orgId: string, reviewId: string, itemId: string): Observable<void> {
    return this.api.delete<void>(
      `${this.base(orgId)}/access-reviews/${reviewId}/items/${itemId}`,
      skipToast(),
    );
  }

  // --- change requests -----------------------------------------------------------------

  listChanges(orgId: string, query: ChangeListQuery = {}): Observable<Page<ChangeRequest>> {
    return this.api.get<Page<ChangeRequest>>(`${this.base(orgId)}/changes`, {
      params: {
        q: query.q || undefined,
        status: csv(query.status),
        open: query.open,
        type: query.type || undefined,
        category: csv(query.category),
        risk_level: csv(query.risk_level),
        owner: query.owner || undefined,
        asset_id: query.asset_id || undefined,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      },
    });
  }

  getChange(orgId: string, id: string): Observable<ChangeDetail> {
    return this.api.get<ChangeDetail>(`${this.base(orgId)}/changes/${id}`);
  }

  createChange(orgId: string, body: CreateChangeRequest): Observable<ChangeDetail> {
    return this.api.post<ChangeDetail>(`${this.base(orgId)}/changes`, body, skipToast());
  }

  updateChange(orgId: string, id: string, body: UpdateChangeRequest): Observable<ChangeDetail> {
    return this.api.patch<ChangeDetail>(`${this.base(orgId)}/changes/${id}`, body, skipToast());
  }

  deleteChange(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/changes/${id}`, skipToast());
  }
}
