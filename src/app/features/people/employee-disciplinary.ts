import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
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
import { disciplinaryTone, textOrNull, todayIso } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import {
  DISCIPLINARY_STATUSES,
  DISCIPLINARY_TYPES,
  DisciplinaryCase,
  DisciplinaryStatus,
  DisciplinaryType,
} from './data/people.models';

interface CaseDraft {
  readonly id: string | null;
  readonly case_type: DisciplinaryType;
  readonly status: DisciplinaryStatus;
  readonly opened_on: string;
  readonly closed_on: string;
  readonly summary: string;
  readonly outcome: string;
}

/**
 * Disciplinary process records of one employee (ISO 27001 A.6.4). Restricted: the
 * page only renders this for `people:disciplinary` holders, and the records stay out
 * of search, comments, links and the assistant.
 */
@Component({
  selector: 'app-people-employee-disciplinary',
  imports: [TranslocoPipe, LocalDayPipe, FieldHelp, Badge, Button, ConfirmDialog, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-dc-h" id="disciplinary">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="cf-emp-dc-h"
          class="flex items-center gap-2 font-display text-[15px] font-bold text-fg"
        >
          <app-icon name="lock" [size]="14" class="text-fg-subtle" />
          {{ 'people.disciplinary.title' | transloco }}
        </h2>
        <app-button size="sm" variant="secondary" (click)="open(null)" data-testid="case-new">
          <app-icon name="plus" [size]="14" />
          {{ 'people.disciplinary.add' | transloco }}
        </app-button>
      </div>
      <p class="mb-3 text-[12.5px] text-fg-muted">
        {{ 'people.disciplinary.restricted' | transloco }}
      </p>
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
          @if (items().length === 0) {
            <p class="py-3 text-[13px] text-fg-muted">
              {{ 'people.disciplinary.empty' | transloco }}
            </p>
          } @else {
            <ul class="divide-y divide-border" data-testid="case-rows">
              @for (c of items(); track c.id) {
                <li class="flex flex-wrap items-start gap-2 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p
                      class="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-fg"
                    >
                      {{ 'people.disciplinaryTypes.' + c.case_type | transloco }}
                      <app-badge [tone]="tone(c.status)">{{
                        'people.disciplinaryStatus.' + c.status | transloco
                      }}</app-badge>
                    </p>
                    <p class="text-[12px] text-fg-subtle">
                      {{
                        'people.disciplinary.opened' | transloco: { date: (c.opened_on | localDay) }
                      }}
                      @if (c.closed_on) {
                        ·
                        {{
                          'people.disciplinary.closed'
                            | transloco: { date: (c.closed_on | localDay) }
                        }}
                      }
                    </p>
                    @if (c.summary) {
                      <p class="mt-1 text-[12.5px] whitespace-pre-line text-fg-muted">
                        {{ c.summary }}
                      </p>
                    }
                    @if (c.outcome) {
                      <p class="mt-1 text-[12.5px] whitespace-pre-line text-fg-muted">
                        <span class="font-semibold text-fg"
                          >{{ 'people.fields.outcome' | transloco }}:</span
                        >
                        {{ c.outcome }}
                      </p>
                    }
                  </div>
                  <app-button size="sm" variant="ghost" (click)="open(c)">
                    {{ 'people.common.edit' | transloco }}
                  </app-button>
                  <app-button size="sm" variant="ghost" (click)="removing.set(c)">
                    <app-icon name="trash" [size]="14" />
                    <span class="sr-only">{{ 'people.common.delete' | transloco }}</span>
                  </app-button>
                </li>
              }
            </ul>
          }
        }
      }
    </section>

    <app-confirm-dialog
      [open]="draft() !== null"
      [title]="
        (draft()?.id ? 'people.disciplinary.editTitle' : 'people.disciplinary.addTitle') | transloco
      "
      [message]="'people.disciplinary.message' | transloco"
      [confirmLabel]="'common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!draft()?.opened_on"
      initialFocus="#cf-dc-type"
      (confirmed)="save()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as d) {
        <div class="mt-4 flex flex-col gap-3">
          <app-form-field [label]="'people.fields.caseType' | transloco" inputId="cf-dc-type">
            <select id="cf-dc-type" (change)="patch({ case_type: $any($event.target).value })">
              @for (t of types; track t) {
                <option [value]="t" [selected]="d.case_type === t">
                  {{ 'people.disciplinaryTypes.' + t | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-field-help scope="people" page="detail" field="disciplinary" />
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <app-form-field [label]="'people.fields.openedOn' | transloco" inputId="cf-dc-opened">
              <input
                id="cf-dc-opened"
                type="date"
                required
                [value]="d.opened_on"
                (change)="patch({ opened_on: $any($event.target).value })"
              />
            </app-form-field>
            @if (d.id) {
              <app-form-field [label]="'people.fields.status' | transloco" inputId="cf-dc-status">
                <select id="cf-dc-status" (change)="patch({ status: $any($event.target).value })">
                  @for (s of statuses; track s) {
                    <option [value]="s" [selected]="d.status === s">
                      {{ 'people.disciplinaryStatus.' + s | transloco }}
                    </option>
                  }
                </select>
              </app-form-field>
            }
          </div>
          <app-form-field [label]="'people.fields.summary' | transloco" inputId="cf-dc-summary">
            <textarea
              id="cf-dc-summary"
              rows="3"
              maxlength="20000"
              [value]="d.summary"
              (input)="patch({ summary: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          @if (d.id) {
            <app-form-field [label]="'people.fields.outcome' | transloco" inputId="cf-dc-outcome">
              <textarea
                id="cf-dc-outcome"
                rows="2"
                maxlength="20000"
                [value]="d.outcome"
                (input)="patch({ outcome: $any($event.target).value })"
              ></textarea>
            </app-form-field>
          }
        </div>
      }
    </app-confirm-dialog>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'people.disciplinary.deleteTitle' | transloco"
      [message]="'people.disciplinary.deleteMessage' | transloco"
      [confirmLabel]="'people.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class EmployeeDisciplinarySection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly employeeId = input.required<string>();

  protected readonly types = DISCIPLINARY_TYPES;
  protected readonly statuses = DISCIPLINARY_STATUSES;
  protected readonly tone = disciplinaryTone;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly DisciplinaryCase[]>([]);
  protected readonly draft = signal<CaseDraft | null>(null);
  protected readonly removing = signal<DisciplinaryCase | null>(null);
  protected readonly busy = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.employeeId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected open(c: DisciplinaryCase | null): void {
    this.draft.set({
      id: c?.id ?? null,
      case_type: c?.case_type ?? 'security_breach',
      status: c?.status ?? 'open',
      opened_on: c?.opened_on ?? todayIso(),
      closed_on: c?.closed_on ?? '',
      summary: c?.summary ?? '',
      outcome: c?.outcome ?? '',
    });
  }

  protected patch(patch: Partial<CaseDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !d.opened_on || this.busy()) {
      return;
    }
    this.busy.set(true);
    const call = d.id
      ? this.api.updateDisciplinary(orgId, d.id, {
          case_type: d.case_type,
          status: d.status,
          opened_on: d.opened_on,
          summary: textOrNull(d.summary),
          outcome: textOrNull(d.outcome),
        })
      : this.api.openDisciplinary(orgId, this.employeeId(), {
          case_type: d.case_type,
          opened_on: d.opened_on,
          summary: textOrNull(d.summary),
        });
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.draft.set(null);
        this.notifications.success('people.notices.caseSaved');
        this.load(orgId, this.employeeId());
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.removing();
    if (!orgId || !c || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteDisciplinary(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('people.notices.caseDeleted');
        this.load(orgId, this.employeeId());
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
    this.request = this.api.disciplinary(orgId, id).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
