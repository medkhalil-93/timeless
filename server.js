// =============================================================
//  TIMELESS – Wellness Hotel · Serveur de démonstration
//  Lancer :  node server.js   puis ouvrir http://localhost:3000
//  Aucune dépendance à installer : uniquement Node.js (v18 ou +)
// =============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'timeless2026'; // code de l'espace équipe
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const FILES = {
  config: path.join(DATA_DIR, 'rooms.json'),
  reservations: path.join(DATA_DIR, 'reservations.json'),
  tables: path.join(DATA_DIR, 'tables.json'),
  seminaires: path.join(DATA_DIR, 'seminaires.json'),
};

// ---------- Lecture / écriture des données (fichiers JSON) ----------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // écriture « atomique » : jamais de fichier à moitié écrit
}

const getConfig = () => readJson(FILES.config, { rooms: [], formules: [], options: {} });
const getList = (name) => readJson(FILES[name], []);

// ---------- Outils de dates ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return null;
  const d = new Date(str + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str ? null : d;
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const nightsBetween = (a, b) => Math.round((b - a) / 86400000);

// ---------- Outils de validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+0-9 ()./-]{8,20}$/;
const clean = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const isTrue = (v) => v === true || v === 'true' || v === 'on';

function checkContact(body, errors) {
  const prenom = clean(body.prenom, 60);
  const nom = clean(body.nom, 60);
  const email = clean(body.email, 120).toLowerCase();
  const telephone = clean(body.telephone, 20);
  if (prenom.length < 2) errors.prenom = 'Indiquez votre prénom.';
  if (nom.length < 2) errors.nom = 'Indiquez votre nom.';
  if (!EMAIL_RE.test(email)) errors.email = 'Adresse e-mail invalide.';
  if (!PHONE_RE.test(telephone)) errors.telephone = 'Numéro de téléphone invalide.';
  return { prenom, nom, email, telephone };
}

function newId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = prefix + '-';
  for (const b of crypto.randomBytes(6)) id += chars[b % chars.length];
  return id;
}

// =============================================================
//  1. RÉSERVATIONS DE CHAMBRES
// =============================================================
function availability(arrivee, depart) {
  const { rooms } = getConfig();
  const reservations = getList('reservations');
  const result = {};
  for (const room of rooms) {
    const taken = reservations.filter(
      (r) => r.chambre === room.id && r.statut !== 'annulée' && r.arrivee < depart && r.depart > arrivee
    ).length;
    result[room.id] = Math.max(0, room.nombre - taken);
  }
  return result;
}

function computePrice(room, nights, personnes, petitDejeuner, options) {
  const hebergement = room.prix * nights;
  const pdj = petitDejeuner ? options.petitDejeunerParPersonne * personnes * nights : 0;
  const taxeSejour = options.taxeSejourParPersonne * personnes * nights;
  return { hebergement, petitDejeuner: pdj, taxeSejour, total: hebergement + pdj + taxeSejour };
}

function validateReservation(body) {
  const errors = {};
  const config = getConfig();
  const contact = checkContact(body, errors);

  const chambre = clean(body.chambre, 30);
  const formule = clean(body.formule, 30);
  const personnes = Number(body.personnes);
  const petitDejeuner = isTrue(body.petitDejeuner);
  const newsletter = isTrue(body.newsletter);
  const parrainage = clean(body.parrainage, 20).toUpperCase();
  const message = clean(body.message, 600);

  const room = config.rooms.find((r) => r.id === chambre);
  if (!room) errors.chambre = 'Choisissez une chambre.';
  if (!config.formules.some((f) => f.id === formule)) errors.formule = 'Choisissez une formule.';
  if (!Number.isInteger(personnes) || personnes < 1 || personnes > (room ? room.capacite : 2)) {
    errors.personnes = `Maximum ${room ? room.capacite : 2} adultes par chambre.`;
  }
  if (parrainage && !/^[A-Z0-9-]{4,20}$/.test(parrainage)) errors.parrainage = 'Code de parrainage invalide.';

  const a = parseDate(body.arrivee);
  const d = parseDate(body.depart);
  let nights = 0;
  if (!a) errors.arrivee = "Date d'arrivée invalide.";
  else if (a < todayUTC()) errors.arrivee = "La date d'arrivée est déjà passée.";
  if (!d) errors.depart = 'Date de départ invalide.';
  if (a && d) {
    nights = nightsBetween(a, d);
    if (nights < 1) errors.depart = "Le départ doit être au moins un jour après l'arrivée.";
    else if (nights > 14) errors.depart = 'Les séjours en ligne sont limités à 14 nuits.';
  }

  if (!isTrue(body.majeur)) errors.majeur = 'Timeless est un hôtel réservé aux adultes (18 ans et plus).';
  if (!isTrue(body.charte)) errors.charte = 'Merci d’accepter la charte de déconnexion.';

  if (Object.keys(errors).length) return { errors };

  if (availability(body.arrivee, body.depart)[room.id] < 1) {
    return { errors: { chambre: `Plus de ${room.nom} disponible à ces dates. Essayez une autre chambre ou d'autres dates.` } };
  }

  return {
    reservation: {
      ...contact,
      message,
      chambre: room.id,
      chambreNom: room.nom,
      formule,
      personnes,
      petitDejeuner,
      arrivee: body.arrivee,
      depart: body.depart,
      nuits: nights,
      prix: computePrice(room, nights, personnes, petitDejeuner, config.options),
      parrainage: parrainage || null,
      newsletter,
    },
  };
}

// ---------- Pré-check-in en ligne ----------
function validatePrecheckin(body, reservation) {
  const errors = {};
  const adresse = clean(body.adresse, 160);
  const pays = clean(body.pays, 60);
  const naissance = parseDate(body.naissance);
  const heureArrivee = clean(body.heureArrivee, 5);
  const transport = clean(body.transport, 20);
  const regime = clean(body.regime, 300);
  const formule = clean(body.formule, 30);

  if (adresse.length < 5) errors.adresse = 'Indiquez votre adresse.';
  if (pays.length < 2) errors.pays = 'Indiquez votre pays.';
  if (!naissance) errors.naissance = 'Date de naissance invalide.';
  else {
    const age18 = new Date(naissance);
    age18.setUTCFullYear(age18.getUTCFullYear() + 18);
    if (age18 > new Date(reservation.arrivee + 'T00:00:00Z')) errors.naissance = 'Timeless est réservé aux personnes de 18 ans et plus.';
  }
  if (!/^\d{2}:\d{2}$/.test(heureArrivee)) errors.heureArrivee = "Indiquez votre heure d'arrivée.";
  if (!['train', 'voiture', 'autre'].includes(transport)) errors.transport = 'Choisissez votre moyen de transport.';
  if (!getConfig().formules.some((f) => f.id === formule)) errors.formule = 'Choisissez une formule.';
  if (!isTrue(body.charteLue)) errors.charteLue = 'Merci de confirmer que vous avez lu la charte de déconnexion.';
  if (!isTrue(body.numeroTransmis)) errors.numeroTransmis = "Merci de confirmer que vous transmettrez le numéro de l'hôtel à vos proches.";

  if (Object.keys(errors).length) return { errors };
  return {
    precheckin: {
      adresse, pays, naissance: body.naissance, heureArrivee, transport, regime,
      faitLe: new Date().toISOString(),
    },
    formule,
  };
}

// =============================================================
//  2. RÉSERVATIONS DE TABLE (restaurant, clientèle extérieure)
// =============================================================
const SERVICES = { midi: 'Déjeuner (12 h – 14 h)', soir: 'Dîner (19 h – 21 h 30)' };

function couvertsRestants(date, service) {
  const max = getConfig().options.couvertsParService || 55;
  const pris = getList('tables')
    .filter((t) => t.date === date && t.service === service && t.statut !== 'annulée')
    .reduce((s, t) => s + t.couverts, 0);
  return Math.max(0, max - pris);
}

function validateTable(body) {
  const errors = {};
  const contact = checkContact(body, errors);
  const service = clean(body.service, 10);
  const couverts = Number(body.couverts);
  const d = parseDate(body.date);
  if (!d) errors.date = 'Date invalide.';
  else if (d < todayUTC()) errors.date = 'Cette date est déjà passée.';
  if (!SERVICES[service]) errors.service = 'Choisissez un service.';
  if (!Number.isInteger(couverts) || couverts < 1 || couverts > 10) errors.couverts = 'De 1 à 10 personnes (au-delà, contactez-nous).';
  if (!isTrue(body.sansTelephone)) errors.sansTelephone = 'Merci d’accepter la règle « sans téléphone » du restaurant.';
  if (Object.keys(errors).length) return { errors };
  if (couvertsRestants(body.date, service) < couverts) {
    return { errors: { service: 'Ce service est complet à cette date. Essayez un autre service ou une autre date.' } };
  }
  return {
    table: { ...contact, date: body.date, service, serviceNom: SERVICES[service], couverts, message: clean(body.message, 400) },
  };
}

// =============================================================
//  3. DEMANDES DE SÉMINAIRE (Le Quai)
// =============================================================
const TYPES_EVENT = ['Réunion', 'Séminaire', 'Team building', 'Événement privé'];

function validateSeminaire(body) {
  const errors = {};
  const contact = checkContact(body, errors);
  const entreprise = clean(body.entreprise, 100);
  const type = clean(body.type, 30);
  const participants = Number(body.participants);
  const d = parseDate(body.date);
  if (entreprise.length < 2) errors.entreprise = "Indiquez le nom de l'entreprise.";
  if (!TYPES_EVENT.includes(type)) errors.type = "Choisissez un type d'événement.";
  if (!Number.isInteger(participants) || participants < 2 || participants > 120) errors.participants = 'Entre 2 et 120 participants.';
  if (!d) errors.date = 'Date souhaitée invalide.';
  else if (d < todayUTC()) errors.date = 'Cette date est déjà passée.';
  if (Object.keys(errors).length) return { errors };
  return {
    demande: {
      ...contact, entreprise, type, participants, date: body.date,
      hebergement: isTrue(body.hebergement), message: clean(body.message, 800),
    },
  };
}

// =============================================================
//  4. QR CODE (image SVG générée par le serveur, sans Internet)
// =============================================================
// Le générateur est dans qrcode-lib.js. S'il manque, le site fonctionne quand même (sans QR code).
let QRCode = null;
try {
  QRCode = require('./qrcode-lib');
} catch {
  console.warn('⚠ Fichier qrcode-lib.js introuvable : la page /qr ne pourra pas afficher de QR code.');
}

function qrSvg(text) {
  const qr = new QRCode(-1, QRCode.ErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4; // zone blanche autour du code, nécessaire pour la lecture
  const size = n + margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#2e3622"/></svg>`;
}

// =============================================================
//  Réponses HTTP et fichiers statiques
// =============================================================
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20000) {
        reject(new Error('Requête trop volumineuse'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  if (!path.extname(rel)) rel += '.html'; // /chambres -> chambres.html
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Accès refusé');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, '404.html'), (e2, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(e2 ? 'Page introuvable' : page);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

// Ce que le client peut voir de sa réservation (on n'expose pas tout)
function publicReservation(r) {
  const { telephone, message, precheckin, ...rest } = r;
  return { ...rest, precheckinFait: Boolean(precheckin) };
}

// =============================================================
//  Routes
// =============================================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const m = (re) => pathname.match(re);

  try {
    // --- QR code : /qr.svg?data=https://... ---
    if (req.method === 'GET' && pathname === '/qr.svg') {
      const data = (url.searchParams.get('data') || '').slice(0, 300);
      if (!QRCode) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Générateur de QR code absent (qrcode-lib.js)');
      }
      if (!/^https?:\/\/\S+$/.test(data)) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Adresse invalide');
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(qrSvg(data));
    }

    // --- Configuration publique : chambres, formules, prix ---
    if (req.method === 'GET' && pathname === '/api/rooms') return sendJson(res, 200, getConfig());

    // --- Disponibilités des chambres ---
    if (req.method === 'GET' && pathname === '/api/disponibilites') {
      const arrivee = url.searchParams.get('arrivee');
      const depart = url.searchParams.get('depart');
      const a = parseDate(arrivee);
      const d = parseDate(depart);
      if (!a || !d || d <= a) return sendJson(res, 400, { error: 'Dates invalides' });
      return sendJson(res, 200, availability(arrivee, depart));
    }

    // --- Nouvelle réservation de chambre ---
    if (req.method === 'POST' && pathname === '/api/reservations') {
      const { errors, reservation } = validateReservation(await readBody(req));
      if (errors) return sendJson(res, 400, { errors });
      const all = getList('reservations');
      const full = { id: newId('TML'), ...reservation, statut: 'confirmée', precheckin: null, creeLe: new Date().toISOString() };
      all.push(full);
      writeJson(FILES.reservations, all);
      console.log(`✔ Réservation ${full.id} – ${full.prenom} ${full.nom} (${full.chambreNom}, ${full.arrivee} → ${full.depart})`);
      return sendJson(res, 201, { id: full.id });
    }

    // --- Consulter sa réservation (billet / pré-check-in) ---
    let match = m(/^\/api\/reservations\/(TML-[A-Z0-9]{6})$/);
    if (req.method === 'GET' && match) {
      const r = getList('reservations').find((x) => x.id === match[1]);
      if (!r) return sendJson(res, 404, { error: 'Réservation introuvable' });
      return sendJson(res, 200, publicReservation(r));
    }

    // --- Pré-check-in en ligne ---
    match = m(/^\/api\/reservations\/(TML-[A-Z0-9]{6})\/precheckin$/);
    if (req.method === 'POST' && match) {
      const body = await readBody(req);
      const all = getList('reservations');
      const r = all.find((x) => x.id === match[1]);
      // On demande aussi l'e-mail : seul le client qui l'a réservée peut faire son pré-check-in
      if (!r || r.email !== clean(body.emailReservation, 120).toLowerCase()) {
        return sendJson(res, 404, { errors: { emailReservation: 'Aucune réservation ne correspond à ce numéro et à cet e-mail.' } });
      }
      if (r.statut === 'annulée') return sendJson(res, 400, { errors: { emailReservation: 'Cette réservation a été annulée.' } });
      const { errors, precheckin, formule } = validatePrecheckin(body, r);
      if (errors) return sendJson(res, 400, { errors });
      r.precheckin = precheckin;
      r.formule = formule; // le client peut encore changer de formule
      writeJson(FILES.reservations, all);
      console.log(`✔ Pré-check-in effectué pour ${r.id}`);
      return sendJson(res, 200, { ok: true });
    }

    // --- Restaurant : places restantes et réservation de table ---
    if (req.method === 'GET' && pathname === '/api/tables/disponibilites') {
      const date = url.searchParams.get('date');
      if (!parseDate(date)) return sendJson(res, 400, { error: 'Date invalide' });
      return sendJson(res, 200, { midi: couvertsRestants(date, 'midi'), soir: couvertsRestants(date, 'soir') });
    }
    if (req.method === 'POST' && pathname === '/api/tables') {
      const { errors, table } = validateTable(await readBody(req));
      if (errors) return sendJson(res, 400, { errors });
      const all = getList('tables');
      const full = { id: newId('TBL'), ...table, statut: 'confirmée', creeLe: new Date().toISOString() };
      all.push(full);
      writeJson(FILES.tables, all);
      console.log(`✔ Table ${full.id} – ${full.couverts} pers. le ${full.date} (${full.service})`);
      return sendJson(res, 201, { id: full.id, serviceNom: full.serviceNom });
    }

    // --- Demande de séminaire ---
    if (req.method === 'POST' && pathname === '/api/seminaires') {
      const { errors, demande } = validateSeminaire(await readBody(req));
      if (errors) return sendJson(res, 400, { errors });
      const all = getList('seminaires');
      const full = { id: newId('SEM'), ...demande, statut: 'à traiter', creeLe: new Date().toISOString() };
      all.push(full);
      writeJson(FILES.seminaires, all);
      console.log(`✔ Demande de séminaire ${full.id} – ${full.entreprise}`);
      return sendJson(res, 201, { id: full.id });
    }

    // =========== Espace équipe (code obligatoire) ===========
    if (pathname.startsWith('/api/admin/')) {
      if (req.headers['x-admin-code'] !== ADMIN_CODE) return sendJson(res, 401, { error: 'Code administrateur incorrect' });

      if (req.method === 'GET' && pathname === '/api/admin/tout') {
        const byDate = (k) => (x, y) => (x[k] < y[k] ? -1 : 1);
        return sendJson(res, 200, {
          reservations: getList('reservations').sort(byDate('arrivee')),
          tables: getList('tables').sort(byDate('date')),
          seminaires: getList('seminaires').sort(byDate('creeLe')).reverse(),
        });
      }

      match = m(/^\/api\/admin\/(reservations|tables|seminaires)\/([A-Z]{3}-[A-Z0-9]{6})\/statut$/);
      if (req.method === 'POST' && match) {
        const body = await readBody(req);
        const allowed = { reservations: ['confirmée', 'annulée'], tables: ['confirmée', 'annulée'], seminaires: ['à traiter', 'devis envoyé', 'confirmé', 'refusé'] };
        const statut = clean(body.statut, 20);
        if (!allowed[match[1]].includes(statut)) return sendJson(res, 400, { error: 'Statut invalide' });
        const all = getList(match[1]);
        const item = all.find((x) => x.id === match[2]);
        if (!item) return sendJson(res, 404, { error: 'Élément introuvable' });
        item.statut = statut;
        writeJson(FILES[match[1]], all);
        console.log(`• ${item.id} → ${statut}`);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 404, { error: 'Route inconnue' });
    }

    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Route inconnue' });
    if (req.method === 'GET') return serveStatic(req, res, pathname);
    res.writeHead(405);
    res.end();
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || 'Erreur serveur' });
  }
});

// Crée le dossier et les fichiers de données s'ils n'existent pas encore
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILES.config)) console.warn('⚠ data/rooms.json introuvable : les chambres ne pourront pas s’afficher.');
for (const key of ['reservations', 'tables', 'seminaires']) {
  if (!fs.existsSync(FILES[key])) writeJson(FILES[key], []);
}

server.listen(PORT, () => {
  console.log('');
  console.log('  TIMELESS – Wellness Hotel');
  console.log(`  Site :         http://localhost:${PORT}`);
  console.log(`  Espace équipe : http://localhost:${PORT}/admin   (code : ${ADMIN_CODE})`);
  console.log('  Arrêter le serveur : Ctrl + C');
  console.log('');
});
