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
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import { CertificateCheck } from '../data/training.models';

type CheckState = 'loading' | 'found' | 'not_found' | 'rate_limited' | 'error';

/** What a failed check means for the person holding the paper. */
export function checkFailure(error: unknown): CheckState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return 'not_found';
    }
    if (error.status === 429) {
      return 'rate_limited';
    }
  }
  return 'error';
}

/**
 * `/verify/certificate/:code` (public, no login): confirms a printed training
 * certificate from the code or QR code on it. Shows only what is printed on the
 * certificate — status, holder, course, dates and issuer.
 */
@Component({
  selector: 'app-certificate-verify',
  imports: [TranslocoPipe, LocalDayPipe, LanguageSwitcher, LoadingState, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-dvh bg-bg px-4 py-10 text-fg sm:px-8">
      <div class="mx-auto flex max-w-[560px] flex-col gap-5">
        <div class="flex items-center justify-between gap-3">
          <p class="font-display text-card font-bold text-fg">CoreFlow</p>
          <app-language-switcher />
        </div>
        <section
          class="rounded-card border border-border bg-surface p-6 shadow-card"
          aria-labelledby="verify-title"
          data-testid="certificate-check"
        >
          <h1 id="verify-title" class="font-display text-page font-bold text-fg">
            {{ 'training.verify.title' | transloco }}
          </h1>
          <p class="mt-1 text-body text-fg-muted">{{ 'training.verify.intro' | transloco }}</p>

          @switch (state()) {
            @case ('loading') {
              <div class="mt-5"><app-loading-state [rows]="3" /></div>
            }
            @case ('found') {
              @if (check(); as c) {
                <div class="mt-5 flex items-center gap-2" role="status">
                  <app-status-badge
                    meaning="compliance"
                    [value]="c.status === 'valid' ? 'compliant' : 'non_compliant'"
                    [labelKey]="'training.verify.status.' + c.status"
                  />
                  <span class="text-ui text-fg-muted">
                    {{ 'training.verify.statusText.' + c.status | transloco }}
                  </span>
                </div>
                <dl class="mt-5 grid gap-3 text-ui sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.verify.holder' | transloco }}
                    </dt>
                    <dd class="text-body font-semibold text-fg">{{ c.holder_name }}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.fields.course' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ c.course_title }}</dd>
                  </div>
                  <div>
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.fields.completed' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ c.completed_at | localDay }}</dd>
                  </div>
                  <div>
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.certificate.validUntil' | transloco }}
                    </dt>
                    <dd class="text-fg">
                      {{
                        c.expires_at
                          ? (c.expires_at | localDay)
                          : ('training.records.noExpiry' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.verify.organisation' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ c.org_name }}</dd>
                  </div>
                  <div>
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.certificate.issuedBy' | transloco }}
                    </dt>
                    <dd class="text-fg">{{ c.issued_by || c.org_name }}</dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-meta font-semibold text-fg-muted">
                      {{ 'training.fields.certificate' | transloco }}
                    </dt>
                    <dd class="font-mono text-meta text-fg">{{ c.certificate_no }}</dd>
                  </div>
                </dl>
              }
            }
            @default {
              <p
                class="mt-5 rounded-tile bg-warn-soft px-3 py-2 text-ui text-warn-ink"
                role="alert"
              >
                {{ 'training.verify.' + state() | transloco }}
              </p>
            }
          }
        </section>
        <p class="text-meta text-fg-subtle">{{ 'training.verify.privacy' | transloco }}</p>
      </div>
    </main>
  `,
})
export class CertificateVerify {
  private readonly api = inject(TrainingApi);

  /** Route param: the verification code printed on the certificate. */
  readonly code = input.required<string>();

  protected readonly state = signal<CheckState>('loading');
  protected readonly check = signal<CertificateCheck | null>(null);
  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const code = this.code();
      untracked(() => {
        this.sub.unsubscribe();
        this.state.set('loading');
        this.sub = this.api.verifyCertificate(code).subscribe({
          next: (c) => {
            this.check.set(c);
            this.state.set('found');
          },
          error: (err: unknown) => this.state.set(checkFailure(err)),
        });
      });
    });
  }
}
