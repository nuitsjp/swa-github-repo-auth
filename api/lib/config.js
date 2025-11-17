// 環境変数未設定時に使う GitHub API のデフォルト値。
const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = 'swa-github-repo-auth';

function sanitize(value) {
  // 値が未定義または null の場合は空文字列として扱い、前後の空白を除去
  return (value || '').trim();
}

function loadGitHubRepoConfig(env) {
  // 環境変数オブジェクトの存在を検証
  if (!env || typeof env !== 'object') {
    throw new Error('Environment bag must be provided when loading GitHub repo configuration.');
  }

  // 環境変数由来の値をトリムして読み込む。
  const repoOwner = sanitize(env.GITHUB_REPO_OWNER);
  const repoName = sanitize(env.GITHUB_REPO_NAME);
  const apiBaseUrl = sanitize(env.GITHUB_API_BASE_URL) || DEFAULT_API_BASE_URL;
  const apiVersion = sanitize(env.GITHUB_API_VERSION) || DEFAULT_API_VERSION;
  const appId = sanitize(env.GITHUB_APP_ID);
  const installationId = sanitize(env.GITHUB_APP_INSTALLATION_ID);
  const privateKey = sanitize(env.GITHUB_APP_PRIVATE_KEY);

  // タイムアウト値を整数として解析し、有効な値かチェック
  const timeoutFromEnv = parseInt(env.GITHUB_API_TIMEOUT_MS, 10);
  const requestTimeoutMs = Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0
    ? timeoutFromEnv
    : DEFAULT_TIMEOUT_MS;

  const userAgent = sanitize(env.GITHUB_API_USER_AGENT) || DEFAULT_USER_AGENT;

  // 必須フィールドの欠落をチェック
  const missing = [];
  if (!repoOwner) missing.push('GITHUB_REPO_OWNER');
  if (!repoName) missing.push('GITHUB_REPO_NAME');
  if (!appId) missing.push('GITHUB_APP_ID');
  if (!installationId) missing.push('GITHUB_APP_INSTALLATION_ID');
  if (!privateKey) missing.push('GITHUB_APP_PRIVATE_KEY');

  // 設定オブジェクトを返す（欠落フィールドリストを含む）
  return {
    repoOwner,
    repoName,
    apiBaseUrl,
    apiVersion,
    requestTimeoutMs,
    userAgent,
    appId,
    installationId,
    privateKey,
    missing
  };
}

function ensureGitHubRepoConfig(env) {
  // 設定を読み込み
  const config = loadGitHubRepoConfig(env);

  // 必須フィールドが欠落している場合はエラーを投げる
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
