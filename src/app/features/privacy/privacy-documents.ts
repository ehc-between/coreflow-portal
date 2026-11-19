import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { OutputsPanel } from '../../shared/outputs/outputs-panel';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { privacyNavItems, privacyPermissions } from './privacy-nav';

/**
 * "Dokumenter og rapporter" for GDPR (`/privacy/documents`, U12): the protocols and logs
 * Datatilsynet asks for (Art. 30 controller and processor records, the processor list,
 * the breach log, the request log) as output cards (readiness, "Lag dokument"), then
 * every privacy register as a table export.
 */
@Component({
  selector: 'app-privacy-documents',
  imports: [TranslocoPipe, OutputsPanel, ModuleNav, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="privacy.documents.title"
        descriptionKey="privacy.documents.subtitle"
      />
      <app-module-nav labelKey="modules.names.privacy" [items]="nav()" />

      <app-outputs-panel
        module="privacy"
        [excludeKinds]="registerExports"
        data-testid="privacy-documents-outputs"
      />

      <section class="mt-8" data-testid="privacy-documents-registers">
        <h2 class="font-display text-section font-bold text-fg">
          {{ 'privacy.documents.registers' | transloco }}
        </h2>
        <p class="mt-1 mb-3 text-ui text-fg-muted">
          {{ 'privacy.documents.registersHint' | transloco }}
        </p>
        <app-outputs-panel module="privacy" kind="register_export" />
      </section>
    </div>
  `,
})
export class PrivacyDocuments {
  protected readonly nav = privacyNavItems(privacyPermissions());
  protected readonly registerExports = ['register_export'] as const;
}
