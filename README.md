# Home Accounting

自託管的個人記帳系統。收支記帳、定期扣款、外幣與持股,資料放在你自己的機器上。

- **技術**:TypeScript 全端 monorepo(pnpm + Turborepo)、Next.js(UI + tRPC + better-auth 同源)、PostgreSQL + Drizzle、背景 worker 跑 `node-cron`。
- **金額**:一律以 `bigint` 最小單位(minor units)儲存,避免浮點誤差;跨幣別用歷史匯率快照換算。
- **對外**:Docker 部署 + Cloudflare Tunnel(VM 不需開任何 port)。

## 專案結構

```
apps/
  web/       Next.js:UI + tRPC API + better-auth(同源,cookie 免煩惱)
  worker/    node-cron:更新匯率/股價、產生定期扣款、每晚備份
packages/
  money/     bigint 金額工具(add/convert/format)+ 單元測試
  db/        Drizzle schema、client、migration、seed
  core/      共用業務邏輯(預設分類、基準幣、sync ingest)
  rpc/       tRPC sync router + client(量化交易後端共用型別)
```

所有設定集中在 `.env`(見 `.env.example`),**port 與大部分資訊都由 `.env` 控制**。

## 啟動

需求:Docker。

```bash
cp .env.example .env   # 首次；調整 port、密碼等
./run.sh               # 啟動整組 Docker（db + web + worker + migrate + admin）
```

瀏覽器開 `http://localhost:${WEB_PORT}`，預設帳號 **admin / admin**。

```bash
./run.sh down      # 停止
./run.sh restart   # 重啟
./run.sh logs      # 日誌
./run.sh ps        # 狀態
```

## 開發者（可選）

若要本機改 code、熱更新，需 Node 22+、pnpm：

```bash
pnpm install
docker compose up -d db
pnpm dev
```

## 部署到 VM(Docker Compose + Cloudflare Tunnel)

在 VM 上(Ubuntu 24.04,已裝 Docker):

```bash
git clone <repo> && cd home-accounting
cp .env.example .env
# 重要:設定 POSTGRES_PASSWORD、BETTER_AUTH_SECRET,
#       並把 BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL 設成你的網域
#       例如 https://finance.yourdomain.com
docker compose -f docker-compose.prod.yml up -d --build
```

這會啟動四個部分:`db`、一次性的 `migrate`(自動 migrate + seed)、`web`、`worker`。
`web` 會在 `http://localhost:${WEB_PORT}` 提供服務。

### Cloudflare Tunnel(不開 port)

```bash
# 安裝 cloudflared 後
cloudflared tunnel login
cloudflared tunnel create accounting
# 在 Cloudflare 後台或設定檔把 public hostname 指到本機 web:
#   finance.yourdomain.com  ->  http://localhost:3000
cloudflared tunnel run accounting
```

TLS 由 Cloudflare 處理,VM 不需開放 80/443。

### 備份(Cloudflare R2)

在 `.env` 填入 `R2_*` 後,`worker` 會依 `BACKUP_CRON`(預設每天 03:00)把
`pg_dump` 上傳到 R2。留空則停用備份。

## 環境變數

| 變數 | 說明 |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | Docker 專案名稱(隔離其他容器) |
| `TZ` | worker cron 使用的時區 |
| `POSTGRES_USER/PASSWORD/DB` | Postgres 帳密與資料庫名 |
| `DB_PORT` | Postgres 對外 port |
| `DATABASE_URL` | 連線字串(容器內會自動改用 `db` host) |
| `WEB_PORT` / `WEB_INTERNAL_PORT` | 網站對外 / 容器內 port |
| `BETTER_AUTH_SECRET` | 認證用 secret(`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | 對外網址 |
| `SESSION_EXPIRES_DAYS` | 登入 session 有效天數(預設 7,滑動續期) |
| `SESSION_UPDATE_MINUTES` | 有操作後多久重算過期(預設 15 分鐘) |
| `APP_BASE_CURRENCY` | 報表基準幣(預設 TWD,仍支援多幣別) |
| `SYNC_API_KEY` | 本機股票網站推送資料的 API Key |
| `SYNC_USER_ID` | 可選,指定持股寫入哪個使用者(預設第一個註冊帳號) |
| `R2_*` / `BACKUP_CRON` | 備份到 Cloudflare R2 的設定 |

## 後端對後端同步(tRPC,量化交易 → 記帳)

兩個獨立後端透過 **tRPC** 溝通,型別共用 `@acc/rpc` 套件:

```
[股價量化交易 backend]  --tRPC client-->  [記帳 backend /api/rpc/sync]
                                              upsertPrices / syncHoldings / upsertFx …
```

記帳系統**不連券商**,只負責接收並儲存即時資料(股價、持股、匯率)。

### 記帳端設定

```bash
# .env
SYNC_API_KEY=<openssl rand -base64 32>   # 兩邊用同一把 key
SYNC_USER_ID=                             # 可選,預設第一個註冊使用者
```

### 量化交易端(另一個專案)

安裝共用套件(同 monorepo 或 git submodule):

```bash
pnpm add @acc/rpc   # 或 file:../accounting/packages/rpc
```

```typescript
import { createAccountingSyncClient } from "@acc/rpc/client";

const accounting = createAccountingSyncClient({
  baseUrl: process.env.ACCOUNTING_URL!,  // http://localhost:50300
  apiKey: process.env.SYNC_API_KEY!,
});

// 健康檢查
await accounting.ping.query();

// 推送即時股價
await accounting.upsertPrices.mutate({
  source: "quant-trading",
  prices: [{ symbol: "2330", market: "TW", price: "580", currency: "TWD" }],
});

// 同步持股(全量快照)
await accounting.syncHoldings.mutate({
  replace: true,
  holdings: [
    { symbol: "2330", market: "TW", quantity: "1000", avgCost: "550", costCurrency: "TWD" },
  ],
});

// 推送匯率
await accounting.upsertFx.mutate({
  rates: [{ base: "USD", quote: "TWD", rate: "31.5" }],
});
```

### Sync Router 方法

| 方法 | 寫入表 | 說明 |
| --- | --- | --- |
| `ping` | — | 連線測試 |
| `upsertInstruments` | `instruments` | 建立/更新標的 |
| `upsertPrices` | `price_snapshots` | 股價快照(可高頻推送) |
| `upsertFx` | `fx_rates` | 匯率快照 |
| `syncHoldings` | `holdings` | 持股同步 |

端點:`POST /api/rpc/sync` · 認證 Header:`x-sync-api-key: <SYNC_API_KEY>`

建議順序:`upsertInstruments` → `upsertPrices` / `syncHoldings` / `upsertFx`

### 為什麼用 tRPC 而不是 gRPC?

兩邊都是 TypeScript 時,tRPC 可**共用 Zod schema + 型別**,改欄位兩邊編譯器一起報錯,開發最快。若量化端日後改用 Python,再為 sync 加一層 gRPC gateway 即可;記帳端的 ingest 邏輯不變。

## 功能

- [x] **地基**:monorepo、Drizzle schema、better-auth、tRPC、手動記帳、容器化
- [x] **金額與多幣別**:基準幣換算 + `fx_rates` 快照(worker 每日自動更新)
- [x] **排程**:薪資單、RSU、貸款還款、消費分期、一般定期收支(cron 產生 + 列內展開編輯)
- [x] **交易管理**:記帳可編輯／刪除,並標記自動產生來源(薪資／分期／貸款…)
- [x] **持股與資產**:`holdings` + `price_snapshots`,worker 每日更新股價(TWSE / stooq)
- [x] **資產預估**:含分期結束、貸款還清、RSU 逐月 vest 市值
- [x] **報表與圖表**:淨資產趨勢(每日快照)、資產配置、預估走勢
- [x] **備份**:worker 每晚 `pg_dump` → Cloudflare R2(設定 `R2_*` 後啟用)
- [x] **帳號安全**:設定頁可自行更換密碼
- [ ] App(Expo):Dashboard + 快速記帳

## 背景排程(worker)

| 工作 | 時間 | 說明 |
| --- | --- | --- |
| `recurring-generate` | 每日 00:10 | 產生到期的定期／薪資／RSU／分期／貸款交易 |
| `net-worth-snapshot` | 每日 00:30 | 記錄每人淨資產快照(趨勢圖來源) |
| `fx-refresh` | 每日 06:00 | 從 open.er-api.com 更新匯率 |
| `price-refresh` | 平日 18:00 | 更新持股股價(TW: TWSE、US: stooq) |
| `db-backup` | `BACKUP_CRON`(預設 03:00) | `pg_dump` → R2(未設定 R2 則略過) |
