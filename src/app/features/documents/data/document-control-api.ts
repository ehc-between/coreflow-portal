import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DocumentDetail } from '../../../core/documents/document.models';
import { ApiService, QueryParams } from '../../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/error.interceptor';
import {
  AudienceEntry,
  CampaignCreate,
  Campaign,
  CampaignDetail,
  CampaignListQuery,
  CampaignUpdate,
  DocumentFromTemplate,
  DocumentTemplate,
  DocumentType,
  DocumentTypeCreate,
  DocumentTypeUpdate,
  ExternalCreate,
  ExternalDocument,
  ExternalListQuery,
  ExternalUpdate,
  Page,
  RegisterItem,
  RegisterQuery,
  RetentionDueItem,
  RetentionRule,
  RetentionRuleCreate,
  RetentionRuleUpdate,
  RevisionCompare,
  RevisionHistory,
  TemplateCreate,
  TemplateUpdate,
} from './document-control.models';

/** Mutations show their own coded errors, so the generic toast is skipped. */
const QUIET = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };

/** Comma-joined list, or undefined when empty (so the param is omitted). */
function csv(values: readonly string[] | undefined): string | undefined {
  return values && values.length ? values.join(',') : undefined;
}

/** Drop empty values (and `false` flags) so blank filters never reach the API. */
export function cleanParams(
  params: Readonly<Record<string, string | number | boolean | undefined | null>>,
): QueryParams {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    const v = typeof value === 'string' ? value.trim() : value;
    if (v !== '') {
      out[key] = v;
    }
  }
  return out;
}

function registerParams(query: RegisterQuery): QueryParams {
  return cleanParams({
    q: query.q,
    type: query.type,
    status: query.status,
    owner: query.owner,
    review_due: query.review_due,
    include_external: query.include_external,
    sort: query.sort,
    limit: query.limit,
    offset: query.offset,
  });
}

/**
 * The M24 document management API: document types, templates, retention rules,
 * external documents, the master document list, revision history/compare and
 * distribution campaigns. Every path is under `v1/orgs/{org}`; a disabled
 * `documents` module answers 404 `module_disabled`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentControlApi {
  private readonly api = inject(ApiService);

  private base(orgId: string): string {
    return `v1/orgs/${orgId}`;
  }

  // --- document types -------------------------------------------------------------

  listTypes(orgId: string, includeInactive = false): Observable<readonly DocumentType[]> {
    return this.api.get<readonly DocumentType[]>(`${this.base(orgId)}/document-types`, {
      params: cleanParams({ include_inactive: includeInactive }),
    });
  }

  getType(orgId: string, id: string): Observable<DocumentType> {
    return this.api.get<DocumentType>(`${this.base(orgId)}/document-types/${id}`);
  }

  createType(orgId: string, body: DocumentTypeCreate): Observable<DocumentType> {
    return this.api.post<DocumentType>(`${this.base(orgId)}/document-types`, body, QUIET);
  }

  updateType(orgId: string, id: string, body: DocumentTypeUpdate): Observable<DocumentType> {
    return this.api.patch<DocumentType>(`${this.base(orgId)}/document-types/${id}`, body, QUIET);
  }

  deleteType(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/document-types/${id}`, QUIET);
  }

  // --- templates ------------------------------------------------------------------

  listTemplates(orgId: string, documentTypeId?: string): Observable<readonly DocumentTemplate[]> {
    return this.api.get<readonly DocumentTemplate[]>(`${this.base(orgId)}/document-templates`, {
      params: cleanParams({ document_type_id: documentTypeId }),
    });
  }

  getTemplate(orgId: string, id: string): Observable<DocumentTemplate> {
    return this.api.get<DocumentTemplate>(`${this.base(orgId)}/document-templates/${id}`);
  }

  createTemplate(orgId: string, body: TemplateCreate): Observable<DocumentTemplate> {
    return this.api.post<DocumentTemplate>(`${this.base(orgId)}/document-templates`, body, QUIET);
  }

  updateTemplate(orgId: string, id: string, body: TemplateUpdate): Observable<DocumentTemplate> {
    return this.api.patch<DocumentTemplate>(
      `${this.base(orgId)}/document-templates/${id}`,
      body,
      QUIET,
    );
  }

  deleteTemplate(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/document-templates/${id}`, QUIET);
  }

  /** Create a document from a template (linked to it as `derived_from`). */
  createFromTemplate(
    orgId: string,
    templateId: string,
    body: DocumentFromTemplate,
  ): Observable<DocumentDetail> {
    return this.api.post<DocumentDetail>(
      `${this.base(orgId)}/document-templates/${templateId}/documents`,
      body,
      QUIET,
    );
  }

  // --- retention ------------------------------------------------------------------

  listRetentionRules(orgId: string): Observable<readonly RetentionRule[]> {
    return this.api.get<readonly RetentionRule[]>(`${this.base(orgId)}/retention-rules`);
  }

  getRetentionRule(orgId: string, id: string): Observable<RetentionRule> {
    return this.api.get<RetentionRule>(`${this.base(orgId)}/retention-rules/${id}`);
  }

  createRetentionRule(orgId: string, body: RetentionRuleCreate): Observable<RetentionRule> {
    return this.api.post<RetentionRule>(`${this.base(orgId)}/retention-rules`, body, QUIET);
  }

  updateRetentionRule(
    orgId: string,
    id: string,
    body: RetentionRuleUpdate,
  ): Observable<RetentionRule> {
    return this.api.patch<RetentionRule>(`${this.base(orgId)}/retention-rules/${id}`, body, QUIET);
  }

  deleteRetentionRule(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/retention-rules/${id}`, QUIET);
  }

  /** Records whose retention period ends within `withinDays` (0 = already due). */
  retentionDue(
    orgId: string,
    withinDays = 0,
  ): Observable<{ readonly items: readonly RetentionDueItem[] }> {
    return this.api.get<{ readonly items: readonly RetentionDueItem[] }>(
      `${this.base(orgId)}/retention-due`,
      { params: { within_days: withinDays } },
    );
  }

  // --- external documents ---------------------------------------------------------

  listExternal(orgId: string, query: ExternalListQuery = {}): Observable<Page<ExternalDocument>> {
    return this.api.get<Page<ExternalDocument>>(`${this.base(orgId)}/external-documents`, {
      params: cleanParams({
        q: query.q,
        status: csv(query.status),
        owner: query.owner,
        review_due: query.review_due,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      }),
    });
  }

  getExternal(orgId: string, id: string): Observable<ExternalDocument> {
    return this.api.get<ExternalDocument>(`${this.base(orgId)}/external-documents/${id}`);
  }

  createExternal(orgId: string, body: ExternalCreate): Observable<ExternalDocument> {
    return this.api.post<ExternalDocument>(`${this.base(orgId)}/external-documents`, body, QUIET);
  }

  updateExternal(orgId: string, id: string, body: ExternalUpdate): Observable<ExternalDocument> {
    return this.api.patch<ExternalDocument>(
      `${this.base(orgId)}/external-documents/${id}`,
      body,
      QUIET,
    );
  }

  markExternalReviewed(
    orgId: string,
    id: string,
    body: { readonly next_review_at?: string | null; readonly note?: string | null },
  ): Observable<ExternalDocument> {
    return this.api.post<ExternalDocument>(
      `${this.base(orgId)}/external-documents/${id}/reviewed`,
      body,
      QUIET,
    );
  }

  deleteExternal(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/external-documents/${id}`, QUIET);
  }

  // --- master document list -------------------------------------------------------

  register(orgId: string, query: RegisterQuery = {}): Observable<Page<RegisterItem>> {
    return this.api.get<Page<RegisterItem>>(`${this.base(orgId)}/document-register`, {
      params: registerParams(query),
    });
  }

  /** The master document list as CSV (same filters, no paging). */
  exportRegister(orgId: string, query: RegisterQuery = {}): Observable<Blob> {
    return this.api.getBlob(`${this.base(orgId)}/document-register/export`, {
      params: registerParams({ ...query, limit: undefined, offset: undefined }),
    });
  }

  // --- revision history / compare -------------------------------------------------

  revisionHistory(orgId: string, documentId: string): Observable<RevisionHistory> {
    return this.api.get<RevisionHistory>(
      `${this.base(orgId)}/documents/${documentId}/revision-history`,
    );
  }

  compare(
    orgId: string,
    documentId: string,
    fromRevisionId?: string | null,
    toRevisionId?: string | null,
  ): Observable<RevisionCompare> {
    return this.api.get<RevisionCompare>(`${this.base(orgId)}/documents/${documentId}/compare`, {
      params: cleanParams({ from_revision_id: fromRevisionId, to_revision_id: toRevisionId }),
      ...QUIET,
    });
  }

  // --- campaigns ------------------------------------------------------------------

  listCampaigns(orgId: string, query: CampaignListQuery = {}): Observable<Page<Campaign>> {
    return this.api.get<Page<Campaign>>(`${this.base(orgId)}/document-campaigns`, {
      params: cleanParams({
        document_id: query.document_id,
        status: csv(query.status),
        q: query.q,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      }),
    });
  }

  getCampaign(orgId: string, id: string): Observable<CampaignDetail> {
    return this.api.get<CampaignDetail>(`${this.base(orgId)}/document-campaigns/${id}`);
  }

  createCampaign(orgId: string, body: CampaignCreate): Observable<CampaignDetail> {
    return this.api.post<CampaignDetail>(`${this.base(orgId)}/document-campaigns`, body, QUIET);
  }

  updateCampaign(orgId: string, id: string, body: CampaignUpdate): Observable<CampaignDetail> {
    return this.api.patch<CampaignDetail>(
      `${this.base(orgId)}/document-campaigns/${id}`,
      body,
      QUIET,
    );
  }

  deleteCampaign(orgId: string, id: string): Observable<void> {
    return this.api.delete<void>(`${this.base(orgId)}/document-campaigns/${id}`, QUIET);
  }

  launchCampaign(orgId: string, id: string): Observable<CampaignDetail> {
    return this.api.post<CampaignDetail>(
      `${this.base(orgId)}/document-campaigns/${id}/launch`,
      {},
      QUIET,
    );
  }

  addRecipients(
    orgId: string,
    id: string,
    audience: readonly AudienceEntry[],
  ): Observable<CampaignDetail> {
    return this.api.post<CampaignDetail>(
      `${this.base(orgId)}/document-campaigns/${id}/recipients`,
      { audience },
      QUIET,
    );
  }

  remindCampaign(orgId: string, id: string): Observable<{ readonly reminded: number }> {
    return this.api.post<{ readonly reminded: number }>(
      `${this.base(orgId)}/document-campaigns/${id}/remind`,
      {},
      QUIET,
    );
  }

  closeCampaign(orgId: string, id: string): Observable<CampaignDetail> {
    return this.api.post<CampaignDetail>(
      `${this.base(orgId)}/document-campaigns/${id}/close`,
      {},
      QUIET,
    );
  }
}
