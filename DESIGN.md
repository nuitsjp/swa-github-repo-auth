# New-SwaResources.ps1 動作設計書

## 概要

このドキュメントは `New-SwaResources.ps1` スクリプトの動作仕様を定義します。
スクリプトは Azure Static Web App のプロビジョニングと GitHub OAuth 設定を統合的に処理します。

## 入力パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `ResourceGroupName` | string | No | `rg-<repo>-prod` | リソースグループ名 |
| `Name` | string | No | `stapp-<repo>-prod` | Static Web App 名 |
| `ResourceGroupLocation` | string | Yes | `japaneast` | リソースグループのリージョン |
| `Sku` | string | No | `Standard` | Static Web App の SKU (Free/Standard/Dedicated) |
| `Force` | switch | No | false | 既存リソースの強制削除フラグ |
| `ClientId` | string | No | - | GitHub OAuth App Client ID |
| `ClientSecret` | string | No | - | GitHub OAuth App Client Secret |

## 処理フロー

```mermaid
flowchart TD
    Start([開始]) --> ResolveRepo[リポジトリ情報取得]
    
    ResolveRepo --> CheckRGExists{リソースグループ<br/>存在?}
    
    CheckRGExists -->|Yes| CheckForceRG{Force?}
    CheckRGExists -->|No| CreateRG[リソースグループ作成]
    
    CheckForceRG -->|Yes| DeleteRG[リソースグループ削除]
    CheckForceRG -->|No| CheckSWAExists[Static Web App存在チェック]
    
    DeleteRG --> CreateRG
    CreateRG --> CheckSWAExists
    
    CheckSWAExists --> IsSWAExists{Static Web App<br/>存在?}
    
    IsSWAExists -->|Yes| CheckForceSWA{Force?}
    IsSWAExists -->|No| CreateSWA[Static Web App作成]
    
    CheckForceSWA -->|Yes| DeleteSWA[Static Web App削除]
    CheckForceSWA -->|No| ShowOAuth[OAuth手順表示]
    
    DeleteSWA --> CreateSWA
    
    CreateSWA --> GetToken[デプロイトークン取得]
    GetToken --> SetGHSecret[GitHub Secret設定]
    SetGHSecret --> ShowOAuth
    
    ShowOAuth --> CheckCred{ClientId AND<br/>ClientSecret<br/>引数で指定?}
    
    CheckCred -->|No| InputInteractive[対話入力]
    CheckCred -->|Yes| SetEnvVars[SWA環境変数設定]
    
    InputInteractive --> SetEnvVars
    
    SetEnvVars --> End([完了])
```
