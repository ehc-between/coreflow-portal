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
import { Term } from '../../shared/guidance/term';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem, OverflowMenu } from '../../shared/ui/overflow-menu/overflow-menu';
import { PeopleApi } from './data/people-api';
import { textOrNull, todayIso } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import { AWARENESS_KINDS, AwarenessIn, AwarenessKind, AwarenessRecord } from './data/people.models';
import { PeopleDocumentPicker, PickedDocument } from './ui/document-picker';
import { PeopleField } from './ui/people-field';
import { DateInput } from '../../shared/ui/date-input/date-input';

export interface AwarenessDraft {
  readonly id: string | null;
  readonly topic: string;
  readonly kind: AwarenessKind;
  readonly completed_on: string;
  readonly document: PickedDocument | null;
  readonly notes: string;
}

/**
 * Whether the draft can be saved: a date, a topic unless a document names it, and
 * for "policy read" the policy document itself (so the record proves which version).
 */
export function awarenessDraftValid(d: AwarenessDraft): boolean {
  if (!d.completed_on) {
    return false;
  }
  if (d.kind === 'policy') {
    return !!d.document;
  }
  return !!d.topic.trim() || !!d.document;
}

/** The request body of a draft (a document's title stands in for an empty topic). */
export function toAwarenessIn(d: AwarenessDraft): AwarenessIn {
  return {
    topic: textOrNull(d.topic),
    kind: d.kind,
    completed_on: d.completed_on,
    document_id: d.document?.id ?? null,
    notes: textOrNull(d.notes),
  };
}

/**
 * "Bevisstgjøring" of one person (awareness, HS 7.3 and ISO 27001 A.6.3): policies
 * read — linked to the document and the version read — security awareness,
 * briefings and inductions. Read-and-sign acknowledgements from Documents and passed
 * courses from Training are pulled in automatically and shown read-only.
 */
@Component({
  selector: 'app-people-employee-awareness',
  imports: [
    DateInput,
    RouterLink,
    TranslocoPipe,
    LocalDayPipe,
    Term,
    Badge,
    Button,
    ConfirmDialog,
    ErrorState,
    Icon,
    LoadingState,
    MenuItem,
    OverflowMenu,
    PeopleDocumentPicker,
    PeopleField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-emp-aw-h" id="awareness">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-emp-aw-h" class="text-card font-bold text-fg">
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
      <p class="mb-3 text-meta text-fg-muted">
        {{ 'people.awareness.subtitleBefore' | transloco }}
        <app-term key="awareness" scope="people">{{
          'people.awareness.term' | transloco
        }}</app-term>
        {{ 'people.awareness.subtitleAfter' | transloco }}
      </p>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="2" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (items().length === 0) {
            <p class="py-3 text-ui text-fg-muted">{{ 'people.awareness.empty' | transloco }}</p>
          } @else {
            <ul class="divide-y divide-border" data-testid="awareness-rows">
              @for (r of items(); track r.id) {
                <li class="flex flex-wrap items-start gap-2 py-2.5">
                  <div class="min-w-0 flex-1">
                    <p class="flex flex-wrap items-center gap-1.5">
                      @if (r.document; as doc) {
                        <a
                          [routerLink]="doc.url"
                          class="text-body font-semibold text-fg hover:underline"
                        >
                          @if (doc.code) {
                            <span class="font-mono text-meta text-fg-subtle">{{ doc.code }}</span>
                          }
                          {{ doc.title }}
                        </a>
                      } @else if (r.url) {
                        <a
                          [routerLink]="r.url"
                          class="text-body font-semibold text-fg hover:underline"
                          >{{ r.topic }}</a
                        >
                      } @else {
                        <span class="text-body font-semibold text-fg">{{ r.topic }}</span>
                      }
                      @if (r.source && r.source !== 'manual') {
                        <app-badge tone="info">{{
                          'people.awareness.sources.' + r.source | transloco
                        }}</app-badge>
                      }
                    </p>
                    <p class="text-meta text-fg-muted">
                      {{ 'people.awarenessKinds.' + r.kind | transloco }}
                      @if (r.completed_on) {
                        ·
                        @if (r.revision) {
                          {{
                            'people.awareness.versionRead'
                              | transloco
                                : { rev: r.revision.rev, date: (r.completed_on | localDay) }
                          }}
                        } @else {
                          {{ r.completed_on | localDay }}
                        }
                      }
                    </p>
                    @if (r.notes) {
                      <p class="mt-1 text-meta whitespace-pre-line text-fg-muted">{{ r.notes }}</p>
                    }
                  </div>
                  @if (canEdit() && isEditable(r)) {
                    <app-overflow-menu [iconOnly]="true" labelKey="people.awareness.rowMenu">
                      <button appMenuItem type="button" (click)="open(r)">
                        {{ 'people.common.edit' | transloco }}
                      </button>
                      <button appMenuItem type="button" [danger]="true" (click)="removing.set(r)">
                        {{ 'people.common.delete' | transloco }}
                      </button>
                    </app-overflow-menu>
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
      [confirmDisabled]="!valid()"
      initialFocus="#cf-aw-kind"
      (confirmed)="save()"
      (cancelled)="draft.set(null)"
    >
      @if (draft(); as d) {
        <div class="mt-4 flex flex-col gap-3">
          <app-people-field
            labelKey="people.fields.awarenessKind"
            inputId="cf-aw-kind"
            page="detail"
            help="awareness"
          >
            <select id="cf-aw-kind" (change)="patch({ kind: $any($event.target).value })">
              @for (k of kinds; track k) {
                <option [value]="k" [selected]="d.kind === k">
                  {{ 'people.awarenessKinds.' + k | transloco }}
                </option>
              }
            </select>
          </app-people-field>
          <app-people-field
            labelKey="people.fields.document"
            inputId="cf-aw-doc"
            [required]="d.kind === 'policy'"
            [hintKey]="
              d.kind === 'policy'
                ? 'people.awareness.documentHint'
                : 'people.awareness.documentOptional'
            "
          >
            <app-people-document-picker
              inputId="cf-aw-doc"
              [value]="d.document"
              (valueChange)="patch({ document: $event })"
            />
          </app-people-field>
          <app-people-field
            labelKey="people.fields.topic"
            inputId="cf-aw-topic"
            [required]="!d.document"
            [hintKey]="d.document ? 'people.awareness.topicFromDocument' : null"
          >
            <input
              id="cf-aw-topic"
              type="text"
              maxlength="200"
              [value]="d.topic"
              (input)="patch({ topic: $any($event.target).value })"
              data-testid="awareness-topic"
            />
          </app-people-field>
          <app-people-field
            labelKey="people.fields.completedOn"
            inputId="cf-aw-date"
            [required]="true"
          >
            <app-date-input
              inputId="cf-aw-date"
              [required]="true"
              [value]="d.completed_on"
              (valueChange)="patch({ completed_on: $event ?? '' })"
            />
          </app-people-field>
          <app-people-field labelKey="people.fields.awarenessNotes" inputId="cf-aw-notes">
            <textarea
              id="cf-aw-notes"
              rows="2"
              maxlength="5000"
              [value]="d.notes"
              (input)="patch({ notes: $any($event.target).value })"
            ></textarea>
          </app-people-field>
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
  readonly changed = output<void>();

  protected readonly kinds = AWARENESS_KINDS;
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly AwarenessRecord[]>([]);
  protected readonly draft = signal<AwarenessDraft | null>(null);
  protected readonly removing = signal<AwarenessRecord | null>(null);
  protected readonly busy = signal(false);
  protected readonly valid = computed(() => {
    const d = this.draft();
    return d !== null && awarenessDraftValid(d);
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.employeeId();
      untracked(() => this.load(orgId, id));
    });
  }

  /** Opened from the page too ("Registrer" in the compliance card). */
  open(record: AwarenessRecord | null): void {
    const kind = record?.kind && record.kind !== 'training' ? record.kind : 'policy';
    this.draft.set({
      id: record?.id ?? null,
      topic: record && !record.document ? record.topic : '',
      kind,
      completed_on: record?.completed_on ?? todayIso(),
      document: record?.document
        ? { id: record.document.id, code: record.document.code, title: record.document.title }
        : null,
      notes: record?.notes ?? '',
    });
  }

  protected isEditable(r: AwarenessRecord): boolean {
    return r.editable !== false && (r.source ?? 'manual') === 'manual';
  }

  protected patch(patch: Partial<AwarenessDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.employeeId());
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || !awarenessDraftValid(d) || this.busy()) {
      return;
    }
    const body = toAwarenessIn(d);
    this.busy.set(true);
    const call = d.id
      ? this.api.updateAwareness(orgId, d.id, body)
      : this.api.addAwareness(orgId, this.employeeId(), body);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.draft.set(null);
        this.notifications.success('people.notices.awarenessSaved');
        this.reload();
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
        this.reload();
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
    this.request = this.api.awareness(orgId, id).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
