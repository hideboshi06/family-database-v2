# Family Database v2

家族向けの予定・給食・掃除・買い物Dashboard。静的なGitHub Pages + Supabaseで動作します。

- 公開ページ: https://hideboshi06.github.io/family-database-v2/
- GitHub: `hideboshi06/family-database-v2`（個人用アカウント）
- Supabaseプロジェクト: `Family Database`（個人用 `hideboshi`）
- データテーブル: `daily`、`cleaning`、`shopping`
- アクセス管理: `family_members` + Supabase Auth Google OAuth + RLS

## 現在実装済み

- Googleログイン、許可ユーザーの判定、ログアウト
- 今日の天気・予定・給食・ゴミ、直近9日間の予定
- 月間予定の入力・訂正・まとめて保存
- 月間給食の入力・貼り付け・訂正・まとめて保存
- 日別予定編集
- 掃除の一覧と「完了」操作（次回期限を計算）
- 買い物の必要フラグ切り替え、商品追加・編集
- 管理者による家族Googleアカウントの追加・削除

## 移行上の注意

- 旧GAS + Google Sheets版は稼働継続中。**自動同期はありません**。
- 2026-10-08にGoogle Sheetsから初回データをコピー。移行時は日次61件、掃除4件、買い物15件。
- 旧Sheetの買い物ID `14` が重複していたため「キュウイ」をSupabase側のみ `15` に変更。
- **WeatherAPIを使う天気自動更新とiPhone通知はまだ移行していません**。天気は移行時点の値です。
- GitHub PagesのHTML、CSS、JavaScriptは公開されるため、Supabaseの `service_role` キーやWeatherAPIの秘密鍵などを置かないでください。クライアント側にはpublishable keyのみを配置しています。

## 動作確認

1. 公開ページにアクセスして、許可済みのGoogleアカウントでログイン。
2. 今日の予定と給食、掃除、買い物が表示される。
3. 「月間編集」で日付を開き、予定や給食を編集して「まとめて保存」。
4. Dashboardを更新し、変更が反映されていることを確認。

## 次に移行する機能

1. WeatherAPIの自動更新（Supabase Edge Functionsなど、秘密鍵を守れるサーバー側）。
2. iPhoneショートカット通知のSupabase対応。
3. 本番切り替え前にスプシ側との差分移行、動作確認、切り替え。
