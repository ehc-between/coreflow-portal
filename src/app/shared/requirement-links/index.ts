// Requirements everywhere (P1): one way to show and edit "this record documents
// that requirement" on every page. See docs/polish-plan.md, section 2.2.
export { SupportsRequirements, type LinkedAction } from './supports-requirements';
export { RequirementChip } from './requirement-chip';
export { RequirementChips, REQUIREMENT_CHIPS_MAX } from './requirement-chips';
export { CoverageChip, coverageState, type CoverageState } from './coverage-chip';
export { RequirementCoverageService, COVERAGE_BATCH } from './requirement-coverage.service';
export { ClausePicker, parseClause, toRefs } from './clause-picker';
export { RequirementCatalogueSearch, type RequirementPick } from './requirement-catalogue-search';
export {
  frameworkOf,
  fallbackLabel,
  requirementRoute,
  labelText,
  reqIndexOf,
} from './requirement-label';
export { ReqPills } from './req-pills';
