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
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const functions = getFunctions();

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let currentUser = null;
let currentUserData = null;
let currentScreen = 'dashboard';
let marketFilter = 'all';
let marketListings = [];
let currentSheetListing = null;
let unsubscribeListeners = [];

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData(user.uid);
    showApp();
    initApp();
  } else {
    currentUser = null;
    currentUserData = null;
    showAuth();
  }
});

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

  if (!username || !email || !password) return showToast('Please fill in all fields', 'error');
  if (username.length < 3) return showToast('Username must be at least 3 characters', 'error');

  try {
    // Check username taken
    const usernameSnap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!usernameSnap.empty) return showToast('Username already taken', 'error');

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      username,
      email,
      displayName: username,
      bio: '',
      avatarUrl: '',
      goldBlocks: 0,
      traderRep: 0,
      portfolioValue: 0,
      accountLocked: false,
      pendingDebt: 0,
      isAdmin: false,
      createdAt: serverTimestamp()
    });
    showToast('Welcome to Stash!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
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
  unsubscribeListeners.forEach(u => u());
  unsubscribeListeners = [];
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
}

function showRegister() {
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'block';
}

// ═══════════════════════════════════════════
// APP INIT
// ═══════════════════════════════════════════
function initApp() {
  setupSidebarNav();
  setupMobileNav();
  updateUserUI();
  loadDashboard();
  loadMarketplace();
  loadLeaderboard();
  startCountdown();
}

function updateUserUI() {
  if (!currentUserData) return;
  const initials = (currentUserData.displayName || currentUserData.username || 'U').substring(0,2).toUpperCase();
  const gbDisplay = `${Number(currentUserData.goldBlocks || 0).toLocaleString()} GB`;

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

  // GB Balances
  ['sidebarGBBalance','topbarGBBalance','mobileGBBalance','dashGBBalance'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = gbDisplay;
  });

  // Dashboard stats
  const repEl = document.getElementById('dashTraderRep');
  if (repEl) repEl.textContent = currentUserData.traderRep || 0;

  // Account locked banner
  const banner = document.getElementById('lockedBanner');
  if (banner) banner.style.display = currentUserData.accountLocked ? 'flex' : 'none';

  // Admin nav
  if (currentUserData.isAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
  }

  // Portfolio screen
  updatePortfolioUI();
  // Mobile drawer
  updateDrawerUI();
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
  setText('portTraderRep', currentUserData.traderRep || 0);
  setText('portStatRep', currentUserData.traderRep || 0);
  setText('portStatGB', (currentUserData.goldBlocks || 0) + ' GB');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ═══════════════════════════════════════════
// SCREEN SWITCHING
// ═══════════════════════════════════════════
const topbarTitles = {
  dashboard: 'My Stash',
  marketplace: 'Marketplace',
  shop: '✦ Exotic Shop',
  leaderboard: '🏆 Leaderboard',
  portfolio: 'Public Profile',
  trades: 'My Trades',
  admin: '🛡 Admin Panel'
};

function switchScreen(id) {
  if (id === currentScreen) return;
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
    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'trades') loadTrades();
    if (id === 'portfolio') loadPortfolioListings();
    if (id === 'admin' && currentUserData?.isAdmin) loadAdminData();
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
      <div class="quick-edit-btn" onclick="deleteListing('${l.id}')"><i class="ti ti-trash"></i></div>
      ${getFrameBadge(l.frame)}
      <div class="item-img tall">${imgContent}</div>
      <div class="item-name">${escHtml(l.name)}</div>
      <div class="item-sub">${escHtml(l.description || '')}</div>
      <div class="item-value">SCR ${Number(l.priceSCR || 0).toLocaleString()}</div>
    </div>`;
}

function renderClosetCard(l) {
  const imgContent = l.imageUrl
    ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">`
    : getCategoryEmoji(l.category);
  const intentTag = l.intent ? `<div class="intent-tag tag-${l.intent}" style="margin-top:6px">${getIntentLabel(l.intent)}</div>` : '';
  return `
    <div class="closet-card">
      <div class="closet-img">${imgContent}</div>
      <div class="closet-name">${escHtml(l.name)}</div>
      <div class="closet-sub">${escHtml(l.category || '')}</div>
      <div class="closet-value">SCR ${Number(l.priceSCR || 0).toLocaleString()}</div>
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
    const btn = l.intent === 'grail'
      ? `<button class="inquire-btn view-only">View</button>`
      : `<button class="inquire-btn" onclick="openSheet('${l.id}')">Inquire</button>`;
    return `
      <div class="p-card ${frameClass}" data-intent="${l.intent || 'trade'}">
        ${getFrameBadge(l.frame)}
        <div class="p-img">${imgContent}</div>
        <div class="item-name">${escHtml(l.name)}</div>
        <div class="item-sub">${escHtml(l.category || '')}</div>
        <div class="p-footer">
          <div><div class="p-value">SCR ${Number(l.priceSCR || 0).toLocaleString()}</div>${intentTag}</div>
          ${btn}
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// MARKETPLACE
// ═══════════════════════════════════════════
async function loadMarketplace() {
  // No orderBy to avoid composite index requirement
  const q = query(
    collection(db, 'listings'),
    where('status', '==', 'active'),
    limit(50)
  );

  const unsub = onSnapshot(q, (snap) => {
    marketListings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(l => l.sellerId !== currentUser?.uid)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderMarketplace();
  });
  unsubscribeListeners.push(unsub);
}

function renderMarketplace() {
  const search = (document.getElementById('marketSearch')?.value || '').toLowerCase();
  let filtered = marketListings;

  if (marketFilter !== 'all') {
    filtered = filtered.filter(l => l.category === marketFilter);
  }
  if (search) {
    filtered = filtered.filter(l =>
      l.name?.toLowerCase().includes(search) ||
      l.category?.toLowerCase().includes(search) ||
      l.description?.toLowerCase().includes(search)
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
    const imgContent = l.imageUrl
      ? `<img src="${l.imageUrl}" style="width:100%;height:100%;object-fit:cover">`
      : getCategoryEmoji(l.category);
    const statusTag = l.status === 'reserved'
      ? `<div class="intent-tag tag-reserved">Reserved</div>`
      : `<div class="intent-tag tag-${l.intent || 'trade'}">${getIntentLabel(l.intent)}</div>`;
    return `
      <div class="listing-card">
        <div class="listing-img">${imgContent}</div>
        <div class="listing-name">${escHtml(l.name)}</div>
        <div class="listing-seller">by @${escHtml(l.sellerUsername || 'unknown')}</div>
        <div class="listing-price">SCR ${Number(l.priceSCR || 0).toLocaleString()}</div>
        ${statusTag}
        <div class="listing-footer" style="margin-top:10px">
          <button class="reserve-btn" onclick="openSheet('${l.id}')" ${l.status === 'reserved' ? 'disabled' : ''}>
            ${l.status === 'reserved' ? 'Reserved' : 'Inquire / Reserve'}
          </button>
        </div>
      </div>`;
  }).join('');
}

function setMarketFilter(el, filter) {
  document.querySelectorAll('#marketFilterRow .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  marketFilter = filter;
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
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Rep: ${u.traderRep || 0}</div>
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
          <div class="lb-change">Rep: ${u.traderRep || 0}</div>
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
        <input class="modal-input" id="${f.id}" type="text" placeholder="${f.placeholder}" />
      </div>
    `).join('')}`;
}

function openListingModal() {
  document.getElementById('listingModal').classList.add('open');
}

function closeListingModal() {
  document.getElementById('listingModal').classList.remove('open');
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
  if (currentUserData.accountLocked) return showToast('Account restricted. Settle your debt first.', 'error');

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

  // Collect spec fields
  const specs = {};
  const catFields = specFields[category] || [];
  catFields.forEach(f => {
    const el = document.getElementById(f.id);
    if (el && el.value) specs[f.id] = el.value.trim();
  });

  try {
    await addDoc(collection(db, 'listings'), {
      name,
      priceSCR: price,
      category,
      intent,
      frame,
      description: desc,
      imageUrl: imageUrl || '',
      specs,
      pinned,
      sellerId: currentUser.uid,
      sellerUsername: currentUserData.username,
      sellerDisplayName: currentUserData.displayName || currentUserData.username,
      status: 'active',
      createdAt: serverTimestamp()
    });
    closeListingModal();
    showToast('Item listed successfully!', 'success');
  } catch (err) {
    showToast('Error listing item: ' + err.message, 'error');
  }
}

async function deleteListing(listingId) {
  if (!confirm('Remove this listing?')) return;
  try {
    await deleteDoc(doc(db, 'listings', listingId));
    showToast('Listing removed', 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
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
  setText('sheetSeller', 'Listed by @' + (l.sellerUsername || 'unknown'));
  setText('sheetVal', 'SCR ' + Number(l.priceSCR || 0).toLocaleString());

  const isGrail = l.intent === 'grail';
  const pitch = document.getElementById('autoPitch');
  const actionBtns = document.getElementById('actionBtns');
  const actionLabel = document.getElementById('actionLabel');
  const grailNotice = document.getElementById('grailNotice');
  const pitchText = document.getElementById('pitchText');

  if (isGrail) {
    if (pitch) pitch.style.display = 'none';
    if (actionBtns) actionBtns.style.display = 'none';
    if (actionLabel) actionLabel.style.display = 'none';
    if (grailNotice) grailNotice.style.display = 'block';
  } else {
    if (pitch) pitch.style.display = '';
    if (actionBtns) actionBtns.style.display = '';
    if (actionLabel) actionLabel.style.display = '';
    if (grailNotice) grailNotice.style.display = 'none';
    const msg = l.intent === 'trade'
      ? `"Yo! I saw your <b>${escHtml(l.name)}</b> on Stash — I've got heat to swap. Let's talk."`
      : `"Yo! I saw your <b>${escHtml(l.name)}</b> on Stash. What's your best price?"`;
    if (pitchText) pitchText.innerHTML = msg;
  }
  document.getElementById('sheetOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentSheetListing = null;
}

async function reserveItem() {
  if (!currentUser || !currentSheetListing) return;
  if (!currentUserData) return showToast('User data not loaded', 'error');

  const ESCROW_COST = 100; // GB required to reserve
  if (currentUserData.goldBlocks < ESCROW_COST) {
    return showToast(`You need ${ESCROW_COST} GB to reserve an item. Visit the Exotic Shop to buy Gold Blocks.`, 'error');
  }

  try {
    const lockEscrowFn = httpsCallable(functions, 'lockEscrow');
    await lockEscrowFn({ listingId: currentSheetListing.id, goldBlockAmount: ESCROW_COST });
    closeSheet();
    showToast('Item reserved! Go to My Trades to manage the handshake.', 'success');
    switchScreen('trades');
  } catch (err) {
    showToast('Error reserving item: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════
// TRADES SCREEN
// ═══════════════════════════════════════════
async function loadTrades() {
  if (!currentUser) return;

  // Active trades (as buyer or seller)
  const buyerQ = query(collection(db, 'trades'), where('buyerId', '==', currentUser.uid), where('status', '==', 'pending'));
  const sellerQ = query(collection(db, 'trades'), where('sellerId', '==', currentUser.uid), where('status', '==', 'pending'));

  const [buyerSnap, sellerSnap] = await Promise.all([getDocs(buyerQ), getDocs(sellerQ)]);
  const trades = [
    ...buyerSnap.docs.map(d => ({ id: d.id, role: 'buyer', ...d.data() })),
    ...sellerSnap.docs.map(d => ({ id: d.id, role: 'seller', ...d.data() }))
  ];

  const tradesList = document.getElementById('activeTradesList');
  if (!tradesList) return;

  if (trades.length === 0) {
    tradesList.innerHTML = `<div class="empty-state"><div class="empty-icon">🔄</div><div class="empty-title">No Active Trades</div><div class="empty-sub">When you reserve an item or someone reserves yours, trades appear here.</div></div>`;
  } else {
    tradesList.innerHTML = trades.map(t => {
      const expiresAt = t.expiresAt?.toDate ? t.expiresAt.toDate() : new Date(t.expiresAt);
      const timeLeft = Math.max(0, expiresAt - Date.now());
      const hours = Math.floor(timeLeft / 3600000);
      const mins = Math.floor((timeLeft % 3600000) / 60000);
      const isSeller = t.role === 'seller';
      return `
        <div class="glass-card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div>
              <div style="font-size:14px;font-weight:700">Trade #${t.id.substring(0,8)}</div>
              <div style="font-size:12px;color:var(--text-muted)">You are the ${t.role}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:13px;font-weight:700;color:var(--gold)">${hours}h ${mins}m remaining</div>
              <div class="intent-tag tag-trade">Pending QR Scan</div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
            🟨 ${t.goldBlocksLocked} GB locked as collateral — refunded on successful handshake
          </div>
          ${isSeller
            ? `<button class="modal-btn" onclick="openQRModal('${t.id}','seller')">Generate QR Code</button>`
            : `<button class="modal-btn" onclick="openQRModal('${t.id}','buyer')">Scan Seller QR</button>`
          }
        </div>`;
    }).join('');
  }

  // Debt ledger
  const debtQ = query(collection(db, 'debtLedger'), where('userId', '==', currentUser.uid), where('status', '==', 'unpaid'));
  const debtSnap = await getDocs(debtQ);
  const debts = debtSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const debtList = document.getElementById('debtLedgerList');
  if (debtList) {
    if (debts.length === 0) {
      debtList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">No outstanding debts. You're all clear ✓</div>`;
    } else {
      debtList.innerHTML = debts.map(d => `
        <div class="glass-card" style="margin-bottom:10px;border-color:rgba(255,77,77,0.3)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:14px;font-weight:700;color:var(--red)">Unpaid Platform Fee</div>
              <div style="font-size:12px;color:var(--text-muted)">Trade: ${d.tradeId?.substring(0,8) || 'N/A'}</div>
            </div>
            <div style="font-size:18px;font-weight:800;color:var(--red)">SCR ${Number(d.amountSCR || 0).toFixed(2)}</div>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px">Contact admin to settle this debt and unlock your account.</div>
        </div>`).join('');
    }
  }
}

// ═══════════════════════════════════════════
// QR HANDSHAKE MODAL
// ═══════════════════════════════════════════
let qrInstance = null;
let qrTimerInterval = null;
let qrScannerInstance = null;

async function openQRModal(tradeId, role) {
  document.getElementById('qrModal').classList.add('open');
  const sellerView = document.getElementById('qrSellerView');
  const buyerView = document.getElementById('qrBuyerView');
  setText('qrModalTitle', role === 'seller' ? 'Show QR to Buyer' : 'Scan Buyer QR');

  if (role === 'seller') {
    sellerView.style.display = 'block';
    buyerView.style.display = 'none';
    try {
      const generateQRFn = httpsCallable(functions, 'generateQR');
      const result = await generateQRFn({ tradeId });
      const { payload, expiresAt } = result.data;
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
  showToast('QR detected. Running verification...', 'info');
  try {
    // Get GPS
    const gps = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { enableHighAccuracy: true, timeout: 5000 }
      )
    );

    const verifyFn = httpsCallable(functions, 'verifyQRScan');
    await verifyFn({
      qrPayload: payload,
      scanData: {
        buyerGPS: gps,
        buyerDeviceId: await getDeviceId(),
        buyerIP: null // handled server-side
      }
    });
    closeQRModal();
    showToast('🎉 Trade verified! Gold Blocks refunded.', 'success');
    loadTrades();
  } catch (err) {
    showToast('Verification failed: ' + err.message, 'error');
    closeQRModal();
  }
}

function closeQRModal() {
  document.getElementById('qrModal').classList.remove('open');
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  if (qrScannerInstance) qrScannerInstance.stop().catch(() => {});
  qrInstance = null;
  qrScannerInstance = null;
}

async function getDeviceId() {
  const stored = localStorage.getItem('stash_device_id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem('stash_device_id', id);
  return id;
}

// ═══════════════════════════════════════════
// SLIDE TO PAY
// ═══════════════════════════════════════════
let slideSkinName = '';
let slideSkinCost = 0;

function openSlideModal(name, cost) {
  slideSkinName = name;
  slideSkinCost = cost;
  setText('slideTitle', name);
  setText('slidePrice', cost.toLocaleString() + ' GB');
  document.getElementById('slideWrap').style.display = '';
  document.getElementById('slideSuccess').style.display = 'none';
  document.getElementById('slideThumb').style.transform = 'translateX(0)';
  setText('slideTextEl', 'Slide to Confirm');
  document.getElementById('slideTextEl').style.opacity = '1';
  document.getElementById('slideModal').classList.add('open');
  initSlide();
}

function closeSlideModal() {
  document.getElementById('slideModal').classList.remove('open');
}

function initSlide() {
  const wrap = document.getElementById('slideWrap');
  const thumb = document.getElementById('slideThumb');
  const textEl = document.getElementById('slideTextEl');
  const track = wrap.querySelector('.slide-track');
  let dragging = false, startX = 0;
  const getMax = () => track.offsetWidth - thumb.offsetWidth;
  const getCur = () => parseFloat(thumb.style.transform.replace('translateX(','')) || 0;

  const newWrap = wrap.cloneNode(true);
  wrap.parentNode.replaceChild(newWrap, wrap);
  const nw = document.getElementById('slideWrap');
  const nt = nw.querySelector('.slide-thumb');
  const ntxt = nw.querySelector('.slide-text');

  function onStart(e) { dragging = true; nt.style.transition = 'none'; startX = (e.touches ? e.touches[0].clientX : e.clientX) - getCurN(); }
  function getCurN() { return parseFloat(nt.style.transform.replace('translateX(','')) || 0; }
  function onMove(e) {
    if (!dragging) return; e.preventDefault();
    const x = Math.max(0, Math.min((e.touches ? e.touches[0].clientX : e.clientX) - startX, getMax()));
    nt.style.transform = `translateX(${x}px)`;
    ntxt.style.opacity = Math.max(0, 1 - (x / getMax()) * 1.5);
    if (x >= getMax() * 0.92) onComplete();
  }
  function onEnd() {
    if (!dragging) return; dragging = false;
    if (getCurN() < getMax() * 0.92) { nt.style.transition = 'transform 0.3s'; nt.style.transform = 'translateX(0)'; ntxt.style.opacity = '1'; }
  }
  async function onComplete() {
    dragging = false; nt.style.transition = 'transform 0.2s'; nt.style.transform = `translateX(${getMax()}px)`;
    // Deduct GB and record purchase
    if (currentUser && currentUserData) {
      if (currentUserData.goldBlocks < slideSkinCost) {
        showToast('Not enough Gold Blocks!', 'error');
        closeSlideModal(); return;
      }
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), { goldBlocks: increment(-slideSkinCost) });
        await addDoc(collection(db, 'gbTransactions'), {
          userId: currentUser.uid, amount: -slideSkinCost,
          type: 'skin_purchase', skinName: slideSkinName,
          createdAt: serverTimestamp()
        });
        setTimeout(() => {
          document.getElementById('slideWrap').style.display = 'none';
          document.getElementById('slideSuccess').style.display = 'block';
          setTimeout(closeSlideModal, 2000);
        }, 300);
        showToast(`${slideSkinName} unlocked!`, 'success');
      } catch (err) { showToast('Purchase failed: ' + err.message, 'error'); closeSlideModal(); }
    }
  }

  nw.addEventListener('mousedown', onStart);
  nw.addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
}

// ═══════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════
async function adminCreditGB() {
  const username = document.getElementById('adminUsername').value.trim().replace('@','');
  const amount = parseInt(document.getElementById('adminGBAmount').value);
  const note = document.getElementById('adminNote').value.trim();
  if (!username || !amount) return showToast('Fill in all fields', 'error');

  try {
    const creditFn = httpsCallable(functions, 'adminCreditGoldBlocks');
    // Find user by username
    const userSnap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (userSnap.empty) return showToast('User not found', 'error');
    const userId = userSnap.docs[0].id;
    await creditFn({ userId, amount, note });
    showToast(`Credited ${amount} GB to @${username}`, 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function adminSettleDebt() {
  const username = document.getElementById('adminDebtUsername').value.trim().replace('@','');
  const debtId = document.getElementById('adminDebtId').value.trim();
  if (!username || !debtId) return showToast('Fill in all fields', 'error');

  try {
    const settleFn = httpsCallable(functions, 'settleDebt');
    const userSnap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (userSnap.empty) return showToast('User not found', 'error');
    const userId = userSnap.docs[0].id;
    const result = await settleFn({ userId, debtId });
    showToast(result.data.accountUnlocked ? 'Debt settled & account unlocked!' : 'Debt settled', 'success');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function loadAdminData() {
  try {
    const [usersSnap, listingsSnap, tradesSnap, debtsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'listings'), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'trades'), where('status', '==', 'completed'))),
      getDocs(query(collection(db, 'debtLedger'), where('status', '==', 'unpaid')))
    ]);
    setText('adminTotalUsers', usersSnap.size);
    setText('adminTotalListings', listingsSnap.size);
    setText('adminTotalTrades', tradesSnap.size);

    const debts = debtsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const adminDebtList = document.getElementById('adminDebtList');
    if (adminDebtList) {
      adminDebtList.innerHTML = debts.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text-muted)">No pending debts</div>`
        : debts.map(d => `
          <div class="glass-card" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:13px;font-weight:700">User: ${d.userId?.substring(0,12)}...</div>
                <div style="font-size:11px;color:var(--text-muted)">Debt ID: ${d.id}</div>
              </div>
              <div style="font-size:16px;font-weight:800;color:var(--red)">SCR ${Number(d.amountSCR || 0).toFixed(2)}</div>
            </div>
          </div>`).join('');
    }
  } catch (err) { showToast('Admin load error: ' + err.message, 'error'); }
}

// ═══════════════════════════════════════════
// COUNTDOWN TIMER (Exotic Shop)
// ═══════════════════════════════════════════
function startCountdown() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);

  setInterval(() => {
    const left = Math.max(0, nextMidnight - Date.now());
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    setText('cd-h', String(h).padStart(2,'0'));
    setText('cd-m', String(m).padStart(2,'0'));
    setText('cd-s', String(s).padStart(2,'0'));
  }, 1000);
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

function getCategoryEmoji(cat) {
  const map = { Watches:'⌚', Sneakers:'👟', Tech:'💻', Jewelry:'💍', Cars:'🚗', Bags:'👜', 'Parts Bin':'🔧', Other:'📦' };
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
    // Remove any inline display style so CSS takes over
    drawer.style.removeProperty('display');
    drawer.style.removeProperty('left');
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
  const gbDisplay = Number(currentUserData.goldBlocks || 0).toLocaleString() + ' GB';

  const drawerAvatar = document.getElementById('drawerAvatar');
  if (drawerAvatar) {
    drawerAvatar.textContent = initials;
    if (currentUserData.avatarUrl) {
      drawerAvatar.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    }
  }
  const drawerName = document.getElementById('drawerName');
  const drawerHandle = document.getElementById('drawerHandle');
  const drawerGB = document.getElementById('drawerGBBalance');
  if (drawerName) drawerName.textContent = currentUserData.displayName || currentUserData.username;
  if (drawerHandle) drawerHandle.textContent = '@' + currentUserData.username;
  if (drawerGB) drawerGB.textContent = gbDisplay;

  // Show admin nav in drawer if admin
  if (currentUserData.isAdmin) {
    document.querySelectorAll('.drawer-nav-item.admin-only').forEach(el => el.style.display = 'flex');
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
document.getElementById('slideModal')?.addEventListener('click', e => { if (e.target === document.getElementById('slideModal')) closeSlideModal(); });
document.getElementById('listingModal')?.addEventListener('click', e => { if (e.target === document.getElementById('listingModal')) closeListingModal(); });
document.getElementById('qrModal')?.addEventListener('click', e => { if (e.target === document.getElementById('qrModal')) closeQRModal(); });

// ── Expose functions to HTML onclick
window.handleLogin = handleLogin;
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
window.closeListingModal = closeListingModal;
window.triggerUpload = triggerUpload;
window.submitListing = submitListing;
window.deleteListing = deleteListing;
window.updateSpecFields = updateSpecFields;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.reserveItem = reserveItem;
window.openQRModal = openQRModal;
window.closeQRModal = closeQRModal;
window.openSlideModal = openSlideModal;
window.closeSlideModal = closeSlideModal;
window.adminCreditGB = adminCreditGB;
window.adminSettleDebt = adminSettleDebt;
window.copyProfileLink = copyProfileLink;
window.showToast = showToast;
window.toggleCS = toggleCS;
window.toggleMobileDrawer = toggleMobileDrawer;
window.closeMobileDrawer = closeMobileDrawer;
window.drawerNav = drawerNav;
window.selectCS = selectCS;
