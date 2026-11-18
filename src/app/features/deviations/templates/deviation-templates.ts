import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TourStepDirective } from '../../../shared/guidance/tour-step.directive';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { DeviationTemplate } from '../../../core/deviations/deviation.models';
import { codedErrorDetail, notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { fieldTypeLabelKey, standardLabelKey } from '../deviation-enums';
import { DeviationStatusLabels } from '../deviation-status';
import { ModuleConfigNav } from '../../../shared/ui/module-config-nav/module-config-nav';
import { moduleConfigCrumbs } from '../../../core/modules/module-config';

/** A template's text in the UI language (falls back to English, then any language). */
export function templateText(text: Readonly<Record<string, string>>, lang: string): string {
  return text[lang] || text['en'] || Object.values(text)[0] || '';
}

/**
 * The built-in deviation templates (nonconformity, customer complaint,
 * information security incident, environmental incident, HSE incident or near
 * miss, AI incident, improvement suggestion). Installing one creates an F4
 * record type + workflow and a deviation type bound to it, in the UI language;
 * the result can then be adjusted in the record type designer. Gated upstream on
 * `deviations:admin`.
 */
@Component({
  selector: 'app-deviation-templates',
  imports: [
    ModuleConfigNav,
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="deviations.templates.title"
        descriptionKey="deviations.templates.subtitle"
        [breadcrumbs]="breadcrumbs"
        backLink="/settings"
      />
      <app-module-config-nav module="deviations" />
      <app-help-strip scope="deviations" page="templates" lesson="designing-your-process" />

      @if (loading()) {
        <app-loading-state [rows]="4" />
      } @else {
        <ul class="grid gap-3 sm:grid-cols-2" appTourStep="deviations-templates">
          @for (template of templates(); track template.key) {
            <li
              class="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
              [attr.data-template]="template.key"
            >
              <div class="flex items-start justify-between gap-2">
                <h2 class="flex items-center gap-2 text-card font-semibold text-fg">
                  <app-icon name="template" [size]="16" class="text-fg-muted" />
                  {{ text(template.name) }}
                </h2>
                <span class="flex flex-none items-center gap-1.5">
                  @if (isInstalled(template)) {
                    <app-badge tone="pass">{{
                      'deviations.templates.installed' | transloco
                    }}</app-badge>
                  }
                  @if (template.code_prefix) {
                    <span class="font-mono text-meta text-fg-subtle">{{
                      template.code_prefix
                    }}</span>
                  }
                </span>
              </div>
              <p class="text-ui text-fg-muted">{{ text(template.description) }}</p>
              @if (template.when_to_use && text(template.when_to_use)) {
                <p
                  class="rounded-tile bg-surface-2 px-3 py-2 text-ui text-fg"
                  data-testid="when-to-use"
                >
                  <span class="font-semibold">{{
                    'deviations.templates.whenToUse' | transloco
                  }}</span>
                  {{ text(template.when_to_use) }}
                </p>
              }
              @if (template.restricted) {
                <p class="flex items-center gap-1.5 text-meta text-fg-muted">
                  <app-icon name="lock" [size]="13" />
                  {{ 'deviations.templates.restricted' | transloco }}
                </p>
              }
              <div class="flex flex-wrap gap-1">
                @for (std of template.standards; track std) {
                  <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                }
              </div>
              <p class="text-meta text-fg-muted">
                {{
                  'deviations.templates.counts'
                    | transloco
                      : {
                          fields: template.field_count,
                          states: template.state_count,
                          transitions: template.transition_count,
                        }
                }}
              </p>
              @if ((template.fields ?? []).length) {
                <details class="text-ui">
                  <summary class="cursor-pointer font-semibold text-accent hover:underline">
                    {{ 'deviations.templates.showFields' | transloco }}
                  </summary>
                  <ul class="mt-2 flex flex-col gap-1">
                    @for (field of template.fields ?? []; track field.key) {
                      <li class="flex items-center justify-between gap-2">
                        <span class="text-fg">
                          {{ text(field.label) }}
                          @if (field.required) {
                            <span class="text-fail-ink" aria-hidden="true">*</span>
                          }
                        </span>
                        <span class="text-meta text-fg-muted">{{
                          fieldTypeLabelKey(field.type) | transloco
                        }}</span>
                      </li>
                    }
                  </ul>
                </details>
              }
              <div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
                @if (template.deviation_type_id) {
                  <a
                    [routerLink]="[
                      '/settings/modules/deviations/types',
                      template.deviation_type_id,
                    ]"
                    class="text-ui font-semibold text-accent hover:underline"
                  >
                    {{ 'deviations.templates.openType' | transloco }}
                  </a>
                  @if (template.record_type_id) {
                    <a
                      [routerLink]="['/settings/record-types', template.record_type_id]"
                      class="text-ui font-semibold text-accent hover:underline"
                    >
                      {{ 'deviations.templates.openDesigner' | transloco }}
                    </a>
                  }
                } @else {
                  <app-button
                    size="sm"
                    [loading]="installing() === template.key"
                    [disabled]="installing() !== null"
                    (click)="install(template)"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'deviations.templates.install' | transloco }}
                  </app-button>
                }
              </div>
            </li>
          } @empty {
            <li class="text-ui text-fg-muted">
              {{ 'deviations.templates.empty' | transloco }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DeviationTemplatesPage {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly labels = inject(DeviationStatusLabels);

  protected readonly standardLabelKey = standardLabelKey;
  protected readonly fieldTypeLabelKey = fieldTypeLabelKey;
  protected readonly breadcrumbs = [
    ...moduleConfigCrumbs('deviations'),
    { labelKey: 'deviations.templates.title' },
  ];
  protected readonly templates = signal<readonly DeviationTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly installing = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({
      module: 'deviations',
      entityType: 'deviation_type',
      view: 'settings',
      title: this.language.translate('deviations.templates.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        this.load(orgId);
      }
    });
  }

  protected isInstalled(template: DeviationTemplate): boolean {
    return template.installed ?? !!template.deviation_type_id;
  }

  protected text(value: Readonly<Record<string, string>>): string {
    return templateText(value, this.language.active());
  }

  protected install(template: DeviationTemplate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.installing()) {
      return;
    }
    this.installing.set(template.key);
    const lang = this.language.active() === 'nb' ? 'nb' : 'en';
    this.api.installTemplate(orgId, template.key, { lang }).subscribe({
      next: (type) => {
        this.installing.set(null);
        this.notifications.success('deviations.templates.installedToast', {
          name: type.name,
        });
        this.labels.reload();
        this.load(orgId);
      },
      error: (error: unknown) => {
        this.installing.set(null);
        notifyDeviationError(this.notifications, error);
        if (codedErrorDetail(error)?.code === 'template_installed') {
          this.load(orgId);
        }
      },
    });
  }

  private load(orgId: string): void {
    this.loading.set(this.templates().length === 0);
    this.api.listTemplates(orgId).subscribe({
      next: (list) => {
        this.templates.set(list.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
