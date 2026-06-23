# TBH Market Chart

Steam Market 価格チャートビューアー for TBH: Taskbar Hero (appid: 3678970)

## セットアップ

```bash
npm run install:all   # 依存インストール
```

### Steam Cookie の設定

`server/cookies.txt` にSteamのCookieヘッダー文字列を貼り付けてください。
（pricehistory API のログイン認証に必要）

取得方法:
1. ブラウザで https://steamcommunity.com/market/ を開く（ログイン済み）
2. DevTools → Network → steamcommunity.com へのリクエストを選択
3. Request Headers の `Cookie:` の値をコピー
4. `server/cookies.txt` に貼り付け（1行）

### 監視アイテムの設定

`client/src/watchlist.js` を編集して監視するアイテムの `market_hash_name` を設定してください。
アイテム名は Steam Market の URL から確認できます。

## 起動

```bash
npm run dev   # proxy(3001) + frontend(5173) を同時起動
```

ブラウザで http://localhost:5173 を開く。

## 構成

```
server/         Express proxy（Cookie付与 / キャッシュ / レート制限）
client/src/
  watchlist.js  監視アイテム定義
  api.js        APIクライアント
  hooks/        useMarketData（10分ローテーション）
  components/
    FilterBar   上部フィルタバー
    ItemCard    カードグリッドの各カード
    ChartDrawer チャートドロワー（TradingView Lightweight Charts）
```

## 注意

- エンドポイントはすべて非公式（変更・廃止の可能性あり）
- `server/cookies.txt` は `.gitignore` 済み — コミットしないこと
