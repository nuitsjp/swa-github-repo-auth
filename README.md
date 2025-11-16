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

`scripts/New-SwaResources.ps1`(PowerShell Core)でリソースグループとSWAの作成、GitHubシークレットの登録、アプリ設定の更新を統合的に実行できます。

#### 基本動作

1. **サブスクリプション選択**:スクリプト開始時に現在のサブスクリプションを確認し、必要に応じて別のサブスクリプションを選択可能
2. **リポジトリ情報の自動検出**:`git remote origin`からGitHubリポジトリの所有者と名前を自動取得
3. **既存リソースの確認**:Static Web Appがグローバルに存在するかを検索
4. **再利用/再作成の選択**:既存のSWAが見つかった場合、対話的に再利用または再作成を選択
5. **デプロイトークンの自動設定**:新規作成時はデプロイトークンを取得し、GitHubシークレット`AZURE_STATIC_WEB_APPS_API_TOKEN`を自動登録

```bash
# 対話形式で実行（サブスクリプション選択、既存リソースの再利用確認を含む）
pwsh ./scripts/New-SwaResources.ps1

# パラメータを指定して実行
pwsh ./scripts/New-SwaResources.ps1 \
  --resource-group-name rg-mydocs-prod \
  --name stapp-mydocs-prod \
  --client-id <GitHub OAuth Client ID> \
  --client-secret <GitHub OAuth Client Secret>
```

#### パラメータ

- `ResourceGroupName`:リソースグループ名(デフォルト:`rg-<repo>-prod`)
- `Name`:Static Web App名(デフォルト:`stapp-<repo>-prod`)  
- `ResourceGroupLocation`:リソースグループのリージョン(デフォルト:`japaneast`)
- `Sku`:Static Web AppのSKU(Free/Standard、デフォルト:Standard)
- `ClientId`/`ClientSecret`:GitHub OAuth Appの認証情報(未指定時は対話プロンプトで入力)

### 3. GitHub OAuth Appの作成

スクリプト実行中にSWAのホスト名を使った設定手順が表示されます:

1. GitHub > Settings > Developer settings > **OAuth Apps** > **New OAuth App**
2. 表示されたURLを使用:
   - **Homepage URL**:`https://<swa-hostname>/`
   - **Authorization callback URL**:`https://<swa-hostname>/.auth/login/github/callback`
3. 作成後に表示される**Client ID**と生成した**Client Secret**を安全に保管
4. Organizationリポジトリの場合はOAuth AppのOrgアクセスを許可

### 4. 環境変数の設定

`New-SwaResources.ps1`は以下のアプリ設定を自動的にAzure Static Web Appに登録します:

- `GITHUB_CLIENT_ID`:GitHub OAuth AppのClient ID
- `GITHUB_CLIENT_SECRET`:GitHub OAuth AppのClient Secret  
- `GITHUB_REPO_OWNER`:リポジトリ所有者(git remoteから自動検出)
- `GITHUB_REPO_NAME`:リポジトリ名(git remoteから自動検出)

Client ID/Secretが未指定の場合、GitHub OAuth App作成手順の表示後に対話プロンプトで入力を求められます。

### 5. 動作確認

1. SWAサイトの`/.auth/login/github`にアクセスして対象ユーザーでログイン
2. `/.auth/me`のレスポンスで`roles: ["authorized"]`が付与されているか確認
3. `/admin/`など保護されたルートにアクセスし、権限に応じた挙動になっているか検証
4. `/.auth/logout`でサインアウトして再度アクセス制御を確認

### 6. ローカル検証(Lint/テスト)

`api/`配下のAzure FunctionsはESLintとJestを利用して静的解析とユニットテストを実行します。まず`api/`ディレクトリで依存関係をインストールし、Lintとテストを実行してください。

```bash
cd api
npm install
npm run lint
npm test
```

- `npm run lint`は`eslint .`を実行し、Node.js 18向けの推奨ルールでコード品質を確認します。
- `npm test`はJestによるカバレッジ収集付き実行で、グローバル閾値(branches/functions/lines/statementsはすべて90%)を満たすように構成されています。

### 7. CI/CD(GitHub Actions)

`CI`ワークフロー(`.github/workflows/ci.yml`)を追加しており、以下を自動で検証します。

- イベント:`push`/`pull_request`
- Node.js 18のセットアップ後に`api/`ディレクトリで`npm ci`→`npm run lint`→`npm test`
- Lintあるいはテストの失敗・カバレッジ閾値未達の際はワークフローがエラー終了

リポジトリへPushすると自動的にワークフローが実行され、Pull Requestでも同様のチェックが走ります。GitHub CLIの`gh run list`や`gh run watch`を利用すると、ローカル端末から結果を確認できます。

## アーキテクチャ資料

- 詳細なシーケンス図やコンポーネント構成は`docs/architecture.md`を参照してください。

## セキュリティと運用上の注意

- `SECRET.json`はローカル参照用サンプルに留め、実運用のシークレットをコミットしないでください。
- `staticwebapp.config.json`の`allowedRoles`や`rolesSource`を変更する場合は、アクセス範囲が即座に変わるため必ずレビューを行ってください。
- Azure App SettingsやKey Vaultに格納したシークレットのローテーション手順をチームで共有し、不要になったGitHub OAuth Client Secretは破棄してください。
