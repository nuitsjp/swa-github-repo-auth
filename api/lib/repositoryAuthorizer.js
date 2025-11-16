const axios = require('axios');
const {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('./config');

function buildRepoUrl(apiBaseUrl, repoOwner, repoName) {
  const base = new URL(apiBaseUrl || DEFAULT_API_BASE_URL);
  const normalizedPath = base.pathname.replace(/\/+$/, '');
  const pathPrefix = normalizedPath === '' || normalizedPath === '/' ? '' : normalizedPath;
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
      const info = logger.info || (() => {});
      const warn = logger.warn || info;
      const error = logger.error || info;

      if (!accessToken) {
        warn('No access token supplied to repository authorizer.');
        return false;
      }

      if (!repoOwner || !repoName) {
        warn('Repository identification is not configured.');
        return false;
      }

      const repoUrl = buildRepoUrl(apiBaseUrl, repoOwner, repoName);

      try {
        await httpClient.get(repoUrl, {
          timeout: requestTimeoutMs,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': userAgent,
            'X-GitHub-Api-Version': apiVersion
          }
        });

        return true;
      } catch (err) {
        const status = err?.response?.status;

        if (status === 404 || status === 401 || status === 403) {
          warn(`Repository access denied (${status}).`);
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
