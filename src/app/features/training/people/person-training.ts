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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { LocalDayPipe, LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TrainingApi } from '../data/training-api';
import {
  TRAINING_MODULE,
  TrainingAccess,
  cellBadge,
  isOpenAssignment,
  recordBadge,
  trainingErrorKey,
} from '../data/training-display';
import { PersonTraining, TrainingRecord } from '../data/training.models';
import { sortNeeds } from '../home/training-home';
import { AssignmentTable } from '../shared/assignment-table';
import { personSubtitle } from '../matrix/training-matrix';
import { PrintChrome } from '../shared/print-chrome';

/**
 * `/training/people/:userId`: one person's training on one page, for audits and
 * appraisals — what they must have (needs from the rules), open assignments, and
 * every completion record with its validity and certificate. Printable. You can
 * open your own; people who oversee training can open anyone's.
 */
@Component({
  selector: 'app-person-training',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    LocalNumberPipe,
    Badge,
    Button,
    Card,
    EmptyState,
    ErrorState,
    KpiTile,
    LoadingState,
    ModuleNav,
    PageHeader,
    PrintChrome,
    StatusBadge,
    AssignmentTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-training-print-chrome />
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      @if (person(); as p) {
        <app-page-header
          [title]="'training.person.title' | transloco: { name: p.user.name }"
          descriptionKey="training.person.subtitle"
          [breadcrumbs]="[
            { labelKey: 'modules.names.training', link: '/training' },
            access.canOversee()
              ? { labelKey: 'training.matrix.title', link: '/training/matrix' }
              : { labelKey: 'training.nav.mine', link: '/training/mine' },
            { label: p.user.name },
          ]"
        >
          <ng-container ngProjectAs="[meta]">
            @if (subtitle(); as sub) {
              <span>{{ sub }}</span>
            }
            @if (p.user.email) {
              <span aria-hidden="true">·</span>
              <span>{{ p.user.email }}</span>
            }
          </ng-container>
          <app-button primary variant="secondary" (click)="print()" data-testid="person-print">
            {{ 'training.person.print' | transloco }}
          </app-button>
        </app-page-header>
        <app-module-nav [items]="access.navItems()" labelKey="training.nav.label" />

        <div
          class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*>div]:h-full"
          data-testid="person-summary"
        >
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'training.person.required' | transloco"
            [value]="p.summary.required | localNumber"
          />
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'training.person.compliant' | transloco"
            [value]="p.summary.compliant | localNumber"
            [tone]="p.summary.compliant >= p.summary.required ? 'pass' : 'neutral'"
          />
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'training.person.overdue' | transloco"
            [value]="p.summary.overdue | localNumber"
            [tone]="p.summary.overdue ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            noLink="shownBelow"
            [label]="'training.person.expiring' | transloco"
            [value]="p.summary.expiring | localNumber"
            [tone]="p.summary.expiring ? 'warn' : 'neutral'"
          />
        </div>

        <section class="mb-8" aria-labelledby="person-needs">
          <h2 id="person-needs" class="mb-3 font-display text-section font-bold text-fg">
            {{ 'training.person.needsTitle' | transloco }}
          </h2>
          @if (needs().length === 0) {
            <app-card>
              <p class="text-ui text-fg-muted">{{ 'training.person.noNeeds' | transloco }}</p>
            </app-card>
          } @else {
            <div class="overflow-x-auto rounded-card border border-border bg-surface">
              <table class="w-full text-left text-ui" data-testid="person-needs-table">
                <caption class="sr-only">
                  {{
                    'training.person.needsTitle' | transloco
                  }}
                </caption>
                <thead class="border-b border-border text-meta text-fg-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.course' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.status' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.person.when' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (n of needs(); track n.course.id) {
                    @let badge = cellBadgeOf(n.status);
                    <tr class="border-b border-border last:border-0">
                      <td class="px-4 py-2.5">
                        <a
                          [routerLink]="['/training/courses', n.course.id]"
                          class="font-semibold text-fg hover:text-accent hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-subtle">{{
                            n.course.code
                          }}</span>
                          {{ n.course.title }}
                        </a>
                        @if (!n.required) {
                          <span class="ml-1 text-meta text-fg-muted">
                            ({{ 'training.person.optional' | transloco }})
                          </span>
                        }
                      </td>
                      <td class="px-4 py-2.5">
                        <app-status-badge
                          [meaning]="badge.meaning"
                          [value]="badge.value"
                          [labelKey]="badge.labelKey"
                        />
                      </td>
                      <td class="px-4 py-2.5 whitespace-nowrap text-fg-muted">
                        @if (n.expires_at) {
                          {{
                            'training.home.validUntil'
                              | transloco: { date: (n.expires_at | localDay) }
                          }}
                        } @else if (n.completed_at) {
                          {{
                            'training.home.completedOn'
                              | transloco: { date: (n.completed_at | localDay) }
                          }}
                        } @else if (n.due_at) {
                          {{ 'training.home.dueOn' | transloco: { date: (n.due_at | localDay) } }}
                        } @else {
                          {{ 'common.empty.dash' | transloco }}
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section class="mb-8" aria-labelledby="person-assignments">
          <h2 id="person-assignments" class="mb-3 font-display text-section font-bold text-fg">
            {{ 'training.person.assignmentsTitle' | transloco }}
          </h2>
          @if (openAssignments().length === 0) {
            <app-card>
              <p class="text-ui text-fg-muted">{{ 'training.person.noAssignments' | transloco }}</p>
            </app-card>
          } @else {
            <app-training-assignment-table [assignments]="openAssignments()" [showUser]="false" />
          }
        </section>

        <section aria-labelledby="person-records">
          <h2 id="person-records" class="mb-3 font-display text-section font-bold text-fg">
            {{ 'training.person.recordsTitle' | transloco }}
          </h2>
          @if (p.records.length === 0) {
            <app-card>
              <p class="text-ui text-fg-muted">{{ 'training.person.noRecords' | transloco }}</p>
            </app-card>
          } @else {
            <div class="overflow-x-auto rounded-card border border-border bg-surface">
              <table class="w-full text-left text-ui" data-testid="person-records-table">
                <caption class="sr-only">
                  {{
                    'training.person.recordsTitle' | transloco
                  }}
                </caption>
                <thead class="border-b border-border text-meta text-fg-muted">
                  <tr>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.course' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.completed' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.validity' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.method' | transloco }}
                    </th>
                    <th scope="col" class="px-4 py-2.5 font-semibold">
                      {{ 'training.fields.certificate' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of p.records; track r.id) {
                    @let badge = recordBadgeOf(r);
                    <tr class="border-b border-border last:border-0">
                      <td class="px-4 py-2.5">
                        <a
                          [routerLink]="['/training/records', r.id]"
                          class="font-semibold text-fg hover:text-accent hover:underline"
                        >
                          <span class="font-mono text-meta text-fg-subtle">{{
                            r.course.code
                          }}</span>
                          {{ r.course.title }}
                        </a>
                      </td>
                      <td class="px-4 py-2.5 whitespace-nowrap text-fg-muted">
                        {{ r.completed_at | localDay }}
                      </td>
                      <td class="px-4 py-2.5">
                        <app-status-badge
                          [meaning]="badge.meaning"
                          [value]="badge.value"
                          [labelKey]="badge.labelKey"
                        />
                        @if (r.expires_at) {
                          <span class="ml-1 text-meta whitespace-nowrap text-fg-muted">
                            {{ r.expires_at | localDay }}
                          </span>
                        }
                      </td>
                      <td class="px-4 py-2.5 text-fg-muted">
                        {{ 'training.method.' + r.method | transloco }}
                        @if (r.missing_evidence) {
                          <app-badge tone="warn" class="ml-1">
                            {{ 'training.records.missingEvidence' | transloco }}
                          </app-badge>
                        }
                      </td>
                      <td class="px-4 py-2.5">
                        @if (r.certificate_no && r.passed) {
                          <a
                            [routerLink]="['/training/records', r.id, 'certificate']"
                            class="font-mono text-meta text-accent hover:underline"
                            >{{ r.certificate_no }}</a
                          >
                        } @else {
                          <span class="text-fg-subtle">{{ 'common.empty.dash' | transloco }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      } @else if (error(); as key) {
        <app-page-header
          titleKey="training.person.titleFallback"
          [breadcrumbs]="[
            { labelKey: 'modules.names.training', link: '/training' },
            { labelKey: 'training.person.titleFallback' },
          ]"
        />
        @if (key === 'training.errors.forbidden') {
          <app-empty-state
            icon="lock"
            titleKey="training.person.forbiddenTitle"
            bodyKey="training.person.forbidden"
          />
        } @else {
          <app-error-state (retry)="reload()" />
        }
      } @else {
        <app-loading-state [rows]="6" />
      }
    </div>
  `,
})
export class PersonTrainingPage {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  protected readonly access = inject(TrainingAccess);

  /** Route param. */
  readonly userId = input.required<string>();

  protected readonly person = signal<PersonTraining | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly cellBadgeOf = cellBadge;
  private readonly tick = signal(0);

  protected readonly needs = computed(() => sortNeeds(this.person()?.needs ?? []));
  protected readonly openAssignments = computed(() =>
    (this.person()?.assignments ?? []).filter((a) => isOpenAssignment(a)),
  );
  protected readonly subtitle = computed(() => {
    const p = this.person();
    return p ? personSubtitle(p.user) : '';
  });

  private sub = new Subscription();

  constructor() {
    providePageContext(() => ({
      module: TRAINING_MODULE,
      view: 'detail',
      title: this.person()
        ? this.language.translate('training.person.title', { name: this.person()?.user.name })
        : null,
    }));
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const userId = this.userId();
      this.tick();
      untracked(() => {
        this.sub.unsubscribe();
        if (!orgId) {
          return;
        }
        this.error.set(null);
        this.sub = this.api.person(orgId, userId).subscribe({
          next: (p) => this.person.set(p),
          error: (err: unknown) => {
            this.person.set(null);
            this.error.set(trainingErrorKey(err));
          },
        });
      });
    });
  }

  protected recordBadgeOf(r: TrainingRecord) {
    return recordBadge(r);
  }

  protected reload(): void {
    this.tick.update((n) => n + 1);
  }

  protected print(): void {
    globalThis.print?.();
  }
}
