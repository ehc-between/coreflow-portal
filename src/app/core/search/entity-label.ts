/**
 * The display label of a record type. Tries, in order:
 *   1. the type's registered `label_key` (global `modules.entities.<type>` by
 *      default, provided by the module registry),
 *   2. the search scope's built-in labels (`search.types.<type>`) for the types
 *      the platform ships (documents, deviations, CAPA actions, requirements),
 *   3. the generic `search.types.other`.
 *
 * `translate` is a Transloco-style translate that returns the key itself when the
 * key is missing (e.g. `LanguageService.translate`, signal-tracked).
 */
export function entityTypeLabel(
  translate: (key: string) => string,
  labelKey: string | null | undefined,
  entityType: string,
): string {
  if (labelKey) {
    const label = translate(labelKey);
    if (label && label !== labelKey) {
      return label;
    }
  }
  const builtinKey = `search.types.${entityType}`;
  const builtin = translate(builtinKey);
  if (builtin && builtin !== builtinKey) {
    return builtin;
  }
  return translate('search.types.other');
}

/** Icon (shared Icon set) for a record type in search results. */
export function entityTypeIcon(entityType: string): string {
  switch (entityType) {
    case 'document':
      return 'documents';
    case 'deviation':
      return 'alert';
    case 'deviation_action':
      return 'checkcircle';
    case 'standard_requirement':
      return 'iso';
    case 'task':
      return 'inbox';
    case 'risk':
    case 'opportunity':
      return 'risk';
    case 'audit_plan':
    case 'audit_programme':
    case 'audit_finding':
      return 'audit';
    case 'employee':
    case 'candidate':
      return 'people';
    case 'course':
    case 'training_assignment':
      return 'training';
    case 'project':
      return 'projects';
    default:
      return 'link';
  }
}
