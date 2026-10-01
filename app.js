// ─────────────────────────────────────────────
// app.js — Stash main application logic
// Firebase auth, Firestore data, all UI interactions
// ─────────────────────────────────────────────

import { auth, db } from './firebase.js';
import { openUploadWidget } from './cloudinary.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, serverTimestamp, Timestamp, writeBatch, getCountFromServer, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let currentUser = null;
let currentUserData = null;
let currentScreen = 'dashboard';
let marketFilter = 'all';
let platformFilter = 'all';
const PLATFORMS = ['PlayStation 4', 'PlayStation 5', 'Xbox One', 'Xbox Series X|S'];
let lastDashListings = [];
let marketListings = [];
let currentSheetListing = null;
let unsubscribeListeners = [];


// ═══════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════
const LOADING_SCREEN_MIN_MS = 1800;
const loadingScreenStartTime = Date.now();

function hideLoadingScreen() {
  const screen = document.getElementById('loadingScreen');
  if (!screen) return;
  const elapsed = Date.now() - loadingScreenStartTime;
  const remaining = Math.max(0, LOADING_SCREEN_MIN_MS - elapsed);

  setTimeout(() => {
    screen.style.opacity = '0';
    screen.style.transform = 'scale(1.02)';
    screen.style.pointerEvents = 'none';
    setTimeout(() => { screen.style.display = 'none'; }, 600);
  }, remaining);
}

function showLoadingAnimation() {
  const logo = document.getElementById('loadingLogo');
  const tagline = document.getElementById('loadingTagline');
  const bar = document.getElementById('loadingBar');
  if (logo) { logo.style.opacity = '1'; logo.style.transform = 'translateY(0)'; }
  if (tagline) { tagline.style.opacity = '1'; }
  if (bar) { setTimeout(() => { bar.style.width = '100%'; }, 100); }
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
let registering = false;
let isGuest = true;
let navBound = false;
let pendingSheetListing = null;
let marketUnsub = null;
let openListingAfterProfile = false;
let openHuntAfterProfile = false;
let huntsUnsub = null;
let hunts = [];
let huntFilter = 'all';
const HUNT_CATEGORIES = ['Watches', 'Sneakers', 'Tech', 'Jewelry', 'Cars', 'Bags', 'Games', 'Parts Bin', 'Other'];

function cleanupListeners() {
  unsubscribeListeners.forEach(u => u());
  unsubscribeListeners = [];
  marketUnsub = null;
  huntsUnsub = null;
}

onAuthStateChanged(auth, async (user) => {
  cleanupListeners();
  if (user) {
    currentUser = user;
    currentUserData = null;
    const justRegistered = registering;
    registering = false;
    await loadUserData(user.uid);
    if (!currentUserData && !justRegistered) {
      // Signed in (e.g. first Google sign-in) but no profile yet
      openProfileSetup();
    } else {
      enterMemberMode();
    }
  } else {
    currentUser = null;
    currentUserData = null;
    enterGuestMode();
  }
  hideLoadingScreen();
});

function enterGuestMode() {
  isGuest = true;
  document.body.classList.add('guest');
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('appWrap').style.display = 'block';
  bindNavOnce();
  loadMarketplace();
  if (currentScreen !== 'marketplace') switchScreen('marketplace');
}

function enterMemberMode() {
  isGuest = false;
  document.body.classList.remove('guest');
  showApp();
  initApp();
  const back = pendingSheetListing;
  pendingSheetListing = null;
  if (back) {
    if (currentScreen !== 'marketplace') switchScreen('marketplace');
    openSheet(back);
  } else if (currentScreen !== 'dashboard') {
    switchScreen('dashboard');
  }
  if (currentUserData) {
    migrateLegacyContacts();
    migrateGameListings();
  }
}

// Old listings stored contact info on the listing itself. Move it to the profile
// and strip it from the listing (listings are publicly readable now).
async function migrateLegacyContacts() {
  try {
    const snap = await getDocs(query(collection(db, 'listings'), where('sellerId', '==', currentUser.uid)));
    let wa = '';
    let ig = '';
    const dirty = [];
    snap.docs.forEach(d => {
      const x = d.data();
      if ('whatsapp' in x || 'instagram' in x) {
        dirty.push(d.ref);
        wa = wa || x.whatsapp || '';
        ig = ig || x.instagram || '';
      }
    });
    if (!dirty.length) return;

    const profileUpdate = {};
    const cleanWa = normalizeWhatsApp(wa);
    const cleanIg = normalizeInstagram(ig);
    if (!currentUserData.whatsapp && cleanWa) profileUpdate.whatsapp = cleanWa;
    if (!currentUserData.instagram && cleanIg) profileUpdate.instagram = cleanIg;
    if (Object.keys(profileUpdate).length) {
      await updateDoc(doc(db, 'users', currentUser.uid), profileUpdate);
    }
    await Promise.all(dirty.map(ref => updateDoc(ref, { whatsapp: deleteField(), instagram: deleteField() })));
  } catch (e) {
    console.error('Contact migration failed', e);
  }
}

// One-time tidy-up: old game-disk listings that were filed under "Other"
async function migrateGameListings() {
  try {
    const snap = await getDocs(query(collection(db, 'listings'), where('sellerId', '==', currentUser.uid)));
    let moved = 0;
    await Promise.all(snap.docs.map(async d => {
      const x = d.data();
      const name = x.name || '';
      const platform = detectPlatform(name);
      if (x.category !== 'Other' || !platform || !/(dis[ck]|game)/i.test(name)) return;
      await updateDoc(d.ref, { category: 'Games', specs: { ...(x.specs || {}), specPlatform: platform } });
      moved++;
    }));
    if (moved) showToast(`Moved ${moved} game listing${moved !== 1 ? 's' : ''} to the Games category`, 'success');
  } catch (e) {
    console.error('Game migration failed', e);
  }
}

// ═══════════════════════════════════════════
// GRAIL HUNTS (public bounties: what I'm hunting + target price)
// Each person can have up to 5 hunts at once (doc ids are uid_1 … uid_5),
// and a hunt expires after 30 days.
// ═══════════════════════════════════════════
function timeAgo(ms) {
  if (!ms) return '';
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function loadHunts() {
  if (huntsUnsub) return;
  const q = query(collection(db, 'hunts'), orderBy('createdAt', 'desc'), limit(100));
  huntsUnsub = onSnapshot(q, (snap) => {
    hunts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHunts();
    cleanupOwnExpiredHunts();
  }, (err) => {
    console.error('Hunts load failed', err);
    huntsUnsub = null;
    setText('huntCount', 'Could not load');
  });
  unsubscribeListeners.push(huntsUnsub);
}

// Frees slots: your own hunts that ran out are removed automatically
function cleanupOwnExpiredHunts() {
  if (!currentUser) return;
  hunts
    .filter(h => h.hunterId === currentUser.uid && h.expiresAt?.toMillis?.() <= Date.now())
    .forEach(h => deleteDoc(doc(db, 'hunts', h.id)).catch(() => {}));
}

function huntActive(h) {
  return (h.expiresAt?.toMillis?.() || 0) > Date.now();
}

function renderHunts() {
  const grid = document.getElementById('huntGrid');
  if (!grid) return;
  const search = (document.getElementById('huntSearch')?.value || '').toLowerCase();

  let list = hunts.filter(huntActive);
  if (huntFilter !== 'all') list = list.filter(h => h.category === huntFilter);
  if (search) {
    list = list.filter(h =>
      h.title?.toLowerCase().includes(search) ||
      h.description?.toLowerCase().includes(search) ||
      h.category?.toLowerCase().includes(search)
    );
  }
  setText('huntCount', `${list.length} hunt${list.length !== 1 ? 's' : ''}`);

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎯</div><div class="empty-title">No Hunts Yet</div><div class="empty-sub">Looking for something specific? Post the first Grail Hunt and let sellers find you.</div></div>`;
    return;
  }

  grid.innerHTML = list.map(h => {
    const mine = currentUser && h.hunterId === currentUser.uid;
    const daysLeft = Math.max(1, Math.ceil((h.expiresAt.toMillis() - Date.now()) / 86400000));
    return `
      <div class="hunt-card${mine ? ' mine' : ''}">
        <div class="hunt-top">
          <span class="hunt-cat">${getCategoryEmoji(h.category)} ${escHtml(h.category || 'Other')}</span>
          <span class="hunt-age">${timeAgo(h.createdAt?.toMillis?.())}</span>
        </div>
        <div class="hunt-title">${escHtml(h.title)}</div>
        ${h.description ? `<div class="hunt-desc">${escHtml(h.description)}</div>` : ''}
        <div class="hunt-target"><span>TARGET PRICE</span><b>SCR ${Number(h.targetPriceSCR || 0).toLocaleString()}</b></div>
        <div class="hunt-by">@${escHtml(h.hunterUsername || 'unknown')}${mine ? ' (you)' : ''} · ${daysLeft}d left</div>
        ${mine
          ? `<div class="hunt-actions">
               <button class="modal-btn hunt-btn" onclick="deleteHunt('${h.id}', true)">🎉 Found it</button>
               <button class="modal-btn-ghost hunt-btn" onclick="deleteHunt('${h.id}', false)">Delete</button>
             </div>`
          : `<button class="modal-btn hunt-btn" onclick="openHuntView('${h.id}')">I have this</button>`}
      </div>`;
  }).join('');
}

function filterHunts() { renderHunts(); }

function setHuntFilter(el, value) {
  el.closest('.filter-row').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  huntFilter = value;
  renderHunts();
}

function openHuntForm() {
  if (!currentUser) return requireAuth('Sign up to post a hunt');
  if (!currentUserData?.whatsapp && !currentUserData?.instagram) {
    showToast('Add your WhatsApp or Instagram to your profile first so sellers can reach you.', 'info');
    openHuntAfterProfile = true;
    openEditProfile();
    return;
  }
  ['huntTitle', 'huntPrice', 'huntDesc'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('huntCategory').value = '';
  document.getElementById('huntFormModal').classList.add('open');
}

function closeHuntForm() {
  document.getElementById('huntFormModal').classList.remove('open');
}

async function submitHunt() {
  if (!currentUser || !currentUserData) return;
  const title = document.getElementById('huntTitle').value.trim();
  const category = document.getElementById('huntCategory').value;
  const price = parseFloat(document.getElementById('huntPrice').value);
  const description = document.getElementById('huntDesc').value.trim();

  if (title.length < 3) return showToast('Tell us what you are hunting (at least 3 characters)', 'error');
  if (title.length > 100) return showToast('Title is too long (100 characters max)', 'error');
  if (!HUNT_CATEGORIES.includes(category)) return showToast('Pick a category', 'error');
  if (isNaN(price) || price <= 0) return showToast('Enter your target price', 'error');
  if (description.length > 500) return showToast('Details are too long (500 characters max)', 'error');

  const btn = document.getElementById('huntSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    // Find a free slot (max 5 hunts at once)
    const mine = await getDocs(query(collection(db, 'hunts'), where('hunterId', '==', currentUser.uid)));
    const used = new Set(mine.docs.map(d => d.id));
    let slot = null;
    for (let n = 1; n <= 5; n++) {
      if (!used.has(`${currentUser.uid}_${n}`)) { slot = n; break; }
    }
    if (!slot) {
      return showToast('You can have up to 5 active hunts. Mark one as found or delete it first.', 'error');
    }

    await setDoc(doc(db, 'hunts', `${currentUser.uid}_${slot}`), {
      hunterId: currentUser.uid,
      hunterUsername: currentUserData.username,
      hunterDisplayName: (currentUserData.displayName || currentUserData.username).slice(0, 40),
      title,
      category,
      description,
      targetPriceSCR: price,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    closeHuntForm();
    showToast('🎯 Hunt posted! It stays up for 30 days.', 'success');
  } catch (err) {
    showToast('Could not post hunt: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteHunt(id, found) {
  if (!currentUser) return;
  if (!found && !confirm('Delete this hunt?')) return;
  try {
    await deleteDoc(doc(db, 'hunts', id));
    showToast(found ? '🎉 Nice! Hunt closed.' : 'Hunt deleted', 'success');
  } catch (err) {
    showToast('Could not update hunt: ' + err.message, 'error');
  }
}

async function openHuntView(id) {
  const h = hunts.find(x => x.id === id);
  if (!h) return;
  setText('huntViewTitle', h.title);
  document.getElementById('huntViewMeta').innerHTML =
    `<span class="hunt-cat">${getCategoryEmoji(h.category)} ${escHtml(h.category || 'Other')}</span>`
    + `<span class="hunt-view-price">Target: SCR ${Number(h.targetPriceSCR || 0).toLocaleString()}</span>`;
  const desc = document.getElementById('huntViewDesc');
  desc.textContent = h.description || '';
  desc.style.display = h.description ? 'block' : 'none';
  setText('huntViewBy', `Hunt posted by @${h.hunterUsername || 'unknown'}`);

  const actions = document.getElementById('huntViewActions');
  actions.innerHTML = '';
  document.getElementById('huntViewModal').classList.add('open');

  if (!currentUser) {
    const btn = document.createElement('button');
    btn.className = 'modal-btn';
    btn.textContent = 'Sign up free to respond';
    btn.onclick = () => { closeHuntView(); requireAuth('Sign up free to respond to hunts'); };
    actions.appendChild(btn);
    return;
  }

  let contact = {};
  try {
    const snap = await getDoc(doc(db, 'users', h.hunterId));
    if (snap.exists()) contact = snap.data();
  } catch (e) {
    console.error('Hunter contact load failed', e);
  }

  const msg = `Hi! I saw your Grail Hunt for "${h.title}" on Stash. I think I have one. Interested?`;
  const links = [];
  const wa = (contact.whatsapp || '').replace(/[^0-9]/g, '');
  if (wa) links.push({ text: 'WhatsApp the hunter', href: `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` });
  const ig = (contact.instagram || '').replace('@', '').trim();
  if (ig) links.push({ text: 'Message on Instagram', href: `https://instagram.com/${encodeURIComponent(ig)}` });

  if (!links.length) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size:13px;color:var(--text-muted);text-align:center;padding:10px';
    note.textContent = "This hunter hasn't added contact info yet.";
    actions.appendChild(note);
    return;
  }
  links.forEach(l => {
    const a = document.createElement('a');
    a.className = 'modal-btn';
    a.style.cssText = 'display:block;text-align:center;text-decoration:none;margin-bottom:10px';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.href = l.href;
    a.textContent = l.text;
    actions.appendChild(a);
  });
}

function closeHuntView() {
  document.getElementById('huntViewModal').classList.remove('open');
}

function normalizeWhatsApp(v) {
  v = (v || '').trim();
  if (!v) return '';
  return /^[+0-9 ()-]{5,25}$/.test(v) ? v : null;
}

function normalizeInstagram(v) {
  v = (v || '').trim().replace(/^@/, '');
  if (!v) return '';
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? '@' + v : null;
}

function bindNavOnce() {
  if (navBound) return;
  navBound = true;
  setupSidebarNav();
  setupMobileNav();
}

function requireAuth(message) {
  if (message) showToast(message, 'info');
  openAuth('register');
}

function openAuth(mode = 'login') {
  document.getElementById('authWrap').style.display = 'flex';
  if (mode === 'register') showRegister(); else showLogin();
}

function closeAuth() {
  if (currentUser) return;
  document.getElementById('authWrap').style.display = 'none';
}

// Start the loading animation immediately
showLoadingAnimation();

// Safety fallback — never let the loading screen hang forever
setTimeout(() => {
  hideLoadingScreen();
}, 5000);

async function loadUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    currentUserData = snap.data();
  }
  // Listen for real-time user data updates (balance, locked status, rep)
  const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) {
      currentUserData = snap.data();
      updateUserUI();
    }
  });
  unsubscribeListeners.push(unsub);
}

async function handleRegister() {
  const username = document.getElementById('regUsername').value.trim().toLowerCase().replace('@','');
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const whatsapp = normalizeWhatsApp(document.getElementById('regWhatsApp').value);
  const instagram = normalizeInstagram(document.getElementById('regInstagram').value);

  if (!username || !email || !password) return showToast('Please fill in all fields', 'error');
  if (username.length < 3) return showToast('Username must be at least 3 characters', 'error');
  if (username.length > 30) return showToast('Username is too long', 'error');
  if (whatsapp === null) return showToast('WhatsApp should look like +2482510123', 'error');
  if (instagram === null) return showToast('That Instagram handle looks invalid', 'error');

  let cred = null;
  registering = true;
  try {
    // Create the auth account FIRST so we're authenticated for Firestore reads/writes
    cred = await createUserWithEmailAndPassword(auth, email, password);

    // Now check username uniqueness (we're authenticated, so this read is allowed)
    const usernameSnap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!usernameSnap.empty) {
      // Username taken — delete the auth account we just created and bail
      await cred.user.delete();
      return showToast('Username already taken', 'error');
    }

    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      username,
      displayName: username,
      bio: '',
      avatarUrl: '',
      portfolioValue: 0,
      whatsapp,
      instagram,
      createdAt: serverTimestamp()
    });
    showToast('Welcome to Stash!', 'success');
  } catch (err) {
    registering = false;
    // Clean up auth account if something failed after it was created
    if (cred && cred.user) {
      try { await cred.user.delete(); } catch (e) {}
    }
    showToast(err.message, 'error');
  }
}

async function handleGoogleSignIn() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/unauthorized-domain') {
      return showToast('This site is not in Firebase Authorized domains yet.', 'error');
    }
    if (err.code === 'auth/popup-blocked') {
      return showToast('Your browser blocked the Google window. Allow pop-ups and try again.', 'error');
    }
    showToast(err.message, 'error');
  }
}

function openProfileSetup() {
  isGuest = false;
  document.body.classList.remove('guest');
  document.getElementById('appWrap').style.display = 'none';
  document.getElementById('authWrap').style.display = 'flex';
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'none';
  document.getElementById('setupCard').style.display = 'block';
  const base = (currentUser.displayName || (currentUser.email || '').split('@')[0] || '')
    .toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
  document.getElementById('setupUsername').value = base;
}

async function completeProfileSetup() {
  if (!currentUser) return;
  const username = document.getElementById('setupUsername').value.trim().toLowerCase().replace('@', '');
  const whatsapp = normalizeWhatsApp(document.getElementById('setupWhatsApp').value);
  const instagram = normalizeInstagram(document.getElementById('setupInstagram').value);

  if (username.length < 3) return showToast('Username must be at least 3 characters', 'error');
  if (username.length > 30) return showToast('Username is too long', 'error');
  if (whatsapp === null) return showToast('WhatsApp should look like +2482510123', 'error');
  if (instagram === null) return showToast('That Instagram handle looks invalid', 'error');

  try {
    const taken = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!taken.empty) return showToast('Username already taken', 'error');

    const profile = {
      uid: currentUser.uid,
      username,
      displayName: (currentUser.displayName || username).slice(0, 40),
      bio: '',
      avatarUrl: '',
      portfolioValue: 0,
      whatsapp,
      instagram
    };
    await setDoc(doc(db, 'users', currentUser.uid), { ...profile, createdAt: serverTimestamp() });
    currentUserData = profile;
    showToast('Welcome to Stash!', 'success');
    enterMemberMode();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function cancelProfileSetup() {
  signOut(auth);
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showToast('Please fill in all fields', 'error');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Welcome back!', 'success');
  } catch (err) {
    showToast('Invalid email or password', 'error');
  }
}

async function handleLogout() {
  cleanupListeners();
  await signOut(auth);
}

function showApp() {
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('appWrap').style.display = 'block';
}

function showAuth() {
  document.getElementById('authWrap').style.display = 'flex';
  document.getElementById('appWrap').style.display = 'none';
}

function showLogin() {
  document.getElementById('loginCard').style.display = 'block';
  document.getElementById('registerCard').style.display = 'none';
  document.getElementById('setupCard').style.display = 'none';
}

function showRegister() {
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'block';
  document.getElementById('setupCard').style.display = 'none';
}

// ═══════════════════════════════════════════
// APP INIT
// ═══════════════════════════════════════════
function initApp() {
  bindNavOnce();
  updateUserUI();
  loadDashboard();
  loadMarketplace();
  loadLeaderboard();
}

function updateUserUI() {
  if (!currentUserData) return;
  const initials = (currentUserData.displayName || currentUserData.username || 'U').substring(0,2).toUpperCase();

  // Avatars
  ['sidebarAvatar','topbarAvatar','mobileAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (currentUserData.avatarUrl) {
      el.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      el.textContent = initials;
    }
  });

  // Names
  const nameEl = document.getElementById('sidebarName');
  const handleEl = document.getElementById('sidebarHandle');
  if (nameEl) nameEl.textContent = currentUserData.displayName || currentUserData.username;
  if (handleEl) handleEl.textContent = '@' + currentUserData.username;

  // Dashboard stats
  refreshMyRep();

  // Admin nav
  if (currentUserData.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
  }

  // Portfolio screen
  updatePortfolioUI();
  // Mobile drawer
  updateDrawerUI();
}

// ═══════════════════════════════════════════
// TRADER REP = number of verified handshakes (counted from completions)
// ═══════════════════════════════════════════
async function getRep(uid) {
  const col = collection(db, 'completions');
  const [asBuyer, asSeller] = await Promise.all([
    getCountFromServer(query(col, where('buyerId', '==', uid))),
    getCountFromServer(query(col, where('sellerId', '==', uid)))
  ]);
  return asBuyer.data().count + asSeller.data().count;
}

let repCache = { uid: null, at: 0 };
async function refreshMyRep(force = false) {
  if (!currentUser) return;
  if (!force && repCache.uid === currentUser.uid && Date.now() - repCache.at < 30000) return;
  repCache = { uid: currentUser.uid, at: Date.now() };
  try {
    const rep = await getRep(currentUser.uid);
    ['dashTraderRep', 'portTraderRep', 'portStatRep'].forEach(id => setText(id, rep));
  } catch (e) {
    console.error('Rep load failed', e);
  }
}

function updatePortfolioUI() {
  if (!currentUserData) return;
  const initials = (currentUserData.displayName || currentUserData.username || 'U').substring(0,2).toUpperCase();
  const portAvatar = document.getElementById('portAvatar');
  if (portAvatar) {
    if (currentUserData.avatarUrl) {
      portAvatar.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover">`;
    } else {
      portAvatar.textContent = initials;
    }
  }
  setText('portName', currentUserData.displayName || currentUserData.username);
  setText('portHandle', '@' + currentUserData.username + ' · stash.app/u/' + currentUserData.username);
  setText('portBio', currentUserData.bio || 'Add a bio in your profile settings.');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}


// ═══════════════════════════════════════════
// NOTIFICATION SOUND SYSTEM
// ═══════════════════════════════════════════
const AudioContext = window.AudioContext || window.webkitAudioContext;

function playNotificationSound(type = 'info') {
  try {
    const ctx = new AudioContext();

    const sounds = {
      success: [
        { freq: 523.25, start: 0,    duration: 0.12, gain: 0.18 }, // C5
        { freq: 659.25, start: 0.1,  duration: 0.12, gain: 0.16 }, // E5
        { freq: 783.99, start: 0.2,  duration: 0.2,  gain: 0.14 }, // G5
      ],
      error: [
        { freq: 311.13, start: 0,    duration: 0.15, gain: 0.18 }, // Eb4
        { freq: 277.18, start: 0.14, duration: 0.25, gain: 0.15 }, // Db4
      ],
      info: [
        { freq: 698.46, start: 0,    duration: 0.1,  gain: 0.14 }, // F5
        { freq: 880.00, start: 0.09, duration: 0.18, gain: 0.12 }, // A5
      ]
    };

    const notes = sounds[type] || sounds.info;

    notes.forEach(({ freq, start, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      // Smooth fade in and out for elegance
      gainNode.gain.setValueAtTime(0, ctx.currentTime + start);
      gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    });

    // Close context after all sounds finish
    setTimeout(() => ctx.close(), 1000);
  } catch (e) {
    // Silently fail if audio not supported
  }
}

// ═══════════════════════════════════════════
// SCREEN SWITCHING
// ═══════════════════════════════════════════
const topbarTitles = {
  dashboard: 'My Stash',
  marketplace: 'Marketplace',
  hunts: '🎯 Grail Hunts',
  shop: '✦ Exotic Shop',
  leaderboard: '🏆 Leaderboard',
  portfolio: 'Public Profile',
  trades: 'My Trades',
  admin: '🛡 Admin Panel'
};

function switchScreen(id) {
  if (id === currentScreen) return;

  // Guests can only browse the marketplace and the hunts board
  if (!currentUser && id !== 'marketplace' && id !== 'hunts') {
    requireAuth('Sign up to see this. It only takes a moment.');
    return;
  }

  // Hard block — only the verified admin account can ever see this screen
  if (id === 'admin' && !currentUserData?.isAdmin) {
    showToast('Access denied', 'error');
    return;
  }

  const leaving = document.getElementById('screen-' + currentScreen);
  const entering = document.getElementById('screen-' + id);
  if (!entering) return;

  leaving.classList.add('leaving');
  setTimeout(() => {
    leaving.classList.remove('leaving', 'active');
    entering.scrollTop = 0;
    entering.classList.add('active');
    currentScreen = id;

    // Lazy load screen data
    if (id === 'marketplace') loadMarketplace();
    if (id === 'hunts') loadHunts();
    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'trades') loadTrades();
    if (id === 'portfolio') loadPortfolioListings();
  }, 220);

  document.querySelectorAll('.snav').forEach(n => n.classList.toggle('active', n.dataset.screen === id));
  document.querySelectorAll('.bottom-nav .nav-item[data-screen]').forEach(n => n.classList.toggle('active', n.dataset.screen === id));
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = topbarTitles[id] || id;
}

function setupSidebarNav() {
  document.querySelectorAll('.snav[data-screen]').forEach(el => {
    el.addEventListener('click', () => switchScreen(el.dataset.screen));
  });
}

function setupMobileNav() {
  document.querySelectorAll('.bottom-nav .nav-item[data-screen]').forEach(el => {
    el.addEventListener('click', () => switchScreen(el.dataset.screen));
  });
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
async function loadDashboard() {
  if (!currentUser) return;

  // No orderBy here to avoid needing a composite Firestore index
  const q = query(
    collection(db, 'listings'),
    where('sellerId', '==', currentUser.uid),
    where('status', '==', 'active')
  );

  const unsub = onSnapshot(q, (snap) => {
    const listings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    lastDashListings = listings;
    renderDashboard(listings);
  });
  unsubscribeListeners.push(unsub);
}

function renderDashboard(listings) {
  const pinned = listings.filter(l => l.pinned);
  const all = listings;

  // Portfolio value
  const total = listings.reduce((sum, l) => sum + (l.priceSCR || 0), 0);
  const nwEl = document.getElementById('nwValue');
  if (nwEl) animateCount(nwEl, total);

  const trendEl = document.getElementById('nwTrend');
  if (trendEl) {
    trendEl.textContent = listings.length === 0
      ? 'No items yet — list your first item!'
      : `${listings.length} item${listings.length !== 1 ? 's' : ''} in your stash`;
    trendEl.style.color = 'var(--green)';
    trendEl.style.background = 'var(--green-bg)';
    trendEl.style.border = '1px solid var(--green-border)';
  }

  setText('dashTotalItems', listings.length);

  // Update Firestore portfolio value
  if (currentUser) {
    updateDoc(doc(db, 'users', currentUser.uid), { portfolioValue: total }).catch(() => {});
  }

  // Portfolio screen stats
  setText('portStatItems', listings.length);
  setText('portStatValue', 'SCR ' + total.toLocaleString());
  setText('portValue', 'SCR ' + total.toLocaleString());
  setText('portItemCount', listings.length + ' items');
  setText('pubCount', listings.length + ' Items');
  setText('myListingsCount', listings.length + ' Items');

  // Pinned grails
  setText('pinnedCount', pinned.length + ' Pinned');
  const pinnedGrid = document.getElementById('pinnedGrid');
  if (pinnedGrid) {
    if (pinned.length === 0) {
      pinnedGrid.innerHTML = `<div class="empty-state" style="grid-column:span 3;padding:40px"><div class="empty-icon">📌</div><div class="empty-title">No Grails Pinned Yet</div><div class="empty-sub">Pin your most prized items to the Top Shelf when listing them.</div></div>`;
    } else {
      pinnedGrid.innerHTML = pinned.slice(0,3).map((l, i) => renderTopShelfCard(l, i === 0)).join('');
    }
  }

  // My listings grid
  const grid = document.getElementById('myListingsGrid');
  if (grid) {
    if (all.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:span 4;padding:40px"><div class="empty-icon">📦</div><div class="empty-title">Your Stash is Empty</div><div class="empty-sub">Start listing your items to build your collection portfolio.</div><button class="modal-btn" style="width:auto;padding:14px 28px;margin-top:16px" onclick="openListingModal()">List Your First Item</button></div>`;
    } else {
      grid.innerHTML = all.map(l => renderClosetCard(l)).join('');
    }
  }

  // Portfolio grid
  renderPortfolioGrid(all);
}

function renderTopShelfCard(l, featured = false) {
  const frameClass = getFrameClass(l.frame);
  const imgContent = l.imageUrl
    ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">`
    : getCategoryEmoji(l.category);
  return `
    <div class="glass-card ${frameClass}${featured ? '' : ''}" style="${featured ? 'grid-column:span 1' : ''}">
      <div class="quick-edit-btn" onclick="openConfirmDelete('${l.id}')"><i class="ti ti-trash"></i></div>
      ${getFrameBadge(l.frame)}
      <div class="item-img tall">${imgContent}</div>
      <div class="item-name">${escHtml(l.name)}</div>
      <div class="item-sub">${escHtml(l.description || '')}</div>
      <div class="item-value">${priceHTML(l)}</div>
    </div>`;
}

function renderClosetCard(l) {
  const imgContent = l.imageUrl
    ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">`
    : getCategoryEmoji(l.category);
  const intentTag = l.intent ? `<div class="intent-tag tag-${l.intent}" style="margin-top:6px">${getIntentLabel(l.intent)}</div>` : '';
  return `
    <div class="closet-card" style="position:relative">
      <div class="quick-edit-btn" style="top:10px;right:10px" onclick="openEditListing('${l.id}')"><i class="ti ti-pencil"></i></div>
      <div class="closet-img">${imgContent}</div>
      <div class="closet-name">${escHtml(l.name)}</div>
      <div class="closet-sub">${escHtml(l.category || '')}</div>
      <div class="closet-value">${priceHTML(l)}</div>
      ${intentTag}
    </div>`;
}

function renderPortfolioGrid(listings) {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;
  if (listings.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 4"><div class="empty-icon">📦</div><div class="empty-title">No Public Listings</div></div>`;
    return;
  }
  grid.innerHTML = listings.map(l => {
    const frameClass = l.frame && l.frame !== 'default' ? `${l.frame}-frame` : '';
    const imgContent = l.imageUrl ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">` : getCategoryEmoji(l.category);
    const intentTag = `<div class="intent-tag tag-${l.intent || 'trade'}">${getIntentLabel(l.intent)}</div>`;
    return `
      <div class="p-card ${frameClass}" data-intent="${l.intent || 'trade'}" style="position:relative">
        <div class="quick-edit-btn" onclick="openEditListing('${l.id}')"><i class="ti ti-pencil"></i></div>
        ${getFrameBadge(l.frame)}
        <div class="p-img">${imgContent}</div>
        <div class="item-name">${escHtml(l.name)}</div>
        <div class="item-sub">${escHtml(l.category || '')}</div>
        <div class="p-footer">
          <div><div class="p-value">${priceHTML(l)}</div>${intentTag}</div>
          <button class="inquire-btn" style="background:var(--glass-gold);color:var(--gold)" onclick="openEditListing('${l.id}')">Edit</button>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════
async function loadMarketplace() {
  if (marketUnsub) return;
  // No orderBy to avoid composite index requirement
  const q = query(
    collection(db, 'listings'),
    where('status', 'in', ['active', 'reserved']),
    limit(50)
  );

  marketUnsub = onSnapshot(q, (snap) => {
    marketListings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderMarketplace();
  }, (err) => {
    console.error('Marketplace load failed', err);
    marketUnsub = null;
  });
  unsubscribeListeners.push(marketUnsub);
}

function renderMarketplace() {
  const search = (document.getElementById('marketSearch')?.value || '').toLowerCase();
  let filtered = marketListings;

  if (marketFilter !== 'all') {
    filtered = filtered.filter(l => l.category === marketFilter);
  }
  if (marketFilter === 'Games' && platformFilter !== 'all') {
    filtered = filtered.filter(l => matchesPlatform(l.specs?.specPlatform, platformFilter));
  }
  if (search) {
    filtered = filtered.filter(l =>
      l.name?.toLowerCase().includes(search) ||
      l.category?.toLowerCase().includes(search) ||
      l.description?.toLowerCase().includes(search) ||
      l.specs?.specPlatform?.toLowerCase().includes(search)
    );
  }

  setText('marketCount', filtered.length + ' Listings');

  const grid = document.getElementById('marketplaceGrid');
  if (!grid) return;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:span 4"><div class="empty-icon">🔍</div><div class="empty-title">No Listings Found</div><div class="empty-sub">Try adjusting your search or filters.</div></div>`;
    return;
  }

  grid.innerHTML = filtered.map(l => {
    const isMine = l.sellerId === currentUser?.uid;
    const imgContent = l.imageUrl
      ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">`
      : getCategoryEmoji(l.category);
    const statusTag = l.status === 'reserved'
      ? `<div class="intent-tag tag-reserved">Reserved</div>`
      : `<div class="intent-tag tag-${l.intent || 'trade'}">${getIntentLabel(l.intent)}</div>`;

    const actionBtn = isMine
      ? `<button class="reserve-btn" style="background:var(--glass-gold);color:var(--gold)" onclick="openEditListing('${l.id}')"><i class="ti ti-pencil" style="margin-right:4px"></i>Edit Listing</button>`
      : `<button class="reserve-btn" onclick="openSheet('${l.id}')" ${l.status === 'reserved' ? 'disabled' : ''}>${l.status === 'reserved' ? 'Reserved' : 'View & Contact'}</button>`;

    return `
      <div class="listing-card" style="${isMine ? 'border-color:rgba(212,160,23,0.35)' : ''}">
        <div class="listing-img" style="position:relative">${imgContent}${isMine ? '<div style="position:absolute;top:8px;right:8px;background:rgba(212,160,23,0.9);color:#080809;font-size:10px;font-weight:800;padding:3px 8px;border-radius:6px">YOURS</div>' : ''}</div>
        <div class="listing-name">${escHtml(l.name)}</div>
        <div class="listing-seller">by @${escHtml(l.sellerUsername || 'unknown')}${isMine ? ' (you)' : ''}</div>
        ${l.specs?.specPlatform ? `<div class="platform-tag">🎮 ${escHtml(shortPlatform(l.specs.specPlatform))}</div>` : ''}
        <div class="listing-price">${priceHTML(l)}</div>
        ${statusTag}
        <div class="listing-footer" style="margin-top:10px">
          ${actionBtn}
        </div>
      </div>`;
  }).join('');
}

function setMarketFilter(el, filter) {
  document.querySelectorAll('#marketFilterRow .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  marketFilter = filter;
  if (filter !== 'Games') platformFilter = 'all';
  const row = document.getElementById('platformFilterRow');
  if (row) {
    row.style.display = filter === 'Games' ? 'flex' : 'none';
    row.querySelectorAll('.filter-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
  }
  renderMarketplace();
}

function setPlatformFilter(el, value) {
  el.closest('.filter-row').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  platformFilter = value;
  renderMarketplace();
}

function filterMarketplace() {
  renderMarketplace();
}

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
async function loadLeaderboard() {
  const q = query(
    collection(db, 'users'),
    orderBy('portfolioValue', 'desc'),
    limit(10)
  );
  const snap = await getDocs(q);
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(users.map(async u => { try { u.repCount = await getRep(u.id); } catch { u.repCount = 0; } }));
  renderLeaderboard(users);
}

function renderLeaderboard(users) {
  const podium = document.getElementById('leaderboardPodium');
  const list = document.getElementById('leaderboardList');
  if (!podium || !list) return;

  if (users.length === 0) {
    podium.innerHTML = '';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">No data yet</div></div>`;
    return;
  }

  const top3 = users.slice(0, 3);
  const rest = users.slice(3);
  const medals = ['🥇','🥈','🥉'];
  const podiumOrder = top3.length >= 2 ? [top3[1], top3[0], top3[2]].filter(Boolean) : top3;
  const podiumClasses = top3.length >= 2 ? ['second','first','third'] : ['first'];

  podium.innerHTML = podiumOrder.map((u, i) => {
    const initials = (u.displayName || u.username || '?').substring(0,2).toUpperCase();
    const rank = top3.indexOf(u);
    return `
      <div class="podium-card ${podiumClasses[i]}">
        <div class="podium-rank">${medals[rank] || ''}</div>
        <div class="podium-avatar" style="background:linear-gradient(135deg,var(--gold),var(--gold-light))">
          ${u.avatarUrl ? `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initials}
        </div>
        <div class="podium-name">${escHtml(u.displayName || u.username)}</div>
        <div class="podium-handle">@${escHtml(u.username)}</div>
        <div class="podium-value">SCR ${Number(u.portfolioValue || 0).toLocaleString()}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Rep: ${u.repCount || 0}</div>
      </div>`;
  }).join('');

  list.innerHTML = rest.map((u, i) => {
    const initials = (u.displayName || u.username || '?').substring(0,2).toUpperCase();
    const isMe = u.id === currentUser?.uid;
    return `
      <div class="lb-row" style="${isMe ? 'border-color:rgba(212,160,23,0.4);background:rgba(212,160,23,0.06)' : ''}">
        <div class="lb-rank" style="${isMe ? 'color:var(--gold)' : ''}">${i + 4}</div>
        <div class="lb-avatar" style="background:linear-gradient(135deg,var(--gold),var(--gold-light))">
          ${u.avatarUrl ? `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover">` : initials}
        </div>
        <div class="lb-info">
          <div class="lb-name">${escHtml(u.displayName || u.username)}${isMe ? ' <span style="font-size:10px;color:var(--gold);font-weight:700">· You</span>' : ''}</div>
          <div class="lb-handle">@${escHtml(u.username)}</div>
        </div>
        <div style="text-align:right">
          <div class="lb-value">SCR ${Number(u.portfolioValue || 0).toLocaleString()}</div>
          <div class="lb-change">Rep: ${u.repCount || 0}</div>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// PORTFOLIO FILTERS
// ═══════════════════════════════════════════
function setPubFilter(el, intent) {
  document.querySelectorAll('#screen-portfolio .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const cards = document.querySelectorAll('#portfolioGrid .p-card');
  let visible = 0;
  cards.forEach(card => {
    const show = intent === 'all' || card.dataset.intent === intent;
    card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  setText('pubCount', visible + ' Items');
}

async function loadPortfolioListings() {
  if (!currentUser) return;
  const q = query(
    collection(db, 'listings'),
    where('sellerId', '==', currentUser.uid),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  const listings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPortfolioGrid(listings);
  setText('portStatItems', listings.length);
  const total = listings.reduce((s, l) => s + (l.priceSCR || 0), 0);
  setText('portStatValue', 'SCR ' + total.toLocaleString());
}

// ═══════════════════════════════════════════
// LISTING MODAL
// ═══════════════════════════════════════════
const specFields = {
  Watches: [
    { id: 'specMovement', label: 'Movement Type', placeholder: 'e.g. Automatic, Quartz' },
    { id: 'specCaseSize', label: 'Case Size (mm)', placeholder: 'e.g. 40mm' },
    { id: 'specDial', label: 'Dial Color', placeholder: 'e.g. Black, Blue' }
  ],
  Sneakers: [
    { id: 'specSize', label: 'Size', placeholder: 'e.g. US 10' },
    { id: 'specCondition', label: 'Condition', placeholder: 'e.g. DS, VNDS, Worn' }
  ],
  Tech: [
    { id: 'specModel', label: 'Model / Spec', placeholder: 'e.g. M3 Max, 64GB' },
    { id: 'specCondition', label: 'Condition', placeholder: 'e.g. New, Like New' }
  ],
  Cars: [
    { id: 'specYear', label: 'Year', placeholder: 'e.g. 2021' },
    { id: 'specMileage', label: 'Mileage', placeholder: 'e.g. 15,000 km' }
  ],
  Games: [
    { id: 'specPlatform', label: 'Console', type: 'select', options: PLATFORMS },
    { id: 'specCondition', label: 'Condition', placeholder: 'e.g. Sealed, Like New, Used' }
  ],
  'Parts Bin': [
    { id: 'specPartType', label: 'Part Type', placeholder: 'e.g. Watch strap, Mod chip' },
    { id: 'specCompatibility', label: 'Compatibility', placeholder: 'e.g. Rolex 20mm' }
  ]
};

function updateSpecFields() {
  const cat = document.getElementById('listingCategory').value;
  const wrap = document.getElementById('specFieldsWrap');
  const fields = specFields[cat];
  if (!fields || !wrap) { if (wrap) wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div style="grid-column:span 2;font-size:11px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">
      ${cat} Specs
    </div>
    ${fields.map(f => `
      <div class="modal-group">
        <div class="modal-label">${f.label}</div>
        ${f.type === 'select'
          ? `<select class="modal-input" id="${f.id}" style="color-scheme:dark"><option value="">Select ${f.label.toLowerCase()}</option>${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`
          : `<input class="modal-input" id="${f.id}" type="text" placeholder="${f.placeholder}" />`}
      </div>
    `).join('')}`;
}

let editingListingId = null;

function resetDiscountFields() {
  const p = document.getElementById('listingDiscountPrice');
  const d = document.getElementById('listingDiscountDuration');
  const keep = document.getElementById('keepTimerOption');
  if (p) p.value = '';
  if (d) d.value = '';
  if (keep) keep.hidden = true;
}

function openListingModal() {
  if (!currentUser) return requireAuth('Sign up to list an item');
  if (!currentUserData?.whatsapp && !currentUserData?.instagram) {
    showToast('Add your WhatsApp or Instagram to your profile first so buyers can reach you.', 'info');
    openListingAfterProfile = true;
    openEditProfile();
    return;
  }
  editingListingId = null;
  resetDiscountFields();
  document.querySelector('#listingModal .modal-title').textContent = 'List an Item';
  document.querySelector('#listingModal .modal-btn').textContent = 'List Item ✦';
  document.getElementById('listingModal').classList.add('open');
}


async function openEditListing(listingId) {
  const snap = await getDoc(doc(db, 'listings', listingId));
  if (!snap.exists()) return showToast('Listing not found', 'error');
  const l = snap.data();

  editingListingId = listingId;
  document.querySelector('#listingModal .modal-title').textContent = 'Edit Listing';
  document.querySelector('#listingModal .modal-btn').textContent = 'Save Changes ✦';

  document.getElementById('listingName').value = l.name || '';
  document.getElementById('listingPrice').value = l.priceSCR || '';
  document.getElementById('listingDesc').value = l.description || '';
  document.getElementById('listingImageUrl').value = l.imageUrl || '';
  document.getElementById('listingPinned').checked = !!l.pinned;

  // Discount (only prefilled while the sale is still running)
  resetDiscountFields();
  if (discountActive(l)) {
    document.getElementById('listingDiscountPrice').value = l.discountPriceSCR;
    if (l.discountEndsAt) {
      const keep = document.getElementById('keepTimerOption');
      keep.hidden = false;
      document.getElementById('listingDiscountDuration').value = 'keep';
    }
  }

  // Set category via custom dropdown
  if (l.category) {
    const catEmoji = { Watches:'⌚', Sneakers:'👟', Tech:'💻', Jewelry:'💍', Cars:'🚗', Bags:'👜', Games:'🎮', 'Parts Bin':'🔧', Other:'📦' };
    selectCS('csCategory', 'listingCategory', l.category, (catEmoji[l.category]||'📦') + ' ' + l.category);
    updateSpecFields();
    // Fill spec fields after they render
    setTimeout(() => {
      if (l.specs) {
        Object.keys(l.specs).forEach(key => {
          const el = document.getElementById(key);
          if (el) el.value = l.specs[key];
        });
      }
    }, 50);
  }

  // Set intent via custom dropdown
  const intentLabels = { trade: '🔄 Looking to Trade', cash: '💰 Accepting Cash Offers', grail: '👑 Personal Grail (View Only)' };
  selectCS('csIntent', 'listingIntent', l.intent || 'trade', intentLabels[l.intent || 'trade']);

  // Set frame via custom dropdown
  document.getElementById('listingFrame').value = l.frame || 'default';

  // Image preview
  const preview = document.getElementById('uploadPreview');
  if (preview) {
    preview.innerHTML = l.imageUrl
      ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`
      : `<i class="ti ti-photo-up" style="font-size:32px;color:var(--text-muted);margin-bottom:8px"></i><div style="font-size:13px;color:var(--text-muted)">Click to upload photo</div>`;
  }

  document.getElementById('listingModal').classList.add('open');
}

function closeListingModal() {
  document.getElementById('listingModal').classList.remove('open');
  editingListingId = null;
  // Reset form
  ['listingName','listingPrice','listingDesc','listingImageUrl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('listingCategory').value = '';
  document.getElementById('listingIntent').value = 'trade';
  document.getElementById('listingFrame').value = 'default';
  document.getElementById('listingPinned').checked = false;
  document.getElementById('specFieldsWrap').innerHTML = '';
  const preview = document.getElementById('uploadPreview');
  if (preview) preview.innerHTML = `<i class="ti ti-photo-up" style="font-size:32px;color:var(--text-muted);margin-bottom:8px"></i><div style="font-size:13px;color:var(--text-muted)">Click to upload photo</div>`;
}

function triggerUpload() {
  openUploadWidget((url) => {
    document.getElementById('listingImageUrl').value = url;
    const preview = document.getElementById('uploadPreview');
    if (preview) preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  });
}

async function submitListing() {
  if (!currentUser || !currentUserData) return;

  const name = document.getElementById('listingName').value.trim();
  const price = parseFloat(document.getElementById('listingPrice').value);
  const category = document.getElementById('listingCategory').value;
  const intent = document.getElementById('listingIntent').value;
  const frame = document.getElementById('listingFrame').value;
  const desc = document.getElementById('listingDesc').value.trim();
  const imageUrl = document.getElementById('listingImageUrl').value;
  const pinned = document.getElementById('listingPinned').checked;

  if (!name) return showToast('Please enter an item name', 'error');
  if (!price || isNaN(price)) return showToast('Please enter a valid price', 'error');
  if (!category) return showToast('Please select a category', 'error');

  // Discount (optional)
  const discountRaw = document.getElementById('listingDiscountPrice').value;
  const duration = document.getElementById('listingDiscountDuration').value;
  const discountPrice = discountRaw === '' ? null : parseFloat(discountRaw);
  if (discountPrice !== null) {
    if (isNaN(discountPrice) || discountPrice <= 0) return showToast('Enter a valid sale price', 'error');
    if (discountPrice >= price) return showToast('Sale price must be lower than the original price', 'error');
  }

  // Collect spec fields
  const specs = {};
  const catFields = specFields[category] || [];
  catFields.forEach(f => {
    const el = document.getElementById(f.id);
    if (el && el.value) specs[f.id] = el.value.trim();
  });
  if (category === 'Games' && !specs.specPlatform) {
    return showToast('Choose which console this game is for', 'error');
  }

  const listingData = {
    name,
    priceSCR: price,
    category,
    intent,
    frame,
    description: desc,
    imageUrl: imageUrl || '',
    specs,
    pinned
  };

  // Work out the sale fields
  const DAY = 24 * 60 * 60 * 1000;
  const durations = { '24h': DAY, '3d': 3 * DAY, '7d': 7 * DAY };
  const saleFields = {};
  const saleFieldsEdit = {};
  if (discountPrice !== null) {
    saleFields.discountPriceSCR = discountPrice;
    saleFieldsEdit.discountPriceSCR = discountPrice;
    if (durations[duration]) {
      const endsAt = Timestamp.fromMillis(Date.now() + durations[duration]);
      saleFields.discountEndsAt = endsAt;
      saleFieldsEdit.discountEndsAt = endsAt;
    } else if (duration !== 'keep') {
      saleFieldsEdit.discountEndsAt = deleteField();   // no timer
    }
  } else {
    saleFieldsEdit.discountPriceSCR = deleteField();
    saleFieldsEdit.discountEndsAt = deleteField();
  }

  try {
    if (editingListingId) {
      // EDIT MODE — update existing listing
      // also strips any contact info older listings still carry
      await updateDoc(doc(db, 'listings', editingListingId), {
        ...listingData,
        ...saleFieldsEdit,
        whatsapp: deleteField(),
        instagram: deleteField()
      });
      closeListingModal();
      showToast('Listing updated!', 'success');
    } else {
      // CREATE MODE — new listing
      await addDoc(collection(db, 'listings'), {
        ...listingData,
        ...saleFields,
        sellerId: currentUser.uid,
        sellerUsername: currentUserData.username,
        sellerDisplayName: currentUserData.displayName || currentUserData.username,
        status: 'active',
        createdAt: serverTimestamp()
      });
      closeListingModal();
      showToast('Item listed successfully!', 'success');
    }
  } catch (err) {
    showToast('Error saving listing: ' + err.message, 'error');
  }
}

async function deleteListing(listingId) {
  openConfirmDelete(listingId);
}

// ═══════════════════════════════════════════
// QUICK-STRIKE SHEET
// ═══════════════════════════════════════════
async function openSheet(listingId) {
  const snap = await getDoc(doc(db, 'listings', listingId));
  if (!snap.exists()) return showToast('Listing not found', 'error');
  currentSheetListing = { id: listingId, ...snap.data() };
  const l = currentSheetListing;

  const imgEl = document.getElementById('sheetImg');
  if (imgEl) {
    imgEl.innerHTML = l.imageUrl
      ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`
      : getCategoryEmoji(l.category);
  }
  setText('sheetName', l.name);
  setText('sheetSeller', 'Listed by @' + (l.sellerUsername || 'unknown') + (l.specs?.specPlatform ? ' · ' + l.specs.specPlatform : ''));
  const valEl = document.getElementById('sheetVal');
  if (valEl) valEl.innerHTML = priceHTML(l);

  const isGrail = l.intent === 'grail';
  const pitch = document.getElementById('autoPitch');
  const actionBtns = document.getElementById('actionBtns');
  const actionLabel = document.getElementById('actionLabel');
  const grailNotice = document.getElementById('grailNotice');
  const pitchText = document.getElementById('pitchText');
  const guestBtn = document.getElementById('guestInquireBtn');
  const igBtn = document.getElementById('sheetIgBtn');
  if (guestBtn) guestBtn.style.display = 'none';

  if (isGrail) {
    if (pitch) pitch.style.display = 'none';
    if (actionBtns) actionBtns.style.display = 'none';
    if (actionLabel) actionLabel.style.display = 'none';
    if (grailNotice) grailNotice.style.display = 'block';
    if (igBtn) igBtn.style.display = 'none';
  } else if (!currentUser) {
    // Guests can look, but contacting a seller needs an account
    if (pitch) pitch.style.display = 'none';
    if (actionBtns) actionBtns.style.display = 'none';
    if (actionLabel) actionLabel.style.display = 'none';
    if (grailNotice) grailNotice.style.display = 'none';
    if (igBtn) igBtn.style.display = 'none';
    if (guestBtn) guestBtn.style.display = 'flex';
  } else {
    if (pitch) pitch.style.display = '';
    if (actionBtns) actionBtns.style.display = '';
    if (actionLabel) actionLabel.style.display = '';
    if (grailNotice) grailNotice.style.display = 'none';
    const msg = l.intent === 'trade'
      ? `"Yo! I saw your <b>${escHtml(l.name)}</b> on Stash — I've got heat to swap. Let's talk."`
      : `"Yo! I saw your <b>${escHtml(l.name)}</b> on Stash. What's your best price?"`;
    if (pitchText) pitchText.innerHTML = msg;

    const plainMsg = l.intent === 'trade'
      ? `Yo! I saw your ${l.name} on Stash — I've got heat to swap. Let's talk.`
      : `Yo! I saw your ${l.name} on Stash. What's your best price?`;

    // Contact info lives on the seller's profile (members only)
    let contact = {};
    try {
      const sellerSnap = await getDoc(doc(db, 'users', l.sellerId));
      if (sellerSnap.exists()) contact = sellerSnap.data();
    } catch (e) {
      console.error('Seller contact load failed', e);
    }
    const whatsapp = contact.whatsapp || l.whatsapp || '';
    const instagram = contact.instagram || l.instagram || '';

    const waBtn = document.getElementById('sheetWaBtn');
    if (waBtn) {
      const cleanNumber = whatsapp.replace(/[^0-9]/g, '');
      if (cleanNumber) {
        waBtn.href = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(plainMsg)}`;
        waBtn.style.opacity = '1';
        waBtn.style.pointerEvents = 'auto';
      } else {
        waBtn.removeAttribute('href');
        waBtn.style.opacity = '0.4';
        waBtn.style.pointerEvents = 'none';
      }
    }

    if (igBtn) {
      const handle = instagram.replace('@', '').trim();
      if (handle) {
        igBtn.href = `https://instagram.com/${encodeURIComponent(handle)}`;
        igBtn.style.display = 'flex';
      } else {
        igBtn.style.display = 'none';
      }
    }
  }
  document.getElementById('sheetOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function guestInquire() {
  if (currentSheetListing) pendingSheetListing = currentSheetListing.id;
  closeSheet();
  requireAuth('Sign up free to contact sellers');
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentSheetListing = null;
}


// ═══════════════════════════════════════════
// TRADES SCREEN
// ═══════════════════════════════════════════
async function loadTrades() {
  if (!currentUser) return;
  const list = document.getElementById('handshakeList');
  if (!list) return;

  try {
    const col = collection(db, 'completions');
    const [boughtSnap, soldSnap] = await Promise.all([
      getDocs(query(col, where('buyerId', '==', currentUser.uid))),
      getDocs(query(col, where('sellerId', '==', currentUser.uid)))
    ]);

    const items = [
      ...boughtSnap.docs.map(d => ({ role: 'buyer', otherId: d.data().sellerId, at: d.data().createdAt })),
      ...soldSnap.docs.map(d => ({ role: 'seller', otherId: d.data().buyerId, at: d.data().createdAt }))
    ]
      .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0))
      .slice(0, 20);

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">&#129309;</div><div class="empty-title">No Handshakes Yet</div><div class="empty-sub">After a sale or trade in person, verify it with a QR handshake to earn Trader Rep.</div></div>`;
      return;
    }

    const names = {};
    await Promise.all([...new Set(items.map(i => i.otherId))].map(async uid => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        names[uid] = snap.exists() ? snap.data().username : 'unknown';
      } catch {
        names[uid] = 'unknown';
      }
    }));

    list.innerHTML = items.map(i => {
      const when = i.at?.toDate ? i.at.toDate().toLocaleDateString() : '';
      const who = escHtml(names[i.otherId] || 'unknown');
      const label = i.role === 'seller' ? `Sold / traded to @${who}` : `Bought / traded from @${who}`;
      return `
        <div class="glass-card" style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:700">${label}</div>
            <div style="font-size:12px;color:var(--text-muted)">${when}</div>
          </div>
          <div style="font-size:13px;font-weight:800;color:var(--gold)">+1 Rep</div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px">Couldn't load handshakes. Try again in a moment.</div>`;
  }
}

// ═══════════════════════════════════════════
// QR HANDSHAKE MODAL
// ═══════════════════════════════════════════
let qrInstance = null;
let qrTimerInterval = null;
let qrUnsub = null;

function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
let qrScannerInstance = null;

async function openQRModal(role) {
  document.getElementById('qrModal').classList.add('open');
  const sellerView = document.getElementById('qrSellerView');
  const buyerView = document.getElementById('qrBuyerView');
  setText('qrModalTitle', role === 'seller' ? 'Show QR to Buyer' : 'Scan Buyer QR');

  if (role === 'seller') {
    sellerView.style.display = 'block';
    buyerView.style.display = 'none';
    try {
      const token = makeToken();
      const hsRef = doc(collection(db, 'handshakes'));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await setDoc(hsRef, {
        sellerId: currentUser.uid,
        token,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt)
      });
      const payload = JSON.stringify({ h: hsRef.id, s: currentUser.uid, t: token });

      // Close automatically once the buyer completes the handshake
      if (qrUnsub) qrUnsub();
      qrUnsub = onSnapshot(doc(db, 'completions', hsRef.id), snap => {
        if (snap.exists()) {
          closeQRModal();
          showToast('🎉 Handshake complete! +1 Trader Rep', 'success');
          refreshMyRep(true);
          loadTrades();
        }
      });
      // Generate QR code
      const qrDisplay = document.getElementById('qrCodeDisplay');
      qrDisplay.innerHTML = '';
      qrInstance = new QRCode(qrDisplay, {
        text: payload,
        width: 180,
        height: 180,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      // Countdown timer
      const expiry = new Date(expiresAt);
      qrTimerInterval = setInterval(() => {
        const left = Math.max(0, expiry - Date.now());
        const m = Math.floor(left / 60000);
        const s = Math.floor((left % 60000) / 1000);
        setText('qrTimer', `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
        if (left === 0) clearInterval(qrTimerInterval);
      }, 1000);
    } catch (err) {
      showToast('Error generating QR: ' + err.message, 'error');
      closeQRModal();
    }
  } else {
    sellerView.style.display = 'none';
    buyerView.style.display = 'block';
    // Start QR scanner
    setTimeout(() => {
      qrScannerInstance = new Html5Qrcode('qrReader');
      qrScannerInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 200 },
        async (decodedText) => {
          await qrScannerInstance.stop();
          await handleQRScan(decodedText);
        },
        () => {}
      ).catch(err => showToast('Camera error: ' + err, 'error'));
    }, 300);
  }
}

async function handleQRScan(payload) {
  showToast('QR detected. Verifying...', 'info');
  try {
    let parsed;
    try { parsed = JSON.parse(payload); } catch { throw new Error("That QR code isn't valid."); }
    const { h, s: sellerId, t: token } = parsed || {};
    if (typeof h !== 'string' || typeof sellerId !== 'string' || typeof token !== 'string') {
      throw new Error("That QR code isn't valid.");
    }
    if (sellerId === currentUser.uid) throw new Error("You can't scan your own QR code.");

    const buyerId = currentUser.uid;
    const d = new Date();
    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

    const batch = writeBatch(db);
    batch.set(doc(db, 'completions', h), {
      buyerId,
      sellerId,
      token,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'pairDays', `${sellerId}_${buyerId}_${dayKey}`), {
      hid: h,
      buyerId,
      sellerId
    });

    try {
      await batch.commit();
    } catch (err) {
      if (err.code === 'permission-denied') {
        throw new Error('Could not verify. The QR may have expired or been used, or you already shook hands with this person today.');
      }
      throw err;
    }

    closeQRModal();
    showToast('🎉 Handshake verified! +1 Trader Rep', 'success');
    refreshMyRep(true);
    loadTrades();
  } catch (err) {
    showToast(err.message, 'error');
    closeQRModal();
  }
}

function closeQRModal() {
  document.getElementById('qrModal').classList.remove('open');
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  if (qrUnsub) { qrUnsub(); qrUnsub = null; }
  if (qrScannerInstance) qrScannerInstance.stop().catch(() => {});
  qrInstance = null;
  qrScannerInstance = null;
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════
function setChipFilter(el) {
  el.closest('.filter-row').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function animateCount(el, target) {
  let cur = 0;
  const steps = 60;
  const inc = target / steps;
  const interval = setInterval(() => {
    cur = Math.min(cur + inc, target);
    el.textContent = Math.round(cur).toLocaleString();
    if (cur >= target) clearInterval(interval);
  }, 1800 / steps);
}

// ═══════════════════════════════════════════
// DISCOUNTS (price = original list price, discountPriceSCR = sale price)
// Expiry needs no server: a sale only counts while discountEndsAt is in the future.
// ═══════════════════════════════════════════
function discountActive(l) {
  const d = l.discountPriceSCR;
  if (typeof d !== 'number' || d <= 0 || d >= Number(l.priceSCR || 0)) return false;
  const ends = l.discountEndsAt?.toMillis?.();
  return !ends || ends > Date.now();
}

function formatCountdown(ms) {
  if (ms <= 0) return 'Sale ended';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `Discount ends in ${d}d ${h}h`;
  if (h > 0) return `Discount ends in ${h}h ${m}m`;
  return `Discount ends in ${Math.max(m, 1)}m`;
}

function priceHTML(l) {
  const base = Number(l.priceSCR || 0);
  if (!discountActive(l)) return `SCR ${base.toLocaleString()}`;
  const ends = l.discountEndsAt?.toMillis?.();
  return `<span class="price-old">SCR ${base.toLocaleString()}</span>`
    + `<span class="price-new">SCR ${Number(l.discountPriceSCR).toLocaleString()}</span>`
    + `<span class="sale-badge">📉 Price Drop</span>`
    + (ends ? `<span class="sale-timer" data-discount-ends="${ends}">${formatCountdown(ends - Date.now())}</span>` : '');
}

setInterval(() => {
  let expired = false;
  document.querySelectorAll('[data-discount-ends]').forEach(el => {
    const left = Number(el.dataset.discountEnds) - Date.now();
    if (left <= 0) expired = true;
    el.textContent = formatCountdown(left);
  });
  if (expired) {
    renderMarketplace();
    if (lastDashListings.length) renderDashboard(lastDashListings);
  }
}, 15000);

// ═══════════════════════════════════════════
// GAME CONSOLES
// ═══════════════════════════════════════════
function detectPlatform(text) {
  const t = (text || '').toLowerCase();
  if (/\bps ?5\b|playstation ?5/.test(t)) return 'PlayStation 5';
  if (/\bps ?4\b|playstation ?4/.test(t)) return 'PlayStation 4';
  if (/series ?[xs]\b|xbox series/.test(t)) return 'Xbox Series X|S';
  if (/xbox ?one|\bxone\b/.test(t)) return 'Xbox One';
  return null;
}

function matchesPlatform(platform, filter) {
  if (filter === 'all') return true;
  const map = {
    ps: ['PlayStation 4', 'PlayStation 5'],
    ps4: ['PlayStation 4'],
    ps5: ['PlayStation 5'],
    xbox: ['Xbox One', 'Xbox Series X|S'],
    xone: ['Xbox One'],
    xsx: ['Xbox Series X|S']
  };
  return (map[filter] || []).includes(platform);
}

function shortPlatform(p) {
  return { 'PlayStation 4': 'PS4', 'PlayStation 5': 'PS5', 'Xbox One': 'Xbox One', 'Xbox Series X|S': 'Series X|S' }[p] || p;
}

function getCategoryEmoji(cat) {
  const map = { Watches:'⌚', Sneakers:'👟', Tech:'💻', Jewelry:'💍', Cars:'🚗', Bags:'👜', Games:'🎮', 'Parts Bin':'🔧', Other:'📦' };
  return map[cat] || '📦';
}

function getFrameClass(frame) {
  const map = { gold:'gold-frame', holo:'holo-frame', purple:'grail-frame', carbon:'', neon:'' };
  return map[frame] || '';
}

function getFrameBadge(frame) {
  const badges = {
    gold: `<div class="frame-badge badge-gold">✦ Liquid Gold Frame</div>`,
    holo: `<div class="frame-badge badge-holo">◈ Holo Foil Frame</div>`,
    purple: `<div class="frame-badge badge-grail">👑 Royal Purple Frame</div>`
  };
  return badges[frame] || '';
}

function getIntentLabel(intent) {
  const map = { trade:'Looking to Trade', cash:'Accepting Offers', grail:'Personal Grail' };
  return map[intent] || intent;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function copyProfileLink() {
  if (!currentUserData) return;
  const link = `${window.location.origin}?user=${currentUserData.username}`;
  navigator.clipboard.writeText(link).then(() => showToast('Profile link copied!', 'success'));
}

function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  playNotificationSound(type);
  const icons = { success:'ti-circle-check', error:'ti-circle-x', info:'ti-info-circle' };
  const colors = { success:'var(--green)', error:'var(--red)', info:'var(--gold)' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="ti ${icons[type]}" style="font-size:18px;color:${colors[type]};flex-shrink:0"></i>${escHtml(msg)}`;
  wrap.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}



// ═══════════════════════════════════════════
// MOBILE BURGER DRAWER
// ═══════════════════════════════════════════
function toggleMobileDrawer() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileOverlay');
  const burger = document.getElementById('burgerBtn');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    closeMobileDrawer();
  } else {
    drawer.classList.add('open');
    overlay.classList.add('open');
    if (burger) burger.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileDrawer() {
  const drawer = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('mobileOverlay');
  const burger = document.getElementById('burgerBtn');
  if (!drawer) return;
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  if (burger) burger.classList.remove('open');
  document.body.style.overflow = '';
}

function drawerNav(screenId) {
  closeMobileDrawer();
  switchScreen(screenId);
  // Update drawer active state
  document.querySelectorAll('.drawer-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === screenId);
  });
}

function updateDrawerUI() {
  if (!currentUserData) return;
  const initials = (currentUserData.displayName || currentUserData.username || 'U').substring(0,2).toUpperCase();

  const drawerAvatar = document.getElementById('drawerAvatar');
  if (drawerAvatar) {
    drawerAvatar.textContent = initials;
    if (currentUserData.avatarUrl) {
      drawerAvatar.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }
  }
  const drawerName = document.getElementById('drawerName');
  const drawerHandle = document.getElementById('drawerHandle');
  if (drawerName) drawerName.textContent = currentUserData.displayName || currentUserData.username;
  if (drawerHandle) drawerHandle.textContent = '@' + currentUserData.username;

  // Show admin nav in drawer if admin
  if (currentUserData.isAdmin) {
    document.querySelectorAll('.drawer-nav-item.admin-only').forEach(el => el.style.display = 'flex');
  }
}


// ═══════════════════════════════════════════
// EDIT PROFILE
// ═══════════════════════════════════════════
function openEditProfile() {
  if (!currentUserData) return;
  document.getElementById('editDisplayName').value = currentUserData.displayName || '';
  document.getElementById('editBio').value = currentUserData.bio || '';
  document.getElementById('editAvatarUrl').value = currentUserData.avatarUrl || '';
  document.getElementById('editWhatsApp').value = currentUserData.whatsapp || '';
  document.getElementById('editInstagram').value = currentUserData.instagram || '';

  const preview = document.getElementById('profilePhotoPreview');
  if (currentUserData.avatarUrl) {
    preview.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  } else {
    preview.innerHTML = `<i class="ti ti-camera" style="font-size:24px;color:rgba(255,255,255,0.4)"></i><span style="font-size:13px;color:rgba(255,255,255,0.4)">Upload profile photo</span>`;
  }
  document.getElementById('editProfileModal').classList.add('open');
}

function closeEditProfile() {
  openListingAfterProfile = false;
  openHuntAfterProfile = false;
  document.getElementById('editProfileModal').classList.remove('open');
}

function triggerProfilePhotoUpload() {
  openUploadWidget((url) => {
    document.getElementById('editAvatarUrl').value = url;
    const preview = document.getElementById('profilePhotoPreview');
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  });
}

async function saveProfile() {
  if (!currentUser) return;
  const displayName = document.getElementById('editDisplayName').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const avatarUrl = document.getElementById('editAvatarUrl').value;
  const whatsapp = normalizeWhatsApp(document.getElementById('editWhatsApp').value);
  const instagram = normalizeInstagram(document.getElementById('editInstagram').value);

  if (!displayName) return showToast('Display name cannot be empty', 'error');
  if (whatsapp === null) return showToast('WhatsApp should look like +2482510123', 'error');
  if (instagram === null) return showToast('That Instagram handle looks invalid', 'error');

  const reopenListing = openListingAfterProfile;
  const reopenHunt = openHuntAfterProfile;
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      displayName,
      bio,
      avatarUrl,
      whatsapp,
      instagram
    });
    closeEditProfile();
    showToast('Profile updated!', 'success');
    if (reopenListing && (whatsapp || instagram)) {
      openListingAfterProfile = false;
      currentUserData = { ...currentUserData, whatsapp, instagram };
      openListingModal();
    }
    if (reopenHunt && (whatsapp || instagram)) {
      openHuntAfterProfile = false;
      currentUserData = { ...currentUserData, whatsapp, instagram };
      openHuntForm();
    }
  } catch (err) {
    showToast('Error saving profile: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════
// CONFIRM DELETE LISTING
// ═══════════════════════════════════════════
let pendingDeleteId = null;

function openConfirmDelete(listingId) {
  pendingDeleteId = listingId;
  document.getElementById('confirmDeleteModal').classList.add('open');
}

function closeConfirmDelete() {
  pendingDeleteId = null;
  document.getElementById('confirmDeleteModal').classList.remove('open');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    await deleteDoc(doc(db, 'listings', pendingDeleteId));
    closeConfirmDelete();
    showToast('Listing removed', 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════
// CUSTOM SELECT DROPDOWNS
// ═══════════════════════════════════════════
function toggleCS(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const isOpen = wrap.classList.contains('open');
  // Close all open dropdowns first
  document.querySelectorAll('.custom-select-wrap.open').forEach(w => w.classList.remove('open'));
  if (!isOpen) wrap.classList.add('open');
}

function selectCS(wrapId, inputId, value, label, callback) {
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  if (!wrap || !input) return;

  input.value = value;

  // Update displayed label
  const labelEl = wrap.querySelector('.cs-selected span:first-child') ||
                  wrap.querySelector('.cs-selected span');
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.classList.remove('cs-placeholder');
  }

  // Mark selected option
  wrap.querySelectorAll('.cs-option').forEach(opt => {
    opt.classList.toggle('selected', opt.getAttribute('onclick')?.includes(`'${value}'`));
  });

  wrap.classList.remove('open');

  // Fire callback if provided
  if (callback && window[callback]) window[callback]();
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-select-wrap')) {
    document.querySelectorAll('.custom-select-wrap.open').forEach(w => w.classList.remove('open'));
  }
});

// ── Close modals on overlay click
document.getElementById('sheetOverlay')?.addEventListener('click', e => { if (e.target === document.getElementById('sheetOverlay')) closeSheet(); });
document.getElementById('listingModal')?.addEventListener('click', e => { if (e.target === document.getElementById('listingModal')) closeListingModal(); });
document.getElementById('editProfileModal')?.addEventListener('click', e => { if (e.target === document.getElementById('editProfileModal')) closeEditProfile(); });
document.getElementById('confirmDeleteModal')?.addEventListener('click', e => { if (e.target === document.getElementById('confirmDeleteModal')) closeConfirmDelete(); });
document.getElementById('qrModal')?.addEventListener('click', e => { if (e.target === document.getElementById('qrModal')) closeQRModal(); });

// ── Expose functions to HTML onclick
window.handleLogin = handleLogin;
window.handleGoogleSignIn = handleGoogleSignIn;
window.openAuth = openAuth;
window.closeAuth = closeAuth;
window.completeProfileSetup = completeProfileSetup;
window.cancelProfileSetup = cancelProfileSetup;
window.guestInquire = guestInquire;
window.setPlatformFilter = setPlatformFilter;
window.openHuntForm = openHuntForm;
window.closeHuntForm = closeHuntForm;
window.submitHunt = submitHunt;
window.deleteHunt = deleteHunt;
window.openHuntView = openHuntView;
window.closeHuntView = closeHuntView;
window.setHuntFilter = setHuntFilter;
window.filterHunts = filterHunts;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.switchScreen = switchScreen;
window.setChipFilter = setChipFilter;
window.setMarketFilter = setMarketFilter;
window.filterMarketplace = filterMarketplace;
window.setPubFilter = setPubFilter;
window.openListingModal = openListingModal;
window.openEditListing = openEditListing;
window.closeListingModal = closeListingModal;
window.triggerUpload = triggerUpload;
window.submitListing = submitListing;
window.deleteListing = deleteListing;
window.updateSpecFields = updateSpecFields;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.openQRModal = openQRModal;
window.closeQRModal = closeQRModal;
window.copyProfileLink = copyProfileLink;
window.showToast = showToast;
window.openEditProfile = openEditProfile;
window.closeEditProfile = closeEditProfile;
window.triggerProfilePhotoUpload = triggerProfilePhotoUpload;
window.saveProfile = saveProfile;
window.openConfirmDelete = openConfirmDelete;
window.closeConfirmDelete = closeConfirmDelete;
window.confirmDelete = confirmDelete;
window.toggleCS = toggleCS;
window.toggleMobileDrawer = toggleMobileDrawer;
window.closeMobileDrawer = closeMobileDrawer;
window.drawerNav = drawerNav;
window.selectCS = selectCS;