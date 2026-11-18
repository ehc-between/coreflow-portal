import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { QrCode } from '../../../shared/qr-code/qr-code';
import { Button } from '../../../shared/ui/button/button';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TrainingApi } from '../data/training-api';
import { TRAINING_MODULE, trainingErrorKey } from '../data/training-display';
import { Certificate } from '../data/training.models';
import { PrintChrome } from '../shared/print-chrome';

/** The absolute verification URL of a certificate (`<origin>/verify/certificate/<code>`). */
export function verifyUrl(
  origin: string,
  c: Pick<Certificate, 'verify_path' | 'verification_code'>,
): string | null {
  const path =
    c.verify_path ??
    (c.verification_code ? `/verify/certificate/${encodeURIComponent(c.verification_code)}` : null);
  return path ? `${origin.replace(/\/+$/, '')}${path}` : null;
}

/**
 * `/training/records/:id/certificate`: a printable certificate of completion with
 * the issuer (the course owner), learning objectives, hours and provider, and a
 * verification code + QR code that anyone can check on the public page without
 * logging in. Printing hides the app around it.
 */
@Component({
  selector: 'app-certificate-page',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Button,
    ErrorState,
    LoadingState,
    PageHeader,
    PrintChrome,
    QrCode,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-print-chrome />
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7 print:p-0">
      <div class="print:hidden">
        <app-page-header
          titleKey="training.certificate.pageTitle"
          [breadcrumbs]="[
            { labelKey: 'modules.names.training', link: '/training' },
            { labelKey: 'training.records.title', link: '/training/records' },
            { labelKey: 'training.certificate.record', link: ['/training/records', id()] },
            { labelKey: 'training.certificate.pageTitle' },
          ]"
        >
          @if (certificate()) {
            <app-button primary (click)="print()" data-testid="certificate-print">
              {{ 'training.certificate.print' | transloco }}
            </app-button>
          }
        </app-page-header>
      </div>

      @if (certificate(); as c) {
        <article
          class="rounded-card border-4 border-double border-accent-border bg-surface px-6 py-10 text-center shadow-card sm:px-12 print:border-black print:shadow-none"
          data-testid="certificate"
        >
          <p class="text-ui font-semibold tracking-[0.2em] text-fg-muted uppercase">
            {{ c.org_name }}
          </p>
          <h1 class="mt-4 font-display text-page font-bold text-fg">
            {{ 'training.certificate.heading' | transloco }}
          </h1>
          <p class="mt-6 text-body text-fg-muted">
            {{ 'training.certificate.certifies' | transloco }}
          </p>
          <p class="mt-2 font-display text-page font-bold text-fg">{{ c.user_name }}</p>
          <p class="mt-4 text-body text-fg-muted">
            {{ 'training.certificate.completed' | transloco }}
          </p>
          <p class="mt-2 text-section font-semibold text-fg">
            {{ c.course_code }} · {{ c.course_title }}
          </p>
          <p class="mt-1 text-ui text-fg-muted">
            {{ 'training.certificate.version' | transloco: { version: c.course_version } }}
          </p>

          @if (c.learning_objectives?.length) {
            <section class="mx-auto mt-6 max-w-[560px] text-left">
              <h2 class="text-meta font-semibold tracking-wide text-fg-muted uppercase">
                {{ 'training.certificate.objectives' | transloco }}
              </h2>
              <ul
                class="mt-1.5 list-disc pl-5 text-ui text-fg"
                data-testid="certificate-objectives"
              >
                @for (objective of c.learning_objectives; track $index) {
                  <li>{{ objective }}</li>
                }
              </ul>
            </section>
          }

          <dl class="mx-auto mt-8 grid max-w-[560px] grid-cols-2 gap-4 text-left text-ui">
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.completed' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ c.completed_at | localDay: 'longDate' }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.certificate.validUntil' | transloco }}</dt>
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
            @if (c.hours) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.hours' | transloco }}</dt>
                <dd class="font-semibold text-fg">{{ c.hours | localNumber: '1.0-1' }}</dd>
              </div>
            }
            @if (c.provider_name) {
              <div>
                <dt class="text-fg-muted">{{ 'training.fields.provider' | transloco }}</dt>
                <dd class="font-semibold text-fg">{{ c.provider_name }}</dd>
              </div>
            }
            <div>
              <dt class="text-fg-muted">{{ 'training.fields.certificate' | transloco }}</dt>
              <dd class="font-mono font-semibold text-fg">{{ c.certificate_no }}</dd>
            </div>
            <div>
              <dt class="text-fg-muted">{{ 'training.certificate.issued' | transloco }}</dt>
              <dd class="font-semibold text-fg">{{ c.issued_at | localDay: 'longDate' }}</dd>
            </div>
          </dl>

          <div
            class="mx-auto mt-10 flex max-w-[560px] flex-wrap items-end justify-between gap-6 text-left"
          >
            <div class="min-w-[200px] flex-1">
              <div class="h-10 border-b border-fg/40"></div>
              <p class="mt-1.5 text-ui font-semibold text-fg">
                {{ c.issued_by || c.org_name }}
              </p>
              <p class="text-meta text-fg-muted">
                {{ 'training.certificate.issuedBy' | transloco }}
              </p>
            </div>
            @if (verify(); as url) {
              <div class="flex items-end gap-3" data-testid="certificate-verify">
                <app-qr-code
                  [value]="url"
                  [pixels]="104"
                  [label]="'training.certificate.qrLabel' | transloco"
                />
                <div class="max-w-[200px] text-meta text-fg-muted">
                  <p>{{ 'training.certificate.verifyHint' | transloco }}</p>
                  <p class="mt-1 font-mono font-semibold break-all text-fg">
                    {{ c.verification_code }}
                  </p>
                </div>
              </div>
            }
          </div>
        </article>
      } @else if (error(); as key) {
        <app-error-state
          titleKey="training.errors.notFoundTitle"
          [bodyKey]="key"
          (retry)="reload()"
        />
      } @else {
        <app-loading-state [rows]="6" />
      }
    </div>
  `,
})
export class CertificatePage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly document = inject(DOCUMENT);

  readonly id = input.required<string>();

  protected readonly certificate = signal<Certificate | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly tick = signal(0);
  protected readonly verify = computed(() => {
    const c = this.certificate();
    return c ? verifyUrl(this.document.location?.origin ?? '', c) : null;
  });
  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      entityType: 'training_record',
      entityId: this.id(),
      view: 'other',
      title: this.certificate()?.certificate_no ?? null,
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.tick();
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

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected print(): void {
    globalThis.print?.();
  }
}
