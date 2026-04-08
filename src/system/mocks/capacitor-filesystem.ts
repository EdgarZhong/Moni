// Mock Capacitor's Filesystem API to talk to our Vite Middleware
import type { ReaddirResult, ReadFileResult, WriteFileOptions } from '@capacitor/filesystem';

// Define Enums locally to avoid importing from the module we are mocking (Circular Dependency)
export const Directory = {
  Documents: 'DOCUMENTS',
  Data: 'DATA',
  Library: 'LIBRARY',
  Cache: 'CACHE',
  External: 'EXTERNAL',
  ExternalStorage: 'EXTERNAL_STORAGE'
} as const;

export type Directory = (typeof Directory)[keyof typeof Directory];

export const Encoding = {
  UTF8: 'utf8',
  ASCII: 'ascii',
  UTF16: 'utf16'
} as const;

export type Encoding = (typeof Encoding)[keyof typeof Encoding];

// Helper to bridge to our Vite Middleware
type ApiPayload = Record<string, unknown>;
type ApiFileEntry = { name: string; type: string; size?: number; mtime: number; uri?: string; ctime?: number };

const apiCall = async (action: string, payload: ApiPayload) => {
  try {
    const res = await fetch('/api/fs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const json = await res.json();
    if (res.status >= 400) throw new Error(json.error || 'Unknown error');
    return json;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!(action === 'read' && message.includes('File not found'))) {
      console.error(`[MockFS] API Call Failed (${action}):`, e);
    }
    throw e;
  }
};

// Mock Implementation
export const Filesystem = {
  requestPermissions: async () => {
    console.log('[MockFS] requestPermissions called. Auto-granting.');
    return { publicStorage: 'granted' };
  },

  writeFile: async (options: WriteFileOptions) => {
    console.log('[MockFS] writeFile:', options.path);
    const { path: relPath, data, directory } = options;
    return apiCall('write', { path: relPath, content: data, directory });
  },

  appendFile: async (options: { path: string, data: string, directory?: string, encoding?: Encoding }) => {
    console.log('[MockFS] appendFile:', options.path);
    const { path: relPath, data, directory } = options;
    return apiCall('append', { path: relPath, content: data, directory });
  },

  deleteFile: async (options: { path: string, directory?: string }) => {
    console.log('[MockFS] deleteFile:', options.path);
    const { path: relPath, directory } = options;
    return apiCall('delete', { path: relPath, directory });
  },

  mkdir: async (options: { path: string, directory?: string, recursive?: boolean }) => {
    console.log('[MockFS] mkdir:', options);
    const { path: relPath, directory } = options;
    return apiCall('mkdir', { path: relPath, directory });
  },

  rmdir: async (options: { path: string, directory?: string, recursive?: boolean }) => {
    console.log('[MockFS] rmdir:', options);
    const { path: relPath, directory } = options;
    return apiCall('rmdir', { path: relPath, directory });
  },

  readdir: async (options: { path: string, directory?: string }): Promise<ReaddirResult> => {
    console.log('[MockFS] readdir:', options);
    const { path: relPath, directory } = options;
    const { files } = await apiCall('readdir', { path: relPath, directory });
    // Convert backend format to Capacitor format
    return {
      files: (files as ApiFileEntry[]).map((f) => ({
        name: f.name,
        type: f.type === 'directory' ? 'directory' : 'file',
        size: f.size || 0,
        mtime: f.mtime,
        uri: f.uri || '',
        ctime: f.ctime || f.mtime
      }))
    };
  },

  readFile: async (options: { path: string, directory?: string, encoding?: Encoding }): Promise<ReadFileResult> => {
    // console.log('[MockFS] readFile:', options.path);
    const { path: relPath, directory } = options;
    const { data } = await apiCall('read', { path: relPath, directory });
    return {
      data: data
    };
  },

  stat: async (options: { path: string, directory?: string }) => {
    // console.log('[MockFS] stat:', options.path);
    const { path: relPath, directory } = options;
    const { exists, type, size, mtime, ctime, uri } = await apiCall('stat', { path: relPath, directory });
    if (!exists) throw new Error('File does not exist');
    return { type: type || 'file', size: size || 0, ctime: ctime || 0, mtime: mtime || 0, uri: uri || '' };
  },

  rename: async (options: { from: string, to: string, directory?: string, toDirectory?: string }) => {
    console.log('[MockFS] rename:', options.from, '->', options.to);
    const { from, to, directory, toDirectory } = options;
    return apiCall('rename', { path: from, toPath: to, directory, toDirectory });
  },

  copy: async (options: { from: string, to: string, directory?: string, toDirectory?: string }) => {
      console.warn('[MockFS] copy: Not implemented yet, falling back to read+write');
      // Polyfill using read + write
      const { from, to, directory, toDirectory } = options;
      const { data } = await apiCall('read', { path: from, directory });
      return apiCall('write', { path: to, content: data, directory: toDirectory || directory });
  },
  
  getUri: async (options: { path: string, directory?: string }) => {
     return { uri: options.path };
  }
};
