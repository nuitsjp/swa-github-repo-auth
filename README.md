# Azure Static Web Apps - GitHubリポジトリドキュメント公開システム実装ガイド

Private/Internal な GitHub リポジトリのドキュメントを Azure Static Web Apps (SWA) で公開し、対象リポジトリの read 権限を持つユーザーだけに閲覧を許可するためのガイドです。

## 目的

- GitHub OAuth を用いてリポジトリ権限と連動するアクセス制御を実現する
- ドキュメント配信・Functions・認証設定を含む最小構成を Azure Static Web Apps 上に整備する
- 同じ構成を繰り返しデプロイできるよう、CLI スクリプトと運用手順を提供する

## 事前準備

- Azure CLI がインストール済みで `az login` できること
- SWA Standard プランを利用可能な Azure サブスクリプション
- GitHub OAuth App を作成できる GitHub アカウント (組織リポジトリの場合は Org 権限も必要)
- Node.js 18 以降と npm (ローカル検証・Static Web Apps CLI 用)
- PowerShell 7 以上 (リポジトリ同梱スクリプトは PowerShell Core 用)
- GitHub CLI (`gh`) ※ 本スクリプトが取得したデプロイトークンをリポジトリシークレットに登録します

## 構築手順

### 1. リポジトリ取得と初期化

```bash
git clone https://github.com/<your-org>/swa-github-repo-auth.git
cd swa-github-repo-auth
pwsh ./scripts/Prepare-LocalEnvironment.ps1
npx @azure/static-web-apps-cli start ./docs --api-location api --swa-config-location .
```

- `Prepare-LocalEnvironment.ps1` がルート/`api/` の `npm install` と Azure CLI の Static Web Apps 拡張追加をまとめて実行します。既に依存関係が入っていれば自動でスキップされ、`--Force` を付けると既存の `node_modules` を削除して再インストールし、拡張機能も入れ直します。
- `.github/workflows/deploy-azure-static-web-apps.yml` は既に含まれており、`docs/`/`api/` を対象に `Azure/static-web-apps-deploy@v1` を実行します。Push/Pull Request に連動するため、リポジトリシークレット `AZURE_STATIC_WEB_APPS_API_TOKEN` を必ず登録してください。
- `npx @azure/static-web-apps-cli start ./docs --api-location api --swa-config-location .` で静的ファイル (`docs/`) と Functions (`api/`) を同時に立ち上げ、`/.auth/me` や保護ルートを確認します。Static Web Apps CLI (`@azure/static-web-apps-cli`) は devDependencies に含まれているため、初期化フェーズのあとはそのまま利用できます。

### 2. Azure Static Web Apps リソース作成

`scripts/New-SwaResources.ps1` (PowerShell Core) でリソースグループと SWA の作成、GitHub シークレットの登録、アプリ設定の更新を統合的に実行できます。

#### 基本動作

1. **サブスクリプション選択**: スクリプト開始時に現在のサブスクリプションを確認し、必要に応じて別のサブスクリプションを選択可能
2. **リポジトリ情報の自動検出**: `git remote origin` から GitHub リポジトリの所有者と名前を自動取得
3. **既存リソースの確認**: Static Web App がグローバルに存在するかを検索
4. **再利用/再作成の選択**: 既存の SWA が見つかった場合、対話的に再利用または再作成を選択
5. **デプロイトークンの自動設定**: 新規作成時はデプロイトークンを取得し、GitHub シークレット `AZURE_STATIC_WEB_APPS_API_TOKEN` を自動登録

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

- `ResourceGroupName`: リソースグループ名（デフォルト: `rg-<repo>-prod`）
- `Name`: Static Web App 名（デフォルト: `stapp-<repo>-prod`）  
- `ResourceGroupLocation`: リソースグループのリージョン（デフォルト: `japaneast`）
- `Sku`: Static Web App の SKU（Free/Standard、デフォルト: Standard）
- `ClientId`/`ClientSecret`: GitHub OAuth App の認証情報（未指定時は対話プロンプトで入力）

### 3. GitHub OAuth App の作成

スクリプト実行中に SWA のホスト名を使った設定手順が表示されます：

1. GitHub > Settings > Developer settings > **OAuth Apps** > **New OAuth App**
2. 表示された URL を使用:
   - **Homepage URL**: `https://<swa-hostname>/`
   - **Authorization callback URL**: `https://<swa-hostname>/.auth/login/github/callback`
3. 作成後に表示される **Client ID** と生成した **Client Secret** を安全に保管
4. Organization リポジトリの場合は OAuth App の Org アクセスを許可

### 4. 環境変数の設定

`New-SwaResources.ps1` は以下のアプリ設定を自動的に Azure Static Web App に登録します：

- `GITHUB_CLIENT_ID`: GitHub OAuth App の Client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth App の Client Secret  
- `GITHUB_REPO_OWNER`: リポジトリ所有者（git remote から自動検出）
- `GITHUB_REPO_NAME`: リポジトリ名（git remote から自動検出）

Client ID/Secret が未指定の場合、GitHub OAuth App 作成手順の表示後に対話プロンプトで入力を求められます。

### 5. 動作確認

1. SWA サイトの `/.auth/login/github` にアクセスして対象ユーザーでログイン
2. `/.auth/me` のレスポンスで `roles: ["authorized"]` が付与されているか確認
3. `/admin/` など保護されたルートにアクセスし、権限に応じた挙動になっているか検証
4. `/.auth/logout` でサインアウトして再度アクセス制御を確認

### 6. ローカル検証 (Lint / テスト)

`api/` 配下の Azure Functions は ESLint と Jest を利用して静的解析とユニットテストを実行します。まず `api/` ディレクトリで依存関係をインストールし、Lint とテストを実行してください。

```bash
cd api
npm install
npm run lint
npm test
```

- `npm run lint` は `eslint .` を実行し、Node.js 18 向けの推奨ルールでコード品質を確認します。
- `npm test` は Jest によるカバレッジ収集付き実行で、グローバル閾値 (branches/functions/lines/statements はすべて 90%) を満たすように構成されています。

### 7. CI/CD (GitHub Actions)

`CI` ワークフロー (`.github/workflows/ci.yml`) を追加しており、以下を自動で検証します。

- イベント: `push` / `pull_request`
- Node.js 18 のセットアップ後に `api/` ディレクトリで `npm ci` → `npm run lint` → `npm test`
- Lint あるいはテストの失敗・カバレッジ閾値未達の際はワークフローがエラー終了

リポジトリへ Push すると自動的にワークフローが実行され、Pull Request でも同様のチェックが走ります。GitHub CLI の `gh run list` や `gh run watch` を利用すると、ローカル端末から結果を確認できます。

## アーキテクチャ資料

- 詳細なシーケンス図やコンポーネント構成は `docs/architecture.md` を参照してください。

## セキュリティと運用上の注意

- `SECRET.json` はローカル参照用サンプルに留め、実運用のシークレットをコミットしないでください。
- `staticwebapp.config.json` の `allowedRoles` や `rolesSource` を変更する場合は、アクセス範囲が即座に変わるため必ずレビューを行ってください。
- Azure App Settings や Key Vault に格納したシークレットのローテーション手順をチームで共有し、不要になった GitHub OAuth Client Secret は破棄してください。
