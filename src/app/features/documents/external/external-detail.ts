import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { WatchButton } from '../../../shared/activity/watch-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { RecordDetailLayout, RecordTab } from '../../../shared/kit/record-detail-layout';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../../shared/requirement-links/supports-requirements';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorKey } from '../data/document-control-errors';
import { ExternalDocument } from '../data/document-control.models';
import { externalStatusTone, textOrNull } from '../shared/document-control-display';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

/** Revision snapshot field -> label key, for the revisions tab. */
export const EXTERNAL_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'documents.control.fields.title',
  code: 'documents.control.external.fields.code',
  publisher: 'documents.control.external.fields.publisher',
  reference: 'documents.control.external.fields.reference',
  version: 'documents.control.external.fields.version',
  url: 'documents.control.external.fields.url',
  issued_on: 'documents.control.external.fields.issuedOn',
  status: 'documents.control.fields.status',
  document_type_id: 'documents.control.fields.type',
  owner_user_id: 'documents.control.fields.owner',
  review_interval_months: 'documents.control.fields.reviewInterval',
  next_review_at: 'documents.control.fields.nextReview',
  last_reviewed_at: 'documents.control.external.fields.lastReviewed',
  retention_rule_id: 'documents.control.fields.retentionRule',
  notes: 'documents.control.external.fields.notes',
};

/** Only http(s) links are rendered as links (never `javascript:` and the like). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/**
 * One external document: what it is, who publishes it, which version is in use,
 * and the periodic check that it is still the current edition ("Mark reviewed").
 */
@Component({
  selector: 'app-external-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    RecordDetailLayout,
    LocalDatePipe,
    LocalDayPipe,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FormField,
    Icon,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row(); as r) {
      <app-record-detail-layout
        entityType="external_document"
        [entityId]="r.id"
        [tabs]="tabs"
        [canEdit]="perms.canDraft()"
        [includeAudit]="perms.canReadAudit()"
        [fieldLabels]="fieldLabels"
        backLink="/documents/external"
        backLabelKey="documents.control.external.back"
      >
        <div header>
          <p class="mb-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-subtle">
            @if (r.code) {
              <span class="font-mono">{{ r.code }}</span>
            }
            @if (r.publisher) {
              <span>{{ r.publisher }}</span>
            }
            @if (r.reference) {
              <span class="font-mono">{{ r.reference }}</span>
            }
          </p>
          <h1
            class="flex items-start gap-1.5 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
          >
            {{ r.title }}
            <app-ask-about
              class="mt-1.5"
              [prompt]="'documents.control.external.askApplies' | transloco: { title: r.title }"
            />
          </h1>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <app-badge [tone]="tone()">{{
              'documents.control.external.status.' + r.status | transloco
            }}</app-badge>
            @if (r.review_overdue) {
              <app-badge tone="warn">{{
                'documents.control.external.reviewOverdue' | transloco
              }}</app-badge>
            }
          </div>
        </div>

        <ng-container actions>
          <app-watch-button entityType="external_document" [entityId]="r.id" />
          @if (perms.canDraft()) {
            <app-button size="sm" variant="secondary" (click)="reviewOpen.set(true)">
              <app-icon name="checkcircle" [size]="14" />
              {{ 'documents.control.external.markReviewed' | transloco }}
            </app-button>
            <app-button size="sm" (click)="edit()">
              {{ 'documents.control.common.edit' | transloco }}
            </app-button>
          }
          @if (perms.canManage()) {
            <app-button size="sm" variant="ghost" (click)="deleteOpen.set(true)">
              <app-icon name="trash" [size]="14" />
              <span class="sr-only sm:not-sr-only">{{
                'documents.control.common.delete' | transloco
              }}</span>
            </app-button>
          }
        </ng-container>

        <div class="flex flex-col gap-5">
          <app-documents-page-guide page="externalDetail" lesson="external-documents" />
          @if (errorKey(); as key) {
            <app-alert tone="error">{{ key | transloco }}</app-alert>
          }
          <app-card>
            <dl class="grid grid-cols-1 gap-3 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.external.fields.version' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.version || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.external.fields.issuedOn' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.issued_on ? (r.issued_on | localDay) : '—' }}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.external.fields.url' | transloco }}
                </dt>
                <dd class="break-all text-fg">
                  @if (safeUrl(); as href) {
                    <a
                      [href]="href"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-accent hover:underline"
                      >{{ href }}</a
                    >
                  } @else {
                    {{ r.url || '—' }}
                  }
                </dd>
              </div>
              @if (r.notes) {
                <div class="sm:col-span-2">
                  <dt class="text-[12px] font-semibold text-fg-muted">
                    {{ 'documents.control.external.fields.notes' | transloco }}
                  </dt>
                  <dd class="whitespace-pre-line text-fg">{{ r.notes }}</dd>
                </div>
              }
            </dl>
          </app-card>
        </div>

        <ng-container aside>
          <app-card>
            <dl class="flex flex-col gap-3 text-[13px]">
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.owner' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.owner?.name ?? ('documents.control.common.unassigned' | transloco) }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.type' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.document_type_name || '—' }}</dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.reviewInterval' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{
                    r.review_interval_months
                      ? ('documents.control.common.months'
                        | transloco: { count: r.review_interval_months })
                      : '—'
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.external.fields.lastReviewed' | transloco }}
                </dt>
                <dd class="text-fg">
                  {{ r.last_reviewed_at ? (r.last_reviewed_at | localDate: 'mediumDate') : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.nextReview' | transloco }}
                </dt>
                <dd [class.text-fail]="r.review_overdue" [class.font-semibold]="r.review_overdue">
                  {{ r.next_review_at ? (r.next_review_at | localDay) : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.retentionRule' | transloco }}
                </dt>
                <dd class="text-fg">
                  @if (r.retention_rule_id) {
                    <a
                      [routerLink]="['/documents/retention', r.retention_rule_id]"
                      class="hover:underline"
                      >{{ r.retention_rule_name }}</a
                    >
                  } @else {
                    —
                  }
                </dd>
              </div>
              <div>
                <dt class="text-[12px] font-semibold text-fg-muted">
                  {{ 'documents.control.fields.updatedAt' | transloco }}
                </dt>
                <dd class="text-fg">{{ r.updated_at | localDate: 'medium' }}</dd>
              </div>
            </dl>
          </app-card>
          @if (perms.canReadStandards()) {
            <app-card>
              <app-supports-requirements entityType="external_document" [entityId]="r.id" />
            </app-card>
          }
        </ng-container>
      </app-record-detail-layout>

      <app-confirm-dialog
        [open]="reviewOpen()"
        [title]="'documents.control.external.reviewTitle' | transloco"
        [message]="'documents.control.external.reviewMessage' | transloco"
        confirmVariant="primary"
        [confirmLabel]="'documents.control.external.markReviewed' | transloco"
        [cancelLabel]="'documents.control.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="markReviewed()"
        (cancelled)="reviewOpen.set(false)"
      >
        <div class="mt-3 flex flex-col gap-3">
          <app-form-field
            inputId="ext-review-next"
            [label]="'documents.control.external.nextReviewOptional' | transloco"
          >
            <input
              id="ext-review-next"
              type="date"
              [value]="reviewNext()"
              (input)="reviewNext.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            inputId="ext-review-note"
            [label]="'documents.control.external.reviewNote' | transloco"
          >
            <textarea
              id="ext-review-note"
              rows="2"
              maxlength="2000"
              [value]="reviewNote()"
              (input)="reviewNote.set($any($event.target).value)"
            ></textarea>
          </app-form-field>
        </div>
      </app-confirm-dialog>

      <app-confirm-dialog
        [open]="deleteOpen()"
        [title]="'documents.control.external.deleteTitle' | transloco"
        [message]="'documents.control.external.deleteMessage' | transloco: { title: r.title }"
        [confirmLabel]="'documents.control.common.delete' | transloco"
        [cancelLabel]="'documents.control.common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="deleteOpen.set(false)"
      />
    } @else if (state() === 'error') {
      <div class="mx-auto max-w-[1180px] px-4 pt-10 sm:px-8">
        <app-alert tone="error">{{ loadErrorKey() | transloco }}</app-alert>
        <a
          routerLink="/documents/external"
          class="mt-3 inline-block text-[13px] font-semibold text-accent hover:underline"
        >
          {{ 'documents.control.external.back' | transloco }}
        </a>
      </div>
    } @else {
      <p class="py-16 text-center text-[14px] text-fg-muted">
        {{ 'documents.control.common.loading' | transloco }}
      </p>
    }
  `,
})
export class ExternalDetailPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  protected readonly perms = inject(DocumentControlPermissions);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = EXTERNAL_FIELD_LABELS;

  protected readonly row = signal<ExternalDocument | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadErrorKey = signal('documents.control.common.loadFailed');
  protected readonly errorKey = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly reviewOpen = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly reviewNext = signal('');
  protected readonly reviewNote = signal('');
  private sub: Subscription | null = null;

  protected readonly tone = computed(() => externalStatusTone(this.row()?.status ?? 'current'));
  protected readonly safeUrl = computed(() => safeExternalUrl(this.row()?.url));

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'external_document',
      entityId: this.id(),
      view: 'detail',
      title: this.row()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(orgId: string | null, id: string): void {
    this.sub?.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.getExternal(orgId, id).subscribe({
      next: (row) => {
        this.row.set(row);
        this.state.set('ready');
      },
      error: (e: unknown) => {
        this.row.set(null);
        this.loadErrorKey.set(documentControlErrorKey(e));
        this.state.set('error');
      },
    });
  }

  protected edit(): void {
    void this.router.navigate(['/documents/external', this.id(), 'edit']);
  }

  protected markReviewed(): void {
    const orgId = this.perms.orgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);
    this.api
      .markExternalReviewed(orgId, this.id(), {
        next_review_at: this.reviewNext() || null,
        note: textOrNull(this.reviewNote()),
      })
      .subscribe({
        next: (row) => {
          this.busy.set(false);
          this.reviewOpen.set(false);
          this.reviewNext.set('');
          this.reviewNote.set('');
          this.row.set(row);
          this.toasts.success('documents.control.external.reviewedToast');
        },
        error: (e: unknown) => {
          this.busy.set(false);
          this.reviewOpen.set(false);
          this.errorKey.set(documentControlErrorKey(e));
        },
      });
  }

  protected remove(): void {
    const orgId = this.perms.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.deleteExternal(orgId, this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.toasts.success('documents.control.common.deletedToast');
        void this.router.navigateByUrl('/documents/external');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.errorKey.set(documentControlErrorKey(e));
      },
    });
  }
}
