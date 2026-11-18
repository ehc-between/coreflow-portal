import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Icon } from '../../shared/ui/icon/icon';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { PrivacyApi } from './data/privacy-api';
import { EXPORT_FORMATS, ExportFormat, ExportKind } from './data/privacy.models';
import { privacyError } from './data/privacy-errors';

/** Save a downloaded file in the browser. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

/** `behandlingsprotokoll-2026-11-18.pdf` / `record-of-processing-2026-11-18.xlsx`. */
export function exportFileName(stem: string, format: ExportFormat, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${stem}-${day}.${format}`;
}

/**
 * "Eksporter protokollen ⋯": the register as the authority or an auditor asks for it
 * (the Art. 30 record, the breach log of Art. 33(5), the request log, the processor
 * list), as PDF, Excel or CSV in the UI language. The request log never holds the
 * requester's name or contact.
 */
@Component({
  selector: 'app-privacy-export-menu',
  imports: [TranslocoPipe, Icon, OverflowMenu, MenuItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overflow-menu
      [labelKey]="'privacy.export.' + kind() + '.menu'"
      [attr.data-testid]="'export-' + kind()"
    >
      @for (f of formats; track f) {
        <button
          appMenuItem
          type="button"
          [disabled]="busy()"
          (click)="download(f)"
          [attr.data-testid]="'export-' + kind() + '-' + f"
        >
          <app-icon name="upload" [size]="15" />
          {{ 'privacy.export.format.' + f | transloco }}
        </button>
      }
    </app-overflow-menu>
  `,
})
export class PrivacyExportMenu {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);

  readonly kind = input.required<ExportKind>();

  protected readonly formats = EXPORT_FORMATS;
  protected readonly busy = signal(false);

  protected download(format: ExportFormat): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    const lang = this.language.active();
    this.api.exportFile(orgId, this.kind(), format, lang).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const stem = this.language.translate(`privacy.export.${this.kind()}.file`);
        saveFile(blob, exportFileName(stem, format));
      },
      error: (err) => {
        this.busy.set(false);
        this.notify.error(privacyError(err).key);
      },
    });
  }
}
