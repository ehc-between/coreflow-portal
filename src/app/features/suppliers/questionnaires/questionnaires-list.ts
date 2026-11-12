import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
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
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { supplierErrorKey } from '../data/supplier-errors';
import { EVALUATION_KINDS, EvaluationKind, Questionnaire } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from '../detail/supplier-evaluations-panel';
import { SuppliersNav } from '../shared/suppliers-nav';

/**
 * Questionnaire templates (`/suppliers/questionnaires`): the built-in set for every
 * evaluation kind (in the UI language) and the org's own templates. With
 * `suppliers:manage` you can create, copy a built-in one, edit and delete your own.
 */
@Component({
  selector: 'app-questionnaires-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    GuideIntro,
    Icon,
    SuppliersNav,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
            {{ 'suppliers.questionnaires.title' | transloco }}
          </h1>
          <p class="mt-1 text-[14px] text-fg-muted">
            {{ 'suppliers.questionnaires.subtitle' | transloco }}
          </p>
          <app-suppliers-nav />
        </div>
        @if (canManage()) {
          <app-button size="sm" (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.questionnaires.new' | transloco }}
          </app-button>
        }
      </header>

      <div class="mb-4"><app-guide-intro scope="suppliers" page="questionnaires" /></div>

      <div
        class="mb-4 flex flex-wrap gap-1"
        role="group"
        [attr.aria-label]="'suppliers.evaluations.kind' | transloco"
      >
        <button
          type="button"
          class="rounded-full px-3 py-1 text-[12.5px] font-semibold"
          [class]="!kind() ? 'bg-accent text-white' : 'bg-surface-2 text-fg-muted hover:text-fg'"
          [attr.aria-pressed]="!kind()"
          (click)="kind.set('')"
        >
          {{ 'suppliers.evaluationsPage.anyKind' | transloco }}
        </button>
        @for (k of kinds; track k) {
          <button
            type="button"
            class="rounded-full px-3 py-1 text-[12.5px] font-semibold"
            [class]="
              kind() === k ? 'bg-accent text-white' : 'bg-surface-2 text-fg-muted hover:text-fg'
            "
            [attr.aria-pressed]="kind() === k"
            (click)="kind.set(k)"
          >
            {{ 'suppliers.evaluationKind.' + k | transloco }}
          </button>
        }
      </div>

      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'suppliers.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <p class="text-[14px] text-fail" role="alert">
            {{ 'suppliers.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
            @for (t of visible(); track t.id) {
              <li>
                <app-card>
                  <div class="mb-1 flex flex-wrap items-center gap-2">
                    <app-badge tone="accent">{{
                      'suppliers.evaluationKind.' + t.kind | transloco
                    }}</app-badge>
                    @if (t.builtin) {
                      <app-badge>{{ 'suppliers.questionnaires.builtin' | transloco }}</app-badge>
                    }
                  </div>
                  <h2 class="font-display text-[15px] font-bold text-fg">{{ t.name }}</h2>
                  @if (t.description) {
                    <p class="mt-1 text-[13px] text-fg-muted">{{ t.description }}</p>
                  }
                  <p class="mt-1 text-[12.5px] text-fg-subtle">
                    {{
                      'suppliers.questionnaires.meta'
                        | transloco: { count: t.questions.length, pass: t.pass_score }
                    }}
                  </p>
                  <details class="mt-2">
                    <summary class="cursor-pointer text-[12.5px] font-semibold text-accent">
                      {{ 'suppliers.questionnaires.showQuestions' | transloco }}
                    </summary>
                    <ol class="mt-2 list-decimal pl-5 text-[13px] text-fg">
                      @for (q of t.questions; track q.id) {
                        <li class="mb-1">
                          {{ q.text }}
                          <span class="text-[11.5px] text-fg-subtle">
                            ({{ 'suppliers.questionType.' + q.type | transloco }}
                            @if (q.critical) {
                              , {{ 'suppliers.questions.critical' | transloco }}
                            }
                            )
                          </span>
                        </li>
                      }
                    </ol>
                  </details>
                  @if (canManage()) {
                    <div class="mt-3 flex flex-wrap gap-2">
                      @if (t.builtin) {
                        <app-button size="sm" variant="secondary" (click)="copy(t)">
                          {{ 'suppliers.questionnaires.copy' | transloco }}
                        </app-button>
                      } @else {
                        <a
                          [routerLink]="['/suppliers/questionnaires', t.id, 'edit']"
                          class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
                        >
                          {{ 'suppliers.common.edit' | transloco }}
                        </a>
                        <app-button size="sm" variant="ghost" (click)="pendingDelete.set(t)">
                          <app-icon name="trash" [size]="14" />
                          {{ 'suppliers.common.delete' | transloco }}
                        </app-button>
                      }
                    </div>
                  }
                </app-card>
              </li>
            }
          </ul>
        }
      }

      <div class="mt-6"><app-why-it-matters scope="suppliers" page="questionnaires" /></div>
    </div>

    <app-confirm-dialog
      [open]="pendingDelete() !== null"
      [title]="'suppliers.questionnaires.deleteTitle' | transloco"
      [message]="
        'suppliers.questionnaires.deleteMessage' | transloco: { name: pendingDelete()?.name ?? '' }
      "
      [confirmLabel]="'suppliers.common.delete' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="pendingDelete.set(null)"
    />
  `,
})
export class QuestionnairesList {
  private readonly api = inject(SuppliersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly kinds = EVALUATION_KINDS;
  protected readonly kind = signal<EvaluationKind | ''>('');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Questionnaire[]>([]);
  protected readonly busy = signal(false);
  protected readonly pendingDelete = signal<Questionnaire | null>(null);

  protected readonly canManage = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes('suppliers:manage'),
  );
  protected readonly visible = computed(() => {
    const kind = this.kind();
    return kind ? this.items().filter((t) => t.kind === kind) : this.items();
  });

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'suppliers',
      view: 'list',
      title: this.language.translate('suppliers.questionnaires.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const lang = questionnaireLang(this.language.active());
      untracked(() => this.load(orgId, lang));
    });
  }

  protected create(): void {
    void this.router.navigate(['/suppliers/questionnaires/new']);
  }

  protected copy(t: Questionnaire): void {
    void this.router.navigate(['/suppliers/questionnaires/new'], { queryParams: { from: t.id } });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const t = this.pendingDelete();
    if (!orgId || !t || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.deleteQuestionnaire(orgId, t.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        this.items.update((list) => list.filter((x) => x.id !== t.id));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(supplierErrorKey(err));
      },
    });
  }

  private load(orgId: string | null, lang: 'en' | 'nb'): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.listQuestionnaires(orgId, { lang }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
