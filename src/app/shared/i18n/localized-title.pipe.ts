import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocalizedTitleResolver, LocalizedTitleSource } from '../../core/i18n/localized-title';

/**
 * `{{ task | localizedTitle }}` — a task / work item title in the active
 * language: its `title_key` with `title_params` when the backend sent one,
 * else the stored `title`. Impure so it follows a language switch and the
 * on-demand scope load (the resolver reads signals, which ties the host view
 * to them under zoneless change detection).
 */
@Pipe({ name: 'localizedTitle', pure: false })
export class LocalizedTitlePipe implements PipeTransform {
  private readonly resolver = inject(LocalizedTitleResolver);

  transform(source: LocalizedTitleSource | null | undefined): string {
    return this.resolver.resolve(source);
  }
}
