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
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { pluralKey } from '../../../shared/i18n/plural';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, telHref, todayIso } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import {
  CONTACT_TYPES,
  Contact,
  ContactFields,
  ContactType,
  LinkedRef,
} from '../data/continuity.models';
import { ContinuityRecordPicker } from './record-picker';
import { ContinuityUserSelect } from './user-select';

interface ContactDraft {
  name: string;
  contact_type: ContactType;
  crisis_role: string;
  organisation: string;
  user_id: string;
  supplier: LinkedRef | null;
  phone: string;
  alt_phone: string;
  email: string;
  available_24_7: boolean;
  notes: string;
  verified_on: string;
}

export function contactDraft(c: Contact | null): ContactDraft {
  return {
    name: c?.name ?? '',
    contact_type: c?.contact_type ?? 'internal',
    crisis_role: c?.crisis_role ?? '',
    organisation: c?.organisation ?? '',
    user_id: c?.user?.id ?? '',
    supplier: c?.supplier_id
      ? {
          entity_type: 'supplier',
          entity_id: c.supplier_id,
          title: c.organisation || c.name,
          url: `/suppliers/${c.supplier_id}`,
        }
      : null,
    phone: c?.phone ?? '',
    alt_phone: c?.alt_phone ?? '',
    email: c?.email ?? '',
    available_24_7: c?.available_24_7 ?? false,
    notes: c?.notes ?? '',
    verified_on: c?.verified_on ?? '',
  };
}

/**
 * The API fields of a draft. The order in the list is changed by dragging (or the
 * move buttons), so `position` is left to the server: `null` puts a new contact
 * last and keeps an edited contact where it is.
 */
export function contactFields(d: ContactDraft): ContactFields {
  return {
    name: d.name.trim(),
    contact_type: d.contact_type,
    crisis_role: blankToNull(d.crisis_role),
    organisation: blankToNull(d.organisation),
    user_id: d.user_id || null,
    supplier_id: d.supplier?.entity_id ?? null,
    phone: blankToNull(d.phone),
    alt_phone: blankToNull(d.alt_phone),
    email: blankToNull(d.email),
    available_24_7: d.available_24_7,
    notes: blankToNull(d.notes),
    position: null,
    verified_on: d.verified_on || null,
  };
}

/** A contact can be reached when it has a phone, an e-mail or a linked member. */
export function isReachable(d: ContactDraft): boolean {
  return !!(d.phone.trim() || d.email.trim() || d.user_id);
}

/** Move one id within a list (drag and drop, or the move buttons). */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * A crisis contact list: the org-wide list (`planId` null) or a plan's own list.
 * Shows role, how to reach each contact (tap-to-call and e-mail links), 24/7
 * availability and a flag on contacts not verified within a year. With write access
 * it adds, edits, marks verified, reorders (drag the handle, or use the move
 * buttons) and removes contacts.
 */
@Component({
  selector: 'app-continuity-contacts-panel',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ContinuityRecordPicker,
    ContinuityUserSelect,
    EmptyState,
    ErrorState,
    FieldHelp,
    FormField,
    Icon,
    LoadingState,
    SlideOver,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"
      >
        <div>
          <h2 class="font-display text-card font-bold text-fg" [id]="headingId">
            {{
              (planId() ? 'continuity.contacts.planTitle' : 'continuity.contacts.orgTitle')
                | transloco
            }}
          </h2>
          @if (needsVerification() > 0) {
            <p class="text-meta text-warn-ink">
              {{
                plural('continuity.contacts.needsVerificationCount', needsVerification())
                  | transloco: { count: needsVerification() }
              }}
            </p>
          } @else if (canEdit() && contacts().length > 1) {
            <p class="text-meta text-fg-muted">
              {{ 'continuity.contacts.reorderHint' | transloco }}
            </p>
          }
        </div>
        @if (canEdit()) {
          <app-button size="sm" (click)="openNew()">
            <app-icon name="plus" [size]="14" />
            {{ 'continuity.contacts.add' | transloco }}
          </app-button>
        }
      </div>
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="3" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (contacts().length === 0) {
            <app-empty-state
              icon="people"
              [titleKey]="
                planId() ? 'continuity.contacts.emptyPlan' : 'continuity.contacts.emptyOrg'
              "
              [ctaKey]="canEdit() ? 'continuity.contacts.add' : null"
              (cta)="openNew()"
            />
          } @else {
            <ul
              class="divide-y divide-border"
              [attr.aria-labelledby]="headingId"
              data-testid="contact-rows"
            >
              @for (c of contacts(); track c.id; let i = $index, first = $first, last = $last) {
                <li
                  class="flex gap-2 px-3 py-3 sm:px-4"
                  [class.bg-accent-soft]="dragOver() === i"
                  [attr.draggable]="canEdit() && contacts().length > 1 ? 'true' : null"
                  (dragstart)="onDragStart($event, i)"
                  (dragover)="onDragOver($event, i)"
                  (dragleave)="dragOver.set(null)"
                  (drop)="onDrop($event, i)"
                  (dragend)="dragFrom.set(null); dragOver.set(null)"
                >
                  @if (canEdit() && contacts().length > 1) {
                    <span
                      class="mt-0.5 flex flex-none cursor-grab items-start text-fg-subtle"
                      aria-hidden="true"
                      ><app-icon name="grip" [size]="16"
                    /></span>
                  }
                  <div
                    class="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-start md:gap-4"
                  >
                    <div class="min-w-0 flex-1">
                      <p
                        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-fg"
                      >
                        <span>{{ c.name }}</span>
                        @if (c.crisis_role && c.crisis_role !== c.name) {
                          <span class="font-normal text-fg-muted">· {{ c.crisis_role }}</span>
                        }
                        <app-badge>{{
                          'continuity.contactType.' + c.contact_type | transloco
                        }}</app-badge>
                        @if (c.available_24_7) {
                          <app-badge tone="accent">{{
                            'continuity.contacts.available247' | transloco
                          }}</app-badge>
                        }
                        @if (c.needs_verification) {
                          <app-badge tone="warn">{{
                            'continuity.contacts.needsVerification' | transloco
                          }}</app-badge>
                        }
                      </p>
                      @if (c.organisation || c.user?.name) {
                        <p class="text-meta text-fg-subtle">
                          @if (c.organisation) {
                            {{ c.organisation }}
                          }
                          @if (c.user?.name; as member) {
                            @if (c.organisation) {
                              ·
                            }
                            {{
                              (member === c.name
                                ? 'continuity.contacts.isMember'
                                : 'continuity.contacts.linkedMember'
                              ) | transloco: { name: member }
                            }}
                          }
                        </p>
                      }
                      <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-ui">
                        @if (tel(c.phone); as href) {
                          <a
                            [href]="href"
                            class="inline-flex min-h-6 items-center text-accent hover:underline"
                          >
                            {{ 'continuity.contacts.callPhone' | transloco: { phone: c.phone } }}
                          </a>
                        }
                        @if (tel(c.alt_phone); as href) {
                          <a
                            [href]="href"
                            class="inline-flex min-h-6 items-center text-accent hover:underline"
                          >
                            {{ 'continuity.contacts.callAlt' | transloco: { phone: c.alt_phone } }}
                          </a>
                        }
                        @if (c.email) {
                          <a
                            [href]="'mailto:' + c.email"
                            class="inline-flex min-h-6 items-center text-accent hover:underline"
                          >
                            {{ c.email }}
                          </a>
                        }
                      </p>
                      @if (c.notes) {
                        <p class="mt-1 text-meta whitespace-pre-line text-fg-muted">
                          {{ c.notes }}
                        </p>
                      }
                      <p class="mt-1 text-meta text-fg-subtle">
                        @if (c.verified_on) {
                          {{
                            'continuity.contacts.verifiedOn'
                              | transloco: { date: (c.verified_on | localDay) }
                          }}
                        } @else {
                          {{ 'continuity.contacts.neverVerified' | transloco }}
                        }
                      </p>
                    </div>
                    @if (canEdit()) {
                      <div class="flex flex-wrap items-center gap-1.5">
                        @if (c.needs_verification) {
                          <app-button
                            size="sm"
                            variant="secondary"
                            [disabled]="busy()"
                            (click)="markVerified(c)"
                          >
                            {{ 'continuity.contacts.markVerified' | transloco }}
                          </app-button>
                        }
                        <app-button size="sm" variant="ghost" (click)="openEdit(c)">
                          {{ 'continuity.common.edit' | transloco }}
                          <span class="sr-only">{{ c.name }}</span>
                        </app-button>
                        @if (contacts().length > 1) {
                          <button
                            type="button"
                            class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                            [disabled]="first || busy()"
                            [attr.aria-label]="
                              'continuity.contacts.moveUp' | transloco: { name: c.name }
                            "
                            (click)="move(i, i - 1)"
                          >
                            <span class="rotate-180"><app-icon name="chevron" [size]="14" /></span>
                          </button>
                          <button
                            type="button"
                            class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
                            [disabled]="last || busy()"
                            [attr.aria-label]="
                              'continuity.contacts.moveDown' | transloco: { name: c.name }
                            "
                            (click)="move(i, i + 1)"
                          >
                            <app-icon name="chevron" [size]="14" />
                          </button>
                        }
                        <app-button size="sm" variant="ghost" (click)="removing.set(c)">
                          <app-icon name="trash" [size]="14" />
                          <span class="sr-only">
                            {{ 'continuity.contacts.removeNamed' | transloco: { name: c.name } }}
                          </span>
                        </app-button>
                      </div>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        }
      }
    </app-card>

    <app-slide-over
      [open]="editorOpen()"
      [title]="
        (editing() ? 'continuity.contacts.editTitle' : 'continuity.contacts.newTitle') | transloco
      "
      [closeLabel]="'continuity.common.close' | transloco"
      (closed)="editorOpen.set(false)"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
        <div>
          <app-form-field [label]="'continuity.contacts.fields.name' | transloco" inputId="cc-name">
            <input
              id="cc-name"
              type="text"
              maxlength="255"
              required
              [attr.aria-invalid]="showErrors() && !d().name.trim()"
              [value]="d().name"
              (input)="set('name', $any($event.target).value)"
            />
          </app-form-field>
          @if (showErrors() && !d().name.trim()) {
            <p class="mt-1 text-meta text-fail-ink" role="alert">
              {{ 'continuity.contacts.nameRequired' | transloco }}
            </p>
          }
        </div>
        <app-form-field
          [label]="'continuity.contacts.fields.crisisRole' | transloco"
          inputId="cc-role"
        >
          <input
            id="cc-role"
            type="text"
            maxlength="255"
            [value]="d().crisis_role"
            (input)="set('crisis_role', $any($event.target).value)"
          />
          <app-field-help scope="continuity" page="contacts" field="crisis_role" />
        </app-form-field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field [label]="'continuity.contacts.fields.type' | transloco" inputId="cc-type">
            <select id="cc-type" (change)="set('contact_type', $any($event.target).value)">
              @for (t of types; track t) {
                <option [value]="t" [selected]="d().contact_type === t">
                  {{ 'continuity.contactType.' + t | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="'continuity.contacts.fields.organisation' | transloco"
            inputId="cc-org"
          >
            <input
              id="cc-org"
              type="text"
              maxlength="255"
              [value]="d().organisation"
              (input)="set('organisation', $any($event.target).value)"
            />
          </app-form-field>
        </div>
        @if (d().contact_type === 'supplier' || d().supplier) {
          <app-form-field
            [label]="'continuity.contacts.fields.supplier' | transloco"
            inputId="cc-supplier"
          >
            <app-continuity-record-picker
              inputId="cc-supplier"
              [types]="['supplier']"
              [value]="d().supplier"
              (picked)="pickSupplier($event)"
            />
          </app-form-field>
        }
        <app-form-field [label]="'continuity.contacts.fields.member' | transloco" inputId="cc-user">
          <app-continuity-user-select
            inputId="cc-user"
            [value]="d().user_id"
            [currentName]="editing()?.user?.name ?? null"
            describedBy="cc-user-hint"
            (valueChange)="set('user_id', $event)"
          />
          <p id="cc-user-hint" class="text-meta text-fg-subtle">
            {{ 'continuity.contacts.memberHint' | transloco }}
          </p>
        </app-form-field>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <app-form-field
            [label]="'continuity.contacts.fields.phone' | transloco"
            inputId="cc-phone"
          >
            <input
              id="cc-phone"
              type="tel"
              maxlength="64"
              autocomplete="off"
              [value]="d().phone"
              (input)="set('phone', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'continuity.contacts.fields.altPhone' | transloco"
            inputId="cc-alt"
          >
            <input
              id="cc-alt"
              type="tel"
              maxlength="64"
              autocomplete="off"
              [value]="d().alt_phone"
              (input)="set('alt_phone', $any($event.target).value)"
            />
          </app-form-field>
        </div>
        <app-form-field [label]="'continuity.contacts.fields.email' | transloco" inputId="cc-email">
          <input
            id="cc-email"
            type="email"
            maxlength="320"
            autocomplete="off"
            [value]="d().email"
            (input)="set('email', $any($event.target).value)"
          />
        </app-form-field>
        @if (showErrors() && !reachable()) {
          <p class="text-meta text-fail-ink" role="alert">
            {{ 'continuity.errors.contact_unreachable' | transloco }}
          </p>
        }
        <label class="flex min-h-6 items-center gap-2 text-body text-fg">
          <input
            type="checkbox"
            class="h-4 w-4"
            [checked]="d().available_24_7"
            (change)="set('available_24_7', $any($event.target).checked)"
          />
          {{ 'continuity.contacts.fields.available247' | transloco }}
        </label>
        <app-form-field
          [label]="'continuity.contacts.fields.verifiedOn' | transloco"
          inputId="cc-verified"
        >
          <input
            id="cc-verified"
            type="date"
            [max]="today"
            [value]="d().verified_on"
            (input)="set('verified_on', $any($event.target).value)"
          />
          @if (d().verified_on) {
            <p class="text-meta text-fg-subtle">{{ d().verified_on | localDay: 'longDate' }}</p>
          }
          <app-field-help scope="continuity" page="contacts" field="verified_on" />
        </app-form-field>
        <app-form-field [label]="'continuity.contacts.fields.notes' | transloco" inputId="cc-notes">
          <textarea
            id="cc-notes"
            rows="3"
            maxlength="5000"
            [value]="d().notes"
            (input)="set('notes', $any($event.target).value)"
          ></textarea>
        </app-form-field>
        @if (error(); as key) {
          <app-alert>{{ key | transloco }}</app-alert>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="ghost" (click)="editorOpen.set(false)">
            {{ 'common.cancel' | transloco }}
          </app-button>
          <app-button type="submit" [loading]="busy()">{{ 'common.save' | transloco }}</app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'continuity.contacts.removeTitle' | transloco"
      [message]="'continuity.contacts.removeMessage' | transloco: { name: removing()?.name ?? '' }"
      [confirmLabel]="'continuity.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class ContinuityContactsPanel {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  /** The plan whose own list this is (null = the org-wide list). */
  readonly planId = input<string | null>(null);
  readonly canEdit = input(false);
  /** Fires after a contact was added, edited, reordered or removed. */
  readonly changed = output<void>();

  private static nextId = 0;
  protected readonly headingId = `cc-heading-${++ContinuityContactsPanel.nextId}`;
  protected readonly types = CONTACT_TYPES;
  protected readonly today = todayIso();
  protected readonly tel = telHref;
  protected readonly plural = pluralKey;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly contacts = signal<readonly Contact[]>([]);
  protected readonly needsVerification = computed(
    () => this.contacts().filter((c) => c.needs_verification).length,
  );

  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<Contact | null>(null);
  protected readonly d = signal<ContactDraft>(contactDraft(null));
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly removing = signal<Contact | null>(null);
  protected readonly reachable = computed(() => isReachable(this.d()));
  protected readonly dragFrom = signal<number | null>(null);
  protected readonly dragOver = signal<number | null>(null);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const planId = this.planId();
      untracked(() => this.load(orgId, planId, true));
    });
  }

  protected set<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected pickSupplier(ref: LinkedRef | null): void {
    this.d.update((d) => ({
      ...d,
      supplier: ref,
      // The supplier names the organisation when none is written yet.
      organisation: ref && !d.organisation.trim() ? ref.title : d.organisation,
    }));
  }

  protected openNew(): void {
    this.editing.set(null);
    this.d.set(contactDraft(null));
    this.showErrors.set(false);
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(c: Contact): void {
    this.editing.set(c);
    this.d.set(contactDraft(c));
    this.showErrors.set(false);
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.planId(), true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.d();
    if (!orgId || this.busy()) {
      return;
    }
    if (!d.name.trim() || !isReachable(d)) {
      this.showErrors.set(true);
      return;
    }
    // The order is changed by dragging, so an edit never sends a position.
    const fields = Object.fromEntries(
      Object.entries(contactFields(d)).filter(([key]) => key !== 'position'),
    ) as Partial<ContactFields>;
    const current = this.editing();
    this.busy.set(true);
    this.error.set(null);
    const request = current
      ? this.api.updateContact(orgId, current.id, fields)
      : this.api.createContact(orgId, { ...contactFields(d), plan_id: this.planId() });
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.editorOpen.set(false);
        this.notifications.success('continuity.contacts.saved');
        this.afterChange();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(continuityErrorKey(err));
      },
    });
  }

  protected markVerified(c: Contact): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateContact(orgId, c.id, { verified_on: todayIso() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('continuity.contacts.verified', { name: c.name });
        this.afterChange();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  protected onDragStart(event: DragEvent, index: number): void {
    if (!this.canEdit()) {
      return;
    }
    this.dragFrom.set(index);
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected onDragOver(event: DragEvent, index: number): void {
    if (this.dragFrom() === null) {
      return;
    }
    event.preventDefault();
    this.dragOver.set(index);
  }

  protected onDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const from = this.dragFrom();
    this.dragFrom.set(null);
    this.dragOver.set(null);
    if (from !== null) {
      this.move(from, index);
    }
  }

  /** Save a new order (optimistic; reloads the server's order on failure). */
  protected move(from: number, to: number): void {
    const orgId = this.selectedOrg.currentOrgId();
    const current = this.contacts();
    const ids = moveId(
      current.map((c) => c.id),
      from,
      to,
    );
    if (!orgId || this.busy() || ids.every((id, i) => id === current[i]?.id)) {
      return;
    }
    const byId = new Map(current.map((c) => [c.id, c]));
    this.contacts.set(ids.map((id) => byId.get(id)!));
    this.busy.set(true);
    this.api.reorderContacts(orgId, this.planId(), ids).subscribe({
      next: (items) => {
        this.busy.set(false);
        this.contacts.set(items);
        this.notifications.success('continuity.contacts.reordered');
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(continuityErrorKey(err));
        this.load(orgId, this.planId(), false);
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
    this.api.deleteContact(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.success('continuity.contacts.removed', { name: c.name });
        this.afterChange();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.removing.set(null);
        this.notifications.error(continuityErrorKey(err));
      },
    });
  }

  private afterChange(): void {
    this.load(this.selectedOrg.currentOrgId(), this.planId(), false);
    this.changed.emit();
  }

  private load(orgId: string | null, planId: string | null, showLoading: boolean): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    if (showLoading) {
      this.state.set('loading');
    }
    this.request = this.api.listContacts(orgId, planId ? 'plan' : 'org', planId).subscribe({
      next: (items) => {
        this.contacts.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
