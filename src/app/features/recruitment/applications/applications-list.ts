import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { RelativeTimePipe } from '../../../shared/relative-time/relative-time';
import { Badge } from '../../../shared/ui/badge/badge';
import { Card } from '../../../shared/ui/card/card';
import { Pager } from '../../../shared/ui/pager/pager';
import { RecruitmentApi } from '../data/recruitment-api';
import { stageTone } from '../data/recruitment-display';
import {
  Application,
  ENTITY_APPLICATION,
  MODULE_KEY,
  STAGES,
  Stage,
} from '../data/recruitment.models';
import { RecruitmentNav } from '../shared/recruitment-nav';

const PAGE_SIZE = 25;
const ACTIVE: readonly Stage[] = [
  'applied',
  'screening',
  'interview',
  'assessment',
  'reference_check',
  'offer',
];

/** Applications across the requisitions the caller works on (team-filtered by the API). */
@Component({
  selector: 'app-applications-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    RelativeTimePipe,
    Badge,
    Card,
    Pager,
    RecruitmentNav,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="recruitment.applications.title"
      scope="recruitment"
      page="applications"
      searchPlaceholderKey="recruitment.applications.search"
      [query]="q()"
      [filters]="{ stage: stage() }"
      [empty]="!loading() && items().length === 0 && !filtered()"
      (search)="onSearch($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro class="mt-3 flex flex-col gap-3">
        <app-recruitment-nav />
        <app-guide-intro scope="recruitment" page="applications" />
      </div>
      <ng-container filters>
        <label class="sr-only" for="app-stage">{{ 'recruitment.filters.stage' | transloco }}</label>
        <select
          id="app-stage"
          class="h-10 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg outline-none focus:border-accent"
          [value]="stage()"
          (change)="setStage($any($event.target).value)"
        >
          <option value="">{{ 'recruitment.filters.allStages' | transloco }}</option>
          <option value="active">{{ 'recruitment.filters.activeStages' | transloco }}</option>
          @for (s of stages; track s) {
            <option [value]="s">{{ 'recruitment.stage.' + s | transloco }}</option>
          }
        </select>
      </ng-container>

      <app-card [padded]="false">
        @if (loading() && items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'common.loading' | transloco }}
          </p>
        } @else if (items().length === 0) {
          <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
            {{ 'recruitment.common.noMatches' | transloco }}
          </p>
        } @else {
          <ul>
            @for (row of items(); track row.id) {
              <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                <a
                  [routerLink]="['/recruitment/applications', row.id]"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span class="w-[84px] flex-none font-mono text-[12px] text-fg-subtle">{{
                    row.code
                  }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-fg">{{
                      row.candidate_name
                    }}</span>
                    <span class="block truncate text-[12.5px] text-fg-muted"
                      >{{ row.requisition_code }} · {{ row.requisition_title }}</span
                    >
                  </span>
                  @if (row.offer_status !== 'none') {
                    <app-badge tone="accent">{{
                      'recruitment.offerStatus.' + row.offer_status | transloco
                    }}</app-badge>
                  }
                  <app-badge [tone]="stageTone(row.stage)">{{
                    'recruitment.stage.' + row.stage | transloco
                  }}</app-badge>
                  <span
                    class="hidden w-[110px] flex-none text-right text-[12.5px] text-fg-subtle sm:block"
                  >
                    {{ row.updated_at | relativeTime: lang() }}
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </app-card>
      <app-pager
        [offset]="offset()"
        [pageSize]="pageSize"
        [count]="items().length"
        [total]="total()"
        (pageChange)="offset.set($event)"
      />
      <div class="mt-6">
        <app-why-it-matters scope="recruitment" page="applications" />
      </div>
      <div empty>
        <app-card>
          <app-teaching-empty scope="recruitment" page="applications" [showAction]="false" />
        </app-card>
      </div>
    </app-record-list-page>
  `,
})
export class ApplicationsList {
  private readonly api = inject(RecruitmentApi);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;
  private readonly route = inject(ActivatedRoute);
  protected readonly lang = inject(LanguageService).active;

  protected readonly stages = STAGES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stageTone = stageTone;

  protected readonly q = signal('');
  protected readonly stage = signal<'' | 'active' | Stage>('');
  protected readonly offset = signal(0);
  private readonly requisitionId = this.route.snapshot.queryParamMap.get('requisition_id');

  protected readonly items = signal<readonly Application[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly filtered = computed(() => this.q() !== '' || this.stage() !== '');

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_APPLICATION,
      view: 'list',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const s = this.stage();
      const query = {
        q: this.q(),
        stage: s === 'active' ? ACTIVE : s ? [s] : undefined,
        requisition_id: this.requisitionId ?? undefined,
        limit: PAGE_SIZE,
        offset: this.offset(),
      };
      if (!orgId) {
        return;
      }
      this.loading.set(true);
      const sub = this.api.listApplications(orgId, query).subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected onSearch(text: string): void {
    this.q.set(text.trim());
    this.offset.set(0);
  }

  protected setStage(value: string): void {
    this.stage.set(
      value === 'active' || (STAGES as readonly string[]).includes(value)
        ? (value as 'active' | Stage)
        : '',
    );
    this.offset.set(0);
  }

  protected applyView(view: SavedView): void {
    this.setStage(view.filters['stage'] ?? '');
  }
}
