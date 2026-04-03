import { NextRequest, NextResponse } from "next/server";
import SftpClient from "ssh2-sftp-client";

function getSftpConfig() {
  const host = process.env.DO_SERVER_HOST;
  const port = parseInt(process.env.DO_SERVER_PORT || "22", 10);
  const username = process.env.DO_SERVER_USER || "root";
  const password = process.env.DO_SERVER_PASSWORD;
  const privateKey = process.env.DO_SERVER_PRIVATE_KEY;

  if (!host) {
    throw new Error("DO_SERVER_HOST is not configured. Go to .env.local and set it.");
  }

  const config: any = { host, port, username };

  if (privateKey) {
    // If it looks like a path, read the file
    config.privateKey = privateKey;
  } else if (password) {
    config.password = password;
  } else {
    throw new Error("No authentication method configured. Set DO_SERVER_PASSWORD or DO_SERVER_PRIVATE_KEY.");
  }

  return config;
}

// POST handler for all SFTP operations
export async function POST(request: NextRequest) {
  const sftp = new SftpClient();

  try {
    const body = await request.json();
    const { action, path, newPath, content } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const config = getSftpConfig();
    await sftp.connect(config);

    switch (action) {
      case "list": {
        const targetPath = path || "/";
        const list = await sftp.list(targetPath);
        const items = list.map((item: any) => ({
          name: item.name,
          type: item.type === "d" ? "directory" : item.type === "l" ? "symlink" : "file",
          size: item.size,
          modifyTime: item.modifyTime,
          accessTime: item.accessTime,
          rights: item.rights,
          owner: item.owner,
          group: item.group,
        }));

        // Sort: directories first, then files, both alphabetical
        items.sort((a: any, b: any) => {
          if (a.type === "directory" && b.type !== "directory") return -1;
          if (a.type !== "directory" && b.type === "directory") return 1;
          return a.name.localeCompare(b.name);
        });

        return NextResponse.json({ items, path: targetPath });
      }

      case "download": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for download" }, { status: 400 });
        }

        const buffer = await sftp.get(path) as Buffer;
        const fileName = path.split("/").pop() || "file";
        const uint8 = new Uint8Array(buffer);

        return new NextResponse(uint8, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Length": String(buffer.length),
          },
        });
      }

      case "view": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for view" }, { status: 400 });
        }

        // Get file stats to check size
        const stats = await sftp.stat(path);
        const MAX_VIEW_SIZE = 2 * 1024 * 1024; // 2MB max for viewing

        if (stats.size > MAX_VIEW_SIZE) {
          return NextResponse.json(
            { error: "File too large to preview (max 2MB)" },
            { status: 400 }
          );
        }

        const fileBuffer = await sftp.get(path) as Buffer;
        const fileContent = fileBuffer.toString("utf-8");

        return NextResponse.json({ content: fileContent, size: stats.size });
      }

      case "delete": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for delete" }, { status: 400 });
        }

        // Check if it's a directory
        const statResult = await sftp.stat(path);
        if (statResult.isDirectory) {
          await sftp.rmdir(path, true); // recursive delete
        } else {
          await sftp.delete(path);
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

        await sftp.rename(path, newPath);
        return NextResponse.json({ success: true });
      }

      case "mkdir": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for mkdir" }, { status: 400 });
        }

        await sftp.mkdir(path, true); // recursive
        return NextResponse.json({ success: true });
      }

      case "stat": {
        if (!path) {
          return NextResponse.json({ error: "Path is required for stat" }, { status: 400 });
        }

        const info = await sftp.stat(path);
        return NextResponse.json({
          size: info.size,
          isDirectory: info.isDirectory,
          modifyTime: info.modifyTime,
          accessTime: info.accessTime,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("SFTP Error:", err);
    return NextResponse.json(
      { error: err.message || "SFTP operation failed" },
      { status: 500 }
    );
  } finally {
    try {
      await sftp.end();
    } catch {
      // ignore disconnect errors
    }
  }
}

// Separate upload endpoint using FormData
export async function PUT(request: NextRequest) {
  const sftp = new SftpClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const targetPath = formData.get("path") as string;

    if (!file || !targetPath) {
      return NextResponse.json(
        { error: "File and path are required" },
        { status: 400 }
      );
    }

    const config = getSftpConfig();
    await sftp.connect(config);

    const buffer = Buffer.from(await file.arrayBuffer());
    const fullPath = targetPath.endsWith("/")
      ? `${targetPath}${file.name}`
      : `${targetPath}/${file.name}`;

    await sftp.put(buffer, fullPath);

    return NextResponse.json({ success: true, path: fullPath });
  } catch (err: any) {
    console.error("SFTP Upload Error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  } finally {
    try {
      await sftp.end();
    } catch {
      // ignore disconnect errors
    }
  }
}
