-- Philly Poverty Profiteering - Azure SQL Schema
-- 10 tables derived from Philadelphia public data

-- ============================================================
-- CORE ENTITY RESOLUTION TABLES
-- These form the graph linking entities to addresses to parcels
-- ============================================================

CREATE TABLE master_entity (
    master_entity_id    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    name_text           NVARCHAR(400) NULL
);

CREATE TABLE master_address (
    master_address_id   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    address_text        NVARCHAR(400) NULL
);

CREATE TABLE master_entity_address (
    master_entity_address_id    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    master_entity_id            UNIQUEIDENTIFIER NULL,
    master_address_id           UNIQUEIDENTIFIER NULL,
    parcel_number               VARCHAR(20) NULL,
    notes                       NVARCHAR(2000) NULL
);

-- ============================================================
-- PROPERTY TABLES
-- ============================================================

CREATE TABLE opa_properties (
    parcel_number                   VARCHAR(20) NOT NULL PRIMARY KEY,
    address_std                     NVARCHAR(200) NULL,
    assessment_date                 DATETIME2 NULL,
    basements                       NVARCHAR(50) NULL,
    beginning_point                 NVARCHAR(200) NULL,
    book_and_page                   VARCHAR(20) NULL,
    building_code                   VARCHAR(10) NULL,
    building_code_description       NVARCHAR(100) NULL,
    building_code_description_new   NVARCHAR(100) NULL,
    building_code_new               VARCHAR(10) NULL,
    category_code                   VARCHAR(10) NULL,
    category_code_description       NVARCHAR(50) NULL,
    census_tract                    VARCHAR(20) NULL,
    central_air                     VARCHAR(5) NULL,
    council_district_2016           VARCHAR(5) NULL,
    council_district_2024           VARCHAR(5) NULL,
    cross_reference                 VARCHAR(20) NULL,
    date_exterior_condition         DATETIME2 NULL,
    depth                           FLOAT NULL,
    elementary_school               NVARCHAR(100) NULL,
    exempt_building                 DECIMAL(18,2) NULL,
    exempt_land                     DECIMAL(18,2) NULL,
    exterior_condition              VARCHAR(10) NULL,
    fireplaces                      INT NULL,
    frontage                        FLOAT NULL,
    garage_spaces                   INT NULL,
    garage_type                     VARCHAR(20) NULL,
    general_construction            NVARCHAR(50) NULL,
    geocode_lat                     FLOAT NULL,
    geocode_lon                     FLOAT NULL,
    high_school                     NVARCHAR(100) NULL,
    homestead_exemption             INT NULL,
    house_extension                 VARCHAR(10) NULL,
    house_number                    VARCHAR(20) NULL,
    interior_condition              VARCHAR(10) NULL,
    li_district                     NVARCHAR(50) NULL,
    location                        NVARCHAR(200) NULL,
    mailing_address_1               NVARCHAR(200) NULL,
    mailing_address_2               NVARCHAR(200) NULL,
    mailing_care_of                 NVARCHAR(200) NULL,
    mailing_city_state              NVARCHAR(100) NULL,
    mailing_street                  NVARCHAR(200) NULL,
    mailing_zip                     VARCHAR(20) NULL,
    market_value                    DECIMAL(18,2) NULL,
    market_value_date               DATETIME2 NULL,
    middle_school                   NVARCHAR(100) NULL,
    number_of_bathrooms             INT NULL,
    number_of_bedrooms              INT NULL,
    number_of_rooms                 INT NULL,
    number_stories                  FLOAT NULL,
    off_street_open                 INT NULL,
    other_building                  NVARCHAR(50) NULL,
    owner_1                         NVARCHAR(200) NULL,
    owner_2                         NVARCHAR(200) NULL,
    parcel_shape                    VARCHAR(5) NULL,
    pin                             VARCHAR(20) NULL,
    police_district                 VARCHAR(10) NULL,
    political_district              VARCHAR(10) NULL,
    political_ward                  VARCHAR(10) NULL,
    pwd_parcel_id                   VARCHAR(20) NULL,
    quality_grade                   VARCHAR(10) NULL,
    recording_date                  DATETIME2 NULL,
    registry_number                 VARCHAR(30) NULL,
    rubbish_recycle_day             VARCHAR(10) NULL,
    sale_date                       DATETIME2 NULL,
    sale_price                      DECIMAL(18,2) NULL,
    separate_utilities              VARCHAR(10) NULL,
    site_type                       VARCHAR(10) NULL,
    state_code                      VARCHAR(10) NULL,
    street_code                     VARCHAR(10) NULL,
    street_designation              VARCHAR(10) NULL,
    street_direction                VARCHAR(5) NULL,
    street_name                     NVARCHAR(50) NULL,
    suffix                          VARCHAR(10) NULL,
    taxable_building                DECIMAL(18,2) NULL,
    taxable_land                    DECIMAL(18,2) NULL,
    topography                      VARCHAR(10) NULL,
    total_area                      FLOAT NULL,
    total_livable_area              FLOAT NULL,
    type_heater                     VARCHAR(10) NULL,
    unfinished                      VARCHAR(10) NULL,
    unit                            VARCHAR(20) NULL,
    view_type                       VARCHAR(10) NULL,
    year_built                      VARCHAR(10) NULL,
    year_built_estimate             VARCHAR(10) NULL,
    zip_code                        VARCHAR(20) NULL,
    zoning                          VARCHAR(20) NULL
);

CREATE TABLE assessments (
    cartodb_id          INT NOT NULL,
    parcel_number       VARCHAR(20) NOT NULL,
    year                INT NOT NULL,
    market_value        DECIMAL(18,2) NULL,
    taxable_building    DECIMAL(18,2) NULL,
    taxable_land        DECIMAL(18,2) NULL,
    exempt_building     DECIMAL(18,2) NULL,
    exempt_land         DECIMAL(18,2) NULL,
    CONSTRAINT PK_assessments PRIMARY KEY (parcel_number, year)
);

-- ============================================================
-- LICENSE TABLES
-- ============================================================

CREATE TABLE business_licenses (
    licensenum                      VARCHAR(20) NOT NULL PRIMARY KEY,
    address                         NVARCHAR(200) NULL,
    addressed_license               VARCHAR(10) NULL,
    addressobjectid                 VARCHAR(20) NULL,
    business_mailing_address        NVARCHAR(500) NULL,
    business_name                   NVARCHAR(300) NULL,
    cartodb_id                      INT NULL,
    censustract                     VARCHAR(20) NULL,
    council_district                VARCHAR(5) NULL,
    expirationdate                  DATETIME2 NULL,
    geocode_x                       FLOAT NULL,
    geocode_y                       FLOAT NULL,
    inactivedate                    DATETIME2 NULL,
    initialissuedate                DATETIME2 NULL,
    legalentitytype                 VARCHAR(20) NULL,
    legalfirstname                  NVARCHAR(100) NULL,
    legallastname                   NVARCHAR(100) NULL,
    legalname                       NVARCHAR(300) NULL,
    licensestatus                   VARCHAR(20) NULL,
    licensetype                     NVARCHAR(100) NULL,
    mostrecentissuedate             DATETIME2 NULL,
    numberofunits                   INT NULL,
    objectid                        INT NULL,
    opa_account_num                 VARCHAR(20) NULL,
    opa_owner                       NVARCHAR(200) NULL,
    ownercontact1city               NVARCHAR(100) NULL,
    ownercontact1mailingaddress     NVARCHAR(500) NULL,
    ownercontact1name               NVARCHAR(200) NULL,
    ownercontact1state              VARCHAR(10) NULL,
    ownercontact1zippostalcode      VARCHAR(20) NULL,
    ownercontact2city               NVARCHAR(100) NULL,
    ownercontact2mailingaddress     NVARCHAR(500) NULL,
    ownercontact2name               NVARCHAR(200) NULL,
    ownercontact2state              VARCHAR(10) NULL,
    ownercontact2zippostalcode      VARCHAR(20) NULL,
    owneroccupied                   VARCHAR(10) NULL,
    parcel_id_num                   VARCHAR(20) NULL,
    posse_jobid                     VARCHAR(20) NULL,
    rentalcategory                  NVARCHAR(50) NULL,
    revenuecode                     VARCHAR(10) NULL,
    unit_num                        VARCHAR(20) NULL,
    unit_type                       VARCHAR(20) NULL,
    zip                             VARCHAR(20) NULL
);

CREATE TABLE commercial_activity_licenses (
    cartodb_id                      INT NULL,
    companyname                     NVARCHAR(300) NULL,
    issuedate                       DATETIME2 NULL,
    legalentitytype                 VARCHAR(20) NULL,
    legalfirstname                  NVARCHAR(100) NULL,
    legallastname                   NVARCHAR(100) NULL,
    licensenum                      VARCHAR(20) NOT NULL PRIMARY KEY,
    licensestatus                   VARCHAR(20) NULL,
    licensetype                     NVARCHAR(50) NULL,
    objectid                        INT NULL,
    ownercontact1city               NVARCHAR(100) NULL,
    ownercontact1mailingaddress     NVARCHAR(500) NULL,
    ownercontact1name               NVARCHAR(200) NULL,
    ownercontact1state              VARCHAR(10) NULL,
    ownercontact1zippostalcode      VARCHAR(20) NULL,
    ownercontact2city               NVARCHAR(100) NULL,
    ownercontact2mailingaddress     NVARCHAR(500) NULL,
    ownercontact2name               NVARCHAR(200) NULL,
    ownercontact2state              VARCHAR(10) NULL,
    ownercontact2zippostalcode      VARCHAR(20) NULL,
    posse_jobid                     VARCHAR(20) NULL,
    revenuecode                     VARCHAR(10) NULL
);

-- ============================================================
-- ENFORCEMENT TABLES
-- ============================================================

CREATE TABLE case_investigations (
    objectid                    INT NOT NULL PRIMARY KEY,
    address                     NVARCHAR(200) NULL,
    addressobjectid             VARCHAR(20) NULL,
    cartodb_id                  INT NULL,
    casenumber                  VARCHAR(30) NULL,
    casepriority                VARCHAR(20) NULL,
    caseresponsibility          NVARCHAR(100) NULL,
    casetype                    NVARCHAR(50) NULL,
    censustract                 VARCHAR(20) NULL,
    council_district            VARCHAR(5) NULL,
    geocode_x                   FLOAT NULL,
    geocode_y                   FLOAT NULL,
    investigationcompleted      DATETIME2 NULL,
    investigationprocessid      VARCHAR(20) NULL,
    investigationstatus         VARCHAR(20) NULL,
    investigationtype           NVARCHAR(50) NULL,
    opa_account_num             VARCHAR(20) NULL,
    opa_owner                   NVARCHAR(200) NULL,
    parcel_id_num               VARCHAR(20) NULL,
    posse_jobid                 VARCHAR(20) NULL,
    systemofrecord              VARCHAR(20) NULL,
    unit_num                    VARCHAR(20) NULL,
    unit_type                   VARCHAR(20) NULL,
    zip                         VARCHAR(20) NULL
);

CREATE TABLE appeals (
    appealnumber                VARCHAR(30) NOT NULL PRIMARY KEY,
    acceleratedappeal           VARCHAR(30) NULL,
    address                     NVARCHAR(200) NULL,
    addressobjectid             VARCHAR(20) NULL,
    agendadescription           NVARCHAR(MAX) NULL,
    appealgrounds               NVARCHAR(MAX) NULL,
    appealstatus                VARCHAR(20) NULL,
    appealtype                  NVARCHAR(100) NULL,
    appellanttype               VARCHAR(30) NULL,
    applicationtype             NVARCHAR(100) NULL,
    cartodb_id                  INT NULL,
    censustract                 VARCHAR(20) NULL,
    completeddate               DATETIME2 NULL,
    council_district            VARCHAR(5) NULL,
    createddate                 DATETIME2 NULL,
    decision                    NVARCHAR(50) NULL,
    decisiondate                DATETIME2 NULL,
    geocode_x                   FLOAT NULL,
    geocode_y                   FLOAT NULL,
    internaljobid               VARCHAR(20) NULL,
    meetingnumber               VARCHAR(30) NULL,
    meetingresult               NVARCHAR(50) NULL,
    objectid                    INT NULL,
    opa_account_num             VARCHAR(20) NULL,
    opa_owner                   NVARCHAR(200) NULL,
    parcel_id_num               VARCHAR(20) NULL,
    posse_jobid                 VARCHAR(20) NULL,
    primaryappellant            NVARCHAR(200) NULL,
    proviso                     NVARCHAR(MAX) NULL,
    relatedcasefile             VARCHAR(30) NULL,
    relatedpermit               VARCHAR(30) NULL,
    scheduleddate               DATETIME2 NULL,
    systemofrecord              VARCHAR(20) NULL,
    unit_num                    VARCHAR(20) NULL,
    unit_type                   VARCHAR(20) NULL,
    zip                         VARCHAR(20) NULL
);

CREATE TABLE demolitions (
    objectid                    INT NOT NULL PRIMARY KEY,
    address                     NVARCHAR(200) NULL,
    addressobjectid             VARCHAR(20) NULL,
    applicantname               NVARCHAR(200) NULL,
    applicanttype               VARCHAR(50) NULL,
    cartodb_id                  INT NULL,
    caseorpermitnumber          VARCHAR(30) NULL,
    censustract                 VARCHAR(20) NULL,
    city_demo                   VARCHAR(5) NULL,
    completed_date              DATETIME2 NULL,
    contractoraddress1          NVARCHAR(200) NULL,
    contractoraddress2          NVARCHAR(200) NULL,
    contractorcity              NVARCHAR(100) NULL,
    contractorname              NVARCHAR(200) NULL,
    contractorstate             VARCHAR(10) NULL,
    contractortype              VARCHAR(20) NULL,
    contractorzip               VARCHAR(20) NULL,
    council_district            VARCHAR(10) NULL,
    geocode_x                   FLOAT NULL,
    geocode_y                   FLOAT NULL,
    mostrecentinsp              DATETIME2 NULL,
    opa_account_num             VARCHAR(20) NULL,
    opa_owner                   NVARCHAR(200) NULL,
    parcel_id_num               VARCHAR(20) NULL,
    posse_jobid                 VARCHAR(20) NULL,
    record_type                 VARCHAR(30) NULL,
    start_date                  DATETIME2 NULL,
    status                      VARCHAR(50) NULL,
    systemofrecord              VARCHAR(20) NULL,
    typeofwork                  VARCHAR(30) NULL,
    typeofworkdescription       NVARCHAR(100) NULL,
    unit_num                    VARCHAR(20) NULL,
    unit_type                   VARCHAR(20) NULL,
    zip                         VARCHAR(20) NULL
);

-- ============================================================
-- INDEXES for poverty profiteering queries
-- ============================================================

-- Entity resolution graph traversal
CREATE NONCLUSTERED INDEX IX_mea_entity_id ON master_entity_address (master_entity_id);
CREATE NONCLUSTERED INDEX IX_mea_address_id ON master_entity_address (master_address_id);
CREATE NONCLUSTERED INDEX IX_mea_parcel ON master_entity_address (parcel_number) WHERE parcel_number IS NOT NULL;

-- Entity name search
CREATE NONCLUSTERED INDEX IX_entity_name ON master_entity (name_text);

-- Address text search
CREATE NONCLUSTERED INDEX IX_address_text ON master_address (address_text);

-- Property lookups
CREATE NONCLUSTERED INDEX IX_opa_owner1 ON opa_properties (owner_1);
CREATE NONCLUSTERED INDEX IX_opa_zip ON opa_properties (zip_code);
CREATE NONCLUSTERED INDEX IX_opa_census ON opa_properties (census_tract);
CREATE NONCLUSTERED INDEX IX_opa_category ON opa_properties (category_code);

-- Assessment lookups
CREATE NONCLUSTERED INDEX IX_assess_parcel ON assessments (parcel_number, year);

-- Business license lookups
CREATE NONCLUSTERED INDEX IX_bl_opa ON business_licenses (opa_account_num) WHERE opa_account_num IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_bl_type ON business_licenses (licensetype);
CREATE NONCLUSTERED INDEX IX_bl_zip ON business_licenses (zip);
CREATE NONCLUSTERED INDEX IX_bl_name ON business_licenses (business_name);

-- Commercial activity license lookups
CREATE NONCLUSTERED INDEX IX_cal_company ON commercial_activity_licenses (companyname);
CREATE NONCLUSTERED INDEX IX_cal_revenue ON commercial_activity_licenses (revenuecode);

-- Case investigation lookups
CREATE NONCLUSTERED INDEX IX_ci_opa ON case_investigations (opa_account_num) WHERE opa_account_num IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_ci_status ON case_investigations (investigationstatus);
CREATE NONCLUSTERED INDEX IX_ci_zip ON case_investigations (zip);
CREATE NONCLUSTERED INDEX IX_ci_owner ON case_investigations (opa_owner);

-- Appeal lookups
CREATE NONCLUSTERED INDEX IX_app_opa ON appeals (opa_account_num) WHERE opa_account_num IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_app_owner ON appeals (opa_owner);

-- Demolition lookups
CREATE NONCLUSTERED INDEX IX_demo_opa ON demolitions (opa_account_num) WHERE opa_account_num IS NOT NULL;
CREATE NONCLUSTERED INDEX IX_demo_owner ON demolitions (opa_owner);
CREATE NONCLUSTERED INDEX IX_demo_type ON demolitions (applicanttype);

-- ============================================================
-- VIEWS for common poverty profiteering queries
-- ============================================================

-- Entity property lookup (combines entity resolution graph with property data)
CREATE VIEW vw_entity_properties AS
SELECT
    e.master_entity_id,
    e.name_text AS entity_name,
    a.address_text,
    ea.parcel_number,
    p.owner_1,
    p.address_std AS property_address,
    p.category_code_description,
    p.market_value,
    p.zip_code,
    p.census_tract,
    p.homestead_exemption
FROM master_entity e
JOIN master_entity_address ea ON ea.master_entity_id = e.master_entity_id
LEFT JOIN master_address a ON a.master_address_id = ea.master_address_id
LEFT JOIN opa_properties p ON p.parcel_number = ea.parcel_number;
GO

-- Property violation summary
CREATE VIEW vw_property_violation_summary AS
SELECT
    p.parcel_number,
    p.address_std,
    p.owner_1,
    p.category_code_description,
    p.market_value,
    p.zip_code,
    COUNT(DISTINCT ci.objectid) AS violation_count,
    SUM(CASE WHEN ci.investigationstatus = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
    COUNT(DISTINCT d.objectid) AS demolition_count,
    COUNT(DISTINCT ap.appealnumber) AS appeal_count
FROM opa_properties p
LEFT JOIN case_investigations ci ON ci.opa_account_num = p.parcel_number
LEFT JOIN demolitions d ON d.opa_account_num = p.parcel_number
LEFT JOIN appeals ap ON ap.opa_account_num = p.parcel_number
GROUP BY p.parcel_number, p.address_std, p.owner_1, p.category_code_description, p.market_value, p.zip_code;
GO

-- Owner portfolio summary (aggregates across all properties an owner holds)
CREATE VIEW vw_owner_portfolio AS
SELECT
    p.owner_1,
    COUNT(DISTINCT p.parcel_number) AS property_count,
    SUM(p.market_value) AS total_market_value,
    SUM(CASE WHEN p.category_code_description LIKE '%VACANT%' THEN 1 ELSE 0 END) AS vacant_count,
    SUM(CASE WHEN p.homestead_exemption = 0 THEN 1 ELSE 0 END) AS non_owner_occupied_count
FROM opa_properties p
WHERE p.owner_1 IS NOT NULL
GROUP BY p.owner_1
HAVING COUNT(DISTINCT p.parcel_number) >= 5;
GO
