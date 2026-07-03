/** Sensible starter categories created for each new user. */
export interface DefaultCategory {
  name: string;
  kind: "income" | "expense";
  children?: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income — salary is a parent with composition sub-items.
  { name: "薪資", kind: "income", children: ["底薪", "獎金", "加班費", "津貼"] },
  { name: "投資收益", kind: "income", children: ["股利", "利息", "資本利得"] },
  { name: "其他收入", kind: "income" },

  // Expense
  { name: "飲食", kind: "expense", children: ["外食", "食材", "飲料"] },
  { name: "居住", kind: "expense", children: ["房租房貸", "水電瓦斯", "網路電信", "管理費"] },
  { name: "交通", kind: "expense", children: ["大眾運輸", "加油", "停車"] },
  { name: "訂閱服務", kind: "expense", children: ["串流", "軟體", "會員"] },
  { name: "保險", kind: "expense" },
  { name: "娛樂", kind: "expense" },
  { name: "醫療", kind: "expense" },
  { name: "其他支出", kind: "expense" },
];
