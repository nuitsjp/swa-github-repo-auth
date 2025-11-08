#!/usr/bin/env pwsh

<#
.SYNOPSIS
ローカル依存関係を初期化し、Azure Static Web App をプロビジョニングしてデプロイトークンを取得します。

.DESCRIPTION
Azure Static Web App リソースを作成または再作成し、デプロイトークンを取得します。ローカル依存関係や
CLI 拡張のインストールは `scripts/Prepare-LocalEnvironment.ps1` に分離されているため、このスクリプトを
実行する前に準備を済ませてください。Static Web App プロビジョニング後は、取得したデプロイトークンを
GitHub CLI (`gh secret set`) でカレントリポジトリ（git remote origin）の `AZURE_STATIC_WEB_APPS_API_TOKEN`
シークレットに必ず登録し、同梱の `.github/workflows/deploy-azure-static-web-apps.yml` が利用できる状態にします。

.PARAMETER ResourceGroupName
デフォルトのリソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER Sku
Static Web App の SKU（Free、Standard、Dedicated）。

.PARAMETER Force
既存のリソースグループ（および配下の Static Web App）を削除してから再作成します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1

必要に応じてリポジトリを準備し、Static Web App を作成し、デプロイトークンを GitHub シークレットに登録します。
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [string]$ResourceGroupLocation = 'japaneast',
    [ValidateSet('Free','Standard','Dedicated')]
    [string]$Sku = 'Standard',
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Variable -Name GitHubSecretNameConst -Value 'AZURE_STATIC_WEB_APPS_API_TOKEN' -Option Constant

# 情報メッセージをシアン色で出力するヘルパー関数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}


# リポジトリ名および GitHub スラッグを解決する関数
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
        GitHubRepo = $repoName
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


# 既存の Static Web App を取得する関数（存在しない場合は $null を返す）
function Get-StaticWebApp {
    param([string]$Name,[string]$ResourceGroup)
    $output = az staticwebapp show --name $Name --resource-group $ResourceGroup 2>$null
    if ($LASTEXITCODE -eq 0 -and $output) {
        return $output | ConvertFrom-Json
    }
    return $null
}

# デプロイメントトークンを取得する関数
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

# Static Web App のホスト名を取得し、GitHub OAuth 設定用の URL を案内する
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
    Write-Host '    3. scripts/Set-SwaAppSettings.ps1 で GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET などを設定'
}

# GitHub リポジトリのシークレットを設定する関数（GitHub CLI を使用）
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

# リポジトリ情報の解決（リソース名や GitHub リモートに使用）
$repoContext = Resolve-RepoContext
$repoName = $repoContext.GitHubRepo

# パラメータが未指定の場合はリポジトリ名に基づいてデフォルト値を設定
if (-not $ResourceGroupName) {
    $ResourceGroupName = "rg-$repoName-prod"
}

if (-not $Name) {
    $Name = "stapp-$repoName-prod"
}

if (-not $ResourceGroupLocation) {
    throw 'リソースグループのリージョンが指定されていません。'
}

$targetGitHubRepo = "$($repoContext.GitHubOwner)/$($repoContext.GitHubRepo)"

# リソースグループの作成または確認
$resourceGroupExists = Get-ResourceGroup -Name $ResourceGroupName
if ($Force -and $resourceGroupExists) {
    Write-Info "Force オプションが指定されたため、リソースグループ '$ResourceGroupName' を削除します。"
    az group delete --name $ResourceGroupName --yes | Out-Null
    $resourceGroupExists = $false
}

if (-not $resourceGroupExists) {
    Write-Info "リソースグループ '$ResourceGroupName' を '$ResourceGroupLocation' に作成しています..."
    az group create --name $ResourceGroupName --location $ResourceGroupLocation | Out-Null
} else {
    Write-Info "リソースグループ '$ResourceGroupName' は既に存在します。"
}

$existingApp = $null
if (-not $Force) {
    $existingApp = Get-StaticWebApp -Name $Name -ResourceGroup $ResourceGroupName
}

# Static Web App の作成（存在しない場合のみ）
if (-not $existingApp) {
    $createArgs = @(
        'staticwebapp','create',
        '--name',$Name,
        '--resource-group',$ResourceGroupName,
        '--sku',$Sku
    )

    Write-Info "Static Web App '$Name' を作成しています..."
    az @createArgs | Out-Null

    $deploymentToken = Get-DeploymentToken -Name $Name -ResourceGroup $ResourceGroupName
    Write-Info 'デプロイトークンを取得しました。'

    Set-GitHubSecret -Repo $targetGitHubRepo -SecretValue $deploymentToken
    Write-Host "[SUCCESS] GitHub シークレット '$GitHubSecretNameConst' を $targetGitHubRepo 用に更新しました。" -ForegroundColor Green

    Show-GitHubOAuthInstructions -Name $Name -ResourceGroup $ResourceGroupName
}
else {
    Write-Info "Static Web App '$Name' は既に存在します。再作成する場合は --Force を指定してください。"

    Show-GitHubOAuthInstructions -Name $Name -ResourceGroup $ResourceGroupName
}
