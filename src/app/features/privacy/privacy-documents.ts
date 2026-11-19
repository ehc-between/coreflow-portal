import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { OutputsPanel } from '../../shared/outputs/outputs-panel';
import { ModuleNav } from '../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { privacyNavItems, privacyPermissions } from './privacy-nav';
import { PrivacyNotices } from './privacy-notices';

/**
 * "Dokumenter og rapporter" for GDPR (`/privacy/documents`, U12): the protocols and logs
 * Datatilsynet asks for (Art. 30 controller and processor records, the processor list,
 * the breach log, the request log; U14: the privacy notices, which become controlled
 * documents through `app-privacy-notices`) as output cards (readiness, "Lag dokument"), then
 * every privacy register as a table export.
 */
@Component({
  selector: 'app-privacy-documents',
  imports: [TranslocoPipe, OutputsPanel, ModuleNav, PageHeader, PrivacyNotices],
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
        (generated)="generated.update(bump)"
        data-testid="privacy-documents-outputs"
      />

      <app-privacy-notices [refresh]="generated()" />

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
  /** Register exports have their own section; record reports (DPIA report, letters,
   * breach notices) are made from their record's page (U14). */
  protected readonly registerExports = ['register_export', 'record_report'] as const;
  /** Bumped when a file is made, so the notices section shows the new version. */
  protected readonly generated = signal(0);
  protected readonly bump = (n: number): number => n + 1;
}
