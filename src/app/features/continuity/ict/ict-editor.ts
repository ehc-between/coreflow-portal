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
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContinuityApi } from '../data/continuity-api';
import { blankToNull, changedFields, parseIntOrNull, todayIso } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { IctDetail, IctFields, LinkedRef, OUTCOMES, Outcome } from '../data/continuity.models';
import { formCrumbs } from '../shared/continuity-page';
import { ContinuityDurationInput } from '../shared/duration';
import { prefillText } from '../shared/flow-prefill';
import { ContinuityRecordPicker } from '../shared/record-picker';
import { ContinuityUserSelect } from '../shared/user-select';

export interface IctDraft {
  name: string;
  description: string;
  owner_user_id: string;
  provider: string;
  asset: LinkedRef | null;
  supplier: LinkedRef | null;
  contract: LinkedRef | null;
  sla_rto_minutes: number | null;
  achievable_rto_minutes: number | null;
  achievable_rpo_minutes: number | null;
  recovery_strategy: string;
  backup_strategy: string;
  test_interval_months: string;
  last_tested_on: string;
  last_test_outcome: Outcome | '';
}

/** A link the API only gave as an id (the reader may not open it): keep it. */
const hidden = (type: string, id: string | null | undefined): LinkedRef | null =>
  id ? { entity_type: type, entity_id: id, title: '—' } : null;

export function ictDraft(s: IctDetail | null): IctDraft {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    owner_user_id: s?.owner?.id ?? '',
    provider: s?.provider ?? '',
    asset: s?.asset ?? hidden('asset', s?.asset_id),
    supplier: s?.supplier ?? hidden('supplier', s?.supplier_id),
    contract: s?.contract ?? hidden('contract', s?.contract_id),
    sla_rto_minutes: s?.sla_rto_minutes ?? null,
    achievable_rto_minutes: s?.achievable_rto_minutes ?? null,
    achievable_rpo_minutes: s?.achievable_rpo_minutes ?? null,
    recovery_strategy: s?.recovery_strategy ?? '',
    backup_strategy: s?.backup_strategy ?? '',
    test_interval_months: s ? String(s.test_interval_months) : '12',
    last_tested_on: s?.last_tested_on ?? '',
    last_test_outcome: s?.last_test_outcome ?? '',
  };
}

export function ictFields(d: IctDraft): IctFields {
  const interval = parseIntOrNull(d.test_interval_months);
  return {
    name: d.name.trim(),
    description: blankToNull(d.description),
    owner_user_id: d.owner_user_id || null,
    provider: blankToNull(d.provider),
    asset_id: d.asset?.entity_id ?? null,
    supplier_id: d.supplier?.entity_id ?? null,
    contract_id: d.contract?.entity_id ?? null,
    sla_rto_minutes: d.sla_rto_minutes,
    achievable_rto_minutes: d.achievable_rto_minutes,
    achievable_rpo_minutes: d.achievable_rpo_minutes,
    recovery_strategy: blankToNull(d.recovery_strategy),
    backup_strategy: blankToNull(d.backup_strategy),
    test_interval_months: interval !== null && Number.isFinite(interval) ? interval : null,
    last_tested_on: d.last_tested_on || null,
    last_test_outcome: d.last_test_outcome || null,
  };
}

/**
 * Register (`/continuity/ict-systems/new`, also from an asset: "create from here") or
 * edit (`/continuity/ict-systems/:id/edit`) an ICT service: what it runs on (asset),
 * who provides it (supplier and contract, with the recovery time agreed there), what
 * it can recover in (RTO/RPO), the recovery and backup strategies, the test cycle and
 * the last test. Tests run as exercises later update the last test automatically.
 */
@Component({
  selector: 'app-ict-editor',
  imports: [
    TranslocoPipe,
    LocalDayPipe,
    Alert,
    AskAbout,
    Button,
    Card,
    ContinuityDurationInput,
    ContinuityRecordPicker,
    ContinuityUserSelect,
    FieldHelp,
    FlowBanner,
    FormField,
    HelpStrip,
    LoadingState,
    PageHeader,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="system() ? 'continuity.ict.editTitle' : 'continuity.ict.newTitle'"
        [titleParams]="{ code: system()?.code, title: system()?.name }"
        [breadcrumbs]="crumbs()"
      />
      @switch (state()) {
        @case ('loading') {
          <app-loading-state [rows]="6" />
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          @if (system()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            <app-flow-banner [flow]="flow()" (cancelled)="flows.cancel()" />
            <app-help-strip scope="continuity" page="ictForm" lesson="ict-readiness" />
            <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
              <app-card>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.name' | transloco"
                      inputId="ict-name"
                    >
                      <input
                        id="ict-name"
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
                        {{ 'continuity.form.errors.nameRequired' | transloco }}
                      </p>
                    }
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.asset' | transloco"
                      inputId="ict-asset"
                    >
                      <app-continuity-record-picker
                        inputId="ict-asset"
                        [types]="['asset']"
                        [value]="d().asset"
                        describedBy="ict-asset-hint"
                        (picked)="pickAsset($event)"
                      />
                      <p id="ict-asset-hint" class="text-meta text-fg-subtle">
                        {{ 'continuity.form.assetHint' | transloco }}
                      </p>
                    </app-form-field>
                  </div>
                  <app-form-field
                    [label]="'continuity.fields.supplier' | transloco"
                    inputId="ict-supplier"
                  >
                    <app-continuity-record-picker
                      inputId="ict-supplier"
                      [types]="['supplier']"
                      [value]="d().supplier"
                      (picked)="pickSupplier($event)"
                    />
                    <app-field-help scope="continuity" page="ictForm" field="supplier_id" />
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.contract' | transloco"
                    inputId="ict-contract"
                  >
                    <app-continuity-record-picker
                      inputId="ict-contract"
                      [types]="['contract']"
                      [value]="d().contract"
                      (picked)="set('contract', $event)"
                    />
                  </app-form-field>
                  @if (!d().supplier) {
                    <app-form-field
                      [label]="'continuity.fields.providerText' | transloco"
                      inputId="ict-provider"
                    >
                      <input
                        id="ict-provider"
                        type="text"
                        maxlength="255"
                        [value]="d().provider"
                        (input)="set('provider', $any($event.target).value)"
                      />
                    </app-form-field>
                  }
                  <app-form-field
                    [label]="'continuity.fields.owner' | transloco"
                    inputId="ict-owner"
                  >
                    <app-continuity-user-select
                      inputId="ict-owner"
                      [value]="d().owner_user_id"
                      [currentName]="system()?.owner?.name ?? null"
                      (valueChange)="set('owner_user_id', $event)"
                    />
                  </app-form-field>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.description' | transloco"
                      inputId="ict-desc"
                    >
                      <textarea
                        id="ict-desc"
                        rows="3"
                        maxlength="20000"
                        [value]="d().description"
                        (input)="set('description', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <div class="mb-3 flex items-center gap-1">
                  <h2 class="font-display text-card font-bold text-fg">
                    {{ 'continuity.ict.capability' | transloco }}
                  </h2>
                  <app-ask-about
                    [prompt]="'continuity.ai.prompts.ictCapability' | transloco"
                    field="achievable_rto_minutes"
                  />
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <app-form-field
                    [label]="'continuity.fields.achievableRto' | transloco"
                    inputId="ict-rto"
                  >
                    <app-continuity-duration-input
                      inputId="ict-rto"
                      [value]="d().achievable_rto_minutes"
                      (valueChange)="set('achievable_rto_minutes', $event)"
                    />
                    <app-field-help
                      scope="continuity"
                      page="ictForm"
                      field="achievable_rto_minutes"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.achievableRpo' | transloco"
                    inputId="ict-rpo"
                  >
                    <app-continuity-duration-input
                      inputId="ict-rpo"
                      [value]="d().achievable_rpo_minutes"
                      (valueChange)="set('achievable_rpo_minutes', $event)"
                    />
                    <app-field-help
                      scope="continuity"
                      page="ictForm"
                      field="achievable_rpo_minutes"
                    />
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.slaRto' | transloco"
                    inputId="ict-sla"
                  >
                    <app-continuity-duration-input
                      inputId="ict-sla"
                      [value]="d().sla_rto_minutes"
                      (valueChange)="set('sla_rto_minutes', $event)"
                    />
                    <span class="flex flex-wrap items-center gap-2">
                      <app-field-help scope="continuity" page="ictForm" field="sla_rto_minutes" />
                      <app-ask-about
                        [prompt]="'continuity.ai.prompts.sla' | transloco"
                        field="sla_rto_minutes"
                      />
                    </span>
                  </app-form-field>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.recoveryStrategy' | transloco"
                      inputId="ict-recovery"
                    >
                      <textarea
                        id="ict-recovery"
                        rows="3"
                        maxlength="20000"
                        [value]="d().recovery_strategy"
                        (input)="set('recovery_strategy', $any($event.target).value)"
                      ></textarea>
                    </app-form-field>
                  </div>
                  <div class="sm:col-span-2">
                    <app-form-field
                      [label]="'continuity.fields.backupStrategy' | transloco"
                      inputId="ict-backup"
                    >
                      <textarea
                        id="ict-backup"
                        rows="3"
                        maxlength="20000"
                        [value]="d().backup_strategy"
                        (input)="set('backup_strategy', $any($event.target).value)"
                      ></textarea>
                      <app-field-help scope="continuity" page="ictForm" field="backup_strategy" />
                    </app-form-field>
                  </div>
                </div>
              </app-card>

              <app-card>
                <h2 class="mb-3 font-display text-card font-bold text-fg">
                  {{ 'continuity.ict.testing' | transloco }}
                </h2>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <app-form-field
                      [label]="'continuity.fields.testInterval' | transloco"
                      inputId="ict-interval"
                    >
                      <input
                        id="ict-interval"
                        type="number"
                        min="1"
                        max="120"
                        [attr.aria-invalid]="showErrors() && !intervalValid()"
                        [value]="d().test_interval_months"
                        (input)="set('test_interval_months', $any($event.target).value)"
                      />
                      <app-field-help
                        scope="continuity"
                        page="ictForm"
                        field="test_interval_months"
                      />
                    </app-form-field>
                    @if (showErrors() && !intervalValid()) {
                      <p class="mt-1 text-meta text-fail-ink" role="alert">
                        {{ 'continuity.form.errors.interval' | transloco }}
                      </p>
                    }
                  </div>
                  <app-form-field
                    [label]="'continuity.fields.lastTested' | transloco"
                    inputId="ict-tested"
                  >
                    <input
                      id="ict-tested"
                      type="date"
                      [max]="today"
                      [value]="d().last_tested_on"
                      (input)="set('last_tested_on', $any($event.target).value)"
                    />
                    @if (d().last_tested_on) {
                      <p class="text-meta text-fg-subtle">
                        {{ d().last_tested_on | localDay: 'longDate' }}
                      </p>
                    }
                  </app-form-field>
                  <app-form-field
                    [label]="'continuity.fields.lastOutcome' | transloco"
                    inputId="ict-outcome"
                  >
                    <select
                      id="ict-outcome"
                      (change)="set('last_test_outcome', $any($event.target).value)"
                    >
                      <option value="" [selected]="!d().last_test_outcome">
                        {{ 'continuity.common.notSet' | transloco }}
                      </option>
                      @for (o of outcomes; track o) {
                        <option [value]="o" [selected]="d().last_test_outcome === o">
                          {{ 'continuity.outcome.' + o | transloco }}
                        </option>
                      }
                    </select>
                  </app-form-field>
                </div>
              </app-card>

              @if (error(); as key) {
                <app-alert>{{ key | transloco }}</app-alert>
              }
              <div
                class="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
              >
                <app-button variant="ghost" (click)="back()">{{
                  'common.cancel' | transloco
                }}</app-button>
                <app-button type="submit" [loading]="busy()">
                  {{ (system() ? 'continuity.form.save' : 'continuity.ict.create') | transloco }}
                </app-button>
              </div>
            </form>
            <div class="mt-8"><app-why-it-matters scope="continuity" page="ictForm" /></div>
          }
        }
      }
    </div>
  `,
})
export class IctEditor {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly flows = inject(CreateFlowService);

  readonly id = input<string | undefined>(undefined);

  /** "Create from here" (asset → ICT service) or `?fromRequirement=`. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'continuity_ict_system',
  });

  protected readonly outcomes = OUTCOMES;
  protected readonly today = todayIso();
  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly system = signal<IctDetail | null>(null);
  protected readonly d = signal<IctDraft>(ictDraft(null));
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly intervalValid = computed(() => {
    const n = parseIntOrNull(this.d().test_interval_months);
    return n === null || (Number.isFinite(n) && n >= 1 && n <= 120);
  });
  protected readonly crumbs = computed(() => {
    const s = this.system();
    return formCrumbs(
      'ict',
      s ? { id: s.id, label: s.code } : null,
      s ? 'continuity.common.edit' : 'continuity.ict.new',
    );
  });
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_ict_system',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.system()?.name ?? this.language.translate('continuity.ict.newTitle'),
    }));
    // A flow from an asset fills in the name, the asset, the owner and the description.
    effect(() => {
      const ctx = this.flow();
      if (!ctx || this.id()) {
        return;
      }
      const values = ctx.prefill;
      const assetId = prefillText(values, 'asset_id');
      untracked(() =>
        this.d.update((d) => ({
          ...d,
          name: prefillText(values, 'name') || prefillText(values, 'title') || d.name,
          description: prefillText(values, 'description') || d.description,
          owner_user_id: prefillText(values, 'owner_user_id') || d.owner_user_id,
          asset: assetId
            ? {
                entity_type: 'asset',
                entity_id: assetId,
                title: ctx.source?.title ?? '—',
                code: ctx.source?.code ?? null,
                url: ctx.source?.url ?? null,
              }
            : d.asset,
        })),
      );
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.getIct(orgId, id).subscribe({
          next: (s) => {
            this.system.set(s);
            this.d.set(ictDraft(s));
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected set<K extends keyof IctDraft>(key: K, value: IctDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  /** The asset names the service when no name is written yet. */
  protected pickAsset(ref: LinkedRef | null): void {
    this.d.update((d) => ({ ...d, asset: ref, name: ref && !d.name.trim() ? ref.title : d.name }));
  }

  /** The supplier is the provider; the free-text provider follows it. */
  protected pickSupplier(ref: LinkedRef | null): void {
    this.d.update((d) => ({ ...d, supplier: ref, provider: ref ? ref.title : d.provider }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    if (!this.d().name.trim() || !this.intervalValid()) {
      this.showErrors.set(true);
      return;
    }
    const fields = ictFields(this.d());
    const current = this.system();
    this.error.set(null);
    if (!current) {
      this.busy.set(true);
      this.api.createIct(orgId, fields).subscribe({
        next: (s) => {
          this.busy.set(false);
          this.notifications.success('continuity.ict.created', { code: s.code });
          this.flows.complete(s.id, 'continuity_ict_system').subscribe();
          void this.router.navigate(['/continuity/ict-systems', s.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
      return;
    }
    const changes = changedFields(ictFields(ictDraft(current)), fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.api.updateIct(orgId, current.id, changes).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('continuity.form.saved');
        this.back();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(continuityErrorKey(err));
      },
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/continuity/ict-systems', id] : ['/continuity/ict-systems']);
  }
}
