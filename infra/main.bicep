// ============================================================
// Philly Poverty Profiteering — Full Infrastructure
// ============================================================
// Usage:
//   az deployment group create \
//     --resource-group rg-philly-profiteering \
//     --template-file infra/main.bicep \
//     --parameters infra/main.bicepparam \
//     --parameters sqlAdminPassword=$SQL_ADMIN_PASSWORD clientIp=$(curl -s ifconfig.me)

targetScope = 'resourceGroup'

// ── Parameters ───────────────────────────────────────────

@description('Primary location for Container Apps, ACR, SWA')
param location string = 'eastus2'

@description('Location for SQL, Storage, Function App, APIM')
param sqlLocation string = 'eastus'

@secure()
@description('SQL Server admin password')
param sqlAdminPassword string

@description('Client IP for SQL firewall (from curl ifconfig.me)')
param clientIp string = ''

@description('APIM publisher email')
param publisherEmail string = 'admin@example.com'

@description('Azure OpenAI endpoint URL')
param azureOpenAiEndpoint string = 'https://foundry-og-agents.openai.azure.com/'

@secure()
@description('Function app key (retrieved after first deploy, then set)')
param functionKey string = ''

@secure()
@description('APIM subscription key (retrieved after APIM creation)')
param apimSubscriptionKey string = ''

// ── Modules ──────────────────────────────────────────────

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: sqlLocation
    sqlAdminPassword: sqlAdminPassword
    clientIp: clientIp
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: sqlLocation
  }
}

module functionApp 'modules/functionApp.bicep' = {
  name: 'functionApp'
  params: {
    location: sqlLocation
    funcStorageName: storage.outputs.funcStorageName
    sqlServerFqdn: sql.outputs.serverFqdn
    sqlDatabaseName: sql.outputs.databaseName
  }
}

module apim 'modules/apim.bicep' = {
  name: 'apim'
  params: {
    location: sqlLocation
    publisherEmail: publisherEmail
    funcAppHostname: functionApp.outputs.hostname
    functionKey: functionKey
  }
}

module acr 'modules/containerRegistry.bicep' = {
  name: 'acr'
  params: {
    location: location
  }
}

module containerApps 'modules/containerApps.bicep' = {
  name: 'containerApps'
  params: {
    location: location
    acrLoginServer: acr.outputs.loginServer
    apimGatewayUrl: apim.outputs.gatewayUrl
    azureOpenAiEndpoint: azureOpenAiEndpoint
    apimSubscriptionKey: apimSubscriptionKey
  }
}

module swa 'modules/staticWebApp.bicep' = {
  name: 'swa'
  params: {
    location: location
  }
}

// ── Role Assignments ─────────────────────────────────────
// Storage roles use hardcoded account name to avoid circular deps.
// OpenAI roles are done post-deploy via az CLI (cross-RG scope not supported inline).

var funcStorageAccountName = 'phillyfuncsa'

resource funcStorageRef 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: funcStorageAccountName
}

// Function App MI → Storage Blob Data Owner
resource funcBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(funcStorageAccountName, 'func-mi', 'StorageBlobDataOwner')
  scope: funcStorageRef
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App MI → Storage Account Contributor
resource funcStorageContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(funcStorageAccountName, 'func-mi', 'StorageAccountContributor')
  scope: funcStorageRef
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '17d1049b-9a84-46fb-8f53-869881c3d3ab')
    principalId: functionApp.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

// NOTE: Azure OpenAI role assignments (Cognitive Services OpenAI User) for
// Container App MIs are in a different resource group (rg-foundry), so they
// must be done post-deploy:
//   az role assignment create --assignee <mcpServerPrincipalId> \
//     --role "Cognitive Services OpenAI User" \
//     --scope /subscriptions/.../providers/Microsoft.CognitiveServices/accounts/foundry-og-agents

// ── Outputs ──────────────────────────────────────────────

output sqlServerFqdn string = sql.outputs.serverFqdn
output functionAppHostname string = functionApp.outputs.hostname
output functionAppPrincipalId string = functionApp.outputs.principalId
output apimGatewayUrl string = apim.outputs.gatewayUrl
output mcpServerUrl string = 'https://${containerApps.outputs.mcpServerFqdn}'
output mcpServerPrincipalId string = containerApps.outputs.mcpServerPrincipalId
output skAgentUrl string = 'https://${containerApps.outputs.skAgentFqdn}'
output skAgentPrincipalId string = containerApps.outputs.skAgentPrincipalId
output swaUrl string = 'https://${swa.outputs.defaultHostname}'
output acrLoginServer string = acr.outputs.loginServer
