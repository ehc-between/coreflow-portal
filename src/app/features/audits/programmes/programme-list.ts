import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { AuditAccess } from '../data/audit-access';
import { programmeStatusTone, sumCounts } from '../data/audit-display';
import { ListResponse, PROGRAMME_STATUSES, Programme } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** `/audits/programmes`: the yearly, risk-based audit programmes. */
@Component({
  selector: 'app-audit-programme-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    RecordListPage,
    GuideIntro,
    WhyItMatters,
    TeachingEmpty,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.programmes.title"
      scope="audits"
      page="programmes"
      searchPlaceholderKey="audits.programmes.search"
      [query]="q()"
      [filters]="{ status: status(), year: year() }"
      [empty]="isEmpty()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      <div intro>
        <app-audits-nav />
        <div class="mt-4 flex flex-col gap-3">
          <app-guide-intro scope="audits" page="programmes" />
          <app-why-it-matters scope="audits" page="programmes" />
        </div>
      </div>
      @if (access.canWrite()) {
        <app-button toolbar size="sm" (click)="create()">{{
          'audits.programmes.new' | transloco
        }}</app-button>
      }
      <div filters class="flex flex-wrap gap-2">
        <label class="sr-only" for="prog-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="prog-status"
          class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          (change)="status.set($any($event.target).value)"
        >
          <option value="" [selected]="!status()">
            {{ 'audits.filters.anyStatus' | transloco }}
          </option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="status() === s">
              {{ 'audits.programmeStatus.' + s | transloco }}
            </option>
          }
        </select>
        <label class="sr-only" for="prog-year">{{ 'audits.fields.year' | transloco }}</label>
        <input
          id="prog-year"
          type="number"
          min="2000"
          max="2100"
          class="h-10 w-[110px] rounded-[10px] border border-border bg-bg px-2 text-[13px] text-fg"
          [placeholder]="'audits.fields.year' | transloco"
          [value]="year()"
          (change)="year.set($any($event.target).value)"
        />
      </div>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" (retry)="load()" />
        @if (data.state() === 'ready') {
          <ul class="divide-y divide-border">
            @for (p of rows(); track p.id) {
              <li
                class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <a [routerLink]="['/audits/programmes', p.id]" class="min-w-0 flex-1">
                  <span class="block text-[11.5px] text-fg-subtle"
                    >{{ p.code }} · {{ p.year }}</span
                  >
                  <span class="text-[14px] font-semibold text-fg hover:text-accent">{{
                    p.title
                  }}</span>
                </a>
                <span class="text-[12.5px] text-fg-muted">
                  {{ 'audits.programmes.auditCount' | transloco: { count: total(p) } }}
                </span>
                <span class="text-[12.5px] text-fg-muted">{{ p.owner?.name || '–' }}</span>
                <app-badge [tone]="tone(p.status)">{{
                  'audits.programmeStatus.' + p.status | transloco
                }}</app-badge>
              </li>
            } @empty {
              <li class="py-10 text-center text-[14px] text-fg-muted">
                {{ 'audits.common.noMatches' | transloco }}
              </li>
            }
          </ul>
        }
      </app-card>

      <app-teaching-empty
        empty
        scope="audits"
        page="programmes"
        [showAction]="access.canWrite()"
        (action)="create()"
      />
    </app-record-list-page>
  `,
})
export class ProgrammeList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Programme>>();
  protected readonly statuses = PROGRAMME_STATUSES;
  protected readonly tone = programmeStatusTone;

  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly year = signal('');
  protected readonly rows = computed(() => this.data.value()?.items ?? []);
  protected readonly isEmpty = computed(
    () =>
      this.data.state() === 'ready' &&
      (this.data.value()?.total ?? 0) === 0 &&
      !this.q() &&
      !this.status() &&
      !this.year(),
  );

  constructor() {
    providePageContext(() => ({ module: 'audits', entityType: 'audit_programme', view: 'list' }));
    effect(() => {
      this.access.orgId();
      this.q();
      this.status();
      this.year();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const orgId = this.access.orgId();
    if (!orgId) {
      return;
    }
    const year = Number(this.year());
    this.data.load(
      this.api.listProgrammes(orgId, {
        q: this.q() || undefined,
        status: this.status() || undefined,
        year: year >= 2000 && year <= 2100 ? year : undefined,
        limit: 200,
      }),
      true,
    );
  }

  protected total(p: Programme): number {
    return sumCounts(p.plan_counts);
  }

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
    this.year.set(view.filters['year'] ?? '');
  }

  protected create(): void {
    void this.router.navigate(['/audits/programmes/new']);
  }
}
