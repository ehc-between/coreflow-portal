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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import {
  CUSTOMER_ENTITY,
  CUSTOMER_STATUSES,
  CustomerRef,
  CustomerStatus,
} from '../../shared/customers/customer.models';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Alert } from '../../shared/ui/alert/alert';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { DateInput } from '../../shared/ui/date-input/date-input';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormField } from '../../shared/ui/form-field/form-field';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import {
  LookupField,
  customerErrorKey,
  fillFromLookup,
  norwegianOrgNumber,
  orgNumberChecksumOk,
  takenBy,
} from './data/customer-display';
import {
  CustomerDetail,
  CustomerFields,
  RegistrySnapshot,
  SupplierRef,
} from './data/customer.models';
import { CustomersApi } from './data/customers-api';
import { CustomerOwnerSelect } from './data/owner-select';

/** The form's text values ('' = empty). */
export interface CustomerDraft {
  name: string;
  legal_name: string;
  org_number: string;
  org_form: string;
  country: string;
  address_line: string;
  postal_code: string;
  city: string;
  industry_code: string;
  industry_label: string;
  segment: string;
  status: CustomerStatus;
  owner_user_id: string;
  website: string;
  email: string;
  phone: string;
  description: string;
  customer_since: string;
}

export function draftFrom(c: CustomerDetail | null): CustomerDraft {
  return {
    name: c?.name ?? '',
    legal_name: c?.legal_name ?? '',
    org_number: c?.org_number ?? '',
    org_form: c?.org_form ?? '',
    country: c?.country ?? 'NO',
    address_line: c?.address_line ?? '',
    postal_code: c?.postal_code ?? '',
    city: c?.city ?? '',
    industry_code: c?.industry_code ?? '',
    industry_label: c?.industry_label ?? '',
    segment: c?.segment ?? '',
    status: c?.status ?? 'active',
    owner_user_id: c?.owner?.id ?? '',
    website: c?.website ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    description: c?.description ?? '',
    customer_since: c?.customer_since?.slice(0, 10) ?? '',
  };
}

const blank = (v: string): string | null => (v.trim() ? v.trim() : null);

/** The API body of a draft (blank strings become null). */
export function fieldsFrom(d: CustomerDraft, registry: RegistrySnapshot | null): CustomerFields {
  const country = blank(d.country)?.toUpperCase() ?? null;
  const digits = norwegianOrgNumber(d.org_number);
  return {
    name: d.name.trim(),
    legal_name: blank(d.legal_name),
    org_number: digits && (!country || country === 'NO') ? digits : blank(d.org_number),
    org_form: blank(d.org_form),
    country,
    address_line: blank(d.address_line),
    postal_code: blank(d.postal_code),
    city: blank(d.city),
    industry_code: blank(d.industry_code),
    industry_label: blank(d.industry_label),
    segment: blank(d.segment),
    status: d.status,
    owner_user_id: d.owner_user_id || null,
    website: blank(d.website),
    email: blank(d.email),
    phone: blank(d.phone),
    description: blank(d.description),
    customer_since: blank(d.customer_since),
    ...(registry ? { registry } : {}),
  };
}

type LookupState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'found';
      readonly filled: readonly LookupField[];
      readonly existing: CustomerRef | null;
      readonly supplier: SupplierRef | null;
    }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'unavailable' };

/** Prefill keys a create flow may send for a customer (the create-DTO's field names). */
const PREFILL_FIELDS: readonly (keyof CustomerDraft)[] = [
  'name',
  'legal_name',
  'org_number',
  'country',
  'website',
  'email',
  'phone',
  'description',
  'segment',
];

/**
 * New and edit form of a customer (`/customers/new`, `/customers/:id/edit`,
 * docs/customer-register-design.md §3.1). The org. number comes first: a
 * Norwegian number is looked up in Brønnøysundregistrene (on blur or when nine
 * digits are typed) and fills the empty fields, never what the user typed. A
 * number that is already a customer says so with a link; an unavailable register
 * is a calm note and the form stays usable; a mod-11 failure is an inline
 * warning only. `?from_supplier=<id>` and create flows prefill the form.
 */
@Component({
  selector: 'app-customer-form-page',
  imports: [
    TranslocoPipe,
    RouterLink,
    FlowBanner,
    Alert,
    Button,
    Card,
    DateInput,
    ErrorState,
    FormField,
    LoadingState,
    PageHeader,
    CustomerOwnerSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="titleKey()"
        [title]="isEdit() ? loadedName() : null"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="cancelLink()"
        backLabelKey="customers.common.back"
      />
      @if (!isEdit()) {
        <app-flow-banner [flow]="flow()" />
      }

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
        }
        @default {
          @if (error(); as key) {
            <div class="mb-4" data-testid="form-error">
              <app-alert>
                {{ key | transloco }}
                @if (taken(); as t) {
                  <a [routerLink]="['/customers', t.id]" class="ml-1 font-semibold underline">
                    {{ 'customers.form.openExisting' | transloco: { name: t.name } }}
                  </a>
                }
              </app-alert>
            </div>
          }
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <app-card>
              <h2 class="mb-3 font-display text-card font-bold text-fg">
                {{ 'customers.form.sections.company' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-form-field
                  [label]="'customers.fields.orgNumber' | transloco"
                  inputId="cus-orgnr"
                >
                  <input
                    id="cus-orgnr"
                    type="text"
                    inputmode="numeric"
                    maxlength="32"
                    autocomplete="off"
                    aria-describedby="cus-orgnr-note"
                    [value]="d().org_number"
                    (input)="onOrgNumber($any($event.target).value)"
                    (blur)="lookup()"
                    data-testid="orgnr-input"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'customers.fields.country' | transloco"
                  inputId="cus-country"
                >
                  <input
                    id="cus-country"
                    type="text"
                    maxlength="2"
                    autocomplete="country"
                    [value]="d().country"
                    (input)="set('country', $any($event.target).value.toUpperCase())"
                  />
                </app-form-field>
                <div
                  id="cus-orgnr-note"
                  class="flex flex-col gap-1.5 empty:hidden sm:col-span-2"
                  aria-live="polite"
                >
                  @switch (lookupState().kind) {
                    @case ('loading') {
                      <p class="text-meta text-fg-muted" data-testid="lookup-loading">
                        {{ 'customers.lookup.loading' | transloco }}
                      </p>
                    }
                    @case ('notFound') {
                      <p class="text-meta text-fg-muted" data-testid="lookup-not-found">
                        {{ 'customers.lookup.notFound' | transloco }}
                      </p>
                    }
                    @case ('unavailable') {
                      <p class="text-meta text-warn-ink" data-testid="lookup-unavailable">
                        {{ 'customers.lookup.unavailable' | transloco }}
                      </p>
                    }
                  }
                  @if (found(); as f) {
                    @if (f.filled.length) {
                      <p class="text-meta text-fg-muted" data-testid="lookup-filled">
                        {{ 'customers.lookup.filled' | transloco }}
                      </p>
                    } @else {
                      <p class="text-meta text-fg-muted" data-testid="lookup-nothing">
                        {{ 'customers.lookup.nothingToFill' | transloco }}
                      </p>
                    }
                    @if (f.existing; as e) {
                      <p
                        class="text-meta font-semibold text-warn-ink"
                        data-testid="lookup-existing"
                      >
                        {{ 'customers.lookup.exists' | transloco: { name: e.name } }}
                        <a [routerLink]="['/customers', e.id]" class="ml-1 text-accent underline">
                          {{ 'customers.lookup.open' | transloco }}
                        </a>
                      </p>
                    }
                    @if (f.supplier; as s) {
                      <p class="text-meta text-fg-muted" data-testid="lookup-supplier">
                        {{ 'customers.lookup.alsoSupplier' | transloco: { name: s.name } }}
                      </p>
                    }
                  }
                  @if (checksumWarning()) {
                    <p class="text-meta text-warn-ink" data-testid="orgnr-checksum">
                      {{ 'customers.form.checksumWarning' | transloco }}
                    </p>
                  }
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'customers.fields.name' | transloco"
                    inputId="cus-name"
                    [required]="true"
                  >
                    <input
                      id="cus-name"
                      type="text"
                      maxlength="255"
                      required
                      aria-required="true"
                      [attr.aria-invalid]="showErrors() && !d().name.trim()"
                      [value]="d().name"
                      (input)="set('name', $any($event.target).value)"
                      data-testid="name-input"
                    />
                  </app-form-field>
                  @if (showErrors() && !d().name.trim()) {
                    <p class="mt-1 text-meta text-fail-ink" role="alert">
                      {{ 'customers.form.nameRequired' | transloco }}
                    </p>
                  }
                </div>
                <app-form-field
                  [label]="'customers.fields.legalName' | transloco"
                  inputId="cus-legal"
                >
                  <input
                    id="cus-legal"
                    type="text"
                    maxlength="255"
                    [value]="d().legal_name"
                    (input)="set('legal_name', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field [label]="'customers.fields.orgForm' | transloco" inputId="cus-form">
                  <input
                    id="cus-form"
                    type="text"
                    maxlength="16"
                    [value]="d().org_form"
                    (input)="set('org_form', $any($event.target).value)"
                  />
                </app-form-field>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'customers.fields.address' | transloco"
                    inputId="cus-address"
                  >
                    <input
                      id="cus-address"
                      type="text"
                      maxlength="255"
                      autocomplete="street-address"
                      [value]="d().address_line"
                      (input)="set('address_line', $any($event.target).value)"
                      data-testid="address-input"
                    />
                  </app-form-field>
                </div>
                <app-form-field
                  [label]="'customers.fields.postalCode' | transloco"
                  inputId="cus-postal"
                >
                  <input
                    id="cus-postal"
                    type="text"
                    maxlength="16"
                    autocomplete="postal-code"
                    [value]="d().postal_code"
                    (input)="set('postal_code', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field [label]="'customers.fields.city' | transloco" inputId="cus-city">
                  <input
                    id="cus-city"
                    type="text"
                    maxlength="100"
                    [value]="d().city"
                    (input)="set('city', $any($event.target).value)"
                    data-testid="city-input"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'customers.fields.industryCode' | transloco"
                  inputId="cus-nace"
                >
                  <input
                    id="cus-nace"
                    type="text"
                    maxlength="16"
                    [value]="d().industry_code"
                    (input)="set('industry_code', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'customers.fields.industry' | transloco"
                  inputId="cus-industry"
                >
                  <input
                    id="cus-industry"
                    type="text"
                    maxlength="255"
                    [value]="d().industry_label"
                    (input)="set('industry_label', $any($event.target).value)"
                  />
                </app-form-field>
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-card font-bold text-fg">
                {{ 'customers.form.sections.relationship' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-form-field
                  [label]="'customers.fields.status' | transloco"
                  inputId="cus-status"
                >
                  <select id="cus-status" (change)="set('status', $any($event.target).value)">
                    @for (s of statuses; track s) {
                      <option [value]="s" [selected]="d().status === s">
                        {{ 'customers.status.' + s | transloco }}
                      </option>
                    }
                  </select>
                </app-form-field>
                <app-form-field
                  [label]="'customers.fields.segment' | transloco"
                  inputId="cus-segment"
                >
                  <input
                    id="cus-segment"
                    type="text"
                    maxlength="64"
                    list="cus-segments"
                    [value]="d().segment"
                    (input)="set('segment', $any($event.target).value)"
                  />
                  <datalist id="cus-segments">
                    @for (s of segments(); track s) {
                      <option [value]="s"></option>
                    }
                  </datalist>
                </app-form-field>
                <app-form-field [label]="'customers.fields.owner' | transloco" inputId="cus-owner">
                  <app-customer-owner-select
                    inputId="cus-owner"
                    [value]="d().owner_user_id"
                    [currentName]="ownerName()"
                    (valueChange)="set('owner_user_id', $event)"
                  />
                </app-form-field>
                <app-form-field
                  [label]="'customers.fields.customerSince' | transloco"
                  inputId="cus-since"
                >
                  <app-date-input
                    inputId="cus-since"
                    [value]="d().customer_since"
                    (changed)="set('customer_since', $event)"
                  />
                </app-form-field>
              </div>
            </app-card>

            <app-card>
              <h2 class="mb-3 font-display text-card font-bold text-fg">
                {{ 'customers.form.sections.contact' | transloco }}
              </h2>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <app-form-field [label]="'customers.fields.email' | transloco" inputId="cus-email">
                  <input
                    id="cus-email"
                    type="email"
                    maxlength="320"
                    [value]="d().email"
                    (input)="set('email', $any($event.target).value)"
                  />
                </app-form-field>
                <app-form-field [label]="'customers.fields.phone' | transloco" inputId="cus-phone">
                  <input
                    id="cus-phone"
                    type="tel"
                    maxlength="64"
                    [value]="d().phone"
                    (input)="set('phone', $any($event.target).value)"
                  />
                </app-form-field>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'customers.fields.website' | transloco"
                    inputId="cus-web"
                  >
                    <input
                      id="cus-web"
                      type="url"
                      maxlength="500"
                      [value]="d().website"
                      (input)="set('website', $any($event.target).value)"
                    />
                  </app-form-field>
                </div>
                <div class="sm:col-span-2">
                  <app-form-field
                    [label]="'customers.fields.description' | transloco"
                    inputId="cus-desc"
                  >
                    <textarea
                      id="cus-desc"
                      rows="4"
                      [value]="d().description"
                      (input)="set('description', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
              </div>
            </app-card>

            <div
              class="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <app-button variant="secondary" (click)="cancel()">
                {{ 'customers.common.cancel' | transloco }}
              </app-button>
              <app-button type="submit" [loading]="busy()" data-testid="save-customer">
                {{ 'customers.common.save' | transloco }}
              </app-button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class CustomerFormPage {
  private readonly api = inject(CustomersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);

  /** Route param on `/customers/:id/edit`; absent on `/customers/new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly statuses = CUSTOMER_STATUSES;
  protected readonly flow = this.flows.consume(this.route, { targetType: CUSTOMER_ENTITY });

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly d = signal<CustomerDraft>(draftFrom(null));
  protected readonly loaded = signal<CustomerDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly taken = signal<CustomerRef | null>(null);
  protected readonly segments = signal<readonly string[]>([]);
  protected readonly lookupState = signal<LookupState>({ kind: 'idle' });
  private readonly registry = signal<RegistrySnapshot | null>(null);
  /** The org. number last looked up (no repeat lookups for the same number). */
  private lastLookup: string | null = null;

  protected readonly titleKey = computed(() =>
    this.isEdit() ? 'customers.form.editTitle' : 'customers.form.newTitle',
  );
  protected readonly loadedName = computed(() => {
    const c = this.loaded();
    return c ? this.language.translate('customers.form.editTitleNamed', { name: c.name }) : null;
  });
  protected readonly breadcrumbs = computed(() => {
    const c = this.loaded();
    return c
      ? [
          { labelKey: 'modules.names.customers', link: '/customers' },
          { label: c.name, link: `/customers/${c.id}` },
          { labelKey: 'customers.form.editTitle' },
        ]
      : [
          { labelKey: 'modules.names.customers', link: '/customers' },
          { labelKey: 'customers.form.newTitle' },
        ];
  });
  protected readonly cancelLink = computed(() =>
    this.id() ? `/customers/${this.id()}` : '/customers',
  );
  protected readonly ownerName = computed(() => this.loaded()?.owner?.name ?? null);
  protected readonly found = computed(() => {
    const s = this.lookupState();
    return s.kind === 'found' ? s : null;
  });
  protected readonly checksumWarning = computed(() => {
    const country = this.d().country.trim().toUpperCase();
    const digits = norwegianOrgNumber(this.d().org_number);
    return !!digits && (!country || country === 'NO') && !orgNumberChecksumOk(digits);
  });

  private sub = new Subscription();
  private lookupSub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.sub.unsubscribe();
      this.lookupSub.unsubscribe();
    });
    providePageContext(() => ({
      module: 'customers',
      entityType: CUSTOMER_ENTITY,
      entityId: this.id() ?? null,
      view: this.isEdit() ? 'edit' : 'new',
      title: this.loaded()?.name ?? this.language.translate('customers.form.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.init(orgId, id ?? null));
    });
    // A create flow (e.g. "Registrer som kunde" from a supplier) prefills the form.
    effect(() => {
      const flow = this.flow();
      if (flow && !this.isEdit()) {
        untracked(() => this.applyPrefill(flow.prefill));
      }
    });
  }

  protected set<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected onOrgNumber(value: string): void {
    this.set('org_number', value);
    const digits = norwegianOrgNumber(value);
    if (digits) {
      this.lookup();
    } else if (this.lookupState().kind !== 'loading') {
      this.lookupState.set({ kind: 'idle' });
    }
  }

  /** Look the org. number up in Brønnøysundregistrene (Norwegian numbers only). */
  protected lookup(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const country = this.d().country.trim().toUpperCase();
    const digits = norwegianOrgNumber(this.d().org_number);
    if (!orgId || !digits || (country && country !== 'NO') || digits === this.lastLookup) {
      return;
    }
    this.lastLookup = digits;
    this.lookupSub.unsubscribe();
    this.lookupState.set({ kind: 'loading' });
    this.lookupSub = this.api.registry(orgId, digits).subscribe({
      next: (res) => {
        const { draft, filled } = fillFromLookup(this.d(), res);
        this.d.set({ ...draft, org_number: digits, country: draft.country || 'NO' });
        this.registry.set(res.registry ?? null);
        const existing =
          res.existing_customer && res.existing_customer.id !== this.id()
            ? res.existing_customer
            : null;
        this.lookupState.set({
          kind: 'found',
          filled,
          existing,
          supplier: res.also_supplier ?? null,
        });
      },
      error: (err: unknown) => {
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.lookupState.set({
          kind: status === 404 ? 'notFound' : status === 422 ? 'idle' : 'unavailable',
        });
        if (status !== 404) {
          // Allow a retry of the same number when the register was unreachable.
          this.lastLookup = null;
        }
      },
    });
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    if (!this.d().name.trim()) {
      this.showErrors.set(true);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.taken.set(null);
    const fields = fieldsFrom(this.d(), this.registry());
    const id = this.id();
    const request = id ? this.api.update(orgId, id, fields) : this.api.create(orgId, fields);
    request.subscribe({
      next: (customer) => {
        this.busy.set(false);
        this.notifications.success(id ? 'customers.notices.saved' : 'customers.notices.created', {
          code: customer.code,
        });
        if (!id && this.flow()) {
          this.flows
            .complete(customer.id, CUSTOMER_ENTITY)
            .pipe(catchError(() => of(null)))
            .subscribe();
        }
        void this.router.navigate(['/customers', customer.id]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(customerErrorKey(err));
        this.taken.set(takenBy(err));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.cancelLink());
  }

  protected reload(): void {
    this.init(this.selectedOrg.currentOrgId(), this.id() ?? null);
  }

  private init(orgId: string | null, id: string | null): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    this.sub.add(
      this.api.segments(orgId).subscribe({
        next: (list) => this.segments.set(list),
        error: () => this.segments.set([]),
      }),
    );
    if (id) {
      this.state.set('loading');
      this.sub.add(
        this.api.get(orgId, id).subscribe({
          next: (c) => {
            this.loaded.set(c);
            this.d.set(draftFrom(c));
            this.lastLookup = c.org_number;
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        }),
      );
      return;
    }
    const supplierId = this.route.snapshot.queryParamMap.get('from_supplier');
    if (supplierId) {
      this.sub.add(
        this.api.supplier(orgId, supplierId).subscribe({
          next: (s) =>
            this.applyPrefill({
              name: s.name,
              legal_name: s.legal_name,
              org_number: s.registration_number,
              country: s.country,
              website: s.website,
            }),
          error: () => undefined,
        }),
      );
    }
  }

  /** Fill empty fields from prefill values, then look the org. number up. */
  private applyPrefill(prefill: Readonly<Record<string, unknown>>): void {
    const next = { ...this.d() };
    for (const key of PREFILL_FIELDS) {
      const value = prefill[key];
      const current = next[key];
      if (typeof value === 'string' && value.trim() && typeof current === 'string') {
        if (!current.trim() || (key === 'country' && current === 'NO')) {
          (next as Record<string, unknown>)[key] = value.trim();
        }
      }
    }
    this.d.set(next);
    if (norwegianOrgNumber(next.org_number)) {
      this.lookup();
    }
  }
}
