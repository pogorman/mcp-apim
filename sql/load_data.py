"""
Load CSV data into Azure SQL Database using pyodbc + AAD auth.
Processes CSVs in batches for large files.
"""
import pyodbc
import struct
import os
import csv
import sys
import time

SERVER = "philly-stats-sql-01.database.windows.net"
DATABASE = "phillystats"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
BATCH_SIZE = 5000

# Map CSV filenames to table names and their column lists
TABLE_MAP = {
    "dbo.masterentity.csv": {
        "table": "master_entity",
        "columns": ["master_entity_id", "name_text"],
    },
    "dbo.masteraddress.csv": {
        "table": "master_address",
        "columns": ["master_address_id", "address_text"],
    },
    "dbo.masterentityaddress.csv": {
        "table": "master_entity_address",
        "columns": ["master_entity_address_id", "master_entity_id", "master_address_id", "parcel_number", "notes"],
    },
    "dbo.philly_demolitions.csv": {
        "table": "demolitions",
        "columns": [
            "address", "addressobjectid", "applicantname", "applicanttype",
            "cartodb_id", "caseorpermitnumber", "censustract", "city_demo",
            "completed_date", "contractoraddress1", "contractoraddress2",
            "contractorcity", "contractorname", "contractorstate", "contractortype",
            "contractorzip", "council_district", "geocode_x", "geocode_y",
            "mostrecentinsp", "objectid", "opa_account_num", "opa_owner",
            "parcel_id_num", "posse_jobid", "record_type", "start_date",
            "status", "systemofrecord", None, None,  # skip the_geom columns
            "typeofwork", "typeofworkdescription", "unit_num", "unit_type", "zip",
        ],
    },
    "dbo.philly_appeals.csv": {
        "table": "appeals",
        "columns": [
            "acceleratedappeal", "address", "addressobjectid", "agendadescription",
            "appealgrounds", "appealnumber", "appealstatus", "appealtype",
            "appellanttype", "applicationtype", "cartodb_id", "censustract",
            "completeddate", "council_district", "createddate", "decision",
            "decisiondate", "geocode_x", "geocode_y", "internaljobid",
            "meetingnumber", "meetingresult", "objectid", "opa_account_num",
            "opa_owner", "parcel_id_num", "posse_jobid", "primaryappellant",
            "proviso", "relatedcasefile", "relatedpermit", "scheduleddate",
            "systemofrecord", None, None,  # skip the_geom columns
            "unit_num", "unit_type", "zip",
        ],
    },
    "dbo.philly_assessments.csv": {
        "table": "assessments",
        "columns": [
            "cartodb_id", "exempt_building", "exempt_land", "market_value",
            "parcel_number", "taxable_building", "taxable_land",
            None, None,  # skip the_geom columns
            "year",
        ],
    },
    "dbo.philly_business_licenses.csv": {
        "table": "business_licenses",
        "columns": [
            "address", "addressed_license", "addressobjectid",
            "business_mailing_address", "business_name", "cartodb_id",
            "censustract", "council_district", "expirationdate", "geocode_x",
            "geocode_y", "inactivedate", "initialissuedate", "legalentitytype",
            "legalfirstname", "legallastname", "legalname", "licensenum",
            "licensestatus", "licensetype", "mostrecentissuedate", "numberofunits",
            "objectid", "opa_account_num", "opa_owner", "ownercontact1city",
            "ownercontact1mailingaddress", "ownercontact1name", "ownercontact1state",
            "ownercontact1zippostalcode", "ownercontact2city",
            "ownercontact2mailingaddress", "ownercontact2name", "ownercontact2state",
            "ownercontact2zippostalcode", "owneroccupied", "parcel_id_num",
            "posse_jobid", "rentalcategory", "revenuecode",
            None, None,  # skip the_geom columns
            "unit_num", "unit_type", "zip",
        ],
    },
    "dbo.philly_case_investigations.csv": {
        "table": "case_investigations",
        "columns": [
            "address", "addressobjectid", "cartodb_id", "casenumber",
            "casepriority", "caseresponsibility", "casetype", "censustract",
            "council_district", "geocode_x", "geocode_y", "investigationcompleted",
            "investigationprocessid", "investigationstatus", "investigationtype",
            "objectid", "opa_account_num", "opa_owner", "parcel_id_num",
            "posse_jobid", "systemofrecord",
            None, None,  # skip the_geom columns
            "unit_num", "unit_type", "zip",
        ],
    },
    "dbo.philly_com_act_licenses.csv": {
        "table": "commercial_activity_licenses",
        "columns": [
            "cartodb_id", "companyname", "issuedate", "legalentitytype",
            "legalfirstname", "legallastname", "licensenum", "licensestatus",
            "licensetype", "objectid", "ownercontact1city",
            "ownercontact1mailingaddress", "ownercontact1name", "ownercontact1state",
            "ownercontact1zippostalcode", "ownercontact2city",
            "ownercontact2mailingaddress", "ownercontact2name", "ownercontact2state",
            "ownercontact2zippostalcode", "posse_jobid", "revenuecode",
            None, None,  # skip the_geom columns
        ],
    },
    "dbo.philly_opa_properties_public_pde.csv": {
        "table": "opa_properties",
        "columns": [
            "address_std", "assessment_date", "basements", "beginning_point",
            "book_and_page", "building_code", "building_code_description",
            "building_code_description_new", "building_code_new",
            None,  # cartodb_id - skip
            "category_code", "category_code_description", "census_tract",
            "central_air", "council_district_2016", "council_district_2024",
            "cross_reference", "date_exterior_condition", "depth",
            "elementary_school", "exempt_building", "exempt_land",
            "exterior_condition", "fireplaces", "frontage", "garage_spaces",
            "garage_type", "general_construction", "geocode_lat", "geocode_lon",
            "high_school", "homestead_exemption", "house_extension", "house_number",
            "interior_condition", "li_district", "location", "mailing_address_1",
            "mailing_address_2", "mailing_care_of", "mailing_city_state",
            "mailing_street", "mailing_zip", "market_value", "market_value_date",
            "middle_school", "number_of_bathrooms", "number_of_bedrooms",
            "number_of_rooms", "number_stories",
            None,  # objectid
            "off_street_open", "other_building", "owner_1", "owner_2",
            "parcel_number", "parcel_shape", "pin", "police_district",
            "political_district", "political_ward", "pwd_parcel_id", "quality_grade",
            "recording_date", "registry_number", "rubbish_recycle_day", "sale_date",
            "sale_price", "separate_utilities", "site_type", "state_code",
            "street_code", "street_designation", "street_direction", "street_name",
            "suffix", "taxable_building", "taxable_land",
            None, None,  # skip the_geom columns
            "topography", "total_area", "total_livable_area", "type_heater",
            "unfinished", "unit", "view_type", "year_built", "year_built_estimate",
            "zip_code", "zoning",
        ],
    },
}


def get_connection():
    token = os.environ["DB_TOKEN"]
    token_bytes = token.encode("utf-16-le")
    token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)
    conn = pyodbc.connect(
        f"Driver={{ODBC Driver 17 for SQL Server}};"
        f"Server={SERVER};"
        f"Database={DATABASE};",
        attrs_before={1256: token_struct},
        autocommit=True,
    )
    conn.setdecoding(pyodbc.SQL_CHAR, encoding='utf-8')
    conn.setdecoding(pyodbc.SQL_WCHAR, encoding='utf-8')
    return conn


def clean_value(val):
    """Clean a CSV value for SQL insertion."""
    if val is None or val == "" or val.strip() == "":
        return None
    val = val.strip()
    # Truncate very long values
    if len(val) > 2000:
        val = val[:2000]
    return val


def load_table(conn, csv_filename, table_name, column_map):
    """Load a CSV file into a SQL table."""
    csv_path = os.path.join(DATA_DIR, csv_filename)
    if not os.path.exists(csv_path):
        print(f"  SKIP: {csv_path} not found")
        return

    # Read CSV header to understand column positions
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        csv_headers = next(reader)

    # Build the column mapping: which CSV columns map to which DB columns
    # column_map has entries that are either a DB column name or None (skip)
    db_columns = []  # columns we'll insert into
    csv_indices = []  # which CSV column index maps to each db column

    for i, col in enumerate(column_map):
        if col is not None and i < len(csv_headers):
            db_columns.append(col)
            csv_indices.append(i)

    if not db_columns:
        print(f"  ERROR: No column mapping for {csv_filename}")
        return

    placeholders = ", ".join(["?" for _ in db_columns])
    col_list = ", ".join(db_columns)
    insert_sql = f"INSERT INTO {table_name} ({col_list}) VALUES ({placeholders})"

    cursor = conn.cursor()
    cursor.fast_executemany = True

    total = 0
    errors = 0
    batch = []
    start_time = time.time()

    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        next(reader)  # skip header

        for row_num, row in enumerate(reader, 2):
            try:
                values = []
                for idx in csv_indices:
                    if idx < len(row):
                        values.append(clean_value(row[idx]))
                    else:
                        values.append(None)

                batch.append(values)

                if len(batch) >= BATCH_SIZE:
                    try:
                        cursor.executemany(insert_sql, batch)
                    except Exception as e:
                        # Fall back to row-by-row for this batch
                        for single_row in batch:
                            try:
                                cursor.execute(insert_sql, single_row)
                            except Exception:
                                errors += 1
                    total += len(batch)
                    batch = []

                    elapsed = time.time() - start_time
                    rate = total / elapsed if elapsed > 0 else 0
                    print(f"\r  {table_name}: {total:,} rows ({rate:.0f}/sec, {errors} errors)", end="", flush=True)

            except Exception:
                errors += 1

    # Final batch
    if batch:
        try:
            cursor.executemany(insert_sql, batch)
        except Exception:
            for single_row in batch:
                try:
                    cursor.execute(insert_sql, single_row)
                except Exception:
                    errors += 1
        total += len(batch)

    elapsed = time.time() - start_time
    print(f"\r  {table_name}: {total:,} rows loaded in {elapsed:.1f}s ({errors} errors)          ")

    cursor.close()


def main():
    print("=== Loading data into Azure SQL ===\n")

    conn = get_connection()

    # Load in order: smallest first, biggest last
    load_order = [
        "dbo.philly_demolitions.csv",
        "dbo.philly_appeals.csv",
        "dbo.philly_business_licenses.csv",
        "dbo.philly_com_act_licenses.csv",
        "dbo.philly_opa_properties_public_pde.csv",
        "dbo.masteraddress.csv",
        "dbo.masterentity.csv",
        "dbo.philly_case_investigations.csv",
        "dbo.philly_assessments.csv",
        "dbo.masterentityaddress.csv",
    ]

    for csv_file in load_order:
        if csv_file not in TABLE_MAP:
            print(f"  SKIP: No mapping for {csv_file}")
            continue

        info = TABLE_MAP[csv_file]
        print(f"\nLoading {csv_file} -> {info['table']}...")
        load_table(conn, csv_file, info["table"], info["columns"])

    # Verify
    print("\n=== Row Counts ===")
    cursor = conn.cursor()
    for info in TABLE_MAP.values():
        cursor.execute(f"SELECT COUNT(*) FROM {info['table']}")
        count = cursor.fetchone()[0]
        print(f"  {info['table']:40s} {count:>12,}")
    cursor.close()

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
