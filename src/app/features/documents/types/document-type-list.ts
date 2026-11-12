import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { DocumentType } from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

/** Case-insensitive match on name, key and prefix. */
export function matchesType(type: DocumentType, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    [type.name, type.key, type.numbering_prefix ?? ''].some((v) => v.toLowerCase().includes(needle))
  );
}

/**
 * Document types: the kinds of controlled document the organisation keeps
 * (procedure, work instruction, policy…), each with its numbering scheme and
 * defaults for review interval, acknowledgement and retention.
 */
@Component({
  selector: 'app-document-type-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    TeachingEmpty,
    TourStepDirective,
    RecordListPage,
    Badge,
    Button,
    Card,
    Icon,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="documents.control.types.title"
      scope="documents"
      page="types"
      searchPlaceholderKey="documents.control.types.searchPlaceholder"
      [query]="q()"
      [filters]="{ inactive: showInactive() ? '1' : '' }"
      [empty]="state() === 'ready' && all().length === 0"
      (search)="q.set($event)"
      (viewApplied)="showInactive.set($event.filters['inactive'] === '1')"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="types" lesson="numbering-and-types" tour="types" />
      </div>
      @if (perms.canManage()) {
        <app-button toolbar size="sm" [appTourStep]="'documents-type-new'" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'documents.control.types.new' | transloco }}
        </app-button>
      }
      <ng-container filters>
        <label class="inline-flex h-10 items-center gap-1.5 text-[13px] text-fg-muted">
          <input
            type="checkbox"
            [checked]="showInactive()"
            (change)="showInactive.set($any($event.target).checked)"
          />
          {{ 'documents.control.filters.showInactive' | transloco }}
        </label>
      </ng-container>

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'documents.control.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'documents.control.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (rows().length === 0) {
              <p class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'documents.control.filters.noMatch' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[640px] text-left text-[13px]">
                  <caption class="sr-only">
                    {{
                      'documents.control.types.title' | transloco
                    }}
                  </caption>
                  <thead class="border-b border-border text-[12px] text-fg-muted">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.types.fields.name' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.types.fields.nextCode' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.fields.reviewInterval' | transloco }}
                      </th>
                      <th scope="col" class="px-2 py-2 font-semibold">
                        {{ 'documents.control.types.fields.documents' | transloco }}
                      </th>
                      <th scope="col" class="px-4 py-2 font-semibold">
                        {{ 'documents.control.fields.status' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (t of rows(); track t.id) {
                      <tr class="align-top hover:bg-surface-2" data-testid="type-row">
                        <td class="px-4 py-2.5">
                          <a
                            [routerLink]="['/documents/types', t.id]"
                            class="font-semibold text-fg hover:underline"
                            >{{ t.name }}</a
                          >
                          <div class="mt-0.5 font-mono text-[12px] text-fg-subtle">{{ t.key }}</div>
                        </td>
                        <td class="px-2 py-2.5 font-mono text-[12px] text-fg-muted">
                          {{
                            t.next_code || ('documents.control.types.manualNumbering' | transloco)
                          }}
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">
                          {{
                            t.default_review_interval_months
                              ? ('documents.control.common.months'
                                | transloco: { count: t.default_review_interval_months })
                              : '—'
                          }}
                          @if (t.default_acknowledgement_required) {
                            <span class="block text-[11.5px] text-fg-subtle">{{
                              'documents.control.types.ackByDefault' | transloco
                            }}</span>
                          }
                        </td>
                        <td class="px-2 py-2.5 text-fg-muted">{{ t.document_count }}</td>
                        <td class="px-4 py-2.5">
                          <app-badge [tone]="t.active ? 'pass' : 'neutral'">{{
                            (t.active
                              ? 'documents.control.common.active'
                              : 'documents.control.common.inactive'
                            ) | transloco
                          }}</app-badge>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      </app-card>

      <app-teaching-empty
        empty
        scope="documents"
        page="types"
        [showAction]="perms.canManage()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class DocumentTypeListPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly q = signal('');
  protected readonly showInactive = signal(false);
  protected readonly all = signal<readonly DocumentType[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly rows = computed(() =>
    this.all().filter((t) => (this.showInactive() || t.active) && matchesType(t, this.q())),
  );

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document_type',
      view: 'list',
      title: this.language.translate('documents.control.types.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.state.set('loading');
        this.api.listTypes(orgId, true).subscribe({
          next: (types) => {
            this.all.set(types);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected create(): void {
    void this.router.navigateByUrl('/documents/types/new');
  }
}
