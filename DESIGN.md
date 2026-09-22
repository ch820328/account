---
name: Accounting
description: A clean, secure, multi-currency personal accounting system.
colors:
  primary: "#4f8cff"
  neutral-bg: "#0b0f14"
  surface: "#141b24"
  surface-2: "#1b2530"
  border: "#26313d"
  text: "#e6edf3"
  muted: "#8b97a5"
  income: "#35c48d"
  expense: "#ff6b6b"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "1.2"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.5"
rounded:
  md: "14px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
---

# Design System: Accounting

## 1. Overview

**Creative North Star: "The Financial Control Deck"**

Accounting 的視覺系統致力於建立一個極簡、沉浸且精確的個人財務控制台。介面配色採用深邃的暗色背景（#0b0f14），搭配層次分明的面板（#141b24, #1b2530），並以少量的亮藍色（#4f8cff）作為引導動作與選取狀態的視覺焦點。

這個設計系統的核心在於「工具的自我克制」，徹底排除裝飾性的漸層背景或無關的發光卡片，確保資料、圖表與交易明細能夠以最高的對比度與易讀性呈現，減少使用者操作時的認知負荷。

**Key Characteristics:**
- **深色控製台**：以高對比的極暗色調為基底，提供深夜使用時的視覺舒適感。
- **語意化色彩**：顏色僅用於區分財務狀態（綠色代表收入，紅色代表支出，藍色代表焦點），不作純粹裝飾用途。
- **嚴謹的間距與幾何**：以 8px / 16px 為單位的邊界留白，搭配適度圓角（14px），傳遞穩定與可靠感。

---

## 2. Colors

整個系統的色彩被嚴格侷限於功能性與語意化用途。

### Primary
- **Accent Blue** (#4f8cff): 用於主按鈕、當前選取狀態（如 Active Chip）、焦點邊框與核心連結。在畫面上佔比不應超過 10%。

### Neutral
- **Background** (#0b0f14): 系統全域背景色。
- **Surface** (#141b24): 主要卡片、表單底層、以及置頂導覽列的背景色。
- **Surface 2** (#1b2530): 次要區塊、點擊前狀態（如未選取之 Chip）的背景色。
- **Border** (#26313d): 分割線、表單邊框、不可點擊的邊界。
- **Text** (#e6edf3): 主要內文、標題、強烈資訊的顏色。
- **Muted** (#8b97a5): 副標題、欄位標籤、輔助說明的顏色。

### Semantic
- **Income Green** (#35c48d): 僅用於代表收入、餘額增加、已結清狀態。
- **Expense Red** (#ff6b6b): 僅用於代表支出、負債、餘額減少、刪除與錯誤提示。

**The Ten Percent Rule.** 
主視覺藍色（#4f8cff）僅在使用者需要立即做出操作（如「儲存」、「新增」）或需要確認當前狀態（選中項）時出現。其餘區塊應一律保持單色調的 Restrained（克制）視覺風格。

---

## 3. Typography

**Display Font:** System UI Stack (ui-sans-serif, system-ui, -apple-system, sans-serif)
**Body Font:** System UI Stack (ui-sans-serif, system-ui, -apple-system, sans-serif)
**Label/Mono Font:** monospace (用於顯示金額、數值與日期，確保字符等寬便於對齊)

**Character:** 
不依賴花俏的字型設計，完全使用系統原生無襯線字型（Sans-serif）以保證最大化載入速度與原生應用的精緻感。金額與數值使用 Mono 字型（等寬），確保多行對齊時不會因為字元寬度不同而產生視覺鋸齒。

### Hierarchy
- **Display** (Bold (700), 32px, Line Height 1.2): 用於大頁面標題（如「記錄」、「帳戶」）。
- **Headline** (Bold (700), 20px, Line Height 1.3): 用於卡片內的區塊標題或小標。
- **Title** (Semi-bold (600), 16px, Line Height 1.4): 用於列表項目名稱、大字金額。
- **Body** (Regular (400), 14px, Line Height 1.5): 用於主要表格、備註、輔助資訊。
- **Label** (Medium (500), 12px, Letter Spacing 0.3px): 用於表單的上層標籤、微縮狀態提示。

---

## 4. Elevation

本系統高度依賴「色調分層 (Tonal Layering)」來呈現深度與重要性，而非裝飾性的投影。

全域僅使用單一陰影，且只套用在浮動的卡片或彈出選單（Dropdown / Popover）上。

### Shadow Vocabulary
- **Card Shadow** (`0 8px 30px rgba(0, 0, 0, 0.35)`): 用於從背景浮起的表單容器（.card）與置頂導覽列，以在視覺上拉開層次。

**The Layering Rule.**
背景為 #0b0f14，其上疊加的卡片必須是較亮的 #141b24，卡片內的按鈕或選單再次疊加時應使用更亮的 #1b2530。嚴格禁止在暗色背景上使用亮色陰影。

---

## 5. Components

### Buttons
- **Shape:** 圓角 (14px)
- **Primary:** 背景為 Accent Blue (#4f8cff)，文字為純白 (#ffffff)。Padding 採用 `10px 20px`。
- **Hover / Focus:** 懸停時，背景色微幅變亮或邊框加深。Focus 時產生 glowing border。
- **Ghost:** 背景透明，邊框為 Border (#26313d)，Hover 時文字轉為 Text (#e6edf3)。

### Chips
- **Style:** 預設背景為 Surface 2 (#1b2530)，邊框為 Border (#26313d)，文字為 Muted (#8b97a5)。圓角為全圓角 (999px)。
- **Selected State (.chip-on):** 背景為 `rgba(79, 140, 255, 0.15)`，邊框為 Accent Blue (#4f8cff)，文字為全亮白 (#e6edf3)。

### Cards / Containers
- **Corner Style:** 圓角 (14px)
- **Background:** 主要卡片為 Surface (#141b24)。
- **Border:** 1px solid Border (#26313d)。
- **Padding:** 全域採用 16px 至 24px 間距。

---

## 6. Do's and Don'ts

### Do:
- **Do** 使用 `bigint` 的最小單位在前端換算顯示金額，並透過 `fmt()` 格式化輸出。
- **Do** 在編輯外幣金額時，在下方明確標記 `≈ TWD` 的折算對照。
- **Do** 保持兩層式分類選擇器在重置或切換類型時的狀態一致。

### Don't:
- **Don't** 在 Dashboard 上放置任何裝飾性、不具資訊價值的圖表或 3D 元素。
- **Don't** 使用漸層文字（Gradient Text）或發光的背景模糊（Glassmorphism）卡片。
- **Don't** 在同一個列表中使用不同樣式的 Chip 按鈕。所有交互回饋（Hover/Active）必須保持全域一致。
