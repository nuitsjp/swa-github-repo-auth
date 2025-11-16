const {
  createRepositoryAuthorizer
} = require('@swa-github-repo-auth/swa-github-auth/lib/repositoryAuthorizer');
const {
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
} = require('@swa-github-repo-auth/swa-github-auth/lib/config');

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
    // GitHub への GET が成功したら true を返す。
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
    // リポジトリ設定欠如は警告を出して false。
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
    // 任意の GitHub API 設定を上書きできる。
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
    // 404 応答なら警告して false。
    const error = new Error('not found');
    error.response = { status: 404 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (404).');
  });

  it('returns false and logs warning on 401 response', async () => {
    // 401 応答なら警告して false。
    const error = new Error('unauthorized');
    error.response = { status: 401 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (401).');
  });

  it('returns false and logs warning on 403 response', async () => {
    // 403 応答なら警告して false。
    const error = new Error('forbidden');
    error.response = { status: 403 };
    httpClient.get.mockRejectedValue(error);
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Repository access denied (403).');
  });

  it('returns false and logs error for unexpected failures', async () => {
    // 想定外エラーは error ログで false。
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
    // message 無しのエラーでも生オブジェクトをログ。
    httpClient.get.mockRejectedValue({ response: {} });
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('token', logger);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'GitHub API error while authorizing repository access:',
      expect.objectContaining({ response: {} })
    );
  });

  it('falls back to info when warn logger is missing', async () => {
    // warn が無ければ info にフォールバック。
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });
    const fallbackLogger = { info: jest.fn() };

    await authorizer.authorize('', fallbackLogger);

    expect(fallbackLogger.info).toHaveBeenCalledWith(
      'No access token supplied to repository authorizer.'
    );
  });

  it('logs unexpected errors through info fallback when error missing', async () => {
    // error が無くても info で例外を記録。
    httpClient.get.mockRejectedValue(new Error('down'));
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });
    const fallbackLogger = { info: jest.fn() };

    const result = await authorizer.authorize('token', fallbackLogger);

    expect(result).toBe(false);
    expect(fallbackLogger.info).toHaveBeenCalledWith(
      'GitHub API error while authorizing repository access:',
      'down'
    );
  });

  it('uses no-op logger when logger is not supplied', async () => {
    // ロガー未指定でも無害に動作。
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('');

    expect(result).toBe(false);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('returns false and logs warning when access token missing', async () => {
    // アクセストークン欠如は警告して false。
    const authorizer = createRepositoryAuthorizer({ repoOwner, repoName, httpClient });

    const result = await authorizer.authorize('', logger);

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('No access token supplied to repository authorizer.');
    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
