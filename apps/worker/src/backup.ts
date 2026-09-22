import { spawn } from "node:child_process";
import { createGzip } from "node:zlib";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
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
 * Encrypts a buffer using AES-256-GCM with a key derived from the passphrase.
 *
 * Output format (all bytes concatenated):
 *   [16 bytes salt][12 bytes IV][N bytes ciphertext][16 bytes GCM auth tag]
 *
 * To decrypt manually:
 *   openssl enc -d -aes-256-gcm ... (or use Node.js crypto.createDecipheriv)
 */
function encryptBuffer(buffer: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  // Derive a 32-byte key from the passphrase using scrypt (memory-hard KDF)
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, encrypted, authTag]);
}

/**
 * Dump the Postgres database, gzip it, optionally encrypt it, and upload to
 * Cloudflare R2. Skips silently if R2 is not configured.
 *
 * Encryption:
 *   Set BACKUP_ENCRYPT_PASSPHRASE in .env to enable AES-256-GCM encryption.
 *   The backup file will have a .enc suffix when encrypted.
 *   Keep the passphrase safe — without it, the backup cannot be decrypted.
 *
 * Returns the R2 object key on success, null if R2 is not configured.
 */
export async function backupDatabaseToR2(): Promise<string | null> {
  if (!isR2Configured()) return null;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const passphrase = process.env.BACKUP_ENCRYPT_PASSPHRASE;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = passphrase ? "sql.gz.enc" : "sql.gz";
  const key = `backups/accounting-${stamp}.${ext}`;

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

  const [, rawBuffer] = await Promise.all([dumpDone, collected]);

  // Optionally encrypt before upload
  const uploadBuffer = passphrase ? encryptBuffer(rawBuffer, passphrase) : rawBuffer;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: uploadBuffer,
      ContentType: passphrase ? "application/octet-stream" : "application/gzip",
    }),
  );

  return key;
}
