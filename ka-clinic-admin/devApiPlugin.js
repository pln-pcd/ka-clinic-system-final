// Dev-only Vite middleware that serves the repo's /api serverless functions.
//
// Why this exists: `vercel dev`'s function runtime crashes on Node 24 +
// Windows (libuv "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"),
// so every /api/* request 500s locally before the handler even runs. That
// makes the patient app untestable on a real device. This loads the same
// handler modules directly in Vite's own Node process instead.
//
// Deployment is unaffected: Vercel ignores this plugin's middleware entirely
// and runs api/*.js as real serverless functions. This only ever applies to
// `vite dev`, and is a no-op in `vite build`.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, '..', 'api');
const VERCEL_JSON = resolve(HERE, '..', 'vercel.json');
const ENV_FILES = ['.env', '.env.local'];

// The exact-path /api rewrites from vercel.json, so old URLs such as
// /api/send-otp reach the merged function (/api/patient-auth?route=send-otp)
// the same way they do on Vercel. Read on every request, like the handlers.
async function loadApiRewrites() {
  const config = JSON.parse(await readFile(VERCEL_JSON, 'utf8'));
  const out = {};
  for (const { source, destination } of config.rewrites || []) {
    if (/^\/api\/[\w-]+$/.test(source)) out[source.slice('/api/'.length)] = new URL(destination, 'http://localhost');
  }
  return out;
}

// Minimal .env loader. The api handlers read process.env directly (GEMINI_API_KEY,
// CRON_SECRET, FIREBASE_*), and Vite's own loadEnv only exposes VITE_-prefixed
// vars to the client — it does not populate process.env for server code.
async function loadRepoEnv(force = false) {
  for (const name of ENV_FILES) {
    const file = resolve(HERE, '..', name);
    if (!existsSync(file)) continue;
    const raw = await readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip one layer of matching quotes, as dotenv does.
      if (value.length > 1 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
        value = value.slice(1, -1);
      }
      if (force || process.env[key] === undefined) process.env[key] = value;
    }
  }
}

// Collect the raw request body. Vercel's runtime parses JSON into req.body for
// the handler; replicate just that much.
function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectPromise);
  });
}

// The subset of the Vercel/Express response API the handlers actually use:
// res.status(n).json(obj), plus res.setHeader for cookie-setting endpoints.
function makeRes(nodeRes) {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    setHeader(name, value) { nodeRes.setHeader(name, value); return this; },
    json(payload) {
      nodeRes.statusCode = statusCode;
      nodeRes.setHeader('Content-Type', 'application/json');
      nodeRes.end(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      nodeRes.statusCode = statusCode;
      nodeRes.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
      return this;
    },
    end(payload) { nodeRes.statusCode = statusCode; nodeRes.end(payload); return this; },
  };
}

export function devApiPlugin() {
  return {
    name: 'kna-dev-api',
    apply: 'serve', // never runs during build
    async configureServer(server) {
      // `npm run dev:emulator` (vite --mode emulator): the /api handlers use the
      // local Firebase Emulator instead of the live project.
      if (server.config.mode === 'emulator') {
        process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
        process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
        process.env.FIREBASE_EMULATOR_PROJECT_ID ||= 'demo-ka-clinic';
        console.log('[dev-api] emulator mode: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099, project demo-ka-clinic');
      }
      await loadRepoEnv();

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();

        await loadRepoEnv(true);

        let route = url.pathname.slice('/api/'.length).replace(/\/+$/, '');
        // Mirror vercel.json rewrites, including the query each one adds.
        const rewrite = (await loadApiRewrites())[route];
        if (rewrite) {
          route = rewrite.pathname.slice('/api/'.length);
          for (const [key, value] of rewrite.searchParams) {
            if (!url.searchParams.has(key)) url.searchParams.set(key, value);
          }
        }

        // Guard against path traversal reaching outside api/.
        const file = resolve(API_DIR, `${route}.js`);
        if (!file.startsWith(API_DIR) || !existsSync(file)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: `No API route /api/${route}` }));
          return;
        }

        try {
          // Cache-busted so editing a handler is picked up without restarting
          // Vite, matching the hot-reload behavior of the rest of dev.
          const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
          const handler = mod.default;
          if (typeof handler !== 'function') {
            throw new Error(`api/${route}.js has no default export function`);
          }

          const raw = await readBody(req);
          let body = {};
          if (raw) {
            try { body = JSON.parse(raw); } catch { body = raw; }
          }

          const shim = {
            ...req,
            method: req.method,
            headers: req.headers,
            query: Object.fromEntries(url.searchParams),
            body,
          };

          await handler(shim, makeRes(res));
        } catch (err) {
          console.error(`[dev-api] /api/${route} failed:`, err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err?.message || 'Handler error.' }));
          }
        }
      });

      console.log(`[dev-api] serving /api/* from ${API_DIR}`);
    },
  };
}
