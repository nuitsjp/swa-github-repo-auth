function decodeClientPrincipal(headerValue) {
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);
    return payload && typeof payload === 'object'
      ? (payload.clientPrincipal || payload)
      : null;
  } catch (error) {
    return null;
  }
}

function normalizePrincipal(candidate) {
  if (!candidate || candidate.identityProvider !== 'github') {
    return null;
  }

  return {
    identityProvider: 'github',
    userId: candidate.userId || candidate.user_id || null,
    userDetails: candidate.userDetails || candidate.user_details || null,
    accessToken: candidate.accessToken || candidate.access_token || null
  };
}

function extractGitHubPrincipal(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  let candidate = null;

  if (req.body && typeof req.body === 'object') {
    candidate = typeof req.body.clientPrincipal === 'object'
      ? req.body.clientPrincipal
      : req.body;
  }

  if (!candidate && req.headers && req.headers['x-ms-client-principal']) {
    candidate = decodeClientPrincipal(req.headers['x-ms-client-principal']);
  }

  return normalizePrincipal(candidate);
}

module.exports = {
  extractGitHubPrincipal
};
