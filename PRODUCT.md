# Product

## Register

product

## Platform

web

## Users
自託管 (Self-hosted) 個人財務管理者。需要高度隱私安全、不與外部銀行API直接連動，且需要管理多種複雜的資產（如：外幣、RSU 限制性股票、分期付款、借貸關係與房貸/信貸還款等）。

## Product Purpose
這是一個兼具安全與精度的個人財務記帳與資產預測系統。採用 bigint 作為最小金額單位，完全避免浮動小數誤差；透過簡單的背景任務每日更新匯率與收盤價，將多幣別資產精準轉換回基準貨幣。

## Positioning
「一個完全由自己掌控、安全精準、且能推算未來現金流的外幣與持股記帳工具。」

## Brand Personality
專業、簡潔、安全、專注於任務 (Minimalist, Secure, Task-focused)。介面應如工具般融入使用者的記帳流，而非干擾。

## Anti-references
- **資訊過載的 Dashboard**：塞滿花俏小工具與漸層大數字，卻難以一眼看出核心淨值與近期開銷。
- **過多無用動畫**：流動的圖表或滑過按鈕的動態，減慢操作流程。
- **不一致的表單控制**：用自訂滾動條或非標準控制項來破壞瀏覽器原生體驗。

## Design Principles
- **任務導向簡潔 (Task-focused simplicity)**：隱藏繁瑣的非必要資訊，例如大分類在選取後才動態顯示子分類，維持排版緊湊。
- **一致性大於驚喜 (Consistency over surprise)**：保持統一的組件操作邏輯，相同的按鈕形狀，相似的表單佈局。
- **正確性優先 (Correctness first)**：強調對帳、餘額變動的清晰提示，不應有模糊的數值呈現。

## Accessibility & Inclusion
符合 WCAG AA 等級的文字對比度（普通文字 >= 4.5:1），支援基本鍵盤導覽，並尊重作業系統的減弱動態效果（prefers-reduced-motion）設定。
