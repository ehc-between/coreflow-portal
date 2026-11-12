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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { AskAbout } from '../../../shared/ask/ask-about';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { LocalDatePipe, LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { statusLabelKey, statusTone } from '../document-status';
import { DocumentControlApi } from '../data/document-control-api';
import { documentControlErrorCode, documentControlErrorKey } from '../data/document-control-errors';
import {
  RevisionCompare,
  RevisionHistory,
  RevisionHistoryItem,
} from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';
import { DiffView } from './diff-view';

/**
 * Default pair to compare: the newest revision against the one before it
 * (history is newest first). Null when there is nothing to compare.
 */
export function defaultPair(
  items: readonly RevisionHistoryItem[],
): { readonly from: string; readonly to: string } | null {
  return items.length >= 2 ? { from: items[1].id, to: items[0].id } : null;
}

/**
 * Revision history of one document and a compare view: pick any two revisions
 * the caller can see, read the paragraph-level changes (word-level inside a
 * paragraph), and draft a change reason with AI.
 */
@Component({
  selector: 'app-document-history',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    AskAbout,
    TourStepDirective,
    LocalDatePipe,
    LocalPercentPipe,
    Alert,
    Badge,
    Card,
    Icon,
    DocumentsPageGuide,
    DiffView,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="['/documents', id()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'documents.control.compare.back' | transloco }}
      </a>

      @if (history(); as h) {
        <header class="mb-4">
          @if (h.document.code) {
            <p class="mb-1 font-mono text-[12.5px] text-fg-subtle">{{ h.document.code }}</p>
          }
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'documents.control.compare.title' | transloco: { title: h.document.title } }}
          </h1>
        </header>
        <app-documents-page-guide
          class="mb-4"
          page="compare"
          lesson="comparing-revisions"
          tour="compare"
        />

        <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
          <app-card class="lg:w-[340px] lg:flex-none" [padded]="false">
            <h2
              class="px-4 pt-3.5 pb-2 font-display text-[15px] font-bold text-fg"
              [appTourStep]="'documents-compare-history'"
            >
              {{ 'documents.control.compare.history' | transloco }}
            </h2>
            <ol class="divide-y divide-border border-t border-border" data-testid="history-list">
              @for (rev of h.items; track rev.id) {
                <li class="px-4 py-2.5 text-[13px]">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-semibold text-fg">{{
                      'documents.control.compare.rev' | transloco: { rev: rev.rev }
                    }}</span>
                    <app-badge [tone]="tone(rev.status)">{{
                      statusKey(rev.status) | transloco
                    }}</app-badge>
                    @if (rev.is_current_approved) {
                      <app-badge tone="pass">{{
                        'documents.control.compare.current' | transloco
                      }}</app-badge>
                    }
                    @if (rev.is_working) {
                      <app-badge tone="info">{{
                        'documents.control.compare.working' | transloco
                      }}</app-badge>
                    }
                  </div>
                  @if (rev.change_reason) {
                    <p class="mt-1 text-fg">{{ rev.change_reason }}</p>
                  }
                  <p class="mt-1 text-[12px] text-fg-subtle">
                    {{
                      'documents.control.compare.authored'
                        | transloco
                          : {
                              name:
                                rev.author?.name ??
                                ('documents.control.common.unknown' | transloco),
                              date: (rev.created_at | localDate: 'mediumDate'),
                            }
                    }}
                    @if (rev.approved_at) {
                      <span class="block">
                        {{
                          'documents.control.compare.approvedBy'
                            | transloco
                              : {
                                  name:
                                    rev.approved_by?.name ??
                                    ('documents.control.common.unknown' | transloco),
                                  date: (rev.approved_at | localDate: 'mediumDate'),
                                }
                        }}
                      </span>
                    }
                  </p>
                  @if (h.items.length > 1) {
                    <div class="mt-1.5 flex gap-3 text-[12px]">
                      <label class="inline-flex items-center gap-1 text-fg-muted">
                        <input
                          type="radio"
                          name="cmp-from"
                          [checked]="fromId() === rev.id"
                          [disabled]="toId() === rev.id"
                          (change)="pick('from', rev.id)"
                        />
                        {{ 'documents.control.compare.asFrom' | transloco }}
                      </label>
                      <label class="inline-flex items-center gap-1 text-fg-muted">
                        <input
                          type="radio"
                          name="cmp-to"
                          [checked]="toId() === rev.id"
                          [disabled]="fromId() === rev.id"
                          (change)="pick('to', rev.id)"
                        />
                        {{ 'documents.control.compare.asTo' | transloco }}
                      </label>
                    </div>
                  }
                </li>
              }
            </ol>
          </app-card>

          <div class="flex min-w-0 flex-1 flex-col gap-4">
            @if (compareError(); as key) {
              <app-alert tone="info">{{ key | transloco }}</app-alert>
            } @else if (result(); as r) {
              <app-card>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2
                      class="flex items-center gap-1.5 font-display text-[16px] font-bold text-fg"
                    >
                      {{
                        'documents.control.compare.heading'
                          | transloco: { from: r.from.rev, to: r.to.rev }
                      }}
                      <app-ask-about
                        [prompt]="
                          'documents.control.compare.askExplain'
                            | transloco: { from: r.from.rev, to: r.to.rev }
                        "
                        field="compare"
                      />
                    </h2>
                    <p class="mt-1 text-[12.5px] text-fg-muted" data-testid="compare-stats">
                      @if (r.stats.identical) {
                        {{ 'documents.control.compare.identical' | transloco }}
                      } @else {
                        {{
                          'documents.control.compare.stats'
                            | transloco
                              : {
                                  added: r.stats.added_lines,
                                  removed: r.stats.removed_lines,
                                  blocks: r.stats.changed_blocks,
                                  similarity: (r.stats.similarity * 100 | localPercent),
                                }
                        }}
                      }
                    </p>
                  </div>
                  @if (perms.canDraft()) {
                    <app-ai-assist-button
                      assist="documents.change_summary"
                      labelKey="documents.control.compare.summarise"
                      [input]="{
                        document_id: id(),
                        from_revision_id: r.from.id,
                        to_revision_id: r.to.id,
                      }"
                      entityType="document"
                      [entityId]="id()"
                      (text)="summary.set($event)"
                    />
                  }
                </div>
                @if (summary()) {
                  <section
                    class="mt-3 rounded-tile border border-accent/30 bg-accent-soft p-3 text-[13.5px]"
                    aria-live="polite"
                    [attr.aria-label]="'documents.control.compare.summaryTitle' | transloco"
                  >
                    <div class="mb-1 flex items-center justify-between gap-2">
                      <h3 class="font-semibold text-fg">
                        {{ 'documents.control.compare.summaryTitle' | transloco }}
                      </h3>
                      <button
                        type="button"
                        class="text-[12.5px] font-semibold text-fg-muted hover:text-fg"
                        (click)="summary.set('')"
                      >
                        {{ 'documents.control.common.dismiss' | transloco }}
                      </button>
                    </div>
                    <p class="whitespace-pre-line text-fg">{{ summary() }}</p>
                    <p class="mt-2 text-[11.5px] text-fg-subtle">
                      {{ 'documents.control.compare.summaryHint' | transloco }}
                    </p>
                  </section>
                }
              </app-card>
              <app-card>
                @if (r.stats.identical) {
                  <p class="text-[13.5px] text-fg-muted">
                    {{ 'documents.control.compare.identical' | transloco }}
                  </p>
                } @else {
                  <app-documents-diff-view [blocks]="r.blocks" />
                }
              </app-card>
            } @else {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'documents.control.common.loading' | transloco }}
              </p>
            }
          </div>
        </div>
      } @else if (loadError(); as key) {
        <app-alert tone="error">{{ key | transloco }}</app-alert>
      } @else {
        <p class="py-16 text-center text-[14px] text-fg-muted">
          {{ 'documents.control.common.loading' | transloco }}
        </p>
      }
    </div>
  `,
})
export class DocumentHistoryPage {
  private readonly api = inject(DocumentControlApi);
  protected readonly perms = inject(DocumentControlPermissions);

  readonly id = input.required<string>();

  protected readonly history = signal<RevisionHistory | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly fromId = signal<string | null>(null);
  protected readonly toId = signal<string | null>(null);
  protected readonly result = signal<RevisionCompare | null>(null);
  protected readonly compareError = signal<string | null>(null);
  protected readonly summary = signal('');
  private compareSub: Subscription | null = null;

  private readonly pair = computed(() => ({ from: this.fromId(), to: this.toId() }));

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document',
      entityId: this.id(),
      view: 'other',
      title: this.history()?.document.title ?? null,
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      const id = this.id();
      untracked(() => this.loadHistory(orgId, id));
    });
    effect(() => {
      const orgId = this.perms.orgId();
      const { from, to } = this.pair();
      const loaded = this.history();
      if (!orgId || !loaded) {
        return;
      }
      untracked(() => this.runCompare(orgId, from, to));
    });
    inject(DestroyRef).onDestroy(() => this.compareSub?.unsubscribe());
  }

  private loadHistory(orgId: string | null, id: string): void {
    if (!orgId) {
      return;
    }
    this.history.set(null);
    this.loadError.set(null);
    this.api.revisionHistory(orgId, id).subscribe({
      next: (h) => {
        const pair = defaultPair(h.items);
        this.fromId.set(pair?.from ?? null);
        this.toId.set(pair?.to ?? null);
        this.history.set(h);
      },
      error: (e: unknown) => this.loadError.set(documentControlErrorKey(e)),
    });
  }

  private runCompare(orgId: string, from: string | null, to: string | null): void {
    this.compareSub?.unsubscribe();
    this.summary.set('');
    this.result.set(null);
    if ((this.history()?.items.length ?? 0) < 2) {
      this.compareError.set('documents.control.errors.nothing_to_compare');
      return;
    }
    this.compareError.set(null);
    this.compareSub = this.api.compare(orgId, this.id(), from, to).subscribe({
      next: (r) => this.result.set(r),
      error: (e: unknown) =>
        this.compareError.set(
          documentControlErrorCode(e) === 'nothing_to_compare'
            ? 'documents.control.errors.nothing_to_compare'
            : documentControlErrorKey(e),
        ),
    });
  }

  protected pick(which: 'from' | 'to', id: string): void {
    (which === 'from' ? this.fromId : this.toId).set(id);
  }

  protected tone(status: string) {
    return statusTone(status);
  }

  protected statusKey(status: string): string {
    return statusLabelKey(status);
  }
}
