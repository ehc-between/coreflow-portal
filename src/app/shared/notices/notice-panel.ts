import { DOCUMENT } from '@angular/common';
import { HttpContext } from '@angular/common/http';
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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../core/http/error.interceptor';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { Output } from '../../core/outputs/outputs.models';
import { LocalDatePipe } from '../locale/locale-pipes';
import { GenerateDialog } from '../outputs/generate-dialog';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { StatusBadge } from '../ui/status-badge/status-badge';

export const NOTICES_SCOPE = 'notices';

/** One part of a notice, copied on its own into the authority's form. */
export interface NoticeSection {
  readonly key: string;
  readonly label: string;
  readonly hint: string | null;
  readonly text: string;
  readonly required: boolean;
  readonly missing: boolean;
}

/** One notification stage (Art. 33 notice, Art. 34 letter, a NIS2 report). */
export interface NoticeStage {
  readonly key: string;
  readonly output_key: string;
  readonly title: string;
  readonly recipient: string;
  readonly article: string;
  readonly intro: string | null;
  readonly status: 'pending' | 'overdue' | 'sent' | 'not_required' | 'closed_unreported';
  readonly due_at: string | null;
  readonly sent_at: string | null;
  readonly reference: string | null;
  readonly missing: number;
  readonly sections: readonly NoticeSection[];
  readonly text: string;
}

export interface NoticeList {
  readonly lang: string;
  readonly stages: readonly NoticeStage[];
}

const INLINE = new HttpContext().set(SKIP_ERROR_TOAST, true);

export function noticeTone(status: NoticeStage['status']): string {
  switch (status) {
    case 'sent':
      return 'done';
    case 'not_required':
      return 'not_applicable';
    case 'closed_unreported':
      return 'failed';
    default:
      return status;
  }
}

/**
 * "Varsling" (U13): the notices a record triggers (GDPR Art. 33 to Datatilsynet and
 * Art. 34 to the people affected; the three NIS2 reports to the CSIRT), drafted
 * from the record's own fields. Every section can be copied on its own into the
 * form in Altinn; fields the record does not have yet are flagged. "Lagre som
 * dokument" stores a timestamped copy through the output platform. When a notice
 * was sent is recorded on the record itself (breach decisions / Meldeplikt).
 */
@Component({
  selector: 'app-notice-panel',
  imports: [TranslocoPipe, LocalDatePipe, Button, Icon, StatusBadge, GenerateDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [provideSharedScope(NOTICES_SCOPE)],
  template: `
    @if (stages().length) {
      <section
        class="rounded-card border border-border bg-surface p-5"
        aria-labelledby="notice-panel-title"
        data-testid="notice-panel"
      >
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <app-icon name="send" [size]="17" class="text-fg-muted" />
          <h2 id="notice-panel-title" class="font-display text-section font-bold text-fg">
            {{ 'notices.title' | transloco }}
          </h2>
        </div>
        <p class="mb-4 text-meta text-fg-muted">{{ 'notices.intro' | transloco }}</p>
        <ul class="flex flex-col gap-3">
          @for (s of stages(); track s.key) {
            <li class="rounded-tile border border-border p-3.5" [attr.data-stage]="s.key">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-ui font-semibold text-fg">{{ s.title }}</p>
                  <p class="text-meta text-fg-muted">
                    {{ 'notices.to' | transloco: { recipient: s.recipient } }}
                  </p>
                </div>
                <app-status-badge
                  meaning="lifecycle"
                  [value]="tone(s.status)"
                  [labelKey]="'notices.status.' + s.status"
                />
              </div>
              <p class="mt-2 text-ui text-fg" data-testid="notice-due">
                @if (s.sent_at) {
                  {{ 'notices.sentOn' | transloco: { date: (s.sent_at | localDate) } }}
                  @if (s.reference) {
                    · {{ 'notices.reference' | transloco: { ref: s.reference } }}
                  }
                } @else if (s.due_at) {
                  {{ 'notices.due' | transloco: { date: (s.due_at | localDate) } }}
                } @else if (s.status !== 'not_required') {
                  {{ 'notices.withoutDelay' | transloco }}
                }
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <app-button
                  size="sm"
                  variant="secondary"
                  [attr.aria-expanded]="open() === s.key"
                  (click)="toggle(s.key)"
                  data-testid="notice-toggle"
                >
                  <app-icon name="documents" [size]="14" />
                  {{ (open() === s.key ? 'notices.hideDraft' : 'notices.showDraft') | transloco }}
                </app-button>
                @if (s.missing) {
                  <span class="text-meta font-semibold text-warn-ink" data-testid="notice-missing">
                    {{ 'notices.missingCount' | transloco: { count: s.missing } }}
                  </span>
                }
              </div>
              @if (open() === s.key) {
                <div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                  @if (s.intro) {
                    <p class="text-meta text-fg-muted">{{ s.intro }}</p>
                  }
                  @for (sec of s.sections; track sec.key) {
                    <div
                      class="rounded-tile border p-3"
                      [class]="sec.missing ? 'border-warn/50 bg-warn/5' : 'border-border'"
                      [attr.data-section]="sec.key"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-meta font-semibold text-fg">{{ sec.label }}</p>
                          @if (sec.hint) {
                            <p class="text-meta text-fg-muted">{{ sec.hint }}</p>
                          }
                        </div>
                        @if (sec.text) {
                          <app-button
                            variant="ghost"
                            size="sm"
                            (click)="copy(sec.text)"
                            [attr.aria-label]="'notices.copyPart' | transloco: { part: sec.label }"
                            data-testid="notice-copy"
                          >
                            {{ 'notices.copy' | transloco }}
                          </app-button>
                        }
                      </div>
                      @if (sec.text) {
                        <p class="mt-1 text-ui whitespace-pre-line text-fg">{{ sec.text }}</p>
                      } @else if (sec.missing) {
                        <p class="mt-1 text-ui font-semibold text-warn-ink">
                          {{ 'notices.missing' | transloco }}
                        </p>
                      } @else {
                        <p class="mt-1 text-ui text-fg-muted">
                          {{ 'notices.optional' | transloco }}
                        </p>
                      }
                    </div>
                  }
                  <div class="flex flex-wrap justify-end gap-2">
                    <app-button
                      variant="secondary"
                      size="sm"
                      (click)="copy(s.text)"
                      data-testid="notice-copy-all"
                    >
                      {{ 'notices.copyAll' | transloco }}
                    </app-button>
                    @if (canSave()) {
                      <app-button
                        size="sm"
                        [loading]="opening() === s.output_key"
                        (click)="save(s)"
                        data-testid="notice-save"
                      >
                        {{ 'notices.save' | transloco }}
                      </app-button>
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      </section>
      @if (output(); as out) {
        <app-generate-dialog
          [open]="!!output()"
          [output]="out"
          [entityId]="entityId()"
          (closed)="output.set(null)"
        />
      }
    }
  `,
})
export class NoticePanel {
  private readonly api = inject(ApiService);
  private readonly outputs = inject(OutputsApi);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly document = inject(DOCUMENT);

  /** Path under the org, e.g. `privacy/breaches/<id>/notices`. */
  readonly path = input.required<string>();
  /** The record the notices are about (stored drafts are record reports). */
  readonly entityId = input.required<string>();
  /** Changes when the record changes (its `updated_at` or a new copy): reload the drafts. */
  readonly version = input<unknown>(null);
  /** May store a draft as a document (the output's own permission is checked too). */
  readonly canSave = input(false);

  protected readonly stages = signal<readonly NoticeStage[]>([]);
  protected readonly open = signal<string | null>(null);
  protected readonly opening = signal<string | null>(null);
  protected readonly output = signal<Output | null>(null);
  protected readonly tone = noticeTone;

  private sub: Subscription | null = null;

  constructor() {
    effect(() => {
      const path = this.path();
      const lang = this.language.active();
      this.version();
      untracked(() => this.load(path, lang));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  private load(path: string, lang: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.sub?.unsubscribe();
    this.sub = this.api
      .get<NoticeList>(`v1/orgs/${orgId}/${path}`, {
        params: { lang: lang === 'nb' ? 'nb' : 'en' },
        context: INLINE,
      })
      .subscribe({
        next: (list) => this.stages.set(list.stages),
        error: () => this.stages.set([]),
      });
  }

  protected toggle(key: string): void {
    this.open.update((current) => (current === key ? null : key));
  }

  protected copy(text: string): void {
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (!clipboard || !text) {
      return;
    }
    clipboard.writeText(text).then(
      () => this.notifications.success('notices.copied'),
      () => undefined,
    );
  }

  protected save(stage: NoticeStage): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.opening.set(stage.output_key);
    this.outputs.get(orgId, stage.output_key).subscribe({
      next: (out) => {
        this.opening.set(null);
        this.output.set(out);
      },
      error: () => {
        this.opening.set(null);
        this.notifications.error('notices.saveFailed');
      },
    });
  }
}
