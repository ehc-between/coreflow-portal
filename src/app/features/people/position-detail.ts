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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WatchButton } from '../../shared/activity/watch-button';
import { AskAbout } from '../../shared/ask/ask-about';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { employeeStatusTone, hasPerm, recordStatusTone, riskTone } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import { Employee, PERM_MANAGE, PositionDetail } from './data/people.models';
import { PeopleLessonLink } from './people-section-nav';
import { PositionRequirements } from './position-requirements';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const POSITION_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'people.fields.positionTitle',
  code: 'people.fields.code',
  description: 'people.fields.description',
  responsibilities: 'people.fields.responsibilities',
  authorities: 'people.fields.authorities',
  department_id: 'people.fields.department',
  reports_to_id: 'people.fields.reportsTo',
  risk_level: 'people.fields.riskLevel',
  status: 'people.fields.status',
  owner_user_id: 'people.fields.owner',
  requirements: 'people.requirements.title',
};

/**
 * A position (`/people/positions/:id`): purpose, responsibilities and authorities,
 * competence requirements (with AI suggestions), and who holds it; plus the record
 * kit tabs.
 */
@Component({
  selector: 'app-people-position-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    WatchButton,
    AskAbout,
    GuideIntro,
    WhyItMatters,
    RecordDetailLayout,
    SupportsRequirements,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    PeopleLessonLink,
    PositionRequirements,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="py-16 text-center text-[14px] text-fg-muted" role="status">
          {{ 'people.common.loading' | transloco }}
        </p>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
          <a
            routerLink="/people/positions"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'people.common.backToPositions' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (position(); as p) {
          <app-record-detail-layout
            entityType="position"
            [entityId]="p.id"
            [tabs]="tabs"
            [canEdit]="canManage()"
            [fieldLabels]="fieldLabels"
            backLink="/people/positions"
            backLabelKey="people.common.backToPositions"
          >
            <div header>
              @if (p.code) {
                <p class="mb-1 font-mono text-[12.5px] font-semibold text-fg-subtle">
                  {{ p.code }}
                </p>
              }
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="position-heading"
              >
                {{ p.title }}
              </h1>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-badge [tone]="statusTone(p.status)">{{
                  'people.recordStatus.' + p.status | transloco
                }}</app-badge>
                <app-badge [tone]="riskTone(p.risk_level)">{{
                  'people.riskLevels.' + p.risk_level | transloco
                }}</app-badge>
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="position" [entityId]="p.id" />
              <app-ask-about [prompt]="'people.ask.summarisePosition' | transloco" />
              @if (canManage()) {
                <a
                  [routerLink]="['/people/positions', p.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="position-edit"
                >
                  {{ 'people.common.edit' | transloco }}
                </a>
                <app-button variant="ghost" size="sm" (click)="deleting.set(true)">
                  <app-icon name="trash" [size]="14" />
                  {{ 'people.common.delete' | transloco }}
                </app-button>
              }
            </ng-container>

            <div class="flex flex-col gap-6">
              <app-guide-intro scope="people" page="positionDetail" />

              <app-card>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.department' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ p.department?.name ?? ('people.common.none' | transloco) }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.reportsTo' | transloco }}</dt>
                    <dd class="text-fg">
                      @if (p.reports_to; as r) {
                        <a
                          [routerLink]="['/people/positions', r.id]"
                          class="font-semibold text-accent hover:underline"
                          >{{ r.name }}</a
                        >
                      } @else {
                        {{ 'people.common.none' | transloco }}
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.owner' | transloco }}</dt>
                    <dd class="text-fg">
                      {{ p.owner?.name ?? ('people.common.none' | transloco) }}
                    </dd>
                  </div>
                </dl>
                @if (p.description) {
                  <p class="mt-4 text-[13.5px] whitespace-pre-line text-fg">{{ p.description }}</p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'people.fields.responsibilities' | transloco }}
                </h2>
                <p class="text-[13.5px] whitespace-pre-line text-fg">
                  {{ p.responsibilities ?? ('people.positions.noResponsibilities' | transloco) }}
                </p>
                <h2 class="mt-4 mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'people.fields.authorities' | transloco }}
                </h2>
                <p class="text-[13.5px] whitespace-pre-line text-fg">
                  {{ p.authorities ?? ('people.positions.noAuthorities' | transloco) }}
                </p>
              </app-card>

              <app-card>
                <app-people-position-requirements
                  [position]="p"
                  [canManage]="canManage()"
                  (saved)="position.set($event)"
                />
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'people.positions.holdersTitle' | transloco }}
                </h2>
                @if (holders().length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'people.positions.noHolders' | transloco }}
                  </p>
                } @else {
                  <ul class="divide-y divide-border" data-testid="position-holders">
                    @for (e of holders(); track e.id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <a
                          [routerLink]="['/people/employees', e.id]"
                          class="min-w-0 flex-1 font-semibold text-fg hover:underline"
                          >{{ e.full_name }}</a
                        >
                        @if (e.gap_count > 0) {
                          <app-badge tone="warn">{{
                            'people.employees.gapCount' | transloco: { count: e.gap_count }
                          }}</app-badge>
                        }
                        <app-badge [tone]="employeeTone(e.status)">{{
                          'people.status.' + e.status | transloco
                        }}</app-badge>
                      </li>
                    }
                  </ul>
                }
              </app-card>
            </div>

            <ng-container aside>
              <app-supports-requirements entityType="position" [entityId]="p.id" />
              <app-why-it-matters scope="people" page="positionDetail" />
              <div class="flex flex-col items-start gap-1">
                <app-people-lesson-link lesson="roles-and-responsibilities" />
                <app-people-lesson-link lesson="competence-basics" />
              </div>
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'people.positions.deleteTitle' | transloco"
            [message]="'people.positions.deleteMessage' | transloco: { title: p.title }"
            [confirmLabel]="'people.common.delete' | transloco"
            [cancelLabel]="'common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleting.set(false)"
          />
        }
      }
    }
  `,
})
export class PositionDetailPage {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly lookups = inject(PeopleLookups);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = POSITION_FIELD_LABELS;
  protected readonly statusTone = recordStatusTone;
  protected readonly riskTone = riskTone;
  protected readonly employeeTone = employeeStatusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly position = signal<PositionDetail | null>(null);
  protected readonly holders = signal<readonly Employee[]>([]);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );

  private request = new Subscription();
  private holdersRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.holdersRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'people',
      entityType: 'position',
      entityId: this.id(),
      view: 'detail',
      title: this.position()?.title ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const p = this.position();
    if (!orgId || !p || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deletePosition(orgId, p.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.lookups.invalidate();
        this.notifications.success('people.notices.positionDeleted', { title: p.title });
        void this.router.navigate(['/people/positions']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.deleting.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    this.holdersRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getPosition(orgId, id).subscribe({
      next: (position) => {
        this.position.set(position);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
    this.holdersRequest = this.api
      .listEmployees(orgId, {
        position_id: id,
        status: ['onboarding', 'active', 'on_leave', 'offboarding'],
        sort: 'name',
        limit: 200,
      })
      .subscribe({
        next: (page) => this.holders.set(page.items),
        error: () => this.holders.set([]),
      });
  }
}
