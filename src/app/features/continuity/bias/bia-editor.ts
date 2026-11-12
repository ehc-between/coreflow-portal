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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { changedFields } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { BiaDetail } from '../data/continuity.models';
import { BiaForm, BiaFormValue, biaDraft, biaFields } from './bia-form';

/**
 * Create (`/continuity/bias/new`) or edit (`/continuity/bias/:id/edit`) a business
 * impact analysis. Editing sends only the changed fields with the change reason; a
 * material change to an approved or in-review BIA sends it back to draft.
 */
@Component({
  selector: 'app-bia-editor',
  imports: [RouterLink, TranslocoPipe, Alert, BiaForm, GuideIntro, Icon, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/continuity/bias', id()] : '/continuity/bias'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'continuity.common.backToRecord' : 'continuity.bias.back') | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'continuity.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            @if (bia(); as b) {
              {{ 'continuity.bias.editTitle' | transloco: { code: b.code, title: b.title } }}
            } @else {
              {{ 'continuity.bias.newTitle' | transloco }}
            }
          </h1>
          @if (bia()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            @if (bia()?.status === 'approved' || bia()?.status === 'in_review') {
              <div class="mt-2">
                <app-alert tone="info">{{ 'continuity.form.backToDraft' | transloco }}</app-alert>
              </div>
            }
            <div class="mt-3 mb-4"><app-guide-intro scope="continuity" page="biaForm" /></div>
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-bia-form
              [value]="bia()"
              [busy]="busy()"
              (submitted)="save($event)"
              (cancelled)="back()"
            />
            <div class="mt-6"><app-why-it-matters scope="continuity" page="biaForm" /></div>
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

  /** Route `:id` (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly bia = signal<BiaDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
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
