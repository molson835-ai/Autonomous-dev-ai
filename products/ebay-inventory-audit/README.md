# Listing & Stock Check (MVP)

A local-first CSV reconciliation utility for small marketplace sellers. It compares an active-listings export with a separate physical-inventory CSV and flags:

- Active listing SKUs with no matching inventory record
- Inventory SKUs with no matching active listing
- Quantity mismatches
- Blank SKUs, invalid quantities, and duplicate SKUs

## Run locally

From the repository root, start a local static server:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/products/ebay-inventory-audit/`.

Use **Download sample CSVs** to try the example. Replace the sample files with your own exports after confirming their columns.

## CSV format

Active listings: `SKU,Title,Quantity`

Physical inventory: `SKU,Title,Quantity,Location`

The parser recognizes eBay Active Listings report fields such as `Custom label` (the seller's SKU) and `Available quantity`, plus common aliases such as `Custom label (SKU)`, `Item title`, and `Bin`. eBay's report guide lists these active-listing columns: https://ir.ebaystatic.com/cr/v/c1/rsc/feeds/v1/guide-downloadable-reports.pdf. It does not yet guarantee compatibility with every current Seller Hub export variant. If a report uses different column labels, rename the header row to the required names before importing.

## Privacy and safety

- All parsing and comparison run in the browser.
- Files are not uploaded, stored, or sent to a server.
- The tool does not connect to eBay, require credentials, change listings, or modify inventory.
- Results are advisory. Review them before taking action.
- Use a complete active-listings export; a partial export can create false "stock not listed" flags.

## Input safeguards

- Each selected file is limited to 10 MB.
- Each CSV is limited to 100,000 data rows.
- Rows with missing or extra columns are rejected with a row-numbered message instead of being silently misread.
- The tool still processes data locally; these limits protect browser responsiveness on mobile devices.

## Current limitations

- CSV only; no XLS/XLSX parsing.
- No direct eBay API connection or live account verification.
- No automatic fee, profit, tax, or valuation calculations.
- No guarantee of exact header compatibility with all Seller Hub report templates.
- Not yet validated with real seller exports or paying users.

## Product hypothesis

A simpler, no-login, one-time-use reconciliation utility may serve small sellers who already work from CSV and spreadsheets but do not want a monthly inventory suite. This is a hypothesis, not proven willingness to pay. The next validation step is usability testing with consented sample data and confirmation that the tool catches useful discrepancies without false positives.
