const { URL } = require('url');
const {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('./config');

/**
 * GitHub リポジトリの API URL を構築します。
 * ベース URL のパスを正規化し、リポジトリのエンドポイントパスを追加します。
 */
function buildRepositoryUrl(baseUrl, owner, name) {
  const parsedBase = new URL(baseUrl);
  const normalizedPath = parsedBase.pathname.replace(/\/+$/, '');
  const pathPrefix = normalizedPath === '/' ? '' : normalizedPath;

  return `${parsedBase.origin}${pathPrefix}/repos/${owner}/${name}`;
}

/**
 * リポジトリへのアクセス権を検証する認可オブジェクトを作成します。
 * GitHub API を使用してユーザーのリポジトリアクセス権限を確認します。
 */
function createRepositoryAuthorizer({
  repoOwner,
  repoName,
  httpClient,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  apiVersion = DEFAULT_API_VERSION,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT
}) {
  if (!httpClient || typeof httpClient.get !== 'function') {
    throw new Error('An HTTP client with a get method must be provided.');
  }

  /**
   * 指定されたアクセストークンでリポジトリへのアクセス権を検証します。
   * GitHub API にリクエストを送信し、レスポンスステータスに基づいて認可の可否を判定します。
   */
  async function authorize(accessToken, logger) {
    const log = logger || console;

    // リポジトリ設定の検証
    if (!repoOwner || !repoName) {
      log.warn('Repository identification is not configured.');
      return false;
    }

    if (!accessToken) {
      log.warn('No access token supplied to repository authorizer.');
      return false;
    }

    const repoUrl = buildRepositoryUrl(apiBaseUrl, repoOwner, repoName);

    // GitHub API にリクエストを送信してアクセス権を検証
    try {
      await httpClient.get(repoUrl.toString(), {
        timeout: requestTimeoutMs,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': apiVersion
        }
      });
      return true;
    } catch (error) {
      const status = error?.response?.status;

      // アクセス拒否のステータスコードを処理
      if (status === 404) {
        log.warn('Repository access denied (404).');
        return false;
      }

      if (status === 401 || status === 403) {
        log.warn(`Repository access denied (${status}).`);
        return false;
      }

      // その他のエラー
      log.error('GitHub API error while authorizing repository access:', error?.message || error);
      return false;
    }
  }

  return { authorize };
}

module.exports = { createRepositoryAuthorizer };
