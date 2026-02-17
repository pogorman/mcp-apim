// Azure Container Registry (Basic)

param location string
param acrName string = 'phillymcpacr'

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: true
  }
}

output loginServer string = acr.properties.loginServer
output acrName string = acr.name
output acrId string = acr.id
