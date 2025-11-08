#!/usr/bin/env pwsh

<#
.SYNOPSIS
ローカル依存関係を初期化し、Azure Static Web App をプロビジョニングしてデプロイトークンを取得します。

.DESCRIPTION
Azure Static Web App リソースを作成または再作成し、デプロイトークンを取得します。ローカル依存関係や
CLI 拡張のインストールは `scripts/Prepare-LocalEnvironment.ps1` に分離されているため、このスクリプトを
実行する前に準備を済ませてください。`--UpdateGitHubSecret` を指定すると、取得したデプロイトークンを
GitHub CLI (`gh secret set`) でカレントリポジトリ（git remote origin）の `AZURE_STATIC_WEB_APPS_API_TOKEN`
シークレットに登録し、同梱の `.github/workflows/deploy-azure-static-web-apps.yml` が利用できる状態にします。

.PARAMETER ResourceGroupName
デフォルトのリソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER Sku
Static Web App の SKU（Free、Standard、Dedicated）。

.PARAMETER UpdateGitHubSecret
現在の git リポジトリ（remote origin）に `AZURE_STATIC_WEB_APPS_API_TOKEN` シークレットを登録します。

.PARAMETER Force
依存関係の再インストール、SWA CLI 拡張機能の再インストール、および既存の Static Web App 再作成を強制します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 --UpdateGitHubSecret

必要に応じてリポジトリを準備し、Static Web App を作成し、デプロイトークンを GitHub シークレットに登録します。
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [string]$ResourceGroupLocation = 'japaneast',
    [ValidateSet('Free','Standard','Dedicated')]
    [string]$Sku = 'Standard',
    [switch]$UpdateGitHubSecret,
    [switch]$Force
)

Set-Variable -Name GitHubSecretNameConst -Value 'AZURE_STATIC_WEB_APPS_API_TOKEN' -Option Constant

# 情報メッセージをシアン色で出力するヘルパー関数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}


# Git リポジトリのルート名を取得する関数
# git コマンドが利用できない場合は現在のディレクトリ名を使用
function Resolve-RepoName {
    $repoRoot = $(git rev-parse --show-toplevel 2>$null)
    if (-not $repoRoot) {
        $repoRoot = (Get-Location).Path
    }
    return (Split-Path $repoRoot -Leaf)
}

function Resolve-GitHubRepoSlug {
    $remoteUrl = $(git remote get-url origin 2>$null)
    if (-not $remoteUrl) {
        throw 'Failed to determine GitHub repository. Configure git remote "origin" first.'
    }

    $remoteUrl = $remoteUrl.Trim()
    $pattern = 'github\.com[:/](?<owner>[^/]+?)/(?<repo>[^/]+?)(?:\.git)?$'
    if ($remoteUrl -match $pattern) {
        return "$($matches.owner)/$($matches.repo)"
    }

    throw "Unable to parse GitHub repository from remote URL '$remoteUrl'."
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

# Static Web App を削除する関数
function Remove-StaticWebApp {
    param([string]$Name,[string]$ResourceGroup)
    az staticwebapp delete --name $Name --resource-group $ResourceGroup --yes | Out-Null
}

# デプロイメントトークンを取得する関数
function Get-DeploymentToken {
    param(
        [string]$Name,
        [string]$ResourceGroup
    )

    $token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup --query "properties.apiKey" -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $token) {
        throw 'Failed to retrieve deployment token. Ensure the Static Web App exists and you have sufficient permissions.'
    }

    return $token.Trim()
}

# GitHub リポジトリのシークレットを設定する関数（GitHub CLI を使用）
function Set-GitHubSecret {
    param(
        [string]$Repo,
        [string]$SecretValue
    )

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "GitHub CLI (gh) is required to update repository secrets. Install it from https://cli.github.com/."
    }

    Write-Info "Updating GitHub secret '$GitHubSecretNameConst' in '$Repo'."
    gh secret set $GitHubSecretNameConst --repo $Repo --body $SecretValue | Out-Null
}

# リポジトリ名の解決（デフォルトのリソース名生成に使用）
$repoName = Resolve-RepoName
if (-not $repoName) {
    throw 'Failed to determine repository name.'
}

# パラメータが未指定の場合はリポジトリ名に基づいてデフォルト値を設定
if (-not $ResourceGroupName) {
    $ResourceGroupName = "rg-$repoName-prod"
}

if (-not $Name) {
    $Name = "stapp-$repoName-prod"
}

if (-not $ResourceGroupLocation) {
    throw 'Resource group location is required.'
}

$targetGitHubRepo = $null
if ($UpdateGitHubSecret) {
    $targetGitHubRepo = Resolve-GitHubRepoSlug
}

# リソースグループの作成または確認
Write-Info "Ensuring resource group '$ResourceGroupName' exists in '$ResourceGroupLocation'..."
az group create --name $ResourceGroupName --location $ResourceGroupLocation | Out-Null

# 既存の Static Web App を確認（-Force が指定されている場合は削除）
$existingApp = Get-StaticWebApp -Name $Name -ResourceGroup $ResourceGroupName
if ($existingApp -and $Force) {
    Write-Info "Force specified. Deleting existing Static Web App '$Name'."
    Remove-StaticWebApp -Name $Name -ResourceGroup $ResourceGroupName
    $existingApp = $null
}

# Static Web App の作成（存在しない場合のみ）
if (-not $existingApp) {
    $createArgs = @(
        'staticwebapp','create',
        '--name',$Name,
        '--resource-group',$ResourceGroupName,
        '--sku',$Sku
    )

    Write-Info "Creating Static Web App '$Name'..."
    az @createArgs | Out-Null
}
else {
    Write-Info "Static Web App '$Name' already exists. Use --Force to recreate."
}

# デプロイメントトークンの取得
$deploymentToken = Get-DeploymentToken -Name $Name -ResourceGroup $ResourceGroupName
Write-Info 'Deployment token retrieved.'

# GitHub リポジトリが指定されている場合はシークレットを更新
if ($targetGitHubRepo) {
    Set-GitHubSecret -Repo $targetGitHubRepo -SecretValue $deploymentToken
    Write-Host "[SUCCESS] GitHub secret '$GitHubSecretNameConst' updated for $targetGitHubRepo." -ForegroundColor Green
} else {
    Write-Host "[SUCCESS] Static Web App '$Name' is ready. Add the deployment token to your GitHub secrets (e.g., gh secret set $GitHubSecretNameConst --repo <owner/repo>)." -ForegroundColor Green
}
