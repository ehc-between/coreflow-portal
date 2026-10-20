import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DocumentAcknowledgements } from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';

/**
 * Acknowledgement report for owners and approvers: who has read and understood
 * the current approved revision and who hasn't yet. Loads when the inputs
 * change (document, revision, or the acknowledged-by-me timestamp).
 */
@Component({
  selector: 'app-document-acknowledgement-list',
  imports: [DatePipe, TranslocoPipe, Card],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1">
        <h2 class="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
          {{ 'documents.ack.listTitle' | transloco }}
        </h2>
        @if (report(); as r) {
          <span class="text-[12.5px] text-fg-subtle">{{
            'documents.ack.progress' | transloco: { done: r.acknowledged.length, total: total() }
          }}</span>
        }
      </div>

      @if (loading()) {
        <p class="px-4 py-4 text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else if (failed()) {
        <p class="px-4 py-4 text-[13px] text-fg-muted">
          {{ 'documents.ack.loadError' | transloco }}
        </p>
      } @else if (report(); as r) {
        <div class="px-4 pt-2 pb-4">
          <h3 class="text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
            {{ 'documents.ack.pending' | transloco: { count: r.pending.length } }}
          </h3>
          @if (r.pending.length === 0) {
            <p class="mt-1 text-[13px] text-fg-muted">
              {{ 'documents.ack.nonePending' | transloco }}
            </p>
          } @else {
            <ul class="mt-1 flex flex-col gap-1">
              @for (person of r.pending; track person.user_id) {
                <li class="truncate text-[13px] text-fg">{{ person.name }}</li>
              }
            </ul>
          }

          <h3 class="mt-3 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase">
            {{ 'documents.ack.acknowledged' | transloco: { count: r.acknowledged.length } }}
          </h3>
          @if (r.acknowledged.length === 0) {
            <p class="mt-1 text-[13px] text-fg-muted">{{ 'documents.ack.noneYet' | transloco }}</p>
          } @else {
            <ul class="mt-1 flex flex-col gap-1">
              @for (person of r.acknowledged; track person.user_id) {
                <li class="flex items-center justify-between gap-2 text-[13px]">
                  <span class="min-w-0 truncate text-fg">{{ person.name }}</span>
                  @if (person.acknowledged_at) {
                    <span class="flex-none text-[12px] text-fg-subtle">{{
                      person.acknowledged_at | date: 'mediumDate'
                    }}</span>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </app-card>
  `,
})
export class DocumentAcknowledgementList {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly documentId = input.required<string>();
  /** The approved revision being acknowledged; a change re-fetches the report. */
  readonly revisionId = input<string | null>(null);
  /** The caller's own acknowledgement time; a change re-fetches the report. */
  readonly acknowledgedAt = input<string | null>(null);

  protected readonly report = signal<DocumentAcknowledgements | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly total = computed(() => {
    const r = this.report();
    return r ? r.acknowledged.length + r.pending.length : 0;
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const documentId = this.documentId();
      this.revisionId();
      this.acknowledgedAt();
      if (orgId) {
        this.load(orgId, documentId);
      }
    });
  }

  private load(orgId: string, documentId: string): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.listAcknowledgements(orgId, documentId).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }
}
