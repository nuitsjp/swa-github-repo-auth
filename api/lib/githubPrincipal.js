/**
 * プリンシパル情報を正規化します。
 * GitHub 以外のプロバイダーの場合は null を返し、
 * プロパティ名のバリエーション(camelCase/snake_case)を統一します。
 */
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

/**
 * Base64 エンコードされたプリンシパルヘッダーをデコードします。
 * デコードまたはパースに失敗した場合は null を返します。
 */
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

/**
 * HTTP リクエストから GitHub プリンシパル情報を抽出します。
 * リクエストボディを優先的に確認し、見つからない場合はヘッダーから取得を試みます。
 */
function extractGitHubPrincipal(req) {
  if (!req || typeof req !== 'object') {
    return null;
  }

  // リクエストボディからプリンシパル情報を取得
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

  // ヘッダーからプリンシパル情報を取得(Azure Static Web Apps の標準ヘッダー)
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
