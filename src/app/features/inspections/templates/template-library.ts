import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { LocalPercentPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { ClauseRefs } from '../components/clause-refs';
import { QuestionPreview } from '../components/question-preview';
import {
  INSPECTIONS_NAV,
  INSPECTIONS_SETTINGS_LINK,
  categoryKey,
  severityKey,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { INSPECTIONS_MODULE, Lang, LibraryDetail, LibraryItem } from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

/**
 * The built-in checklist library (`/inspections/templates/library`, "Malbibliotek"):
 * ready-made checklists in the user's language (vernerunde, brannvern, miljørunde,
 * 5S, informasjonssikkerhet), each with the standards and clauses it covers and when
 * its findings become deviations. Preview the questions; designers
 * (`inspections:templates`) import one as a draft and adapt it.
 */
@Component({
  selector: 'app-template-library',
  imports: [
    TranslocoPipe,
    WhyItMatters,
    LocalPercentPipe,
    Badge,
    Button,
    Card,
    ErrorState,
    HelpStrip,
    LoadingState,
    ModuleNav,
    PageHeader,
    SlideOver,
    ClauseRefs,
    QuestionPreview,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="inspections.library.title"
        descriptionKey="inspections.library.subtitle"
        [breadcrumbs]="breadcrumbs"
        [settingsLink]="settingsLink"
      />
      <app-module-nav class="mb-4 block" labelKey="modules.names.inspections" [items]="nav" />
      <app-help-strip scope="inspections" page="library" lesson="inspection-basics" />

      @if (failed()) {
        <app-error-state (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading-state [rows]="4" />
      } @else {
        <ul
          class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          data-testid="library-items"
        >
          @for (item of items(); track item.key) {
            <li>
              <app-card class="block h-full">
                <div class="flex h-full flex-col gap-2">
                  <h2 class="text-card font-bold text-fg">{{ item.title }}</h2>
                  <div class="flex flex-wrap gap-1.5">
                    @if (categoryLabel(item.category); as cat) {
                      <app-badge tone="info">{{ cat | transloco }}</app-badge>
                    }
                    @for (fw of item.frameworks; track fw) {
                      <app-badge tone="neutral">{{
                        'inspections.frameworks.' + fw | transloco
                      }}</app-badge>
                    }
                  </div>
                  <p class="flex-1 text-ui text-fg-muted">{{ item.description }}</p>
                  @if (item.clause_refs?.length) {
                    <p class="flex flex-wrap items-center gap-1 text-meta">
                      <app-clause-refs
                        [refs]="item.clause_refs"
                        labelKey="inspections.templates.covers"
                      />
                    </p>
                  }
                  <p class="text-meta text-fg-subtle">
                    {{
                      'inspections.templates.questions' | transloco: { count: item.question_count }
                    }}
                    @if (item.pass_threshold !== null) {
                      ·
                      {{
                        'inspections.library.passMark'
                          | transloco: { value: (item.pass_threshold | localPercent) }
                      }}
                    }
                    @if (item.auto_deviation) {
                      ·
                      {{
                        'inspections.library.deviationsFrom'
                          | transloco
                            : {
                                severity:
                                  (severityKey(item.deviation_min_severity ?? 'high') | transloco),
                              }
                      }}
                    }
                  </p>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <app-button
                      variant="secondary"
                      size="sm"
                      (click)="preview(item)"
                      [attr.data-testid]="'preview-' + item.key"
                    >
                      {{ 'inspections.library.preview' | transloco }}
                    </app-button>
                    @if (canDesign()) {
                      <app-button
                        size="sm"
                        [loading]="importing() === item.key"
                        (click)="importItem(item.key)"
                        [attr.data-testid]="'import-' + item.key"
                      >
                        {{ 'inspections.library.import' | transloco }}
                      </app-button>
                    }
                  </div>
                </div>
              </app-card>
            </li>
          }
        </ul>
      }
      <div class="mt-8"><app-why-it-matters scope="inspections" page="library" /></div>
    </div>

    <app-slide-over
      [open]="!!previewing()"
      [title]="previewing()?.title ?? ''"
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="620"
      (closed)="previewing.set(null)"
    >
      @if (previewing(); as item) {
        <p class="mb-3 text-ui text-fg-muted">{{ item.description }}</p>
        @if (detail(); as d) {
          <app-question-preview [questions]="d.questions" />
          @if (canDesign()) {
            <div class="sticky bottom-0 mt-4 border-t border-border bg-surface py-3">
              <app-button [loading]="importing() === item.key" (click)="importItem(item.key)">
                {{ 'inspections.library.import' | transloco }}
              </app-button>
            </div>
          }
        } @else {
          <app-loading-state [rows]="4" />
        }
      }
    </app-slide-over>
  `,
})
export class TemplateLibrary {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);

  protected readonly nav = INSPECTIONS_NAV;
  protected readonly settingsLink = INSPECTIONS_SETTINGS_LINK;
  protected readonly breadcrumbs = [
    { labelKey: 'modules.names.inspections', link: '/inspections' },
    { labelKey: 'inspections.templates.title', link: '/inspections/templates' },
    { labelKey: 'inspections.library.title' },
  ];
  protected readonly categoryLabel = categoryKey;
  protected readonly severityKey = severityKey;
  protected readonly items = signal<readonly LibraryItem[]>([]);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly previewing = signal<LibraryItem | null>(null);
  protected readonly detail = signal<LibraryDetail | null>(null);
  protected readonly importing = signal<string | null>(null);

  protected readonly canDesign = computed(
    () => this.selectedOrg.currentOrg()?.permissions.includes('inspections:templates') ?? false,
  );

  private readonly lang = computed<Lang>(() => (this.language.active() === 'nb' ? 'nb' : 'en'));

  constructor() {
    providePageContext(() => ({
      module: INSPECTIONS_MODULE,
      entityType: 'checklist_template',
      view: 'other',
      title: this.language.translate('inspections.library.title'),
    }));

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.lang();
      if (orgId) {
        untracked(() => this.load());
      }
    });
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.failed.set(false);
    this.api.listLibrary(orgId, this.lang()).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loaded.set(true);
      },
      error: () => {
        this.loaded.set(true);
        this.failed.set(true);
      },
    });
  }

  protected preview(item: LibraryItem): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.previewing.set(item);
    this.detail.set(null);
    this.api.getLibraryTemplate(orgId, item.key, this.lang()).subscribe({
      next: (d) => this.detail.set(d),
      error: (e: unknown) => this.notifications.error(inspectionErrorKey(e)),
    });
  }

  protected importItem(key: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.importing()) {
      return;
    }
    this.importing.set(key);
    this.api.importLibraryTemplate(orgId, key, this.lang()).subscribe({
      next: (template) => {
        this.importing.set(null);
        this.notifications.success('inspections.notices.imported', { title: template.title });
        void this.router.navigate(['/inspections/templates', template.id, 'edit']);
      },
      error: (e: unknown) => {
        this.importing.set(null);
        this.notifications.error(inspectionErrorKey(e));
      },
    });
  }
}
