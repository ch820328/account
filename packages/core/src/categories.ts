/** Sensible starter categories created for each new user. */
export interface DefaultCategory {
  name: string;
  kind: "income" | "expense";
  children?: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income — salary is a parent with composition sub-items.
  { name: "薪資", kind: "income", children: ["底薪", "獎金", "加班費", "津貼", "年終"] },
  { name: "投資收益", kind: "income", children: ["股利", "利息", "資本利得", "租金收入"] },
  { name: "其他收入", kind: "income", children: ["紅包禮金", "退款", "中獎"] },

  // Expense — organized into scannable groups with sub-items.
  { name: "飲食", kind: "expense", children: ["早餐", "午餐", "晚餐", "外食", "食材", "飲料", "咖啡"] },
  {
    name: "居住",
    kind: "expense",
    children: ["房租房貸", "水電瓦斯", "網路電信", "管理費", "家具家電", "修繕"],
  },
  { name: "交通", kind: "expense", children: ["大眾運輸", "加油", "停車", "計程車", "維修保養"] },
  { name: "購物", kind: "expense", children: ["服飾", "3C", "美妝", "生活用品"] },
  { name: "娛樂", kind: "expense", children: ["電影", "遊戲", "旅遊", "運動", "展演"] },
  { name: "訂閱服務", kind: "expense", children: ["串流", "軟體", "會員"] },
  { name: "醫療", kind: "expense", children: ["看診", "藥品", "健檢", "牙醫"] },
  { name: "教育", kind: "expense", children: ["學費", "書籍", "課程"] },
  { name: "人情", kind: "expense", children: ["禮金", "孝親", "捐款"] },
  { name: "保險", kind: "expense" },
  { name: "稅費", kind: "expense" },
  { name: "寵物", kind: "expense" },
  { name: "其他支出", kind: "expense" },
];
