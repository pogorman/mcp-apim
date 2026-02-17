// VNet + Private Endpoints for SQL & Storage
// Enables Function App to communicate with SQL and Storage over private links,
// so publicNetworkAccess can stay disabled on both.

param location string
param vnetName string = 'vnet-philly-profiteering'

@description('Resource ID of the SQL Server (for private endpoint)')
param sqlServerId string

@description('Resource ID of the Function App storage account (for private endpoint)')
param funcStorageId string

// ── VNet ─────────────────────────────────────────────────

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/16']
    }
    subnets: [
      {
        name: 'snet-functions'
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            {
              name: 'delegation-functions'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: '10.0.2.0/24'
        }
      }
    ]
  }
}

// ── Private DNS Zones ────────────────────────────────────

resource dnsZoneSql 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink${environment().suffixes.sqlServerHostname}'
  location: 'global'
}

resource dnsZoneBlob 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.blob.${environment().suffixes.storage}'
  location: 'global'
}

resource dnsZoneTable 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.table.${environment().suffixes.storage}'
  location: 'global'
}

resource dnsZoneQueue 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.queue.${environment().suffixes.storage}'
  location: 'global'
}

// ── DNS Zone → VNet Links ────────────────────────────────

resource dnsLinkSql 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneSql
  name: '${vnetName}-sql-link'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource dnsLinkBlob 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneBlob
  name: '${vnetName}-blob-link'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource dnsLinkTable 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneTable
  name: '${vnetName}-table-link'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource dnsLinkQueue 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZoneQueue
  name: '${vnetName}-queue-link'
  location: 'global'
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

// ── Private Endpoint: SQL Server ─────────────────────────

resource peSql 'Microsoft.Network/privateEndpoints@2024-01-01' = {
  name: 'pe-sql-philly'
  location: location
  properties: {
    subnet: {
      id: vnet.properties.subnets[1].id // snet-private-endpoints
    }
    privateLinkServiceConnections: [
      {
        name: 'sql-connection'
        properties: {
          privateLinkServiceId: sqlServerId
          groupIds: ['sqlServer']
        }
      }
    ]
  }
}

resource peSqlDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = {
  parent: peSql
  name: 'sql-dns-group'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'sql-dns-config'
        properties: {
          privateDnsZoneId: dnsZoneSql.id
        }
      }
    ]
  }
}

// ── Private Endpoint: Storage (blob) ─────────────────────

resource peBlob 'Microsoft.Network/privateEndpoints@2024-01-01' = {
  name: 'pe-blob-philly'
  location: location
  properties: {
    subnet: {
      id: vnet.properties.subnets[1].id
    }
    privateLinkServiceConnections: [
      {
        name: 'blob-connection'
        properties: {
          privateLinkServiceId: funcStorageId
          groupIds: ['blob']
        }
      }
    ]
  }
}

resource peBlobDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = {
  parent: peBlob
  name: 'blob-dns-group'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob-dns-config'
        properties: {
          privateDnsZoneId: dnsZoneBlob.id
        }
      }
    ]
  }
}

// ── Private Endpoint: Storage (table) ────────────────────

resource peTable 'Microsoft.Network/privateEndpoints@2024-01-01' = {
  name: 'pe-table-philly'
  location: location
  properties: {
    subnet: {
      id: vnet.properties.subnets[1].id
    }
    privateLinkServiceConnections: [
      {
        name: 'table-connection'
        properties: {
          privateLinkServiceId: funcStorageId
          groupIds: ['table']
        }
      }
    ]
  }
}

resource peTableDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = {
  parent: peTable
  name: 'table-dns-group'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'table-dns-config'
        properties: {
          privateDnsZoneId: dnsZoneTable.id
        }
      }
    ]
  }
}

// ── Private Endpoint: Storage (queue) ────────────────────

resource peQueue 'Microsoft.Network/privateEndpoints@2024-01-01' = {
  name: 'pe-queue-philly'
  location: location
  properties: {
    subnet: {
      id: vnet.properties.subnets[1].id
    }
    privateLinkServiceConnections: [
      {
        name: 'queue-connection'
        properties: {
          privateLinkServiceId: funcStorageId
          groupIds: ['queue']
        }
      }
    ]
  }
}

resource peQueueDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-01-01' = {
  parent: peQueue
  name: 'queue-dns-group'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'queue-dns-config'
        properties: {
          privateDnsZoneId: dnsZoneQueue.id
        }
      }
    ]
  }
}

// ── Outputs ──────────────────────────────────────────────

output functionsSubnetId string = vnet.properties.subnets[0].id // snet-functions
output vnetId string = vnet.id
output vnetName string = vnet.name
