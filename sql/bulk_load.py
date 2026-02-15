"""
Fast bulk load CSV data from Azure Blob Storage into Azure SQL Database.
Uses OPENROWSET(BULK...) with column ordinals to handle column mapping.
Reads SAS_TOKEN and DB_TOKEN from environment variables.
"""
import pyodbc
import struct
import os
import time

SERVER = "philly-stats-sql-01.database.windows.net"
DATABASE = "phillystats"
STORAGE_ACCOUNT = "phillyprofiteersa"
CONTAINER = "csvdata"

# Each table definition: csv filename, table name, and list of (csv_col_position, db_col_name, sql_read_type)
# csv_col_position is 1-based ordinal in the CSV file
# Columns with the_geom/the_geom_webmercator are simply omitted

TABLES = [
    {
        "csv": "dbo.philly_demolitions.csv",
        "table": "demolitions",
        "columns": [
            (1, "address", "NVARCHAR(200)"),
            (2, "addressobjectid", "NVARCHAR(20)"),
            (3, "applicantname", "NVARCHAR(200)"),
            (4, "applicanttype", "NVARCHAR(50)"),
            (5, "cartodb_id", "NVARCHAR(20)"),
            (6, "caseorpermitnumber", "NVARCHAR(30)"),
            (7, "censustract", "NVARCHAR(20)"),
            (8, "city_demo", "NVARCHAR(5)"),
            (9, "completed_date", "NVARCHAR(50)"),
            (10, "contractoraddress1", "NVARCHAR(200)"),
            (11, "contractoraddress2", "NVARCHAR(200)"),
            (12, "contractorcity", "NVARCHAR(100)"),
            (13, "contractorname", "NVARCHAR(200)"),
            (14, "contractorstate", "NVARCHAR(10)"),
            (15, "contractortype", "NVARCHAR(20)"),
            (16, "contractorzip", "NVARCHAR(20)"),
            (17, "council_district", "NVARCHAR(10)"),
            (18, "geocode_x", "NVARCHAR(50)"),
            (19, "geocode_y", "NVARCHAR(50)"),
            (20, "mostrecentinsp", "NVARCHAR(50)"),
            (21, "objectid", "NVARCHAR(20)"),
            (22, "opa_account_num", "NVARCHAR(20)"),
            (23, "opa_owner", "NVARCHAR(200)"),
            (24, "parcel_id_num", "NVARCHAR(20)"),
            (25, "posse_jobid", "NVARCHAR(20)"),
            (26, "record_type", "NVARCHAR(30)"),
            (27, "start_date", "NVARCHAR(50)"),
            (28, "status", "NVARCHAR(50)"),
            (29, "systemofrecord", "NVARCHAR(20)"),
            # 30 = the_geom (SKIP)
            # 31 = the_geom_webmercator (SKIP)
            (32, "typeofwork", "NVARCHAR(30)"),
            (33, "typeofworkdescription", "NVARCHAR(100)"),
            (34, "unit_num", "NVARCHAR(20)"),
            (35, "unit_type", "NVARCHAR(20)"),
            (36, "zip", "NVARCHAR(20)"),
        ],
        "cast": {
            "objectid": "TRY_CAST({v} AS INT)",
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "geocode_x": "TRY_CAST({v} AS FLOAT)",
            "geocode_y": "TRY_CAST({v} AS FLOAT)",
            "completed_date": "TRY_CAST({v} AS DATETIME2)",
            "mostrecentinsp": "TRY_CAST({v} AS DATETIME2)",
            "start_date": "TRY_CAST({v} AS DATETIME2)",
        },
        "pk": "objectid",
    },
    {
        "csv": "dbo.philly_appeals.csv",
        "table": "appeals",
        "columns": [
            (1, "acceleratedappeal", "NVARCHAR(30)"),
            (2, "address", "NVARCHAR(200)"),
            (3, "addressobjectid", "NVARCHAR(20)"),
            (4, "agendadescription", "NVARCHAR(MAX)"),
            (5, "appealgrounds", "NVARCHAR(MAX)"),
            (6, "appealnumber", "NVARCHAR(30)"),
            (7, "appealstatus", "NVARCHAR(20)"),
            (8, "appealtype", "NVARCHAR(100)"),
            (9, "appellanttype", "NVARCHAR(30)"),
            (10, "applicationtype", "NVARCHAR(100)"),
            (11, "cartodb_id", "NVARCHAR(20)"),
            (12, "censustract", "NVARCHAR(20)"),
            (13, "completeddate", "NVARCHAR(50)"),
            (14, "council_district", "NVARCHAR(5)"),
            (15, "createddate", "NVARCHAR(50)"),
            (16, "decision", "NVARCHAR(50)"),
            (17, "decisiondate", "NVARCHAR(50)"),
            (18, "geocode_x", "NVARCHAR(50)"),
            (19, "geocode_y", "NVARCHAR(50)"),
            (20, "internaljobid", "NVARCHAR(20)"),
            (21, "meetingnumber", "NVARCHAR(30)"),
            (22, "meetingresult", "NVARCHAR(50)"),
            (23, "objectid", "NVARCHAR(20)"),
            (24, "opa_account_num", "NVARCHAR(20)"),
            (25, "opa_owner", "NVARCHAR(200)"),
            (26, "parcel_id_num", "NVARCHAR(20)"),
            (27, "posse_jobid", "NVARCHAR(20)"),
            (28, "primaryappellant", "NVARCHAR(200)"),
            (29, "proviso", "NVARCHAR(MAX)"),
            (30, "relatedcasefile", "NVARCHAR(30)"),
            (31, "relatedpermit", "NVARCHAR(30)"),
            (32, "scheduleddate", "NVARCHAR(50)"),
            (33, "systemofrecord", "NVARCHAR(20)"),
            # 34 = the_geom (SKIP)
            # 35 = the_geom_webmercator (SKIP)
            (36, "unit_num", "NVARCHAR(20)"),
            (37, "unit_type", "NVARCHAR(20)"),
            (38, "zip", "NVARCHAR(20)"),
        ],
        "cast": {
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "objectid": "TRY_CAST({v} AS INT)",
            "geocode_x": "TRY_CAST({v} AS FLOAT)",
            "geocode_y": "TRY_CAST({v} AS FLOAT)",
            "completeddate": "TRY_CAST({v} AS DATETIME2)",
            "createddate": "TRY_CAST({v} AS DATETIME2)",
            "decisiondate": "TRY_CAST({v} AS DATETIME2)",
            "scheduleddate": "TRY_CAST({v} AS DATETIME2)",
        },
        "pk": "appealnumber",
    },
    {
        "csv": "dbo.philly_business_licenses.csv",
        "table": "business_licenses",
        "columns": [
            (1, "address", "NVARCHAR(200)"),
            (2, "addressed_license", "NVARCHAR(10)"),
            (3, "addressobjectid", "NVARCHAR(20)"),
            (4, "business_mailing_address", "NVARCHAR(500)"),
            (5, "business_name", "NVARCHAR(300)"),
            (6, "cartodb_id", "NVARCHAR(20)"),
            (7, "censustract", "NVARCHAR(20)"),
            (8, "council_district", "NVARCHAR(5)"),
            (9, "expirationdate", "NVARCHAR(50)"),
            (10, "geocode_x", "NVARCHAR(50)"),
            (11, "geocode_y", "NVARCHAR(50)"),
            (12, "inactivedate", "NVARCHAR(50)"),
            (13, "initialissuedate", "NVARCHAR(50)"),
            (14, "legalentitytype", "NVARCHAR(20)"),
            (15, "legalfirstname", "NVARCHAR(100)"),
            (16, "legallastname", "NVARCHAR(100)"),
            (17, "legalname", "NVARCHAR(300)"),
            (18, "licensenum", "NVARCHAR(20)"),
            (19, "licensestatus", "NVARCHAR(20)"),
            (20, "licensetype", "NVARCHAR(100)"),
            (21, "mostrecentissuedate", "NVARCHAR(50)"),
            (22, "numberofunits", "NVARCHAR(20)"),
            (23, "objectid", "NVARCHAR(20)"),
            (24, "opa_account_num", "NVARCHAR(20)"),
            (25, "opa_owner", "NVARCHAR(200)"),
            (26, "ownercontact1city", "NVARCHAR(100)"),
            (27, "ownercontact1mailingaddress", "NVARCHAR(500)"),
            (28, "ownercontact1name", "NVARCHAR(200)"),
            (29, "ownercontact1state", "NVARCHAR(10)"),
            (30, "ownercontact1zippostalcode", "NVARCHAR(20)"),
            (31, "ownercontact2city", "NVARCHAR(100)"),
            (32, "ownercontact2mailingaddress", "NVARCHAR(500)"),
            (33, "ownercontact2name", "NVARCHAR(200)"),
            (34, "ownercontact2state", "NVARCHAR(10)"),
            (35, "ownercontact2zippostalcode", "NVARCHAR(20)"),
            (36, "owneroccupied", "NVARCHAR(10)"),
            (37, "parcel_id_num", "NVARCHAR(20)"),
            (38, "posse_jobid", "NVARCHAR(20)"),
            (39, "rentalcategory", "NVARCHAR(50)"),
            (40, "revenuecode", "NVARCHAR(10)"),
            # 41 = the_geom (SKIP)
            # 42 = the_geom_webmercator (SKIP)
            (43, "unit_num", "NVARCHAR(20)"),
            (44, "unit_type", "NVARCHAR(20)"),
            (45, "zip", "NVARCHAR(20)"),
        ],
        "cast": {
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "objectid": "TRY_CAST({v} AS INT)",
            "numberofunits": "TRY_CAST({v} AS INT)",
            "geocode_x": "TRY_CAST({v} AS FLOAT)",
            "geocode_y": "TRY_CAST({v} AS FLOAT)",
            "expirationdate": "TRY_CAST({v} AS DATETIME2)",
            "inactivedate": "TRY_CAST({v} AS DATETIME2)",
            "initialissuedate": "TRY_CAST({v} AS DATETIME2)",
            "mostrecentissuedate": "TRY_CAST({v} AS DATETIME2)",
        },
        "pk": "licensenum",
    },
    {
        "csv": "dbo.philly_com_act_licenses.csv",
        "table": "commercial_activity_licenses",
        "columns": [
            (1, "cartodb_id", "NVARCHAR(20)"),
            (2, "companyname", "NVARCHAR(300)"),
            (3, "issuedate", "NVARCHAR(50)"),
            (4, "legalentitytype", "NVARCHAR(20)"),
            (5, "legalfirstname", "NVARCHAR(100)"),
            (6, "legallastname", "NVARCHAR(100)"),
            (7, "licensenum", "NVARCHAR(20)"),
            (8, "licensestatus", "NVARCHAR(20)"),
            (9, "licensetype", "NVARCHAR(50)"),
            (10, "objectid", "NVARCHAR(20)"),
            (11, "ownercontact1city", "NVARCHAR(100)"),
            (12, "ownercontact1mailingaddress", "NVARCHAR(500)"),
            (13, "ownercontact1name", "NVARCHAR(200)"),
            (14, "ownercontact1state", "NVARCHAR(10)"),
            (15, "ownercontact1zippostalcode", "NVARCHAR(20)"),
            (16, "ownercontact2city", "NVARCHAR(100)"),
            (17, "ownercontact2mailingaddress", "NVARCHAR(500)"),
            (18, "ownercontact2name", "NVARCHAR(200)"),
            (19, "ownercontact2state", "NVARCHAR(10)"),
            (20, "ownercontact2zippostalcode", "NVARCHAR(20)"),
            (21, "posse_jobid", "NVARCHAR(20)"),
            (22, "revenuecode", "NVARCHAR(10)"),
            # 23 = the_geom (SKIP)
            # 24 = the_geom_webmercator (SKIP)
        ],
        "cast": {
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "objectid": "TRY_CAST({v} AS INT)",
            "issuedate": "TRY_CAST({v} AS DATETIME2)",
        },
        "pk": "licensenum",
    },
    {
        "csv": "dbo.philly_opa_properties_public_pde.csv",
        "table": "opa_properties",
        "columns": [
            (1, "address_std", "NVARCHAR(200)"),
            (2, "assessment_date", "NVARCHAR(50)"),
            (3, "basements", "NVARCHAR(50)"),
            (4, "beginning_point", "NVARCHAR(200)"),
            (5, "book_and_page", "NVARCHAR(20)"),
            (6, "building_code", "NVARCHAR(10)"),
            (7, "building_code_description", "NVARCHAR(100)"),
            (8, "building_code_description_new", "NVARCHAR(100)"),
            (9, "building_code_new", "NVARCHAR(10)"),
            # 10 = cartodb_id (SKIP)
            (11, "category_code", "NVARCHAR(10)"),
            (12, "category_code_description", "NVARCHAR(50)"),
            (13, "census_tract", "NVARCHAR(20)"),
            (14, "central_air", "NVARCHAR(5)"),
            (15, "council_district_2016", "NVARCHAR(5)"),
            (16, "council_district_2024", "NVARCHAR(5)"),
            (17, "cross_reference", "NVARCHAR(20)"),
            (18, "date_exterior_condition", "NVARCHAR(50)"),
            (19, "depth", "NVARCHAR(50)"),
            (20, "elementary_school", "NVARCHAR(100)"),
            (21, "exempt_building", "NVARCHAR(50)"),
            (22, "exempt_land", "NVARCHAR(50)"),
            (23, "exterior_condition", "NVARCHAR(10)"),
            (24, "fireplaces", "NVARCHAR(20)"),
            (25, "frontage", "NVARCHAR(50)"),
            (26, "garage_spaces", "NVARCHAR(20)"),
            (27, "garage_type", "NVARCHAR(20)"),
            (28, "general_construction", "NVARCHAR(50)"),
            (29, "geocode_lat", "NVARCHAR(50)"),
            (30, "geocode_lon", "NVARCHAR(50)"),
            (31, "high_school", "NVARCHAR(100)"),
            (32, "homestead_exemption", "NVARCHAR(20)"),
            (33, "house_extension", "NVARCHAR(10)"),
            (34, "house_number", "NVARCHAR(20)"),
            (35, "interior_condition", "NVARCHAR(10)"),
            (36, "li_district", "NVARCHAR(50)"),
            (37, "location", "NVARCHAR(200)"),
            (38, "mailing_address_1", "NVARCHAR(200)"),
            (39, "mailing_address_2", "NVARCHAR(200)"),
            (40, "mailing_care_of", "NVARCHAR(200)"),
            (41, "mailing_city_state", "NVARCHAR(100)"),
            (42, "mailing_street", "NVARCHAR(200)"),
            (43, "mailing_zip", "NVARCHAR(20)"),
            (44, "market_value", "NVARCHAR(50)"),
            (45, "market_value_date", "NVARCHAR(50)"),
            (46, "middle_school", "NVARCHAR(100)"),
            (47, "number_of_bathrooms", "NVARCHAR(20)"),
            (48, "number_of_bedrooms", "NVARCHAR(20)"),
            (49, "number_of_rooms", "NVARCHAR(20)"),
            (50, "number_stories", "NVARCHAR(20)"),
            # 51 = objectid (SKIP)
            (52, "off_street_open", "NVARCHAR(20)"),
            (53, "other_building", "NVARCHAR(50)"),
            (54, "owner_1", "NVARCHAR(200)"),
            (55, "owner_2", "NVARCHAR(200)"),
            (56, "parcel_number", "NVARCHAR(20)"),
            (57, "parcel_shape", "NVARCHAR(5)"),
            (58, "pin", "NVARCHAR(20)"),
            (59, "police_district", "NVARCHAR(10)"),
            (60, "political_district", "NVARCHAR(10)"),
            (61, "political_ward", "NVARCHAR(10)"),
            (62, "pwd_parcel_id", "NVARCHAR(20)"),
            (63, "quality_grade", "NVARCHAR(10)"),
            (64, "recording_date", "NVARCHAR(50)"),
            (65, "registry_number", "NVARCHAR(30)"),
            (66, "rubbish_recycle_day", "NVARCHAR(10)"),
            (67, "sale_date", "NVARCHAR(50)"),
            (68, "sale_price", "NVARCHAR(50)"),
            (69, "separate_utilities", "NVARCHAR(10)"),
            (70, "site_type", "NVARCHAR(10)"),
            (71, "state_code", "NVARCHAR(10)"),
            (72, "street_code", "NVARCHAR(10)"),
            (73, "street_designation", "NVARCHAR(10)"),
            (74, "street_direction", "NVARCHAR(5)"),
            (75, "street_name", "NVARCHAR(50)"),
            (76, "suffix", "NVARCHAR(10)"),
            (77, "taxable_building", "NVARCHAR(50)"),
            (78, "taxable_land", "NVARCHAR(50)"),
            # 79 = the_geom (SKIP)
            # 80 = the_geom_webmercator (SKIP)
            (81, "topography", "NVARCHAR(10)"),
            (82, "total_area", "NVARCHAR(50)"),
            (83, "total_livable_area", "NVARCHAR(50)"),
            (84, "type_heater", "NVARCHAR(10)"),
            (85, "unfinished", "NVARCHAR(10)"),
            (86, "unit", "NVARCHAR(20)"),
            (87, "view_type", "NVARCHAR(10)"),
            (88, "year_built", "NVARCHAR(10)"),
            (89, "year_built_estimate", "NVARCHAR(10)"),
            (90, "zip_code", "NVARCHAR(20)"),
            (91, "zoning", "NVARCHAR(20)"),
        ],
        "cast": {
            "assessment_date": "TRY_CAST({v} AS DATETIME2)",
            "date_exterior_condition": "TRY_CAST({v} AS DATETIME2)",
            "market_value_date": "TRY_CAST({v} AS DATETIME2)",
            "recording_date": "TRY_CAST({v} AS DATETIME2)",
            "sale_date": "TRY_CAST({v} AS DATETIME2)",
            "depth": "TRY_CAST({v} AS FLOAT)",
            "frontage": "TRY_CAST({v} AS FLOAT)",
            "geocode_lat": "TRY_CAST({v} AS FLOAT)",
            "geocode_lon": "TRY_CAST({v} AS FLOAT)",
            "number_stories": "TRY_CAST({v} AS FLOAT)",
            "total_area": "TRY_CAST({v} AS FLOAT)",
            "total_livable_area": "TRY_CAST({v} AS FLOAT)",
            "exempt_building": "TRY_CAST({v} AS DECIMAL(18,2))",
            "exempt_land": "TRY_CAST({v} AS DECIMAL(18,2))",
            "market_value": "TRY_CAST({v} AS DECIMAL(18,2))",
            "sale_price": "TRY_CAST({v} AS DECIMAL(18,2))",
            "taxable_building": "TRY_CAST({v} AS DECIMAL(18,2))",
            "taxable_land": "TRY_CAST({v} AS DECIMAL(18,2))",
            "fireplaces": "TRY_CAST({v} AS INT)",
            "garage_spaces": "TRY_CAST({v} AS INT)",
            "homestead_exemption": "TRY_CAST({v} AS INT)",
            "number_of_bathrooms": "TRY_CAST({v} AS INT)",
            "number_of_bedrooms": "TRY_CAST({v} AS INT)",
            "number_of_rooms": "TRY_CAST({v} AS INT)",
            "off_street_open": "TRY_CAST({v} AS INT)",
        },
        "pk": "parcel_number",
    },
    {
        "csv": "dbo.masteraddress.csv",
        "table": "master_address",
        "columns": [
            (1, "master_address_id", "NVARCHAR(100)"),
            (2, "address_text", "NVARCHAR(400)"),
        ],
        "cast": {
            "master_address_id": "TRY_CAST({v} AS UNIQUEIDENTIFIER)",
        },
        "pk": "master_address_id",
    },
    {
        "csv": "dbo.masterentity.csv",
        "table": "master_entity",
        "columns": [
            (1, "master_entity_id", "NVARCHAR(100)"),
            (2, "name_text", "NVARCHAR(400)"),
        ],
        "cast": {
            "master_entity_id": "TRY_CAST({v} AS UNIQUEIDENTIFIER)",
        },
        "pk": "master_entity_id",
    },
    {
        "csv": "dbo.philly_case_investigations.csv",
        "table": "case_investigations",
        "columns": [
            (1, "address", "NVARCHAR(200)"),
            (2, "addressobjectid", "NVARCHAR(20)"),
            (3, "cartodb_id", "NVARCHAR(20)"),
            (4, "casenumber", "NVARCHAR(30)"),
            (5, "casepriority", "NVARCHAR(20)"),
            (6, "caseresponsibility", "NVARCHAR(100)"),
            (7, "casetype", "NVARCHAR(50)"),
            (8, "censustract", "NVARCHAR(20)"),
            (9, "council_district", "NVARCHAR(5)"),
            (10, "geocode_x", "NVARCHAR(50)"),
            (11, "geocode_y", "NVARCHAR(50)"),
            (12, "investigationcompleted", "NVARCHAR(50)"),
            (13, "investigationprocessid", "NVARCHAR(20)"),
            (14, "investigationstatus", "NVARCHAR(20)"),
            (15, "investigationtype", "NVARCHAR(50)"),
            (16, "objectid", "NVARCHAR(20)"),
            (17, "opa_account_num", "NVARCHAR(20)"),
            (18, "opa_owner", "NVARCHAR(200)"),
            (19, "parcel_id_num", "NVARCHAR(20)"),
            (20, "posse_jobid", "NVARCHAR(20)"),
            (21, "systemofrecord", "NVARCHAR(20)"),
            # 22 = the_geom (SKIP)
            # 23 = the_geom_webmercator (SKIP)
            (24, "unit_num", "NVARCHAR(20)"),
            (25, "unit_type", "NVARCHAR(20)"),
            (26, "zip", "NVARCHAR(20)"),
        ],
        "cast": {
            "objectid": "TRY_CAST({v} AS INT)",
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "geocode_x": "TRY_CAST({v} AS FLOAT)",
            "geocode_y": "TRY_CAST({v} AS FLOAT)",
            "investigationcompleted": "TRY_CAST({v} AS DATETIME2)",
        },
        "pk": "objectid",
    },
    {
        "csv": "dbo.philly_assessments.csv",
        "table": "assessments",
        "columns": [
            (1, "cartodb_id", "NVARCHAR(20)"),
            (2, "exempt_building", "NVARCHAR(50)"),
            (3, "exempt_land", "NVARCHAR(50)"),
            (4, "market_value", "NVARCHAR(50)"),
            (5, "parcel_number", "NVARCHAR(20)"),
            (6, "taxable_building", "NVARCHAR(50)"),
            (7, "taxable_land", "NVARCHAR(50)"),
            # 8 = the_geom (SKIP)
            # 9 = the_geom_webmercator (SKIP)
            (10, "year", "NVARCHAR(10)"),
        ],
        "cast": {
            "cartodb_id": "TRY_CAST({v} AS INT)",
            "exempt_building": "TRY_CAST({v} AS DECIMAL(18,2))",
            "exempt_land": "TRY_CAST({v} AS DECIMAL(18,2))",
            "market_value": "TRY_CAST({v} AS DECIMAL(18,2))",
            "taxable_building": "TRY_CAST({v} AS DECIMAL(18,2))",
            "taxable_land": "TRY_CAST({v} AS DECIMAL(18,2))",
            "year": "TRY_CAST({v} AS INT)",
        },
        "pk": "parcel_number",
    },
    {
        "csv": "dbo.masterentityaddress.csv",
        "table": "master_entity_address",
        "columns": [
            (1, "master_entity_address_id", "NVARCHAR(100)"),
            (2, "master_entity_id", "NVARCHAR(100)"),
            (3, "master_address_id", "NVARCHAR(100)"),
            (4, "parcel_number", "NVARCHAR(20)"),
            (5, "notes", "NVARCHAR(2000)"),
        ],
        "cast": {
            "master_entity_address_id": "TRY_CAST({v} AS UNIQUEIDENTIFIER)",
            "master_entity_id": "TRY_CAST({v} AS UNIQUEIDENTIFIER)",
            "master_address_id": "TRY_CAST({v} AS UNIQUEIDENTIFIER)",
        },
        "pk": "master_entity_address_id",
    },
]


def get_sql_connection():
    token = os.environ["DB_TOKEN"]
    token_bytes = token.encode("utf-16-le")
    token_struct = struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)
    return pyodbc.connect(
        f"Driver={{ODBC Driver 17 for SQL Server}};"
        f"Server={SERVER};"
        f"Database={DATABASE};",
        attrs_before={1256: token_struct},
        autocommit=True,
    )


def setup_external_source(conn, sas_token):
    """Create or update the external data source in SQL."""
    cursor = conn.cursor()

    # Create master key if not exists
    try:
        cursor.execute("CREATE MASTER KEY ENCRYPTION BY PASSWORD = 'BulkL0ad!Key2024'")
    except:
        pass  # already exists

    # Drop external data source first (it references the credential)
    try:
        cursor.execute("DROP EXTERNAL DATA SOURCE CsvBlobStorage")
    except:
        pass

    # Now drop credential (no longer referenced)
    try:
        cursor.execute("DROP DATABASE SCOPED CREDENTIAL BlobSasCredential")
    except:
        pass

    cursor.execute(f"""
        CREATE DATABASE SCOPED CREDENTIAL BlobSasCredential
        WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
        SECRET = '{sas_token}'
    """)

    cursor.execute(f"""
        CREATE EXTERNAL DATA SOURCE CsvBlobStorage
        WITH (
            TYPE = BLOB_STORAGE,
            LOCATION = 'https://{STORAGE_ACCOUNT}.blob.core.windows.net/{CONTAINER}',
            CREDENTIAL = BlobSasCredential
        )
    """)

    cursor.close()
    print("External data source configured.")


def build_openrowset_query(table_info):
    """Build an INSERT...SELECT FROM OPENROWSET query for a table."""
    columns = table_info["columns"]
    cast_map = table_info.get("cast", {})
    csv_name = table_info["csv"]
    table_name = table_info["table"]

    # Build WITH clause: alias type ordinal
    with_parts = []
    for pos, col_name, sql_type in columns:
        alias = f"c_{col_name}"
        with_parts.append(f"        {alias} {sql_type} {pos}")

    with_clause = ",\n".join(with_parts)

    # Build SELECT expressions (with casts/NULLIF)
    select_parts = []
    db_cols = []
    for pos, col_name, sql_type in columns:
        alias = f"c_{col_name}"
        if col_name in cast_map:
            expr = cast_map[col_name].format(v=f"NULLIF(LTRIM(RTRIM({alias})), '')")
        else:
            expr = f"NULLIF(LTRIM(RTRIM({alias})), '')"
        select_parts.append(f"        {expr}")
        db_cols.append(col_name)

    select_clause = ",\n".join(select_parts)
    col_list = ", ".join(db_cols)

    # Build the PK filter (skip rows where PK is null after cast)
    pk = table_info.get("pk", "")
    pk_filter = ""
    if pk:
        pk_alias = f"c_{pk}"
        empty = "''"
        nullif_expr = f"NULLIF(LTRIM(RTRIM({pk_alias})), {empty})"
        if pk in cast_map:
            pk_check = cast_map[pk].format(v=nullif_expr)
        else:
            pk_check = nullif_expr
        pk_filter = f"\n    WHERE {pk_check} IS NOT NULL"

    query = f"""INSERT INTO {table_name} ({col_list})
    SELECT
{select_clause}
    FROM OPENROWSET(
        BULK '{csv_name}',
        DATA_SOURCE = 'CsvBlobStorage',
        FORMAT = 'CSV',
        FIRSTROW = 2,
        FIELDQUOTE = '"'
    ) WITH (
{with_clause}
    ) AS r{pk_filter}"""

    return query


def bulk_load_table(conn, table_info):
    """Load a table using OPENROWSET."""
    cursor = conn.cursor()
    table_name = table_info["table"]
    csv_name = table_info["csv"]
    start = time.time()

    print(f"\n  Loading {table_name} from {csv_name}...")

    query = build_openrowset_query(table_info)

    try:
        cursor.execute(query)
        elapsed = time.time() - start

        # Get row count
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        rate = count / elapsed if elapsed > 0 else 0
        print(f"  {table_name}: {count:,} rows loaded in {elapsed:.1f}s ({rate:,.0f} rows/sec)")

    except Exception as e:
        elapsed = time.time() - start
        print(f"  {table_name}: ERROR after {elapsed:.1f}s: {str(e)[:500]}")

    cursor.close()


def main():
    print("=== Fast Bulk Load: Blob Storage -> Azure SQL ===\n")

    # Get SAS token from env
    sas_token = os.environ.get("SAS_TOKEN", "")
    if not sas_token:
        print("ERROR: SAS_TOKEN environment variable not set")
        return
    print(f"SAS token (length: {len(sas_token)})")

    # Connect to SQL
    conn = get_sql_connection()

    # Setup external data source
    setup_external_source(conn, sas_token)

    # Load each table
    total_start = time.time()
    for table_info in TABLES:
        bulk_load_table(conn, table_info)

    total_elapsed = time.time() - total_start

    # Final verification
    print(f"\n=== Completed in {total_elapsed:.0f}s ===\n")
    print("Row counts:")
    cursor = conn.cursor()
    for table_info in TABLES:
        cursor.execute(f"SELECT COUNT(*) FROM {table_info['table']}")
        count = cursor.fetchone()[0]
        print(f"  {table_info['table']:40s} {count:>12,}")
    cursor.close()

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
