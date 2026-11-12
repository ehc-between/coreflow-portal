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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { QuestionPreview } from '../components/question-preview';
import { categoryKey } from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { INSPECTIONS_MODULE, Lang, LibraryDetail, LibraryItem } from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

/**
 * The built-in checklist library (`/inspections/templates/library`): ready-made
 * checklists in the user's language (safety walk, fire safety, environmental site
 * check, 5S, information security walkthrough). Preview the questions; designers
 * (`inspections:templates`) import one as a draft template and adapt it.
 */
@Component({
  selector: 'app-template-library',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    Alert,
    Badge,
    Button,
    Card,
    Icon,
    SlideOver,
    QuestionPreview,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/inspections/templates"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'inspections.templates.backToTemplates' | transloco }}
      </a>
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'inspections.library.title' | transloco }}
      </h1>
      <p class="mt-1.5 mb-4 max-w-[680px] text-[14px] text-fg-muted">
        {{ 'inspections.library.subtitle' | transloco }}
      </p>
      <app-guide-intro class="mb-4 block" scope="inspections" page="library" />

      @if (failed()) {
        <app-alert tone="error">{{ 'inspections.library.failed' | transloco }}</app-alert>
      } @else if (items().length === 0) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <ul
          class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          data-testid="library-items"
        >
          @for (item of items(); track item.key) {
            <li>
              <app-card>
                <div class="flex h-full flex-col gap-2">
                  <h2 class="text-[15px] font-bold text-fg">{{ item.title }}</h2>
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
                  <p class="flex-1 text-[13px] text-fg-muted">{{ item.description }}</p>
                  <p class="text-[12.5px] text-fg-subtle">
                    {{
                      'inspections.templates.questions' | transloco: { count: item.question_count }
                    }}
                    @if (item.pass_threshold !== null) {
                      ·
                      {{
                        'inspections.library.passMark' | transloco: { value: item.pass_threshold }
                      }}
                    }
                  </p>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <app-button variant="secondary" size="sm" (click)="preview(item)">
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
      <app-why-it-matters class="mt-6 block" scope="inspections" page="library" />
    </div>

    <app-slide-over
      [open]="!!previewing()"
      [title]="previewing()?.title ?? ''"
      [closeLabel]="'inspections.actions.close' | transloco"
      [width]="620"
      (closed)="previewing.set(null)"
    >
      @if (previewing(); as item) {
        <p class="mb-3 text-[13px] text-fg-muted">{{ item.description }}</p>
        @if (detail(); as d) {
          <app-question-preview [questions]="d.questions" />
          @if (canDesign()) {
            <div class="mt-4">
              <app-button [loading]="importing() === item.key" (click)="importItem(item.key)">
                {{ 'inspections.library.import' | transloco }}
              </app-button>
            </div>
          }
        } @else {
          <p class="text-[13px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
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

  protected readonly categoryLabel = categoryKey;
  protected readonly items = signal<readonly LibraryItem[]>([]);
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
      const lang = this.lang();
      if (!orgId) {
        return;
      }
      untracked(() =>
        this.api.listLibrary(orgId, lang).subscribe({
          next: (items) => {
            this.failed.set(false);
            this.items.set(items);
          },
          error: () => this.failed.set(true),
        }),
      );
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
