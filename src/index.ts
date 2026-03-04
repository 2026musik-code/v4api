import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  dataapi: R2Bucket;
  ADMIN_TOKEN?: string;
};

type GatewayRecord = {
  key: string;
  target_url: string;
  created_at: string;
  updated_at: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', cors());

const cleanKey = (rawKey: string) => rawKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
const objectName = (key: string) => `${cleanKey(key)}.json`;

const listGateways = async (bucket: R2Bucket): Promise<GatewayRecord[]> => {
  const all: GatewayRecord[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ cursor });
    for (const item of page.objects) {
      if (!item.key.endsWith('.json')) {
        continue;
      }
      const obj = await bucket.get(item.key);
      if (!obj) {
        continue;
      }
      const parsed = (await obj.json()) as Partial<GatewayRecord>;
      if (!parsed.key || !parsed.target_url) {
        continue;
      }
      all.push({
        key: parsed.key,
        target_url: parsed.target_url,
        created_at: parsed.created_at ?? new Date().toISOString(),
        updated_at: parsed.updated_at ?? new Date().toISOString()
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return all.sort((a, b) => a.key.localeCompare(b.key));
};

const notFoundPage = (key: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Gateway Not Found</title>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
  <div class="max-w-xl w-full bg-white/10 backdrop-blur-2xl border border-cyan-400/30 rounded-3xl p-8 shadow-2xl">
    <p class="text-cyan-300 uppercase tracking-[0.3em] text-xs mb-3">Error 404</p>
    <h1 class="text-3xl md:text-4xl font-bold text-white mb-3">Gateway key tidak ditemukan</h1>
    <p class="text-slate-300 mb-6">Key <span class="text-violet-300 font-semibold">${key}</span> tidak tersedia pada bucket <strong>dataapi</strong>.</p>
    <a href="/admin" class="inline-block px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 font-semibold">Buka Admin Dashboard</a>
  </div>
</body>
</html>`;

const adminHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Gateway Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#22d3ee22,transparent_40%),radial-gradient(circle_at_bottom_left,#a855f722,transparent_45%)] pointer-events-none"></div>
  <main class="relative z-10 max-w-6xl mx-auto p-6 md:p-10">
    <header class="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <p class="text-cyan-300 tracking-[0.25em] uppercase text-xs">Cloudflare Worker</p>
        <h1 class="text-3xl md:text-4xl font-bold">Luxury API Gateway Dashboard</h1>
      </div>
      <button id="openModal" class="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 font-semibold shadow-lg shadow-cyan-500/20">+ Add API</button>
    </header>

    <section class="grid md:grid-cols-3 gap-4 mb-8">
      <article class="md:col-span-1 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
        <p class="text-slate-300 text-sm">Total API Aktif</p>
        <p id="totalCount" class="text-4xl font-extrabold text-cyan-300 mt-2">0</p>
      </article>
      <article class="md:col-span-2 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
        <label class="block text-sm text-slate-300 mb-2" for="searchInput">Search key</label>
        <input id="searchInput" class="w-full bg-slate-900/70 border border-cyan-400/30 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400" placeholder="contoh: gk_premium" />
      </article>
    </section>

    <section class="bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-900/60 text-slate-300">
            <tr>
              <th class="text-left px-4 py-3">Key</th>
              <th class="text-left px-4 py-3">Target URL</th>
              <th class="text-left px-4 py-3">Updated</th>
              <th class="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </section>
  </main>

  <div id="modal" class="hidden fixed inset-0 bg-slate-950/70 backdrop-blur-sm items-center justify-center p-4">
    <div class="w-full max-w-xl bg-slate-900/90 border border-cyan-400/40 rounded-2xl p-6">
      <h2 id="modalTitle" class="text-2xl font-bold mb-4">Add API Gateway</h2>
      <form id="gatewayForm" class="space-y-4">
        <div>
          <label class="block mb-1 text-sm text-slate-300">Key Name</label>
          <input id="keyInput" required class="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/10 focus:ring-2 focus:ring-cyan-400 outline-none" placeholder="gk_premium" />
        </div>
        <div>
          <label class="block mb-1 text-sm text-slate-300">Target API URL</label>
          <input id="urlInput" type="url" required class="w-full px-4 py-3 rounded-xl bg-slate-950 border border-white/10 focus:ring-2 focus:ring-cyan-400 outline-none" placeholder="https://api.example.com/data" />
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" id="closeModal" class="px-4 py-2 rounded-lg border border-white/20">Cancel</button>
          <button type="submit" class="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-600 font-semibold">Save</button>
        </div>
      </form>
    </div>
  </div>

<script>
const state = { items: [], editingKey: null };
const tableBody = document.getElementById('tableBody');
const totalCount = document.getElementById('totalCount');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const gatewayForm = document.getElementById('gatewayForm');
const keyInput = document.getElementById('keyInput');
const urlInput = document.getElementById('urlInput');
const searchInput = document.getElementById('searchInput');

const apiBase = '/api/admin/gateways';

const showModal = (editing = null) => {
  state.editingKey = editing?.key ?? null;
  modalTitle.textContent = editing ? 'Edit API Gateway' : 'Add API Gateway';
  keyInput.value = editing?.key ?? '';
  keyInput.disabled = Boolean(editing);
  urlInput.value = editing?.target_url ?? '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

const hideModal = () => {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  gatewayForm.reset();
  state.editingKey = null;
  keyInput.disabled = false;
};

const copyGatewayLink = async (key) => {
  const link = location.origin + '/api/gateway/' + key;
  await navigator.clipboard.writeText(link);
  alert('Gateway URL copied: ' + link);
};

const render = () => {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = state.items.filter((item) => item.key.toLowerCase().includes(query));
  totalCount.textContent = String(state.items.length);

  tableBody.innerHTML = filtered.map((item) => {
    return '<tr class="border-t border-white/10">' +
      '<td class="px-4 py-3 font-semibold text-cyan-300">' + item.key + '</td>' +
      '<td class="px-4 py-3 text-slate-300">' + item.target_url + '</td>' +
      '<td class="px-4 py-3 text-slate-400">' + new Date(item.updated_at).toLocaleString('id-ID') + '</td>' +
      '<td class="px-4 py-3"><div class="flex justify-end gap-2">' +
        '<button data-copy="' + item.key + '" class="px-3 py-1 rounded-lg border border-cyan-400/40 text-cyan-300">Copy Link</button>' +
        '<button data-edit="' + item.key + '" class="px-3 py-1 rounded-lg border border-violet-400/40 text-violet-300">Edit</button>' +
        '<button data-delete="' + item.key + '" class="px-3 py-1 rounded-lg border border-rose-400/40 text-rose-300">Delete</button>' +
      '</div></td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="4" class="px-4 py-10 text-center text-slate-400">Tidak ada data.</td></tr>';
};

const loadItems = async () => {
  const res = await fetch(apiBase);
  const data = await res.json();
  state.items = data.items || [];
  render();
};

searchInput.addEventListener('input', render);
document.getElementById('openModal').addEventListener('click', () => showModal());
document.getElementById('closeModal').addEventListener('click', hideModal);
modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(); });

gatewayForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { key: keyInput.value, target_url: urlInput.value };

  const isEdit = Boolean(state.editingKey);
  const endpoint = isEdit ? apiBase + '/' + state.editingKey : apiBase;
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetch(endpoint, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text();
    alert('Gagal menyimpan: ' + msg);
    return;
  }

  hideModal();
  await loadItems();
});

tableBody.addEventListener('click', async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;

  const copyKey = target.getAttribute('data-copy');
  const editKey = target.getAttribute('data-edit');
  const deleteKey = target.getAttribute('data-delete');

  if (copyKey) {
    await copyGatewayLink(copyKey);
    return;
  }

  if (editKey) {
    const item = state.items.find((entry) => entry.key === editKey);
    if (item) showModal(item);
    return;
  }

  if (deleteKey) {
    if (!confirm('Hapus key ' + deleteKey + '?')) return;
    const res = await fetch(apiBase + '/' + deleteKey, { method: 'DELETE' });
    if (!res.ok) {
      alert('Gagal menghapus');
      return;
    }
    await loadItems();
  }
});

loadItems();
</script>
</body>
</html>`;

app.get('/', (c) => c.redirect('/admin'));

app.get('/admin', (c) => c.html(adminHtml));

app.get('/api/gateway/:key', async (c) => {
  const rawKey = c.req.param('key');
  const key = cleanKey(rawKey);

  if (!key) {
    return c.text('Invalid key format', 400);
  }

  const item = await c.env.dataapi.get(objectName(key));
  if (!item) {
    return c.html(notFoundPage(key), 404);
  }

  const gateway = (await item.json()) as GatewayRecord;

  let target: URL;
  try {
    target = new URL(gateway.target_url);
  } catch {
    return c.json({ error: 'Stored target_url is invalid' }, 500);
  }

  const sourceUrl = new URL(c.req.url);
  sourceUrl.searchParams.forEach((value, name) => {
    target.searchParams.append(name, value);
  });

  const proxyResponse = await fetch(target.toString(), {
    method: 'GET',
    headers: {
      'accept': c.req.header('accept') ?? '*/*',
      'user-agent': c.req.header('user-agent') ?? 'cloudflare-worker-gateway'
    }
  });

  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    headers: proxyResponse.headers
  });
});

app.use('/api/admin/*', async (c, next) => {
  if (!c.env.ADMIN_TOKEN) {
    await next();
    return;
  }

  const token = c.req.header('x-admin-token') ?? c.req.header('authorization')?.replace('Bearer ', '');
  if (token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await next();
});

app.get('/api/admin/gateways', async (c) => {
  const items = await listGateways(c.env.dataapi);
  return c.json({ items });
});

app.post('/api/admin/gateways', async (c) => {
  const body = await c.req.json<{ key?: string; target_url?: string }>();
  const key = cleanKey(body.key ?? '');
  const target_url = (body.target_url ?? '').trim();

  if (!key || !target_url) {
    return c.json({ error: 'key and target_url are required' }, 400);
  }

  try {
    new URL(target_url);
  } catch {
    return c.json({ error: 'target_url must be a valid URL' }, 400);
  }

  const now = new Date().toISOString();
  const existing = await c.env.dataapi.get(objectName(key));
  const existingData = existing ? ((await existing.json()) as Partial<GatewayRecord>) : null;

  const record: GatewayRecord = {
    key,
    target_url,
    created_at: existingData?.created_at ?? now,
    updated_at: now
  };

  await c.env.dataapi.put(objectName(key), JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' }
  });

  return c.json({ success: true, item: record });
});

app.put('/api/admin/gateways/:key', async (c) => {
  const key = cleanKey(c.req.param('key'));
  const body = await c.req.json<{ target_url?: string }>();
  const target_url = (body.target_url ?? '').trim();

  if (!key || !target_url) {
    return c.json({ error: 'key and target_url are required' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target_url);
  } catch {
    return c.json({ error: 'target_url must be a valid URL' }, 400);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return c.json({ error: 'Only http/https URLs are allowed' }, 400);
  }

  const existing = await c.env.dataapi.get(objectName(key));
  if (!existing) {
    return c.json({ error: 'Gateway key not found' }, 404);
  }

  const oldRecord = (await existing.json()) as GatewayRecord;
  const record: GatewayRecord = {
    key,
    target_url,
    created_at: oldRecord.created_at,
    updated_at: new Date().toISOString()
  };

  await c.env.dataapi.put(objectName(key), JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' }
  });

  return c.json({ success: true, item: record });
});

app.delete('/api/admin/gateways/:key', async (c) => {
  const key = cleanKey(c.req.param('key'));
  if (!key) {
    return c.json({ error: 'Invalid key' }, 400);
  }

  await c.env.dataapi.delete(objectName(key));
  return c.json({ success: true });
});

app.notFound((c) => c.html(notFoundPage('unknown'), 404));

export default app;
