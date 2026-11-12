import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecruitmentApi } from '../data/recruitment-api';
import { requisitionStatusTone, stageTone } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ENTITY_REQUISITION,
  MODULE_KEY,
  Pipeline,
  RequisitionDetail,
  STAGES,
  Stage,
} from '../data/recruitment.models';
import { StageMove } from '../shared/stage-move';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';

/**
 * Candidate pipeline of one requisition as a kanban board (one column per stage).
 * Cards move with a "Move to" control; offers and hires happen on the application
 * page, where the background checks and the offer details are.
 */
@Component({
  selector: 'app-pipeline-board',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    RelativeTimePipe,
    Alert,
    Badge,
    Button,
    Icon,
    StageMove,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="['/recruitment/requisitions', id()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'recruitment.pipeline.back' | transloco }}
      </a>
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'recruitment.pipeline.title' | transloco }}
          </h1>
          @if (req(); as r) {
            <p class="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
              <span class="font-mono">{{ r.code }}</span>
              <span>{{ r.title }}</span>
              <app-badge [tone]="statusTone(r.status)">{{
                'recruitment.requisitionStatus.' + r.status | transloco
              }}</app-badge>
            </p>
          }
        </div>
        @if (perms().write && req()?.status === 'open') {
          <a
            [routerLink]="['/recruitment/applications/new']"
            [queryParams]="{ requisition_id: id() }"
          >
            <app-button>
              <app-icon name="userplus" [size]="15" />
              {{ 'recruitment.applications.new' | transloco }}
            </app-button>
          </a>
        }
      </div>
      <app-guide-intro class="mb-4" scope="recruitment" page="pipeline" />

      @if (error(); as key) {
        <app-alert>{{ key | transloco }}</app-alert>
      } @else if (!pipeline()) {
        <p class="text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        <div class="mb-3 flex items-center gap-2 text-[13px]">
          <label class="inline-flex items-center gap-2 text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="showClosed()"
              (change)="showClosed.set($any($event.target).checked)"
            />
            {{ 'recruitment.pipeline.showClosed' | transloco }}
          </label>
        </div>
        <div
          class="flex gap-3 overflow-x-auto pb-3"
          role="list"
          [attr.aria-label]="'recruitment.pipeline.title' | transloco"
        >
          @for (col of columns(); track col.stage) {
            <section
              role="listitem"
              class="flex w-[260px] flex-none flex-col rounded-card border border-border bg-surface-2/60"
              [attr.aria-labelledby]="'col-' + col.stage"
            >
              <h2
                [id]="'col-' + col.stage"
                class="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-[13px] font-semibold text-fg"
              >
                {{ 'recruitment.stage.' + col.stage | transloco }}
                <app-badge [tone]="stageTone(col.stage)">{{ col.items.length }}</app-badge>
              </h2>
              <ul class="flex flex-col gap-2 p-2">
                @for (item of col.items; track item.id) {
                  <li class="rounded-tile border border-border bg-surface p-2.5 shadow-sm">
                    <a
                      [routerLink]="['/recruitment/applications', item.id]"
                      class="block rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span class="block truncate text-[13.5px] font-semibold text-fg">{{
                        item.candidate_name
                      }}</span>
                      <span class="block font-mono text-[11.5px] text-fg-subtle">{{
                        item.code
                      }}</span>
                    </a>
                    <div
                      class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-muted"
                    >
                      @if (item.offer_status !== 'none') {
                        <app-badge tone="accent">{{
                          'recruitment.offerStatus.' + item.offer_status | transloco
                        }}</app-badge>
                      }
                      @if (item.stage_changed_at) {
                        <span>{{ item.stage_changed_at | relativeTime: lang() }}</span>
                      }
                    </div>
                    @if (perms().write) {
                      <app-stage-move
                        class="mt-2 w-full"
                        [applicationId]="item.id"
                        [stage]="item.stage"
                        [name]="item.candidate_name"
                        (moved)="reload()"
                      />
                    }
                  </li>
                } @empty {
                  <li class="px-1 py-3 text-center text-[12.5px] text-fg-subtle">
                    {{ 'recruitment.pipeline.emptyColumn' | transloco }}
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
      <app-why-it-matters class="mt-6 block" scope="recruitment" page="pipeline" />
    </div>
  `,
})
export class PipelineBoard {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly lang = inject(LanguageService).active;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly statusTone = requisitionStatusTone;
  protected readonly stageTone = stageTone;

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly req = signal<RequisitionDetail | null>(null);
  protected readonly pipeline = signal<Pipeline | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly showClosed = signal(false);
  private readonly version = signal(0);

  protected readonly columns = computed(() => {
    const p = this.pipeline();
    if (!p) {
      return [];
    }
    const byStage = new Map(p.stages.map((c) => [c.stage, c.items]));
    const hidden: readonly Stage[] = this.showClosed() ? [] : ['rejected', 'withdrawn'];
    return STAGES.filter((s) => !hidden.includes(s)).map((stage) => ({
      stage,
      items: byStage.get(stage) ?? [],
    }));
  });

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_REQUISITION,
      entityId: this.id(),
      view: 'board',
      title: this.req()?.title ?? null,
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.id();
      this.version();
      if (!orgId || !id) {
        return;
      }
      const subs = [
        this.api.getRequisition(orgId, id).subscribe({
          next: (r) => this.req.set(r),
          error: (err) => this.error.set(recruitmentError(err).key),
        }),
        this.api.getPipeline(orgId, id).subscribe({
          next: (p) => this.pipeline.set(p),
          error: (err) => this.error.set(recruitmentError(err).key),
        }),
      ];
      onCleanup(() => subs.forEach((s) => s.unsubscribe()));
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }
}
