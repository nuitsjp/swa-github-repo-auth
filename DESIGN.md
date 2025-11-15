# New-SwaResources.ps1 動作設計書

## 概要

このドキュメントは `New-SwaResources.ps1` スクリプトの動作仕様を定義します。
スクリプトは Azure Static Web App のプロビジョニングと GitHub OAuth 設定を統合的に処理します。

## 前提条件

- Azure CLI / GitHub CLI がインストール済みで、`az login` / `gh auth login` が完了していること
- 実行開始時に `az account show` で現在のサブスクリプションを取得し、必要なら `az account list` の候補から番号入力で再選択する
- 選択したサブスクリプション ID を `az ... --subscription <id>` で明示指定し、誤ったテナントにリソースを作成しない

### 用語

- SWA = Static Web App

## 入力パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `ResourceGroupName` | string | No | `rg-<repo>-prod` | リソースグループ名 |
| `Name` | string | No | `stapp-<repo>-prod` | Static Web App 名 |
| `ResourceGroupLocation` | string | Yes | `japaneast` | リソースグループのリージョン |
| `Sku` | string | No | `Standard` | Static Web App の SKU (Free/Standard/Dedicated) |
| `ClientId` | string | No | - | GitHub OAuth App Client ID |
| `ClientSecret` | string | No | - | GitHub OAuth App Client Secret |

## 処理フロー

```mermaid
flowchart TD
    Start(( )) --> SelectSub[サブスクリプション選択]
    SelectSub --> ResolveRepo[リポジトリ情報取得<br/>パラメータ解決]
    
    ResolveRepo --> CheckSWA[SWAグローバル検索<br/>az staticwebapp list]
    CheckSWA --> ParseSWA[SWA所属Resource Group特定]
    
    ParseSWA --> GuardSWA{既存SWA}
    
    GuardSWA -->|存在しない| CheckRG{Resource Group}
    
    GuardSWA -->|存在する| PromptReuse{再利用}
    
    PromptReuse -->|しない| DeleteSWA[既存SWA削除]
    DeleteSWA --> CheckRG
    
    PromptReuse -->|する| ShowOAuth[OAuth手順表示]
    
    CheckRG -->|存在しない| CreateRG[Resource Group作成]
    CheckRG -->|存在する| CreateSWA[SWA作成]
    CreateRG --> CreateSWA
    
    CreateSWA --> GetToken[デプロイトークン取得]
    GetToken --> SetGHSecret[GitHub Secret設定]
    SetGHSecret --> ShowOAuth
    
    ShowOAuth --> CheckCred{ClientId/Secret}
    
    CheckCred -->|未指定| PromptCred[ClientId/Secret入力]
    CheckCred -->|指定済| SetEnvVars[SWA環境変数設定]
    PromptCred --> SetEnvVars
    
    SetEnvVars --> End((( )))
```

### サブスクリプション選択の詳細

1. `az account show` で現在のサブスクリプション名/IDを取得し、使用可否を Y/N で確認する。
2. 切り替えを希望された場合は `az account list` の結果をすべて番号付きで表示し、無効入力や未入力の場合は有効値が得られるまで再入力を要求する。
3. 選択した ID で `az account set --subscription <ID>` を実行し、以後の `az` コマンドに必ず `--subscription <ID>` を付けて実行する。

`SetGHSecret` ステップでは GitHub CLI (`gh secret set`) を利用して `AZURE_STATIC_WEB_APPS_API_TOKEN` を対象リポジトリへ登録するため、ローカル側で `gh` のセットアップと認証が事前に済んでいることを前提とする。
