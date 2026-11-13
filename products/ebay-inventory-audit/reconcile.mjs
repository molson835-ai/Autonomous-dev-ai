const HEADER_ALIASES = Object.freeze({
  sku: ["sku", "seller sku", "custom label", "custom label sku", "custom label (sku)"],
  title: ["title", "item title", "product title", "listing title"],
  quantity: ["quantity", "qty", "available quantity", "quantity available", "available qty"],
  location: ["location", "storage location", "bin", "bin location"]
});

function normalizeHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseCsv(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("The CSV file is empty.");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      row.push(cell); cell = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      if (char === "\r" && text[i + 1] === "\n") i += 1;
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one data row.");

  const headers = rows[0].map(normalizeHeader);
  if (headers.some(header => !header)) throw new Error("Every CSV column needs a header.");
  if (new Set(headers).size !== headers.length) throw new Error("The CSV has duplicate column headers.");
  return rows.slice(1).map((values, index) => {
    const record = { _row: index + 2 };
    headers.forEach((header, column) => { record[header] = String(values[column] ?? "").trim(); });
    return record;
  });
}

function findField(row, field) {
  for (const alias of HEADER_ALIASES[field]) {
    const key = normalizeHeader(alias);
    if (Object.hasOwn(row, key)) return row[key];
  }
  return "";
}

function dataset(csv, kind) {
  const parsed = parseCsv(csv);
  const rows = parsed.map(row => {
    const rawQuantity = findField(row, "quantity");
    const quantity = rawQuantity === "" ? NaN : Number(rawQuantity);
    return {
      row: row._row,
      sku: findField(row, "sku").trim(),
      title: findField(row, "title").trim(),
      quantity,
      location: kind === "inventory" ? findField(row, "location").trim() : ""
    };
  });
  if (!parsed.some(row => Object.keys(row).some(key => HEADER_ALIASES.sku.includes(key)))) {
    throw new Error("Missing SKU column. Use SKU or Custom label.");
  }
  if (!parsed.some(row => Object.keys(row).some(key => HEADER_ALIASES.quantity.includes(key)))) {
    throw new Error("Missing quantity column. Use Quantity or Available quantity.");
  }
  return rows;
}

function groupBySku(rows, kind, issues) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.sku) {
      issues.push({
        type: kind === "active" ? "listing-missing-sku" : "inventory-missing-sku",
        severity: "warning", sku: "", title: row.title,
        activeQuantity: kind === "active" ? row.quantity : "",
        stockQuantity: kind === "inventory" ? row.quantity : "",
        location: row.location, rows: String(row.row),
        details: `Row ${row.row} has no SKU and cannot be matched safely.`
      });
      continue;
    }
    if (!Number.isInteger(row.quantity) || row.quantity < 0) {
      issues.push({
        type: kind === "active" ? "invalid-listing-quantity" : "invalid-inventory-quantity",
        severity: "warning", sku: row.sku, title: row.title,
        activeQuantity: kind === "active" ? row.quantity : "",
        stockQuantity: kind === "inventory" ? row.quantity : "",
        location: row.location, rows: String(row.row),
        details: `Row ${row.row} has a missing, negative, or non-integer quantity.`
      });
      continue;
    }
    const group = groups.get(row.sku) ?? { sku: row.sku, title: row.title, quantity: 0, count: 0, locations: new Set(), rowNumbers: [] };
    group.quantity += row.quantity;
    group.count += 1;
    group.rowNumbers.push(row.row);
    if (!group.title && row.title) group.title = row.title;
    if (row.location) group.locations.add(row.location);
    groups.set(row.sku, group);
  }
  for (const group of groups.values()) {
    if (group.count > 1) {
      issues.push({
        type: kind === "active" ? "duplicate-listing-sku" : "duplicate-inventory-sku",
        severity: "warning", sku: group.sku, title: group.title,
        activeQuantity: kind === "active" ? group.quantity : "",
        stockQuantity: kind === "inventory" ? group.quantity : "",
        location: [...group.locations].join("; "), rows: group.rowNumbers.join("; "),
        details: `SKU appears on ${group.count} rows; quantities were summed for comparison.`
      });
    }
  }
  return groups;
}

export function reconcileCsv(activeCsv, inventoryCsv) {
  const activeRows = dataset(activeCsv, "active");
  const inventoryRows = dataset(inventoryCsv, "inventory");
  const issues = [];
  const active = groupBySku(activeRows, "active", issues);
  const inventory = groupBySku(inventoryRows, "inventory", issues);

  for (const [sku, listing] of active) {
    const stock = inventory.get(sku);
    if (!stock) {
      issues.push({
        type: "active-listing-without-stock", severity: "error", sku, title: listing.title,
        activeQuantity: listing.quantity, stockQuantity: "", location: "",
        details: "An active listing has no matching SKU in the inventory file."
      });
    } else if (listing.quantity !== stock.quantity) {
      issues.push({
        type: "quantity-mismatch", severity: "error", sku, title: listing.title || stock.title,
        activeQuantity: listing.quantity, stockQuantity: stock.quantity,
        location: [...stock.locations].join("; "),
        details: "The active listing quantity differs from the recorded physical stock."
      });
    }
  }
  for (const [sku, stock] of inventory) {
    if (!active.has(sku)) {
      issues.push({
        type: "stock-not-listed", severity: "warning", sku, title: stock.title,
        activeQuantity: "", stockQuantity: stock.quantity,
        location: [...stock.locations].join("; "),
        details: "Inventory exists but no matching active listing was found in the supplied file."
      });
    }
  }

  const errors = issues.filter(issue => issue.severity === "error").length;
  const warnings = issues.filter(issue => issue.severity === "warning").length;
  return {
    summary: {
      activeRows: activeRows.length,
      inventoryRows: inventoryRows.length,
      activeSkus: active.size,
      inventorySkus: inventory.size,
      errors,
      warnings,
      matchedSkus: [...active.keys()].filter(sku => inventory.has(sku)).length
    },
    issues: issues.sort((a, b) => a.severity.localeCompare(b.severity) || a.sku.localeCompare(b.sku) || a.type.localeCompare(b.type))
  };
}

export function issuesToCsv(issues) {
  const headers = ["severity", "issue", "sku", "title", "active_quantity", "stock_quantity", "location", "source_rows", "details"];
  const quote = value => {
    const raw = String(value ?? "");
    // Prevent spreadsheet formula execution when users open exported issue reports.
    const text = /^[\\t\\r\\n ]*[=+\\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...issues.map(issue => [
    issue.severity, issue.type, issue.sku, issue.title, issue.activeQuantity,
    issue.stockQuantity, issue.location, issue.rows, issue.details
  ])].map(row => row.map(quote).join(",")).join("\r\n");
}
