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
    // 値をトリムし、任意設定にはデフォルトを適用する。
    const config = loadGitHubRepoConfig({
      GITHUB_REPO_OWNER: ' owner ',
      GITHUB_REPO_NAME: ' repo ',
      GITHUB_API_BASE_URL: 'https://ghe.example.com/api/v3/',
      GITHUB_API_VERSION: '2024-01-01 ',
      GITHUB_API_TIMEOUT_MS: '7000',
      GITHUB_API_USER_AGENT: ' custom-agent ',
      GITHUB_APP_ID: ' 12345 ',
      GITHUB_APP_INSTALLATION_ID: ' 67890 ',
      GITHUB_APP_PRIVATE_KEY: ' -----BEGIN PRIVATE KEY----- ' 
    });

    expect(config).toEqual({
      repoOwner: 'owner',
      repoName: 'repo',
      apiBaseUrl: 'https://ghe.example.com/api/v3/',
      apiVersion: '2024-01-01',
      requestTimeoutMs: 7000,
      userAgent: 'custom-agent',
      appId: '12345',
      installationId: '67890',
      privateKey: '-----BEGIN PRIVATE KEY-----',
      missing: []
    });
  });

  it('falls back to defaults when optional settings absent', () => {
    // 任意の環境変数が無くても定数にフォールバック。
    const config = loadGitHubRepoConfig({
      GITHUB_REPO_OWNER: 'octocat',
      GITHUB_REPO_NAME: 'demo',
      GITHUB_APP_ID: '1',
      GITHUB_APP_INSTALLATION_ID: '2',
      GITHUB_APP_PRIVATE_KEY: 'key'
    });

    expect(config).toEqual({
      repoOwner: 'octocat',
      repoName: 'demo',
      apiBaseUrl: DEFAULT_API_BASE_URL,
      apiVersion: DEFAULT_API_VERSION,
      requestTimeoutMs: DEFAULT_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
      appId: '1',
      installationId: '2',
      privateKey: 'key',
      missing: []
    });
  });

  it('tracks missing required configuration', () => {
    // 必須環境変数の欠如を missing に記録する。
    const config = loadGitHubRepoConfig({});

    expect(config.missing).toEqual([
      'GITHUB_REPO_OWNER',
      'GITHUB_REPO_NAME',
      'GITHUB_APP_ID',
      'GITHUB_APP_INSTALLATION_ID',
      'GITHUB_APP_PRIVATE_KEY'
    ]);
  });

  it('throws when ensuring config without required values', () => {
    // ensureGitHubRepoConfig は必須値が無いと例外を投げる。
    expect(() => ensureGitHubRepoConfig({})).toThrow(
      'Missing required GitHub repository configuration: GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY'
    );
  });

  it('throws when environment bag is not an object', () => {
    // env がオブジェクトでない場合の健全性チェック。
    expect(() => loadGitHubRepoConfig(null)).toThrow(
      'Environment bag must be provided when loading GitHub repo configuration.'
    );
  });

  it('ensures config when required values exist', () => {
    // 必須値が揃えば正しくパースされた config を返す。
    const config = ensureGitHubRepoConfig({
      GITHUB_REPO_OWNER: 'octocat',
      GITHUB_REPO_NAME: 'demo',
      GITHUB_APP_ID: '1',
      GITHUB_APP_INSTALLATION_ID: '2',
      GITHUB_APP_PRIVATE_KEY: 'key'
    });

    expect(config.repoOwner).toBe('octocat');
    expect(config.repoName).toBe('demo');
  });
});
