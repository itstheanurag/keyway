export interface ShareEntry {
  file: File;
  relativePath: string;
}

export function getRelativePath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function getFolderInfo(entries: ShareEntry[]) {
  const totalSize = entries.reduce((sum, e) => sum + e.file.size, 0);
  return {
    name: getFolderName(entries),
    fileCount: entries.length,
    totalSize,
  };
}

export function getFolderName(entries: ShareEntry[]): string {
  if (entries.length === 0) return "folder";

  const firstPath = entries[0].relativePath;
  const slashIndex = firstPath.indexOf("/");
  if (slashIndex > 0) {
    return firstPath.slice(0, slashIndex);
  }

  return "folder";
}

export function entriesFromFileList(files: FileList | File[]): ShareEntry[] {
  return Array.from(files).map((file) => ({
    file,
    relativePath: getRelativePath(file),
  }));
}

export function isFolderShare(entries: ShareEntry[]): boolean {
  return entries.some((entry) => entry.relativePath.includes("/"));
}

type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
};

type FileSystemFileEntry = FileSystemEntry & {
  file: (
    success: (file: File) => void,
    error?: (err: Error) => void,
  ) => void;
};

type FileSystemDirectoryEntry = FileSystemEntry & {
  createReader: () => {
    readEntries: (
      success: (entries: FileSystemEntry[]) => void,
      error?: (err: Error) => void,
    ) => void;
  };
};

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryEntry["createReader"] extends () => infer R
    ? R
    : never,
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];

  const readBatch = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

  let batch = await readBatch();
  while (batch.length > 0) {
    all.push(...batch);
    batch = await readBatch();
  }

  return all;
}

async function traverseEntry(
  entry: FileSystemEntry,
  parentPath: string,
  results: ShareEntry[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;
    results.push({ file, relativePath });
    return;
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const children = await readAllDirectoryEntries(reader);
    const dirPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    for (const child of children) {
      await traverseEntry(child, dirPath, results);
    }
  }
}

export async function entriesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<ShareEntry[]> {
  const items = dataTransfer.items;
  if (!items || items.length === 0) {
    return entriesFromFileList(dataTransfer.files);
  }

  const results: ShareEntry[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;

    const entry = item.webkitGetAsEntry?.() as FileSystemEntry | null;
    if (entry) {
      await traverseEntry(entry, "", results);
    } else {
      const file = item.getAsFile();
      if (file) {
        results.push({ file, relativePath: file.name });
      }
    }
  }

  return results.length > 0 ? results : entriesFromFileList(dataTransfer.files);
}