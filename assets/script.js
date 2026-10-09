"use strict";

/* ============================================================================
 * VUR — assets/script.js
 * ============================================================================
 * CATATAN MAINTENANCE (baca dulu sebelum mengubah):
 *
 *  1) MIGRASI GITHUB → GITLAB
 *     Semua URL repo TERPUSAT di REPO_CONFIG di bawah. Link repo di
 *     index.html juga di-update otomatis dari konfigurasi ini (elemen dengan
 *     atribut [data-repo-link], [data-repo-label], [data-repo-icon]).
 *     Saat memindahkan koleksi VUR ke GitLab cukup:
 *       a. ganti provider menjadi 'gitlab'
 *       b. sesuaikan owner / repo / branch bila berubah
 *     Tidak ada URL GitHub lain yang tersebar di file ini maupun index.html.
 *
 *     Referensi format URL:
 *       GitHub raw : https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<file>
 *       GitLab raw : https://gitlab.com/<owner>/<repo>/-/raw/<branch>/<file>
 *       GitHub web : https://github.com/<owner>/<repo>/tree/<branch>/<path>
 *       GitLab web : https://gitlab.com/<owner>/<repo>/-/tree/<branch>/<path>
 *
 *  2) SKEMA packages.json (file index paket di repo):
 *     [
 *       {
 *         "name": "foo",          // wajib — dipakai untuk hash route & folder
 *         "version": "1.2.3",     // opsional
 *         "description": "...",   // opsional
 *         "category": "extra",    // opsional — folder repo & tombol filter
 *         "maintainer": "..."     // opsional
 *       }
 *     ]
 *     Urutan array dianggap "terbaru dulu" (5 baris pertama tampil di Home).
 *
 *  3) STRUKTUR FOLDER REPO yang diasumsikan: <category>/<name>/
 *     Jika struktur berubah, cukup edit buildPkgPath().
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * KONFIGURASI REPOSITORY — SATU-SATUNYA tempat yang perlu di-edit
 * saat migrasi GitHub → GitLab.
 * ------------------------------------------------------------------------- */
const REPO_CONFIG = {
  provider: "github", // 'github' | 'gitlab'
  owner: "T4n-Labs",
  repo: "vur",
  branch: "main",
  indexFile: "packages.json",
};

/* Bangun semua URL yang dibutuhkan aplikasi dari REPO_CONFIG. */
function buildRepoUrls(cfg) {
  const slug = `${cfg.owner}/${cfg.repo}`;
  if (cfg.provider === "gitlab") {
    return {
      web: `https://gitlab.com/${slug}`,
      raw: `https://gitlab.com/${slug}/-/raw/${cfg.branch}/${cfg.indexFile}`,
      tree: `https://gitlab.com/${slug}/-/tree/${cfg.branch}`,
    };
  }
  return {
    web: `https://github.com/${slug}`,
    raw: `https://raw.githubusercontent.com/${slug}/${cfg.branch}/${cfg.indexFile}`,
    tree: `https://github.com/${slug}/tree/${cfg.branch}`,
  };
}

/* ---------------------------------------------------------------------------
 * UTILITAS
 * ------------------------------------------------------------------------- */

/* FIX (XSS): escape semua nilai dari packages.json / URL sebelum masuk
 * innerHTML. Dipakai di semua tempat yang me-render data dinamis. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Debounce ringan untuk input pencarian — hemat render saat data membesar. */
function debounce(fn, wait = 150) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* ---------------------------------------------------------------------------
 * APLIKASI
 * ------------------------------------------------------------------------- */
const app = {
  data: [], // seluruh isi packages.json
  isLoaded: false, // true setelah fetch berhasil
  currentSearch: "", // kata kunci pencarian aktif (lowercase)
  selectedCategory: "all", // kategori filter aktif di view Packages
  urls: buildRepoUrls(REPO_CONFIG),
  baseTitle: document.title,

  /* ======================= INIT ======================= */
  init: async function () {
    this.bindGlobalEvents();
    this.updateRepoLinks(); // isi href/label/ikon repo di index.html

    try {
      await this.fetchData();
    } catch (err) {
      console.error("[VUR] Gagal memuat index paket:", err);
      this.renderLoadError();
      return; // view error sudah tampil; router tidak perlu jalan
    }

    this.router(); // render view awal sesuai hash URL (mendukung deep-link)
  },

  /* ======================= DATA ======================= */

  fetchData: async function () {
    const res = await fetch(this.urls.raw);
    if (!res.ok)
      throw new Error(`HTTP ${res.status} saat memuat ${this.urls.raw}`);
    const json = await res.json();
    if (!Array.isArray(json))
      throw new Error("packages.json harus berupa array JSON");
    this.data = json;
    this.isLoaded = true;
    this.updateStats();
    this.buildCategoryFilters();
  },

  updateStats: function () {
    document.getElementById("stat-total").textContent = this.data.length;
    // CATATAN: dulunya "Latest Package" di-hardcode angka 5 (menyesatkan).
    // Sekarang dihitung jumlah kategori unik dari data.
    const cats = new Set(this.data.map((p) => p.category || "unknown"));
    document.getElementById("stat-categories").textContent = cats.size;
  },

  /* Tombol kategori dibuat OTOMATIS dari data — menambah kategori baru di
   * repo tidak perlu mengubah HTML/JS lagi. */
  buildCategoryFilters: function () {
    const cats = [
      ...new Set(this.data.map((p) => p.category || "unknown")),
    ].sort();
    document.getElementById("category-filters").innerHTML =
      '<button class="filter-btn active" data-cat="all" type="button">All</button>' +
      cats
        .map(
          (c) =>
            `<button class="filter-btn" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`,
        )
        .join("");
  },

  /* ======================= EVENTS ======================= */

  bindGlobalEvents: function () {
    window.addEventListener("hashchange", () => this.router());

    // Pencarian Home & List — satu state (currentSearch), disinkronkan
    // ulang oleh router tiap pindah view supaya tidak mismatch.
    const onSearch = debounce(function (e) {
      app.currentSearch = e.target.value.toLowerCase();
      if (e.target.id === "home-search") app.renderRecent();
      else app.renderPackagesList();
    }, 150);
    document.getElementById("home-search").addEventListener("input", onSearch);
    document.getElementById("list-search").addEventListener("input", onSearch);

    // SATU listener klik (event delegation) untuk semua elemen dinamis:
    //   [data-action]  -> tombol aksi (copy / reload / back)
    //   .filter-btn    -> filter kategori
    //   tr[data-pkg]   -> baris tabel -> buka detail paket
    // FIX: mengganti semua inline onclick="app.xxx()" di HTML.
    document.addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-action]");
      if (actionEl) {
        this.handleAction(actionEl);
        return;
      }

      const filterBtn = e.target.closest(".filter-btn");
      if (filterBtn) {
        document
          .querySelectorAll(".filter-btn")
          .forEach((b) => b.classList.remove("active"));
        // FIX: pakai hasil closest(), bukan e.target — aman walau
        // suatu saat tombol berisi elemen lain (ikon, span, dsb.)
        filterBtn.classList.add("active");
        this.selectedCategory = filterBtn.dataset.cat;
        this.renderPackagesList();
        return;
      }

      const row = e.target.closest("tr[data-pkg]");
      if (row) {
        // FIX: encodeURIComponent agar nama paket dengan karakter
        // spesial tidak merusak hash URL.
        window.location.hash = `package/${encodeURIComponent(row.dataset.pkg)}`;
      }
    });
  },

  handleAction: function (el) {
    switch (el.dataset.action) {
      case "copy":
        this.copyToClipboard(el);
        break;
      case "reload":
        location.reload();
        break;
      case "back":
        window.location.hash = "packages";
        break;
    }
  },

  /* Isi link/label/ikon repo di HTML dari konfigurasi — dengan begitu
   * migrasi GitHub → GitLab tidak menyentuh index.html sama sekali. */
  updateRepoLinks: function () {
    const label = `${REPO_CONFIG.owner}/${REPO_CONFIG.repo}`;
    const icon =
      REPO_CONFIG.provider === "gitlab" ? "ph-gitlab-logo" : "ph-github-logo";

    document.querySelectorAll("[data-repo-link]").forEach((a) => {
      a.href = this.urls.web;
    });
    document.querySelectorAll("[data-repo-label]").forEach((el) => {
      el.textContent = label;
    });
    document.querySelectorAll("[data-repo-icon]").forEach((el) => {
      el.className = `ph ${icon}`;
    });
  },

  /* ======================= ROUTER ======================= */

  router: function () {
    // Sembunyikan semua view + status aktif nav
    document
      .querySelectorAll('[id^="view-"]')
      .forEach((el) => el.classList.add("hidden"));
    document
      .querySelectorAll("nav a")
      .forEach((el) => el.classList.remove("active"));

    const hash = window.location.hash || "#home";

    // FIX: dulu deep-link #package/... saat data belum siap bisa menampilkan
    // "Package Not Found" sesaat. Sekarang loading ditampilkan untuk SEMUA
    // route sampai data siap.
    if (!this.isLoaded) {
      document.getElementById("view-loading").classList.remove("hidden");
      return;
    }

    if (hash === "#packages") {
      document.getElementById("view-packages").classList.remove("hidden");
      document.getElementById("nav-packages").classList.add("active");
      document.title = this.baseTitle;
      // CATATAN: filter & pencarian direset tiap masik view Packages
      // (perilaku lama dipertahankan). Hapus baris ini jika ingin persist.
      this.resetListFilters();
      this.renderPackagesList();
    } else if (hash.startsWith("#package/")) {
      // FIX: decodeURIComponent — pasangan dari encodeURIComponent di atas
      const pkgName = decodeURIComponent(hash.slice("#package/".length));
      this.renderDetail(pkgName);
    } else {
      // '#home', '', atau hash tak dikenal → fallback ke Home
      document.getElementById("view-home").classList.remove("hidden");
      document.getElementById("nav-home").classList.add("active");
      document.title = this.baseTitle;
      // Sinkronkan state pencarian dengan isi input Home
      this.currentSearch = (
        document.getElementById("home-search").value || ""
      ).toLowerCase();
      this.renderRecent();
    }

    window.scrollTo(0, 0); // selalu mulai view dari atas
  },

  resetListFilters: function () {
    this.currentSearch = "";
    this.selectedCategory = "all";
    document.getElementById("list-search").value = "";
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.toggle("active", b.dataset.cat === "all"));
  },

  /* ======================= RENDER ======================= */

  /* Filter untuk view Packages: pencarian + kategori. */
  filterData: function (dataset) {
    const q = this.currentSearch;
    return dataset.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q);
      const matchesCategory =
        this.selectedCategory === "all" || p.category === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });
  },

  /* Filter untuk Home: hanya pencarian (tanpa kategori). */
  renderRecent: function () {
    const q = this.currentSearch;
    const filtered = this.data.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q),
    );
    this.renderTable(filtered.slice(0, 5), "recent-table");
  },

  renderPackagesList: function () {
    const filtered = this.filterData(this.data);
    this.renderTable(filtered, "packages-table");
    document
      .getElementById("packages-empty")
      .classList.toggle("hidden", filtered.length > 0);
  },

  renderTable: function (packages, tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";

    if (packages.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="table-empty">No data.</td></tr>';
      return;
    }

    packages.forEach((pkg) => {
      const tr = document.createElement("tr");
      tr.dataset.pkg = pkg.name; // dipakai oleh event delegation klik
      tr.innerHTML = `
                <td><a class="pkg-name" href="#package/${encodeURIComponent(pkg.name)}">${escapeHtml(pkg.name)}</a></td>
                <td><span class="pkg-ver">${escapeHtml(pkg.version || "N/A")}</span></td>
                <td class="col-cat"><span class="pkg-cat">${escapeHtml(pkg.category || "unknown")}</span></td>
                <td class="pkg-desc">${escapeHtml(pkg.description || "No description")}</td>`;
      tbody.appendChild(tr);
    });
    // CATATAN aksesibilitas: nama paket sengaja dibungkus <a> (bukan cuma
    // onclick di <tr>) agar bisa dinavigasi keyboard / screen reader.
  },

  /* Struktur folder repo: <category>/<name>. Edit fungsi ini bila berubah. */
  buildPkgPath: function (pkg) {
    return pkg.category ? `${pkg.category}/${pkg.name}` : pkg.name;
  },

  buildFolderUrl: function (pkg) {
    // encodeURIComponent per-segment agar karakter spesial aman di URL
    const segments = this.buildPkgPath(pkg).split("/").map(encodeURIComponent);
    return `${this.urls.tree}/${segments.join("/")}`;
  },

  renderDetail: function (name) {
    const pkg = this.data.find((p) => p.name === name);
    const view = document.getElementById("view-detail");
    const content = document.getElementById("detail-content");

    // Judul tab mengikuti paket yang dibuka
    document.title = `${name} · VUR`;

    if (!pkg) {
      // FIX (XSS): name berasal dari URL hash — WAJIB di-escape sebelum
      // masuk innerHTML (dulu bisa disisipi HTML lewat hash).
      content.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-package" aria-hidden="true"></i>
                    <h2 class="mt-4">Package Not Found</h2>
                    <p>Package "${escapeHtml(name)}" is not in the index.</p>
                    <button class="btn btn-primary mt-4" data-action="back" type="button">Return</button>
                </div>`;
      view.classList.remove("hidden");
      return;
    }

    const folderUrl = this.buildFolderUrl(pkg);
    // Ikon brand menyesuaikan provider repo (GitHub/GitLab)
    const repoIcon =
      REPO_CONFIG.provider === "gitlab" ? "ph-gitlab-logo" : "ph-github-logo";

    const installCmd = [
      `git clone ${this.urls.web}`,
      `cd ${REPO_CONFIG.repo}/${this.buildPkgPath(pkg)}`,
      `./xbps-src pkg ${pkg.name}`,
    ].join("\n");

    // ON GOING: instruksi Let-X (opsi kedua, belum final)
    const letxCmd = [
      `letx get ${pkg.name}`,
      `letx pkg ${pkg.name}`,
      `letx install ${pkg.name}`,
    ].join("\n");

    content.innerHTML = `
            <div class="detail-header">
                <div class="detail-title">
                    <h1>${escapeHtml(pkg.name)}</h1>
                    <div class="detail-meta">
                        <span class="pkg-cat">${escapeHtml(pkg.category || "unknown")}</span>
                        <span class="meta-item"><i class="ph ph-tag" aria-hidden="true"></i> Version: <strong>${escapeHtml(pkg.version || "N/A")}</strong></span>
                        <span class="meta-item"><i class="ph ph-user" aria-hidden="true"></i> Maintainer: <strong>${escapeHtml(pkg.maintainer || "Unknown")}</strong></span>
                    </div>
                </div>
                <div class="detail-actions">
                    <a href="${folderUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
                        <i class="ph ${repoIcon}" aria-hidden="true"></i> Source Folder
                    </a>
                </div>
            </div>

            <div class="detail-section">
                <h2>Description</h2>
                <p class="detail-desc">${escapeHtml(pkg.description || "No description available")}</p>
            </div>

            <div class="detail-section">
                <h2>Installation Instructions</h2>
                <p class="install-note">Option 1 — build the package from source using xbps-src.</p>
                <div class="code-block">
                    <button class="copy-btn" data-action="copy" type="button">
                        <i class="ph ph-copy" aria-hidden="true"></i> Copy
                    </button>
                    <pre><code>${escapeHtml(installCmd)}</code></pre>
                </div>
                <p class="install-note mt-4">Option 2 — build the package using Let-X (ON GOING).</p>
                <div class="code-block">
                    <button class="copy-btn" data-action="copy" type="button">
                        <i class="ph ph-copy" aria-hidden="true"></i> Copy
                    </button>
                    <pre><code>${escapeHtml(letxCmd)}</code></pre>
                </div>
            </div>
        `;

    view.classList.remove("hidden");
  },

  /* ======================= ERROR & CLIPBOARD ======================= */

  renderLoadError: function () {
    document.getElementById("view-loading").innerHTML = `
            <div class="load-error">
                <i class="ph ph-warning-circle" aria-hidden="true"></i>
                <p class="mt-4">Failed to load package index.</p>
                <p class="mb-4">Pastikan file berikut dapat diakses:<br>
                    <code>${escapeHtml(this.urls.raw)}</code>
                </p>
                <button class="btn btn-primary mt-4" data-action="reload" type="button">Coba Lagi</button>
            </div>`;
  },

  copyToClipboard: function (btn) {
    // Teks diambil dari <pre> tepat setelah tombol (struktur .code-block)
    const code = btn.nextElementSibling ? btn.nextElementSibling.innerText : "";
    const showSuccess = () => {
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i> Copied!';
      btn.classList.add("copy-btn--done");
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.classList.remove("copy-btn--done");
      }, 2000);
    };

    // FIX: Clipboard API hanya tersedia di secure context (HTTPS/localhost)
    // — sediakan fallback untuk lingkungan lain.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(code)
        .then(showSuccess)
        .catch(() => this.legacyCopy(code, showSuccess));
    } else {
      this.legacyCopy(code, showSuccess);
    }
  },

  /* Fallback salin untuk browser lama / konteks non-HTTPS. */
  legacyCopy: function (text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (err) {
      console.warn("[VUR] Copy ke clipboard gagal:", err);
    }
    document.body.removeChild(ta);
  },
};

// Jalankan aplikasi
document.addEventListener("DOMContentLoaded", () => app.init());

// Diekspos global HANYA untuk memudahkan debugging dari console (opsional).
window.app = app;
