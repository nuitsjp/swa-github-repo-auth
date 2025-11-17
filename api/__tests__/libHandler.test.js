const {
  createDefaultHandler,
  createLogger,
  createAuthorizeRepositoryAccessHandler
} = require('@swa-github-repo-auth/swa-github-auth');

describe('library handler utilities', () => {
  test('createLogger normalizes function logger', () => {
    const logFn = jest.fn();
    const logger = createLogger(logFn);

    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(logFn).toHaveBeenCalledTimes(3);
  });

  test('createDefaultHandler authorizes when repo config and http client succeed', async () => {
    const httpClient = { get: jest.fn().mockResolvedValue({ status: 200 }) };
    const handler = createDefaultHandler({
      env: {
        GITHUB_REPO_OWNER: 'octocat',
        GITHUB_REPO_NAME: 'demo'
      },
      httpClient
    });

    const context = { log: jest.fn() };
    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token',
          userDetails: 'tester'
        }
      }
    });

    expect(context.res.body.roles).toEqual(['authorized']);
  });

  test('createAuthorizeRepositoryAccessHandler denies when authorizer returns false', async () => {
    const authorizer = { authorize: jest.fn().mockResolvedValue(false) };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });
    const context = { log: jest.fn() };

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token',
          userDetails: 'tester'
        }
      }
    });

    expect(context.res.body.roles).toEqual([]);
    expect(authorizer.authorize).toHaveBeenCalledWith('token', expect.any(Object));
  });
});
