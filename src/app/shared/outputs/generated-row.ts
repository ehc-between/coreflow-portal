import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { OutputsApi } from '../../core/outputs/outputs-api';
import { GeneratedOutput } from '../../core/outputs/outputs.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { LocalDatePipe } from '../locale/locale-pipes';
import { Badge } from '../ui/badge/badge';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { OUTPUTS_SCOPE, localized, outputErrorKey, saveFile } from './output-display';

/**
 * One generated file in a list (the archive, "Sist laget"): its title linking to
 * the stored version, what it is and when it was made, its state (draft, gaps,
 * replaced) and a download button.
 */
@Component({
  selector: 'app-generated-row',
  imports: [RouterLink, TranslocoPipe, Badge, Button, Icon, LocalDatePipe],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      [attr.data-testid]="'generated-row-' + file().id"
    >
      <div class="min-w-0 flex-1 basis-[260px]">
        <a
          [routerLink]="file().url"
          class="font-semibold text-fg [overflow-wrap:anywhere] hover:text-accent hover:underline"
          >{{ file().title }}</a
        >
        <p class="mt-0.5 text-meta text-fg-muted">
          {{
            'outputs.row.meta'
              | transloco
                : {
                    version: file().version,
                    format: 'outputs.formats.' + file().format | transloco,
                    lang: 'outputs.langs.' + file().lang | transloco,
                    date: (file().generated_at | localDate: 'medium'),
                  }
          }}
          @if (file().generated_by?.name; as name) {
            · {{ 'outputs.row.by' | transloco: { name } }}
          }
        </p>
        @if (showOutput() && outputTitle()) {
          <p class="text-micro text-fg-subtle">{{ outputTitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        @if (file().status === 'draft') {
          <app-badge tone="info">{{ 'outputs.status.draft' | transloco }}</app-badge>
        }
        @if (file().ai_draft) {
          <app-badge tone="accent">{{ 'outputs.status.aiDraft' | transloco }}</app-badge>
        }
        @if (file().has_gaps) {
          <app-badge tone="warn">{{ 'outputs.status.gaps' | transloco }}</app-badge>
        }
        @if (!file().current) {
          <app-badge tone="neutral">{{ 'outputs.status.superseded' | transloco }}</app-badge>
        }
        <app-button
          size="sm"
          variant="secondary"
          [loading]="downloading()"
          (click)="download()"
          data-testid="generated-download"
        >
          <app-icon name="download" [size]="14" />
          {{ 'outputs.actions.download' | transloco }}
        </app-button>
      </div>
      @if (errorKey(); as key) {
        <p class="w-full text-meta text-fail" role="alert">{{ key | transloco }}</p>
      }
    </div>
  `,
})
export class GeneratedRow {
  private readonly api = inject(OutputsApi);
  private readonly language = inject(LanguageService);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly file = input.required<GeneratedOutput>();
  /** Show which output the file is a version of (off when the list is one output's). */
  readonly showOutput = input(true);

  protected readonly downloading = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly outputTitle = computed(() => {
    const title = localized(this.file().output_title, this.language.active());
    return title && title !== this.file().title ? title : '';
  });

  protected download(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const file = this.file();
    if (!orgId) {
      return;
    }
    this.downloading.set(true);
    this.errorKey.set(null);
    this.api.download(orgId, file.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        saveFile(blob, file.file_name);
      },
      error: (err) => {
        this.downloading.set(false);
        this.errorKey.set(outputErrorKey(err));
      },
    });
  }
}
