import { DestroyRef, Injectable, inject } from '@angular/core';
import { CreateFlowService, FlowCompletion } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ContextApi } from './context-api';
import { AnalysisItem, ContextAnalysis, FOLLOW_UP_TYPES, FollowUpType } from './context.models';

/** A factor waiting for the record created from it. */
interface PendingFollowUp {
  readonly token: string;
  readonly orgId: string;
  readonly analysisId: string;
  readonly itemId: string;
  readonly at: number;
}

const STORAGE_KEY = 'coreflow.context.followUps';
/** Flow tokens live one hour on the server. */
const MAX_AGE_MS = 60 * 60 * 1000;

/** Which flows a factor offers, best first (keys of `context_analysis.to_<target>`). */
const FACTOR_TARGETS: Readonly<Record<string, readonly FollowUpType[]>> = {
  weakness: ['risk', 'objective', 'task'],
  threat: ['risk', 'task'],
  strength: ['objective', 'task'],
  opportunity: ['opportunity', 'objective', 'task'],
};
const PESTLE_TARGETS: readonly FollowUpType[] = ['risk', 'opportunity', 'task'];

/** The follow-up targets a factor offers, best first (HS 4.1 -> 6.1 / 6.2). */
export function factorTargets(category: string): readonly FollowUpType[] {
  return FACTOR_TARGETS[category] ?? PESTLE_TARGETS;
}

/** The one obvious next step per category: a risk for bad news, an objective for good news. */
const PRIMARY_TARGET: Readonly<Record<string, FollowUpType>> = {
  weakness: 'risk',
  threat: 'risk',
  strength: 'objective',
  opportunity: 'objective',
};

/**
 * Split the targets a factor offers (already narrowed to the enabled flows) into
 * the one primary action ("Gjør til risiko" / "Gjør til mål") and the rest, for
 * the factor's "⋯" menu. Falls back to the first enabled target.
 */
export function splitFactorTargets(
  category: string,
  enabled: readonly FollowUpType[],
): { primary: FollowUpType | null; rest: readonly FollowUpType[] } {
  const preferred = PRIMARY_TARGET[category] ?? 'risk';
  const primary = enabled.includes(preferred) ? preferred : (enabled[0] ?? null);
  return { primary, rest: enabled.filter((target) => target !== primary) };
}

/** Flow key of a factor follow-up (`context_analysis.to_risk`). */
export function factorFlowKey(target: FollowUpType): string {
  return `context_analysis.to_${target}`;
}

/**
 * "Create a risk from this threat": starts the analysis' create-from-here flow
 * with the factor's text as the title, and once the new record is saved (and
 * linked to the analysis by the flow) attaches it to the factor with
 * `POST …/items/{item}/follow-ups`. The pending factor is kept in session
 * storage under the flow token, so the attach still happens after the user has
 * left the analysis page for the new form.
 */
@Injectable({ providedIn: 'root' })
export class FactorFollowUps {
  private readonly flows = inject(CreateFlowService);
  private readonly api = inject(ContextApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  constructor() {
    const sub = this.flows.completed.subscribe((done) => this.onCompleted(done));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Start the flow for one factor; resolves false when it could not start. */
  start(analysis: ContextAnalysis, item: AnalysisItem, target: FollowUpType): Promise<boolean> {
    const orgId = this.selectedOrg.currentOrgId();
    const itemId = item.id;
    if (!orgId || !itemId) {
      return Promise.resolve(false);
    }
    return this.flows.start(factorFlowKey(target), 'context_analysis', analysis.id, {
      prefill: { title: item.text.trim().slice(0, 255) },
      onStarted: (token) =>
        this.remember({ token, orgId, analysisId: analysis.id, itemId, at: Date.now() }),
    });
  }

  private onCompleted(done: FlowCompletion): void {
    if (!done.token) {
      return;
    }
    const pending = this.take(done.token);
    const type = done.targetType as FollowUpType;
    if (!pending || !(FOLLOW_UP_TYPES as readonly string[]).includes(type)) {
      return;
    }
    this.api
      .addFollowUp(pending.orgId, pending.analysisId, pending.itemId, {
        entity_type: type,
        entity_id: done.targetId,
      })
      .subscribe({
        error: () => this.notifications.warning('context.analysis.followUpFailed'),
      });
  }

  private read(): PendingFollowUp[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as PendingFollowUp[]) : [];
      const now = Date.now();
      return Array.isArray(list) ? list.filter((p) => now - p.at < MAX_AGE_MS) : [];
    } catch {
      return [];
    }
  }

  private write(list: readonly PendingFollowUp[]): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // Storage unavailable: the flow still links the record to the analysis.
    }
  }

  private remember(pending: PendingFollowUp): void {
    this.write([...this.read().filter((p) => p.token !== pending.token), pending]);
  }

  private take(token: string): PendingFollowUp | null {
    const list = this.read();
    const found = list.find((p) => p.token === token) ?? null;
    if (found) {
      this.write(list.filter((p) => p !== found));
    }
    return found;
  }
}
