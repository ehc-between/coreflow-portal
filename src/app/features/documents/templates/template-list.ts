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
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { DocumentControlApi } from '../data/document-control-api';
import { DocumentTemplate, DocumentType } from '../data/document-control.models';
import { DocumentsPageGuide } from '../shared/documents-page-guide';
import { DocumentControlPermissions } from '../shared/document-control-permissions';

export function matchesTemplate(t: DocumentTemplate, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    [t.name, t.description ?? '', t.document_type_name ?? ''].some((v) =>
      v.toLowerCase().includes(needle),
    )
  );
}

/** Document templates: reusable starting structures for new documents. */
@Component({
  selector: 'app-template-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    TeachingEmpty,
    TourStepDirective,
    RecordListPage,
    Button,
    Card,
    Icon,
    DocumentsPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="documents.control.templates.title"
      scope="documents"
      page="templates"
      searchPlaceholderKey="documents.control.templates.searchPlaceholder"
      [query]="q()"
      [filters]="{ type: typeId() }"
      [empty]="state() === 'ready' && all().length === 0"
      (search)="q.set($event)"
      (viewApplied)="typeId.set($event.filters['type'] ?? '')"
    >
      <div intro class="mt-3">
        <app-documents-page-guide page="templates" lesson="numbering-and-types" tour="templates" />
      </div>
      @if (perms.canManage()) {
        <app-button toolbar size="sm" [appTourStep]="'documents-template-new'" (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'documents.control.templates.new' | transloco }}
        </app-button>
      }
      <ng-container filters>
        @if (types().length) {
          <label class="sr-only" for="tpl-f-type">{{
            'documents.control.fields.type' | transloco
          }}</label>
          <select
            id="tpl-f-type"
            class="h-10 max-w-[200px] rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
            (change)="typeId.set($any($event.target).value)"
          >
            <option value="" [selected]="!typeId()">
              {{ 'documents.control.filters.allTypes' | transloco }}
            </option>
            @for (t of types(); track t.id) {
              <option [value]="t.id" [selected]="t.id === typeId()">{{ t.name }}</option>
            }
          </select>
        }
      </ng-container>

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
            <app-card>
              <p class="py-6 text-center text-[14px] text-fg-muted">
                {{ 'documents.control.filters.noMatch' | transloco }}
              </p>
            </app-card>
          } @else {
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (t of rows(); track t.id) {
                <li data-testid="template-card">
                  <a
                    [routerLink]="['/documents/templates', t.id]"
                    class="flex h-full flex-col rounded-card border border-border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span class="flex items-center gap-2 font-semibold text-fg">
                      <app-icon name="template" [size]="16" class="text-fg-subtle" />
                      {{ t.name }}
                    </span>
                    @if (t.description) {
                      <span class="mt-1 line-clamp-2 text-[12.5px] text-fg-muted">{{
                        t.description
                      }}</span>
                    }
                    <span class="mt-auto flex flex-wrap gap-x-3 pt-3 text-[12px] text-fg-subtle">
                      <span>{{
                        t.document_type_name || ('documents.control.templates.anyType' | transloco)
                      }}</span>
                      <span>{{ t.updated_at | localDate: 'mediumDate' }}</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        }
      }

      <app-teaching-empty
        empty
        scope="documents"
        page="templates"
        [showAction]="perms.canManage()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class TemplateListPage {
  private readonly api = inject(DocumentControlApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly perms = inject(DocumentControlPermissions);

  protected readonly q = signal('');
  protected readonly typeId = signal('');
  protected readonly all = signal<readonly DocumentTemplate[]>([]);
  protected readonly types = signal<readonly DocumentType[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly rows = computed(() =>
    this.all().filter(
      (t) =>
        (!this.typeId() || t.document_type_id === this.typeId()) && matchesTemplate(t, this.q()),
    ),
  );

  constructor() {
    providePageContext(() => ({
      module: 'documents',
      entityType: 'document_template',
      view: 'list',
      title: this.language.translate('documents.control.templates.title'),
    }));
    effect(() => {
      const orgId = this.perms.orgId();
      if (!orgId) {
        return;
      }
      untracked(() => {
        this.state.set('loading');
        this.api.listTemplates(orgId).subscribe({
          next: (list) => {
            this.all.set(list);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
        this.api.listTypes(orgId).subscribe({
          next: (types) => this.types.set(types),
          error: () => undefined,
        });
      });
    });
  }

  protected create(): void {
    void this.router.navigateByUrl('/documents/templates/new');
  }
}
