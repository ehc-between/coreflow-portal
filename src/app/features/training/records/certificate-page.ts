import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, trainingErrorKey } from '../data/training-display';
import { Certificate } from '../data/training.models';

/** `/training/records/:id/certificate`: a printable certificate of completion. */
@Component({
  selector: 'app-certificate-page',
  imports: [RouterLink, TranslocoPipe, LocalDayPipe, Alert, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[860px] px-4 pt-6 pb-12 sm:px-8">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <a
          [routerLink]="['/training/records', id()]"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
        >
          <app-icon name="back" [size]="16" />
          {{ 'training.certificate.back' | transloco }}
        </a>
        @if (certificate()) {
          <app-button (click)="print()" data-testid="certificate-print">
            {{ 'training.certificate.print' | transloco }}
          </app-button>
        }
      </div>

      @if (certificate(); as c) {
        <article
          class="rounded-card border-4 border-double border-accent-border bg-surface px-6 py-10 text-center shadow-card sm:px-12 print:border-black print:shadow-none"
          data-testid="certificate"
        >
          <p class="text-[13px] font-semibold tracking-[0.2em] text-fg-muted uppercase">
            {{ c.org_name }}
          </p>
          <h1 class="mt-4 font-display text-[30px] font-bold tracking-[-0.02em] text-fg">
            {{ 'training.certificate.heading' | transloco }}
          </h1>
          <p class="mt-6 text-[14px] text-fg-muted">
            {{ 'training.certificate.certifies' | transloco }}
          </p>
          <p class="mt-2 font-display text-[24px] font-bold text-fg">{{ c.user_name }}</p>
          <p class="mt-4 text-[14px] text-fg-muted">
            {{ 'training.certificate.completed' | transloco }}
          </p>
          <p class="mt-2 text-[18px] font-semibold text-fg">
            {{ c.course_code }} · {{ c.course_title }}
          </p>
          <p class="mt-1 text-[13px] text-fg-muted">
            {{ 'training.certificate.version' | transloco: { version: c.course_version } }}
          </p>
          <dl class="mx-auto mt-8 grid max-w-[520px] grid-cols-2 gap-4 text-left text-[13px]">
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.completed' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ c.completed_at | localDay: 'longDate' }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.expires' | transloco }}</dt>
              <dd class="font-semibold text-fg">
                {{
                  c.expires_at
                    ? (c.expires_at | localDay: 'longDate')
                    : ('training.records.noExpiry' | transloco)
                }}
              </dd>
            </div>
            @if (c.score !== null) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.score' | transloco }}</dt>
                <dd class="font-semibold text-fg">
                  {{ 'training.stats.pct' | transloco: { value: c.score } }}
                </dd>
              </div>
            }
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.method' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ 'training.method.' + c.method | transloco }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.certificate' | transloco }}</dt>
              <dd class="font-mono font-semibold text-fg">{{ c.certificate_no }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.certificate.issued' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ c.issued_at | localDay: 'longDate' }}</dd>
            </div>
          </dl>
        </article>
      } @else if (error(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else {
        <p class="text-[13.5px] text-fg-muted" role="status">
          {{ 'training.common.loading' | transloco }}
        </p>
      }
    </div>
  `,
})
export class CertificatePage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly id = input.required<string>();

  protected readonly certificate = signal<Certificate | null>(null);
  protected readonly error = signal<string | null>(null);
  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_record',
      entityId: this.id(),
      view: 'other',
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.sub.unsubscribe();
        if (!orgId) {
          return;
        }
        this.error.set(null);
        this.sub = this.api.certificate(orgId, id).subscribe({
          next: (c) => this.certificate.set(c),
          error: (err: unknown) => this.error.set(trainingErrorKey(err)),
        });
      });
    });
  }

  protected print(): void {
    globalThis.print?.();
  }
}
