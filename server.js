'use strict';
/**
 * TurnAhead — a dependency-free Node 22+ queue server.
 * One deployment = one facility. SQLite persists tickets; SSE pushes live changes.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { qrSvg } = require('./lib/qr-svg');

const root = __dirname;
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const PRODUCTION = process.env.NODE_ENV === 'production';
if (!PASSWORD || PASSWORD.length < 12 || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('Set ADMIN_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters) in .env. See .env.example.');
  process.exit(1);
}
const FACILITY_NAME = (process.env.FACILITY_NAME || 'TurnAhead Demo Clinic').slice(0, 65);
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Karachi';
// Render provides the canonical HTTPS URL after deployment. Custom domains can
// override it with PUBLIC_URL. Never bake a localhost address into QR tickets.
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
const dataDir = path.resolve(root, process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'turnahead.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS queues (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL UNIQUE,
 avg_minutes INTEGER NOT NULL DEFAULT 8, paused INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
 id TEXT PRIMARY KEY, queue_id TEXT NOT NULL REFERENCES queues(id),
 date_key TEXT NOT NULL, number INTEGER NOT NULL, code TEXT NOT NULL,
 secret TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'waiting',
 created_at TEXT NOT NULL, called_at TEXT, finished_at TEXT,
 UNIQUE(queue_id,date_key,number)
);
CREATE INDEX IF NOT EXISTS tickets_queue_date ON tickets(queue_id,date_key,status,number);
`);
if (db.prepare('SELECT COUNT(*) AS n FROM queues').get().n === 0) {
  db.prepare('INSERT INTO queues (id,name,prefix,avg_minutes,created_at) VALUES (?,?,?,?,?)').run('general-opd', 'General OPD', 'A', 8, new Date().toISOString());
}
const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
function today() { const d = new Date(); const parts=fmtDay.formatToParts(d); const y=parts.find(p=>p.type==='year').value; const m=parts.find(p=>p.type==='month').value; const day=parts.find(p=>p.type==='day').value; return `${y}-${m}-${day}`; }
const now = () => new Date().toISOString();
const publicDir = path.join(root, 'public');
const sessionsMaxAge = 60 * 60 * 10;
const clients = new Set();
const attempts = new Map();
function signal() { for (const response of clients) { try { response.write(`event: change\ndata: ${Date.now()}\n\n`); } catch { clients.delete(response); } } }
function reply(res, code, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(body);
}
const failure = (res,code,message) => reply(res,code,{error:message});
function getCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('=')).filter(x=>x.length===2)); }
function sign(data) { return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url'); }
function validAuth(req) {
  const token = getCookies(req).ta_session;
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected=sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return false;
  try { const d=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); return d.role==='reception' && d.exp>Date.now(); } catch { return false; }
}
function sessionCookie(req, token, maxAge) {
  const secure = PRODUCTION ? '; Secure' : '';
  return `ta_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function requireAuth(req, res) { if (!validAuth(req)) { failure(res,401,'Reception login required'); return false; } return true; }
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // CLI/server-side callers still need the signed session for private routes
  const authorized = new Set();
  const proto = (req.headers['x-forwarded-proto']==='https')?'https':(req.socket.encrypted?'https':'http');
  if (req.headers.host) authorized.add(`${proto}://${req.headers.host}`);
  if (PUBLIC_URL) { try {authorized.add(new URL(PUBLIC_URL).origin);} catch {} }
  return authorized.has(origin);
}
async function readBody(req) {
  if (!(req.headers['content-type']||'').includes('application/json')) throw Object.assign(new Error('Content-Type must be application/json'),{status:415});
  let s='';
  for await (const chunk of req) { s += chunk; if (s.length>8192) throw Object.assign(new Error('Request body too large'),{status:413}); }
  try { return JSON.parse(s || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'),{status:400}); }
}
function listQueues() { return db.prepare('SELECT * FROM queues ORDER BY created_at').all(); }
function stats(queue) {
  const day=today();
  const rows=db.prepare('SELECT * FROM tickets WHERE queue_id=? AND date_key=? ORDER BY number').all(queue.id,day);
  const waiting=rows.filter(t=>t.status==='waiting');
  const active=rows.find(t=>t.status==='called');
  const served=rows.filter(t=>t.status==='completed');
  const skipped=rows.filter(t=>t.status==='skipped');
  const completedRecent=db.prepare("SELECT called_at,finished_at FROM tickets WHERE queue_id=? AND status='completed' AND called_at IS NOT NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 12").all(queue.id);
  const samples=completedRecent.map(t=>(new Date(t.finished_at)-new Date(t.called_at))/60000).filter(n=>n>=1 && n<=90);
  const avg=samples.length>=3?Math.round(samples.reduce((a,b)=>a+b,0)/samples.length):queue.avg_minutes;
  return {id:queue.id,name:queue.name,prefix:queue.prefix,paused:!!queue.paused,avgMinutes:avg,waiting:waiting.length,served:served.length,skipped:skipped.length,total:rows.length,active:active ? {id:active.id,code:active.code,calledAt:active.called_at}:null};
}
function publicQueues() { return listQueues().map(stats); }
function fullOverview() {
  return {facility:FACILITY_NAME, date:today(), queues:publicQueues(), tickets:db.prepare('SELECT id, queue_id,code,status,created_at,called_at,finished_at,number FROM tickets WHERE date_key=? ORDER BY created_at DESC LIMIT 120').all(today())};
}
function getTracking(secret) {
  if (!/^[a-zA-Z0-9_-]{24,}$/.test(secret)) return null;
  const ticket=db.prepare('SELECT * FROM tickets WHERE secret=?').get(secret);
  if (!ticket) return null;
  const queue=db.prepare('SELECT * FROM queues WHERE id=?').get(ticket.queue_id);
  if (!queue) return null;
  const summary=stats(queue);
  let status=ticket.status;
  if (ticket.date_key!==today() && (status==='waiting'||status==='called')) status='expired';
  const active=summary.active;
  const earlier=db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE queue_id=? AND date_key=? AND status='waiting' AND number<?").get(queue.id,ticket.date_key,ticket.number).n;
  const ahead=earlier + ((active && status==='waiting')?1:0);
  const approx=summary.paused ? null : Math.max(1,Math.round(ahead*summary.avgMinutes));
  const window=approx===null?null:[Math.max(1,Math.floor(approx*.7)),Math.max(2,Math.ceil(approx*1.4))];
  return {facility:FACILITY_NAME,code:ticket.code,queue:queue.name,status,issuedAt:ticket.created_at,calledAt:ticket.called_at,finishedAt:ticket.finished_at,peopleAhead:status==='waiting'?ahead:0,estimatedMinutes:status==='waiting'?window:null,avgMinutes:summary.avgMinutes,nowServing:active?.code||null,paused:summary.paused,date:ticket.date_key};
}
function transactional(action) { db.exec('BEGIN IMMEDIATE'); try { const r=action(); db.exec('COMMIT'); return r; } catch(e) { db.exec('ROLLBACK'); throw e; } }
function queueById(id) { return db.prepare('SELECT * FROM queues WHERE id=?').get(id); }
function ensureQueue(res,id) { const q=queueById(id); if(!q) failure(res,404,'Queue not found'); return q; }
const token=()=>crypto.randomBytes(18).toString('base64url');
function createTicket(queue) {
  return transactional(()=>{
    const number=db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM tickets WHERE queue_id=? AND date_key=?').get(queue.id,today()).n;
    const code=`${queue.prefix}-${String(number).padStart(3,'0')}`;
    const id=crypto.randomUUID(); const secret=token();
    db.prepare('INSERT INTO tickets (id,queue_id,date_key,number,code,secret,status,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id,queue.id,today(),number,code,secret,'waiting',now());
    return {id,code,secret,queue:queue.name,createdAt:now()};
  });
}
function changeStatus(queue, type) {
  return transactional(()=>{
    const current=db.prepare("SELECT * FROM tickets WHERE queue_id=? AND date_key=? AND status='called' ORDER BY number LIMIT 1").get(queue.id,today());
    if(type==='next') {
      if(queue.paused) return {error:'Queue is paused. Resume it first.',code:409};
      if(current) return {error:'Finish or skip the current ticket before calling next.',code:409};
      const next=db.prepare("SELECT * FROM tickets WHERE queue_id=? AND date_key=? AND status='waiting' ORDER BY number LIMIT 1").get(queue.id,today());
      if(!next) return {error:'No waiting tickets in this queue.',code:409};
      db.prepare("UPDATE tickets SET status='called',called_at=? WHERE id=?").run(now(),next.id);
      return {code:next.code,action:'called'};
    }
    if(!current) return {error:'There is no active ticket.',code:409};
    if(type==='complete'||type==='skip') {
      db.prepare('UPDATE tickets SET status=?,finished_at=? WHERE id=?').run(type==='complete'?'completed':'skipped',now(),current.id);
      return {code:current.code,action:type};
    }
    return {error:'Unknown action',code:400};
  });
}
function ticketUrl(req, secret) {
  if(PUBLIC_URL) return `${PUBLIC_URL.replace(/\/$/,'')}/track/${secret}`;
  const protocol=PRODUCTION || req.socket.encrypted || req.headers['x-forwarded-proto']==='https' ? 'https' : 'http';
  return `${protocol}://${req.headers.host || `localhost:${PORT}`}/track/${secret}`;
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function staticFile(res, requested) {
  const file=path.resolve(publicDir, '.'+requested);
  if(!file.startsWith(publicDir+path.sep)) return failure(res,403,'Forbidden');
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile()) return failure(res,404,'Page not found');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=3600','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin'});
    fs.createReadStream(file).pipe(res);
  });
}
async function handler(req,res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  let url;
  try { url=new URL(req.url, `http://${req.headers.host||'localhost'}`); } catch {return failure(res,400,'Invalid URL');}
  const pathname=url.pathname;
  try {
    if(pathname==='/api/health'&&req.method==='GET') return reply(res,200,{ok:true,service:'TurnAhead',date:today()});
    if(pathname==='/api/session'&&req.method==='GET') return reply(res,200,{authenticated:validAuth(req),facility:FACILITY_NAME});
    if(pathname==='/api/public/queues'&&req.method==='GET') return reply(res,200,{facility:FACILITY_NAME,queues:publicQueues(),date:today()});
    if(pathname==='/api/events'&&req.method==='GET') {
      if(clients.size>=500) return failure(res,503,'Too many subscribers');
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      clients.add(res); res.write('event: ready\ndata: connected\n\n');
      req.on('close',()=>clients.delete(res));
      return;
    }
    let match=pathname.match(/^\/api\/track\/([a-zA-Z0-9_-]{24,})$/);
    if(match&&req.method==='GET') { const state=getTracking(match[1]); return state?reply(res,200,state):failure(res,404,'Ticket not found'); }
    match=pathname.match(/^\/api\/qr\/([a-zA-Z0-9_-]{24,})$/);
    if(match&&req.method==='GET') {
      const state=getTracking(match[1]); if(!state) return failure(res,404,'Ticket not found');
      const svg=qrSvg(ticketUrl(req,match[1]));
      res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}); return res.end(svg);
    }
    if(pathname==='/api/login'&&req.method==='POST') {
      if(!checkOrigin(req)) return failure(res,403,'Invalid origin');
      const ip=req.socket.remoteAddress||'unknown';
      const hit=attempts.get(ip)||{count:0,until:0};
      if(hit.until>Date.now()) return failure(res,429,'Too many attempts. Try again later.');
      const body=await readBody(req);
      const input=typeof body.password==='string'?body.password:'';
      const a=crypto.createHash('sha256').update(input).digest();
      const b=crypto.createHash('sha256').update(PASSWORD).digest();
      if(!crypto.timingSafeEqual(a,b)) {
        hit.count+=1; if(hit.count>=6){ hit.until=Date.now()+15*60*1000; hit.count=0; } attempts.set(ip,hit);
        return failure(res,401,'Incorrect reception password');
      }
      attempts.delete(ip);
      const payload=Buffer.from(JSON.stringify({role:'reception',exp:Date.now()+sessionsMaxAge*1000})).toString('base64url');
      return reply(res,200,{authenticated:true,facility:FACILITY_NAME},{'Set-Cookie':sessionCookie(req,`${payload}.${sign(payload)}`,sessionsMaxAge)});
    }
    if(pathname.startsWith('/api/')&&req.method==='POST') {
      if(!checkOrigin(req)) return failure(res,403,'Invalid origin');
      if(!requireAuth(req,res)) return;
      if(pathname==='/api/logout') return reply(res,200,{ok:true},{'Set-Cookie':sessionCookie(req,'',0)});
      if(pathname==='/api/queues') {
        const body=await readBody(req); const name=typeof body.name==='string'?body.name.trim():'';
        if(name.length<3||name.length>45) return failure(res,400,'Queue name must contain 3–45 characters.');
        if(listQueues().length>=12) return failure(res,409,'This facility supports up to 12 queues.');
        const prefix=String.fromCharCode(65+listQueues().length); const id=crypto.randomUUID();
        db.prepare('INSERT INTO queues (id,name,prefix,avg_minutes,created_at) VALUES (?,?,?,?,?)').run(id,name,prefix,8,now());
        signal();return reply(res,201,{id,name,prefix});
      }
      match=pathname.match(/^\/api\/queues\/([a-zA-Z0-9_-]+)\/(tickets|next|complete|skip|pause|resume)$/);
      if(match) {
        const queue=ensureQueue(res,match[1]); if(!queue) return;
        const action=match[2];
        if(action==='tickets') {
          const ticket=createTicket(queue);signal();return reply(res,201,{...ticket,trackingUrl:ticketUrl(req,ticket.secret),qrUrl:`/api/qr/${ticket.secret}`});
        }
        if(action==='pause'||action==='resume') {
          db.prepare('UPDATE queues SET paused=? WHERE id=?').run(action==='pause'?1:0,queue.id);
          signal();return reply(res,200,{ok:true,action});
        }
        const result=changeStatus(queue,action);
        if(result.error) return failure(res,result.code,result.error);
        signal();return reply(res,200,result);
      }
      return failure(res,404,'API route not found');
    }
    if(pathname==='/api/reception/overview'&&req.method==='GET') { if(!requireAuth(req,res)) return;return reply(res,200,fullOverview()); }
    if(pathname.startsWith('/api/')) return failure(res,404,'API route not found');
    if(req.method!=='GET'&&req.method!=='HEAD') return failure(res,405,'Method not allowed');
    if(pathname==='/') return staticFile(res,'/index.html');
    if(pathname==='/desk'||pathname==='/desk/') return staticFile(res,'/desk.html');
    if(pathname==='/board'||pathname==='/board/') return staticFile(res,'/board.html');
    if(/^\/track\/[a-zA-Z0-9_-]{24,}\/?$/.test(pathname)) return staticFile(res,'/track.html');
    return staticFile(res,pathname);
  } catch(error) {
    console.error('[TurnAhead]',error);
    if(!res.headersSent) return failure(res,error.status||500,error.status?error.message:'An unexpected error occurred');
    res.end();
  }
}
const server=http.createServer(handler);
server.listen(PORT,()=>console.log(`TurnAhead listening at http://localhost:${PORT} (facility: ${FACILITY_NAME})`));
function shutdown(){ for(const client of clients) client.end(); server.close(()=>{db.close();process.exit(0)}); }
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);