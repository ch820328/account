import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { db, attachments } from "@acc/db";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const transactionId = (formData.get("transactionId") as string) || null;
    const note = (formData.get("note") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "未提供檔案" }, { status: 400 });
    }

    // 1. File Size Validation (Max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `檔案過大 (${(file.size / (1024 * 1024)).toFixed(1)}MB)，單一檔案上限為 10MB` },
        { status: 400 }
      );
    }

    // 2. File Type & Extension Validation
    const ALLOWED_MIME_TYPES = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
    ]);
    const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"]);

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "不支援的檔案格式，僅允許上傳 JPG、PNG、WebP、HEIC 圖片或 PDF 文件" },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // Generate safe unique filename
    const uniqueId = crypto.randomUUID();
    const safeStorageName = `${uniqueId}${ext}`;
    const storagePath = path.join(UPLOAD_DIR, safeStorageName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(storagePath, buffer);

    const [record] = await db
      .insert(attachments)
      .values({
        userId: session.user.id,
        transactionId: transactionId || null,
        filename: file.name,
        fileKey: safeStorageName,
        contentType: file.type || "application/octet-stream",
        sizeBytes: buffer.byteLength,
        note: note || null,
      })
      .returning();

    return NextResponse.json({ success: true, attachment: record });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "上傳失敗" }, { status: 500 });
  }
}
