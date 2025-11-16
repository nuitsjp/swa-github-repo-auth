// API ディレクトリ用の ESLint 設定。テストやビルド成果物は除外する。
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  ignorePatterns: ['node_modules/', 'coverage/', 'dist/'],
  overrides: [
    {
      files: ['__tests__/**/*.js'],
      env: {
        jest: true
      }
    }
  ],
  rules: {
    'no-console': 'off'
  }
};
