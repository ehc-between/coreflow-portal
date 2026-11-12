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
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { standardLabelKey } from '../deviation-enums';
import { DeviationStatusLabels } from '../deviation-status';
import { DeviationPageGuide } from '../guide/deviation-page-guide';

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
    TourStepDirective,
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    Icon,
    DeviationPageGuide,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/deviations/types"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'deviations.templates.back' | transloco }}
      </a>
      <h1 class="font-display text-[24px] font-bold tracking-[-0.025em] text-fg sm:text-[26px]">
        {{ 'deviations.templates.title' | transloco }}
      </h1>
      <p class="mt-1.5 mb-4 text-[14px] text-fg-muted">
        {{ 'deviations.templates.subtitle' | transloco }}
      </p>

      <app-deviation-page-guide class="mb-5" page="templates" lesson="designing-your-process" />

      @if (loading()) {
        <app-card>
          <p class="py-6 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        </app-card>
      } @else {
        <ul class="grid gap-3 sm:grid-cols-2" appTourStep="deviations-templates">
          @for (template of templates(); track template.key) {
            <li
              class="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
              [attr.data-template]="template.key"
            >
              <div class="flex items-start justify-between gap-2">
                <h2 class="text-[15px] font-semibold text-fg">{{ text(template.name) }}</h2>
                @if (template.code_prefix) {
                  <span class="font-mono text-[12px] text-fg-subtle">{{
                    template.code_prefix
                  }}</span>
                }
              </div>
              <p class="text-[13px] text-fg-muted">{{ text(template.description) }}</p>
              <div class="flex flex-wrap gap-1">
                @for (std of template.standards; track std) {
                  <app-badge tone="neutral">{{ standardLabelKey(std) | transloco }}</app-badge>
                }
              </div>
              <p class="text-[12px] text-fg-subtle">
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
              <div class="mt-auto flex flex-wrap items-center gap-2 pt-1">
                @if (template.deviation_type_id) {
                  <app-badge tone="pass">{{
                    'deviations.templates.installed' | transloco
                  }}</app-badge>
                  <a
                    [routerLink]="['/deviations/types', template.deviation_type_id]"
                    class="text-[13px] font-semibold text-accent hover:underline"
                  >
                    {{ 'deviations.templates.openType' | transloco }}
                  </a>
                  @if (template.record_type_id) {
                    <a
                      [routerLink]="['/settings/record-types', template.record_type_id]"
                      class="text-[13px] font-semibold text-accent hover:underline"
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
            <li class="text-[13.5px] text-fg-muted">
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
  protected readonly templates = signal<readonly DeviationTemplate[]>([]);
  protected readonly loading = signal(true);
  protected readonly installing = signal<string | null>(null);

  constructor() {
    providePageContext(() => ({ module: 'deviations', view: 'settings' }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      if (orgId) {
        this.load(orgId);
      }
    });
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
