# 天気自動更新の移行ガイド

Family Database v2の天気更新は、**毎朝5:35 日本時間** に Supabase Cron → Edge Function → WeatherAPI.com → `public.daily` の順番で動きます。

- Edge Function: `family-weather-update` （デプロイ済み、verify_jwt = false・共有トークン認証）
- Cron: `family-weather-daily-0535-jst` （20:35 UTC、登録済み）
- 予報: 今日から最大3日分、朝8:00と夕方18:00、気温・降水確率・天候（日本語）
- **旧GASの自動更新は切り替えが確認できるまで停止しないでください**。

## 秘密設定（操作が必要）

1. [Edge Function Secrets](https://supabase.com/dashboard/project/besevrrmhwmkdqmoiscf/settings/functions)を開き、以下を登録する。
   - `WEATHERAPI_KEY`: 旧GASで使用中のWeatherAPI.com APIキー
   - `WEATHER_COORDS`: 位置を示す緯度,経度（旧Sheetの「設定」→「天気緯度」「天気経度」にある値。GitHubには記載しない）
   - `WEATHER_CRON_TOKEN`: パスワードマネージャーなどで生成した**32文字以上**のランダムな共有トークン
2. 同じSupabaseプロジェクトの **Database → Vault** でシークレットを追加する。
   - Name: `family_weather_cron_token`
   - Value: **上の `WEATHER_CRON_TOKEN` と完全に同じ文字列**
3. 必ず各画面で保存。これで翌朝のCron実行が天気データを更新するようになります。
4. 最初の稼働確認が済むまでは旧GASを停止しないでください。

**重要:** APIキー・共有トークンはGitHubリポジトリ、チャット、スプレッドシートに貼らないでください。Chrome開発者ツールなどからEdge Functionを直接呼ぶ用途にも使わないでください。

## 状態確認

SQL Editor:

```sql
select jobname,schedule,active
from cron.job
where jobname='family-weather-daily-0535-jst';

-- Secretsの有無だけ確認。値そのものは表示しない。
select name from vault.decrypted_secrets where name='family_weather_cron_token';
```

Cron実行ログは Supabase Dashboard → Integrations → Cron または `cron.job_run_details`、Edge Functionの結果は Supabase Dashboard → Edge Functions → `family-weather-update` → Logs で確認。

## 安全設計

- Edge Functionは `verify_jwt=false` ですが、POST専用かつ `x-weather-cron-token` ヘッダーで検証します。設定がなければWeatherAPIにアクセスしません。
- CronはVaultの暗号化シークレットからトークンを読み取って呼び出します。ソースコードにはトークンを含めません。
- Edge FunctionはSupabaseのサーバー側管理キーで `daily` の天気項目だけを upsert します。既存の予定・給食・ゴミは変更しません。
- APIキーはサーバー実行時の環境変数からだけ取得します。

## 作業残

- シークレット登録
- 初回手動実行／翌朝実行の動作確認
- 旧GASからの切替判断
