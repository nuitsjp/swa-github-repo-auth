# New-SwaResources.ps1 動作設計書

## 概要

このドキュメントは `New-SwaResources.ps1` スクリプトの動作仕様を定義します。
スクリプトは Azure Static Web App のプロビジョニングと GitHub OAuth 設定を統合的に処理します。

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
    Start(( )) --> ResolveRepo[リポジトリ情報取得<br/>パラメータ解決]
    
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
