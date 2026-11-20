// File: voice.js (Unified Voice & Smart AI Parser + Floating '+' Quick Log Shortcut)
window.addEventListener('load', function() {
    const btnVoice = document.getElementById("btn-voice-tx") || document.getElementById("dash-btn-voice-tx");
    const voiceFeedback = document.getElementById("voice-feedback") || document.getElementById("dash-voice-feedback");
    const aiTextInput = document.getElementById("ai-text-input") || document.getElementById("dash-ai-text-input");
    const btnAiTextSubmit = document.getElementById("btn-ai-text-submit") || document.getElementById("dash-btn-ai-process");

    // --- 1. SINKRONISASI KATEGORI LIVE DARI SYSTEM SETTINGS ---
    function getDynamicCategories(type) {
        const containerId = type === 'expense' ? 'list-cat-expense' : 'list-cat-income';
        const container = document.getElementById(containerId);
        let cats = [];

        if (container) {
            Array.from(container.children).forEach(child => {
                const clone = child.cloneNode(true);
                clone.querySelectorAll('.material-icons-round').forEach(i => i.remove());
                const text = clone.textContent.trim();
                if (text) cats.push(text);
            });
        }

        if (cats.length === 0) {
            const mainSelect = document.getElementById('add-category') || document.getElementById('dash-add-category');
            if (mainSelect) cats = Array.from(mainSelect.options).map(o => o.value);
        }

        return cats.length > 0 ? cats : ["Other"];
    }

    // Helper: Tanggal relatif (YYYY-MM-DD)
    function getOffsetDate(daysOffset = 0) {
        const d = new Date();
        d.setDate(d.getDate() + daysOffset);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Helper: Konversi angka terbilang Bahasa Indonesia ("satu juta", "tiga ratus ribu", "25ribu", dll.)
    function parseIndonesianAmount(textLower) {
        // 1. Cek pola angka + satuan (contoh: "23 ribu", "25ribu", "1,5 juta", "50k", "rp 35.000")
        const digitMatch = textLower.match(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(ribu|rb|k|juta|jt|m)?\b/i);
        if (digitMatch) {
            let rawStr = digitMatch[1];
            const unit = (digitMatch[2] || '').toLowerCase();

            // Jika format ribuan pakai titik seperti 50.000 tanpa satuan
            if (!unit && /^\d{1,3}(\.\d{3})+$/.test(rawStr)) {
                return parseInt(rawStr.replace(/\./g, ''), 10);
            }

            let num = parseFloat(rawStr.replace(/\./g, '').replace(',', '.'));
            if (['ribu', 'rb', 'k'].includes(unit)) num *= 1000;
            else if (['juta', 'jt', 'm'].includes(unit)) num *= 1000000;
            if (!isNaN(num) && num > 0) return Math.round(num);
        }

        // 2. Cek pola angka terbilang penuh (contoh: "satu juta", "tiga ratus ribu", "dua puluh lima ribu")
        const wordNums = {
            'se': 1, 'satu': 1, 'dua': 2, 'tiga': 3, 'empat': 4, 'lima': 5,
            'enam': 6, 'tujuh': 7, 'delapan': 8, 'sembilan': 9, 'sepuluh': 10,
            'sebelas': 11, 'setengah': 0.5
        };

        let total = 0;
        let current = 0;
        let foundWordNumber = false;

        // Tangani awalan "se-" seperti "seribu", "seratus", "sejuta"
        const normalizedWords = textLower
            .replace(/\bsejuta\b/g, 'satu juta')
            .replace(/\bseratus\b/g, 'satu ratus')
            .replace(/\bseribu\b/g, 'satu ribu')
            .split(/[\s,.-]+/);

        for (const w of normalizedWords) {
            if (wordNums[w] !== undefined) {
                current += wordNums[w];
                foundWordNumber = true;
            } else if (w === 'belas') {
                current = (current || 1) + 10;
                foundWordNumber = true;
            } else if (w === 'puluh') {
                current = (current || 1) * 10;
                foundWordNumber = true;
            } else if (w === 'ratus') {
                current = (current || 1) * 100;
                foundWordNumber = true;
            } else if (w === 'ribu' || w === 'rb') {
                total += (current || 1) * 1000;
                current = 0;
                foundWordNumber = true;
            } else if (w === 'juta' || w === 'jt') {
                total += (current || 1) * 1000000;
                current = 0;
                foundWordNumber = true;
            }
        }
        total += current;
        return foundWordNumber && total > 0 ? Math.round(total) : "";
    }

    // Helper: Ekstrak tanggal dari ucapan ("Tanggal 25 agusust 2025", "kemarin", "kemarin lusa")
    function parseIndonesianDate(textLower) {
        if (textLower.includes('kemarin lusa') || textLower.includes('2 hari lalu')) {
            return getOffsetDate(-2);
        }
        if (textLower.includes('kemarin')) {
            return getOffsetDate(-1);
        }

        const months = {
            'januari': '01', 'jan': '01',
            'februari': '02', 'pebruari': '02', 'feb': '02',
            'maret': '03', 'mar': '03',
            'april': '04', 'apr': '04',
            'mei': '05',
            'juni': '06', 'jun': '06',
            'juli': '07', 'jul': '07',
            'agustus': '08', 'agusust': '08', 'agust': '08', 'agu': '08', 'ags': '08',
            'september': '09', 'sep': '09', 'sept': '09',
            'oktober': '10', 'okt': '10',
            'november': '11', 'nopember': '11', 'nov': '11',
            'desember': '12', 'des': '12'
        };

        const datePattern = /(?:tanggal\s+)?(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/i;
        const match = textLower.match(datePattern);
        if (match && months[match[2]]) {
            const day = match[1].padStart(2, '0');
            const month = months[match[2]];
            const year = match[3] || String(new Date().getFullYear());
            return `${year}-${month}-${day}`;
        }

        return document.getElementById("add-date")?.value || document.getElementById("dash-add-date")?.value || getOffsetDate(0);
    }

    // Helper: Ekstrak catatan/deskripsi otomatis (DIJAMIN TIDAK PERNAH KOSONG)
    function extractAutoNote(originalText, category) {
        // 1. Jika pengguna secara eksplisit menyebut kata "catatan ..." atau "note ..."
        const explicitNote = originalText.match(/(?:catatan|note)\s+(.+)/i);
        if (explicitNote && explicitNote[1].trim()) {
            const raw = explicitNote[1].trim();
            return raw.charAt(0).toUpperCase() + raw.slice(1);
        }

        // 2. Bersihkan frasa tanggal, kata pengantar pembelian, dan nominal uang
        let cleaned = originalText
            .replace(/^(?:pada\s+)?(?:tanggal\s+)?\d{1,2}\s+[a-z]+(?:\s+\d{4})?\s*/i, '')
            .replace(/^(?:kemarin\s+lusa|kemarin|tadi\s+pagi|tadi\s+siang|tadi\s+malam|tadi|barusan|hari\s+ini)\s*/i, '')
            .replace(/\b(?:saya|aku|gue|gw|mau|habis|baru\s+saja|barusan|sudah|udah|telah)\b/gi, ' ')
            .replace(/\b(?:membeli|beli|membayar|bayar|pesan|pesen|order|belanja)\b/gi, ' ')
            .replace(/\b(?:dengan\s+harga|seharga|harganya|harga|sebesar|senilai|total|rp\.?|rupiah)\b/gi, ' ')
            .replace(/\b\d+(?:[.,]\d+)?\s*(?:ribu|rb|k|juta|jt|m)?\b/gi, ' ')
            .replace(/\b(?:sejuta|seribu|seratus|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|juta|setengah)\b/gi, ' ')
            .replace(/\bminjem\b/gi, 'pinjem')
            .replace(/[,.;:!?]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Normalisasi spesifik sesuai kebiasaan transaksi pengguna
        cleaned = cleaned
            .replace(/\bdi\s+family\s*mart\b/gi, 'familymart')
            .replace(/\bfamily\s*mart\b/gi, 'familymart')
            .replace(/^(?:di|ke|untuk|buat)\s+/i, '')
            .trim();

        if (!cleaned || cleaned.length < 2) {
            return `${category} Transaction`;
        }

        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // --- 2. MESIN NLP LOKAL PINTAR (DILATIH DARI HISTORI TRANSAKSI) ---
    function parseNLPData(text) {
        const textLower = text.toLowerCase();
        const amount = parseIndonesianAmount(textLower);
        const date = parseIndonesianDate(textLower);
        let type = "expense";

        if (textLower.match(/\b(gaji|gajian|terima|dapat|masuk|bonus|thr|income|pemasukan)\b/)) {
            type = "income";
        }

        const activeCats = getDynamicCategories(type);
        let category = activeCats[0];

        // Pemetaan kata kunci sesuai histori transaksi Anda
        const keywordMap = [
            { words: ['kopi', 'coffe', 'coffee', 'ksk', 'family mart', 'familymart', 'fm', 'barokah coffe', 'kafe'], cat: 'Coffe' },
            { words: ['ayam', 'nasi', 'makan', 'minum', 'roti', 'jajan', 'soto', 'bakso', 'gofood', 'shopeefood', 'rujak', 'bebek', 'gacoan', 'seblak', 'kebab', 'sempol', 'mie', 'sarapan', 'alfagift', 'katsu'], cat: 'Food' },
            { words: ['parfum', 'perfuem', 'liquid', 'coil', 'rokok', 'marlong', 'buff', 'manset', 'belanja', 'baju', 'sepatu', 'tas', 'indomaret', 'alfamart', 'alfamidi', 'pasar', 'shopee', 'tokopedia', 'domain'], cat: 'Shopping' },
            { words: ['wa nana', 'nana', 'minjem', 'pinjem', 'keluarga', 'ibu', 'bapak', 'ortu', 'adik', 'adek', 'syifa', 'tf ibu', 'transfer bapak'], cat: 'Family' },
            { words: ['bensin', 'gojek', 'gocar', 'grab', 'indrive', 'in drive', 'ojol', 'gosend', 'parkir', 'tol', 'angkot', 'kereta', 'pesawat', 'ongkos'], cat: 'Transport' },
            { words: ['kos', 'kosan', 'kost', 'kontrakan', 'sewa', 'listrik', 'token'], cat: 'Rent' },
            { words: ['laundry', 'galon', 'cukur', 'obat', 'sembako', 'wifi', 'air', 'pdam', 'pulsa', 'kuota', 'paket data', 'netflix', 'youtube'], cat: 'Utility' },
            { words: ['pacar', 'nonton', 'kencan', 'bioskop', 'shamrock', 'lodging', 'richeese', 'sour sally', 'ruka', 'fieris'], cat: 'Dating' },
            { words: ['sedekah', 'shodaqoh', 'zakat', 'infaq', 'amal', 'donasi', 'kerja bhakti'], cat: 'Other' },
            { words: ['saham', 'investasi', 'reksadana', 'crypto'], cat: 'Investment' },
            { words: ['nabung', 'tabungan', 'simpan'], cat: 'Savings' },
            { words: ['bonus', 'thr'], cat: 'Bonus' },
            { words: ['gaji', 'gajian'], cat: 'Salary' }
        ];

        const exactMatch = activeCats.find(c => textLower.includes(c.toLowerCase()));
        if (exactMatch) {
            category = exactMatch;
        } else {
            for (const entry of keywordMap) {
                if (entry.words.some(kw => textLower.includes(kw))) {
                    const foundInSettings = activeCats.find(c => c.toLowerCase() === entry.cat.toLowerCase());
                    if (foundInSettings) {
                        category = foundInSettings;
                        break;
                    }
                }
            }
        }

        const note = extractAutoNote(text, category);
        return { amount, type, category, date, note };
    }

    // --- 2B. HYBRID AI PARSER (GEMINI AI + INSTANT LOCAL FALLBACK) ---
    async function parseSmartAI(text) {
        const localResult = parseNLPData(text);

        // Jika SmartAI di script.js tersedia, gunakan untuk akurasi kontekstual tambahan
        if (typeof SmartAI !== 'undefined' && typeof SmartAI.parse === 'function') {
            try {
                const aiResult = await SmartAI.parse(text);
                if (aiResult && aiResult.amount > 0) {
                    const activeCats = getDynamicCategories(aiResult.type || localResult.type);
                    const matchedCat = activeCats.find(c => c.toLowerCase() === (aiResult.category || '').toLowerCase()) || localResult.category;
                    const finalNote = (aiResult.note && aiResult.note.trim() && aiResult.note.trim() !== '-')
                        ? aiResult.note.trim()
                        : localResult.note;

                    return {
                        date: aiResult.date || localResult.date,
                        type: aiResult.type || localResult.type,
                        category: matchedCat,
                        amount: aiResult.amount || localResult.amount,
                        note: finalNote
                    };
                }
            } catch (e) {
                console.warn("Fallback ke NLP lokal:", e);
            }
        }

        return localResult;
    }

    // --- 3. HELPER SPEECH RECOGNITION REUSABLE ---
    function startSpeechRecognition(onResultCallback, statusEl, buttonEl) {
        if (!window.isSecureContext) {
            alert("Microphone access blocked! Please use localhost or HTTPS.");
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Web Speech API not supported. Please use Chrome/Edge.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'id-ID';

        recognition.onstart = () => {
            if (buttonEl) {
                buttonEl.classList.add("mic-active");
                buttonEl.innerHTML = '<span class="material-icons-round" style="font-size: 20px; color: #ef4444;">stop</span>';
            }
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "var(--info)";
                statusEl.innerHTML = '<span class="material-icons-round" style="font-size: 16px; vertical-align: middle; animation: pulse 1.5s infinite;">mic</span> Listening... Silakan ucapkan transaksi Anda.';
            }
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (statusEl) {
                statusEl.innerHTML = `<strong>Terdeteksi:</strong> "${transcript}"`;
            }
            onResultCallback(transcript);
        };

        recognition.onerror = (event) => {
            const errorMsg = event.error === 'not-allowed'
                ? "Izin mikrofon ditolak."
                : (event.error === 'no-speech' ? "Suara tidak terdeteksi." : event.error);
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.innerHTML = `<span style="color:var(--danger)">⚠️ ${errorMsg}</span>`;
                setTimeout(() => { statusEl.style.display = "none"; }, 4000);
            }
        };

        recognition.onend = () => {
            if (buttonEl) {
                buttonEl.classList.remove("mic-active");
                buttonEl.innerHTML = '<span class="material-icons-round" style="font-size: 20px;">mic</span>';
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.warn(e);
        }
    }

    // --- 4. MODAL SHORTCUT QUICK LOG TRANSACTION + AI PARSER (UNTUK TOMBOL '+' & AI BAR) ---
    function openQuickLogModal(prefill = null, isFromAI = false) {
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;

        const defaultDate = prefill?.date || document.getElementById("add-date")?.value || document.getElementById("dash-add-date")?.value || getOffsetDate(0);
        const defaultType = prefill?.type || "expense";
        const defaultAmount = prefill?.amount || "";
        const defaultNote = prefill?.note || "";
        const defaultCategory = prefill?.category || getDynamicCategories(defaultType)[0];

        function renderOptions(selectedType, selectedCat) {
            const cats = getDynamicCategories(selectedType);
            return cats.map(c => `<option value="${c}" ${c.toLowerCase() === (selectedCat || '').toLowerCase() ? 'selected' : ''}>${c}</option>`).join('');
        }

        document.getElementById("modal-title").innerHTML = isFromAI
            ? '<span class="material-icons-round" style="color: var(--primary);">auto_awesome</span> AI Transaction Confirmation'
            : '<span class="material-icons-round" style="color: var(--success);">flash_on</span> Quick Log Transaction';

        document.getElementById("modal-body").innerHTML = `
            <!-- AI Smart Parser di dalam Shortcut Modal -->
            <div class="form-group" style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                <label style="display: flex !important; align-items: center !important; gap: 6px; font-size: 0.82rem; line-height: 1.2; margin-bottom: 6px;">
                    <span class="material-icons-round" style="font-size: 16px; line-height: 1; color: var(--primary); display: inline-flex; align-items: center;">auto_awesome</span>
                    <span>AI Quick Fill (Type or Voice)</span>
                </label>
                <div style="display: flex; flex-direction: row; flex-wrap: nowrap; gap: 8px; align-items: center; width: 100%;">
                    <input type="text" id="modal-ai-input" class="form-control" placeholder="e.g. 'Beli kopi family mart 25rb'..." style="flex: 1 1 auto; min-width: 0; margin: 0; height: 42px;">
                    <button type="button" id="btn-modal-ai-parse" class="btn-primary" style="flex: 0 0 48px; width: 48px; min-width: 48px; max-width: 48px; height: 42px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Parse Text">
                        <span class="material-icons-round" style="font-size: 20px;">auto_awesome</span>
                    </button>
                    <button type="button" id="btn-modal-ai-mic" style="flex: 0 0 48px; width: 48px; min-width: 48px; max-width: 48px; height: 42px; background: var(--bg-body, rgba(255,255,255,0.04)); border: 1px solid var(--border); color: var(--text-main); border-radius: 10px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Voice Input">
                        <span class="material-icons-round" style="font-size: 20px;">mic</span>
                    </button>
                </div>
                <div id="modal-ai-status" style="display: none; font-size: 0.8rem; color: var(--info); margin-top: 6px; font-weight: 600;"></div>
            </div>

            <!-- Form Transaksi Utama -->
            <div class="grid-2" style="margin-bottom: 14px; gap: 12px;">
                <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                    <label style="margin: 0;">Date</label>
                    <input type="date" id="voice-date" class="form-control" value="${defaultDate}" required>
                </div>
                <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                    <label style="margin: 0;">Type</label>
                    <select id="voice-type" class="form-control">
                        <option value="income" ${defaultType === 'income' ? 'selected' : ''}>Income</option>
                        <option value="expense" ${defaultType === 'expense' ? 'selected' : ''}>Expense</option>
                    </select>
                </div>
            </div>

            <div class="grid-2" style="margin-bottom: 14px; gap: 12px;">
                <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                    <label style="margin: 0;">Category</label>
                    <select id="voice-category" class="form-control">
                        ${renderOptions(defaultType, defaultCategory)}
                    </select>
                </div>
                <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                    <label style="margin: 0;">Amount (IDR)</label>
                    <input type="number" id="voice-amount" class="form-control" placeholder="e.g. 50000" value="${defaultAmount}" required>
                </div>
            </div>

            <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
                <label style="margin: 0;">Description (Optional)</label>
                <input type="text" id="voice-note" class="form-control" placeholder="What was this transaction for?" value="${defaultNote}">
            </div>
        `;

        document.getElementById("modal-actions").innerHTML = `
            <button type="button" class="btn-primary" style="background: transparent; border: 1px solid var(--border); color: var(--text-main);" onclick="document.getElementById('modal-container').classList.remove('active')">Cancel</button>
            <button type="button" class="btn-primary" id="btn-confirm-voice">
                <span class="material-icons-round" style="font-size: 18px; vertical-align: middle; margin-right: 4px;">save</span> Save Transaction
            </button>
        `;

        modalContainer.classList.add("active");

        // Helper untuk mengisi seluruh field di dalam modal (termasuk Date & Description)
        async function applyAIParsedToModal(rawText) {
            const statusEl = document.getElementById("modal-ai-status");
            const parseBtn = document.getElementById("btn-modal-ai-parse");
            if (parseBtn) parseBtn.disabled = true;
            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "var(--info)";
                statusEl.innerHTML = "⏳ Memproses transaksi...";
            }

            const parsed = await parseSmartAI(rawText);
            if (parseBtn) parseBtn.disabled = false;

            const dateEl = document.getElementById("voice-date");
            const typeEl = document.getElementById("voice-type");
            const catEl = document.getElementById("voice-category");
            const amtEl = document.getElementById("voice-amount");
            const noteEl = document.getElementById("voice-note");

            if (dateEl && parsed.date) dateEl.value = parsed.date;
            if (typeEl) typeEl.value = parsed.type;
            if (catEl) catEl.innerHTML = renderOptions(parsed.type, parsed.category);
            if (amtEl && parsed.amount) amtEl.value = parsed.amount;
            if (noteEl) {
                noteEl.value = parsed.note || extractAutoNote(rawText, parsed.category);
            }

            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "var(--success, #10b981)";
                statusEl.innerHTML = `✓ Terisi: ${noteEl.value} (${parsed.category})`;
            }
        }

        // Event AI Text di dalam Modal
        const modalAiInput = document.getElementById("modal-ai-input");
        const modalAiBtn = document.getElementById("btn-modal-ai-parse");
        const modalMicBtn = document.getElementById("btn-modal-ai-mic");
        const modalStatus = document.getElementById("modal-ai-status");

        if (modalAiBtn && modalAiInput) {
            modalAiBtn.onclick = async () => {
                if (!modalAiInput.value.trim()) return modalAiInput.focus();
                const txt = modalAiInput.value.trim();
                modalAiInput.value = "";
                await applyAIParsedToModal(txt);
            };
            modalAiInput.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    modalAiBtn.click();
                }
            };
        }

        if (modalMicBtn) {
            modalMicBtn.onclick = () => {
                startSpeechRecognition(async (transcript) => {
                    if (modalAiInput) modalAiInput.value = transcript;
                    await applyAIParsedToModal(transcript);
                    if (modalAiInput) modalAiInput.value = "";
                }, modalStatus, modalMicBtn);
            };
        }

        // Sinkronisasi kategori saat Type diganti manual di modal
        document.getElementById("voice-type").addEventListener("change", function(e) {
            document.getElementById("voice-category").innerHTML = renderOptions(e.target.value, '');
        });

        // Simpan Transaksi (mendukung ID lama #add-* maupun ID baru #dash-add-*)
        document.getElementById("btn-confirm-voice").onclick = () => {
            const finalAmount = document.getElementById("voice-amount").value;
            if (!finalAmount || Number(finalAmount) <= 0) return alert("Please enter a valid amount.");

            const finalType = document.getElementById("voice-type").value;
            const finalCat = document.getElementById("voice-category").value;
            const finalNote = document.getElementById("voice-note").value.trim() || `${finalCat} Transaction`;
            const finalDate = document.getElementById("voice-date").value;

            const amtTarget = document.getElementById("add-amount") || document.getElementById("dash-add-amount");
            const typeTarget = document.getElementById("add-type") || document.getElementById("dash-add-type");
            const catTarget = document.getElementById("add-category") || document.getElementById("dash-add-category");
            const noteTarget = document.getElementById("add-note") || document.getElementById("dash-add-note");
            const dateTarget = document.getElementById("add-date") || document.getElementById("dash-add-date");
            const formTarget = document.getElementById("form-add-tx") || document.getElementById("form-dash-add-tx");

            if (amtTarget) amtTarget.value = finalAmount;
            if (typeTarget) {
                typeTarget.value = finalType;
                typeTarget.dispatchEvent(new Event('change'));
            }
            if (catTarget) catTarget.value = finalCat;
            if (noteTarget) noteTarget.value = finalNote;
            if (dateTarget) dateTarget.value = finalDate;

            if (formTarget) {
                formTarget.dispatchEvent(new Event('submit'));
            }

            modalContainer.classList.remove("active");
            if (noteTarget) noteTarget.value = "";
        };
    }

    // --- 5. HUBUNGKAN AI INPUT & VOICE DI DASHBOARD ---
    async function handleDashboardTextSubmit() {
        if (!aiTextInput) return;
        const rawText = aiTextInput.value.trim();
        if (!rawText) return aiTextInput.focus();
        aiTextInput.value = "";
        const parsed = await parseSmartAI(rawText);
        openQuickLogModal(parsed, true);
    }

    if (btnAiTextSubmit) btnAiTextSubmit.addEventListener("click", handleDashboardTextSubmit);
    if (aiTextInput) {
        aiTextInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleDashboardTextSubmit();
            }
        });
    }

    if (btnVoice) {
        btnVoice.addEventListener("click", () => {
            startSpeechRecognition(async (transcript) => {
                const parsed = await parseSmartAI(transcript);
                openQuickLogModal(parsed, true);
            }, voiceFeedback, btnVoice);
        });
    }

    // --- 6. UNIFIED FLOATING PROFILE + '+' HORIZONTAL SPEED DIAL (ANDROID MODE) ---
    (function setupAndroidHorizontalDial() {
        const styleEl = document.createElement("style");
        styleEl.textContent = `
            @media (max-width: 768px) {
                .vault-fab-profile-hub {
                    padding: 0 !important;
                    overflow: visible !important;
                    border: 2px solid var(--primary, #4f46e5) !important;
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.38) !important;
                    z-index: 9995 !important;
                    transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                }
                .vault-fab-profile-hub.dial-open {
                    transform: scale(1.05) !important;
                }
                .vault-fab-profile-hub .fab-plus-badge {
                    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .vault-fab-profile-hub.dial-open .fab-plus-badge {
                    transform: rotate(45deg);
                    background: #ef4444 !important;
                }
            }

            #vault-side-dial-bar {
                position: fixed;
                display: flex;
                flex-direction: row-reverse;
                align-items: center;
                gap: 10px;
                z-index: 9994;
                pointer-events: none;
            }
            #vault-side-dial-bar.open {
                pointer-events: auto;
            }

            .vsd-circle-btn {
                width: 46px;
                height: 46px;
                border-radius: 50%;
                border: none;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                cursor: pointer;
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.32);
                opacity: 0;
                transform: translateX(36px) scale(0.5);
                transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.24s ease;
            }
            .vsd-circle-btn:active {
                transform: scale(0.9) !important;
            }

            #vault-side-dial-bar.open .vsd-circle-btn {
                opacity: 1;
                transform: translateX(0) scale(1);
            }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(1) { transition-delay: 0.02s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(2) { transition-delay: 0.06s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(3) { transition-delay: 0.10s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(4) { transition-delay: 0.14s; }

            #vault-side-dial-bar:not(.open) .vsd-circle-btn:nth-child(1) { transition-delay: 0.09s; }
            #vault-side-dial-bar:not(.open) .vsd-circle-btn:nth-child(2) { transition-delay: 0.06s; }
            #vault-side-dial-bar:not(.open) .vsd-circle-btn:nth-child(3) { transition-delay: 0.03s; }
            #vault-side-dial-bar:not(.open) .vsd-circle-btn:nth-child(4) { transition-delay: 0s; }

            @media (min-width: 769px) {
                #vault-side-dial-bar {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(styleEl);

        const dialBar = document.createElement("div");
        dialBar.id = "vault-side-dial-bar";
        dialBar.innerHTML = `
            <button type="button" class="vsd-circle-btn" id="vsd-btn-quicklog" style="background: #4f46e5;" title="Quick Log + AI">
                <span class="material-icons-round" style="font-size: 21px;">auto_awesome</span>
            </button>
            <button type="button" class="vsd-circle-btn" id="vsd-btn-csv" style="background: #2563eb;" title="Export CSV">
                <span class="material-icons-round" style="font-size: 21px;">download</span>
            </button>
            <button type="button" class="vsd-circle-btn" id="vsd-btn-pdf" style="background: #ef4444;" title="Export PDF">
                <span class="material-icons-round" style="font-size: 21px;">picture_as_pdf</span>
            </button>
            <button type="button" class="vsd-circle-btn" id="vsd-btn-theme" style="background: #334155; border: 1px solid rgba(255,255,255,0.18);" title="Toggle Dark/Light Mode">
                <span class="material-icons-round" id="vsd-theme-icon" style="font-size: 21px;">light_mode</span>
            </button>
        `;
        document.body.appendChild(dialBar);

        let isDialOpen = false;
        let activeFabEl = null;

        function positionDialBar() {
            if (!activeFabEl || window.innerWidth > 768) return;
            const rect = activeFabEl.getBoundingClientRect();
            const centerY = rect.top + (rect.height / 2) - 23;
            const rightOffset = window.innerWidth - rect.left + 12;
            dialBar.style.top = `${centerY}px`;
            dialBar.style.right = `${rightOffset}px`;
        }

        function setDialState(open) {
            isDialOpen = open;
            positionDialBar();
            const currentThemeIcon = (document.getElementById("theme-icon")?.textContent || "light_mode").trim();
            const vsdThemeIcon = document.getElementById("vsd-theme-icon");
            if (vsdThemeIcon) vsdThemeIcon.textContent = currentThemeIcon;

            if (open) {
                dialBar.classList.add("open");
                if (activeFabEl) activeFabEl.classList.add("dial-open");
            } else {
                dialBar.classList.remove("open");
                if (activeFabEl) activeFabEl.classList.remove("dial-open");
            }
        }

        document.getElementById("vsd-btn-quicklog")?.addEventListener("click", (e) => {
            e.stopPropagation();
            setDialState(false);
            setTimeout(() => openQuickLogModal(null, false), 140);
        });
        document.getElementById("vsd-btn-csv")?.addEventListener("click", (e) => {
            e.stopPropagation();
            setDialState(false);
            document.getElementById("btn-export-csv")?.click();
        });
        document.getElementById("vsd-btn-pdf")?.addEventListener("click", (e) => {
            e.stopPropagation();
            setDialState(false);
            document.getElementById("btn-export-pdf")?.click();
        });
        document.getElementById("vsd-btn-theme")?.addEventListener("click", (e) => {
            e.stopPropagation();
            document.getElementById("btn-theme-toggle")?.click();
            setDialState(false);
        });

        document.addEventListener("click", (e) => {
            if (isDialOpen && !dialBar.contains(e.target) && (!activeFabEl || !activeFabEl.contains(e.target))) {
                setDialState(false);
            }
        });

        function syncFabWithProfile() {
            const candidates = Array.from(document.querySelectorAll("button, a, div"));
            const fab = candidates.find(el => {
                if (el.closest("#modal-container") || el.closest("#vault-side-dial-bar") || el.closest("header")) return false;
                const style = window.getComputedStyle(el);
                const iconTxt = (el.querySelector(".material-icons-round")?.textContent || el.textContent || "").trim();
                return style.position === "fixed" && (iconTxt === "add" || iconTxt === "+");
            });

            if (!fab) return;
            activeFabEl = fab;

            if (window.innerWidth <= 768) {
                if (!fab.dataset.origHtml) fab.dataset.origHtml = fab.innerHTML;
                fab.classList.add("vault-fab-profile-hub");
                fab.innerHTML = `
                    <div style="position: relative; width: 100%; height: 100%; border-radius: 50%;">
                        <img src="assets/krisna.png" alt="Krisna" onerror="this.src='https://ui-avatars.com/api/?name=Krisna&background=4f46e5&color=fff'" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">
                        <span class="fab-plus-badge" style="position: absolute; bottom: -2px; right: -2px; width: 20px; height: 20px; border-radius: 50%; background: var(--primary, #4f46e5); color: #fff; border: 2px solid var(--bg-card, #0b0f19); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
                            <span class="material-icons-round" style="font-size: 14px; font-weight: bold;">add</span>
                        </span>
                    </div>
                `;
                positionDialBar();
            } else if (fab.dataset.origHtml) {
                setDialState(false);
                fab.classList.remove("vault-fab-profile-hub", "dial-open");
                fab.innerHTML = fab.dataset.origHtml;
            }
        }

        syncFabWithProfile();
        window.addEventListener("resize", syncFabWithProfile);

        document.addEventListener("click", function(e) {
            const targetEl = e.target.closest("button, a, [role='button'], [class*='fab'], [id*='fab'], .vault-fab-profile-hub");
            const clickedIcon = e.target.closest(".material-icons-round");
            const candidate = targetEl || (clickedIcon ? clickedIcon.parentElement : null);
            if (!candidate) return;

            if (candidate.closest("#modal-container") || candidate.closest("#vault-side-dial-bar") || candidate.closest("form") || candidate.closest("header")) return;

            const iconText = (candidate.querySelector(".material-icons-round")?.textContent || candidate.textContent || "").trim();
            const rect = candidate.getBoundingClientRect();
            const isBottomCorner = rect.bottom >= (window.innerHeight - 130) && rect.width > 0 && rect.width <= 95;

            if (
                candidate.classList.contains("vault-fab-profile-hub") ||
                candidate.classList.contains("fab") ||
                candidate.classList.contains("fab-btn") ||
                candidate.id === "fab-add" ||
                candidate.id === "btn-fab" ||
                (isBottomCorner && (iconText === "add" || iconText === "+"))
            ) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (window.innerWidth <= 768) {
                    setDialState(!isDialOpen);
                } else {
                    openQuickLogModal(null, false);
                }
            }
        }, true);

        const modalContainerEl = document.getElementById("modal-container");
        if (modalContainerEl) {
            const modalObserver = new MutationObserver(() => {
                if (modalContainerEl.classList.contains("active")) {
                    const bodyText = (document.getElementById("modal-body")?.textContent || "").trim();
                    if (bodyText.includes("Body content goes here")) {
                        openQuickLogModal(null, false);
                    }
                }
            });
            modalObserver.observe(modalContainerEl, { attributes: true, attributeFilter: ["class"] });
        }
    })();
});
