import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe, LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { PeopleApi } from './data/people-api';
import { peopleErrorKey } from './data/people-errors';
import { CompetenceRecord as RecordData } from './data/people.models';
import { PeopleClause } from './ui/clause-label';
import { PEOPLE_ROOT } from './ui/people-nav';

/**
 * The competence record of one person ("Kompetansebevis",
 * `/people/employees/:id/competence-record`): role and position, what the position
 * requires and what the person holds (with how and by whom it was assessed and the
 * training it rests on), open actions on gaps, awareness, training and the status
 * of every people control with the requirement it documents. Laid out for paper:
 * "Skriv ut / lagre som PDF" uses the browser's print dialog (no extra dependency).
 */
@Component({
  selector: 'app-people-competence-record',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDatePipe,
    LocalDayPipe,
    Button,
    EmptyState,
    LoadingState,
    PageHeader,
    PeopleClause,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      @media print {
        :host .no-print {
          display: none !important;
        }
        :host section {
          break-inside: avoid;
        }
      }
    `,
  ],
  template: `
    <div class="mx-auto max-w-[900px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7 print:max-w-none print:p-0">
      <div class="no-print">
        <app-page-header
          [title]="'people.record.title' | transloco: { name: data()?.employee?.full_name ?? '' }"
          [breadcrumbs]="breadcrumbs()"
        >
          <ng-container ngProjectAs="[primary]">
            <app-button (click)="print()" [disabled]="!data()" data-testid="record-print">
              {{ 'people.record.print' | transloco }}
            </app-button>
          </ng-container>
        </app-page-header>
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="8" />
        }
        @case ('error') {
          <app-empty-state
            icon="search"
            [titleKey]="errorKey()"
            ctaKey="people.common.backToList"
            ctaLink="/people/employees"
          />
        }
        @default {
          @if (data(); as r) {
            <article
              class="flex flex-col gap-6 rounded-card border border-border bg-surface p-5 text-ui text-fg print:border-0 print:p-0"
              data-testid="competence-record"
            >
              <header
                class="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"
              >
                <div>
                  <p class="text-meta font-semibold text-fg-subtle uppercase">
                    {{ 'people.record.heading' | transloco }}
                  </p>
                  <h1 class="font-display text-page font-bold text-fg">
                    {{ r.employee.full_name }}
                  </h1>
                  <p class="text-fg-muted">
                    <span class="font-mono">{{ r.employee.code }}</span>
                    @if (r.position?.title ?? r.employee.job_title; as role) {
                      · {{ role }}
                    }
                    @if (r.employee.department?.name; as dept) {
                      · {{ dept }}
                    }
                  </p>
                </div>
                <p class="text-meta text-fg-muted">
                  {{
                    'people.record.generated' | transloco: { date: (r.generated_at | localDate) }
                  }}
                </p>
              </header>

              <section aria-labelledby="cf-rec-controls">
                <h2 id="cf-rec-controls" class="mb-2 text-card font-bold">
                  {{ 'people.compliance.title' | transloco }}
                </h2>
                <table class="w-full text-left">
                  <thead class="text-meta text-fg-subtle">
                    <tr class="border-b border-border">
                      <th scope="col" class="py-1.5 pr-3 font-semibold">
                        {{ 'people.record.control' | transloco }}
                      </th>
                      <th scope="col" class="py-1.5 pr-3 font-semibold">
                        {{ 'people.fields.status' | transloco }}
                      </th>
                      <th scope="col" class="py-1.5 font-semibold">
                        {{ 'people.record.documents' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (item of r.compliance.items; track item.key) {
                      <tr>
                        <td class="py-1.5 pr-3">
                          {{ 'people.compliance.keys.' + item.key | transloco }}
                        </td>
                        <td class="py-1.5 pr-3">
                          {{ 'people.compliance.status.' + item.status | transloco }}
                          @if (item.done_on) {
                            <span class="text-fg-muted">· {{ item.done_on | localDay }}</span>
                          }
                        </td>
                        <td class="py-1.5 text-meta text-fg-muted">
                          @for (ref of item.clause_refs; track ref; let last = $last) {
                            <app-people-clause [ref]="ref" />{{ last ? '' : '; ' }}
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>

              <section aria-labelledby="cf-rec-comp">
                <h2 id="cf-rec-comp" class="mb-2 text-card font-bold">
                  {{ 'people.competences.heldTitle' | transloco }}
                </h2>
                @if (r.competences.items.length === 0) {
                  <p class="text-fg-muted">{{ 'people.competences.heldEmpty' | transloco }}</p>
                } @else {
                  <table class="w-full text-left">
                    <thead class="text-meta text-fg-subtle">
                      <tr class="border-b border-border">
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'people.fields.competence' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'people.record.levels' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 pr-3 font-semibold">
                          {{ 'people.record.assessment' | transloco }}
                        </th>
                        <th scope="col" class="py-1.5 font-semibold">
                          {{ 'people.fields.status' | transloco }}
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      @for (c of r.competences.items; track c.competence_id) {
                        <tr class="align-top">
                          <td class="py-1.5 pr-3 font-semibold">
                            {{ c.competence_name }}
                            @if (c.mandatory && c.required_level !== null) {
                              <span class="block text-meta font-normal text-fg-muted">{{
                                'people.competences.mandatory' | transloco
                              }}</span>
                            }
                          </td>
                          <td class="py-1.5 pr-3">
                            {{
                              'people.record.levelPair'
                                | transloco
                                  : { held: c.level ?? '–', required: c.required_level ?? '–' }
                            }}
                          </td>
                          <td class="py-1.5 pr-3 text-meta">
                            @if (c.assessed_on) {
                              {{ c.assessed_on | localDay }}
                              @if (c.method) {
                                · {{ 'people.methods.' + c.method | transloco }}
                              }
                              @if (c.assessed_by?.name; as by) {
                                · {{ by }}
                              }
                            }
                            @if (c.training_record; as tr) {
                              <span class="block">{{
                                'people.competences.basedOn'
                                  | transloco: { course: tr.course_code ?? '' }
                              }}</span>
                            }
                            @if (c.evidence_note) {
                              <span class="block text-fg-muted">{{ c.evidence_note }}</span>
                            }
                            @if (c.expires_on) {
                              <span class="block text-fg-muted">{{
                                'people.competences.expires'
                                  | transloco: { date: (c.expires_on | localDay) }
                              }}</span>
                            }
                          </td>
                          <td class="py-1.5">{{ 'people.cellStatus.' + c.status | transloco }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </section>

              @if (r.actions.length) {
                <section aria-labelledby="cf-rec-actions">
                  <h2 id="cf-rec-actions" class="mb-2 text-card font-bold">
                    {{ 'people.record.actions' | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-1">
                    @for (a of r.actions; track a.id) {
                      <li>
                        {{ 'people.gapActions.kinds.' + a.kind | transloco }}
                        @if (a.training_assignment?.course?.title; as title) {
                          – {{ title }}
                        } @else if (a.description) {
                          – {{ a.description }}
                        }
                        · {{ 'people.gapActionStatus.' + a.status | transloco }}
                        @if (a.due_date) {
                          ·
                          {{
                            'people.checklists.due' | transloco: { date: (a.due_date | localDay) }
                          }}
                        }
                      </li>
                    }
                  </ul>
                </section>
              }

              <section aria-labelledby="cf-rec-aw">
                <h2 id="cf-rec-aw" class="mb-2 text-card font-bold">
                  {{ 'people.awareness.title' | transloco }}
                </h2>
                @if (r.awareness.length === 0) {
                  <p class="text-fg-muted">{{ 'people.record.none' | transloco }}</p>
                } @else {
                  <ul class="flex flex-col gap-1">
                    @for (a of r.awareness; track a.id) {
                      <li>
                        {{ a.document?.title ?? a.topic }}
                        <span class="text-fg-muted">
                          · {{ 'people.awarenessKinds.' + a.kind | transloco }}
                          @if (a.revision) {
                            · {{ 'people.record.version' | transloco: { rev: a.revision.rev } }}
                          }
                          @if (a.completed_on) {
                            · {{ a.completed_on | localDay }}
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }
              </section>

              @if (r.training?.records?.length) {
                <section aria-labelledby="cf-rec-tr">
                  <h2 id="cf-rec-tr" class="mb-2 text-card font-bold">
                    {{ 'people.training.completed' | transloco }}
                  </h2>
                  <ul class="flex flex-col gap-1">
                    @for (t of r.training?.records ?? []; track t.id) {
                      <li>
                        {{ t.course.code }} {{ t.course.title }}
                        <span class="text-fg-muted"
                          >· {{ t.completed_at | localDate: 'mediumDate' }}</span
                        >
                      </li>
                    }
                  </ul>
                </section>
              }

              @if (r.position; as p) {
                <section aria-labelledby="cf-rec-pos">
                  <h2 id="cf-rec-pos" class="mb-2 text-card font-bold">
                    {{ 'people.record.position' | transloco }}
                  </h2>
                  <p class="font-semibold">{{ p.title }}</p>
                  @if (p.responsibilities) {
                    <p class="mt-1 whitespace-pre-line text-fg-muted">{{ p.responsibilities }}</p>
                  }
                </section>
              }
            </article>
            <p class="no-print mt-3 text-meta text-fg-muted">
              {{ 'people.record.printHint' | transloco }}
              <a
                [routerLink]="['/people/employees', r.employee.id]"
                class="font-semibold text-accent hover:underline"
                >{{ 'people.record.back' | transloco: { name: r.employee.full_name } }}</a
              >
            </p>
          }
        }
      }
    </div>
  `,
})
export class CompetenceRecordPage {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('people.common.loadFailed');
  protected readonly data = signal<RecordData | null>(null);

  protected readonly breadcrumbs = computed(() => {
    const e = this.data()?.employee;
    return [
      PEOPLE_ROOT,
      ...(e ? [{ label: e.full_name, link: ['/people/employees', e.id] }] : []),
      { labelKey: 'people.record.open' },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: 'people',
      entityType: 'employee',
      entityId: this.id(),
      view: 'other',
      title: this.data()?.employee.full_name ?? null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.state.set('loading');
        this.api.competenceRecord(orgId, id).subscribe({
          next: (data) => {
            this.data.set(data);
            this.state.set('ready');
          },
          error: (error: unknown) => {
            this.errorKey.set(peopleErrorKey(error));
            this.state.set('error');
          },
        });
      });
    });
  }

  protected print(): void {
    globalThis.print?.();
  }
}
