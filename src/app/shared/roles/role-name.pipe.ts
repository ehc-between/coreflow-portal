import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { roleLabel } from '../../core/org/roles';

/**
 * `{{ roleKey | roleName: storedName }}` — display name of a role, never an
 * i18n key: the translation for seeded roles, else the stored (org-defined)
 * name, else the key itself. Impure and signal-tracked so it refreshes when
 * the language switches or the language file finishes loading.
 */
@Pipe({ name: 'roleName', pure: false })
export class RoleNamePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(roleKey: string | null | undefined, storedName?: string | null): string {
    if (!roleKey) {
      return storedName ?? '';
    }
    const roles = storedName ? [{ key: roleKey, name: storedName }] : [];
    return roleLabel((key) => this.language.translate(key), roleKey, roles);
  }
}
