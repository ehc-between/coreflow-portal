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
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskAbout } from '../../../shared/ask/ask-about';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import { DocSection, EntityRef, TechnicalDocumentation } from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_SYSTEM_ENTITY,
  docSectionHintKey,
  docSectionKey,
  riskKey,
  riskValue,
  roleKey,
  technicalDocCopy,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiRecordPicker } from '../ui/record-picker';
import { downloadBlob } from '../ui/download';

/** Whether a canonical clause ref is the Annex IV group ref (rendered by point instead). */
function isAnnexRef(ref: string | null | undefined): boolean {
  return !!ref && /annex\s*iv/i.test(ref);
}

/**
 * `/ai-governance/systems/:id/documentation`: the system's structured
 * documentation — data and model documentation, human oversight, logging,
 * accuracy / robustness and the post-market plan — and the nine Annex IV points
 * of the technical file. Annex IV is required only when the org provides a
 * high-risk system; a deployer instead gets a checklist of what to obtain from
 * the provider and the sections are optional. Each section can hold text and /
 * or link the controlled document that holds it; the file exports as a PDF.
 */
@Component({
  selector: 'app-ai-technical-documentation',
  imports: [
    TranslocoPipe,
    AskAbout,
    ClauseChips,
    EntityChip,
    MarkdownPipe,
    Badge,
    Button,
    Card,
    ErrorState,
    Icon,
    LoadingState,
    ProgressBar,
    StatusBadge,
    AiGovPage,
    AiRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page
      titleKey="aiGovernance.docs.title"
      [titleParams]="{ name: doc()?.system?.name ?? '' }"
      [breadcrumbs]="crumbs()"
      page="documentation"
      lesson="technical-documentation"
      [nav]="false"
      [backLink]="['/ai-governance/systems', id()]"
      backLabelKey="aiGovernance.wizard.backToSystem"
    >
      @if (doc()) {
        <app-button
          secondary
          size="sm"
          variant="secondary"
          [loading]="exporting()"
          (click)="exportPdf()"
          data-testid="docs-export"
        >
          <app-icon name="upload" [size]="14" />
          {{ 'aiGovernance.docs.export' | transloco }}
        </app-button>
      }

      @if (loadError()) {
        <app-error-state (retry)="reload.update((n) => n + 1)" />
      } @else if (doc(); as d) {
        <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <app-card>
            <div class="mb-2 flex flex-wrap items-center gap-2 text-meta text-fg-muted">
              <span class="font-mono">{{ d.system.code }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ roleKey(d.system.ai_act_role) | transloco }}</span>
              <app-status-badge
                meaning="severity"
                [value]="riskValue(d.system.risk_class)"
                [labelKey]="riskKey(d.system.risk_class)"
              />
              @if (copy().badge; as badge) {
                <app-badge
                  [tone]="d.required ? 'warn' : 'neutral'"
                  data-testid="docs-audience-badge"
                  >{{ badge | transloco }}</app-badge
                >
              }
            </div>
            <p class="text-body text-fg" data-testid="docs-audience-body">
              {{ copy().body | transloco }}
            </p>
            @if (d.provider_checklist?.length) {
              <div class="mt-4" data-testid="docs-provider-checklist">
                <h2 class="mb-1 text-card font-semibold text-fg">
                  {{ 'aiGovernance.docs.fromProvider' | transloco }}
                </h2>
                <p class="mb-2 text-meta text-fg-muted">
                  {{ 'aiGovernance.docs.fromProviderHint' | transloco }}
                </p>
                <ul class="flex flex-col gap-1.5">
                  @for (item of d.provider_checklist; track item.key) {
                    <li class="flex flex-wrap items-baseline gap-x-2 text-ui text-fg">
                      <span class="text-fg-subtle" aria-hidden="true">☐</span>
                      <span>{{ item.title }}</span>
                      <app-clause-chips [clauses]="[item.clause_ref]" />
                    </li>
                  }
                </ul>
              </div>
            }
          </app-card>
          <app-card>
            <p class="mb-1 text-ui font-semibold text-fg">
              {{
                'aiGovernance.docs.completeness'
                  | transloco: { done: d.annex_iv_complete, total: d.annex_iv_total }
              }}
            </p>
            <p class="mb-2 text-meta text-fg-muted">
              {{
                (d.required ? 'aiGovernance.docs.requiredShort' : 'aiGovernance.docs.optionalShort')
                  | transloco
              }}
            </p>
            <app-progress-bar
              [value]="d.completeness"
              [label]="'aiGovernance.docs.completenessLabel' | transloco"
            />
            <p class="mt-3 text-meta text-fg-muted">
              {{
                'aiGovernance.docs.governanceDone'
                  | transloco: { done: governanceDone(), total: groups()[0].sections.length }
              }}
            </p>
          </app-card>
        </div>

        @for (group of groups(); track group.key) {
          <section class="mb-6" [attr.aria-labelledby]="'doc-group-' + group.key">
            <h2
              [id]="'doc-group-' + group.key"
              class="mb-1 font-display text-section font-bold text-fg"
            >
              {{ 'aiGovernance.docs.groups.' + group.key | transloco }}
            </h2>
            <p class="mb-3 text-ui text-fg-muted">
              {{ 'aiGovernance.docs.groupHints.' + group.key | transloco }}
            </p>
            <div class="flex flex-col gap-3">
              @for (section of group.sections; track section.key) {
                <app-card [attr.data-testid]="'doc-section-' + section.key">
                  <div class="mb-1.5 flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <h3 class="flex items-center gap-2 text-card font-bold text-fg">
                        @if (section.complete) {
                          <span class="text-pass"><app-icon name="checkcircle" [size]="15" /></span>
                          <span class="sr-only">{{
                            'aiGovernance.docs.complete' | transloco
                          }}</span>
                        }
                        {{ section.title || (docSectionKey(section.key) | transloco) }}
                      </h3>
                      <p class="mt-0.5 text-meta text-fg-subtle">
                        @if (section.point) {
                          <span>{{
                            'aiGovernance.docs.annexPoint' | transloco: { point: section.point }
                          }}</span>
                        }
                        @if (section.clause_ref && !isAnnexRef(section.clause_ref)) {
                          <app-clause-chips [clauses]="[section.clause_ref]" />
                        }
                      </p>
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
                  <p class="mb-2 text-meta text-fg-muted">
                    {{ docSectionHintKey(section.key) | transloco }}
                  </p>
                  @if (editing() === section.key) {
                    <form
                      class="flex flex-col gap-3"
                      (submit)="$event.preventDefault(); save(section)"
                      (keydown.escape)="editing.set(null)"
                    >
                      <div class="flex flex-col gap-1">
                        <span
                          class="text-ui font-semibold text-fg-muted"
                          [id]="'doc-d-' + section.key"
                          >{{ 'aiGovernance.docs.linkedDocument' | transloco }}</span
                        >
                        <app-ai-record-picker
                          [types]="['document']"
                          [value]="linked()"
                          [describedBy]="'doc-d-' + section.key"
                          placeholderKey="aiGovernance.docs.documentPlaceholder"
                          (picked)="linked.set($event)"
                          (cleared)="linked.set(null)"
                        />
                      </div>
                      <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
                        {{ 'aiGovernance.docs.text' | transloco }}
                        <textarea
                          [id]="'doc-' + section.key"
                          rows="8"
                          maxlength="20000"
                          class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-body font-normal text-fg"
                          [value]="text()"
                          (input)="text.set($any($event.target).value)"
                        ></textarea>
                      </label>
                      <div class="flex justify-end gap-2">
                        <app-button size="sm" variant="ghost" (click)="editing.set(null)">{{
                          'aiGovernance.common.cancel' | transloco
                        }}</app-button>
                        <app-button size="sm" type="submit" [loading]="saving()">{{
                          'aiGovernance.common.save' | transloco
                        }}</app-button>
                      </div>
                    </form>
                  } @else {
                    @if (section.document; as docRef) {
                      <p class="mb-2 flex flex-wrap items-center gap-2 text-meta text-fg-muted">
                        {{ 'aiGovernance.docs.heldIn' | transloco }}
                        <app-entity-chip [ref]="docRef" [statusText]="true" />
                      </p>
                    }
                    @if (section.content) {
                      <div
                        class="cf-prose text-body leading-relaxed text-fg"
                        [innerHTML]="section.content | appMarkdown"
                      ></div>
                    } @else if (!section.document) {
                      <p class="text-ui text-fg-subtle">
                        {{ 'aiGovernance.docs.notWritten' | transloco }}
                      </p>
                    }
                  }
                </app-card>
              }
            </div>
          </section>
        }
      } @else {
        <app-loading-state [rows]="6" />
      }
    </app-ai-gov-page>
  `,
})
export class AiTechnicalDocumentation {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  readonly id = input.required<string>();

  protected readonly riskKey = riskKey;
  protected readonly riskValue = riskValue;
  protected readonly roleKey = roleKey;
  protected readonly docSectionKey = docSectionKey;
  protected readonly docSectionHintKey = docSectionHintKey;
  protected readonly isAnnexRef = isAnnexRef;

  protected readonly doc = signal<TechnicalDocumentation | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editing = signal<string | null>(null);
  protected readonly text = signal('');
  protected readonly linked = signal<EntityRef | null>(null);
  protected readonly saving = signal(false);
  protected readonly exporting = signal(false);
  protected readonly reload = signal(0);

  /** Badge + explanation for who the Annex IV file is for (provider / deployer / other). */
  protected readonly copy = computed(() => {
    const d = this.doc();
    return d ? technicalDocCopy(d) : { badge: null, body: 'aiGovernance.docs.optionalBody' };
  });

  protected readonly groups = computed(() => {
    const sections = this.doc()?.sections ?? [];
    return (['governance', 'annex_iv'] as const).map((key) => ({
      key,
      sections: sections.filter((s) => s.group === key),
    }));
  });
  protected readonly governanceDone = computed(
    () => this.groups()[0].sections.filter((s) => s.complete).length,
  );
  protected readonly crumbs = computed(() => {
    const s = this.doc()?.system;
    return [
      { labelKey: 'aiGovernance.systems.title', link: '/ai-governance/systems' },
      { label: s?.code ?? '…', link: ['/ai-governance/systems', this.id()] },
      { labelKey: 'aiGovernance.docs.crumb' },
    ];
  });

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      entityType: AI_SYSTEM_ENTITY,
      entityId: this.id(),
      view: 'detail',
      title: this.doc()?.system.name ?? null,
      selection: this.editing() ? { field: this.editing()! } : null,
      requirements: [
        ...new Set(
          (this.doc()?.sections ?? []).map((s) => s.clause_ref).filter((r): r is string => !!r),
        ),
      ],
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      this.reload();
      this.language.active();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.loadError.set(null);
        this.api.technicalDocumentation(orgId, id).subscribe({
          next: (doc) => this.doc.set(doc),
          error: (err: unknown) => this.loadError.set(aiGovernanceErrorKey(err)),
        });
      });
    });
  }

  protected edit(section: DocSection): void {
    this.text.set(section.content ?? '');
    this.linked.set(section.document ?? null);
    this.editing.set(section.key);
  }

  protected save(section: DocSection): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    const value = this.text().trim() || null;
    const documentId = this.linked()?.entity_id ?? null;
    this.api
      .updateDocumentation(orgId, this.id(), {
        sections: { [section.key]: value },
        documents: { [section.key]: documentId },
      })
      .subscribe({
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

  protected exportPdf(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.doc();
    if (!orgId || !d || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api.exportTechnicalDocumentation(orgId, this.id(), this.language.active()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        downloadBlob(blob, `${d.system.code}-technical-file.pdf`);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
