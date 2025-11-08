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

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

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

function Ensure-AzCli {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI (az) is required. Install it from https://learn.microsoft.com/cli/azure/install-azure-cli'
    }
}

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

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required. Install Node.js 18+ which includes npm.'
}

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$apiDir = Join-Path $repoRoot 'api'

if (-not (Test-Path $apiDir)) {
    throw "API directory not found at $apiDir"
}

Ensure-NpmDependencies -WorkingDirectory $repoRoot -Label 'root' -ForceInstall:$Force
Ensure-NpmDependencies -WorkingDirectory $apiDir -Label 'api' -ForceInstall:$Force
Ensure-AzCli
Ensure-StaticWebAppsExtension -ForceInstall:$Force

Write-Host '[SUCCESS] Local prerequisites are ready.' -ForegroundColor Green
