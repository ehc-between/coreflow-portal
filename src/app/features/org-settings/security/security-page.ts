import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { OrgAttachmentSettings } from '../attachment-settings/org-attachment-settings';
import { OrgDocumentSettings } from '../document-settings/org-document-settings';
import { OrgMfaSettings } from '../mfa-settings/org-mfa-settings';

/**
 * `/settings/security` (org:manage): organisation-wide rules for sign-in and
 * documents: two-step sign-in, who may approve their own documents, and which
 * attachment types are accepted.
 */
@Component({
  selector: 'app-security-page',
  imports: [PageHeader, OrgDocumentSettings, OrgMfaSettings, OrgAttachmentSettings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="settings.security.title"
        descriptionKey="settings.security.description"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'settings.security.title' },
        ]"
      />
      <div class="flex flex-col gap-8">
        <app-org-mfa-settings />
        <app-org-document-settings />
        <app-org-attachment-settings />
      </div>
    </div>
  `,
})
export class SecurityPage {
  private readonly language = inject(LanguageService);

  constructor() {
    providePageContext(() => ({
      module: null,
      view: 'settings',
      title: this.language.translate('settings.security.title'),
    }));
  }
}
