import { Injectable, signal } from '@angular/core';
import { WorkflowAiDraft } from '../../core/records/record.models';

/** An assistant-designed draft waiting to be opened in the record type designer. */
export interface PendingDraft {
  readonly module: string;
  readonly draft: WorkflowAiDraft;
}

/**
 * Hands an AI draft from the "Describe your process" panel to the designer
 * without persisting anything: the designer takes it once (`take`) and the
 * user reviews and edits it before publishing.
 */
@Injectable({ providedIn: 'root' })
export class RecordDraftStore {
  private readonly pending = signal<PendingDraft | null>(null);

  put(draft: PendingDraft): void {
    this.pending.set(draft);
  }

  take(): PendingDraft | null {
    const draft = this.pending();
    this.pending.set(null);
    return draft;
  }
}

/** `"a, b ,c"` -> `['a', 'b', 'c']` (empty items dropped, duplicates removed). */
export function parseList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
