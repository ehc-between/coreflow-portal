export { Icon } from './icon/icon';
export { Button, type ButtonVariant, type ButtonSize } from './button/button';
export { Badge, type BadgeTone } from './badge/badge';
export { Avatar, type AvatarSize } from './avatar/avatar';
export { Card } from './card/card';
export { FormField } from './form-field/form-field';
export { SectionLabel } from './section-label/section-label';
export { KpiBand } from './kpi-band/kpi-band';
export { KpiTile, type KpiNoLinkReason, type KpiTone } from './kpi-tile/kpi-tile';
export { AgentBanner } from './agent-banner/agent-banner';
export { Alert, type AlertTone } from './alert/alert';
export { ConfirmDialog } from './confirm-dialog/confirm-dialog';
export { PromptDialog } from './prompt-dialog/prompt-dialog';
export { Pager } from './pager/pager';
export { ProgressRing } from './progress-ring/progress-ring';
export { ProgressBar } from './progress-bar/progress-bar';
export { SlideOver } from './slide-over/slide-over';
export { Switch } from './switch/switch';

// Design system (P3): page anatomy, tones and states. See docs/ux-guide.md.
export {
  type Tone,
  type ToneMeaning,
  toneFor,
  toneLabelKey,
  humaniseValue,
  normaliseToneValue,
} from './tones';
export { StatusBadge } from './status-badge/status-badge';
export { PageHeader, type Breadcrumb } from './page-header/page-header';
export { ModuleNav, type ModuleNavItem } from './module-nav/module-nav';
export { HelpStrip } from './help-strip/help-strip';
export {
  RecordRow,
  RecordRowHeader,
  RECORD_ROW_COLUMNS,
  type RecordRowDateKind,
} from './record-row/record-row';
export { FieldList, FieldItem, type EmptyWord } from './field-list/field-list';
export { OverflowMenu, MenuItem } from './overflow-menu/overflow-menu';
export { EmptyState } from './empty-state/empty-state';
export { LoadingState } from './loading-state/loading-state';
export { ErrorState } from './error-state/error-state';
export { TitleService, CoreflowTitleStrategy } from './title/title.service';
