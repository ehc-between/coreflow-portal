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
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { CustomerPicker } from '../../shared/customers/customer-picker';
import { CUSTOMER_ENTITY, customerStatusBadge } from '../../shared/customers/customer.models';
import {
  RecordDetailLayout,
  RecordMissingItem,
  RecordTab,
} from '../../shared/kit/record-detail-layout';
import {
  RecordDetails,
  RecordLead,
  RecordMeta,
  RecordStatusLine,
} from '../../shared/kit/record-sections';
import { LocalDatePipe, LocalDayPipe, formatLocalDay } from '../../shared/locale/locale-pipes';
import { EntityTasks } from '../../shared/tasks/entity-tasks';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { MenuItem } from '../../shared/ui/overflow-menu/overflow-menu';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { AskPanelService } from '../ask/ask-panel.service';
import {
  customerErrorKey,
  formatOrgNumber,
  norwegianOrgNumber,
  registryWarnings,
  statusSentence,
} from './data/customer-display';
import { CustomerDetail, CustomerFields, CustomerOverview } from './data/customer.models';
import { CustomersApi } from './data/customers-api';
import { CustomerContacts, sortContacts } from './detail/customer-contacts';
import { CustomerSections } from './detail/customer-sections';

const NOTICE_WINDOW_DAYS = 60;

/** Field labels for the revision history of a customer. */
export const CUSTOMER_FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'customers.fields.name',
  legal_name: 'customers.fields.legalName',
  org_number: 'customers.fields.orgNumber',
  org_form: 'customers.fields.orgForm',
  country: 'customers.fields.country',
  address_line: 'customers.fields.address',
  postal_code: 'customers.fields.postalCode',
  city: 'customers.fields.city',
  industry_code: 'customers.fields.industryCode',
  industry_label: 'customers.fields.industry',
  segment: 'customers.fields.segment',
  status: 'customers.fields.status',
  owner_user_id: 'customers.fields.owner',
  website: 'customers.fields.website',
  email: 'customers.fields.email',
  phone: 'customers.fields.phone',
  description: 'customers.fields.description',
  customer_since: 'customers.fields.customerSince',
};

function daysUntil(day: string, today: Date): number {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const target = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

/**
 * What a customer still needs ("Oppfølging", docs/customer-register-design.md §5.4):
 * a customer owner, a contact person, an org. number (Norwegian customers), the
 * notice date of a contract that is close, and matches proposed for this customer.
 */
export function customerMissing(
  c: CustomerDetail,
  overview: CustomerOverview | null,
  editLink: readonly unknown[],
  addContact: (() => void) | null,
  canReview: boolean,
  today: Date = new Date(),
): RecordMissingItem[] {
  const out: RecordMissingItem[] = [];
  const renewal = overview?.facts?.next_renewal;
  if (renewal?.notice_by) {
    const days = daysUntil(renewal.notice_by, today);
    if (days >= 0 && days <= NOTICE_WINDOW_DAYS) {
      out.push({
        key: 'notice',
        labelKey: 'customers.missing.notice',
        params: { code: renewal.code ?? '', date: renewal.notice_by },
        link: ['/contracts', renewal.contract_id],
      });
    }
  }
  if (canReview && (overview?.pending_matches ?? 0) > 0) {
    const count = overview?.pending_matches ?? 0;
    out.push({
      key: 'matches',
      labelKey: count === 1 ? 'customers.missing.matchesOne' : 'customers.missing.matches',
      params: { count },
      link: '/customers/matches',
    });
  }
  if (!c.can_edit) {
    return out;
  }
  if (!c.owner) {
    out.push({ key: 'owner', labelKey: 'customers.missing.owner', link: editLink });
  }
  if (!c.contacts?.length && addContact) {
    out.push({ key: 'contact', labelKey: 'customers.missing.contact', action: addContact });
  }
  const country = (c.country ?? '').toUpperCase();
  if (!c.org_number && (!country || country === 'NO')) {
    out.push({ key: 'orgnr', labelKey: 'customers.missing.orgNumber', link: editLink });
  }
  return out;
}

/**
 * The customer card (`/customers/:id`, docs/customer-register-design.md §5), on the
 * detail-page anatomy: header (code · Kunde · status; Rediger; "Ny reklamasjon";
 * create flows, "Hent på nytt fra Brønnøysundregistrene", merge and delete in
 * "Mer"); Hovedinformasjon with the status sentence and the main fields; the
 * connected records per section, contacts and the other fields in Detaljer; one
 * Oppfølging card.
 */
@Component({
  selector: 'app-customer-detail',
  imports: [
    TranslocoPipe,
    RouterLink,
    RecordDetailLayout,
    RecordDetails,
    RecordLead,
    RecordMeta,
    RecordStatusLine,
    LocalDatePipe,
    LocalDayPipe,
    EntityTasks,
    Button,
    ConfirmDialog,
    ErrorState,
    FieldItem,
    FormField,
    Icon,
    LoadingState,
    MenuItem,
    StatusBadge,
    CustomerPicker,
    CustomerContacts,
    CustomerSections,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('loading') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-loading-state [rows]="6" />
        </div>
      }
      @case ('error') {
        <div class="mx-auto max-w-[1180px] px-4 pt-7 sm:px-8">
          <app-error-state
            titleKey="customers.detail.notFoundTitle"
            bodyKey="customers.detail.notFound"
            (retry)="reload()"
          />
        </div>
      }
      @case ('ready') {
        @if (customer(); as c) {
          <app-record-detail-layout
            [anatomy]="true"
            [entityType]="entityType"
            [entityId]="c.id"
            [title]="c.name"
            [breadcrumbs]="[
              { labelKey: 'modules.names.customers', link: '/customers' },
              { label: c.name },
            ]"
            [tabs]="tabs"
            [canEdit]="c.can_edit"
            [requirementsPanel]="true"
            [fieldLabels]="fieldLabels"
            [missing]="missing()"
            backLink="/customers"
            backLabelKey="customers.common.backToRegister"
          >
            <ng-container ngProjectAs="[meta]">
              <span class="font-mono">{{ c.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ 'customers.entity' | transloco }}</span>
              <span aria-hidden="true">·</span>
              @let st = statusBadge(c.status);
              <app-status-badge
                [meaning]="st.meaning"
                [value]="st.value"
                [labelKey]="st.labelKey"
              />
            </ng-container>

            @if (c.can_edit) {
              <app-button primary (click)="edit()" data-testid="customer-edit">
                {{ 'customers.actions.edit' | transloco }}
              </app-button>
            }
            @if (runnable().has('customer.to_claim')) {
              <app-button
                secondary
                variant="secondary"
                (click)="startFlow('customer.to_claim')"
                data-testid="customer-new-claim"
              >
                {{ 'customers.actions.newClaim' | transloco }}
              </app-button>
            }
            @if (c.can_edit && orgnrNo()) {
              <button
                appMenuItem
                overflow
                type="button"
                [disabled]="busy()"
                (click)="refetch()"
                data-testid="customer-refetch"
              >
                {{ 'customers.actions.refetch' | transloco }}
              </button>
            }
            @if (c.can_manage) {
              <button
                appMenuItem
                overflow
                type="button"
                (click)="openMerge()"
                data-testid="customer-merge"
              >
                {{ 'customers.actions.merge' | transloco }}
              </button>
            }
            @if (c.can_manage) {
              <button
                appMenuItem
                overflow
                type="button"
                [danger]="true"
                (click)="deleteOpen.set(true)"
                data-testid="customer-delete"
              >
                {{ 'customers.actions.delete' | transloco }}
              </button>
            }

            <button appMenuItem ask type="button" (click)="askAi('summarise')">
              <app-icon name="spark" [size]="15" />
              {{ 'customers.ai.summarise' | transloco }}
            </button>
            <button appMenuItem ask type="button" (click)="askAi('followUp')">
              <app-icon name="spark" [size]="15" />
              {{ 'customers.ai.followUp' | transloco }}
            </button>

            <app-record-lead record-lead [fillLink]="c.can_edit ? editLink() : null">
              @let s = sentence();
              <app-record-status-line status [tone]="s.tone" data-testid="status-sentence">{{
                sentenceText()
              }}</app-record-status-line>
              <app-field-item size="lead" labelKey="customers.fields.orgNumber">
                @if (c.org_number) {
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="font-mono">{{ formatOrgNumber(c.org_number) }}</span>
                    @if (c.also_supplier; as sup) {
                      <a
                        [routerLink]="['/suppliers', sup.id]"
                        class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-meta font-semibold text-fg hover:border-accent"
                        data-testid="also-supplier"
                      >
                        {{ 'customers.alsoSupplierNamed' | transloco: { name: sup.name } }}
                        <span aria-hidden="true">→</span>
                      </a>
                    }
                    @for (w of warnings(); track w) {
                      <app-status-badge meaning="lifecycle" value="overdue" [labelKey]="w" />
                    }
                    @if (c.orgnr_checksum_ok === false) {
                      <span class="text-meta text-warn-ink">{{
                        'customers.form.checksumWarning' | transloco
                      }}</span>
                    }
                  </span>
                }
              </app-field-item>
              <app-field-item size="lead" labelKey="customers.fields.address" [value]="address()" />
              <app-field-item
                size="lead"
                labelKey="customers.fields.owner"
                [value]="c.owner?.name"
              />
              <app-field-item size="lead" labelKey="customers.detail.primaryContact">
                @if (primary(); as p) {
                  <span class="block">{{ p.name }}</span>
                  <span class="block text-meta text-fg-muted">{{ contactLine(p) }}</span>
                }
              </app-field-item>
              <app-field-item
                size="lead"
                labelKey="customers.detail.segmentIndustry"
                [value]="segmentIndustry()"
              />
            </app-record-lead>

            <div class="flex flex-col gap-4">
              @if (overviewFailed()) {
                <p class="text-meta text-fg-muted" data-testid="overview-failed">
                  {{ 'customers.detail.overviewFailed' | transloco }}
                </p>
              }
              <app-customer-sections
                [overview]="overview()"
                [runnable]="runnable()"
                (flowRequested)="startFlow($event)"
              />
              <app-customer-contacts
                [customerId]="c.id"
                [contacts]="c.contacts"
                [canEdit]="c.can_edit"
                (changed)="reload()"
              />
              <app-record-details [columns]="3" [fillLink]="c.can_edit ? editLink() : null">
                <app-field-item labelKey="customers.fields.legalName" [value]="c.legal_name" />
                <app-field-item labelKey="customers.fields.orgForm" [value]="c.org_form" />
                <app-field-item labelKey="customers.fields.country" [value]="c.country" />
                <app-field-item labelKey="customers.fields.website">
                  @if (c.website) {
                    <a
                      [href]="websiteHref(c.website)"
                      target="_blank"
                      rel="noopener"
                      class="text-accent hover:underline"
                      >{{ c.website }}</a
                    >
                  }
                </app-field-item>
                <app-field-item labelKey="customers.fields.email" [value]="c.email" />
                <app-field-item labelKey="customers.fields.phone" [value]="c.phone" />
                <app-field-item
                  labelKey="customers.fields.customerSince"
                  [value]="c.customer_since | localDay"
                />
                <app-field-item
                  labelKey="customers.detail.registryChecked"
                  [value]="c.registry?.checked_at | localDate"
                />
                <app-field-item
                  labelKey="customers.fields.description"
                  [wide]="true"
                  [multiline]="true"
                  [value]="c.description"
                />
              </app-record-details>
            </div>

            <div tasks>
              <app-entity-tasks
                [entityType]="entityType"
                [entityId]="c.id"
                [canCreate]="canCreateTasks()"
                [entityLabel]="c.code + ' ' + c.name"
              />
            </div>

            <app-record-meta follow-up-meta>
              <app-field-item
                layout="inline"
                labelKey="customers.fields.owner"
                [value]="c.owner?.name"
              />
              <app-field-item
                layout="inline"
                labelKey="customers.fields.customerSince"
                [value]="c.customer_since | localDay"
              />
              <app-field-item
                layout="inline"
                labelKey="customers.detail.updated"
                [value]="c.updated_at | localDate"
              />
            </app-record-meta>
          </app-record-detail-layout>

          <app-confirm-dialog
            [open]="deleteOpen()"
            [title]="'customers.delete.title' | transloco"
            [message]="'customers.delete.message' | transloco: { name: c.name }"
            [confirmLabel]="'customers.actions.delete' | transloco"
            [cancelLabel]="'customers.common.cancel' | transloco"
            [busy]="busy()"
            (confirmed)="remove()"
            (cancelled)="deleteOpen.set(false)"
          />
          <app-confirm-dialog
            [open]="mergeOpen()"
            confirmVariant="primary"
            [title]="'customers.merge.title' | transloco"
            [message]="'customers.merge.message' | transloco: { name: c.name }"
            [confirmLabel]="'customers.merge.confirm' | transloco"
            [cancelLabel]="'customers.common.cancel' | transloco"
            [confirmDisabled]="!mergeInto() || mergeInto() === c.id"
            [busy]="busy()"
            (confirmed)="merge()"
            (cancelled)="mergeOpen.set(false)"
          >
            <app-form-field [label]="'customers.merge.into' | transloco" inputId="cus-merge-into">
              <app-customer-picker
                inputId="cus-merge-into"
                [required]="true"
                [value]="mergeInto()"
                (valueChange)="mergeInto.set($event)"
              />
            </app-form-field>
            @if (mergeInto() === c.id) {
              <p class="mt-1 text-meta text-fail-ink">{{ 'customers.merge.self' | transloco }}</p>
            }
          </app-confirm-dialog>
        }
      }
    }
  `,
})
export class CustomerDetailPage {
  private readonly api = inject(CustomersApi);
  private readonly kit = inject(KitApi);
  private readonly flows = inject(CreateFlowService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly ask = inject(AskPanelService);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  protected readonly entityType = CUSTOMER_ENTITY;
  protected readonly fieldLabels = CUSTOMER_FIELD_LABELS;
  protected readonly statusBadge = customerStatusBadge;
  protected readonly formatOrgNumber = formatOrgNumber;
  protected readonly tabs: readonly RecordTab[] = [
    'details',
    'related',
    'activity',
    'tasks',
    'comments',
    'attachments',
    'revisions',
  ];

  private readonly contactsPanel = viewChild(CustomerContacts);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly customer = signal<CustomerDetail | null>(null);
  protected readonly overview = signal<CustomerOverview | null>(null);
  protected readonly overviewFailed = signal(false);
  protected readonly runnable = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly mergeOpen = signal(false);
  protected readonly mergeInto = signal<string | null>(null);

  protected readonly editLink = computed<readonly unknown[]>(() => [
    '/customers',
    this.id(),
    'edit',
  ]);
  protected readonly sentence = computed(() =>
    statusSentence(this.customer()?.status ?? 'active', this.overview()?.facts),
  );
  /** "Aktiv kunde – 2 åpne reklamasjoner · kontrakt fornyes om 45 dager". */
  protected readonly sentenceText = computed(() => {
    const s = this.sentence();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, this.withDay(params));
    const tail = s.parts.length
      ? s.parts.map((p) => t(p.key, p.params)).join(' · ')
      : s.restKey
        ? t(s.restKey)
        : '';
    return tail ? `${t(s.leadKey)} – ${tail}` : t(s.leadKey);
  });
  protected readonly warnings = computed(() => registryWarnings(this.customer()?.registry));
  protected readonly primary = computed(
    () => sortContacts(this.customer()?.contacts ?? [])[0] ?? null,
  );
  protected readonly orgnrNo = computed(() => {
    const c = this.customer();
    const country = (c?.country ?? '').toUpperCase();
    return !!norwegianOrgNumber(c?.org_number) && (!country || country === 'NO');
  });
  protected readonly address = computed(() => {
    const c = this.customer();
    if (!c) {
      return null;
    }
    const place = [c.postal_code, c.city].filter(Boolean).join(' ');
    return [c.address_line, place].filter(Boolean).join(', ') || null;
  });
  protected readonly segmentIndustry = computed(() => {
    const c = this.customer();
    if (!c) {
      return null;
    }
    const industry = c.industry_label
      ? c.industry_code
        ? `${c.industry_label} (${c.industry_code})`
        : c.industry_label
      : c.industry_code;
    return [c.segment, industry].filter(Boolean).join(' · ') || null;
  });
  protected readonly canCreateTasks = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('tasks:write'),
  );
  private readonly canReview = computed(
    () => !!this.selectedOrg.currentOrg()?.permissions.includes('customers:write'),
  );
  protected readonly missing = computed<readonly RecordMissingItem[]>(() => {
    const c = this.customer();
    if (!c) {
      return [];
    }
    return customerMissing(
      c,
      this.overview(),
      this.editLink(),
      () => this.addContact(),
      this.canReview(),
    ).map((item) => ({ ...item, params: this.withDay(item.params) }));
  });

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    providePageContext(() => ({
      module: 'customers',
      entityType: CUSTOMER_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.customer()?.name || null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  /** Params with an ISO `date` shown as a local day. */
  private withDay(
    params: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (params && typeof params['date'] === 'string') {
      return {
        ...params,
        date: formatLocalDay(params['date'], 'mediumDate', this.language.locale()),
      };
    }
    return params;
  }

  protected contactLine(p: {
    email: string | null;
    phone: string | null;
    title: string | null;
  }): string {
    return [p.title, p.email, p.phone].filter(Boolean).join(' · ');
  }

  protected websiteHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  protected edit(): void {
    void this.router.navigate(this.editLink());
  }

  protected addContact(): void {
    this.contactsPanel()?.openNew();
  }

  protected startFlow(key: string): void {
    void this.flows.start(key, CUSTOMER_ENTITY, this.id());
  }

  protected askAi(kind: 'summarise' | 'followUp'): void {
    const c = this.customer();
    if (!c) {
      return;
    }
    this.ask.askAbout(
      this.language.translate(`customers.ai.prompts.${kind}`, { code: c.code, name: c.name }),
    );
  }

  /** "Hent på nytt fra Brønnøysundregistrene": overwrite the registry fields with fresh data. */
  protected refetch(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.customer();
    const digits = norwegianOrgNumber(c?.org_number);
    if (!orgId || !c || !digits || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.registry(orgId, digits).subscribe({
      next: (res) => {
        const patch: Partial<CustomerFields> = {};
        const take = <K extends keyof CustomerFields>(key: K, value: CustomerFields[K] | null) => {
          if (value !== null && value !== undefined && value !== '') {
            (patch as Record<string, unknown>)[key] = value;
          }
        };
        take('legal_name', res.legal_name);
        take('org_form', res.org_form);
        take('address_line', res.address_line);
        take('postal_code', res.postal_code);
        take('city', res.city);
        take('industry_code', res.industry_code);
        take('industry_label', res.industry_label);
        take('registry', res.registry);
        this.api.update(orgId, c.id, patch).subscribe({
          next: (updated) => {
            this.busy.set(false);
            this.customer.set(updated);
            this.notifications.success('customers.notices.refetched');
          },
          error: (err: unknown) => {
            this.busy.set(false);
            this.notifications.error(customerErrorKey(err));
          },
        });
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(
          (err as { status?: number })?.status === 404
            ? 'customers.lookup.notFound'
            : 'customers.lookup.unavailable',
        );
      },
    });
  }

  protected openMerge(): void {
    this.mergeInto.set(null);
    this.mergeOpen.set(true);
  }

  protected merge(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.customer();
    const into = this.mergeInto();
    if (!orgId || !c || !into || into === c.id || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.merge(orgId, c.id, into).subscribe({
      next: (target) => {
        this.busy.set(false);
        this.mergeOpen.set(false);
        this.notifications.success('customers.notices.merged', { code: target?.code ?? '' });
        void this.router.navigate(['/customers', target?.id ?? into]);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const c = this.customer();
    if (!orgId || !c) {
      return;
    }
    this.busy.set(true);
    this.api.delete(orgId, c.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.success('customers.notices.deleted', { code: c.code });
        void this.router.navigateByUrl('/customers');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.deleteOpen.set(false);
        this.notifications.error(customerErrorKey(err));
      },
    });
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.id());
  }

  private load(orgId: string | null, id: string): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
    if (!orgId) {
      return;
    }
    if (this.customer()?.id !== id) {
      this.state.set('loading');
      this.overview.set(null);
    }
    this.sub.add(
      this.api.get(orgId, id).subscribe({
        next: (c) => {
          this.customer.set(c);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      }),
    );
    this.sub.add(
      this.api.overview(orgId, id).subscribe({
        next: (o) => {
          this.overview.set(o);
          this.overviewFailed.set(false);
        },
        error: () => this.overviewFailed.set(true),
      }),
    );
    this.sub.add(
      this.kit.createFlows(orgId, CUSTOMER_ENTITY, { entityId: id }).subscribe({
        next: (list) =>
          this.runnable.set(
            new Set((list?.items ?? []).filter((f) => f?.enabled).map((f) => f.key)),
          ),
        error: () => this.runnable.set(new Set()),
      }),
    );
  }
}
