// File: voice.js (Unified Voice & Text AI Parser + Floating '+' Quick Log Shortcut)
window.addEventListener('load', function() {
    const btnVoice = document.getElementById("btn-voice-tx");
    const voiceFeedback = document.getElementById("voice-feedback");
    const aiTextInput = document.getElementById("ai-text-input");
    const btnAiTextSubmit = document.getElementById("btn-ai-text-submit");

    // --- 1. SINKRONISASI KATEGORI LIVE DARI SYSTEM SETTINGS ---
    function getDynamicCategories(type) {
        let containerId = type === 'expense' ? 'list-cat-expense' : 'list-cat-income';
        let container = document.getElementById(containerId);
        let cats = [];
        
        if (container) {
            Array.from(container.children).forEach(child => {
                let clone = child.cloneNode(true);
                clone.querySelectorAll('.material-icons-round').forEach(i => i.remove());
                let text = clone.textContent.trim();
                if (text) cats.push(text);
            });
        }
        
        if (cats.length === 0) {
            const mainSelect = document.getElementById('add-category');
            if (mainSelect) cats = Array.from(mainSelect.options).map(o => o.value);
        }
        
        return cats.length > 0 ? cats : ["Other"];
    }

    // --- 2. MESIN NLP (NATURAL LANGUAGE PARSER) ---
    function parseNLPData(text) {
        const textLower = text.toLowerCase();
        let amount = "";
        let type = "expense"; 
        let date = document.getElementById("add-date")?.value || new Date().toISOString().split('T')[0];
        let note = ""; 

        const amtRegex = /(?:rp\s*)?(\d+(?:[\.,]\d+)?)(?:\s*\b(ribu|rb|k|juta|jt)\b)?/i;
        const match = textLower.match(amtRegex);
        if (match) {
            let rawNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            let multiplier = match[2];
            if (multiplier && ['ribu', 'rb', 'k'].includes(multiplier)) rawNum *= 1000;
            if (multiplier && ['juta', 'jt'].includes(multiplier)) rawNum *= 1000000;
            amount = rawNum;
        }

        if (textLower.match(/(gaji|gajian|terima|dapat|masuk|bonus|income|pemasukan)/)) {
            type = "income";
        }

        const noteMatch = textLower.match(/(?:catatan|note)\s+(.*)/);
        if (noteMatch) {
            let rawNote = noteMatch[1].trim();
            note = rawNote.charAt(0).toUpperCase() + rawNote.slice(1);
        }

        let activeCats = getDynamicCategories(type);
        let category = activeCats[0]; 

        const keywordMap = {
            'ayam': 'Food', 'nasi': 'Food', 'makan': 'Food', 'minum': 'Food', 'kopi': 'Coffe', 'roti': 'Food', 'jajan': 'Food', 'soto': 'Food', 'bakso': 'Food', 'kafe': 'Coffe', 'gofood': 'Food',
            'bensin': 'Transport', 'gojek': 'Transport', 'grab': 'Transport', 'parkir': 'Transport', 'tol': 'Transport', 'angkot': 'Transport', 'kereta': 'Transport', 'pesawat': 'Transport',
            'kos': 'Rent', 'kontrakan': 'Rent', 'sewa': 'Rent',
            'belanja': 'Shopping', 'baju': 'Shopping', 'sepatu': 'Shopping', 'tas': 'Shopping', 'indomaret': 'Shopping', 'alfamart': 'Shopping', 'pasar': 'Shopping', 'shopee': 'Shopping', 'tokopedia': 'Shopping',
            'saham': 'Investment', 'investasi': 'Investment', 'reksadana': 'Investment', 'crypto': 'Investment',
            'nabung': 'Savings', 'tabungan': 'Savings', 'simpan': 'Savings',
            'keluarga': 'Family', 'ibu': 'Family', 'bapak': 'Family', 'ortu': 'Family', 'adik': 'Family',
            'pacar': 'Dating', 'nonton': 'Dating', 'kencan': 'Dating', 'bioskop': 'Dating',
            'listrik': 'Utility', 'wifi': 'Utility', 'air': 'Utility', 'pdam': 'Utility', 'pulsa': 'Utility', 'kuota': 'Utility', 'paket data': 'Utility',
            'sedekah': 'Shodaqoh', 'zakat': 'Shodaqoh', 'infaq': 'Shodaqoh', 'amal': 'Shodaqoh', 'donasi': 'Shodaqoh'
        };

        let exactMatch = activeCats.find(c => textLower.includes(c.toLowerCase()));
        if (exactMatch) {
            category = exactMatch;
        } else {
            for (const [kw, mappedCat] of Object.entries(keywordMap)) {
                if (textLower.includes(kw)) {
                    let foundInSettings = activeCats.find(c => c.toLowerCase() === mappedCat.toLowerCase());
                    if (foundInSettings) {
                        category = foundInSettings;
                        break;
                    }
                }
            }
        }

        return { amount, type, category, date, note };
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
                statusEl.innerHTML = '<span class="material-icons-round" style="font-size: 16px; vertical-align: middle; animation: pulse 1.5s infinite;">mic</span> Listening... Silakan ucapkan transaksi Anda.';
            }
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (statusEl) {
                statusEl.innerHTML = `<strong>Terdeteksi:</strong> "${transcript}"`;
                setTimeout(() => { statusEl.style.display = "none"; }, 3500);
            }
            onResultCallback(transcript);
        };

        recognition.onerror = (event) => {
            let errorMsg = event.error === 'not-allowed' ? "Izin mikrofon ditolak." : (event.error === 'no-speech' ? "Suara tidak terdeteksi." : event.error);
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

        const defaultDate = prefill?.date || document.getElementById("add-date")?.value || new Date().toISOString().split('T')[0];
        const defaultType = prefill?.type || "expense";
        const defaultAmount = prefill?.amount || "";
        const defaultNote = prefill?.note || "";
        const defaultCategory = prefill?.category || getDynamicCategories(defaultType)[0];

        function renderOptions(selectedType, selectedCat) {
            const cats = getDynamicCategories(selectedType);
            return cats.map(c => `<option value="${c}" ${c === selectedCat ? 'selected' : ''}>${c}</option>`).join('');
        }

        document.getElementById("modal-title").innerHTML = isFromAI
            ? '<span class="material-icons-round" style="color: var(--primary);">auto_awesome</span> AI Transaction Confirmation'
            : '<span class="material-icons-round" style="color: var(--success);">flash_on</span> Quick Log Transaction';

        document.getElementById("modal-body").innerHTML = `
            <!-- AI Smart Parser di dalam Shortcut Modal -->
            <div class="form-group" style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                <label style="display: flex !important; align-items: center !important; gap: 6px; font-size: 0.8rem; line-height: 1.2; margin-bottom: 4px;">
                    <span class="material-icons-round" style="font-size: 16px; line-height: 1; color: var(--primary); display: inline-flex; align-items: center;">auto_awesome</span>
                    <span>AI Quick Fill (Type or Voice)</span>
                </label>
                <div style="display: flex; gap: 8px; align-items: stretch;">
                    <input type="text" id="modal-ai-input" class="form-control" placeholder="e.g. 'Lunch 35k office note'..." style="flex: 1; margin: 0;">
                    <button type="button" id="btn-modal-ai-parse" class="btn-primary" style="width: 46px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Parse Text">
                        <span class="material-icons-round" style="font-size: 18px;">auto_awesome</span>
                    </button>
                    <button type="button" id="btn-modal-ai-mic" style="background: var(--bg-body, rgba(255,255,255,0.04)); border: 1px solid var(--border); color: var(--text-main); border-radius: 8px; width: 46px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Voice Input">
                        <span class="material-icons-round" style="font-size: 20px;">mic</span>
                    </button>
                </div>
                <div id="modal-ai-status" style="display: none; font-size: 0.8rem; color: var(--info); margin-top: 6px; font-weight: 600;"></div>
            </div>

            <!-- Form Transaksi Utama -->
            <div class="grid-2" style="margin-bottom: 12px;">
                <div class="form-group" style="margin: 0;">
                    <label>Date</label>
                    <input type="date" id="voice-date" class="form-control" value="${defaultDate}" required>
                </div>
                <div class="form-group" style="margin: 0;">
                    <label>Type</label>
                    <select id="voice-type" class="form-control">
                        <option value="income" ${defaultType === 'income' ? 'selected' : ''}>Income</option>
                        <option value="expense" ${defaultType === 'expense' ? 'selected' : ''}>Expense</option>
                    </select>
                </div>
            </div>

            <div class="grid-2" style="margin-bottom: 12px;">
                <div class="form-group" style="margin: 0;">
                    <label>Category</label>
                    <select id="voice-category" class="form-control">
                        ${renderOptions(defaultType, defaultCategory)}
                    </select>
                </div>
                <div class="form-group" style="margin: 0;">
                    <label>Amount (IDR)</label>
                    <input type="number" id="voice-amount" class="form-control" placeholder="e.g. 50000" value="${defaultAmount}" required>
                </div>
            </div>

            <div class="form-group" style="margin: 0;">
                <label>Description (Optional)</label>
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

        // Helper untuk mengisi field di dalam modal dari hasil AI
        function applyAIParsedToModal(rawText) {
            const parsed = parseNLPData(rawText);
            const typeEl = document.getElementById("voice-type");
            const catEl = document.getElementById("voice-category");
            const amtEl = document.getElementById("voice-amount");
            const noteEl = document.getElementById("voice-note");
            const statusEl = document.getElementById("modal-ai-status");

            typeEl.value = parsed.type;
            catEl.innerHTML = renderOptions(parsed.type, parsed.category);
            if (parsed.amount) amtEl.value = parsed.amount;
            if (parsed.note) noteEl.value = parsed.note;

            if (statusEl) {
                statusEl.style.display = "block";
                statusEl.style.color = "var(--success, #10b981)";
                statusEl.innerHTML = "✓ AI berhasil mengisi form di bawah. Silakan periksa & simpan.";
            }
        }

        // Event AI Text di dalam Modal
        const modalAiInput = document.getElementById("modal-ai-input");
        const modalAiBtn = document.getElementById("btn-modal-ai-parse");
        const modalMicBtn = document.getElementById("btn-modal-ai-mic");
        const modalStatus = document.getElementById("modal-ai-status");

        if (modalAiBtn && modalAiInput) {
            modalAiBtn.onclick = () => {
                if (!modalAiInput.value.trim()) return modalAiInput.focus();
                applyAIParsedToModal(modalAiInput.value.trim());
                modalAiInput.value = "";
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
                startSpeechRecognition((transcript) => {
                    applyAIParsedToModal(transcript);
                }, modalStatus, modalMicBtn);
            };
        }

        // Sinkronisasi kategori saat Type diganti manual di modal
        document.getElementById("voice-type").addEventListener("change", function(e) {
            document.getElementById("voice-category").innerHTML = renderOptions(e.target.value, '');
        });

        // Simpan Transaksi
        document.getElementById("btn-confirm-voice").onclick = () => {
            const finalAmount = document.getElementById("voice-amount").value;
            if (!finalAmount || Number(finalAmount) <= 0) return alert("Please enter a valid amount.");

            document.getElementById("add-amount").value = finalAmount;
            const typeSelect = document.getElementById("add-type");
            typeSelect.value = document.getElementById("voice-type").value;
            typeSelect.dispatchEvent(new Event('change')); 
            
            document.getElementById("add-category").value = document.getElementById("voice-category").value;
            document.getElementById("add-note").value = document.getElementById("voice-note").value;
            document.getElementById("add-date").value = document.getElementById("voice-date").value;
            
            document.getElementById("form-add-tx").dispatchEvent(new Event('submit'));
            
            modalContainer.classList.remove("active");
            document.getElementById("add-note").value = "";
        };
    }

    // --- 5. HUBUNGKAN AI INPUT DI DASHBOARD ---
    function handleDashboardTextSubmit() {
        if (!aiTextInput) return;
        const rawText = aiTextInput.value.trim();
        if (!rawText) return aiTextInput.focus();
        const parsed = parseNLPData(rawText);
        openQuickLogModal(parsed, true);
        aiTextInput.value = "";
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
            startSpeechRecognition((transcript) => {
                const parsed = parseNLPData(transcript);
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

            /* Kontainer 4 Tombol ke Samping Kiri */
            #vault-side-dial-bar {
                position: fixed;
                display: flex;
                flex-direction: row-reverse; /* Keluar berurutan dari kanan (foto) ke kiri */
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

            /* Animasi keluar bertahap (staggered) ke samping kiri */
            #vault-side-dial-bar.open .vsd-circle-btn {
                opacity: 1;
                transform: translateX(0) scale(1);
            }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(1) { transition-delay: 0.02s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(2) { transition-delay: 0.06s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(3) { transition-delay: 0.10s; }
            #vault-side-dial-bar.open .vsd-circle-btn:nth-child(4) { transition-delay: 0.14s; }

            /* Animasi masuk kembali ke belakang foto profil */
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

        // Buat 4 tombol meluncur ke kiri (tanpa kotak popup besar)
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
            const centerY = rect.top + (rect.height / 2) - 23; // Sejajar vertikal tengah dengan foto profil
            const rightOffset = window.innerWidth - rect.left + 12; // Muncul tepat di sebelah kiri foto profil
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

        // Hubungkan aksi ke-4 tombol bulat
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

        // Tutup otomatis jika mengetuk area luar
        document.addEventListener("click", (e) => {
            if (isDialOpen && !dialBar.contains(e.target) && (!activeFabEl || !activeFabEl.contains(e.target))) {
                setDialState(false);
            }
        });

        // Transformasi tombol '+' menjadi Profil Krisna + Badge '+' di Android
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

        // Tangkap klik tombol '+' (Android toggle 4 tombol ke samping kiri, Desktop buka QuickLog Modal)
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

        // Pengaman otomatis jika modal placeholder terbuka
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