// API 配下のユニットテスト設定。lib と Functions 本体のカバレッジを検査する。
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  collectCoverageFrom: [
    'AuthorizeRepositoryAccess/**/*.js',
    'lib/**/*.js'
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
