#!/usr/bin/env pwsh

<#
.SYNOPSIS
Azure Static Web App のプロビジョニングと GitHub 関連アプリ設定の更新を 1 本で行います。

.DESCRIPTION
リポジトリ情報を git remote から検出し、必要なリソースグループおよび Static Web App を作成します。
新規作成時にはデプロイトークンを取得して GitHub シークレット (AZURE_STATIC_WEB_APPS_API_TOKEN) を登録し、
続けて GitHub OAuth App の Client ID / Secret、およびリポジトリ情報を Azure Static Web App のアプリ設定に
反映します。既存のリソースがある場合は検出して再利用し、差分がなければ作成ステップをスキップします。

.PARAMETER ResourceGroupName
リソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER Sku
Static Web App の SKU（Free、Standard、Dedicated）。

.PARAMETER Force
既存リソースグループを削除して再作成します。

.PARAMETER ClientId
GitHub OAuth App Client ID。未指定時は後段で対話プロンプトが表示されます。

.PARAMETER ClientSecret
GitHub OAuth App Client Secret。未指定時は後段で安全な対話プロンプトが表示されます。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 --client-id <id> --client-secret <secret>

Static Web App を作成し、GitHub シークレットとアプリ設定をまとめて更新します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 --force --client-id <id> --client-secret <secret>

既存のリソースグループや Static Web App を削除して再作成します。
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupLocation = 'japaneast',
    [ValidateSet('Free', 'Standard', 'Dedicated')]
    [string]$Sku = 'Standard',
    [switch]$Force,
    [string]$ClientId,
    [string]$ClientSecret
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Variable -Name GitHubSecretNameConst -Value 'AZURE_STATIC_WEB_APPS_API_TOKEN' -Option Constant

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
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

    return [pscustomobject]@{
        GitHubOwner = $matches.owner
        GitHubRepo  = $repoName
    }
}

function Get-ResourceGroup {
    param([string]$Name)
    $output = az group show --name $Name 2>$null
    if ($LASTEXITCODE -eq 0 -and $output) {
        return $true
    }
    return $false
}

function Get-StaticWebApp {
    param([string]$Name, [string]$ResourceGroup)
    $output = az staticwebapp show --name $Name --resource-group $ResourceGroup 2>$null
    if ($LASTEXITCODE -eq 0 -and $output) {
        return $output | ConvertFrom-Json
    }
    return $null
}

function Get-DeploymentToken {
    param(
        [string]$Name,
        [string]$ResourceGroup
    )

    $token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup --query "properties.apiKey" -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $token) {
        throw 'デプロイトークンの取得に失敗しました。Static Web App が存在し、十分な権限があるか確認してください。'
    }

    return $token.Trim()
}

function Show-GitHubOAuthInstructions {
    param(
        [string]$Name,
        [string]$ResourceGroup
    )

    $hostname = az staticwebapp show --name $Name --resource-group $ResourceGroup --query 'defaultHostname' -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $hostname) {
        Write-Warning 'Static Web App のホスト名を取得できませんでした。"az staticwebapp show" を手動で実行して GitHub OAuth App 用の URL を取得してください。'
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

function Resolve-ClientCredentials {
    param(
        [string]$ClientId,
        [string]$ClientSecret
    )

    $resolvedClientId = if ($ClientId) {
        $ClientId.Trim()
    }
    else {
        $input = Read-Host 'GitHub OAuth App Client ID'
        if (-not $input) {
            throw 'GitHub OAuth App Client ID が必要です。'
        }
        $input.Trim()
    }

    $resolvedClientSecret = if ($ClientSecret) {
        $ClientSecret
    }
    else {
        $secureInput = Read-Host 'GitHub OAuth App Client Secret' -AsSecureString
        $plain = Convert-SecureStringToPlainText -SecureString $secureInput
        if (-not $plain) {
            throw 'GitHub OAuth App Client Secret が必要です。'
        }
        $plain
    }

    return [pscustomobject]@{
        ClientId     = $resolvedClientId
        ClientSecret = $resolvedClientSecret
    }
}

function Set-AppSettings {
    param(
        [string]$Name,
        [string]$ResourceGroup,
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
    az staticwebapp appsettings set --name $Name -g $ResourceGroup --setting-names @settingNames | Out-Null

    if ($LASTEXITCODE -ne 0) {
        throw 'アプリ設定の更新に失敗しました。'
    }

    Write-Host "[SUCCESS] アプリ設定を更新しました。必要に応じて 'az staticwebapp appsettings list -n $Name -g $ResourceGroup' で確認してください。" -ForegroundColor Green
}

$repoContext = Resolve-RepoContext
$repoName = $repoContext.GitHubRepo
$repoOwner = $repoContext.GitHubOwner
if (-not $ResourceGroupName) {
    $ResourceGroupName = "rg-$repoName-prod"
}
if (-not $Name) {
    $Name = "stapp-$repoName-prod"
}

$targetGitHubRepo = "$repoOwner/$repoName"
$resolvedCredentials = $null
$shouldPromptAfterInstructions = (-not $ClientId) -or (-not $ClientSecret)
$swaCreated = $false

$resourceGroupExists = Get-ResourceGroup -Name $ResourceGroupName
if ($Force -and $resourceGroupExists) {
    Write-Info "Force オプションが指定されたため、リソースグループ '$ResourceGroupName' を削除します。"
    az group delete --name $ResourceGroupName --yes | Out-Null
    $resourceGroupExists = $false
}

if (-not $resourceGroupExists) {
    Write-Info "リソースグループ '$ResourceGroupName' を '$ResourceGroupLocation' に作成しています..."
    az group create --name $ResourceGroupName --location $ResourceGroupLocation | Out-Null
}
else {
    Write-Info "リソースグループ '$ResourceGroupName' は既に存在します。"
}

$existingApp = $null
if (-not $Force) {
    $existingApp = Get-StaticWebApp -Name $Name -ResourceGroup $ResourceGroupName
}

if (-not $existingApp) {
    $createArgs = @(
        'staticwebapp', 'create',
        '--name', $Name,
        '--resource-group', $ResourceGroupName,
        '--sku', $Sku
    )

    Write-Info "Static Web App '$Name' を作成しています..."
    az @createArgs | Out-Null

    $deploymentToken = Get-DeploymentToken -Name $Name -ResourceGroup $ResourceGroupName
    Write-Info 'デプロイトークンを取得しました。'

    Set-GitHubSecret -Repo $targetGitHubRepo -SecretValue $deploymentToken
    Write-Host "[SUCCESS] GitHub シークレット '$GitHubSecretNameConst' を $targetGitHubRepo 用に更新しました。" -ForegroundColor Green
    
    $swaCreated = $true
}
else {
    Write-Info "Static Web App '$Name' は既に存在します。再作成する場合は --Force を指定してください。"
}

if ($swaCreated -or $shouldPromptAfterInstructions) {
    Show-GitHubOAuthInstructions -Name $Name -ResourceGroup $ResourceGroupName
    
    if ($shouldPromptAfterInstructions) {
        Write-Info 'GitHub OAuth App の作成手順を完了したら、続けて Client ID / Secret を入力してください。'
        $resolvedCredentials = Resolve-ClientCredentials -ClientId $ClientId -ClientSecret $ClientSecret
    }
    else {
        Write-Info 'Static Web App が新規作成されました。上記 URL で GitHub OAuth App の設定を更新してください。'
        $resolvedCredentials = Resolve-ClientCredentials -ClientId $ClientId -ClientSecret $ClientSecret
    }
}
else {
    $resolvedCredentials = Resolve-ClientCredentials -ClientId $ClientId -ClientSecret $ClientSecret
}
Set-AppSettings -Name $Name -ResourceGroup $ResourceGroupName -ClientId $resolvedCredentials.ClientId -ClientSecret $resolvedCredentials.ClientSecret -RepoOwner $repoOwner -RepoName $repoName
