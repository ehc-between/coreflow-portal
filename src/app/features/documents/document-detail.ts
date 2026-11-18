import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  SecurityContext,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { AuthService } from '../../core/auth/auth.service';
import { HasPermissionDirective } from '../../core/auth/has-permission.directive';
import {
  AccessGrant,
  DocumentAccess,
  DocumentDetail as DocumentDetailModel,
  DocumentRevision,
  DocumentVisibility,
  ExportFormat,
} from '../../core/documents/document.models';
import { DocumentsApi } from '../../core/documents/documents-api';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { RequirementLink } from '../../core/standards/standards.models';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { TourStepDirective } from '../../shared/guidance/tour-step.directive';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { DocumentAccessEditor } from './access/document-access-editor';
import { DocumentComments } from './comments/document-comments';
import { DocumentControlApi } from './data/document-control-api';
import { DocumentType } from './data/document-control.models';
import { documentTypeName, lifecycleSteps, statusLabelKey } from './document-status';
import { DocumentsPageGuide } from './shared/documents-page-guide';
import { DocumentAcknowledge } from './workflow/document-acknowledge';
import { DocumentAcknowledgementList } from './workflow/document-acknowledgement-list';
import { DocumentDeleteAction } from './workflow/document-delete-action';
import { reviewLabelKey, reviewState } from './workflow/document-review';
import { DocumentReviewPanel } from './workflow/document-review-panel';
import {
  DocumentVersionBanner,
  VersionView,
  defaultVersionView,
} from './workflow/document-version-banner';
import { DocumentWorkflowActions } from './workflow/document-workflow-actions';

const TABS: readonly RecordTab[] = ['details', 'related', 'tasks', 'activity', 'attachments'];

/**
 * Document detail on the shared record-detail layout. Header: breadcrumbs, the
 * title, a meta line (code · type · status · review due) and the actions — the
 * workflow step as the primary action ("Send til godkjenning" / "Godkjenn"),
 * "Rediger" and "Lag ny fra denne" as secondary, and "Mer" (download PDF / Word,
 * distribute, compare revisions, make obsolete, delete). Tabs: the document
 * itself (lifecycle stepper, approval status, the auditor's fields — owner,
 * approved by and when, effective from, next review, revision — and the paper
 * view), Related (the record links), Tasks, Activity and Attachments. The aside
 * holds "Krav dette dokumenterer", the connections, periodic review,
 * read-and-understood, revision history, sharing and the anchored comments.
 * Readers see the last approved revision; drafters can switch to the draft.
 * Navigates back to the list on org switch.
 */
@Component({
  selector: 'app-document-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    TourStepDirective,
    LocalDatePipe,
    LocalDayPipe,
    RecordDetailLayout,
    WatchButton,
    AskAbout,
    SupportsRequirements,
    EntityTasks,
    Alert,
    Button,
    Card,
    ErrorState,
    FieldList,
    FieldItem,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    DocumentAccessEditor,
    DocumentComments,
    DocumentWorkflowActions,
    DocumentVersionBanner,
    DocumentReviewPanel,
    DocumentAcknowledge,
    DocumentAcknowledgementList,
    DocumentDeleteAction,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (document(); as doc) {
      <app-record-detail-layout
        entityType="document"
        [entityId]="doc.id"
        [title]="doc.title"
        [breadcrumbs]="[
          { labelKey: 'modules.names.documents', link: '/documents' },
          { label: doc.doc_code || doc.title },
        ]"
        settingsLink="/documents/types"
        [tabs]="tabs"
        [canEdit]="canEdit()"
        [canComment]="false"
        [includeAudit]="canReadAudit()"
        backLink="/documents"
        backLabelKey="documents.backToList"
      >
        <ng-container meta>
          <span class="font-mono" data-testid="doc-code">{{ doc.doc_code }}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="doc-type">{{ typeName() }}</span>
          <span aria-hidden="true">·</span>
          <app-status-badge
            meaning="lifecycle"
            [value]="doc.status"
            [labelKey]="statusLabelKey(doc.status)"
          />
          @if (review(); as r) {
            <app-status-badge meaning="lifecycle" [value]="r" [labelKey]="reviewLabelKey(r)" />
          }
          <app-ask-about class="ml-1" [prompt]="'documents.page.detail.askCovers' | transloco" />
        </ng-container>

        @if (!viewingOldRevision()) {
          <app-document-workflow-actions
            primary
            #workflowRef
            [document]="doc"
            (changed)="onDocumentChange($event)"
            (reloadRequested)="reload()"
          />
        }

        <app-watch-button secondary entityType="document" [entityId]="doc.id" />
        @if (!viewingOldRevision() && doc.status !== 'obsolete') {
          <a
            secondary
            *appHasPermission="'documents:draft'"
            [routerLink]="['/documents', doc.id, 'edit']"
            data-testid="edit-link"
          >
            <app-button variant="secondary">
              <app-icon name="pencil" [size]="15" />
              {{ 'documents.edit' | transloco }}
            </app-button>
          </a>
        }

        <button
          overflow
          appMenuItem
          type="button"
          [disabled]="exporting()"
          (click)="download('pdf')"
          data-testid="download-pdf"
        >
          <app-icon name="download" [size]="15" />
          {{ 'documents.downloadPdf' | transloco }}
        </button>
        <button
          overflow
          appMenuItem
          type="button"
          [disabled]="exporting()"
          (click)="download('docx')"
          data-testid="download-docx"
        >
          <app-icon name="download" [size]="15" />
          {{ 'documents.downloadWord' | transloco }}
        </button>
        @if (doc.status === 'approved' && canDistribute()) {
          <a
            overflow
            appMenuItem
            [routerLink]="['/documents/campaigns/new']"
            [queryParams]="{ document: doc.id }"
            data-testid="distribute-link"
          >
            <app-icon name="send" [size]="15" />
            {{ 'documents.control.campaigns.distribute' | transloco }}
          </a>
        }
        @if (doc.revisions.length > 1) {
          <a
            overflow
            appMenuItem
            [routerLink]="['/documents', doc.id, 'history']"
            data-testid="compare-link"
          >
            <app-icon name="history" [size]="15" />
            {{ 'documents.control.compare.link' | transloco }}
          </a>
        }
        @if (canObsolete()) {
          <button
            overflow
            appMenuItem
            type="button"
            [danger]="true"
            (click)="workflow()?.open('obsolete')"
            data-testid="obsolete-item"
          >
            <app-icon name="x" [size]="15" />
            {{ 'documents.workflow.obsolete' | transloco }}
          </button>
        }
        @if (doc.can_delete) {
          <button
            overflow
            appMenuItem
            type="button"
            [danger]="true"
            (click)="deleteAction()?.start()"
            data-testid="delete-item"
          >
            <app-icon name="trash" [size]="15" />
            {{
              (doc.current_revision
                ? 'documents.delete.action'
                : 'documents.page.detail.deleteDraft'
              ) | transloco
            }}
          </button>
        }

        <div help>
          <app-documents-page-guide page="detail" lesson="first-document" tour="detail" />
        </div>

        <!-- Details tab: the document itself. -->
        <div class="flex flex-col gap-4">
          <ol
            class="flex flex-wrap items-center gap-x-1 gap-y-2 text-meta"
            [attr.aria-label]="'documents.page.detail.lifecycle' | transloco"
            data-testid="lifecycle"
            [appTourStep]="'documents-lifecycle'"
          >
            @for (s of steps(); track s.step; let last = $last) {
              <li class="flex items-center gap-1">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold"
                  [class]="
                    s.state === 'current'
                      ? 'border-accent bg-accent-soft text-accent'
                      : s.state === 'done'
                        ? 'border-border bg-surface text-fg'
                        : 'border-dashed border-border bg-surface text-fg-subtle'
                  "
                  [attr.aria-current]="s.state === 'current' ? 'step' : null"
                >
                  @if (s.state === 'done') {
                    <app-icon name="check" [size]="12" class="text-pass" />
                  }
                  {{ statusLabelKey(s.step) | transloco }}
                </span>
                @if (!last) {
                  <span aria-hidden="true" class="text-fg-subtle">→</span>
                }
              </li>
            }
          </ol>

          @if (doc.status === 'in_review') {
            <app-alert tone="info" data-testid="awaiting-approval">
              @if (reviewedRevision()?.requested_approver_name; as name) {
                {{ 'documents.approval.waitingFor' | transloco: { name } }}
              } @else {
                {{ 'documents.approval.waitingAny' | transloco }}
              }
              @if (reviewedRevision()?.submitted_at; as at) {
                <span class="text-fg-muted">
                  · {{ 'documents.approval.submittedOn' | transloco: { date: (at | localDate) } }}
                </span>
              }
              @if (doc.segregation_required !== false) {
                <span class="mt-1 block text-meta text-fg-muted">{{
                  'documents.approval.segregationExplained' | transloco
                }}</span>
              }
            </app-alert>
          }

          <app-card [appTourStep]="'documents-fields'">
            <app-field-list [columns]="3" data-testid="doc-fields">
              <app-field-item labelKey="documents.page.fields.owner" [value]="ownerName()" />
              <app-field-item
                labelKey="documents.page.fields.approvedBy"
                [value]="doc.current_revision?.approved_by_name"
              />
              <app-field-item
                labelKey="documents.page.fields.approvedOn"
                [value]="
                  doc.current_revision?.approved_at
                    ? (doc.current_revision?.approved_at | localDay)
                    : null
                "
              />
              <app-field-item
                labelKey="documents.page.fields.effectiveFrom"
                [value]="effectiveFrom() ? (effectiveFrom() | localDay) : null"
              />
              <app-field-item
                labelKey="documents.page.fields.nextReview"
                [value]="doc.next_review_at ? (doc.next_review_at | localDay) : null"
              />
              <app-field-item labelKey="documents.meta.revision" [value]="revisionLabel()" />
              <app-field-item labelKey="documents.meta.type" [value]="typeName()" />
              @if (doc.current_revision?.change_reason; as reason) {
                <app-field-item
                  labelKey="documents.page.fields.changeReason"
                  [value]="reason"
                  [wide]="true"
                  [multiline]="true"
                />
              }
              @if (doc.current_revision?.approval_note; as note) {
                <app-field-item
                  labelKey="documents.page.fields.approvalNote"
                  [value]="note"
                  [wide]="true"
                  [multiline]="true"
                />
              }
            </app-field-list>
          </app-card>

          @if (!viewedRevision()) {
            <app-document-version-banner
              [document]="doc"
              [view]="versionView()"
              (viewChange)="versionView.set($event)"
            />
          }

          @if (viewedRevision(); as rev) {
            <div
              class="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-surface-2 px-4 py-3"
            >
              <div class="flex min-w-0 items-center gap-2.5">
                <app-icon name="history" [size]="16" class="flex-none text-fg-subtle" />
                <span class="text-ui font-semibold text-fg">{{
                  'documents.viewingRevision' | transloco: { rev: rev.rev }
                }}</span>
                <app-status-badge
                  meaning="lifecycle"
                  [value]="rev.status"
                  [labelKey]="statusLabelKey(rev.status)"
                />
              </div>
              <app-button variant="secondary" (click)="backToCurrent()">
                <app-icon name="back" [size]="15" />
                {{ 'documents.backToCurrent' | transloco }}
              </app-button>
            </div>
          }

          @if (showingApproved()) {
            <app-document-acknowledge [document]="doc" (changed)="onDocumentChange($event)" />
          }

          @if (contentHtml(); as html) {
            <div #docBody class="cf-doc" [innerHTML]="html"></div>
          } @else {
            <app-card>
              <p class="py-6 text-center text-body text-fg-muted">
                {{ 'documents.noContent' | transloco }}
              </p>
            </app-card>
          }
        </div>

        <div tasks>
          <app-entity-tasks
            entityType="document"
            [entityId]="doc.id"
            [canCreate]="canEdit()"
            [entityLabel]="doc.doc_code + ' ' + doc.title"
          />
        </div>

        @if (canReadStandards()) {
          <app-card
            aside-requirements
            id="supports-requirements"
            class="scroll-mt-6"
            [appTourStep]="'documents-requirements'"
          >
            <app-supports-requirements
              entityType="document"
              [entityId]="doc.id"
              [canEdit]="canEdit()"
              (linksChange)="requirementLinks.set($event)"
            />
          </app-card>
        }

        <div aside class="flex flex-col gap-4">
          <app-document-review-panel
            [document]="doc"
            [canManage]="canManage()"
            (changed)="onDocumentChange($event)"
          />

          @if (canManage() || doc.acknowledgement?.required) {
            <app-document-acknowledgement-list
              [document]="doc"
              [canManage]="canManage()"
              (changed)="onDocumentChange($event)"
            />
          }

          <app-card [padded]="false">
            <h2 class="px-4 pt-3.5 pb-1 font-display text-card font-bold text-fg">
              {{ 'documents.history' | transloco }}
            </h2>
            @if (doc.revisions.length === 0) {
              <p class="px-4 py-6 text-center text-ui text-fg-muted">
                {{ 'documents.noRevisions' | transloco }}
              </p>
            } @else {
              <ul class="px-2 py-2" data-testid="revision-list">
                @for (rev of doc.revisions; track rev.id) {
                  <li>
                    <button
                      type="button"
                      [disabled]="revisionLoading()"
                      [class.bg-surface-2]="isSelected(rev)"
                      (click)="viewRevision(rev)"
                      class="flex w-full items-start gap-2.5 rounded-tile px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
                    >
                      <span class="mt-0.5 flex flex-none text-fg-subtle">
                        <app-icon name="history" [size]="15" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex flex-wrap items-center gap-2">
                          <span class="font-semibold text-fg">{{
                            'documents.revShort' | transloco: { rev: rev.rev }
                          }}</span>
                          <app-status-badge
                            meaning="lifecycle"
                            [value]="rev.status"
                            [labelKey]="statusLabelKey(rev.status)"
                          />
                        </span>
                        <span class="block text-meta text-fg-subtle">
                          @if (rev.author_name) {
                            {{
                              'documents.page.detail.writtenBy'
                                | transloco
                                  : { name: rev.author_name, date: (rev.created_at | localDay) }
                            }}
                          } @else {
                            {{ rev.created_at | localDay }}
                          }
                        </span>
                        @if (rev.approved_at) {
                          <span class="block text-meta text-fg-subtle">
                            {{
                              (rev.approved_by_name
                                ? 'documents.page.detail.approvedByOn'
                                : 'documents.page.detail.approvedOn'
                              )
                                | transloco
                                  : {
                                      name: rev.approved_by_name,
                                      date: (rev.approved_at | localDay),
                                    }
                            }}
                          </span>
                        }
                        @if (rev.change_reason) {
                          <span class="mt-0.5 block text-meta leading-snug text-fg-muted">{{
                            rev.change_reason
                          }}</span>
                        }
                      </span>
                    </button>
                  </li>
                }
              </ul>
              @if (doc.revisions.length > 1) {
                <a
                  [routerLink]="['/documents', doc.id, 'history']"
                  class="block px-4 pb-3 text-meta font-semibold text-accent hover:underline"
                >
                  {{ 'documents.control.compare.link' | transloco }}
                </a>
              }
            }
          </app-card>

          @if (access(); as acc) {
            <app-card [padded]="false">
              <h2 class="px-4 pt-3.5 pb-3 font-display text-card font-bold text-fg">
                {{ 'documents.access.sharingTitle' | transloco }}
              </h2>
              <div class="px-4 pb-4">
                <app-document-access-editor
                  mode="live"
                  [documentId]="doc.id"
                  [canManage]="canManage()"
                  [owner]="acc.owner_user_id"
                  [ownerName]="acc.owner_name"
                  [visibility]="acc.visibility"
                  [grants]="grants()"
                  (ownerChange)="onOwnerChange($event)"
                  (visibilityChange)="onVisibilityChange($event)"
                  (grantsChange)="grants.set($event)"
                />
              </div>
            </app-card>
          }

          @if (activeRevisionId(); as revId) {
            <app-document-comments
              [docElement]="docBodyEl()"
              [documentId]="doc.id"
              [revisionId]="revId"
              [revisionHtml]="(viewedRevision() ?? baseRevision())?.content ?? ''"
              [canEdit]="canEdit()"
              (revisionApplied)="reload()"
            />
          }

          <app-document-delete-action
            #deleteRef
            [document]="doc"
            [canManage]="canManage()"
            [showCard]="false"
            (deleted)="onDeleted()"
            (reloadRequested)="reload()"
          />
        </div>
      </app-record-detail-layout>
    } @else {
      <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
        <a
          routerLink="/documents"
          class="mb-3 inline-flex items-center gap-1.5 text-ui font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'documents.backToList' | transloco }}
        </a>
        @if (loading()) {
          <app-loading-state [rows]="6" />
        } @else if (notFound()) {
          <app-card>
            <p class="px-2 py-10 text-center text-body text-fg-muted">
              {{ 'documents.notFound' | transloco }}
            </p>
          </app-card>
        } @else {
          <app-error-state (retry)="reload()" />
        }
      </div>
    }
  `,
})
export class DocumentDetail {
  private readonly api = inject(DocumentsApi);
  private readonly controlApi = inject(DocumentControlApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly statusLabelKey = statusLabelKey;
  protected readonly reviewLabelKey = reviewLabelKey;

  /** The rendered `.cf-doc` element, passed to the comments panel for anchoring. */
  private readonly docBody = viewChild<ElementRef<HTMLElement>>('docBody');
  protected readonly docBodyEl = computed(() => this.docBody()?.nativeElement ?? null);
  protected readonly workflow = viewChild<DocumentWorkflowActions>('workflowRef');
  protected readonly deleteAction = viewChild<DocumentDeleteAction>('deleteRef');

  protected readonly orgId = this.selectedOrg.currentOrgId;

  protected readonly document = signal<DocumentDetailModel | null>(null);
  /** The requirements this document documents (mirrored from the panel, for the assistant). */
  protected readonly requirementLinks = signal<readonly RequirementLink[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly exporting = signal(false);
  /** The org's document types, for the type name when the API does not send one. */
  private readonly types = signal<readonly DocumentType[]>([]);

  /** Access state for the sharing panel; null until loaded. */
  protected readonly access = signal<DocumentAccess | null>(null);
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canEdit = computed(() => this.permissions().includes('documents:draft'));
  protected readonly canDistribute = computed(() =>
    this.permissions().includes('documents:distribute'),
  );
  protected readonly canReadStandards = computed(() =>
    this.permissions().includes('standards:read'),
  );
  protected readonly canReadAudit = computed(() => this.permissions().includes('audit:read'));
  /** "Gjør utgått": approved documents only, for approvers (a draft is deleted instead). */
  protected readonly canObsolete = computed(
    () =>
      this.document()?.status === 'approved' &&
      this.permissions().includes('documents:approve') &&
      !this.viewingOldRevision(),
  );

  /** Manage controls show for the owner or anyone with documents:approve. */
  protected readonly canManage = computed(() => {
    const doc = this.document();
    if (!doc) {
      return false;
    }
    if (doc.owner_user_id === this.auth.user()?.id) {
      return true;
    }
    return this.permissions().includes('documents:approve');
  });

  protected readonly typeName = computed(() => {
    const doc = this.document();
    return doc ? documentTypeName(doc, this.types()) : '';
  });
  protected readonly ownerName = computed(
    () => this.document()?.owner_name ?? this.access()?.owner_name ?? null,
  );
  /** Periodic-review standing for the header badge. */
  protected readonly review = computed(() => {
    const doc = this.document();
    return doc ? reviewState(doc) : null;
  });
  protected readonly steps = computed(() => {
    const doc = this.document();
    return doc ? lifecycleSteps(doc.status, !!doc.current_revision) : [];
  });
  /** The revision in (or heading for) approval: the draft when there is one. */
  protected readonly reviewedRevision = computed(() => {
    const doc = this.document();
    return doc?.draft_revision ?? doc?.current_revision ?? null;
  });
  protected readonly effectiveFrom = computed(() => {
    const doc = this.document();
    return doc?.effective_from ?? doc?.current_revision?.approved_at ?? null;
  });
  /** "B" for the approved revision, "C (utkast)" while a draft is open, "A (utkast)" before. */
  protected readonly revisionLabel = computed(() => {
    const doc = this.document();
    if (!doc) {
      return null;
    }
    const approved = doc.current_revision?.rev;
    const draft = doc.draft_revision?.rev;
    if (
      draft !== undefined &&
      draft !== null &&
      doc.draft_revision?.id !== doc.current_revision?.id
    ) {
      const draftLabel = this.language.translate('documents.page.detail.draftRevision', {
        rev: draft,
      });
      return approved !== undefined && approved !== null
        ? `${approved} · ${draftLabel}`
        : draftLabel;
    }
    return approved !== undefined && approved !== null ? String(approved) : null;
  });

  /** Drafters: whether the approved revision or the working draft is shown. */
  protected readonly versionView = signal<VersionView>('approved');

  /**
   * The revision shown when no history entry is picked: the working draft when
   * the drafter switched to it (or nothing is approved yet), else the last
   * approved revision readers see.
   */
  protected readonly baseRevision = computed<DocumentRevision | null>(() => {
    const doc = this.document();
    if (!doc) {
      return null;
    }
    if (this.versionView() === 'draft' && doc.draft_revision) {
      return doc.draft_revision;
    }
    return doc.current_revision ?? doc.draft_revision ?? null;
  });

  /** True while the approved revision (what readers see) is on screen. */
  protected readonly showingApproved = computed(() => {
    const current = this.document()?.current_revision;
    return !this.viewedRevision() && !!current && this.baseRevision()?.id === current.id;
  });

  /** A historical revision being viewed read-only; null means the base revision. */
  protected readonly viewedRevision = signal<DocumentRevision | null>(null);
  protected readonly revisionLoading = signal(false);

  /** True while viewing a revision that is neither the approved one nor the draft. */
  protected readonly viewingOldRevision = computed(() => {
    const viewed = this.viewedRevision();
    return viewed !== null && viewed.id !== this.baseRevision()?.id;
  });

  /** The revision body to render, sanitized for safe [innerHTML]: viewed if set, else base. */
  protected readonly contentHtml = computed(() => {
    const raw = (this.viewedRevision() ?? this.baseRevision())?.content;
    if (!raw) {
      return null;
    }
    return this.sanitizer.sanitize(SecurityContext.HTML, raw) || null;
  });

  /** The revision the comments panel operates on: the viewed one, else current. */
  protected readonly activeRevisionId = computed(
    () => (this.viewedRevision() ?? this.baseRevision())?.id ?? null,
  );

  private currentOrgId: string | null = null;

  constructor() {
    // Tell the assistant which document this page shows, and what it documents.
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      entityId: this.id(),
      view: 'detail',
      title: this.document()?.title ?? null,
      requirements: this.requirementLinks()
        .filter((link) => link.status === 'confirmed')
        .map((link) => link.requirement_ref),
    }));

    effect(() => {
      const orgId = this.orgId();
      const id = this.id();
      if (this.currentOrgId !== null && orgId !== this.currentOrgId) {
        void this.router.navigateByUrl('/documents');
        return;
      }
      this.currentOrgId = orgId;
      if (orgId) {
        this.load(orgId, id);
        this.controlApi.listTypes(orgId).subscribe({
          next: (types) => this.types.set(types),
          error: () => this.types.set([]),
        });
      }
    });
  }

  protected download(format: ExportFormat): void {
    const orgId = this.orgId();
    const doc = this.document();
    if (!orgId || !doc || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.export(orgId, doc.id, format, this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        this.triggerDownload(blob, `${doc.doc_code}.${format}`);
      },
      error: (error: { status?: number }) => {
        this.exporting.set(false);
        if (error.status === 503) {
          this.notifications.info('documents.exportUnavailable');
        }
      },
    });
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** A workflow action, settings save or acknowledgement returned the updated document. */
  protected onDocumentChange(document: DocumentDetailModel): void {
    this.document.set(document);
    this.viewedRevision.set(null);
    this.versionView.set(defaultVersionView(document));
  }

  protected isSelected(rev: DocumentRevision): boolean {
    const viewed = this.viewedRevision();
    if (viewed) {
      return viewed.id === rev.id;
    }
    return rev.id === this.baseRevision()?.id;
  }

  protected viewRevision(rev: DocumentRevision): void {
    const orgId = this.orgId();
    const doc = this.document();
    if (!orgId || !doc || this.revisionLoading()) {
      return;
    }
    // The approved revision and the draft are already loaded: switch to them.
    if (rev.id === doc.current_revision?.id || rev.id === doc.draft_revision?.id) {
      this.versionView.set(rev.id === doc.current_revision?.id ? 'approved' : 'draft');
      this.viewedRevision.set(null);
      return;
    }
    this.revisionLoading.set(true);
    this.api.getRevision(orgId, doc.id, rev.id).subscribe({
      next: (revision) => {
        this.viewedRevision.set(revision);
        this.revisionLoading.set(false);
      },
      error: () => {
        this.revisionLoading.set(false);
        this.notifications.info('documents.revisionLoadError');
      },
    });
  }

  protected backToCurrent(): void {
    this.viewedRevision.set(null);
  }

  /** The document is gone: back to the list (the delete action showed the toast). */
  protected onDeleted(): void {
    void this.router.navigateByUrl('/documents');
  }

  /** Re-fetch the document (after a comment approval published a new revision, or a retry). */
  protected reload(): void {
    const orgId = this.orgId();
    if (orgId) {
      this.viewedRevision.set(null);
      this.load(orgId, this.id());
    }
  }

  protected onOwnerChange(ownerUserId: string): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, owner_user_id: ownerUserId });
    }
  }

  protected onVisibilityChange(visibility: DocumentVisibility): void {
    const acc = this.access();
    if (acc) {
      this.access.set({ ...acc, visibility });
    }
  }

  private load(orgId: string, id: string): void {
    // Keep the page on screen while reloading the same document.
    if (this.document()?.id !== id) {
      this.document.set(null);
      this.access.set(null);
    }
    this.loading.set(true);
    this.notFound.set(false);
    this.viewedRevision.set(null);
    this.api.get(orgId, id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.versionView.set(defaultVersionView(document));
        this.loading.set(false);
        this.loadAccess(orgId, id);
      },
      error: (error: { status?: number }) => {
        this.document.set(null);
        this.loading.set(false);
        this.notFound.set(error.status === 404 || error.status === 403);
      },
    });
  }

  private loadAccess(orgId: string, id: string): void {
    this.api.getAccess(orgId, id).subscribe({
      next: (access) => {
        this.access.set(access);
        this.grants.set(access.grants);
      },
    });
  }
}
