const { URL } = require('url');

function createRepositoryAuthorizer({ repoOwner, repoName, httpClient }) {
  if (!httpClient || typeof httpClient.get !== 'function') {
    throw new Error('An HTTP client with a get method must be provided.');
  }

  async function authorize(accessToken, logger) {
    const log = logger || console;

    if (!repoOwner || !repoName) {
      log.warn('Repository identification is not configured.');
      return false;
    }

    if (!accessToken) {
      log.warn('No access token supplied to repository authorizer.');
      return false;
    }

    const repoUrl = new URL(
      `/repos/${repoOwner}/${repoName}`,
      'https://api.github.com'
    );

    try {
      await httpClient.get(repoUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json'
        }
      });
      return true;
    } catch (error) {
      const status = error?.response?.status;

      if (status === 404) {
        log.warn('Repository access denied (404).');
        return false;
      }

      if (status === 401 || status === 403) {
        log.warn(`Repository access denied (${status}).`);
        return false;
      }

      log.error('GitHub API error while authorizing repository access:', error?.message || error);
      return false;
    }
  }

  return { authorize };
}

module.exports = { createRepositoryAuthorizer };
