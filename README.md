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

- `scripts/New-SwaResources.ps1` (PowerShell Core) でリソース グループと SWA を一括作成できます。デフォルトで `rg-<repo-name>-prod` / `stapp-<repo-name>-prod` を利用し、アプリ/Functions パスも現在の構成 (`docs`, `api`) が自動で指定されます。`--Force` を付けると既存のリソースグループごと削除してから再作成するため、SWA もまとめて再プロビジョニングされます。ローカル依存関係や CLI 拡張は事前に `Prepare-LocalEnvironment.ps1` で整えてから実行してください。Azure リソース作成後はデプロイトークンを取得し、GitHub シークレットを自動で更新します。
- Static Web Apps は Microsoft Learn の [公式ドキュメント](https://learn.microsoft.com/azure/static-web-apps/deploy-web-framework#create-a-static-web-app-on-azure) にある通りグローバル分散サービスであり、SWA 本体のロケーション指定は不要です（リソース グループのリージョンは `japaneast` を既定にしています）。

```bash
# 既定値で空の Static Web App を作成
pwsh ./scripts/New-SwaResources.ps1

# GitHub シークレットまで自動更新する場合 (gh CLI & PAT が必要)
pwsh ./scripts/New-SwaResources.ps1
```

- スクリプト実行時に、SWA から取得したデプロイトークンを GitHub CLI (`gh secret set`) で `AZURE_STATIC_WEB_APPS_API_TOKEN` シークレットに保存します。対象リポジトリは `git remote origin` を自動解決し、シークレット名は固定です。
- `.github/workflows/deploy-azure-static-web-apps.yml` が本リポジトリに含まれているため、スクリプトで取得したデプロイトークンをシークレットに登録するだけで GitHub Actions から SWA へデプロイできます。

### 3. GitHub OAuth App の作成

1. GitHub > Settings > Developer settings > **OAuth Apps** > **New OAuth App**
2. `Application name` は任意、`Homepage URL`/`Authorization callback URL` に SWA のホスト名を指定
3. 作成後に表示される **Client ID** と生成した **Client Secret** を安全に保管
4. Organization リポジトリの場合は OAuth App の Org アクセスを許可

### 4. 環境変数の設定

- `scripts/Set-SwaAppSettings.ps1` が `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` を Production もしくは指定環境に登録します。既存値と差分がない場合は更新をスキップし、`--Force` を付けると管理対象キーを削除してから再設定します。

```bash
pwsh ./scripts/Set-SwaAppSettings.ps1 \
  --resource-group swa-docs-rg \
  --name swa-github-docs \
  --repo-owner your-org \
  --repo-name private-docs \
  --client-id <GitHub OAuth Client ID> \
  --client-secret <GitHub OAuth Client Secret>
```

- 未指定の引数は対話的に入力できます。値は Azure App Settings に保存され、Git には含めません。

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
