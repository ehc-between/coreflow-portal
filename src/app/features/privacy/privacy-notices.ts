import { HttpContext, HttpErrorResponse } from '@angular/common/http';
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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/http/api.service';
import { SKIP_ERROR_TOAST } from '../../core/http/error.interceptor';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { privacyPermissions } from './privacy-nav';

/** One privacy notice (U14, `GET /privacy/notices`). */
export interface PrivacyNotice {
  readonly audience: 'customers' | 'employees' | 'applicants' | string;
  readonly output_key: string;
  readonly latest: {
    readonly id: string;
    readonly version: number;
    readonly status: string;
    readonly has_gaps: boolean;
    readonly lang: string;
    readonly generated_at: string;
  } | null;
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly doc_code: string | null;
    readonly status: string;
    readonly url: string;
  } | null;
  readonly document_output_id: string | null;
  readonly source_changed: boolean | null;
  readonly ropa: readonly { id: string; code: string; title: string; url: string }[];
}

const IN_PLACE = { context: new HttpContext().set(SKIP_ERROR_TOAST, true) };
const DOC_STATUSES = ['draft', 'in_review', 'approved', 'obsolete'];

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'loaded'; readonly items: readonly PrivacyNotice[] };

/**
 * The privacy notices (GDPR Art. 13/14) and the controlled documents they became (U14):
 * per group of people, the processing activities the notice is built from (links back
 * to the ROPA), the newest generated version and one action, "Godkjenn som dokument",
 * which makes it a document revision sent for approval in Documents. When the source
 * data has changed since, it says so ("Kildedata endret → ny revisjon").
 */
@Component({
  selector: 'app-privacy-notices',
  imports: [RouterLink, TranslocoPipe, LocalDatePipe, Badge, Button, ErrorState, LoadingState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="mt-8" data-testid="privacy-notices">
      <h2 class="font-display text-section font-bold text-fg">
        {{ 'privacy.documents.notices.title' | transloco }}
      </h2>
      <p class="mt-1 mb-3 text-ui text-fg-muted">
        {{ 'privacy.documents.notices.hint' | transloco }}
      </p>
      @switch (state().status) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @case ('loaded') {
          <ul class="flex flex-col gap-3">
            @for (n of items(); track n.audience) {
              <li
                class="rounded-card border border-border bg-surface p-4 shadow-card"
                [attr.data-testid]="'notice-' + n.audience"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="text-ui font-bold text-fg">
                      {{ 'privacy.documents.notices.audience.' + n.audience | transloco }}
                    </h3>
                    @if (n.latest; as l) {
                      <p class="text-meta text-fg-muted" data-testid="notice-version">
                        {{
                          'privacy.documents.notices.version'
                            | transloco: { version: l.version, date: (l.generated_at | localDate) }
                        }}
                        @if (l.status === 'draft') {
                          <app-badge tone="warn">
                            {{ 'privacy.documents.notices.draft' | transloco }}
                          </app-badge>
                        }
                      </p>
                    } @else {
                      <p class="text-meta text-fg-muted">
                        {{ 'privacy.documents.notices.noVersion' | transloco }}
                      </p>
                    }
                  </div>
                  @if (canAccept() && n.latest && n.latest.id !== n.document_output_id) {
                    <app-button
                      size="sm"
                      [disabled]="busy() !== null"
                      (click)="accept(n)"
                      [attr.data-testid]="'notice-accept-' + n.audience"
                    >
                      {{
                        (n.document
                          ? 'privacy.documents.notices.acceptRevision'
                          : 'privacy.documents.notices.accept'
                        ) | transloco
                      }}
                    </app-button>
                  }
                </div>

                @if (n.document; as d) {
                  <p class="mt-2 flex flex-wrap items-center gap-2 text-ui">
                    <a
                      class="font-semibold text-accent hover:underline"
                      [routerLink]="d.url"
                      data-testid="notice-document"
                    >
                      {{ d.doc_code ? d.doc_code + ' · ' + d.title : d.title }}
                    </a>
                    <app-badge tone="neutral">{{ docStatusKey(d.status) | transloco }}</app-badge>
                    @if (n.source_changed) {
                      <app-badge tone="warn" data-testid="notice-source-changed">
                        {{ 'privacy.documents.notices.sourceChanged' | transloco }}
                      </app-badge>
                    } @else if (n.source_changed === false) {
                      <app-badge tone="pass">
                        {{ 'privacy.documents.notices.upToDate' | transloco }}
                      </app-badge>
                    }
                  </p>
                }

                <p class="mt-2 text-meta text-fg-muted">
                  @if (n.ropa.length) {
                    {{ 'privacy.documents.notices.builtFrom' | transloco: { n: n.ropa.length } }}
                    @for (r of n.ropa; track r.id) {
                      <a
                        class="ml-1 text-accent hover:underline"
                        [routerLink]="r.url"
                        [attr.title]="r.title"
                        >{{ r.code }}</a
                      >
                    }
                  } @else {
                    {{ 'privacy.documents.notices.noActivities' | transloco }}
                    <a class="ml-1 text-accent hover:underline" routerLink="/privacy/ropa">
                      {{ 'privacy.documents.notices.openRopa' | transloco }}
                    </a>
                  }
                </p>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class PrivacyNotices {
  private readonly api = inject(ApiService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notify = inject(NotificationService);
  private readonly perms = privacyPermissions();

  /** Bump to reload (e.g. after a notice was generated in the outputs panel). */
  readonly refresh = input(0);

  protected readonly state = signal<State>({ status: 'loading' });
  protected readonly busy = signal<string | null>(null);
  private readonly reloads = signal(0);
  private sub: Subscription | null = null;

  protected readonly items = computed(() => {
    const s = this.state();
    return s.status === 'loaded' ? s.items : [];
  });
  protected readonly canAccept = computed(
    () => this.perms().has('privacy:write') && this.perms().has('documents:draft'),
  );

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      this.refresh();
      this.reloads();
      if (orgId) {
        untracked(() => this.load(orgId));
      }
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
  }

  protected docStatusKey(status: string): string {
    return DOC_STATUSES.includes(status)
      ? `privacy.documents.notices.docStatus.${status}`
      : 'privacy.documents.notices.docStatus.draft';
  }

  protected accept(n: PrivacyNotice): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !n.latest) {
      return;
    }
    this.busy.set(n.audience);
    this.api
      .post<{
        document: { title: string };
      }>(`v1/orgs/${orgId}/privacy/notices/${n.audience}/document`, { output_id: n.latest.id }, IN_PLACE)
      .subscribe({
        next: (res) => {
          this.busy.set(null);
          this.notify.success('privacy.documents.notices.accepted', {
            title: res.document.title,
          });
          this.reload();
        },
        error: (err: unknown) => {
          this.busy.set(null);
          const code =
            err instanceof HttpErrorResponse
              ? (err.error as { detail?: { code?: string } } | null)?.detail?.code
              : undefined;
          this.notify.error(
            code === 'source_changed'
              ? 'privacy.documents.notices.errors.sourceChanged'
              : 'privacy.documents.notices.errors.failed',
          );
          this.reload();
        },
      });
  }

  private load(orgId: string): void {
    this.sub?.unsubscribe();
    this.sub = this.api
      .get<{ items: PrivacyNotice[] }>(`v1/orgs/${orgId}/privacy/notices`, IN_PLACE)
      .subscribe({
        next: (res) => this.state.set({ status: 'loaded', items: res.items }),
        error: () => this.state.set({ status: 'error' }),
      });
  }
}
