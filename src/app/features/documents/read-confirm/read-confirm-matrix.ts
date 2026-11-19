import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  AckMatrixDocument,
  AckMatrixPerson,
  AcknowledgementMatrix,
} from '../../../core/documents/document.models';
import { DocumentsApi } from '../../../core/documents/documents-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { saveBlob } from '../shared/document-control-display';

/** The document types offered as a filter ("" = every type that requires it). */
export const MATRIX_TYPES = ['', 'policy'] as const;

/** Rows whose name or email contains `q` (case-insensitive). */
export function filterPeople(
  people: readonly AckMatrixPerson[],
  q: string,
  missingOnly: boolean,
): AckMatrixPerson[] {
  const needle = q.trim().toLowerCase();
  return people.filter(
    (p) =>
      (!missingOnly || p.acknowledged < p.total) &&
      (!needle ||
        (p.name ?? '').toLowerCase().includes(needle) ||
        (p.email ?? '').toLowerCase().includes(needle)),
  );
}

/** The matrix as CSV: one row per person, one column per document (date / missing / empty). */
export function matrixCsv(
  matrix: AcknowledgementMatrix,
  people: readonly AckMatrixPerson[],
  labels: { person: string; email: string; missing: string },
): string {
  const quote = (value: string | null | undefined) => `"${(value ?? '').replace(/"/g, '""')}"`;
  const header = [
    labels.person,
    labels.email,
    ...matrix.documents.map((d) => (d.doc_code ? `${d.doc_code} ${d.title}` : d.title)),
  ];
  const lines = [header.map(quote).join(',')];
  for (const p of people) {
    const cells = p.cells.map((c) =>
      c === null ? '' : c.status === 'acknowledged' ? (c.acknowledged_at ?? '') : labels.missing,
    );
    lines.push([p.name, p.email, ...cells].map(quote).join(','));
  }
  return lines.join('\r\n');
}

/**
 * U27: who has read and confirmed which document, as a people x documents table.
 * Columns are the approved documents that require "read and understood"; each
 * header and person shows "x av y" and every document header opens its page (where
 * "Påminn" is). Filters: type, search and "only people missing a confirmation".
 */
@Component({
  selector: 'app-read-confirm-matrix',
  imports: [TranslocoPipe, RouterLink, LocalDatePipe, Button, Card, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1200px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="documents.readConfirm.matrix.title"
        descriptionKey="documents.readConfirm.matrix.description"
        [breadcrumbs]="[
          { labelKey: 'modules.names.documents', link: '/documents' },
          { labelKey: 'documents.readConfirm.matrix.title' },
        ]"
        backLink="/documents"
      >
        <app-button
          secondary
          variant="secondary"
          [disabled]="!matrix()"
          (click)="exportCsv()"
          data-testid="matrix-export"
        >
          <app-icon name="download" [size]="14" />
          {{ 'documents.readConfirm.matrix.export' | transloco }}
        </app-button>
      </app-page-header>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="sr-only" for="ack-matrix-q">{{
          'documents.readConfirm.search' | transloco
        }}</label>
        <input
          id="ack-matrix-q"
          type="search"
          class="h-10 min-w-[220px] flex-1 rounded-tile border border-border bg-bg px-3 text-ui text-fg"
          [value]="q()"
          [placeholder]="'documents.readConfirm.search' | transloco"
          (input)="q.set($any($event.target).value)"
          data-testid="matrix-search"
        />
        <label class="sr-only" for="ack-matrix-type">{{
          'documents.readConfirm.matrix.type' | transloco
        }}</label>
        <select
          id="ack-matrix-type"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setType($any($event.target).value)"
          data-testid="matrix-type"
        >
          @for (t of types; track t) {
            <option [value]="t" [selected]="t === type()">
              {{ 'documents.readConfirm.matrix.types.' + (t || 'all') | transloco }}
            </option>
          }
        </select>
        <label class="inline-flex items-center gap-2 text-ui text-fg">
          <input
            type="checkbox"
            [checked]="missingOnly()"
            (change)="setMissing($any($event.target).checked)"
            data-testid="matrix-missing"
          />
          {{ 'documents.readConfirm.matrix.missingOnly' | transloco }}
        </label>
      </div>

      <app-card [padded]="false">
        @if (state() === 'loading') {
          <p class="px-4 py-6 text-ui text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (state() === 'error') {
          <p class="px-4 py-6 text-ui text-fg-muted">{{ 'documents.ack.loadError' | transloco }}</p>
        } @else if (matrix(); as m) {
          @if (m.documents.length === 0) {
            <p class="px-4 py-6 text-ui text-fg-muted" data-testid="matrix-empty">
              {{ 'documents.readConfirm.matrix.empty' | transloco }}
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-ui" data-testid="matrix-table">
                <thead>
                  <tr class="border-b border-border text-left align-bottom">
                    <th scope="col" class="sticky left-0 bg-surface px-3 py-2 font-semibold">
                      {{ 'documents.readConfirm.matrix.person' | transloco }}
                    </th>
                    @for (d of m.documents; track d.id) {
                      <th scope="col" class="min-w-[120px] px-3 py-2 font-semibold">
                        <a
                          [routerLink]="['/documents', d.id]"
                          class="block text-accent hover:underline"
                          [title]="d.title"
                          >{{ label(d) }}</a
                        >
                        <span class="block text-meta font-normal text-fg-muted">{{
                          'documents.readConfirm.progress'
                            | transloco: { done: d.acknowledged, total: d.total }
                        }}</span>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (p of rows(); track p.user_id) {
                    <tr class="border-b border-border last:border-0">
                      <th scope="row" class="sticky left-0 bg-surface px-3 py-2 text-left">
                        <span class="block font-normal text-fg">{{ p.name || p.email }}</span>
                        <span class="block text-meta font-normal text-fg-muted">{{
                          'documents.readConfirm.matrix.personProgress'
                            | transloco: { done: p.acknowledged, total: p.total }
                        }}</span>
                      </th>
                      @for (c of p.cells; track $index) {
                        <td class="px-3 py-2">
                          @if (c === null) {
                            <span class="text-fg-subtle" aria-hidden="true">–</span>
                            <span class="sr-only">{{
                              'documents.readConfirm.matrix.notAsked' | transloco
                            }}</span>
                          } @else if (c.status === 'acknowledged') {
                            <span class="inline-flex items-center gap-1 text-pass">
                              <app-icon name="check" [size]="13" />
                              {{ c.acknowledged_at | localDate: 'mediumDate' }}
                            </span>
                          } @else {
                            <span class="font-semibold text-warn-ink">{{
                              'documents.readConfirm.matrix.missing' | transloco
                            }}</span>
                          }
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr>
                      <td [attr.colspan]="m.documents.length + 1" class="px-3 py-4 text-fg-muted">
                        {{ 'ui.empty.noResults' | transloco }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </app-card>
    </div>
  `,
})
export class ReadConfirmMatrixPage {
  private readonly api = inject(DocumentsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly types = MATRIX_TYPES;
  protected readonly matrix = signal<AcknowledgementMatrix | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly q = signal('');
  protected readonly type = signal<string>(
    this.route.snapshot.queryParamMap.get('type') === 'policy' ? 'policy' : '',
  );
  protected readonly missingOnly = signal(this.route.snapshot.queryParamMap.get('missing') === '1');

  protected readonly rows = computed(() =>
    filterPeople(this.matrix()?.people ?? [], this.q(), this.missingOnly()),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const type = this.type();
      if (orgId) {
        this.load(orgId, type);
      }
    });
  }

  protected label(d: AckMatrixDocument): string {
    return d.doc_code || d.title;
  }

  protected setType(type: string): void {
    this.type.set(type === 'policy' ? 'policy' : '');
    this.syncUrl();
  }

  protected setMissing(value: boolean): void {
    this.missingOnly.set(value);
    this.syncUrl();
  }

  protected exportCsv(): void {
    const m = this.matrix();
    if (!m) {
      return;
    }
    const t = (key: string) => this.language.translate(`documents.readConfirm.matrix.${key}`);
    const csv = matrixCsv(m, this.rows(), {
      person: t('person'),
      email: this.language.translate('documents.readConfirm.csv.email'),
      missing: t('missing'),
    });
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'read-and-understood.csv');
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { type: this.type() || null, missing: this.missingOnly() ? '1' : null },
      replaceUrl: true,
    });
  }

  private load(orgId: string, type: string): void {
    this.state.set('loading');
    this.api.acknowledgementMatrix(orgId, type || null).subscribe({
      next: (matrix) => {
        this.matrix.set(matrix);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
