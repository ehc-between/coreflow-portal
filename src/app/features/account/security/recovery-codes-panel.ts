import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';

/**
 * Freshly issued recovery codes, shown exactly once (the server keeps only
 * hashes). Offers copy and download, and asks the user to confirm they saved
 * them before the panel closes.
 */
@Component({
  selector: 'app-recovery-codes-panel',
  imports: [TranslocoPipe, Alert, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4" data-testid="recovery-codes">
      <h3 class="font-display text-card font-bold text-fg">
        {{ 'auth.mfa.recovery.newTitle' | transloco }}
      </h3>
      <app-alert tone="info">{{ 'auth.mfa.recovery.newHint' | transloco }}</app-alert>
      <ul
        class="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-tile border border-border bg-surface-2 px-4 py-3 font-mono text-ui text-fg sm:grid-cols-2"
      >
        @for (code of codes(); track code) {
          <li class="select-all">{{ code }}</li>
        }
      </ul>
      <div class="flex flex-wrap justify-end gap-2">
        <app-button variant="secondary" (click)="copy()">
          {{ 'auth.mfa.recovery.copy' | transloco }}
        </app-button>
        <app-button variant="secondary" (click)="download()">
          {{ 'auth.mfa.recovery.download' | transloco }}
        </app-button>
        <app-button data-testid="recovery-codes-done" (click)="done.emit()">
          {{ 'auth.mfa.recovery.saved' | transloco }}
        </app-button>
      </div>
    </div>
  `,
})
export class RecoveryCodesPanel {
  private readonly notifications = inject(NotificationService);

  readonly codes = input.required<readonly string[]>();
  readonly done = output<void>();

  protected copy(): void {
    void navigator.clipboard
      ?.writeText(this.codes().join('\n'))
      .then(() => this.notifications.success('auth.mfa.recovery.copied'));
  }

  protected download(): void {
    const blob = new Blob([`${this.codes().join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'coreflow-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }
}
