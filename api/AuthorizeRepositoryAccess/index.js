const axios = require('axios');
const { createRepositoryAuthorizer } = require('../lib/repositoryAuthorizer');
const { extractGitHubPrincipal } = require('../lib/githubPrincipal');
const { ensureGitHubRepoConfig } = require('../lib/config');

/**
 * Azure Functions のロガーを標準化されたインターフェースでラップします。
 * info、warn、error の各メソッドを提供します。
 */
function createLogger(logFn) {
  if (!logFn) {
    return console;
  }

  const warn = typeof logFn.warn === 'function' ? logFn.warn.bind(logFn) : logFn;
  const error = typeof logFn.error === 'function' ? logFn.error.bind(logFn) : logFn;

  return {
    info: (...args) => logFn(...args),
    warn: (...args) => warn(...args),
    error: (...args) => error(...args)
  };
}

/**
 * ロール情報を含む HTTP レスポンスを構築します。
 * Azure Static Web Apps のロールソース API の形式に従います。
 */
function buildResponse(roles) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: { roles }
  };
}

/**
 * リポジトリアクセス認可ハンドラーを作成します。
 * GitHub プリンシパルを抽出し、リポジトリへのアクセス権を検証して、
 * 適切なロールを割り当てます。
 */
function createAuthorizeRepositoryAccessHandler({
  authorizer,
  principalExtractor = extractGitHubPrincipal
}) {
  if (!authorizer || typeof authorizer.authorize !== 'function') {
    throw new Error('An authorizer with an authorize method must be provided.');
  }

  /**
   * Azure Functions のハンドラー関数。
   * リクエストから GitHub プリンシパルを抽出し、認可を実行します。
   */
  return async function authorizeRepositoryAccess(context, req) {
    const logger = createLogger(context.log);

    try {
      const principal = principalExtractor(req);

      // GitHub 以外の ID プロバイダーまたは未認証の場合
      if (!principal) {
        logger.info('Non-GitHub identity detected, assigning anonymous role.');
        context.res = buildResponse([]);
        return;
      }

      if (!principal.accessToken) {
        logger.warn('GitHub principal missing access token, denying access.');
        context.res = buildResponse([]);
        return;
      }

      // リポジトリアクセス権の検証とロールの割り当て
      const hasAccess = await authorizer.authorize(principal.accessToken, logger);
      const roles = hasAccess ? ['authorized'] : [];

      logger.info(
        `User ${principal.userDetails || principal.userId || 'unknown'}: access ${
          hasAccess ? 'granted' : 'denied'
        }`
      );

      context.res = buildResponse(roles);
    } catch (error) {
      logger.error('Unhandled authorization error:', error?.message || error);
      context.res = buildResponse([]);
    }
  };
}

// モジュール初期化時に設定を読み込み、リポジトリ認可オブジェクトを作成
// 環境変数から GitHub リポジトリの設定を取得し、必須項目の存在を検証
const repoConfig = ensureGitHubRepoConfig(process.env);

// リポジトリアクセス権を検証するための認可オブジェクトを生成
// axios を HTTP クライアントとして使用し、GitHub API へのリクエストを実行
const repositoryAuthorizer = createRepositoryAuthorizer({
  repoOwner: repoConfig.repoOwner,
  repoName: repoConfig.repoName,
  httpClient: axios,
  apiBaseUrl: repoConfig.apiBaseUrl,
  apiVersion: repoConfig.apiVersion,
  requestTimeoutMs: repoConfig.requestTimeoutMs,
  userAgent: repoConfig.userAgent
});

// Azure Functions のデフォルトエクスポートとして認可ハンドラーを公開
// このハンドラーは Azure Static Web Apps のロールソース API として機能
module.exports = createAuthorizeRepositoryAccessHandler({
  authorizer: repositoryAuthorizer
});

// テスト用に各関数を個別にエクスポート
module.exports.createAuthorizeRepositoryAccessHandler =
  createAuthorizeRepositoryAccessHandler;
module.exports.createLogger = createLogger;
module.exports.buildResponse = buildResponse;
