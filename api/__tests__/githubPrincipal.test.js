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
        accessToken: 'token'
      }
    });

    expect(principal).toEqual({
      identityProvider: 'github',
      userId: 'legacy',
      userDetails: 'octocat',
      accessToken: 'token'
    });
  });
});
