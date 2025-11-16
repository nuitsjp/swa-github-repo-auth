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

  // req.body から clientPrincipal を抽出
  let candidate = null;
  if (req.body && typeof req.body === 'object') {
    candidate = typeof req.body.clientPrincipal === 'object'
      ? req.body.clientPrincipal
      : req.body;
  }

  // 抽出した候補を正規化して返す
  return normalizePrincipal(candidate);
}

module.exports = {
  extractGitHubPrincipal
};
