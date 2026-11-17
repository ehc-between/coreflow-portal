import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import {
  AcknowledgementEntry,
  DocumentAcknowledgements,
  DocumentDetail,
} from '../../../core/documents/document.models';
import { documentErrorKey } from '../../../core/documents/document-errors';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { Switch } from '../../../shared/ui/switch/switch';
import { saveBlob } from '../shared/document-control-display';

/** People shown before "Vis alle (n)". */
export const ACK_PREVIEW = 6;
/** From this many people the list gets a search box. */
export const ACK_SEARCH_FROM = 9;

/** A person row with the email shown when the name alone is ambiguous. */
export interface AckRow extends AcknowledgementEntry {
  readonly showEmail: boolean;
}

/**
 * The rows of an acknowledgement list: the email is shown when the person has no
 * name or shares it with someone else in the report.
 */
export function ackRows(
  report: DocumentAcknowledgements,
  entries: readonly AcknowledgementEntry[],
): AckRow[] {
  const counts = new Map<string, number>();
  for (const person of [...report.acknowledged, ...report.pending]) {
    const key = person.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map((person) => ({
    ...person,
    showEmail:
      !!person.email &&
      ((counts.get(person.name.trim().toLowerCase()) ?? 0) > 1 || person.name === person.email),
  }));
}

/** A CSV of who has and hasn't confirmed (name, email, status, date). */
export function acknowledgementCsv(
  report: DocumentAcknowledgements,
  labels: {
    name: string;
    email: string;
    status: string;
    date: string;
    done: string;
    pending: string;
  },
): string {
  const quote = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;
  const lines = [[labels.name, labels.email, labels.status, labels.date].map(quote).join(',')];
  for (const p of report.acknowledged) {
    lines.push([p.name, p.email, labels.done, p.acknowledged_at ?? ''].map(quote).join(','));
  }
  for (const p of report.pending) {
    lines.push([p.name, p.email, labels.pending, ''].map(quote).join(','));
  }
  return lines.join('\r\n');
}

/**
 * "Lest og forstått" card on the document page (its own card, not part of the
 * periodic review). Managers (owner or `documents:approve`) switch the
 * requirement on or off. While it is on and an approved revision exists they see
 * an x-of-y progress bar, who still has to confirm (searchable, the first few
 * shown, the email when names collide), who has confirmed, a CSV export, and
 * "Send påminnelse": distribution campaigns carry the reminders, so it opens a
 * new campaign for this document.
 */
@Component({
  selector: 'app-document-acknowledgement-list',
  imports: [
    LocalDatePipe,
    RouterLink,
    TranslocoPipe,
    HasPermissionDirective,
    Button,
    Card,
    Icon,
    ProgressBar,
    Switch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="px-4 pt-3.5 pb-1">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'documents.ack.listTitle' | transloco }}
        </h2>
        <p class="mt-0.5 text-meta text-fg-muted">
          {{ 'documents.ack.requireHint' | transloco }}
        </p>
      </div>

      @if (canManage() && document().status !== 'obsolete') {
        <div class="px-3 pt-1 pb-2" data-testid="ack-required">
          <app-switch [checked]="required()" (checkedChange)="setRequired($event)">
            {{ 'documents.ack.requireLabel' | transloco }}
          </app-switch>
        </div>
      } @else {
        <p class="px-4 pb-3 text-ui text-fg">
          {{ (required() ? 'documents.readConfirm.on' : 'documents.readConfirm.off') | transloco }}
        </p>
      }

      @if (showReport()) {
        <div class="border-t border-border px-4 pt-3 pb-4">
          @if (loading()) {
            <p class="text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
          } @else if (failed()) {
            <p class="text-ui text-fg-muted">{{ 'documents.ack.loadError' | transloco }}</p>
          } @else if (report(); as r) {
            <div class="flex items-center justify-between gap-2 text-meta">
              <span class="font-semibold text-fg" data-testid="ack-progress">{{
                'documents.ack.progress'
                  | transloco: { done: r.acknowledged.length, total: total() }
              }}</span>
              <span class="text-fg-muted">{{
                'documents.readConfirm.revision' | transloco: { rev: r.revision ?? '—' }
              }}</span>
            </div>
            <app-progress-bar
              class="mt-1.5 block"
              [value]="percent()"
              [label]="
                'documents.ack.progress'
                  | transloco: { done: r.acknowledged.length, total: total() }
              "
            />

            <div class="mt-3 flex flex-wrap gap-2">
              @if (r.pending.length > 0) {
                <a
                  *appHasPermission="'documents:distribute'"
                  [routerLink]="['/documents/campaigns/new']"
                  [queryParams]="{ document: document().id }"
                  data-testid="ack-remind"
                >
                  <app-button size="sm" variant="secondary">
                    <app-icon name="bell" [size]="14" />
                    {{ 'documents.readConfirm.remind' | transloco }}
                  </app-button>
                </a>
              }
              <app-button size="sm" variant="ghost" (click)="exportCsv()" data-testid="ack-export">
                <app-icon name="download" [size]="14" />
                {{ 'documents.readConfirm.export' | transloco }}
              </app-button>
            </div>

            @if (total() >= searchFrom) {
              <label class="mt-3 block">
                <span class="sr-only">{{ 'documents.readConfirm.search' | transloco }}</span>
                <input
                  type="search"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                  [placeholder]="'documents.readConfirm.search' | transloco"
                  class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  data-testid="ack-search"
                />
              </label>
            }

            <h3 class="mt-3 text-meta font-semibold text-fg-muted">
              {{ 'documents.ack.pending' | transloco: { count: r.pending.length } }}
            </h3>
            @if (r.pending.length === 0) {
              <p class="mt-1 text-ui text-fg-muted">
                {{ 'documents.ack.nonePending' | transloco }}
              </p>
            } @else {
              <ul class="mt-1 flex flex-col gap-1" data-testid="ack-pending">
                @for (person of pendingShown(); track person.user_id) {
                  <li class="min-w-0 text-ui">
                    <span class="block truncate text-fg">{{ person.name }}</span>
                    @if (person.showEmail) {
                      <span class="block truncate text-meta text-fg-subtle">{{
                        person.email
                      }}</span>
                    }
                  </li>
                } @empty {
                  <li class="text-ui text-fg-muted">{{ 'ui.empty.noResults' | transloco }}</li>
                }
              </ul>
              @if (pendingHidden() > 0) {
                <button
                  type="button"
                  class="mt-1.5 text-meta font-semibold text-accent hover:underline"
                  (click)="showAll.set(true)"
                  data-testid="ack-show-all"
                >
                  {{ 'documents.readConfirm.showAll' | transloco: { count: pendingMatches() } }}
                </button>
              }
            }

            <details class="mt-3" data-testid="ack-done">
              <summary class="cursor-pointer text-meta font-semibold text-fg-muted">
                {{ 'documents.ack.acknowledged' | transloco: { count: r.acknowledged.length } }}
              </summary>
              @if (r.acknowledged.length === 0) {
                <p class="mt-1 text-ui text-fg-muted">{{ 'documents.ack.noneYet' | transloco }}</p>
              } @else {
                <ul class="mt-1 flex flex-col gap-1">
                  @for (person of acknowledgedShown(); track person.user_id) {
                    <li class="flex items-start justify-between gap-2 text-ui">
                      <span class="min-w-0">
                        <span class="block truncate text-fg">{{ person.name }}</span>
                        @if (person.showEmail) {
                          <span class="block truncate text-meta text-fg-subtle">{{
                            person.email
                          }}</span>
                        }
                      </span>
                      @if (person.acknowledged_at) {
                        <span class="flex-none text-meta text-fg-subtle">{{
                          person.acknowledged_at | localDate: 'mediumDate'
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              }
            </details>
          }
        </div>
      } @else if (required() && !document().current_revision) {
        <p class="border-t border-border px-4 py-3 text-meta text-fg-muted">
          {{ 'documents.readConfirm.afterApproval' | transloco }}
        </p>
      }
    </app-card>
  `,
})
export class DocumentAcknowledgementList {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly document = input.required<DocumentDetail>();
  /** Owner or `documents:approve`: may change the setting and see who has confirmed. */
  readonly canManage = input(false);

  /** The document after the setting changed. */
  readonly changed = output<DocumentDetail>();

  protected readonly searchFrom = ACK_SEARCH_FROM;
  protected readonly report = signal<DocumentAcknowledgements | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly query = signal('');
  protected readonly showAll = signal(false);

  protected readonly required = computed(() => this.document().acknowledgement?.required ?? false);
  protected readonly showReport = computed(
    () => this.canManage() && this.required() && !!this.document().current_revision,
  );
  protected readonly total = computed(() => {
    const r = this.report();
    return r ? r.acknowledged.length + r.pending.length : 0;
  });
  protected readonly percent = computed(() => {
    const total = this.total();
    return total ? Math.round(((this.report()?.acknowledged.length ?? 0) / total) * 100) : 0;
  });

  private readonly matches = (person: AcknowledgementEntry): boolean => {
    const q = this.query().trim().toLowerCase();
    return !q || person.name.toLowerCase().includes(q) || !!person.email?.toLowerCase().includes(q);
  };
  private readonly pendingRows = computed(() => {
    const r = this.report();
    return r ? ackRows(r, r.pending.filter(this.matches)) : [];
  });
  protected readonly pendingMatches = computed(() => this.pendingRows().length);
  protected readonly pendingShown = computed(() => {
    const rows = this.pendingRows();
    return this.showAll() || this.query().trim() ? rows : rows.slice(0, ACK_PREVIEW);
  });
  protected readonly pendingHidden = computed(
    () => this.pendingRows().length - this.pendingShown().length,
  );
  protected readonly acknowledgedShown = computed(() => {
    const r = this.report();
    return r ? ackRows(r, r.acknowledged.filter(this.matches)) : [];
  });

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const doc = this.document();
      // Re-fetch when the document, its approved revision or my own confirmation changes.
      const version = `${doc.current_revision?.id}:${doc.acknowledgement?.acknowledged_at}`;
      if (orgId && version && this.showReport()) {
        this.load(orgId, doc.id);
      }
    });
  }

  protected setRequired(value: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .updateControl(orgId, this.document().id, { acknowledgement_required: value })
      .subscribe({
        next: (document) => {
          this.saving.set(false);
          this.notifications.success('documents.readConfirm.savedToast');
          this.changed.emit(document);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.error(documentErrorKey(error, 'updateControl'));
        },
      });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (!r) {
      return;
    }
    const t = (key: string) => this.language.translate(`documents.readConfirm.csv.${key}`);
    const csv = acknowledgementCsv(r, {
      name: t('name'),
      email: t('email'),
      status: t('status'),
      date: t('date'),
      done: t('done'),
      pending: t('pending'),
    });
    saveBlob(
      new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
      `${this.document().doc_code || 'document'}-read-and-understood.csv`,
    );
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
