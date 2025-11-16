// エントリーポイント: 設定読み取り・プリンシパル抽出・リポジトリアクセス判定を束ねる。
const axios = require('axios');
const { loadGitHubRepoConfig } = require('../lib/config');
const { extractGitHubPrincipal } = require('../lib/githubPrincipal');
const { createRepositoryAuthorizer } = require('../lib/repositoryAuthorizer');

// SWA の context.log/console を安全に扱うラッパーを生成する。
function createLogger(log) {
  // log が未定義の場合は console をフォールバックとして使用
  if (!log) {
    return console;
  }

  // log が関数の場合（レガシー形式）、info/warn/error メソッドを構築
  if (typeof log === 'function') {
    const info = log.info && typeof log.info === 'function' ? log.info : log;
    return {
      info,
      warn: log.warn && typeof log.warn === 'function' ? log.warn : info,
      error: log.error && typeof log.error === 'function' ? log.error : info
    };
  }

  // オブジェクト形式の場合、各ログレベルメソッドを検証して返却
  const info = typeof log.info === 'function' ? log.info : () => {};
  const warn = typeof log.warn === 'function' ? log.warn : info;
  const error = typeof log.error === 'function' ? log.error : info;

  return { info, warn, error };
}

// GitHub プリンシパルの抽出とリポジトリアクセス判定を行うハンドラーを組み立てる。
function createAuthorizeRepositoryAccessHandler(options = {}) {
  const { authorizer, principalExtractor = extractGitHubPrincipal } = options;

  // authorizer の存在と authorize メソッドを検証
  if (!authorizer || typeof authorizer.authorize !== 'function') {
    throw new Error('An authorizer with an authorize method must be provided.');
  }

  return async function authorizeRepositoryAccess(context, req) {
    // ロガーの初期化
    const logger = createLogger(context && context.log);

    try {
      // リクエストから GitHub プリンシパル情報を抽出
      const principal = principalExtractor(req);

      // GitHub 以外の ID プロバイダーの場合は匿名ロールを返す
      if (!principal || principal.identityProvider !== 'github') {
        logger.info('Non-GitHub identity detected, assigning anonymous role.');
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
        return;
      }

      // アクセストークンが欠落している場合はアクセスを拒否
      if (!principal.accessToken) {
        logger.warn('GitHub principal missing access token, denying access.');
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
        return;
      }

      // リポジトリへのアクセス権限を検証
      const authorized = await authorizer.authorize(principal.accessToken, logger);
      const userLabel = principal.userDetails || principal.userId || 'unknown';

      // 検証結果に応じてロールを割り当て
      if (authorized) {
        logger.info(`User ${userLabel}: access granted`);
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: ['authorized'] } };
      } else {
        logger.info(`User ${userLabel}: access denied`);
        context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
      }
    } catch (error) {
      // 予期しないエラーが発生した場合は空のロールを返す
      logger.error('Unhandled authorization error:', error?.message || error);
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
    }
  };
}

// 環境変数から設定を読み込み
const config = loadGitHubRepoConfig(process.env);

// リポジトリ認可オブジェクトを生成
const repositoryAuthorizer = createRepositoryAuthorizer({
  ...config,
  httpClient: axios
});

// ハンドラーを構築してエクスポート
const handler = createAuthorizeRepositoryAccessHandler({
  authorizer: repositoryAuthorizer,
  principalExtractor: extractGitHubPrincipal
});

module.exports = handler;
module.exports.createAuthorizeRepositoryAccessHandler = createAuthorizeRepositoryAccessHandler;
module.exports.createLogger = createLogger;
