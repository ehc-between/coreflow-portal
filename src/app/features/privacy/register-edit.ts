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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Alert } from '../../shared/ui/alert/alert';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { PrivacyApi } from './data/privacy-api';
import { DataBreach, PrivacyRecord, RopaEntry } from './data/privacy.models';
import type { CustomerRef } from '../../shared/customers';
import { nowDateTimeInput } from './data/privacy-dates';
import { PrivacyErrorMessage, privacyError } from './data/privacy-errors';
import {
  createBody,
  emptyValues,
  prefillValues,
  updateBody,
  valuesFromRecord,
  withCustomerRole,
} from './data/privacy-form-model';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  FormValues,
  PRIVACY_CRUMB,
  REGISTERS,
  RegisterKey,
  registerCrumb,
} from './data/privacy-registers';
import { privacyPermissions } from './privacy-nav';
import { PrivacyFormSubmit, PrivacyRegisterForm } from './register-form';

/** Date-time fields pre-filled with "now" on create (the backend default). */
const NOW_FIELDS = ['received_at', 'aware_at', 'given_at'];

/**
 * Create (`/privacy/<segment>/new`) and edit (`/privacy/<segment>/:id/edit`) page of
 * any register. A new record is prefilled from the query string (the gap fixes link
 * here with `?ropa_entry_id=…&legal_basis=…`) and from a create-from-here flow
 * (`?flow=`), which is completed (linked back) right after the save. Edit sends only
 * the changed fields (plus the change reason, kept on the revision).
 */
@Component({
  selector: 'app-privacy-register-edit',
  imports: [
    TranslocoPipe,
    Alert,
    ErrorState,
    HelpStrip,
    LoadingState,
    PageHeader,
    PrivacyRegisterForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [title]="heading()"
        [breadcrumbs]="breadcrumbs()"
        [backLink]="backLink()"
        backLabelKey="privacy.common.back"
        titleTestId="privacy-form-heading"
      />
      <app-help-strip scope="privacy" page="form" [lesson]="def().lesson" />
      @if (def().personal) {
        <app-alert tone="info" class="mb-5 block">{{
          'privacy.form.personalNotice' | transloco
        }}</app-alert>
      }

      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-error-state [bodyKey]="loadError()" (retry)="reload()" />
        }
        @default {
          @if (values(); as v) {
            <app-privacy-register-form
              [register]="def()"
              [mode]="isEdit() ? 'edit' : 'create'"
              [value]="v"
              [entityId]="id() ?? null"
              [busy]="saving()"
              [error]="saveError()"
              [permissions]="perms()"
              [quickStart]="quickStart"
              [customerRefs]="customerRefs()"
              (submitted)="save($event)"
              (cancelled)="cancel()"
            />
          }
        }
      }
    </div>
  `,
})
export class PrivacyRegisterEdit {
  private readonly api = inject(PrivacyApi);
  private readonly refs = inject(PrivacyRefsService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly flows = inject(CreateFlowService);
  protected readonly perms = privacyPermissions();

  readonly register = input.required<RegisterKey>();
  /** Route param; absent on `new`. */
  readonly id = input<string | undefined>(undefined);

  protected readonly def = computed(() => REGISTERS[this.register()]);
  protected readonly isEdit = computed(() => !!this.id());
  /** `?quick=1` (the overview's "Report a breach"): start with the three-field form. */
  protected readonly quickStart = this.route.snapshot.queryParamMap.get('quick') === '1';

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly loadError = signal('privacy.common.loadFailed');
  protected readonly record = signal<PrivacyRecord | null>(null);
  /** The record's customers (names for the Kunde fields). */
  protected readonly customerRefs = computed<readonly CustomerRef[]>(() => {
    const r = this.record() as (PrivacyRecord & Partial<RopaEntry & DataBreach>) | null;
    if (!r) {
      return [];
    }
    return [...(r.customer ? [r.customer] : []), ...(r.customers ?? [])];
  });
  protected readonly values = signal<FormValues | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<PrivacyErrorMessage | null>(null);

  /** The create-from-here flow this form was opened with (null on edit / plain new). */
  private readonly flow = this.route.snapshot.paramMap.has('id')
    ? signal(null).asReadonly()
    : this.flows.consume(this.route, { targetType: REGISTERS[this.registerKey()].entityType });

  protected readonly heading = computed(() =>
    this.isEdit()
      ? this.language.translate('privacy.form.editTitle', { code: this.record()?.code ?? '' })
      : this.language.translate(`privacy.registers.${this.def().key}.new`),
  );
  protected readonly breadcrumbs = computed<readonly Breadcrumb[]>(() => {
    const crumbs: Breadcrumb[] = [PRIVACY_CRUMB, registerCrumb(this.def())];
    const r = this.record();
    if (this.isEdit() && r) {
      crumbs.push({
        labelKey: 'privacy.form.crumbRecord',
        params: { code: r.code },
        link: this.backLink(),
      });
    }
    return crumbs;
  });
  protected readonly backLink = computed(() =>
    this.id() ? ['/privacy', this.def().segment, this.id()] : ['/privacy', this.def().segment],
  );

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'privacy',
      entityType: this.def().entityType,
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title:
        this.record()?.code ?? this.language.translate(`privacy.registers.${this.def().key}.new`),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const register = this.register();
      untracked(() => this.load(orgId, register, id));
    });
    // A flow's prefill can arrive after the form (a reload refetches it): merge it into
    // the fields that are still empty.
    effect(() => {
      const ctx = this.flow();
      if (!ctx || this.isEdit()) {
        return;
      }
      untracked(() => {
        const current = this.values();
        if (!current) {
          return;
        }
        this.values.set(
          withCustomerRole(
            this.def(),
            this.mergeEmpty(current, prefillValues(this.def(), ctx.prefill)),
          ),
        );
      });
    });
  }

  /** The register key from the route data (needed before the inputs are set). */
  private registerKey(): RegisterKey {
    const key = this.route.snapshot.data['register'] as RegisterKey | undefined;
    return key && key in REGISTERS ? key : 'ropa';
  }

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), this.register(), this.id());
  }

  private mergeEmpty(values: FormValues, prefill: Readonly<Record<string, unknown>>): FormValues {
    const out: Record<string, unknown> = { ...values };
    for (const [key, value] of Object.entries(prefill)) {
      const current = out[key];
      const empty =
        current === null ||
        current === undefined ||
        current === '' ||
        (Array.isArray(current) && current.length === 0);
      if (empty) {
        out[key] = value;
      }
    }
    return out;
  }

  private load(orgId: string | null, register: RegisterKey, id: string | undefined): void {
    this.request.unsubscribe();
    const def = REGISTERS[register];
    if (!id) {
      const values: Record<string, unknown> = { ...emptyValues(def) };
      for (const key of NOW_FIELDS) {
        if (def.fields.some((f) => f.key === key)) {
          values[key] = nowDateTimeInput();
        }
      }
      // Prefill: the query string (gap fixes), then the flow (create-from-here).
      const query: Record<string, string> = {};
      const params = this.route.snapshot.queryParamMap;
      for (const key of params.keys) {
        query[key] = params.get(key) ?? '';
      }
      let merged: FormValues = { ...values, ...prefillValues(def, query) };
      const ctx = this.flow();
      if (ctx) {
        merged = this.mergeEmpty(merged, prefillValues(def, ctx.prefill));
      }
      this.values.set(withCustomerRole(def, merged));
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.get(orgId, def, id).subscribe({
      next: (record) => {
        this.record.set(record);
        this.values.set(valuesFromRecord(def, record));
        this.state.set('ready');
      },
      error: (err) => {
        this.loadError.set(privacyError(err).key);
        this.state.set('error');
      },
    });
  }

  protected save(event: PrivacyFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const def = this.def();
    const id = this.id();
    this.saveError.set(null);
    if (id) {
      const original = valuesFromRecord(def, this.record()!);
      const body = updateBody(def, original, event.values, event.changeReason);
      if (!Object.keys(body).length) {
        void this.router.navigate(['/privacy', def.segment, id]);
        return;
      }
      this.saving.set(true);
      this.api.update(orgId, def, id, body).subscribe({
        next: (saved) => this.done(saved, 'privacy.notices.saved'),
        error: (err) => this.failed(err),
      });
    } else {
      this.saving.set(true);
      this.api.create(orgId, def, createBody(def, event.values)).subscribe({
        next: (saved) => {
          this.refs.invalidate(def.key);
          // Link the new record back to the one it was created from (no-op without a flow).
          this.flows.complete(saved.id, def.entityType).subscribe();
          this.done(saved, 'privacy.notices.created');
        },
        error: (err) => this.failed(err),
      });
    }
  }

  protected cancel(): void {
    if (!this.isEdit()) {
      this.flows.cancel();
    }
    void this.router.navigate(this.backLink());
  }

  private done(saved: PrivacyRecord, key: string): void {
    this.saving.set(false);
    this.notify.success(key, { code: saved.code });
    void this.router.navigate(['/privacy', this.def().segment, saved.id]);
  }

  private failed(err: unknown): void {
    this.saving.set(false);
    this.saveError.set(privacyError(err));
  }
}
