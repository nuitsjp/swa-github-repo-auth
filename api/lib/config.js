const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = 'swa-github-repo-auth';

function sanitize(value) {
  return (value || '').trim();
}

function loadGitHubRepoConfig(env) {
  if (!env || typeof env !== 'object') {
    throw new Error('Environment bag must be provided when loading GitHub repo configuration.');
  }

  const repoOwner = sanitize(env.GITHUB_REPO_OWNER);
  const repoName = sanitize(env.GITHUB_REPO_NAME);
  const apiBaseUrl = sanitize(env.GITHUB_API_BASE_URL) || DEFAULT_API_BASE_URL;
  const apiVersion = sanitize(env.GITHUB_API_VERSION) || DEFAULT_API_VERSION;
  const timeoutFromEnv = parseInt(env.GITHUB_API_TIMEOUT_MS, 10);
  const requestTimeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? timeoutFromEnv
    : DEFAULT_TIMEOUT_MS;
  const userAgent = sanitize(env.GITHUB_API_USER_AGENT) || DEFAULT_USER_AGENT;

  const missing = [];
  if (!repoOwner) missing.push('GITHUB_REPO_OWNER');
  if (!repoName) missing.push('GITHUB_REPO_NAME');

  return {
    repoOwner,
    repoName,
    apiBaseUrl,
    apiVersion,
    requestTimeoutMs,
    userAgent,
    missing
  };
}

function ensureGitHubRepoConfig(env) {
  const config = loadGitHubRepoConfig(env);

  if (config.missing.length > 0) {
    throw new Error(`Missing required GitHub repository configuration: ${config.missing.join(', ')}`);
  }

  return config;
}

module.exports = {
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig,
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT
};
