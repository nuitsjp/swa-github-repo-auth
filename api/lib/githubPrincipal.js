function extractGitHubPrincipal(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  const payload = req.body || {};
  const principal = payload.clientPrincipal || payload;

  if (!principal || principal.identityProvider !== 'github') {
    return null;
  }

  return {
    identityProvider: principal.identityProvider,
    userId: principal.userId || principal.user_id || null,
    userDetails: principal.userDetails || principal.user_details || null,
    accessToken: principal.accessToken || null
  };
}

module.exports = { extractGitHubPrincipal };
