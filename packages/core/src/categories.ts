/** Sensible starter categories created for each new user. */
export interface DefaultCategory {
  name: string;
  kind: "income" | "expense";
  children?: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income — salary is a parent with composition sub-items.
  { name: "💼 薪資與獎金", kind: "income", children: ["底薪", "獎金", "年終"] },
  { name: "📈 投資與股票", kind: "income", children: ["RSU", "股利利息"] },
  { name: "🎁 其他收入", kind: "income", children: ["紅包禮金", "退款變賣"] },

  // Expense — the 6 classical pillars
  { name: "🍱 食", kind: "expense", children: ["外食", "食材", "飲料", "點心咖啡"] },
  { name: "👕 衣", kind: "expense", children: ["服飾", "生活用品", "美妝保養"] },
  { name: "🏠 住", kind: "expense", children: ["水電瓦斯", "網路電信", "管理費", "家具家電", "修繕", "房租房貸", "稅費"] },
  { name: "🚗 行", kind: "expense", children: ["大眾運輸", "加油", "停車", "計程車", "維修保養"] },
  { name: "📚 育", kind: "expense", children: ["學費", "書籍", "課程"] },
  { name: "🎮 樂", kind: "expense", children: ["數位訂閱", "會員", "旅遊", "休閒娛樂", "禮金", "醫療", "保險"] },
  { name: "📦 其他", kind: "expense", children: ["孝親", "所得稅"] },
];
