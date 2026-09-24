## Remediation steps

### Azure CLI remediation
1. Set the Function App Linux runtime to Python 3.11.

```azurecli
az functionapp config set --name fun-scrubber-ppe-eastus --resource-group rg-piiscrubber-ppe-eastus --linux-fx-version "PYTHON|<target-version>"
```

### PowerShell remediation
1. Set the Function App Linux runtime to Python 3.11.

```powershell
$functionApp = Get-AzWebApp -Name fun-scrubber-ppe-eastus -ResourceGroupName rg-piiscrubber-ppe-eastus
$functionApp.SiteConfig.LinuxFxVersion = "PYTHON|<target-version>"
Set-AzWebApp -InputObject $functionApp
```

## Unresolved placeholders
- `<target-version>` — Target supported Python runtime version.

## Verification
- Confirm that the configured Linux runtime is Python 3.11.

```azurecli
az functionapp config show --name `<function-app>` --resource-group `<my-resource-group>` --query 'linuxFxVersion' -o tsv
```