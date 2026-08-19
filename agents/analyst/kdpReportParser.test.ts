import { describe, expect, it } from "vitest";
import { parseKdpReportCsv } from "./kdpReportParser.ts";

describe("parseKdpReportCsv", () => {
  it("aggregates units and royalty per ASIN from a typical KDP export", () => {
    const csv = [
      "Title,Author Name,ASIN,Marketplace,Royalty Date,Net Units Sold,Currency,Royalty",
      'Cozy Cottages,Author,B0COZY1234,Amazon.com,07/15/2026,10,USD,29.90',
      'Cozy Cottages,Author,B0COZY1234,Amazon.com,07/20/2026,5,USD,14.95',
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.aggregates).toEqual([{ asin: "B0COZY1234", currency: "USD", unitsSold: 15, royaltyTotal: 44.85 }]);
    expect(result.totalsByCurrency).toEqual({ USD: { unitsSold: 15, royaltyTotal: 44.85 } });
    expect(result.skippedRowCount).toBe(0);
    expect(result.totalRowCount).toBe(2);
  });

  it("tolerates minor header variations (ASIN/ISBN, Units Sold instead of Net Units Sold, different casing/order)", () => {
    const csv = [
      "royalty,asin/isbn,units sold,currency",
      "9.99,B0VARIANT99,3,GBP",
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.aggregates).toEqual([{ asin: "B0VARIANT99", currency: "GBP", unitsSold: 3, royaltyTotal: 9.99 }]);
  });

  it("prefers Net Units Sold over Units Sold when both columns are present", () => {
    const csv = [
      "ASIN,Units Sold,Net Units Sold,Currency,Royalty",
      "B0NETUNITS,10,7,USD,20.00",
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.aggregates[0]?.unitsSold).toBe(7);
  });

  it("keeps totals split by currency instead of summing across currencies", () => {
    const csv = [
      "ASIN,Currency,Net Units Sold,Royalty",
      "B0MULTI001,USD,10,30.00",
      "B0MULTI001,GBP,4,9.60",
      "B0OTHER002,USD,2,5.00",
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.totalsByCurrency).toEqual({
      USD: { unitsSold: 12, royaltyTotal: 35.0 },
      GBP: { unitsSold: 4, royaltyTotal: 9.6 },
    });
    // Same ASIN, two currencies -> two separate aggregate entries, never merged.
    const multiCurrencyEntries = result.aggregates.filter((a) => a.asin === "B0MULTI001");
    expect(multiCurrencyEntries).toHaveLength(2);
    expect(multiCurrencyEntries.map((a) => a.currency).sort()).toEqual(["GBP", "USD"]);
  });

  it("skips rows missing a required field instead of silently zeroing them out", () => {
    const csv = [
      "ASIN,Currency,Net Units Sold,Royalty",
      "B0GOOD0001,USD,5,15.00",
      ",USD,3,9.00",
      "B0BADNUM01,USD,not-a-number,9.00",
      "B0NOCURR01,,3,9.00",
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.aggregates).toEqual([{ asin: "B0GOOD0001", currency: "USD", unitsSold: 5, royaltyTotal: 15 }]);
    expect(result.skippedRowCount).toBe(3);
    expect(result.totalRowCount).toBe(4);
  });

  it("handles quoted fields containing commas", () => {
    const csv = [
      "Title,ASIN,Currency,Net Units Sold,Royalty",
      '"Cozy, Cabins & Cottages",B0QUOTED01,USD,1,2.99',
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.aggregates).toEqual([{ asin: "B0QUOTED01", currency: "USD", unitsSold: 1, royaltyTotal: 2.99 }]);
  });

  it("computes reportPeriodEnd as the latest parseable royalty date", () => {
    const csv = [
      "ASIN,Currency,Net Units Sold,Royalty,Royalty Date",
      "B0DATE0001,USD,1,1.00,07/01/2026",
      "B0DATE0001,USD,1,1.00,07/20/2026",
      "B0DATE0001,USD,1,1.00,07/10/2026",
    ].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.reportPeriodEnd).toBe(new Date("07/20/2026").toISOString());
  });

  it("reports reportPeriodEnd as null when no row has a parseable date", () => {
    const csv = ["ASIN,Currency,Net Units Sold,Royalty", "B0NODATE01,USD,1,1.00"].join("\n");

    const result = parseKdpReportCsv(csv);

    expect(result.reportPeriodEnd).toBeNull();
  });

  it("throws a clear error when required columns are entirely missing", () => {
    const csv = ["Title,Author", "Some Book,Someone"].join("\n");

    expect(() => parseKdpReportCsv(csv)).toThrow(/missing one or more required columns/);
  });

  it("returns an empty result for an empty file instead of throwing", () => {
    const result = parseKdpReportCsv("");
    expect(result.aggregates).toEqual([]);
    expect(result.totalRowCount).toBe(0);
  });
});
