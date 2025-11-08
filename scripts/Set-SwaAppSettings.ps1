#!/usr/bin/env pwsh

<#
.SYNOPSIS
Configures GitHub-related app settings on an Azure Static Web App.

.DESCRIPTION
Ensures the GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REPO_OWNER, and
GITHUB_REPO_NAME settings exist (and match provided values) for the Production
Static Web App environment. Repository情報は git remote から自動検出します。
Existing settings are left untouched when the values already match.

.PARAMETER ResourceGroupName
Resource group that contains the Static Web App (defaults to rg-<repo>-prod).

.PARAMETER Name
Static Web App name (defaults to stapp-<repo>-prod).

.PARAMETER ClientId
GitHub OAuth App Client ID. Prompted interactively if omitted.

.PARAMETER ClientSecret
GitHub OAuth App Client Secret. Prompted securely if omitted.

.EXAMPLE
pwsh ./scripts/Set-SwaAppSettings.ps1 --resource-group rg-swa --name stapp-swa

Prompts for the required GitHub credentials and upserts them into the Production environment.
#>
[CmdletBinding()]
param(
    [string]$ResourceGroupName,
    [string]$Name,
    [string]$ClientId,
    [string]$ClientSecret
)

$ErrorActionPreference = 'Stop'

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

function Get-AppSettings {
    param([string]$Name,[string]$ResourceGroup)
    $args = @('staticwebapp','appsettings','list','--name',$Name,'--resource-group',$ResourceGroup,'--query','properties')
    $output = az @args 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) {
        return @{}
    }
    $json = ConvertFrom-Json $output
    $result = @{}
    if ($json -is [System.Collections.IDictionary]) {
        foreach ($key in $json.Keys) {
            $result[$key] = [string]$json[$key]
        }
    }
    else {
        foreach ($prop in $json.PSObject.Properties) {
            $result[$prop.Name] = [string]$prop.Value
        }
    }
    return $result
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

if (-not $ClientId) {
    $ClientId = Read-Host 'GitHub OAuth Client ID を入力してください'
}

if (-not $ClientSecret) {
    $secureSecret = Read-Host 'GitHub OAuth Client Secret を入力してください' -AsSecureString
    $ClientSecret = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
    )
}

$desiredSettings = [ordered]@{
    'GITHUB_CLIENT_ID' = $ClientId
    'GITHUB_CLIENT_SECRET' = $ClientSecret
    'GITHUB_REPO_OWNER' = $repoOwner
    'GITHUB_REPO_NAME' = $repoName
}

$existingSettings = Get-AppSettings -Name $Name -ResourceGroup $ResourceGroupName
$managedKeys = $desiredSettings.Keys

$settingsToApply = @()
foreach ($entry in $desiredSettings.GetEnumerator()) {
    $key = $entry.Key
    $value = $entry.Value
    if (-not $existingSettings.ContainsKey($key) -or $existingSettings[$key] -ne $value) {
        $settingsToApply += "$key=$value"
    }
}

if ($settingsToApply.Count -eq 0) {
    Write-Info '管理対象のアプリ設定はすべて希望値と一致しているため更新をスキップします。'
    return
}

$setArgs = @('staticwebapp','appsettings','set','--name',$Name,'--resource-group',$ResourceGroupName,'--setting-names') + $settingsToApply

Write-Info 'アプリ設定を更新しています...'
az @setArgs | Out-Null

Write-Host "[SUCCESS] アプリ設定を更新しました。必要に応じて 'az staticwebapp appsettings list -n $Name -g $ResourceGroupName' で確認してください。" -ForegroundColor Green
