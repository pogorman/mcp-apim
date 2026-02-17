// Azure Functions — Flex Consumption (Node 20)

param location string
param funcAppName string = 'philly-profiteering-func'
param funcStorageName string
param sqlServerFqdn string
param sqlDatabaseName string

@description('Subnet ID for VNet integration (from networking module)')
param functionsSubnetId string = ''

// Flex Consumption App Service Plan
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${funcAppName}-plan'
  location: location
  kind: 'functionapp'
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true // Linux
  }
}

// Function App
resource funcApp 'Microsoft.Web/sites@2023-12-01' = {
  name: funcAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    reserved: true
    virtualNetworkSubnetId: !empty(functionsSubnetId) ? functionsSubnetId : null
    vnetContentShareEnabled: !empty(functionsSubnetId)
    vnetRouteAllEnabled: !empty(functionsSubnetId)
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: funcStorageName }
        { name: 'AzureWebJobsStorage__blobServiceUri', value: 'https://${funcStorageName}.blob.${environment().suffixes.storage}' }
        { name: 'AzureWebJobsStorage__queueServiceUri', value: 'https://${funcStorageName}.queue.${environment().suffixes.storage}' }
        { name: 'AzureWebJobsStorage__tableServiceUri', value: 'https://${funcStorageName}.table.${environment().suffixes.storage}' }
        { name: 'SQL_SERVER', value: sqlServerFqdn }
        { name: 'SQL_DATABASE', value: sqlDatabaseName }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: 'https://${funcStorageName}.blob.${environment().suffixes.storage}/deployments'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '20'
      }
    }
  }
}

output hostname string = funcApp.properties.defaultHostName
output funcAppName string = funcApp.name
output principalId string = funcApp.identity.principalId
output funcAppId string = funcApp.id
