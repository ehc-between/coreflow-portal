import { DatePipe } from '@angular/common';
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
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Attachments } from '../../shared/attachments/attachments';
import { Icon } from '../../shared/ui/icon/icon';
import { DocumentAccessEditor } from './access/document-access-editor';
import { DocumentComments } from './comments/document-comments';
import { statusLabelKey, statusTone } from './document-status';
import { DocumentAcknowledge } from './workflow/document-acknowledge';
import { DocumentAcknowledgementList } from './workflow/document-acknowledgement-list';
import { reviewLabelKey, reviewState, reviewTone } from './workflow/document-review';
import { DocumentReviewPanel } from './workflow/document-review-panel';
import {
  DocumentVersionBanner,
  VersionView,
  defaultVersionView,
} from './workflow/document-version-banner';
import { DocumentWorkflowActions } from './workflow/document-workflow-actions';

/**
 * Document detail, scoped to the currently selected org. Renders the current
 * revision's sanitized HTML as a styled "paper" page under an ISO controlled-
 * document header band (code, title, type, status, revision, owner), with the
 * revision history alongside. Actions: Edit (gated `documents:draft`) into the
 * rich-text editor; Download as PDF / Word (the export blob flow); and the
 * document-control workflow (submit / request changes / approve / obsolete —
 * see {@link DocumentWorkflowActions}). Readers see the last approved revision;
 * drafters can switch between it and the working draft. Periodic review and
 * read-and-understood acknowledgement live in the sidebar / under the body.
 * Navigates back to the list on org switch.
 */
@Component({
  selector: 'app-document-detail',
  imports: [
    DatePipe,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Card,
    Badge,
    Button,
    Icon,
    DocumentAccessEditor,
    DocumentComments,
    Attachments,
    DocumentWorkflowActions,
    DocumentVersionBanner,
    DocumentReviewPanel,
    DocumentAcknowledge,
    DocumentAcknowledgementList,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeDownload()' },
  template: `
    <div class="mx-auto max-w-[1080px] px-8 pt-7 pb-12">
      <a
        routerLink="/documents"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'documents.backToList' | transloco }}
      </a>

      @if (loading()) {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </div>
        </app-card>
      } @else if (document(); as doc) {
        <div class="mb-[18px] flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="mb-1 flex items-center gap-2">
              <span class="font-mono text-[12.5px] text-fg-subtle">{{ doc.doc_code }}</span>
              <app-badge tone="neutral">{{ doc.type }}</app-badge>
              <app-badge [tone]="statusTone(doc.status)">{{
                statusLabelKey(doc.status) | transloco
              }}</app-badge>
              @if (review(); as r) {
                <app-badge [tone]="reviewTone(r)">{{ reviewLabelKey(r) | transloco }}</app-badge>
              }
            </div>
            <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
              {{ doc.title }}
            </h1>
          </div>

          <div class="flex flex-none items-center gap-2">
            <div class="relative">
              <app-button variant="secondary" (click)="toggleDownload($event)">
                <app-icon name="upload" [size]="15" />
                {{ 'documents.download' | transloco }}
                <app-icon name="chevron" [size]="14" />
              </app-button>
              @if (downloadOpen()) {
                <div
                  class="animate-cf-pop absolute right-0 z-30 mt-1.5 w-48 rounded-tile border border-border bg-surface p-1 shadow-pop"
                >
                  <button
                    type="button"
                    [disabled]="exporting()"
                    (click)="download('pdf')"
                    class="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-fg hover:bg-surface-2 disabled:opacity-60"
                  >
                    <app-icon name="documents" [size]="15" />
                    {{ 'documents.downloadPdf' | transloco }}
                  </button>
                  <button
                    type="button"
                    [disabled]="exporting()"
                    (click)="download('docx')"
                    class="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13.5px] text-fg hover:bg-surface-2 disabled:opacity-60"
                  >
                    <app-icon name="documents" [size]="15" />
                    {{ 'documents.downloadWord' | transloco }}
                  </button>
                </div>
              }
            </div>

            @if (!viewingOldRevision()) {
              @if (doc.status !== 'obsolete') {
                <a
                  *appHasPermission="'documents:draft'"
                  [routerLink]="['/documents', doc.id, 'edit']"
                >
                  <app-button variant="secondary">
                    <app-icon name="procedures" [size]="15" />
                    {{ 'documents.edit' | transloco }}
                  </app-button>
                </a>
              }

              <app-document-workflow-actions
                [document]="doc"
                (changed)="onDocumentChange($event)"
                (reloadRequested)="reload()"
              />
            }
          </div>
        </div>

        <div class="grid gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <div
              class="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-tile border border-border bg-surface-2 px-5 py-4 sm:grid-cols-4"
            >
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'documents.meta.code' | transloco }}
                </div>
                <div class="mt-0.5 font-mono text-[13px] text-fg">{{ doc.doc_code }}</div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'documents.meta.type' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px] text-fg">{{ doc.type }}</div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'documents.meta.revision' | transloco }}
                </div>
                <div class="mt-0.5 text-[13px] text-fg">
                  {{
                    doc.current_revision
                      ? ('documents.revShort' | transloco: { rev: doc.current_revision.rev })
                      : '—'
                  }}
                </div>
              </div>
              <div>
                <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                  {{ 'documents.meta.status' | transloco }}
                </div>
                <div class="mt-0.5">
                  <app-badge [tone]="statusTone(doc.status)">{{
                    statusLabelKey(doc.status) | transloco
                  }}</app-badge>
                </div>
              </div>
            </div>

            @if (!viewedRevision()) {
              <app-document-version-banner
                [document]="doc"
                [view]="versionView()"
                (viewChange)="versionView.set($event)"
              />
            }

            @if (viewedRevision(); as rev) {
              <div
                class="mb-4 flex items-center justify-between gap-3 rounded-tile border border-border bg-surface-2 px-4 py-3"
              >
                <div class="flex min-w-0 items-center gap-2.5">
                  <app-icon name="history" [size]="16" class="flex-none text-fg-subtle" />
                  <span class="text-[13.5px] font-semibold text-fg">{{
                    'documents.viewingRevision' | transloco: { rev: rev.rev }
                  }}</span>
                  <app-badge [tone]="statusTone(rev.status)">{{
                    statusLabelKey(rev.status) | transloco
                  }}</app-badge>
                </div>
                <app-button variant="secondary" (click)="backToCurrent()">
                  <app-icon name="back" [size]="15" />
                  {{ 'documents.backToCurrent' | transloco }}
                </app-button>
              </div>
            }

            @if (contentHtml(); as html) {
              <div #docBody class="cf-doc" [innerHTML]="html"></div>
            } @else {
              <app-card>
                <p class="py-6 text-center text-[14px] text-fg-muted">
                  {{ 'documents.noContent' | transloco }}
                </p>
              </app-card>
            }

            @if (showingApproved()) {
              <app-document-acknowledge [document]="doc" (changed)="onDocumentChange($event)" />
            }
          </div>

          <div class="flex flex-col gap-5">
            <app-card [padded]="false">
              <h2
                class="px-4 pt-3.5 pb-1 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
              >
                {{ 'documents.history' | transloco }}
              </h2>
              @if (doc.revisions.length === 0) {
                <p class="px-4 py-6 text-center text-[13.5px] text-fg-muted">
                  {{ 'documents.noRevisions' | transloco }}
                </p>
              } @else {
                <ul class="px-2 py-2">
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
                          <span class="flex items-center gap-2">
                            <span class="font-semibold text-fg">{{
                              'documents.revShort' | transloco: { rev: rev.rev }
                            }}</span>
                            <app-badge [tone]="statusTone(rev.status)">{{
                              statusLabelKey(rev.status) | transloco
                            }}</app-badge>
                          </span>
                          <span class="block text-[12px] text-fg-subtle">
                            {{ rev.created_at | date: 'medium' }}
                          </span>
                          @if (rev.change_reason) {
                            <span class="mt-0.5 block text-[12px] leading-snug text-fg-muted">{{
                              rev.change_reason
                            }}</span>
                          }
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </app-card>

            <app-document-review-panel
              [document]="doc"
              [canManage]="canManage()"
              (changed)="onDocumentChange($event)"
            />

            @if (canManage() && doc.acknowledgement?.required && doc.current_revision) {
              <app-document-acknowledgement-list
                [documentId]="doc.id"
                [revisionId]="doc.current_revision.id"
                [acknowledgedAt]="doc.acknowledgement?.acknowledged_at ?? null"
              />
            }

            <app-card>
              <app-attachments entityType="document" [entityId]="doc.id" [canEdit]="canEdit()" />
            </app-card>

            @if (access(); as acc) {
              <app-card [padded]="false">
                <h2
                  class="px-4 pt-3.5 pb-3 font-display text-[15px] font-bold tracking-[-0.02em] text-fg"
                >
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
          </div>
        </div>
      } @else {
        <app-card>
          <div class="px-2 py-10 text-center text-[14px] text-fg-muted">
            {{ 'documents.notFound' | transloco }}
          </div>
        </app-card>
      }
    </div>
  `,
})
export class DocumentDetail {
  private readonly api = inject(DocumentsApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  /** Route param `id`, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  /** The rendered `.cf-doc` element, passed to the comments panel for anchoring. */
  private readonly docBody = viewChild<ElementRef<HTMLElement>>('docBody');
  protected readonly docBodyEl = computed(() => this.docBody()?.nativeElement ?? null);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly statusTone = statusTone;
  protected readonly statusLabelKey = statusLabelKey;

  protected readonly document = signal<DocumentDetailModel | null>(null);
  protected readonly loading = signal(true);
  protected readonly reviewTone = reviewTone;
  protected readonly reviewLabelKey = reviewLabelKey;
  protected readonly exporting = signal(false);
  protected readonly downloadOpen = signal(false);

  /** Access state for the sharing panel; null until loaded. */
  protected readonly access = signal<DocumentAccess | null>(null);
  protected readonly grants = signal<readonly AccessGrant[]>([]);

  /** Manage controls show for the owner or anyone with documents:approve. */
  protected readonly canManage = computed(() => {
    const doc = this.document();
    if (!doc) {
      return false;
    }
    if (doc.owner_user_id === this.auth.user()?.id) {
      return true;
    }
    return (this.selectedOrg.currentOrg()?.permissions ?? []).includes('documents:approve');
  });

  /** Periodic-review standing for the header badge. */
  protected readonly review = computed(() => {
    const doc = this.document();
    return doc ? reviewState(doc) : null;
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

  /** Edit access for the AI suggestion flow (matches the Edit gate). */
  protected readonly canEdit = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('documents:draft'),
  );

  private currentOrgId: string | null = null;

  constructor() {
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
      }
    });
  }

  protected toggleDownload(event: Event): void {
    event.stopPropagation();
    this.downloadOpen.update((open) => !open);
  }

  protected closeDownload(): void {
    if (this.downloadOpen()) {
      this.downloadOpen.set(false);
    }
  }

  protected download(format: ExportFormat): void {
    const orgId = this.orgId();
    const doc = this.document();
    if (!orgId || !doc || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.downloadOpen.set(false);
    this.api.export(orgId, doc.id, format).subscribe({
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
    const anchor = document.createElement('a');
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

  /** Re-fetch the document after a comment approval published a new revision. */
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
    this.loading.set(true);
    this.viewedRevision.set(null);
    this.access.set(null);
    this.api.get(orgId, id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.versionView.set(defaultVersionView(document));
        this.loading.set(false);
        this.loadAccess(orgId, id);
      },
      error: () => {
        this.document.set(null);
        this.loading.set(false);
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
