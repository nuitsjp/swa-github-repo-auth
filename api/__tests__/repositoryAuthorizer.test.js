const mockSign = jest.fn().mockReturnValue('signature');
const mockUpdate = jest.fn();
const mockCreateSign = jest.fn(() => ({
  update: mockUpdate,
  sign: mockSign
}));

jest.mock('crypto', () => ({
  createSign: mockCreateSign
}));

const {
  createRepositoryAuthorizer
} = require('../lib/repositoryAuthorizer');
const {
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('../lib/config');

describe('createRepositoryAuthorizer', () => {
  const baseConfig = {
    repoOwner: 'octocat',
    repoName: 'demo',
    appId: '1',
    installationId: '2',
    privateKey: '-----BEGIN PRIVATE KEY-----',
    httpClient: null
  };

  let httpClient;
  let logger;

  beforeEach(() => {
    httpClient = {
      get: jest.fn(),
      post: jest.fn()
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    baseConfig.httpClient = httpClient;
    mockSign.mockClear();
    mockUpdate.mockClear();
    mockCreateSign.mockClear();
  });

  function buildTokenResponse() {
    return {
      data: {
        token: 'installation-token',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      }
    };
  }

  it('returns true when collaborator permission is not none', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'write' } });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(true);
    expect(httpClient.post).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/2/access_tokens',
      {},
      expect.objectContaining({
        timeout: DEFAULT_TIMEOUT_MS,
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer\s.+/),
          'User-Agent': DEFAULT_USER_AGENT,
          'X-GitHub-Api-Version': DEFAULT_API_VERSION
        })
      })
    );
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/demo/collaborators/octocat/permission',
      expect.objectContaining({
        timeout: DEFAULT_TIMEOUT_MS,
        headers: expect.objectContaining({
          Authorization: 'Bearer installation-token'
        })
      })
    );
  });

  it('caches installation token until expiry buffer is reached', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'read' } });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const first = await authorizer.authorize('octocat', logger);
    const second = await authorizer.authorize('octocat', logger);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('returns false and warns when permission is none', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'none' } });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied for octocat: no permission.');
  });

  it('supports authorizing without providing a logger', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'read' } });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    await expect(authorizer.authorize('octocat')).resolves.toBe(true);
  });

  it('warns when GitHub username is missing', async () => {
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('No GitHub username supplied to repository authorizer.');
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('warns when repository identification is not configured', async () => {
    const authorizer = createRepositoryAuthorizer({
      ...baseConfig,
      repoOwner: '',
      repoName: ''
    });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository identification is not configured.');
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('warns when GitHub App credentials are missing', async () => {
    const authorizer = createRepositoryAuthorizer({
      repoOwner: 'octocat',
      repoName: 'demo',
      httpClient
    });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('GitHub App credentials are not configured.');
    expect(logger.warn).toHaveBeenCalledWith('Unable to acquire installation token.');
  });

  it('returns false and warns on 404 collaborator response', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    const error = new Error('not found');
    error.response = { status: 404 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied for octocat: not found (404).');
  });

  it('logs error for unexpected collaborator failures', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockRejectedValue(new Error('boom'));
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'GitHub API error while authorizing repository access:',
      'boom'
    );
  });

  it('logs token creation failures and returns false', async () => {
    httpClient.post.mockRejectedValue(new Error('token failure'));
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to create GitHub App installation token:',
      'token failure'
    );
    expect(logger.warn).toHaveBeenCalledWith('Unable to acquire installation token.');
  });

  it('warns when installation token response lacks token or expiry', async () => {
    httpClient.post.mockResolvedValue({ data: {} });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Failed to obtain installation access token.');
    expect(logger.warn).toHaveBeenCalledWith('Unable to acquire installation token.');
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('logs token endpoint status code when available', async () => {
    const error = new Error('token failure');
    error.response = { status: 500 };
    httpClient.post.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });

    const result = await authorizer.authorize('octocat', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'GitHub App token endpoint responded with status 500.'
    );
  });

  it('falls back to info logger when warn is missing', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'read' } });
    const authorizer = createRepositoryAuthorizer({ ...baseConfig });
    const fallbackLogger = { info: jest.fn() };

    await authorizer.authorize('', fallbackLogger);

    expect(fallbackLogger.info).toHaveBeenCalledWith('No GitHub username supplied to repository authorizer.');
  });

  it('normalizes private key escape sequences before signing', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'read' } });
    const authorizer = createRepositoryAuthorizer({
      ...baseConfig,
      privateKey: 'line1\\nline2'
    });

    await authorizer.authorize('octocat', logger);

    expect(mockSign).toHaveBeenCalledWith('line1\nline2', 'base64url');
  });

  it('honors custom API base URL and timeout configuration', async () => {
    httpClient.post.mockResolvedValue(buildTokenResponse());
    httpClient.get.mockResolvedValue({ data: { permission: 'read' } });
    const authorizer = createRepositoryAuthorizer({
      ...baseConfig,
      apiBaseUrl: 'https://ghe.example.com/api/v3/',
      requestTimeoutMs: 1234,
      apiVersion: '2023-10-01',
      userAgent: 'custom-agent'
    });

    await authorizer.authorize('octocat', logger);

    expect(httpClient.post).toHaveBeenCalledWith(
      'https://ghe.example.com/api/v3/app/installations/2/access_tokens',
      {},
      expect.objectContaining({
        timeout: 1234,
        headers: expect.objectContaining({
          'User-Agent': 'custom-agent',
          'X-GitHub-Api-Version': '2023-10-01'
        })
      })
    );
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://ghe.example.com/api/v3/repos/octocat/demo/collaborators/octocat/permission',
      expect.objectContaining({ timeout: 1234 })
    );
  });
});
