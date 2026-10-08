# Family Database v2

家族向けの予定・給食・掃除・買い物Dashboard。静的なGitHub Pages + Supabaseで動作します。

- 公開ページ: https://hideboshi06.github.io/family-database-v2/
- GitHub: `hideboshi06/family-database-v2`（個人用アカウント）
- Supabaseプロジェクト: `Family Database`（個人用 `hideboshi`）
- データテーブル: `daily`、`cleaning`、`shopping`
- アクセス管理: `family_members` + Supabase Auth Google OAuth + RLS

## 現在実装済み

- Googleログイン、許可ユーザーの判定、ログアウト
- 今日の天気・予定・給食・ゴミ、明日の準備（天気・給食）、直近9日間の予定
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
- **天気の自動更新は動作確認済み**。毎朝5:00 JSTにSupabase CronからWeatherAPI予報（今日から3日分）を保存します。手動呼び出しでHTTP 200と予定・給食・ゴミのデータ保持を確認済み。iPhone通知は旧GAS版を使用中です。設定方法は [WEATHER_SETUP.md](WEATHER_SETUP.md) に記載しています。
- GitHub PagesのHTML、CSS、JavaScriptは公開されるため、Supabaseの `service_role` キーやWeatherAPIの秘密鍵などを置かないでください。クライアント側にはpublishable keyのみを配置しています。

## 動作確認

1. 公開ページにアクセスして、許可済みのGoogleアカウントでログイン。
2. 今日の予定と給食、掃除、買い物が表示される。
3. 「月間編集」で日付を開き、予定や給食を編集して「まとめて保存」。
4. Dashboardを更新し、変更が反映されていることを確認。

## 次に移行する機能

1. iPhone画面の改善と操作確認。
2. iPhoneショートカット通知のSupabase対応。
3. 本番切り替え前にスプシ側との差分移行、動作確認、切り替え。
