#!/usr/bin/env pwsh

<#
.SYNOPSIS
Azure Static Web App のプロビジョニングと GitHub 関連設定をまとめて実行します。

.DESCRIPTION
サブスクリプションと GitHub リポジトリのコンテキストを検出し、必要に応じてリソースグループや Static Web App を新規作成または再作成します。
新規作成時はデプロイトークンを GitHub シークレットに登録し、最後に GitHub OAuth App 情報とリポジトリ情報をアプリ設定へ投入します。

.PARAMETER ResourceGroupName
リソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER SubscriptionId
利用する Azure サブスクリプション ID。指定された場合は確認プロンプトをスキップし、その ID を直接使用します。

.PARAMETER Sku
Static Web App の SKU（Free、Standard）。

.PARAMETER ClientId
GitHub OAuth App Client ID。未指定時は後段で対話プロンプトが表示されます。

.PARAMETER ClientSecret
GitHub OAuth App Client Secret。未指定時は後段で安全な対話プロンプトが表示されます。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 --client-id <id> --client-secret <secret>

Static Web App を作成し、GitHub シークレットとアプリ設定をまとめて更新します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1

既存リソースがある場合、再利用または再作成を対話的に選択します。
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [string]$ResourceGroupLocation = 'japaneast',
    [string]$SubscriptionId,
    [ValidateSet('Free', 'Standard')]
    [string]$Sku = 'Standard',
    [string]$ClientId,
    [string]$ClientSecret
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Main {
    Set-Variable -Name GitHubSecretNameConst -Value 'AZURE_STATIC_WEB_APPS_API_TOKEN' -Option Constant

    $subscriptionContext = Resolve-SubscriptionContext -SubscriptionId $SubscriptionId
    $provisionContext = Initialize-ExecutionContext `
        -SubscriptionContext $subscriptionContext `
        -RequestedResourceGroupName $ResourceGroupName `
        -RequestedStaticWebAppName $Name `
        -ResourceGroupLocation $ResourceGroupLocation `
        -Sku $Sku

    $resourceState = Resolve-ResourceState -Context $provisionContext
    $provisionResult = Ensure-StaticWebApp -Context $provisionContext -ResourceState $resourceState

    $activeResourceGroup = $provisionResult.ResourceGroupName

    Show-GitHubOAuthInstructions `
        -Name $provisionContext.StaticWebAppName `
        -ResourceGroup $activeResourceGroup `
        -SubscriptionId $provisionContext.SubscriptionId

    $credentials = Resolve-ClientCredentials -ClientId $ClientId -ClientSecret $ClientSecret
    Set-AppSettings `
        -Name $provisionContext.StaticWebAppName `
        -ResourceGroup $activeResourceGroup `
        -SubscriptionId $provisionContext.SubscriptionId `
        -ClientId $credentials.ClientId `
        -ClientSecret $credentials.ClientSecret `
        -RepoOwner $provisionContext.RepoOwner `
        -RepoName $provisionContext.RepoName
}


function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Get-CurrentSubscription {
    $output = az account show --query '{id:id,name:name}' -o json 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) {
        throw '現在のサブスクリプション情報を取得できませんでした。`az login` 済みか確認してください。'
    }

    return $output | ConvertFrom-Json
}

function Get-AllSubscriptions {
    $output = az account list --query '[].{id:id,name:name}' -o json 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) {
        throw 'サブスクリプション一覧を取得できませんでした。'
    }

    $subscriptions = $output | ConvertFrom-Json
    if (-not $subscriptions -or $subscriptions.Count -eq 0) {
        throw '利用可能なサブスクリプションが見つかりません。'
    }

    return $subscriptions
}

function Resolve-SubscriptionContext {
    param([string]$SubscriptionId)

    if ($SubscriptionId) {
        $trimmedId = $SubscriptionId.Trim()
        Write-Info "指定されたサブスクリプション ID '$trimmedId' を使用します。"
        $specified = az account show --subscription $trimmedId --query '{id:id,name:name}' -o json 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $specified) {
            throw "サブスクリプション ID '$trimmedId' を取得できませんでした。存在し、アクセス権があるか確認してください。"
        }
        return $specified | ConvertFrom-Json
    }

    $current = Get-CurrentSubscription
    Write-Info "現在のサブスクリプション: $($current.name) ($($current.id))"

    while ($true) {
        $response = Read-Host 'このサブスクリプションを使用しますか? [Y/N]'
        if ($response -match '^[Yy]') {
            return $current
        }
        if ($response -match '^[Nn]') {
            $subscriptions = Get-AllSubscriptions
            while ($true) {
                Write-Host "`n利用可能なサブスクリプション一覧:" -ForegroundColor Yellow
                for ($index = 0; $index -lt $subscriptions.Count; $index++) {
                    $displayIndex = $index + 1
                    $marker = ''
                    if ($subscriptions[$index].id -eq $current.id) {
                        $marker = ' (current)'
                    }
                    Write-Host "  [$displayIndex] $($subscriptions[$index].name) ($($subscriptions[$index].id))$marker"
                }

                $selection = Read-Host '使用する番号を入力してください'
                if (-not $selection) {
                    Write-Warning '番号が入力されていません。'
                    continue
                }
                if ($selection -notmatch '^[0-9]+$') {
                    Write-Warning '数字で入力してください。'
                    continue
                }

                $selectedIndex = [int]$selection - 1
                if ($selectedIndex -lt 0 -or $selectedIndex -ge $subscriptions.Count) {
                    Write-Warning '範囲外の番号です。'
                    continue
                }

                return $subscriptions[$selectedIndex]
            }
        }

        Write-Warning '有効な応答を入力してください (Y/N)。'
    }
}

function Resolve-RepoContext {
    $remoteUrl = $(git remote get-url origin 2>$null)
    if (-not $remoteUrl) {
        throw 'GitHub リポジトリを特定できません。git remote "origin" が設定されているか確認してください。'
    }

    $remoteUrl = $remoteUrl.Trim()
    $pattern = 'github\.com[:/](?<owner>[^/]+?)/(?<repo>[^/]+?)(?:\.git)?$'
    if (-not ($remoteUrl -match $pattern)) {
        throw "リモート URL '$remoteUrl' から GitHub スラッグを解析できません。"
    }

    $repoName = $matches.repo
    if (-not $repoName) {
        throw 'リポジトリ名を取得できませんでした。'
    }

    return [PSCustomObject]@{
        GitHubOwner = $matches.owner
        GitHubRepo  = $repoName
    }
}

function Test-ResourceGroupExists {
    param([string]$Name, [string]$SubscriptionId)
    $output = az group show --name $Name --subscription $SubscriptionId 2>$null
    return ($LASTEXITCODE -eq 0 -and $output)
}

function Get-StaticWebAppGlobal {
    param([string]$Name, [string]$SubscriptionId)

    Write-Info "Static Web App '$Name' のグローバル検索を実行しています..."
    $output = az staticwebapp list --subscription $SubscriptionId --query "[?name=='$Name']" 2>$null

    if ($LASTEXITCODE -ne 0) {
        throw 'Static Web App のリスト取得に失敗しました。Azure CLI が正しく設定されているか確認してください。'
    }

    if (-not $output) {
        return $null
    }

    $apps = $output | ConvertFrom-Json
    if ($apps.Count -eq 0) {
        return $null
    }

    return $apps[0]
}

function Get-ResourceGroupFromResourceId {
    param([string]$ResourceId)

    if ($ResourceId -match '/resourceGroups/([^/]+)/') {
        return $matches[1]
    }

    return $null
}

function Ensure-ResourceGroup {
    param(
        [string]$Name,
        [string]$Location,
        [string]$SubscriptionId
    )

    if (Test-ResourceGroupExists -Name $Name -SubscriptionId $SubscriptionId) {
        return $Name
    }

    Write-Info "リソースグループ '$Name' を '$Location' に作成しています..."
    az group create --name $Name --location $Location --subscription $SubscriptionId | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'リソースグループの作成に失敗しました。'
    }

    return $Name
}

function Get-DeploymentToken {
    param(
        [string]$Name,
        [string]$ResourceGroup,
        [string]$SubscriptionId
    )

    $token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup --subscription $SubscriptionId --query "properties.apiKey" -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $token) {
        throw 'デプロイトークンの取得に失敗しました。Static Web App が存在し、十分な権限があるか確認してください。'
    }

    return $token.Trim()
}

function Show-GitHubOAuthInstructions {
    param(
        [string]$Name,
        [string]$ResourceGroup,
        [string]$SubscriptionId
    )

    $hostname = az staticwebapp show --name $Name --resource-group $ResourceGroup --subscription $SubscriptionId --query 'defaultHostname' -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $hostname) {
        Write-Warning 'Static Web App のホスト名を取得できませんでした。"az staticwebapp show" で確認してください。'
        return
    }

    $homepageUrl = "https://$hostname/"
    $callbackUrl = "https://$hostname/.auth/login/github/callback"

    Write-Host "`n[TODO] GitHub OAuth App の設定" -ForegroundColor Yellow
    Write-Host "  ホームページ URL: $homepageUrl"
    Write-Host "  認証コールバック URL: $callbackUrl"
    Write-Host "  次の手順:" -ForegroundColor Yellow
    Write-Host '    1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App を開く'
    Write-Host '    2. 上記 URL を入力してアプリを作成し、Client ID/Secret を保管'
    Write-Host '    3. scripts/New-SwaResources.ps1 で GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET などを設定'
}

function Confirm-StaticWebAppReuse {
    param([string]$ResourceGroupName, [string]$StaticWebAppName)

    Write-Host "`n既存の Static Web App が見つかりました:" -ForegroundColor Yellow
    Write-Host "  Static Web App: $StaticWebAppName"
    Write-Host "  所属リソースグループ: $ResourceGroupName"
    Write-Host "`nこの Static Web App を再利用しますか?" -ForegroundColor Yellow
    Write-Host '  [Y] 再利用 (既存のまま設定のみ更新)'
    Write-Host '  [n] 再作成 (既存SWAを削除して対象Resource Groupで再作成)'

    while ($true) {
        try {
            $response = Read-Host '選択してください [Y/n]'
        }
        catch [System.Management.Automation.PipelineStoppedException] {
            Write-Host "`n操作がキャンセルされました。" -ForegroundColor Yellow
            exit 1
        }
        if (-not $response) {
            return $true
        }

        if ($response -match '^[Yy]$') {
            return $true
        }

        if ($response -match '^[Nn]$') {
            return $false
        }

        Write-Warning 'Y か N で入力してください。'
    }
}

function Remove-StaticWebAppWithConfirmation {
    param([string]$Name, [string]$ResourceGroup, [string]$SubscriptionId)

    Write-Warning "Static Web App '$Name' を削除します。この操作は取り消せません。"
    Write-Host '削除を続行しますか? (yes と入力してください): ' -NoNewline
    try {
        $confirmation = Read-Host
    }
    catch [System.Management.Automation.PipelineStoppedException] {
        Write-Host "`n操作がキャンセルされました。" -ForegroundColor Yellow
        exit 1
    }

    if ($confirmation -ne 'yes') {
        throw '削除がキャンセルされました。'
    }

    Write-Info "Static Web App '$Name' を削除しています..."
    az staticwebapp delete --name $Name --resource-group $ResourceGroup --subscription $SubscriptionId --yes | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw 'Static Web App の削除に失敗しました。'
    }

    Write-Info 'Static Web App を削除しました。'
}

function Set-GitHubSecret {
    param(
        [string]$Repo,
        [string]$SecretValue
    )

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw 'GitHub CLI (gh) が見つかりません。https://cli.github.com/ からインストールしてから再実行してください。'
    }

    Write-Info "GitHub シークレット '$GitHubSecretNameConst' を '$Repo' に設定しています。"
    gh secret set $GitHubSecretNameConst --repo $Repo --body $SecretValue | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub シークレットの設定に失敗しました。gh CLI の権限やネットワーク状態を確認してください。'
    }
}

function Convert-SecureStringToPlainText {
    param([System.Security.SecureString]$SecureString)

    if (-not $SecureString) {
        throw '空の値が入力されました。'
    }

    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Resolve-ParameterOrPrompt {
    param(
        [string]$Value,
        [string]$PromptMessage,
        [switch]$AsSecureString
    )

    if ($Value) {
        return $Value.Trim()
    }

    if ($AsSecureString) {
        try {
            $secureInput = Read-Host $PromptMessage -AsSecureString
        }
        catch [System.Management.Automation.PipelineStoppedException] {
            Write-Host "`n操作がキャンセルされました。" -ForegroundColor Yellow
            exit 1
        }
        $plain = Convert-SecureStringToPlainText -SecureString $secureInput
        if (-not $plain) {
            throw "$PromptMessage が必要です。"
        }
        return $plain
    }

    try {
        $input = Read-Host $PromptMessage
    }
    catch [System.Management.Automation.PipelineStoppedException] {
        Write-Host "`n操作がキャンセルされました。" -ForegroundColor Yellow
        exit 1
    }
    if (-not $input) {
        throw "$PromptMessage が必要です。"
    }
    return $input.Trim()
}

function Resolve-ClientCredentials {
    param(
        [string]$ClientId,
        [string]$ClientSecret
    )

    $resolvedClientId = Resolve-ParameterOrPrompt -Value $ClientId -PromptMessage 'GitHub OAuth App Client ID'
    $resolvedClientSecret = Resolve-ParameterOrPrompt -Value $ClientSecret -PromptMessage 'GitHub OAuth App Client Secret' -AsSecureString

    return [PSCustomObject]@{
        ClientId     = $resolvedClientId
        ClientSecret = $resolvedClientSecret
    }
}

function Set-AppSettings {
    param(
        [string]$Name,
        [string]$ResourceGroup,
        [string]$SubscriptionId,
        [string]$ClientId,
        [string]$ClientSecret,
        [string]$RepoOwner,
        [string]$RepoName
    )

    $settingNames = @(
        "GITHUB_CLIENT_ID=$ClientId"
        "GITHUB_CLIENT_SECRET=$ClientSecret"
        "GITHUB_REPO_OWNER=$RepoOwner"
        "GITHUB_REPO_NAME=$RepoName"
    )

    Write-Info 'アプリ設定を更新しています...'
    az staticwebapp appsettings set --name $Name -g $ResourceGroup --subscription $SubscriptionId --setting-names $settingNames --only-show-errors | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw 'アプリ設定の更新に失敗しました。'
    }

    $hostname = az staticwebapp show --name $Name -g $ResourceGroup --subscription $SubscriptionId --query 'defaultHostname' -o tsv 2>$null
    if ($LASTEXITCODE -eq 0 -and $hostname) {
        $swaUrl = "https://$($hostname.TrimEnd('/'))/"
        Write-Host "[SUCCESS] アプリ設定を更新しました。SWA: $swaUrl" -ForegroundColor Green
    }
    else {
        Write-Host "[SUCCESS] アプリ設定を更新しました。必要に応じて 'az staticwebapp appsettings list -n $Name -g $ResourceGroup' で確認してください。" -ForegroundColor Green
    }
}

function Initialize-ExecutionContext {
    param(
        $SubscriptionContext,
        [string]$RequestedResourceGroupName,
        [string]$RequestedStaticWebAppName,
        [string]$ResourceGroupLocation,
        [string]$Sku
    )

    if (-not $SubscriptionContext) {
        throw 'SubscriptionContext が指定されていません。'
    }

    $repoContext = Resolve-RepoContext
    $repoName = $repoContext.GitHubRepo
    $repoOwner = $repoContext.GitHubOwner

    $resourceGroupName = if ($RequestedResourceGroupName) { $RequestedResourceGroupName.Trim() } else { "rg-$repoName-prod" }
    $staticWebAppName = if ($RequestedStaticWebAppName) { $RequestedStaticWebAppName.Trim() } else { "stapp-$repoName-prod" }

    return [PSCustomObject]@{
        SubscriptionId        = $SubscriptionContext.id
        SubscriptionName      = $SubscriptionContext.name
        ResourceGroupName     = $resourceGroupName
        ResourceGroupLocation = $ResourceGroupLocation
        StaticWebAppName      = $staticWebAppName
        RepoOwner             = $repoOwner
        RepoName              = $repoName
        RepoSlug              = "$repoOwner/$repoName"
        Sku                   = $Sku
    }
}

function Resolve-ResourceState {
    param($Context)

    Write-Info 'リソースの存在確認を実行しています...'
    $targetRgExists = Test-ResourceGroupExists -Name $Context.ResourceGroupName -SubscriptionId $Context.SubscriptionId
    $existingSwa = Get-StaticWebAppGlobal -Name $Context.StaticWebAppName -SubscriptionId $Context.SubscriptionId

    $swaOwnerRg = $null
    if ($existingSwa) {
        $swaOwnerRg = Get-ResourceGroupFromResourceId -ResourceId $existingSwa.id
        if (-not $swaOwnerRg) {
            throw "Static Web App '$($Context.StaticWebAppName)' のリソースグループを特定できませんでした。"
        }
    }

    return [PSCustomObject]@{
        TargetResourceGroupExists = $targetRgExists
        StaticWebApp              = $existingSwa
        StaticWebAppResourceGroup = $swaOwnerRg
    }
}

function New-StaticWebAppResource {
    param(
        $Context,
        [string]$ResourceGroupName
    )

    Write-Info "Static Web App '$($Context.StaticWebAppName)' を作成しています..."
    az staticwebapp create --name $Context.StaticWebAppName --resource-group $ResourceGroupName --sku $Context.Sku --subscription $Context.SubscriptionId | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Static Web App の作成に失敗しました。'
    }

    $deploymentToken = Get-DeploymentToken -Name $Context.StaticWebAppName -ResourceGroup $ResourceGroupName -SubscriptionId $Context.SubscriptionId
    Write-Info 'デプロイトークンを取得しました。'
    return $deploymentToken
}

function Ensure-GitHubSecret {
    param(
        $Context,
        [string]$DeploymentToken
    )

    if (-not $DeploymentToken) {
        return
    }

    Set-GitHubSecret -Repo $Context.RepoSlug -SecretValue $DeploymentToken
    Write-Host "[SUCCESS] GitHub シークレット '$GitHubSecretNameConst' を $($Context.RepoSlug) 用に更新しました。" -ForegroundColor Green
}

function Ensure-StaticWebApp {
    param(
        $Context,
        $ResourceState
    )

    if (-not $ResourceState.StaticWebApp) {
        $rgName = Ensure-ResourceGroup -Name $Context.ResourceGroupName -Location $Context.ResourceGroupLocation -SubscriptionId $Context.SubscriptionId
        $token = New-StaticWebAppResource -Context $Context -ResourceGroupName $rgName
        Ensure-GitHubSecret -Context $Context -DeploymentToken $token

        return [PSCustomObject]@{
            ResourceGroupName = $rgName
            DeploymentToken   = $token
        }
    }

    Write-Info "既存の Static Web App '$($Context.StaticWebAppName)' が見つかりました。"
    $reuseResources = Confirm-StaticWebAppReuse -ResourceGroupName $ResourceState.StaticWebAppResourceGroup -StaticWebAppName $Context.StaticWebAppName

    if ($reuseResources) {
        Write-Info "既存の Static Web App を再利用します（リソースグループ: $($ResourceState.StaticWebAppResourceGroup)）。"
        $token = Get-DeploymentToken -Name $Context.StaticWebAppName -ResourceGroup $ResourceState.StaticWebAppResourceGroup -SubscriptionId $Context.SubscriptionId
        Ensure-GitHubSecret -Context $Context -DeploymentToken $token
        return [PSCustomObject]@{
            ResourceGroupName = $ResourceState.StaticWebAppResourceGroup
            DeploymentToken   = $token
        }
    }

    Write-Info '既存リソースを削除して再作成します。'
    Remove-StaticWebAppWithConfirmation -Name $Context.StaticWebAppName -ResourceGroup $ResourceState.StaticWebAppResourceGroup -SubscriptionId $Context.SubscriptionId

    $rgName = Ensure-ResourceGroup -Name $Context.ResourceGroupName -Location $Context.ResourceGroupLocation -SubscriptionId $Context.SubscriptionId
    $token = New-StaticWebAppResource -Context $Context -ResourceGroupName $rgName
    Ensure-GitHubSecret -Context $Context -DeploymentToken $token

    return [PSCustomObject]@{
        ResourceGroupName = $rgName
        DeploymentToken   = $token
    }
}

Main
