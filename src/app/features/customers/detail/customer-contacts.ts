import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { customerErrorKey } from '../data/customer-display';
import { ContactIn, CustomerContact } from '../data/customer.models';
import { CustomersApi } from '../data/customers-api';

interface ContactDraft {
  name: string;
  title: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
}

const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

export function contactBody(d: ContactDraft): ContactIn {
  return {
    name: d.name.trim(),
    title: blank(d.title),
    email: blank(d.email),
    phone: blank(d.phone),
    is_primary: d.is_primary,
    notes: blank(d.notes),
  };
}

/** Primary contact first, then by position and name. */
export function sortContacts(contacts: readonly CustomerContact[]): CustomerContact[] {
  return [...contacts].sort(
    (a, b) =>
      Number(b.is_primary) - Number(a.is_primary) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * "Kontaktpersoner" on the customer card: the list (primary marked with a star)
 * with add / edit / remove in a slide-over form. Emits `changed` after a save so
 * the card reloads (a new primary clears the old one on the server).
 */
@Component({
  selector: 'app-customer-contacts',
  imports: [TranslocoPipe, Button, ConfirmDialog, FormField, Icon, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-card border border-border bg-surface p-4"
      aria-labelledby="cus-contacts-title"
      data-testid="customer-contacts"
    >
      <div class="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="cus-contacts-title" class="font-display text-ui font-bold text-fg">
          {{ 'customers.contacts.title' | transloco }}
        </h2>
        @if (canEdit()) {
          <button
            type="button"
            class="text-meta font-semibold text-accent hover:underline"
            (click)="openNew()"
            data-testid="contact-add"
          >
            + {{ 'customers.contacts.add' | transloco }}
          </button>
        }
      </div>
      @if (sorted().length) {
        <ul class="flex flex-col divide-y divide-border">
          @for (c of sorted(); track c.id) {
            <li
              class="flex flex-wrap items-start justify-between gap-2 py-2"
              data-testid="contact-row"
            >
              <div class="min-w-0">
                <p class="flex items-center gap-1.5 text-ui font-semibold text-fg">
                  @if (c.is_primary) {
                    <span
                      class="text-warn-ink"
                      [attr.title]="'customers.contacts.primary' | transloco"
                      >★</span
                    >
                    <span class="sr-only">{{ 'customers.contacts.primary' | transloco }}</span>
                  }
                  {{ c.name }}
                  @if (c.title) {
                    <span class="font-normal text-fg-muted">· {{ c.title }}</span>
                  }
                </p>
                <p class="flex flex-wrap gap-x-3 text-meta text-fg-muted">
                  @if (c.email) {
                    <a [href]="'mailto:' + c.email" class="hover:underline">{{ c.email }}</a>
                  }
                  @if (c.phone) {
                    <a [href]="'tel:' + c.phone" class="hover:underline">{{ c.phone }}</a>
                  }
                </p>
              </div>
              @if (canEdit()) {
                <div class="flex gap-1">
                  <button
                    type="button"
                    class="rounded-md p-1 text-fg-subtle hover:text-fg"
                    [attr.aria-label]="'customers.contacts.edit' | transloco: { name: c.name }"
                    (click)="openEdit(c)"
                  >
                    <app-icon name="pencil" [size]="14" />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1 text-fg-subtle hover:text-fail"
                    [attr.aria-label]="'customers.contacts.remove' | transloco: { name: c.name }"
                    (click)="removing.set(c)"
                  >
                    <app-icon name="trash" [size]="14" />
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-meta text-fg-muted">{{ 'customers.contacts.none' | transloco }}</p>
      }
    </section>

    <app-slide-over
      [open]="editing() !== null"
      [title]="
        (editingId() ? 'customers.contacts.editTitle' : 'customers.contacts.newTitle') | transloco
      "
      [closeLabel]="'customers.common.close' | transloco"
      (closed)="close()"
    >
      @if (draft(); as d) {
        <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
          <app-form-field
            [label]="'customers.contacts.fields.name' | transloco"
            inputId="cc-name"
            [required]="true"
          >
            <input
              id="cc-name"
              type="text"
              maxlength="255"
              required
              aria-required="true"
              [value]="d.name"
              (input)="patch('name', $any($event.target).value)"
              data-testid="contact-name"
            />
          </app-form-field>
          @if (showErrors() && !d.name.trim()) {
            <p class="-mt-2 text-meta text-fail-ink" role="alert">
              {{ 'customers.contacts.nameRequired' | transloco }}
            </p>
          }
          <app-form-field
            [label]="'customers.contacts.fields.title' | transloco"
            inputId="cc-title"
          >
            <input
              id="cc-title"
              type="text"
              maxlength="120"
              [value]="d.title"
              (input)="patch('title', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'customers.contacts.fields.email' | transloco"
            inputId="cc-email"
          >
            <input
              id="cc-email"
              type="email"
              maxlength="320"
              [value]="d.email"
              (input)="patch('email', $any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'customers.contacts.fields.phone' | transloco"
            inputId="cc-phone"
          >
            <input
              id="cc-phone"
              type="tel"
              maxlength="64"
              [value]="d.phone"
              (input)="patch('phone', $any($event.target).value)"
            />
          </app-form-field>
          <label class="flex items-center gap-2 text-ui text-fg">
            <input
              type="checkbox"
              [checked]="d.is_primary"
              (change)="patch('is_primary', $any($event.target).checked)"
            />
            {{ 'customers.contacts.fields.primary' | transloco }}
          </label>
          <app-form-field
            [label]="'customers.contacts.fields.notes' | transloco"
            inputId="cc-notes"
          >
            <textarea
              id="cc-notes"
              rows="3"
              [value]="d.notes"
              (input)="patch('notes', $any($event.target).value)"
            ></textarea>
          </app-form-field>
          <div class="flex justify-end gap-2">
            <app-button variant="secondary" (click)="close()">{{
              'customers.common.cancel' | transloco
            }}</app-button>
            <app-button type="submit" [loading]="busy()" data-testid="contact-save">{{
              'customers.common.save' | transloco
            }}</app-button>
          </div>
        </form>
      }
    </app-slide-over>

    <app-confirm-dialog
      [open]="removing() !== null"
      [title]="'customers.contacts.removeTitle' | transloco"
      [message]="'customers.contacts.removeMessage' | transloco: { name: removing()?.name ?? '' }"
      [confirmLabel]="'customers.contacts.removeConfirm' | transloco"
      [cancelLabel]="'customers.common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="removing.set(null)"
    />
  `,
})
export class CustomerContacts {
  private readonly api = inject(CustomersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly customerId = input.required<string>();
  readonly contacts = input<readonly CustomerContact[]>([]);
  readonly canEdit = input(false);
  readonly changed = output<void>();

  protected readonly editing = signal<CustomerContact | 'new' | null>(null);
  protected readonly draft = signal<ContactDraft | null>(null);
  protected readonly removing = signal<CustomerContact | null>(null);
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);

  protected readonly sorted = computed(() => sortContacts(this.contacts()));
  protected readonly editingId = computed(() => {
    const e = this.editing();
    return e && e !== 'new' ? e.id : null;
  });

  openNew(): void {
    this.showErrors.set(false);
    this.editing.set('new');
    this.draft.set({
      name: '',
      title: '',
      email: '',
      phone: '',
      is_primary: this.contacts().length === 0,
      notes: '',
    });
  }

  protected openEdit(c: CustomerContact): void {
    this.showErrors.set(false);
    this.editing.set(c);
    this.draft.set({
      name: c.name,
      title: c.title ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      is_primary: c.is_primary,
      notes: c.notes ?? '',
    });
  }

  protected patch<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]): void {
    this.draft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  protected close(): void {
    this.editing.set(null);
    this.draft.set(null);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !d || this.busy()) {
      return;
    }
    if (!d.name.trim()) {
      this.showErrors.set(true);
      return;
    }
    const id = this.editingId();
    const body = contactBody(d);
    this.run(
      id
        ? this.api.updateContact(orgId, this.customerId(), id, body)
        : this.api.addContact(orgId, this.customerId(), body),
      'customers.contacts.saved',
      () => this.close(),
    );
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.removing();
    if (!orgId || !c) {
      return;
    }
    this.run(
      this.api.deleteContact(orgId, this.customerId(), c.id),
      'customers.contacts.removed',
      () => this.removing.set(null),
    );
  }

  private run(request: Observable<unknown>, successKey: string, done: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        done();
        this.notifications.success(successKey);
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }
}
