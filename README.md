# YourVault — Personal Finance & AI Cashflow Tracker

**YourVault** adalah aplikasi web manajemen keuangan pribadi (*personal finance tracker*) berbasis *client-side* dengan antarmuka modern bergaya *glassmorphism*. Aplikasi ini dilengkapi asisten pencatatan transaksi berbasis **AI & Suara (Bahasa Indonesia)**, visualisasi arus kas interaktif, filter periode fleksibel (*Time Machine*), serta sinkronisasi cadangan data melalui **GitHub Gist**.

---

## Fitur Utama

### 1. Smart AI & Voice Quick-Log (Bahasa Indonesia)
Catat pemasukan maupun pengeluaran cukup dengan mengetik atau mengucapkan kalimat sehari-hari—tanpa perlu mengisi formulir satu per satu:
* **Ditenagai Google Gemini (`gemini-1.5-flash`) & Offline Fallback:** Otomatis mengekstrak tanggal (termasuk kata relatif seperti *hari ini*, *kemarin*, *kemarin lusa*), tipe transaksi (*Income/Expense*), kategori, nominal angka maupun terbilang (*"25ribu"*, *"tiga ratus ribu"*, *"satu juta"*), serta ringkasan catatan transaksi.
* **Voice Recognition:** Mendukung input suara langsung melalui **Web Speech API** pada perangkat desktop maupun Android.
* **Mode Offline Siaga:** Jika koneksi internet terputus atau API Key belum diatur, sistem otomatis beralih ke *local parser* bawaan sehingga pencatatan tetap berjalan lancar.

### 2. Dashboard Overview & Financial AI Insight
* **Kartu Ringkasan Real-Time:** Memantau *Total Net Worth*, *Fiat Balance*, *Filtered Income*, dan *Filtered Expense* dalam satu layar.
* **Financial AI Insight:** Memberikan peringatan otomatis (*Deficit Alert* / *Surplus Insight*) berdasarkan perbandingan pemasukan dan pengeluaran pada periode yang sedang dipilih.
* **Visualisasi Grafik Interaktif (Chart.js):** Menampilkan grafik batang *Cashflow Trend* dan diagram *Expense Breakdown* per kategori.

### 3. Time Machine Filter
Filter seluruh metrik, grafik, dan riwayat transaksi dengan dua mode tampilan:
* **Month & Year:** Menampilkan data berdasarkan tahun dan bulan tertentu (atau *All Time* / *All Months*).
* **Period:** Memilih rentang tanggal awal dan akhir secara spesifik (`dd/mm/yyyy - dd/mm/yyyy`).

### 4. Modul Perencanaan Keuangan Terpadu
* **Dashboard:** Ringkasan arus kas harian dan pencatatan cepat (*Quick Log*).
* **Planner:** Pengaturan anggaran (*budgeting*) bulanan per kategori pengeluaran.
* **Subscriptions:** Pelacakan tagihan dan langganan rutin berkala.
* **Savings:** Pemantauan target tabungan dan dana simpanan.
* **Wishlist:** Daftar rencana pembelian barang/kebutuhan beserta estimasi biayanya.
* **Analytics:** Analisis mendalam tren pemasukan, pengeluaran, dan distribusi kategori.
* **Settings:** Pengaturan sinkronisasi cloud, ekspor/impor data, dan manajemen sistem.

### 5. Cloud Sync, Ekspor & Manajemen Data
* **GitHub Gist Cloud Sync:** Sinkronisasi database keuangan pribadi langsung ke *Private Gist* milik Anda menggunakan Personal Access Token.
* **Ekspor & Impor Data:** Unduh riwayat transaksi terfilter ke format **CSV** (`YourVault_Trx_*.csv`), cetak laporan **PDF**, atau cadangkan seluruh database ke format **JSON** (`YourVault_Backup_*.json`).
* **Danger Zone:** Fitur reset total (*Wipe System Records*) dengan konfirmasi keamanan berlapis.

### 6. Desain Responsif (Desktop & Mobile/Android)
* Mendukung **Dark Mode** dan **Light Mode**.
* Tampilan adaptif dengan *sidebar* navigasi di layar Desktop serta *bottom navigation bar* dan tombol aksi cepat melayang (*floating quick-log*) di perangkat mobile/Android.

---

## Teknologi yang Digunakan

* **Struktur & Tampilan:** HTML5, CSS3 (Custom Properties, Flexbox/Grid, Glassmorphism UI)
* **Logika Aplikasi:** Vanilla JavaScript (ES6+)
* **Visualisasi Data:** [Chart.js](https://www.chartjs.org/)
* **AI & Pemrosesan Bahasa:** Google Gemini API (`gemini-1.5-flash`) & Custom Indonesian NLP Fallback
* **Input Suara:** Web Speech API (`SpeechRecognition`)
* **Penyimpanan & Sinkronisasi:** Browser `localStorage` & GitHub Gist REST API

---

## Struktur Proyek

```text
├── index.html      # Struktur utama antarmuka, navigasi, halaman modul, dan modal
├── style.css       # Desain glassmorphism, tema gelap/terang, dan layout responsif
├── script.js       # State management, render UI, grafik, filter, backup, & SmartAI parser
├── voice.js        # Integrasi Web Speech API untuk input transaksi berbasis suara
└── README.md       # Dokumentasi proyek
