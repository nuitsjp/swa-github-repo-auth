# Azure Static Web Apps - GitHub認証 npmパッケージ化計画

## 📋 目次

1. [目的と方針](#目的と方針)
2. [アーキテクチャ設計](#アーキテクチャ設計)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [詳細な変更設計](#詳細な変更設計)
5. [実装手順](#実装手順)
6. [テスト計画](#テスト計画)
7. [公開とメンテナンス](#公開とメンテナンス)
8. [マイグレーションガイド](#マイグレーションガイド)

---

## 目的と方針

### 🎯 目的

現在のリポジトリを以下の2つの役割を持つ構成に変更する：

1. **npmパッケージ** - 他のSWAプロジェクトで再利用可能なライブラリ
2. **サンプルプロジェクト** - パッケージの使用方法を示す実働サンプル

### 📐 設計方針

- **後方互換性**: 既存のデプロイメントへの影響を最小化
- **分離**: パッケージコードとサンプルコードを明確に分離
- **再利用性**: パッケージは様々な構成で利用可能
- **保守性**: テストとドキュメントを充実させる
- **段階的移行**: 既存機能を維持しながら段階的に移行

---

## アーキテクチャ設計

### パッケージ構成

```
swa-github-repo-auth/
├── packages/
│   └── swa-github-auth/          # npmパッケージ本体
│       ├── lib/                   # ライブラリコード
│       ├── templates/             # 設定テンプレート
│       ├── package.json
│       └── README.md
│
├── examples/
│   └── basic/                     # サンプルプロジェクト
│       ├── api/                   # パッケージを使用したAPI
│       ├── docs/                  # 静的コンテンツ
│       └── staticwebapp.config.json
│
├── api/                           # 既存API（後方互換用）
├── docs/                          # 既存ドキュメント
├── scripts/                       # ビルド・デプロイスクリプト
├── .github/
│   └── workflows/
│       ├── deploy-azure-static-web-apps.yml
│       ├── publish-package.yml    # 新規: パッケージ公開
│       └── ci.yml
├── package.json                   # モノレポルート
└── README.md
```

### データフロー

```
利用者のプロジェクト
    ↓ npm install
npmパッケージ (@yourorg/swa-github-auth)
    ↓ import/require
Azure Functions (AuthorizeRepositoryAccess)
    ↓ 認証フロー
GitHub OAuth → GitHub API → ロール判定
```

---

## ディレクトリ構造

### 最終的なディレクトリ構造

```
swa-github-repo-auth/
│
├── packages/
│   └── swa-github-auth/
│       ├── lib/
│       │   ├── index.js                 # メインエクスポート
│       │   ├── handler.js               # ハンドラー作成ロジック
│       │   ├── config.js                # 既存
│       │   ├── githubPrincipal.js       # 既存
│       │   └── repositoryAuthorizer.js  # 既存
│       │
│       ├── templates/
│       │   ├── function.json            # Azure Functions設定
│       │   ├── staticwebapp.config.json # SWA設定テンプレート
│       │   └── local.settings.json      # ローカル開発用
│       │
│       ├── __tests__/                   # パッケージのテスト
│       │   ├── index.test.js
│       │   ├── handler.test.js
│       │   └── integration.test.js
│       │
│       ├── package.json
│       ├── README.md
│       ├── CHANGELOG.md
│       └── LICENSE
│
├── examples/
│   └── basic/
│       ├── api/
│       │   ├── AuthorizeRepositoryAccess/
│       │   │   ├── function.json
│       │   │   └── index.js            # パッケージを使用
│       │   ├── host.json
│       │   ├── package.json
│       │   └── local.settings.json
│       │
│       ├── docs/
│       │   ├── index.html
│       │   ├── admin/
│       │   └── signed-out/
│       │
│       ├── staticwebapp.config.json
│       ├── package.json
│       └── README.md
│
├── api/                                 # 既存API（後方互換用）
│   ├── AuthorizeRepositoryAccess/
│   │   ├── function.json
│   │   └── index.js                    # パッケージを使用するように変更
│   ├── lib/                            # シンボリックリンク → packages/swa-github-auth/lib
│   ├── __tests__/
│   ├── host.json
│   ├── package.json
│   └── local.settings.json
│
├── docs/                                # 既存ドキュメント（維持）
│
├── scripts/
│   ├── New-SwaResources.ps1
│   ├── setup-package.ps1               # 新規: パッケージセットアップ
│   └── link-local.ps1                  # 新規: ローカルリンク
│
├── .github/
│   └── workflows/
│       ├── deploy-azure-static-web-apps.yml
│       ├── publish-package.yml         # 新規
│       ├── ci.yml                      # 更新
│       └── test-examples.yml           # 新規
│
├── package.json                        # ルートpackage.json（ワークスペース設定）
├── lerna.json または pnpm-workspace.yaml
├── README.md                           # 更新
└── MIGRATION.md                        # 新規: 移行ガイド
```

---

## 詳細な変更設計

### 1. パッケージコア (`packages/swa-github-auth/`)

#### `lib/index.js`

```javascript
/**
 * @yourorg/swa-github-auth
 * Azure Static Web Apps用GitHub認証パッケージ
 */

const axios = require('axios');
const { loadGitHubRepoConfig, ensureGitHubRepoConfig } = require('./config');
const { extractGitHubPrincipal } = require('./githubPrincipal');
const { createRepositoryAuthorizer } = require('./repositoryAuthorizer');
const { 
  createAuthorizeRepositoryAccessHandler, 
  createLogger 
} = require('./handler');

/**
 * デフォルトハンドラー作成（環境変数ベース）
 */
function createDefaultHandler(options = {}) {
  const env = options.env || process.env;
  const httpClient = options.httpClient || axios;
  
  const config = loadGitHubRepoConfig(env);
  
  // 必須設定の検証
  if (config.missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${config.missing.join(', ')}\n` +
      'Please set GITHUB_REPO_OWNER and GITHUB_REPO_NAME'
    );
  }
  
  const repositoryAuthorizer = createRepositoryAuthorizer({
    ...config,
    httpClient
  });
  
  return createAuthorizeRepositoryAccessHandler({
    authorizer: repositoryAuthorizer,
    principalExtractor: extractGitHubPrincipal
  });
}

/**
 * カスタムハンドラー作成
 */
function createCustomHandler(config) {
  if (!config.repoOwner || !config.repoName) {
    throw new Error('repoOwner and repoName are required');
  }
  
  const httpClient = config.httpClient || axios;
  
  const repositoryAuthorizer = createRepositoryAuthorizer({
    ...config,
    httpClient
  });
  
  return createAuthorizeRepositoryAccessHandler({
    authorizer: repositoryAuthorizer,
    principalExtractor: extractGitHubPrincipal
  });
}

/**
 * 複数リポジトリハンドラー作成
 */
function createMultiRepoHandler(repos, options = {}) {
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error('repos must be a non-empty array');
  }
  
  const httpClient = options.httpClient || axios;
  const strategy = options.strategy || 'any'; // 'any' or 'all'
  
  const authorizers = repos.map(repo => 
    createRepositoryAuthorizer({
      ...repo,
      httpClient
    })
  );
  
  return createAuthorizeRepositoryAccessHandler({
    authorizer: {
      async authorize(accessToken, logger) {
        const results = await Promise.all(
          authorizers.map(async (auth) => {
            try {
              return await auth.authorize(accessToken, logger);
            } catch (error) {
              logger.warn(`Authorization check failed: ${error.message}`);
              return false;
            }
          })
        );
        
        return strategy === 'all' 
          ? results.every(r => r === true)
          : results.some(r => r === true);
      }
    },
    principalExtractor: extractGitHubPrincipal
  });
}

/**
 * 設定テンプレート生成
 */
function generateStaticWebAppConfig(options = {}) {
  const {
    protectedRoutes = ['/*'],
    publicRoutes = ['/signed-out/*']
  } = options;

  return {
    $schema: 'https://json.schemastore.org/staticwebapp.config.json',
    auth: {
      rolesSource: '/api/AuthorizeRepositoryAccess',
      identityProviders: {
        github: {}
      }
    },
    routes: [
      {
        route: '/.auth/login/github',
        allowedRoles: ['anonymous', 'authorized']
      },
      {
        route: '/.auth/logout',
        allowedRoles: ['anonymous', 'authorized']
      },
      {
        route: '/.auth/*',
        allowedRoles: ['authorized']
      },
      ...publicRoutes.map(route => ({
        route,
        allowedRoles: ['anonymous', 'authorized']
      })),
      ...protectedRoutes.map(route => ({
        route,
        allowedRoles: ['authorized']
      }))
    ],
    responseOverrides: {
      '401': {
        statusCode: 302,
        redirect: '/.auth/login/github?post_login_redirect_uri=.referrer'
      },
      '403': {
        statusCode: 403,
        statusDescription: 'Access Denied',
        body: '<!DOCTYPE html><html><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>You do not have permission to access this repository documentation.</p></body></html>'
      }
    },
    navigationFallback: {
      rewrite: '/index.html',
      exclude: ['/api/*', '/.auth/*', '/images/*', '*.{css,js,json}']
    },
    globalHeaders: {
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000'
    }
  };
}

// メインエクスポート
module.exports = {
  // ハンドラー作成
  createDefaultHandler,
  createCustomHandler,
  createMultiRepoHandler,
  
  // 設定生成
  generateStaticWebAppConfig,
  
  // 低レベルAPI（高度なカスタマイズ用）
  createAuthorizeRepositoryAccessHandler,
  createRepositoryAuthorizer,
  extractGitHubPrincipal,
  createLogger,
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig
};
```

#### `lib/handler.js`

既存の `api/AuthorizeRepositoryAccess/index.js` から以下を抽出：

```javascript
// 既存コードから抽出
const { createAuthorizeRepositoryAccessHandler, createLogger } = require('../api/AuthorizeRepositoryAccess/index');

module.exports = {
  createAuthorizeRepositoryAccessHandler,
  createLogger
};
```

#### `packages/swa-github-auth/package.json`

```json
{
  "name": "@yourorg/swa-github-auth",
  "version": "1.0.0",
  "description": "GitHub repository-based authentication for Azure Static Web Apps",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "files": [
    "lib/",
    "templates/",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "keywords": [
    "azure",
    "static-web-apps",
    "github",
    "authentication",
    "authorization",
    "oauth"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/nuitsjp/swa-github-repo-auth.git",
    "directory": "packages/swa-github-auth"
  },
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "peerDependencies": {
    "@azure/functions": "^4.0.0",
    "axios": "^1.0.0"
  },
  "devDependencies": {
    "@azure/functions": "^4.9.0",
    "axios": "^1.13.2",
    "jest": "^29.7.0",
    "eslint": "^8.57.0"
  },
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint lib/",
    "prepublishOnly": "npm run test && npm run lint"
  }
}
```

### 2. サンプルプロジェクト (`examples/basic/`)

#### `examples/basic/api/AuthorizeRepositoryAccess/index.js`

```javascript
/**
 * サンプル実装: パッケージを使用した最もシンプルな例
 */
const { createDefaultHandler } = require('@yourorg/swa-github-auth');

// 環境変数から自動的に設定を読み込み
module.exports = createDefaultHandler();
```

#### `examples/basic/api/package.json`

```json
{
  "name": "swa-github-auth-example-basic",
  "version": "1.0.0",
  "private": true,
  "description": "Basic example using @yourorg/swa-github-auth",
  "main": "AuthorizeRepositoryAccess/index.js",
  "dependencies": {
    "@azure/functions": "^4.9.0",
    "@yourorg/swa-github-auth": "^1.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

#### `examples/basic/README.md`

```markdown
# Basic Example - SWA GitHub Authentication

このサンプルは `@yourorg/swa-github-auth` パッケージの基本的な使用方法を示します。

## セットアップ

1. 依存関係のインストール
   ```bash
   cd examples/basic/api
   npm install
   ```

2. 環境変数の設定
   ```bash
   cp api/local.settings.json.template api/local.settings.json
   # local.settings.json を編集
   ```

3. ローカル実行
   ```bash
   npx swa start docs --api-location api
   ```

## 必要な環境変数

- `GITHUB_REPO_OWNER`: リポジトリオーナー
- `GITHUB_REPO_NAME`: リポジトリ名
- `GITHUB_APP_ID`: GitHub App ID
- `GITHUB_APP_INSTALLATION_ID`: GitHub App Installation ID
- `GITHUB_APP_PRIVATE_KEY`: GitHub App Private Key (PEM文字列)

## カスタマイズ

より高度な使用方法については、パッケージのドキュメントを参照してください。
```

### 3. 既存APIの更新（後方互換性維持）

#### `api/AuthorizeRepositoryAccess/index.js`

```javascript
/**
 * 後方互換性維持のため、パッケージを使用するように変更
 * 既存のデプロイメントはこのファイルを使い続ける
 */

// ローカル開発時はシンボリックリンク、本番ではパッケージを使用
let swaGithubAuth;
try {
  // npm パッケージとして利用
  swaGithubAuth = require('@yourorg/swa-github-auth');
} catch (e) {
  // ローカル開発時（パッケージ未公開）
  swaGithubAuth = require('../../packages/swa-github-auth/lib');
}

const { createDefaultHandler } = swaGithubAuth;

// 既存の動作を維持
module.exports = createDefaultHandler();

// テスト用エクスポート（既存テストとの互換性）
module.exports.createAuthorizeRepositoryAccessHandler = swaGithubAuth.createAuthorizeRepositoryAccessHandler;
module.exports.createLogger = swaGithubAuth.createLogger;
```

#### `api/package.json`

```json
{
  "name": "swa-github-repo-auth-api",
  "version": "1.0.0",
  "description": "Azure Functions for GitHub repository-based authorization",
  "main": "AuthorizeRepositoryAccess/index.js",
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "jest --coverage",
    "lint": "eslint ."
  },
  "dependencies": {
    "@azure/functions": "^4.9.0",
    "@yourorg/swa-github-auth": "file:../packages/swa-github-auth"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "eslint": "^8.57.0"
  }
}
```

### 4. ルートパッケージ設定

#### `package.json` (ルート)

```json
{
  "name": "swa-github-repo-auth-monorepo",
  "version": "1.0.0",
  "private": true,
  "description": "Azure Static Web Apps GitHub Authentication - Package and Examples",
  "workspaces": [
    "packages/*",
    "examples/*",
    "api"
  ],
  "scripts": {
    "install:all": "npm install && npm run bootstrap",
    "bootstrap": "npm install --workspaces",
    "test": "npm run test --workspaces --if-present",
    "test:package": "npm test --workspace=packages/swa-github-auth",
    "test:api": "npm test --workspace=api",
    "lint": "npm run lint --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present && rm -rf node_modules",
    "link:local": "node scripts/link-local.js",
    "publish:package": "npm publish --workspace=packages/swa-github-auth"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "jest": "^29.7.0"
  },
  "engines": {
    "node": ">=18",
    "npm": ">=9"
  }
}
```

### 5. GitHub Actions ワークフロー

#### `.github/workflows/publish-package.yml`

```yaml
name: Publish Package

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    
    permissions:
      contents: read
      packages: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: |
          npm ci
          npm run bootstrap
      
      - name: Run tests
        run: npm run test:package
      
      - name: Publish to npm
        run: npm publish --workspace=packages/swa-github-auth
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### `.github/workflows/ci.yml` (更新)

```yaml
name: CI

on:
  push:
    branches:
      - main
      - develop
      - feature/**
  pull_request:

jobs:
  test-package:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: packages/swa-github-auth
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Use Node.js 18
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm

      - name: Install dependencies
        run: |
          cd ../..
          npm ci
          npm run bootstrap

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          directory: packages/swa-github-auth/coverage

  validate-api:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Use Node.js 18
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm

      - name: Install dependencies
        run: |
          cd ..
          npm ci
          npm run bootstrap

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

  test-examples:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        example: [basic]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Use Node.js 18
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm

      - name: Install dependencies
        run: |
          npm ci
          npm run bootstrap

      - name: Validate example
        run: |
          cd examples/${{ matrix.example }}/api
          npm install
          npm ls @yourorg/swa-github-auth
```

### 6. TypeScript型定義

#### `packages/swa-github-auth/lib/index.d.ts`

```typescript
import { Context, HttpRequest } from '@azure/functions';

export interface GitHubRepoConfig {
  repoOwner: string;
  repoName: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  requestTimeoutMs?: number;
  userAgent?: string;
}

export interface HandlerOptions {
  env?: Record<string, string | undefined>;
  httpClient?: any;
}

export interface MultiRepoOptions extends HandlerOptions {
  strategy?: 'any' | 'all';
}

export interface StaticWebAppConfigOptions {
  protectedRoutes?: string[];
  publicRoutes?: string[];
  clientIdSettingName?: string;
  clientSecretSettingName?: string;
  scopes?: string[];
}

export interface Logger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

export type AzureFunctionHandler = (
  context: Context,
  req: HttpRequest
) => Promise<void>;

export function createDefaultHandler(
  options?: HandlerOptions
): AzureFunctionHandler;

export function createCustomHandler(
  config: GitHubRepoConfig & HandlerOptions
): AzureFunctionHandler;

export function createMultiRepoHandler(
  repos: GitHubRepoConfig[],
  options?: MultiRepoOptions
): AzureFunctionHandler;

export function generateStaticWebAppConfig(
  options?: StaticWebAppConfigOptions
): object;

export function createLogger(log?: any): Logger;

export function loadGitHubRepoConfig(
  env: Record<string, string | undefined>
): GitHubRepoConfig & { missing: string[] };

export function ensureGitHubRepoConfig(
  env: Record<string, string | undefined>
): GitHubRepoConfig;
```

---

## 実装手順

### Phase 1: 準備フェーズ（1-2日）

#### ステップ 1.1: ブランチ作成

```bash
git checkout -b feature/npm-package-migration
```

#### ステップ 1.2: ディレクトリ構造作成

```bash
# パッケージディレクトリ
mkdir -p packages/swa-github-auth/lib
mkdir -p packages/swa-github-auth/templates
mkdir -p packages/swa-github-auth/__tests__

# サンプルディレクトリ
mkdir -p examples/basic/api/AuthorizeRepositoryAccess
mkdir -p examples/basic/docs
```

#### ステップ 1.3: ファイル移動とコピー

```bash
# ライブラリファイルをコピー
cp api/lib/config.js packages/swa-github-auth/lib/
cp api/lib/githubPrincipal.js packages/swa-github-auth/lib/
cp api/lib/repositoryAuthorizer.js packages/swa-github-auth/lib/

# テストをコピー
cp api/__tests__/config.test.js packages/swa-github-auth/__tests__/
cp api/__tests__/githubPrincipal.test.js packages/swa-github-auth/__tests__/
cp api/__tests__/repositoryAuthorizer.test.js packages/swa-github-auth/__tests__/

# テンプレートをコピー
cp api/AuthorizeRepositoryAccess/function.json packages/swa-github-auth/templates/
cp staticwebapp.config.json packages/swa-github-auth/templates/

# サンプル用にドキュメントをコピー
cp -r docs/* examples/basic/docs/
```

### Phase 2: パッケージ実装（3-4日）

#### ステップ 2.1: パッケージコア実装

1. `packages/swa-github-auth/lib/handler.js` を作成
2. `packages/swa-github-auth/lib/index.js` を作成
3. `packages/swa-github-auth/lib/index.d.ts` を作成

#### ステップ 2.2: パッケージ設定

1. `packages/swa-github-auth/package.json` を作成
2. `packages/swa-github-auth/README.md` を作成
3. `packages/swa-github-auth/CHANGELOG.md` を作成

#### ステップ 2.3: テスト追加

```bash
cd packages/swa-github-auth
npm install
npm test
```

新規テストファイル:
- `__tests__/index.test.js`
- `__tests__/handler.test.js`
- `__tests__/integration.test.js`

### Phase 3: サンプル実装（2-3日）

#### ステップ 3.1: Basic サンプル

1. `examples/basic/api/AuthorizeRepositoryAccess/index.js` 作成
2. `examples/basic/api/package.json` 作成
3. `examples/basic/staticwebapp.config.json` 作成
4. `examples/basic/README.md` 作成

#### ステップ 3.2: サンプルのテスト

```bash
cd examples/basic/api
npm install
npm ls @yourorg/swa-github-auth

# ローカル実行テスト
npx swa start ../docs --api-location .
```

### Phase 4: 既存API更新（1-2日）

#### ステップ 4.1: 既存APIをパッケージ使用に変更

`api/AuthorizeRepositoryAccess/index.js` を更新

#### ステップ 4.2: package.json更新

`api/package.json` にローカル依存を追加

#### ステップ 4.3: テスト実行

```bash
cd api
npm test
```

### Phase 5: ワークスペース設定（1日）

#### ステップ 5.1: ルートpackage.json設定

ワークスペース設定を追加

#### ステップ 5.2: インストールと検証

```bash
# ルートで実行
npm install
npm run bootstrap
npm run test
```

### Phase 6: CI/CD更新（1-2日）

#### ステップ 6.1: GitHub Actions更新

- `ci.yml` 更新
- `publish-package.yml` 作成
- `test-examples.yml` 作成

#### ステップ 6.2: スクリプト作成

```powershell
# scripts/link-local.ps1
npm link --workspace=packages/swa-github-auth
cd api
npm link @yourorg/swa-github-auth
cd ../examples/basic/api
npm link @yourorg/swa-github-auth
```

### Phase 7: ドキュメント更新（2-3日）

#### ステップ 7.1: README更新

ルート `README.md` を以下のセクションに分割：
- パッケージとしての使用方法
- サンプルプロジェクトの説明
- 開発者向けガイド

#### ステップ 7.2: パッケージREADME作成

`packages/swa-github-auth/README.md`:
- インストール
- クイックスタート
- API リファレンス
- 設定オプション
- トラブルシューティング

#### ステップ 7.3: 移行ガイド作成

`MIGRATION.md`:
- 既存ユーザー向けの移行手順
- 変更点の説明
- 後方互換性の保証

### Phase 8: テストと検証（2-3日）

#### ステップ 8.1: 統合テスト

```bash
# 全テスト実行
npm run test

# カバレッジ確認
npm run test:package
```

#### ステップ 8.2: E2Eテスト

1. サンプルをローカル実行
2. 認証フロー確認
3. 既存デプロイメントとの互換性確認

#### ステップ 8.3: ドキュメント確認

- README の手順通りに動作するか確認
- サンプルコードの動作確認

### Phase 9: リリース準備（1-2日）

#### ステップ 9.1: バージョニング

```bash
cd packages/swa-github-auth
npm version 1.0.0
```

#### ステップ 9.2: CHANGELOG更新

```markdown
# Changelog

## [1.0.0] - 2024-XX-XX

### Added
- Initial npm package release
- Basic example project
- TypeScript type definitions
- Comprehensive documentation

### Changed
- Refactored as monorepo structure
- Improved test coverage

### Migration
- See MIGRATION.md for upgrade instructions
```

#### ステップ 9.3: タグ作成

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
```

### Phase 10: 公開とフォローアップ（1日）

#### ステップ 10.1: npm公開

```bash
npm publish --workspace=packages/swa-github-auth --access public
```

#### ステップ 10.2: GitHub Release作成

リリースノートを作成し、以下を含める：
- 変更点のサマリー
- インストール手順
- 移行ガイドへのリンク
- 既知の問題

#### ステップ 10.3: ドキュメントサイト更新

GitHub Pages や既存ドキュメントを更新

---

## テスト計画

### ユニットテスト

#### パッケージテスト (`packages/swa-github-auth/__tests__/`)

**`index.test.js`**
```javascript
describe('createDefaultHandler', () => {
  test('環境変数から設定を読み込む', () => {});
  test('必須環境変数がない場合はエラー', () => {});
  test('正しいハンドラーを返す', () => {});
});

describe('createCustomHandler', () => {
  test('カスタム設定でハンドラーを作成', () => {});
  test('必須パラメータがない場合はエラー', () => {});
});

describe('createMultiRepoHandler', () => {
  test('複数リポジトリの設定を受け付ける', () => {});
  test('anyストラテジーが正しく動作', () => {});
  test('allストラテジーが正しく動作', () => {});
});

describe('generateStaticWebAppConfig', () => {
  test('デフォルト設定を生成', () => {});
  test('カスタムルートを設定', () => {});
});
```

**`handler.test.js`**
```javascript
describe('createAuthorizeRepositoryAccessHandler', () => {
  test('GitHub以外のプロバイダーは拒否', () => {});
  test('アクセストークンがない場合は拒否', () => {});
  test('認証成功時にauthorizedロールを付与', () => {});
  test('認証失敗時に空のロールを返す', () => {});
});

describe('createLogger', () => {
  test('context.logがない場合はconsoleを使用', () => {});
  test('レガシー形式のログをサポート', () => {});
});
```

**`integration.test.js`**
```javascript
describe('統合テスト', () => {
  test('エンドツーエンドの認証フロー', async () => {});
  test('GitHub APIエラーのハンドリング', async () => {});
  test('複数リポジトリの認証', async () => {});
});
```

### E2Eテスト

#### サンプルプロジェクトテスト

```javascript
describe('Basic Example E2E', () => {
  test('未認証ユーザーはログインページにリダイレクト', () => {});
  test('認証後に保護されたページにアクセス可能', () => {});
  test('権限がないユーザーは403エラー', () => {});
});
```

### カバレッジ目標

- **ユニットテスト**: 90%以上
- **統合テスト**: 主要フロー100%
- **E2Eテスト**: 主要ユースケース

### テスト実行

```bash
# 全テスト
npm run test

# パッケージのみ
npm run test:package

# カバレッジレポート
npm run test:coverage

# ウォッチモード
npm test -- --watch
```

---

## 公開とメンテナンス

### npmパッケージ公開

#### 初回公開

```bash
# パッケージディレクトリで実行
cd packages/swa-github-auth

# ログイン（初回のみ）
npm login

# パッケージ確認
npm pack --dry-run

# 公開
npm publish --access public
```

#### 更新公開

```bash
# バージョンアップ
npm version patch  # または minor, major

# CHANGELOG更新
# CHANGELOG.mdに変更内容を記載

# Git commit & tag
git add .
git commit -m "chore: release v1.0.1"
git tag v1.0.1

# 公開
npm publish

# GitHubにプッシュ
git push origin main --tags
```

### バージョニング戦略

Semantic Versioningに従う：

- **MAJOR (1.x.x)**: 破壊的変更
  - API インターフェースの変更
  - 設定形式の変更
  - 動作の大幅な変更

- **MINOR (x.1.x)**: 機能追加（後方互換性あり）
  - 新しいハンドラータイプの追加
  - 新しい設定オプションの追加
  - 新しいヘルパー関数の追加

- **PATCH (x.x.1)**: バグフィックス
  - バグ修正
  - ドキュメント修正
  - 依存関係の更新（セキュリティ）

### リリースチェックリスト

- [ ] 全テスト成功
- [ ] CHANGELOGの更新
- [ ] READMEの更新（必要に応じて）
- [ ] バージョン番号の更新
- [ ] Gitタグの作成
- [ ] npm公開
- [ ] GitHub Releaseの作成
- [ ] ドキュメントサイトの更新（該当する場合）

### デプリケーション（非推奨化）

機能を非推奨にする場合：

1. **ドキュメントに記載**
```javascript
/**
 * @deprecated Use createDefaultHandler instead
 * この関数は将来のバージョンで削除されます
 */
function oldFunction() {}
```

2. **コンソール警告**
```javascript
console.warn(
  'Warning: oldFunction is deprecated and will be removed in version 2.0.0. ' +
  'Please use createDefaultHandler instead.'
);
```

3. **移行期間の設定**
- MINOR版で非推奨マーク
- 次のMAJOR版で削除

---

## マイグレーションガイド

### 既存ユーザー向け

#### シナリオ 1: 既存デプロイメントをそのまま維持

**変更不要**

既存の `api/` ディレクトリは後方互換性を維持しているため、変更なしで動作します。

```bash
# 既存の構成
swa-github-repo-auth/
├── api/
│   └── AuthorizeRepositoryAccess/
├── docs/
└── staticwebapp.config.json
```

更新手順：
```bash
git pull origin main
cd api
npm install  # 依存関係が更新される
```

#### シナリオ 2: パッケージを採用する

**段階的移行**

1. **パッケージのインストール**
```bash
cd api
npm install @yourorg/swa-github-auth
```

2. **index.jsの更新**
```javascript
// Before
const axios = require('axios');
const { loadGitHubRepoConfig } = require('../lib/config');
// ... 既存のコード

// After
const { createDefaultHandler } = require('@yourorg/swa-github-auth');
module.exports = createDefaultHandler();
```

3. **libディレクトリの削除**
```bash
rm -rf api/lib
```

4. **テスト実行**
```bash
npm test
```

#### シナリオ 3: 新規プロジェクトで使用

**クリーンスタート**

1. **プロジェクト作成**
```bash
mkdir my-swa-project
cd my-swa-project
npm init -y
```

2. **パッケージインストール**
```bash
npm install @yourorg/swa-github-auth @azure/functions
```

3. **Azure Functionを作成**
```bash
mkdir -p api/AuthorizeRepositoryAccess
```

```javascript
// api/AuthorizeRepositoryAccess/index.js
const { createDefaultHandler } = require('@yourorg/swa-github-auth');
module.exports = createDefaultHandler();
```

```json
// api/AuthorizeRepositoryAccess/function.json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"]
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

4. **SWA設定を生成**
```javascript
const { generateStaticWebAppConfig } = require('@yourorg/swa-github-auth');
const fs = require('fs');

const config = generateStaticWebAppConfig({
  protectedRoutes: ['/*'],
  publicRoutes: ['/public/*']
});

fs.writeFileSync('staticwebapp.config.json', JSON.stringify(config, null, 2));
```

### 注意事項

#### 環境変数の変更なし

以下の環境変数は引き続き必要です：
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`

#### GitHub Actionsの更新

パッケージを使用する場合、CIワークフローを更新：

```yaml
# .github/workflows/ci.yml
- name: Install dependencies
  run: |
    cd api
    npm ci
```

#### ローカル開発

パッケージ公開前のローカル開発：

```bash
# パッケージをローカルリンク
cd packages/swa-github-auth
npm link

# プロジェクトでリンク
cd ../../api
npm link @yourorg/swa-github-auth
```

---

## リスクと対策

### リスク 1: 既存デプロイメントへの影響

**リスクレベル**: 低

**対策**:
- 既存 `api/` ディレクトリは完全な後方互換性を維持
- 段階的なリリース（フィーチャーブランチ → develop → main）
- 本番デプロイ前に十分なテスト期間

### リスク 2: npm公開の失敗

**リスクレベル**: 中

**対策**:
- 公開前に `npm pack --dry-run` で検証
- CI/CDでの自動テスト
- バージョンの慎重な管理

### リスク 3: ドキュメントの不備

**リスクレベル**: 中

**対策**:
- 段階的なドキュメント作成
- サンプルコードの充実
- ユーザーフィードバックの収集

### リスク 4: 依存関係の競合

**リスクレベル**: 低

**対策**:
- `peerDependencies` の適切な設定
- バージョン範囲の慎重な指定
- 定期的な依存関係の更新

---

## 成功基準

### 技術的基準

- [ ] 全ユニットテストが成功（カバレッジ90%以上）
- [ ] E2Eテストが成功
- [ ] 既存デプロイメントが正常動作
- [ ] サンプルプロジェクトが動作
- [ ] npm公開成功

### ドキュメント基準

- [ ] パッケージREADMEが完成
- [ ] APIドキュメントが完成
- [ ] サンプルREADMEが完成
- [ ] 移行ガイドが完成
- [ ] CHANGELOGが更新

### 運用基準

- [ ] CI/CDパイプラインが正常動作
- [ ] 自動公開ワークフローが設定済み
- [ ] モニタリングが設定済み
- [ ] サポート体制が整備済み

---

## 補足資料

### 参考リンク

- [npm パッケージ作成ガイド](https://docs.npmjs.com/creating-node-js-modules)
- [npm Workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces)
- [Azure Static Web Apps ドキュメント](https://docs.microsoft.com/azure/static-web-apps/)
- [Semantic Versioning](https://semver.org/)

### ツールとリソース

- **モノレポ管理**: npm workspaces
- **テスト**: Jest
- **Lint**: ESLint
- **CI/CD**: GitHub Actions
- **ドキュメント**: Markdown, JSDoc
- **バージョン管理**: Git, npm version
- **パッケージレジストリ**: npmjs.com

### コマンドリファレンス

#### 開発コマンド

```bash
# ルートディレクトリで実行

# 全依存関係のインストール
npm install
npm run bootstrap

# 全テストの実行
npm run test

# パッケージのみテスト
npm run test:package

# APIのみテスト
npm run test:api

# Lint実行
npm run lint

# ローカルリンク（開発時）
npm run link:local

# クリーンアップ
npm run clean
```

#### パッケージ公開コマンド

```bash
# パッケージディレクトリで実行
cd packages/swa-github-auth

# バージョン確認
npm version

# バージョンアップ
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0

# パッケージ内容確認
npm pack --dry-run

# 公開（テスト）
npm publish --dry-run

# 公開（本番）
npm publish --access public

# タグ付き公開
npm publish --tag beta
```

#### ワークスペースコマンド

```bash
# 特定ワークスペースでコマンド実行
npm run test --workspace=packages/swa-github-auth
npm install axios --workspace=api

# 全ワークスペースで実行
npm run test --workspaces

# 条件付き実行
npm run test --workspaces --if-present
```

---

## 詳細設計補足

### パッケージのエクスポート戦略

#### デフォルトエクスポート vs 名前付きエクスポート

パッケージは**名前付きエクスポートのみ**を使用します：

```javascript
// ❌ 避ける（default export）
module.exports = createDefaultHandler;

// ✅ 推奨（named exports）
module.exports = {
  createDefaultHandler,
  createCustomHandler,
  // ...
};
```

理由：
- Tree-shakingのサポート
- 明示的なインポート
- TypeScriptとの互換性
- リファクタリングの容易さ

#### エクスポートのグルーピング

```javascript
module.exports = {
  // === ハイレベルAPI（推奨） ===
  createDefaultHandler,
  createCustomHandler,
  createMultiRepoHandler,
  
  // === ユーティリティ ===
  generateStaticWebAppConfig,
  
  // === 低レベルAPI（高度なユースケース用） ===
  createAuthorizeRepositoryAccessHandler,
  createRepositoryAuthorizer,
  extractGitHubPrincipal,
  createLogger,
  
  // === 設定ヘルパー ===
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig
};
```

### エラーハンドリング戦略

#### エラー分類

```javascript
class SwaGithubAuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SwaGithubAuthError';
    this.code = code;
  }
}

class ConfigurationError extends SwaGithubAuthError {
  constructor(message) {
    super(message, 'CONFIGURATION_ERROR');
  }
}

class AuthenticationError extends SwaGithubAuthError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR');
  }
}

class GitHubApiError extends SwaGithubAuthError {
  constructor(message, statusCode) {
    super(message, 'GITHUB_API_ERROR');
    this.statusCode = statusCode;
  }
}
```

#### エラーハンドリングパターン

```javascript
// lib/index.js
function createDefaultHandler(options = {}) {
  try {
    const config = loadGitHubRepoConfig(options.env || process.env);
    
    if (config.missing.length > 0) {
      throw new ConfigurationError(
        `Missing required environment variables: ${config.missing.join(', ')}`
      );
    }
    
    // ... ハンドラー作成
  } catch (error) {
    if (error instanceof SwaGithubAuthError) {
      throw error;
    }
    // 予期しないエラーをラップ
    throw new SwaGithubAuthError(
      `Failed to create handler: ${error.message}`,
      'HANDLER_CREATION_ERROR'
    );
  }
}
```

### ロギング戦略

#### ログレベル

```javascript
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

function createLogger(log, options = {}) {
  const logLevel = options.logLevel || LOG_LEVELS.INFO;
  
  return {
    error: (...args) => {
      if (logLevel >= LOG_LEVELS.ERROR) {
        (log?.error || console.error)(...args);
      }
    },
    warn: (...args) => {
      if (logLevel >= LOG_LEVELS.WARN) {
        (log?.warn || console.warn)(...args);
      }
    },
    info: (...args) => {
      if (logLevel >= LOG_LEVELS.INFO) {
        (log?.info || console.info)(...args);
      }
    },
    debug: (...args) => {
      if (logLevel >= LOG_LEVELS.DEBUG) {
        (log?.debug || console.debug)(...args);
      }
    }
  };
}
```

### パフォーマンス最適化

#### HTTPクライアントの再利用

```javascript
// lib/repositoryAuthorizer.js
const axios = require('axios');

// axiosインスタンスを再利用
let sharedAxiosInstance = null;

function getSharedAxiosInstance(config) {
  if (!sharedAxiosInstance) {
    sharedAxiosInstance = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: config.requestTimeoutMs,
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': config.userAgent,
        'X-GitHub-Api-Version': config.apiVersion
      }
    });
  }
  return sharedAxiosInstance;
}
```

#### キャッシング戦略

```javascript
// オプション: 認証結果のキャッシュ（短期間）
const authCache = new Map();
const CACHE_TTL = 60000; // 1分

function getCachedAuth(accessToken) {
  const cached = authCache.get(accessToken);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  return null;
}

function setCachedAuth(accessToken, result) {
  authCache.set(accessToken, {
    result,
    timestamp: Date.now()
  });
  
  // メモリリーク防止
  if (authCache.size > 1000) {
    const oldestKey = authCache.keys().next().value;
    authCache.delete(oldestKey);
  }
}
```

### セキュリティ考慮事項

#### 環境変数の検証

```javascript
function validateEnvironmentVariables(env) {
  const sensitiveVars = [
    'GITHUB_APP_PRIVATE_KEY',
    'AZURE_STATIC_WEB_APPS_API_TOKEN'
  ];
  
  // 本番環境では秘密情報がログに出力されないように
  if (process.env.NODE_ENV === 'production') {
    sensitiveVars.forEach(varName => {
      if (env[varName]) {
        // 値の長さのみを検証
        if (env[varName].length < 10) {
          throw new ConfigurationError(
            `${varName} appears to be invalid (too short)`
          );
        }
      }
    });
  }
}
```

#### アクセストークンの取り扱い

```javascript
// ログ出力時はトークンをマスク
function maskToken(token) {
  if (!token || token.length < 8) {
    return '***';
  }
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

// 使用例
logger.info(`Authorizing with token: ${maskToken(accessToken)}`);
```

---

## トラブルシューティングガイド

### よくある問題と解決方法

#### 問題 1: パッケージが見つからない

**症状**:
```
Error: Cannot find module '@yourorg/swa-github-auth'
```

**原因**:
- パッケージがインストールされていない
- ワークスペースリンクが正しく設定されていない

**解決方法**:
```bash
# パッケージを再インストール
cd api
npm install @yourorg/swa-github-auth

# ローカル開発の場合
cd ../../
npm run link:local
```

#### 問題 2: 環境変数が読み込まれない

**症状**:
```
Error: Missing required environment variables: GITHUB_REPO_OWNER, GITHUB_REPO_NAME
```

**原因**:
- 環境変数が設定されていない
- `local.settings.json` が正しく構成されていない

**解決方法**:
```json
// api/local.settings.json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "GITHUB_REPO_OWNER": "your-org",
    "GITHUB_REPO_NAME": "your-repo",
    "GITHUB_APP_ID": "your-app-id",
    "GITHUB_APP_INSTALLATION_ID": "your-installation-id",
    "GITHUB_APP_PRIVATE_KEY": "your-pem-with-\\n"
  }
}
```

#### 問題 3: テストが失敗する

**症状**:
```
FAIL  __tests__/index.test.js
```

**原因**:
- モックが正しく設定されていない
- 依存関係のバージョン不一致

**解決方法**:
```bash
# 依存関係をクリーンインストール
rm -rf node_modules package-lock.json
npm install

# テストをデバッグモードで実行
npm test -- --verbose --no-coverage
```

#### 問題 4: GitHub APIレート制限

**症状**:
```
Error: GitHub API rate limit exceeded
```

**原因**:
- 認証されていないリクエストが多い
- 短時間に多数のリクエスト

**解決方法**:
```javascript
// リトライロジックの実装
const authorizer = createRepositoryAuthorizer({
  repoOwner: 'myorg',
  repoName: 'myrepo',
  httpClient: axios.create({
    // リトライ設定
    maxRetries: 3,
    retryDelay: 1000
  })
});
```

#### 問題 5: TypeScript型定義が認識されない

**症状**:
```
Could not find a declaration file for module '@yourorg/swa-github-auth'
```

**原因**:
- 型定義ファイルが含まれていない
- package.jsonの"types"フィールドが設定されていない

**解決方法**:
```json
// packages/swa-github-auth/package.json
{
  "main": "lib/index.js",
  "types": "lib/index.d.ts"
}
```

### デバッグ手法

#### ログレベルの設定

```javascript
// 環境変数でログレベルを制御
const logLevel = process.env.LOG_LEVEL || 'info';

const handler = createDefaultHandler({
  logger: createLogger(context.log, { logLevel })
});
```

#### ローカルデバッグ

```bash
# VS Code launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Node Functions",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "preLaunchTask": "func: host start"
    }
  ]
}
```

#### Azure Functionsのローカルデバッグ

```bash
# デバッグモードで起動
func start --verbose

# 特定の関数のみテスト
func start --functions AuthorizeRepositoryAccess
```

---

## メンテナンスガイド

### 定期的なメンテナンスタスク

#### 月次タスク

- [ ] 依存関係の更新確認
- [ ] セキュリティ脆弱性のスキャン
- [ ] ドキュメントの更新確認
- [ ] Issueとプルリクエストのトリアージ

```bash
# 依存関係の確認
npm outdated --workspaces

# セキュリティ監査
npm audit --workspaces

# 更新
npm update --workspaces
```

#### 四半期タスク

- [ ] パフォーマンスレビュー
- [ ] コードカバレッジレビュー
- [ ] ドキュメントの包括的レビュー
- [ ] ロードマップの更新

### 依存関係管理

#### 依存関係の更新方針

**peerDependencies**:
- メジャーバージョンは慎重に
- 広い範囲をサポート（`^4.0.0` など）

**dependencies**:
- 定期的に更新
- セキュリティパッチは即座に適用

**devDependencies**:
- 比較的自由に更新可能
- ただしCIとの互換性を確認

#### 更新手順

```bash
# 1. 依存関係の確認
npm outdated --workspace=packages/swa-github-auth

# 2. テスト実行（更新前）
npm run test:package

# 3. 更新
npm update axios --workspace=packages/swa-github-auth

# 4. テスト実行（更新後）
npm run test:package

# 5. E2Eテスト
cd examples/basic
npm install
npx swa start docs --api-location api

# 6. 問題なければコミット
git add packages/swa-github-auth/package.json
git commit -m "chore(deps): update axios to vX.Y.Z"
```

### セキュリティ対応

#### 脆弱性発見時の対応フロー

1. **評価**
   - 脆弱性の深刻度確認（Critical/High/Medium/Low）
   - 影響範囲の特定

2. **対応**
   - Criticalの場合: 24時間以内にパッチリリース
   - Highの場合: 1週間以内にパッチリリース
   - Medium以下: 次回リリースに含める

3. **通知**
   - GitHub Security Advisory作成
   - ユーザーへのメール通知（該当する場合）
   - CHANGELOGへの記載

#### 脆弱性対応コマンド

```bash
# 脆弱性スキャン
npm audit

# 自動修正（可能な範囲）
npm audit fix

# 強制修正（破壊的変更を含む）
npm audit fix --force

# 詳細レポート
npm audit --json > audit-report.json
```

### ブランチ戦略

#### ブランチ構成

```
main (保護)
  └── develop (保護)
       ├── feature/xxx
       ├── bugfix/xxx
       └── release/vX.Y.Z
```

#### ブランチルール

**main**:
- 本番環境にデプロイ可能
- 直接コミット禁止
- PRレビュー必須
- CI/CDパス必須

**develop**:
- 開発の中心ブランチ
- 機能開発のベース
- PRレビュー必須

**feature/**:
- 新機能開発用
- developからブランチ
- developにマージ

**bugfix/**:
- バグ修正用
- developからブランチ
- developにマージ

**release/**:
- リリース準備用
- developからブランチ
- mainとdevelopにマージ

**hotfix/**:
- 緊急修正用
- mainからブランチ
- mainとdevelopにマージ

### リリースプロセス

#### 通常リリース

```bash
# 1. developから最新を取得
git checkout develop
git pull origin develop

# 2. リリースブランチ作成
git checkout -b release/v1.1.0

# 3. バージョン更新
cd packages/swa-github-auth
npm version minor  # 1.0.0 → 1.1.0

# 4. CHANGELOG更新
# CHANGELOG.mdを編集

# 5. コミット
git add .
git commit -m "chore: prepare release v1.1.0"

# 6. PRを作成（develop → main）
gh pr create --base main --title "Release v1.1.0"

# 7. マージ後、タグ作成
git checkout main
git pull origin main
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# 8. npm公開（GitHub Actionsが自動実行）

# 9. developにマージバック
git checkout develop
git merge main
git push origin develop
```

#### ホットフィックスリリース

```bash
# 1. mainから緊急修正ブランチ作成
git checkout main
git pull origin main
git checkout -b hotfix/v1.0.1

# 2. 修正実施
# ... コード修正

# 3. バージョン更新
cd packages/swa-github-auth
npm version patch  # 1.0.0 → 1.0.1

# 4. テスト
npm run test

# 5. コミット
git add .
git commit -m "fix: critical security issue"

# 6. mainにマージ
git checkout main
git merge hotfix/v1.0.1
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin main --tags

# 7. developにもマージ
git checkout develop
git merge hotfix/v1.0.1
git push origin develop

# 8. ホットフィックスブランチ削除
git branch -d hotfix/v1.0.1
```

---

## 付録

### A. ファイルテンプレート

#### A.1 パッケージREADME.mdテンプレート

```markdown
# @yourorg/swa-github-auth

> GitHub repository-based authentication for Azure Static Web Apps

## Installation

npm install @yourorg/swa-github-auth @azure/functions

## Quick Start

### Basic Usage

[基本的な使用例]

### Advanced Usage

[高度な使用例]

## API Reference

[API詳細]

## Configuration

[設定オプション]

## Examples

[サンプルコード]

## Troubleshooting

[トラブルシューティング]

## Contributing

[貢献ガイド]

## License

MIT
```

#### A.2 CHANGELOG.mdテンプレート

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Basic authentication handler
- Multi-repository support
- TypeScript definitions

[Unreleased]: https://github.com/yourorg/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourorg/repo/releases/tag/v1.0.0
```

#### A.3 CONTRIBUTING.mdテンプレート

```markdown
# Contributing Guide

## Development Setup

[開発環境のセットアップ手順]

## Making Changes

[変更の作成方法]

## Testing

[テストの実行方法]

## Submitting Changes

[プルリクエストの作成方法]

## Code Style

[コーディング規約]

## Commit Messages

[コミットメッセージの書き方]
```

### B. チェックリスト

#### B.1 プルリクエストチェックリスト

- [ ] コードがESLintルールに準拠している
- [ ] 全ユニットテストが成功する
- [ ] 新機能にテストが追加されている
- [ ] ドキュメントが更新されている
- [ ] CHANGELOGが更新されている（該当する場合）
- [ ] 破壊的変更が文書化されている（該当する場合）
- [ ] コミットメッセージが規約に従っている

#### B.2 リリースチェックリスト

- [ ] 全テストが成功している
- [ ] セキュリティ監査が完了している
- [ ] CHANGELOGが最新である
- [ ] バージョン番号が正しい
- [ ] ドキュメントが最新である
- [ ] サンプルコードが動作する
- [ ] 移行ガイドが準備されている（破壊的変更の場合）
- [ ] Gitタグが作成されている
- [ ] npm公開が成功している
- [ ] GitHub Releaseが作成されている

### C. 用語集

| 用語 | 説明 |
|------|------|
| SWA | Azure Static Web Apps |
| OAuth | Open Authorization - 認可のためのオープンスタンダード |
| Principal | 認証されたユーザーまたはサービスを表す情報 |
| Authorizer | 認可を行うコンポーネント |
| Handler | Azure Functionsのリクエストハンドラー |
| Workspace | npmのワークスペース機能（モノレポ管理用） |
| Peer Dependency | パッケージが期待する外部依存関係 |

### D. サポート情報

#### コミュニティサポート

- **GitHub Discussions**: [リンク]
- **Stack Overflow**: タグ `swa-github-auth`
- **Discord**: [招待リンク]

#### 報告先

- **バグレポート**: GitHub Issues
- **セキュリティ脆弱性**: GitHub Issues
- **機能リクエスト**: GitHub Discussions

---

## まとめ

このドキュメントは、Azure Static Web Apps用GitHub認証機能をnpmパッケージ化し、サンプルプロジェクトと統合するための包括的な実装計画を提供します。

### 重要なポイント

1. **段階的アプローチ**: 既存機能を維持しながら段階的に移行
2. **後方互換性**: 既存デプロイメントへの影響を最小化
3. **充実したドキュメント**: ユーザーが容易に採用できるよう支援
4. **包括的なテスト**: 品質を保証するための多層的なテスト戦略
5. **継続的なメンテナンス**: 長期的なサポート体制の確立

### 次のステップ

1. チーム内でこの計画をレビュー
2. 必要に応じて計画を調整
3. Phase 1から実装を開始
4. 定期的に進捗を確認
5. 問題が発生した場合は計画を更新

このドキュメントを参照しながら、確実かつ効率的にnpmパッケージ化を進めてください。