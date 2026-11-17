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
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ModuleNav } from '../../../shared/ui/module-nav/module-nav';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { supplierErrorKey } from '../data/supplier-errors';
import { EVALUATION_KINDS, EvaluationKind, Questionnaire } from '../data/supplier.models';
import { SuppliersApi } from '../data/suppliers-api';
import { questionnaireLang } from '../detail/start-evaluation-dialog';
import { suppliersNav } from '../shared/suppliers-nav';

/**
 * Questionnaire templates (`/suppliers/questionnaires`): the built-in set for every
 * evaluation kind (in the UI language) and the org's own templates, each question
 * with the clauses it checks. With `suppliers:manage` you can create, copy a built-in
 * one, edit and delete your own.
 */
@Component({
  selector: 'app-questionnaires-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    Badge,
    Button,
    Card,
    ClauseChips,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    ModuleNav,
    PageHeader,
    WhyItMatters,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="suppliers.questionnaires.title"
        descriptionKey="suppliers.questionnaires.subtitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.suppliers', link: '/suppliers' },
          { labelKey: 'suppliers.questionnaires.title' },
        ]"
      >
        @if (canManage()) {
          <app-button primary (click)="create()">
            <app-icon name="plus" [size]="14" />
            {{ 'suppliers.questionnaires.new' | transloco }}
          </app-button>
        }
      </app-page-header>
      <app-module-nav labelKey="modules.names.suppliers" [items]="nav" />
      <app-help-strip scope="suppliers" page="questionnaires" />

      <div
        class="mb-4 flex flex-wrap gap-1"
        role="group"
        [attr.aria-label]="'suppliers.evaluations.kind' | transloco"
      >
        <button
          type="button"
          class="rounded-full px-3 py-1 text-meta font-semibold"
          [class]="!kind() ? 'bg-accent text-white' : 'bg-surface-2 text-fg-muted hover:text-fg'"
          [attr.aria-pressed]="!kind()"
          (click)="kind.set('')"
        >
          {{ 'suppliers.evaluationsPage.anyKind' | transloco }}
        </button>
        @for (k of kinds; track k) {
          <button
            type="button"
            class="rounded-full px-3 py-1 text-meta font-semibold"
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
          <app-loading-state [rows]="4" />
        }
        @case ('error') {
          <app-error-state (retry)="reload()" />
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
                  <h2 class="font-display text-card font-bold text-fg">{{ t.name }}</h2>
                  @if (t.description) {
                    <p class="mt-1 text-ui text-fg-muted">{{ t.description }}</p>
                  }
                  <p class="mt-1 text-meta text-fg-subtle">
                    {{
                      'suppliers.questionnaires.meta'
                        | transloco: { count: t.questions.length, pass: t.pass_score }
                    }}
                  </p>
                  <details class="mt-2">
                    <summary class="cursor-pointer text-meta font-semibold text-accent">
                      {{ 'suppliers.questionnaires.showQuestions' | transloco }}
                    </summary>
                    <ol class="mt-2 list-decimal pl-5 text-ui text-fg">
                      @for (q of t.questions; track q.id) {
                        <li class="mb-1.5">
                          {{ q.text }}
                          <span class="text-meta text-fg-subtle">
                            ({{ 'suppliers.questionType.' + q.type | transloco }}
                            @if (q.critical) {
                              , {{ 'suppliers.questions.critical' | transloco }}
                            }
                            )
                          </span>
                          @if (q.requirement_refs?.length) {
                            <span class="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-meta">
                              <span class="text-fg-subtle">{{
                                'suppliers.questions.checks' | transloco
                              }}</span>
                              <app-clause-chips [clauses]="q.requirement_refs ?? []" />
                            </span>
                          }
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
                          class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-ui font-semibold text-fg hover:bg-surface-2"
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

      <div class="mt-8"><app-why-it-matters scope="suppliers" page="questionnaires" /></div>
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
  protected readonly nav = suppliersNav();
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

  protected reload(): void {
    this.load(this.selectedOrg.currentOrgId(), questionnaireLang(this.language.active()));
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
