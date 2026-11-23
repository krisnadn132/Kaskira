/* global Chart */
// @ts-nocheck
const STORAGE_KEY = 'yourVaultEnterpriseV6';

const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const DEFAULT_DATA = {
    transactions: [],
    categories: {
        income: ['Salary', 'Bonus', 'Business', 'Investment', 'Other'],
        expense: [
        'Rent',
        'Utility',
        'Food',
        'Transport',
        'Family',
        'Shodaqoh',
        'Savings',
        'Investment',
        'Shopping',
        'Dating',
        'Coffe',
        'Other'
    ],
    },
    savings: [],
    wishlist: [],
    subscriptions: [],
    budgets: {}
};

// ============================================================================
// GLOBAL STATE & TABLE SORTING
// ============================================================================
let currentSort = { column: 'date', order: 'desc' };

window.sortTable = function(column) {
    if (!window.AppState || !window.AppState.data || !Array.isArray(window.AppState.data.transactions)) return;

    if (currentSort.column === column) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.order = 'asc';
    }

    const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
    if (window.Render && typeof window.Render.fiat === 'function') {
        window.Render.fiat(filteredTxs);
    }
    if (typeof window.updateSortIcons === 'function') {
        window.updateSortIcons();
    }
};

window.updateSortIcons = function() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = 'swap_vert';
        if (icon.parentElement) icon.parentElement.classList.remove('active-sort');
    });
    const activeIcon = document.getElementById(`icon-sort-${currentSort.column}`);
    if (activeIcon) {
        activeIcon.textContent = currentSort.order === 'asc' ? 'arrow_upward' : 'arrow_downward';
        if (activeIcon.parentElement) activeIcon.parentElement.classList.add('active-sort');
    }
};

document.addEventListener('DOMContentLoaded', () => {

    // ========================================================================
    // 1. APPLICATION STATE & CLOUD SYNC
    // ========================================================================
    const AppState = {
        data: null,
        // Serialize cloud writes so slower earlier requests cannot overwrite newer state.
        _cloudSaveQueue: Promise.resolve(),
        selectedMonth: getLocalDateString().substring(0, 7),

        getGitHubConfig() {
            return {
                token: localStorage.getItem('vault_gh_token') || '',
                gistId: localStorage.getItem('vault_gh_gist_id') || ''
            };
        },

        async loadFromGitHub() {
            const { token, gistId } = this.getGitHubConfig();
            if (!token || !gistId) return false;
            try {
                const res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    headers: { 'Authorization': `token ${token}` }
                });
                if (!res.ok) throw new Error('Failed to contact GitHub API');

                const gist = await res.json();
                const content = gist.files && gist.files['vault_data.json'] ? gist.files['vault_data.json'].content : null;
                if (content && content.trim() !== '') {
                    const cloudData = JSON.parse(content);
                    if (!cloudData || typeof cloudData !== 'object' || Array.isArray(cloudData)) {
                        throw new Error('GitHub Gist contains an invalid data object');
                    }
                    this.data = cloudData;
                    return true;
                }
            } catch (error) {
                console.error('GitHub Sync Error:', error);
                return false;
            }
            return false;
        },

        async init() {
            let localData = null;
            try {
                const parsedLocalData = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (parsedLocalData && typeof parsedLocalData === 'object' && !Array.isArray(parsedLocalData)) {
                    localData = parsedLocalData;
                }
            } catch (error) {
                console.warn('Local Vault data could not be parsed; a safe default will be used.', error);
            }

            const cloudSuccess = await this.loadFromGitHub();
            let shouldSyncLocalToCloud = false;

            if (cloudSuccess && localData) {
                const cloudTime = Number(this.data.lastUpdated) || 0;
                const localTime = Number(localData.lastUpdated) || 0;
                if (localTime > cloudTime) {
                    this.data = localData;
                    shouldSyncLocalToCloud = true;
                }
            } else if (!cloudSuccess) {
                this.data = localData || JSON.parse(JSON.stringify(DEFAULT_DATA));
            }

            // Reject malformed roots before normalizing the data model.
            if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) {
                this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
                shouldSyncLocalToCloud = false;
            }

            if (!Array.isArray(this.data.transactions)) this.data.transactions = [];
            if (!Array.isArray(this.data.savings)) this.data.savings = [];
            if (!Array.isArray(this.data.wishlist)) this.data.wishlist = [];
            if (!Array.isArray(this.data.subscriptions)) this.data.subscriptions = [];
            if (!this.data.budgets || typeof this.data.budgets !== 'object' || Array.isArray(this.data.budgets)) this.data.budgets = {};
            if (!this.data.categories || typeof this.data.categories !== 'object' || Array.isArray(this.data.categories)) {
                this.data.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
            }
            if (!Array.isArray(this.data.categories.income)) this.data.categories.income = JSON.parse(JSON.stringify(DEFAULT_DATA.categories.income));
            if (!Array.isArray(this.data.categories.expense)) this.data.categories.expense = JSON.parse(JSON.stringify(DEFAULT_DATA.categories.expense));

            window.AppState = this;
            window.AppStateData = this;

            // Keep the local recovery copy aligned with the selected cloud/local
            // version. Previously, a newer cloud copy could leave stale local data,
            // which might be restored on the next offline launch.
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            } catch (error) {
                console.error('Failed to refresh the local Vault recovery copy:', error);
            }

            // Only upload when the local copy was explicitly selected as newer.
            if (shouldSyncLocalToCloud) await this.save();
        },

        async save() {
            if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) {
                throw new Error('Vault data is not initialized; save was aborted.');
            }

            this.data.lastUpdated = Date.now();
            const dataSnapshot = JSON.stringify(this.data);
            const cloudSnapshot = JSON.stringify(this.data, null, 2);
            localStorage.setItem(STORAGE_KEY, dataSnapshot);

            const { token, gistId } = this.getGitHubConfig();
            if (!token || !gistId) return;

            const syncSnapshot = async () => {
                const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        files: {
                            'vault_data.json': { content: cloudSnapshot }
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`GitHub Gist update failed (HTTP ${response.status})`);
                }
            };

            // Queue network writes in invocation order. A failed write is logged,
            // but it must not poison the queue or block later saves.
            this._cloudSaveQueue = this._cloudSaveQueue
                .then(syncSnapshot, syncSnapshot)
                .catch(error => {
                    console.error('Failed to save to GitHub:', error);
                });

            await this._cloudSaveQueue;
        }
    };
    window.AppState = AppState;
    window.AppStateData = AppState;

    const U_HASH = "S3Jpc25h";
    const P_HASH = "S3Jpc25hITMy";

    // ========================================================================
    // 2. UTILITIES & COLOR HELPER
    // ========================================================================
    const Util = {
        escapeHTML: (str) => {
            if (!str) return '';
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        },
        idr: (v) => new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(v || 0).replace(/Rp\s?/g, 'Rp '),
        usd: (v) => new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(v || 0),
        date: () => getLocalDateString(),
        todayStr: () => new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }),
        id: (p) => p + Date.now() + Math.floor(Math.random() * 1000)
    };
    window.Util = Util;
    window.UtilApp = Util;

    const ColorHelper = {
        palette: ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#84cc16', '#0ea5e9', '#6366f1'],
        memory: {},
        getColor(categoryName) {
            if (this.memory[categoryName]) return this.memory[categoryName];
            const index = Object.keys(this.memory).length;
            if (index < this.palette.length) {
                this.memory[categoryName] = this.palette[index];
            } else {
                this.memory[categoryName] = `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`;
            }
            return this.memory[categoryName];
        }
    };

    // ========================================================================
    // 3. TIME MACHINE FILTER ENGINE
    // ========================================================================
    const Filter = {
        getMode: () => document.getElementById('filter-mode') ? document.getElementById('filter-mode').value : 'payday',
        getYear: () => document.getElementById('filter-year') ? document.getElementById('filter-year').value : 'all',
        getMonth: () => document.getElementById('filter-month') ? document.getElementById('filter-month').value : 'all',
        getStart: () => document.getElementById('filter-start') ? document.getElementById('filter-start').value : '',
        getEnd: () => document.getElementById('filter-end') ? document.getElementById('filter-end').value : '',

        getPaydayRange: () => {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const currentDate = now.getDate();

            let start, end;
            if (currentDate >= 25) {
                start = new Date(currentYear, currentMonth, 25);
                end = new Date(currentYear, currentMonth + 1, 25);
            } else {
                start = new Date(currentYear, currentMonth - 1, 25);
                end = new Date(currentYear, currentMonth, 25);
            }

            const formatStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return { startStr: formatStr(start), endStr: formatStr(end) };
        },

        isMatch: (dateStr) => {
            if (!dateStr) return false;
            const mode = Filter.getMode();

            if (mode === 'payday') {
                const { startStr, endStr } = Filter.getPaydayRange();
                return dateStr >= startStr && dateStr <= endStr;
            }

            if (mode === 'range') {
                const s = Filter.getStart();
                const e = Filter.getEnd();
                if (!s && !e) return true;
                if (s && e) return dateStr >= s && dateStr <= e;
                if (s) return dateStr >= s;
                if (e) return dateStr <= e;
            } else {
                const y = Filter.getYear();
                const m = Filter.getMonth();
                if (y === 'all') return true;
                if (m === 'all') return dateStr.startsWith(y);
                return dateStr.startsWith(`${y}-${m}`);
            }
            return true;
        },

        getSummaryText: () => {
            const mode = Filter.getMode();

            if (mode === 'payday') {
                const { startStr, endStr } = Filter.getPaydayRange();
                return `Payday Cycle (${startStr} - ${endStr})`;
            }

            if (mode === 'range') {
                const s = Filter.getStart();
                const e = Filter.getEnd();
                if (!s && !e) return 'All Time (Range)';
                if (s && e) return `${s} to ${e}`;
                if (s) return `From ${s}`;
                if (e) return `Until ${e}`;
            }

            const y = Filter.getYear();
            const m = Filter.getMonth();
            if (y === 'all') return 'All Time';
            if (m === 'all') return `Year ${y}`;

            const monthOption = document.querySelector(`#filter-month option[value="${m}"]`);
            const mName = monthOption ? monthOption.innerText : m;
            return `${mName} ${y}`;
        }
    };
    window['Filter'] = Filter;
    window.FilterApp = Filter;

    const filterModeSelect = document.getElementById('filter-mode');
    if (filterModeSelect) {
        if (!filterModeSelect.querySelector('option[value="payday"]')) {
            const paydayOption = document.createElement('option');
            paydayOption.value = 'payday';
            paydayOption.text = 'Siklus Gajian (25 - 25)';
            filterModeSelect.insertBefore(paydayOption, filterModeSelect.firstChild);
        }
        filterModeSelect.value = 'payday';
    }

    const syncFilterInputsVisibility = () => {
        const mode = Filter.getMode();
        const monthSelect = document.getElementById('filter-month');
        const yearSelect = document.getElementById('filter-year');
        const rangeInputs = document.getElementById('filter-range-inputs');

        if (mode === 'payday') {
            if (yearSelect) yearSelect.style.display = 'none';
            if (monthSelect) monthSelect.style.display = 'none';
            if (rangeInputs) rangeInputs.style.display = 'none';
        } else if (mode === 'range') {
            if (yearSelect) yearSelect.style.display = 'none';
            if (monthSelect) monthSelect.style.display = 'none';
            if (rangeInputs) rangeInputs.style.display = 'flex';
        } else {
            if (yearSelect) yearSelect.style.display = 'inline-block';
            if (monthSelect) monthSelect.style.display = 'inline-block';
            if (rangeInputs) rangeInputs.style.display = 'none';
            const y = Filter.getYear();
            if (y === 'all') {
                if (monthSelect) {
                    monthSelect.value = 'all';
                    monthSelect.disabled = true;
                    monthSelect.style.opacity = '0.5';
                }
            } else {
                if (monthSelect) {
                    monthSelect.disabled = false;
                    monthSelect.style.opacity = '1';
                }
            }
        }
    };
    syncFilterInputsVisibility();

    // ========================================================================
    // 4. DOM & UI HELPERS
    // ========================================================================
    const DOM = {
        views: document.querySelectorAll('.view-section'),
        navs: document.querySelectorAll('.nav-link'),
        toast: document.getElementById('toast-container')
    };

    const UI = {
        toast: (msg, type = 'success') => {
            if (!DOM.toast) return;
            const t = document.createElement('div');
            t.className = 'toast';
            t.style.borderLeftColor = `var(--${type})`;
            t.innerHTML = `<span class="material-icons-round" style="color:var(--${type}); font-size:24px;">${type === 'success' ? 'check_circle' : 'error'}</span> <span style="font-weight:600; font-size:0.95rem;">${msg}</span>`;
            DOM.toast.appendChild(t);
            setTimeout(() => t.remove(), 4000);
        },
        modal: {
            container: document.getElementById('modal-container'),
            title: document.getElementById('modal-title'),
            body: document.getElementById('modal-body'),
            actions: document.getElementById('modal-actions'),
            show({ title, icon, bodyHTML, buttons }) {
                if (!this.container) return;
                this.title.innerHTML = `<span class="material-icons-round" style="color:var(--primary); font-size:30px;">${icon || 'info'}</span> ${title}`;
                this.body.innerHTML = bodyHTML;
                this.actions.innerHTML = '';
                buttons.forEach(btn => {
                    const b = document.createElement('button');
                    b.className = `btn-modal ${btn.class || 'btn-primary'}`;
                    b.type = 'button';
                    b.innerText = btn.text;
                    b.onclick = () => {
                        if (btn.onClick) btn.onClick();
                        this.close();
                    };
                    this.actions.appendChild(b);
                });
                this.container.classList.add('active');
            },
            close() {
                if (this.container) this.container.classList.remove('active');
            }
        },
        bindFormatHelper: (inputId, helperId) => {
            const input = document.getElementById(inputId);
            const helper = document.getElementById(helperId);
            if (input && helper) {
                input.addEventListener('input', (e) => {
                    const val = Number(e.target.value);
                    helper.innerText = (val && Number.isFinite(val) && val > 0) ? Util.idr(val) : '';
                });
            }
        }
    };

    if (UI.modal.container) {
        UI.modal.container.addEventListener('click', (e) => {
            if (e.target === UI.modal.container) UI.modal.close();
        });
    }
    UI.bindFormatHelper('add-amount', 'helper-add-amount');
    UI.bindFormatHelper('bud-amount', 'helper-bud-amount');
    UI.bindFormatHelper('sub-price', 'helper-sub-price');
    UI.bindFormatHelper('sav-target', 'helper-sav-target');
    UI.bindFormatHelper('wish-price', 'helper-wish-price');

    // ========================================================================
    // 5. CHARTS ENGINE (DASHBOARD & ANALYTICS)
    // ========================================================================
    const Charts = {
        inst: {
            dash: null,
            pie: null,
            detail: null,
            incExpLine: null,
            anaDonut: null
        },
        getColors() {
            return document.body.getAttribute('data-theme') === 'dark' ? '#cbd5e1' : '#475569';
        },
        getGridColor() {
            return document.body.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
        },
        init() {
            const ChartLib = window.Chart;
            if (typeof ChartLib === 'undefined') return;
            ChartLib.defaults.color = this.getColors();
            ChartLib.defaults.font.family = 'Inter';
            this.renderDash();
            this.renderPie();
        },
        renderDash() {
            const ChartLib = window.Chart;
            const ctx1 = document.getElementById('dashboardChart');
            if (!ctx1 || ctx1.offsetParent === null || typeof ChartLib === 'undefined') return;

            if (this.inst.dash) this.inst.dash.destroy();
            const dMap = {};
            const mode = Filter.getMode();
            const y = Filter.getYear();
            const m = Filter.getMonth();

            const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            filteredTxs.forEach(t => {
                let key;
                if (mode === 'range' || mode === 'payday') {
                    key = t.date;
                } else if (y === 'all') {
                    key = t.date.substring(0, 4);
                } else if (m === 'all') {
                    key = t.date.substring(5, 7);
                } else {
                    key = t.date.substring(8, 10);
                }
                if (!dMap[key]) dMap[key] = { i: 0, e: 0 };
                t.type === 'income' ? (dMap[key].i += Number(t.amount)) : (dMap[key].e += Number(t.amount));
            });

            if (Object.keys(dMap).length > 0) {
                const sortedKeys = Object.keys(dMap).sort();
                const labels = sortedKeys.map(k => {
                    if (mode === 'range' || mode === 'payday') return k.substring(5);
                    if (y === 'all') return k;
                    if (m === 'all') {
                        const dt = new Date(`${y}-${k}-01`);
                        return dt.toLocaleString('en-US', { month: 'short' });
                    }
                    return `${k} ${new Date(`${y}-${m}-01`).toLocaleString('en-US', { month: 'short' })}`;
                });

                this.inst.dash = new ChartLib(ctx1, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Income', data: sortedKeys.map(k => dMap[k].i), backgroundColor: '#10b981', borderRadius: 6 },
                            { label: 'Expense', data: sortedKeys.map(k => dMap[k].e), backgroundColor: '#ef4444', borderRadius: 6 }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { display: false, grid: { display: false } }, x: { grid: { display: false } } }
                    }
                });
            }
        },
        renderPie() {
            const ChartLib = window.Chart;
            const ctxPie = document.getElementById('expensePieChart');
            if (!ctxPie || ctxPie.offsetParent === null || typeof ChartLib === 'undefined') return;

            if (this.inst.pie) this.inst.pie.destroy();
            const expMap = {};
            let totalExp = 0;
            AppState.data.transactions.forEach(t => {
                if (t.type === 'expense' && Filter.isMatch(t.date)) {
                    const amt = Number(t.amount) || 0;
                    expMap[t.category] = (expMap[t.category] || 0) + amt;
                    totalExp += amt;
                }
            });

            if (Object.keys(expMap).length > 0) {
                const strokeColor = document.body.getAttribute('data-theme') === 'dark' ? '#1e293b' : '#ffffff';
                const labels = Object.keys(expMap).map(k => `${k} (${((expMap[k] / totalExp) * 100).toFixed(1)}%)`);

                this.inst.pie = new ChartLib(ctxPie, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: Object.values(expMap),
                            backgroundColor: Object.keys(expMap).map(k => ColorHelper.getColor(k)),
                            borderWidth: 3,
                            borderColor: strokeColor
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '65%',
                        plugins: { legend: { position: 'right' } }
                    }
                });
            }
        },
renderAnalyticsCharts(periodMap, expenseByCat, isDailyView) {
            if (typeof window.Chart === 'undefined') return;

            const trendLbl = document.getElementById('ana-trend-label');
            if (trendLbl) trendLbl.textContent = isDailyView ? 'Daily Comparison' : 'Monthly Comparison';

            // 1. Income vs Expense Trend (Double Line Chart)
            const incExpCanvas = document.getElementById('analyticsIncExpChart');
            if (incExpCanvas) {
                const sortedKeys = Object.keys(periodMap).sort();
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const labels = sortedKeys.map(k => {
                    if (!isDailyView && k.length === 7) {
                        const [yr, mo] = k.split('-');
                        return `${monthNames[parseInt(mo, 10) - 1]} ${yr.slice(2)}`;
                    }
                    return k.length === 10 ? k.slice(5) : k;
                });

                const incData = sortedKeys.map(k => periodMap[k].income);
                const expData = sortedKeys.map(k => periodMap[k].expense);

                const ctx = incExpCanvas.getContext('2d');
                const gradInc = ctx.createLinearGradient(0, 0, 0, 260);
                gradInc.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
                gradInc.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

                const gradExp = ctx.createLinearGradient(0, 0, 0, 260);
                gradExp.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
                gradExp.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

                if (this.inst.incExpLine) this.inst.incExpLine.destroy();
                this.inst.incExpLine = new window.Chart(incExpCanvas, {
                    type: 'line',
                    data: {
                        labels: labels.length ? labels : ['No Data'],
                        datasets: [
                            {
                                label: 'Income',
                                data: incData.length ? incData : [0],
                                borderColor: '#10b981',
                                backgroundColor: gradInc,
                                borderWidth: 2.5,
                                tension: 0.4,
                                fill: true,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            {
                                label: 'Expense',
                                data: expData.length ? expData : [0],
                                borderColor: '#ef4444',
                                backgroundColor: gradExp,
                                borderWidth: 2.5,
                                tension: 0.4,
                                fill: true,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: {
                                    color: '#94a3b8',
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    padding: 16
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (c) => ` ${c.dataset.label}: ${Util.idr(c.raw)}`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: this.getGridColor ? this.getGridColor() : 'rgba(148,163,184,0.1)' },
                                ticks: { color: '#94a3b8' }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                            }
                        }
                    }
                });
            }

            // 2. Expense Breakdown (Donut Chart)
            const donutCanvas = document.getElementById('analyticsDonutChart');
            if (donutCanvas) {
                const cats = Object.keys(expenseByCat).sort((a, b) => expenseByCat[b] - expenseByCat[a]);
                const totalExp = cats.reduce((sum, c) => sum + expenseByCat[c], 0);
                const hasExp = totalExp > 0;

                const fallbackColors = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
                const donutLabels = hasExp
                    ? cats.map(c => `${c} (${((expenseByCat[c] / totalExp) * 100).toFixed(1)}%)`)
                    : ['No Expense'];
                const donutData = hasExp ? cats.map(c => expenseByCat[c]) : [1];
                const donutColors = hasExp
                    ? cats.map((_, i) => fallbackColors[i % fallbackColors.length])
                    : ['rgba(148, 163, 184, 0.22)'];

                if (this.inst.anaDonut) this.inst.anaDonut.destroy();
                this.inst.anaDonut = new window.Chart(donutCanvas, {
                    type: 'doughnut',
                    data: {
                        labels: donutLabels,
                        datasets: [{
                            data: donutData,
                            backgroundColor: donutColors,
                            borderColor: '#161b26',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '68%',
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: '#94a3b8', boxWidth: 10, padding: 10, font: { size: 11 } }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (c) => hasExp
                                        ? ` ${cats[c.dataIndex]}: ${Util.idr(c.raw)}`
                                        : ' No Expense: Rp 0'
                                }
                            }
                        }
                    }
                });
            }
        },

        renderDetail() {
            const catSelect = document.getElementById('ana-category');
            const detailCanvas = document.getElementById('analyticsDetailChart');
            if (!catSelect || !detailCanvas || typeof window.Chart === 'undefined') return;

            const selectedCat = catSelect.value;
            const fMonth = Filter.getMonth();
            const fMode = Filter.getMode();
            const isDailyView = (fMonth !== 'all' || fMode === 'range' || fMode === 'payday');

            const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date) && t.category === selectedCat);
            const periodMap = {};
            let totalCat = 0;
            let peakCat = 0;

            filteredTxs.forEach(t => {
                const amt = Number(t.amount) || 0;
                const key = isDailyView ? t.date : t.date.substring(0, 7);
                periodMap[key] = (periodMap[key] || 0) + amt;
                totalCat += amt;
            });

            const sortedKeys = Object.keys(periodMap).sort();
            const values = sortedKeys.map(k => {
                if (periodMap[k] > peakCat) peakCat = periodMap[k];
                return periodMap[k];
            });
            const avgCat = sortedKeys.length ? totalCat / sortedKeys.length : 0;

            // Update Judul & Statistik Subjudul Category Detailed Trend
            const titleEl = document.getElementById('ana-detail-title');
            if (titleEl) {
                titleEl.innerHTML = `<span class="material-icons-round" style="color:var(--primary);">timeline</span> Category Detailed Trend (${Filter.getSummaryText()})`;
            }

            const statsEl = document.getElementById('ana-detail-stats');
            if (statsEl) {
                statsEl.textContent = `Total: ${Util.idr(totalCat)} • Avg / ${isDailyView ? 'Day' : 'Month'}: ${Util.idr(avgCat)} • Peak: ${Util.idr(peakCat)}`;
            }

            const isIncome = AppState.data.categories.income.includes(selectedCat);
            const lineColor = isIncome ? '#10b981' : '#f59e0b';

            if (this.inst.detail) this.inst.detail.destroy();
            this.inst.detail = new window.Chart(detailCanvas, {
                type: 'line',
                data: {
                    labels: sortedKeys.length ? sortedKeys : ['No Data'],
                    datasets: [{
                        label: selectedCat,
                        data: values.length ? values : [0],
                        borderColor: lineColor,
                        backgroundColor: isIncome ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        borderWidth: 2.5,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (c) => ` ${selectedCat}: ${Util.idr(c.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: this.getGridColor ? this.getGridColor() : 'rgba(148,163,184,0.1)' },
                            ticks: { color: '#94a3b8' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#94a3b8' }
                        }
                    }
                }
            });
        },
    };
    window.Charts = Charts;
    window.ChartsApp = Charts;

    // ========================================================================
    // 6. CATEGORY DROPDOWN & RENDER ENGINE
    // ========================================================================
    const txTypeSelect = document.getElementById('add-type');
    const txCategorySelect = document.getElementById('add-category');

    function renderCategoryByType(type) {
        const categories = AppState.data.categories[type] || [];
        if (txCategorySelect) {
            txCategorySelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
            txCategorySelect.selectedIndex = 0;
        }
    }

    if (txTypeSelect) {
        txTypeSelect.addEventListener('change', () => renderCategoryByType(txTypeSelect.value));
    }

    const Render = {
        initTimeMachine() {
            const years = new Set();
            const curY = new Date().getFullYear().toString();
            years.add(curY);
            AppState.data.transactions.forEach(t => {
                if (t.date) years.add(t.date.substring(0, 4));
            });

            const sortedYears = Array.from(years).sort((a, b) => b - a);
            const ySelect = document.getElementById('filter-year');
            if (ySelect) {
                ySelect.innerHTML = `<option value="all">All Time</option>` + sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
                ySelect.value = curY;
            }
            if (document.getElementById('filter-month')) {
                document.getElementById('filter-month').value = getLocalDateString().substring(5, 7);
            }
            syncFilterInputsVisibility();
        },

        all() {
            const dateEl = document.getElementById('current-date');
            if (dateEl) dateEl.innerText = Util.todayStr();

            this.updateDropdowns();
            this.fiatAndNetWorth();
            this.budget();
            this.subscriptions();
            this.savings();
            this.analytics();
            this.settings();
            this.financialInsight();
            Charts.init();
            if (typeof window.updateSortIcons === 'function') window.updateSortIcons();
        },

        updateDropdowns() {
            if (txTypeSelect) renderCategoryByType(txTypeSelect.value);
            if (document.getElementById('bud-cat')) {
                document.getElementById('bud-cat').innerHTML = AppState.data.categories.expense.map(c => `<option value="${c}">${c}</option>`).join('');
            }
            const allCatsOptions = [...AppState.data.categories.income, ...AppState.data.categories.expense]
                .map(c => `<option value="${c}">${c}</option>`).join('');
            if (document.getElementById('ana-category')) {
                const prev = document.getElementById('ana-category').value;
                document.getElementById('ana-category').innerHTML = allCatsOptions;
                if (prev) document.getElementById('ana-category').value = prev;
            }
            if (document.getElementById('ana-category-budget')) {
                document.getElementById('ana-category-budget').innerHTML = allCatsOptions;
            }
        },

        fiatAndNetWorth() {
            let totalIncome = 0;
            let totalExpense = 0;

            AppState.data.transactions.forEach(t => {
                if (Filter.isMatch(t.date)) {
                    const amt = Number(t.amount) || 0;
                    if (t.type === 'income') totalIncome += amt;
                    if (t.type === 'expense') totalExpense += amt;
                }
            });

            const netBalance = totalIncome - totalExpense;

            if (document.getElementById('dash-networth')) document.getElementById('dash-networth').innerText = Util.idr(netBalance);
            if (document.getElementById('dash-balance')) document.getElementById('dash-balance').innerText = Util.idr(netBalance);
            if (document.getElementById('dash-income')) document.getElementById('dash-income').innerText = Util.idr(totalIncome);
            if (document.getElementById('dash-expense')) document.getElementById('dash-expense').innerText = Util.idr(totalExpense);

            const currentTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            this.fiat(currentTxs);
        },

        fiat(filteredTxs) {
            const tbody = document.getElementById('tbody-fiat-history');
            if (!tbody) return;

            const sumTxEl = document.getElementById('summary-tx');
            if (sumTxEl) sumTxEl.innerText = Filter.getSummaryText();

            const sortedTxs = [...filteredTxs];
            if (typeof currentSort !== 'undefined' && currentSort.column) {
                sortedTxs.sort((a, b) => {
                    let valA = a[currentSort.column];
                    let valB = b[currentSort.column];

                    if (currentSort.column === 'date') {
                        valA = new Date(a.date).getTime() || 0;
                        valB = new Date(b.date).getTime() || 0;
                    } else if (currentSort.column === 'amount') {
                        valA = Number(a.amount) || 0;
                        valB = Number(b.amount) || 0;
                    } else {
                        valA = (valA || '').toString().toLowerCase();
                        valB = (valB || '').toString().toLowerCase();
                    }

                    if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
                    if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            tbody.innerHTML = sortedTxs.length ? sortedTxs.map(t => `
                <tr>
                    <td>${t.date}</td>
                    <td><span class="badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">${t.type.toUpperCase()}</span></td>
                    <td><strong>${Util.escapeHTML(t.category)}</strong></td>
                    <td>${Util.escapeHTML(t.note || '-')}</td>
                    <td style="font-weight:700; color:${t.type === 'income' ? 'var(--success)' : 'var(--danger)'}">${t.type === 'income' ? '+' : '-'}${Util.idr(t.amount)}</td>
                    <td>
                        <button type="button" data-act="del-tx" data-id="${t.id}" style="color:var(--danger); border:none; background:transparent; cursor:pointer;" title="Delete">
                            <span class="material-icons-round" style="font-size:20px;">delete</span>
                        </button>
                    </td>
                </tr>
            `).join('') : `<tr><td colspan="6" style="text-align:center; padding:20px;">No transactions found for this period.</td></tr>`;
        },

        financialInsight() {
            let i = 0;
            let e = 0;
            AppState.data.transactions.forEach(t => {
                if (Filter.isMatch(t.date)) {
                    const amt = Number(t.amount) || 0;
                    t.type === 'income' ? (i += amt) : (e += amt);
                }
            });

            let msg = '';
            let color = 'var(--primary)';
            let icon = 'psychology';
            if (i === 0 && e === 0) {
                msg = 'No transactions found for this period. Start logging your finances to get insights.';
                color = 'var(--text-muted)';
            } else if (e > i) {
                msg = `<strong>Deficit Alert!</strong> Your expenses (${Util.idr(e)}) have exceeded your income this period.`;
                color = 'var(--danger)';
                icon = 'warning';
            } else {
                const savingRate = ((i - e) / i * 100).toFixed(1);
                if (savingRate >= 20) {
                    msg = `<strong>Excellent Health!</strong> You maintained a <em>Savings Rate</em> of <strong>${savingRate}%</strong>. Keep it up!`;
                    color = 'var(--success)';
                    icon = 'verified';
                } else {
                    msg = `<strong>Fair Condition.</strong> Your <em>Savings Rate</em> is <strong>${savingRate}%</strong>.`;
                    color = 'var(--warning)';
                    icon = 'lightbulb';
                }
            }

            const banner = document.getElementById('financial-insight');
            if (banner) {
                banner.style.borderLeftColor = color;
                const iconBox = banner.querySelector('.icon-box');
                if (iconBox) {
                    iconBox.style.background = color;
                    iconBox.innerHTML = `<span class="material-icons-round">${icon}</span>`;
                }
                const msgEl = document.getElementById('insight-message');
                if (msgEl) msgEl.innerHTML = msg;
            }
        },

        budget() {
            const actuals = {};
            AppState.data.transactions.forEach(t => {
                if (t.type === 'expense' && Filter.isMatch(t.date)) {
                    actuals[t.category] = (actuals[t.category] || 0) + (Number(t.amount) || 0);
                }
            });

            let plansHtml = '';
            let progHtml = '';
            let totTarget = 0;
            let totActual = 0;

            Object.keys(AppState.data.budgets).forEach(cat => {
                const planAmt = AppState.data.budgets[cat];
                const actAmt = actuals[cat] || 0;
                totTarget += planAmt;
                totActual += actAmt;

                const isOvr = actAmt > planAmt;
                const textPct = planAmt > 0 ? ((actAmt / planAmt) * 100).toFixed(0) : 0;
                const barPct = Math.min(textPct, 100);
                const categoryColor = ColorHelper.getColor(cat);
                const barColor = isOvr ? 'var(--danger)' : categoryColor;

                plansHtml += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9rem; border-bottom:1px solid var(--border); padding-bottom:12px; padding-top:4px;"><span><strong>${cat}</strong></span> <div style="display:flex; align-items:center; gap:10px;">${Util.idr(planAmt)} <button type="button" data-act="del-bud" data-cat="${cat}" style="color:var(--danger); display:flex;"><span class="material-icons-round" style="font-size:20px;">cancel</span></button></div></div>`;

                progHtml += `<div>
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600; margin-bottom:8px;">
                        <span>${cat}</span>
                        <span style="color:${isOvr ? 'var(--danger)' : 'var(--text-main)'}">${Util.idr(actAmt)} / ${Util.idr(planAmt)} (${textPct}%)</span>
                    </div>
                    <div class="prog-container">
                        <div class="prog-bar" style="width:${barPct}%; background:${barColor};"></div>
                    </div>
                </div>`;
            });

            if (document.getElementById('list-budget-plans')) {
                document.getElementById('list-budget-plans').innerHTML = plansHtml || `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center;">No budget set.</div>`;
            }
            if (document.getElementById('budget-progress-container')) {
                document.getElementById('budget-progress-container').innerHTML = progHtml || `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center;">No data.</div>`;
            }
            if (document.getElementById('summary-budget')) {
                document.getElementById('summary-budget').innerText = `Total: ${Util.idr(totActual)} / ${Util.idr(totTarget)}`;
            }
            this.budgetSidePanel();
        },

        budgetSidePanel() {
            const catSelect = document.getElementById('ana-category-budget');
            if (!catSelect || !AppState || !AppState.data) return;

            const leftPanel = catSelect.closest('.panel') || catSelect.parentElement.parentElement;
            if (!leftPanel) return;

            const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            let totalIncome = 0;
            let totalExpense = 0;
            let maxExpense = 0;
            let maxExpenseNote = '-';
            const activeMonths = new Set();
            const activeDays = new Set();

            filteredTxs.forEach(t => {
                const amt = Number(t.amount) || 0;
                if (t.type === 'income') {
                    totalIncome += amt;
                } else if (t.type === 'expense') {
                    totalExpense += amt;
                    activeMonths.add(t.date.substring(0, 7));
                    activeDays.add(t.date);
                    if (amt > maxExpense) {
                        maxExpense = amt;
                        maxExpenseNote = t.note ? `${t.category} (${t.note})` : t.category;
                    }
                }
            });

            const fMode = Filter.getMode();
            const isDailyView = (fMode === 'monthly' && Filter.getMonth() !== 'all') || fMode === 'payday' || fMode === 'range';
            const divisor = isDailyView ? (activeDays.size || 1) : (activeMonths.size || 1);
            const avgExpense = totalExpense / divisor;
            const savingsRate = totalIncome > 0 ? (((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1) : 0;

            // 1. Isi 3 kartu ringkasan di dalam panel kiri Planner
            let cards = Array.from(leftPanel.querySelectorAll('.stat-card'));
            if (cards.length < 3) {
                cards = Array.from(leftPanel.querySelectorAll('div')).filter(div =>
                    div.querySelector(':scope > h2') || div.querySelector(':scope > .stat-info > h2')
                );
            }

            if (cards.length >= 3) {
                const h3_0 = cards[0].querySelector('h3');
                const h2_0 = cards[0].querySelector('h2');
                if (h3_0) h3_0.textContent = isDailyView ? 'RATA-RATA PENGELUARAN / HARI' : 'RATA-RATA PENGELUARAN / BULAN';
                if (h2_0) h2_0.textContent = Util.idr(avgExpense);

                const h2_1 = cards[1].querySelector('h2');
                const p_1 = cards[1].querySelector('p');
                if (h2_1) h2_1.textContent = Util.idr(maxExpense);
                if (p_1) p_1.textContent = maxExpenseNote;

                const h2_2 = cards[2].querySelector('h2');
                if (h2_2) h2_2.textContent = `${savingsRate}%`;
            }

            // 2. Render Grafik Kategori di panel kiri Planner
            const canvas = leftPanel.querySelector('canvas');
            if (canvas && typeof window.Chart !== 'undefined') {
                if (!catSelect.dataset.bound) {
                    catSelect.addEventListener('change', () => this.budgetSidePanel());
                    catSelect.dataset.bound = 'true';
                }

                if (canvas.offsetParent === null) return;
                if (canvas.parentElement && canvas.parentElement.clientHeight < 100) {
                    canvas.parentElement.style.height = '220px';
                    canvas.parentElement.style.position = 'relative';
                }

                const selectedCat = catSelect.value;
                const dMap = {};
                filteredTxs
                    .filter(t => t.category === selectedCat)
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .forEach(t => {
                        const key = isDailyView ? t.date : t.date.substring(0, 7);
                        dMap[key] = (dMap[key] || 0) + (Number(t.amount) || 0);
                    });

                if (Charts.inst.budgetCat) Charts.inst.budgetCat.destroy();
                const isInc = AppState.data.categories.income.includes(selectedCat);
                const color = isInc ? '#10b981' : '#f59e0b';

                Charts.inst.budgetCat = new window.Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: Object.keys(dMap).length ? Object.keys(dMap) : ['No Data'],
                        datasets: [{
                            label: selectedCat,
                            data: Object.values(dMap).length ? Object.values(dMap) : [0],
                            borderColor: color,
                            backgroundColor: color + '26',
                            borderWidth: 2.5,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { grid: { color: Charts.getGridColor() }, beginAtZero: true },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        },

        subscriptions() {
            let totalMonthly = 0;
            const html = AppState.data.subscriptions.map(s => {
                const monthlyCost = s.cycle === 'yearly' ? s.price / 12 : s.price;
                if (s.active) totalMonthly += monthlyCost;
                return `<tr><td><strong>${Util.escapeHTML(s.name)}</strong></td><td>${Util.idr(s.price)}</td><td><span class="badge ${s.cycle === 'yearly' ? 'badge-buy' : 'badge-expense'}">${s.cycle}</span></td><td style="font-weight:600; color:var(--text-main)">${Util.idr(monthlyCost)} / mo</td><td style="white-space:nowrap;">${s.active ? `<button type="button" data-act="pay-sub" data-id="${s.id}" class="badge badge-pay" style="margin-right:12px;" title="Record Expense Now"><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">payment</span> PAY NOW</button>` : ''}<button type="button" data-act="toggle-sub" data-id="${s.id}" class="badge ${s.active ? 'badge-active' : 'badge-inactive'}" style="margin-right:8px; width:70px;">${s.active ? 'ACTIVE' : 'PAUSED'}</button> <button type="button" data-act="del-sub" data-id="${s.id}" style="color:var(--danger); vertical-align:middle;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');

            const activeCount = AppState.data.subscriptions.filter(x => x.active).length;
            const pausedCount = AppState.data.subscriptions.length - activeCount;

            if (document.getElementById('tbody-subs')) {
                document.getElementById('tbody-subs').innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:20px;">No recurring bills recorded.</td></tr>';
            }
            if (document.getElementById('sub-monthly-cost')) {
                document.getElementById('sub-monthly-cost').innerText = Util.idr(totalMonthly);
            }
            if (document.getElementById('summary-subs')) {
                document.getElementById('summary-subs').innerText = `Active: ${activeCount} | Paused: ${pausedCount}`;
            }
        },

        savings() {
            let totTarget = 0;
            let totCurrent = 0;
            const sHtml = AppState.data.savings.map(s => {
                totTarget += s.target;
                totCurrent += s.current;
                const pct = Math.min((s.current / s.target) * 100, 100).toFixed(0);
                return `<tr><td><strong style="font-size:1.05rem;">${Util.escapeHTML(s.name)}</strong><br><span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${Util.idr(s.current)} / ${Util.idr(s.target)} (${pct}%)</span><div class="prog-container" style="margin-top:10px;"><div class="prog-bar" style="width:${pct}%; background:var(--success);"></div></div></td><td style="white-space:nowrap; vertical-align:middle;"><button type="button" data-act="add-sav" data-id="${s.id}" style="color:var(--primary); margin-right:10px; background:var(--primary-light); padding:10px; border-radius:8px;" title="Add Funds"><span class="material-icons-round" style="font-size:20px;">add</span></button> <button type="button" data-act="del-sav" data-id="${s.id}" style="color:var(--danger); padding:8px;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');
            if (document.getElementById('tbody-savings')) {
                document.getElementById('tbody-savings').innerHTML = sHtml || '<tr><td colspan="2" style="text-align:center; padding:30px;">No savings goals created.</td></tr>';
            }
            if (document.getElementById('summary-sav')) {
                document.getElementById('summary-sav').innerText = `Total Saved: ${Util.idr(totCurrent)} / ${Util.idr(totTarget)}`;
            }

            let totWish = 0;
            const wHtml = AppState.data.wishlist.map(w => {
                const isBought = w.status === 'bought';
                if (!isBought) totWish += w.price;
                return `<tr><td><strong style="font-size:1.05rem; ${isBought ? 'text-decoration:line-through; color:var(--text-muted)' : ''}">${Util.escapeHTML(w.name)}</strong>${w.link ? `<br><a href="${w.link}" target="_blank" style="font-size:0.8rem; color:var(--primary);">View Item</a>` : ''}</td><td>${Util.idr(w.price)}</td><td style="white-space:nowrap; vertical-align:middle;">${!isBought ? `<button type="button" data-act="buy-wish" data-id="${w.id}" class="badge badge-pay" style="margin-right:10px; background:var(--success); color:white;"><span class="material-icons-round" style="font-size:14px; vertical-align:middle;">shopping_bag</span> MARK BOUGHT</button>` : `<span class="badge" style="background:var(--bg-card); color:var(--text-muted); margin-right:10px;">BOUGHT</span>`} <button type="button" data-act="del-wish" data-id="${w.id}" style="color:var(--danger); vertical-align:middle;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');
            if (document.getElementById('tbody-wishlist')) {
                document.getElementById('tbody-wishlist').innerHTML = wHtml || '<tr><td colspan="3" style="text-align:center; padding:30px;">Your wishlist is empty.</td></tr>';
            }
            if (document.getElementById('summary-wish')) {
                document.getElementById('summary-wish').innerText = `Total Pending Cost: ${Util.idr(totWish)}`;
            }
        },

        analytics() {
            if (!AppState || !AppState.data) return;

            const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            let totalIncome = 0;
            let countIncome = 0;
            let totalExpense = 0;
            let countExpense = 0;

            const periodMap = {};
            const expenseByCat = {};

            const fMonth = Filter.getMonth();
            const fMode = Filter.getMode();
            const isDailyView = (fMonth !== 'all' || fMode === 'range' || fMode === 'payday');

            filteredTxs.forEach(t => {
                const amt = Number(t.amount) || 0;
                const key = isDailyView ? t.date : t.date.substring(0, 7);

                if (!periodMap[key]) periodMap[key] = { income: 0, expense: 0 };

                if (t.type === 'income') {
                    totalIncome += amt;
                    countIncome++;
                    periodMap[key].income += amt;
                } else {
                    totalExpense += amt;
                    countExpense++;
                    periodMap[key].expense += amt;
                    expenseByCat[t.category] = (expenseByCat[t.category] || 0) + amt;
                }
            });

            const netAmount = totalIncome - totalExpense;
            const savingsRate = totalIncome > 0 ? ((netAmount / totalIncome) * 100).toFixed(1) : 0;
            const activePeriodsCount = Object.keys(periodMap).length || 1;
            const avgNet = netAmount / activePeriodsCount;

            // 1. Update Header Badge & 4 Summary Cards
            const periodBadge = document.getElementById('ana-period-badge');
            if (periodBadge) periodBadge.textContent = `${Filter.getSummaryText()} • in IDR`;

            const elInc = document.getElementById('ana-total-income');
            if (elInc) elInc.textContent = Util.idr(totalIncome);
            const elIncTrx = document.getElementById('ana-income-trx');
            if (elIncTrx) elIncTrx.textContent = `${countIncome} transactions`;

            const elExp = document.getElementById('ana-total-expense');
            if (elExp) elExp.textContent = Util.idr(totalExpense);
            const elExpTrx = document.getElementById('ana-expense-trx');
            if (elExpTrx) elExpTrx.textContent = `${countExpense} transactions`;

            const elNet = document.getElementById('ana-net-amount');
            if (elNet) {
                elNet.textContent = `${netAmount >= 0 ? '+' : ''}${Util.idr(netAmount)}`;
                elNet.style.color = netAmount >= 0 ? 'var(--info)' : 'var(--danger)';
            }

            const elRate = document.getElementById('ana-savings-rate');
            if (elRate) {
                elRate.textContent = `${savingsRate}%`;
                elRate.style.color = Number(savingsRate) >= 20 ? 'var(--success)' : 'var(--primary)';
            }
            const elAvgNet = document.getElementById('ana-avg-net');
            if (elAvgNet) elAvgNet.textContent = `Avg Net: ${Util.idr(avgNet)} / ${isDailyView ? 'day' : 'mo'}`;

            // 2. Update Tabel Period Performance Summary
            const tbodyPerf = document.getElementById('tbody-monthly-perf');
            if (tbodyPerf) {
                const sortedKeys = Object.keys(periodMap).sort().reverse();
                tbodyPerf.innerHTML = sortedKeys.length ? sortedKeys.map(k => {
                    const row = periodMap[k];
                    const rowNet = row.income - row.expense;
                    return `
                        <tr>
                            <td><strong>${k}</strong></td>
                            <td style="color: var(--success); font-weight: 600;">+${Util.idr(row.income)}</td>
                            <td style="color: var(--danger); font-weight: 600;">-${Util.idr(row.expense)}</td>
                            <td style="color: ${rowNet >= 0 ? 'var(--info)' : 'var(--danger)'}; font-weight: 700;">
                                ${rowNet >= 0 ? '+' : ''}${Util.idr(rowNet)}
                            </td>
                        </tr>
                    `;
                }).join('') : `<tr><td colspan="4" style="text-align:center; padding:16px;">No data for selected period.</td></tr>`;
            }

            // 3. Render Grafik Analytics (Line Chart Income vs Expense, Donut Breakdown, Category Detailed Trend)
            Charts.renderAnalyticsCharts(periodMap, expenseByCat, isDailyView);
            Charts.renderDetail();
        },

        settings() {
            const rTag = (arr, id, mType, sType) => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = arr.map((item, i) =>
                        `<div style="display:flex; align-items:center; gap:8px; background:var(--bg-body); border:1px solid var(--border); padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600;">${Util.escapeHTML(item)} <button type="button" data-act="del-setting" data-idx="${i}" data-m="${mType}" data-s="${sType || ''}" style="color:var(--danger); display:flex;"><span class="material-icons-round" style="font-size:16px;">close</span></button></div>`
                    ).join('');
                }
            };
            rTag(AppState.data.categories.expense, 'list-cat-expense', 'categories', 'expense');
            rTag(AppState.data.categories.income, 'list-cat-income', 'categories', 'income');
        }
    };
    window.Render = Render;
    window.RenderApp = Render;

    // ========================================================================
    // 7. AUTHENTICATION & NAVIGATION EVENT LISTENERS
    // ========================================================================
    if (document.getElementById('btn-toggle-pwd')) {
        document.getElementById('btn-toggle-pwd').addEventListener('click', function() {
            const pwdInput = document.getElementById('login-password');
            const icon = this.querySelector('.material-icons-round');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                pwdInput.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    }

    if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = btoa(document.getElementById('login-username').value);
            const p = btoa(document.getElementById('login-password').value);

            if (u === U_HASH && p === P_HASH) {
                const btnLogin = e.target.querySelector('button[type="submit"]');
                const oldText = btnLogin.innerText;
                btnLogin.innerText = 'Syncing from Cloud...';
                btnLogin.disabled = true;
                try {
                    await AppState.init();
                } catch (error) {
                    console.error('Sistem memaksa masuk melewati error:', error);
                } finally {
                    document.getElementById('login-screen').style.display = 'none';
                    document.getElementById('app-wrapper').style.display = 'flex';
                    Render.initTimeMachine();
                    Render.all();
                    btnLogin.innerText = oldText;
                    btnLogin.disabled = false;
                    document.getElementById('login-username').value = '';
                    document.getElementById('login-password').value = '';
                }
            } else {
                document.getElementById('login-error').style.display = 'block';
            }
        });
    }

    if (document.getElementById('btn-logout')) {
        document.getElementById('btn-logout').addEventListener('click', () => {
            UI.modal.show({
                title: 'Lock Vault?',
                icon: 'lock',
                bodyHTML: 'Your session will end and the application will be locked.',
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    { text: 'Lock Now', class: 'btn-danger', onClick: () => { location.reload(); } }
                ]
            });
        });
    }

    DOM.navs.forEach(l => l.addEventListener('click', e => {
        e.preventDefault();
        DOM.views.forEach(v => v.classList.remove('active'));
        DOM.navs.forEach(n => n.classList.remove('active'));

        const target = e.currentTarget.dataset.target;
        const targetEl = document.getElementById(target);
        if (targetEl) targetEl.classList.add('active');
        e.currentTarget.classList.add('active');
        if (document.getElementById('page-title')) {
            document.getElementById('page-title').innerText = e.currentTarget.dataset.title;
        }
        if (target === 'view-analytics') {
            setTimeout(() => Render.analytics(), 50);
        }
        if (target === 'view-dashboard') {
            setTimeout(() => {
                Charts.renderDash();
                Charts.renderPie();
                Render.financialInsight();
            }, 50);
        }
        if (target === 'view-budget' || target === 'view-planner') {
            setTimeout(() => Render.budget(), 50);
        }
    }));

    // ========================================================================
    // 8. TIME MACHINE & THEME TOGGLE
    // ========================================================================
    const triggerTimeMachine = () => {
        syncFilterInputsVisibility();
        const mode = Filter.getMode();
        const y = Filter.getYear();
        const m = Filter.getMonth();
        AppState.selectedMonth = (mode === 'monthly' && y !== 'all' && m !== 'all') ? `${y}-${m}` : '0000-00';
        Render.all();
        UI.toast(`Viewing Data: ${Filter.getSummaryText()}`, 'success');
    };

    ['filter-mode', 'filter-year', 'filter-month', 'filter-start', 'filter-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', triggerTimeMachine);
    });

    if (document.getElementById('btn-theme-toggle')) {
        document.getElementById('btn-theme-toggle').addEventListener('click', () => {
            const isD = document.body.getAttribute('data-theme') === 'dark';
            document.body.setAttribute('data-theme', isD ? 'light' : 'dark');
            if (document.getElementById('theme-icon')) {
                document.getElementById('theme-icon').innerText = isD ? 'dark_mode' : 'light_mode';
            }
            Charts.init();
            Render.analytics();
        });
    }

    if (document.getElementById('ana-category')) {
        document.getElementById('ana-category').addEventListener('change', () => Charts.renderDetail());
    }

    // ========================================================================
    // 9. FORMS & CRUD HANDLERS
    // ========================================================================
    if (document.getElementById('form-add-tx')) {
        document.getElementById('form-add-tx').addEventListener('submit', e => {
            e.preventDefault();
            const amountInput = document.getElementById('add-amount');
            const noteInput = document.getElementById('add-note');
            const amt = Number(amountInput.value);
            if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid amount', 'error');

            const lastType = document.getElementById('add-type').value;
            const lastCategory = document.getElementById('add-category').value;
            if (!AppState.data.categories[lastType].includes(lastCategory)) return UI.toast('Category mismatch!', 'error');

            const inputDate = document.getElementById('add-date').value;
            AppState.data.transactions.push({
                id: Util.id('TX'),
                date: inputDate,
                timestamp: Date.now(),
                type: lastType,
                category: lastCategory,
                amount: amt,
                note: noteInput.value
            });
            AppState.save();
            Render.all();

            const newTypeInput = document.getElementById('add-type');
            const newCategoryInput = document.getElementById('add-category');
            const newDateInput = document.getElementById('add-date');
            if (newTypeInput && newCategoryInput) {
                newDateInput.value = inputDate;
                newTypeInput.value = lastType;
                renderCategoryByType(lastType);
                newCategoryInput.value = lastCategory;
            }
            document.getElementById('add-amount').value = '';
            document.getElementById('add-note').value = '';
            const helper = document.getElementById('helper-add-amount');
            if (helper) helper.innerText = '';
            UI.toast('Transaction Saved');
        });
    }

    if (document.getElementById('form-budget')) {
        document.getElementById('form-budget').addEventListener('submit', e => {
            e.preventDefault();
            const amt = Number(document.getElementById('bud-amount').value);
            if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid limit amount', 'error');
            AppState.data.budgets[document.getElementById('bud-cat').value] = amt;
            AppState.save();
            e.target.reset();
            const helper = document.getElementById('helper-bud-amount');
            if (helper) helper.innerText = '';
            Render.budget();
            UI.toast('Target Budget Updated');
        });
    }

    if (document.getElementById('form-add-sub')) {
        document.getElementById('form-add-sub').addEventListener('submit', e => {
            e.preventDefault();
            const prc = Number(document.getElementById('sub-price').value);
            if (!Number.isFinite(prc) || prc <= 0) return UI.toast('Invalid bill amount', 'error');
            AppState.data.subscriptions.push({
                id: Util.id('SUB'),
                name: document.getElementById('sub-name').value,
                price: prc,
                cycle: document.getElementById('sub-cycle').value,
                active: true
            });
            AppState.save();
            e.target.reset();
            const helper = document.getElementById('helper-sub-price');
            if (helper) helper.innerText = '';
            Render.subscriptions();
            UI.toast('Subscription Added');
        });
    }

    if (document.getElementById('form-add-saving')) {
        document.getElementById('form-add-saving').addEventListener('submit', e => {
            e.preventDefault();
            const tgt = Number(document.getElementById('sav-target').value);
            if (!Number.isFinite(tgt) || tgt <= 0) return UI.toast('Invalid target amount', 'error');
            AppState.data.savings.push({
                id: Util.id('SAV'),
                name: document.getElementById('sav-name').value,
                target: tgt,
                current: 0
            });
            AppState.save();
            e.target.reset();
            const helper = document.getElementById('helper-sav-target');
            if (helper) helper.innerText = '';
            Render.savings();
            UI.toast('Savings Goal Created');
        });
    }

    if (document.getElementById('form-add-wishlist')) {
        document.getElementById('form-add-wishlist').addEventListener('submit', e => {
            e.preventDefault();
            const prc = Number(document.getElementById('wish-price').value);
            if (!Number.isFinite(prc) || prc <= 0) return UI.toast('Invalid estimated price', 'error');
            const linkUrl = document.getElementById('wish-link').value;
            AppState.data.wishlist.push({
                id: Util.id('WSH'),
                name: document.getElementById('wish-name').value,
                price: prc,
                link: linkUrl,
                status: 'pending'
            });
            AppState.save();
            e.target.reset();
            const helper = document.getElementById('helper-wish-price');
            if (helper) helper.innerText = '';
            Render.savings();
            UI.toast('Wishlist Item Added');
        });
    }

    const bindSet = (formId, inputId, mainKey, subKey) => {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const val = document.getElementById(inputId).value.trim();
            if (!val) return;
            const targetArr = subKey ? AppState.data[mainKey][subKey] : AppState.data[mainKey];
            if (!targetArr.includes(val)) {
                targetArr.push(val);
                AppState.save();
                Render.settings();
                Render.updateDropdowns();
                e.target.reset();
                UI.toast('Category added successfully!', 'success');
            } else {
                UI.toast('Category already exists!', 'error');
            }
        });
    };
    bindSet('form-setting-expense', 'new-cat-expense', 'categories', 'expense');
    bindSet('form-setting-income', 'new-cat-income', 'categories', 'income');

    document.body.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.act) return;
        const act = btn.dataset.act;
        const id = btn.dataset.id;

        if (act === 'del-tx') {
            UI.modal.show({
                title: 'Delete Transaction?',
                icon: 'warning',
                bodyHTML: 'Are you sure you want to delete this record? Your balance will automatically adjust.',
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Yes, Delete',
                        class: 'btn-danger',
                        onClick: () => {
                            const tx = AppState.data.transactions.find(t => t.id === id);
                            if (tx && tx.linkedSavId) {
                                const targetSav = AppState.data.savings.find(s => s.id === tx.linkedSavId);
                                if (targetSav) {
                                    targetSav.current -= tx.amount;
                                    if (targetSav.current < 0) targetSav.current = 0;
                                }
                            }
                            AppState.data.transactions = AppState.data.transactions.filter(t => t.id !== id);
                            AppState.save();
                            Render.all();
                            UI.toast('Transaction Deleted & Progress Adjusted');
                        }
                    }
                ]
            });
        }

        if (act === 'del-bud') {
            delete AppState.data.budgets[btn.dataset.cat];
            AppState.save();
            Render.budget();
        }

        if (act === 'del-sav') {
            const s = AppState.data.savings.find(x => x.id === id);
            if (!s) return;
            let bodyMsg = `Are you sure you want to delete savings goal <strong>${Util.escapeHTML(s.name)}</strong>?`;
            if (s.current > 0) {
                bodyMsg += `<br><br><span style="color:var(--success); font-weight:600; display:block; padding:10px; background:var(--primary-light); border-radius:6px;">Accumulated funds of ${Util.idr(s.current)} will be automatically refunded.</span>`;
            }

            UI.modal.show({
                title: 'Delete Savings Goal?',
                icon: 'warning',
                bodyHTML: bodyMsg,
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Yes, Delete',
                        class: 'btn-danger',
                        onClick: () => {
                            if (s.current > 0) {
                                AppState.data.transactions.push({
                                    id: Util.id('TX'),
                                    date: Util.date(),
                                    timestamp: Date.now(),
                                    type: 'income',
                                    category: 'Other',
                                    amount: s.current,
                                    note: `[Refund] Savings Cancelled: ${s.name}`
                                });
                            }
                            AppState.data.savings = AppState.data.savings.filter(x => x.id !== id);
                            AppState.save();
                            Render.all();
                            if (s.current > 0) UI.toast(`Goal deleted & ${Util.idr(s.current)} refunded!`, 'success');
                            else UI.toast('Savings Goal Deleted', 'success');
                        }
                    }
                ]
            });
        }

        if (act === 'del-wish') {
            AppState.data.wishlist = AppState.data.wishlist.filter(w => w.id !== id);
            AppState.save();
            Render.all();
            UI.toast('Wishlist Item Deleted');
        }

        if (act === 'del-sub') {
            AppState.data.subscriptions = AppState.data.subscriptions.filter(s => s.id !== id);
            AppState.save();
            Render.subscriptions();
        }

        if (act === 'toggle-sub') {
            const s = AppState.data.subscriptions.find(x => x.id === id);
            s.active = !s.active;
            AppState.save();
            Render.subscriptions();
            UI.toast(s.active ? 'Subscription Activated' : 'Subscription Paused');
        }

        if (act === 'pay-sub') {
            const s = AppState.data.subscriptions.find(x => x.id === id);
            UI.modal.show({
                title: 'Pay this Bill?',
                icon: 'payment',
                bodyHTML: `The system will auto-record an expense of <strong>${Util.idr(s.price)}</strong> into your Fiat Transactions for <strong>TODAY</strong>. Proceed?`,
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Pay Now',
                        class: 'btn-primary',
                        onClick: () => {
                            const todayDate = Util.date();
                            AppState.data.transactions.push({
                                id: Util.id('TX'),
                                date: todayDate,
                                timestamp: Date.now(),
                                type: 'expense',
                                category: 'Utility',
                                amount: s.price,
                                note: `Auto-Pay Bill: ${s.name}`
                            });
                            const curMonth = todayDate.substring(0, 7);
                            if (document.getElementById('filter-year')) document.getElementById('filter-year').value = curMonth.substring(0, 4);
                            if (document.getElementById('filter-month')) {
                                document.getElementById('filter-month').value = curMonth.substring(5, 7);
                                document.getElementById('filter-month').disabled = false;
                                document.getElementById('filter-month').style.opacity = '1';
                            }
                            AppState.selectedMonth = curMonth;
                            AppState.save();
                            Render.all();
                            UI.toast('Paid successfully! Jumped to current month.');
                        }
                    }
                ]
            });
        }

        if (act === 'del-setting') {
            const { m, s, idx } = btn.dataset;
            const tArr = s ? AppState.data[m][s] : AppState.data[m];
            if (tArr.length <= 1) return UI.toast('Warning: At least 1 item is required.', 'error');
            const deletedItem = tArr[idx];
            tArr.splice(idx, 1);
            if (m === 'categories' && s === 'expense' && AppState.data.budgets[deletedItem]) {
                delete AppState.data.budgets[deletedItem];
            }
            AppState.save();
            Render.settings();
            Render.updateDropdowns();
            Render.budget();
        }

        if (act === 'add-sav') {
            const s = AppState.data.savings.find(x => x.id === id);
            UI.modal.show({
                title: `Add Funds: ${Util.escapeHTML(s.name)}`,
                icon: 'add_circle',
                bodyHTML: `<p>Current Progress: ${Util.idr(s.current)} / ${Util.idr(s.target)}</p><br><div class="form-group"><input type="number" id="modal-sav-input" class="form-control" placeholder="Amount Added (IDR)" min="1"><span class="format-helper" id="helper-modal-sav" style="display:block; margin-top:4px;"></span></div>`,
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Add Funds',
                        class: 'btn-primary',
                        onClick: () => {
                            const amt = Number(document.getElementById('modal-sav-input').value);
                            if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid Amount', 'error');
                            s.current += amt;
                            const todayDate = Util.date();
                            AppState.data.transactions.push({
                                id: Util.id('TX'),
                                date: todayDate,
                                timestamp: Date.now(),
                                type: 'expense',
                                category: 'Other',
                                amount: amt,
                                note: `Saving Deposit: ${s.name}`,
                                linkedSavId: s.id
                            });
                            AppState.save();
                            Render.all();
                            UI.toast('Funds Added & Transaction Logged');
                        }
                    }
                ]
            });
            setTimeout(() => UI.bindFormatHelper('modal-sav-input', 'helper-modal-sav'), 100);
        }

        if (act === 'buy-wish') {
            const w = AppState.data.wishlist.find(x => x.id === id);
            UI.modal.show({
                title: 'Mark as Bought?',
                icon: 'shopping_bag',
                bodyHTML: `Did you purchase <strong>${Util.escapeHTML(w.name)}</strong> for ${Util.idr(w.price)}?<br><br><span style="font-size:0.85rem; color:var(--text-muted);">This will automatically log a "Shopping" expense for <strong>TODAY</strong>.</span>`,
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Confirm Purchase',
                        class: 'btn-success',
                        onClick: () => {
                            w.status = 'bought';
                            const todayDate = Util.date();
                            AppState.data.transactions.push({
                                id: Util.id('TX'),
                                date: todayDate,
                                timestamp: Date.now(),
                                type: 'expense',
                                category: 'Shopping',
                                amount: w.price,
                                note: `Wishlist: ${w.name}`
                            });
                            const curMonth = todayDate.substring(0, 7);
                            if (document.getElementById('filter-year')) document.getElementById('filter-year').value = curMonth.substring(0, 4);
                            if (document.getElementById('filter-month')) {
                                document.getElementById('filter-month').value = curMonth.substring(5, 7);
                                document.getElementById('filter-month').disabled = false;
                                document.getElementById('filter-month').style.opacity = '1';
                            }
                            AppState.selectedMonth = curMonth;
                            AppState.save();
                            Render.all();
                            UI.toast(`Enjoy your new ${w.name}! Jumped to current month.`);
                        }
                    }
                ]
            });
        }
    });

// ========================================================================
    // 10. BACKUP, RESTORE, EXPORT & SYSTEM SETTINGS
    // ========================================================================
    if (document.getElementById('btn-reset-data')) {
        document.getElementById('btn-reset-data').addEventListener('click', () => {
            UI.modal.show({
                title: 'WIPE ALL DATA',
                icon: 'warning',
                bodyHTML: '<p style="color:var(--danger); font-weight:bold;">WARNING!</p><p>Type "WIPE" below if you want to permanently format/delete the entire application data.</p><div class="form-group" style="margin-top:16px;"><input type="text" id="modal-wipe-input" class="form-control" placeholder="WIPE"></div>',
                buttons: [
                    { text: 'Cancel', class: 'btn-cancel' },
                    {
                        text: 'Destroy Data',
                        class: 'btn-danger',
                        onClick: async () => {
                            const confirmText = document.getElementById('modal-wipe-input').value;
                            if (confirmText === 'WIPE') {
                                AppState.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
                                await AppState.save();
                                UI.toast('All data has been permanently wiped!', 'success');
                                setTimeout(() => location.reload(), 1500);
                            } else {
                                UI.toast('Deletion cancelled. Type WIPE in uppercase.', 'error');
                            }
                        }
                    }
                ]
            });
        });
    }

    if (document.getElementById('btn-export-csv')) {
        document.getElementById('btn-export-csv').addEventListener('click', () => {
            const filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            if (!filteredTxs.length) return UI.toast('No transaction data for this period to export', 'error');
            const csvContent = 'Date,Type,Category,Amount,Note\n' + filteredTxs.map(t => {
                const safeNote = t.note ? t.note.replace(/"/g, '""').replace(/\n/g, ' ') : '';
                return `${t.date},${t.type},${t.category},${t.amount},"${safeNote}"`;
            }).join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const l = document.createElement('a');
            l.style.display = 'none';
            l.href = url;
            const timeSummary = Filter.getSummaryText().replace(/[^a-zA-Z0-9]/g, '_');
            l.download = `YourVault_Trx_${timeSummary}_${Util.date()}.csv`;
            document.body.appendChild(l);
            l.click();
            setTimeout(() => {
                document.body.removeChild(l);
                URL.revokeObjectURL(url);
            }, 100);
            UI.toast('Filtered CSV Export Downloaded!', 'success');
        });
    }

    if (document.getElementById('btn-export-json')) {
        document.getElementById('btn-export-json').addEventListener('click', () => {
            const dataStr = JSON.stringify(AppState.data, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const l = document.createElement('a');
            l.style.display = 'none';
            l.href = url;
            l.download = `YourVault_Backup_${Util.date()}.json`;
            document.body.appendChild(l);
            l.click();
            setTimeout(() => {
                document.body.removeChild(l);
                URL.revokeObjectURL(url);
            }, 100);
            UI.toast('Full Backup Downloaded!', 'success');
        });
    }

    if (document.getElementById('btn-trigger-import')) {
        document.getElementById('btn-trigger-import').addEventListener('click', () => {
            const fileInput = document.getElementById('file-import-json');
            if (fileInput) {
                fileInput.value = '';
                fileInput.click();
            }
        });
    }

    if (document.getElementById('file-import-json')) {
        document.getElementById('file-import-json').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(event) {
                try {
                    const importedData = JSON.parse(event.target.result);
                    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
                    if (!isRecord(importedData)) {
                        UI.toast('Corrupted or invalid JSON file.', 'error');
                        return;
                    }

                    const currentData = AppState.data || {};
                    const newTransactions = importedData.transactions ?? importedData.Transactions ?? [];
                    const importedSavings = importedData.savings ?? [];
                    const importedWishlist = importedData.wishlist ?? [];
                    const importedSubscriptions = importedData.subscriptions ?? [];
                    const importedBudgets = importedData.budgets ?? {};
                    const importedCategories = importedData.categories;

                    const validCollections = Array.isArray(newTransactions)
                        && Array.isArray(importedSavings)
                        && Array.isArray(importedWishlist)
                        && Array.isArray(importedSubscriptions)
                        && isRecord(importedBudgets);
                    const validCategories = importedCategories == null
                        || (isRecord(importedCategories)
                            && Array.isArray(importedCategories.income)
                            && Array.isArray(importedCategories.expense));

                    if (!validCollections || !validCategories) {
                        UI.toast('Backup structure is invalid. No data was changed.', 'error');
                        return;
                    }

                    if (typeof UI !== 'undefined' && UI.modal) UI.modal.close();
                    const finalData = {
                        transactions: [...(currentData.transactions || []), ...newTransactions],
                        savings: [...(currentData.savings || []), ...importedSavings],
                        wishlist: [...(currentData.wishlist || []), ...importedWishlist],
                        subscriptions: [...(currentData.subscriptions || []), ...importedSubscriptions],
                        budgets: { ...(currentData.budgets || {}), ...importedBudgets },
                        categories: importedCategories || currentData.categories || DEFAULT_DATA.categories
                    };
                        AppState.data = finalData;

                        if (newTransactions.length > 0) {
                            const sortedTx = [...newTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
                            const latestTxDate = new Date(sortedTx[0].date);
                            if (!isNaN(latestTxDate)) {
                                const targetMonth = String(latestTxDate.getMonth() + 1).padStart(2, '0');
                                const targetYear = latestTxDate.getFullYear().toString();
                                const selectMonth = document.getElementById('filter-month');
                                const selectYear = document.getElementById('filter-year');
                                if (selectYear) selectYear.value = targetYear;
                                if (selectMonth) selectMonth.value = targetMonth;
                            }
                        }
                        Render.initTimeMachine();
                        Render.all();
                        UI.toast(`Successfully loaded ${newTransactions.length} historical transactions!`, 'success');
                        await AppState.save();
                } catch (err) {
                    console.error('Error saat import:', err);
                    UI.toast('Failed to read backup file.', 'error');
                }
            };
            reader.onerror = () => UI.toast('Unable to read the selected backup file.', 'error');
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    const btnLockMobile = document.getElementById('btn-lock-mobile');
    if (btnLockMobile) {
        btnLockMobile.addEventListener('click', () => {
            const logoutBtn = document.getElementById('btn-logout');
            if (logoutBtn) logoutBtn.click();
        });
    }

    if (document.getElementById('gh-token')) {
        document.getElementById('gh-token').value = localStorage.getItem('vault_gh_token') || '';
    }
    if (document.getElementById('gh-gist-id')) {
        document.getElementById('gh-gist-id').value = localStorage.getItem('vault_gh_gist_id') || '';
    }
    if (document.getElementById('btn-save-gh')) {
        document.getElementById('btn-save-gh').addEventListener('click', async () => {
            const token = document.getElementById('gh-token').value.trim();
            const gistId = document.getElementById('gh-gist-id').value.trim();
            if (!token || !gistId) {
                UI.toast('Token and Gist ID cannot be empty!', 'error');
                return;
            }

            localStorage.setItem('vault_gh_token', token);
            localStorage.setItem('vault_gh_gist_id', gistId);
            UI.toast('Cloud config saved! Reloading...', 'success');
            await AppState.init();
            Render.all();
        });
    }

    window.toggleFilterSheet = function() {
        const timeMachine = document.querySelector('.time-machine-group');
        const overlay = document.getElementById('sheet-overlay');
        if (timeMachine) timeMachine.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    };

    const overlayElement = document.getElementById('sheet-overlay');
    if (overlayElement) overlayElement.addEventListener('click', window.toggleFilterSheet);

    const filterModeEl = document.getElementById('filter-mode');
    if (filterModeEl) {
        const adjustDropdownWidth = () => {
            filterModeEl.style.width = filterModeEl.value === 'range' ? '115px' : 'auto';
            if (typeof syncTimeMachineFilterUI === 'function') {
                syncTimeMachineFilterUI();
            }
        };
        adjustDropdownWidth();
        filterModeEl.addEventListener('change', adjustDropdownWidth);
    }
});


// ============================================================================
// 11. RESPONSIVE CHART RESIZE & DEFAULT DATE
// ============================================================================
const resizeAllCharts = () => {
    if (typeof window.ChartsApp !== 'undefined' && window.ChartsApp.inst) {
        const { dash, pie, detail, incExpLine, anaDonut, budgetCat } = window.ChartsApp.inst;
        if (dash) dash.resize();
        if (pie) pie.resize();
        if (detail) detail.resize();
        if (incExpLine) incExpLine.resize();
        if (anaDonut) anaDonut.resize();
        if (budgetCat) budgetCat.resize();
    }
};

const sidebarEl = document.getElementById('sidebar');
if (sidebarEl) {
    sidebarEl.addEventListener('transitionend', resizeAllCharts);
}
window.addEventListener('resize', resizeAllCharts);

const now = new Date();
const today = getLocalDateString(now);
const fiatDateInput = document.getElementById('add-date');
if (fiatDateInput && !fiatDateInput.value) fiatDateInput.value = today;


// ============================================================================
// 12. SMART AI PARSER (CONTAINER-AWARE, VOICE-READY & ZERO-EMPTY-NOTE)
// ============================================================================
const SmartAI = {
    apiKey: 'AQ.Ab8RN6IOB5CBJ7hVdOdXHK7Zi9baiUNTye3JqPShSWoDdP2PoA',

    getRelativeDate(offsetDays = 0) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    buildFallbackNote(rawText, category = 'Other') {
        let cleaned = (rawText || '')
            .replace(/^(tanggal\s+\d+\s+[a-z]+\s+\d{4}|kemarin\s+lusa|kemarin|tadi|barusan|hari\s+ini)\s*/i, '')
            .replace(/\b(saya|aku|gue|beli|membeli|bayar|membayar|transfer|tf|dengan|harga|seharga|sebesar|senilai|uang|rp|rupiah|di)\b/gi, ' ')
            .replace(/\b(\d+([.,]\d+)?\s*(rb|ribu|jt|juta|k|m)?|satu|sejuta|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|juta|setengah)\b/gi, ' ')
            .replace(/[,.-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleaned || cleaned.length < 2) {
            return `${category} Transaction`;
        }
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    },

    // Fallback offline jika API Gemini gagal/lambat agar form & deskripsi tetap terisi
    localFallbackParse(text) {
        const lower = text.toLowerCase();
        let date = this.getRelativeDate(0);

        if (lower.includes('kemarin lusa')) {
            date = this.getRelativeDate(-2);
        } else if (lower.includes('kemarin')) {
            date = this.getRelativeDate(-1);
        } else {
            const bulanMap = {
                januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
                juli: '07', agustus: '08', agusust: '08', september: '09', oktober: '10', november: '11', desember: '12'
            };
            const dateMatch = lower.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
            if (dateMatch && bulanMap[dateMatch[2]]) {
                date = `${dateMatch[3]}-${bulanMap[dateMatch[2]]}-${dateMatch[1].padStart(2, '0')}`;
            }
        }

        // Ekstrak nominal
        let amount = 0;
        const numUnitMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?/);
        if (lower.includes('satu juta') || lower.includes('sejuta')) {
            amount = 1000000;
        } else if (lower.includes('tiga ratus ribu')) {
            amount = 300000;
        } else if (lower.includes('dua ratus ribu')) {
            amount = 200000;
        } else if (lower.includes('seratus ribu')) {
            amount = 100000;
        } else if (lower.includes('lima puluh ribu')) {
            amount = 50000;
        } else if (numUnitMatch) {
            let val = parseFloat(numUnitMatch[1].replace(',', '.'));
            const unit = numUnitMatch[2] || '';
            if (['rb', 'ribu', 'k'].includes(unit)) val *= 1000;
            else if (['jt', 'juta'].includes(unit)) val *= 1000000;
            amount = Math.round(val);
        }

        // Deteksi Type & Category sesuai histori transaksi
        let type = /\b(gaji|gajian|bonus|thr|dapat|terima)\b/.test(lower) ? 'income' : 'expense';
        let category = type === 'income' ? 'Salary' : 'Other';

        if (type === 'expense') {
            if (/\b(kopi|coffe|coffee|ksk|family mart|fm)\b/.test(lower)) category = 'Coffe';
            else if (/\b(ayam|makan|rujak|bakso|nasi|mie|seblak|kebab|jajan|shopeefood|gacoan|bebek|sarapan)\b/.test(lower)) category = 'Food';
            else if (/\b(parfum|liquid|rokok|buff|manset|belanja|alfamidi|indomaret|domain)\b/.test(lower)) category = 'Shopping';
            else if (/\b(nana|ibu|bapak|syifa|adek|adik|keluarga|minjem|pinjem)\b/.test(lower)) category = 'Family';
            else if (/\b(gojek|gocar|indrive|ojol|gosend|bensin|ongkos)\b/.test(lower)) category = 'Transport';
            else if (/\b(kos|kosan|kost|listrik|token)\b/.test(lower)) category = 'Rent';
            else if (/\b(laundry|galon|cukur|obat|netflix|youtube)\b/.test(lower)) category = 'Utility';
            else if (/\b(shamrock|lodging|richeese|sour sally|ruka)\b/.test(lower)) category = 'Dating';
        }

        return {
            date,
            type,
            category,
            amount,
            note: this.buildFallbackNote(text, category)
        };
    },

    async parse(text) {
        const todayStr = this.getRelativeDate(0);
        const yesterdayStr = this.getRelativeDate(-1);
        const twoDaysAgoStr = this.getRelativeDate(-2);

        const expenseCats = (typeof AppState !== 'undefined' && AppState.data?.categories?.expense)
            ? AppState.data.categories.expense.join(', ')
            : 'Food, Transport, Rent, Shopping, Coffe, Family, Dating, Other, Investment, Shodaqoh, Savings, Utility';
        const incomeCats = (typeof AppState !== 'undefined' && AppState.data?.categories?.income)
            ? AppState.data.categories.income.join(', ')
            : 'Salary, Bonus, Investment, Other';

        const prompt = `Ubah input transaksi suara/teks bahasa Indonesia menjadi JSON murni.
Hari ini: ${todayStr} | Kemarin: ${yesterdayStr} | 2 hari lalu: ${twoDaysAgoStr}.
Kategori Expense valid: ${expenseCats}
Kategori Income valid: ${incomeCats}

Aturan:
1. "note" WAJIB terisi ringkas dan deskriptif (DILARANG kosong atau "-").
2. Contoh:
  - "Tanggal 25 agusust 2025 saya membeli ayam goreng bu ani dengan harga 23 ribu" -> {"date":"2025-08-25","type":"expense","category":"Food","note":"Ayam goreng bu ani","amount":23000}
  - "Kemarin saya membeli kopi di family mart, harga 25ribu" -> {"date":"${yesterdayStr}","type":"expense","category":"Coffe","note":"Kopi familymart","amount":25000}
  - "Beli parfum Dior satu juta" -> {"date":"${todayStr}","type":"expense","category":"Shopping","note":"Parfum Dior","amount":1000000}
  - "Kemarin wa nana minjem uang tiga ratus ribu" -> {"date":"${yesterdayStr}","type":"expense","category":"Family","note":"Wa nana pinjem uang","amount":300000}

Input: "${text}"
Balas HANYA JSON: {"date":"YYYY-MM-DD","type":"expense|income","category":"...","note":"...","amount":0}`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            let rawJson = data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(rawJson);

            parsed.type = parsed.type === 'income' ? 'income' : 'expense';
            parsed.date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayStr;
            parsed.amount = Number(String(parsed.amount).replace(/[^\d]/g, '')) || 0;
            parsed.note = (!parsed.note || parsed.note.trim() === '' || parsed.note.trim() === '-')
                ? this.buildFallbackNote(text, parsed.category || 'Other')
                : parsed.note.trim();

            return parsed;
        } catch (err) {
            console.warn("Gemini API fallback ke parser lokal:", err);
            return this.localFallbackParse(text);
        }
    },

    syncCategoryDropdown(selectEl, type, targetCategory) {
        if (!selectEl) return;

        if (typeof AppState !== 'undefined' && AppState.data?.categories?.[type]) {
            const cats = AppState.data.categories[type];
            selectEl.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        const normalizedTarget = (targetCategory || '').toLowerCase().trim();
        const options = [...selectEl.options];
        const exactMatch = options.find(opt => opt.value.toLowerCase() === normalizedTarget);

        if (exactMatch) {
            selectEl.value = exactMatch.value;
        } else if (normalizedTarget.includes('coffee') || normalizedTarget.includes('kopi')) {
            const coffeOpt = options.find(opt => opt.value.toLowerCase().startsWith('coffe'));
            if (coffeOpt) selectEl.value = coffeOpt.value;
        } else if (normalizedTarget.includes('shop')) {
            const shopOpt = options.find(opt => opt.value.toLowerCase().startsWith('shop'));
            if (shopOpt) selectEl.value = shopOpt.value;
        } else {
            const fallback = options.find(opt => opt.value === 'Other');
            if (fallback) selectEl.value = 'Other';
        }
    },

    async processInput(text, source = 'auto') {
        const cleanText = (text || '').trim();
        if (!cleanText) {
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('Ketik atau ucapkan transaksi terlebih dahulu!', 'error');
            return;
        }

        const modal = document.getElementById('modal-container');
        const isModalOpen = modal && modal.classList.contains('active');
        const useModal = (source === 'popup') || (source === 'auto' && isModalOpen);
        const scope = useModal ? modal : (document.querySelector('.quick-log-panel') || document);

        const aiInput = useModal
            ? scope.querySelector('#ai-text-input, input[placeholder*="Lunch"], input[placeholder*="kopi"]')
            : document.getElementById('dash-ai-text-input');

        const btnAI = useModal
            ? scope.querySelector('#btn-ai-text-submit, .btn-ai-process, button:has(.material-icons-round)')
            : (document.getElementById('dash-btn-ai-process') || document.querySelector('.dash-btn-ai-process'));

        const iconAI = btnAI ? (btnAI.querySelector('.material-icons-round') || btnAI) : null;
        const originalIcon = iconAI ? iconAI.textContent : 'auto_awesome';

        if (btnAI) btnAI.disabled = true;
        if (iconAI) {
            iconAI.textContent = 'sync';
            iconAI.style.animation = 'spin 1s linear infinite';
        }

        let result;
        try {
            result = await this.parse(cleanText);
        } catch (error) {
            console.error('AI transaction processing failed:', error);
            if (typeof UI !== 'undefined' && UI.toast) UI.toast('AI parsing failed. Please retry or enter the transaction manually.', 'error');
            return;
        } finally {
            if (btnAI) btnAI.disabled = false;
            if (iconAI) {
                iconAI.textContent = originalIcon;
                iconAI.style.animation = 'none';
            }
        }

        if (!result) return;

        // 1. Cari & isi Date
        const dateEl = scope.querySelector(useModal ? '#add-date, input[type="date"]' : '#dash-add-date, input[type="date"]');
        if (dateEl) {
            dateEl.value = result.date;
            dateEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // 2. Cari & isi Type + Category
        const selects = scope.querySelectorAll('select');
        const typeEl = scope.querySelector(useModal ? '#add-type' : '#dash-add-type') || selects[0];
        const catEl = scope.querySelector(useModal ? '#add-category' : '#dash-add-category') || selects[1];

        if (typeEl) {
            typeEl.value = result.type;
            typeEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.syncCategoryDropdown(catEl, result.type, result.category);
        if (catEl) catEl.dispatchEvent(new Event('change', { bubbles: true }));

        // 3. Cari & isi Amount (IDR)
        const amtEl = scope.querySelector(useModal ? '#add-amount, input[type="number"]' : '#dash-add-amount, input[type="number"]');
        if (amtEl) {
            amtEl.value = result.amount;
            amtEl.dispatchEvent(new Event('input', { bubbles: true }));
            const helperEl = document.getElementById(useModal ? 'helper-add-amount' : 'helper-dash-add-amount');
            if (helperEl && typeof Util !== 'undefined' && Util.idr) {
                helperEl.innerText = result.amount > 0 ? Util.idr(result.amount) : '';
            }
        }

        // 4. Cari & isi Description (Optional) — dijamin tidak akan terlewat
        const noteEl = scope.querySelector(
            useModal
                ? '#add-note, input[placeholder*="transaction for"], input[placeholder*="Note"], input[placeholder*="Catatan"]'
                : '#dash-add-note, input[placeholder*="transaction for"]'
        ) || [...scope.querySelectorAll('input[type="text"]')].find(el => el !== aiInput);

        if (noteEl) {
            noteEl.value = result.note;
            noteEl.dispatchEvent(new Event('input', { bubbles: true }));
            noteEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (aiInput) aiInput.value = '';

        if (typeof UI !== 'undefined' && UI.toast) {
            UI.toast(`Terisi: ${result.note} • ${result.category}`, 'success');
        }
    }
};

// Expose the parser explicitly for Voice.js and other classic-script integrations.
window.SmartAI = SmartAI;


// ============================================================================
// 13. EVENT DELEGATION & KEYBOARD SHORTCUT UNTUK AI PARSER
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('click', (e) => {
        const dashAiBtn = e.target.closest('#dash-btn-ai-process, .dash-btn-ai-process');
        if (dashAiBtn) {
            const val = document.getElementById('dash-ai-text-input')?.value || '';
            SmartAI.processInput(val, 'dashboard');
            return;
        }

        const popupAiBtn = e.target.closest('#btn-ai-text-submit, .btn-ai-process');
        if (popupAiBtn) {
            const val = document.getElementById('ai-text-input')?.value || '';
            SmartAI.processInput(val, 'popup');
        }
    });

    document.body.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.target.id === 'dash-ai-text-input' || e.target.id === 'ai-text-input')) {
            e.preventDefault();
            const source = e.target.id === 'dash-ai-text-input' ? 'dashboard' : 'popup';
            SmartAI.processInput(e.target.value, source);
        }
    });
});


// ============================================================================
// 14. PENGAMAN FILTER TIME MACHINE (MONTH & YEAR vs PERIOD)
// ============================================================================
function syncTimeMachineFilterUI() {
    const modeSelect = document.getElementById('filter-mode');
    if (!modeSelect) return;

    const container = modeSelect.closest('.time-machine-group') || modeSelect.parentElement;
    if (!container) return;

    // Deteksi mode Period baik dari value ("period" / "range") maupun teks opsi
    const val = (modeSelect.value || '').toLowerCase();
    const selectedText = (modeSelect.options[modeSelect.selectedIndex]?.text || '').toLowerCase();
    const isPeriodMode = val === 'period'
        || val === 'range'
        || val.includes('period')
        || val.includes('range')
        || selectedText.includes('period')
        || selectedText.includes('range');

    if (container.classList.contains('is-period-mode') !== isPeriodMode) {
        container.classList.toggle('is-period-mode', isPeriodMode);
    }

    const yearEl = document.getElementById('filter-year');
    const monthEl = document.getElementById('filter-month');
    const dateInputs = Array.from(container.querySelectorAll('input[type="date"]'));

    // Cari pembungkus terluar milik field sebelum .time-machine-group
    const getOuterGroup = (el) => {
        if (!el) return null;
        let curr = el;
        while (
            curr.parentElement
            && curr.parentElement !== container
            && !curr.parentElement.contains(modeSelect)
        ) {
            curr = curr.parentElement;
        }
        return curr;
    };

    const applyVisibility = (target, show) => {
        if (!target) return;
        if (show) {
            if (target.style.getPropertyValue('display') !== '') {
                target.style.removeProperty('display');
            }
        } else {
            const isHidden = target.style.getPropertyValue('display') === 'none'
                && target.style.getPropertyPriority('display') === 'important';
            if (!isHidden) {
                target.style.setProperty('display', 'none', 'important');
            }
        }
    };

    // 1. Kontrol dropdown Year & Month (muncul saat Month & Year, hilang saat Period)
    const yearTarget = getOuterGroup(yearEl);
    const monthTarget = getOuterGroup(monthEl);
    applyVisibility(yearTarget, !isPeriodMode);
    if (monthTarget && monthTarget !== yearTarget) {
        applyVisibility(monthTarget, !isPeriodMode);
    }

    // 2. Kontrol kotak Date Range beserta tanda "-" di dalamnya (hilang saat Month & Year, muncul saat Period)
    const rangeTargets = new Set();
    dateInputs.forEach(input => {
        const outer = getOuterGroup(input);
        if (outer) rangeTargets.add(outer);
        applyVisibility(input, isPeriodMode);
    });
    rangeTargets.forEach(target => applyVisibility(target, isPeriodMode));

    // 3. Jika tanda "-" berdiri sendiri tanpa pembungkus luar, sembunyikan juga saat Month & Year
    Array.from(container.children).forEach(child => {
        if (child === modeSelect || child.contains(modeSelect)) return;
        if (child === yearTarget || child === monthTarget || rangeTargets.has(child)) return;

        const txt = child.textContent.trim();
        if ((txt === '-' || txt === '–' || txt === 'to') && child.querySelectorAll('select, input').length === 0) {
            applyVisibility(child, isPeriodMode);
        }
    });
}

function initTimeMachineGuard() {
    syncTimeMachineFilterUI();

    const modeSelect = document.getElementById('filter-mode');
    if (!modeSelect) return;

    if (!modeSelect.dataset.tmBound) {
        modeSelect.dataset.tmBound = 'true';
        modeSelect.addEventListener('change', syncTimeMachineFilterUI);
    }

    const container = modeSelect.closest('.time-machine-group') || modeSelect.parentElement;
    if (container && !container.dataset.tmObserved) {
        container.dataset.tmObserved = 'true';
        const observer = new MutationObserver(() => {
            syncTimeMachineFilterUI();
        });
        observer.observe(container, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            childList: true,
            subtree: true
        });
    }
}

initTimeMachineGuard();
document.addEventListener('DOMContentLoaded', initTimeMachineGuard);
window.addEventListener('load', initTimeMachineGuard);
