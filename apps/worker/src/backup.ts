import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { PassThrough } from "node:stream";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID)
  );
}

function r2Endpoint(): string {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * Dump the Postgres database, gzip it, and upload to Cloudflare R2.
 * Skips silently if R2 is not configured. Returns the object key on success.
 */
export async function backupDatabaseToR2(): Promise<string | null> {
  if (!isR2Configured()) return null;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `backups/accounting-${stamp}.sql.gz`;

  const dump = spawn("pg_dump", ["--no-owner", "--no-privileges", databaseUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const gzip = createGzip();
  const body = new PassThrough();
  dump.stdout.pipe(gzip).pipe(body);

  let stderr = "";
  dump.stderr.on("data", (d) => (stderr += d.toString()));

  const dumpDone = new Promise<void>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${stderr}`)),
    );
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  // Buffer the gzipped stream (personal DBs are small; avoids multipart setup).
  const chunks: Buffer[] = [];
  const collected = new Promise<Buffer>((resolve, reject) => {
    body.on("data", (c) => chunks.push(Buffer.from(c)));
    body.on("end", () => resolve(Buffer.concat(chunks)));
    body.on("error", reject);
  });

  const [, buffer] = await Promise.all([dumpDone, collected]);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: "application/gzip",
    }),
  );

  return key;
}
