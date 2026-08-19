/**
 * Parses a KDP royalty report export (CSV). Plain TypeScript with no
 * Node-only APIs — this file is imported directly by both the CLI
 * (agents/analyst/index.ts) and the dashboard's Vite bundle
 * (KdpReportUpload.tsx), so the same logic backs both the `npm run
 * analyst` path and the in-browser preview. Only the CLI's file-read
 * wrapper touches fs.
 *
 * KDP's own column names vary by report type and have shifted over the
 * years (e.g. "ASIN" vs "ASIN/ISBN", "Royalty Date" vs "Date"), so
 * columns are matched by normalized header name rather than position.
 */

export interface KdpReportRow {
  asin: string;
  marketplace: string;
  unitsSold: number;
  royalty: number;
  currency: string;
  royaltyDate: string | null;
}

/** One ASIN's totals in one currency — an ASIN sold across marketplaces can span more than one currency, and those totals are never merged together. */
export interface AsinCurrencyAggregate {
  asin: string;
  currency: string;
  unitsSold: number;
  royaltyTotal: number;
}

export interface KdpReportParseResult {
  aggregates: AsinCurrencyAggregate[];
  /** Report-wide totals per currency — summed only within a currency, matching Ledger's fleet aggregation rule. */
  totalsByCurrency: Record<string, { unitsSold: number; royaltyTotal: number }>;
  /** Latest parseable royalty date in the report, as an ISO timestamp. Null if no row had a parseable date. */
  reportPeriodEnd: string | null;
  /** Rows dropped for missing/unparseable required fields (ASIN, units, royalty, or currency) — never silently merged into a "0" bucket. */
  skippedRowCount: number;
  totalRowCount: number;
}

/** Lowercases and strips everything but letters/digits, so "ASIN/ISBN", "Asin (ISBN)", and "asin" all match the same candidate. */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Minimal RFC 4180 CSV line splitter — handles quoted fields containing commas or escaped quotes ("" inside a quoted field). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsvRows(csvText: string): string[][] {
  return csvText
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .map(parseCsvLine);
}

/** Rounds a running money total to the nearest cent, so summing many rows (e.g. 29.90 + 14.95) never drifts into float noise like 44.849999999999994. */
function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Strips stray currency symbols/thousands separators a spreadsheet export sometimes leaves in a numeric cell. */
function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Best-effort date parse for KDP's various "Royalty Date" formats (MM/DD/YYYY, YYYY-MM-DD, etc). Returns an ISO timestamp or null. */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const ASIN_HEADERS = ["asin", "asinisbn", "asinorisbn"];
const MARKETPLACE_HEADERS = ["marketplace"];
const NET_UNITS_HEADERS = ["netunitssold", "netunits"];
const UNITS_HEADERS = ["unitssold", "units"];
const ROYALTY_HEADERS = ["royalty", "royaltyamount", "estimatedroyalty"];
const CURRENCY_HEADERS = ["currency", "royaltycurrency", "currencytype"];
const DATE_HEADERS = ["royaltydate", "date", "transactiondate", "salesperiodenddate"];

export function parseKdpReportCsv(csvText: string): KdpReportParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return { aggregates: [], totalsByCurrency: {}, reportPeriodEnd: null, skippedRowCount: 0, totalRowCount: 0 };
  }

  const headers = rows[0]!;
  const asinCol = findColumn(headers, ASIN_HEADERS);
  const marketplaceCol = findColumn(headers, MARKETPLACE_HEADERS);
  const netUnitsCol = findColumn(headers, NET_UNITS_HEADERS);
  const unitsCol = netUnitsCol !== -1 ? netUnitsCol : findColumn(headers, UNITS_HEADERS);
  const royaltyCol = findColumn(headers, ROYALTY_HEADERS);
  const currencyCol = findColumn(headers, CURRENCY_HEADERS);
  const dateCol = findColumn(headers, DATE_HEADERS);

  if (asinCol === -1 || unitsCol === -1 || royaltyCol === -1 || currencyCol === -1) {
    throw new Error(
      "KDP report is missing one or more required columns (ASIN, Units Sold/Net Units Sold, Royalty, Currency) — check the export's header row."
    );
  }

  const parsedRows: KdpReportRow[] = [];
  let skippedRowCount = 0;

  for (const cells of rows.slice(1)) {
    const asin = cells[asinCol]?.trim();
    const units = cells[unitsCol] !== undefined ? parseNumber(cells[unitsCol]!) : null;
    const royalty = cells[royaltyCol] !== undefined ? parseNumber(cells[royaltyCol]!) : null;
    const currency = cells[currencyCol]?.trim();

    if (!asin || units === null || royalty === null || !currency) {
      skippedRowCount += 1;
      continue;
    }

    parsedRows.push({
      asin,
      marketplace: marketplaceCol !== -1 ? (cells[marketplaceCol]?.trim() ?? "") : "",
      unitsSold: units,
      royalty,
      currency,
      royaltyDate: dateCol !== -1 && cells[dateCol] !== undefined ? parseDate(cells[dateCol]!) : null,
    });
  }

  const byAsinCurrency = new Map<string, AsinCurrencyAggregate>();
  const totalsByCurrency: Record<string, { unitsSold: number; royaltyTotal: number }> = {};
  let latestDate: string | null = null;

  for (const row of parsedRows) {
    const key = `${row.asin}::${row.currency}`;
    const existing = byAsinCurrency.get(key);
    if (existing) {
      existing.unitsSold += row.unitsSold;
      existing.royaltyTotal = roundCents(existing.royaltyTotal + row.royalty);
    } else {
      byAsinCurrency.set(key, { asin: row.asin, currency: row.currency, unitsSold: row.unitsSold, royaltyTotal: row.royalty });
    }

    const currencyTotal = totalsByCurrency[row.currency] ?? { unitsSold: 0, royaltyTotal: 0 };
    currencyTotal.unitsSold += row.unitsSold;
    currencyTotal.royaltyTotal = roundCents(currencyTotal.royaltyTotal + row.royalty);
    totalsByCurrency[row.currency] = currencyTotal;

    if (row.royaltyDate && (!latestDate || row.royaltyDate > latestDate)) {
      latestDate = row.royaltyDate;
    }
  }

  return {
    aggregates: [...byAsinCurrency.values()],
    totalsByCurrency,
    reportPeriodEnd: latestDate,
    skippedRowCount,
    totalRowCount: rows.length - 1,
  };
}
