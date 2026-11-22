import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TasksApi } from '../../core/tasks/tasks-api';
import { WorkItem } from '../../core/tasks/task.models';
import { ReqPills } from '../../shared/requirement-links/req-pills';
import { StarterSetup } from '../../shared/starter-setup/starter-setup';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { laneOf } from '../my-work/my-work-data';
import { HandbookApi } from './data/handbook-api';
import { HandbookStore } from './data/handbook-store';
import { groupProcedures, isEmptyMap, moveInBand, waitingItems } from './data/handbook.logic';
import { HandbookBand, HandbookBox, HandbookDocument, HandbookMap } from './data/handbook.models';
import { HandbookArrow, HandbookProcessBox } from './process-box';

export type HandbookTab = 'map' | 'procedures' | 'waiting';
const TABS: readonly HandbookTab[] = ['map', 'procedures', 'waiting'];

/** `?tab=` → tab (default the process map). */
export function parseTab(value: string | null | undefined): HandbookTab {
  return TABS.includes(value as HandbookTab) ? (value as HandbookTab) : 'map';
}

/** Requirement refs per band (prototype; shown only with "Vis krav" on). */
const BAND_REFS: Readonly<Record<HandbookBand, readonly string[]>> = {
  management: ['ISO 9001 5', 'ISO 9001 9.3'],
  core: ['ISO 9001 4.4', 'ISO 9001 8'],
  support: ['ISO 9001 7', 'ISO 27001 A.5–A.8'],
};

const LINK_BTN =
  'inline-flex h-9 items-center justify-center gap-2 rounded-tile border px-4 text-ui font-semibold whitespace-nowrap';
const PRIMARY = `${LINK_BTN} border-transparent bg-accent text-white hover:bg-accent-2`;
const SECONDARY = `${LINK_BTN} border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2`;
const SMALL =
  'inline-flex h-8 items-center justify-center rounded-tile border border-border bg-surface px-3 text-ui font-semibold whitespace-nowrap text-fg hover:border-border-strong hover:bg-surface-2';
const TEXT_LINK = 'text-ui font-semibold text-accent hover:underline';

/**
 * Håndbok `/handbook` (IA v2 §5.8, prototype `handbok`): the company process map —
 * management band on top ("styrer og følger opp"), the value chain from "Kunden har
 * et behov" to "Fornøyd kunde", the support band below ("støtter") — plus the tabs
 * "Alle prosedyrer" (grouped by process) and "Venter på deg" (my approvals and read
 * confirmations of work procedures). One primary action: "+ Ny prosedyre".
 */
@Component({
  selector: 'app-handbook-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    ErrorState,
    HandbookArrow,
    HandbookProcessBox,
    LoadingState,
    PageHeader,
    ReqPills,
    StarterSetup,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1240px] px-4 py-7 sm:px-6">
      <app-page-header titleKey="handbook.title" descriptionKey="handbook.intro">
        @if (canWrite()) {
          <button
            secondary
            type="button"
            [class]="secondaryClass"
            (click)="starter()?.open()"
            data-testid="handbook-propose"
          >
            {{ 'handbook.actions.propose' | transloco }}
          </button>
        }
        @if (canDraft()) {
          <a
            primary
            [class]="primaryClass"
            routerLink="/documents/new"
            [queryParams]="{ type: 'procedure' }"
            data-testid="handbook-new-procedure"
            >{{ 'handbook.actions.newProcedure' | transloco }}</a
          >
        }
      </app-page-header>

      <div
        class="mb-5 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
        role="tablist"
        [attr.aria-label]="'handbook.tabs.label' | transloco"
      >
        @for (t of tabs; track t) {
          <button
            type="button"
            role="tab"
            class="-mb-px flex-none border-b-2 px-3 py-2.5 text-ui font-semibold whitespace-nowrap"
            [class.border-accent]="tab() === t"
            [class.text-fg]="tab() === t"
            [class.border-transparent]="tab() !== t"
            [class.text-fg-muted]="tab() !== t"
            [attr.aria-selected]="tab() === t"
            (click)="setTab(t)"
            [attr.data-testid]="'handbook-tab-' + t"
          >
            {{ tabLabel(t) | transloco: { count: tabCount(t) } }}
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('map') {
          @switch (store.status()) {
            @case ('error') {
              <app-error-state (retry)="store.load(true)" />
            }
            @case ('ready') {
              @if (store.map(); as m) {
                @if (empty()) {
                  <div
                    class="rounded-card border border-border bg-surface p-6 text-center"
                    data-testid="handbook-empty"
                  >
                    <h2 class="font-display text-section font-bold text-fg">
                      {{ 'handbook.map.empty.title' | transloco }}
                    </h2>
                    <p class="mx-auto mt-1 max-w-[60ch] text-body text-fg-muted">
                      {{ 'handbook.map.empty.body' | transloco }}
                    </p>
                    @if (canWrite()) {
                      <div class="mt-4 flex flex-wrap justify-center gap-2">
                        <button type="button" [class]="primaryClass" (click)="starter()?.open()">
                          {{ 'handbook.actions.propose' | transloco }}
                        </button>
                        <a [class]="secondaryClass" routerLink="/processes/new">{{
                          'handbook.actions.newProcess' | transloco
                        }}</a>
                      </div>
                    }
                  </div>
                } @else {
                  @if (ordering()) {
                    <p
                      class="mb-3 rounded-tile border border-accent-border bg-accent-soft px-3 py-2 text-ui text-fg"
                    >
                      {{ 'handbook.map.orderHint' | transloco }}
                    </p>
                  }
                  <div class="grid gap-2.5" data-testid="handbook-map">
                    <ng-container
                      [ngTemplateOutlet]="band"
                      [ngTemplateOutletContext]="{ $implicit: 'management', boxes: m.management }"
                    />
                    <p class="flex items-center justify-center gap-2 text-[12.5px] text-fg-subtle">
                      <svg
                        viewBox="0 0 24 24"
                        class="size-4 text-accent"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="M12 4v15M6 13l6 6 6-6" />
                      </svg>
                      {{ 'handbook.map.governs' | transloco }}
                    </p>

                    <section
                      class="rounded-[14px] border border-accent bg-surface px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-accent)]"
                      data-testid="handbook-band-core"
                    >
                      <div class="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                        <h2
                          class="text-[12px] font-semibold tracking-[.06em] text-accent uppercase"
                        >
                          {{ 'handbook.bands.core.eyebrow' | transloco }}
                        </h2>
                        <app-req-pills [refs]="bandRefs.core" />
                      </div>
                      <div
                        class="flex items-stretch overflow-x-auto pb-1 max-[820px]:flex-col"
                        data-testid="handbook-chain"
                      >
                        <div [class]="endClass">{{ 'handbook.map.customerNeed' | transloco }}</div>
                        @for (
                          b of m.core;
                          track b.id;
                          let i = $index;
                          let f = $first;
                          let l = $last
                        ) {
                          <app-handbook-arrow />
                          <app-handbook-process-box
                            class="min-w-[120px] flex-1 basis-0 max-[820px]:min-w-0"
                            [box]="b"
                            [ordering]="ordering()"
                            [first]="f"
                            [last]="l"
                            (move)="move('core', i, $event)"
                          />
                        }
                        <app-handbook-arrow />
                        <div [class]="endClass">{{ 'handbook.map.satisfied' | transloco }}</div>
                      </div>
                    </section>

                    <p class="flex items-center justify-center gap-2 text-[12.5px] text-fg-subtle">
                      <svg
                        viewBox="0 0 24 24"
                        class="size-4 text-accent"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20V5M6 11l6-6 6 6" />
                      </svg>
                      {{ 'handbook.map.supports' | transloco }}
                    </p>
                    <ng-container
                      [ngTemplateOutlet]="band"
                      [ngTemplateOutletContext]="{ $implicit: 'support', boxes: m.support }"
                    />
                  </div>

                  <p class="mt-3.5 text-meta text-fg-muted">
                    {{ 'handbook.map.footnote' | transloco }}
                  </p>
                  <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <a [class]="textLink" routerLink="/processes/interaction-map">{{
                      'handbook.actions.interactions' | transloco
                    }}</a>
                    <a [class]="textLink" routerLink="/processes/all">{{
                      'handbook.actions.allProcesses' | transloco
                    }}</a>
                    @if (canWrite()) {
                      <a [class]="textLink" routerLink="/processes/new">{{
                        'handbook.actions.newProcess' | transloco
                      }}</a>
                    }
                    @if (canManage()) {
                      <button
                        type="button"
                        [class]="textLink"
                        [attr.aria-pressed]="ordering()"
                        (click)="ordering.set(!ordering())"
                        data-testid="handbook-order"
                      >
                        {{
                          (ordering() ? 'handbook.actions.orderDone' : 'handbook.actions.order')
                            | transloco
                        }}
                      </button>
                    }
                  </div>
                }
              }
            }
            @default {
              <app-loading-state [rows]="5" />
            }
          }
        }

        @case ('procedures') {
          <p class="mb-4 text-body text-fg-muted">{{ 'handbook.procedures.intro' | transloco }}</p>
          @if (docsError()) {
            <app-error-state (retry)="loadDocuments()" />
          } @else if (documents() === null) {
            <app-loading-state [rows]="5" />
          } @else if (groups().length === 0) {
            <p
              class="rounded-card border border-border bg-surface p-6 text-center text-body text-fg-muted"
            >
              {{ 'handbook.procedures.empty' | transloco }}
            </p>
          } @else {
            <div class="grid gap-4" data-testid="handbook-procedures">
              @for (g of groups(); track g.process?.id ?? 'none') {
                <section class="rounded-card border border-border bg-surface p-4">
                  <div class="mb-1 flex flex-wrap items-baseline justify-between gap-3">
                    <h2 class="font-display text-card font-bold text-fg">
                      @if (g.process; as p) {
                        {{ p.title }}
                      } @else {
                        {{ 'handbook.procedures.noProcess' | transloco }}
                      }
                    </h2>
                    @if (g.process; as p) {
                      <a [class]="textLink" [routerLink]="['/handbook', p.id]">{{
                        'handbook.actions.openProcess' | transloco
                      }}</a>
                    }
                  </div>
                  <ul>
                    @for (d of g.documents; track d.id) {
                      <li
                        class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                      >
                        <span class="min-w-0">
                          <a
                            class="font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
                            [routerLink]="['/documents', d.id]"
                            >{{ d.title }}</a
                          >
                          <span class="block text-meta text-fg-muted">{{ docMeta(d) }}</span>
                        </span>
                        <a [class]="smallClass" [routerLink]="['/documents', d.id]">{{
                          'handbook.waiting.open' | transloco
                        }}</a>
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>
          }
        }

        @case ('waiting') {
          <p class="mb-4 text-body text-fg-muted">{{ 'handbook.waiting.intro' | transloco }}</p>
          @if (waiting() === null) {
            <app-loading-state [rows]="3" />
          } @else if (waiting()!.length === 0) {
            <p
              class="rounded-card border border-border bg-surface p-6 text-center text-body text-fg-muted"
            >
              {{ 'handbook.waiting.empty' | transloco }}
            </p>
          } @else {
            <ul class="grid gap-2" data-testid="handbook-waiting">
              @for (w of waiting(); track w.id) {
                <li
                  class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3"
                >
                  <span class="min-w-0">
                    <b class="block font-semibold [overflow-wrap:anywhere] text-fg">{{
                      w.title
                    }}</b>
                    @if (w.code) {
                      <span class="block text-meta text-fg-muted">{{ w.code }}</span>
                    }
                  </span>
                  <a [class]="primarySmall" [routerLink]="w.url ?? '/my-work'">{{
                    (isApproval(w) ? 'handbook.waiting.approve' : 'handbook.waiting.read')
                      | transloco
                  }}</a>
                </li>
              }
            </ul>
          }
        }
      }
    </div>

    <ng-template #band let-key let-boxes="boxes">
      <section class="rounded-[14px] border border-border bg-surface px-4 py-3.5">
        <div class="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 class="text-[12px] font-semibold tracking-[.06em] text-fg-subtle uppercase">
            {{ 'handbook.bands.' + key + '.eyebrow' | transloco }}
          </h2>
          <app-req-pills [refs]="refsOf(key)" />
        </div>
        @if (boxes.length) {
          <div
            class="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5"
            [attr.data-testid]="'handbook-band-' + key"
          >
            @for (b of boxes; track b.id; let i = $index; let f = $first; let l = $last) {
              <app-handbook-process-box
                [box]="b"
                [ordering]="ordering()"
                [first]="f"
                [last]="l"
                (move)="move(key, i, $event)"
              />
            }
          </div>
        } @else {
          <p class="text-meta text-fg-muted">{{ 'handbook.map.emptyBand' | transloco }}</p>
        }
      </section>
    </ng-template>

    <app-starter-setup [provider]="starterProvider" (created)="onCreated()" />
  `,
})
export class HandbookPage {
  protected readonly store = inject(HandbookStore);
  private readonly api = inject(HandbookApi);
  private readonly tasks = inject(TasksApi);
  private readonly org = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabs = TABS;
  protected readonly bandRefs = BAND_REFS;
  protected readonly primaryClass = PRIMARY;
  protected readonly secondaryClass = SECONDARY;
  protected readonly smallClass = SMALL;
  protected readonly primarySmall = `${SMALL.replace('border-border bg-surface', 'border-transparent bg-accent').replace('text-fg hover:border-border-strong hover:bg-surface-2', 'text-white hover:bg-accent-2')}`;
  protected readonly textLink = TEXT_LINK;
  protected readonly endClass =
    'grid w-[104px] flex-none place-items-center rounded-[12px] bg-accent-soft p-2.5 text-center text-[13.5px] font-semibold text-accent max-[820px]:w-auto';
  protected readonly starterProvider = 'processes.map';
  protected readonly starter = viewChild(StarterSetup);

  protected readonly tab = toSignal(
    this.route.queryParamMap.pipe(map((p) => parseTab(p.get('tab')))),
    { initialValue: parseTab(this.route.snapshot.queryParamMap.get('tab')) },
  );
  protected readonly ordering = signal(false);
  protected readonly documents = signal<readonly HandbookDocument[] | null>(null);
  protected readonly docsError = signal(false);
  private readonly work = signal<readonly WorkItem[] | null>(null);

  private readonly permissions = computed(() => this.org.currentOrg()?.permissions ?? []);
  protected readonly canWrite = computed(() => this.permissions().includes('processes:write'));
  protected readonly canManage = computed(() => this.permissions().includes('processes:manage'));
  protected readonly canDraft = computed(() => this.permissions().includes('documents:draft'));

  protected readonly empty = computed(() => isEmptyMap(this.store.map()));
  protected readonly groups = computed(() =>
    groupProcedures(this.store.map(), this.documents() ?? []),
  );
  protected readonly waiting = computed(() => {
    const work = this.work();
    const docs = this.documents();
    if (work === null || docs === null) {
      return null;
    }
    return waitingItems(work, new Set(docs.map((d) => d.id)));
  });

  constructor() {
    providePageContext(() => ({ module: 'processes', view: 'list', title: null }));
    effect(() => {
      const orgId = this.org.currentOrgId();
      if (!orgId) {
        return;
      }
      untracked(() => {
        // Always refresh: processes may have been created, edited or deleted elsewhere
        // since the map was cached (the cached map stays shown meanwhile).
        this.store.load(true);
        this.loadDocuments();
        this.loadWork(orgId);
      });
    });
  }

  protected tabLabel(t: HandbookTab): string {
    if (t === 'map') {
      return 'handbook.tabs.map';
    }
    const count = this.tabCount(t);
    const base = t === 'procedures' ? 'handbook.tabs.procedures' : 'handbook.tabs.waiting';
    return count === null ? base : `${base}Count`;
  }

  protected tabCount(t: HandbookTab): number | null {
    if (t === 'procedures') {
      return this.documents()?.length ?? null;
    }
    if (t === 'waiting') {
      return this.waiting()?.length ?? null;
    }
    return null;
  }

  protected setTab(t: HandbookTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: t === 'map' ? null : t },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected refsOf(band: string): readonly string[] {
    return BAND_REFS[band as HandbookBand] ?? [];
  }

  protected loadDocuments(): void {
    const orgId = this.org.currentOrgId();
    if (!orgId) {
      return;
    }
    this.docsError.set(false);
    this.api.procedures(orgId).subscribe({
      next: (docs) => this.documents.set(docs),
      error: () => {
        this.documents.set([]);
        this.docsError.set(true);
      },
    });
  }

  private loadWork(orgId: string): void {
    this.tasks.myWork(orgId).subscribe({
      next: (res) => this.work.set(res.items),
      error: () => this.work.set([]),
    });
  }

  protected docMeta(d: HandbookDocument): string {
    return [d.doc_code, d.type_name, d.owner_name].filter(Boolean).join(' · ');
  }

  protected isApproval(w: WorkItem): boolean {
    return laneOf(w) === 'review';
  }

  protected move(band: HandbookBand, index: number, dir: -1 | 1): void {
    const orgId = this.org.currentOrgId();
    const current = this.store.map();
    if (!orgId || !current) {
      return;
    }
    const boxes: readonly HandbookBox[] = current[band];
    const ids = moveInBand(
      boxes.map((b) => b.id),
      index,
      dir,
    );
    const byId = new Map(boxes.map((b) => [b.id, b]));
    const ordered = ids.map((id) => byId.get(id)).filter((b): b is HandbookBox => !!b);
    const next: HandbookMap = { ...current, [band]: ordered };
    this.store.set(next);
    this.api.setOrder(orgId, band, ids).subscribe({
      next: () => this.notifications.success('handbook.map.orderSaved'),
      error: () => {
        this.store.set(current);
        this.notifications.error('handbook.map.orderFailed');
      },
    });
  }

  protected onCreated(): void {
    this.store.load(true);
    this.loadDocuments();
  }
}
