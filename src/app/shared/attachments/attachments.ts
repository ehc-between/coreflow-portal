import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import {
  Attachment,
  AttachmentEntityType,
  CreateAttachmentResponse,
} from '../../core/attachments/attachment.models';
import {
  attachmentCodeKey,
  formatBytes,
  preCheckFile,
  uploadErrorKey,
} from '../../core/attachments/attachment-utils';
import { errorCodeOf } from '../../core/documents/document-errors';
import { AttachmentUploadError, AttachmentsApi } from '../../core/attachments/attachments-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../ui/icon/icon';

type UploadState = 'hashing' | 'uploading' | 'completing' | 'error';

/** One in-flight (or failed) upload row. */
interface UploadEntry {
  readonly key: number;
  readonly file: File;
  readonly state: UploadState;
  /** 0–100. */
  readonly progress: number;
  readonly errorKey: string | null;
  /** False for pre-check failures, which retrying can't fix. */
  readonly retryable: boolean;
  readonly sha256: string | null;
  readonly created: CreateAttachmentResponse | null;
}

/** A created-but-unfinished upload is only resumed while its URL has this much life left. */
const RESUME_MARGIN_MS = 60_000;

/**
 * Attachments / audit evidence for any record (document, deviation, CAPA
 * action). Lists available files (click to download via a short-lived link)
 * and — when `canEdit` — uploads (multiple files, drag and drop, per-file
 * progress / cancel / retry) and deletes. Uploads hash the file in the browser,
 * register it, PUT the bytes straight to storage and confirm (see
 * {@link AttachmentsApi.upload}). If the server has no storage configured
 * (503) the uploader is quietly hidden. `compact` is a slimmer inline variant
 * for nested records such as CAPA actions; it renders nothing when there is
 * nothing to show or do.
 */
@Component({
  selector: 'app-attachments',
  imports: [DatePipe, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        [class]="compact() ? 'mt-2.5' : ''"
        [class.cf-drop-active]="dragOver()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <input
          #fileInput
          type="file"
          multiple
          class="hidden"
          (change)="onFilesPicked($event)"
          data-testid="attachments-input"
        />

        @if (compact()) {
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1 text-[11.5px] font-semibold text-fg-subtle">
              <app-icon name="link" [size]="13" />
              {{ 'attachments.title' | transloco }}
            </span>
            @for (item of items(); track item.id) {
              <span
                class="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 pr-1 pl-2.5 text-[12px]"
              >
                <button
                  type="button"
                  class="truncate py-0.5 font-medium text-fg hover:text-accent hover:underline disabled:opacity-60"
                  [disabled]="downloadingId() === item.id"
                  [title]="item.filename"
                  (click)="download(item)"
                >
                  {{ item.filename }}
                </button>
                @if (canAttach()) {
                  <button
                    type="button"
                    class="flex rounded-full p-0.5 text-fg-subtle hover:text-fail disabled:opacity-60"
                    [attr.aria-label]="
                      'attachments.deleteNamed' | transloco: { name: item.filename }
                    "
                    [disabled]="deletingId() === item.id"
                    (click)="askDelete(item)"
                  >
                    <app-icon name="x" [size]="12" />
                  </button>
                }
              </span>
            }
            @if (canAttach()) {
              <button
                type="button"
                class="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
                (click)="browse()"
              >
                <app-icon name="plus" [size]="13" />
                {{ 'attachments.attach' | transloco }}
              </button>
            }
          </div>
        } @else {
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
              {{ 'attachments.title' | transloco }}
              @if (items().length > 0) {
                <span class="ml-1 text-[13px] font-semibold text-fg-subtle">{{
                  items().length
                }}</span>
              }
            </h2>
          </div>

          @if (loading()) {
            <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (loadErrorKey(); as key) {
            <p class="text-[13px] text-fg-muted">{{ key | transloco }}</p>
          } @else if (items().length === 0 && uploads().length === 0) {
            <p class="text-[13px] text-fg-muted">{{ 'attachments.empty' | transloco }}</p>
          }

          @if (items().length > 0) {
            <ul class="flex flex-col divide-y divide-border">
              @for (item of items(); track item.id) {
                <li class="flex items-center gap-2.5 py-2">
                  <span class="flex flex-none text-fg-subtle"
                    ><app-icon name="documents" [size]="16"
                  /></span>
                  <span class="min-w-0 flex-1">
                    <button
                      type="button"
                      class="block max-w-full truncate text-left text-[13.5px] font-medium text-fg hover:text-accent hover:underline disabled:opacity-60"
                      [disabled]="downloadingId() === item.id"
                      [title]="'attachments.download' | transloco"
                      (click)="download(item)"
                    >
                      {{ item.filename }}
                    </button>
                    <span class="block text-[12px] text-fg-subtle">
                      {{ size(item.size_bytes) }}
                      @if (item.uploaded_by_name) {
                        · {{ item.uploaded_by_name }}
                      }
                      · {{ item.completed_at ?? item.created_at | date: 'medium' }}
                    </span>
                  </span>
                  @if (canAttach()) {
                    <button
                      type="button"
                      class="flex flex-none rounded-[8px] p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                      [attr.aria-label]="
                        'attachments.deleteNamed' | transloco: { name: item.filename }
                      "
                      [disabled]="deletingId() === item.id"
                      (click)="askDelete(item)"
                    >
                      <app-icon name="x" [size]="15" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
        }

        @if (confirmDelete(); as item) {
          <div
            class="mt-2 flex flex-wrap items-center gap-2 rounded-tile border border-border bg-surface-2 px-3 py-2 text-[12.5px]"
            role="alertdialog"
          >
            <span class="min-w-0 flex-1 text-fg">{{
              'attachments.confirmDelete' | transloco: { name: item.filename }
            }}</span>
            <button
              type="button"
              class="font-semibold text-fail hover:underline"
              (click)="remove(item)"
            >
              {{ 'attachments.delete' | transloco }}
            </button>
            <button
              type="button"
              class="font-semibold text-fg-muted hover:underline"
              (click)="confirmDelete.set(null)"
            >
              {{ 'attachments.cancel' | transloco }}
            </button>
          </div>
        }

        @if (actionErrorKey(); as key) {
          <p class="mt-2 text-[12.5px] text-fail" role="alert">{{ key | transloco }}</p>
        }

        @if (uploads().length > 0) {
          <ul class="mt-2 flex flex-col gap-1.5" data-testid="attachments-uploads">
            @for (up of uploads(); track up.key) {
              <li class="rounded-tile border border-border bg-surface px-3 py-2">
                <div class="flex items-center gap-2 text-[12.5px]">
                  <span
                    class="min-w-0 flex-1 truncate font-medium text-fg"
                    [title]="up.file.name"
                    >{{ up.file.name }}</span
                  >
                  @if (up.state === 'error') {
                    @if (up.retryable) {
                      <button
                        type="button"
                        class="font-semibold text-accent hover:underline"
                        (click)="retry(up.key)"
                      >
                        {{ 'attachments.retry' | transloco }}
                      </button>
                    }
                    <button
                      type="button"
                      class="flex rounded-[6px] p-0.5 text-fg-subtle hover:text-fg"
                      [attr.aria-label]="'attachments.dismiss' | transloco"
                      (click)="dismiss(up.key)"
                    >
                      <app-icon name="x" [size]="13" />
                    </button>
                  } @else {
                    <span class="text-fg-subtle">{{ stateKey(up.state) | transloco }}</span>
                    <button
                      type="button"
                      class="flex rounded-[6px] p-0.5 text-fg-subtle hover:text-fg"
                      [attr.aria-label]="'attachments.cancelUpload' | transloco"
                      (click)="cancel(up.key)"
                    >
                      <app-icon name="x" [size]="13" />
                    </button>
                  }
                </div>
                @if (up.state === 'error') {
                  <p class="mt-0.5 text-[12px] text-fail" role="alert">
                    {{ up.errorKey ?? 'attachments.errors.generic' | transloco }}
                  </p>
                } @else {
                  <div
                    class="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    [attr.aria-valuenow]="up.progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-label]="up.file.name"
                  >
                    <div
                      class="h-full rounded-full bg-accent transition-[width]"
                      [style.width.%]="up.progress"
                    ></div>
                  </div>
                }
              </li>
            }
          </ul>
        }

        @if (!compact()) {
          @if (canAttach()) {
            <button
              type="button"
              class="mt-3 flex w-full flex-col items-center gap-1 rounded-tile border border-dashed border-border-strong px-4 py-4 text-center text-[13px] text-fg-muted hover:border-accent hover:text-fg"
              [class.border-accent]="dragOver()"
              [class.bg-surface-2]="dragOver()"
              (click)="browse()"
              data-testid="attachments-dropzone"
            >
              <app-icon name="upload" [size]="18" />
              <span>{{ 'attachments.dropHint' | transloco }}</span>
            </button>
          } @else if (unavailable() && canEdit()) {
            <p class="mt-2 text-[12.5px] text-fg-subtle" data-testid="attachments-unavailable">
              {{ 'attachments.unavailable' | transloco }}
            </p>
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .cf-drop-active {
        outline: 2px dashed var(--accent);
        outline-offset: 4px;
        border-radius: 10px;
      }
    `,
  ],
})
export class Attachments {
  private readonly api = inject(AttachmentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly document = inject(DOCUMENT);

  readonly entityType = input.required<AttachmentEntityType>();
  readonly entityId = input.required<string>();
  /** Whether the user can edit the parent record (attach + delete). */
  readonly canEdit = input(false);
  /** Slim inline variant for nested records (e.g. each CAPA action). */
  readonly compact = input(false);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly items = signal<readonly Attachment[]>([]);
  protected readonly uploads = signal<readonly UploadEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadErrorKey = signal<string | null>(null);
  protected readonly actionErrorKey = signal<string | null>(null);
  /** Storage isn't configured on this server (503): hide the uploader. */
  protected readonly unavailable = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly downloadingId = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly confirmDelete = signal<Attachment | null>(null);

  protected readonly canAttach = computed(() => this.canEdit() && !this.unavailable());

  /** Compact mode collapses entirely when there's nothing to show or do. */
  protected readonly visible = computed(
    () =>
      !this.compact() ||
      this.canAttach() ||
      this.items().length > 0 ||
      this.uploads().length > 0 ||
      this.actionErrorKey() !== null,
  );

  private readonly running = new Map<number, Subscription>();
  private nextKey = 1;
  private listSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(orgId, entityType, entityId));
    });
    inject(DestroyRef).onDestroy(() => {
      this.listSub?.unsubscribe();
      for (const sub of this.running.values()) {
        sub.unsubscribe();
      }
      this.running.clear();
    });
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected stateKey(state: UploadState): string {
    return `attachments.state.${state}`;
  }

  protected browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    // Reset so picking the same file again still fires `change`.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.canAttach() || !event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as Node).contains(related)) {
      this.dragOver.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.dragOver.set(false);
    if (!this.canAttach()) {
      return;
    }
    event.preventDefault();
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  /** Queue files for upload (each runs independently). */
  addFiles(files: readonly File[]): void {
    if (!this.canAttach()) {
      return;
    }
    this.actionErrorKey.set(null);
    for (const file of files) {
      const key = this.nextKey++;
      const problem = preCheckFile(file);
      const entry: UploadEntry = {
        key,
        file,
        state: problem ? 'error' : 'hashing',
        progress: 0,
        errorKey: problem,
        retryable: !problem,
        sha256: null,
        created: null,
      };
      this.uploads.update((list) => [...list, entry]);
      if (!problem) {
        this.start(key);
      }
    }
  }

  protected retry(key: number): void {
    const entry = this.uploads().find((u) => u.key === key);
    if (!entry || entry.state !== 'error' || !entry.retryable) {
      return;
    }
    // Resume the existing pending row while its upload URL is still valid;
    // otherwise register the file afresh.
    const created =
      entry.created && Date.parse(entry.created.upload.expires_at) - Date.now() > RESUME_MARGIN_MS
        ? entry.created
        : null;
    this.patch(key, { state: 'hashing', progress: 0, errorKey: null, created });
    this.start(key);
  }

  protected cancel(key: number): void {
    this.running.get(key)?.unsubscribe();
    this.running.delete(key);
    this.uploads.update((list) => list.filter((u) => u.key !== key));
  }

  protected dismiss(key: number): void {
    this.uploads.update((list) => list.filter((u) => u.key !== key));
  }

  protected download(item: Attachment): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.downloadingId()) {
      return;
    }
    this.actionErrorKey.set(null);
    this.downloadingId.set(item.id);
    this.api.download(orgId, item.id).subscribe({
      next: (res) => {
        this.downloadingId.set(null);
        // The link lives for ~60 s; storage serves it as `Content-Disposition:
        // attachment`, so navigating downloads the file without leaving the page.
        this.openUrl(res.url);
      },
      error: (err: unknown) => {
        this.downloadingId.set(null);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.actionErrorKey.set(
          status === 503 ? 'attachments.unavailable' : 'attachments.errors.downloadFailed',
        );
      },
    });
  }

  protected askDelete(item: Attachment): void {
    this.actionErrorKey.set(null);
    this.confirmDelete.set(item);
  }

  protected remove(item: Attachment): void {
    const orgId = this.selectedOrg.currentOrgId();
    this.confirmDelete.set(null);
    if (!orgId || this.deletingId()) {
      return;
    }
    this.deletingId.set(item.id);
    this.api.delete(orgId, item.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.items.update((list) => list.filter((a) => a.id !== item.id));
      },
      error: (err: unknown) => {
        this.deletingId.set(null);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.actionErrorKey.set(
          attachmentCodeKey(errorCodeOf(err)) ??
            (status === 403 ? 'attachments.errors.forbidden' : 'attachments.errors.deleteFailed'),
        );
      },
    });
  }

  /** Navigate to a presigned download URL (overridable seam for tests). */
  protected openUrl(url: string): void {
    this.document.defaultView?.location.assign(url);
  }

  private load(orgId: string | null, entityType: AttachmentEntityType, entityId: string): void {
    this.listSub?.unsubscribe();
    this.items.set([]);
    this.loadErrorKey.set(null);
    if (!orgId || !entityId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.listSub = this.api.list(orgId, entityType, entityId).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        if (status === 503) {
          this.unavailable.set(true);
        } else {
          this.loadErrorKey.set('attachments.errors.loadFailed');
        }
      },
    });
  }

  private start(key: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    const entry = this.uploads().find((u) => u.key === key);
    if (!orgId || !entry) {
      return;
    }
    const sub = this.api
      .upload(orgId, this.entityType(), this.entityId(), entry.file, {
        sha256: entry.sha256 ?? undefined,
        created: entry.created,
      })
      .subscribe({
        next: (event) => {
          switch (event.kind) {
            case 'hashed':
              this.patch(key, { sha256: event.sha256 });
              break;
            case 'created':
              this.patch(key, { created: event.created, state: 'uploading' });
              break;
            case 'progress':
              this.patch(key, {
                state: 'uploading',
                progress: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0,
              });
              break;
            case 'completing':
              this.patch(key, { state: 'completing', progress: 100 });
              break;
            case 'done':
              this.running.delete(key);
              this.uploads.update((list) => list.filter((u) => u.key !== key));
              this.items.update((list) => [
                ...list.filter((a) => a.id !== event.attachment.id),
                event.attachment,
              ]);
              break;
          }
        },
        error: (err: unknown) => {
          this.running.delete(key);
          this.onUploadError(key, err);
        },
      });
    if (!sub.closed) {
      this.running.set(key, sub);
    }
  }

  private onUploadError(key: number, err: unknown): void {
    const phase = err instanceof AttachmentUploadError ? err.phase : 'create';
    const status = err instanceof AttachmentUploadError ? err.status : 0;
    if (status === 503 && phase !== 'upload') {
      // Storage isn't set up on this server: quietly hide the uploader and drop
      // queued uploads rather than showing an alarming error per file.
      this.unavailable.set(true);
      for (const sub of this.running.values()) {
        sub.unsubscribe();
      }
      this.running.clear();
      this.uploads.set([]);
      return;
    }
    const created = err instanceof AttachmentUploadError ? err.created : null;
    const code = err instanceof AttachmentUploadError ? err.code : null;
    this.patch(key, {
      state: 'error',
      errorKey: uploadErrorKey(phase, status, code),
      // Size / type / permission refusals (and a closed deviation) won't change on retry.
      retryable:
        attachmentCodeKey(code) === null &&
        !(phase === 'create' && (status === 403 || status === 413 || status === 415)),
      created: created ?? this.uploads().find((u) => u.key === key)?.created ?? null,
    });
  }

  private patch(key: number, changes: Partial<UploadEntry>): void {
    this.uploads.update((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u)));
  }
}
