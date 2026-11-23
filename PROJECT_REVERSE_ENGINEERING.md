# YourVault — Dokumentasi Reverse Engineering

> **Cakupan dan cara membaca:** dokumen ini merekam implementasi yang tersedia di working tree saat audit statis dilakukan. Temuan dibedakan antara perilaku yang tampak langsung di kode dan perilaku yang **belum diverifikasi saat runtime**. Tidak ada source code yang diubah. Saat audit, `index.html`, `script.js`, dan `style.css` sudah memiliki perubahan lokal; perubahan tersebut dibiarkan utuh. Dokumentasi ini membahas versi file yang sedang ada, bukan menjamin kesesuaian dengan versi yang pernah dipublikasikan.

## 1. Ringkasan sistem

YourVault/Krisna's Vault adalah aplikasi pencatatan keuangan pribadi client-side, berupa satu halaman HTML tanpa framework aplikasi. JavaScript mengelola state dan membangun ulang konten DOM; penyimpanan utama berada di `localStorage`, dengan opsi salin/sinkronisasi ke GitHub Gist. Chart.js digunakan untuk grafik, sedangkan jsPDF dan plugin AutoTable menyusun laporan PDF. PWA dasar disediakan melalui web app manifest dan service worker.

Fitur inti yang tampak di implementasi: login/penguncian UI, dashboard transaksi dan ringkasan, filter periode, planner anggaran, tagihan berulang, sasaran tabungan, wishlist pembelian, analitik, pengelolaan kategori, impor/ekspor, sinkronisasi Gist, pengisian transaksi berbasis teks/AI, input suara, tema gelap/terang, dan layout mobile.

Nama produk tidak konsisten: README menyebut **YourVault**, sedangkan judul HTML, manifest, nama file PDF, dan beberapa label memakai **Krisna's Vault**. Istilah “AI Insight” pada dashboard bukan panggilan model AI; insight tersebut dihitung dengan aturan lokal deterministik.

## 2. Inventaris file dan dependensi

| File/aset | Tanggung jawab yang teramati |
|---|---|
| `index.html` | Dokumen tunggal aplikasi, shell login, navigasi, seluruh tampilan modul, form, tabel, chart canvas, modal/toast, pemuatan CDN dan script aplikasi. |
| `style.css` | Variabel tema, komponen visual, layout desktop/mobile, animasi, tabel, formulir, modal, chart, dan beberapa aturan filter. |
| `script.js` | State, localStorage/Gist, filter waktu, utilitas, chart, render tampilan, login, CRUD, interaksi, backup/restore, CSV, dan parser Gemini beserta fallback lokal. |
| `voice.js` | Integrasi Web Speech API, parser NLP lokal tambahan, pemanggilan parser `SmartAI`, modal quick-log dinamis, serta speed dial untuk layar kecil. |
| `report.js` | Pengumpulan/filter transaksi dan pembuatan laporan PDF, termasuk KPI, grafik, insight, dan tabel ledger. |
| `manifest.json` | Metadata PWA: nama, start URL, standalone display, warna, orientasi portrait, dan ikon. |
| `sw.js` | Cache aset statis, pembersihan cache versi lama, dan kebijakan fetch cache-first dengan pengecualian request GitHub. |
| `README.md` | Ringkasan fitur/teknologi/struktur proyek; beberapa klaimnya lebih luas daripada implementasi aktual. |
| `LICENSE` | MIT License. |
| `assets/icon-192.png`, `assets/icon-512.png` | Ikon PWA. |
| `assets/krisna.png` | Foto profil yang digunakan di sidebar/header dan speed dial; HTML/JS memakai avatar eksternal sebagai fallback bila gambar gagal dimuat. |

Tidak ditemukan `package.json`, lockfile, bundler, dependency manager, konfigurasi test, atau file backend pada daftar root yang diperiksa. Aplikasi memuat library melalui CDN dan berjalan sebagai script browser klasik, bukan modul ES. Tidak ada proses build atau server API milik proyek yang dapat diidentifikasi dari file tersebut.

### Dependensi runtime yang dirujuk

| Dependensi/API | Cara pemakaian |
|---|---|
| Chart.js (`cdn.jsdelivr.net`, tanpa versi eksplisit di URL) | Grafik dashboard, tren analytics, breakdown kategori, dan grafik sementara untuk PDF. |
| jsPDF 2.5.1 (cdnjs) | Membuat dokumen PDF A4 di browser. |
| jsPDF-AutoTable 3.8.2 (cdnjs) | Tabel ledger transaksi pada PDF. |
| Google Fonts: Inter dan Poppins | Typography utama. |
| Google Material Icons Round | Ikon UI. |
| Google Gemini API, model `gemini-1.5-flash` | Parser transaksi teks/ucapan dengan request `generateContent`. |
| GitHub Gist REST API | Membaca dan memperbarui file `vault_data.json` pada Gist yang dikonfigurasi. |
| Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`) | Speech-to-text berbahasa Indonesia. |
| Browser APIs | `localStorage`, `fetch`, `FileReader`, `Blob`, URL object URL, `Intl.NumberFormat`, `MutationObserver`, Service Worker, `btoa`, dan DOM events. |

Ketersediaan CDN, dukungan API, izin microphone, CORS, kuota, serta kecocokan versi browser **tidak diverifikasi dengan menjalankan aplikasi**.

## 3. Arsitektur teknis dan aliran kontrol

### 3.1 Bentuk aplikasi

1. Browser memuat `index.html`, stylesheet, dan library pihak ketiga.
2. Script klasik dimuat berurutan: `script.js`, `voice.js`, `report.js`. `script.js` mendaftarkan handler DOMContentLoaded; parser `SmartAI` diekspos sebagai `window.SmartAI` agar bisa dipanggil dari `voice.js`.
3. Pengguna masuk melalui layar login. Setelah kredensial cocok, `AppState.init()` membaca data lokal dan mencoba memuat Gist, kemudian aplikasi menampilkan shell utama dan memanggil fungsi render.
4. Navigasi menukar kelas `active` pada section dan link; tidak ada router framework atau navigasi server.
5. Form/event handler mengubah objek `AppState.data`; renderers memperbarui DOM, kemudian `AppState.save()` menyimpan snapshot ke localStorage dan, jika konfigurasi lengkap, mengantrekannya untuk dikirim ke Gist.

State dan helper utama didefinisikan di dalam callback DOMContentLoaded `script.js`; sebagian diekspos ke `window` (`AppState`, `Util`, `Filter`, `Charts`, `Render`). `voice.js` dan `report.js` adalah integrasi script global dan juga membaca DOM/localStorage secara langsung. Pola ini membuat komponen saling terikat pada ID elemen, urutan pemuatan, dan bentuk data global.

### 3.2 Struktur data

Root object yang diinisialisasi:

```text
{
  transactions: [],
  categories: {
    income: ["Salary", "Bonus", "Business", "Investment", "Other"],
    expense: ["Rent", "Utility", "Food", "Transport", "Family",
              "Shodaqoh", "Savings", "Investment", "Shopping",
              "Dating", "Coffe", "Other"]
  },
  savings: [],
  wishlist: [],
  subscriptions: [],
  budgets: {}
}
```

`script.js` menyimpan root ini pada key localStorage `yourVaultEnterpriseV6`, bersama `lastUpdated` yang ditambahkan saat menyimpan.

| Entitas | Properti yang dibuat/digunakan |
|---|---|
| Transaksi | `id`, `date` (`YYYY-MM-DD`), `timestamp`, `type` (`income`/`expense`), `category`, `amount`, `note`; `linkedSavId` opsional untuk transaksi setoran savings. |
| Budget | Object `budgets`, key berupa nama kategori expense dan value nominal target. |
| Savings goal | `id`, `name`, `target`, `current`. |
| Wishlist | `id`, `name`, `price`, `link`, `status` (`pending`/`bought`). |
| Subscription | `id`, `name`, `price`, `cycle` (`monthly`/`yearly`), `active`. |
| Kategori | Dua array string di `categories.income` dan `categories.expense`. |

ID dibuat dengan gabungan prefix, `Date.now()`, dan angka acak sampai tiga digit; ini bukan mekanisme jaminan keunikan kriptografis. Nominal umumnya dikonversi dengan `Number()`. Tidak ada validasi schema/version migration menyeluruh untuk tiap record setelah parsing JSON.

### 3.3 Modul JavaScript

- **AppState:** inisialisasi, normalisasi beberapa koleksi root, local recovery copy, resolusi data cloud-vs-local berdasarkan `lastUpdated`, save lokal, antrean write cloud berurutan.
- **Util:** escape HTML sederhana, format IDR/USD, tanggal lokal, tanggal tampilan, dan ID.
- **ColorHelper:** palet untuk kategori; setelah palet habis menghasilkan warna HSL acak dan menyimpan warna dalam memori tab.
- **Filter:** mode payday, monthly, dan range; pencocokan tanggal dan teks periode.
- **UI:** toast, modal konfirmasi, helper format nominal di form.
- **Charts:** chart dashboard dan analytics serta penyimpanan instance agar chart lama dapat dihancurkan sebelum digambar ulang.
- **Render:** populasi dropdown, tabel transaksi, dashboard, budget, subscriptions, savings, wishlist, analytics, settings, dan insight.
- **Form/event handlers:** login, navigasi, tema, filter, CRUD, tindakan table, backup/restore, pengaturan cloud.
- **SmartAI:** request Gemini, prompt Bahasa Indonesia, fallback sederhana lokal, mapping kategori, dan pengisian field.
- **voice.js:** parser NLP berbasis aturan yang lebih kaya, speech recognition, modal quick log, dan speed dial mobile.
- **report.js:** filter serta agregasi terpisah dari `Filter`/`Render` utama dan generasi PDF.

## 4. Inventaris fitur dan workflow

### 4.1 Login, lock, dan navigasi

- Login memiliki input username/password, kontrol show/hide password, pesan error, dan tombol Unlock Vault.
- `script.js` membandingkan hasil Base64 dari input dengan konstanta yang tertanam di script. Kecocokan memicu inisialisasi state; proses inisialisasi error dicatat ke console tetapi blok `finally` tetap membuka aplikasi.
- Lock Vault meminta konfirmasi dan reload halaman. Tidak ada logout server atau penghapusan data lokal.
- Sidebar desktop memiliki tautan Dashboard, Planner, Subscriptions, Savings, Wishlist, Analytics, Settings. Pada layar kecil sidebar diubah CSS menjadi bottom navigation.
- Navigasi menukar section aktif; saat masuk analytics/dashboard/planner renderer terkait dipanggil ulang dengan jeda singkat.

### 4.2 Dashboard dan transaksi

- Kartu ringkasan menampilkan Net Worth, Fiat Balance, Filtered Income, dan Filtered Expense.
- “Net Worth” dan “Fiat Balance” dihitung sama: income dikurangi expense hanya untuk tanggal yang lolos filter aktif. Ini bukan neraca aset/liabilitas atau saldo kumulatif semua waktu sebagaimana label dan tooltip dapat menyiratkan.
- Cashflow Trend adalah bar chart pemasukan/pengeluaran per tanggal/bulan/tahun bergantung mode filter; Expense Breakdown adalah doughnut kategori.
- Financial Insight menghitung aturan lokal: periode kosong, defisit jika expense melebihi income, surplus dengan savings rate >=20%, atau kondisi “fair”. Ini bukan keluaran Gemini.
- Quick Log menerima tanggal, tipe, kategori, nominal, catatan opsional. Save memvalidasi nominal positif dan kategori cocok dengan tipe, menambah transaksi dengan ID/timestamp, menyimpan state, menggambar ulang, lalu mempertahankan tanggal/tipe/kategori untuk input berikutnya.
- Riwayat Fiat Transactions difilter oleh Time Machine, bisa disortir berdasarkan date/type/category/amount melalui header, dan bisa menghapus transaksi dengan dialog konfirmasi. Tidak ada form edit transaksi yang tampak.
- Pencatatan cepat teks AI dan tombol microphone juga tersedia; workflow detailnya dijelaskan di bagian AI/Voice.

### 4.3 Planner / budget

- Pengguna menetapkan batas nominal per kategori expense; kategori dan target disimpan pada `budgets[category]`, sehingga menyimpan target kategori yang sama mengganti nilai sebelumnya.
- Renderer menjumlah expense pada periode filter untuk masing-masing kategori, membandingkannya dengan target, menampilkan persentase/progress bar, mewarnai kondisi lewat target merah, dan menghitung total actual/target.
- Hapus target menghapus key budget kategori.
- Target disimpan per kategori saja, tanpa kunci bulan atau periode. Label UI menyebut monthly target, tetapi aktual yang ditampilkan mengikuti filter global, sedangkan target yang sama tetap dipakai di semua pilihan periode.
- Fungsi `budgetSidePanel()` mencari `ana-category-budget` dan panel/canvas terkait. Elemen tersebut tidak tampak di HTML yang diperiksa; akibatnya panel statistik/grafik tambahan untuk Planner tidak dapat dipastikan muncul pada DOM versi ini.

### 4.4 Subscriptions

- Form membuat tagihan dengan nama, harga, siklus bulanan/tahunan; record baru aktif secara default.
- Estimasi monthly cost: harga tahunan dibagi 12, harga bulanan dipakai langsung; hanya subscriptions aktif dihitung ke total bulanan.
- Pengguna bisa pause/resume dan delete; ringkasan menampilkan jumlah active/paused.
- PAY NOW meminta konfirmasi lalu membuat transaksi expense tanggal hari ini dengan kategori `Utility` dan catatan `Auto-Pay Bill: ...`; filter tahun/bulan disetel ke bulan sekarang dan tampilan dirender ulang.
- Tidak ada mekanisme auto-debit, jadwal jatuh tempo, histori pembayaran, atau penciptaan transaksi otomatis berulang yang tampak. Pembayaran adalah tindakan manual.

### 4.5 Savings

- Goal baru berisi nama, target, `current: 0`.
- Add Funds meminta nominal positif, menaikkan `current`, sekaligus mencatat transaksi expense kategori `Other` untuk hari ini dengan `linkedSavId`.
- Menghapus goal meminta konfirmasi. Jika ada dana, aplikasi membuat transaksi income kategori `Other` dengan catatan refund lalu menghapus goal.
- Menghapus transaksi deposit yang memiliki `linkedSavId` mengurangi nilai `current` goal terkait, dibatasi minimum nol.
- Progress dibatasi 100% di bar, tetapi nilai saldo `current` dapat melampaui target. Nilai target nol pada record impor tidak dicegah oleh renderer dan dapat menghasilkan perhitungan persentase tidak valid.
- Setoran tabungan diperlakukan sebagai expense dalam arus kas dan refund sebagai income; implikasi akuntansi ini perlu dipertimbangkan saat menafsirkan analytics.

### 4.6 Wishlist

- Form menyimpan nama item, estimasi harga, URL opsional, status `pending`.
- Total pending mengecualikan item yang sudah berstatus bought.
- `MARK BOUGHT` membuat expense kategori `Shopping` tanggal hari ini dengan catatan `Wishlist: ...`, menandai item bought, dan mengarahkan filter year/month ke periode saat ini.
- Item dapat dihapus. Link ditampilkan di tab baru; tidak ada pemeriksaan domain/keamanan URL tambahan yang terlihat selain validasi browser input `type=url`.

### 4.7 Analytics

- Mengikuti filter global dan menghitung total serta jumlah transaksi income/expense, net cashflow, savings rate, dan rata-rata net per period aktif.
- Menampilkan tren income-vs-expense, tren kategori terpilih, tabel performance per hari/bulan, dan expense breakdown.
- Grafik kategori menggunakan agregasi harian untuk payday/range/bulan terpilih dan agregasi bulanan untuk tampilan tahunan/all-time. Rata-rata kategori adalah total dibagi jumlah bucket yang memiliki transaksi, bukan jumlah semua hari kalender/bulan dalam rentang.
- Savings rate = `(income - expense) / income * 100`; bila income nol ditampilkan 0%.
- Nilai net per periode pada tabel memakai tanda plus untuk nilai non-negatif; chart dibuat Chart.js dengan responsive dan tooltip nominal IDR.

### 4.8 Settings dan manajemen kategori

- Kategori income/expense dapat ditambah jika belum ada (duplikasi dicek melalui exact string) dan dihapus selama masih tersisa setidaknya satu kategori.
- Menghapus kategori expense juga menghapus budget dengan nama yang sama. Tidak terlihat migrasi/pengubahan kategori pada transaksi historis.
- Settings menyediakan export JSON, import JSON, reset seluruh record, serta pengaturan token dan Gist ID.
- Reset meminta pengguna mengetik `WIPE`, mengganti state dengan default, menyimpan, lalu reload.
- Import JSON memvalidasi bahwa root berupa object dan koleksi tertentu berupa array; transaksi juga menerima alias kapital `Transactions`. Data koleksi yang masuk **digabung** dengan data yang ada, bukan mengganti semuanya; budget digabung key-wise, kategori impor mengganti kategori saat tersedia. Tidak ada deduplikasi record.
- Import membentuk object baru dari subset field, lalu menyimpan `lastUpdated` lewat `save()`. Validasi mendalam atas setiap transaksi/savings/wishlist/subscription tidak terlihat.

### 4.9 Ekspor CSV dan PDF

- CSV hanya mengekspor transaksi yang cocok dengan filter aktif. Header: Date, Type, Category, Amount, Note. Nama file berbentuk `YourVault_Trx_<periode>_<tanggal>.csv`.
- CSV meng-escape tanda kutip dan newline pada `note`, tetapi field category/note tidak seluruhnya dikutip secara konsisten; comma/karakter khusus pada category dapat mengubah kolom. Tidak ada byte BOM yang tampak.
- PDF membangun laporan A4 dengan header, label periode, total record, enam KPI (income, expense, net, average income/expense per transaksi, savings rate), dua grafik, executive summary, dan ledger AutoTable. File memakai pola nama `Krisnas_Vault_<periode>.pdf`.
- `report.js` mengagregasi transaksi secara mandiri dan memiliki filter mode `range` atau perlakuan monthly/year. Implementasi itu tidak memahami mode `payday` sebagai mode terpisah.
- `report.js` menghapus option filter yang teksnya mengandung “siklus”/“25”/cycle. Sementara `script.js` menambahkan option payday dan menjadikannya default. Dampak akhirnya bergantung urutan event dan browser; konsistensi mode yang dipilih, tampilan filter, dashboard, CSV, dan PDF tidak dapat dipastikan tanpa runtime test.

### 4.10 GitHub Gist Sync

- Pengaturan menyimpan Personal Access Token dan Gist ID di localStorage dengan key `vault_gh_token` dan `vault_gh_gist_id`.
- Saat inisialisasi, aplikasi mencoba GET `https://api.github.com/gists/{gistId}` dengan Authorization token, membaca `vault_data.json`, dan parse JSON. Jika local dan cloud tersedia, timestamp `lastUpdated` lebih baru dipilih; local yang lebih baru kemudian diunggah.
- Save memperbarui localStorage lebih dulu lalu PATCH endpoint Gist untuk mengganti isi `vault_data.json`. Snapshot cloud diserialisasi dengan indentasi; request diserialkan melalui promise queue agar write berjalan sesuai urutan pemanggilan.
- Error GET/PATCH dicatat ke console; kegagalan Gist tidak menghapus data lokal. Respons GET yang gagal/invalid menghasilkan fallback ke data lokal/default.
- Tidak ada mekanisme conflict merge per record, enkripsi sebelum upload, pengelolaan revision/Gist history, atau beberapa profil akun yang tampak.

## 5. UI/UX dan sistem visual

### 5.1 Tema, warna, typography

- `body` mulai dengan `data-theme="dark"`. CSS menyediakan light dan dark tokens; toggle mengubah atribut tersebut, tetapi kode yang diperiksa tidak menyimpan pilihan tema ke localStorage.
- Light palette: latar `#F3F6FB`, surface putih, elevated `#F8FAFD`, teks `#142033`, muted slate, aksen biru (`#0369A1`), hijau, merah, amber, ungu.
- Dark palette: latar `#0B1220`, surface `#121C2B`, elevated `#192638`, teks `#E5EDF7`, muted `#94A3B8`, aksen sky `#38BDF8`, hijau `#22C55E`, danger `#F87171`, warning `#FBBF24`, ungu `#A78BFA`.
- Typography isi memakai Inter; heading/brand memakai Poppins. Font dan icon font berasal dari Google Fonts.
- Radius utama 18px/13px/9px, shadow berlapis, gradient permukaan dan radial glow pada body. Card/panel memakai gradient, border tipis dan hover lift. Efek blur diterapkan pada beberapa elemen (header/sidebar/toast), namun banyak panel secara eksplisit menghilangkan blur.

### 5.2 Layout dan komponen

- Desktop: sidebar tetap dalam alur kiri, lebar dasar 280px; main content fleksibel, maksimum konten/header sekitar 1400px, padding 24px/30px. Header sticky berisi judul/tanggal, filter waktu dan kontrol ekspor/tema.
- Dashboard berurutan: insight banner, empat stat card, chart grid (cashflow 2 bagian vs breakdown 1 bagian), quick log, ledger.
- Planner menggunakan dua panel: form budget dan real-vs-target. Subscriptions, savings, wishlist memakai panel/form dan tabel. Analytics memakai empat kartu KPI, dua grafik tren, summary table, donut. Settings memuat kategori, backup/reset, dan cloud config.
- Komponen umum: panel/card, stat card, badge income/expense/active/paused, progress bar, form control, modal confirm, toast, tabel sortable, speed dial.
- Ikon utama adalah Material Icons Round. Chart.js memakai warna income hijau, expense merah/amber, dengan doughnut dan line/bar charts.
- Animasi: section fade-in, toast slide-in/fade-out, pulse pada status microphone/loading, spinner AI, hover lift, progress bar transition, modal scale, dan speed-dial stagger.
- Ada beberapa inline style yang cukup dominan di HTML dan HTML string JavaScript; desain tidak sepenuhnya terpusat di stylesheet.

### 5.3 Responsif

- **Desktop (>768px):** sidebar vertikal, filter berupa kapsul horizontal, kontrol ekspor CSV/PDF dan tema di hover-menu/avatar. Chart grid memakai kolom 2:1, lalu satu kolom sampai 1024px.
- **Tablet (769–1024px):** masih menggunakan pola desktop/sidebar; `.grid-chart` menjadi satu kolom di bawah atau sama dengan 1024px. Grid 2/3/4 lain memakai auto-fit/min-width.
- **Mobile (<=768px):** body menjadi block, sidebar berubah menjadi fixed bottom navigation 72px dengan safe-area padding; brand/footer disembunyikan; konten memiliki ruang bawah untuk navigasi. Header sticky ditata vertikal, filter menjadi grid, stat grid dua kolom, panel/grid ditumpuk, tabel dapat digulir horizontal dan tabel menetapkan minimum width. Chart diberi batas tinggi lebih kecil.
- **Android:** tidak ada cabang deteksi Android khusus yang tampak. Perilaku Android memakai breakpoint mobile umum; `voice.js` menambahkan speed dial/profile hub pada semua viewport <=768px, dan Web Speech API memerlukan secure context (HTTPS/localhost).
- Speed dial mobile mengubah FAB menjadi foto profil dengan badge plus lalu membuka aksi Quick Log, CSV, PDF, tema. Posisi/action dikelola lewat pencarian elemen fixed dan event listener capture. Penerapan pada berbagai ukuran/varian browser **belum diverifikasi visual**.
- CSS memakai fitur modern seperti `:has()`, `color-mix()`, `dvh`, `env(safe-area-inset-bottom)`, dan `overflow: clip`; fallback kompatibilitas lintas browser tidak tampak untuk semua fitur tersebut.

## 6. AI, NLP, dan sistem suara

### 6.1 SmartAI di `script.js`

- `SmartAI.parse(text)` membentuk prompt Bahasa Indonesia berisi tanggal hari ini/kemarin/dua hari lalu, daftar kategori aktif, instruksi JSON, contoh, dan input pengguna.
- Request dikirim ke Gemini `gemini-1.5-flash:generateContent` dengan JSON response MIME type dan temperature 0.1. Respons diparse menjadi tanggal ISO, tipe income atau expense, amount numerik, category, dan note.
- Jika network/API/JSON gagal, parser lokal dipakai. Fallback lokal mengerti kemarin/kemarin lusa, tanggal Indonesia tertentu, beberapa pola angka+unit dan angka terbilang terbatas, deteksi kata income, serta keyword kategori statis.
- Fallback lokal ini jauh lebih sempit daripada contoh dan cakupan NLP `voice.js`; banyak kata bilangan/ungkapan dan kategori khusus tidak ditangani konsisten. Nominal yang gagal dikenali dapat bernilai 0.
- Key Gemini ditanam langsung di source JavaScript (nilainya sengaja tidak disalin ke dokumen ini). Ini bukan penyimpanan rahasia; seluruh pengguna browser dapat membaca/menggunakan key tersebut. Input transaksi juga dikirim ke layanan Google saat parser cloud dipakai.
- Jalur handler tidak sepenuhnya tunggal: klik tombol AI di markup dapat ditangani oleh listener `script.js` (delegasi di `body`) dan listener `voice.js` (langsung pada tombol). Jalur `voice.js` juga memanggil parser lalu membuka modal, sedangkan jalur `script.js` memakai pilihan scope berdasarkan parameter `source`. Hal ini berpotensi memicu parsing ganda/race; dampak aktual **perlu verifikasi runtime**. Modal voice memakai ID `voice-*`/`modal-ai-*`, sedangkan `SmartAI.processInput()` lebih dulu mencari sejumlah ID `add-*` lalu menggunakan fallback selector generik.

### 6.2 NLP tambahan di `voice.js`

- NLP lokal tambahan mengurai angka/unit (misalnya ribu/juta/k), beberapa angka terbilang dan satuan, tanggal relatif/berformat Indonesia, tipe transaksi, keyword-to-category, serta catatan otomatis.
- Kategori dibaca dinamis dari daftar Settings, lalu parser memetakan kata kunci ke kategori yang tersedia. Jika Gemini tersedia, `parseSmartAI()` tetap meminta hasil Gemini; hanya hasil dengan amount > 0 yang dipilih, lalu kategorinya dipadankan dengan kategori aktif. Jika tidak, NLP lokal dipakai.
- SmartAI di `script.js` sendiri sudah mengembalikan fallback lokal saat API gagal, sehingga jalur `voice.js` dapat menerima hasil fallback tersebut lebih dulu; fallback NLP lokal `voice.js` terutama menjadi fallback saat hasil AI/fallback itu tidak memiliki nominal positif.
- Teks yang masuk ke prompt Gemini disisipkan langsung di dalam tanda kutip, tanpa escaping prompt yang terlihat. Ketepatan hasil tanggal, nominal, kategori, catatan dan ketahanan terhadap input ambigu **tidak diukur**.

### 6.3 Web Speech API dan quick-log

- Mencari `window.SpeechRecognition` atau `window.webkitSpeechRecognition`, mengatur `lang = 'id-ID'`, `continuous = false`, `interimResults = false`.
- Secure context diperiksa sebelum akses microphone. Jika API tidak didukung atau konteks tidak aman, kode menampilkan alert.
- Event `onstart` mengubah ikon/tombol dan status; `onresult` mengambil transcript pertama; `onerror` menampilkan status izin/no-speech/error; `onend` mereset tampilan.
- Dashboard AI text/voice memproses input dan membuka modal konfirmasi dengan field tanggal, tipe, kategori, amount, note. Pengguna dapat memperbaiki hasil sebelum save. Save modal mengisi form utama lalu mengirim event submit.
- FAB desktop membuka modal. Mobile memunculkan speed dial. Modal juga menyediakan AI text dan microphone langsung.
- Dukungan microphone, hasil speech recognition, izin perangkat, dan browser Android/Desktop tertentu **tidak diuji**; Web Speech API tidak dijamin berjalan offline dan implementasi tidak menyediakan speech-to-text lokal.

## 7. Data, persistensi, dan formula

### 7.1 Penyimpanan

- Semua record bisnis berada pada satu JSON object di localStorage; pengaturan GitHub token/Gist ID adalah key terpisah.
- localStorage bersifat per origin dan per browser profile, tidak terenkripsi oleh kode aplikasi. Menutup/reload tidak menghapus data.
- Tidak ada IndexedDB/backend/database relational, sinkronisasi otomatis multi-user, atau mekanisme recovery selain salinan localStorage dan export JSON.
- `AppState.init()` memvalidasi root object dan memastikan tipe beberapa koleksi/objek, tetapi tidak memvalidasi semua field atau migrasi antar versi storage key.
- Banyak handler memanggil `AppState.save()` tanpa `await`; persistensi localStorage sinkron, namun penyelesaian upload cloud dapat berlangsung setelah renderer/toast berjalan.

### 7.2 CRUD dan kalkulasi

- **Create:** transaksi, budget, subscriptions, savings goals, wishlist, kategori. Tindakan turunan juga menciptakan transaksi pada pembayaran subscription, setoran savings, pembelian wishlist, refund penghapusan savings.
- **Read:** renderer membaca `AppState.data` dan menerapkan `Filter.isMatch()` pada transaksi/analytics/budget.
- **Update:** budget kategori menimpa nilai; subscription toggle active; savings menambah current; wishlist berubah pending ke bought; tema/filter berubah di UI. Tidak ada transaksi edit umum.
- **Delete:** transaksi, budget, savings, wishlist, subscription, kategori dengan perilaku kompensasi khusus di atas.
- IDR diformat dengan `Intl.NumberFormat('id-ID', {currency:'IDR', minimumFractionDigits:0})`.
- Net cashflow = total income - total expense. Savings rate = net cashflow / income × 100 bila income > 0; jika income 0 maka 0.
- Subscription monthly estimate = price/12 untuk yearly dan price untuk monthly.
- Progress tabungan = min(current/target × 100, 100); tidak ada batas maksimum kontribusi.
- Budget % = actual filtered expense / target × 100; progress bar dibatasi 100%, label persentase tidak dibatasi.
- Average subscription/budget analytics menggunakan hanya koleksi/period yang ditentukan logika masing-masing; angka tersebut bukan proyeksi atau akuntansi double-entry.

### 7.3 Filter Time Machine

- HTML awal mendefinisikan `monthly` dan `range`. Script menambahkan `payday` (“Siklus Gajian 25–25”) lalu langsung memilihnya sebagai default.
- **Payday:** bila tanggal sekarang >=25, rentang tanggal 25 bulan ini sampai 25 bulan berikutnya; selain itu 25 bulan sebelumnya sampai 25 bulan ini. Pencocokan string tanggal memakai `>= start && <= end`, jadi kedua batas inklusif.
- **Range:** kedua tanggal inklusif; salah satu sisi kosong menjadi batas terbuka; kedua sisi kosong berarti semua tanggal. Range terbalik tidak divalidasi dan biasanya tidak menghasilkan record.
- **Monthly/year:** All Time pada year mengabaikan bulan; tahun terpilih dengan all month memilih tahun tersebut; selain itu memakai prefix `YYYY-MM`.
- Tahun dropdown dibangun dari tahun sekarang dan data transaksi. Pilih year All Time mengunci bulan ke `all`.
- Ringkasan dashboard, ledger, budget, analytics, CSV memakai `Filter`; PDF memiliki implementasi filter sendiri dan hanya mengenal range/monthly.
- Periode payday memiliki ujung awal dan akhir yang sama-sama inklusif; tanggal 25 dapat masuk ke dua siklus berturutan menurut formula tersebut. Ini bukan interpretasi yang diuji dengan acceptance test.

## 8. PWA/offline dan interaksi eksternal

- Manifest memakai `display: standalone`, `start_url: ./index.html`, orientation `portrait`, warna background `#0f172a`, theme `#4f46e5`, ikon 192/512.
- Service worker didaftarkan saat window load. Cache bernama `vault-cache-v7`; daftar precache meliputi root/index, stylesheet berquery `v=0.4`, `script.js?v=103`, manifest, ikon 192, dan foto profil. Aktivasi menghapus cache dengan nama lain.
- Fetch GitHub dibiarkan lewat jaringan tanpa strategi cache; request lain memakai cache-first dengan `ignoreSearch: true`, lalu fetch jika miss.
- HTML memuat `script.js?v=1116`, sedangkan precache merujuk `script.js?v=103`. Karena lookup cache memakai `ignoreSearch: true`, perbedaan query tidak otomatis membuat cache miss; sebaliknya, cache dapat menyajikan resource dengan query lama untuk request baru. `voice.js`, `report.js`, dan ikon 512 tidak ada dalam daftar precache.
- Maka klaim “offline storage” hanya benar untuk data lokal, bukan bukti aplikasi lengkap dapat dibuka dan seluruh fitur bekerja offline. Perilaku cache browser terhadap URL eksternal/CDN dan hasil setelah instalasi **belum diuji**.
- Gemini tidak dikecualikan eksplisit seperti GitHub. Service worker melakukan cache lookup lalu `fetch()` pada miss; kode tidak menunjukkan API proxy/backend.

## 9. Potensi masalah, batasan, dan technical debt

Daftar berikut adalah temuan statis/risiko pengembangan, bukan pernyataan bahwa semuanya telah direproduksi:

1. **Login bukan batas keamanan.** Kredensial pembanding berada di script client dalam bentuk Base64 yang dapat dibalik; aplikasi hanya menyembunyikan UI sebelum login dan tidak mengunci data localStorage. Lock melakukan reload saja.
2. **Klaim enkripsi tidak didukung implementasi.** Teks di layar login menyatakan data dienkripsi, tetapi tidak ditemukan Web Crypto atau enkripsi data sebelum localStorage/Gist.
3. **Secret API di client.** Gemini key tertanam di `script.js`; Gist PAT disimpan plaintext di localStorage. Token dan data finansial dapat diakses melalui JavaScript/browser profile yang sama. Key tidak disertakan dalam dokumen ini.
4. **Transaksi finansial pribadi dikirim ke Gemini.** Pengguna tidak diberi consent/privacy disclosure khusus pada jalur parser yang terlihat; detail ini perlu dipertimbangkan untuk privasi.
5. **Status filter payday saling bertentangan.** Markup memulai monthly, `script.js` menyisipkan/memilih payday, CSS dan report.js memiliki penyesuaian/cleanup terpisah; PDF tidak menerapkan payday. Potensi export/report mismatch.
6. **Klaim dashboard net worth terlalu kuat.** Implementasi `dash-networth` dan `dash-balance` memakai net transaksi yang terfilter, bukan total aset atau saldo fiat kumulatif.
7. **Offline belum menyeluruh.** Asset cache tidak mencakup voice/report dan query script berbeda; CDN, chart, PDF, font, AI, Gist dan Web Speech dapat memerlukan jaringan/dukungan browser.
8. **Parser terduplikasi dan tidak seragam.** `SmartAI` dan NLP lokal `voice.js` memiliki kemampuan dan daftar kategori berbeda. Input nominal yang tidak terurai dapat membuat draft bernilai nol atau jatuh ke hasil parser lain.
9. **Potensi mismatch DOM parser.** Target selector `SmartAI.processInput` tidak seluruhnya cocok dengan ID markup/modal dinamis `voice.js`; perlu browser test untuk memastikan input dari masing-masing tombol mengisi form yang benar.
10. **Impor dapat menduplikasi data.** Restore menambahkan koleksi ke state yang ada tanpa deduplikasi dan validasi per record; impor berulang berpotensi menghasilkan duplikat/record malformed.
11. **Validasi domain terbatas.** Tidak terlihat constraint tanggal/nominal/schema konsisten untuk semua data yang diimpor; date range terbalik dan target savings nol tidak ditangani khusus.
12. **Akuntansi savings tidak netral.** Deposit dicatat sebagai expense `Other`; refund penghapusan goal sebagai income `Other`. Ini mengubah cashflow dan savings rate.
13. **CSV kurang tahan terhadap input delimiter.** Category/note tidak dikutip/di-escape secara konsisten untuk koma/quote; file dapat terbaca dengan kolom bergeser pada data tertentu.
14. **Render HTML campuran.** Beberapa input yang di-escape dengan `escapeHTML`, sementara kategori, budget key, category dropdown, catatan dari sejumlah alur, dan tautan wishlist dirender via template string. Perlu kebijakan escaping konsisten.
15. **Asynchronous error visibility tidak seragam.** Error Gist dicatat console, beberapa operasi storage/save dipanggil tanpa await, dan startup tetap membuka UI setelah init gagal. Pengguna dapat melihat UI sukses walau cloud belum tersinkron.
16. **Model konflik cloud sederhana.** Hanya timestamp root menentukan local-vs-cloud; tidak ada merge, revision check, atau kontrol overwrite lintas perangkat.
17. **Tidak ada edit transaksi atau histori audit.** Kesalahan catatan/nominal hanya dapat diatasi dengan delete dan input ulang; tindakan kompensasi juga menambah record baru.
18. **ID bukan UUID.** Timestamp + random kecil berisiko tabrakan, terutama saat import, perangkat berbeda, atau transaksi sangat berdekatan.
19. **Ketergantungan global dan selector fragile.** Script klasik saling bergantung pada urutan, global window, ID hard-coded, `:has()`, dan pencarian elemen fixed; pemeliharaan/refactor berisiko regresi.
20. **Accessibility belum lengkap.** Ada label, aria-label, status region, dan role dialog pada elemen tertentu, tetapi FAB berupa `div` dengan onclick, tabel sortable memakai onclick pada `th`, fokus modal/trap/escape tidak tampak, serta sebagian konten status menggunakan `innerHTML`.
21. **Tema tidak dipersistenkan dan chart palette sebagian acak.** Tema kembali ke HTML default sesudah reload; kategori di luar palet diberi warna acak untuk sesi.
22. **Tidak tampak test/build pipeline.** Tanpa package manifest atau test runner, regresi pada hitungan, parser, import/export, filter, dan responsivitas tidak dapat dicegah secara otomatis dari struktur yang diperiksa.

### Arah pengembangan yang sejalan dengan masalah di atas

- Pindahkan credential/integrasi cloud ke backend atau gunakan mekanisme token yang dibatasi dan dikelola secara aman; rotasi key client yang sudah pernah dipublikasikan perlu dipertimbangkan.
- Hapus klaim enkripsi yang tidak ada atau rancang enkripsi Web Crypto dengan model kunci yang terdokumentasi; pisahkan login UI dari autentikasi nyata.
- Jadikan satu modul filter sumber kebenaran untuk dashboard, CSV, dan PDF; uji kasus tanggal batas, range kosong/terbalik, serta siklus 25.
- Tetapkan schema dan versi data, validasi setiap record, strategi deduplikasi, serta migrasi storage.
- Pisahkan parser lokal/cloud dan pastikan hasil selalu memerlukan review pengguna sebelum commit transaksi; beri pilihan consent untuk mengirim teks finansial ke layanan eksternal.
- Definisikan model ledger untuk savings transfer agar perhitungan cashflow tidak menganggap pemindahan dana sebagai konsumsi.
- Tambahkan test otomatis untuk formula dan parser serta smoke test visual desktop/mobile/offline, kemudian lengkapi aksesibilitas keyboard/fokus.

## 10. Hal yang belum dapat diverifikasi

- Perilaku runtime aktual, layout piksel, animasi, dan breakpoint lintas browser/Android karena tidak dilakukan browser test.
- Apakah API Gemini key aktif/valid, kuota/model tersedia, respons sesuai bentuk yang diasumsikan, dan CORS/network policy mengizinkan request.
- Apakah token GitHub memiliki scope yang sesuai, Gist tersedia, dan konflik dua perangkat menghasilkan data yang diinginkan.
- Dukungan Web Speech API dan secure context pada perangkat pengguna.
- Keberhasilan instalasi PWA, cache pada browser tertentu, dan kemampuan membuka semua screen saat offline.
- Isi/keamanan file gambar dan kualitas visual ikon tidak dianalisis melalui rendering.
- Semantik UI/UX yang dikehendaki pemilik untuk istilah “Net Worth”, “monthly budget”, setoran tabungan, dan tanggal batas payday.
- Tidak ada test atau benchmark yang dijalankan; dokumentasi ini adalah reverse engineering statis berdasarkan file saat audit.

## 11. Referensi implementasi

- Markup, ID, urutan script, dan fitur UI: `index.html`
- Tema, komponen, breakpoint, dan animasi: `style.css`
- State, filter, formula, render, CRUD, sync, backup, parser: `script.js`
- Speech recognition, NLP tambahan, modal/dial: `voice.js`
- Agregasi laporan dan PDF: `report.js`
- Metadata PWA: `manifest.json`
- Instalasi, aktivasi, cache, fetch: `sw.js`
- Klaim produk/teknologi: `README.md` (gunakan dengan membandingkan temuan implementasi di atas)
