/**
 * Fast bulk loader using TDS bulk copy protocol.
 * ~25,000 rows/sec vs ~75 rows/sec with INSERT statements.
 * Run: cd functions && node ../sql/bulk_import.js
 */
const sql = require("mssql");
const { DefaultAzureCredential } = require("@azure/identity");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const SERVER = "philly-stats-sql-01.database.windows.net";
const DATABASE = "phillystats";
const DATA_DIR = path.join(__dirname, "..", "data");
const BATCH_SIZE = 50000;

/**
 * Parse a CSV line respecting quoted fields.
 * Returns { fields, complete } where complete=false means the line ends mid-quote.
 *
 * Handles:
 * - "" (standard CSV quote escaping)
 * - \" (backslash quote escaping)
 * - Unescaped " inside fields: a " only closes a field if followed by , or EOL
 */
function parseCSVLine(line) {
  const fields = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check what follows the quote to decide if it closes the field
        const next = i + 1 < line.length ? line[i + 1] : null;
        if (next === '"') {
          current += '"'; i++; // "" = escaped quote
        } else if (next === ',' || next === null || next === '\n' || next === '\r') {
          inQuotes = false; // quote followed by separator or EOL = field close
        } else {
          current += '"'; // unescaped quote mid-field, treat as literal
        }
      } else if (ch === '\\' && i + 1 < line.length && line[i + 1] === '"') {
        // Backslash-quote: check if it's at field boundary
        const afterQuote = i + 2 < line.length ? line[i + 2] : null;
        if (afterQuote === ',' || afterQuote === null || afterQuote === '\n' || afterQuote === '\r') {
          current += '\\'; i++; inQuotes = false; // \" at boundary = backslash + field close
        } else {
          current += '"'; i++; // \" mid-field = escaped quote
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return { fields, complete: !inQuotes };
}

function trimTo(val, maxLen) {
  if (!val) return null;
  val = val.trim();
  if (val === "") return null;
  return val.length > maxLen ? val.substring(0, maxLen) : val;
}

function toInt(val) {
  if (!val) return null;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? null : n;
}

function toFloat(val) {
  if (!val) return null;
  const n = parseFloat(val.trim());
  return isNaN(n) ? null : n;
}

function toGuid(val) {
  if (!val) return null;
  val = val.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

// Table definitions: each has csv filename, table name, and a rowMapper function
// that takes CSV fields array and returns an array of values matching the column order
const TABLES = [
  {
    csv: "dbo.philly_demolitions.csv",
    table: "demolitions",
    columns: [
      ["objectid", sql.Int, false],
      ["address", sql.NVarChar(200), true],
      ["addressobjectid", sql.VarChar(20), true],
      ["applicantname", sql.NVarChar(200), true],
      ["applicanttype", sql.VarChar(50), true],
      ["cartodb_id", sql.Int, true],
      ["caseorpermitnumber", sql.VarChar(30), true],
      ["censustract", sql.VarChar(20), true],
      ["city_demo", sql.VarChar(5), true],
      ["completed_date", sql.VarChar(50), true],
      ["contractoraddress1", sql.NVarChar(200), true],
      ["contractoraddress2", sql.NVarChar(200), true],
      ["contractorcity", sql.NVarChar(100), true],
      ["contractorname", sql.NVarChar(200), true],
      ["contractorstate", sql.VarChar(10), true],
      ["contractortype", sql.VarChar(20), true],
      ["contractorzip", sql.VarChar(20), true],
      ["council_district", sql.VarChar(10), true],
      ["geocode_x", sql.Float, true],
      ["geocode_y", sql.Float, true],
      ["mostrecentinsp", sql.VarChar(50), true],
      ["opa_account_num", sql.VarChar(20), true],
      ["opa_owner", sql.NVarChar(200), true],
      ["parcel_id_num", sql.VarChar(20), true],
      ["posse_jobid", sql.VarChar(20), true],
      ["record_type", sql.VarChar(30), true],
      ["start_date", sql.VarChar(50), true],
      ["status", sql.VarChar(50), true],
      ["systemofrecord", sql.VarChar(20), true],
      ["typeofwork", sql.VarChar(30), true],
      ["typeofworkdescription", sql.NVarChar(100), true],
      ["unit_num", sql.VarChar(20), true],
      ["unit_type", sql.VarChar(20), true],
      ["zip", sql.VarChar(20), true],
    ],
    // CSV columns: address(0),addressobjectid(1),applicantname(2),applicanttype(3),
    // cartodb_id(4),caseorpermitnumber(5),censustract(6),city_demo(7),completed_date(8),
    // contractoraddress1(9),contractoraddress2(10),contractorcity(11),contractorname(12),
    // contractorstate(13),contractortype(14),contractorzip(15),council_district(16),
    // geocode_x(17),geocode_y(18),mostrecentinsp(19),objectid(20),opa_account_num(21),
    // opa_owner(22),parcel_id_num(23),posse_jobid(24),record_type(25),start_date(26),
    // status(27),systemofrecord(28),typeofwork(31),typeofworkdescription(32),
    // unit_num(33),unit_type(34),zip(35)
    rowMapper: (f) => {
      const oid = toInt(f[20]);
      if (oid === null) return null;
      return [
        oid, trimTo(f[0], 200), trimTo(f[1], 20), trimTo(f[2], 200), trimTo(f[3], 50),
        toInt(f[4]), trimTo(f[5], 30), trimTo(f[6], 20), trimTo(f[7], 5), trimTo(f[8], 50),
        trimTo(f[9], 200), trimTo(f[10], 200), trimTo(f[11], 100), trimTo(f[12], 200),
        trimTo(f[13], 10), trimTo(f[14], 20), trimTo(f[15], 20), trimTo(f[16], 10),
        toFloat(f[17]), toFloat(f[18]), trimTo(f[19], 50), trimTo(f[21], 20),
        trimTo(f[22], 200), trimTo(f[23], 20), trimTo(f[24], 20), trimTo(f[25], 30),
        trimTo(f[26], 50), trimTo(f[27], 50), trimTo(f[28], 20), trimTo(f[31], 30),
        trimTo(f[32], 100), trimTo(f[33], 20), trimTo(f[34], 20), trimTo(f[35], 20),
      ];
    },
  },
  {
    csv: "dbo.philly_appeals.csv",
    table: "appeals",
    columns: [
      ["objectid", sql.Int, false],
      ["appealnumber", sql.VarChar(30), true],
      ["acceleratedappeal", sql.VarChar(30), true],
      ["address", sql.NVarChar(200), true],
      ["addressobjectid", sql.VarChar(20), true],
      ["agendadescription", sql.NVarChar(4000), true],
      ["appealgrounds", sql.NVarChar(4000), true],
      ["appealstatus", sql.VarChar(20), true],
      ["appealtype", sql.NVarChar(100), true],
      ["appellanttype", sql.VarChar(30), true],
      ["applicationtype", sql.NVarChar(100), true],
      ["cartodb_id", sql.Int, true],
      ["censustract", sql.VarChar(20), true],
      ["completeddate", sql.VarChar(50), true],
      ["council_district", sql.VarChar(5), true],
      ["createddate", sql.VarChar(50), true],
      ["decision", sql.NVarChar(50), true],
      ["decisiondate", sql.VarChar(50), true],
      ["geocode_x", sql.Float, true],
      ["geocode_y", sql.Float, true],
      ["internaljobid", sql.VarChar(20), true],
      ["meetingnumber", sql.VarChar(30), true],
      ["meetingresult", sql.NVarChar(50), true],
      ["opa_account_num", sql.VarChar(20), true],
      ["opa_owner", sql.NVarChar(200), true],
      ["parcel_id_num", sql.VarChar(20), true],
      ["posse_jobid", sql.VarChar(20), true],
      ["primaryappellant", sql.NVarChar(200), true],
      ["proviso", sql.NVarChar(4000), true],
      ["relatedcasefile", sql.VarChar(30), true],
      ["relatedpermit", sql.VarChar(30), true],
      ["scheduleddate", sql.VarChar(50), true],
      ["systemofrecord", sql.VarChar(20), true],
      ["unit_num", sql.VarChar(20), true],
      ["unit_type", sql.VarChar(20), true],
      ["zip", sql.VarChar(20), true],
    ],
    // CSV: acceleratedappeal(0),address(1),addressobjectid(2),agendadescription(3),
    // appealgrounds(4),appealnumber(5),appealstatus(6),appealtype(7),appellanttype(8),
    // applicationtype(9),cartodb_id(10),censustract(11),completeddate(12),
    // council_district(13),createddate(14),decision(15),decisiondate(16),geocode_x(17),
    // geocode_y(18),internaljobid(19),meetingnumber(20),meetingresult(21),objectid(22),
    // opa_account_num(23),opa_owner(24),parcel_id_num(25),posse_jobid(26),
    // primaryappellant(27),proviso(28),relatedcasefile(29),relatedpermit(30),
    // scheduleddate(31),systemofrecord(32),unit_num(35),unit_type(36),zip(37)
    rowMapper: (f) => {
      const oid = toInt(f[22]);
      if (oid === null) return null;
      return [
        oid, trimTo(f[5], 30), trimTo(f[0], 30), trimTo(f[1], 200), trimTo(f[2], 20),
        trimTo(f[3], 4000), trimTo(f[4], 4000), trimTo(f[6], 20), trimTo(f[7], 100),
        trimTo(f[8], 30), trimTo(f[9], 100), toInt(f[10]), trimTo(f[11], 20),
        trimTo(f[12], 50), trimTo(f[13], 5), trimTo(f[14], 50), trimTo(f[15], 50),
        trimTo(f[16], 50), toFloat(f[17]), toFloat(f[18]), trimTo(f[19], 20),
        trimTo(f[20], 30), trimTo(f[21], 50), trimTo(f[23], 20), trimTo(f[24], 200),
        trimTo(f[25], 20), trimTo(f[26], 20), trimTo(f[27], 200), trimTo(f[28], 4000),
        trimTo(f[29], 30), trimTo(f[30], 30), trimTo(f[31], 50), trimTo(f[32], 20),
        trimTo(f[35], 20), trimTo(f[36], 20), trimTo(f[37], 20),
      ];
    },
  },
  {
    csv: "dbo.philly_business_licenses.csv",
    table: "business_licenses",
    columns: [
      ["objectid", sql.Int, false],
      ["licensenum", sql.VarChar(20), true],
      ["address", sql.NVarChar(200), true],
      ["addressed_license", sql.VarChar(10), true],
      ["addressobjectid", sql.VarChar(20), true],
      ["business_mailing_address", sql.NVarChar(500), true],
      ["business_name", sql.NVarChar(300), true],
      ["cartodb_id", sql.Int, true],
      ["censustract", sql.VarChar(20), true],
      ["council_district", sql.VarChar(5), true],
      ["expirationdate", sql.VarChar(50), true],
      ["geocode_x", sql.Float, true],
      ["geocode_y", sql.Float, true],
      ["inactivedate", sql.VarChar(50), true],
      ["initialissuedate", sql.VarChar(50), true],
      ["legalentitytype", sql.VarChar(20), true],
      ["legalfirstname", sql.NVarChar(100), true],
      ["legallastname", sql.NVarChar(100), true],
      ["legalname", sql.NVarChar(300), true],
      ["licensestatus", sql.VarChar(20), true],
      ["licensetype", sql.NVarChar(100), true],
      ["mostrecentissuedate", sql.VarChar(50), true],
      ["numberofunits", sql.Int, true],
      ["opa_account_num", sql.VarChar(20), true],
      ["opa_owner", sql.NVarChar(200), true],
      ["ownercontact1city", sql.NVarChar(100), true],
      ["ownercontact1mailingaddress", sql.NVarChar(500), true],
      ["ownercontact1name", sql.NVarChar(200), true],
      ["ownercontact1state", sql.VarChar(10), true],
      ["ownercontact1zippostalcode", sql.VarChar(20), true],
      ["ownercontact2city", sql.NVarChar(100), true],
      ["ownercontact2mailingaddress", sql.NVarChar(500), true],
      ["ownercontact2name", sql.NVarChar(200), true],
      ["ownercontact2state", sql.VarChar(10), true],
      ["ownercontact2zippostalcode", sql.VarChar(20), true],
      ["owneroccupied", sql.VarChar(10), true],
      ["parcel_id_num", sql.VarChar(20), true],
      ["posse_jobid", sql.VarChar(20), true],
      ["rentalcategory", sql.NVarChar(50), true],
      ["revenuecode", sql.VarChar(10), true],
      ["unit_num", sql.VarChar(20), true],
      ["unit_type", sql.VarChar(20), true],
      ["zip", sql.VarChar(20), true],
    ],
    // CSV: address(0),addressed_license(1),addressobjectid(2),business_mailing_address(3),
    // business_name(4),cartodb_id(5),censustract(6),council_district(7),expirationdate(8),
    // geocode_x(9),geocode_y(10),inactivedate(11),initialissuedate(12),legalentitytype(13),
    // legalfirstname(14),legallastname(15),legalname(16),licensenum(17),licensestatus(18),
    // licensetype(19),mostrecentissuedate(20),numberofunits(21),objectid(22),
    // opa_account_num(23),opa_owner(24),ownercontact1city(25),ownercontact1mailingaddress(26),
    // ownercontact1name(27),ownercontact1state(28),ownercontact1zippostalcode(29),
    // ownercontact2city(30),ownercontact2mailingaddress(31),ownercontact2name(32),
    // ownercontact2state(33),ownercontact2zippostalcode(34),owneroccupied(35),
    // parcel_id_num(36),posse_jobid(37),rentalcategory(38),revenuecode(39),
    // unit_num(42),unit_type(43),zip(44)
    rowMapper: (f) => {
      const oid = toInt(f[22]);
      if (oid === null) return null;
      return [
        oid, trimTo(f[17], 20), trimTo(f[0], 200), trimTo(f[1], 10), trimTo(f[2], 20),
        trimTo(f[3], 500), trimTo(f[4], 300), toInt(f[5]), trimTo(f[6], 20),
        trimTo(f[7], 5), trimTo(f[8], 50), toFloat(f[9]), toFloat(f[10]),
        trimTo(f[11], 50), trimTo(f[12], 50), trimTo(f[13], 20), trimTo(f[14], 100),
        trimTo(f[15], 100), trimTo(f[16], 300), trimTo(f[18], 20), trimTo(f[19], 100),
        trimTo(f[20], 50), toInt(f[21]), trimTo(f[23], 20), trimTo(f[24], 200),
        trimTo(f[25], 100), trimTo(f[26], 500), trimTo(f[27], 200), trimTo(f[28], 10),
        trimTo(f[29], 20), trimTo(f[30], 100), trimTo(f[31], 500), trimTo(f[32], 200),
        trimTo(f[33], 10), trimTo(f[34], 20), trimTo(f[35], 10), trimTo(f[36], 20),
        trimTo(f[37], 20), trimTo(f[38], 50), trimTo(f[39], 10),
        trimTo(f[42], 20), trimTo(f[43], 20), trimTo(f[44], 20),
      ];
    },
  },
  {
    csv: "dbo.philly_com_act_licenses.csv",
    table: "commercial_activity_licenses",
    columns: [
      ["objectid", sql.Int, false],
      ["licensenum", sql.VarChar(20), true],
      ["cartodb_id", sql.Int, true],
      ["companyname", sql.NVarChar(300), true],
      ["issuedate", sql.VarChar(50), true],
      ["legalentitytype", sql.VarChar(20), true],
      ["legalfirstname", sql.NVarChar(100), true],
      ["legallastname", sql.NVarChar(100), true],
      ["licensestatus", sql.VarChar(20), true],
      ["licensetype", sql.NVarChar(50), true],
      ["ownercontact1city", sql.NVarChar(100), true],
      ["ownercontact1mailingaddress", sql.NVarChar(500), true],
      ["ownercontact1name", sql.NVarChar(200), true],
      ["ownercontact1state", sql.VarChar(10), true],
      ["ownercontact1zippostalcode", sql.VarChar(20), true],
      ["ownercontact2city", sql.NVarChar(100), true],
      ["ownercontact2mailingaddress", sql.NVarChar(500), true],
      ["ownercontact2name", sql.NVarChar(200), true],
      ["ownercontact2state", sql.VarChar(10), true],
      ["ownercontact2zippostalcode", sql.VarChar(20), true],
      ["posse_jobid", sql.VarChar(20), true],
      ["revenuecode", sql.VarChar(10), true],
    ],
    // CSV: cartodb_id(0),companyname(1),issuedate(2),legalentitytype(3),legalfirstname(4),
    // legallastname(5),licensenum(6),licensestatus(7),licensetype(8),objectid(9),
    // ownercontact1city(10),ownercontact1mailingaddress(11),ownercontact1name(12),
    // ownercontact1state(13),ownercontact1zippostalcode(14),ownercontact2city(15),
    // ownercontact2mailingaddress(16),ownercontact2name(17),ownercontact2state(18),
    // ownercontact2zippostalcode(19),posse_jobid(20),revenuecode(21)
    rowMapper: (f) => {
      const oid = toInt(f[9]);
      if (oid === null) return null;
      return [
        oid, trimTo(f[6], 20), toInt(f[0]), trimTo(f[1], 300), trimTo(f[2], 50),
        trimTo(f[3], 20), trimTo(f[4], 100), trimTo(f[5], 100), trimTo(f[7], 20),
        trimTo(f[8], 50), trimTo(f[10], 100), trimTo(f[11], 500), trimTo(f[12], 200),
        trimTo(f[13], 10), trimTo(f[14], 20), trimTo(f[15], 100), trimTo(f[16], 500),
        trimTo(f[17], 200), trimTo(f[18], 10), trimTo(f[19], 20), trimTo(f[20], 20),
        trimTo(f[21], 10),
      ];
    },
  },
  {
    csv: "dbo.philly_opa_properties_public_pde.csv",
    table: "opa_properties",
    columns: [
      ["parcel_number", sql.VarChar(20), false],
      ["address_std", sql.NVarChar(200), true],
      ["assessment_date", sql.VarChar(50), true],
      ["basements", sql.NVarChar(50), true],
      ["beginning_point", sql.NVarChar(200), true],
      ["book_and_page", sql.VarChar(20), true],
      ["building_code", sql.VarChar(10), true],
      ["building_code_description", sql.NVarChar(100), true],
      ["building_code_description_new", sql.NVarChar(100), true],
      ["building_code_new", sql.VarChar(10), true],
      ["category_code", sql.VarChar(10), true],
      ["category_code_description", sql.NVarChar(50), true],
      ["census_tract", sql.VarChar(20), true],
      ["central_air", sql.VarChar(5), true],
      ["council_district_2016", sql.VarChar(5), true],
      ["council_district_2024", sql.VarChar(5), true],
      ["cross_reference", sql.VarChar(20), true],
      ["date_exterior_condition", sql.VarChar(50), true],
      ["depth", sql.Float, true],
      ["elementary_school", sql.NVarChar(100), true],
      ["exempt_building", sql.Float, true],
      ["exempt_land", sql.Float, true],
      ["exterior_condition", sql.VarChar(10), true],
      ["fireplaces", sql.Int, true],
      ["frontage", sql.Float, true],
      ["garage_spaces", sql.Int, true],
      ["garage_type", sql.VarChar(20), true],
      ["general_construction", sql.NVarChar(50), true],
      ["geocode_lat", sql.Float, true],
      ["geocode_lon", sql.Float, true],
      ["high_school", sql.NVarChar(100), true],
      ["homestead_exemption", sql.Int, true],
      ["house_extension", sql.VarChar(10), true],
      ["house_number", sql.VarChar(20), true],
      ["interior_condition", sql.VarChar(10), true],
      ["li_district", sql.NVarChar(50), true],
      ["location", sql.NVarChar(200), true],
      ["mailing_address_1", sql.NVarChar(200), true],
      ["mailing_address_2", sql.NVarChar(200), true],
      ["mailing_care_of", sql.NVarChar(200), true],
      ["mailing_city_state", sql.NVarChar(100), true],
      ["mailing_street", sql.NVarChar(200), true],
      ["mailing_zip", sql.VarChar(20), true],
      ["market_value", sql.Float, true],
      ["market_value_date", sql.VarChar(50), true],
      ["middle_school", sql.NVarChar(100), true],
      ["number_of_bathrooms", sql.Int, true],
      ["number_of_bedrooms", sql.Int, true],
      ["number_of_rooms", sql.Int, true],
      ["number_stories", sql.Float, true],
      ["off_street_open", sql.Int, true],
      ["other_building", sql.NVarChar(50), true],
      ["owner_1", sql.NVarChar(200), true],
      ["owner_2", sql.NVarChar(200), true],
      ["parcel_shape", sql.VarChar(5), true],
      ["pin", sql.VarChar(20), true],
      ["police_district", sql.VarChar(10), true],
      ["political_district", sql.VarChar(10), true],
      ["political_ward", sql.VarChar(10), true],
      ["pwd_parcel_id", sql.VarChar(20), true],
      ["quality_grade", sql.VarChar(10), true],
      ["recording_date", sql.VarChar(50), true],
      ["registry_number", sql.VarChar(30), true],
      ["rubbish_recycle_day", sql.VarChar(10), true],
      ["sale_date", sql.VarChar(50), true],
      ["sale_price", sql.Float, true],
      ["separate_utilities", sql.VarChar(10), true],
      ["site_type", sql.VarChar(10), true],
      ["state_code", sql.VarChar(10), true],
      ["street_code", sql.VarChar(10), true],
      ["street_designation", sql.VarChar(10), true],
      ["street_direction", sql.VarChar(5), true],
      ["street_name", sql.NVarChar(50), true],
      ["suffix", sql.VarChar(10), true],
      ["taxable_building", sql.Float, true],
      ["taxable_land", sql.Float, true],
      ["topography", sql.VarChar(10), true],
      ["total_area", sql.Float, true],
      ["total_livable_area", sql.Float, true],
      ["type_heater", sql.VarChar(10), true],
      ["unfinished", sql.VarChar(10), true],
      ["unit", sql.VarChar(20), true],
      ["view_type", sql.VarChar(10), true],
      ["year_built", sql.VarChar(10), true],
      ["year_built_estimate", sql.VarChar(10), true],
      ["zip_code", sql.VarChar(20), true],
      ["zoning", sql.VarChar(20), true],
    ],
    // CSV columns by index (91 total): address_std(0),assessment_date(1),basements(2),
    // beginning_point(3),book_and_page(4),building_code(5),building_code_description(6),
    // building_code_description_new(7),building_code_new(8),cartodb_id(9),category_code(10),
    // category_code_description(11),census_tract(12),central_air(13),council_district_2016(14),
    // council_district_2024(15),cross_reference(16),date_exterior_condition(17),depth(18),
    // elementary_school(19),exempt_building(20),exempt_land(21),exterior_condition(22),
    // fireplaces(23),frontage(24),garage_spaces(25),garage_type(26),general_construction(27),
    // geocode_lat(28),geocode_lon(29),high_school(30),homestead_exemption(31),
    // house_extension(32),house_number(33),interior_condition(34),li_district(35),location(36),
    // mailing_address_1(37),mailing_address_2(38),mailing_care_of(39),mailing_city_state(40),
    // mailing_street(41),mailing_zip(42),market_value(43),market_value_date(44),
    // middle_school(45),number_of_bathrooms(46),number_of_bedrooms(47),number_of_rooms(48),
    // number_stories(49),objectid(50),off_street_open(51),other_building(52),owner_1(53),
    // owner_2(54),parcel_number(55),parcel_shape(56),pin(57),police_district(58),
    // political_district(59),political_ward(60),pwd_parcel_id(61),quality_grade(62),
    // recording_date(63),registry_number(64),rubbish_recycle_day(65),sale_date(66),
    // sale_price(67),separate_utilities(68),site_type(69),state_code(70),street_code(71),
    // street_designation(72),street_direction(73),street_name(74),suffix(75),
    // taxable_building(76),taxable_land(77),the_geom(78),the_geom_webmercator(79),
    // topography(80),total_area(81),total_livable_area(82),type_heater(83),unfinished(84),
    // unit(85),view_type(86),year_built(87),year_built_estimate(88),zip_code(89),zoning(90)
    rowMapper: (f) => {
      const pn = trimTo(f[55], 20);
      if (!pn) return null;
      return [
        pn, trimTo(f[0], 200), trimTo(f[1], 50), trimTo(f[2], 50), trimTo(f[3], 200),
        trimTo(f[4], 20), trimTo(f[5], 10), trimTo(f[6], 100), trimTo(f[7], 100),
        trimTo(f[8], 10), trimTo(f[10], 10), trimTo(f[11], 50), trimTo(f[12], 20),
        trimTo(f[13], 5), trimTo(f[14], 5), trimTo(f[15], 5), trimTo(f[16], 20),
        trimTo(f[17], 50), toFloat(f[18]), trimTo(f[19], 100), toFloat(f[20]),
        toFloat(f[21]), trimTo(f[22], 10), toInt(f[23]), toFloat(f[24]),
        toInt(f[25]), trimTo(f[26], 20), trimTo(f[27], 50), toFloat(f[28]),
        toFloat(f[29]), trimTo(f[30], 100), toInt(f[31]), trimTo(f[32], 10),
        trimTo(f[33], 20), trimTo(f[34], 10), trimTo(f[35], 50), trimTo(f[36], 200),
        trimTo(f[37], 200), trimTo(f[38], 200), trimTo(f[39], 200), trimTo(f[40], 100),
        trimTo(f[41], 200), trimTo(f[42], 20), toFloat(f[43]), trimTo(f[44], 50),
        trimTo(f[45], 100), toInt(f[46]), toInt(f[47]), toInt(f[48]),
        toFloat(f[49]), toInt(f[51]), trimTo(f[52], 50), trimTo(f[53], 200),
        trimTo(f[54], 200), trimTo(f[56], 5), trimTo(f[57], 20), trimTo(f[58], 10),
        trimTo(f[59], 10), trimTo(f[60], 10), trimTo(f[61], 20), trimTo(f[62], 10),
        trimTo(f[63], 50), trimTo(f[64], 30), trimTo(f[65], 10), trimTo(f[66], 50),
        toFloat(f[67]), trimTo(f[68], 10), trimTo(f[69], 10), trimTo(f[70], 10),
        trimTo(f[71], 10), trimTo(f[72], 10), trimTo(f[73], 5), trimTo(f[74], 50),
        trimTo(f[75], 10), toFloat(f[76]), toFloat(f[77]), trimTo(f[80], 10),
        toFloat(f[81]), toFloat(f[82]), trimTo(f[83], 10), trimTo(f[84], 10),
        trimTo(f[85], 20), trimTo(f[86], 10), trimTo(f[87], 10), trimTo(f[88], 10),
        trimTo(f[89], 20), trimTo(f[90], 20),
      ];
    },
  },
  {
    csv: "dbo.masteraddress.csv",
    table: "master_address",
    columns: [
      ["master_address_id", sql.UniqueIdentifier, false],
      ["address_text", sql.NVarChar(400), true],
    ],
    rowMapper: (f) => {
      const id = toGuid(f[0]);
      if (!id) return null;
      return [id, trimTo(f[1], 400)];
    },
  },
  {
    csv: "dbo.masterentity.csv",
    table: "master_entity",
    columns: [
      ["master_entity_id", sql.UniqueIdentifier, false],
      ["name_text", sql.NVarChar(400), true],
    ],
    rowMapper: (f) => {
      const id = toGuid(f[0]);
      if (!id) return null;
      return [id, trimTo(f[1], 400)];
    },
  },
  {
    csv: "dbo.philly_case_investigations.csv",
    table: "case_investigations",
    columns: [
      ["objectid", sql.Int, false],
      ["address", sql.NVarChar(200), true],
      ["addressobjectid", sql.VarChar(20), true],
      ["cartodb_id", sql.Int, true],
      ["casenumber", sql.VarChar(30), true],
      ["casepriority", sql.VarChar(20), true],
      ["caseresponsibility", sql.NVarChar(100), true],
      ["casetype", sql.NVarChar(50), true],
      ["censustract", sql.VarChar(20), true],
      ["council_district", sql.VarChar(5), true],
      ["geocode_x", sql.Float, true],
      ["geocode_y", sql.Float, true],
      ["investigationcompleted", sql.VarChar(50), true],
      ["investigationprocessid", sql.VarChar(20), true],
      ["investigationstatus", sql.VarChar(20), true],
      ["investigationtype", sql.NVarChar(50), true],
      ["opa_account_num", sql.VarChar(20), true],
      ["opa_owner", sql.NVarChar(200), true],
      ["parcel_id_num", sql.VarChar(20), true],
      ["posse_jobid", sql.VarChar(20), true],
      ["systemofrecord", sql.VarChar(20), true],
      ["unit_num", sql.VarChar(20), true],
      ["unit_type", sql.VarChar(20), true],
      ["zip", sql.VarChar(20), true],
    ],
    // CSV: address(0),addressobjectid(1),cartodb_id(2),casenumber(3),casepriority(4),
    // caseresponsibility(5),casetype(6),censustract(7),council_district(8),geocode_x(9),
    // geocode_y(10),investigationcompleted(11),investigationprocessid(12),
    // investigationstatus(13),investigationtype(14),objectid(15),opa_account_num(16),
    // opa_owner(17),parcel_id_num(18),posse_jobid(19),systemofrecord(20),
    // unit_num(23),unit_type(24),zip(25)
    rowMapper: (f) => {
      const oid = toInt(f[15]);
      if (oid === null) return null;
      return [
        oid, trimTo(f[0], 200), trimTo(f[1], 20), toInt(f[2]), trimTo(f[3], 30),
        trimTo(f[4], 20), trimTo(f[5], 100), trimTo(f[6], 50), trimTo(f[7], 20),
        trimTo(f[8], 5), toFloat(f[9]), toFloat(f[10]), trimTo(f[11], 50),
        trimTo(f[12], 20), trimTo(f[13], 20), trimTo(f[14], 50), trimTo(f[16], 20),
        trimTo(f[17], 200), trimTo(f[18], 20), trimTo(f[19], 20), trimTo(f[20], 20),
        trimTo(f[23], 20), trimTo(f[24], 20), trimTo(f[25], 20),
      ];
    },
  },
  {
    csv: "dbo.philly_assessments.csv",
    table: "assessments",
    columns: [
      ["cartodb_id", sql.Int, false],
      ["parcel_number", sql.VarChar(20), false],
      ["year", sql.Int, false],
      ["market_value", sql.Float, true],
      ["taxable_building", sql.Float, true],
      ["taxable_land", sql.Float, true],
      ["exempt_building", sql.Float, true],
      ["exempt_land", sql.Float, true],
    ],
    // CSV: cartodb_id(0),exempt_building(1),exempt_land(2),market_value(3),
    // parcel_number(4),taxable_building(5),taxable_land(6),the_geom(7),
    // the_geom_webmercator(8),year(9)
    rowMapper: (f) => {
      const cid = toInt(f[0]);
      const pn = trimTo(f[4], 20);
      const yr = toInt(f[9]);
      if (cid === null || !pn || yr === null) return null;
      return [cid, pn, yr, toFloat(f[3]), toFloat(f[5]), toFloat(f[6]), toFloat(f[1]), toFloat(f[2])];
    },
  },
  {
    csv: "rtt_summary.csv",
    table: "rtt_summary",
    columns: [
      ["objectid", sql.Int, false],
      ["cartodb_id", sql.Int, true],
      ["document_id", sql.VarChar(30), true],
      ["document_type", sql.VarChar(50), true],
      ["display_date", sql.VarChar(50), true],
      ["street_address", sql.NVarChar(200), true],
      ["zip_code", sql.VarChar(20), true],
      ["ward", sql.VarChar(10), true],
      ["grantors", sql.NVarChar(500), true],
      ["grantees", sql.NVarChar(500), true],
      ["cash_consideration", sql.Float, true],
      ["other_consideration", sql.Float, true],
      ["total_consideration", sql.Float, true],
      ["assessed_value", sql.Float, true],
      ["common_level_ratio", sql.Float, true],
      ["fair_market_value", sql.Float, true],
      ["state_tax_amount", sql.Float, true],
      ["state_tax_percent", sql.Float, true],
      ["local_tax_amount", sql.Float, true],
      ["local_tax_percent", sql.Float, true],
      ["receipt_num", sql.VarChar(30), true],
      ["receipt_date", sql.VarChar(50), true],
      ["recording_date", sql.VarChar(50), true],
      ["document_date", sql.VarChar(50), true],
      ["condo_name", sql.NVarChar(200), true],
      ["unit_num", sql.VarChar(20), true],
      ["opa_account_num", sql.VarChar(20), true],
      ["legal_remarks", sql.NVarChar(2000), true],
      ["discrepancy", sql.NVarChar(200), true],
      ["property_count", sql.Int, true],
      ["record_id", sql.VarChar(30), true],
    ],
    // CSV from download-carto.js (columns in SELECT order):
    // cartodb_id(0), objectid(1), document_id(2), document_type(3), display_date(4),
    // street_address(5), zip_code(6), ward(7), grantors(8), grantees(9),
    // cash_consideration(10), other_consideration(11), total_consideration(12),
    // assessed_value(13), common_level_ratio(14), fair_market_value(15),
    // state_tax_amount(16), state_tax_percent(17), local_tax_amount(18), local_tax_percent(19),
    // receipt_num(20), receipt_date(21), recording_date(22), document_date(23),
    // condo_name(24), unit_num(25), opa_account_num(26), legal_remarks(27),
    // discrepancy(28), property_count(29), record_id(30)
    rowMapper: (f) => {
      const oid = toInt(f[1]);
      if (oid === null) return null;
      return [
        oid, toInt(f[0]), trimTo(f[2], 30), trimTo(f[3], 50), trimTo(f[4], 50),
        trimTo(f[5], 200), trimTo(f[6], 20), trimTo(f[7], 10), trimTo(f[8], 500),
        trimTo(f[9], 500), toFloat(f[10]), toFloat(f[11]), toFloat(f[12]),
        toFloat(f[13]), toFloat(f[14]), toFloat(f[15]), toFloat(f[16]),
        toFloat(f[17]), toFloat(f[18]), toFloat(f[19]), trimTo(f[20], 30),
        trimTo(f[21], 50), trimTo(f[22], 50), trimTo(f[23], 50),
        trimTo(f[24], 200), trimTo(f[25], 20), trimTo(f[26], 20),
        trimTo(f[27], 2000), trimTo(f[28], 200), toInt(f[29]), trimTo(f[30], 30),
      ];
    },
  },
  {
    csv: "dbo.masterentityaddress.csv",
    table: "master_entity_address",
    columns: [
      ["master_entity_address_id", sql.UniqueIdentifier, false],
      ["master_entity_id", sql.UniqueIdentifier, true],
      ["master_address_id", sql.UniqueIdentifier, true],
      ["parcel_number", sql.VarChar(20), true],
      ["notes", sql.NVarChar(2000), true],
    ],
    rowMapper: (f) => {
      const id = toGuid(f[0]);
      if (!id) return null;
      return [id, toGuid(f[1]), toGuid(f[2]), trimTo(f[3], 20), trimTo(f[4], 2000)];
    },
  },
];

let _pool = null;

async function getPool() {
  if (_pool && _pool.connected) return _pool;
  const cred = new DefaultAzureCredential();
  const token = await cred.getToken("https://database.windows.net/.default");
  _pool = await new sql.ConnectionPool({
    server: SERVER,
    database: DATABASE,
    options: { encrypt: true },
    authentication: { type: "azure-active-directory-access-token", options: { token: token.token } },
    requestTimeout: 600000,
    connectionTimeout: 60000,
    pool: { max: 4, min: 1, idleTimeoutMillis: 300000 },
  }).connect();
  return _pool;
}

async function loadTable(tableDef) {
  const csvPath = path.join(DATA_DIR, tableDef.csv);
  if (!fs.existsSync(csvPath)) {
    console.log(`  SKIP: ${csvPath} not found`);
    return;
  }

  const { table: tableName, columns, rowMapper } = tableDef;
  const pool = await getPool();

  // Check existing count
  const cntRes = await pool.request().query(`SELECT COUNT(*) AS c FROM [${tableName}]`);
  const existing = cntRes.recordset[0].c;

  console.log(`\n  ${tableName}: truncating (had ${existing.toLocaleString()} rows)...`);
  await pool.request().query(`TRUNCATE TABLE [${tableName}]`);

  console.log(`  Loading ${tableName} from ${tableDef.csv}...`);

  const start = Date.now();
  let totalRows = 0;
  let skipped = 0;

  function createTable() {
    const t = new sql.Table(tableName);
    t.create = false;
    for (const [colName, colType, nullable] of columns) {
      t.columns.add(colName, colType, { nullable });
    }
    return t;
  }

  let table = createTable();

  const fileStream = fs.createReadStream(csvPath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isHeader = true;
  let lineBuffer = "";

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }

    lineBuffer += (lineBuffer ? "\n" : "") + line;
    const parsed = parseCSVLine(lineBuffer);
    if (!parsed.complete) continue;

    const fields = parsed.fields;
    lineBuffer = "";

    const values = rowMapper(fields);
    if (!values) { skipped++; continue; }

    table.rows.add(...values);

    if (table.rows.length >= BATCH_SIZE) {
      try {
        const result = await pool.request().bulk(table);
        totalRows += result.rowsAffected;
      } catch (e) {
        console.log(`\n    [ERROR batch at ${totalRows}] ${e.message.substring(0, 120)}`);
        skipped += table.rows.length;
      }
      table = createTable();

      const elapsed = (Date.now() - start) / 1000;
      const rate = elapsed > 0 ? Math.round(totalRows / elapsed) : 0;
      process.stdout.write(
        `\r  ${tableName}: ${totalRows.toLocaleString()} rows (${rate.toLocaleString()}/sec, ${skipped} skipped)  `
      );
    }
  }

  // Handle remaining lineBuffer
  if (lineBuffer) {
    const parsed = parseCSVLine(lineBuffer);
    const values = rowMapper(parsed.fields);
    if (values) table.rows.add(...values);
    else skipped++;
  }

  // Flush remaining
  if (table.rows.length > 0) {
    try {
      const result = await pool.request().bulk(table);
      totalRows += result.rowsAffected;
    } catch (e) {
      console.log(`\n    [ERROR final batch] ${e.message.substring(0, 120)}`);
      skipped += table.rows.length;
    }
  }

  const elapsed = (Date.now() - start) / 1000;
  const rate = elapsed > 0 ? Math.round(totalRows / elapsed) : 0;
  console.log(
    `\r  ${tableName}: ${totalRows.toLocaleString()} rows in ${elapsed.toFixed(1)}s (${rate.toLocaleString()}/sec, ${skipped} skipped)          `
  );
}

async function main() {
  console.log("=== Bulk Import: CSV -> Azure SQL (TDS bulk copy) ===\n");

  const pool = await getPool();
  console.log("Connected to Azure SQL.\n");

  const totalStart = Date.now();

  for (const tableDef of TABLES) {
    await loadTable(tableDef);
  }

  const totalElapsed = (Date.now() - totalStart) / 1000;
  console.log(`\n=== Completed in ${Math.round(totalElapsed)}s ===\n`);

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
