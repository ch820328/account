import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Accounting",
    short_name: "Accounting",
    description: "自託管的個人記帳：收支、排程、淨資產、預算",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    lang: "zh-TW",
  };
}
