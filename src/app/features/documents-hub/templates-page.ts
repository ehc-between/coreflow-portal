import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { provideHubsScope } from '../company/hub-kit/hub-scope';
import { BTN_SMALL, LINK, PAGE } from '../company/hub-kit/hub-styles';
import { DocumentControlApi } from '../documents/data/document-control-api';
import { DocumentTemplate } from '../documents/data/document-control.models';

type State = 'loading' | 'error' | 'ready';

/**
 * Dokumenter › Maler (`/documents/templates`, docs/ia-v2.md §5.6, gap M60): the
 * organisation's document templates to start from. Read view with one action per row
 * ("Bruk mal" opens the new-document form with the template chosen); templates are
 * edited in Innstillinger › Moduler › Dokumenter, linked for managers.
 */
@Component({
  selector: 'app-document-templates-page',
  imports: [RouterLink, TranslocoPipe, EmptyState, ErrorState, LoadingState, PageHeader],
  viewProviders: [provideHubsScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="page">
      <app-page-header
        titleKey="hubs.templates.title"
        descriptionKey="hubs.templates.intro"
        [breadcrumbs]="[
          { labelKey: 'hubs.documents.title', link: '/documents' },
          { labelKey: 'hubs.templates.title' },
        ]"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (templates().length) {
            <ul
              class="m-0 divide-y divide-border rounded-card border border-border bg-surface p-0"
              data-testid="templates-list"
            >
              @for (tpl of templates(); track tpl.id) {
                <li
                  class="flex list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
                  data-testid="template-row"
                >
                  <div class="min-w-0 flex-1 basis-[220px]">
                    <b class="block font-semibold text-fg [overflow-wrap:anywhere]">{{
                      tpl.name
                    }}</b>
                    <span class="block text-ui text-fg-muted">
                      {{ tpl.document_type_name || ('hubs.templates.noType' | transloco) }}
                      @if (tpl.description) {
                        · {{ tpl.description }}
                      }
                    </span>
                  </div>
                  @if (canDraft()) {
                    <a
                      routerLink="/documents/new"
                      [queryParams]="{ template: tpl.id }"
                      [class]="btnSmall"
                      data-testid="template-use"
                    >
                      {{ 'hubs.templates.use' | transloco }}
                      <span class="sr-only">: {{ tpl.name }}</span>
                    </a>
                  }
                </li>
              }
            </ul>
          } @else {
            <app-empty-state
              icon="documents"
              titleKey="hubs.templates.emptyTitle"
              bodyKey="hubs.templates.emptyBody"
            />
          }
          @if (canManage()) {
            <p class="mt-4 text-ui">
              <a routerLink="/settings/modules/documents/templates" [class]="link">{{
                'hubs.templates.edit' | transloco
              }}</a>
            </p>
          }
        }
      }
    </div>
  `,
})
export class DocumentTemplatesPage {
  private readonly api = inject(DocumentControlApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  protected readonly page = PAGE;
  protected readonly btnSmall = BTN_SMALL;
  protected readonly link = LINK;

  protected readonly state = signal<State>('loading');
  protected readonly templates = signal<readonly DocumentTemplate[]>([]);

  private readonly granted = computed(
    () => new Set(this.selectedOrg.currentOrg()?.permissions ?? []),
  );
  protected readonly canDraft = computed(() => this.granted().has('documents:draft'));
  protected readonly canManage = computed(() => this.granted().has('documents:manage'));

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId());
  }

  private load(orgId: string | null): void {
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.listTemplates(orgId).subscribe({
      next: (list) => {
        this.templates.set([...list].sort((a, b) => a.name.localeCompare(b.name)));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
