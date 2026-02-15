# Usage: ./infra/set-policy.ps1 -FunctionKey <key> -SubscriptionId <sub-id>
param(
    [Parameter(Mandatory=$true)][string]$FunctionKey,
    [Parameter(Mandatory=$true)][string]$SubscriptionId
)

$token = az account get-access-token --resource "https://management.azure.com/" --query accessToken -o tsv
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
$policyXml = "<policies><inbound><base /><set-header name=`"x-functions-key`" exists-action=`"override`"><value>$FunctionKey</value></set-header></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>"
$body = @{
    properties = @{
        format = "xml"
        value = $policyXml
    }
} | ConvertTo-Json
$url = "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/rg-philly-profiteering/providers/Microsoft.ApiManagement/service/philly-profiteering-apim/apis/philly-stats/policies/policy?api-version=2023-05-01-preview"
$result = Invoke-RestMethod -Uri $url -Method PUT -Headers $headers -Body $body
Write-Host "Policy set: $($result.properties.format)"
