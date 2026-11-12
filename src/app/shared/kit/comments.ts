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
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { AiAvailability } from '../../core/ai/ai-availability';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { CommentItem, MentionCandidate } from '../../core/kit/kit.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { LocalDatePipe } from '../locale/locale-pipes';
import { RelativeTimePipe } from '../relative-time/relative-time';
import { Alert } from '../ui/alert/alert';
import { Avatar } from '../ui/avatar/avatar';
import { Button } from '../ui/button/button';
import { ConfirmDialog } from '../ui/confirm-dialog/confirm-dialog';
import { Icon } from '../ui/icon/icon';
import { CommentComposer, CommentDraft } from './comment-composer';
import { provideKitScope } from './kit-scope';
import { BodySegment, bodySegments } from './mentions';

/** A thread: a top-level comment and every reply under it, oldest first. */
export interface CommentThread {
  readonly root: CommentItem;
  readonly replies: readonly CommentItem[];
}

/**
 * Group comments into threads. Replies attach to the top of their chain;
 * replies whose parent is gone (deleted) start a thread of their own.
 */
export function buildThreads(comments: readonly CommentItem[]): CommentThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (comment: CommentItem): CommentItem => {
    let current = comment;
    const seen = new Set<string>();
    while (current.parent_id && !seen.has(current.id)) {
      const parent = byId.get(current.parent_id);
      if (!parent) {
        break;
      }
      seen.add(current.id);
      current = parent;
    }
    return current;
  };
  const threads = new Map<string, { root: CommentItem; replies: CommentItem[] }>();
  for (const comment of comments) {
    const root = rootOf(comment);
    const thread = threads.get(root.id) ?? { root, replies: [] };
    if (root.id !== comment.id) {
      thread.replies.push(comment);
    }
    threads.set(root.id, thread);
  }
  return [...threads.values()];
}

/**
 * Discussion on any record (F8 comments): threads with one level of replies,
 * `@mentions` (the mentioned people are notified), inline editing by the
 * author and deletion by the author or a record editor. `canComment = false`
 * makes it read-only. Oldest first, like a conversation.
 */
@Component({
  selector: 'app-comments',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    LocalDatePipe,
    RelativeTimePipe,
    Alert,
    Avatar,
    Button,
    ConfirmDialog,
    Icon,
    CommentComposer,
  ],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId" data-tour="kit-comments">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 [id]="headingId" class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
          {{ 'kit.comments.title' | transloco }}
          @if (comments().length > 0) {
            <span class="ml-1 text-[13px] font-semibold text-fg-subtle">{{
              comments().length
            }}</span>
          }
        </h2>
        @if (aiAvailable() && comments().length > 0) {
          <app-button size="sm" variant="ghost" (click)="summarise()">
            <app-icon name="spark" [size]="14" />
            {{ 'kit.comments.summarise' | transloco }}
          </app-button>
        }
      </div>

      @if (actionErrorKey(); as key) {
        <div class="mb-3">
          <app-alert tone="error">{{ key | transloco }}</app-alert>
        </div>
      }

      @if (loading()) {
        <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (loadErrorKey(); as key) {
        <p class="text-[13px] text-fg-muted">{{ key | transloco }}</p>
      } @else {
        @if (threads().length === 0) {
          <div
            class="mb-4 rounded-[10px] border border-dashed border-border px-4 py-5"
            data-testid="comments-empty"
          >
            <p class="text-[13.5px] font-semibold text-fg">
              {{ 'kit.comments.empty' | transloco }}
            </p>
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'kit.comments.emptyHint' | transloco }}
            </p>
          </div>
        }
        <ol class="flex flex-col gap-4">
          @for (thread of threads(); track thread.root.id) {
            <li class="rounded-[10px] border border-border p-3" data-testid="comment-thread">
              <ng-container
                *ngTemplateOutlet="commentTpl; context: { $implicit: thread.root, root: true }"
              />
              @if (thread.replies.length > 0) {
                <ol class="mt-3 flex flex-col gap-3 border-l-2 border-border pl-3 sm:ml-9">
                  @for (reply of thread.replies; track reply.id) {
                    <li>
                      <ng-container
                        *ngTemplateOutlet="commentTpl; context: { $implicit: reply, root: false }"
                      />
                    </li>
                  }
                </ol>
              }
              @if (replyTo() === thread.root.id) {
                <div class="mt-3 sm:ml-9">
                  <app-comment-composer
                    [candidates]="candidates()"
                    labelKey="kit.comments.replyLabel"
                    submitKey="kit.comments.reply"
                    [busy]="posting()"
                    [showCancel]="true"
                    [rows]="2"
                    [autofocus]="true"
                    (submitted)="post($event, thread.root.id)"
                    (cancelled)="replyTo.set(null)"
                  />
                </div>
              }
            </li>
          }
        </ol>

        @if (canComment()) {
          <div class="mt-4">
            <app-comment-composer
              #composer
              [candidates]="candidates()"
              [busy]="posting() && replyTo() === null"
              (submitted)="post($event, null)"
            />
          </div>
        } @else {
          <p class="mt-3 text-[12.5px] text-fg-subtle">{{ 'kit.comments.readOnly' | transloco }}</p>
        }
      }
    </section>

    <ng-template #commentTpl let-comment let-root="root">
      <article class="flex gap-2.5" [attr.aria-label]="authorName(comment)" data-testid="comment">
        <app-avatar [name]="authorName(comment)" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="text-[13px] font-semibold text-fg">{{ authorName(comment) }}</span>
            <time
              class="text-[11.5px] text-fg-subtle"
              [attr.datetime]="comment.created_at"
              [title]="comment.created_at | localDate: 'medium'"
              >{{ comment.created_at | relativeTime: lang() : now() }}</time
            >
            @if (comment.edited_at) {
              <span class="text-[11.5px] text-fg-subtle"
                >· {{ 'kit.comments.edited' | transloco }}</span
              >
            }
          </div>

          @if (editingId() === comment.id) {
            <div class="mt-1.5">
              <app-comment-composer
                [candidates]="candidates()"
                labelKey="kit.comments.editLabel"
                submitKey="kit.comments.save"
                [initialBody]="comment.body"
                [initialMentions]="mentionCandidatesOf(comment)"
                [busy]="saving()"
                [showCancel]="true"
                [autofocus]="true"
                (submitted)="saveEdit(comment, $event)"
                (cancelled)="editingId.set(null)"
              />
            </div>
          } @else {
            <p class="mt-0.5 text-[13.5px] break-words whitespace-pre-wrap text-fg">
              @for (part of segments(comment); track $index) {
                @if (part.mention) {
                  <span class="rounded-[4px] bg-accent-soft px-0.5 font-semibold text-accent">{{
                    part.text
                  }}</span>
                } @else {
                  {{ part.text }}
                }
              }
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-3">
              @if (root && canComment()) {
                <button
                  type="button"
                  class="text-[12px] font-semibold text-fg-muted hover:text-accent"
                  [attr.aria-label]="
                    'kit.comments.replyTo' | transloco: { name: authorName(comment) }
                  "
                  (click)="startReply(comment)"
                >
                  {{ 'kit.comments.reply' | transloco }}
                </button>
              }
              @if (comment.can_edit) {
                <button
                  type="button"
                  class="text-[12px] font-semibold text-fg-muted hover:text-accent"
                  (click)="editingId.set(comment.id)"
                >
                  {{ 'kit.comments.edit' | transloco }}
                </button>
              }
              @if (comment.can_delete) {
                <button
                  type="button"
                  class="text-[12px] font-semibold text-fg-muted hover:text-fail"
                  (click)="confirmDelete.set(comment)"
                >
                  {{ 'kit.comments.delete' | transloco }}
                </button>
              }
            </div>
          }
        </div>
      </article>
    </ng-template>

    <app-confirm-dialog
      [open]="confirmDelete() !== null"
      [title]="'kit.comments.deleteTitle' | transloco"
      [message]="'kit.comments.deleteMessage' | transloco"
      [confirmLabel]="'kit.comments.deleteConfirm' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="deletingId() !== null"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(null)"
    />
  `,
})
export class Comments {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);
  private readonly ai = inject(AiAvailability);
  private readonly ask = inject(AskPanelService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Whether the user may add comments and replies (read access is enough server-side). */
  readonly canComment = input(true);

  private readonly composer = viewChild<CommentComposer>('composer');

  protected readonly headingId = `cf-comments-${Math.random().toString(36).slice(2, 9)}`;
  protected readonly comments = signal<readonly CommentItem[]>([]);
  protected readonly candidates = signal<readonly MentionCandidate[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly actionErrorKey = signal<string | null>(null);
  protected readonly posting = signal(false);
  protected readonly saving = signal(false);
  protected readonly replyTo = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly confirmDelete = signal<CommentItem | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  protected readonly lang = this.language.active;
  protected readonly threads = computed(() => buildThreads(this.comments()));
  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  private loadSub: Subscription | null = null;
  private candidatesOrg: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (this.canComment() && orgId) {
        untracked(() => this.loadCandidates(orgId));
      }
    });
    inject(DestroyRef).onDestroy(() => this.loadSub?.unsubscribe());
  }

  protected authorName(comment: CommentItem): string {
    return comment.author?.name || this.language.translate('kit.comments.unknownAuthor');
  }

  protected segments(comment: CommentItem): BodySegment[] {
    return bodySegments(
      comment.body,
      comment.mentions.map((m) => m.name ?? '').filter((n) => n),
    );
  }

  protected mentionCandidatesOf(comment: CommentItem): MentionCandidate[] {
    return comment.mentions
      .filter((m) => !!m.name)
      .map((m) => ({ id: m.id, name: m.name as string }));
  }

  protected startReply(comment: CommentItem): void {
    this.editingId.set(null);
    this.replyTo.set(comment.id);
  }

  protected post(draft: CommentDraft, parentId: string | null): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.posting()) {
      return;
    }
    this.posting.set(true);
    this.actionErrorKey.set(null);
    this.api
      .createComment(orgId, {
        entity_type: this.entityType(),
        entity_id: this.entityId(),
        body: draft.body,
        parent_id: parentId,
        mentions: draft.mentions,
      })
      .subscribe({
        next: (comment) => {
          this.posting.set(false);
          this.now.set(Date.now());
          this.comments.update((list) => [...list, comment]);
          if (parentId) {
            this.replyTo.set(null);
          } else {
            this.composer()?.clear();
          }
        },
        error: (error: unknown) => {
          this.posting.set(false);
          this.actionErrorKey.set(kitErrorKey(error));
        },
      });
  }

  protected saveEdit(comment: CommentItem, draft: CommentDraft): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.actionErrorKey.set(null);
    this.api
      .updateComment(orgId, comment.id, { body: draft.body, mentions: draft.mentions })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.editingId.set(null);
          this.comments.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.actionErrorKey.set(kitErrorKey(error));
        },
      });
  }

  protected remove(): void {
    const comment = this.confirmDelete();
    const orgId = this.selectedOrg.currentOrgId();
    if (!comment || !orgId) {
      return;
    }
    this.deletingId.set(comment.id);
    this.api.deleteComment(orgId, comment.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.confirmDelete.set(null);
        // Replies stay; the backend lists them as new threads (parent gone).
        this.comments.update((list) =>
          list
            .filter((c) => c.id !== comment.id)
            .map((c) => (c.parent_id === comment.id ? { ...c, parent_id: null } : c)),
        );
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.confirmDelete.set(null);
        this.actionErrorKey.set(kitErrorKey(error));
      },
    });
  }

  protected summarise(): void {
    this.ask.showWith(
      this.language.translate('kit.ai.summariseComments', {
        type: this.entityTypes.label(this.entityType()),
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      }),
    );
  }

  private load(orgId: string | null, entityType: string, entityId: string): void {
    this.loadSub?.unsubscribe();
    this.comments.set([]);
    this.loadErrorKey.set(null);
    this.actionErrorKey.set(null);
    this.replyTo.set(null);
    this.editingId.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadSub = this.api.comments(orgId, entityType, entityId).subscribe({
      next: (list) => {
        this.now.set(Date.now());
        this.comments.set(list.items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadErrorKey.set(kitErrorKey(error));
        this.loading.set(false);
      },
    });
  }

  private loadCandidates(orgId: string): void {
    if (this.candidatesOrg === orgId) {
      return;
    }
    this.candidatesOrg = orgId;
    this.api.mentionCandidates(orgId).subscribe({
      next: (people) => this.candidates.set(people),
      // Without the directory, comments still work; the mention menu stays hidden.
      error: () => this.candidates.set([]),
    });
  }
}
