'use strict';

const { extractGitHubPrincipal } = require('./githubPrincipal');

function createLogger(log) {
  if (!log) {
    return console;
  }

  if (typeof log === 'function') {
    const info = log.info && typeof log.info === 'function' ? log.info : log;
    return {
      info,
      warn: log.warn && typeof log.warn === 'function' ? log.warn : info,
      error: log.error && typeof log.error === 'function' ? log.error : info
    };
  }

  const info = typeof log.info === 'function' ? log.info : () => {};
  const warn = typeof log.warn === 'function' ? log.warn : info;
  const error = typeof log.error === 'function' ? log.error : info;

  return { info, warn, error };
}

function createAuthorizeRepositoryAccessHandler(options = {}) {
  const {
    authorizer,
    principalExtractor = extractGitHubPrincipal
  } = options;

  if (!authorizer || typeof authorizer.authorize !== 'function') {
    throw new Error('An authorizer with an authorize method must be provided.');
  }

  return async function authorizeRepositoryAccess(context, req) {
    const logger = createLogger(context && context.log);

    try {
      const principal = principalExtractor(req);

      if (!principal || principal.identityProvider !== 'github') {
        logger.info('Non-GitHub identity detected, assigning anonymous role.');
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { roles: [] }
        };
        return;
      }

      if (!principal.accessToken) {
        logger.warn('GitHub principal missing access token, denying access.');
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { roles: [] }
        };
        return;
      }

      const authorized = await authorizer.authorize(principal.accessToken, logger);
      const userLabel = principal.userDetails || principal.userId || 'unknown';

      if (authorized) {
        logger.info(`User ${userLabel}: access granted`);
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { roles: ['authorized'] }
        };
      } else {
        logger.info(`User ${userLabel}: access denied`);
        context.res = {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: { roles: [] }
        };
      }
    } catch (error) {
      logger.error('Unhandled authorization error:', error?.message || error);
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { roles: [] }
      };
    }
  };
}

module.exports = {
  createAuthorizeRepositoryAccessHandler,
  createLogger
};
