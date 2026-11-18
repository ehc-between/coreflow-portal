import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';

/** Guidance scope of the documents module (`src/assets/guidance/<lang>/documents.json`). */
export const DOCUMENTS_GUIDE_SCOPE = 'documents';

/**
 * The learning entry of a document-management page: the shared `app-help-strip`
 * (page intro, "Omvisning", "Leksjon · N min" and "Forklar denne siden"). Pages
 * that are not lists may add the "why this matters" note under it with `why`;
 * list pages put `app-why-it-matters` in the `[below]` slot instead.
 */
@Component({
  selector: 'app-documents-page-guide',
  imports: [HelpStrip, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-help-strip [scope]="scope" [page]="page()" [lesson]="lesson()" [tour]="tour()" />
    @if (why()) {
      <app-why-it-matters class="-mt-2 mb-5 block" [scope]="scope" [page]="page()" />
    }
  `,
})
export class DocumentsPageGuide {
  protected readonly scope = DOCUMENTS_GUIDE_SCOPE;

  readonly page = input.required<string>();
  readonly lesson = input<string | null>(null);
  readonly tour = input<string | null>(null);
  /** Also show the "why this matters" note (non-list pages). */
  readonly why = input(false);
}
