import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { RecruitmentApi } from '../data/recruitment-api';
import { recruitmentError } from '../data/recruitment-errors';
import { CandidateDetail, ENTITY_CANDIDATE, MODULE_KEY } from '../data/recruitment.models';
import {
  CandidateDraft,
  CandidateFields,
  candidatePayload,
  draftFromCandidate,
  emptyCandidateDraft,
} from '../shared/candidate-fields';

/** Create (`/recruitment/candidates/new`) or edit (`/:id/edit`) a candidate record. */
@Component({
  selector: 'app-candidate-form',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    Alert,
    Button,
    Card,
    Icon,
    CandidateFields,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[820px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="backLink()"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'recruitment.common.back' | transloco }}
      </a>
      <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{
          (editId() ? 'recruitment.candidateForm.editTitle' : 'recruitment.candidateForm.newTitle')
            | transloco
        }}
      </h1>
      <app-guide-intro class="mt-4" scope="recruitment" page="candidateForm" />
      @if (loadError(); as key) {
        <app-alert class="mt-4 block">{{ key | transloco }}</app-alert>
      } @else if (editId() && !original()) {
        <p class="mt-6 text-[14px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
      } @else {
        @if (original() && !original()!.can_edit) {
          <app-alert class="mt-4 block" tone="info">{{
            'recruitment.candidateForm.noRights' | transloco
          }}</app-alert>
        }
        <form class="mt-5 flex flex-col gap-5" (submit)="$event.preventDefault(); save()">
          <app-card>
            <app-candidate-fields
              [draft]="draft()"
              (draftChange)="draft.set($event)"
              [withConsent]="!editId()"
            />
          </app-card>
          @if (saveError(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }
          <div class="flex flex-wrap justify-end gap-2">
            <a [routerLink]="backLink()">
              <app-button variant="secondary">{{ 'common.cancel' | transloco }}</app-button>
            </a>
            <app-button
              type="submit"
              [loading]="saving()"
              [disabled]="
                !draft().full_name.trim() || (original() !== null && !original()!.can_edit)
              "
            >
              {{ 'recruitment.common.save' | transloco }}
            </app-button>
          </div>
        </form>
        <app-why-it-matters class="mt-6 block" scope="recruitment" page="candidateForm" />
      }
    </div>
  `,
})
export class CandidateForm {
  private readonly api = inject(RecruitmentApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(NotificationService);
  private readonly orgId = inject(SelectedOrgService).currentOrgId;

  protected readonly editId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id'))),
    { initialValue: null },
  );
  protected readonly original = signal<CandidateDetail | null>(null);
  protected readonly draft = signal<CandidateDraft>(emptyCandidateDraft());
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly backLink = computed(() => {
    const id = this.editId();
    return id ? ['/recruitment/candidates', id] : ['/recruitment/candidates'];
  });

  constructor() {
    providePageContext(() => ({
      module: MODULE_KEY,
      entityType: ENTITY_CANDIDATE,
      entityId: this.editId(),
      view: this.editId() ? 'edit' : 'new',
    }));
    effect((onCleanup) => {
      const orgId = this.orgId();
      const id = this.editId();
      if (!orgId || !id) {
        return;
      }
      const sub = this.api.getCandidate(orgId, id).subscribe({
        next: (c) => {
          this.original.set(c);
          this.draft.set(draftFromCandidate(c));
        },
        error: (err) => this.loadError.set(recruitmentError(err).key),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected save(): void {
    const orgId = this.orgId();
    if (!orgId || this.saving() || !this.draft().full_name.trim()) {
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    const payload = candidatePayload(this.draft());
    const original = this.original();
    const call = original
      ? this.api.updateCandidate(orgId, original.id, {
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          location: payload.location,
          profile_url: payload.profile_url,
          source: payload.source,
          notes: payload.notes,
        })
      : this.api.createCandidate(orgId, payload);
    call.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.toasts.success(
          original ? 'recruitment.candidateForm.saved' : 'recruitment.candidateForm.created',
          { code: c.code },
        );
        void this.router.navigate(['/recruitment/candidates', c.id]);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(recruitmentError(err).key);
      },
    });
  }
}
