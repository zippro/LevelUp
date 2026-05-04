import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";

function getS3Client() {
  const accessKeyId = process.env.DO_SPACES_KEY;
  const secretAccessKey = process.env.DO_SPACES_SECRET;
  const region = process.env.DO_SPACES_REGION || "fra1";
  const endpoint = process.env.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("DO_SPACES_KEY and DO_SPACES_SECRET are required. Set them in .env.local");
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

function getBucket() {
  return process.env.DO_SPACES_BUCKET || "narlevel";
}

// POST handler for all Spaces operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, path, newPath, prefix } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const s3 = getS3Client();
    const Bucket = getBucket();

    switch (action) {
      case "list": {
        // List objects with a prefix (simulates directory browsing)
        // Normalize prefix: remove leading slash, ensure trailing slash for dirs
        let targetPrefix = (path || "").replace(/^\/+/, "");
        if (targetPrefix && !targetPrefix.endsWith("/")) {
          targetPrefix += "/";
        }

        const command = new ListObjectsV2Command({
          Bucket,
          Prefix: targetPrefix,
          Delimiter: "/",
          MaxKeys: 1000,
        });

        const response = await s3.send(command);

        const items: any[] = [];

        // Add "directories" (common prefixes)
        if (response.CommonPrefixes) {
          for (const cp of response.CommonPrefixes) {
            if (cp.Prefix) {
              const name = cp.Prefix.replace(targetPrefix, "").replace(/\/$/, "");
              if (name) {
                items.push({
                  name,
                  type: "directory",
                  size: 0,
                  modifyTime: 0,
                  key: cp.Prefix,
                });
              }
            }
          }
        }

        // Add files
        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key) {
              const name = obj.Key.replace(targetPrefix, "");
              // Skip the "directory" itself (empty key after prefix removal)
              if (!name || name.endsWith("/")) continue;
              // Skip items in subdirectories
              if (name.includes("/")) continue;

              items.push({
                name,
                type: "file",
                size: obj.Size || 0,
                modifyTime: obj.LastModified ? obj.LastModified.getTime() : 0,
                key: obj.Key,
              });
            }
          }
        }

        // Sort: directories first, then files
        items.sort((a, b) => {
          if (a.type === "directory" && b.type !== "directory") return -1;
          if (a.type !== "directory" && b.type === "directory") return 1;
          return a.name.localeCompare(b.name);
        });

        return NextResponse.json({
          items,
          path: targetPrefix ? `/${targetPrefix.replace(/\/$/, "")}` : "/",
          bucket: Bucket,
        });
      }

      case "download": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for download" }, { status: 400 });
        }

        const key = path.replace(/^\/+/, "");
        const command = new GetObjectCommand({ Bucket, Key: key });
        const response = await s3.send(command);

        if (!response.Body) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const byteArray = await response.Body.transformToByteArray();
        const fileName = key.split("/").pop() || "file";
        const buffer = Buffer.from(byteArray);

        return new NextResponse(buffer as unknown as BodyInit, {
          headers: {
            "Content-Type": response.ContentType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Length": String(buffer.length),
          },
        });
      }

      case "view": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for view" }, { status: 400 });
        }

        const key = path.replace(/^\/+/, "");

        // Check size first
        const headCommand = new HeadObjectCommand({ Bucket, Key: key });
        const headResponse = await s3.send(headCommand);
        const MAX_VIEW_SIZE = 2 * 1024 * 1024; // 2MB

        if ((headResponse.ContentLength || 0) > MAX_VIEW_SIZE) {
          return NextResponse.json(
            { error: "File too large to preview (max 2MB)" },
            { status: 400 }
          );
        }

        const getCommand = new GetObjectCommand({ Bucket, Key: key });
        const getResponse = await s3.send(getCommand);

        if (!getResponse.Body) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getResponse.Body.transformToString("utf-8");
        return NextResponse.json({ content, size: headResponse.ContentLength || 0 });
      }

      case "delete": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for delete" }, { status: 400 });
        }

        const key = path.replace(/^\/+/, "");

        // Check if it's a "directory" (prefix) — delete all objects with this prefix
        if (key.endsWith("/") || body.isDirectory) {
          const prefix = key.endsWith("/") ? key : key + "/";

          // List all objects with this prefix
          let continuationToken: string | undefined;
          const objectsToDelete: { Key: string }[] = [];

          do {
            const listCommand = new ListObjectsV2Command({
              Bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            });
            const listResponse = await s3.send(listCommand);

            if (listResponse.Contents) {
              for (const obj of listResponse.Contents) {
                if (obj.Key) objectsToDelete.push({ Key: obj.Key });
              }
            }
            continuationToken = listResponse.NextContinuationToken;
          } while (continuationToken);

          if (objectsToDelete.length > 0) {
            // Delete in batches of 1000
            for (let i = 0; i < objectsToDelete.length; i += 1000) {
              const batch = objectsToDelete.slice(i, i + 1000);
              const deleteCommand = new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: batch },
              });
              await s3.send(deleteCommand);
            }
          }
        } else {
          // Single file delete
          const deleteCommand = new DeleteObjectCommand({ Bucket, Key: key });
          await s3.send(deleteCommand);
        }

        return NextResponse.json({ success: true });
      }

      case "rename": {
        if (!path || !newPath) {
          return NextResponse.json(
            { error: "Both path and newPath are required for rename" },
            { status: 400 }
          );
        }

        const oldKey = path.replace(/^\/+/, "");
        const newKey = newPath.replace(/^\/+/, "");

        // Copy then delete (S3 doesn't have native rename)
        const copyCommand = new CopyObjectCommand({
          Bucket,
          CopySource: `${Bucket}/${oldKey}`,
          Key: newKey,
        });
        await s3.send(copyCommand);

        const deleteCommand = new DeleteObjectCommand({ Bucket, Key: oldKey });
        await s3.send(deleteCommand);

        return NextResponse.json({ success: true });
      }

      case "mkdir": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for mkdir" }, { status: 400 });
        }

        // In S3/Spaces, directories are just prefixes.
        // Create an empty object with trailing slash to make it visible.
        let key = path.replace(/^\/+/, "");
        if (!key.endsWith("/")) key += "/";

        const command = new PutObjectCommand({
          Bucket,
          Key: key,
          Body: "",
          ContentLength: 0,
        });
        await s3.send(command);

        return NextResponse.json({ success: true });
      }

      case "copy": {
        if (!path || !newPath) {
          return NextResponse.json(
            { error: "Both path and newPath are required for copy" },
            { status: 400 }
          );
        }

        const srcKey = path.replace(/^\/+/, "");
        let destKey = newPath.replace(/^\/+/, "");
        // If dest is a directory, append the filename
        if (destKey.endsWith("/")) {
          destKey += srcKey.split("/").pop();
        }

        const cpCmd = new CopyObjectCommand({
          Bucket,
          CopySource: `${Bucket}/${srcKey}`,
          Key: destKey,
        });
        await s3.send(cpCmd);

        return NextResponse.json({ success: true });
      }

      case "move": {
        if (!path || !newPath) {
          return NextResponse.json(
            { error: "Both path and newPath are required for move" },
            { status: 400 }
          );
        }

        const moveSrcKey = path.replace(/^\/+/, "");
        let moveDestKey = newPath.replace(/^\/+/, "");
        // If dest is a directory, append the filename
        if (moveDestKey.endsWith("/")) {
          moveDestKey += moveSrcKey.split("/").pop();
        }

        // Copy then delete
        const moveCopyCmd = new CopyObjectCommand({
          Bucket,
          CopySource: `${Bucket}/${moveSrcKey}`,
          Key: moveDestKey,
        });
        await s3.send(moveCopyCmd);

        const moveDelCmd = new DeleteObjectCommand({ Bucket, Key: moveSrcKey });
        await s3.send(moveDelCmd);

        return NextResponse.json({ success: true });
      }

      case "list-dirs": {
        // Recursively list all directory prefixes for folder picker
        const dirs: string[] = ["/"];
        const queue: string[] = [""];

        while (queue.length > 0) {
          const currentPrefix = queue.shift()!;
          const listCmd = new ListObjectsV2Command({
            Bucket,
            Prefix: currentPrefix,
            Delimiter: "/",
            MaxKeys: 1000,
          });
          const listRes = await s3.send(listCmd);

          if (listRes.CommonPrefixes) {
            for (const cp of listRes.CommonPrefixes) {
              if (cp.Prefix) {
                dirs.push("/" + cp.Prefix.replace(/\/$/, ""));
                queue.push(cp.Prefix);
              }
            }
          }
        }

        dirs.sort();
        return NextResponse.json({ dirs });
      }

      case "decode": {
        // Server-side decryption of encrypted .txt files → .asset content
        if (!path) {
          return NextResponse.json({ error: "Path is required for decode" }, { status: 400 });
        }

        const decoderKey = process.env.NAR_DECODER_KEY;
        if (!decoderKey || decoderKey.length !== 32) {
          return NextResponse.json(
            { error: "NAR_DECODER_KEY is not configured on the server. Add it to .env.local" },
            { status: 500 }
          );
        }

        const decodeFileKey = path.replace(/^\/+/, "");
        const getCmd = new GetObjectCommand({ Bucket, Key: decodeFileKey });
        const getRes = await s3.send(getCmd);

        if (!getRes.Body) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const encryptedBase64 = (await getRes.Body.transformToString("utf-8")).trim();

        // Base64 decode
        const encryptedBuf = Buffer.from(encryptedBase64, "base64");

        // Check for NARv1 version header
        const VERSION_HEADER = Buffer.from("NARv1", "utf-8");
        let iv: Buffer;
        let cipherData: Buffer;

        const hasHeader = encryptedBuf.length >= VERSION_HEADER.length + 16 &&
          encryptedBuf.subarray(0, VERSION_HEADER.length).equals(VERSION_HEADER);

        if (hasHeader) {
          iv = encryptedBuf.subarray(VERSION_HEADER.length, VERSION_HEADER.length + 16);
          cipherData = encryptedBuf.subarray(VERSION_HEADER.length + 16);
        } else {
          iv = Buffer.alloc(16, 0);
          cipherData = encryptedBuf;
        }

        const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(decoderKey, "utf-8"), iv);
        const decrypted = Buffer.concat([decipher.update(cipherData), decipher.final()]);

        // Skip BOM if present (matching Decoder page's skipBom exactly)
        let plainBytes = decrypted;
        if (plainBytes.length >= 3 && plainBytes[0] === 0xEF && plainBytes[1] === 0xBB && plainBytes[2] === 0xBF) {
          // UTF-8 BOM
          plainBytes = plainBytes.subarray(3);
        } else if (plainBytes.length >= 2 && ((plainBytes[0] === 0xFF && plainBytes[1] === 0xFE) || (plainBytes[0] === 0xFE && plainBytes[1] === 0xFF))) {
          // UTF-16 BOM
          plainBytes = plainBytes.subarray(2);
        }

        // Convert to UTF-8 string (matching Decoder page: new TextDecoder("utf-8").decode)
        const plainText = plainBytes.toString("utf-8");

        // Build output filename
        const decFileName = decodeFileKey.split("/").pop() || "file";
        const decBaseName = decFileName.replace(/\.txt$/i, "");
        const decNum = decBaseName.match(/\d+/)?.[0];
        const outputName = decNum ? `Level_${decNum}.asset` : `${decBaseName}.asset`;

        // Send as text/plain;charset=utf-8 (matching Decoder page's Blob type)
        const outBuf = Buffer.from(plainText, "utf-8");
        return new NextResponse(outBuf as unknown as BodyInit, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${outputName}"`,
            "Content-Length": String(outBuf.length),
          },
        });
      }

      case "encode": {
        // Server-side encryption of .asset content → encrypted Base64 .txt
        if (!path) {
          return NextResponse.json({ error: "Path is required for encode" }, { status: 400 });
        }

        const encoderKey = process.env.NAR_DECODER_KEY;
        if (!encoderKey || encoderKey.length !== 32) {
          return NextResponse.json(
            { error: "NAR_DECODER_KEY is not configured on the server. Add it to .env.local" },
            { status: 500 }
          );
        }

        const encodeFileKey = path.replace(/^\/+/, "");
        const encGetCmd = new GetObjectCommand({ Bucket, Key: encodeFileKey });
        const encGetRes = await s3.send(encGetCmd);

        if (!encGetRes.Body) {
          return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const plainContent = await encGetRes.Body.transformToString("utf-8");

        // Encrypt
        const encVersionHeader = Buffer.from("NARv1", "utf-8");
        const encIv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(encoderKey, "utf-8"), encIv);
        const encrypted = Buffer.concat([cipher.update(Buffer.from(plainContent, "utf-8")), cipher.final()]);

        // Build: VERSION_HEADER + IV + encrypted
        const resultBuf = Buffer.concat([encVersionHeader, encIv, encrypted]);
        const base64Result = resultBuf.toString("base64");

        return NextResponse.json({ content: base64Result });
      }

      case "buckets": {
        // Return which bucket(s) are configured
        return NextResponse.json({
          current: Bucket,
          available: [
            process.env.DO_SPACES_BUCKET || "narlevel",
            ...(process.env.DO_SPACES_EXTRA_BUCKETS?.split(",").map(b => b.trim()) || []),
          ].filter(Boolean),
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Spaces API Error:", err);
    return NextResponse.json(
      { error: err.message || "Spaces operation failed" },
      { status: 500 }
    );
  }
}

// Upload endpoint using FormData
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const targetPath = formData.get("path") as string;
    const aclParam = (formData.get("acl") as string) || "public";
    const encodeAsset = formData.get("encodeAsset") === "true";

    if (!file || targetPath === null || targetPath === undefined) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    const s3 = getS3Client();
    const Bucket = getBucket();

    // Build the full key prefix
    let prefix = (targetPath || "").replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";

    // Determine ACL: "public" -> "public-read", "private" -> "private"
    const acl = aclParam === "private" ? "private" : "public-read";

    let uploadBuffer: Buffer;
    let uploadKey: string;
    let contentType: string;

    if (encodeAsset && file.name.endsWith(".asset")) {
      // Server-side encryption: .asset -> encrypted .txt
      const encoderKey = process.env.NAR_DECODER_KEY;
      if (!encoderKey || encoderKey.length !== 32) {
        return NextResponse.json(
          { error: "NAR_DECODER_KEY is not configured on the server" },
          { status: 500 }
        );
      }

      const plainContent = Buffer.from(await file.arrayBuffer()).toString("utf-8");

      // Encrypt using NARv1 format
      const versionHeader = Buffer.from("NARv1", "utf-8");
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(encoderKey, "utf-8"), iv);
      const encrypted = Buffer.concat([cipher.update(Buffer.from(plainContent, "utf-8")), cipher.final()]);

      const resultBuf = Buffer.concat([versionHeader, iv, encrypted]);
      const base64Content = resultBuf.toString("base64");

      uploadBuffer = Buffer.from(base64Content, "utf-8");

      // Rename: Level_18.asset -> 18.txt
      const baseName = file.name.replace(/\.asset$/i, "");
      const num = baseName.match(/\d+/)?.[0];
      const txtName = num ? `${num}.txt` : `${baseName}.txt`;
      uploadKey = `${prefix}${txtName}`;
      contentType = "text/plain";
    } else {
      // Normal upload
      uploadBuffer = Buffer.from(await file.arrayBuffer());
      uploadKey = `${prefix}${file.name}`;
      contentType = file.type || "application/octet-stream";
    }

    const command = new PutObjectCommand({
      Bucket,
      Key: uploadKey,
      Body: uploadBuffer,
      ContentType: contentType,
      ACL: acl,
    });
    await s3.send(command);

    return NextResponse.json({ success: true, path: `/${uploadKey}` });
  } catch (err: any) {
    console.error("Spaces Upload Error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}
