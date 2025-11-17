# @swa-github-repo-auth/swa-github-auth

Azure Static Web Apps の GitHub リポジトリベース認可ロジックを npm パッケージとして切り出したものです。`AuthorizeRepositoryAccess` 関数をラップするハンドラーとユーティリティを提供します。

## インストール

```bash
npm install @swa-github-repo-auth/swa-github-auth
```

## 使い方

```javascript
const { createDefaultHandler } = require('@swa-github-repo-auth/swa-github-auth');

module.exports = createDefaultHandler();
```

必要な環境変数:

- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- （任意）`GITHUB_API_BASE_URL`
- （任意）`GITHUB_API_VERSION`
- （任意）`GITHUB_API_TIMEOUT_MS`
- （任意）`GITHUB_API_USER_AGENT`

## API

- `createDefaultHandler(options)` - 環境変数を読み取って Functions ハンドラーを生成
- `createAuthorizeRepositoryAccessHandler({ authorizer, principalExtractor })`
- `createRepositoryAuthorizer(config)`
- `extractGitHubPrincipal(req)`
- `loadGitHubRepoConfig(env)` / `ensureGitHubRepoConfig(env)`
- `createLogger(log)`

## ライセンス

[MIT](../../LICENSE)
