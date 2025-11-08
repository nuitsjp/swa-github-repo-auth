#!/usr/bin/env pwsh

<#
.SYNOPSIS
ローカル依存関係を初期化し、Azure Static Web App をプロビジョニングします。

.DESCRIPTION
リポジトリルートと api フォルダーの npm install を実行し（既にインストール済みの場合はスキップ）、
Azure Static Web Apps CLI 拡張機能がインストールされていることを確認し、オプションで
Static Web App リソースを作成または再作成します。-PrepareOnly を使用すると、ローカル準備タスクのみに
スクリプトを制限できます。-Force を使用すると、node_modules の再構築、拡張機能の再インストール、
および既存の Static Web App が存在する場合は再作成を行います。

.PARAMETER ResourceGroupName
デフォルトのリソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER Sku
Static Web App の SKU（Free、Standard、Dedicated）。

.PARAMETER Source
デプロイメント用に接続する Git リポジトリの URL。省略した場合、空の SWA が作成されます。

.PARAMETER Branch
Git 統合のブランチ名（デフォルト: main）。

.PARAMETER AppLocation
ビルド成果物の相対アプリパス（デフォルト: docs）。

.PARAMETER ApiLocation
相対 API パス（デフォルト: api）。

.PARAMETER OutputLocation
ビルド済みフロントエンドの相対出力パス（オプション）。

.PARAMETER LoginWithGithub
デプロイメント構成時に Azure CLI の GitHub 認証フローをトリガーします。

.PARAMETER PrepareOnly
Azure リソースをプロビジョニングせずに、依存関係のインストールと拡張機能のチェックのみを実行します。

.PARAMETER GitHubRepo
オプションの GitHub リポジトリ（形式: owner/repo）。指定すると、スクリプトは
GitHubSecretName で指定されたリポジトリシークレットにデプロイメントトークンを書き込みます。

.PARAMETER GitHubSecretName
GitHubRepo が指定された場合に更新する GitHub シークレットの名前。デフォルトは
AZURE_STATIC_WEB_APPS_API_TOKEN。

.PARAMETER Force
依存関係の再インストール、SWA CLI 拡張機能の再インストール、および
既存の Static Web App が存在する場合は再作成を強制します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 -PrepareOnly

Azure リソースを作成せずに npm install（root/api）を実行し、SWA CLI 拡張機能が
存在することを確認します。

.EXAMPLE
pwsh ./scripts/New-SwaResources.ps1 --source https://github.com/contoso/swa --branch main --login-with-github

必要に応じてリポジトリを準備し、GitHub に接続された Static Web App をプロビジョニングします。
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [string]$ResourceGroupLocation = 'japaneast',
    [ValidateSet('Free','Standard','Dedicated')]
    [string]$Sku = 'Standard',
    [string]$Source,
    [string]$Branch = 'main',
    [string]$AppLocation = 'docs',
    [string]$ApiLocation = 'api',
    [string]$OutputLocation,
    [switch]$LoginWithGithub,
    [switch]$PrepareOnly,
    [string]$GitHubRepo,
    [string]$GitHubSecretName = 'AZURE_STATIC_WEB_APPS_API_TOKEN',
    [switch]$Force
)

# 情報メッセージをシアン色で出力するヘルパー関数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

# npm 依存関係のインストールを確認・実行する関数
# 既に node_modules が存在する場合はスキップ（-ForceInstall で強制再インストール可能）
function Ensure-NpmDependencies {
    param(
        [Parameter(Mandatory)] [string]$WorkingDirectory,
        [Parameter(Mandatory)] [string]$Label,
        [switch]$ForceInstall
    )

    $nodeModules = Join-Path $WorkingDirectory 'node_modules'
    if ((Test-Path $nodeModules) -and -not $ForceInstall) {
        Write-Info "$Label dependencies already installed. Skipping."
        return
    }

    if ($ForceInstall -and (Test-Path $nodeModules)) {
        Write-Info "Force specified. Removing existing node_modules for $Label before reinstalling."
        Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
    }

    Push-Location $WorkingDirectory
    try {
        Write-Info "Running 'npm install' for $Label."
        npm install | Out-Null
    }
    finally {
        Pop-Location
    }
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

# Azure CLI (az) の存在確認
function Ensure-AzCli {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw "Azure CLI (az) is required. Install it from https://learn.microsoft.com/cli/azure/install-azure-cli"
    }
}

# Azure Static Web Apps CLI 拡張機能のインストール・確認
# -ForceInstall で既存拡張機能を削除して再インストール
function Ensure-StaticWebAppsExtension {
    param([switch]$ForceInstall)

    $extensionInstalled = $false
    $null = az extension show --name staticwebapp 2>$null
    if ($LASTEXITCODE -eq 0) {
        $extensionInstalled = $true
    }

    if ($ForceInstall -and $extensionInstalled) {
        Write-Info 'Force specified. Removing existing Azure Static Web Apps extension.'
        az extension remove --name staticwebapp | Out-Null
        $extensionInstalled = $false
    }

    if (-not $extensionInstalled) {
        Write-Info 'Installing Azure Static Web Apps extension...'
        az extension add --name staticwebapp | Out-Null
    }
    else {
        Write-Info 'Azure Static Web Apps extension already installed. Skipping.'
    }
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
    param([string]$Name,[string]$ResourceGroup)
    $token = az staticwebapp secrets list --name $Name --resource-group $ResourceGroup --query deploymentToken -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $token) {
        throw 'Failed to retrieve deployment token. Ensure the Static Web App exists and you have sufficient permissions.'
    }
    return $token.Trim()
}

# GitHub リポジトリのシークレットを設定する関数（GitHub CLI を使用）
function Set-GitHubSecret {
    param(
        [string]$Repo,
        [string]$SecretName,
        [string]$SecretValue
    )

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "GitHub CLI (gh) is required to update repository secrets. Install it from https://cli.github.com/."
    }

    Write-Info "Updating GitHub secret '$SecretName' in '$Repo'."
    gh secret set $SecretName --repo $Repo --body $SecretValue | Out-Null
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

# 必須ツール: npm の存在確認
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required. Install Node.js 18+ which includes npm.'
}

# スクリプトディレクトリとリポジトリルートの解決
$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$apiDir = Join-Path $repoRoot 'api'

# API ディレクトリの存在確認
if (-not (Test-Path $apiDir)) {
    throw "API directory not found at $apiDir"
}

# 依存関係のインストール（ルートと API）
Ensure-NpmDependencies -WorkingDirectory $repoRoot -Label 'root' -ForceInstall:$Force
Ensure-NpmDependencies -WorkingDirectory $apiDir -Label 'api' -ForceInstall:$Force
Ensure-StaticWebAppsExtension -ForceInstall:$Force

# -PrepareOnly が指定された場合は準備タスクのみ実行してスクリプトを終了
if ($PrepareOnly) {
    if ($GitHubRepo) {
        throw 'GitHubRepo cannot be used with -PrepareOnly because no Static Web App provisioning occurs.'
    }
    Write-Info 'Preparation tasks completed. Skipping Azure provisioning as requested.'
    return
}

# Azure CLI の存在確認
Ensure-AzCli

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
    # 基本的な作成引数を構築
    $createArgs = @(
        'staticwebapp','create',
        '--name',$Name,
        '--resource-group',$ResourceGroupName,
        '--sku',$Sku
    )

    # Git リポジトリソースが指定されている場合は統合設定を追加
    if ($Source) {
        $createArgs += @('--source',$Source,'--branch',$Branch)
        if ($AppLocation) {
            $createArgs += @('--app-location',$AppLocation)
        }
        if ($ApiLocation) {
            $createArgs += @('--api-location',$ApiLocation)
        }
        if ($OutputLocation) {
            $createArgs += @('--output-location',$OutputLocation)
        }
    }

    # GitHub ログインフラグが指定されている場合は追加
    if ($LoginWithGithub.IsPresent) {
        $createArgs += '--login-with-github'
    }

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
if ($GitHubRepo) {
    Set-GitHubSecret -Repo $GitHubRepo -SecretName $GitHubSecretName -SecretValue $deploymentToken
    Write-Host "[SUCCESS] GitHub secret '$GitHubSecretName' updated for $GitHubRepo." -ForegroundColor Green
} else {
    Write-Host "[SUCCESS] Static Web App '$Name' is ready. Add the deployment token to your GitHub secrets (e.g., gh secret set $GitHubSecretName --repo <owner/repo>)." -ForegroundColor Green
}
