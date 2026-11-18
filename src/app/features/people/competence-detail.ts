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
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { RecordDetailLayout, RecordTab } from '../../shared/kit/record-detail-layout';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { LanguageService } from '../../core/i18n/language.service';
import { AskPanelService } from '../ask/ask-panel.service';
import { PeopleApi } from './data/people-api';
import { cellLook, countKey, hasPerm } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import {
  CellStatus,
  Competence,
  MatrixCell,
  MatrixRow,
  PERM_MANAGE,
  PERM_WRITE,
} from './data/people.models';
import { GapActionDialog, GapTarget } from './ui/gap-action-dialog';
import { PeopleAsk } from './ui/people-ask';
import { PEOPLE_ROOT, PEOPLE_SETTINGS_LINK } from './ui/people-nav';

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
 * or holds it (from the competence matrix filtered to this competence), with "Lukk
 * gapet" for everyone below the required level (HS 7.2).
 */
@Component({
  selector: 'app-people-competence-detail',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    WatchButton,
    WhyItMatters,
    RecordDetailLayout,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    FieldItem,
    FieldList,
    HelpStrip,
    LoadingState,
    MenuItem,
    StatusBadge,
    GapActionDialog,
    PeopleAsk,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-8 sm:px-8">
          <app-loading-state [rows]="5" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[760px] px-4 pt-8 sm:px-8">
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            bodyKey="people.detail.notFoundBody"
            ctaKey="people.common.backToCompetences"
            ctaLink="/people/competences"
          />
        </div>
      }
      @default {
        @if (competence(); as c) {
          <app-record-detail-layout
            entityType="competence"
            [entityId]="c.id"
            [title]="c.name"
            [breadcrumbs]="[
              root,
              { labelKey: 'people.competences.title', link: '/people/competences' },
              { label: c.name },
            ]"
            [settingsLink]="settingsLink"
            [tabs]="tabs"
            [canEdit]="canManage()"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels"
          >
            <ng-container ngProjectAs="[meta]">
              <span>{{ 'people.categories.' + c.category | transloco }}</span>
              <span aria-hidden="true">·</span>
              <span>{{
                c.validity_months
                  ? (countKey('people.competences.validFor', c.validity_months)
                    | transloco: { months: c.validity_months })
                  : ('people.competences.noExpiry' | transloco)
              }}</span>
              @if (c.status !== 'active') {
                <app-status-badge
                  meaning="lifecycle"
                  [value]="c.status"
                  [labelKey]="'people.recordStatus.' + c.status"
                />
              }
              <span class="sr-only" data-testid="competence-heading">{{ c.name }}</span>
            </ng-container>

            @if (canManage()) {
              <ng-container ngProjectAs="[primary]">
                <a
                  [routerLink]="['/people/competences', c.id, 'edit']"
                  data-testid="competence-edit"
                >
                  <app-button>{{ 'people.common.edit' | transloco }}</app-button>
                </a>
              </ng-container>
            }
            <ng-container ngProjectAs="[secondary]">
              <app-watch-button entityType="competence" [entityId]="c.id" />
            </ng-container>
            <ng-container ngProjectAs="[overflow]">
              <button appMenuItem type="button" (click)="explain()">
                {{ 'people.competences.explain' | transloco }}
              </button>
              @if (canManage()) {
                <button
                  appMenuItem
                  type="button"
                  [danger]="true"
                  (click)="deleting.set(true)"
                  data-testid="competence-delete"
                >
                  {{ 'people.common.delete' | transloco }}
                </button>
              }
            </ng-container>

            <app-help-strip
              help
              scope="people"
              page="competenceDetail"
              lesson="competence-basics"
            />

            <div class="flex flex-col gap-5">
              <app-card>
                <app-field-list [columns]="2">
                  <app-field-item labelKey="people.fields.category">
                    {{ 'people.categories.' + c.category | transloco }}
                  </app-field-item>
                  <app-field-item labelKey="people.fields.validityMonths">
                    {{
                      c.validity_months
                        ? (countKey('people.competences.validFor', c.validity_months)
                          | transloco: { months: c.validity_months })
                        : ('people.competences.noExpiry' | transloco)
                    }}
                  </app-field-item>
                  <app-field-item labelKey="people.competences.positions">
                    {{
                      countKey('people.competences.usedBy', c.position_count)
                        | transloco: { count: c.position_count }
                    }}
                  </app-field-item>
                  <app-field-item labelKey="people.competences.holders">
                    {{
                      countKey('people.competences.heldBy', c.holder_count)
                        | transloco: { count: c.holder_count }
                    }}
                  </app-field-item>
                  @if (c.description) {
                    <app-field-item
                      labelKey="people.fields.description"
                      [value]="c.description"
                      [wide]="true"
                      [multiline]="true"
                    />
                  }
                </app-field-list>
              </app-card>

              <app-card>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 class="text-card font-bold text-fg">
                    {{ 'people.competences.whoTitle' | transloco }}
                  </h2>
                  <app-people-ask
                    [prompt]="'people.ask.explainCompetence' | transloco"
                    [field]="c.name"
                    [requirements]="['hs:7.2']"
                  />
                </div>
                @if (holders().length === 0) {
                  <p class="text-ui text-fg-muted">
                    {{ 'people.competences.whoEmpty' | transloco }}
                  </p>
                } @else {
                  <ul class="divide-y divide-border" data-testid="competence-holders">
                    @for (h of holders(); track h.row.employee_id) {
                      <li class="flex flex-wrap items-center gap-2 py-2 text-ui">
                        <a
                          [routerLink]="['/people/employees', h.row.employee_id]"
                          [queryParams]="{ section: 'competences' }"
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
                        <app-status-badge
                          [meaning]="look(h.cell.status).meaning"
                          [value]="look(h.cell.status).value"
                          [labelKey]="'people.cellStatus.' + h.cell.status"
                        />
                        @if (canWrite() && isGap(h.cell.status)) {
                          <app-button
                            size="sm"
                            variant="secondary"
                            (click)="openGap(h.row, c.name)"
                            [attr.data-testid]="'close-gap-' + h.row.employee_id"
                          >
                            {{ 'people.gapActions.open' | transloco }}
                          </app-button>
                        }
                      </li>
                    }
                  </ul>
                }
              </app-card>
            </div>

            <ng-container ngProjectAs="[aside-learn]">
              <app-why-it-matters scope="people" page="competenceDetail" />
            </ng-container>
          </app-record-detail-layout>

          <app-people-gap-action-dialog
            [target]="closingGap()"
            (created)="onGapAction()"
            (closed)="closingGap.set(null)"
          />

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
  protected readonly look = cellLook;
  protected readonly countKey = countKey;
  protected readonly root = PEOPLE_ROOT;
  protected readonly settingsLink = PEOPLE_SETTINGS_LINK;
  protected readonly closingGap = signal<GapTarget | null>(null);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly competence = signal<Competence | null>(null);
  protected readonly holders = signal<readonly HolderRow[]>([]);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );
  protected readonly canWrite = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_WRITE),
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
      requirements: ['hs:7.2'],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected isGap(status: CellStatus): boolean {
    return status === 'gap' || status === 'missing' || status === 'expired';
  }

  protected explain(): void {
    this.ask.askAbout(this.language.translate('people.ask.explainCompetence'));
  }

  protected openGap(row: MatrixRow, competenceName: string): void {
    this.closingGap.set({
      employeeId: row.employee_id,
      employeeName: row.full_name,
      competenceId: this.id(),
      competenceName,
      hasUser: true,
    });
  }

  protected onGapAction(): void {
    this.closingGap.set(null);
    this.load(this.selectedOrg.currentOrgId(), this.id());
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
