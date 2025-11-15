# REVIEW

## scripts/New-SwaResources.ps1

1. **アプリ設定が一切書き込まれない (Blocker)**  
   `az staticwebapp appsettings set` へ渡すべき配列が `@settingNames` という文字列のまま引数に流れており、実際のキー=値が CLI に届きません (`scripts/New-SwaResources.ps1:368-382`)。このままでは GITHUB_* 系のアプリ設定が永遠に更新されず、後続フロー全体が失敗します。`--setting-names @settingNames` ではなく、PowerShell で配列を展開する (`--setting-names $settingNames`) か、各エントリを明示的に渡す処理に修正してください。
2. **選択したサブスクリプションを `az account set` していない (High)**  
   設計では `az account set --subscription <ID>` しておくことが必須と書かれていますが (`DESIGN.md:69-72`)、実装では `Resolve-SubscriptionContext` が ID を返すだけで、CLI の既定サブスクリプションを切り替えていません (`scripts/New-SwaResources.ps1:180-213`)。そのためユーザーが本スクリプト後に手動で `az staticwebapp show` などを叩くと、旧サブスクリプションに紐づくリソースを誤って操作する危険があります。選択完了時点で `az account set -s $selectedSubscription.id` を実行し、設計と挙動を一致させてください。
3. **Static Web App 削除時の確認が甘く誤操作で即削除される (High)**  
   `Confirm-StaticWebAppReuse` は Y/y 以外の入力をすべて「再作成 = 既存削除」扱いにしており、未入力やタイプミスでも強制的に `Remove-StaticWebAppWithConfirmation` が走ります (`scripts/New-SwaResources.ps1:252-503`)。Azure リソースを消す操作としては危険すぎるため、Y/N 以外は再度プロンプトを出す、あるいは明示的に `N` と入力した場合のみ削除フローへ進むようガードを追加してください。
4. **`gh secret set` の失敗を検出せずに成功扱いしてしまう (Medium)**  
   `Set-GitHubSecret` では `gh secret set` 実行後に `$LASTEXITCODE` を確認せず関数を抜けるため、権限不足やネットワーク障害でも静かに成功ログを出してしまいます (`scripts/New-SwaResources.ps1:285-297`)。`gh secret set` の戻り値をチェックし、失敗時には例外を投げて利用者に再実行や PAT の確認を促してください。

## DESIGN.md

1. **GitHub リポジトリ検出に必要な前提条件が書かれていない**  
   スクリプトは `git remote get-url origin` でリポジトリを特定するため、`origin` が存在しない裸リポジトリやダウンロード直後の ZIP では即座に失敗します (`scripts/New-SwaResources.ps1:120-145`)。しかし設計の前提条件 (DESIGN.md:8-13) には Git/GitHub リポジトリに関する記載がなく、利用者が原因を特定できません。`git` がインストールされていること、`origin` が GitHub を向いていることを明記してください。
2. **既存 SWA を再利用する際の GitHub シークレット更新可否が仕様化されていない**  
   フローチャートでは `PromptReuse` から `ShowOAuth` へ直接進むだけで、再利用ケースでデプロイ トークンや GitHub シークレットをどう扱うかが不明です (`DESIGN.md:43-56`)。実装もトークン再発行を行わないため、再実行しても GitHub シークレットが最新化されないという問い合わせが起きそうです。再利用時に「既存トークンを再取得してシークレットを更新する/しない」のどちらを公式仕様とするのかを明示し、必要なら追加の分岐をフローチャートに反映してください。
