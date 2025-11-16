const axios = require('axios');
const { createRepositoryAuthorizer } = require('../lib/repositoryAuthorizer');
const { extractGitHubPrincipal } = require('../lib/githubPrincipal');
const { ensureGitHubRepoConfig } = require('../lib/config');

function createLogger(logFn) {
  if (!logFn) {
    return console;
  }

  const warn = typeof logFn.warn === 'function' ? logFn.warn.bind(logFn) : logFn;
  const error = typeof logFn.error === 'function' ? logFn.error.bind(logFn) : logFn;

  return {
    info: (...args) => logFn(...args),
    warn: (...args) => warn(...args),
    error: (...args) => error(...args)
  };
}

function buildResponse(roles) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: { roles }
  };
}

function createAuthorizeRepositoryAccessHandler({
  authorizer,
  principalExtractor = extractGitHubPrincipal
}) {
  if (!authorizer || typeof authorizer.authorize !== 'function') {
    throw new Error('An authorizer with an authorize method must be provided.');
  }

  return async function authorizeRepositoryAccess(context, req) {
    const logger = createLogger(context.log);

    try {
      const principal = principalExtractor(req);

      if (!principal) {
        logger.info('Non-GitHub identity detected, assigning anonymous role.');
        context.res = buildResponse([]);
        return;
      }

      if (!principal.accessToken) {
        logger.warn('GitHub principal missing access token, denying access.');
        context.res = buildResponse([]);
        return;
      }

      const hasAccess = await authorizer.authorize(principal.accessToken, logger);
      const roles = hasAccess ? ['authorized'] : [];

      logger.info(
        `User ${principal.userDetails || principal.userId || 'unknown'}: access ${
          hasAccess ? 'granted' : 'denied'
        }`
      );

      context.res = buildResponse(roles);
    } catch (error) {
      logger.error('Unhandled authorization error:', error?.message || error);
      context.res = buildResponse([]);
    }
  };
}

const repoConfig = ensureGitHubRepoConfig(process.env);
const repositoryAuthorizer = createRepositoryAuthorizer({
  repoOwner: repoConfig.repoOwner,
  repoName: repoConfig.repoName,
  httpClient: axios,
  apiBaseUrl: repoConfig.apiBaseUrl,
  apiVersion: repoConfig.apiVersion,
  requestTimeoutMs: repoConfig.requestTimeoutMs,
  userAgent: repoConfig.userAgent
});

module.exports = createAuthorizeRepositoryAccessHandler({
  authorizer: repositoryAuthorizer
});
module.exports.createAuthorizeRepositoryAccessHandler =
  createAuthorizeRepositoryAccessHandler;
module.exports.createLogger = createLogger;
module.exports.buildResponse = buildResponse;
