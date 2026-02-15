/**
 * Load CSV data into Azure SQL using batched INSERT statements.
 * More reliable than TDS bulk copy with Azure SQL Serverless.
 * Run: cd functions && node ../sql/bulk_load.js
 */
const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const SERVER = "philly-stats-sql-01.database.windows.net";
const DATABASE = "phillystats";
const DATA_DIR = path.join(__dirname, "..", "data");
const ROWS_PER_INSERT = 500; // rows per INSERT statement (SQL Server max 1000)
const MAX_RETRIES = 5;
const CONCURRENT_INSERTS = 4; // parallel INSERT connections

// Table definitions with column mappings
// Each column: [csvIndex (0-based), dbColName, sqlType, nullable]
const TABLES = [
  {
    csv: "dbo.philly_demolitions.csv",
    table: "demolitions",
    columns: [
      [20, "objectid", sql.Int, false],
      [0, "address", sql.NVarChar(200), true],
      [1, "addressobjectid", sql.VarChar(20), true],
      [2, "applicantname", sql.NVarChar(200), true],
      [3, "applicanttype", sql.VarChar(50), true],
      [4, "cartodb_id", sql.Int, true],
      [5, "caseorpermitnumber", sql.VarChar(30), true],
      [6, "censustract", sql.VarChar(20), true],
      [7, "city_demo", sql.VarChar(5), true],
      [8, "completed_date", sql.VarChar(50), true],
      [9, "contractoraddress1", sql.NVarChar(200), true],
      [10, "contractoraddress2", sql.NVarChar(200), true],
      [11, "contractorcity", sql.NVarChar(100), true],
      [12, "contractorname", sql.NVarChar(200), true],
      [13, "contractorstate", sql.VarChar(10), true],
      [14, "contractortype", sql.VarChar(20), true],
      [15, "contractorzip", sql.VarChar(20), true],
      [16, "council_district", sql.VarChar(10), true],
      [17, "geocode_x", sql.Float, true],
      [18, "geocode_y", sql.Float, true],
      [19, "mostrecentinsp", sql.VarChar(50), true],
      [21, "opa_account_num", sql.VarChar(20), true],
      [22, "opa_owner", sql.NVarChar(200), true],
      [23, "parcel_id_num", sql.VarChar(20), true],
      [24, "posse_jobid", sql.VarChar(20), true],
      [25, "record_type", sql.VarChar(30), true],
      [26, "start_date", sql.VarChar(50), true],
      [27, "status", sql.VarChar(50), true],
      [28, "systemofrecord", sql.VarChar(20), true],
      [31, "typeofwork", sql.VarChar(30), true],
      [32, "typeofworkdescription", sql.NVarChar(100), true],
      [33, "unit_num", sql.VarChar(20), true],
      [34, "unit_type", sql.VarChar(20), true],
      [35, "zip", sql.VarChar(20), true],
    ],
  },
  {
    csv: "dbo.philly_appeals.csv",
    table: "appeals",
    columns: [
      [5, "appealnumber", sql.VarChar(30), true],
      [0, "acceleratedappeal", sql.VarChar(30), true],
      [1, "address", sql.NVarChar(200), true],
      [2, "addressobjectid", sql.VarChar(20), true],
      [3, "agendadescription", sql.NVarChar(4000), true],
      [4, "appealgrounds", sql.NVarChar(4000), true],
      [6, "appealstatus", sql.VarChar(20), true],
      [7, "appealtype", sql.NVarChar(100), true],
      [8, "appellanttype", sql.VarChar(30), true],
      [9, "applicationtype", sql.NVarChar(100), true],
      [10, "cartodb_id", sql.Int, true],
      [11, "censustract", sql.VarChar(20), true],
      [12, "completeddate", sql.VarChar(50), true],
      [13, "council_district", sql.VarChar(5), true],
      [14, "createddate", sql.VarChar(50), true],
      [15, "decision", sql.NVarChar(50), true],
      [16, "decisiondate", sql.VarChar(50), true],
      [17, "geocode_x", sql.Float, true],
      [18, "geocode_y", sql.Float, true],
      [19, "internaljobid", sql.VarChar(20), true],
      [20, "meetingnumber", sql.VarChar(30), true],
      [21, "meetingresult", sql.NVarChar(50), true],
      [22, "objectid", sql.Int, false],
      [23, "opa_account_num", sql.VarChar(20), true],
      [24, "opa_owner", sql.NVarChar(200), true],
      [25, "parcel_id_num", sql.VarChar(20), true],
      [26, "posse_jobid", sql.VarChar(20), true],
      [27, "primaryappellant", sql.NVarChar(200), true],
      [28, "proviso", sql.NVarChar(4000), true],
      [29, "relatedcasefile", sql.VarChar(30), true],
      [30, "relatedpermit", sql.VarChar(30), true],
      [31, "scheduleddate", sql.VarChar(50), true],
      [32, "systemofrecord", sql.VarChar(20), true],
      [35, "unit_num", sql.VarChar(20), true],
      [36, "unit_type", sql.VarChar(20), true],
      [37, "zip", sql.VarChar(20), true],
    ],
  },
  {
    csv: "dbo.philly_business_licenses.csv",
    table: "business_licenses",
    columns: [
      [17, "licensenum", sql.VarChar(20), true],
      [0, "address", sql.NVarChar(200), true],
      [1, "addressed_license", sql.VarChar(10), true],
      [2, "addressobjectid", sql.VarChar(20), true],
      [3, "business_mailing_address", sql.NVarChar(500), true],
      [4, "business_name", sql.NVarChar(300), true],
      [5, "cartodb_id", sql.Int, true],
      [6, "censustract", sql.VarChar(20), true],
      [7, "council_district", sql.VarChar(5), true],
      [8, "expirationdate", sql.VarChar(50), true],
      [9, "geocode_x", sql.Float, true],
      [10, "geocode_y", sql.Float, true],
      [11, "inactivedate", sql.VarChar(50), true],
      [12, "initialissuedate", sql.VarChar(50), true],
      [13, "legalentitytype", sql.VarChar(20), true],
      [14, "legalfirstname", sql.NVarChar(100), true],
      [15, "legallastname", sql.NVarChar(100), true],
      [16, "legalname", sql.NVarChar(300), true],
      [18, "licensestatus", sql.VarChar(20), true],
      [19, "licensetype", sql.NVarChar(100), true],
      [20, "mostrecentissuedate", sql.VarChar(50), true],
      [21, "numberofunits", sql.Int, true],
      [22, "objectid", sql.Int, false],
      [23, "opa_account_num", sql.VarChar(20), true],
      [24, "opa_owner", sql.NVarChar(200), true],
      [25, "ownercontact1city", sql.NVarChar(100), true],
      [26, "ownercontact1mailingaddress", sql.NVarChar(500), true],
      [27, "ownercontact1name", sql.NVarChar(200), true],
      [28, "ownercontact1state", sql.VarChar(10), true],
      [29, "ownercontact1zippostalcode", sql.VarChar(20), true],
      [30, "ownercontact2city", sql.NVarChar(100), true],
      [31, "ownercontact2mailingaddress", sql.NVarChar(500), true],
      [32, "ownercontact2name", sql.NVarChar(200), true],
      [33, "ownercontact2state", sql.VarChar(10), true],
      [34, "ownercontact2zippostalcode", sql.VarChar(20), true],
      [35, "owneroccupied", sql.VarChar(10), true],
      [36, "parcel_id_num", sql.VarChar(20), true],
      [37, "posse_jobid", sql.VarChar(20), true],
      [38, "rentalcategory", sql.NVarChar(50), true],
      [39, "revenuecode", sql.VarChar(10), true],
      [42, "unit_num", sql.VarChar(20), true],
      [43, "unit_type", sql.VarChar(20), true],
      [44, "zip", sql.VarChar(20), true],
    ],
  },
  {
    csv: "dbo.philly_com_act_licenses.csv",
    table: "commercial_activity_licenses",
    columns: [
      [6, "licensenum", sql.VarChar(20), true],
      [0, "cartodb_id", sql.Int, true],
      [1, "companyname", sql.NVarChar(300), true],
      [2, "issuedate", sql.VarChar(50), true],
      [3, "legalentitytype", sql.VarChar(20), true],
      [4, "legalfirstname", sql.NVarChar(100), true],
      [5, "legallastname", sql.NVarChar(100), true],
      [7, "licensestatus", sql.VarChar(20), true],
      [8, "licensetype", sql.NVarChar(50), true],
      [9, "objectid", sql.Int, false],
      [10, "ownercontact1city", sql.NVarChar(100), true],
      [11, "ownercontact1mailingaddress", sql.NVarChar(500), true],
      [12, "ownercontact1name", sql.NVarChar(200), true],
      [13, "ownercontact1state", sql.VarChar(10), true],
      [14, "ownercontact1zippostalcode", sql.VarChar(20), true],
      [15, "ownercontact2city", sql.NVarChar(100), true],
      [16, "ownercontact2mailingaddress", sql.NVarChar(500), true],
      [17, "ownercontact2name", sql.NVarChar(200), true],
      [18, "ownercontact2state", sql.VarChar(10), true],
      [19, "ownercontact2zippostalcode", sql.VarChar(20), true],
      [20, "posse_jobid", sql.VarChar(20), true],
      [21, "revenuecode", sql.VarChar(10), true],
    ],
  },
  {
    csv: "dbo.philly_opa_properties_public_pde.csv",
    table: "opa_properties",
    columns: [
      [55, "parcel_number", sql.VarChar(20), false],
      [0, "address_std", sql.NVarChar(200), true],
      [1, "assessment_date", sql.VarChar(50), true],
      [2, "basements", sql.NVarChar(50), true],
      [3, "beginning_point", sql.NVarChar(200), true],
      [4, "book_and_page", sql.VarChar(20), true],
      [5, "building_code", sql.VarChar(10), true],
      [6, "building_code_description", sql.NVarChar(100), true],
      [7, "building_code_description_new", sql.NVarChar(100), true],
      [8, "building_code_new", sql.VarChar(10), true],
      [10, "category_code", sql.VarChar(10), true],
      [11, "category_code_description", sql.NVarChar(50), true],
      [12, "census_tract", sql.VarChar(20), true],
      [13, "central_air", sql.VarChar(5), true],
      [14, "council_district_2016", sql.VarChar(5), true],
      [15, "council_district_2024", sql.VarChar(5), true],
      [16, "cross_reference", sql.VarChar(20), true],
      [17, "date_exterior_condition", sql.VarChar(50), true],
      [18, "depth", sql.Float, true],
      [19, "elementary_school", sql.NVarChar(100), true],
      [20, "exempt_building", sql.Float, true],
      [21, "exempt_land", sql.Float, true],
      [22, "exterior_condition", sql.VarChar(10), true],
      [23, "fireplaces", sql.Int, true],
      [24, "frontage", sql.Float, true],
      [25, "garage_spaces", sql.Int, true],
      [26, "garage_type", sql.VarChar(20), true],
      [27, "general_construction", sql.NVarChar(50), true],
      [28, "geocode_lat", sql.Float, true],
      [29, "geocode_lon", sql.Float, true],
      [30, "high_school", sql.NVarChar(100), true],
      [31, "homestead_exemption", sql.Int, true],
      [32, "house_extension", sql.VarChar(10), true],
      [33, "house_number", sql.VarChar(20), true],
      [34, "interior_condition", sql.VarChar(10), true],
      [35, "li_district", sql.NVarChar(50), true],
      [36, "location", sql.NVarChar(200), true],
      [37, "mailing_address_1", sql.NVarChar(200), true],
      [38, "mailing_address_2", sql.NVarChar(200), true],
      [39, "mailing_care_of", sql.NVarChar(200), true],
      [40, "mailing_city_state", sql.NVarChar(100), true],
      [41, "mailing_street", sql.NVarChar(200), true],
      [42, "mailing_zip", sql.VarChar(20), true],
      [43, "market_value", sql.Float, true],
      [44, "market_value_date", sql.VarChar(50), true],
      [45, "middle_school", sql.NVarChar(100), true],
      [46, "number_of_bathrooms", sql.Int, true],
      [47, "number_of_bedrooms", sql.Int, true],
      [48, "number_of_rooms", sql.Int, true],
      [49, "number_stories", sql.Float, true],
      [51, "off_street_open", sql.Int, true],
      [52, "other_building", sql.NVarChar(50), true],
      [53, "owner_1", sql.NVarChar(200), true],
      [54, "owner_2", sql.NVarChar(200), true],
      [56, "parcel_shape", sql.VarChar(5), true],
      [57, "pin", sql.VarChar(20), true],
      [58, "police_district", sql.VarChar(10), true],
      [59, "political_district", sql.VarChar(10), true],
      [60, "political_ward", sql.VarChar(10), true],
      [61, "pwd_parcel_id", sql.VarChar(20), true],
      [62, "quality_grade", sql.VarChar(10), true],
      [63, "recording_date", sql.VarChar(50), true],
      [64, "registry_number", sql.VarChar(30), true],
      [65, "rubbish_recycle_day", sql.VarChar(10), true],
      [66, "sale_date", sql.VarChar(50), true],
      [67, "sale_price", sql.Float, true],
      [68, "separate_utilities", sql.VarChar(10), true],
      [69, "site_type", sql.VarChar(10), true],
      [70, "state_code", sql.VarChar(10), true],
      [71, "street_code", sql.VarChar(10), true],
      [72, "street_designation", sql.VarChar(10), true],
      [73, "street_direction", sql.VarChar(5), true],
      [74, "street_name", sql.NVarChar(50), true],
      [75, "suffix", sql.VarChar(10), true],
      [76, "taxable_building", sql.Float, true],
      [77, "taxable_land", sql.Float, true],
      [80, "topography", sql.VarChar(10), true],
      [81, "total_area", sql.Float, true],
      [82, "total_livable_area", sql.Float, true],
      [83, "type_heater", sql.VarChar(10), true],
      [84, "unfinished", sql.VarChar(10), true],
      [85, "unit", sql.VarChar(20), true],
      [86, "view_type", sql.VarChar(10), true],
      [87, "year_built", sql.VarChar(10), true],
      [88, "year_built_estimate", sql.VarChar(10), true],
      [89, "zip_code", sql.VarChar(20), true],
      [90, "zoning", sql.VarChar(20), true],
    ],
  },
  {
    csv: "dbo.masteraddress.csv",
    table: "master_address",
    columns: [
      [0, "master_address_id", sql.UniqueIdentifier, false],
      [1, "address_text", sql.NVarChar(400), true],
    ],
  },
  {
    csv: "dbo.masterentity.csv",
    table: "master_entity",
    columns: [
      [0, "master_entity_id", sql.UniqueIdentifier, false],
      [1, "name_text", sql.NVarChar(400), true],
    ],
  },
  {
    csv: "dbo.philly_case_investigations.csv",
    table: "case_investigations",
    columns: [
      [15, "objectid", sql.Int, false],
      [0, "address", sql.NVarChar(200), true],
      [1, "addressobjectid", sql.VarChar(20), true],
      [2, "cartodb_id", sql.Int, true],
      [3, "casenumber", sql.VarChar(30), true],
      [4, "casepriority", sql.VarChar(20), true],
      [5, "caseresponsibility", sql.NVarChar(100), true],
      [6, "casetype", sql.NVarChar(50), true],
      [7, "censustract", sql.VarChar(20), true],
      [8, "council_district", sql.VarChar(5), true],
      [9, "geocode_x", sql.Float, true],
      [10, "geocode_y", sql.Float, true],
      [11, "investigationcompleted", sql.VarChar(50), true],
      [12, "investigationprocessid", sql.VarChar(20), true],
      [13, "investigationstatus", sql.VarChar(20), true],
      [14, "investigationtype", sql.NVarChar(50), true],
      [16, "opa_account_num", sql.VarChar(20), true],
      [17, "opa_owner", sql.NVarChar(200), true],
      [18, "parcel_id_num", sql.VarChar(20), true],
      [19, "posse_jobid", sql.VarChar(20), true],
      [20, "systemofrecord", sql.VarChar(20), true],
      [23, "unit_num", sql.VarChar(20), true],
      [24, "unit_type", sql.VarChar(20), true],
      [25, "zip", sql.VarChar(20), true],
    ],
  },
  {
    csv: "dbo.philly_assessments.csv",
    table: "assessments",
    columns: [
      [0, "cartodb_id", sql.Int, false],
      [4, "parcel_number", sql.VarChar(20), false],
      [9, "year", sql.Int, false],
      [3, "market_value", sql.Float, true],
      [5, "taxable_building", sql.Float, true],
      [6, "taxable_land", sql.Float, true],
      [1, "exempt_building", sql.Float, true],
      [2, "exempt_land", sql.Float, true],
    ],
  },
  {
    csv: "dbo.masterentityaddress.csv",
    table: "master_entity_address",
    columns: [
      [0, "master_entity_address_id", sql.UniqueIdentifier, false],
      [1, "master_entity_id", sql.UniqueIdentifier, true],
      [2, "master_address_id", sql.UniqueIdentifier, true],
      [3, "parcel_number", sql.VarChar(20), true],
      [4, "notes", sql.NVarChar(2000), true],
    ],
  },
];

/** Parse a CSV line respecting quoted fields */
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/** Convert a string value to the appropriate JS type, truncating to column size */
function convertValue(val, sqlType) {
  if (val === null || val === undefined) return null;
  val = val.trim();
  if (val === "") return null;

  if (sqlType === sql.Int) {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }
  if (sqlType === sql.Float) {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  if (sqlType === sql.UniqueIdentifier) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) return val;
    return null;
  }
  // String type - truncate to column's declared length
  const maxLen = (sqlType && sqlType.length) ? sqlType.length : 4000;
  if (val.length > maxLen) val = val.substring(0, maxLen);
  return val;
}

/** Escape a SQL string value (double single quotes) */
function sqlEscape(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") {
    if (isNaN(val)) return "NULL";
    return String(val);
  }
  // String - escape single quotes
  return "N'" + String(val).replace(/'/g, "''") + "'";
}

/** Format a value for INSERT SQL */
function sqlValue(val, sqlType) {
  if (val === null || val === undefined) return "NULL";
  if (sqlType === sql.Int || sqlType === sql.Float) return String(val);
  if (sqlType === sql.UniqueIdentifier) return "'" + val + "'";
  // NVarChar or VarChar
  return "N'" + String(val).replace(/'/g, "''") + "'";
}

let _pool = null;
let _credential = null;

async function getPool() {
  if (_pool && _pool.connected) return _pool;

  if (!_credential) _credential = new DefaultAzureCredential();
  const tokenResponse = await _credential.getToken("https://database.windows.net/.default");

  const config = {
    server: SERVER,
    database: DATABASE,
    options: { encrypt: true, trustServerCertificate: false },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token: tokenResponse.token },
    },
    pool: { max: 4, min: 1, idleTimeoutMillis: 300000 },
    requestTimeout: 600000,
    connectionTimeout: 60000,
  };

  _pool = await new sql.ConnectionPool(config).connect();
  return _pool;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconnect() {
  if (_pool) {
    try { await _pool.close(); } catch (_) {}
  }
  _pool = null;
  return await getPool();
}

/**
 * Insert a batch of rows using a single INSERT statement with inline values.
 * On PK violation or truncation, falls back to single-row inserts (skipping bad rows).
 * Returns number of rows inserted.
 */
async function insertBatch(tableName, columns, rows) {
  if (rows.length === 0) return 0;

  const colNames = columns.map(([, name]) => `[${name}]`).join(", ");

  function buildInsertSql(rowSubset) {
    const valueRows = rowSubset.map((row) => {
      const vals = row.map((val, i) => sqlValue(val, columns[i][2]));
      return `(${vals.join(", ")})`;
    });
    return `INSERT INTO [${tableName}] (${colNames}) VALUES\n${valueRows.join(",\n")}`;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const pool = await getPool();
      await pool.request().query(buildInsertSql(rows));
      return rows.length;
    } catch (e) {
      const msg = e.message || "";
      // With IGNORE_DUP_KEY=ON, PK violations are warnings not errors.
      // Only truncation errors need single-row fallback.
      if (msg.includes("truncat")) {
        let inserted = 0;
        const pool = await getPool();
        for (const row of rows) {
          try {
            await pool.request().query(buildInsertSql([row]));
            inserted++;
          } catch (_) {}
        }
        return inserted;
      }

      if (attempt < MAX_RETRIES) {
        const waitMs = 1000 * attempt;
        process.stdout.write(`\n    [retry ${attempt}/${MAX_RETRIES}] ${msg.substring(0, 80)}`);
        await reconnect();
        await sleep(waitMs);
      } else {
        process.stdout.write(`\n    [FAILED batch of ${rows.length}] ${msg.substring(0, 120)}`);
        return 0;
      }
    }
  }
  return 0;
}

async function loadTable(tableDef) {
  const csvPath = path.join(DATA_DIR, tableDef.csv);
  if (!fs.existsSync(csvPath)) {
    console.log(`  SKIP: ${csvPath} not found`);
    return;
  }

  const { table: tableName, columns } = tableDef;

  // Check existing data
  let pool = await getPool();
  const countRes = await pool.request().query(`SELECT COUNT(*) AS c FROM [${tableName}]`);
  const existingCount = countRes.recordset[0].c;
  if (existingCount > 0) {
    console.log(`\n  ${tableName}: has ${existingCount.toLocaleString()} rows, reloading (IGNORE_DUP_KEY=ON skips dupes)`);
  }

  console.log(`\n  Loading ${tableName} from ${tableDef.csv}...`);

  const start = Date.now();
  let totalInserted = 0;
  let totalSkipped = 0;
  let rowBuffer = [];

  const fileStream = fs.createReadStream(csvPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let lineBuffer = "";

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    lineBuffer += (lineBuffer ? "\n" : "") + line;
    const quoteCount = (lineBuffer.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) continue;

    const fields = parseCSVLine(lineBuffer);
    lineBuffer = "";

    const values = [];
    let skipRow = false;
    for (const [csvIdx, colName, colType, nullable] of columns) {
      const raw = csvIdx < fields.length ? fields[csvIdx] : "";
      const val = convertValue(raw, colType);
      if (!nullable && (val === null || val === undefined)) {
        skipRow = true;
        break;
      }
      values.push(val);
    }

    if (skipRow) {
      totalSkipped++;
      continue;
    }

    rowBuffer.push(values);

    if (rowBuffer.length >= ROWS_PER_INSERT * CONCURRENT_INSERTS) {
      // Split into CONCURRENT_INSERTS chunks and run in parallel
      const chunks = [];
      for (let i = 0; i < rowBuffer.length; i += ROWS_PER_INSERT) {
        chunks.push(rowBuffer.slice(i, i + ROWS_PER_INSERT));
      }
      const results = await Promise.all(
        chunks.map((chunk) => insertBatch(tableName, columns, chunk))
      );
      for (let i = 0; i < chunks.length; i++) {
        totalInserted += results[i];
        if (results[i] === 0) totalSkipped += chunks[i].length;
      }
      rowBuffer = [];

      const elapsed = (Date.now() - start) / 1000;
      const rate = elapsed > 0 ? totalInserted / elapsed : 0;
      process.stdout.write(
        `\r  ${tableName}: ${totalInserted.toLocaleString()} rows (${Math.round(rate).toLocaleString()}/sec, ${totalSkipped} skipped)  `
      );
    }
  }

  // Handle remaining data
  if (lineBuffer) {
    const fields = parseCSVLine(lineBuffer);
    const values = [];
    let skipRow = false;
    for (const [csvIdx, , colType, nullable] of columns) {
      const raw = csvIdx < fields.length ? fields[csvIdx] : "";
      const val = convertValue(raw, colType);
      if (!nullable && (val === null || val === undefined)) { skipRow = true; break; }
      values.push(val);
    }
    if (!skipRow) rowBuffer.push(values);
  }

  // Flush remaining in parallel
  if (rowBuffer.length > 0) {
    const chunks = [];
    for (let i = 0; i < rowBuffer.length; i += ROWS_PER_INSERT) {
      chunks.push(rowBuffer.slice(i, i + ROWS_PER_INSERT));
    }
    const results = await Promise.all(
      chunks.map((chunk) => insertBatch(tableName, columns, chunk))
    );
    for (let i = 0; i < chunks.length; i++) {
      totalInserted += results[i];
      if (results[i] === 0) totalSkipped += chunks[i].length;
    }
  }

  const elapsed = (Date.now() - start) / 1000;
  const rate = elapsed > 0 ? totalInserted / elapsed : 0;
  console.log(
    `\r  ${tableName}: ${totalInserted.toLocaleString()} rows in ${elapsed.toFixed(1)}s (${Math.round(rate).toLocaleString()}/sec, ${totalSkipped} skipped)          `
  );
}

async function main() {
  console.log("=== Bulk Load: CSV -> Azure SQL (INSERT batches) ===\n");

  let pool = await getPool();
  console.log("Connected to Azure SQL, warming up...");
  for (let i = 0; i < 3; i++) {
    await pool.request().query("SELECT TOP 1 name FROM sys.tables");
    await sleep(500);
  }
  console.log("Database warm.\n");

  const totalStart = Date.now();

  for (const tableDef of TABLES) {
    await loadTable(tableDef);
  }

  const totalElapsed = (Date.now() - totalStart) / 1000;
  console.log(`\n=== Completed in ${Math.round(totalElapsed)}s ===\n`);

  pool = await getPool();
  console.log("Row counts:");
  for (const tableDef of TABLES) {
    const result = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${tableDef.table}]`);
    const count = result.recordset[0].cnt;
    console.log(`  ${tableDef.table.padEnd(40)} ${count.toLocaleString().padStart(12)}`);
  }

  await pool.close();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
