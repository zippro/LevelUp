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

    if (!file || targetPath === null || targetPath === undefined) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    const s3 = getS3Client();
    const Bucket = getBucket();

    const buffer = Buffer.from(await file.arrayBuffer());

    // Build the full key
    let prefix = (targetPath || "").replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    const key = `${prefix}${file.name}`;

    // Determine ACL: "public" -> "public-read", "private" -> "private"
    const acl = aclParam === "private" ? "private" : "public-read";

    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
      ACL: acl,
    });
    await s3.send(command);

    return NextResponse.json({ success: true, path: `/${key}` });
  } catch (err: any) {
    console.error("Spaces Upload Error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}
