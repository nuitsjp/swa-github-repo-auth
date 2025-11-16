const axios = require('axios');

/**
 * Azure Functions のリポジトリアクセス認可ハンドラー。
 * GitHub プリンシパルを抽出し、リポジトリへのアクセス権を検証して、
 * 適切なロールを割り当てます。
 */
module.exports = async function (context, req) {
  const log = context.log || console;

  try {
    // === 環境変数から設定を読み込み ===
    const env = process.env;
    const repoOwner = (env.GITHUB_REPO_OWNER || '').trim();
    const repoName = (env.GITHUB_REPO_NAME || '').trim();
    
    if (!repoOwner || !repoName) {
      log.error('Missing required GitHub repository configuration: GITHUB_REPO_OWNER, GITHUB_REPO_NAME');
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
      return;
    }

    const apiBaseUrl = (env.GITHUB_API_BASE_URL || '').trim() || 'https://api.github.com';
    const apiVersion = (env.GITHUB_API_VERSION || '').trim() || '2022-11-28';
    const timeoutMs = parseInt(env.GITHUB_API_TIMEOUT_MS, 10) > 0 ? parseInt(env.GITHUB_API_TIMEOUT_MS, 10) : 5000;
    const userAgent = (env.GITHUB_API_USER_AGENT || '').trim() || 'swa-github-repo-auth';

    // === プリンシパル抽出 ===
    let principal = null;
    
    // リクエストボディから取得を試行
    if (req.body && typeof req.body === 'object') {
      const candidate = req.body.clientPrincipal && typeof req.body.clientPrincipal === 'object' 
        ? req.body.clientPrincipal 
        : req.body;
      
      if (candidate.identityProvider === 'github') {
        principal = {
          userId: candidate.userId || candidate.user_id || null,
          userDetails: candidate.userDetails || candidate.user_details || null,
          accessToken: candidate.accessToken || candidate.access_token || null
        };
      }
    }

    // ヘッダーから取得を試行(ボディで見つからなかった場合)
    if (!principal) {
      const headers = req.headers || {};
      const headerValue = headers['x-ms-client-principal'] || headers['X-MS-CLIENT-PRINCIPAL'];
      
      if (headerValue && typeof headerValue === 'string') {
        try {
          const decoded = Buffer.from(headerValue, 'base64').toString('utf8');
          const decodedHeader = JSON.parse(decoded);
          const candidate = decodedHeader.clientPrincipal || decodedHeader;
          
          if (candidate.identityProvider === 'github') {
            principal = {
              userId: candidate.userId || candidate.user_id || null,
              userDetails: candidate.userDetails || candidate.user_details || null,
              accessToken: candidate.accessToken || candidate.access_token || null
            };
          }
        } catch (error) {
          // デコードエラーは無視
        }
      }
    }

    // GitHub 以外の ID プロバイダーまたは未認証の場合
    if (!principal) {
      log.info('Non-GitHub identity detected, assigning anonymous role.');
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
      return;
    }

    if (!principal.accessToken) {
      log.warn('GitHub principal missing access token, denying access.');
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
      return;
    }

    // === リポジトリアクセス権の検証 ===
    const normalizedPath = new URL(apiBaseUrl).pathname.replace(/\/+$/, '');
    const pathPrefix = normalizedPath === '/' ? '' : normalizedPath;
    const repoUrl = `${new URL(apiBaseUrl).origin}${pathPrefix}/repos/${repoOwner}/${repoName}`;

    try {
      await axios.get(repoUrl, {
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${principal.accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': apiVersion
        }
      });

      // アクセス成功
      log.info(`User ${principal.userDetails || principal.userId || 'unknown'}: access granted`);
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: ['authorized'] } };
    } catch (error) {
      const status = error?.response?.status;

      if (status === 404 || status === 401 || status === 403) {
        log.warn(`Repository access denied (${status}).`);
        log.info(`User ${principal.userDetails || principal.userId || 'unknown'}: access denied`);
      } else {
        log.error('GitHub API error while authorizing repository access:', error?.message || error);
      }

      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
    }
  } catch (error) {
    log.error('Unhandled authorization error:', error?.message || error);
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: { roles: [] } };
  }
};
