import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Button } from '../../../shared/ui/button/button';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { RecruitmentApi } from '../data/recruitment-api';
import { requisitionToneValue } from '../data/recruitment-display';
import { recruitmentError } from '../data/recruitment-errors';
import {
  ENTITY_REQUISITION,
  MODULE_KEY,
  Pipeline,
  RequisitionDetail,
  STAGES,
  Stage,
} from '../data/recruitment.models';
import { ApplicationIndicators } from '../shared/application-indicators';
import {
  RECRUITMENT_CRUMB,
  injectRecruitmentNav,
  settingsLinkFor,
} from '../shared/recruitment-nav';
import { injectRecruitmentPerms } from '../shared/recruitment-perms';
import { StageMove } from '../shared/stage-move';

/**
 * Candidate pipeline of one requisition. Wide screens get a board with one column
 * per stage (empty columns shrink, fades and arrows show that it scrolls); phones
 * get stage tabs with a list. Each card shows screening, checks, scorecards, time in
 * the stage and a stalled warning. Cards move with a "Move to" control; offers and
 * hires happen on the application page, where the checks and the offer details are.
 */
@Component({
  selector: 'app-pipeline-board',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    WhyItMatters,
    Button,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    StatusBadge,
    ApplicationIndicators,
    StageMove,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1400px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="recruitment.pipeline.title"
        [breadcrumbs]="breadcrumbs()"
        [settingsLink]="settingsLink()"
        [backLink]="['/recruitment/requisitions', id()]"
        backLabelKey="recruitment.pipeline.back"
      >
        @if (req(); as r) {
          <span meta class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-mono font-semibold">{{ r.code }}</span>
            <span aria-hidden="true">·</span>
            <a
              [routerLink]="['/recruitment/requisitions', r.id]"
              class="hover:text-fg hover:underline"
              >{{ r.title }}</a
            >
            <app-status-badge
              meaning="lifecycle"
              [value]="statusValue(r.status)"
              [labelKey]="'recruitment.requisitionStatus.' + r.status"
            />
          </span>
        }
        @if (perms().write && req()?.status === 'open') {
          <a
            primary
            [routerLink]="['/recruitment/applications/new']"
            [queryParams]="{ requisition_id: id() }"
          >
            <app-button size="sm">
              <app-icon name="userplus" [size]="15" />
              {{ 'recruitment.applications.new' | transloco }}
            </app-button>
          </a>
        }
      </app-page-header>
      <app-module-nav [items]="nav()" labelKey="modules.names.recruitment" />
      <app-help-strip scope="recruitment" page="pipeline" lesson="fair-screening" />

      @if (error(); as key) {
        <app-error-state [bodyKey]="key" (retry)="reload()" />
      } @else if (!pipeline()) {
        <app-loading-state [rows]="4" />
      } @else {
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-ui">
          <label class="inline-flex min-h-6 items-center gap-2 text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [checked]="showClosed()"
              (change)="showClosed.set($any($event.target).checked)"
            />
            {{ 'recruitment.pipeline.showClosed' | transloco }}
          </label>
          <div class="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-tile border border-border bg-surface text-fg-muted hover:text-fg disabled:opacity-40"
              [disabled]="!canScrollStart()"
              [attr.aria-label]="'recruitment.pipeline.scrollLeft' | transloco"
              (click)="scrollBy(-1)"
            >
              <app-icon name="back" [size]="15" />
            </button>
            <button
              type="button"
              class="inline-flex h-8 w-8 rotate-180 items-center justify-center rounded-tile border border-border bg-surface text-fg-muted hover:text-fg disabled:opacity-40"
              [disabled]="!canScrollEnd()"
              [attr.aria-label]="'recruitment.pipeline.scrollRight' | transloco"
              (click)="scrollBy(1)"
            >
              <app-icon name="back" [size]="15" />
            </button>
          </div>
        </div>

        <!-- Phones: stage tabs and one list. -->
        <div class="sm:hidden" data-testid="pipeline-mobile">
          <div
            class="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1"
            role="tablist"
            [attr.aria-label]="'recruitment.pipeline.stages' | transloco"
          >
            @for (col of columns(); track col.stage) {
              <button
                type="button"
                role="tab"
                class="flex-none rounded-full border px-3 py-1.5 text-ui font-semibold whitespace-nowrap"
                [class]="
                  col.stage === mobileStage()
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-border bg-surface text-fg-muted'
                "
                [attr.aria-selected]="col.stage === mobileStage()"
                (click)="pickStage(col.stage)"
              >
                {{ 'recruitment.stage.' + col.stage | transloco }} · {{ col.items.length }}
              </button>
            }
          </div>
          <ul class="flex flex-col gap-2">
            @for (item of mobileItems(); track item.id) {
              <li class="rounded-tile border border-border bg-surface p-3">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: item }"></ng-container>
              </li>
            } @empty {
              <li
                class="rounded-tile border border-dashed border-border px-3 py-4 text-center text-ui text-fg-muted"
              >
                {{ 'recruitment.pipeline.emptyColumn' | transloco }}
              </li>
            }
          </ul>
        </div>

        <!-- Wider screens: the board. -->
        <div class="relative hidden sm:block" data-testid="pipeline-board">
          <div
            #scroller
            class="flex gap-3 overflow-x-auto pb-3"
            role="list"
            [attr.aria-label]="'recruitment.pipeline.title' | transloco"
            (scroll)="updateScroll()"
          >
            @for (col of columns(); track col.stage) {
              <section
                role="listitem"
                class="flex flex-none flex-col rounded-card border border-border bg-surface-2/60"
                [class]="col.items.length === 0 ? 'w-[150px]' : 'w-[264px]'"
                [attr.aria-labelledby]="'col-' + col.stage"
              >
                <h2
                  [id]="'col-' + col.stage"
                  class="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-ui font-semibold text-fg"
                >
                  <span class="truncate">{{ 'recruitment.stage.' + col.stage | transloco }}</span>
                  <span
                    class="rounded-full bg-surface px-1.5 py-px text-micro font-semibold text-fg-muted"
                    >{{ col.items.length }}</span
                  >
                </h2>
                <ul class="flex flex-col gap-2 p-2">
                  @for (item of col.items; track item.id) {
                    <li class="rounded-tile border border-border bg-surface p-2.5 shadow-card">
                      <ng-container
                        *ngTemplateOutlet="card; context: { $implicit: item }"
                      ></ng-container>
                    </li>
                  } @empty {
                    <li class="px-1 py-3 text-center text-meta text-fg-subtle">
                      {{ 'recruitment.pipeline.emptyColumn' | transloco }}
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
          @if (canScrollStart()) {
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent"
            ></span>
          }
          @if (canScrollEnd()) {
            <span
              aria-hidden="true"
              data-testid="pipeline-fade-end"
              class="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent"
            ></span>
          }
        </div>
      }

      <ng-template #card let-item>
        <a
          [routerLink]="['/recruitment/applications', item.id]"
          class="block rounded-tile outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span class="block truncate text-body font-semibold text-fg">{{
            item.candidate_name
          }}</span>
          <span class="block font-mono text-meta text-fg-subtle">{{ item.code }}</span>
        </a>
        <app-application-indicators class="mt-1.5" [app]="item" />
        @if (perms().write) {
          <app-stage-move
            class="mt-2 w-full"
            [applicationId]="item.id"
            [stage]="item.stage"
            [name]="item.candidate_name"
            (moved)="reload()"
          />
        }
      </ng-template>

      <app-why-it-matters class="mt-8 block" scope="recruitment" page="pipeline" />
    </div>
  `,
})
export class PipelineBoard {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  protected readonly perms = injectRecruitmentPerms();
  protected readonly nav = injectRecruitmentNav();
  protected readonly settingsLink = computed(() => settingsLinkFor(this.perms()));
  protected readonly statusValue = requisitionToneValue;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))), {
    initialValue: null,
  });
  protected readonly req = signal<RequisitionDetail | null>(null);
  protected readonly pipeline = signal<Pipeline | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly showClosed = signal(false);
  protected readonly canScrollStart = signal(false);
  protected readonly canScrollEnd = signal(false);
  private readonly chosenStage = signal<Stage | null>(null);
  private readonly version = signal(0);

  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => {
    const r = this.req();
    return [
      RECRUITMENT_CRUMB,
      { labelKey: 'recruitment.nav.requisitions', link: '/recruitment/requisitions' },
      ...(r ? [{ label: r.title, link: ['/recruitment/requisitions', r.id] }] : []),
      { labelKey: 'recruitment.pipeline.title' },
    ];
  });

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
  /** Phones: the chosen stage, else the first stage with candidates. */
  protected readonly mobileStage = computed<Stage>(() => {
    const cols = this.columns();
    const chosen = this.chosenStage();
    if (chosen && cols.some((c) => c.stage === chosen)) {
      return chosen;
    }
    return cols.find((c) => c.items.length > 0)?.stage ?? cols[0]?.stage ?? 'applied';
  });
  protected readonly mobileItems = computed(
    () => this.columns().find((c) => c.stage === this.mobileStage())?.items ?? [],
  );

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
      this.error.set(null);
      const subs = [
        this.api.getRequisition(orgId, id).subscribe({
          next: (r) => this.req.set(r),
          error: (err) => this.error.set(recruitmentError(err).key),
        }),
        this.api.getPipeline(orgId, id).subscribe({
          next: (p) => {
            this.pipeline.set(p);
            setTimeout(() => this.updateScroll());
          },
          error: (err) => this.error.set(recruitmentError(err).key),
        }),
      ];
      onCleanup(() => subs.forEach((s) => s.unsubscribe()));
    });
    effect(() => {
      this.columns();
      setTimeout(() => this.updateScroll());
    });
  }

  protected pickStage(stage: Stage): void {
    this.chosenStage.set(stage);
  }

  protected updateScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) {
      return;
    }
    this.canScrollStart.set(el.scrollLeft > 2);
    this.canScrollEnd.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }

  protected scrollBy(direction: 1 | -1): void {
    const el = this.scroller()?.nativeElement;
    el?.scrollBy?.({ left: direction * 280, behavior: 'smooth' });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }
}
