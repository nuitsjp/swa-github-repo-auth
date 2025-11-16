const {
  createRepositoryAuthorizer
} = require('../lib/repositoryAuthorizer');
const {
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('../lib/config');

describe('createRepositoryAuthorizer', () => {
  const repoOwner = 'octocat';
  const repoName = 'demo';
  let httpClient;
  let logger;

  beforeEach(() => {
    httpClient = { get: jest.fn() };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });

  it('returns true when GitHub API resolves', async () => {
    httpClient.get.mockResolvedValue({ status: 200 });
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(true);
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/demo',
      {
        timeout: DEFAULT_TIMEOUT_MS,
        headers: {
          Authorization: 'Bearer token',
          Accept: 'application/vnd.github+json',
          'User-Agent': DEFAULT_USER_AGENT,
          'X-GitHub-Api-Version': DEFAULT_API_VERSION
        }
      }
    );
  });

  it('returns false and logs warning when repository config is missing', async () => {
    const authorizer = createRepositoryAuthorizer({
      repoOwner: '',
      repoName: null,
      httpClient
    });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository identification is not configured.');
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('supports overriding GitHub API base URL, timeout, version and User-Agent', async () => {
    httpClient.get.mockResolvedValue({ status: 200 });
    const authorizer = createRepositoryAuthorizer({
      repoOwner,
      repoName,
      httpClient,
      apiBaseUrl: 'https://ghe.example.com/api/v3/',
      requestTimeoutMs: 1234,
      apiVersion: '2023-10-01',
      userAgent: 'custom-agent'
    });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(true);
    expect(httpClient.get).toHaveBeenCalledWith(
      'https://ghe.example.com/api/v3/repos/octocat/demo',
      expect.objectContaining({
        timeout: 1234,
        headers: expect.objectContaining({
          'X-GitHub-Api-Version': '2023-10-01',
          'User-Agent': 'custom-agent'
        })
      })
    );
  });

  it('returns false and logs warning on 404 response', async () => {
    const error = new Error('not found');
    error.response = { status: 404 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (404).');
  });

  it('returns false and logs warning on 401 response', async () => {
    const error = new Error('unauthorized');
    error.response = { status: 401 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (401).');
  });

  it('returns false and logs warning on 403 response', async () => {
    const error = new Error('forbidden');
    error.response = { status: 403 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (403).');
  });

  it('returns false and logs error for unexpected failures', async () => {
    httpClient.get.mockRejectedValue(new Error('network down'));
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'GitHub API error while authorizing repository access:',
      'network down'
    );
  });

  it('falls back to raw error when message missing', async () => {
    httpClient.get.mockRejectedValue({ response: {} });
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'GitHub API error while authorizing repository access:',
      expect.objectContaining({ response: {} })
    );
  });

  it('returns false and logs warning when access token missing', async () => {
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('No access token supplied to repository authorizer.');
    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
