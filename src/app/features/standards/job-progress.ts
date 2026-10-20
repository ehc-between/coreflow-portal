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
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import { StandardJob } from '../../core/standards/standards.models';
import { Alert } from '../../shared/ui/alert/alert';
import { Icon } from '../../shared/ui/icon/icon';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';

/**
 * Live progress for a background standards job (AI mapping or licensed-text
 * extraction). Polls `standard-jobs/{id}` while mounted and emits `finished`
 * with the final snapshot. `labelKey` names the running work; the finished
 * message depends on the job kind (`kind`).
 */
@Component({
  selector: 'app-standard-job-progress',
  imports: [TranslocoPipe, Alert, Icon, ProgressBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (job(); as j) {
      @if (j.status === 'failed') {
        <app-alert tone="error">{{ 'standards.job.failed' | transloco }}</app-alert>
      } @else if (j.status === 'done') {
        <app-alert tone="success">
          @if (kind() === 'map') {
            {{ 'standards.job.mapDone' | transloco: { count: j.suggestions_created } }}
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
            <span class="flex-1">{{ labelKey() | transloco }}</span>
            <span class="text-fg-subtle">{{ j.progress }}%</span>
          </div>
          <app-progress-bar [value]="j.progress" [label]="labelKey() | transloco" />
        </div>
      }
    } @else if (error()) {
      <app-alert tone="error">{{ 'standards.job.pollFailed' | transloco }}</app-alert>
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
  readonly kind = input<'map' | 'extract'>('map');
  readonly labelKey = input.required<string>();
  readonly finished = output<StandardJob>();

  protected readonly job = signal<StandardJob | null>(null);
  protected readonly error = signal(false);

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
    this.error.set(false);
    if (!orgId) {
      return;
    }
    let last: StandardJob | null = null;
    this.sub = this.api.pollJob(orgId, jobId).subscribe({
      next: (job) => {
        last = job;
        this.job.set(job);
      },
      error: () => this.error.set(true),
      complete: () => {
        if (last) {
          this.finished.emit(last);
        }
      },
    });
  }
}
