// API 配下のユニットテスト設定。lib と Functions 本体のカバレッジを検査する。
const path = require('path');

module.exports = {
  // ルートをリポジトリ基準にして、api 配下以外のパッケージも計測できるようにする。
  rootDir: path.join(__dirname, '..'),
  testEnvironment: 'node',
  roots: ['<rootDir>/api', '<rootDir>/packages/swa-github-auth'],
  coverageProvider: 'v8',
  moduleNameMapper: {
    '^@swa-github-repo-auth/swa-github-auth/(.*)$': '<rootDir>/packages/swa-github-auth/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/api/jest.setup.js'],
  forceCoverageMatch: [
    '<rootDir>/api/AuthorizeRepositoryAccess/**/*.js',
    '<rootDir>/packages/swa-github-auth/lib/**/*.js'
  ],
  // node_modules 配下の自パッケージをカバレッジ対象にするため、デフォルトの node_modules 除外を解除する。
  coveragePathIgnorePatterns: ['/__tests__/'],
  collectCoverageFrom: [
    'api/AuthorizeRepositoryAccess/**/*.js',
    'packages/swa-github-auth/lib/**/*.js'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
