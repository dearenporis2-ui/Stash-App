<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Stash</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
  <!-- Cloudinary Upload Widget -->
  <script src="https://upload-widget.cloudinary.com/global/all.js" type="text/javascript"></script>
  <!-- QR Code Generator -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <!-- QR Code Scanner -->
  <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
</head>
<body>

<!-- ═══════════════════════════════════════
     AUTH SCREENS (shown before login)
═══════════════════════════════════════ -->
<div id="authWrap" class="auth-wrap">
  <!-- LOGIN -->
  <div id="loginCard" class="auth-card">
    <div class="auth-logo">ST<span>A</span>SH</div>
    <div class="auth-subtitle">The premium collector platform.</div>
    <div class="modal-group">
      <div class="modal-label">Email</div>
      <input class="modal-input" id="loginEmail" type="email" placeholder="your@email.com" />
    </div>
    <div class="modal-group">
      <div class="modal-label">Password</div>
      <input class="modal-input" id="loginPassword" type="password" placeholder="••••••••" />
    </div>
    <button class="modal-btn" onclick="handleLogin()">Sign In</button>
    <div class="auth-switch">Don't have an account? <a onclick="showRegister()">Create one</a></div>
  </div>

  <!-- REGISTER -->
  <div id="registerCard" class="auth-card" style="display:none">
    <div class="auth-logo">ST<span>A</span>SH</div>
    <div class="auth-subtitle">Join the community. Claim your username.</div>
    <div class="modal-group">
      <div class="modal-label">Username</div>
      <input class="modal-input" id="regUsername" type="text" placeholder="@yourhandle" />
    </div>
    <div class="modal-group">
      <div class="modal-label">Email</div>
      <input class="modal-input" id="regEmail" type="email" placeholder="your@email.com" />
    </div>
    <div class="modal-group">
      <div class="modal-label">Password</div>
      <input class="modal-input" id="regPassword" type="password" placeholder="••••••••" />
    </div>
    <button class="modal-btn" onclick="handleRegister()">Create Account</button>
    <div class="auth-switch">Already have an account? <a onclick="showLogin()">Sign in</a></div>
  </div>
</div>

<!-- ═══════════════════════════════════════
     MAIN APP (shown after login)
═══════════════════════════════════════ -->
<div id="appWrap" style="display:none">

  <!-- MOBILE TOP BAR -->
  <div class="mobile-topbar">
    <div class="mobile-logo">ST<span>A</span>SH</div>
    <div class="mobile-right">
      <div class="wallet-chip" style="padding:7px 12px;font-size:12px;">
        <span class="gb-icon">🟨</span><span id="mobileGBBalance">0 GB</span>
      </div>
      <div class="avatar" id="mobileAvatar" style="width:34px;height:34px;font-size:12px;"></div>
    </div>
  </div>

  <div class="app-layout">

    <!-- ═══ SIDEBAR ═══ -->
    <aside class="sidebar">
      <div class="sidebar-logo">ST<span>A</span>SH</div>
      <div class="snav active" data-screen="dashboard"><i class="ti ti-layout-grid"></i>My Stash</div>
      <div class="snav" data-screen="marketplace"><i class="ti ti-world"></i>Marketplace</div>
      <div class="snav" data-screen="shop"><i class="ti ti-shopping-bag"></i>Exotic Shop</div>
      <div class="snav" data-screen="leaderboard"><i class="ti ti-trophy"></i>Leaderboard</div>
      <div class="snav" data-screen="portfolio"><i class="ti ti-user"></i>Public Profile</div>
      <div class="snav" data-screen="trades"><i class="ti ti-arrows-exchange"></i>My Trades</div>
      <div class="snav admin-only" data-screen="admin" style="display:none"><i class="ti ti-shield"></i>Admin Panel</div>
      <button class="sidebar-add-btn" onclick="openListingModal()"><i class="ti ti-plus"></i>List an Item</button>
      <div class="sidebar-bottom">
        <div class="sidebar-user" onclick="switchScreen('portfolio')">
          <div class="avatar" id="sidebarAvatar"></div>
          <div>
            <div class="sidebar-user-name" id="sidebarName">Loading...</div>
            <div class="sidebar-user-handle" id="sidebarHandle">@...</div>
          </div>
        </div>
        <div class="wallet-chip" style="width:100%;margin-top:10px;justify-content:center;">
          <span class="gb-icon">🟨</span>
          <span id="sidebarGBBalance">0 GB</span>
        </div>
        <button class="modal-btn-ghost" style="margin-top:10px;font-size:12px;padding:10px" onclick="handleLogout()">
          <i class="ti ti-logout" style="margin-right:6px"></i>Sign Out
        </button>
      </div>
    </aside>

    <div class="main-area">
      <!-- TOPBAR -->
      <header class="topbar">
        <div class="topbar-title" id="topbarTitle">My Stash</div>
        <div class="topbar-right">
          <div class="wallet-chip">
            <span class="gb-icon">🟨</span>
            <span id="topbarGBBalance">0 GB</span>
          </div>
          <div class="notif-btn"><i class="ti ti-bell"></i></div>
          <div class="avatar" id="topbarAvatar"></div>
        </div>
      </header>

      <div class="screen-wrap">

        <!-- ═══════════ DASHBOARD ═══════════ -->
        <div class="screen active" id="screen-dashboard">
          <div id="lockedBanner" class="locked-banner" style="display:none">
            <i class="ti ti-lock"></i>
            <div class="locked-banner-text">
              <div class="locked-banner-title">Account Restricted</div>
              <div class="locked-banner-sub">You have an unpaid platform fee. Settle your debt to unlock listing and trading.</div>
            </div>
            <button class="buy-btn" onclick="switchScreen('trades')">View Debt</button>
          </div>

          <div class="nw-hero">
            <div class="nw-label">Total Portfolio Value</div>
            <div class="nw-value"><span class="currency">SCR</span><span id="nwValue">0</span></div>
            <div class="nw-trend" id="nwTrend">Loading portfolio...</div>
          </div>

          <div class="stats-row">
            <div class="stat-card">
              <div class="stat-label">Total Items</div>
              <div class="stat-value" id="dashTotalItems">0</div>
              <div class="stat-sub">In your collection</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Gold Blocks</div>
              <div class="stat-value gold" id="dashGBBalance">0</div>
              <div class="stat-sub">Available balance</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Trader Rep</div>
              <div class="stat-value" id="dashTraderRep">0</div>
              <div class="stat-sub">Verified trades</div>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-chip active" onclick="setChipFilter(this)">All</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Watches</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Sneakers</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Tech</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Jewelry</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Cars</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Parts Bin</div>
          </div>

          <div class="section-header">
            <div class="section-title">⭐ Top Shelf — Pinned Grails</div>
            <div class="section-line"></div>
            <div class="section-count" id="pinnedCount">0 Pinned</div>
          </div>
          <div class="top-shelf-grid" id="pinnedGrid">
            <div class="empty-state" style="grid-column:span 3;padding:40px">
              <div class="empty-icon">📌</div>
              <div class="empty-title">No Grails Pinned Yet</div>
              <div class="empty-sub">Pin your most prized items to the Top Shelf when listing them.</div>
            </div>
          </div>

          <div class="section-header">
            <div class="section-title">📦 My Listings</div>
            <div class="section-line"></div>
            <div class="section-count" id="myListingsCount">0 Items</div>
          </div>
          <div class="closet-grid" id="myListingsGrid">
            <div class="empty-state" style="grid-column:span 4;padding:40px">
              <div class="empty-icon">📦</div>
              <div class="empty-title">Your Stash is Empty</div>
              <div class="empty-sub">Start listing your items to build your collection portfolio.</div>
              <button class="modal-btn" style="width:auto;padding:14px 28px" onclick="openListingModal()">List Your First Item</button>
            </div>
          </div>
        </div>

        <!-- ═══════════ MARKETPLACE ═══════════ -->
        <div class="screen" id="screen-marketplace">
          <div class="explore-search">
            <input class="search-input" id="marketSearch" type="text" placeholder="Search items, brands, categories..." oninput="filterMarketplace()" />
            <button class="search-btn"><i class="ti ti-search"></i></button>
          </div>
          <div class="filter-row" id="marketFilterRow">
            <div class="filter-chip active" onclick="setMarketFilter(this,'all')">All</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Watches')">Watches</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Sneakers')">Sneakers</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Tech')">Tech</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Jewelry')">Jewelry</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Cars')">Cars</div>
            <div class="filter-chip" onclick="setMarketFilter(this,'Parts Bin')">Parts Bin</div>
          </div>
          <div class="section-header">
            <div class="section-title">🔥 Active Listings</div>
            <div class="section-line"></div>
            <div class="section-count" id="marketCount">Loading...</div>
          </div>
          <div class="listing-grid" id="marketplaceGrid">
            <div style="grid-column:span 4;text-align:center;padding:60px;color:var(--text-muted)">Loading listings...</div>
          </div>
        </div>

        <!-- ═══════════ EXOTIC SHOP ═══════════ -->
        <div class="screen" id="screen-shop">
          <div class="shop-hero">
            <div class="shop-hero-text">
              <div class="shop-hero-label">✦ Limited Drop</div>
              <div class="shop-hero-title">The Exotic Shop</div>
              <div class="shop-hero-sub">Exclusive card frames and cosmetics. Each drop rotates every 24 hours — spend your Gold Blocks.</div>
            </div>
            <div class="countdown-wrap">
              <div class="countdown-label">Next Drop In</div>
              <div class="countdown">
                <div class="count-block"><div class="count-num" id="cd-h">00</div><div class="count-lbl">Hrs</div></div>
                <div class="count-block"><div class="count-num" id="cd-m">00</div><div class="count-lbl">Min</div></div>
                <div class="count-block"><div class="count-num" id="cd-s">00</div><div class="count-lbl">Sec</div></div>
              </div>
            </div>
          </div>
          <div class="section-header"><div class="section-title">🎁 Current Drop</div><div class="section-line"></div><div class="section-count">5 Items</div></div>
          <div class="shop-grid">
            <div class="skin-card skin-gold"><div class="skin-preview gold-p"><div class="limited-badge">LIMITED</div>⌚</div><div class="skin-name">Liquid Gold Frame</div><div class="skin-desc">High-gloss metallic gold border that reflects light. The ultimate flex for luxury timepieces.</div><div class="skin-footer"><div class="skin-price"><span class="gb-icon">🟨</span>850 GB</div><button class="buy-btn" onclick="openSlideModal('Liquid Gold Frame',850)">Buy Now</button></div></div>
            <div class="skin-card skin-holo"><div class="skin-preview holo-p"><div class="limited-badge">HOT</div>👟</div><div class="skin-name">Holographic Foil Frame</div><div class="skin-desc">Iridescent color-shifting gradient that reacts to cursor movement and device tilt.</div><div class="skin-footer"><div class="skin-price"><span class="gb-icon">🟨</span>1,200 GB</div><button class="buy-btn" onclick="openSlideModal('Holographic Foil Frame',1200)">Buy Now</button></div></div>
            <div class="skin-card skin-purple"><div class="skin-preview purple-p">💍</div><div class="skin-name">Royal Purple Frame</div><div class="skin-desc">A deep purple glow reserved for your rarest grail items.</div><div class="skin-footer"><div class="skin-price"><span class="gb-icon">🟨</span>600 GB</div><button class="buy-btn" onclick="openSlideModal('Royal Purple Frame',600)">Buy Now</button></div></div>
            <div class="skin-card skin-carbon"><div class="skin-preview carbon-p">💻</div><div class="skin-name">Carbon Fiber Frame</div><div class="skin-desc">Textured dark-weave border for tech, gaming rigs, and cars.</div><div class="skin-footer"><div class="skin-price"><span class="gb-icon">🟨</span>400 GB</div><button class="buy-btn" onclick="openSlideModal('Carbon Fiber Frame',400)">Buy Now</button></div></div>
            <div class="skin-card skin-neon"><div class="skin-preview neon-p"><div class="limited-badge">NEW</div>🎮</div><div class="skin-name">Neon Grid Frame</div><div class="skin-desc">Glowing pulsing cyber-lines for gaming and retro-modern tech collections.</div><div class="skin-footer"><div class="skin-price"><span class="gb-icon">🟨</span>750 GB</div><button class="buy-btn" onclick="openSlideModal('Neon Grid Frame',750)">Buy Now</button></div></div>
          </div>
          <div class="section-header" style="margin-top:32px"><div class="section-title">🟨 Buy Gold Blocks</div><div class="section-line"></div></div>
          <div class="stats-row">
            <div class="stat-card" style="cursor:pointer;text-align:center" onclick="showToast('Contact admin to purchase Gold Blocks','info')">
              <div style="font-size:32px;margin-bottom:8px">🟨</div>
              <div class="stat-label">500 GB</div>
              <div class="stat-value gold">SCR 250</div>
              <div class="stat-sub">Contact admin to top up</div>
            </div>
            <div class="stat-card" style="cursor:pointer;text-align:center" onclick="showToast('Contact admin to purchase Gold Blocks','info')">
              <div style="font-size:32px;margin-bottom:8px">🟨🟨</div>
              <div class="stat-label">1,200 GB</div>
              <div class="stat-value gold">SCR 500</div>
              <div class="stat-sub">Best value</div>
            </div>
            <div class="stat-card" style="cursor:pointer;text-align:center" onclick="showToast('Contact admin to purchase Gold Blocks','info')">
              <div style="font-size:32px;margin-bottom:8px">🟨🟨🟨</div>
              <div class="stat-label">2,800 GB</div>
              <div class="stat-value gold">SCR 1,000</div>
              <div class="stat-sub">Power user pack</div>
            </div>
          </div>
        </div>

        <!-- ═══════════ LEADERBOARD ═══════════ -->
        <div class="screen" id="screen-leaderboard">
          <div class="filter-row">
            <div class="filter-chip active" onclick="setChipFilter(this)">Portfolio Value</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Trader Rep</div>
            <div class="filter-chip" onclick="setChipFilter(this)">Most Trades</div>
          </div>
          <div class="section-header"><div class="section-title">&#127942; Top Collectors</div><div class="section-line"></div><div class="section-count">Global</div></div>
          <div id="leaderboardPodium" class="lb-podium"></div>
          <div class="section-header"><div class="section-title">&#128202; Full Rankings</div><div class="section-line"></div></div>
          <div class="lb-list" id="leaderboardList">
            <div style="text-align:center;padding:40px;color:var(--text-muted)">Loading leaderboard...</div>
          </div>
        </div>

        <!-- ═══════════ PUBLIC PORTFOLIO ═══════════ -->
        <div class="screen" id="screen-portfolio">
          <div class="profile-header">
            <div class="profile-avatar-wrap">
              <div class="profile-avatar" id="portAvatar"></div>
              <div class="verified-badge">&#10003;</div>
            </div>
            <div>
              <div class="profile-name" id="portName">Your Name</div>
              <div class="profile-handle" id="portHandle">@handle</div>
              <div class="profile-bio" id="portBio">Add a bio in settings.</div>
              <div class="profile-socials">
                <div class="social-chip verified-chip"><i class="ti ti-shield-check"></i><span id="portTraderRep">0</span> Verified Trades</div>
                <div class="social-chip" onclick="copyProfileLink()"><i class="ti ti-link"></i>Copy Profile Link</div>
              </div>
            </div>
            <div class="profile-right">
              <div>
                <div class="pv-label">Stash Value</div>
                <div class="pv-number" id="portValue">SCR 0</div>
                <div class="pv-sub" id="portItemCount">0 items</div>
              </div>
              <div class="share-btn" onclick="copyProfileLink()"><i class="ti ti-share"></i> Share</div>
            </div>
          </div>
          <div class="divider-line"></div>
          <div class="pub-stats-row">
            <div class="stat-card"><div class="stat-label">Items</div><div class="stat-value" id="portStatItems">0</div></div>
            <div class="stat-card"><div class="stat-label">Portfolio</div><div class="stat-value gold" id="portStatValue">SCR 0</div></div>
            <div class="stat-card"><div class="stat-label">Trader Rep</div><div class="stat-value" id="portStatRep">0</div></div>
            <div class="stat-card"><div class="stat-label">Gold Blocks</div><div class="stat-value gold" id="portStatGB">0 GB</div></div>
          </div>
          <div class="filter-row">
            <div class="filter-chip active" onclick="setPubFilter(this,'all')"><span class="chip-dot dot-all"></span>All</div>
            <div class="filter-chip" onclick="setPubFilter(this,'trade')"><span class="chip-dot dot-trade"></span>Looking to Trade</div>
            <div class="filter-chip" onclick="setPubFilter(this,'cash')"><span class="chip-dot dot-cash"></span>Accepting Offers</div>
            <div class="filter-chip" onclick="setPubFilter(this,'grail')"><span class="chip-dot dot-grail"></span>Personal Grail</div>
          </div>
          <div class="section-header"><div class="section-title">&#128230; Public Collection</div><div class="section-line"></div><div class="section-count" id="pubCount">0 Items</div></div>
          <div class="portfolio-grid" id="portfolioGrid">
            <div class="empty-state" style="grid-column:span 4">
              <div class="empty-icon">&#128230;</div>
              <div class="empty-title">No Public Listings</div>
              <div class="empty-sub">Your listed items will appear here.</div>
            </div>
          </div>
        </div>

        <!-- ═══════════ MY TRADES ═══════════ -->
        <div class="screen" id="screen-trades">
          <div class="section-header"><div class="section-title">&#128260; Active Trades</div><div class="section-line"></div></div>
          <div id="activeTradesList">
            <div class="empty-state">
              <div class="empty-icon">&#128260;</div>
              <div class="empty-title">No Active Trades</div>
              <div class="empty-sub">When you reserve an item or someone reserves yours, trades appear here.</div>
            </div>
          </div>
          <div class="section-header" style="margin-top:32px"><div class="section-title">&#128203; Debt Ledger</div><div class="section-line"></div></div>
          <div id="debtLedgerList">
            <div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">No outstanding debts. You're all clear &#10003;</div>
          </div>
        </div>

        <!-- ═══════════ ADMIN PANEL ═══════════ -->
        <div class="screen" id="screen-admin">
          <div class="admin-grid">
            <div class="admin-card">
              <div class="admin-card-title">🟨 Credit Gold Blocks</div>
              <div class="modal-group"><div class="modal-label">Username</div><input class="modal-input" id="adminUsername" type="text" placeholder="@username" /></div>
              <div class="modal-group"><div class="modal-label">Amount (GB)</div><input class="modal-input" id="adminGBAmount" type="number" placeholder="e.g. 500" /></div>
              <div class="modal-group"><div class="modal-label">Note</div><input class="modal-input" id="adminNote" type="text" placeholder="e.g. Cash received SCR 250" /></div>
              <button class="modal-btn" onclick="adminCreditGB()">Credit Gold Blocks</button>
            </div>
            <div class="admin-card">
              <div class="admin-card-title">&#128203; Settle Seller Debt</div>
              <div class="modal-group"><div class="modal-label">Username</div><input class="modal-input" id="adminDebtUsername" type="text" placeholder="@username" /></div>
              <div class="modal-group"><div class="modal-label">Debt ID</div><input class="modal-input" id="adminDebtId" type="text" placeholder="Debt document ID" /></div>
              <button class="modal-btn" onclick="adminSettleDebt()">Settle Debt & Unlock Account</button>
            </div>
          </div>
          <div class="section-header"><div class="section-title">&#128203; All Pending Debts</div><div class="section-line"></div></div>
          <div id="adminDebtList">
            <div style="text-align:center;padding:40px;color:var(--text-muted)">Loading...</div>
          </div>
          <div class="section-header" style="margin-top:28px"><div class="section-title">&#128202; Platform Stats</div><div class="section-line"></div></div>
          <div class="stats-row">
            <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value" id="adminTotalUsers">-</div></div>
            <div class="stat-card"><div class="stat-label">Active Listings</div><div class="stat-value" id="adminTotalListings">-</div></div>
            <div class="stat-card"><div class="stat-label">Completed Trades</div><div class="stat-value" id="adminTotalTrades">-</div></div>
          </div>
        </div>

      </div><!-- screen-wrap -->
    </div><!-- main-area -->
  </div><!-- app-layout -->

  <!-- MOBILE BOTTOM NAV -->
  <nav class="bottom-nav">
    <div class="nav-item active" data-screen="dashboard"><i class="ti ti-layout-grid"></i>Stash</div>
    <div class="nav-item" data-screen="marketplace"><i class="ti ti-world"></i>Market</div>
    <div class="nav-item"><div class="nav-add-btn" onclick="openListingModal()"><i class="ti ti-plus"></i></div></div>
    <div class="nav-item" data-screen="shop"><i class="ti ti-shopping-bag"></i>Shop</div>
    <div class="nav-item" data-screen="portfolio"><i class="ti ti-user"></i>Profile</div>
  </nav>

</div><!-- appWrap -->

<!-- ═══════════════════════════════════════
     MODALS & SHEETS
═══════════════════════════════════════ -->

<!-- LIST ITEM MODAL -->
<div class="modal-overlay" id="listingModal">
  <div class="modal-sheet" style="max-width:520px">
    <div class="modal-close" onclick="closeListingModal()"><i class="ti ti-x"></i></div>
    <div class="modal-title">List an Item</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="modal-group" style="grid-column:span 2">
        <div class="modal-label">Item Photo</div>
        <div id="uploadPreview" onclick="triggerUpload()" style="width:100%;height:160px;background:rgba(255,255,255,0.04);border:2px dashed var(--glass-border);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;overflow:hidden" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--glass-border)'">
          <i class="ti ti-photo-up" style="font-size:32px;color:var(--text-muted);margin-bottom:8px"></i>
          <div style="font-size:13px;color:var(--text-muted)">Click to upload photo</div>
        </div>
        <input type="hidden" id="listingImageUrl" />
      </div>
      <div class="modal-group">
        <div class="modal-label">Item Name</div>
        <input class="modal-input" id="listingName" type="text" placeholder="e.g. Rolex Daytona" />
      </div>
      <div class="modal-group">
        <div class="modal-label">Price (SCR)</div>
        <input class="modal-input" id="listingPrice" type="number" placeholder="e.g. 45000" />
      </div>
      <div class="modal-group">
        <div class="modal-label">Category</div>
        <div class="custom-select-wrap" id="csCategory">
          <input type="hidden" id="listingCategory" value="" />
          <div class="cs-selected" onclick="toggleCS('csCategory')">
            <span class="cs-placeholder" id="csCategoryLabel">Select category</span>
            <i class="ti ti-chevron-down cs-arrow"></i>
          </div>
          <div class="cs-dropdown">
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Watches','⌚','updateSpecFields')"><span class="cs-opt-icon">⌚</span>Watches</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Sneakers','👟','updateSpecFields')"><span class="cs-opt-icon">👟</span>Sneakers</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Tech','💻','updateSpecFields')"><span class="cs-opt-icon">💻</span>Tech</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Jewelry','💍','updateSpecFields')"><span class="cs-opt-icon">💍</span>Jewelry</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Cars','🚗','updateSpecFields')"><span class="cs-opt-icon">🚗</span>Cars</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Bags','👜','updateSpecFields')"><span class="cs-opt-icon">👜</span>Bags</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Parts Bin','🔧','updateSpecFields')"><span class="cs-opt-icon">🔧</span>Parts Bin</div>
            <div class="cs-option" onclick="selectCS('csCategory','listingCategory','Other','📦','updateSpecFields')"><span class="cs-opt-icon">📦</span>Other</div>
          </div>
        </div>
      </div>
      <div class="modal-group">
        <div class="modal-label">Intent</div>
        <div class="custom-select-wrap" id="csIntent">
          <input type="hidden" id="listingIntent" value="trade" />
          <div class="cs-selected" onclick="toggleCS('csIntent')">
            <span id="csIntentLabel">🔄 Looking to Trade</span>
            <i class="ti ti-chevron-down cs-arrow"></i>
          </div>
          <div class="cs-dropdown">
            <div class="cs-option selected" onclick="selectCS('csIntent','listingIntent','trade','🔄 Looking to Trade')"><span class="cs-opt-icon">🔄</span>Looking to Trade</div>
            <div class="cs-option" onclick="selectCS('csIntent','listingIntent','cash','💰 Accepting Cash Offers')"><span class="cs-opt-icon">💰</span>Accepting Cash Offers</div>
            <div class="cs-option" onclick="selectCS('csIntent','listingIntent','grail','👑 Personal Grail (View Only)')"><span class="cs-opt-icon">👑</span>Personal Grail (View Only)</div>
          </div>
        </div>
      </div>
      <div class="modal-group" style="grid-column:span 2" id="specFieldsWrap"></div>
      <div class="modal-group" style="grid-column:span 2">
        <div class="modal-label">Description</div>
        <textarea class="modal-input" id="listingDesc" rows="3" placeholder="Condition, details, box & papers..."></textarea>
      </div>
      <div class="modal-group" style="grid-column:span 2">
        <div class="modal-label">Card Frame</div>
        <select class="modal-input" style="display:none" id="listingFrame">
          <option value="default">Default (Free)</option>
          <option value="gold">Liquid Gold Frame</option>
          <option value="holo">Holographic Foil</option>
          <option value="purple">Royal Purple</option>
          <option value="carbon">Carbon Fiber</option>
          <option value="neon">Neon Grid</option>
        </select>
      </div>
      <div class="modal-group" style="grid-column:span 2;display:flex;align-items:center;gap:10px">
        <input type="checkbox" id="listingPinned" style="width:18px;height:18px;accent-color:var(--gold)" />
        <label for="listingPinned" style="font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer">Pin to Top Shelf (Grails only)</label>
      </div>
    </div>
    <button class="modal-btn" onclick="submitListing()">List Item ✦</button>
  </div>
</div>

<!-- QUICK-STRIKE SHEET -->
<div class="sheet-overlay" id="sheetOverlay">
  <div class="bottom-sheet">
    <div class="sheet-handle"></div>
    <div style="display:flex;align-items:center;gap:18px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:20px;padding:18px;margin-bottom:22px">
      <div style="width:70px;height:70px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:32px" id="sheetImg"></div>
      <div style="flex:1">
        <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:4px" id="sheetName">Item</div>
        <div style="font-size:12px;color:var(--text-muted)" id="sheetSeller">Listed by @handle</div>
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--gold);flex-shrink:0" id="sheetVal">SCR 0</div>
    </div>
    <div style="background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:16px;padding:18px;margin-bottom:24px" id="autoPitch">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">&#10022; Auto-generated opener</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.75);line-height:1.7;font-style:italic" id="pitchText"></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--green);text-align:center;padding:20px 0;display:none" id="grailNotice">&#128081; This item is a Personal Grail — not available for sale or trade.</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--text-muted);text-transform:uppercase;margin-bottom:12px" id="actionLabel">Reserve with Gold Blocks 🟨</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px" id="actionBtns">
      <button style="display:flex;align-items:center;justify-content:center;gap:10px;border-radius:16px;padding:17px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;background:var(--glass-gold);border:1px solid var(--glass-gold-border);color:var(--gold)" onclick="reserveItem()">
        <span class="gb-icon">🟨</span>Reserve Item
      </button>
      <button style="display:flex;align-items:center;justify-content:center;gap:10px;border-radius:16px;padding:17px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;background:rgba(37,211,102,0.09);border:1px solid rgba(37,211,102,0.28);color:#4ade80" onclick="closeSheet()">
        <i class="ti ti-brand-whatsapp" style="font-size:22px"></i>WhatsApp Seller
      </button>
    </div>
    <button style="display:flex;align-items:center;justify-content:center;gap:7px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:14px;padding:14px;font-size:13px;font-weight:700;color:var(--text-muted);cursor:pointer;transition:all 0.2s;width:100%;font-family:Inter,sans-serif" onclick="closeSheet()">
      <i class="ti ti-x"></i>Close
    </button>
  </div>
</div>

<!-- QR HANDSHAKE MODAL -->
<div class="modal-overlay" id="qrModal">
  <div class="modal-sheet" style="max-width:400px;text-align:center">
    <div class="modal-close" onclick="closeQRModal()"><i class="ti ti-x"></i></div>
    <div class="modal-title" id="qrModalTitle">Safe Zone QR</div>
    <div id="qrSellerView">
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Show this QR to the buyer at your Safe Zone meetup</div>
      <div id="qrCodeDisplay" class="qr-box">Generating...</div>
      <div class="qr-timer" id="qrTimer">10:00</div>
      <div class="qr-sub">QR expires in 10 minutes</div>
    </div>
    <div id="qrBuyerView" style="display:none">
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Scan the seller's QR code to complete the trade</div>
      <div id="qrReader" style="width:100%;border-radius:14px;overflow:hidden"></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:12px">GPS verification will run automatically</div>
    </div>
  </div>
</div>

<!-- SLIDE TO PAY MODAL -->
<div class="modal-overlay" id="slideModal">
  <div class="modal-sheet" style="max-width:400px">
    <div class="modal-close" onclick="closeSlideModal()"><i class="ti ti-x"></i></div>
    <div class="modal-title" id="slideTitle">Buy Skin</div>
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:48px;margin-bottom:8px">&#10024;</div>
      <div style="font-size:14px;color:var(--text-muted)">Slide to confirm your purchase</div>
      <div style="font-size:28px;font-weight:900;color:var(--gold);margin-top:12px" id="slidePrice">0 GB</div>
    </div>
    <div class="slide-pay-wrap" id="slideWrap">
      <div class="slide-track">
        <div class="slide-thumb" id="slideThumb">&#8594;</div>
        <div class="slide-text" id="slideTextEl">Slide to Confirm</div>
      </div>
    </div>
    <div id="slideSuccess" style="display:none;text-align:center;padding:20px 0">
      <div style="font-size:48px;margin-bottom:12px">&#127881;</div>
      <div style="font-size:18px;font-weight:800;margin-bottom:6px">Frame Unlocked!</div>
      <div style="font-size:13px;color:var(--text-muted)">Your new frame is ready to apply to any listing.</div>
    </div>
  </div>
</div>

<!-- TOAST CONTAINER -->
<div class="toast-wrap" id="toastWrap"></div>

<script type="module" src="app.js"></script>
</body>
</html>
