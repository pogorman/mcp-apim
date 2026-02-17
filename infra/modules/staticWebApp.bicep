// Azure Static Web App (Free tier)

param location string
param swaName string = 'philly-profiteering-spa'

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

output defaultHostname string = swa.properties.defaultHostname
output swaName string = swa.name
output swaId string = swa.id
