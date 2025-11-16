// API 配下のユニットテスト設定。lib と Functions 本体のカバレッジを検査する。
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: {
    '^@swa-github-repo-auth/swa-github-auth/(.*)$': '<rootDir>/../packages/swa-github-auth/$1'
  },
  collectCoverageFrom: [
    'AuthorizeRepositoryAccess/**/*.js',
    '../packages/swa-github-auth/lib/**/*.js'
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
