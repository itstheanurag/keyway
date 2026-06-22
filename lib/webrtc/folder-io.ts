export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window &&
    typeof (window as Window & { showDirectoryPicker?: unknown })
      .showDirectoryPicker === "function"
  );
}

export async function openDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const showDirectoryPicker = (window as any).showDirectoryPicker;
    return await showDirectoryPicker();
  } catch (error) {
    if ((error as Error).name === "AbortError") return null;
    throw error;
  }
}

export async function saveFileToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob,
): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Invalid relative path");
  }

  const fileName = parts[parts.length - 1];
  let currentDir = dirHandle;

  for (const part of parts.slice(0, -1)) {
    currentDir = await currentDir.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export function flattenPathForDownload(relativePath: string): string {
  return relativePath.replace(/\//g, "__");
}