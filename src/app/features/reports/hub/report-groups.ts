import { GeneratedOutput, Output, OutputReadiness } from '../../../core/outputs/outputs.models';
import { BadgeTone } from '../../../shared/ui/badge/badge';

/**
 * Rapporter hub (IA v2 §5.9, prototype "rapporter"): what to deliver, grouped by who
 * it is for. Pure helpers, so the grouping and the status rules are unit tested.
 */

/** The four recipient groups, in page order (`?to=` value). */
export const RECIPIENTS = ['auditor', 'authority', 'board', 'people'] as const;
export type Recipient = (typeof RECIPIENTS)[number];

/** Output audiences per recipient group (customers and employees share one group, D12). */
const AUDIENCES: Readonly<Record<Recipient, readonly string[]>> = {
  auditor: ['auditor'],
  authority: ['authority'],
  board: ['board'],
  people: ['customers', 'employees'],
};

/** Rows shown per group before "Vis alle". */
export const GROUP_PREVIEW = 6;

/** Outputs for more standards than this get one row instead of one per standard. */
const MAX_STANDARD_ROWS = 2;

export function isRecipient(value: string | null | undefined): value is Recipient {
  return !!value && (RECIPIENTS as readonly string[]).includes(value);
}

/** Every recipient group an output belongs to (an output may sit in several). */
export function recipientsOf(audience: readonly string[]): Recipient[] {
  return RECIPIENTS.filter((r) => AUDIENCES[r].some((a) => audience.includes(a)));
}

/** The status pill of a row: "Klar", "Mangler N", "Utkast", "Ny", "Med mangler". */
export interface RowStatus {
  readonly tone: BadgeTone;
  /** `reports.hub.status.<key>`. */
  readonly key: 'ready' | 'missing' | 'draft' | 'new' | 'gaps';
  readonly count?: number;
}

export function readinessStatus(readiness: OutputReadiness | null): RowStatus {
  if (!readiness) {
    return { tone: 'info', key: 'new' };
  }
  return readiness.missing > 0
    ? { tone: 'warn', key: 'missing', count: readiness.missing }
    : { tone: 'pass', key: 'ready' };
}

export function fileStatus(file: Pick<GeneratedOutput, 'status' | 'has_gaps'>): RowStatus {
  if (file.status === 'draft') {
    return { tone: 'info', key: 'draft' };
  }
  return file.has_gaps ? { tone: 'warn', key: 'gaps' } : { tone: 'pass', key: 'ready' };
}

/**
 * What the row's one button does:
 * - `make` "Last ned": the existing make-and-download dialog (format, language).
 * - `missing` "Se hva som mangler": the same dialog, which lists the gaps with links.
 * - `file` "Last ned": the stored file (record reports made from a case or audit).
 * - `flow` the output's own page (audit packs).
 */
export type RowAction = 'make' | 'missing' | 'file' | 'flow';

/** One deliverable in a recipient group. */
export interface ReportRow {
  /** Unique per page (output key + standard / file id). */
  readonly id: string;
  readonly output: Output;
  /** Per-standard outputs: the standard this row is for (null = the dialog asks). */
  readonly standardKey: string | null;
  /** i18n key of the standard shown after the title (`reports.frameworks.<fw>`). */
  readonly standardLabelKey: string | null;
  /** Combined per-standard row: how many standards it covers. */
  readonly standardCount: number;
  readonly readiness: OutputReadiness | null;
  /** A stored file (record reports). */
  readonly file: GeneratedOutput | null;
  readonly status: RowStatus;
  readonly action: RowAction;
}

/** The outputs of one standard (`GET outputs?standard_key=`). */
export interface StandardOutputs {
  readonly standardKey: string;
  /** i18n key of the standard's name (`reports.frameworks.<fw>`). */
  readonly labelKey: string;
  readonly items: readonly Output[];
}

export interface ReportGroup {
  readonly recipient: Recipient;
  readonly rows: readonly ReportRow[];
}

function actionFor(output: Output, readiness: OutputReadiness | null): RowAction {
  if (!output.generates) {
    return 'flow';
  }
  return readiness && readiness.missing > 0 ? 'missing' : 'make';
}

/**
 * The rows of the hub, before grouping:
 * - Whole-org outputs, one row each (register exports have their own page).
 * - Per-standard outputs: one row per standard it applies to, or one combined row
 *   when it applies to more than two standards (missing counts are summed).
 * - Per-record outputs (an audit report, a breach notice): only once a file has been
 *   made from a record, one row per current file, which downloads it.
 * - Own-flow outputs (audit packs): one row linking to their page.
 */
export function buildRows(
  catalogue: readonly Output[],
  standards: readonly StandardOutputs[],
  files: readonly GeneratedOutput[],
): ReportRow[] {
  const rows: ReportRow[] = [];
  const recordOutputs = new Map<string, Output>();

  for (const output of catalogue) {
    if (output.kind === 'register_export') {
      continue;
    }
    if (output.subject === 'record') {
      recordOutputs.set(output.key, output);
      continue;
    }
    if (output.subject === 'standard') {
      continue;
    }
    rows.push({
      id: output.key,
      output,
      standardKey: null,
      standardLabelKey: null,
      standardCount: 0,
      readiness: output.readiness,
      file: null,
      status: output.generates ? readinessStatus(output.readiness) : { tone: 'info', key: 'new' },
      action: actionFor(output, output.readiness),
    });
  }

  // Per-standard outputs, keyed by output, in catalogue order.
  const perStandard = new Map<string, { output: Output; std: StandardOutputs }[]>();
  for (const std of standards) {
    for (const output of std.items) {
      if (output.subject !== 'standard' || output.kind === 'register_export') {
        continue;
      }
      const list = perStandard.get(output.key) ?? [];
      list.push({ output, std });
      perStandard.set(output.key, list);
    }
  }
  for (const [key, list] of perStandard) {
    if (list.length > MAX_STANDARD_ROWS) {
      const missing = list.reduce((sum, e) => sum + (e.output.readiness?.missing ?? 0), 0);
      const readiness: OutputReadiness = {
        ready: missing === 0,
        missing,
        recommended: list.reduce((sum, e) => sum + (e.output.readiness?.recommended ?? 0), 0),
      };
      const output = list[0].output;
      rows.push({
        id: key,
        output,
        standardKey: null,
        standardLabelKey: null,
        standardCount: list.length,
        readiness,
        file: null,
        status: readinessStatus(readiness),
        action: actionFor(output, readiness),
      });
      continue;
    }
    for (const { output, std } of list) {
      rows.push({
        id: `${key}:${std.standardKey}`,
        output,
        standardKey: std.standardKey,
        standardLabelKey: std.labelKey,
        standardCount: 1,
        readiness: output.readiness,
        file: null,
        status: readinessStatus(output.readiness),
        action: actionFor(output, output.readiness),
      });
    }
  }

  for (const file of files) {
    const output = recordOutputs.get(file.output_key);
    if (!output || !file.current) {
      continue;
    }
    rows.push({
      id: `file:${file.id}`,
      output,
      standardKey: null,
      standardLabelKey: null,
      standardCount: 0,
      readiness: null,
      file,
      status: fileStatus(file),
      action: 'file',
    });
  }
  return rows;
}

/** Rows that need something first ("Mangler", "Utkast", "Med mangler"), then the rest. */
function weight(row: ReportRow): number {
  return row.status.key === 'ready' ? 1 : row.status.key === 'new' ? 2 : 0;
}

/** The four groups (always all four, possibly empty), each sorted by `weight`. */
export function groupRows(rows: readonly ReportRow[]): ReportGroup[] {
  return RECIPIENTS.map((recipient) => ({
    recipient,
    rows: rows
      .filter((r) => recipientsOf(r.output.audience).includes(recipient))
      .map((row, index) => ({ row, index }))
      .sort((a, b) => weight(a.row) - weight(b.row) || a.index - b.index)
      .map((e) => e.row),
  }));
}

/** "ISO 27001" from "ISO 27001 – informasjonssikkerhet" (the reports scope's framework names). */
export function shortStandardLabel(label: string): string {
  const cut = label.indexOf(' – ');
  return cut > 0 ? label.slice(0, cut) : label;
}
