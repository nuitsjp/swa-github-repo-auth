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

## 構築手順

### 1. リポジトリ取得とローカル準備

```bash
git clone https://github.com/<your-org>/swa-github-repo-auth.git
cd swa-github-repo-auth
cd api && npm install && cd -
npx swa start --api-location api --swa-config staticwebapp.config.json
```

- `npx swa start` で `/.auth/me` や保護ルートを確認し、ローカルの挙動を把握します。

### 2. Azure Static Web Apps リソース作成

- `scripts/provision-swa.sh` を使うとリソース グループ作成と SWA 作成をまとめて実行できます。

```bash
./scripts/provision-swa.sh \
  --resource-group swa-docs-rg \
  --name swa-github-docs \
  --location japaneast \
  --sku Standard \
  --source https://github.com/<your-org>/swa-github-repo-auth \
  --branch main \
  --app-location ./docs \
  --api-location api \
  --login-with-github
```

- `--source`/`--branch` を指定すると GitHub Actions 連携が作成されます。組織リポジトリは `--login-with-github` で Azure CLI の GitHub アプリに権限を付与してください。
- 空の SWA だけ必要な場合は `--source` を省略します。

### 3. GitHub OAuth App の作成

1. GitHub > Settings > Developer settings > **OAuth Apps** > **New OAuth App**
2. `Application name` は任意、`Homepage URL`/`Authorization callback URL` に SWA のホスト名を指定
3. 作成後に表示される **Client ID** と生成した **Client Secret** を安全に保管
4. Organization リポジトリの場合は OAuth App の Org アクセスを許可

### 4. 環境変数の設定

- `scripts/configure-swa-settings.sh` が `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` を Production もしくは指定環境に登録します。

```bash
./scripts/configure-swa-settings.sh \
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

## アーキテクチャ資料

- 詳細なシーケンス図やコンポーネント構成は `docs/architecture.md` を参照してください。

## セキュリティと運用上の注意

- `SECRET.json` はローカル参照用サンプルに留め、実運用のシークレットをコミットしないでください。
- `staticwebapp.config.json` の `allowedRoles` や `rolesSource` を変更する場合は、アクセス範囲が即座に変わるため必ずレビューを行ってください。
- Azure App Settings や Key Vault に格納したシークレットのローテーション手順をチームで共有し、不要になった GitHub OAuth Client Secret は破棄してください。
