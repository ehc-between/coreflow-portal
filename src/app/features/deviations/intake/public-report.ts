import { HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { PublicIntakeApi } from '../../../core/deviations/intake-api';
import {
  PublicIntake,
  PublicReceipt,
  PublicReportStatus,
} from '../../../core/deviations/intake.models';
import { codedErrorDetail } from '../../../core/deviations/deviation-errors';
import { LanguageSwitcher } from '../../../shared/language-switcher/language-switcher';
import { LocalDatePipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';

/** The receipt code format the backend issues (`XXXX-XXXX-XXXX-XXXX`). */
export const RECEIPT_PATTERN = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/;

/** Upper-case, trimmed, dashes between groups of four (typing without dashes works too). */
export function normalizeReceipt(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.match(/.{1,4}/g)?.join('-') ?? '';
}

/** The i18n key explaining a failed public request. */
export function publicErrorKey(error: unknown): string {
  const status = error instanceof HttpErrorResponse ? error.status : -1;
  if (status === 429) {
    return 'deviations.publicReport.errors.rateLimited';
  }
  const code = codedErrorDetail(error)?.code;
  if (code === 'intake_not_found' || code === 'receipt_not_found') {
    return `deviations.apiErrors.${code}`;
  }
  if (status === 422) {
    return 'deviations.publicReport.errors.invalid';
  }
  return 'deviations.publicReport.errors.generic';
}

/**
 * The public anonymous / whistleblowing report form behind `/report/<token>`
 * (outside the signed-in shell, no account needed). The reporter describes what
 * happened and gets a receipt code; with that code they can later check the
 * status and read any note from the people handling it. Nothing identifying is
 * asked for unless the organisation allows optional contact details; a hidden
 * honeypot field catches bots.
 */
@Component({
  selector: 'app-public-report',
  imports: [FormsModule, TranslocoPipe, LanguageSwitcher, LocalDatePipe, Alert, Button, Card, Icon],
  providers: [provideTranslocoScope('deviations')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-bg px-4 pt-6 pb-12 text-fg">
      <div class="mx-auto flex max-w-[680px] flex-col gap-5">
        <header class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2.5">
            <span
              class="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-white"
              aria-hidden="true"
            >
              <app-icon name="spark" [size]="18" />
            </span>
            <span class="font-display text-[19px] font-bold tracking-[-0.02em]">CoreFlow</span>
          </span>
          <app-language-switcher />
        </header>

        @if (loading()) {
          <app-card>
            <p class="py-6 text-center text-[14px] text-fg-muted">
              {{ 'common.loading' | transloco }}
            </p>
          </app-card>
        } @else if (intake(); as info) {
          <main class="flex flex-col gap-5">
            <div>
              <h1 class="font-display text-[24px] font-bold tracking-[-0.025em]">
                {{ 'deviations.publicReport.title.' + mode() | transloco: { org: info.org_name } }}
              </h1>
              <p class="mt-1.5 text-[14px] text-fg-muted">
                {{ 'deviations.publicReport.intro.' + mode() | transloco }}
              </p>
            </div>

            @if (info.instructions) {
              <app-card>
                <p class="text-[13.5px] whitespace-pre-line">{{ info.instructions }}</p>
              </app-card>
            }

            @if (receipt(); as r) {
              <app-card>
                <div
                  class="flex flex-col gap-3"
                  role="status"
                  aria-live="polite"
                  data-testid="receipt"
                >
                  <h2 class="font-display text-[18px] font-bold">
                    {{ 'deviations.publicReport.receipt.title' | transloco }}
                  </h2>
                  <p class="text-[13.5px] text-fg-muted">
                    {{ 'deviations.publicReport.receipt.body' | transloco }}
                  </p>
                  <p
                    class="rounded-tile border border-accent-border bg-accent-soft/40 px-4 py-3 text-center font-mono text-[20px] font-bold tracking-[0.12em]"
                    data-testid="receipt-code"
                  >
                    {{ r.receipt_code }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <app-button variant="secondary" size="sm" (click)="copy(r.receipt_code)">
                      {{ 'deviations.publicReport.receipt.copy' | transloco }}
                    </app-button>
                    <app-button variant="ghost" size="sm" (click)="another()">
                      {{ 'deviations.publicReport.receipt.another' | transloco }}
                    </app-button>
                  </div>
                </div>
              </app-card>
            } @else {
              <app-card>
                <form
                  class="flex flex-col gap-4"
                  (ngSubmit)="submit()"
                  data-testid="public-report-form"
                >
                  <div class="flex flex-col gap-1.5">
                    <label for="pr-title" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.publicReport.fields.title' | transloco }}
                      <span class="text-fail" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="pr-title"
                      name="title"
                      type="text"
                      required
                      minlength="3"
                      maxlength="255"
                      autocomplete="off"
                      [ngModel]="title()"
                      (ngModelChange)="title.set($event)"
                      [attr.aria-invalid]="showErrors() && !titleValid()"
                      aria-describedby="pr-title-hint"
                      class="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-accent"
                    />
                    <p id="pr-title-hint" class="text-[12px] text-fg-subtle">
                      {{ 'deviations.publicReport.hints.title' | transloco }}
                    </p>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label for="pr-description" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.publicReport.fields.description' | transloco }}
                      <span class="text-fail" aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id="pr-description"
                      name="description"
                      rows="7"
                      required
                      minlength="10"
                      maxlength="20000"
                      [ngModel]="description()"
                      (ngModelChange)="description.set($event)"
                      [attr.aria-invalid]="showErrors() && !descriptionValid()"
                      aria-describedby="pr-description-hint"
                      class="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent"
                    ></textarea>
                    <p id="pr-description-hint" class="text-[12px] text-fg-subtle">
                      {{ 'deviations.publicReport.hints.description' | transloco }}
                    </p>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-1.5">
                      <label for="pr-date" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.publicReport.fields.occurredOn' | transloco }}
                      </label>
                      <input
                        id="pr-date"
                        name="occurredOn"
                        type="date"
                        [ngModel]="occurredOn()"
                        (ngModelChange)="occurredOn.set($event)"
                        class="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-accent"
                      />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="pr-location" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.publicReport.fields.location' | transloco }}
                      </label>
                      <input
                        id="pr-location"
                        name="location"
                        type="text"
                        maxlength="200"
                        autocomplete="off"
                        [ngModel]="location()"
                        (ngModelChange)="location.set($event)"
                        class="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  @if (info.allow_contact) {
                    <div class="flex flex-col gap-1.5">
                      <label for="pr-contact" class="text-[13px] font-semibold text-fg-muted">
                        {{ 'deviations.publicReport.fields.contact' | transloco }}
                      </label>
                      <input
                        id="pr-contact"
                        name="contact"
                        type="text"
                        maxlength="500"
                        autocomplete="off"
                        [ngModel]="contact()"
                        (ngModelChange)="contact.set($event)"
                        aria-describedby="pr-contact-hint"
                        class="h-10 rounded-[10px] border border-border bg-surface px-3 text-[14px] outline-none focus:border-accent"
                      />
                      <p id="pr-contact-hint" class="text-[12px] text-fg-subtle">
                        {{ 'deviations.publicReport.hints.contact' | transloco }}
                      </p>
                    </div>
                  }
                  <!-- Honeypot: hidden from people and assistive technology; bots fill it. -->
                  <div
                    class="absolute -left-[10000px] h-px w-px overflow-hidden"
                    aria-hidden="true"
                  >
                    <label for="pr-website">{{
                      'deviations.publicReport.honeypot' | transloco
                    }}</label>
                    <input
                      id="pr-website"
                      name="website"
                      type="text"
                      tabindex="-1"
                      autocomplete="off"
                      [ngModel]="website()"
                      (ngModelChange)="website.set($event)"
                    />
                  </div>

                  @if (showErrors() && !valid()) {
                    <app-alert tone="error">{{
                      'deviations.publicReport.errors.invalid' | transloco
                    }}</app-alert>
                  }
                  @if (submitError(); as key) {
                    <app-alert tone="error">{{ key | transloco }}</app-alert>
                  }
                  <p class="text-[12.5px] text-fg-muted">
                    {{ 'deviations.publicReport.privacy.' + mode() | transloco }}
                  </p>
                  <div>
                    <app-button type="submit" [loading]="submitting()">
                      {{ 'deviations.publicReport.submit' | transloco }}
                    </app-button>
                  </div>
                </form>
              </app-card>
            }

            <app-card>
              <form
                class="flex flex-col gap-3"
                (ngSubmit)="checkStatus()"
                data-testid="status-form"
              >
                <h2 class="font-display text-[16px] font-bold">
                  {{ 'deviations.publicReport.status.title' | transloco }}
                </h2>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div class="flex flex-1 flex-col gap-1.5">
                    <label for="pr-receipt" class="text-[13px] font-semibold text-fg-muted">
                      {{ 'deviations.publicReport.status.code' | transloco }}
                    </label>
                    <input
                      id="pr-receipt"
                      name="receipt"
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      [ngModel]="receiptCode()"
                      (ngModelChange)="receiptCode.set($event)"
                      class="h-10 rounded-[10px] border border-border bg-surface px-3 font-mono text-[14px] tracking-[0.08em] uppercase outline-none focus:border-accent"
                    />
                  </div>
                  <app-button
                    type="submit"
                    variant="secondary"
                    [loading]="checking()"
                    [disabled]="!receiptValid()"
                  >
                    {{ 'deviations.publicReport.status.check' | transloco }}
                  </app-button>
                </div>
                @if (statusError(); as key) {
                  <app-alert tone="error">{{ key | transloco }}</app-alert>
                }
                @if (status(); as s) {
                  <div
                    class="rounded-tile border border-border p-3 text-[13.5px]"
                    role="status"
                    aria-live="polite"
                    data-testid="report-status"
                  >
                    <p class="font-semibold">
                      {{ 'deviations.publicReport.status.states.' + s.status | transloco }}
                    </p>
                    <p class="mt-0.5 text-[12.5px] text-fg-muted">
                      {{
                        'deviations.publicReport.status.dates'
                          | transloco
                            : {
                                received: (s.received_at | localDate: 'medium'),
                                updated: (s.updated_at | localDate: 'medium'),
                              }
                      }}
                    </p>
                    @if (s.public_note) {
                      <p class="mt-2 whitespace-pre-line">
                        <span class="font-semibold">{{
                          'deviations.publicReport.status.note' | transloco
                        }}</span>
                        {{ s.public_note }}
                      </p>
                    }
                  </div>
                }
              </form>
            </app-card>
          </main>
        } @else {
          <app-card>
            <div
              class="flex flex-col items-center gap-2 py-8 text-center"
              data-testid="intake-unavailable"
            >
              <h1 class="font-display text-[18px] font-bold">
                {{ 'deviations.publicReport.unavailable.title' | transloco }}
              </h1>
              <p class="max-w-[420px] text-[13.5px] text-fg-muted">
                {{ 'deviations.publicReport.unavailable.body' | transloco }}
              </p>
            </div>
          </app-card>
        }
      </div>
    </div>
  `,
})
export class PublicReportPage {
  private readonly api = inject(PublicIntakeApi);
  private readonly document = inject(DOCUMENT);

  /** Route param `token`. */
  readonly token = input.required<string>();

  protected readonly intake = signal<PublicIntake | null>(null);
  protected readonly loading = signal(true);
  protected readonly mode = computed(() =>
    this.intake()?.mode === 'whistleblowing' ? 'whistleblowing' : 'anonymous',
  );

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly occurredOn = signal('');
  protected readonly location = signal('');
  protected readonly contact = signal('');
  protected readonly website = signal('');
  protected readonly showErrors = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly receipt = signal<PublicReceipt | null>(null);

  protected readonly receiptCode = signal('');
  protected readonly checking = signal(false);
  protected readonly status = signal<PublicReportStatus | null>(null);
  protected readonly statusError = signal<string | null>(null);

  protected readonly titleValid = computed(() => this.title().trim().length >= 3);
  protected readonly descriptionValid = computed(() => this.description().trim().length >= 10);
  protected readonly valid = computed(() => this.titleValid() && this.descriptionValid());
  protected readonly receiptValid = computed(() =>
    RECEIPT_PATTERN.test(normalizeReceipt(this.receiptCode())),
  );

  constructor() {
    effect(() => {
      const token = this.token();
      untracked(() => this.load(token));
    });
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    this.showErrors.set(true);
    this.submitError.set(null);
    if (!this.valid()) {
      return;
    }
    this.submitting.set(true);
    this.api
      .submit(this.token(), {
        title: this.title().trim(),
        description: this.description().trim(),
        occurred_on: this.occurredOn() || null,
        location: this.location().trim() || null,
        contact: this.intake()?.allow_contact ? this.contact().trim() || null : null,
        website: this.website(),
      })
      .subscribe({
        next: (receipt) => {
          this.submitting.set(false);
          this.receipt.set(receipt);
          this.receiptCode.set(receipt.receipt_code);
          this.showErrors.set(false);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(publicErrorKey(error));
        },
      });
  }

  protected another(): void {
    this.receipt.set(null);
    this.title.set('');
    this.description.set('');
    this.occurredOn.set('');
    this.location.set('');
    this.contact.set('');
  }

  protected checkStatus(): void {
    const code = normalizeReceipt(this.receiptCode());
    if (!RECEIPT_PATTERN.test(code) || this.checking()) {
      return;
    }
    this.receiptCode.set(code);
    this.checking.set(true);
    this.statusError.set(null);
    this.status.set(null);
    this.api.status(this.token(), code).subscribe({
      next: (status) => {
        this.checking.set(false);
        this.status.set(status);
      },
      error: (error: unknown) => {
        this.checking.set(false);
        this.statusError.set(publicErrorKey(error));
      },
    });
  }

  protected copy(code: string): void {
    void this.document.defaultView?.navigator?.clipboard?.writeText(code).catch(() => undefined);
  }

  private load(token: string): void {
    this.loading.set(true);
    this.intake.set(null);
    this.api.get(token).subscribe({
      next: (info) => {
        this.intake.set(info);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
