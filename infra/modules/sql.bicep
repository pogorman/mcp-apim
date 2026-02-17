// SQL Server + Database (General Purpose Serverless)

param location string
param sqlServerName string = 'philly-stats-sql-01'
param sqlDatabaseName string = 'phillystats'

@secure()
param sqlAdminPassword string

param sqlAdminUser string = 'phillyadmin'
param clientIp string = ''

resource sqlServer 'Microsoft.Sql/servers@2021-11-01' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminUser
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// Allow Azure services (Functions, Container Apps, etc.)
resource fwAllowAzure 'Microsoft.Sql/servers/firewallRules@2021-11-01' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Allow deployer's client IP (optional)
resource fwAllowClient 'Microsoft.Sql/servers/firewallRules@2021-11-01' = if (!empty(clientIp)) {
  parent: sqlServer
  name: 'AllowClientIP'
  properties: {
    startIpAddress: clientIp
    endIpAddress: clientIp
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2021-11-01' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 34359738368 // 32GB
    autoPauseDelay: 60
    minCapacity: json('0.5')
    zoneRedundant: false
  }
}

output serverFqdn string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = sqlDatabase.name
output serverName string = sqlServer.name
