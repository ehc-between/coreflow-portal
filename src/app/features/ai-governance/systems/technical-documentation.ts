import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { DocSection, TechnicalDocumentation } from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_SYSTEM_ENTITY,
  docSectionHintKey,
  docSectionKey,
  riskKey,
  riskTone,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiLessonCard } from '../ui/ai-lesson-card';

/**
 * `/ai-governance/systems/:id/documentation`: the system's structured
 * documentation — data and model documentation, human oversight, logging,
 * accuracy/robustness and the post-market plan — and the nine Annex IV
 * sections of the technical file (mandatory for high-risk systems, Art. 11),
 * with completeness. Writers edit one section at a time.
 */
@Component({
  selector: 'app-ai-technical-documentation',
  imports: [
    TranslocoPipe,
    AskAbout,
    MarkdownPipe,
    Alert,
    Badge,
    Button,
    Card,
    Icon,
    ProgressBar,
    AiGovPage,
    AiLessonCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.docs.title"
      [titleParams]="{ name: doc()?.system?.name ?? '' }"
      page="documentation"
      [backLink]="['/ai-governance/systems', id()]"
      backLabelKey="aiGovernance.wizard.backToSystem"
    >
      @if (loadError()) {
        <app-alert tone="error">{{ loadError()! | transloco }}</app-alert>
      } @else if (doc(); as d) {
        <div class="mb-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <app-card>
            <div class="mb-2 flex flex-wrap items-center gap-2">
              <span class="font-mono text-[12.5px] text-fg-subtle">{{ d.system.code }}</span>
              <app-badge [tone]="riskTone(d.system.risk_class)">{{
                riskKey(d.system.risk_class) | transloco
              }}</app-badge>
              @if (d.required) {
                <app-badge tone="warn">{{ 'aiGovernance.docs.required' | transloco }}</app-badge>
              }
            </div>
            <p class="text-[13.5px] text-fg">
              {{
                (d.required ? 'aiGovernance.docs.requiredBody' : 'aiGovernance.docs.optionalBody')
                  | transloco
              }}
            </p>
          </app-card>
          <app-card>
            <p class="mb-2 text-[13px] font-semibold text-fg">
              {{
                'aiGovernance.docs.completeness'
                  | transloco: { done: d.annex_iv_complete, total: d.annex_iv_total }
              }}
            </p>
            <app-progress-bar
              [value]="d.completeness"
              [label]="'aiGovernance.docs.completenessLabel' | transloco"
            />
          </app-card>
        </div>

        @for (group of groups(); track group.key) {
          <section class="mb-6" [attr.aria-labelledby]="'doc-group-' + group.key">
            <h2
              [id]="'doc-group-' + group.key"
              class="mb-3 font-display text-[17px] font-bold text-fg"
            >
              {{ 'aiGovernance.docs.groups.' + group.key | transloco }}
            </h2>
            <div class="flex flex-col gap-3">
              @for (section of group.sections; track section.key) {
                <app-card>
                  <div class="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h3 class="flex items-center gap-2 text-[14px] font-bold text-fg">
                        @if (section.complete) {
                          <span class="text-pass"><app-icon name="checkcircle" [size]="15" /></span>
                          <span class="sr-only">{{
                            'aiGovernance.docs.complete' | transloco
                          }}</span>
                        }
                        {{ docSectionKey(section.key) | transloco }}
                      </h3>
                      <p class="text-[12px] text-fg-subtle">{{ section.ref }}</p>
                    </div>
                    <div class="flex items-center gap-1">
                      <app-ask-about
                        [prompt]="
                          'aiGovernance.docs.ask'
                            | transloco: { section: (docSectionKey(section.key) | transloco) }
                        "
                        [field]="section.key"
                        labelKey="aiGovernance.wizard.askAbout"
                      />
                      @if (store.canWrite() && editing() !== section.key) {
                        <app-button
                          size="sm"
                          variant="ghost"
                          (click)="edit(section)"
                          [attr.data-testid]="'doc-edit-' + section.key"
                        >
                          {{ 'aiGovernance.common.edit' | transloco }}
                        </app-button>
                      }
                    </div>
                  </div>
                  @if (editing() === section.key) {
                    <form (submit)="$event.preventDefault(); save(section)">
                      <label class="sr-only" [for]="'doc-' + section.key">{{
                        docSectionKey(section.key) | transloco
                      }}</label>
                      <p class="mb-1.5 text-[12.5px] text-fg-muted">
                        {{ docSectionHintKey(section.key) | transloco }}
                      </p>
                      <textarea
                        [id]="'doc-' + section.key"
                        rows="8"
                        maxlength="20000"
                        class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] text-fg"
                        [value]="text()"
                        (input)="text.set($any($event.target).value)"
                        (keydown.escape)="editing.set(null)"
                      ></textarea>
                      <div class="mt-2 flex justify-end gap-2">
                        <app-button size="sm" variant="ghost" (click)="editing.set(null)">{{
                          'aiGovernance.common.cancel' | transloco
                        }}</app-button>
                        <app-button size="sm" type="submit" [loading]="saving()">{{
                          'aiGovernance.common.save' | transloco
                        }}</app-button>
                      </div>
                    </form>
                  } @else if (section.content) {
                    <div
                      class="cf-prose text-[13.5px] leading-relaxed text-fg"
                      [innerHTML]="section.content | appMarkdown"
                    ></div>
                  } @else {
                    <p class="text-[13px] text-fg-subtle">
                      {{ docSectionHintKey(section.key) | transloco }}
                    </p>
                  }
                </app-card>
              }
            </div>
          </section>
        }
        <app-ai-lesson-card lesson="technical-documentation" />
      } @else {
        <p class="text-[14px] text-fg-muted">{{ 'aiGovernance.common.loading' | transloco }}</p>
      }
    </app-ai-gov-page>
  `,
})
export class AiTechnicalDocumentation {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly riskKey = riskKey;
  protected readonly riskTone = riskTone;
  protected readonly docSectionKey = docSectionKey;
  protected readonly docSectionHintKey = docSectionHintKey;

  protected readonly doc = signal<TechnicalDocumentation | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editing = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly saving = signal(false);
  private readonly reload = signal(0);

  protected readonly groups = computed(() => {
    const sections = this.doc()?.sections ?? [];
    return (['governance', 'annex_iv'] as const).map((key) => ({
      key,
      sections: sections.filter((s) => s.group === key),
    }));
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.doc()?.system.name ?? null,
      selection: this.editing() ? { field: this.editing()! } : null,
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.technicalDocumentation(orgId, id).subscribe({
          next: (doc) => this.doc.set(doc),
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected edit(section: DocSection): void {
    this.text.set(section.content ?? '');
    this.editing.set(section.key);
  }

  protected save(section: DocSection): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    const value = this.text().trim() || null;
    this.api.updateDocumentation(orgId, this.id(), { [section.key]: value }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.notifications.success('aiGovernance.docs.saved');
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
