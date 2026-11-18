import { parseClause } from '../../../shared/requirement-links/clause-picker';
import { fixedShortName } from '../../../shared/requirement-links/requirement-label';

/**
 * "ISO 27001 · A.6.3" for a canonical clause ref (`iso27001:A.6.3`), following the
 * requirement label convention (plan 2.1): the Harmonised Structure reads "Felles
 * ISO-krav · 7.2", never "ISO HS". Translated short names come from the training
 * scope (`training.frameworks.<key>`), passed in as `translate`.
 */
export function clauseLabel(ref: string, translate: (key: string) => string): string {
  const parsed = parseClause(ref);
  if (!parsed.framework) {
    return parsed.number;
  }
  const short =
    fixedShortName(parsed.framework) ?? translate(`training.frameworks.${parsed.framework}`);
  return `${short} · ${parsed.number}`;
}
