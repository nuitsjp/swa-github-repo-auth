const axios = require('axios');

const repoOwner = process.env.GITHUB_REPO_OWNER;
const repoName = process.env.GITHUB_REPO_NAME;

async function checkRepositoryAccess(owner, repo, token, logger) {
  if (!owner || !repo) {
    logger.warn('Repository identification is not configured.');
    return false;
  }

  try {
    await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json'
      }
    });
    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      logger.warn('Repository access denied (404).');
      return false;
    }

    logger.error('GitHub API error:', error.message);
    return false;
  }
}

module.exports = async function (context, req) {
  try {
    const payload = req.body || {};
    const userInfo = payload.clientPrincipal || payload;

    if (!userInfo || userInfo.identityProvider !== 'github') {
      context.log('Non-GitHub identity, denying access.');
      context.res = { status: 200, body: { roles: [] } };
      return;
    }

    const accessToken = userInfo.accessToken;
    if (!accessToken) {
      context.log('No access token provided, denying access.');
      context.res = { status: 200, body: { roles: [] } };
      return;
    }

    const hasAccess = await checkRepositoryAccess(
      repoOwner,
      repoName,
      accessToken,
      context.log
    );

    const roles = hasAccess ? ['authorized'] : [];
    context.log(`User ${userInfo.userDetails || 'unknown'}: access ${hasAccess ? 'granted' : 'denied'}`);

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: { roles }
    };
  } catch (error) {
    context.error('Unhandled CheckAccess error:', error.message);
    context.res = {
      status: 200,
      body: { roles: [] }
    };
  }
};
