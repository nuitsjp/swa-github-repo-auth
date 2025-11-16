const { extractGitHubPrincipal } = require('../lib/githubPrincipal');

describe('extractGitHubPrincipal', () => {
  it('returns null when request missing', () => {
    expect(extractGitHubPrincipal(null)).toBeNull();
  });

  it('returns null for non-GitHub identity', () => {
    const principal = extractGitHubPrincipal({
      body: { clientPrincipal: { identityProvider: 'aad' } }
    });
    expect(principal).toBeNull();
  });

  it('normalizes github principal properties', () => {
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
    const principal = extractGitHubPrincipal({
      headers: { 'x-ms-client-principal': '!!!not-base64!!!' }
    });

    expect(principal).toBeNull();
  });
});
