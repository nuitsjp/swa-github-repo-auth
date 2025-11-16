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
    // ガードレール: authorizer は authorize を必ず持つ。
    expect(() =>
      createAuthorizeRepositoryAccessHandler({ authorizer: {} })
    ).toThrow('An authorizer with an authorize method must be provided.');
  });

  it('returns anonymous roles for non-GitHub principals', async () => {
    // GitHub 以外は authorizer を呼ばず匿名扱い。
    const context = buildContext();
    const authorizer = { authorize: jest.fn() };
    const handler = createAuthorizeRepositoryAccessHandler({ authorizer });

    await handler(context, { body: { clientPrincipal: { identityProvider: 'aad' } } });

    expect(context.res.body.roles).toEqual([]);
    expect(authorizer.authorize).not.toHaveBeenCalled();
  });

  it('denies access when GitHub token missing', async () => {
    // トークン欠如は匿名扱い。
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
    // 正常系: authorizer が true を返せば authorized 付与。
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
    // userDetails 不在なら userId をログに使う。
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
    // 識別子が無ければ unknown をログする。
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
    // authorizer が拒否したら匿名ロール。
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
    // authorizer からの例外も捕捉しロギング。
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
    // message が無くても生のオブジェクトを記録。
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
    // ロガー未指定なら console にフォールバック。
    expect(createLogger(undefined)).toBe(console);
  });

  it('binds warn and error to fallback when not provided', () => {
    // warn/error を持たない関数ロガーは info を使う。
    const info = jest.fn();
    const logger = createLogger(info);

    logger.warn('warn');
    logger.error('error');
    logger.info('info');

    expect(info).toHaveBeenCalledWith('warn');
    expect(info).toHaveBeenCalledWith('error');
    expect(info).toHaveBeenCalledWith('info');
  });

  it('uses provided warn/error when log is function with handlers', () => {
    // warn/error がある関数ロガーはそれを優先。
    const info = jest.fn();
    const warn = jest.fn();
    const error = jest.fn();

    function logFn(...args) {
      return info(...args);
    }

    logFn.info = info;
    logFn.warn = warn;
    logFn.error = error;

    const logger = createLogger(logFn);

    logger.warn('warn');
    logger.error('error');
    logger.info('info');

    expect(warn).toHaveBeenCalledWith('warn');
    expect(error).toHaveBeenCalledWith('error');
    expect(info).toHaveBeenCalledWith('info');
  });

  it('handles plain logger objects without warn/error', () => {
    // warn/error を欠くオブジェクトロガーは info を転用。
    const logger = createLogger({ info: jest.fn() });

    logger.warn('warn');
    logger.error('error');

    expect(logger.info).toHaveBeenCalledWith('warn');
    expect(logger.info).toHaveBeenCalledWith('error');
  });

  it('returns no-op functions when logger shape is unsupported', () => {
    // 形の合わないロガーは no-op を返す。
    const logger = createLogger({});

    expect(() => logger.info('noop')).not.toThrow();
    expect(() => logger.warn('noop')).not.toThrow();
  });

  it('uses warn/error when logger object provides them without info', () => {
    // warn/error のみ持つロガーもそのまま利用。
    const warn = jest.fn();
    const error = jest.fn();
    const logger = createLogger({ warn, error });

    logger.warn('warn');
    logger.error('error');
    logger.info('info');

    expect(warn).toHaveBeenCalledWith('warn');
    expect(error).toHaveBeenCalledWith('error');
  });
});
