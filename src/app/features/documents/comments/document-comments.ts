import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import {
  ChangeDetectionStrategy,
  Component,
  SecurityContext,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Editor } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { AuthService } from '../../../core/auth/auth.service';
import { Comment, DocumentDetail, DocumentRevision } from '../../../core/documents/document.models';
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge, BadgeTone } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { anchorFromSelection, findAnchorRange, resolveOffset } from '../comment-anchor';

const STATUS_TONE: Record<Comment['status'], BadgeTone> = {
  open: 'warn',
  accepted: 'accent',
  resolved: 'pass',
  rejected: 'neutral',
};

const STATUS_LABEL_KEY: Record<Comment['status'], string> = {
  open: 'documents.comments.statusOpen',
  accepted: 'documents.comments.statusAccepted',
  resolved: 'documents.comments.statusResolved',
  rejected: 'documents.comments.statusRejected',
};

/** Editing state for a comment's AI suggestion in the editor flow. */
interface SuggestState {
  loading: boolean;
  editing: boolean;
  /** Local draft of the suggestion HTML while editing. */
  draft: string;
  applying: boolean;
}

/**
 * Anchored comments for the document read view: a floating "Add comment" action
 * over a text selection inside the rendered `.cf-doc`, a sidebar listing the
 * viewed revision's comments (with inline highlights), and — for editors
 * (`documents:draft`) — a per-comment AI change proposal that can be edited,
 * approved (applied as a NEW revision via headless TipTap), or rejected.
 *
 * The host (`document-detail`) owns the `.cf-doc` element and passes it in via
 * {@link docElement}; this component reads selections from it and writes the
 * highlight `<mark>`s into it. Reviewing is staged: approving a comment marks it
 * `accepted` (no revision yet); a single "Save N changes as new revision" action
 * then re-renders the current revision HTML in an unmounted TipTap `Editor`,
 * replaces every accepted comment's anchored range, posts ONE new revision, and
 * resolves those comments — never touching the live DOM the user is reading.
 */
@Component({
  selector: 'app-document-comments',
  imports: [LocalDatePipe, FormsModule, TranslocoPipe, Card, Badge, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:selectionchange)': 'onSelectionChange()' },
  template: `
    @if (composer(); as pos) {
      <div
        class="fixed z-[45] -translate-x-1/2"
        [style.top.px]="pos.top"
        [style.left.px]="pos.left"
      >
        @if (composing()) {
          <div
            class="animate-cf-pop flex w-[300px] flex-col gap-2 rounded-tile border border-border bg-surface p-2.5 shadow-pop"
          >
            <textarea
              #composerInput
              [(ngModel)]="draftBody"
              rows="3"
              [placeholder]="'documents.comments.placeholder' | transloco"
              [attr.aria-label]="'documents.comments.add' | transloco"
              class="w-full resize-none rounded-[8px] border border-border bg-bg px-2.5 py-2 text-[13px] text-fg outline-none focus:border-accent"
            ></textarea>
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="h-8 rounded-[8px] px-3 text-[13px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg"
                (click)="cancelCompose()"
              >
                {{ 'documents.cancel' | transloco }}
              </button>
              <button
                type="button"
                [disabled]="!draftBody().trim() || saving()"
                class="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-2 disabled:opacity-60"
                (click)="saveComment()"
              >
                @if (saving()) {
                  <span class="animate-cf-pulse inline-flex"
                    ><app-icon name="spark" [size]="14"
                  /></span>
                }
                {{ 'documents.comments.save' | transloco }}
              </button>
            </div>
          </div>
        } @else {
          <button
            type="button"
            class="animate-cf-pop inline-flex items-center gap-1.5 rounded-tile border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg shadow-pop hover:bg-surface-2"
            (click)="openComposer()"
          >
            <app-icon name="comment" [size]="15" />
            {{ 'documents.comments.add' | transloco }}
          </button>
        }
      </div>
    }

    <app-card [padded]="false">
      <div class="flex items-start justify-between gap-2 px-4 pt-3.5 pb-1">
        <h2 class="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
          {{ 'documents.comments.title' | transloco }}
        </h2>
        @if (canEdit() && acceptedCount() > 0) {
          <app-button size="sm" [loading]="savingRevision()" (click)="saveRevision()">
            <app-icon name="check" [size]="14" />
            {{ 'documents.comments.saveRevision' | transloco: { count: acceptedCount() } }}
          </app-button>
        }
      </div>
      @if (loading()) {
        <p class="px-4 py-6 text-center text-[13.5px] text-fg-muted">
          {{ 'common.loading' | transloco }}
        </p>
      } @else if (comments().length === 0) {
        <p class="px-4 py-6 text-center text-[13.5px] text-fg-muted">
          {{ 'documents.comments.empty' | transloco }}
        </p>
      } @else {
        <ul class="flex flex-col gap-2 px-2 py-2">
          @for (comment of comments(); track comment.id) {
            <li
              [class.ring-1]="activeId() === comment.id"
              [class.ring-accent]="activeId() === comment.id"
              class="rounded-tile border border-border bg-surface-2/40 px-3 py-2.5"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[13px] font-semibold text-fg">{{
                  comment.author_name
                }}</span>
                <app-badge [tone]="statusTone(comment.status)">{{
                  statusLabelKey(comment.status) | transloco
                }}</app-badge>
              </div>

              <button
                type="button"
                (click)="focusAnchor(comment)"
                class="mt-1.5 block w-full border-l-2 border-warn/60 bg-warn-soft/40 px-2 py-1 text-left text-[12px] text-fg-muted italic hover:border-accent"
              >
                &ldquo;{{ comment.anchor_quote }}&rdquo;
              </button>

              <p class="mt-1.5 text-[13px] whitespace-pre-wrap text-fg">{{ comment.body }}</p>
              <div class="mt-1 text-[11.5px] text-fg-subtle">
                {{ comment.created_at | localDate: 'medium' }}
              </div>

              @if (canEdit() && (comment.status === 'open' || comment.status === 'accepted')) {
                @let state = suggestState(comment.id);
                <div class="mt-2.5 border-t border-border pt-2.5">
                  @if (comment.suggestion_html) {
                    <div class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
                      {{ 'documents.comments.suggestion' | transloco }}
                    </div>
                    @if (state.editing) {
                      <textarea
                        [ngModel]="state.draft"
                        (ngModelChange)="setDraft(comment.id, $event)"
                        rows="4"
                        [attr.aria-label]="'documents.comments.suggestion' | transloco"
                        class="mt-1.5 w-full resize-y rounded-[8px] border border-border bg-bg px-2.5 py-2 font-mono text-[12px] text-fg outline-none focus:border-accent"
                      ></textarea>
                    } @else {
                      <div
                        class="cf-doc mt-1.5 !max-w-none !rounded-[8px] !border !border-border !bg-surface !p-2.5 !text-[13px] !shadow-none"
                        [innerHTML]="preview(comment.suggestion_html)"
                      ></div>
                    }
                    @if (comment.suggestion_rationale) {
                      <p class="mt-1.5 text-[12px] text-fg-muted">
                        {{ comment.suggestion_rationale }}
                      </p>
                    }

                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      @if (state.editing) {
                        <app-button
                          size="sm"
                          [loading]="state.applying"
                          (click)="saveDraft(comment)"
                        >
                          {{ 'documents.comments.save' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="secondary" (click)="cancelEdit(comment.id)">
                          {{ 'documents.cancel' | transloco }}
                        </app-button>
                      } @else if (comment.status === 'accepted') {
                        <app-button
                          size="sm"
                          variant="secondary"
                          [loading]="state.applying"
                          (click)="reopen(comment)"
                        >
                          {{ 'documents.comments.undo' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="secondary" (click)="startEdit(comment)">
                          {{ 'documents.comments.edit' | transloco }}
                        </app-button>
                      } @else {
                        <app-button size="sm" [loading]="state.applying" (click)="approve(comment)">
                          <app-icon name="check" [size]="14" />
                          {{ 'documents.comments.approve' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="secondary" (click)="startEdit(comment)">
                          {{ 'documents.comments.edit' | transloco }}
                        </app-button>
                        <app-button size="sm" variant="ghost" (click)="reject(comment)">
                          {{ 'documents.comments.reject' | transloco }}
                        </app-button>
                      }
                    </div>
                  } @else {
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="state.loading"
                      (click)="suggest(comment)"
                    >
                      <app-icon name="spark" [size]="14" />
                      {{ 'documents.comments.suggest' | transloco }}
                    </app-button>
                  }
                </div>
              } @else if (canEdit() && comment.status === 'rejected') {
                <div class="mt-2.5 border-t border-border pt-2.5">
                  <app-button
                    size="sm"
                    variant="secondary"
                    [loading]="suggestState(comment.id).applying"
                    (click)="reopen(comment)"
                  >
                    {{ 'documents.comments.undo' | transloco }}
                  </app-button>
                </div>
              }

              @if (canDelete(comment)) {
                <div class="mt-2 flex justify-end">
                  <button
                    type="button"
                    class="text-[12px] font-semibold text-fg-subtle hover:text-fail"
                    (click)="remove(comment)"
                  >
                    {{ 'documents.comments.delete' | transloco }}
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class DocumentComments {
  private readonly api = inject(DocumentsApi);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);

  /** The rendered `.cf-doc` element to read selections from and highlight. */
  readonly docElement = input<HTMLElement | null>(null);
  readonly documentId = input.required<string>();
  /** Revision whose comments are shown and whose HTML an approval is applied to. */
  readonly revisionId = input.required<string>();
  readonly revisionHtml = input<string>('');
  /** Whether the viewer holds edit access (`documents:draft`) for suggestions. */
  readonly canEdit = input(false);

  /** Emitted after an approval applies a new revision, so the host can reload. */
  readonly revisionApplied = output<void>();

  protected readonly statusTone = (status: Comment['status']): BadgeTone => STATUS_TONE[status];
  protected readonly statusLabelKey = (status: Comment['status']): string =>
    STATUS_LABEL_KEY[status];

  protected readonly comments = signal<readonly Comment[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingRevision = signal(false);
  protected readonly activeId = signal<string | null>(null);

  /** Accepted comments awaiting commit into a single new revision. */
  protected readonly acceptedCount = computed(
    () => this.comments().filter((c) => c.status === 'accepted').length,
  );

  /** Floating-composer anchor position (viewport-fixed), null when hidden. */
  protected readonly composer = signal<{ top: number; left: number } | null>(null);
  protected readonly composing = signal(false);
  protected readonly draftBody = signal('');

  /** Per-comment suggestion UI state, keyed by comment id. */
  private readonly suggestStates = signal<Record<string, SuggestState>>({});

  /** The anchor captured when the composer opened (selection is lost on click). */
  private pendingAnchor: { quote: string; prefix: string; start: number; end: number } | null =
    null;

  /** Comment ids we've already auto-requested a suggestion for (fire once). */
  private readonly autoSuggested = new Set<string>();

  constructor() {
    // Reload comments whenever the org, document, or viewed revision changes.
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const documentId = this.documentId();
      const revisionId = this.revisionId();
      if (!orgId || !documentId || !revisionId) {
        this.comments.set([]);
        return;
      }
      this.fetch(orgId, documentId, revisionId);
    });

    // Re-paint inline highlights when the comment set or rendered body changes.
    effect(() => {
      this.comments();
      this.revisionHtml();
      this.activeId();
      queueMicrotask(() => this.paintHighlights());
    });

    // Editors get an AI suggestion automatically for each open comment that
    // doesn't have one yet. Fires once per comment (manual retry stays available
    // via the button if generation fails). Deferred so it never writes signals
    // during the effect's synchronous run.
    effect(() => {
      if (!this.canEdit()) {
        return;
      }
      const pending = this.comments().filter(
        (c) => c.status === 'open' && !c.suggestion_html && !this.autoSuggested.has(c.id),
      );
      if (pending.length === 0) {
        return;
      }
      for (const c of pending) {
        this.autoSuggested.add(c.id);
      }
      queueMicrotask(() => {
        for (const c of pending) {
          this.suggest(c);
        }
      });
    });
  }

  protected suggestState(id: string): SuggestState {
    return (
      this.suggestStates()[id] ?? { loading: false, editing: false, draft: '', applying: false }
    );
  }

  private patchState(id: string, patch: Partial<SuggestState>): void {
    this.suggestStates.update((states) => ({
      ...states,
      [id]: { ...this.suggestState(id), ...patch },
    }));
  }

  protected canDelete(comment: Comment): boolean {
    if (comment.author_user_id === this.auth.user()?.id) {
      return true;
    }
    return (this.selectedOrg.currentOrg()?.permissions ?? []).includes('documents:approve');
  }

  protected preview(html: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }

  // --- Selection-driven composer -------------------------------------------

  protected onSelectionChange(): void {
    if (this.composing()) {
      return;
    }
    const root = this.docElement();
    if (!root) {
      this.composer.set(null);
      return;
    }
    const anchor = anchorFromSelection(root, document.getSelection());
    if (!anchor) {
      this.composer.set(null);
      this.pendingAnchor = null;
      return;
    }
    const range = document.getSelection()!.getRangeAt(0).getBoundingClientRect();
    this.pendingAnchor = anchor;
    this.composer.set({ top: Math.max(8, range.top - 44), left: range.left + range.width / 2 });
  }

  protected openComposer(): void {
    this.composing.set(true);
    this.draftBody.set('');
  }

  protected cancelCompose(): void {
    this.composing.set(false);
    this.composer.set(null);
    this.pendingAnchor = null;
    this.draftBody.set('');
  }

  protected saveComment(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const anchor = this.pendingAnchor;
    const body = this.draftBody().trim();
    if (!orgId || !anchor || !body || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .createComment(orgId, this.documentId(), {
        revision_id: this.revisionId(),
        anchor_quote: anchor.quote,
        anchor_prefix: anchor.prefix,
        anchor_start: anchor.start,
        anchor_end: anchor.end,
        body,
      })
      .subscribe({
        next: (comment) => {
          this.saving.set(false);
          this.cancelCompose();
          this.comments.update((list) => [...list, comment]);
          document.getSelection()?.removeAllRanges();
        },
        error: () => this.saving.set(false),
      });
  }

  // --- Anchor highlighting --------------------------------------------------

  protected focusAnchor(comment: Comment): void {
    this.activeId.set(comment.id);
    const root = this.docElement();
    if (!root) {
      return;
    }
    const mark = root.querySelector<HTMLElement>(`[data-comment-id="${comment.id}"]`);
    mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Wrap each open comment's anchored text in a highlight span. Rebuilds from a
   * clean copy of the revision HTML so re-paints don't nest marks; comments whose
   * anchor can't be re-found simply stay un-highlighted (still listed).
   */
  private paintHighlights(): void {
    const root = this.docElement();
    if (!root) {
      return;
    }
    for (const stale of root.querySelectorAll('.cf-comment-mark')) {
      const parent = stale.parentNode;
      if (!parent) {
        continue;
      }
      while (stale.firstChild) {
        parent.insertBefore(stale.firstChild, stale);
      }
      parent.removeChild(stale);
    }
    // Re-join the text nodes split by the removed marks so offsets are contiguous.
    root.normalize();

    const active = this.activeId();
    for (const comment of this.comments()) {
      if (comment.status !== 'open') {
        continue;
      }
      const range = findAnchorRange(root, comment);
      if (!range) {
        continue;
      }
      const mark = document.createElement('span');
      mark.className = 'cf-comment-mark';
      mark.dataset['commentId'] = comment.id;
      if (comment.id === active) {
        mark.classList.add('cf-comment-mark--active');
      }
      mark.addEventListener('click', () => this.focusAnchor(comment));
      try {
        range.surroundContents(mark);
      } catch {
        // The range straddles element boundaries; skip the inline highlight.
      }
    }
  }

  // --- AI suggestion flow ---------------------------------------------------

  protected suggest(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.suggestState(comment.id).loading) {
      return;
    }
    this.patchState(comment.id, { loading: true });
    this.api.suggestComment(orgId, this.documentId(), comment.id).subscribe({
      next: (updated) => {
        this.patchState(comment.id, { loading: false });
        this.replaceComment(updated);
      },
      error: () => this.patchState(comment.id, { loading: false }),
    });
  }

  protected startEdit(comment: Comment): void {
    this.patchState(comment.id, { editing: true, draft: comment.suggestion_html ?? '' });
  }

  protected setDraft(id: string, draft: string): void {
    this.patchState(id, { draft });
  }

  protected cancelEdit(id: string): void {
    this.patchState(id, { editing: false });
  }

  protected saveDraft(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    const draft = this.suggestState(comment.id).draft.trim();
    if (!orgId || !draft) {
      return;
    }
    this.patchState(comment.id, { applying: true });
    this.api
      .updateComment(orgId, this.documentId(), comment.id, { suggestion_html: draft })
      .subscribe({
        next: (updated) => {
          this.patchState(comment.id, { applying: false, editing: false });
          this.replaceComment(updated);
        },
        error: () => this.patchState(comment.id, { applying: false }),
      });
  }

  protected reject(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.rejectComment(orgId, this.documentId(), comment.id).subscribe({
      next: (updated) => this.replaceComment(updated),
    });
  }

  protected remove(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api.deleteComment(orgId, this.documentId(), comment.id).subscribe({
      next: () => this.comments.update((list) => list.filter((c) => c.id !== comment.id)),
    });
  }

  /**
   * Stage a comment for the next revision: mark it `accepted` without creating a
   * revision or resolving it. The edited suggestion (if any) is persisted first so
   * the staged state carries the reviewer's edits into {@link saveRevision}.
   */
  protected approve(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.suggestState(comment.id).applying) {
      return;
    }
    const draft = this.suggestState(comment.id).draft.trim();
    const persistEdit =
      draft && draft !== (comment.suggestion_html ?? '').trim()
        ? this.api.updateComment(orgId, this.documentId(), comment.id, { suggestion_html: draft })
        : null;

    this.patchState(comment.id, { applying: true });
    const accept = () =>
      this.api.acceptComment(orgId, this.documentId(), comment.id).subscribe({
        next: (accepted) => {
          this.patchState(comment.id, { applying: false, editing: false });
          this.replaceComment(accepted);
        },
        error: () => this.patchState(comment.id, { applying: false }),
      });

    if (persistEdit) {
      persistEdit.subscribe({
        next: (updated) => {
          this.replaceComment(updated);
          accept();
        },
        error: () => this.patchState(comment.id, { applying: false }),
      });
    } else {
      accept();
    }
  }

  /** Move an accepted or rejected comment back to open. */
  protected reopen(comment: Comment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.suggestState(comment.id).applying) {
      return;
    }
    this.patchState(comment.id, { applying: true });
    this.api.reopenComment(orgId, this.documentId(), comment.id).subscribe({
      next: (updated) => {
        this.patchState(comment.id, { applying: false });
        this.replaceComment(updated);
      },
      error: () => this.patchState(comment.id, { applying: false }),
    });
  }

  /**
   * Commit all `accepted` comments into ONE new revision: render the current
   * revision HTML into a single unmounted TipTap editor, replace each accepted
   * comment's anchored text with its suggestion in DESCENDING anchor-offset order
   * (so earlier offsets stay valid while later edits are applied), persist one new
   * revision, then resolve every successfully-applied comment against it. Comments
   * whose anchor can no longer be found are skipped and reported.
   */
  protected saveRevision(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.savingRevision()) {
      return;
    }
    const accepted = this.comments().filter(
      (c): c is Comment & { suggestion_html: string } =>
        c.status === 'accepted' && !!c.suggestion_html,
    );
    if (accepted.length === 0) {
      return;
    }

    const sourceText = this.revisionText(this.revisionHtml());
    const resolvable = accepted
      .map((c) => ({ comment: c, offset: resolveOffset(sourceText, c) }))
      .filter((x): x is { comment: typeof x.comment; offset: number } => x.offset !== null);

    if (resolvable.length === 0) {
      this.notifications.warning('documents.comments.anchorNotFoundToast');
      return;
    }

    // Apply later edits first so replacing a span never shifts an earlier offset.
    const ordered = [...resolvable].sort((a, b) => b.offset - a.offset);
    const finalHtml = this.applySuggestions(this.revisionHtml(), ordered);
    if (finalHtml === null) {
      this.notifications.warning('documents.comments.anchorNotFoundToast');
      return;
    }

    const skipped = accepted.length - resolvable.length;
    const appliedIds = resolvable.map((x) => x.comment.id);

    this.savingRevision.set(true);
    // The backend requires a change reason once an approved revision exists.
    const reason = this.transloco.translate('documents.comments.changeReason', {
      count: appliedIds.length,
    });
    this.api.addRevision(orgId, this.documentId(), finalHtml, reason).subscribe({
      next: (response) => {
        const revision = savedRevision(response);
        if (!revision) {
          this.finishSave(appliedIds.length, '', skipped);
          return;
        }
        let pending = appliedIds.length;
        for (const id of appliedIds) {
          this.api.resolveComment(orgId, this.documentId(), id, revision.id).subscribe({
            next: (resolved) => {
              this.replaceComment(resolved);
              if (--pending === 0) {
                this.finishSave(appliedIds.length, revision.rev, skipped);
              }
            },
            error: () => {
              if (--pending === 0) {
                this.finishSave(appliedIds.length, revision.rev, skipped);
              }
            },
          });
        }
      },
      error: (error: unknown) => {
        this.savingRevision.set(false);
        this.notifications.error(documentErrorKey(error, 'saveRevision'));
      },
    });
  }

  private finishSave(count: number, rev: string | number, skipped: number): void {
    this.savingRevision.set(false);
    this.notifications.success('documents.comments.savedToast', { count, rev });
    if (skipped > 0) {
      this.notifications.warning('documents.comments.skippedToast', { count: skipped });
    }
    this.revisionApplied.emit();
  }

  /** The plain-text content of a revision body, for offset resolution. */
  private revisionText(html: string): string {
    const probe = document.createElement('div');
    probe.innerHTML = html;
    return probe.textContent ?? '';
  }

  /**
   * Build the new revision HTML by replacing each comment's anchored text with its
   * suggestion HTML, using a single headless (unmounted) TipTap editor so the
   * result matches the editor's schema/serialization. `targets` must be ordered by
   * DESCENDING offset. Returns null if any target's range can't be mapped.
   */
  private applySuggestions(
    sourceHtml: string,
    targets: readonly { comment: Comment & { suggestion_html: string }; offset: number }[],
  ): string | null {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ link: false, underline: false }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TableKit.configure({ table: { resizable: true } }),
      ],
      content: sourceHtml,
    });
    try {
      for (const { comment, offset } of targets) {
        const positions = this.docPositions(editor, offset, offset + comment.anchor_quote.length);
        if (!positions) {
          return null;
        }
        const safe = this.sanitizer.sanitize(SecurityContext.HTML, comment.suggestion_html) ?? '';
        editor
          .chain()
          .setTextSelection({ from: positions.from, to: positions.to })
          .deleteSelection()
          .insertContent(safe)
          .run();
      }
      return editor.getHTML();
    } finally {
      editor.destroy();
    }
  }

  /**
   * Map plain-text offsets [from, to) onto ProseMirror document positions by
   * walking the doc's text content. ProseMirror positions include node
   * boundaries, so we accumulate text length per text node and add 1 per
   * non-text leaf/open as we descend.
   */
  private docPositions(
    editor: Editor,
    from: number,
    to: number,
  ): { from: number; to: number } | null {
    let pmFrom: number | null = null;
    let pmTo: number | null = null;
    let textCount = 0;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) {
        return true;
      }
      const length = node.text?.length ?? 0;
      if (pmFrom === null && textCount + length >= from) {
        pmFrom = pos + (from - textCount);
      }
      if (pmTo === null && textCount + length >= to) {
        pmTo = pos + (to - textCount);
      }
      textCount += length;
      return true;
    });
    return pmFrom !== null && pmTo !== null ? { from: pmFrom, to: pmTo } : null;
  }

  // --- Data plumbing --------------------------------------------------------

  private fetch(orgId: string, documentId: string, revisionId: string): void {
    this.loading.set(true);
    this.activeId.set(null);
    this.api.listComments(orgId, documentId, { revisionId }).subscribe({
      next: (comments) => {
        this.comments.set(comments);
        this.loading.set(false);
      },
      error: () => {
        this.comments.set([]);
        this.loading.set(false);
      },
    });
  }

  private replaceComment(updated: Comment): void {
    this.comments.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
  }
}

/**
 * The revision a save created. The endpoint answers with the updated document
 * (the new revision is its draft); older backends answered with the revision.
 */
function savedRevision(response: DocumentDetail | DocumentRevision): DocumentRevision | null {
  if ('revisions' in response) {
    return response.draft_revision ?? response.current_revision ?? null;
  }
  return response;
}
