import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { RecordListPage } from '../../../shared/kit/record-list-page';
import { SavedView } from '../../../shared/kit/saved-views.service';
import { CoverageChip } from '../../../shared/requirement-links/coverage-chip';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecordRow, RecordRowHeader } from '../../../shared/ui/record-row/record-row';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AuditAccess } from '../data/audit-access';
import { programmeStatusBadge, sumCounts } from '../data/audit-display';
import { ListResponse, PROGRAMME_STATUSES, Programme } from '../data/audit.models';
import { AuditsApi } from '../data/audits-api';
import { AuditsNav } from '../shared/audits-nav';
import { AuditLoadState } from '../shared/load-state';
import { loadable } from '../shared/loadable';

/** `/audits/programmes`: the yearly, risk-based audit programmes. */
@Component({
  selector: 'app-audit-programme-list',
  imports: [
    TranslocoPipe,
    Button,
    Card,
    CoverageChip,
    EmptyState,
    HelpStrip,
    Icon,
    RecordListPage,
    RecordRow,
    RecordRowHeader,
    StatusBadge,
    TeachingEmpty,
    WhyItMatters,
    AuditsNav,
    AuditLoadState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-record-list-page
      titleKey="audits.programmes.title"
      descriptionKey="audits.programmes.subtitle"
      scope="audits"
      page="programmes"
      [breadcrumbs]="[
        { labelKey: 'modules.names.audits', link: '/audits' },
        { labelKey: 'audits.programmes.title' },
      ]"
      searchPlaceholderKey="audits.programmes.search"
      [query]="q()"
      [filters]="{ status: status(), year: year() }"
      [empty]="isEmpty()"
      (search)="q.set($event)"
      (viewApplied)="applyView($event)"
    >
      @if (access.canWrite()) {
        <app-button primary (click)="create()">
          <app-icon name="plus" [size]="14" />
          {{ 'audits.programmes.new' | transloco }}
        </app-button>
      }
      <app-audits-nav nav />
      <app-help-strip help scope="audits" page="programmes" lesson="internal-audits" />

      <ng-container filters>
        <label class="sr-only" for="prog-status">{{ 'audits.filters.status' | transloco }}</label>
        <select
          id="prog-status"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
          inputmode="numeric"
          min="2000"
          max="2100"
          class="h-10 w-[110px] rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          [placeholder]="'audits.fields.year' | transloco"
          [value]="year()"
          (change)="year.set($any($event.target).value)"
        />
      </ng-container>

      <app-card [padded]="false">
        <app-audit-load-state [state]="data.state()" [rows]="4" (retry)="load()" />
        @if (data.state() === 'ready') {
          @if (rows().length) {
            <div role="list" [attr.aria-label]="'audits.programmes.title' | transloco">
              <app-record-row-header dateKind="updated" />
              @for (p of rows(); track p.id) {
                @let sb = badge(p.status);
                <app-record-row
                  [code]="p.code"
                  [title]="p.title"
                  [subtitle]="subtitle(p)"
                  [link]="['/audits/programmes', p.id]"
                  [owner]="p.owner?.name"
                  [date]="p.updated_at"
                  dateKind="updated"
                >
                  <app-coverage-chip coverage entityType="audit_programme" [entityId]="p.id" />
                  <app-status-badge
                    badges
                    [meaning]="sb.meaning"
                    [value]="sb.value"
                    [labelKey]="sb.labelKey"
                  />
                </app-record-row>
              }
            </div>
          } @else {
            <app-empty-state
              icon="search"
              titleKey="ui.empty.noResults"
              ctaKey="audits.filters.clear"
              ctaVariant="secondary"
              [compact]="true"
              (cta)="clearFilters()"
            />
          }
        }
      </app-card>

      <app-card empty>
        <app-teaching-empty
          scope="audits"
          page="programmes"
          [showAction]="access.canWrite()"
          (action)="create()"
        />
      </app-card>
      <app-why-it-matters below scope="audits" page="programmes" />
    </app-record-list-page>
  `,
})
export class ProgrammeList {
  private readonly api = inject(AuditsApi);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(AuditAccess);
  protected readonly data = loadable<ListResponse<Programme>>();
  protected readonly statuses = PROGRAMME_STATUSES;
  protected readonly badge = programmeStatusBadge;

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
    providePageContext(() => ({
      module: 'audits',
      entityType: 'audit_programme',
      view: 'list',
      title: this.language.translate('audits.programmes.title'),
    }));
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

  protected subtitle(p: Programme): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const parts = [
      String(p.year),
      t('audits.programmes.auditCount', { count: sumCounts(p.plan_counts) }),
    ];
    if (p.frameworks.length) {
      parts.push(p.frameworks.map((f) => t(`audits.frameworks.${f}`)).join(', '));
    }
    return parts.join(' · ');
  }

  protected clearFilters(): void {
    this.q.set('');
    this.status.set('');
    this.year.set('');
  }

  protected applyView(view: SavedView): void {
    this.status.set(view.filters['status'] ?? '');
    this.year.set(view.filters['year'] ?? '');
  }

  protected create(): void {
    void this.router.navigate(['/audits/programmes/new']);
  }
}
