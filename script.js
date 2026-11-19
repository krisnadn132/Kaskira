const STORAGE_KEY = 'yourVaultEnterpriseV6'; 

const DEFAULT_DATA = {
    transactions: [],
    categories: {
        income: ['Salary', 'Bonus', 'Business', 'Investment', 'Other'],
        expense: ['Food', 'Transport', 'Rent', 'Shopping', 'Investment', 'Savings', 'Family', 'Dating', 'Other']
    },
    savings: [],
    wishlist: [],
    subscriptions: [],
    budgets: {}
};

document.addEventListener('DOMContentLoaded', () => {

    const AppState = {
        data: null,
        selectedMonth: new Date().toISOString().substring(0, 7),
            
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
                const content = gist.files['vault_data.json'] ? gist.files['vault_data.json'].content : null;
                if (content && content.trim() !== "") {
                    this.data = JSON.parse(content);
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
            try { localData = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { localData = null; }

            let cloudSuccess = await this.loadFromGitHub();
            
            if (cloudSuccess && localData) {
                const cloudTime = this.data.lastUpdated || 0;
                const localTime = localData.lastUpdated || 0;
                if (localTime > cloudTime) {
                    this.data = localData;
                    this.save(); 
                }
            } else if (!cloudSuccess) {
                this.data = localData || JSON.parse(JSON.stringify(DEFAULT_DATA));
            }
            
            if (!Array.isArray(this.data.transactions)) this.data.transactions = [];
            if (!Array.isArray(this.data.savings)) this.data.savings = [];
            if (!Array.isArray(this.data.wishlist)) this.data.wishlist = [];
            if (!Array.isArray(this.data.subscriptions)) this.data.subscriptions = [];
            if (!this.data.budgets || typeof this.data.budgets !== 'object') this.data.budgets = {};
            if (!this.data.categories) this.data.categories = JSON.parse(JSON.stringify(DEFAULT_DATA.categories));
            if (!Array.isArray(this.data.categories.income)) this.data.categories.income = JSON.parse(JSON.stringify(DEFAULT_DATA.categories.income));
            if (!Array.isArray(this.data.categories.expense)) this.data.categories.expense = JSON.parse(JSON.stringify(DEFAULT_DATA.categories.expense));
        },
        
        async save() { 
            this.data.lastUpdated = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); 
            
            const { token, gistId } = this.getGitHubConfig();
            if (token && gistId) {
                try {
                    await fetch(`https://api.github.com/gists/${gistId}`, {
                        method: 'PATCH',
                        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ files: { 'vault_data.json': { content: JSON.stringify(this.data, null, 2) } } })
                    });
                } catch(err) {
                    console.error('Failed to save to GitHub:', err);
                }
            }
        }
    };

    const U_HASH = "S3Jpc25h";
    const P_HASH = "S3Jpc25hITMy";

    const Util = {
        escapeHTML: (str) => {
            if(!str) return '';
            let div = document.createElement('div'); div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        },
        idr: (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0).replace(/Rp\s?/g, 'Rp '),
        usd: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v || 0),
        date: () => new Date().toISOString().split('T')[0],
        todayStr: () => new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        id: (p) => p + Date.now() + Math.floor(Math.random()*1000)
    };

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
            const mode = Filter.getMode();

            if (mode === 'payday') {
                const { startStr, endStr } = Filter.getPaydayRange();
                return dateStr >= startStr && dateStr <= endStr;
            } 
            
            if (mode === 'range') {
                let s = Filter.getStart(); let e = Filter.getEnd();
                if (!s && !e) return true; 
                if (s && e) return dateStr >= s && dateStr <= e;
                if (s) return dateStr >= s;
                if (e) return dateStr <= e;
            } else {
                let y = Filter.getYear(); let m = Filter.getMonth();
                if (y === 'all') return true;
                if (m === 'all') return dateStr.startsWith(y);
                return dateStr.startsWith(`${y}-${m}`);
            }
        },

        getSummaryText: () => {
            const mode = Filter.getMode();
            
            if (mode === 'payday') {
                const { startStr, endStr } = Filter.getPaydayRange();
                return `Siklus Gajian (${startStr} s/d ${endStr})`;
            }

            if (mode === 'range') {
                let s = Filter.getStart(); let e = Filter.getEnd();
                if (!s && !e) return "All Time (Range)";
                if (s && e) return `${s} s/d ${e}`;
                if (s) return `Mulai ${s}`;
                if (e) return `Sampai ${e}`;
            }
            let y = Filter.getYear(); let m = Filter.getMonth();
            if (y === 'all') return "All Time";
            if (m === 'all') return `Year ${y}`;
            
            let monthOption = document.querySelector(`#filter-month option[value="${m}"]`);
            let mName = monthOption ? monthOption.innerText : m;
            return `${mName} ${y}`;
        }
    };

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

    const DOM = { 
        views: document.querySelectorAll('.view-section'), 
        navs: document.querySelectorAll('.nav-link'), 
        toast: document.getElementById('toast-container') 
    };

    const UI = {
        toast: (msg, type='success') => {
            if (!DOM.toast) return;
            const t = document.createElement('div'); t.className = 'toast'; 
            t.style.borderLeftColor = `var(--${type})`;
            t.innerHTML = `<span class="material-icons-round" style="color:var(--${type}); font-size:24px;">${type==='success'?'check_circle':'error'}</span> <span style="font-weight:600; font-size:0.95rem;">${msg}</span>`;
            DOM.toast.appendChild(t); setTimeout(() => t.remove(), 4000);
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
                    b.onclick = () => { if(btn.onClick) btn.onClick(); this.close(); };
                    this.actions.appendChild(b);
                });
                this.container.classList.add('active');
            },
            close() { if (this.container) this.container.classList.remove('active'); }
        },
        bindFormatHelper: (inputId, helperId) => {
            const input = document.getElementById(inputId);
            const helper = document.getElementById(helperId);
            if (input && helper) {
                input.addEventListener('input', (e) => {
                    let val = Number(e.target.value);
                    helper.innerText = (val && Number.isFinite(val) && val > 0) ? Util.idr(val) : '';
                });
            }
        }
    };

    if (UI.modal.container) {
        UI.modal.container.addEventListener('click', (e) => { if(e.target === UI.modal.container) UI.modal.close(); });
    }
    UI.bindFormatHelper('add-amount', 'helper-add-amount');
    UI.bindFormatHelper('bud-amount', 'helper-bud-amount');
    UI.bindFormatHelper('sub-price', 'helper-sub-price');
    UI.bindFormatHelper('sav-target', 'helper-sav-target');
    UI.bindFormatHelper('wish-price', 'helper-wish-price');

    const Charts = {
        inst: { dash: null, pie: null, detail: null },
        getColors() { return document.body.getAttribute('data-theme') === 'dark' ? '#cbd5e1' : '#475569'; },
        getGridColor() { return document.body.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; },
        init() {
            if (typeof Chart === 'undefined') return;
            Chart.defaults.color = this.getColors();
            Chart.defaults.font.family = 'Inter';
            this.renderDash();
            this.renderPie();
        },
        renderDash() {
            let ctx1 = document.getElementById('dashboardChart');
            if(!ctx1 || ctx1.offsetParent === null || typeof Chart === 'undefined') return; 

            if(this.inst.dash) this.inst.dash.destroy();
            let dMap = {};
            let y = Filter.getYear(); let m = Filter.getMonth();
            
            let filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
            filteredTxs.forEach(t => {
                let key;
                if (Filter.getMode() === 'range') { key = t.date; } 
                else {
                    if (y === 'all') { key = t.date.substring(0, 4); } 
                    else if (m === 'all') { key = t.date.substring(5, 7); } 
                    else { key = t.date.substring(8, 10); } 
                }
                if(!dMap[key]) dMap[key] = { i:0, e:0 };
                t.type === 'income' ? dMap[key].i += t.amount : dMap[key].e += t.amount;
            });
            
            if(Object.keys(dMap).length > 0) {
                let sortedKeys = Object.keys(dMap).sort((a,b) => parseInt(a) - parseInt(b));
                let labels = sortedKeys.map(k => {
                    if(y === 'all') return k;
                    if(m === 'all') {
                        let dt = new Date(`${y}-${k}-01`);
                        return dt.toLocaleString('en-US', {month:'short'});
                    }
                    return `${k} ${new Date(y+'-'+m+'-01').toLocaleString('en-US', {month:'short'})}`;
                });

                this.inst.dash = new Chart(ctx1, {
                    type: 'bar',
                    data: { labels: labels, datasets: [{ label:'Income', data: sortedKeys.map(k => dMap[k].i), backgroundColor:'#10b981', borderRadius:6 }, { label:'Expense', data: sortedKeys.map(k => dMap[k].e), backgroundColor:'#ef4444', borderRadius:6}] },
                    options: { responsive:true, maintainAspectRatio:false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: {y:{display:false, grid:{display:false}}, x:{grid:{display:false}}} }
                });
            }
        },
        renderPie() {
            let ctxPie = document.getElementById('expensePieChart');
            if(!ctxPie || ctxPie.offsetParent === null || typeof Chart === 'undefined') return;

            if(this.inst.pie) this.inst.pie.destroy();
            let expMap = {};
            let totalExp = 0;
            AppState.data.transactions.forEach(t => { 
                if(t.type === 'expense' && Filter.isMatch(t.date)) {
                    expMap[t.category] = (expMap[t.category] || 0) + t.amount; 
                    totalExp += t.amount;
                }
            });
            
            if(Object.keys(expMap).length > 0) {
                let strokeColor = document.body.getAttribute('data-theme')==='dark' ? '#1e293b' : '#ffffff';
                let labels = Object.keys(expMap).map(k => `${k} (${((expMap[k]/totalExp)*100).toFixed(1)}%)`);

                this.inst.pie = new Chart(ctxPie, {
                    type: 'doughnut',
                    data: { labels: labels, datasets: [{ data: Object.values(expMap), backgroundColor: Object.keys(expMap).map(k => ColorHelper.getColor(k)), borderWidth: 3, borderColor: strokeColor }] },
                    options: { responsive:true, maintainAspectRatio:false, cutout: '65%', plugins: { legend: { position: 'right' } } }
                });
            }
        },
        renderDetail() {
            let ctx2 = document.getElementById('analyticsDetailChart');
            if(!ctx2 || ctx2.offsetParent === null || typeof Chart === 'undefined') return;
            if(this.inst.detail) this.inst.detail.destroy();
            const catEl = document.getElementById('ana-category');
            if(!catEl) return;
            const cat = catEl.value;
            if(!cat) return;

            let dMap = {};
            [...AppState.data.transactions].filter(t => t.category === cat && Filter.isMatch(t.date)).reverse().forEach(t => {
                let key = (Filter.getMode() === 'range' || Filter.getYear() !== 'all') ? t.date : t.date.substring(0,7);
                dMap[key] = (dMap[key] || 0) + t.amount;
            });

            let isInc = AppState.data.categories.income.includes(cat);
            let color = isInc ? '#10b981' : '#f59e0b';

            this.inst.detail = new Chart(ctx2, {
                type: 'line',
                data: { labels: Object.keys(dMap).length ? Object.keys(dMap) : ['No Data'], datasets: [{ label: cat, data: Object.values(dMap).length ? Object.values(dMap) : [0], borderColor: color, backgroundColor: color+'33', fill: true }] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{grid:{color: this.getGridColor()}}, x:{grid:{display:false}}} }
            });
        }
    };

    const txTypeSelect = document.getElementById('add-type');
    const txCategorySelect = document.getElementById('add-category');

    function renderCategoryByType(type) {
        const categories = AppState.data.categories[type] || [];
        if(txCategorySelect) {
            txCategorySelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
            txCategorySelect.selectedIndex = 0; 
        }
    }

    if(txTypeSelect) txTypeSelect.addEventListener('change', () => renderCategoryByType(txTypeSelect.value));

    const Render = {
        initTimeMachine() {
            let years = new Set();
            let curY = new Date().getFullYear().toString();
            years.add(curY);
            AppState.data.transactions.forEach(t => { if(t.date) years.add(t.date.substring(0,4)); });
            
            let sortedYears = Array.from(years).sort((a,b)=>b-a);
            let ySelect = document.getElementById('filter-year');
            if(ySelect) {
                ySelect.innerHTML = `<option value="all">All Time</option>` + sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
                ySelect.value = curY;
            }
            if(document.getElementById('filter-month')) document.getElementById('filter-month').value = new Date().toISOString().substring(5,7);
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
        },
        
        updateDropdowns() {
            if(txTypeSelect) renderCategoryByType(txTypeSelect.value);
            if(document.getElementById('bud-cat')) document.getElementById('bud-cat').innerHTML = AppState.data.categories.expense.map(c=>`<option value="${c}">${c}</option>`).join('');
            if(document.getElementById('ana-category')) document.getElementById('ana-category').innerHTML = [...AppState.data.categories.income, ...AppState.data.categories.expense].map(c=>`<option value="${c}">${c}</option>`).join('');
        },

        fiatAndNetWorth() {
            let totalIncome = 0;
            let totalExpense = 0;

            AppState.data.transactions.forEach(t => {
                if (Filter.isMatch(t.date)) {
                    if (t.type === 'income') totalIncome += t.amount;
                    if (t.type === 'expense') totalExpense += t.amount;
                }
            });

            const netBalance = totalIncome - totalExpense;

            if (document.getElementById('dash-networth')) {
                document.getElementById('dash-networth').innerText = Util.idr(netBalance);
            }
            if (document.getElementById('dash-balance')) {
                document.getElementById('dash-balance').innerText = Util.idr(netBalance);
            }
            if (document.getElementById('dash-income')) {
                document.getElementById('dash-income').innerText = Util.idr(totalIncome);
            }
            if (document.getElementById('dash-expense')) {
                document.getElementById('dash-expense').innerText = Util.idr(totalExpense);
            }

            // Render Riwayat Transaksi Tabel Dashboard
            let tbody = document.getElementById('tbody-fiat-history');
            if (tbody) {
                let filtered = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
                tbody.innerHTML = filtered.length ? filtered.map(t => `
                    <tr>
                        <td>${t.date}</td>
                        <td><span class="badge ${t.type === 'income' ? 'badge-income' : 'badge-expense'}">${t.type.toUpperCase()}</span></td>
                        <td><strong>${Util.escapeHTML(t.category)}</strong></td>
                        <td>${Util.escapeHTML(t.note || '-')}</td>
                        <td style="font-weight:700; color:${t.type === 'income' ? 'var(--success)' : 'var(--danger)'}">${t.type === 'income' ? '+' : '-'}${Util.idr(t.amount)}</td>
                        <td>
                            <button type="button" data-act="del-tx" data-id="${t.id}" style="color:var(--danger);" title="Hapus">
                                <span class="material-icons-round" style="font-size:20px;">delete</span>
                            </button>
                        </td>
                    </tr>
                `).join('') : `<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada transaksi pada periode ini.</td></tr>`;
            }
        },
        
        financialInsight() {
            let i = 0, e = 0;
            AppState.data.transactions.forEach(t => {
                if(Filter.isMatch(t.date)) t.type === 'income' ? i+=t.amount : e+=t.amount;
            });
            
            let msg = ""; let color = "var(--primary)"; let icon = "psychology";
            if(i === 0 && e === 0) {
                msg = "No transactions found for this period. Start logging your finances to get insights.";
                color = "var(--text-muted)";
            } else if(e > i) {
                msg = `<strong>Deficit Alert!</strong> Your expenses (${Util.idr(e)}) have exceeded your income this period.`;
                color = "var(--danger)"; icon = "warning";
            } else {
                let savingRate = ((i - e) / i * 100).toFixed(1);
                if(savingRate >= 20) {
                    msg = `<strong>Excellent Health!</strong> You maintained a <em>Savings Rate</em> of <strong>${savingRate}%</strong>. Keep it up!`;
                    color = "var(--success)"; icon = "verified";
                } else {
                    msg = `<strong>Fair Condition.</strong> Your <em>Savings Rate</em> is <strong>${savingRate}%</strong>.`;
                    color = "var(--warning)"; icon = "lightbulb";
                }
            }
            
            let banner = document.getElementById('financial-insight');
            if(banner) {
                banner.style.borderLeftColor = color;
                let iconBox = banner.querySelector('.icon-box');
                if (iconBox) {
                    iconBox.style.background = color;
                    iconBox.innerHTML = `<span class="material-icons-round">${icon}</span>`;
                }
                let msgEl = document.getElementById('insight-message');
                if (msgEl) msgEl.innerHTML = msg;
            }
        },

        budget() {
            const actuals = {};
            AppState.data.transactions.forEach(t => { 
                if(t.type === 'expense' && Filter.isMatch(t.date)) {
                    actuals[t.category] = (actuals[t.category] || 0) + t.amount; 
                }
            });

            let plansHtml = ''; let progHtml = '';
            let totTarget = 0; let totActual = 0;

            Object.keys(AppState.data.budgets).forEach(cat => {
                let planAmt = AppState.data.budgets[cat]; let actAmt = actuals[cat] || 0;
                totTarget += planAmt; totActual += actAmt;

                let isOvr = actAmt > planAmt; 
                let textPct = planAmt > 0 ? ((actAmt / planAmt) * 100).toFixed(0) : 0;
                let barPct = Math.min(textPct, 100);
                let categoryColor = ColorHelper.getColor(cat); 
                let barColor = isOvr ? 'var(--danger)' : categoryColor;

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

            if(document.getElementById('list-budget-plans')) document.getElementById('list-budget-plans').innerHTML = plansHtml || `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center;">No budget set.</div>`;
            if(document.getElementById('budget-progress-container')) document.getElementById('budget-progress-container').innerHTML = progHtml || `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center;">No data.</div>`;
            if(document.getElementById('summary-budget')) document.getElementById('summary-budget').innerText = `Total: ${Util.idr(totActual)} / ${Util.idr(totTarget)}`;
        },

        subscriptions() {
            let totalMonthly = 0;
            let html = AppState.data.subscriptions.map(s => {
                let monthlyCost = s.cycle === 'yearly' ? s.price / 12 : s.price;
                if(s.active) totalMonthly += monthlyCost;
                return `<tr><td><strong>${Util.escapeHTML(s.name)}</strong></td><td>${Util.idr(s.price)}</td><td><span class="badge ${s.cycle==='yearly'?'badge-buy':'badge-expense'}">${s.cycle}</span></td><td style="font-weight:600; color:var(--text-main)">${Util.idr(monthlyCost)} / mo</td><td style="white-space:nowrap;">${s.active ? `<button type="button" data-act="pay-sub" data-id="${s.id}" class="badge badge-pay" style="margin-right:12px;" title="Record Expense Now"><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">payment</span> PAY NOW</button>` : ''}<button type="button" data-act="toggle-sub" data-id="${s.id}" class="badge ${s.active?'badge-active':'badge-inactive'}" style="margin-right:8px; width:70px;">${s.active?'ACTIVE':'PAUSED'}</button> <button type="button" data-act="del-sub" data-id="${s.id}" style="color:var(--danger); vertical-align:middle;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');

            let activeCount = AppState.data.subscriptions.filter(x=>x.active).length;
            let pausedCount = AppState.data.subscriptions.length - activeCount;
            
            if(document.getElementById('tbody-subs')) document.getElementById('tbody-subs').innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:20px;">No recurring bills recorded.</td></tr>';
            if(document.getElementById('sub-monthly-cost')) document.getElementById('sub-monthly-cost').innerText = Util.idr(totalMonthly);
            if(document.getElementById('summary-subs')) document.getElementById('summary-subs').innerText = `Active: ${activeCount} | Paused: ${pausedCount}`;
        },

        savings() {
            let totTarget = 0; let totCurrent = 0;
            let sHtml = AppState.data.savings.map(s => {
                totTarget += s.target; totCurrent += s.current;
                let pct = Math.min((s.current / s.target)*100, 100).toFixed(0);
                return `<tr><td><strong style="font-size:1.05rem;">${Util.escapeHTML(s.name)}</strong><br><span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${Util.idr(s.current)} / ${Util.idr(s.target)} (${pct}%)</span><div class="prog-container" style="margin-top:10px;"><div class="prog-bar" style="width:${pct}%; background:var(--success);"></div></div></td><td style="white-space:nowrap; vertical-align:middle;"><button type="button" data-act="add-sav" data-id="${s.id}" style="color:var(--primary); margin-right:10px; background:var(--primary-light); padding:10px; border-radius:8px;" title="Add Funds"><span class="material-icons-round" style="font-size:20px;">add</span></button> <button type="button" data-act="del-sav" data-id="${s.id}" style="color:var(--danger); padding:8px;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');
            if(document.getElementById('tbody-savings')) document.getElementById('tbody-savings').innerHTML = sHtml || '<tr><td colspan="2" style="text-align:center; padding:30px;">No savings goals created.</td></tr>';
            if(document.getElementById('summary-sav')) document.getElementById('summary-sav').innerText = `Total Saved: ${Util.idr(totCurrent)} / ${Util.idr(totTarget)}`;

            let totWish = 0;
            let wHtml = AppState.data.wishlist.map(w => {
                let isBought = w.status === 'bought';
                if(!isBought) totWish += w.price;
                let linkHTML = w.link ? `<a href="${Util.escapeHTML(w.link)}" target="_blank" style="font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:4px;"><span class="material-icons-round" style="font-size:16px;">open_in_new</span> Link</a>` : '-';
                return `<tr><td><strong style="text-decoration:${isBought?'line-through':'none'}; font-size:1rem;">${Util.escapeHTML(w.name)}</strong><br><span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">${Util.idr(w.price)}</span></td><td>${linkHTML}</td><td style="white-space:nowrap;">${!isBought ? `<button type="button" data-act="buy-wish" data-id="${w.id}" class="badge badge-buy" style="border:none; margin-right:12px; cursor:pointer;">MARK BOUGHT</button>` : `<span class="badge" style="background:var(--border); color:var(--text-muted); margin-right:12px;">PURCHASED</span>`}<button type="button" data-act="del-wish" data-id="${w.id}" style="color:var(--danger); vertical-align:middle;" title="Delete"><span class="material-icons-round" style="font-size:22px;">delete</span></button></td></tr>`;
            }).join('');
            if(document.getElementById('tbody-wishlist')) document.getElementById('tbody-wishlist').innerHTML = wHtml || '<tr><td colspan="3" style="text-align:center; padding:30px;">Your wishlist is empty.</td></tr>';
            if(document.getElementById('summary-wish')) document.getElementById('summary-wish').innerText = `Total Pending Cost: ${Util.idr(totWish)}`;
        }, 

        analytics() {
            let tMap = {}; let inc = 0, exp = 0;
            AppState.data.transactions.forEach(t => {
                let m = t.date.substring(0,7); if(!tMap[m]) tMap[m] = 1;
                if(Filter.isMatch(t.date)) {
                    t.type==='income' ? inc+=t.amount : exp+=t.amount;
                }
            });
            
            let moCount = Filter.getYear() !== 'all' && Filter.getMonth() !== 'all' ? 1 : (Object.keys(tMap).length || 1);
            let displayInc = Filter.getMonth() !== 'all' ? inc : inc/moCount;
            let displayExp = Filter.getMonth() !== 'all' ? exp : exp/moCount;
            let titleLabel = Filter.getMonth() !== 'all' ? 'Total' : 'Avg';

            if(document.getElementById('analytic-stats')) document.getElementById('analytic-stats').innerHTML = `
                <div class="stat-card" style="border-left:4px solid var(--success)"><div class="stat-icon" style="background:var(--success)"><span class="material-icons-round">arrow_downward</span></div><div class="stat-info"><h3 title="Income">${titleLabel} Income</h3><h2>${Util.idr(displayInc)}</h2></div></div>
                <div class="stat-card" style="border-left:4px solid var(--danger)"><div class="stat-icon" style="background:var(--danger)"><span class="material-icons-round">arrow_upward</span></div><div class="stat-info"><h3 title="Expense">${titleLabel} Expense</h3><h2>${Util.idr(displayExp)}</h2></div></div>
                <div class="stat-card" style="border-left:4px solid var(--info)"><div class="stat-icon" style="background:var(--info)"><span class="material-icons-round">calendar_today</span></div><div class="stat-info"><h3 title="Time Filter">Period</h3><h2>${Filter.getSummaryText()}</h2></div></div>
                <div class="stat-card" style="border-left:4px solid var(--primary)"><div class="stat-icon" style="background:var(--primary)"><span class="material-icons-round">receipt_long</span></div><div class="stat-info"><h3 title="Total Record Transaksi">Transactions</h3><h2>${AppState.data.transactions.filter(t=>Filter.isMatch(t.date)).length} Trx</h2></div></div>
            `;
        },
        settings() {
            const rTag = (arr, id, mType, sType) => {
                let el = document.getElementById(id);
                if (el) {
                    el.innerHTML = arr.map((item, i) => 
                        `<div style="display:flex; align-items:center; gap:8px; background:var(--bg-body); border:1px solid var(--border); padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600;">${Util.escapeHTML(item)} <button type="button" data-act="del-setting" data-idx="${i}" data-m="${mType}" data-s="${sType||''}" style="color:var(--danger); display:flex;"><span class="material-icons-round" style="font-size:16px;">close</span></button></div>`
                    ).join('');
                }
            };
            rTag(AppState.data.categories.expense, 'list-cat-expense', 'categories', 'expense');
            rTag(AppState.data.categories.income, 'list-cat-income', 'categories', 'income');
        }
    };
    if(document.getElementById('btn-toggle-pwd')) document.getElementById('btn-toggle-pwd').addEventListener('click', function() {
        let pwdInput = document.getElementById('login-password');
        let icon = this.querySelector('.material-icons-round');
        if(pwdInput.type === 'password') { pwdInput.type = 'text'; icon.textContent = 'visibility_off'; } 
        else { pwdInput.type = 'password'; icon.textContent = 'visibility'; }
    });
    if(document.getElementById('loginForm')) document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let u = btoa(document.getElementById('login-username').value);
        let p = btoa(document.getElementById('login-password').value);
        
        if (u === U_HASH && p === P_HASH) {
            const btnLogin = e.target.querySelector('button[type="submit"]');
            let oldText = btnLogin.innerText;
            btnLogin.innerText = "Syncing from Cloud...";
            btnLogin.disabled = true;
            try {
                await AppState.init(); 
            } catch (error) {
                console.error("Sistem memaksa masuk melewati error:", error);
            } finally {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('app-wrapper').style.display = 'flex';         
                Render.initTimeMachine(); Render.all();               
                btnLogin.innerText = oldText; btnLogin.disabled = false;
                document.getElementById('login-username').value = '';
                document.getElementById('login-password').value = '';
            }
        } else {
            document.getElementById('login-error').style.display = 'block';
        }    });
    if(document.getElementById('btn-logout')) document.getElementById('btn-logout').addEventListener('click', () => {
        UI.modal.show({ title: 'Lock Vault?', icon: 'lock', bodyHTML: 'Your session will end and the application will be locked.', buttons: [
            {text: 'Cancel', class: 'btn-cancel'}, {text: 'Lock Now', class: 'btn-danger', onClick: () => { location.reload(); }}
        ]});    });
    DOM.navs.forEach(l => l.addEventListener('click', e => {
        e.preventDefault(); 
        DOM.views.forEach(v=>v.classList.remove('active')); 
        DOM.navs.forEach(n=>n.classList.remove('active'));
        
        let target = e.currentTarget.dataset.target;
        document.getElementById(target).classList.add('active');
        e.currentTarget.classList.add('active'); 
        if(document.getElementById('page-title')) document.getElementById('page-title').innerText = e.currentTarget.dataset.title;        
        if(target === 'view-analytics') { setTimeout(() => Charts.renderDetail(), 50); }
        if(target === 'view-dashboard') { setTimeout(() => { Charts.renderDash(); Charts.renderPie(); Render.financialInsight(); }, 50); }
    }));
    const triggerTimeMachine = () => {
        let mode = Filter.getMode();
        let monthSelect = document.getElementById('filter-month');
        let yearSelect = document.getElementById('filter-year');
        let rangeInputs = document.getElementById('filter-range-inputs');
        if (mode === 'range') {
            if(yearSelect) yearSelect.style.display = 'none'; 
            if(monthSelect) monthSelect.style.display = 'none'; 
            if(rangeInputs) rangeInputs.style.display = 'flex';
        } else {
            if(yearSelect) yearSelect.style.display = 'inline-block'; 
            if(monthSelect) monthSelect.style.display = 'inline-block'; 
            if(rangeInputs) rangeInputs.style.display = 'none';
            let y = Filter.getYear();
            if(y === 'all') { 
                if(monthSelect) { monthSelect.value = 'all'; monthSelect.disabled = true; monthSelect.style.opacity = '0.5'; } 
            } else { 
                if(monthSelect) { monthSelect.disabled = false; monthSelect.style.opacity = '1'; } 
            }
        }        
        let y = Filter.getYear(); let m = Filter.getMonth();
        AppState.selectedMonth = (mode === 'monthly' && y !== 'all' && m !== 'all') ? `${y}-${m}` : '0000-00';
        Render.all(); UI.toast(`Viewing Data: ${Filter.getSummaryText()}`, 'success');
    };
    ['filter-mode', 'filter-year', 'filter-month', 'filter-start', 'filter-end'].forEach(id => {
        let el = document.getElementById(id); if (el) el.addEventListener('change', triggerTimeMachine);
    });
    if(document.getElementById('btn-theme-toggle')) document.getElementById('btn-theme-toggle').addEventListener('click', () => {
        let isD = document.body.getAttribute('data-theme') === 'dark';
        document.body.setAttribute('data-theme', isD ? 'light' : 'dark');
        if(document.getElementById('theme-icon')) document.getElementById('theme-icon').innerText = isD ? 'dark_mode' : 'light_mode';
        Charts.init(); Charts.renderDetail(); 
    });
    if(document.getElementById('ana-category')) document.getElementById('ana-category').addEventListener('change', () => Charts.renderDetail());
    if(document.getElementById('form-add-tx')) document.getElementById('form-add-tx').addEventListener('submit', e => {
        e.preventDefault();
        let amountInput = document.getElementById('add-amount'); let noteInput = document.getElementById('add-note');
        let amt = Number(amountInput.value);
        if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid amount', 'error');        
        let lastType = document.getElementById('add-type').value;
        let lastCategory = document.getElementById('add-category').value;
        if (!AppState.data.categories[lastType].includes(lastCategory)) return UI.toast('Category mismatch!', 'error');
        let inputDate = document.getElementById('add-date').value;
        AppState.data.transactions.push({ id: Util.id('TX'), date: inputDate, timestamp: Date.now(), type: lastType, category: lastCategory, amount: amt, note: noteInput.value });
        AppState.data.transactions.sort((a, b) => { let da = new Date(a.date).getTime()||0; let db = new Date(b.date).getTime()||0; if(db-da===0) return (b.timestamp||0)-(a.timestamp||0); return db-da; });        
        AppState.save(); Render.all(); 
                let newTypeInput = document.getElementById('add-type'); let newCategoryInput = document.getElementById('add-category'); let newDateInput = document.getElementById('add-date');
        if (newTypeInput && newCategoryInput) {
            newDateInput.value = inputDate; newTypeInput.value = lastType;
            renderCategoryByType(lastType);
            newCategoryInput.value = lastCategory;
        }
        document.getElementById('add-amount').value = ''; document.getElementById('add-note').value = '';
        let helper = document.getElementById('helper-add-amount'); if (helper) helper.innerText = '';
        UI.toast('Transaction Saved');
    });
    if(document.getElementById('form-budget')) document.getElementById('form-budget').addEventListener('submit', e => {
        e.preventDefault(); 
        let amt = Number(document.getElementById('bud-amount').value);
        if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid limit amount', 'error');
        AppState.data.budgets[document.getElementById('bud-cat').value] = amt;
        AppState.save(); e.target.reset(); document.getElementById('helper-bud-amount').innerText = ''; Render.budget(); UI.toast('Target Budget Updated');
    });
    if(document.getElementById('form-add-sub')) document.getElementById('form-add-sub').addEventListener('submit', e => {
        e.preventDefault(); 
        let prc = Number(document.getElementById('sub-price').value);
        if (!Number.isFinite(prc) || prc <= 0) return UI.toast('Invalid bill amount', 'error');
        AppState.data.subscriptions.push({ id: Util.id('SUB'), name: document.getElementById('sub-name').value, price: prc, cycle: document.getElementById('sub-cycle').value, active: true });
        AppState.save(); e.target.reset(); document.getElementById('helper-sub-price').innerText = ''; Render.subscriptions(); UI.toast('Subscription Added');
    });
    if(document.getElementById('form-add-saving')) document.getElementById('form-add-saving').addEventListener('submit', e => {
        e.preventDefault(); 
        let tgt = Number(document.getElementById('sav-target').value);
        if (!Number.isFinite(tgt) || tgt <= 0) return UI.toast('Invalid target amount', 'error');
        AppState.data.savings.push({ id: Util.id('SAV'), name: document.getElementById('sav-name').value, target: tgt, current: 0 });
        AppState.save(); e.target.reset(); document.getElementById('helper-sav-target').innerText = ''; Render.savings(); UI.toast('Savings Goal Created');
    });
    if(document.getElementById('form-add-wishlist')) document.getElementById('form-add-wishlist').addEventListener('submit', e => {
        e.preventDefault(); 
        let prc = Number(document.getElementById('wish-price').value);
        if (!Number.isFinite(prc) || prc <= 0) return UI.toast('Invalid estimated price', 'error');
        let linkUrl = document.getElementById('wish-link').value;
        AppState.data.wishlist.push({ id: Util.id('WSH'), name: document.getElementById('wish-name').value, price: prc, link: linkUrl, status: 'pending' });
        AppState.save(); e.target.reset(); document.getElementById('helper-wish-price').innerText = ''; Render.savings(); UI.toast('Wishlist Item Added');
    });
    const bindSet = (formId, inputId, mainKey, subKey) => {
        const form = document.getElementById(formId);
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            let val = document.getElementById(inputId).value.trim();
            if (!val) return;
            let targetArr = subKey ? AppState.data[mainKey][subKey] : AppState.data[mainKey];
            if (!targetArr.includes(val)) {
                targetArr.push(val); AppState.save(); Render.settings(); Render.updateDropdowns(); e.target.reset(); UI.toast('Category added successfully!', 'success');
            } else { UI.toast('Category already exists!', 'error'); }
        });
    };
    bindSet('form-setting-expense', 'new-cat-expense', 'categories', 'expense');
    bindSet('form-setting-income', 'new-cat-income', 'categories', 'income');

    document.body.addEventListener('click', e => {
        let btn = e.target.closest('button'); if(!btn || !btn.dataset.act) return;
        let act = btn.dataset.act, id = btn.dataset.id;

        if(act === 'del-tx') {
            UI.modal.show({ title: 'Delete Transaction?', icon: 'warning', bodyHTML: 'Are you sure you want to delete this record? Your balance will automatically adjust.', buttons: [
                {text: 'Cancel', class: 'btn-cancel'},
                {text: 'Yes, Delete', class: 'btn-danger', onClick: () => { 
                    let tx = AppState.data.transactions.find(t=>t.id===id);
                    if (tx && tx.linkedSavId) {
                        let targetSav = AppState.data.savings.find(s => s.id === tx.linkedSavId);
                        if (targetSav) { targetSav.current -= tx.amount; if(targetSav.current < 0) targetSav.current = 0; }
                    }
                    AppState.data.transactions = AppState.data.transactions.filter(t=>t.id!==id); 
                    AppState.save(); Render.all(); UI.toast('Transaction Deleted & Progress Adjusted'); 
                }}
            ]});
        }        
        if(act === 'del-bud') { delete AppState.data.budgets[btn.dataset.cat]; AppState.save(); Render.budget(); }
        if(act === 'del-sav') {
            let s = AppState.data.savings.find(x => x.id === id); if (!s) return;
            let bodyMsg = `Apakah Anda yakin ingin menghapus target tabungan <strong>${Util.escapeHTML(s.name)}</strong>?`;
            if (s.current > 0) bodyMsg += `<br><br><span style="color:var(--success); font-weight:600; display:block; padding:10px; background:var(--primary-light); border-radius:6px;">💰 Dana terakumulasi sebesar ${Util.idr(s.current)} otomatis dikembalikan (Refund).</span>`;

            UI.modal.show({ title: 'Hapus Target Tabungan?', icon: 'warning', bodyHTML: bodyMsg, buttons: [
                { text: 'Batal', class: 'btn-cancel' },
                { text: 'Ya, Hapus', class: 'btn-danger', onClick: () => {
                    if (s.current > 0) {
                        AppState.data.transactions.push({ id: Util.id('TX'), date: Util.date(), timestamp: Date.now(), type: 'income', category: 'Other', amount: s.current, note: `[Refund] Pembatalan Tabungan: ${s.name}` });
                        AppState.data.transactions.sort((a, b) => { let da = new Date(a.date).getTime()||0; let db = new Date(b.date).getTime()||0; if(db-da===0) return (b.timestamp||0)-(a.timestamp||0); return db-da; });
                    }
                    AppState.data.savings = AppState.data.savings.filter(x => x.id !== id);
                    AppState.save(); Render.all();
                    if (s.current > 0) UI.toast(`Tabungan dihapus & ${Util.idr(s.current)} berhasil di-refund!`, 'success');
                    else UI.toast('Target Tabungan Berhasil Dihapus', 'success');
                }}
            ]});
        }        
        if(act === 'del-wish') { AppState.data.wishlist = AppState.data.wishlist.filter(w=>w.id!==id); AppState.save(); Render.all(); UI.toast('Wishlist Item Deleted'); }
        if(act === 'del-sub') { AppState.data.subscriptions = AppState.data.subscriptions.filter(s=>s.id!==id); AppState.save(); Render.subscriptions(); }
        
        if(act === 'toggle-sub') {
            let s = AppState.data.subscriptions.find(x=>x.id===id); s.active = !s.active;
            AppState.save(); Render.subscriptions(); UI.toast(s.active ? 'Subscription Activated' : 'Subscription Paused');
        }
        if(act === 'pay-sub') {
            let s = AppState.data.subscriptions.find(x=>x.id===id);
            UI.modal.show({ title: 'Pay this Bill?', icon: 'payment', bodyHTML: `The system will auto-record an expense of <strong>${Util.idr(s.price)}</strong> into your Fiat Transactions for <strong>TODAY</strong>. Proceed?`, buttons: [
                {text: 'Cancel', class: 'btn-cancel'}, {text: 'Pay Now', class: 'btn-primary', style: 'background: var(--purple)', onClick: () => {
                    let todayDate = Util.date();
                    AppState.data.transactions.push({ id: Util.id('TX'), date: todayDate, timestamp: Date.now(), type: 'expense', category: 'Utility', amount: s.price, note: `Auto-Pay Bill: ${s.name}` });
                    AppState.data.transactions.sort((a, b) => { let da = new Date(a.date).getTime()||0; let db = new Date(b.date).getTime()||0; if(db-da===0) return (b.timestamp||0)-(a.timestamp||0); return db-da; });                
                    let curMonth = todayDate.substring(0, 7);
                    if(document.getElementById('filter-year')) document.getElementById('filter-year').value = curMonth.substring(0,4);
                    if(document.getElementById('filter-month')) { document.getElementById('filter-month').value = curMonth.substring(5,7); document.getElementById('filter-month').disabled = false; document.getElementById('filter-month').style.opacity = '1'; }
                    AppState.selectedMonth = curMonth;
                    
                    AppState.save(); Render.all(); UI.toast(`Paid successfully! Jumped to current month.`);
                }}
            ]});
        }
        if(act === 'del-setting') {
            let { m, s, idx } = btn.dataset; let tArr = s ? AppState.data[m][s] : AppState.data[m];
            if(tArr.length <= 1) return UI.toast('Warning: At least 1 item is required.', 'error');
            let deletedItem = tArr[idx]; tArr.splice(idx, 1); 
            if (m === 'categories' && s === 'expense' && AppState.data.budgets[deletedItem]) delete AppState.data.budgets[deletedItem];
            AppState.save(); Render.settings(); Render.updateDropdowns(); Render.budget();
        }
        if(act === 'add-sav') {
            let s = AppState.data.savings.find(x=>x.id===id);
            UI.modal.show({
                title: `Add Funds: ${Util.escapeHTML(s.name)}`, icon: 'add_circle',
                bodyHTML: `<p>Current Progress: ${Util.idr(s.current)} / ${Util.idr(s.target)}</p><br><div class="form-group"><input type="number" id="modal-sav-input" class="form-control" placeholder="Amount Added (IDR)" min="1"><span class="format-helper" id="helper-modal-sav" style="display:block; margin-top:4px;"></span></div>`,
                buttons: [
                    {text: 'Cancel', class: 'btn-cancel'}, {text: 'Add Funds', class: 'btn-primary', onClick: () => {
                        let amt = Number(document.getElementById('modal-sav-input').value);
                        if (!Number.isFinite(amt) || amt <= 0) return UI.toast('Invalid Amount', 'error');
                        s.current += amt; 
                        let todayDate = Util.date();
                        AppState.data.transactions.push({ id: Util.id('TX'), date: todayDate, timestamp: Date.now(), type: 'expense', category: 'Other', amount: amt, note: `Saving Deposit: ${s.name}`, linkedSavId: s.id });
                        AppState.data.transactions.sort((a, b) => { let da = new Date(a.date).getTime()||0; let db = new Date(b.date).getTime()||0; if(db-da===0) return (b.timestamp||0)-(a.timestamp||0); return db-da; }); 
                        AppState.save(); Render.all(); UI.toast('Funds Added & Transaction Logged');
                    }}
                ]
            });
            setTimeout(() => UI.bindFormatHelper('modal-sav-input', 'helper-modal-sav'), 100);
        }        
        if(act === 'buy-wish') {
            let w = AppState.data.wishlist.find(x=>x.id===id);
            UI.modal.show({ title: 'Mark as Bought?', icon: 'shopping_bag', bodyHTML: `Did you purchase <strong>${Util.escapeHTML(w.name)}</strong> for ${Util.idr(w.price)}?<br><br><span style="font-size:0.85rem; color:var(--text-muted);">This will automatically log a "Shopping" expense for <strong>TODAY</strong>.</span>`, buttons: [
                {text: 'Cancel', class: 'btn-cancel'}, {text: 'Confirm Purchase', class: 'btn-success', style:'background:var(--success);', onClick: () => {
                    w.status = 'bought'; let todayDate = Util.date();
                    AppState.data.transactions.push({ id: Util.id('TX'), date: todayDate, timestamp: Date.now(), type: 'expense', category: 'Shopping', amount: w.price, note: `Wishlist: ${w.name}` });
                    AppState.data.transactions.sort((a, b) => { let da = new Date(a.date).getTime()||0; let db = new Date(b.date).getTime()||0; if(db-da===0) return (b.timestamp||0)-(a.timestamp||0); return db-da; });               
                    let curMonth = todayDate.substring(0, 7);
                    if(document.getElementById('filter-year')) document.getElementById('filter-year').value = curMonth.substring(0,4);
                    if(document.getElementById('filter-month')) { document.getElementById('filter-month').value = curMonth.substring(5,7); document.getElementById('filter-month').disabled = false; document.getElementById('filter-month').style.opacity = '1'; }
                    AppState.selectedMonth = curMonth;

                    AppState.save(); Render.all(); UI.toast(`Enjoy your new ${w.name}! Jumped to current month.`);
                }}
            ]});
        }
    });
    if(document.getElementById('btn-reset-data')) document.getElementById('btn-reset-data').addEventListener('click', () => { 
        UI.modal.show({ 
            title: 'WIPE ALL DATA', icon: 'warning', 
            bodyHTML: '<p style="color:var(--danger); font-weight:bold;">WARNING!</p><p>Type "WIPE" below if you want to permanently format/delete the entire application data.</p><div class="form-group" style="margin-top:16px;"><input type="text" id="modal-wipe-input" class="form-control" placeholder="WIPE"></div>', 
            buttons: [
                { text: 'Cancel', class: 'btn-cancel' }, { text: 'Destroy Data', class: 'btn-danger', onClick: async () => {
                        const confirmText = document.getElementById('modal-wipe-input').value;
                        if (confirmText === 'WIPE') {
                            AppState.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
                            await AppState.save();
                            UI.toast('All data has been permanently wiped!', 'success'); setTimeout(() => location.reload(), 1500);
                        } else { UI.toast('Penghapusan dibatalkan. Anda harus mengetik WIPE dengan huruf besar.', 'error'); }
                    }
                }
            ]
        });
    });
    if(document.getElementById('btn-export-csv')) document.getElementById('btn-export-csv').addEventListener('click', () => {
        let filteredTxs = AppState.data.transactions.filter(t => Filter.isMatch(t.date));
        if(!filteredTxs.length) return UI.toast('No transaction data for this period to export', 'error');        
        let csvContent = "Date,Type,Category,Amount,Note\n" + filteredTxs.map(t => {
            let safeNote = t.note ? t.note.replace(/"/g, '""').replace(/\n/g, ' ') : '';
            return `${t.date},${t.type},${t.category},${t.amount},"${safeNote}"`;
        }).join("\n");        
        let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        let url = URL.createObjectURL(blob);
        const l = document.createElement("a"); l.style.display = "none"; l.href = url;         
        let timeSummary = Filter.getSummaryText().replace(/[^a-zA-Z0-9]/g, '_');
        l.download = `YourVault_Trx_${timeSummary}_${Util.date()}.csv`;         
        document.body.appendChild(l); l.click(); 
        setTimeout(() => { document.body.removeChild(l); URL.revokeObjectURL(url); }, 100);
        UI.toast('Filtered CSV Export Downloaded!', 'success');
    });
    if(document.getElementById('btn-export-json')) document.getElementById('btn-export-json').addEventListener('click', () => {
        let dataStr = JSON.stringify(AppState.data, null, 2);
        let blob = new Blob([dataStr], {type: "application/json"});
        let url  = URL.createObjectURL(blob);
        const l = document.createElement("a"); l.style.display = "none"; l.href = url; l.download = `YourVault_Backup_${Util.date()}.json`;
        document.body.appendChild(l); l.click(); 
        setTimeout(() => { document.body.removeChild(l); URL.revokeObjectURL(url); }, 100);
        UI.toast('Full Backup Downloaded!', 'success');
    });
    if(document.getElementById('btn-trigger-import')) document.getElementById('btn-trigger-import').addEventListener('click', () => {
        let fileInput = document.getElementById('file-import-json');
        if (fileInput) {
            fileInput.value = ''; 
            fileInput.click();
        }
    });
    if(document.getElementById('file-import-json')) document.getElementById('file-import-json').addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (!file) return;        
        let reader = new FileReader();
        reader.onload = async function(event) {
            try {
                let importedData = JSON.parse(event.target.result);
                if (importedData) {
                    if (typeof UI !== 'undefined' && UI.modal) UI.modal.close();            
                    let currentData = AppState.data || {};
                    let newTransactions = importedData.transactions || importedData.Transactions || [];         
                    let finalData = {
                        transactions: [...(currentData.transactions || []), ...newTransactions],
                        savings: [...(currentData.savings || []), ...(importedData.savings || [])],
                        wishlist: [...(currentData.wishlist || []), ...(importedData.wishlist || [])],
                        subscriptions: [...(currentData.subscriptions || []), ...(importedData.subscriptions || [])],
                        budgets: { ...(currentData.budgets || {}), ...(importedData.budgets || {}) },
                        categories: importedData.categories || currentData.categories || DEFAULT_DATA.categories
                    };
                    AppState.data = finalData;
                    
                    if (newTransactions.length > 0) {
                        let sortedTx = [...newTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
                        let latestTxDate = new Date(sortedTx[0].date);
                        if (!isNaN(latestTxDate)) {
                            let targetMonth = String(latestTxDate.getMonth() + 1).padStart(2, '0');
                            let targetYear = latestTxDate.getFullYear().toString();
                            let selectMonth = document.getElementById('filter-month');
                            let selectYear = document.getElementById('filter-year');
                            if (selectYear) selectYear.value = targetYear;
                            if (selectMonth) selectMonth.value = targetMonth;
                        }
                    }
                                        Render.initTimeMachine();
                    Render.all();
                                        UI.toast(`Berhasil memuat ${newTransactions.length} Transaksi Riwayat!`, 'success');
                    await AppState.save();

                } else { UI.toast('File JSON rusak atau tidak valid.', 'error'); }
            } catch (err) { 
                console.error("Error saat import:", err);
                UI.toast('Gagal membaca file backup.', 'error'); 
            }
        };
        reader.readAsText(file); e.target.value = ''; 
    });
    const btnLockMobile = document.getElementById('btn-lock-mobile');
    if (btnLockMobile) btnLockMobile.addEventListener('click', () => { 
        let logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) logoutBtn.click(); 
    });
    if(document.getElementById('gh-token')) document.getElementById('gh-token').value = localStorage.getItem('vault_gh_token') || '';
    if(document.getElementById('gh-gist-id')) document.getElementById('gh-gist-id').value = localStorage.getItem('vault_gh_gist_id') || '';
    if(document.getElementById('btn-save-gh')) document.getElementById('btn-save-gh').addEventListener('click', async () => {
        const token = document.getElementById('gh-token').value.trim();
        const gistId = document.getElementById('gh-gist-id').value.trim();
        if(!token || !gistId) { UI.toast('Token dan Gist ID tidak boleh kosong!', 'error'); return; }

        localStorage.setItem('vault_gh_token', token);
        localStorage.setItem('vault_gh_gist_id', gistId);
        UI.toast('Konfigurasi Cloud berhasil disimpan! Reloading...', 'success');
        await AppState.init(); Render.all();
    });
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
            if (filterModeEl.value === 'range') {
                filterModeEl.style.width = '115px'; 
            } else {
                filterModeEl.style.width = 'auto'; 
            }
        };
        adjustDropdownWidth();
        filterModeEl.addEventListener('change', adjustDropdownWidth);
    }
});
const sidebarEl = document.getElementById('sidebar');
if (sidebarEl) {
    sidebarEl.addEventListener('transitionend', () => {
        if (typeof Charts !== 'undefined' && Charts.inst) {
            if (Charts.inst.dash) Charts.inst.dash.resize();
            if (Charts.inst.pie) Charts.inst.pie.resize();
            if (Charts.inst.detail) Charts.inst.detail.resize();
        }
    });
}

window.addEventListener('resize', () => {

    if (typeof Charts !== 'undefined' && Charts.inst) {

        if (Charts.inst.dash) Charts.inst.dash.resize();

        if (Charts.inst.pie) Charts.inst.pie.resize();

        if (Charts.inst.detail) Charts.inst.detail.resize();

    }

});



const now = new Date();

const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

let fiatDateInput = document.getElementById('add-date');

if (fiatDateInput && !fiatDateInput.value) fiatDateInput.value = today;



