const { extractGitHubPrincipal } = require('../lib/githubPrincipal');

describe('extractGitHubPrincipal', () => {
  test('req.body.clientPrincipal から GitHub プリンシパルを抽出', () => {
    const req = {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          userId: 'test-user-123',
          userDetails: 'testuser',
          accessToken: 'gho_testtoken'
        }
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toEqual({
      identityProvider: 'github',
      userId: 'test-user-123',
      userDetails: 'testuser',
      accessToken: 'gho_testtoken'
    });
  });

  test('req.body 直下に GitHub プリンシパルがある場合', () => {
    const req = {
      body: {
        identityProvider: 'github',
        userId: 'test-user-456',
        userDetails: 'anotheruser',
        accessToken: 'gho_anothertoken'
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toEqual({
      identityProvider: 'github',
      userId: 'test-user-456',
      userDetails: 'anotheruser',
      accessToken: 'gho_anothertoken'
    });
  });

  test('レガシーフィールド名(user_id, user_details, access_token)を正規化', () => {
    const req = {
      body: {
        identityProvider: 'github',
        user_id: 'legacy-user',
        user_details: 'legacyuser',
        access_token: 'gho_legacytoken'
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toEqual({
      identityProvider: 'github',
      userId: 'legacy-user',
      userDetails: 'legacyuser',
      accessToken: 'gho_legacytoken'
    });
  });

  test('x-ms-client-principal ヘッダーから GitHub プリンシパルを抽出', () => {
    const headerPrincipal = {
      identityProvider: 'github',
      userId: 'header-user',
      userDetails: 'headeruser',
      access_token: 'gho_headertoken'
    };

    const req = {
      headers: {
        'x-ms-client-principal': Buffer.from(JSON.stringify(headerPrincipal)).toString('base64')
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toEqual({
      identityProvider: 'github',
      userId: 'header-user',
      userDetails: 'headeruser',
      accessToken: 'gho_headertoken'
    });
  });

  test('ヘッダーが無効でも body から抽出できる', () => {
    const req = {
      headers: {
        'x-ms-client-principal': '***invalid-base64***'
      },
      body: {
        identityProvider: 'github',
        userId: 'fallback-user',
        userDetails: 'fallbackuser'
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toEqual({
      identityProvider: 'github',
      userId: 'fallback-user',
      userDetails: 'fallbackuser',
      accessToken: null
    });
  });

  test('GitHub 以外のプロバイダーの場合は null を返す', () => {
    const req = {
      body: {
        clientPrincipal: {
          identityProvider: 'aad',
          userId: 'aad-user',
          userDetails: 'aaduser'
        }
      }
    };

    const result = extractGitHubPrincipal(req);
    expect(result).toBeNull();
  });

  test('req が null または undefined の場合は null を返す', () => {
    expect(extractGitHubPrincipal(null)).toBeNull();
    expect(extractGitHubPrincipal(undefined)).toBeNull();
  });

  test('req.body が存在しない場合は null を返す', () => {
    const req = { headers: {} };
    const result = extractGitHubPrincipal(req);
    expect(result).toBeNull();
  });

  test('req.body が空オブジェクトの場合は null を返す', () => {
    const req = { body: {} };
    const result = extractGitHubPrincipal(req);
    expect(result).toBeNull();
  });
});
