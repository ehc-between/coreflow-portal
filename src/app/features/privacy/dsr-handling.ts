import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { LocalDatePipe } from '../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../shared/markdown/markdown.pipe';
import { Alert } from '../../shared/ui/alert/alert';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { PrivacyApi } from './data/privacy-api';
import {
  DSR_STEP_KEYS,
  DataSubjectRequest,
  DsrStep,
  DsrStepKey,
  DsrSystem,
} from './data/privacy.models';
import { privacyError } from './data/privacy-errors';

/** The checklist as shown: the backend's steps, or all open when it sends none. */
export function requestSteps(r: DataSubjectRequest): readonly DsrStep[] {
  const byKey = new Map((r.steps ?? []).map((s) => [s.key, s]));
  return DSR_STEP_KEYS.map(
    (key) =>
      byKey.get(key) ?? {
        key,
        done:
          (key === 'verify_identity' && !!r.identity_verified_at) ||
          (key === 'send_reply' && !!r.responded_at),
        done_at:
          key === 'verify_identity'
            ? r.identity_verified_at
            : key === 'send_reply'
              ? r.responded_at
              : null,
      },
  );
}

/**
 * How to handle a request from a data subject, step by step (Art. 12, 15-22): verify
 * who is asking, search the systems that hold their data (derived from the active
 * processing activities), draft the reply (the assistant can help), and send it. Each
 * step is ticked here; closing the request is still the status change with its outcome.
 */
@Component({
  selector: 'app-privacy-dsr-handling',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    MarkdownPipe,
    AiAssistButton,
    Alert,
    Card,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = request();
    <app-card>
      <h2 class="mb-1 flex items-center gap-2 font-display text-card font-bold text-fg">
        <app-icon name="checkcircle" [size]="16" />
        {{ 'privacy.dsr.handlingTitle' | transloco }}
      </h2>
      <p class="mb-3 text-ui text-fg-muted">{{ 'privacy.dsr.handlingIntro' | transloco }}</p>
      <ol class="flex flex-col gap-2" data-testid="dsr-steps">
        @for (s of steps(); track s.key; let i = $index) {
          <li
            class="rounded-tile border border-border px-3 py-2"
            [attr.data-testid]="'dsr-step-' + s.key"
          >
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                class="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
                [checked]="s.done"
                [disabled]="!canWrite() || busy() || closed()"
                (change)="toggle(s.key, $any($event.target).checked)"
                [attr.data-testid]="'dsr-tick-' + s.key"
              />
              <span class="min-w-0">
                <span class="block text-ui font-semibold text-fg">
                  {{ i + 1 }}. {{ 'privacy.dsr.steps.' + s.key + '.title' | transloco }}
                </span>
                <span class="block text-meta text-fg-muted">
                  @if (s.done && s.done_at) {
                    {{ 'privacy.dsr.stepDone' | transloco: { date: (s.done_at | localDate) } }}
                  } @else {
                    {{ 'privacy.dsr.steps.' + s.key + '.body' | transloco }}
                  }
                </span>
              </span>
            </label>

            @if (s.key === 'search_systems') {
              <div class="mt-2 pl-7">
                @if (systems().length) {
                  <p class="mb-1 text-meta font-semibold text-fg-muted">
                    {{ 'privacy.dsr.systemsTitle' | transloco: { count: systems().length } }}
                  </p>
                  <ul class="flex flex-col gap-1" data-testid="dsr-systems">
                    @for (sys of systems(); track sys.ropa_entry_id) {
                      <li class="text-meta text-fg">
                        <a [routerLink]="sys.url" class="font-semibold text-accent hover:underline">
                          <span class="font-mono">{{ sys.code }}</span> {{ sys.title }}
                        </a>
                        @if (sys.systems.length) {
                          <span class="text-fg-muted"> · {{ sys.systems.join(', ') }}</span>
                        }
                        @if (sys.retention_period) {
                          <span class="text-fg-subtle">
                            ·
                            {{
                              'privacy.dsr.systemRetention'
                                | transloco: { period: sys.retention_period }
                            }}</span
                          >
                        }
                      </li>
                    }
                  </ul>
                } @else if (systemsLoaded()) {
                  <p class="text-meta text-fg-subtle">{{ 'privacy.dsr.noSystems' | transloco }}</p>
                }
              </div>
            }

            @if (s.key === 'draft_reply' && canWrite() && !closed()) {
              <div class="mt-2 pl-7">
                <app-ai-assist-button
                  #assist
                  [quiet]="true"
                  assist="privacy.draft_dsr_reply"
                  entityType="data_subject_request"
                  [entityId]="r.id"
                  labelKey="privacy.ai.draftReply"
                  (text)="reply.set($event)"
                />
                @if (reply(); as text) {
                  <div
                    class="mt-2 max-h-[360px] overflow-y-auto rounded-tile bg-surface-2 p-3 text-ui text-fg"
                    [innerHTML]="text | appMarkdown"
                    aria-live="polite"
                    data-testid="dsr-reply-draft"
                  ></div>
                  <p class="mt-1 text-meta text-fg-subtle">
                    {{ 'privacy.ai.disclaimer' | transloco }}
                  </p>
                }
              </div>
            }
          </li>
        }
      </ol>
      @if (error(); as e) {
        <app-alert tone="error" class="mt-3 block">{{ e | transloco }}</app-alert>
      }
    </app-card>
  `,
})
export class DsrHandling {
  private readonly api = inject(PrivacyApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly request = input.required<DataSubjectRequest>();
  readonly canWrite = input(false);
  readonly changed = output<DataSubjectRequest>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reply = signal<string | null>(null);
  private readonly assist = viewChild<AiAssistButton>('assist');
  /** The reply can be drafted now (the request is open and the user may write). */
  readonly canDraft = computed(() => this.canWrite() && !this.closed());
  protected readonly systems = signal<readonly DsrSystem[]>([]);
  protected readonly systemsLoaded = signal(false);

  protected readonly steps = computed(() => requestSteps(this.request()));
  protected readonly closed = computed(() => !!this.request().closed_at);
  private readonly requestId = computed(() => this.request().id);

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.requestId();
      untracked(() => this.loadSystems(orgId, id));
    });
  }

  /** Draft the reply with the assistant ("Spør KI" menu of the page). */
  draftReply(): void {
    this.assist()?.run();
  }

  protected toggle(step: DsrStepKey, done: boolean): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.setRequestStep(orgId, this.request().id, step, done).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.changed.emit(r);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(privacyError(err).key);
      },
    });
  }

  private loadSystems(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    if (!orgId) {
      return;
    }
    this.sub = this.api.requestSystems(orgId, id).subscribe({
      next: (res) => {
        this.systems.set(res.items);
        this.systemsLoaded.set(true);
      },
      error: () => {
        this.systems.set([]);
        this.systemsLoaded.set(true);
      },
    });
  }
}
