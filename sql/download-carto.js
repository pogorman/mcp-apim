/**
 * Downloads Philadelphia public datasets from the Carto API and saves as CSV.
 *
 * The Carto SQL API is public (no auth required) and serves live, daily-updated data.
 * This script uses the same pagination pattern as the PhillyStat Jupyter notebooks:
 *   1. Query min/max cartodb_id to get the ID range
 *   2. Paginate with WHERE cartodb_id BETWEEN <start> AND <start + batchSize>
 *   3. Write each batch to a CSV file
 *
 * Usage:
 *   node sql/download-carto.js                    # Download all configured tables
 *   node sql/download-carto.js rtt_summary        # Download a specific table
 *
 * Output: data/<tablename>.csv (one file per table)
 *
 * Reference: https://phl.carto.com/api/v2/sql
 * Explorer: https://cityofphiladelphia.github.io/carto-api-explorer/
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const CARTO_BASE = "https://phl.carto.com/api/v2/sql?q=";
const DATA_DIR = path.join(__dirname, "..", "data");
const BATCH_SIZE = 50000;
const DELAY_MS = 200; // courtesy delay between requests

// ============================================================
// Table definitions: which columns to download from each table
// ============================================================
const TABLES = {
  rtt_summary: {
    cartoTable: "rtt_summary",
    columns: [
      "cartodb_id", "objectid", "document_id", "document_type", "display_date",
      "street_address", "zip_code", "ward", "grantors", "grantees",
      "cash_consideration", "other_consideration", "total_consideration",
      "assessed_value", "common_level_ratio", "fair_market_value",
      "state_tax_amount", "state_tax_percent", "local_tax_amount", "local_tax_percent",
      "receipt_num", "receipt_date", "recording_date", "document_date",
      "condo_name", "unit_num", "opa_account_num", "legal_remarks",
      "discrepancy", "property_count", "record_id",
    ],
  },
  // Future: add violations, permits, etc. here
};

// ============================================================
// HTTP helpers
// ============================================================

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const doRequest = (attemptUrl, retries) => {
      https.get(attemptUrl, { timeout: 60000 }, (res) => {
        if (res.statusCode === 429 && retries > 0) {
          // Rate limited — wait and retry
          const wait = 5000 + Math.random() * 5000;
          console.log(`\n    Rate limited (429), waiting ${Math.round(wait / 1000)}s...`);
          setTimeout(() => doRequest(attemptUrl, retries - 1), wait);
          return;
        }
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`)));
          return;
        }
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      }).on("error", (e) => {
        if (retries > 0) {
          console.log(`\n    Network error (${e.message}), retrying...`);
          setTimeout(() => doRequest(attemptUrl, retries - 1), 3000);
        } else {
          reject(e);
        }
      });
    };
    doRequest(url, 3);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * CSV-escape a single field value.
 * Wraps in quotes if value contains comma, quote, or newline.
 */
function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ============================================================
// Main download logic
// ============================================================

async function downloadTable(name, config) {
  const { cartoTable, columns } = config;
  const outputPath = path.join(DATA_DIR, `${name}.csv`);
  const colList = columns.join(",");

  console.log(`\n=== Downloading ${cartoTable} ===`);

  // Step 1: Get ID range and total count
  const rangeSQL = encodeURIComponent(
    `SELECT min(cartodb_id) AS min_id, max(cartodb_id) AS max_id, count(*) AS cnt FROM ${cartoTable}`
  );
  const rangeData = await fetchJSON(`${CARTO_BASE}${rangeSQL}`);
  const { min_id, max_id, cnt } = rangeData.rows[0];
  console.log(`  Rows: ${cnt.toLocaleString()}, ID range: ${min_id}..${max_id}`);

  // Step 2: Create output file with CSV header
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const ws = fs.createWriteStream(outputPath);
  ws.write(columns.join(",") + "\n");

  // Step 3: Paginate through ID range
  let currentID = min_id;
  let totalRows = 0;
  const startTime = Date.now();

  while (currentID <= max_id) {
    const endID = currentID + BATCH_SIZE - 1;
    const batchSQL = encodeURIComponent(
      `SELECT ${colList} FROM ${cartoTable} WHERE cartodb_id BETWEEN ${currentID} AND ${endID}`
    );
    const data = await fetchJSON(`${CARTO_BASE}${batchSQL}`);

    if (data.rows && data.rows.length > 0) {
      for (const row of data.rows) {
        // Write values in the same order as our column list
        const line = columns.map((col) => csvEscape(row[col])).join(",");
        ws.write(line + "\n");
      }
      totalRows += data.rows.length;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? Math.round(totalRows / elapsed) : 0;
    const batchNum = Math.floor((currentID - min_id) / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil((max_id - min_id + 1) / BATCH_SIZE);
    process.stdout.write(
      `\r  ${totalRows.toLocaleString()} rows (batch ${batchNum}/${totalBatches}, ${rate.toLocaleString()}/sec)  `
    );

    currentID = endID + 1;
    await sleep(DELAY_MS);
  }

  ws.end();
  const elapsed = (Date.now() - startTime) / 1000;
  const fileSize = fs.statSync(outputPath).size;
  console.log(
    `\n  Done: ${totalRows.toLocaleString()} rows in ${elapsed.toFixed(0)}s -> ${outputPath} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`
  );
}

async function main() {
  const requestedTable = process.argv[2];

  console.log("=== Carto API Downloader ===");
  console.log(`Source: ${CARTO_BASE}`);
  console.log(`Output: ${DATA_DIR}/`);

  if (requestedTable) {
    if (!TABLES[requestedTable]) {
      console.error(`Unknown table: ${requestedTable}`);
      console.error(`Available: ${Object.keys(TABLES).join(", ")}`);
      process.exit(1);
    }
    await downloadTable(requestedTable, TABLES[requestedTable]);
  } else {
    for (const [name, config] of Object.entries(TABLES)) {
      await downloadTable(name, config);
    }
  }

  console.log("\n=== All downloads complete ===");
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
