'use strict';

const axios = require('axios');
const {
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig
} = require('./config');
const { extractGitHubPrincipal } = require('./githubPrincipal');
const { createRepositoryAuthorizer } = require('./repositoryAuthorizer');
const {
  createAuthorizeRepositoryAccessHandler,
  createLogger
} = require('./handler');

function createDefaultHandler(options = {}) {
  const env = options.env || process.env;
  const httpClient = options.httpClient || axios;
  const principalExtractor = options.principalExtractor || extractGitHubPrincipal;

  const config = ensureGitHubRepoConfig(env);
  const repositoryAuthorizer = createRepositoryAuthorizer({
    ...config,
    httpClient
  });

  return createAuthorizeRepositoryAccessHandler({
    authorizer: repositoryAuthorizer,
    principalExtractor
  });
}

module.exports = {
  createDefaultHandler,
  createAuthorizeRepositoryAccessHandler,
  createLogger,
  createRepositoryAuthorizer,
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig,
  extractGitHubPrincipal
};
