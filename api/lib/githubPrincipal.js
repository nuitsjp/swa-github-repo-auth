// x-ms-client-principal ではプリンシパルを base64 で搬送する。
function decodeClientPrincipal(headerValue) {
  try {
    // base64 エンコードされたヘッダー値をデコード
    const decoded = Buffer.from(headerValue, 'base64').toString('utf8');
    // JSON として解析
    const payload = JSON.parse(decoded);
    // ネストされた clientPrincipal フィールドがあればそれを優先、なければペイロード全体を返す
    return payload && typeof payload === 'object'
      ? (payload.clientPrincipal || payload)
      : null;
  } catch (error) {
    // デコードまたは JSON 解析に失敗した場合は null を返す
    return null;
  }
}

// SWA/レガシー両方のフィールド名を正規化する。
function normalizePrincipal(candidate) {
  // GitHub プロバイダー以外は null を返す
  if (!candidate || candidate.identityProvider !== 'github') {
    return null;
  }

  // 新旧両方のフィールド名に対応した正規化オブジェクトを返す
  return {
    identityProvider: 'github',
    userId: candidate.userId || candidate.user_id || null,
    userDetails: candidate.userDetails || candidate.user_details || null,
    accessToken: candidate.accessToken || candidate.access_token || null
  };
}

function extractGitHubPrincipal(req) {
  // リクエストオブジェクトの存在を検証
  if (!req || typeof req !== 'object') {
    return null;
  }

  // body を優先し、無ければヘッダーから復元する。
  let candidate = null;

  // req.body から clientPrincipal を抽出
  candidate = typeof req.body.clientPrincipal === 'object'
    ? req.body.clientPrincipal
    : req.body;

  // 抽出した候補を正規化して返す
  return normalizePrincipal(candidate);
}

module.exports = {
  extractGitHubPrincipal
};
