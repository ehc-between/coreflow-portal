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
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { PeopleApi } from './data/people-api';
import { textOrNull, todayIso } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { AWARENESS_KINDS, AwarenessKind, AwarenessRecord } from './data/people.models';

interface AwarenessDraft {
  readonly id: string | null;
  readonly topic: string;
  readonly kind: AwarenessKind;
  readonly completed_on: string;
  readonly notes: string;
}

/**
 * Awareness records of one employee (ISO HS 7.3, ISO 27001 A.6.3): policies read,
 * security awareness, briefings, campaigns and inductions, with the date completed.
 */
@Component({
  selector: 'app-people-employee-awareness',
  imports: [TranslocoPipe, LocalDayPipe, FieldHelp, Button, ConfirmDialog, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-aw-h" id="awareness">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-aw-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'people.awareness.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <app-button
            size="sm"
            variant="secondary"
            (click)="open(null)"
            data-testid="awareness-new"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'people.awareness.add' | transloco }}
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
          @if (items().length === 0) {
            <p class="py-3 text-[13px] text-fg-muted">{{ 'people.awareness.empty' | transloco }}</p>
          } @else {
            <ul class="divide-y divide-border" data-testid="awareness-rows">
              @for (r of items(); track r.id) {
                <li class="flex flex-wrap items-start gap-2 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="text-[13.5px] font-semibold text-fg">{{ r.topic }}</p>
                    <p class="text-[12px] text-fg-subtle">
                      {{ 'people.awarenessKinds.' + r.kind | transloco }} ·
                      {{ r.completed_on | localDay }}
                    </p>
                    @if (r.notes) {
                      <p class="mt-1 text-[12.5px] whitespace-pre-line text-fg-muted">
                        {{ r.notes }}
                      </p>
                    }
                  </div>
                  @if (canEdit()) {
                    <app-button size="sm" variant="ghost" (click)="open(r)">
                      {{ 'people.common.edit' | transloco }}
                    </app-button>
                    <app-button size="sm" variant="ghost" (click)="removing.set(r)">
                      <app-icon name="trash" [size]="14" />
                      <span class="sr-only">{{ 'people.common.delete' | transloco }}</span>
                    </app-button>
                  }
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
        (draft()?.id ? 'people.awareness.editTitle' : 'people.awareness.addTitle') | transloco
      "
      [message]="'people.awareness.message' | transloco"
      [confirmLabel]="'common.save' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      confirmVariant="primary"
      [busy]="busy()"
      [confirmDisabled]="!draft()?.topic?.trim() || !draft()?.completed_on"
      initialFocus="#cf-aw-topic"
      (confirmed)="save()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as d) {
        <div class="mt-4 flex flex-col gap-3">
          <app-form-field [label]="'people.fields.topic' | transloco" inputId="cf-aw-topic">
            <input
              id="cf-aw-topic"
              type="text"
              maxlength="200"
              required
              [value]="d.topic"
              (input)="patch({ topic: $any($event.target).value })"
              data-testid="awareness-topic"
            />
          </app-form-field>
          <app-form-field [label]="'people.fields.awarenessKind' | transloco" inputId="cf-aw-kind">
            <select id="cf-aw-kind" (change)="patch({ kind: $any($event.target).value })">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="d.kind === k">
                  {{ 'people.awarenessKinds.' + k | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-field-help scope="people" page="detail" field="awareness" />
          <app-form-field [label]="'people.fields.completedOn' | transloco" inputId="cf-aw-date">
            <input
              id="cf-aw-date"
              type="date"
              required
              [value]="d.completed_on"
              (change)="patch({ completed_on: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'people.fields.notes' | transloco" inputId="cf-aw-notes">
            <textarea
              id="cf-aw-notes"
              rows="2"
              maxlength="5000"
              [value]="d.notes"
              (input)="patch({ notes: $any($event.target).value })"
            ></textarea>
          </app-form-field>
        </div>
      }
    </app-confirm-dialog>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'people.awareness.deleteTitle' | transloco"
      [message]="'people.awareness.deleteMessage' | transloco: { topic: removing()?.topic ?? '' }"
      [confirmLabel]="'people.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class EmployeeAwarenessSection {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly employeeId = input.required<string>();
  readonly canEdit = input(false);

  protected readonly kinds = AWARENESS_KINDS;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly AwarenessRecord[]>([]);
  protected readonly draft = signal<AwarenessDraft | null>(null);
  protected readonly removing = signal<AwarenessRecord | null>(null);
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

  protected open(record: AwarenessRecord | null): void {
    this.draft.set({
      id: record?.id ?? null,
      topic: record?.topic ?? '',
      kind: record?.kind ?? 'briefing',
      completed_on: record?.completed_on ?? todayIso(),
      notes: record?.notes ?? '',
    });
  }

  protected patch(patch: Partial<AwarenessDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !d.topic.trim() || !d.completed_on || this.busy()) {
      return;
    }
    const body = {
      topic: d.topic.trim(),
      kind: d.kind,
      completed_on: d.completed_on,
      notes: textOrNull(d.notes),
    };
    this.busy.set(true);
    const call = d.id
      ? this.api.updateAwareness(orgId, d.id, body)
      : this.api.addAwareness(orgId, this.employeeId(), body);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.draft.set(null);
        this.notifications.success('people.notices.awarenessSaved');
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
    const r = this.removing();
    if (!orgId || !r || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteAwareness(orgId, r.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('people.notices.awarenessDeleted');
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
    this.request = this.api.awareness(orgId, id).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
