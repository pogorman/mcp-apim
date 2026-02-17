// Storage Accounts — CSV data + Function App storage

param location string
param dataStorageName string = 'phillyprofiteersa'
param funcStorageName string = 'phillyfuncsa'

// CSV data storage
resource dataStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: dataStorageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowSharedKeyAccess: true // Explicit — MCAPS policy disabled this, causing 503
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// Function App storage + deployment artifacts
resource funcStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: funcStorageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowSharedKeyAccess: true // Explicit — required for Function App host to load deployment package
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// Blob container for Flex Consumption deployment packages
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: funcStorage
  name: 'default'
}

resource deploymentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'deployments'
  properties: {
    publicAccess: 'None'
  }
}

output dataStorageName string = dataStorage.name
output funcStorageName string = funcStorage.name
output funcStorageId string = funcStorage.id
output funcStorageBlobEndpoint string = funcStorage.properties.primaryEndpoints.blob
