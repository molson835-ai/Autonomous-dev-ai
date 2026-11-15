# Initial revenue opportunity screen — 12 November 2026

## Decision

Build a narrowly scoped, local-first **listing-to-stock CSV reconciliation utility** as a testable MVP. It compares a seller's active listing export with a separate stock CSV and flags missing SKU matches, quantity differences, duplicate SKUs, blank SKUs, and invalid quantities.

This is an experiment, not a validated business. No customer interviews, paid conversions, sales, or willingness-to-pay evidence have been obtained. EVE may independently conduct lawful, honest, platform-compliant customer discovery and outreach, publish accurate product information, and operate the business within the financial and safety policy in `docs/eve-earn-before-spend-policy.md`. She must not claim validation or revenue that has not occurred.

## Evidence and market signals

1. eBay documents Seller Hub Reports as a CSV/XLS workflow for downloading, managing, and auditing listings and inventory. Its official documentation explicitly describes reports as useful for record-keeping, auditing, and order fulfillment: https://www.ebay.com/sellercenter/listings/ebay-bulk-listing-tools. The Active Listings report guide lists `Custom label` and `Available quantity` as report columns, which the MVP now accepts: https://ir.ebaystatic.com/cr/v/c1/rsc/feeds/v1/guide-downloadable-reports.pdf
2. eBay's Seller Hub guidance positions Reports for sellers with roughly 250–1,000 items and notes that the workflow requires maintaining a separate spreadsheet. This supports technical compatibility with a local CSV utility, but does not prove that sellers want another tool: https://www.ebay.com/sellercenter/listings/listing-tools
3. A recent eBay Community discussion describes listings without SKUs, difficulty keeping supplier stock synchronized, and the manual effort of matching thousands of listings. One reply disclosed an affiliation with an inventory-software vendor, so treat the thread as anecdotal rather than independent validation: https://community.ebay.com/forum/seller-tools-57919/topic/how-do-you-keep-inventory-in-sync-when-half-your-listings-have-no-sku-485095/
4. Another seller described missing Custom Label/SKU values making it difficult to locate products in a stock system with 80+ boxes and more than 1,000 items. This is a single older anecdote, not evidence of prevalence: https://community.ebay.com/forum/seller-tools-57919/topic/my-listings-are-losing-their-skus-443680/
5. Competition and pricing are established: SellerAider lists monthly plans from $12.99 to $29.99: https://selleraider.com/pricing/ ; SixBit lists Home and Hobby at $29.99/month and Small Business at $49.99/month: https://www.sixbitsoftware.com/EN/Subscription_Levels.htm ; ProfitStamp lists a reseller profit tracker at a $24 launch price and $29 regular one-time price: https://www.profitstamp.com/pricing/
6. These competitors cover broader inventory, crosslisting, listing management, or profit tracking. A narrower, no-login local reconciliation utility could differentiate on privacy and simplicity, but that differentiation is only a hypothesis.

**Demand evidence remains weak.** The community threads show that at least some sellers discuss SKU and stock-synchronization pain, but they do not establish prevalence or willingness to pay. No verified seller interviews, customer-provided exports, search-volume measurements, conversions, or willingness-to-pay results exist. Treat this as a low-cost product experiment, not a proven market opportunity.

## Five candidate opportunities

Scores are preliminary judgment, not measured market size. Scale 1–5. For competitive pressure, 5 means lower competition / more room to differentiate. Total is the unweighted average of demand, competitive room, buildability, free-tier affordability, and path-to-delivery.

| Opportunity | Demand signal | Competitive room | Buildability | Free-tier affordability | Delivery path | Average |
|---|---:|---:|---:|---:|---:|---:|
| Listing-to-stock CSV reconciliation for small sellers | 3 | 3 | 5 | 5 | 4 | 4.0 |
| Multi-marketplace profit/inventory spreadsheet | 3 | 1 | 5 | 5 | 5 | 3.8 |
| Local website accessibility/performance audit report | 2 | 2 | 4 | 4 | 3 | 3.0 |
| Invoice/packing-slip to inventory CSV converter | 2 | 3 | 3 | 4 | 3 | 3.0 |
| AI listing title/description generator | 3 | 1 | 5 | 5 | 3 | 3.4 |

### Why this candidate

- It addresses a concrete seller workflow: reconciling listings with actual shelf stock.
- The official marketplace has CSV/XLS report workflows, so the MVP can avoid account credentials and paid APIs.
- It is technically feasible as a static browser tool; uploaded files stay local.
- Existing software is often a larger subscription product; a one-time lightweight utility may be easier to test.
- The evidence is anecdotal and competitors exist. A usable MVP is only the first step; willingness to pay remains unknown.

## MVP acceptance criteria

- Accept two CSV files without uploading them.
- Parse quoted CSV fields, escaped quotes, CRLF, and BOM.
- Match by SKU and compare integer quantities.
- Flag active listing without stock, stock without active listing, quantity mismatch, duplicate SKU, blank SKU, and invalid quantity.
- Export issue report as CSV.
- Explain that incomplete source exports can create false positives.
- Do not connect to eBay or modify listings.
- Tests cover parsing, matching, duplicate aggregation, blank identifiers, malformed data, and CSV export.

## Monetization hypothesis (not an offer)

If seller tests show clear value, test a one-time $9–$19 downloadable utility or a free tool with a paid batch/report feature. This is a proposed experiment only; no pricing has been validated. EVE may prepare and publish a truthful offer and configure a no-cost payment path only where there is no fee or charge before a successful sale. Any payment processor fee, subscription, paid feature, purchase, or financial commitment requires prior owner approval and may be funded only from cleared EVE business revenue.

## Validation plan

1. Run the sample CSV test and automated unit tests.
2. Research current seller workflows, competing products, and pricing from multiple independent sources; save source URLs, dates, evidence, uncertainty, and findings.
3. Conduct respectful, relevant, platform-compliant customer discovery and outreach. Use truthful descriptions, honor opt-outs, avoid bulk spam, and request consent before handling customer data.
4. Measure import success, false-positive rate, time saved, and whether sellers would pay at a stated price. Distinguish stated interest from actual paid conversions.
5. Stop or redesign if exports are too inconsistent or the tool does not catch actionable issues.
6. Iterate, sell, and fulfill within the free-only operating boundary. Ask the owner before any expense or financial commitment.

## Current blockers

- No verified seller willingness to pay.
- No verified seller interviews or customer-provided exports yet.
- No payment processor configured; do not enable one that can incur fees or charges without approval.
- CSV formats need validation against real, consented Seller Hub exports.
- Product publication and ordinary compliant outreach are within EVE's delegated mission; spending and paid commitments are not.
