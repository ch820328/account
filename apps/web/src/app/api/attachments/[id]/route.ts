import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { db, attachments } from "@acc/db";
import { eq, and } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const { id } = await params;
    const [att] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
      .limit(1);

    if (!att) {
      return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
    }

    const filePath = path.join(UPLOAD_DIR, att.fileKey);
    const fileBuffer = await fs.readFile(filePath);

    // Encode filename for Content-Disposition header
    const encodedName = encodeURIComponent(att.filename);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": att.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Download error:", error);
    return NextResponse.json({ error: "讀取檔案失敗" }, { status: 500 });
  }
}
