import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentDetail } from '../../../core/documents/document.models';
import { Icon } from '../../../shared/ui/icon/icon';

/** Which version of a document the drafter is looking at. */
export type VersionView = 'approved' | 'draft';

/**
 * Makes draft vs approved unmistakable for drafters. When the document has a
 * working draft alongside an approved revision, shows a two-way switch
 * (Approved Rev B / Draft Rev C) and a note on what readers see; when nothing
 * is approved yet, says the draft isn't visible to readers. Also surfaces an
 * open "changes requested" comment, and the reason once a document is obsolete. Renders nothing for readers (who never get
 * a `draft_revision`).
 */
@Component({
  selector: 'app-document-version-banner',
  imports: [DatePipe, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (changeRequest(); as request) {
      <div role="status" class="mb-4 rounded-tile border border-warn/30 bg-warn-soft px-4 py-3">
        <div class="flex items-center gap-2 text-[13.5px] font-semibold text-warn">
          <app-icon name="history" [size]="15" />
          @if (request.by_name) {
            {{ 'documents.workflow.changesRequestedBy' | transloco: { name: request.by_name } }}
          } @else {
            {{ 'documents.workflow.changesRequested' | transloco }}
          }
          @if (request.at) {
            <span class="font-normal text-fg-subtle">{{ request.at | date: 'medium' }}</span>
          }
        </div>
        <p class="mt-1 text-[13.5px] whitespace-pre-line text-fg">{{ request.comment }}</p>
      </div>
    }

    @if (obsoleteReason(); as reason) {
      <div role="status" class="mb-4 rounded-tile border border-border bg-surface-2 px-4 py-3">
        <div class="text-[13.5px] font-semibold text-fg">
          {{ 'documents.workflow.obsoleteNotice' | transloco }}
        </div>
        <p class="mt-1 text-[13.5px] whitespace-pre-line text-fg-muted">{{ reason }}</p>
      </div>
    }

    @if (draft(); as draftRev) {
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-tile border px-4 py-3"
        [class]="view() === 'draft' ? 'border-info/30 bg-info-soft' : 'border-border bg-surface-2'"
      >
        <div class="min-w-0 text-[13.5px]">
          @if (approved(); as approvedRev) {
            @if (view() === 'draft') {
              <span class="font-semibold text-info">{{
                'documents.workflow.viewingDraft' | transloco: { rev: draftRev.rev }
              }}</span>
              <span class="text-fg-muted">
                {{ 'documents.workflow.readersSee' | transloco: { rev: approvedRev.rev } }}</span
              >
            } @else {
              <span class="font-semibold text-fg">{{
                'documents.workflow.viewingApproved' | transloco: { rev: approvedRev.rev }
              }}</span>
              <span class="text-fg-muted">
                {{ 'documents.workflow.draftPending' | transloco: { rev: draftRev.rev } }}</span
              >
            }
          } @else {
            <span class="font-semibold text-info">{{
              'documents.workflow.viewingDraft' | transloco: { rev: draftRev.rev }
            }}</span>
            <span class="text-fg-muted"> {{ 'documents.workflow.neverApproved' | transloco }}</span>
          }
          @if (view() === 'draft' && draftRev.change_reason) {
            <span class="mt-0.5 block text-[12.5px] text-fg-muted">{{
              'documents.workflow.changeReasonShown' | transloco: { reason: draftRev.change_reason }
            }}</span>
          }
        </div>

        @if (approved(); as approvedRev) {
          <div
            role="group"
            [attr.aria-label]="'documents.workflow.versionSwitch' | transloco"
            class="flex flex-none rounded-tile border border-border bg-surface p-0.5"
          >
            <button
              type="button"
              [attr.aria-pressed]="view() === 'approved'"
              [class]="segmentClass(view() === 'approved')"
              (click)="viewChange.emit('approved')"
            >
              {{ 'documents.workflow.approvedRev' | transloco: { rev: approvedRev.rev } }}
            </button>
            <button
              type="button"
              [attr.aria-pressed]="view() === 'draft'"
              [class]="segmentClass(view() === 'draft')"
              (click)="viewChange.emit('draft')"
            >
              {{ 'documents.workflow.draftRev' | transloco: { rev: draftRev.rev } }}
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class DocumentVersionBanner {
  readonly document = input.required<DocumentDetail>();
  readonly view = input<VersionView>('approved');

  readonly viewChange = output<VersionView>();

  /** The working draft, when it differs from the approved revision. */
  protected readonly draft = computed(() => {
    const doc = this.document();
    const draft = doc.draft_revision ?? null;
    return draft && draft.id !== doc.current_revision?.id ? draft : null;
  });

  protected readonly approved = computed(() => this.document().current_revision);

  /** Why the document was withdrawn, once obsolete. */
  protected readonly obsoleteReason = computed(() => {
    const doc = this.document();
    return doc.status === 'obsolete' ? (doc.obsolete_reason ?? null) : null;
  });

  /** The open change request, shown while the document is back in draft. */
  protected readonly changeRequest = computed(() => {
    const doc = this.document();
    return doc.status === 'draft' ? (doc.pending_change_request ?? null) : null;
  });

  protected segmentClass(active: boolean): string {
    const base = 'rounded-[7px] px-2.5 py-1 text-[12.5px] font-semibold transition-colors';
    return active ? `${base} bg-accent text-white` : `${base} text-fg-muted hover:text-fg`;
  }
}

/** The revision a drafter should land on: the draft while one is pending, else approved. */
export function defaultVersionView(doc: DocumentDetail): VersionView {
  const draft = doc.draft_revision;
  return draft && draft.id !== doc.current_revision?.id ? 'draft' : 'approved';
}
