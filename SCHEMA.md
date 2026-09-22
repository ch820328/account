# Schema 資料字典

> 此文件描述所有 domain 資料表、欄位含義、enum 值和關聯關係。
> 本系統使用 `bigint` 儲存所有貨幣金額（minor units，即台幣「分」或美元「cent」）。

---

## Enum 值說明

### `ACCOUNT_TYPES` — 帳戶類型

| 值 | 含義 | 資產/負債 |
|---|---|---|
| `cash` | 現金（皮夾、保險箱）| 資產 |
| `bank` | 銀行帳戶（活儲、定存）| 資產 |
| `credit` | 信用卡 | **負債** |
| `broker` | 券商帳戶（持股）| 資產 |
| `wallet` | 數位錢包（街口、LINE Pay）| 資產 |
| `loan` | 個人貸款、汽車貸款 | **負債** |
| `mortgage` | 房屋貸款 | **負債** |

### `TRANSACTION_TYPES` — 交易類型

| 值 | 含義 |
|---|---|
| `income` | 收入（薪資、股利、獎金）|
| `expense` | 支出（消費、帳單）|
| `transfer` | 轉帳（帳戶間資金移動，含信用卡還款、換匯）|

### `TRANSACTION_SOURCES` — 交易來源

| 值 | 觸發方式 |
|---|---|
| `manual` | 使用者手動記帳 |
| `recurring` | 定期排程自動產生 |
| `payroll` | 薪資模板自動產生 |
| `installment` | 分期付款排程自動產生 |
| `loan` | 貸款月付排程自動產生 |
| `rsu` | RSU 發放自動產生 |
| `dca` | 定期定額投資自動產生 |

### `RECURRING_KINDS` — 定期排程種類

| 值 | 含義 |
|---|---|
| `income` | 定期收入（如租金收入）|
| `expense` | 定期支出（如訂閱費、保費）|
| `transfer` | 定期轉帳（如自動儲蓄）|

### `FREQUENCIES` — 執行頻率

| 值 | 含義 |
|---|---|
| `daily` | 每天 |
| `weekly` | 每週 |
| `monthly` | 每月（最常用）|
| `yearly` | 每年（保費、年費）|

### `RSU_VEST_STATUSES` — RSU 發放狀態

| 值 | 含義 |
|---|---|
| `pending` | 尚未到期發放 |
| `vested` | 已發放，持有中 |
| `sold` | 已全數賣出 |

### `LOAN_LEDGER_KINDS` — 個人借貸類型

| 值 | 方向 | 含義 |
|---|---|---|
| `lend` | 借出 → | 你借錢給別人 |
| `collect` | ← 收回 | 你收回借出的錢 |
| `borrow` | 借入 ← | 你向別人借錢 |
| `repay` | → 還出 | 你還錢給別人 |

---

## Domain 資料表

### `accounts` — 帳戶

| 欄位 | 類型 | 說明 |
|---|---|---|
| `id` | uuid PK | 帳戶唯一 ID |
| `userId` | text FK | 所屬使用者 |
| `name` | text | 顯示名稱（如「玉山美元帳戶」）|
| `type` | text | 帳戶類型（見 ACCOUNT_TYPES）|
| `currency` | char(3) | 帳戶本位幣（TWD/USD/JPY…）|
| `openingBalanceMinor` | bigint | 開戶初始餘額（minor units）|
| `loanRateAnnual` | numeric | 年利率 %（貸款/房貸帳戶）|
| `loanTermMonths` | int | 貸款總期數 |
| `loanStartDate` | date | 貸款起始日 |
| `parentId` | uuid | 父帳戶（同銀行群組用）|
| `bankCode` | text | 銀行代碼（如 808 台新）|
| `accountNumber` | text | 帳號末 4 碼 |
| `billingDay` | int | 信用卡帳單結帳日（1-31）|
| `repaymentDay` | int | 信用卡繳款日（1-31）|
| `archived` | bool | 是否封存 |

---

### `transactions` — 交易紀錄

| 欄位 | 類型 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `userId` | text FK | |
| `accountId` | uuid FK | 主帳戶（支出/收入的資金來源/去向）|
| `transferAccountId` | uuid FK | 轉帳目標帳戶（transfer 類型必填）|
| `categoryId` | uuid FK | 分類（支出/收入建議填寫）|
| `type` | text | income / expense / transfer |
| `amountMinor` | bigint | 金額（minor units，永遠為正值）|
| `currency` | char(3) | 本筆交易幣別 |
| `transferAmountMinor` | bigint | 跨幣轉帳時，對方帳戶的實收金額（不同幣別時有值）|
| `occurredAt` | timestamp | 交易發生時間 |
| `note` | text | 備註（可搜尋）|
| `source` | text | 來源（見 TRANSACTION_SOURCES）|

> **餘額計算規則**：
> - `income`：accountId 帳戶 +amount
> - `expense`：accountId 帳戶 -amount
> - `transfer`：accountId 帳戶 -amount，transferAccountId 帳戶 +transferAmountMinor（或 +amount 若無 transferAmountMinor）

---

### `categories` — 分類

| 欄位 | 類型 | 說明 |
|---|---|---|
| `id` | uuid PK | |
| `userId` | text FK | |
| `name` | text | 分類名稱 |
| `kind` | text | `income`（收入類）或 `expense`（支出類）|
| `parentId` | uuid | 父分類（兩層結構）|

---

### `recurring_rules` — 定期排程

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | text | 規則名稱（如「Netflix 訂閱費」）|
| `kind` | text | income / expense / transfer |
| `accountId` | uuid FK | 扣款/入款帳戶 |
| `transferAccountId` | uuid FK | 轉入帳戶（transfer 類型）|
| `amountMinor` | bigint | 每次金額 |
| `frequency` | text | daily / weekly / monthly / yearly |
| `interval` | int | 間隔（如 interval=2 + monthly = 每兩個月）|
| `dayOfMonth` | int | 每月第幾日（monthly 用）|
| `anchorDate` | date | 第一次執行日 |
| `nextRunDate` | date | 下次執行日（Worker 更新）|
| `endDate` | date | 到期日（null = 永不結束）|
| `active` | bool | 是否啟用 |

---

### `payroll_profiles` — 薪資模板

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | text | 模板名稱（如「台灣薪資」）|
| `depositAccountId` | uuid FK | 薪資入帳帳戶 |
| `dayOfMonth` | int | 每月發薪日 |
| `nextRunDate` | date | 下次執行日 |
| `active` | bool | 是否啟用 |

### `payroll_lines` — 薪資明細行

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | text | 項目名稱（本薪、勞保、健保…）|
| `kind` | text | `earning`（加項）或 `deduction`（扣項）|
| `amountMinor` | bigint | 金額 |
| `sortOrder` | int | 顯示順序 |

---

### `rsu_grants` — RSU 授予計畫

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | text | 計畫名稱（如「NVDA 2024 Grant」）|
| `symbol` | text | 股票代碼（NVDA、META…）|
| `market` | text | `TW` 或 `US` |
| `brokerAccountId` | uuid FK | 持股帳戶 |
| `totalQuantity` | numeric | 總授予股數 |
| `startDate` | date | 歸屬起始日 |
| `periods` | int | 總期數（通常 48 = 4 年月均）|
| `sellToCoverPct` | numeric | 預設 sell-to-cover 比例 %（0 = 不預扣）|

### `rsu_vests` — RSU 每期發放

| 欄位 | 類型 | 說明 |
|---|---|---|
| `periodIndex` | int | 第幾期（0-indexed）|
| `vestDate` | date | 發放日 |
| `quantity` | numeric | 本期發放股數 |
| `status` | text | pending / vested / sold |
| `vestPrice` | numeric | 發放日股價（USD）|
| `sellToCoverPct` | numeric | 本期覆寫的 sell-to-cover 比例 |

### `rsu_sells` — RSU 賣出紀錄

| 欄位 | 類型 | 說明 |
|---|---|---|
| `vestId` | uuid FK | 對應的發放期別 |
| `soldDate` | date | 賣出日期 |
| `quantity` | numeric | 賣出股數 |
| `soldPrice` | numeric | 賣出單價（USD）|
| `soldFee` | numeric | 手續費（USD）|
| `receivedAmount` | numeric | 實際收到金額（USD）|
| `receivedAccountId` | uuid FK | 入帳帳戶 |

---

### `holdings` — 投資持股

| 欄位 | 類型 | 說明 |
|---|---|---|
| `userId` | text FK | |
| `accountId` | uuid FK | 券商帳戶 |
| `instrumentId` | uuid FK | 關聯 instruments 表 |
| `quantity` | numeric | 持有股數（可為小數）|

### `instruments` — 投資標的參考資料

| 欄位 | 類型 | 說明 |
|---|---|---|
| `symbol` | text | 代碼（VOO、0050…）|
| `market` | text | `TW` 或 `US` |
| `name` | text | 全名 |
| `type` | text | stock / etf / fund / crypto |
| `currency` | char(3) | 計價幣別 |

### `price_snapshots` — 股價快照

| 欄位 | 類型 | 說明 |
|---|---|---|
| `instrumentId` | uuid FK | |
| `price` | numeric | 當日收盤價 |
| `currency` | char(3) | 計價幣別 |
| `asOf` | date | 快照日期 |

---

### `net_worth_snapshots` — 淨資產每日快照

Worker 每天凌晨 00:30 拍攝一次，用於趨勢圖和 MoM/YoY delta 計算。

| 欄位 | 類型 | 說明 |
|---|---|---|
| `userId` | text FK | |
| `asOf` | date | 快照日期 |
| `currency` | char(3) | 換算幣別（BASE_CURRENCY）|
| `totalMinor` | bigint | 總淨資產 |
| `assetsMinor` | bigint | 總資產 |
| `liabilitiesMinor` | bigint | 總負債 |
| `cashAndBankMinor` | bigint | 現金+銀行 |
| `investmentsMinor` | bigint | 投資市值 |

---

### `job_runs` — Worker 工作執行紀錄

| 欄位 | 類型 | 說明 |
|---|---|---|
| `name` | text | job 名稱（fx-refresh、recurring-generate…）|
| `status` | text | `success` 或 `error` |
| `message` | text | 執行結果摘要或錯誤訊息 |
| `ranAt` | timestamp | 執行時間 |

---

### `loan_ledger_entries` — 個人借貸帳本

| 欄位 | 類型 | 說明 |
|---|---|---|
| `counterparty` | text | 對方姓名 |
| `kind` | text | lend / collect / borrow / repay |
| `amountMinor` | bigint | 金額 |
| `currency` | char(3) | 幣別 |
| `occurredAt` | date | 發生日期 |
| `note` | text | 備註 |

---

## 金額計算慣例

所有金額使用 **minor units（最小計量單位）**：
- **TWD**：1元 = 100 minor units（TWD 通常取整，但儲存格式統一）
- **USD**：1美元 = 100 cents
- **JPY**：1円 = 1 minor unit（JPY 無小數）

換算時使用 `@acc/money` 套件的 `fromDecimal`（字串→bigint）和 `toMajor`（bigint→顯示用 number）。
