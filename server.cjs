// server.cjs - VERZE S ULTRALEHKÝM DESIGNEM
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { Pool } = require('pg');
require('dotenv').config();

console.log('--- Načtená DB URL:', process.env.DATABASE_URL);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Siky2025!';
const SESSION_SECRET = process.env.SESSION_SECRET || 'verysecretstring';
const CONTACT = process.env.CONTACT || 'tvujemail@domena.cz';

app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect('/admin/login');
}

// --- Hlavní stránky a NFC Redirect (Beze změny) ---
app.get('/', (req, res) => res.send('NFC redirect service — running'));

app.get('/nezaplaceno', (req, res) => {
  res.send(`<h1>Služba je pozastavena</h1><p>Kontaktujte správce služby: ${CONTACT}</p>`);
});

app.get('/tap/:code', async (req, res) => {
  const { code: rawCode } = req.params;
  const code = rawCode.trim().toLowerCase();

  try {
    const chipResult = await pool.query('SELECT * FROM chips2 WHERE code ILIKE $1 LIMIT 1', [code]);
    const chip = chipResult.rows[0];
    if (!chip || !chip.active) return res.status(404).send('NFC kód neexistuje nebo je neaktivní.');

    const restResult = await pool.query('SELECT * FROM restaurants WHERE id=$1 LIMIT 1', [chip.restaurant_id]);
    const restaurant = restResult.rows[0];
    if (!restaurant) return res.redirect('/nezaplaceno');

    const paidUntilStr = restaurant.paid_until_date || restaurant.paid_until;
    const paidUntil = paidUntilStr ? new Date(paidUntilStr) : null;

    if (!paidUntil || paidUntil < new Date()) return res.redirect('/nezaplaceno');

    // Priorita: URL čipu > URL restaurace > hlavní stránka
    return res.redirect(chip.target_url || restaurant.target_url || '/');
  } catch(err) {
    console.error('Tap error:', err);
    return res.status(500).send('Chyba serveru');
  }
});

// --- Admin Login (Kosmetické změny) ---
app.get('/admin/login', (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Admin login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { font-family: sans-serif; background-color: #f8f9fa; } /* Světlé pozadí */
        .card { background-color: #ffffff !important; border: 1px solid #dee2e6; }
        .text-primary { color: #007bff !important; } 
        .btn-primary { background-color: #007bff; border-color: #007bff; }
      </style>
    </head>
    <body class="text-dark">
      <div class="container d-flex justify-content-center align-items-center" style="height: 100vh;">
        <div class="card p-4 shadow-lg" style="width: 100%; max-width: 400px;">
          <h2 class="card-title text-center mb-4 text-primary">Admin Přihlášení</h2>
          <form method="POST" action="/admin/login">
            <div class="mb-3">
              <input name="password" type="password" class="form-control" placeholder="Heslo" required />
            </div>
            <button type="submit" class="btn btn-primary w-100">Přihlásit se</button>
          </form>
        </div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
});

app.post('/admin/login', (req, res) => {
  const password = req.body.password;
  if (password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.send(`
    <html>
    <head>
      <title>Chyba</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light text-dark">
      <div class="container mt-5 text-center">
        <div class="alert alert-danger">Špatné heslo!</div>
        <a href="/admin/login" class="btn btn-secondary">Zpět</a>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
});

// --- Admin Panel Dashboard (S NOVÝM, LEHKÝM DESIGNEM) ---
app.get('/admin', requireAdmin, async (req, res) => {
  try {
    const filterId = req.query.filter_id;
    const expandedId = req.query.expanded_id;

    let restaurants;
    let chips = (await pool.query('SELECT * FROM chips2')).rows || [];
    
    if (filterId && filterId !== 'all') {
      restaurants = (await pool.query('SELECT * FROM restaurants WHERE id=$1', [filterId])).rows || [];
    } else {
      restaurants = (await pool.query('SELECT * FROM restaurants ORDER BY id')).rows || [];
    }

    const allRestaurants = (await pool.query('SELECT id, name FROM restaurants ORDER BY id')).rows || [];


    let html = `
      <html>
      <head>
        <title>Admin Panel</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          body { 
              font-family: sans-serif; 
              background-color: #f8f9fa; /* Světlé pozadí */
              color: #212529; /* Tmavý text */
          }
          
          /* Základní barvy */
          h2, h3 { color: #007bff !important; font-weight: 600; } /* Klasická modrá */
          .bg-light-section { 
              background-color: #ffffff; /* Bílé boxy */
              border: 1px solid #dee2e6; 
              border-radius: 6px;
              padding: 20px !important;
              margin-bottom: 30px;
          }

          /* Tabulka - Světlé schéma */
          .table { 
              --bs-table-bg: #ffffff; 
              --bs-table-striped-bg: #f8f9fa; 
              --bs-table-hover-bg: #e2e6ea; 
              border-color: #dee2e6;
              color: #212529;
          }
          .table-primary { 
              --bs-table-bg: #007bff; /* Modré záhlaví */
              color: #ffffff; 
          }
          /* Barvy stavu */
          .table-success { --bs-table-bg: #d1e7dd !important; } /* Aktivní: Bledě zelená */
          .table-danger { --bs-table-bg: #f8d7da !important; } /* Neaktivní: Bledě červená */

          /* Tlačítka stavu */
          .badge.bg-success { background-color: #198754 !important; } /* Sytě zelená */
          .badge.bg-danger { background-color: #dc3545 !important; } /* Sytě červená */
          
          /* Ostatní styly pro čitelnost */
          .chip-box { background-color: #e9ecef !important; border-radius: 4px; }
          .form-control, .form-select { border-color: #ced4da; }
          .table input.form-control { height: 30px; font-size: 0.85rem; padding: 0.375rem 0.5rem; }
          .table .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
        </style>
      </head>
      <body class="container mt-4"> 
        <div class="container mt-4">
          <a class="btn btn-sm btn-secondary float-end" href="/admin/logout">Logout</a>
          <h2 class="mb-5">Admin Panel - Přehled</h2>

          <h3 class="mt-5">Přidat novou restauraci</h3>
          <form method="POST" action="/admin/restaurant/add" class="row g-3 bg-light-section">
            <div class="col-md-4"><label class="form-label text-dark">Název</label><input name="name" class="form-control" placeholder="Např. Kavárna U Sikyse" required /></div>
            <div class="col-md-4"><label class="form-label text-dark">Platnost do</label><input type="date" name="paid_until_date" class="form-control" required /></div>
            <div class="col-md-4"><label class="form-label text-dark">Cílová URL</label><input name="target_url" class="form-control" placeholder="https://www.google.com" required /></div>
            <div class="col-12"><button class="btn btn-success mt-2">Přidat restauraci</button></div>
          </form>
<hr>

          <h3 class="mt-5">Seznam restaurací</h3>
          
          <form method="GET" action="/admin" class="row g-3 mb-4">
            <div class="col-auto">
              <select name="filter_id" class="form-select">
                <option value="all">-- Zobrazit všechny restaurace --</option>
                ${allRestaurants.map(r => 
                  `<option value="${r.id}" ${filterId == r.id ? 'selected' : ''}>${r.id} - ${r.name}</option>`
                ).join('')}
              </select>
            </div>
            <div class="col-auto">
              <button type="submit" class="btn btn-primary">Filtrovat</button>
              ${filterId ? `<a href="/admin" class="btn btn-secondary">Zrušit filtr</a>` : ''}
            </div>
          </form>


          <div class="table-responsive bg-light-section p-0">
            <table id="restaurantsTable" class="table table-striped table-hover align-middle mb-0">
              <thead class="table-primary">
                <tr>
                  <th>ID</th><th>Název</th><th>Platnost do</th><th>URL</th><th>Uložit</th><th>Čipy</th><th>Smazat</th>
                </tr>
              </thead>
              <tbody>
    `;

    restaurants.forEach(r => {
      const paidUntil = r.paid_until_date ? new Date(r.paid_until_date) : null;
      const rowClass = (paidUntil && paidUntil >= new Date()) ? 'table-success' : 'table-danger';
      const chipCount = chips.filter(c => c.restaurant_id === r.id).length;
      const isExpanded = (expandedId == r.id);

      html += `
        <tr class="rest-row ${rowClass}" data-id="${r.id}">
          <form method="POST" action="/admin/restaurant/update/${r.id}">
            <td>${r.id}</td>
            <td class="restName"><input name="name" class="form-control" value="${r.name || ''}" /></td>
            <td><input type="date" name="paid_until_date" class="form-control" value="${r.paid_until_date ? r.paid_until_date.toISOString().split('T')[0] : ''}" /></td>
            <td><input name="target_url" class="form-control" value="${r.target_url || ''}" /></td>
            <td><button class="btn btn-sm btn-primary">Uložit</button></td>
            <td>
              <a class="btn btn-sm btn-outline-info" href="/admin?${filterId ? `filter_id=${filterId}&` : ''}expanded_id=${isExpanded ? '' : r.id}">
                Čipy (${chipCount}) ${isExpanded ? '▲' : '▼'}
              </a>
            </td>
          </form>
          <td>
            <form method="POST" action="/admin/restaurant/delete/${r.id}">
              <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Opravdu smazat restauraci ${r.name} a VŠECHNY její čipy?');">Smazat</button>
            </form>
          </td>
        </tr>

        ${isExpanded ? `
          <tr class="chip-detail-row">
            <td colspan="7" class="p-0 border-0">
              <div class="p-3 chip-box text-dark">
                <h5>Čipy pro ${r.name}</h5>
                <table class="table table-sm table-striped mt-2 mb-0">
                  <thead class="table-primary">
                    <tr><th>ID</th><th>Kód</th><th>URL</th><th>Status</th><th>Akce</th><th>Test/Smazat</th></tr>
                  </thead>
                  <tbody>
                    ${chips.filter(c => c.restaurant_id === r.id).map(c => `
                      <tr>
                        <form method="POST" action="/admin/chip/update/${c.id}">
                          <td>${c.id}</td>
                          <td><input name="code" class="form-control form-control-sm" value="${c.code}" /></td>
                          <td><input name="target_url" class="form-control form-control-sm" value="${c.target_url || ''}" /></td>
                          <td>${c.active ? '<span class="badge bg-success">Aktivní</span>' : '<span class="badge bg-danger">Neaktivní</span>'}</td>
                          <td>
                            <button name="toggle" value="toggle" type="submit" class="btn btn-sm ${c.active ? 'btn-warning' : 'btn-success'}">Zap/Vyp</button>
                            <button type="submit" class="btn btn-sm btn-primary">Uložit</button>
                          </td>
                        </form>
                        <td>
                          <a href="/tap/${c.code}" target="_blank" class="btn btn-sm btn-info me-2">Test</a>
                          <form method="POST" action="/admin/chip/delete/${c.id}" class="d-inline">
                            <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Smazat čip ${c.code}?');">Smazat</button>
                          </form>
                        </td>
                    </tr>
                  `).join('') || '<tr><td colspan="6" class="text-center">Žádné čipy u této restaurace.</td></tr>'}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        ` : ''}
      `;
    });

    html += `
              </tbody>
            </table>
          </div>
<hr>

          <h3 class="mt-5">Přidat nový chip</h3>
          <form method="POST" action="/admin/chip/add" class="row g-3 bg-light-section">
            <div class="col-md-4"><label class="form-label text-dark">Kód</label><input name="code" class="form-control" placeholder="Unikátní kód čipu" required /></div>
            <div class="col-md-4"><label class="form-label text-dark">ID Restaurace</label><input name="restaurant_id" type="number" class="form-control" placeholder="ID z horní tabulky" required /></div>
            <div class="col-md-4"><label class="form-label text-dark">Cílová URL (volitelně)</label><input name="target_url" class="form-control" /></div>
            <div class="col-12"><button class="btn btn-success mt-2">Přidat chip</button></div>
          </form>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.send('Chyba při načítání admin panelu');
  }
});

// --- Admin CRUD ROUTY (Beze změny) ---
app.post('/admin/restaurant/add', requireAdmin, async (req,res)=>{
  const {name, paid_until_date, target_url} = req.body;
  try {
    await pool.query('INSERT INTO restaurants(name, paid_until_date, target_url) VALUES($1,$2,$3)', [name, paid_until_date, target_url]);
  } catch (err) {
    console.error('Restaurant add error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/restaurant/update/:id', requireAdmin, async (req,res)=>{
  const {id} = req.params;
  const {name, paid_until_date, target_url} = req.body;
  try {
    await pool.query('UPDATE restaurants SET name=$1, paid_until_date=$2, target_url=$3 WHERE id=$4', [name, paid_until_date, target_url, id]);
  } catch (err) {
    console.error('Restaurant update error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/restaurant/delete/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM chips2 WHERE restaurant_id=$1', [req.params.id]); 
    await pool.query('DELETE FROM restaurants WHERE id=$1', [req.params.id]); 
    res.redirect('/admin');
  } catch (err) {
    console.error('Restaurant delete error:', err);
    res.send('Chyba při mazání restaurace: ' + err.message);
  }
});


app.post('/admin/chip/add', requireAdmin, async (req,res)=>{
  const {code, restaurant_id, target_url} = req.body;
  try {
    await pool.query('INSERT INTO chips2(code, restaurant_id, target_url, active) VALUES($1,$2,$3,true)', [code, restaurant_id, target_url]);
  } catch (err) {
    console.error('Chip add error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/chip/update/:id', requireAdmin, async (req,res)=>{
  const {id} = req.params;
  const {code, restaurant_id, target_url, toggle} = req.body;
  try {
    if(toggle) {
      const current = await pool.query('SELECT active FROM chips2 WHERE id=$1', [id]);
      const newStatus = !current.rows[0].active;
      await pool.query('UPDATE chips2 SET active=$1 WHERE id=$2', [newStatus, id]);
    } else {
      await pool.query('UPDATE chips2 SET code=$1, restaurant_id=$2, target_url=$3 WHERE id=$4', [code, restaurant_id, target_url, id]);
    }
  } catch (err) {
    console.error('Chip update error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/chip/delete/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM chips2 WHERE id=$1', [req.params.id]);
    res.redirect('/admin');
  } catch (err) {
    console.error('Chip delete error:', err);
    res.send('Chyba při mazání čipu: ' + err.message);
  }
});

// --- Logout ---
app.get('/admin/logout', (req,res)=>{
  req.session.destroy(err=>res.redirect('/admin/login'));
});

app.listen(PORT, () => { console.log(`✅ Server běží na portu ${PORT}`); });