// GitHub API のデフォルト設定値
const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = 'swa-github-repo-auth';

/**
 * 文字列値をサニタイズします。
 * 文字列の場合はトリムし、それ以外は空文字列を返します。
 */
function sanitizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 正の整数値をパースします。
 * 有効な正の整数でない場合はフォールバック値を返します。
 */
function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 環境変数から GitHub リポジトリの設定を読み込みます。
 * 必須項目が不足している場合は missing 配列にキー名を格納します。
 */
function loadGitHubRepoConfig(env = process.env) {
  if (!env || typeof env !== 'object') {
    throw new Error('Environment bag must be provided when loading GitHub repo configuration.');
  }

  // 環境変数から設定値を取得し、デフォルト値で補完
  const repoOwner = sanitizeString(env.GITHUB_REPO_OWNER);
  const repoName = sanitizeString(env.GITHUB_REPO_NAME);
  const apiBaseUrl = sanitizeString(env.GITHUB_API_BASE_URL) || DEFAULT_API_BASE_URL;
  const apiVersion = sanitizeString(env.GITHUB_API_VERSION) || DEFAULT_API_VERSION;
  const requestTimeoutMs = parsePositiveInt(
    env.GITHUB_API_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const userAgent = sanitizeString(env.GITHUB_API_USER_AGENT) || DEFAULT_USER_AGENT;

  // 必須項目の検証
  const missing = [];
  if (!repoOwner) {
    missing.push('GITHUB_REPO_OWNER');
  }
  if (!repoName) {
    missing.push('GITHUB_REPO_NAME');
  }

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

/**
 * GitHub リポジトリの設定を読み込み、必須項目の存在を保証します。
 * 必須項目が不足している場合はエラーをスローします。
 */
function ensureGitHubRepoConfig(env = process.env) {
  const config = loadGitHubRepoConfig(env);

  if (config.missing.length > 0) {
    throw new Error(
      `Missing required GitHub repository configuration: ${config.missing.join(', ')}`
    );
  }

  return config;
}

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  loadGitHubRepoConfig,
  ensureGitHubRepoConfig
};
