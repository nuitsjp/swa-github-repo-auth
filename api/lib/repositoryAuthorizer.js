// GitHub App のインストールトークンを用いてユーザーのリポジトリ権限を判定する。
const crypto = require('crypto');
const axios = require('axios');
const {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('./config');

function buildApiUrl(apiBaseUrl, resourcePath) {
  const base = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
  const normalizedPath = base.pathname.replace(/\/+$/, '');
  const pathPrefix = normalizedPath === '' || normalizedPath === '/' ? '' : normalizedPath;
  return `${base.origin}${pathPrefix}${resourcePath}`;
}

function normalizePrivateKey(privateKey) {
  if (typeof privateKey !== 'string') {
    return privateKey;
  }

  return privateKey.replace(/\\n/g, '\n');
}

function createJwt(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,
    exp: now + 8 * 60,
    iss: appId
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

function createRepositoryAuthorizer(options = {}) {
  const {
    repoOwner,
    repoName,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    apiVersion = DEFAULT_API_VERSION,
    requestTimeoutMs = DEFAULT_TIMEOUT_MS,
    userAgent = DEFAULT_USER_AGENT,
    appId,
    installationId,
    privateKey,
    httpClient = axios
  } = options;

  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  let installationTokenCache = null;

  async function getInstallationToken(logger) {
    const info = logger.info || (() => {});
    const warn = logger.warn || info;
    const error = logger.error || info;

    if (!appId || !installationId || !normalizedPrivateKey) {
      warn('GitHub App credentials are not configured.');
      return null;
    }

    const now = Date.now();
    if (installationTokenCache && installationTokenCache.expiresAt > now + 60000) {
      return installationTokenCache.token;
    }

    try {
      const jwt = createJwt(appId, normalizedPrivateKey);
      const url = buildApiUrl(apiBaseUrl, `/app/installations/${installationId}/access_tokens`);
      const response = await httpClient.post(url, {}, {
        timeout: requestTimeoutMs,
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent,
          'X-GitHub-Api-Version': apiVersion
        }
      });

      const expiresAt = new Date(response.data?.expires_at || 0).getTime();
      const token = response.data?.token;
      if (!token || !Number.isFinite(expiresAt)) {
        warn('Failed to obtain installation access token.');
        return null;
      }

      installationTokenCache = { token, expiresAt };
      info('Obtained GitHub App installation token.');
      return token;
    } catch (err) {
      const status = err?.response?.status;
      error('Failed to create GitHub App installation token:', err?.message || err);
      if (status) {
        error(`GitHub App token endpoint responded with status ${status}.`);
      }
      return null;
    }
  }

  return {
    async authorize(username, logger = {}) {
      const info = logger.info || (() => {});
      const warn = logger.warn || info;
      const error = logger.error || info;

      if (!username) {
        warn('No GitHub username supplied to repository authorizer.');
        return false;
      }

      if (!repoOwner || !repoName) {
        warn('Repository identification is not configured.');
        return false;
      }

      const installationToken = await getInstallationToken(logger);
      if (!installationToken) {
        warn('Unable to acquire installation token.');
        return false;
      }

      const repoUrl = buildApiUrl(apiBaseUrl, `/repos/${repoOwner}/${repoName}/collaborators/${encodeURIComponent(username)}/permission`);

      try {
        const { data } = await httpClient.get(repoUrl, {
          timeout: requestTimeoutMs,
          headers: {
            Authorization: `Bearer ${installationToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': userAgent,
            'X-GitHub-Api-Version': apiVersion
          }
        });

        const permission = data?.permission || 'none';
        info(`GitHub permission check result for ${username}: ${permission}`);

        if (permission !== 'none') {
          return true;
        }

        warn(`Repository access denied for ${username}: no permission.`);
        return false;
      } catch (err) {
        const status = err?.response?.status;

        if (status === 404) {
          warn(`Repository access denied for ${username}: not found (${status}).`);
          return false;
        }

        error('GitHub API error while authorizing repository access:', err?.message || err);
        return false;
      }
    }
  };
}

module.exports = {
  createRepositoryAuthorizer
};
