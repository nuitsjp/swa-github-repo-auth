function normalizePrincipal(principal) {
  if (!principal || principal.identityProvider !== 'github') {
    return null;
  }

  return {
    identityProvider: principal.identityProvider,
    userId: principal.userId || principal.user_id || null,
    userDetails: principal.userDetails || principal.user_details || null,
    accessToken: principal.accessToken || principal.access_token || null
  };
}

function decodePrincipalHeader(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

function extractGitHubPrincipal(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  const bodyPayload = req.body && typeof req.body === 'object' ? req.body : {};
  const primaryCandidate =
    (bodyPayload.clientPrincipal &&
      typeof bodyPayload.clientPrincipal === 'object' &&
      bodyPayload.clientPrincipal) ||
    bodyPayload;
  const principalFromBody = normalizePrincipal(primaryCandidate);

  if (principalFromBody) {
    return principalFromBody;
  }

  const headers = req.headers || {};
  const headerValue =
    headers['x-ms-client-principal'] || headers['X-MS-CLIENT-PRINCIPAL'];
  const decodedHeader = decodePrincipalHeader(headerValue);
  const headerCandidate =
    decodedHeader && typeof decodedHeader === 'object'
      ? decodedHeader.clientPrincipal || decodedHeader
      : null;

  return normalizePrincipal(headerCandidate);
}

module.exports = { extractGitHubPrincipal, decodePrincipalHeader, normalizePrincipal };
