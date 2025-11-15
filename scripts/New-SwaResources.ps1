#!/usr/bin/env pwsh

<#
.SYNOPSIS
Azure Static Web App のプロビジョニングと GitHub 関連アプリ設定の更新を 1 本で行います。

.DESCRIPTION
リポジトリ情報を git remote から検出し、必要なリソースグループおよび Static Web App を作成します。
事前にグローバルでRGとSWAの存在を確認し、既存リソースがある場合は対話的に再利用または再作成を選択します。
新規作成時にはデプロイトークンを取得して GitHub シークレット (AZURE_STATIC_WEB_APPS_API_TOKEN) を登録し、
続けて GitHub OAuth App の Client ID / Secret、およびリポジトリ情報を Azure Static Web App のアプリ設定に
反映します。

.PARAMETER ResourceGroupName
リソースグループ名を上書きします（デフォルト: rg-<repo>-prod）。

.PARAMETER Name
Static Web App 名を上書きします（デフォルト: stapp-<repo>-prod）。

.PARAMETER ResourceGroupLocation
リソースグループのリージョン（デフォルト: japaneast）。

.PARAMETER Sku
Static Web App の SKU（Free、Standard、Dedicated）。

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
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupLocation = 'japaneast',
    [ValidateSet('Free', 'Standard', 'Dedicated')]
    [string]$Sku = 'Standard',
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

function Get-StaticWebAppGlobal {
    param([string]$Name)
    
    Write-Info "Static Web App '$Name' のグローバル検索を実行しています..."
    $output = az staticwebapp list --query "[?name=='$Name']" 2>$null
    
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
    
    # 複数見つかった場合は最初の1つを返す（通常は名前がユニークなので1つのはず）
    return $apps[0]
}

function Get-ResourceGroupFromResourceId {
    param([string]$ResourceId)
    
    # Resource ID format: /subscriptions/{sub}/resourceGroups/{rg}/providers/...
    if ($ResourceId -match '/resourceGroups/([^/]+)/') {
        return $matches[1]
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

function Confirm-ReuseResources {
    param([string]$ResourceGroupName, [string]$StaticWebAppName)
    
    Write-Host "`n既存の Static Web App が見つかりました:" -ForegroundColor Yellow
    Write-Host "  Static Web App: $StaticWebAppName"
    Write-Host "  所属リソースグループ: $ResourceGroupName"
    Write-Host "`nこの Static Web App を再利用しますか?" -ForegroundColor Yellow
    Write-Host "  [Y] 再利用 (既存のまま設定のみ更新)"
    Write-Host "  [N] 再作成 (既存SWAを削除して対象Resource Groupで再作成)"
    
    $response = Read-Host "選択してください [Y/N]"
    
    return $response -match '^[Yy]'
}

function Remove-StaticWebAppWithConfirmation {
    param([string]$Name, [string]$ResourceGroup)
    
    Write-Warning "Static Web App '$Name' を削除します。この操作は取り消せません。"
    Write-Host "削除を続行しますか? (yes と入力してください): " -NoNewline
    $confirmation = Read-Host
    
    if ($confirmation -ne 'yes') {
        throw '削除がキャンセルされました。'
    }
    
    Write-Info "Static Web App '$Name' を削除しています..."
    az staticwebapp delete --name $Name --resource-group $ResourceGroup --yes | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        throw 'Static Web App の削除に失敗しました。'
    }
    
    Write-Info 'Static Web App を削除しました。'
}
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
        $secureInput = Read-Host $PromptMessage -AsSecureString
        $plain = Convert-SecureStringToPlainText -SecureString $secureInput
        if (-not $plain) {
            throw "$PromptMessage が必要です。"
        }
        return $plain
    }
    else {
        $input = Read-Host $PromptMessage
        if (-not $input) {
            throw "$PromptMessage が必要です。"
        }
        return $input.Trim()
    }
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

# ========================================
# 事前チェック: RGとSWAの存在確認
# ========================================

Write-Info "リソースの存在確認を実行しています..."

# 対象RGの存在確認
$targetRgExists = Get-ResourceGroup -Name $ResourceGroupName

# SWAのグローバル検索
$existingSwa = Get-StaticWebAppGlobal -Name $Name

# SWA所属RGの特定
$swaOwnerRg = $null
if ($existingSwa) {
    $swaOwnerRg = Get-ResourceGroupFromResourceId -ResourceId $existingSwa.id
    if (-not $swaOwnerRg) {
        throw "Static Web App '$Name' のリソースグループを特定できませんでした。"
    }
}

# ========================================
# 判定と分岐処理
# ========================================

# ガード条件: SWA存在チェック
if (-not $existingSwa) {
    # SWA不在 → 新規作成
    Write-Info "新規リソースを作成します。"
    
    if (-not $targetRgExists) {
        Write-Info "リソースグループ '$ResourceGroupName' を '$ResourceGroupLocation' に作成しています..."
        az group create --name $ResourceGroupName --location $ResourceGroupLocation | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'リソースグループの作成に失敗しました。'
        }
    }
    
    Write-Info "Static Web App '$Name' を作成しています..."
    az staticwebapp create --name $Name --resource-group $ResourceGroupName --sku $Sku | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Static Web App の作成に失敗しました。'
    }
    
    $deploymentToken = Get-DeploymentToken -Name $Name -ResourceGroup $ResourceGroupName
    Write-Info 'デプロイトークンを取得しました。'
    
    Set-GitHubSecret -Repo $targetGitHubRepo -SecretValue $deploymentToken
    Write-Host "[SUCCESS] GitHub シークレット '$GitHubSecretNameConst' を $targetGitHubRepo 用に更新しました。" -ForegroundColor Green
}
else {
    # SWA存在 → ユーザーに確認
    Write-Info "既存の Static Web App '$Name' が見つかりました。"
    $reuseResources = Confirm-ReuseResources -ResourceGroupName $swaOwnerRg -StaticWebAppName $Name
    
    if (-not $reuseResources) {
        # 再作成: 既存SWA削除 → 必要に応じてRG作成 → SWA作成
        Write-Info "既存の Static Web App を削除して再作成します。"
        Remove-StaticWebAppWithConfirmation -Name $Name -ResourceGroup $swaOwnerRg
        
        if (-not $targetRgExists) {
            Write-Info "リソースグループ '$ResourceGroupName' を '$ResourceGroupLocation' に作成しています..."
            az group create --name $ResourceGroupName --location $ResourceGroupLocation | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw 'リソースグループの作成に失敗しました。'
            }
        }
        
        Write-Info "Static Web App '$Name' を作成しています..."
        az staticwebapp create --name $Name --resource-group $ResourceGroupName --sku $Sku | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Static Web App の作成に失敗しました。'
        }
        
        $deploymentToken = Get-DeploymentToken -Name $Name -ResourceGroup $ResourceGroupName
        Write-Info 'デプロイトークンを取得しました。'
        
        Set-GitHubSecret -Repo $targetGitHubRepo -SecretValue $deploymentToken
        Write-Host "[SUCCESS] GitHub シークレット '$GitHubSecretNameConst' を $targetGitHubRepo 用に更新しました。" -ForegroundColor Green
    }
    else {
        # 再利用: 既存のまま設定のみ更新
        Write-Info "既存の Static Web App を再利用します（リソースグループ: $swaOwnerRg）。"
        # 既存SWA所属のRGを使用するため、ResourceGroupNameを上書き
        $ResourceGroupName = $swaOwnerRg
    }
}

# ========================================
# OAuth手順とアプリ設定更新
# ========================================

# OAuth 手順を表示
Show-GitHubOAuthInstructions -Name $Name -ResourceGroup $ResourceGroupName

$resolvedClientId = Resolve-ParameterOrPrompt -Value $ClientId -PromptMessage 'GitHub OAuth App Client ID'
$resolvedClientSecret = Resolve-ParameterOrPrompt -Value $ClientSecret -PromptMessage 'GitHub OAuth App Client Secret' -AsSecureString

# アプリ設定の更新
Set-AppSettings -Name $Name -ResourceGroup $ResourceGroupName -ClientId $resolvedClientId -ClientSecret $resolvedClientSecret -RepoOwner $repoOwner -RepoName $repoName
