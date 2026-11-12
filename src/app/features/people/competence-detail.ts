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
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { SupportsRequirements } from '../../shared/requirement-links/supports-requirements';
import { Alert } from '../../shared/ui/alert/alert';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { cellStatusTone, hasPerm, recordStatusTone } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import { Competence, MatrixCell, MatrixRow, PERM_MANAGE } from './data/people.models';
import { PeopleLessonLink } from './people-section-nav';

const TABS: readonly RecordTab[] = [
  'details',
  'related',
  'activity',
  'comments',
  'attachments',
  'revisions',
];

export const COMPETENCE_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'people.fields.name',
  category: 'people.fields.category',
  description: 'people.fields.description',
  validity_months: 'people.fields.validityMonths',
  status: 'people.fields.status',
};

interface HolderRow {
  readonly row: MatrixRow;
  readonly cell: MatrixCell;
}

/**
 * A competence (`/people/competences/:id`): its definition and validity, and who needs
 * or holds it (from the competence matrix filtered to this competence).
 */
@Component({
  selector: 'app-people-competence-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
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
            routerLink="/people/competences"
            class="mt-4 inline-block text-[13px] font-semibold text-accent"
          >
            {{ 'people.common.backToCompetences' | transloco }}
          </a>
        </div>
      }
      @default {
        @if (competence(); as c) {
          <app-record-detail-layout
            entityType="competence"
            [entityId]="c.id"
            [tabs]="tabs"
            [canEdit]="canManage()"
            [fieldLabels]="fieldLabels"
            backLink="/people/competences"
            backLabelKey="people.common.backToCompetences"
          >
            <div header>
              <p class="mb-1 text-[12.5px] text-fg-subtle">
                {{ 'people.categories.' + c.category | transloco }}
              </p>
              <h1
                class="font-display text-[24px] font-bold tracking-[-0.03em] break-words text-fg sm:text-[26px]"
                data-testid="competence-heading"
              >
                {{ c.name }}
              </h1>
              <div class="mt-2">
                <app-badge [tone]="statusTone(c.status)">{{
                  'people.recordStatus.' + c.status | transloco
                }}</app-badge>
              </div>
            </div>

            <ng-container actions>
              <app-watch-button entityType="competence" [entityId]="c.id" />
              <app-ask-about [prompt]="'people.ask.explainCompetence' | transloco" />
              @if (canManage()) {
                <a
                  [routerLink]="['/people/competences', c.id, 'edit']"
                  class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                  data-testid="competence-edit"
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
              <app-guide-intro scope="people" page="competenceDetail" />
              <app-card>
                <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.fields.validityMonths' | transloco }}</dt>
                    <dd class="text-fg">
                      {{
                        c.validity_months
                          ? ('people.competences.validFor'
                            | transloco: { months: c.validity_months })
                          : ('people.competences.noExpiry' | transloco)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.competences.positions' | transloco }}</dt>
                    <dd class="text-fg">{{ c.position_count }}</dd>
                  </div>
                  <div>
                    <dt class="text-fg-subtle">{{ 'people.competences.holders' | transloco }}</dt>
                    <dd class="text-fg">{{ c.holder_count }}</dd>
                  </div>
                </dl>
                @if (c.description) {
                  <p class="mt-4 text-[13.5px] whitespace-pre-line text-fg">{{ c.description }}</p>
                }
              </app-card>

              <app-card>
                <h2 class="mb-2 font-display text-[15px] font-bold text-fg">
                  {{ 'people.competences.whoTitle' | transloco }}
                </h2>
                @if (holders().length === 0) {
                  <p class="text-[13px] text-fg-muted">
                    {{ 'people.competences.whoEmpty' | transloco }}
                  </p>
                } @else {
                  <ul class="divide-y divide-border" data-testid="competence-holders">
                    @for (h of holders(); track h.row.employee_id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <a
                          [routerLink]="['/people/employees', h.row.employee_id]"
                          class="min-w-0 flex-1 font-semibold text-fg hover:underline"
                          >{{ h.row.full_name }}</a
                        >
                        <span class="text-fg-muted">
                          {{
                            h.cell.level !== null
                              ? ('people.levels.' + h.cell.level | transloco)
                              : '–'
                          }}
                          @if (h.cell.expires_on) {
                            ·
                            {{
                              'people.competences.expires'
                                | transloco: { date: (h.cell.expires_on | localDay) }
                            }}
                          }
                        </span>
                        <app-badge [tone]="cellTone(h.cell.status)">{{
                          'people.cellStatus.' + h.cell.status | transloco
                        }}</app-badge>
                      </li>
                    }
                  </ul>
                }
              </app-card>
            </div>

            <ng-container aside>
              <app-supports-requirements entityType="competence" [entityId]="c.id" />
              <app-why-it-matters scope="people" page="competenceDetail" />
              <app-people-lesson-link lesson="competence-basics" />
            </ng-container>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleting()"
            [title]="'people.competences.deleteTitle' | transloco"
            [message]="'people.competences.deleteMessage' | transloco: { name: c.name }"
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
export class CompetenceDetailPage {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly lookups = inject(PeopleLookups);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly tabs = TABS;
  protected readonly fieldLabels = COMPETENCE_FIELD_LABELS;
  protected readonly statusTone = recordStatusTone;
  protected readonly cellTone = cellStatusTone;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly competence = signal<Competence | null>(null);
  protected readonly holders = signal<readonly HolderRow[]>([]);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );

  private request = new Subscription();
  private matrixRequest = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.matrixRequest.unsubscribe();
    });
    providePageContext(() => ({
      module: 'people',
      entityType: 'competence',
      entityId: this.id(),
      view: 'detail',
      title: this.competence()?.name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.competence();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteCompetence(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(false);
        this.lookups.invalidate();
        this.notifications.success('people.notices.competenceDeleted', { name: c.name });
        void this.router.navigate(['/people/competences']);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    this.matrixRequest.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getCompetence(orgId, id).subscribe({
      next: (c) => {
        this.competence.set(c);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(peopleErrorKey(error));
        this.state.set('error');
      },
    });
    this.matrixRequest = this.api.matrix(orgId, { competence_ids: [id] }).subscribe({
      next: (m) =>
        this.holders.set(
          m.rows
            .map((row) => ({ row, cell: row.cells.find((c) => c.competence_id === id) }))
            .filter(
              (h): h is HolderRow =>
                !!h.cell && (h.cell.level !== null || h.cell.status !== 'not_required'),
            ),
        ),
      error: () => this.holders.set([]),
    });
  }
}
