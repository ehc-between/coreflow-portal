import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { Card } from '../../../shared/ui/card/card';

/** The org-settings entry card linking to `/settings/guidance` (learning mode). */
@Component({
  selector: 'app-guidance-settings-link',
  imports: [RouterLink, TranslocoPipe, Button, Card],
  viewProviders: [provideSharedScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section data-testid="settings-guidance">
      <app-card>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0">
            <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
              {{ 'guidance.settings.title' | transloco }}
            </h2>
            <p class="mt-0.5 text-[13px] text-fg-muted">
              {{ 'guidance.settings.linkSubtitle' | transloco }}
            </p>
          </div>
          <a routerLink="/settings/guidance">
            <app-button variant="secondary">{{ 'guidance.settings.open' | transloco }}</app-button>
          </a>
        </div>
      </app-card>
    </section>
  `,
})
export class GuidanceSettingsLink {}
