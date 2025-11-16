const {
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig,
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('../lib/config');

describe('config helpers', () => {
  it('loads configuration with sanitized values and defaults', () => {
    const config = loadGitHubRepoConfig({
      GITHUB_REPO_OWNER: ' owner ',
      GITHUB_REPO_NAME: ' repo ',
      GITHUB_API_BASE_URL: 'https://ghe.example.com/api/v3/',
      GITHUB_API_VERSION: '2024-01-01 ',
      GITHUB_API_TIMEOUT_MS: '7000',
      GITHUB_API_USER_AGENT: ' custom-agent '
    });

    expect(config).toEqual({
      repoOwner: 'owner',
      repoName: 'repo',
      apiBaseUrl: 'https://ghe.example.com/api/v3/',
      apiVersion: '2024-01-01',
      requestTimeoutMs: 7000,
      userAgent: 'custom-agent',
      missing: []
    });
  });

  it('falls back to defaults when optional settings absent', () => {
    const config = loadGitHubRepoConfig({
      GITHUB_REPO_OWNER: 'octocat',
      GITHUB_REPO_NAME: 'demo'
    });

    expect(config).toEqual({
      repoOwner: 'octocat',
      repoName: 'demo',
      apiBaseUrl: DEFAULT_API_BASE_URL,
      apiVersion: DEFAULT_API_VERSION,
      requestTimeoutMs: DEFAULT_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
      missing: []
    });
  });

  it('tracks missing required configuration', () => {
    const config = loadGitHubRepoConfig({});

    expect(config.missing).toEqual(['GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME']);
  });

  it('throws when ensuring config without required values', () => {
    expect(() => ensureGitHubRepoConfig({})).toThrow(
      'Missing required GitHub repository configuration: GITHUB_REPO_OWNER, GITHUB_REPO_NAME'
    );
  });

  it('throws when environment bag is not an object', () => {
    expect(() => loadGitHubRepoConfig(null)).toThrow(
      'Environment bag must be provided when loading GitHub repo configuration.'
    );
  });

  it('ensures config when required values exist', () => {
    const config = ensureGitHubRepoConfig({
      GITHUB_REPO_OWNER: 'octocat',
      GITHUB_REPO_NAME: 'demo'
    });

    expect(config.repoOwner).toBe('octocat');
    expect(config.repoName).toBe('demo');
  });
});
