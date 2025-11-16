const { extractGitHubPrincipal } = require('../lib/githubPrincipal');

describe('extractGitHubPrincipal', () => {
  it('returns null when request missing', () => {
    // null や不正リクエストはプリンシパルなし。
    expect(extractGitHubPrincipal(null)).toBeNull();
  });

  it('returns null for non-GitHub identity', () => {
    // GitHub 以外のプロバイダーは無視する。
    const principal = extractGitHubPrincipal({
      body: { clientPrincipal: { identityProvider: 'aad' } }
    });
    expect(principal).toBeNull();
  });

  it('normalizes github principal properties', () => {
    // 標準的な body から camelCase に正規化する。
    const principal = extractGitHubPrincipal({
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          userId: 'id-123',
          userDetails: 'octocat',
          accessToken: 'token'
        }
      }
    });

    expect(principal).toEqual({
      identityProvider: 'github',
      userId: 'id-123',
      userDetails: 'octocat',
      accessToken: 'token'
    });
  });

  it('supports flattened payloads', () => {
    // フラットなボディもサポート。
    const principal = extractGitHubPrincipal({
      body: {
        identityProvider: 'github',
        user_id: 'legacy',
        user_details: 'octocat',
        access_token: 'token'
      }
    });

    expect(principal).toEqual({
      identityProvider: 'github',
      userId: 'legacy',
      userDetails: 'octocat',
      accessToken: 'token'
    });
  });

  it('extracts principal information from x-ms-client-principal header', () => {
    // ヘッダー経由の base64 も復号して正規化。
    const payload = {
      clientPrincipal: {
        identityProvider: 'github',
        user_id: 'header-id',
        user_details: 'header-user',
        access_token: 'header-token'
      }
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');

    const principal = extractGitHubPrincipal({
      headers: { 'x-ms-client-principal': encoded }
    });

    expect(principal).toEqual({
      identityProvider: 'github',
      userId: 'header-id',
      userDetails: 'header-user',
      accessToken: 'header-token'
    });
  });

  it('returns null when header principal cannot be decoded', () => {
    // base64 が壊れていれば安全に null を返す。
    const principal = extractGitHubPrincipal({
      headers: { 'x-ms-client-principal': '!!!not-base64!!!' }
    });

    expect(principal).toBeNull();
  });
});
