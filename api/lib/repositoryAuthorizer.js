// 呼び出し元トークンで GitHub REST API を叩き、リポジトリアクセスを判定する。
const axios = require('axios');
const {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('./config');

function buildRepoUrl(apiBaseUrl, repoOwner, repoName) {
  // API ベース URL をプレフィックス込みで組み立て、末尾スラッシュを除去する。
  const base = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
  const normalizedPath = base.pathname.replace(/\/+$/, '');
  const pathPrefix = normalizedPath === '' || normalizedPath === '/' ? '' : normalizedPath;
  // リポジトリエンドポイントの完全な URL を構築
  return `${base.origin}${pathPrefix}/repos/${repoOwner}/${repoName}`;
}

function createRepositoryAuthorizer(options = {}) {
  const {
    repoOwner,
    repoName,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    apiVersion = DEFAULT_API_VERSION,
    requestTimeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
    httpClient = axios
  } = options;

  return {
    async authorize(accessToken, logger = {}) {
      // ロガーメソッドを安全に取得（未定義の場合は空関数）
      const info = logger.info || (() => {});
      const warn = logger.warn || info;
      const error = logger.error || info;

      // アクセストークンの存在を検証
      if (!accessToken) {
        warn('No access token supplied to repository authorizer.');
        return false;
      }

      // リポジトリ識別情報の存在を検証
      if (!repoOwner || !repoName) {
        warn('Repository identification is not configured.');
        return false;
      }

      // GitHub API エンドポイント URL を構築
      const repoUrl = buildRepoUrl(apiBaseUrl, repoOwner, repoName);

      try {
        // GitHub REST API にリポジトリ情報を取得するリクエストを送信
        await httpClient.get(repoUrl, {
          timeout: requestTimeoutMs,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': userAgent,
            'X-GitHub-Api-Version': apiVersion
          }
        });

        // リクエストが成功したらアクセスを許可
        return true;
      } catch (err) {
        const status = err?.response?.status;

        // 404/401/403 は明示的なアクセス拒否として扱う
        if (status === 404 || status === 401 || status === 403) {
          warn(`Repository access denied (${status}).`);
          return false;
        }

        // その他のエラーはログに記録して拒否
        error('GitHub API error while authorizing repository access:', err?.message || err);
        return false;
      }
    }
  };
}

module.exports = {
  createRepositoryAuthorizer
};
