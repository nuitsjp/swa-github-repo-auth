# TODO (デプロイ運用メモ)

前提: SWAリソースは1つのみ。mainブランチは本番デプロイ、main以外はプレビュー/評価環境（SWAのプレビューURL）へ自動デプロイする。

## 今後の対応タスク
- [ ] ビルド分岐の目的整理（main=レジストリ版、非main=リポジトリ版）
  - mainでは公開済みnpmパッケージを使い本番デプロイ、非mainでは `npm pack ../packages/swa-github-auth` でローカル実装を同梱し、SWA zip時のシンボリックリンク欠落を防ぐ。
- [ ] npm公開フロー整備
  - Releaseタグ（例: `Release-1.0.0`）で `@swa-github-repo-auth/swa-github-auth` を npm publish するワークフローを追加。
  - mainブランチのデプロイは公開済みパッケージを前提にするため、publishが完了している状態を保証する。
- [ ] deploy-azure-static-web-apps.yml の動作確認
  - main: `npm install --omit=dev --no-package-lock` → レジストリ版パッケージを再インストールする分岐を使用。公開前は失敗するので、公開または一時的にローカルpack方式にフォールバックする判断をする。
  - main以外: リポジトリ内の `packages/swa-github-auth` を `npm pack` してインストールする分岐で、プレビュー環境へデプロイできることを確認。
  - 直近の失敗はシンボリックリンク欠落が原因だったので、pack後に `npm install ./<pack>.tgz --no-save` の手順を維持する。
- [ ] package-lockの扱い
  - `api/package-lock.json` は削除せず、公開版依存に切り替えるタイミングで再生成・コミットする運用を検討。
  - main以外のpacker分岐でも lock が過度に変わらないことを確認。
- [ ] 動作確認スクリプト
  - ローカル: `npm ci && npm test --workspace api` でテストパスを確認。
  - デプロイ確認: Pull RequestでプレビューURLにアクセスしAPI/サイトが動作することを確認。mainマージ後は本番URLを確認。
- [ ] ドキュメント更新
  - READMEに「main=本番、その他=プレビュー (SWA プレビュー環境)」のデプロイフローとnpm publish前提を追記。
  - Releaseタグでpublishする運用手順を開発者向けに記載。

## 既知の注意点
- レジストリ未公開の状態でmainデプロイを走らせると npm 404 で失敗する。公開までは main もローカルpack方式に一時フォールバックするか、デプロイをスキップする条件を入れる。
- SWAリソースが1つのため、固定URLの開発環境が必要なら別SWAを追加するしかない。現状はプレビューURLを「評価環境」として使う。 
