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

#### `scripts/New-SwaResources.ps1` の主な引数

| 引数 | 説明 | 既定値・備考 |
| --- | --- | --- |
| `-ResourceGroupName` | 作成または再利用するリソースグループ名。 | `rg-<repo>-prod` |
| `-Name` | Static Web Apps リソース名。 | `stapp-<repo>-prod` |
| `-ResourceGroupLocation` | リソースグループを配置するリージョン。 | `japaneast` |
| `-SubscriptionId` | 利用するサブスクリプション ID を直接指定。 | 未指定時は `az account show` の結果を確認しながら選択 |
| `-Sku` | Static Web Apps の SKU。 | `Standard` (`Free` も指定可) |
| `-ClientId` | GitHub OAuth App の Client ID。 | 未指定時は対話入力 |
| `-ClientSecret` | GitHub OAuth App の Client Secret。 | 未指定時は安全な対話入力 |

#### 使い方例

```pwsh
# 既定値を上書きしながら静的Webアプリを構築
pwsh ./scripts/New-SwaResources.ps1 `
  -ResourceGroupName rg-swa-github-auth-prod `
  -Name stapp-swa-github-auth-prod `
  -ResourceGroupLocation japaneast `
  -SubscriptionId 00000000-0000-0000-0000-000000000000 `
  -Sku Standard `
  -ClientId "<GitHub OAuth Client ID>" `
  -ClientSecret "<GitHub OAuth Client Secret>"

# 引数を省略するとリポジトリ名からの推測値と対話プロンプトで進行
pwsh ./scripts/New-SwaResources.ps1
```

### 3. API開発

#### 1. 依存関係のインストール

Azure Functionsの依存関係をインストールします:

```bash
cd api
npm install
```

#### 2. テスト実行

Azure Functionsのテストを実行するには、以下のコマンドを実行します:

```bash
cd api
npm test
```

これにより、Jestによるユニットテストとカバレッジレポートが生成されます。

## SWAアクセス時の動作

このリポジトリでは、`staticwebapp.config.json` の `rolesSource` に `/api/AuthorizeRepositoryAccess` を指定し、GitHub OAuth で取得したアクセストークンを用いて対象リポジトリの read 権限を判定しています。

### アーキテクチャ

```mermaid
architecture-beta
    service browser(internet)[Browser]
    
    group swa(cloud)[Azure Static Web Apps]
    service auth(server)[GitHub OAuth] in swa
    service content(disk)[Static Content] in swa
    
    group functions(server)[Azure Functions]
    service roleFunc(server)[AuthorizeRepositoryAccess] in functions
    
    group github(cloud)[GitHub]
    service ghapi(internet)[REST API] in github
    
    browser:R -- L:auth
    auth:R -- L:content
    content:R -- L:browser
    auth:B -- T:roleFunc
    roleFunc:R -- L:ghapi
    ghapi:L -- R:auth
```

### リクエストシーケンス

リクエストからロール決定までの概略シーケンスは以下の通りです。

```mermaid
sequenceDiagram
    participant Browser
    participant SWA as Azure Static Web Apps
    participant Login as SWA GitHub OAuth
    participant RoleSrc as /api/AuthorizeRepositoryAccess
    participant Principal as githubPrincipal.extractGitHubPrincipal
    participant Authorizer as createRepositoryAuthorizer().authorize
    participant GH as GitHub REST API

    Browser->>SWA: GET /
    SWA-->>Browser: 302 -> /.auth/login/github (authorized でない場合)
    Browser->>Login: /.auth/login/github
    Login->>GH: OAuth 認証 (scope repo)
    GH-->>Login: access token
    Login-->>SWA: clientPrincipal (accessToken付き)

    SWA->>RoleSrc: POST clientPrincipal
    RoleSrc->>Principal: githubPrincipal.extractGitHubPrincipal(req)
    Principal-->>RoleSrc: principal(identity, accessToken)

    RoleSrc->>Authorizer: repositoryAuthorizer.authorize(accessToken, logger)
    Authorizer->>GH: GET https://api.github.com/repos/{owner}/{repo}
    GH-->>Authorizer: 200 / 401 / 403 / 404
    alt GitHubのリポジトリアクセス権あり (200)
        Authorizer-->>RoleSrc: true
        RoleSrc-->>SWA: 200 {roles:['authorized']}
        SWA-->>Browser: 静的コンテンツ
    else 権限なし/失敗 (401/403/404/エラー)
        Authorizer-->>RoleSrc: false
        RoleSrc-->>SWA: 200 {roles:[]}
        SWA-->>Browser: 401/403 でアクセス拒否
    end
```

- `/api/AuthorizeRepositoryAccess` エンドポイントは `api/AuthorizeRepositoryAccess/index.js` にある `createAuthorizeRepositoryAccessHandler` が実体であり、`createRepositoryAuthorizer()` で生成した `repositoryAuthorizer.authorize` と `githubPrincipal.extractGitHubPrincipal` を組み合わせてロールを決定します。
- `api/lib/githubPrincipal.js` の `extractGitHubPrincipal` は GitHub 以外のプリンシパルやトークン欠如を検知した場合は即座に匿名相当 (`[]`) を返すよう `null` を返却し、`req.body.clientPrincipal` (または `req.body`) から GitHub プロバイダーの情報だけを抽出して `userId`/`userDetails`/`accessToken` を正規化します。
- `api/lib/repositoryAuthorizer.js` の `createRepositoryAuthorizer(...).authorize` は GitHub REST API の `/repos/{owner}/{repo}` を呼び出し、HTTP 200 なら `true` を返却します。401/403/404 や例外時は `false` を返し、その結果をハンドラーが `['authorized']` もしくは `[]` に変換します。

### ログアウト動作

- `docs/signed-out/index.html` は `/.auth/logout?post_logout_redirect_uri=/signed-out/` から誘導されるサインアウト用ページで、読み込み時に `/.auth/purge/github` を `POST` して SWA 側が保持するトークンを削除します。手動で再実行したい場合に備えてボタンも配置しています。
- GitHub のセッションは別管理のため、`staticwebapp.config.json` の `401` レスポンスは Learn の推奨どおり `/.auth/login/github?post_login_redirect_uri=.referrer` を指し続け、未ログインのまま保護ルートにアクセスすると再び GitHub ログインへリダイレクトされます。完全にサインアウトしたい場合はサインアウトページにある「アプリの認証情報を再度削除」「GitHubをログアウト」を順に利用してください。
