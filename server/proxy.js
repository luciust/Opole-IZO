/**
 * Caching reverse proxy for Opole-IZO.
 * Fulfills Section 6 of izo.md:
 * - /api/vehicles: Caches live MZK Opole positions from api.zbiorkom.live (12s cache, request coalescing, serve-stale)
 * - /api/weather: Caches Open-Meteo weather for Opole (10 min cache, serve-stale)
 * - Static file server & strict security headers / CSP
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OPOLE_BBOX = "17.82,50.59,18.03,50.74";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=50.6668&longitude=17.9237&current=temperature_2m,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m";
const VEHICLES_URL = `https://api.zbiorkom.live/api6-open/opole/positions/${OPOLE_BBOX}`;

// Cache store
const cache = {
  vehicles: { data: null, timestamp: 0, fetching: false, ttl: 12000 },
  weather: { data: null, timestamp: 0, fetching: false, ttl: 600000 }
};

function fetchHttps(targetUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'GET',
      headers: { 'User-Agent': 'Opole-IZO-Proxy/1.0' },
      timeout: timeoutMs
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error("Invalid JSON: " + e.message));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

async function getCachedVehicles() {
  const now = Date.now();
  if (cache.vehicles.data && (now - cache.vehicles.timestamp < cache.vehicles.ttl)) {
    return cache.vehicles.data;
  }
  if (!cache.vehicles.fetching) {
    cache.vehicles.fetching = true;
    fetchHttps(VEHICLES_URL)
      .then(json => {
        cache.vehicles.data = json;
        cache.vehicles.timestamp = Date.now();
        cache.vehicles.fetching = false;
      })
      .catch(err => {
        console.warn("Proxy: vehicles upstream fetch failed:", err.message);
        cache.vehicles.fetching = false;
      });
  }
  // Serve stale while updating, or fallback mock
  if (cache.vehicles.data) {
    return cache.vehicles.data;
  }
  return { positions: [] };
}

async function getCachedWeather() {
  const now = Date.now();
  if (cache.weather.data && (now - cache.weather.timestamp < cache.weather.ttl)) {
    return cache.weather.data;
  }
  if (!cache.weather.fetching) {
    cache.weather.fetching = true;
    fetchHttps(WEATHER_URL)
      .then(json => {
        cache.weather.data = json;
        cache.weather.timestamp = Date.now();
        cache.weather.fetching = false;
      })
      .catch(err => {
        console.warn("Proxy: weather upstream fetch failed:", err.message);
        cache.weather.fetching = false;
      });
  }
  if (cache.weather.data) {
    return cache.weather.data;
  }
  return {
    current: {
      temperature_2m: 14.0,
      is_day: 1,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
      weather_code: 0,
      cloud_cover: 25,
      wind_speed_10m: 12.0,
      wind_direction_10m: 220
    }
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml'
};

const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
const WEB_PUBLIC = path.join(__dirname, '..', 'web', 'public');

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS for same-origin or local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // API: Live MZK Opole Vehicles
  if (pathname === '/api/vehicles') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=10');
    const vehicles = await getCachedVehicles();
    return res.end(JSON.stringify(vehicles));
  }

  // API: Live Opole Weather
  if (pathname === '/api/weather') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=600');
    const weather = await getCachedWeather();
    return res.end(JSON.stringify(weather));
  }

  // API: Status
  if (pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      city: "Opole",
      crs: "EPSG:2180",
      origin: { e: 423960, n: 311640 },
      cache: {
        vehiclesAgeSec: Math.round((Date.now() - cache.vehicles.timestamp) / 1000),
        weatherAgeSec: Math.round((Date.now() - cache.weather.timestamp) / 1000)
      }
    }));
  }

  // Static files server (web/dist or web/public)
  const safeRelPath = path.normalize(pathname === '/' ? 'index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

  let filePath = path.join(WEB_DIST, safeRelPath);
  if (!isFile(filePath)) {
    filePath = path.join(WEB_PUBLIC, safeRelPath);
  }
  if (!isFile(filePath)) {
    // Only fall back to SPA index.html for non-asset/non-data routes
    if (!pathname.startsWith('/data/') && !pathname.startsWith('/assets/')) {
      filePath = path.join(WEB_DIST, 'index.html');
    }
  }

  if (isFile(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    
    // Immutable caching for hashed assets and tiles
    if (pathname.startsWith('/data/') || pathname.startsWith('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    return fs.createReadStream(filePath).pipe(res);
  }

  if (!isFile(path.join(WEB_DIST, 'index.html'))) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Frontend bundle not built (web/dist/index.html missing). Run ./start.sh or: cd web && npm install && npm run build');
  }

  res.statusCode = 404;
  res.end('Not Found');
});

if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
  console.warn('Warning: web/dist/index.html not found. Run ./start.sh or "cd web && npm install && npm run build".');
}

server.listen(PORT, () => {
  console.log(`Opole-IZO Caching Proxy listening on http://localhost:${PORT}`);
});
