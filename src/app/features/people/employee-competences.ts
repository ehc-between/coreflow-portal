import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { cellStatusTone, textOrNull, todayIso } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { PeopleLookups } from './data/people-lookups';
import { COMPETENCE_LEVELS, EmployeeCompetences, HeldCompetence } from './data/people.models';

interface AssessDraft {
  readonly competence_id: string;
  readonly level: number;
  readonly assessed_on: string;
  readonly expires_on: string;
  readonly evidence_note: string;
}

/**
 * The competences of one employee: what their position requires and what they hold,
 * each with its status (met, gap, missing, expired, not required). Writers record an
 * assessment (level 0-4, date, evidence; expiry defaults from the competence's
 * validity) or remove one.
 */
@Component({
  selector: 'app-people-employee-competences',
  imports: [
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    FieldHelp,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-comp-h" id="competences">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-comp-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'people.competences.heldTitle' | transloco }}
        </h2>
        @if (canEdit()) {
          <app-button
            size="sm"
            variant="secondary"
            (click)="openAssess(null)"
            data-testid="assess-new"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'people.competences.assess' | transloco }}
          </app-button>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <p class="py-4 text-[13px] text-fg-muted" role="status">
            {{ 'people.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="py-4 text-[13px] text-fail" role="alert">
            {{ 'people.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (data(); as d) {
            @if (!d.position_id) {
              <p class="mb-2 text-[12.5px] text-fg-muted">
                {{ 'people.competences.noPosition' | transloco }}
              </p>
            }
            @if (d.items.length === 0) {
              <p class="py-3 text-[13px] text-fg-muted" data-testid="competences-empty">
                {{ 'people.competences.heldEmpty' | transloco }}
              </p>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full min-w-[560px] text-left text-[13px]" data-testid="held-rows">
                  <thead class="text-[12px] text-fg-subtle">
                    <tr class="border-b border-border">
                      <th scope="col" class="py-2 pr-3 font-semibold">
                        {{ 'people.fields.competence' | transloco }}
                      </th>
                      <th scope="col" class="py-2 pr-3 font-semibold">
                        {{ 'people.fields.requiredLevel' | transloco }}
                      </th>
                      <th scope="col" class="py-2 pr-3 font-semibold">
                        {{ 'people.fields.level' | transloco }}
                      </th>
                      <th scope="col" class="py-2 pr-3 font-semibold">
                        {{ 'people.fields.expiresOn' | transloco }}
                      </th>
                      <th scope="col" class="py-2 pr-3 font-semibold">
                        {{ 'people.fields.status' | transloco }}
                      </th>
                      @if (canEdit()) {
                        <th scope="col" class="py-2 font-semibold">
                          <span class="sr-only">{{ 'people.common.actions' | transloco }}</span>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (row of d.items; track row.competence_id) {
                      <tr>
                        <td class="py-2 pr-3">
                          <a
                            [routerLink]="['/people/competences', row.competence_id]"
                            class="font-semibold text-fg hover:underline"
                            >{{ row.competence_name }}</a
                          >
                          @if (row.mandatory && row.required_level !== null) {
                            <span class="ml-1 text-[11.5px] text-fg-subtle">{{
                              'people.competences.mandatory' | transloco
                            }}</span>
                          }
                          @if (row.evidence_note) {
                            <p class="text-[12px] text-fg-subtle">{{ row.evidence_note }}</p>
                          }
                        </td>
                        <td class="py-2 pr-3">
                          {{
                            row.required_level !== null
                              ? ('people.levels.' + row.required_level | transloco)
                              : '–'
                          }}
                        </td>
                        <td class="py-2 pr-3">
                          {{
                            row.level !== null ? ('people.levels.' + row.level | transloco) : '–'
                          }}
                          @if (row.assessed_on) {
                            <span class="block text-[11.5px] text-fg-subtle">{{
                              'people.competences.assessedOn'
                                | transloco: { date: (row.assessed_on | localDay) }
                            }}</span>
                          }
                        </td>
                        <td class="py-2 pr-3">
                          {{ row.expires_on ? (row.expires_on | localDay) : '–' }}
                        </td>
                        <td class="py-2 pr-3">
                          <app-badge [tone]="tone(row.status)">{{
                            'people.cellStatus.' + row.status | transloco
                          }}</app-badge>
                        </td>
                        @if (canEdit()) {
                          <td class="py-2 text-right whitespace-nowrap">
                            <app-button
                              size="sm"
                              variant="ghost"
                              (click)="openAssess(row)"
                              [attr.data-testid]="'assess-' + row.competence_id"
                            >
                              {{ 'people.competences.assess' | transloco }}
                            </app-button>
                            @if (row.level !== null) {
                              <app-button size="sm" variant="ghost" (click)="removing.set(row)">
                                <app-icon name="trash" [size]="14" />
                                <span class="sr-only">{{
                                  'people.competences.remove' | transloco
                                }}</span>
                              </app-button>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      }
    </section>

    <app-confirm-dialog
      [open]="draft() !== null"
      [title]="'people.competences.assessTitle' | transloco"
      [message]="'people.competences.assessMessage' | transloco"
      [confirmLabel]="'common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!draft()?.competence_id"
      initialFocus="#cf-assess-comp"
      (confirmed)="saveAssessment()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as a) {
        <div class="mt-4 flex flex-col gap-3">
          <app-form-field [label]="'people.fields.competence' | transloco" inputId="cf-assess-comp">
            <select
              id="cf-assess-comp"
              [disabled]="lockedCompetence()"
              (change)="patch({ competence_id: $any($event.target).value })"
              data-testid="assess-competence"
            >
              <option value="" [selected]="!a.competence_id">
                {{ 'people.competences.pick' | transloco }}
              </option>
              @for (c of competenceOptions(); track c.id) {
                <option [value]="c.id" [selected]="a.competence_id === c.id">{{ c.name }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'people.fields.level' | transloco" inputId="cf-assess-level">
            <select
              id="cf-assess-level"
              (change)="patch({ level: +$any($event.target).value })"
              data-testid="assess-level"
            >
              @for (l of levels; track l) {
                <option [value]="l" [selected]="a.level === l">
                  {{ 'people.levels.' + l | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-field-help scope="people" page="detail" field="level" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field
              [label]="'people.fields.assessedOn' | transloco"
              inputId="cf-assess-date"
            >
              <input
                id="cf-assess-date"
                type="date"
                [value]="a.assessed_on"
                (change)="patch({ assessed_on: $any($event.target).value })"
              />
            </app-form-field>
            <app-form-field [label]="'people.fields.expiresOn' | transloco" inputId="cf-assess-exp">
              <input
                id="cf-assess-exp"
                type="date"
                [value]="a.expires_on"
                (change)="patch({ expires_on: $any($event.target).value })"
              />
            </app-form-field>
          </div>
          <p class="text-[12px] text-fg-subtle">
            {{ 'people.competences.expiryHint' | transloco }}
          </p>
          <app-form-field
            [label]="'people.fields.evidenceNote' | transloco"
            inputId="cf-assess-note"
          >
            <input
              id="cf-assess-note"
              type="text"
              maxlength="1000"
              [value]="a.evidence_note"
              (input)="patch({ evidence_note: $any($event.target).value })"
            />
          </app-form-field>
        </div>
      }
    </app-confirm-dialog>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'people.competences.removeTitle' | transloco"
      [message]="
        'people.competences.removeMessage' | transloco: { name: removing()?.competence_name ?? '' }
      "
      [confirmLabel]="'people.competences.remove' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class EmployeeCompetencesSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly lookups = inject(PeopleLookups);

  readonly employeeId = input.required<string>();
  readonly canEdit = input(false);
  /** Bumped by the page to force a reload (e.g. after the position changed). */
  readonly refresh = input(0);
  readonly changed = output<void>();

  protected readonly levels = COMPETENCE_LEVELS;
  protected readonly tone = cellStatusTone;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly data = signal<EmployeeCompetences | null>(null);
  protected readonly draft = signal<AssessDraft | null>(null);
  protected readonly lockedCompetence = signal(false);
  protected readonly removing = signal<HeldCompetence | null>(null);
  protected readonly busy = signal(false);

  protected readonly competenceOptions = computed(() => {
    const active = this.lookups.competences().filter((c) => c.status === 'active');
    const listed = (this.data()?.items ?? []).map((i) => ({
      id: i.competence_id,
      name: i.competence_name,
    }));
    const seen = new Set(listed.map((c) => c.id));
    return [
      ...listed,
      ...active.filter((c) => !seen.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    ];
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.employeeId();
      this.refresh();
      untracked(() => {
        this.lookups.ensureLoaded();
        this.load(orgId, id);
      });
    });
  }

  protected openAssess(row: HeldCompetence | null): void {
    this.lockedCompetence.set(!!row);
    this.draft.set({
      competence_id: row?.competence_id ?? '',
      level: row?.level ?? row?.required_level ?? 2,
      assessed_on: todayIso(),
      expires_on: '',
      evidence_note: row?.evidence_note ?? '',
    });
  }

  protected patch(patch: Partial<AssessDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected saveAssessment(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d?.competence_id || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .assessCompetence(orgId, this.employeeId(), d.competence_id, {
        level: d.level,
        assessed_on: d.assessed_on || null,
        expires_on: d.expires_on || null,
        evidence_note: textOrNull(d.evidence_note),
      })
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.draft.set(null);
          this.data.set(data);
          this.notifications.success('people.notices.assessed');
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(peopleErrorKey(error));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const row = this.removing();
    if (!orgId || !row || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeCompetence(orgId, this.employeeId(), row.competence_id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('people.notices.competenceRemoved');
        this.load(orgId, this.employeeId());
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (!this.data()) {
      this.state.set('loading');
    }
    this.request = this.api.employeeCompetences(orgId, id).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
