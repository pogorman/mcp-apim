// Azure API Management — Consumption tier + Philly Stats API + 12 operations + policy

param location string
param apimName string = 'philly-profiteering-apim'
param publisherEmail string
param funcAppHostname string

@secure()
param functionKey string = '' // Injected into inbound policy; empty = set later via set-policy.ps1

// APIM Instance
resource apim 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: apimName
  location: location
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  properties: {
    publisherName: 'Philly Profiteering Project'
    publisherEmail: publisherEmail
  }
}

// API definition
resource api 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = {
  parent: apim
  name: 'philly-stats'
  properties: {
    displayName: 'Philly Stats API'
    path: 'api'
    serviceUrl: 'https://${funcAppHostname}/api'
    protocols: [ 'https' ]
    subscriptionRequired: true
    subscriptionKeyParameterNames: {
      header: 'Ocp-Apim-Subscription-Key'
      query: 'subscription-key'
    }
  }
}

// Inbound policy — inject function key
resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-05-01-preview' = if (!empty(functionKey)) {
  parent: api
  name: 'policy'
  properties: {
    format: 'xml'
    value: '<policies><inbound><base /><set-header name="x-functions-key" exists-action="override"><value>${functionKey}</value></set-header></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>'
  }
}

// ── Operations ────────────────────────────────────────────

// POST operations
resource opSearchEntities 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'searchEntities'
  properties: {
    displayName: 'Search Entities'
    method: 'POST'
    urlTemplate: '/search-entities'
  }
}

resource opSearchBusinesses 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'searchBusinesses'
  properties: {
    displayName: 'Search Businesses'
    method: 'POST'
    urlTemplate: '/search-businesses'
  }
}

resource opRunQuery 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'runQuery'
  properties: {
    displayName: 'Run Query'
    method: 'POST'
    urlTemplate: '/query'
  }
}

// GET operations — entity network
resource opGetEntityNetwork 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getEntityNetwork'
  properties: {
    displayName: 'Get Entity Network'
    method: 'GET'
    urlTemplate: '/entities/{entityId}/network'
    templateParameters: [
      { name: 'entityId', required: true, type: 'string' }
    ]
  }
}

// GET operations — property endpoints
resource opGetPropertyProfile 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyProfile'
  properties: {
    displayName: 'Get Property Profile'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

resource opGetPropertyViolations 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyViolations'
  properties: {
    displayName: 'Get Property Violations'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}/violations'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

resource opGetPropertyAssessments 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyAssessments'
  properties: {
    displayName: 'Get Property Assessments'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}/assessments'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

resource opGetPropertyLicenses 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyLicenses'
  properties: {
    displayName: 'Get Property Licenses'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}/licenses'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

resource opGetPropertyAppeals 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyAppeals'
  properties: {
    displayName: 'Get Property Appeals'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}/appeals'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

resource opGetPropertyDemolitions 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getPropertyDemolitions'
  properties: {
    displayName: 'Get Property Demolitions'
    method: 'GET'
    urlTemplate: '/properties/{parcelNumber}/demolitions'
    templateParameters: [
      { name: 'parcelNumber', required: true, type: 'string' }
    ]
  }
}

// GET operations — stats
resource opGetTopViolators 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getTopViolators'
  properties: {
    displayName: 'Get Top Violators'
    method: 'GET'
    urlTemplate: '/stats/top-violators'
  }
}

resource opGetAreaStats 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = {
  parent: api
  name: 'getAreaStats'
  properties: {
    displayName: 'Get Area Stats'
    method: 'GET'
    urlTemplate: '/stats/zip/{zipCode}'
    templateParameters: [
      { name: 'zipCode', required: true, type: 'string' }
    ]
  }
}

output gatewayUrl string = apim.properties.gatewayUrl
output apimName string = apim.name
output apimId string = apim.id
