/**
 * VUR Application Logic
 */
const app = {
    data: [],
    currentSearch: '',
    selectedCategory: 'all',
    
    // Konfigurasi URL
    urls: {
        index: 'https://raw.githubusercontent.com/T4n-Labs/vur/main/packages.json',
        repoBase: 'https://github.com/T4n-Labs/vur',
        treeBase: 'https://github.com/T4n-Labs/vur/tree/main'
    },

    // Inisialisasi Aplikasi
    init: async function() {
        // Event Listeners untuk Navigasi
        window.addEventListener('hashchange', () => this.router());
        
        // Event Listeners untuk Pencarian
        const homeSearch = document.getElementById('home-search');
        const listSearch = document.getElementById('list-search');
        
        homeSearch.addEventListener('input', (e) => {
            this.currentSearch = e.target.value.toLowerCase();
            this.renderRecent();
        });

        listSearch.addEventListener('input', (e) => {
            this.currentSearch = e.target.value.toLowerCase();
            this.renderPackagesList();
        });

        // Event Listeners untuk Filter Kategori
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedCategory = e.target.getAttribute('data-cat');
                this.renderPackagesList();
            });
        });

        // Ambil Data Awal
        try {
            const response = await fetch(this.urls.index);
            if (!response.ok) throw new Error('Gagal mengambil data');
            this.data = await response.json();
            
            // Update Statistik
            document.getElementById('stat-total').textContent = this.data.length;
            document.getElementById('stat-recent').textContent = Math.min(5, this.data.length);
            
            this.renderRecent();
            this.router();
        } catch (error) {
            console.error(error);
            document.getElementById('view-loading').innerHTML = `
                <div style="color: #ff6b6b;">
                    <i class="ph ph-warning-circle" style="font-size: 3rem;"></i>
                    <p class="mt-4">Gagal memuat indeks paket.</p>
                    <button class="btn btn-primary mt-4" onclick="location.reload()">Coba Lagi</button>
                </div>
            `;
        }
    },

    // Router Sederhana berbasis Hash
    router: function() {
        document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));

        const hash = window.location.hash;
        const loadingView = document.getElementById('view-loading');

        if (this.data.length === 0 && !hash.startsWith('#package')) {
            loadingView.classList.remove('hidden');
            return;
        } else {
            loadingView.classList.add('hidden');
        }

        if (hash === '' || hash === '#home') {
            document.getElementById('view-home').classList.remove('hidden');
            document.getElementById('nav-home').classList.add('active');
        } 
        else if (hash === '#packages') {
            document.getElementById('view-packages').classList.remove('hidden');
            document.getElementById('nav-packages').classList.add('active');
            this.currentSearch = ''; 
            this.selectedCategory = 'all';
            document.getElementById('list-search').value = '';
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-cat="all"]').classList.add('active');
            
            this.renderPackagesList();
        } 
        else if (hash.startsWith('#package/')) {
            const pkgName = hash.split('/')[1];
            this.renderDetail(pkgName);
        }
    },

    // Logika Pencarian
    filterData: function(dataset) {
        return dataset.filter(pkg => {
            const matchesSearch = 
                pkg.name.toLowerCase().includes(this.currentSearch) ||
                (pkg.description && pkg.description.toLowerCase().includes(this.currentSearch)) ||
                (pkg.category && pkg.category.toLowerCase().includes(this.currentSearch));

            const matchesCategory = 
                this.selectedCategory === 'all' || pkg.category === this.selectedCategory;

            return matchesSearch && matchesCategory;
        });
    },

    renderRecent: function() {
        const filtered = this.data.filter(pkg => {
             const q = this.currentSearch;
             return pkg.name.toLowerCase().includes(q) || 
                    (pkg.description && pkg.description.toLowerCase().includes(q));
        });
        this.renderTable(filtered.slice(0, 5), 'recent-table');
    },

    renderPackagesList: function() {
        const filtered = this.filterData(this.data);
        this.renderTable(filtered, 'packages-table');
        
        const emptyState = document.getElementById('packages-empty');
        if (filtered.length === 0) emptyState.classList.remove('hidden');
        else emptyState.classList.add('hidden');
    },

    // Render Tabel Paket
    renderTable: function(packages, tableId) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        tbody.innerHTML = '';

        if (packages.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Tidak ada data.</td></tr>`;
            return;
        }

        packages.forEach(pkg => {
            const tr = document.createElement('tr');
            tr.onclick = () => window.location.hash = `package/${pkg.name}`;
            
            tr.innerHTML = `
                <td><span class="pkg-name">${pkg.name}</span></td>
                <td><span class="pkg-ver">${pkg.version || 'N/A'}</span></td>
                <td><span class="pkg-cat">${pkg.category || 'unknown'}</span></td>
                <td style="color: var(--text-muted);">${pkg.description || 'Tidak ada deskripsi'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    // Render Halaman Detail Paket
    renderDetail: function(name) {
        const pkg = this.data.find(p => p.name === name);
        const view = document.getElementById('view-detail');
        const content = document.getElementById('detail-content');

        if (!pkg) {
            content.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-package" style="font-size: 3rem; color: var(--text-muted);"></i>
                    <h2 class="mt-4">Paket Tidak Ditemukan</h2>
                    <p>Paket "${name}" tidak ada dalam indeks.</p>
                    <button class="btn btn-primary mt-4" onclick="window.location.hash='packages'">Kembali</button>
                </div>
            `;
            view.classList.remove('hidden');
            return;
        }

        const catNamePath = pkg.category ? `${pkg.category}/${pkg.name}` : pkg.name;
        const folderUrl = `${this.urls.treeBase}/${catNamePath}`;
        const installCmd = `git clone ${this.urls.repoBase}\ncd vur/${catNamePath}\n./xbps-src pkg`;

        const versionDisplay = pkg.version || 'N/A';
        const descDisplay = pkg.description || 'Tidak ada deskripsi tersedia';
        const maintainerDisplay = pkg.maintainer || 'Tidak diketahui';

        content.innerHTML = `
            <div class="detail-header">
                <div class="detail-title">
                    <h1>${pkg.name}</h1>
                    <div class="detail-meta">
                        <span class="pkg-cat">${pkg.category || 'unknown'}</span>
                        <span class="meta-item"><i class="ph ph-tag"></i> Versi: <strong style="color: var(--text)">${versionDisplay}</strong></span>
                        <span class="meta-item"><i class="ph ph-user"></i> Maintainer: <strong style="color: var(--text)">${maintainerDisplay}</strong></span>
                    </div>
                </div>
                <div class="detail-actions">
                    <a href="${folderUrl}" target="_blank" class="btn btn-outline">
                        <i class="ph ph-github-logo"></i> Folder Sumber
                    </a>
                </div>
            </div>

            <div class="detail-section">
                <h2>Deskripsi</h2>
                <p style="font-size: 1.1rem;">${descDisplay}</p>
            </div>

            <div class="detail-section">
                <h2>Instruksi Instalasi</h2>
                <p class="mb-4" style="color: var(--text-muted); font-size: 0.9rem;">
                    Bangun paket dari sumber menggunakan xbps-src.
                </p>
                <div class="code-block">
                    <button class="copy-btn" onclick="app.copyToClipboard(this)">
                        <i class="ph ph-copy"></i> Salin
                    </button>
                    <pre><code>${installCmd}</code></pre>
                </div>
            </div>
        `;

        view.classList.remove('hidden');
    },

    // Utilitas Salin ke Clipboard
    copyToClipboard: function(btn) {
        const code = btn.nextElementSibling.innerText;
        navigator.clipboard.writeText(code).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<i class="ph ph-check"></i> Tersalin!`;
            btn.style.color = 'var(--primary)';
            btn.style.borderColor = 'var(--primary)';
            
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style.color = '';
                btn.style.borderColor = '';
            }, 2000);
        });
    }
};

// Jalankan Aplikasi
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
