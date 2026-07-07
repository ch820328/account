import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Accounting",
    short_name: "記帳",
    description: "自託管的個人記帳：收支、排程、淨資產、投資",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f14",
    theme_color: "#0b0f14",
    lang: "zh-TW",
  };
}
