// Container App Environment + MCP Server + SK Agent

param location string
param envName string = 'philly-mcp-env'
param acrLoginServer string
param apimGatewayUrl string
param azureOpenAiEndpoint string

@secure()
param apimSubscriptionKey string = '' // Passed as Container App secret

// Container App Environment (Consumption workload)
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    zoneRedundant: false
  }
}

// ── MCP Server Container App ─────────────────────────────

resource mcpServer 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'philly-mcp-server'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          username: acrLoginServer // Will be replaced by admin credentials at deploy time
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        #disable-next-line use-secure-value-for-secure-inputs
        { name: 'apim-key', value: apimSubscriptionKey }
        { name: 'acr-password', value: 'placeholder' } // Set after ACR creation
      ]
    }
    template: {
      containers: [
        {
          name: 'philly-mcp-server'
          image: '${acrLoginServer}/mcp-server:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'MCP_TRANSPORT', value: 'http' }
            { name: 'PORT', value: '8080' }
            { name: 'APIM_BASE_URL', value: '${apimGatewayUrl}/api' }
            { name: 'APIM_SUBSCRIPTION_KEY', secretRef: 'apim-key' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

// ── SK Agent Container App ───────────────────────────────

resource skAgent 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'philly-sk-agent'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          username: acrLoginServer
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        #disable-next-line use-secure-value-for-secure-inputs
        { name: 'apim-key', value: apimSubscriptionKey }
        { name: 'acr-password', value: 'placeholder' }
      ]
    }
    template: {
      containers: [
        {
          name: 'philly-sk-agent'
          image: '${acrLoginServer}/sk-agent:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: 'gpt-4.1' }
            { name: 'APIM_BASE_URL', value: '${apimGatewayUrl}/api' }
            { name: 'APIM_SUBSCRIPTION_KEY', secretRef: 'apim-key' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output mcpServerFqdn string = mcpServer.properties.configuration.ingress.fqdn
output mcpServerPrincipalId string = mcpServer.identity.principalId
output skAgentFqdn string = skAgent.properties.configuration.ingress.fqdn
output skAgentPrincipalId string = skAgent.identity.principalId
output envName string = env.name
