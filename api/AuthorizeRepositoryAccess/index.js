const {
  createDefaultHandler,
  createAuthorizeRepositoryAccessHandler,
  createLogger
} = require('@swa-github-repo-auth/swa-github-auth');

const handler = createDefaultHandler();

module.exports = handler;
module.exports.createAuthorizeRepositoryAccessHandler = createAuthorizeRepositoryAccessHandler;
module.exports.createLogger = createLogger;
