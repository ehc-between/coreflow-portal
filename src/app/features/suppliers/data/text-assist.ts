import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AiAssistApi } from '../../../core/ai/ai-assist-api';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { SseStream } from '../../../core/ai/sse-client';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';

/**
 * Runs a text assist from a "Spør KI" menu item (docs/ux-guide.md §2.7: assistant
 * actions live in the header menu, not as loose buttons). The streamed text is in
 * `text`; `running` is true while it streams. Provide it per component.
 */
@Injectable()
export class TextAssist {
  private readonly api = inject(AiAssistApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly availability = inject(AiAvailability);
  private readonly notifications = inject(NotificationService);

  readonly text = signal('');
  readonly running = signal(false);
  private stream: SseStream | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stream?.cancel());
  }

  run(key: string, input: Readonly<Record<string, unknown>>, entityType: string, entityId: string) {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.stream?.cancel();
    let accumulated = '';
    this.text.set('');
    this.running.set(true);
    this.stream = this.api.run(
      orgId,
      key,
      { input, entity_type: entityType, entity_id: entityId },
      (event) => {
        switch (event.type) {
          case 'delta':
            accumulated += event.text;
            this.text.set(accumulated);
            break;
          case 'done':
            this.finish();
            break;
          case 'error':
            this.notifications.error('suppliers.errors.generic');
            this.finish();
            break;
          case 'not-configured':
            this.availability.markUnavailable();
            this.finish();
            break;
        }
      },
    );
  }

  clear(): void {
    this.stream?.cancel();
    this.finish();
    this.text.set('');
  }

  private finish(): void {
    this.running.set(false);
    this.stream = null;
  }
}
