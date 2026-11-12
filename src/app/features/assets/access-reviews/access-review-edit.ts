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
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, map, of, switchMap } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { blankToNull, changedFields, dayOrNull } from '../data/asset-display';
import { assetErrorKey } from '../data/asset-errors';
import { AccessReviewDetail, AccessReviewFields } from '../data/asset.models';
import { AssetsApi } from '../data/assets-api';
import { AssetSelect } from '../shared/asset-select';
import { AssetUserSelect } from '../shared/people-select';

export interface ReviewDraft {
  title: string;
  systemMode: 'asset' | 'name';
  system_asset_id: string;
  system_name: string;
  scope: string;
  reviewer_user_id: string;
  due_on: string;
  frequency_months: string;
}

export function reviewDraftFrom(r: AccessReviewDetail | null, assetId = ''): ReviewDraft {
  const systemAsset = r?.system_asset?.id ?? assetId;
  return {
    title: r?.title ?? '',
    systemMode: r ? (r.system_asset ? 'asset' : 'name') : 'asset',
    system_asset_id: systemAsset,
    system_name: r?.system_name ?? '',
    scope: r?.scope ?? '',
    reviewer_user_id: r?.reviewer?.id ?? '',
    due_on: r?.due_on ?? '',
    frequency_months: r?.frequency_months?.toString() ?? '',
  };
}

export function reviewFieldsFrom(d: ReviewDraft): AccessReviewFields {
  const freq = Number.parseInt(d.frequency_months, 10);
  const useAsset = d.systemMode === 'asset';
  return {
    title: blankToNull(d.title),
    system_asset_id: useAsset ? d.system_asset_id || null : null,
    system_name: useAsset ? null : blankToNull(d.system_name),
    scope: blankToNull(d.scope),
    reviewer_user_id: d.reviewer_user_id,
    due_on: dayOrNull(d.due_on) ?? '',
    frequency_months: Number.isFinite(freq) ? freq : null,
  };
}

/** Problems that keep a review draft from being saved (translation keys by field). */
export function reviewDraftErrors(d: ReviewDraft): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (d.systemMode === 'asset' ? !d.system_asset_id : !d.system_name.trim()) {
    errors['system'] = 'assets.reviewForm.systemRequired';
  }
  if (!d.reviewer_user_id) {
    errors['reviewer'] = 'assets.reviewForm.reviewerRequired';
  }
  if (!dayOrNull(d.due_on)) {
    errors['due_on'] = 'assets.reviewForm.dueRequired';
  }
  const freq = d.frequency_months.trim();
  if (freq && !(Number.isInteger(Number(freq)) && Number(freq) >= 1 && Number(freq) <= 60)) {
    errors['frequency'] = 'assets.reviewForm.frequencyInvalid';
  }
  return errors;
}

/**
 * Plan an access review (`/assets/access-reviews/new`, `?asset=<id>` preselects the
 * system) or edit one (`/assets/access-reviews/:id/edit`): the system (an asset in
 * the inventory or a named system), scope, reviewer, due date and how often it
 * repeats. A new review can start with every organisation member as an account.
 */
@Component({
  selector: 'app-access-review-edit',
  imports: [
    RouterLink,
    TranslocoPipe,
    Alert,
    AssetSelect,
    AssetUserSelect,
    Button,
    Card,
    FieldHelp,
    FormField,
    GuideIntro,
    Icon,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[880px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/assets/access-reviews', id()] : '/assets/access-reviews'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'assets.common.backToReview' : 'assets.common.backToReviews') | transloco }}
      </a>
      @if (state() === 'loading') {
        <p class="text-[14px] text-fg-muted">{{ 'assets.common.loading' | transloco }}</p>
      } @else if (state() === 'error') {
        <app-alert>{{ 'assets.reviewDetail.notFound' | transloco }}</app-alert>
      } @else {
        <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
          @if (review(); as r) {
            {{ 'assets.reviewForm.editTitle' | transloco: { code: r.code } }}
          } @else {
            {{ 'assets.reviewForm.newTitle' | transloco }}
          }
        </h1>
        <p class="mb-4 text-[14px] text-fg-muted">{{ 'assets.reviewForm.subtitle' | transloco }}</p>
        <div class="mb-4"><app-guide-intro scope="assets" page="reviewForm" /></div>
        @if (review()?.status === 'completed' || review()?.status === 'cancelled') {
          <app-alert tone="info">{{ 'assets.reviewForm.closed' | transloco }}</app-alert>
        } @else {
          @if (error(); as key) {
            <div class="mb-4">
              <app-alert>{{ key | transloco }}</app-alert>
            </div>
          }
          <form class="flex flex-col gap-5" (submit)="$event.preventDefault(); save()" novalidate>
            <app-card>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <fieldset class="sm:col-span-2">
                  <legend
                    class="mb-2 flex items-center gap-1 text-[13px] font-semibold text-fg-muted"
                  >
                    {{ 'assets.fields.system' | transloco }}
                    <app-field-help scope="assets" page="reviewForm" field="system" />
                  </legend>
                  <div class="mb-2 flex flex-wrap gap-4 text-[13px] text-fg">
                    <label class="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="ar-system-mode"
                        value="asset"
                        [checked]="d().systemMode === 'asset'"
                        (change)="set('systemMode', 'asset')"
                      />
                      {{ 'assets.reviewForm.systemFromInventory' | transloco }}
                    </label>
                    <label class="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="ar-system-mode"
                        value="name"
                        [checked]="d().systemMode === 'name'"
                        (change)="set('systemMode', 'name')"
                      />
                      {{ 'assets.reviewForm.systemByName' | transloco }}
                    </label>
                  </div>
                  @if (d().systemMode === 'asset') {
                    <label class="sr-only" for="ar-system-asset">{{
                      'assets.fields.system' | transloco
                    }}</label>
                    <app-asset-select
                      inputId="ar-system-asset"
                      describedBy="ar-system-err"
                      [value]="d().system_asset_id"
                      [currentLabel]="review()?.system_asset?.name ?? null"
                      (valueChange)="set('system_asset_id', $event)"
                    />
                  } @else {
                    <label class="sr-only" for="ar-system-name">{{
                      'assets.fields.systemName' | transloco
                    }}</label>
                    <input
                      id="ar-system-name"
                      type="text"
                      maxlength="255"
                      aria-describedby="ar-system-err"
                      class="h-10 w-full rounded-[10px] border border-border bg-bg px-3 text-[13.5px] text-fg"
                      [placeholder]="'assets.reviewForm.systemNamePlaceholder' | transloco"
                      [value]="d().system_name"
                      (input)="set('system_name', $any($event.target).value)"
                    />
                  }
                  @if (showErrors() && errors()['system']; as key) {
                    <p id="ar-system-err" class="mt-1 text-[12px] text-fail" role="alert">
                      {{ key | transloco }}
                    </p>
                  }
                </fieldset>
                <div class="sm:col-span-2">
                  <app-form-field [label]="'assets.fields.title' | transloco" inputId="ar-title">
                    <input
                      id="ar-title"
                      type="text"
                      maxlength="255"
                      aria-describedby="ar-title-hint"
                      [value]="d().title"
                      (input)="set('title', $any($event.target).value)"
                    />
                  </app-form-field>
                  <p id="ar-title-hint" class="mt-1 text-[12px] text-fg-subtle">
                    {{ 'assets.reviewForm.titleHint' | transloco }}
                  </p>
                </div>
                <div class="sm:col-span-2">
                  <app-field-help scope="assets" page="reviewForm" field="scope" />
                  <app-form-field [label]="'assets.fields.scope' | transloco" inputId="ar-scope">
                    <textarea
                      id="ar-scope"
                      rows="3"
                      maxlength="10000"
                      [placeholder]="'assets.reviewForm.scopePlaceholder' | transloco"
                      [value]="d().scope"
                      (input)="set('scope', $any($event.target).value)"
                    ></textarea>
                  </app-form-field>
                </div>
                <div>
                  <app-field-help scope="assets" page="reviewForm" field="reviewer" />
                  <app-form-field
                    [label]="'assets.fields.reviewer' | transloco"
                    inputId="ar-reviewer"
                  >
                    <app-asset-user-select
                      inputId="ar-reviewer"
                      describedBy="ar-reviewer-err"
                      [required]="true"
                      [invalid]="showErrors() && !!errors()['reviewer']"
                      [value]="d().reviewer_user_id"
                      [currentName]="review()?.reviewer?.name ?? null"
                      (valueChange)="set('reviewer_user_id', $event)"
                    />
                  </app-form-field>
                  @if (showErrors() && errors()['reviewer']; as key) {
                    <p id="ar-reviewer-err" class="mt-1 text-[12px] text-fail" role="alert">
                      {{ key | transloco }}
                    </p>
                  }
                </div>
                <div>
                  <app-form-field [label]="'assets.fields.dueOn' | transloco" inputId="ar-due">
                    <input
                      id="ar-due"
                      type="date"
                      required
                      aria-describedby="ar-due-err"
                      [attr.aria-invalid]="showErrors() && !!errors()['due_on']"
                      [value]="d().due_on"
                      (input)="set('due_on', $any($event.target).value)"
                    />
                  </app-form-field>
                  @if (showErrors() && errors()['due_on']; as key) {
                    <p id="ar-due-err" class="mt-1 text-[12px] text-fail" role="alert">
                      {{ key | transloco }}
                    </p>
                  }
                </div>
                <div>
                  <app-field-help scope="assets" page="reviewForm" field="frequency_months" />
                  <app-form-field
                    [label]="'assets.fields.frequencyMonths' | transloco"
                    inputId="ar-freq"
                  >
                    <input
                      id="ar-freq"
                      type="number"
                      min="1"
                      max="60"
                      aria-describedby="ar-freq-hint"
                      [attr.aria-invalid]="showErrors() && !!errors()['frequency']"
                      [value]="d().frequency_months"
                      (input)="set('frequency_months', $any($event.target).value)"
                    />
                  </app-form-field>
                  <p
                    id="ar-freq-hint"
                    class="mt-1 text-[12px]"
                    [class.text-fail]="showErrors() && !!errors()['frequency']"
                    [class.text-fg-subtle]="!(showErrors() && errors()['frequency'])"
                  >
                    {{ 'assets.reviewForm.frequencyHint' | transloco }}
                  </p>
                </div>
                @if (!review()) {
                  <label class="flex items-start gap-2 text-[13.5px] text-fg sm:col-span-2">
                    <input
                      type="checkbox"
                      class="mt-1"
                      [checked]="importMembers()"
                      (change)="importMembers.set($any($event.target).checked)"
                    />
                    <span>
                      {{ 'assets.reviewForm.importMembers' | transloco }}
                      <span class="block text-[12px] text-fg-subtle">
                        {{ 'assets.reviewForm.importMembersHint' | transloco }}
                      </span>
                    </span>
                  </label>
                }
              </div>
            </app-card>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <app-button variant="ghost" (click)="back()">{{
                'common.cancel' | transloco
              }}</app-button>
              <app-button type="submit" [loading]="busy()">
                {{ (review() ? 'assets.reviewForm.save' : 'assets.reviewForm.create') | transloco }}
              </app-button>
            </div>
          </form>
        }
        <div class="mt-6"><app-why-it-matters scope="assets" page="reviewForm" /></div>
      }
    </div>
  `,
})
export class AccessReviewEdit {
  private readonly api = inject(AssetsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  /** The review to edit (absent on `/new`). */
  readonly id = input<string | undefined>(undefined);
  /** `?asset=<id>`: preselect the system asset of a new review. */
  readonly asset = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly review = signal<AccessReviewDetail | null>(null);
  protected readonly d = signal<ReviewDraft>(reviewDraftFrom(null));
  protected readonly importMembers = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errors = computed(() => reviewDraftErrors(this.d()));

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'assets',
      entityType: 'access_review',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.review()?.title ?? this.language.translate('assets.reviewForm.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      const asset = this.asset();
      untracked(() => this.load(orgId, id, asset));
    });
  }

  protected set<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]): void {
    this.d.update((d) => ({ ...d, [key]: value }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    if (Object.keys(this.errors()).length) {
      this.showErrors.set(true);
      return;
    }
    const fields = reviewFieldsFrom(this.d());
    const current = this.review();
    this.busy.set(true);
    this.error.set(null);
    if (current) {
      const changes = changedFields(reviewFieldsFrom(reviewDraftFrom(current)), fields);
      if (Object.keys(changes).length === 0) {
        this.busy.set(false);
        this.back();
        return;
      }
      this.api.updateReview(orgId, current.id, changes).subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.success('assets.reviewForm.saved');
          this.back();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(assetErrorKey(err));
        },
      });
      return;
    }
    const withMembers = this.importMembers();
    this.api
      .createReview(orgId, fields)
      .pipe(
        switchMap((created) =>
          withMembers
            ? this.api.importMembers(orgId, created.id).pipe(
                map(() => created),
                // The review exists: report the failed import and still open it.
                catchError((err: unknown) => {
                  this.notifications.error(assetErrorKey(err));
                  return of(created);
                }),
              )
            : of(created),
        ),
      )
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.notifications.success('assets.reviewForm.created', { code: created.code });
          void this.router.navigate(['/assets/access-reviews', created.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(assetErrorKey(err));
        },
      });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/assets/access-reviews', id] : ['/assets/access-reviews']);
  }

  private load(orgId: string | null, id: string | undefined, asset: string | undefined): void {
    this.request.unsubscribe();
    if (!id) {
      this.review.set(null);
      this.d.set(reviewDraftFrom(null, asset ?? ''));
      this.state.set('ready');
      return;
    }
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getReview(orgId, id).subscribe({
      next: (r) => {
        this.review.set(r);
        this.d.set(reviewDraftFrom(r));
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
