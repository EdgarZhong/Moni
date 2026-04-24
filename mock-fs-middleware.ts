import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Roots (Relative to this file)
const ROOTS: Record<string, string> = {
  DATA: path.resolve(__dirname, 'virtual_android_filesys/sandbox_path')
};

function mapNodeEncoding(encoding?: string): BufferEncoding | undefined {
  if (!encoding) return undefined;
  if (encoding === 'utf8') return 'utf8';
  if (encoding === 'ascii') return 'ascii';
  if (encoding === 'utf16') return 'utf16le';
  return 'utf8';
}

// Ensure roots exist
Object.values(ROOTS).forEach(root => {
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
});

export function mockFsMiddleware(): Plugin {
  return {
    name: 'mock-fs-middleware',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/fs', async (req, res, next) => {
        if (!req.url) return next();

        // Simple helper to get body JSON
        const getBody = async () => {
          return new Promise<Record<string, unknown>>((resolve) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                resolve(JSON.parse(body));
              } catch {
                resolve({});
              }
            });
          });
        };

        const getAbsPath = (directory: string, relativePath: string) => {
          /**
           * 当前浏览器开发态 mock 已不再维护独立的 Documents 根目录。
           * 所有读写统一收口到 DATA，对齐当前正式持久化口径。
           */
          const root = ROOTS[directory] || ROOTS['DATA'];
          return path.join(root, relativePath || '');
        };

        try {
          if (req.method === 'POST') {
            const body = await getBody();
            const action = typeof body.action === 'string' ? body.action : '';
            const relPath = typeof body.path === 'string' ? body.path : '';
            const toPath = typeof body.toPath === 'string' ? body.toPath : '';
            const append = body.append === true;
            const content = typeof body.content === 'string'
              ? body.content
              : (body.content === undefined ? '' : String(body.content));
            
            /**
             * 开发态 mock 固定把所有目录请求映射到 DATA。
             * 即便上层仍传 DOCUMENTS，也只作为兼容输入，不再单独落到旧路径。
             */
            const targetDirKey = 'DATA';
            const absPath = getAbsPath(targetDirKey, relPath);

            // console.log(`[MockFS] ${action} -> ${relPath} (Dir: ${targetDirKey})`);

            if (action === 'read') {
              if (fs.existsSync(absPath)) {
                const encoding = mapNodeEncoding(typeof body.encoding === 'string' ? body.encoding : undefined);
                let data: string;
                if (encoding) {
                  // 模拟 Capacitor：显式传 encoding 时返回文本
                  data = fs.readFileSync(absPath, encoding);
                } else {
                  // 模拟 Capacitor：不传 encoding 时返回 base64（保留原始字节）
                  data = fs.readFileSync(absPath).toString('base64');
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ data }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'File not found' }));
              }
            } else if (action === 'write') {
              // Ensure dir exists
              const dir = path.dirname(absPath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              const flag = append ? 'a' : 'w';
              fs.writeFileSync(absPath, content, { encoding: 'utf-8', flag });
              res.end(JSON.stringify({ success: true }));
            } else if (action === 'append') {
               // Ensure dir exists
               const dir = path.dirname(absPath);
               if (!fs.existsSync(dir)) {
                 fs.mkdirSync(dir, { recursive: true });
               }
               fs.appendFileSync(absPath, content, 'utf-8');
               res.end(JSON.stringify({ success: true }));
            } else if (action === 'delete') {
              if (fs.existsSync(absPath)) {
                const stat = fs.statSync(absPath);
                if (stat.isDirectory()) {
                  fs.rmSync(absPath, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(absPath);
                }
                res.end(JSON.stringify({ success: true }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'File not found' }));
              }
            } else if (action === 'rename') {
              const toDirKey = 'DATA';
              const toAbsPath = getAbsPath(toDirKey, toPath);
              
              if (fs.existsSync(absPath)) {
                // Ensure dest dir exists
                const destDir = path.dirname(toAbsPath);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }
                fs.renameSync(absPath, toAbsPath);
                res.end(JSON.stringify({ success: true }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Source file not found' }));
              }
            } else if (action === 'stat') {
              if (fs.existsSync(absPath)) {
                const stat = fs.statSync(absPath);
                res.end(JSON.stringify({ 
                  exists: true,
                  type: stat.isDirectory() ? 'directory' : 'file',
                  size: stat.size,
                  mtime: stat.mtimeMs,
                  ctime: stat.ctimeMs,
                  uri: absPath
                }));
              } else {
                res.end(JSON.stringify({ exists: false }));
              }
            } else if (action === 'mkdir') {
              fs.mkdirSync(absPath, { recursive: true });
              res.end(JSON.stringify({ success: true }));
            } else if (action === 'rmdir') {
               if (fs.existsSync(absPath)) {
                 fs.rmdirSync(absPath); // recursive default false, matches capacitor default? Capacitor rmdir has recursive option
                 res.end(JSON.stringify({ success: true }));
               } else {
                 res.statusCode = 404;
                 res.end(JSON.stringify({ error: 'Directory not found' }));
               }
            } else if (action === 'readdir') {
              if (fs.existsSync(absPath)) {
                const files = fs.readdirSync(absPath, { withFileTypes: true });
                const result = files.map(f => ({
                  name: f.name,
                  type: f.isDirectory() ? 'directory' : 'file',
                  mtime: fs.statSync(path.join(absPath, f.name)).mtimeMs,
                  size: f.isDirectory() ? 0 : fs.statSync(path.join(absPath, f.name)).size,
                  ctime: fs.statSync(path.join(absPath, f.name)).ctimeMs,
                  uri: f.name
                }));
                res.end(JSON.stringify({ files: result }));
              } else {
                res.end(JSON.stringify({ files: [] }));
              }
            } else {
              res.statusCode = 400;
              res.end('Unknown action');
            }
          } else {
            next();
          }
        } catch (e) {
          console.error('[MockFS] Error:', e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    }
  };
}
