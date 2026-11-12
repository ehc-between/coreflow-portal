import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { Card } from '../../shared/ui/card/card';

/**
 * The Settings page entry for record types and workflows. Lives with the
 * feature (scope `records`) so Settings needs no global strings for it; the
 * host shows it to `records:admin`.
 */
@Component({
  selector: 'app-records-settings-link',
  imports: [RouterLink, TranslocoPipe, Button, Card],
  viewProviders: [provideSharedScope('records')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section data-testid="settings-record-types">
      <app-card>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-0">
            <h2 class="font-display text-[16px] font-bold tracking-[-0.02em] text-fg">
              {{ 'records.settingsLink.title' | transloco }}
            </h2>
            <p class="mt-0.5 text-[13px] text-fg-muted">
              {{ 'records.settingsLink.subtitle' | transloco }}
            </p>
          </div>
          <a routerLink="/settings/record-types">
            <app-button variant="secondary">{{
              'records.settingsLink.open' | transloco
            }}</app-button>
          </a>
        </div>
      </app-card>
    </section>
  `,
})
export class RecordsSettingsLink {}
