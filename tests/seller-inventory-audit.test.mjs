import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, reconcileCsv, issuesToCsv } from "../products/ebay-inventory-audit/reconcile.mjs";

test("parses quoted commas, escaped quotes, BOM, and Windows newlines", () => {
  const rows = parseCsv('\uFEFFSKU,Title,Quantity\r\nA-1,"Lantern, large",2\r\nB-2,"A ""quoted"" item",1\r\n');
  assert.equal(rows[0].title, "Lantern, large");
  assert.equal(rows[1].title, 'A "quoted" item');
  assert.equal(rows[1].quantity, "1");
});

test("matches SKUs, sums duplicate rows, and reports inventory discrepancies", () => {
  const active = [
    "SKU,Title,Quantity",
    "A-1,Lantern,3",
    "B-2,Tote,2",
    "B-2,Tote duplicate row,1",
    "C-3,Bottle,1"
  ].join("\n");
  const inventory = [
    "SKU,Title,Quantity,Location",
    "A-1,Lantern,2,Bin A",
    "B-2,Tote,3,Bin B",
    "D-4,Gloves,4,Bin D"
  ].join("\n");
  const result = reconcileCsv(active, inventory);
  assert.equal(result.summary.activeSkus, 3);
  assert.equal(result.summary.inventorySkus, 3);
  assert.equal(result.summary.matchedSkus, 2);
  assert.ok(result.issues.some(issue => issue.type === "quantity-mismatch" && issue.sku === "A-1"));
  assert.ok(result.issues.some(issue => issue.type === "active-listing-without-stock" && issue.sku === "C-3"));
  assert.ok(result.issues.some(issue => issue.type === "stock-not-listed" && issue.sku === "D-4"));
  assert.ok(result.issues.some(issue => issue.type === "duplicate-listing-sku" && issue.sku === "B-2"));
  assert.equal(result.issues.find(issue => issue.type === "duplicate-listing-sku").activeQuantity, 3);
});

test("flags blank SKUs and invalid quantities without silently matching them", () => {
  const active = "SKU,Title,Quantity\n,Unknown SKU,1\nBAD,Invalid quantity,-1\n";
  const inventory = "SKU,Title,Quantity,Location\n,Unidentified stock,2,A1\nBAD,Invalid stock,-1,A2\n";
  const result = reconcileCsv(active, inventory);
  assert.ok(result.issues.some(issue => issue.type === "listing-missing-sku"));
  assert.ok(result.issues.some(issue => issue.type === "inventory-missing-sku"));
  assert.ok(result.issues.some(issue => issue.type === "invalid-listing-quantity"));
  assert.ok(result.issues.some(issue => issue.type === "invalid-inventory-quantity"));
});

test("accepts common Seller Hub header aliases", () => {
  const active = "Custom label (SKU),Item title,Available quantity\nX-1,Widget,4";
  const inventory = "Seller SKU,Product title,Qty,Bin\nX-1,Widget,4,Top shelf";
  const result = reconcileCsv(active, inventory);
  assert.equal(result.summary.matchedSkus, 1);
  assert.equal(result.issues.length, 0);
});

test("accepts the official eBay Active Listings report header names", () => {
  const active = "Item number,Title,Variation,Custom label,Available quantity\n123456789012,Widget,,SKU-42,4";
  const inventory = "SKU,Title,Quantity,Location\nSKU-42,Widget,4,Shelf A";
  const result = reconcileCsv(active, inventory);
  assert.equal(result.summary.matchedSkus, 1);
  assert.equal(result.issues.length, 0);
});

test("rejects empty, malformed, or missing required columns", () => {
  assert.throws(() => parseCsv(""), /empty/);
  assert.throws(() => parseCsv('SKU,Title\nA-1,"unclosed'), /unclosed quoted/);
  assert.throws(() => reconcileCsv("Title,Quantity\nItem,1", "SKU,Quantity\nA,1"), /Missing SKU/);
  assert.throws(() => reconcileCsv("SKU,Title\nA,Item", "SKU,Quantity\nA,1"), /Missing quantity/);
});

test("exports issue reports with safe CSV escaping", () => {
  const csv = issuesToCsv([{
    severity: "error", type: "quantity-mismatch", sku: "A-1",
    title: 'Lantern, "large"', activeQuantity: 3, stockQuantity: 2,
    location: "Bin A", details: "Review, then correct"
  }]);
  assert.match(csv, /"Lantern, ""large"""/);
  assert.match(csv, /"Review, then correct"/);
});

test("neutralizes spreadsheet formulas in untrusted exported text fields", () => {
  const csv = issuesToCsv([{
    severity: "warning", type: "data-quality", sku: "=HYPERLINK(\"https://bad.example\",\"click\")",
    title: "  +SUM(1,1)", activeQuantity: 0, stockQuantity: 0,
    location: "@cmd", details: "-1+2"
  }]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"'  \+SUM/);
  assert.match(csv, /'@cmd/);
  assert.match(csv, /'-1\+2/);
});
