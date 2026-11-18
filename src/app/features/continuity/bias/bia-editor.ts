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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { Alert } from '../../../shared/ui/alert/alert';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ContinuityApi } from '../data/continuity-api';
import { changedFields } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { BiaDetail } from '../data/continuity.models';
import { formCrumbs } from '../shared/continuity-page';
import { prefillText } from '../shared/flow-prefill';
import { BiaForm, BiaFormValue, BiaPrefill, biaDraft, biaFields } from './bia-form';

/**
 * Create (`/continuity/bias/new`, also from a process: "create from here") or edit
 * (`/continuity/bias/:id/edit`) a business impact analysis. Editing sends only the
 * changed fields with the change reason; a material change to an approved or
 * in-review BIA sends it back to draft.
 */
@Component({
  selector: 'app-bia-editor',
  imports: [
    TranslocoPipe,
    Alert,
    BiaForm,
    FlowBanner,
    HelpStrip,
    LoadingState,
    PageHeader,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        [titleKey]="bia() ? 'continuity.bias.editTitle' : 'continuity.bias.newTitle'"
        [titleParams]="{ code: bia()?.code, title: bia()?.title }"
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
          @if (bia()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            <app-flow-banner [flow]="flow()" (cancelled)="flows.cancel()" />
            @if (bia()?.status === 'approved' || bia()?.status === 'in_review') {
              <div class="mb-4">
                <app-alert tone="info">{{ 'continuity.form.backToDraft' | transloco }}</app-alert>
              </div>
            }
            <app-help-strip scope="continuity" page="biaForm" lesson="running-a-bia" />
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-bia-form
              [value]="bia()"
              [prefill]="prefill()"
              [busy]="busy()"
              (submitted)="save($event)"
              (cancelled)="back()"
            />
            <div class="mt-8"><app-why-it-matters scope="continuity" page="biaForm" /></div>
          }
        }
      }
    </div>
  `,
})
export class BiaEditor {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly flows = inject(CreateFlowService);

  /** Route `:id` (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);

  /** "Create from here" (process → BIA) or `?fromRequirement=`. */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), { targetType: 'bia' });
  protected readonly prefill = computed<BiaPrefill | null>(() => {
    const values = this.flow()?.prefill;
    if (!values) {
      return null;
    }
    const from = this.flow()?.source;
    const processId = prefillText(values, 'process_id');
    return {
      title: prefillText(values, 'title'),
      description: prefillText(values, 'description'),
      owner_user_id: prefillText(values, 'owner_user_id'),
      department_id: prefillText(values, 'department_id'),
      process: processId
        ? {
            entity_type: 'process',
            entity_id: processId,
            title: from?.title ?? '—',
            code: from?.code ?? null,
            url: from?.url ?? null,
          }
        : null,
    };
  });

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly bia = signal<BiaDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly crumbs = computed(() => {
    const b = this.bia();
    return formCrumbs(
      'bias',
      b ? { id: b.id, label: b.code } : null,
      b ? 'continuity.common.edit' : 'continuity.bias.new',
    );
  });
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'bia',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.bia()?.title ?? this.language.translate('continuity.bias.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.getBia(orgId, id).subscribe({
          next: (b) => {
            this.bia.set(b);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(value: BiaFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const current = this.bia();
    this.error.set(null);
    if (!current) {
      this.busy.set(true);
      this.api.createBia(orgId, value.fields).subscribe({
        next: (b) => {
          this.busy.set(false);
          this.notifications.success('continuity.bias.created', { code: b.code });
          this.flows.complete(b.id, 'bia').subscribe();
          void this.router.navigate(['/continuity/bias', b.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
      return;
    }
    const changes = changedFields(biaFields(biaDraft(current)), value.fields);
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.api
      .updateBia(orgId, current.id, { ...changes, change_reason: value.changeReason })
      .subscribe({
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
    void this.router.navigate(id ? ['/continuity/bias', id] : ['/continuity/bias']);
  }
}
