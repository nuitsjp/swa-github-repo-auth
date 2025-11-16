process.env.GITHUB_REPO_OWNER = 'octocat';
process.env.GITHUB_REPO_NAME = 'demo';

const {
  createAuthorizeRepositoryAccessHandler,
  createLogger
} = require('../AuthorizeRepositoryAccess/index');

afterAll(() => {
  delete process.env.GITHUB_REPO_OWNER;
  delete process.env.GITHUB_REPO_NAME;
});

function createTestLogger() {
  const logs = [];
  const logFn = (...args) => logs.push({ level: 'info', message: args.join(' ') });
  logFn.warn = (...args) => logs.push({ level: 'warn', message: args.join(' ') });
  logFn.error = (...args) => logs.push({ level: 'error', message: args.join(' ') });
  return { logFn, logs };
}

function buildContext() {
  const { logFn, logs } = createTestLogger();
  return {
    log: logFn,
    logs,
    res: undefined
  };
}

describe('createAuthorizeRepositoryAccessHandler', () => {
  it('throws when authorizer missing authorize function', () => {
    expect(() =>
      createAuthorizeRepositoryAccessHandler({ authorizer: {} })
    ).toThrow('An authorizer with an authorize method must be provided.');
  });

  it('returns anonymous roles for non-GitHub principals', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn() };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, { body: { clientPrincipal: { identityProvider: 'aad' } } });

    expect(context.res.body.roles).toEqual([]);
    expect(authorizer.authorize).not.toHaveBeenCalled();
  });

  it('denies access when GitHub token missing', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn() };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: { clientPrincipal: { identityProvider: 'github' } }
    });

    expect(context.res.body.roles).toEqual([]);
    expect(authorizer.authorize).not.toHaveBeenCalled();
    expect(context.logs.find((log) => log.level === 'warn')).toBeTruthy();
  });

  it('assigns authorized role when authorizer grants access', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn().mockResolvedValue(true) };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token',
          userDetails: 'octocat'
        }
      }
    });

    expect(context.res.body.roles).toEqual(['authorized']);
    expect(authorizer.authorize).toHaveBeenCalledWith('token', expect.any(Object));
  });

  it('logs user id when details absent', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn().mockResolvedValue(true) };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token',
          userId: 'id-only'
        }
      }
    });

    const infoLog = context.logs.find((log) => log.message.includes('id-only'));
    expect(infoLog).toBeTruthy();
  });

  it('falls back to unknown when id and details missing', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn().mockResolvedValue(true) };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token'
        }
      }
    });

    const infoLog = context.logs.find((log) => log.message.includes('unknown'));
    expect(infoLog).toBeTruthy();
  });

  it('returns anonymous role when authorizer denies access', async () => {
    const context = buildContext();
    const authorizer = { authorize: jest.fn().mockResolvedValue(false) };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token',
          userDetails: 'octocat'
        }
      }
    });

    expect(context.res.body.roles).toEqual([]);
  });

  it('safely handles unexpected errors', async () => {
    const context = buildContext();
    const authorizer = {
      authorize: jest.fn().mockRejectedValue(new Error('boom'))
    };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token'
        }
      }
    });

    expect(context.res.body.roles).toEqual([]);
    expect(context.logs.find((log) => log.level === 'error')).toBeTruthy();
  });

  it('logs raw error when message missing', async () => {
    const context = buildContext();
    const authorizer = {
      authorize: jest.fn().mockRejectedValue({})
    };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, {
      body: {
        clientPrincipal: {
          identityProvider: 'github',
          accessToken: 'token'
        }
      }
    });

    const errorLog = context.logs.find((log) =>
      log.level === 'error' && log.message.includes('Unhandled authorization error:')
    );
    expect(errorLog).toBeTruthy();
  });
});

describe('createLogger', () => {
  it('returns console when log function missing', () => {
    expect(createLogger(undefined)).toBe(console);
  });

  it('binds warn and error to fallback when not provided', () => {
    const info = jest.fn();
    const logger = createLogger(info);

    logger.warn('warn');
    logger.error('error');
    logger.info('info');

    expect(info).toHaveBeenCalledWith('warn');
    expect(info).toHaveBeenCalledWith('error');
    expect(info).toHaveBeenCalledWith('info');
  });
});
