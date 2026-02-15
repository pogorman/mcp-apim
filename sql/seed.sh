#!/bin/bash
set -euo pipefail

# ============================================================
# Philly Poverty Profiteering - Data Loading Script
# ============================================================
# Loads CSV data into Azure SQL Database using sqlcmd + BULK INSERT.
#
# Prerequisites:
#   - sqlcmd installed (comes with SQL Server tools or az sql)
#   - Azure Storage account with CSV files uploaded
#   - SQL schema already applied (schema.sql)
#
# Usage:
#   1. First upload CSVs to blob storage (this script does that)
#   2. Then runs BULK INSERT from blob storage
#
# Environment variables required:
#   SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD
#   STORAGE_ACCOUNT, STORAGE_KEY (or use az login)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"

# --- Configuration ---
SQL_SERVER="${SQL_SERVER:-philly-profiteering-sql.database.windows.net}"
SQL_DATABASE="${SQL_DATABASE:-phillystats}"
SQL_USER="${SQL_USER:-phillyadmin}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-philly-profiteering}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-phillyprofiteersa}"
CONTAINER_NAME="csvdata"

if [ -z "${SQL_PASSWORD:-}" ]; then
  echo "Enter SQL admin password:"
  read -s SQL_PASSWORD
  echo ""
fi

SQLCMD="sqlcmd -S $SQL_SERVER -d $SQL_DATABASE -U $SQL_USER -P $SQL_PASSWORD -I"

echo "=== Step 1: Apply Schema ==="
$SQLCMD -i "$SCRIPT_DIR/schema.sql"
echo "  Schema applied."

echo ""
echo "=== Step 2: Upload CSVs to Blob Storage ==="

# Get storage key
STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv)

# Create container
az storage container create \
  --name "$CONTAINER_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --output none 2>/dev/null || true

# Upload each CSV
for csv_file in "$DATA_DIR"/dbo.*.csv; do
  filename=$(basename "$csv_file")
  echo "  Uploading $filename..."
  az storage blob upload \
    --container-name "$CONTAINER_NAME" \
    --file "$csv_file" \
    --name "$filename" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --overwrite \
    --output none
done
echo "  All CSVs uploaded."

echo ""
echo "=== Step 3: Create External Data Source ==="

# Create SAS token for SQL to access blob
SAS_EXPIRY=$(date -u -d "+1 day" +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -v+1d +%Y-%m-%dT%H:%MZ)
SAS_TOKEN=$(az storage container generate-sas \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --name "$CONTAINER_NAME" \
  --permissions rl \
  --expiry "$SAS_EXPIRY" \
  -o tsv)

# Create master key and external data source in SQL
$SQLCMD -Q "
IF NOT EXISTS (SELECT * FROM sys.symmetric_keys WHERE name = '##MS_DatabaseMasterKey##')
  CREATE MASTER KEY ENCRYPTION BY PASSWORD = '${SQL_PASSWORD}';
"

$SQLCMD -Q "
IF EXISTS (SELECT * FROM sys.database_scoped_credentials WHERE name = 'BlobCredential')
  DROP DATABASE SCOPED CREDENTIAL BlobCredential;
CREATE DATABASE SCOPED CREDENTIAL BlobCredential
  WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
  SECRET = '$SAS_TOKEN';
"

$SQLCMD -Q "
IF EXISTS (SELECT * FROM sys.external_data_sources WHERE name = 'CsvBlobStorage')
  DROP EXTERNAL DATA SOURCE CsvBlobStorage;
CREATE EXTERNAL DATA SOURCE CsvBlobStorage
  WITH (
    TYPE = BLOB_STORAGE,
    LOCATION = 'https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}',
    CREDENTIAL = BlobCredential
  );
"
echo "  External data source created."

echo ""
echo "=== Step 4: Load Data via BULK INSERT ==="

# Helper function for bulk insert
bulk_load() {
  local table_name=$1
  local csv_file=$2
  local extra_opts=${3:-""}

  echo "  Loading $table_name from $csv_file..."
  $SQLCMD -Q "
    BULK INSERT $table_name
    FROM '$csv_file'
    WITH (
      DATA_SOURCE = 'CsvBlobStorage',
      FORMAT = 'CSV',
      FIRSTROW = 2,
      FIELDTERMINATOR = ',',
      ROWTERMINATOR = '0x0a',
      FIELDQUOTE = '\"',
      TABLOCK,
      MAXERRORS = 1000
      $extra_opts
    );
  " 2>&1 | tail -1

  # Print row count
  $SQLCMD -Q "SELECT COUNT(*) AS row_count FROM $table_name;" -h -1 | head -1
}

# Load tables in order (smallest first for quick validation, largest last)
bulk_load "demolitions" "dbo.philly_demolitions.csv"
bulk_load "appeals" "dbo.philly_appeals.csv"
bulk_load "business_licenses" "dbo.philly_business_licenses.csv"
bulk_load "commercial_activity_licenses" "dbo.philly_com_act_licenses.csv"
bulk_load "opa_properties" "dbo.philly_opa_properties_public_pde.csv"
bulk_load "master_address" "dbo.masteraddress.csv"
bulk_load "case_investigations" "dbo.philly_case_investigations.csv"
bulk_load "master_entity" "dbo.masterentity.csv"
bulk_load "assessments" "dbo.philly_assessments.csv"
bulk_load "master_entity_address" "dbo.masterentityaddress.csv"

echo ""
echo "=== Step 5: Verify Row Counts ==="
$SQLCMD -Q "
SELECT 'master_entity' AS tbl, COUNT(*) AS rows FROM master_entity UNION ALL
SELECT 'master_address', COUNT(*) FROM master_address UNION ALL
SELECT 'master_entity_address', COUNT(*) FROM master_entity_address UNION ALL
SELECT 'opa_properties', COUNT(*) FROM opa_properties UNION ALL
SELECT 'assessments', COUNT(*) FROM assessments UNION ALL
SELECT 'business_licenses', COUNT(*) FROM business_licenses UNION ALL
SELECT 'commercial_activity_licenses', COUNT(*) FROM commercial_activity_licenses UNION ALL
SELECT 'case_investigations', COUNT(*) FROM case_investigations UNION ALL
SELECT 'appeals', COUNT(*) FROM appeals UNION ALL
SELECT 'demolitions', COUNT(*) FROM demolitions
ORDER BY rows DESC;
"

echo ""
echo "============================================"
echo "  Data Loading Complete!"
echo "============================================"
