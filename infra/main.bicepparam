using './main.bicep'

param location = 'eastus2'
param sqlLocation = 'eastus2'
param publisherEmail = 'admin@example.com'
param azureOpenAiEndpoint = 'https://foundry-og-agents.openai.azure.com/'

// These must be provided at deploy time:
//   --parameters sqlAdminPassword=<password>
//   --parameters clientIp=$(curl -s ifconfig.me)
//
// Optional (set after first deploy):
//   --parameters functionKey=<key>
//   --parameters apimSubscriptionKey=<key>
