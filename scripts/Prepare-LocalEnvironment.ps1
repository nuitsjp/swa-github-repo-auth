#!/usr/bin/env pwsh

<#
.SYNOPSIS
ローカル開発に必要な依存関係と Azure CLI 拡張機能をセットアップします。

.DESCRIPTION
リポジトリルートと api ディレクトリの npm 依存関係を確認し、必要に応じて再インストールします。
また、Azure CLI と Static Web Apps CLI 拡張機能の存在を検証し、未導入の場合は追加します。
.PARAMETER Force
node_modules および Azure Static Web Apps CLI 拡張機能の再インストールを強制します。
#>
[CmdletBinding()]
param(
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
        Write-Info "$Label の依存関係は既にインストール済みのためスキップします。"
        return
    }

    if ($ForceInstall -and (Test-Path $nodeModules)) {
        Write-Info "Force オプションが指定されたため、$Label の node_modules を削除して再インストールします。"
        Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
    }

    Push-Location $WorkingDirectory
    try {
        Write-Info "$Label で 'npm install' を実行します。"
        npm install | Out-Null
    }
    finally {
        # 元のディレクトリに必ず戻る
        Pop-Location
    }
}

# Azure CLI (az) の存在確認
function Ensure-AzCli {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI (az) が見つかりません。https://learn.microsoft.com/cli/azure/install-azure-cli を参照してインストールしてください。'
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
        Write-Info 'Force オプションが指定されたため、既存の Azure Static Web Apps 拡張機能を削除します。'
        az extension remove --name staticwebapp | Out-Null
        $extensionInstalled = $false
    }

    if (-not $extensionInstalled) {
        Write-Info 'Azure Static Web Apps 拡張機能をインストールしています...'
        az extension add --name staticwebapp | Out-Null
    }
    else {
        Write-Info 'Azure Static Web Apps 拡張機能は既にインストール済みのためスキップします。'
    }
}

# 必須ツール: npm の存在確認（Node.js 18+ に含まれる）
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm が見つかりません。npm を含む Node.js 18 以上をインストールしてください。'
}

# スクリプトディレクトリとリポジトリルートの解決
$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$apiDir = Join-Path $repoRoot 'api'

# API ディレクトリの存在確認
if (-not (Test-Path $apiDir)) {
    throw "API ディレクトリが $apiDir に見つかりません。"
}

# 依存関係のインストール（ルートディレクトリ: SWA CLI など）
Ensure-NpmDependencies -WorkingDirectory $repoRoot -Label 'root' -ForceInstall:$Force

# 依存関係のインストール（API ディレクトリ: Azure Functions ランタイムなど）
Ensure-NpmDependencies -WorkingDirectory $apiDir -Label 'api' -ForceInstall:$Force

# Azure CLI の存在確認
Ensure-AzCli

# Azure Static Web Apps CLI 拡張機能のインストール・更新
Ensure-StaticWebAppsExtension -ForceInstall:$Force

# ローカル開発環境の準備完了メッセージ
Write-Host '[SUCCESS] ローカル開発の前提条件を準備しました。' -ForegroundColor Green
