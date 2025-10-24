import { request, getToken, BASE, ApiError } from "./client";
import type {
  DocumentResponse,
  DocumentStatusResponse,
  FolderResponse,
  FolderCreateRequest,
} from "../types/api";

export const documentsApi = {
  upload(file: File, folderId?: string | null): Promise<DocumentResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (folderId) fd.append("folder_id", folderId);
    return request<DocumentResponse>("/documents/upload", {
      method: "POST",
      body: fd,
      raw: true,
      json: false,
    });
  },
  list(folderId?: string | null): Promise<DocumentResponse[]> {
    return request<DocumentResponse[]>("/documents", {
      query: folderId ? { folder_id: folderId } : {},
    });
  },
  status(id: string): Promise<DocumentStatusResponse> {
    return request<DocumentStatusResponse>(`/documents/${id}/status`);
  },
  remove(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/documents/${id}`, { method: "DELETE" });
  },
  rename(id: string, name: string): Promise<DocumentResponse> {
    return request<DocumentResponse>(`/documents/${id}`, {
      method: "PATCH",
      body: { original_filename: name },
    });
  },
  createFolder(
    name: string,
    parentFolderId?: string | null,
  ): Promise<FolderResponse> {
    const payload: FolderCreateRequest = {
      name,
      parent_folder_id: parentFolderId ?? null,
    };
    return request<FolderResponse>("/documents/folders", {
      method: "POST",
      body: payload,
    });
  },
  listFolders(): Promise<FolderResponse[]> {
    return request<FolderResponse[]>("/documents/folders");
  },
  removeFolder(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/documents/folders/${id}`, {
      method: "DELETE",
    });
  },
};

export interface UploadHandle {
  promise: Promise<DocumentResponse>;
  abort: () => void;
}

/**
 * Upload a file with live byte-progress + abort support (Phase 5).
 * Uses XMLHttpRequest (fetch has no upload-progress event) and mirrors the
 * error shape the rest of the client uses (reads `error.message`).
 */
export function uploadWithProgress(
  file: File,
  folderId?: string | null,
  opts?: { onProgress?: (pct: number) => void; signal?: AbortSignal },
): UploadHandle {
  const fd = new FormData();
  fd.append("file", file);
  if (folderId) fd.append("folder_id", folderId);

  const xhr = new XMLHttpRequest();
  if (opts?.signal) opts.signal.addEventListener("abort", () => xhr.abort());

  const promise = new Promise<DocumentResponse>((resolve, reject) => {
    xhr.open("POST", `${BASE}/documents/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as DocumentResponse);
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = xhr.response as {
            error?: { message?: string };
            detail?: string;
            message?: string;
          };
          msg = body?.error?.message || body?.detail || body?.message || msg;
        } catch {
          /* ignore */
        }
        reject(new ApiError(msg, xhr.status, xhr.response));
      }
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload.", 0));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(fd);
  });

  return { promise, abort: () => xhr.abort() };
}
