import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiAvailability, isAiNotConfigured } from '../../../core/ai/ai-availability';
import { SseStream } from '../../../core/ai/sse-client';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { StandardsApi } from '../../../core/standards/standards-api';
import { standardsErrorKey } from '../../../core/standards/standards-data';
import {
  GuidanceEvent,
  GuidanceSource,
  Requirement,
  StandardJob,
} from '../../../core/standards/standards.models';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StandardJobProgress } from '../job-progress';

/** Streamed "help me fulfil this" guidance for one requirement. */
export interface Guidance {
  readonly text: string;
  readonly sources: readonly GuidanceSource[];
  readonly status: 'streaming' | 'done' | 'error';
}

/** Fold one stream event into the guidance (pure; `not-configured` is handled by the caller). */
export function applyGuidanceEvent(guidance: Guidance, event: GuidanceEvent): Guidance {
  switch (event.type) {
    case 'delta':
      return { ...guidance, text: guidance.text + event.text };
    case 'sources':
      return { ...guidance, sources: Array.isArray(event.sources) ? event.sources : [] };
    case 'done':
      return { ...guidance, status: 'done' };
    case 'error':
      return { ...guidance, status: 'error' };
    default:
      return guidance;
  }
}

/**
 * The compact "AI help" section inside an expanded requirement row:
 *
 * - **Suggest evidence** (`standards:manage`): a requirement-scoped AI mapping
 *   with inline progress; when it finishes, `suggestionsChanged` asks the
 *   workspace to refetch so the new suggestions appear in the row to confirm
 *   or reject.
 * - **Help me fulfil this**: streams guidance into the row as rendered
 *   markdown, with the cited documents as links; it can be regenerated and
 *   collapsed.
 * - **Draft a document** (`standards:manage` + `documents:draft`): runs the
 *   draft job, then links to the proposal in Review.
 *
 * Everything the AI produces is labelled as a suggestion. When AI isn't
 * configured (503) the actions are replaced by a neutral hint.
 */
@Component({
  selector: 'app-requirement-ai-help',
  imports: [RouterLink, TranslocoPipe, MarkdownPipe, Button, Icon, StandardJobProgress],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-tile border border-accent-border bg-accent-soft/25 px-3 py-2.5"
      [attr.aria-label]="'standards.ai.title' | transloco"
      data-testid="ai-help"
    >
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 class="flex items-center gap-1.5 text-[13px] font-bold text-fg">
          <span class="flex text-accent"><app-icon name="spark" [size]="14" /></span>
          {{ 'standards.ai.title' | transloco }}
        </h3>
        <span class="text-[11.5px] text-fg-subtle">{{
          'standards.ai.disclaimer' | transloco
        }}</span>
      </div>

      @if (aiOff()) {
        <p class="mt-1.5 text-[12.5px] text-fg-muted" data-testid="ai-off">
          {{ 'standards.ai.notConfigured' | transloco }}
        </p>
      } @else {
        <div class="mt-2 flex flex-wrap gap-1.5">
          @if (canManage()) {
            <app-button
              size="sm"
              variant="secondary"
              data-testid="ai-suggest"
              [loading]="startingMap()"
              [disabled]="mapRunning()"
              (click)="suggestEvidence()"
            >
              <app-icon name="link" [size]="13" />
              {{ 'standards.ai.suggestEvidence' | transloco }}
            </app-button>
          }
          <app-button
            size="sm"
            variant="secondary"
            data-testid="ai-guide"
            [disabled]="guidance()?.status === 'streaming'"
            (click)="helpMe()"
          >
            <app-icon name="spark" [size]="13" />
            {{ 'standards.ai.helpMe' | transloco }}
          </app-button>
          @if (canDraft()) {
            <app-button
              size="sm"
              variant="secondary"
              data-testid="ai-draft"
              [loading]="startingDraft()"
              [disabled]="draftRunning()"
              (click)="draftDocument()"
            >
              <app-icon name="documents" [size]="13" />
              {{ 'standards.ai.draftDocument' | transloco }}
            </app-button>
          }
        </div>

        @if (mapJobId(); as jobId) {
          <div class="mt-2">
            <app-standard-job-progress
              [jobId]="jobId"
              kind="map"
              labelKey="standards.ai.suggesting"
              (finished)="onMapFinished($event)"
            />
          </div>
        }
        @if (mapError(); as key) {
          <p class="mt-2 text-[12.5px] text-fail" role="alert">{{ key | transloco }}</p>
        }

        @if (guidance(); as g) {
          <div class="mt-2.5 rounded-tile border border-border bg-surface" data-testid="guidance">
            <div class="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <span class="flex-1 text-[12px] font-semibold text-fg-muted">
                {{ 'standards.ai.guidanceTitle' | transloco }}
                <span class="ml-1 font-normal text-fg-subtle">{{
                  'standards.ai.suggestionLabel' | transloco
                }}</span>
              </span>
              @if (g.status !== 'streaming') {
                <button
                  type="button"
                  class="rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold text-accent hover:underline"
                  data-testid="guidance-regenerate"
                  (click)="startGuidance()"
                >
                  {{ 'standards.ai.regenerate' | transloco }}
                </button>
              }
              <button
                type="button"
                class="flex rounded-[6px] p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg"
                [attr.aria-expanded]="guidanceOpen()"
                [attr.aria-label]="
                  (guidanceOpen() ? 'standards.ai.collapse' : 'standards.ai.expand') | transloco
                "
                data-testid="guidance-toggle"
                (click)="guidanceOpen.set(!guidanceOpen())"
              >
                <app-icon
                  name="chevron"
                  [size]="13"
                  class="transition-transform motion-reduce:transition-none"
                  [class]="guidanceOpen() ? 'rotate-180' : ''"
                />
              </button>
            </div>
            @if (guidanceOpen()) {
              <div class="px-3 py-2.5" aria-live="polite">
                @if (g.text) {
                  <div
                    class="cf-prose text-[13px] leading-relaxed text-fg"
                    data-testid="guidance-text"
                    [innerHTML]="g.text | appMarkdown"
                  ></div>
                } @else if (g.status === 'streaming') {
                  <p class="flex items-center gap-2 text-[12.5px] text-fg-muted">
                    <span class="animate-cf-pulse inline-flex text-accent"
                      ><app-icon name="spark" [size]="13"
                    /></span>
                    {{ 'standards.ai.thinking' | transloco }}
                  </p>
                }
                @if (g.status === 'error') {
                  <p class="mt-1.5 text-[12.5px] text-fail" role="alert">
                    {{ 'standards.ai.guidanceError' | transloco }}
                  </p>
                }
                @if (g.sources.length > 0) {
                  <div class="mt-2.5">
                    <div
                      class="mb-1 text-[11px] font-bold tracking-[0.08em] text-fg-subtle uppercase"
                    >
                      {{ 'standards.ai.sources' | transloco }}
                    </div>
                    <ul class="flex flex-wrap gap-1.5" data-testid="guidance-sources">
                      @for (source of g.sources; track source.id) {
                        <li>
                          <a
                            [routerLink]="['/documents', source.id]"
                            class="inline-flex max-w-[260px] items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[12px] text-fg hover:border-accent hover:text-accent"
                          >
                            <app-icon name="documents" [size]="12" />
                            <span class="truncate">{{ source.title }}</span>
                            @if (source.doc_code) {
                              <span class="flex-none text-fg-subtle">{{ source.doc_code }}</span>
                            }
                          </a>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          </div>
        }

        @if (draftJobId(); as jobId) {
          <div class="mt-2">
            <app-standard-job-progress
              [jobId]="jobId"
              kind="draft"
              labelKey="standards.ai.drafting"
              (finished)="draftRunning.set(false)"
            />
          </div>
        }
        @if (draftError(); as key) {
          <p class="mt-2 text-[12.5px] text-fail" role="alert">{{ key | transloco }}</p>
        }
      }
    </section>
  `,
})
export class RequirementAiHelp {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly availability = inject(AiAvailability);

  readonly requirement = input.required<Requirement>();
  readonly standardKey = input.required<string>();

  /** An AI mapping of this requirement finished: refetch to show its suggestions. */
  readonly suggestionsChanged = output<void>();

  protected readonly aiOff = this.availability.unavailable;

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canManage = computed(() => this.permissions().includes('standards:manage'));
  protected readonly canDraft = computed(
    () => this.canManage() && this.permissions().includes('documents:draft'),
  );

  protected readonly mapJobId = signal<string | null>(null);
  protected readonly mapRunning = signal(false);
  protected readonly startingMap = signal(false);
  protected readonly mapError = signal<string | null>(null);

  protected readonly guidance = signal<Guidance | null>(null);
  protected readonly guidanceOpen = signal(true);

  protected readonly draftJobId = signal<string | null>(null);
  protected readonly draftRunning = signal(false);
  protected readonly startingDraft = signal(false);
  protected readonly draftError = signal<string | null>(null);

  private stream: SseStream | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stream?.cancel());
  }

  protected suggestEvidence(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.startingMap() || this.mapRunning()) {
      return;
    }
    this.startingMap.set(true);
    this.mapError.set(null);
    this.mapJobId.set(null);
    this.api
      .startAiMap(orgId, this.standardKey(), { requirement_ref: this.requirement().ref })
      .subscribe({
        next: ({ job_id }) => {
          this.startingMap.set(false);
          this.mapRunning.set(true);
          this.mapJobId.set(job_id);
        },
        error: (err: unknown) => {
          this.startingMap.set(false);
          if (isAiNotConfigured(err)) {
            this.availability.markUnavailable();
            return;
          }
          this.mapError.set(standardsErrorKey(err, 'map'));
        },
      });
  }

  protected onMapFinished(job: StandardJob | null): void {
    this.mapRunning.set(false);
    if (job?.status === 'done') {
      this.suggestionsChanged.emit();
    }
  }

  /** First click streams the guidance; afterwards it re-opens what is there. */
  protected helpMe(): void {
    const current = this.guidance();
    if (current && current.status !== 'error') {
      this.guidanceOpen.set(true);
      return;
    }
    this.startGuidance();
  }

  protected startGuidance(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.stream?.cancel();
    this.guidance.set({ text: '', sources: [], status: 'streaming' });
    this.guidanceOpen.set(true);
    this.stream = this.api.streamGuidance(
      orgId,
      this.requirement().ref,
      this.language.active(),
      (event) => {
        if (event.type === 'not-configured') {
          this.stream = null;
          this.guidance.set(null);
          this.availability.markUnavailable();
          return;
        }
        this.guidance.update((g) => (g ? applyGuidanceEvent(g, event) : g));
        if (event.type === 'done' || event.type === 'error') {
          this.stream = null;
        }
      },
    );
  }

  protected draftDocument(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.startingDraft() || this.draftRunning()) {
      return;
    }
    this.startingDraft.set(true);
    this.draftError.set(null);
    this.draftJobId.set(null);
    this.api.startAiDraft(orgId, this.requirement().ref, this.language.active()).subscribe({
      next: ({ job_id }) => {
        this.startingDraft.set(false);
        this.draftRunning.set(true);
        this.draftJobId.set(job_id);
      },
      error: (err: unknown) => {
        this.startingDraft.set(false);
        if (isAiNotConfigured(err)) {
          this.availability.markUnavailable();
          return;
        }
        this.draftError.set(standardsErrorKey(err, 'draft'));
      },
    });
  }
}
