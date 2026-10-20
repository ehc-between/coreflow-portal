import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { StandardJob } from '../../core/standards/standards.models';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';

/** Stop polling a job that is still queued after this long (no worker picked it up). */
export const QUEUED_STALL_MS = 3 * 60_000;

/**
 * Live progress for a background standards job (AI mapping or licensed-text
 * extraction). Polls `standard-jobs/{id}` while mounted and ALWAYS emits
 * `finished` exactly once when it stops watching: with the final snapshot when
 * the job is done or failed, or with null when polling failed or the job sat
 * in the queue for {@link QUEUED_STALL_MS} — so the host can re-enable its
 * buttons. `labelKey` names the running work; the done message depends on `kind`.
 */
@Component({
  selector: 'app-standard-job-progress',
  imports: [RouterLink, TranslocoPipe, Alert, Icon, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stalled()) {
      <app-alert tone="info">{{ 'standards.job.stalled' | transloco }}</app-alert>
    } @else if (pollError()) {
      <app-alert tone="error">{{ 'standards.job.pollFailed' | transloco }}</app-alert>
    } @else if (job(); as j) {
      @if (j.status === 'failed') {
        <app-alert tone="error">
          {{ 'standards.job.failed' | transloco }}
          @if (j.error) {
            <span class="mt-0.5 block font-normal" data-testid="job-error">{{ j.error }}</span>
          }
        </app-alert>
      } @else if (j.status === 'done') {
        <app-alert tone="success">
          @if (kind() === 'map') {
            {{ 'standards.job.mapDone' | transloco: { count: j.suggestions_created } }}
          } @else if (kind() === 'draft') {
            {{ 'standards.ai.draftReady' | transloco }}
            @if (j.proposal_id) {
              <a
                [routerLink]="['/review', j.proposal_id]"
                class="mt-0.5 block font-semibold underline"
                data-testid="draft-link"
                >{{ 'standards.ai.openDraft' | transloco }}</a
              >
            }
          } @else {
            {{ 'standards.job.extractDone' | transloco }}
          }
        </app-alert>
      } @else {
        <div class="rounded-tile border border-border bg-surface-2 px-3 py-2.5" role="status">
          <div class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-fg">
            <span class="animate-cf-pulse inline-flex text-accent"
              ><app-icon name="spark" [size]="15"
            /></span>
            <span class="flex-1">{{
              (j.status === 'queued' ? 'standards.job.queued' : labelKey()) | transloco
            }}</span>
            <span class="text-fg-subtle">{{ j.progress }}%</span>
          </div>
          <app-progress-bar [value]="j.progress" [label]="labelKey() | transloco" />
        </div>
      }
    } @else {
      <div
        class="rounded-tile border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-fg-muted"
      >
        {{ labelKey() | transloco }}
      </div>
    }
  `,
})
export class StandardJobProgress {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly jobId = input.required<string>();
  /** Done message: suggestions count (map), extracted (extract), or a link to the drafted proposal (draft). */
  readonly kind = input<'map' | 'extract' | 'draft'>('map');
  readonly labelKey = input.required<string>();
  /** The final snapshot (done / failed), or null if we stopped watching without one. */
  readonly finished = output<StandardJob | null>();

  protected readonly job = signal<StandardJob | null>(null);
  protected readonly pollError = signal(false);
  protected readonly stalled = signal(false);

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const jobId = this.jobId();
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.start(orgId, jobId));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private start(orgId: string | null, jobId: string): void {
    this.sub?.unsubscribe();
    this.job.set(null);
    this.pollError.set(false);
    this.stalled.set(false);
    if (!orgId) {
      return;
    }
    const startedAt = Date.now();
    let last: StandardJob | null = null;
    let settled = false;
    const settle = (result: StandardJob | null): void => {
      if (!settled) {
        settled = true;
        this.finished.emit(result);
      }
    };
    this.sub = this.api.pollJob(orgId, jobId).subscribe({
      next: (job) => {
        last = job;
        this.job.set(job);
        if (job.status === 'queued' && Date.now() - startedAt >= QUEUED_STALL_MS) {
          this.stalled.set(true);
          this.sub?.unsubscribe();
          settle(null);
        }
      },
      error: () => {
        this.pollError.set(true);
        settle(null);
      },
      complete: () => settle(last),
    });
  }
}
