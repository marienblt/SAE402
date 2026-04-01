/* ═══════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════ */
const CFG = {
  corridor:      30,
  totalSec:     120,
  timePenalty:   10,
  gravite:     0.0018,  // accélération par degré d'inclinaison
  amortissement: 0.92,  // friction de la balle
  vitesseMax:     6,    // pixels/frame max
  trailMax:      50,    // longueur de la traînée
};

const POURCENTAGES_CHEMIN = [
  [0.50, 0.95],
  [0.50, 0.78],
  [0.72, 0.78],
  [0.72, 0.60],
  [0.28, 0.60],
  [0.28, 0.42],
  [0.72, 0.42],
  [0.72, 0.24],
  [0.50, 0.24],
  [0.50, 0.06],
];

/* ═══════════════════════════════════════════
   ÉTAT
═══════════════════════════════════════════ */
let secondesRestantes = CFG.totalSec;
let intervalleMinuterie;
let jeuActif        = false;
let balle           = { x: 0, y: 0, vx: 0, vy: 0 };
let inclinaison     = { gamma: 0, beta: 0 };
let pointsTrace     = [];
let pointsChemin    = [];
let progression     = 0;
let penaliteEnCours = false;
let partiesConfettis = [];

/* ═══════════════════════════════════════════
   DOM
═══════════════════════════════════════════ */
const canvas          = document.getElementById('canvasJeu');
const ctx             = canvas.getContext('2d');
const canvasConfettis = document.getElementById('canvasConfettis');
const ctxConfettis    = canvasConfettis.getContext('2d');
const elementTemps    = document.getElementById('temps');
const elementInstruction = document.getElementById('barreInstruction');

/* ═══════════════════════════════════════════
   IMAGE
═══════════════════════════════════════════ */
const imgFond = new Image();
imgFond.src = './IMG/Fichier 2rue des tanneurs.png';

/* ═══════════════════════════════════════════
   REDIMENSIONNEMENT
═══════════════════════════════════════════ */
const RATIO_IMAGE = 600 / 1008;
let LG, HT;

function redimensionner() {
  const lv = window.innerWidth, hv = window.innerHeight;
  if (lv / hv < RATIO_IMAGE) {
    LG = lv; HT = Math.round(lv / RATIO_IMAGE);
  } else {
    HT = hv; LG = Math.round(hv * RATIO_IMAGE);
  }
  canvas.width  = LG;
  canvas.height = HT;
  canvasConfettis.width  = window.innerWidth;
  canvasConfettis.height = window.innerHeight;
  construireChemin();
}

function construireChemin() {
  pointsChemin = POURCENTAGES_CHEMIN.map(([px, py]) => ({ x: px * LG, y: py * HT }));
}

window.addEventListener('resize', () => { redimensionner(); if (jeuActif) dessinerImage(); });

/* ═══════════════════════════════════════════
   CAPTEUR D'INCLINAISON
═══════════════════════════════════════════ */
window.addEventListener('deviceorientation', (e) => {
  inclinaison.gamma = e.gamma || 0; // inclinaison gauche/droite (-90 à 90)
  inclinaison.beta  = e.beta  || 0; // inclinaison avant/arrière (-180 à 180)
});

// Simulation bureau : la souris contrôle l'inclinaison
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;
  inclinaison.gamma = (e.clientX - cx) / rect.width  * 60;
  inclinaison.beta  = (e.clientY - cy) / rect.height * 60;
});

/* ═══════════════════════════════════════════
   SÉLECTION DE NIVEAU
═══════════════════════════════════════════ */
async function choisirNiveau() {
  // Demander la permission iOS 13+ pour le gyroscope
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== 'granted') {
        afficherNotification('Permission capteurs refusée', 'erreur');
        return;
      }
    } catch (err) {
      console.warn('Permission capteurs :', err);
    }
  }
  document.getElementById('selectionNiveau').classList.add('masque');
  demarrerDecompte();
}

function allerSelection() {
  masquer('superpositionVictoire'); masquer('superpositionDefaite');
  jeuActif = false;
  clearInterval(intervalleMinuterie);
  document.getElementById('selectionNiveau').classList.remove('masque');
}

function rejouer() {
  masquer('superpositionVictoire'); masquer('superpositionDefaite');
  demarrerDecompte();
}

/* ═══════════════════════════════════════════
   DÉCOMPTE
═══════════════════════════════════════════ */
function demarrerDecompte() {
  redimensionner();
  dessinerImage();
  const decompte = document.getElementById('decompte');
  const numero   = document.getElementById('numeroDecompte');
  let n = 3;
  numero.textContent = n;
  decompte.classList.add('visible');
  const iv = setInterval(() => {
    n--;
    if (n === 0) {
      numero.textContent = 'GO !';
    } else if (n < 0) {
      clearInterval(iv);
      decompte.classList.remove('visible');
      initialiserJeu();
    } else {
      numero.textContent = n;
      numero.style.animation = 'none';
      void numero.offsetWidth;
      numero.style.animation = '';
    }
  }, 800);
}

/* ═══════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════ */
function initialiserJeu() {
  secondesRestantes = CFG.totalSec;
  progression       = 0;
  pointsTrace       = [];
  penaliteEnCours   = false;
  jeuActif          = true;
  inclinaison       = { gamma: 0, beta: 0 };
  balle = {
    x:  pointsChemin[0].x,
    y:  pointsChemin[0].y,
    vx: 0,
    vy: 0,
  };
  mettreAJourMinuterie();
  clearInterval(intervalleMinuterie);
  intervalleMinuterie = setInterval(tick, 1000);
  elementInstruction.textContent = 'Inclinez le téléphone pour guider la balle !';
  requestAnimationFrame(boucle);
}

/* ═══════════════════════════════════════════
   MINUTERIE
═══════════════════════════════════════════ */
function tick() {
  if (!jeuActif) return;
  secondesRestantes--;
  mettreAJourMinuterie();
  if (secondesRestantes <= 0) declencherDefaite('Le temps est écoulé !');
}
function mettreAJourMinuterie() {
  const m = Math.floor(secondesRestantes / 60), s = secondesRestantes % 60;
  elementTemps.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  elementTemps.classList.toggle('danger', secondesRestantes < 20);
}

/* ═══════════════════════════════════════════
   PHYSIQUE DE LA BALLE
═══════════════════════════════════════════ */
function mettreAJourBalle() {
  if (!jeuActif) return;

  // Accélération due à l'inclinaison (gravité simulée)
  balle.vx += inclinaison.gamma * CFG.gravite * LG;
  balle.vy += inclinaison.beta  * CFG.gravite * HT;

  // Amortissement (friction)
  balle.vx *= CFG.amortissement;
  balle.vy *= CFG.amortissement;

  // Limite de vitesse
  const vitesse = Math.hypot(balle.vx, balle.vy);
  if (vitesse > CFG.vitesseMax) {
    balle.vx = balle.vx / vitesse * CFG.vitesseMax;
    balle.vy = balle.vy / vitesse * CFG.vitesseMax;
  }

  // Déplacement
  balle.x += balle.vx;
  balle.y += balle.vy;

  // Contraindre au canvas
  balle.x = Math.max(0, Math.min(LG, balle.x));
  balle.y = Math.max(0, Math.min(HT, balle.y));

  // Traînée
  pointsTrace.push({ x: balle.x, y: balle.y });
  if (pointsTrace.length > CFG.trailMax) pointsTrace.shift();

  // Vérification du couloir
  const plusProche = plusProchePointChemin(balle);
  const dist       = Math.hypot(balle.x - plusProche.x, balle.y - plusProche.y);

  if (dist > CFG.corridor) {
    appliquerPenalite();
    return;
  }

  if (plusProche.seg > progression) progression = plusProche.seg;

  const pointFin = pointsChemin[pointsChemin.length - 1];
  if (progression >= pointsChemin.length - 2 &&
      Math.hypot(balle.x - pointFin.x, balle.y - pointFin.y) < CFG.corridor * 0.6) {
    declencherVictoire();
  }
}

/* ═══════════════════════════════════════════
   PÉNALITÉ TEMPORELLE
═══════════════════════════════════════════ */
function appliquerPenalite() {
  if (penaliteEnCours) return;
  penaliteEnCours = true;

  secouerCanvas();
  afficherNotification(`⏱ −${CFG.timePenalty} secondes !`, 'erreur');
  if (navigator.vibrate) navigator.vibrate([60, 20, 60]);

  secondesRestantes = Math.max(0, secondesRestantes - CFG.timePenalty);
  mettreAJourMinuterie();

  // Réinitialiser la balle au départ
  balle       = { x: pointsChemin[0].x, y: pointsChemin[0].y, vx: 0, vy: 0 };
  pointsTrace = [];
  progression = 0;
  jeuActif    = false;

  setTimeout(() => {
    penaliteEnCours = false;
    if (secondesRestantes <= 0) {
      declencherDefaite('Le temps est écoulé !');
    } else {
      jeuActif = true;
      elementInstruction.textContent = `Recommencez depuis le début ! (−${CFG.timePenalty}s)`;
    }
  }, 1000);
}

/* ═══════════════════════════════════════════
   GÉOMÉTRIE
═══════════════════════════════════════════ */
function plusProchePointChemin(pt) {
  let meilleureDistance = Infinity, meilleurPoint = pointsChemin[0], meilleurSegment = 0;
  for (let i = 0; i < pointsChemin.length - 1; i++) {
    const cp = plusProchePointSegment(pt, pointsChemin[i], pointsChemin[i + 1]);
    const d  = Math.hypot(pt.x - cp.x, pt.y - cp.y);
    if (d < meilleureDistance) { meilleureDistance = d; meilleurPoint = cp; meilleurSegment = i; }
  }
  return { x: meilleurPoint.x, y: meilleurPoint.y, seg: meilleurSegment };
}

function plusProchePointSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x)*dx + (p.y - a.y)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t*dx, y: a.y + t*dy };
}

/* ═══════════════════════════════════════════
   VICTOIRE / DÉFAITE
═══════════════════════════════════════════ */
function declencherDefaite(raison) {
  jeuActif = false;
  clearInterval(intervalleMinuterie);
  document.getElementById('raisonDefaite').textContent = raison;
  setTimeout(() => document.getElementById('superpositionDefaite').classList.add('visible'), 600);
}

function declencherVictoire() {
  jeuActif = false;
  clearInterval(intervalleMinuterie);
  lancerConfettis();
  setTimeout(() => {
    dessinerMotifVictoire();
    document.getElementById('superpositionVictoire').classList.add('visible');
  }, 600);
}

function dessinerMotifVictoire() {
  const cv = document.getElementById('canvasMotifVictoire');
  const taille = Math.min(window.innerWidth * 0.55, 200);
  cv.width  = taille;
  cv.height = taille;
  const c = cv.getContext('2d');

  const marge = taille * 0.1;
  const zone  = taille - marge * 2;
  const pts = POURCENTAGES_CHEMIN.map(([px, py]) => ({
    x: marge + px * zone,
    y: marge + py * zone,
  }));

  const cor = taille * 0.055;

  c.beginPath();
  const gauche = [], droite = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    if (i === 0) {
      gauche.push({ x: a.x + nx * cor, y: a.y + ny * cor });
      droite.push({ x: a.x - nx * cor, y: a.y - ny * cor });
    }
    gauche.push({ x: b.x + nx * cor, y: b.y + ny * cor });
    droite.push({ x: b.x - nx * cor, y: b.y - ny * cor });
  }
  c.moveTo(gauche[0].x, gauche[0].y);
  gauche.forEach(p => c.lineTo(p.x, p.y));
  for (let i = droite.length - 1; i >= 0; i--) c.lineTo(droite[i].x, droite[i].y);
  c.closePath();
  c.fillStyle = 'rgba(255, 240, 180, 0.10)';
  c.fill();

  c.save();
  c.strokeStyle = 'rgba(240, 192, 96, 0.9)';
  c.lineWidth = 1.5;
  c.lineCap = 'square'; c.lineJoin = 'miter';
  c.shadowColor = 'rgba(240,192,96,.5)'; c.shadowBlur = 6;
  for (const signe of [1, -1]) {
    c.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * cor * signe, ny = dx / len * cor * signe;
      if (i === 0) c.moveTo(a.x + nx, a.y + ny);
      else         c.lineTo(a.x + nx, a.y + ny);
      c.lineTo(b.x + nx, b.y + ny);
    }
    c.stroke();
  }
  c.restore();

  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(46, 204, 113, 0.9)';
  c.shadowColor = '#2ecc71'; c.shadowBlur = 6;
  c.beginPath();
  pts.forEach((p, i) => i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y));
  c.stroke();
  c.restore();

  c.font = `bold ${Math.round(taille * 0.08)}px sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#2ecc71'; c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 4;
  c.fillText('▶', pts[0].x, pts[0].y);
  c.fillStyle = '#f0c060';
  c.fillText('★', pts[pts.length - 1].x, pts[pts.length - 1].y);
}

/* ═══════════════════════════════════════════
   BOUCLE DE RENDU
═══════════════════════════════════════════ */
function boucle() {
  mettreAJourBalle();
  dessinerImage();
  if (jeuActif) requestAnimationFrame(boucle);
}

function dessinerImage() {
  ctx.clearRect(0, 0, LG, HT);

  if (imgFond.complete && imgFond.naturalWidth > 0) {
    ctx.drawImage(imgFond, 0, 0, LG, HT);
  } else {
    ctx.fillStyle = '#2c2010';
    ctx.fillRect(0, 0, LG, HT);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.50)';
  ctx.fillRect(0, 0, LG, HT);

  dessinerMotif();
  dessinerBalle();
}

/* ═══════════════════════════════════════════
   DESSIN DU MOTIF
═══════════════════════════════════════════ */
function dessinerMotif() {
  if (pointsChemin.length < 2) return;
  const cor = CFG.corridor;

  ctx.save();
  ctx.beginPath();
  construireFormeCouloir(cor);
  ctx.fillStyle = 'rgba(255, 240, 180, 0.12)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(240, 192, 96, 0.95)';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'square';
  ctx.lineJoin    = 'miter';
  ctx.shadowColor = 'rgba(240, 192, 96, 0.55)';
  ctx.shadowBlur  = 8;
  tracerCheminDecale(cor);
  tracerCheminDecale(-cor);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(240, 192, 96, 0.95)';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  dessinerExtrémité(pointsChemin[0], pointsChemin[1], cor);
  dessinerExtrémité(pointsChemin[pointsChemin.length - 1], pointsChemin[pointsChemin.length - 2], cor);
  ctx.restore();

  dessinerMarqueur(pointsChemin[0],                       '▶', '#2ecc71');
  dessinerMarqueur(pointsChemin[pointsChemin.length - 1], '★', '#f0c060');
}

function construireFormeCouloir(cor) {
  const gauche = [], droite = [];
  for (let i = 0; i < pointsChemin.length - 1; i++) {
    const a = pointsChemin[i], b = pointsChemin[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    if (i === 0) {
      gauche.push({ x: a.x + nx * cor, y: a.y + ny * cor });
      droite.push({ x: a.x - nx * cor, y: a.y - ny * cor });
    }
    gauche.push({ x: b.x + nx * cor, y: b.y + ny * cor });
    droite.push({ x: b.x - nx * cor, y: b.y - ny * cor });
  }
  ctx.moveTo(gauche[0].x, gauche[0].y);
  gauche.forEach(p => ctx.lineTo(p.x, p.y));
  for (let i = droite.length - 1; i >= 0; i--) ctx.lineTo(droite[i].x, droite[i].y);
  ctx.closePath();
}

function tracerCheminDecale(decalage) {
  ctx.beginPath();
  for (let i = 0; i < pointsChemin.length - 1; i++) {
    const a = pointsChemin[i], b = pointsChemin[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * decalage, ny = dx / len * decalage;
    if (i === 0) ctx.moveTo(a.x + nx, a.y + ny);
    else         ctx.lineTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
  }
  ctx.stroke();
}

function dessinerExtrémité(pt, suivant, cor) {
  const dx = suivant.x - pt.x, dy = suivant.y - pt.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * cor, ny = dx / len * cor;
  ctx.beginPath();
  ctx.moveTo(pt.x + nx, pt.y + ny);
  ctx.lineTo(pt.x - nx, pt.y - ny);
  ctx.stroke();
}

function dessinerMarqueur(pt, symbole, couleur) {
  ctx.save();
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle   = couleur;
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  ctx.fillText(symbole, pt.x, pt.y);
  ctx.restore();
}

/* ═══════════════════════════════════════════
   DESSIN DE LA BALLE
═══════════════════════════════════════════ */
function dessinerBalle() {
  // Traînée lumineuse
  if (pointsTrace.length > 1) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < pointsTrace.length; i++) {
      const t = i / pointsTrace.length;
      ctx.globalAlpha = t * 0.6;
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth   = 3 * t;
      ctx.shadowColor = '#2ecc71';
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.moveTo(pointsTrace[i - 1].x, pointsTrace[i - 1].y);
      ctx.lineTo(pointsTrace[i].x,     pointsTrace[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Corps de la balle
  ctx.save();
  const rayon = 10;
  // Halo extérieur
  ctx.beginPath();
  ctx.arc(balle.x, balle.y, rayon + 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();
  // Balle avec dégradé radial
  const gradient = ctx.createRadialGradient(
    balle.x - 3, balle.y - 3, 1,
    balle.x, balle.y, rayon
  );
  gradient.addColorStop(0,   '#ffffff');
  gradient.addColorStop(0.4, '#c8e6c9');
  gradient.addColorStop(1,   '#4caf50');
  ctx.beginPath();
  ctx.arc(balle.x, balle.y, rayon, 0, Math.PI * 2);
  ctx.fillStyle   = gradient;
  ctx.shadowColor = 'rgba(76, 175, 80, 0.9)';
  ctx.shadowBlur  = 18;
  ctx.fill();
  ctx.restore();
}

/* ═══════════════════════════════════════════
   SECOUSSE
═══════════════════════════════════════════ */
function secouerCanvas() {
  const enveloppeur = document.getElementById('enveloppeurCanvas');
  enveloppeur.style.transition = 'none';
  let n = 0;
  const iv = setInterval(() => {
    enveloppeur.style.transform = `translate(${(Math.random() - .5) * 14}px,${(Math.random() - .5) * 14}px)`;
    if (++n > 6) { clearInterval(iv); enveloppeur.style.transform = ''; }
  }, 60);
}

/* ═══════════════════════════════════════════
   NOTIFICATION
═══════════════════════════════════════════ */
let minuterieNotification = null;
function afficherNotification(message, type) {
  const el = document.getElementById('notification');
  el.textContent = message; el.className = 'visible ' + type;
  if (minuterieNotification) clearTimeout(minuterieNotification);
  minuterieNotification = setTimeout(() => el.classList.remove('visible'), 1800);
}

/* ═══════════════════════════════════════════
   CONFETTIS
═══════════════════════════════════════════ */
function lancerConfettis() {
  canvasConfettis.width = window.innerWidth; canvasConfettis.height = window.innerHeight;
  for (let i = 0; i < 120; i++) partiesConfettis.push({
    x: Math.random() * canvasConfettis.width, y: -20 - Math.random() * 200,
    r: 3 + Math.random() * 5,
    couleur: ['#c9973a','#f0c060','#2ecc71','#3498db','#e74c3c','#ecf0f1'][~~(Math.random() * 6)],
    vx: (Math.random() - .5) * 4, vy: 2 + Math.random() * 4,
    rot: Math.random() * 360, rotV: (Math.random() - .5) * 6, alpha: 1,
  });
  animerConfettis();
}
function animerConfettis() {
  ctxConfettis.clearRect(0, 0, canvasConfettis.width, canvasConfettis.height);
  partiesConfettis = partiesConfettis.filter(p => p.alpha > 0);
  partiesConfettis.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
    if (p.y > canvasConfettis.height * .8) p.alpha -= .02;
    ctxConfettis.save(); ctxConfettis.globalAlpha = p.alpha; ctxConfettis.fillStyle = p.couleur;
    ctxConfettis.translate(p.x, p.y); ctxConfettis.rotate(p.rot * Math.PI / 180);
    ctxConfettis.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctxConfettis.restore();
  });
  if (partiesConfettis.length) requestAnimationFrame(animerConfettis);
}

/* ═══════════════════════════════════════════
   UTILITAIRES
═══════════════════════════════════════════ */
function afficher(id) { document.getElementById(id).classList.add('visible'); }
function masquer(id)  { document.getElementById(id).classList.remove('visible'); }

/* ═══════════════════════════════════════════
   DÉMARRAGE
═══════════════════════════════════════════ */
redimensionner();
imgFond.onload = () => dessinerImage();
