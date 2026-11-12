import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Action,
  ActionKind,
  SuggestedAction,
  SuggestedActions as SuggestedActionsResult,
} from '../../../core/deviations/deviation.models';
import { notifyDeviationError } from '../../../core/deviations/deviation-errors';
import { DeviationsApi } from '../../../core/deviations/deviations-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { actionKindLabelKey } from '../deviation-enums';

const KINDS: readonly ActionKind[] = ['containment', 'corrective', 'preventive'];

/** The suggestions of a `deviations.suggest_actions` result that can be added. */
export function usableSuggestions(result: unknown): SuggestedAction[] {
  const actions = (result as SuggestedActionsResult | null)?.actions;
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions
    .filter((a) => a && typeof a.description === 'string' && a.description.trim())
    .map((a) => ({
      kind: KINDS.includes(a.kind) ? a.kind : 'corrective',
      description: a.description.trim(),
      due_in_days: typeof a.due_in_days === 'number' ? a.due_in_days : null,
      rationale: typeof a.rationale === 'string' ? a.rationale : '',
    }));
}

/** `YYYY-MM-DD` of today plus `days` (local calendar). */
export function dueInDays(days: number | null, today: Date = new Date()): string | undefined {
  if (days === null || days < 0) {
    return undefined;
  }
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/**
 * "Suggest actions" (AI): proposes containment / corrective / preventive actions
 * for the deviation; a person reviews each and adds the ones they want as CAPA
 * actions (nothing is created without a click).
 */
@Component({
  selector: 'app-suggested-actions',
  imports: [TranslocoPipe, Badge, Button, AiAssistButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <app-ai-assist-button
        assist="deviations.suggest_actions"
        labelKey="deviations.assist.suggestActions"
        entityType="deviation"
        [entityId]="deviationId()"
        (result)="onResult($event)"
      />
      @if (suggestions().length) {
        <ul class="flex flex-col gap-2" aria-live="polite" data-testid="suggested-actions">
          @for (s of suggestions(); track $index; let i = $index) {
            <li
              class="rounded-tile border border-dashed border-accent-border bg-accent-soft/20 p-3"
            >
              <div class="flex flex-wrap items-center gap-1.5">
                <app-badge tone="neutral">{{ kindKey(s.kind) | transloco }}</app-badge>
                @if (s.due_in_days !== null) {
                  <span class="text-[12px] text-fg-subtle">{{
                    'deviations.assist.dueInDays' | transloco: { count: s.due_in_days }
                  }}</span>
                }
              </div>
              <p class="mt-1 text-[13px] text-fg">{{ s.description }}</p>
              @if (s.rationale) {
                <p class="mt-0.5 text-[12px] text-fg-muted">{{ s.rationale }}</p>
              }
              <div class="mt-2 flex gap-2">
                <app-button
                  size="sm"
                  [loading]="busy() === i"
                  [disabled]="busy() !== null"
                  (click)="add(i)"
                >
                  {{ 'deviations.assist.addAction' | transloco }}
                </app-button>
                <app-button
                  variant="ghost"
                  size="sm"
                  [disabled]="busy() !== null"
                  (click)="discard(i)"
                >
                  {{ 'deviations.assist.discard' | transloco }}
                </app-button>
              </div>
            </li>
          }
        </ul>
        <p class="text-[11.5px] text-fg-subtle">{{ 'deviations.assist.reviewNote' | transloco }}</p>
      }
    </div>
  `,
})
export class SuggestedActions {
  private readonly api = inject(DeviationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly deviationId = input.required<string>();
  /** Fires with the created action. */
  readonly added = output<Action>();

  protected readonly suggestions = signal<readonly SuggestedAction[]>([]);
  protected readonly busy = signal<number | null>(null);

  protected kindKey(kind: string): string {
    return actionKindLabelKey(kind);
  }

  protected onResult(result: unknown): void {
    this.suggestions.set(usableSuggestions(result));
  }

  protected discard(index: number): void {
    this.suggestions.set(this.suggestions().filter((_, i) => i !== index));
  }

  protected add(index: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    const suggestion = this.suggestions()[index];
    if (!orgId || !suggestion || this.busy() !== null) {
      return;
    }
    this.busy.set(index);
    this.api
      .addAction(orgId, this.deviationId(), {
        kind: suggestion.kind,
        description: suggestion.description,
        due_at: dueInDays(suggestion.due_in_days),
      })
      .subscribe({
        next: (action) => {
          this.busy.set(null);
          this.discard(index);
          this.notifications.success('deviations.actions.addedToast');
          this.added.emit(action);
        },
        error: (error: unknown) => {
          this.busy.set(null);
          notifyDeviationError(this.notifications, error);
        },
      });
  }
}
