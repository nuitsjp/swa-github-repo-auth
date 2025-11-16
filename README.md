# Azure Static Web Apps - GitHub認証サンプル

GitHubリポジトリのドキュメントをAzure Static Web Apps(SWA)で公開し、対象リポジトリのread権限を持つユーザーだけに閲覧を許可するためのサンプルです。

## 目的

- SWAで公開したサイトを、read権限を持つユーザーだけに閲覧を許可する
- そのために必要な下記の2つを共有する
  - SWAリソースの作成とGitHubシークレット/アプリ設定の登録を自動化するPowerShellスクリプト
  - GitHub OAuthを利用して認可するカスタム認証の実装例

## 前提

- Azure Static Web AppsのStandardプランが利用可能
- GitHubが利用可能であること

## 環境

- Windows 11
- Azure CLI
- GitHub CLI
- PowerShell 7+

## 構築手順

### 1. リポジトリ取得と初期化

```bash
git clone https://github.com/nuitsjp/swa-github-repo-auth.git
cd swa-github-repo-auth
```

### 2. Azure Static Web Appsリソース作成

PowerShellスクリプト`New-SwaResources.ps1`を実行して、必要なAzureリソースを作成します:

```pwsh
cd scripts
./New-SwaResources.ps1
```
