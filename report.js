// File: report.js (Complete PDF Generator + Cycle Cleaner + Unified Bottom Sheet)
window.addEventListener('load', function () {
    const btnGenerate = document.getElementById('btn-export-pdf');
    const filterModeEl = document.getElementById('filter-mode');
    const filterMonthEl = document.getElementById('filter-month');
    const filterYearEl = document.getElementById('filter-year');
    const filterStartEl = document.getElementById('filter-start');
    const filterEndEl = document.getElementById('filter-end');

    // 1. HAPUS OPSI "SIKLUS GAJIAN" JIKA DISUNTIKKAN SCRIPT LAIN
    const cleanCycleOption = () => {
        if (!filterModeEl) return;
        Array.from(filterModeEl.options).forEach(opt => {
            if (opt.value.includes('cycle') || opt.value.includes('25') || opt.text.toLowerCase().includes('siklus')) {
                opt.remove();
            }
        });
    };
    cleanCycleOption();
    if (filterModeEl) {
        const observer = new MutationObserver(cleanCycleOption);
        observer.observe(filterModeEl, { childList: true });
    }

    // 2. AMBIL DATA TRANSAKSI DARI MEMORI ATAU LOCALSTORAGE
    function getExistingTransactions() {
        if (Array.isArray(window['transactions'])) return window['transactions'];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            try {
                const parsed = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].amount !== undefined) return parsed;
                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.transactions)) return parsed.transactions;
            } catch (e) {}
        }
        return [];
    }

    function formatIDR(num) {
        const val = Math.round(Number(num) || 0);
        return 'Rp ' + val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function getFilteredData() {
        const allTxs = getExistingTransactions();
        const mode = filterModeEl ? filterModeEl.value : 'monthly';
        const selectedYear = filterYearEl ? filterYearEl.value.toString().toLowerCase() : 'all';
        const selectedMonth = filterMonthEl ? filterMonthEl.value.toString().toLowerCase() : 'all';
        const startDate = filterStartEl ? filterStartEl.value : '';
        const endDate = filterEndEl ? filterEndEl.value : '';

        let periodLabel = "All Time Record";

        const filtered = allTxs.filter(tx => {
            if (!tx.date) return false;

            if (mode === 'range') {
                if (startDate && tx.date < startDate) return false;
                if (endDate && tx.date > endDate) return false;
                return true;
            } else {
                const txYear = tx.date.substring(0, 4);
                const txMonth = tx.date.substring(5, 7);

                const isAllYear = (selectedYear === 'all' || selectedYear === '' || selectedYear === 'all-time');
                const isAllMonth = (selectedMonth === 'all' || selectedMonth === '' || selectedMonth === 'all-time');

                const matchYear = isAllYear ? true : (txYear === selectedYear);
                const matchMonth = isAllMonth ? true : (txMonth === selectedMonth.padStart(2, '0'));

                return matchYear && matchMonth;
            }
        });

        filtered.sort((a, b) => b.date.localeCompare(a.date));

        if (mode === 'range') {
            periodLabel = `${startDate || 'Beginning'} to ${endDate || 'Present'}`;
        } else {
            const isAllYear = (selectedYear === 'all' || selectedYear === '' || selectedYear === 'all-time');
            const isAllMonth = (selectedMonth === 'all' || selectedMonth === '' || selectedMonth === 'all-time');
            const monthText = filterMonthEl?.options[filterMonthEl.selectedIndex]?.text || selectedMonth;

            if (!isAllYear && isAllMonth) {
                periodLabel = `Full Year ${selectedYear}`;
            } else if (!isAllYear && !isAllMonth) {
                periodLabel = `${monthText} ${selectedYear}`;
            } else if (isAllYear && !isAllMonth) {
                periodLabel = `All Years - ${monthText}`;
            } else {
                periodLabel = `All Time Record`;
            }
        }

        let totalIncome = 0, totalExpense = 0, incomeCount = 0, expenseCount = 0;
        const expenseByCat = {}, incomeByCat = {}, trendMap = {};
        const isYearlyOrAll = (mode === 'monthly' && (selectedMonth === 'all' || selectedYear === 'all'));

        filtered.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            const cat = tx.category || 'Other';
            const dateKey = isYearlyOrAll ? tx.date.substring(0, 7) : tx.date;

            if (!trendMap[dateKey]) trendMap[dateKey] = { income: 0, expense: 0 };

            if (tx.type === 'income') {
                totalIncome += amt;
                incomeCount++;
                incomeByCat[cat] = (incomeByCat[cat] || 0) + amt;
                trendMap[dateKey].income += amt;
            } else if (tx.type === 'expense') {
                totalExpense += amt;
                expenseCount++;
                expenseByCat[cat] = (expenseByCat[cat] || 0) + amt;
                trendMap[dateKey].expense += amt;
            }
        });

        const netCashflow = totalIncome - totalExpense;
        return {
            filtered, periodLabel, totalIncome, totalExpense, netCashflow,
            totalCount: filtered.length,
            avgIncome: incomeCount > 0 ? totalIncome / incomeCount : 0,
            avgExpense: expenseCount > 0 ? totalExpense / expenseCount : 0,
            savingsRate: totalIncome > 0 ? ((netCashflow / totalIncome) * 100).toFixed(1) : '0.0',
            expenseByCat, incomeByCat, trendMap
        };
    }

    async function renderOffscreenChart(config, width, height, themeColors) {
        return new Promise((resolve) => {
            const ChartLib = window['Chart'];
            if (!ChartLib) return resolve(null);
            
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');

            config.plugins = [{
                id: 'customBg',
                beforeDraw: (c) => {
                    const ctx = c.ctx;
                    ctx.save();
                    ctx.fillStyle = themeColors.chartBg;
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.restore();
                }
            }];
            config.options.animation = false;
            config.options.responsive = false;

            if (config.options.plugins) {
                if (config.options.plugins.title) {
                    config.options.plugins.title.color = themeColors.textMain;
                }
                if (config.options.plugins.legend) {
                    if (!config.options.plugins.legend.labels) config.options.plugins.legend.labels = {};
                    config.options.plugins.legend.labels.color = themeColors.textMuted;
                }
            }
            
            if (config.options.scales) {
                if (config.options.scales.x) {
                    if (!config.options.scales.x.ticks) config.options.scales.x.ticks = {};
                    if (!config.options.scales.x.grid) config.options.scales.x.grid = {};
                    config.options.scales.x.ticks.color = themeColors.textMuted;
                    config.options.scales.x.grid.color = themeColors.gridColor;
                }
                if (config.options.scales.y) {
                    if (!config.options.scales.y.ticks) config.options.scales.y.ticks = {};
                    if (!config.options.scales.y.grid) config.options.scales.y.grid = {};
                    config.options.scales.y.ticks.color = themeColors.textMuted;
                    config.options.scales.y.grid.color = themeColors.gridColor;
                }
            }

            const chart = new ChartLib(ctx, config);
            setTimeout(() => {
                const imgData = canvas.toDataURL('image/png', 1.0);
                chart.destroy();
                resolve(imgData);
            }, 80);
        });
    }

    if (!btnGenerate) return;

    btnGenerate.addEventListener('click', async () => {
        const jsPDFLib = window['jspdf'];
        if (!jsPDFLib || !jsPDFLib.jsPDF) {
            alert('PDF Library is loading. Please try again in a moment.');
            return;
        }

        const origBtnHTML = btnGenerate.innerHTML;
        btnGenerate.disabled = true;
        btnGenerate.innerHTML = '<span class="material-icons-round" style="animation: pulse 1s infinite;">hourglass_top</span>';

        try {
            const data = getFilteredData();
            const { jsPDF } = jsPDFLib;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            const themeIconText = (document.getElementById('theme-icon')?.textContent || '').trim();
            const bodyBg = window.getComputedStyle(document.body).backgroundColor;
            let isDarkBg = false;
            const rgb = bodyBg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                const brightness = (Number(rgb[0]) * 299 + Number(rgb[1]) * 587 + Number(rgb[2]) * 114) / 1000;
                isDarkBg = brightness < 128;
            }

            const isDark = themeIconText === 'light_mode' || 
                           isDarkBg ||
                           document.body.classList.contains('dark-mode') || 
                           document.body.classList.contains('dark-theme') || 
                           document.body.classList.contains('dark') ||
                           document.documentElement.getAttribute('data-theme') === 'dark';

            const T = {
                bg: isDark ? [11, 15, 25] : [248, 250, 252],
                card: isDark ? [22, 27, 46] : [255, 255, 255],
                textMain: isDark ? [255, 255, 255] : [15, 23, 42],
                textMuted: isDark ? [148, 163, 184] : [100, 116, 139],
                border: isDark ? [30, 41, 59] : [226, 232, 240],
                chart: {
                    chartBg: isDark ? '#161b2e' : '#ffffff',
                    textMain: isDark ? '#f8fafc' : '#0f172a',
                    textMuted: isDark ? '#94a3b8' : '#64748b',
                    gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                }
            };

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 14;
            const contentWidth = pageWidth - (margin * 2);

            function paintBackground() {
                doc.setFillColor(...T.bg);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
            }
            paintBackground();

            // HEADER
            doc.setFillColor(...T.card);
            if (!isDark) { doc.setDrawColor(...T.border); doc.roundedRect(margin, 12, contentWidth, 28, 3, 3, 'FD'); }
            else { doc.roundedRect(margin, 12, contentWidth, 28, 3, 3, 'F'); }
            
            doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.6);
            doc.line(margin, 12, margin, 40);

            doc.setTextColor(...T.textMain); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
            doc.text("KRISNA'S VAULT", margin + 6, 22);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...T.textMuted);
            doc.text("Financial Report Statement", margin + 6, 28);
            doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, margin + 6, 34);

            doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(129, 140, 248);
            doc.text("REPORTING PERIOD", pageWidth - margin - 6, 22, { align: 'right' });
            doc.setFontSize(12); doc.setTextColor(...T.textMain);
            doc.text(data.periodLabel, pageWidth - margin - 6, 29, { align: 'right' });
            doc.setFontSize(8.5); doc.setTextColor(...T.textMuted);
            doc.text(`Total Records: ${data.totalCount} Transactions`, pageWidth - margin - 6, 35, { align: 'right' });

            // KPI CARDS
            let yPos = 46;
            const kpis = [
                { label: 'TOTAL INCOME', val: formatIDR(data.totalIncome), accent: [16, 185, 129] },
                { label: 'TOTAL EXPENSE', val: formatIDR(data.totalExpense), accent: [239, 68, 68] },
                { label: 'NET CASHFLOW', val: (data.netCashflow < 0 ? '- ' : '') + formatIDR(Math.abs(data.netCashflow)), accent: data.netCashflow >= 0 ? [59, 130, 246] : [239, 68, 68] },
                { label: 'AVERAGE INCOME', val: formatIDR(data.avgIncome), accent: [16, 185, 129] },
                { label: 'AVERAGE EXPENSE', val: formatIDR(data.avgExpense), accent: [245, 158, 11] },
                { label: 'SAVINGS RATE', val: `${data.savingsRate}%`, accent: [139, 92, 246] }
            ];

            const cardW = (contentWidth - 8) / 3;
            kpis.forEach((kpi, idx) => {
                const x = margin + (idx % 3) * (cardW + 4);
                const y = yPos + Math.floor(idx / 3) * 22;
                doc.setFillColor(...T.card);
                if (!isDark) { doc.setDrawColor(...T.border); doc.roundedRect(x, y, cardW, 18, 2, 2, 'FD'); }
                else { doc.roundedRect(x, y, cardW, 18, 2, 2, 'F'); }
                
                doc.setFillColor(...kpi.accent); doc.rect(x, y, 1.5, 18, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...T.textMuted);
                doc.text(kpi.label, x + 5, y + 6.5);
                doc.setFontSize(11); doc.setTextColor(...T.textMain);
                doc.text(kpi.val, x + 5, y + 13.5);
            });
            yPos += 50;

            // CHARTS
            if (data.totalCount > 0) {
                const sortedDates = Object.keys(data.trendMap).sort();
                const trendImg = await renderOffscreenChart({
                    type: 'bar',
                    data: {
                        labels: sortedDates,
                        datasets: [
                            { label: 'Income', data: sortedDates.map(d => data.trendMap[d].income), backgroundColor: '#10b981', borderRadius: 2 },
                            { label: 'Expense', data: sortedDates.map(d => data.trendMap[d].expense), backgroundColor: '#ef4444', borderRadius: 2 }
                        ]
                    },
                    options: { plugins: { title: { display: true, text: 'Income vs Expense Trend', font: { size: 14, weight: 'bold' } } }, scales: { x: {}, y: {} } }
                }, 640, 320, T.chart);

                const expLabels = Object.keys(data.expenseByCat);
                const expDoughnutImg = await renderOffscreenChart({
                    type: 'doughnut',
                    data: {
                        labels: expLabels.length ? expLabels : ['No Data'],
                        datasets: [{ data: expLabels.length ? Object.values(data.expenseByCat) : [1], backgroundColor: expLabels.length ? ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'] : [T.chart.gridColor], borderWidth: 0 }]
                    },
                    options: { plugins: { title: { display: true, text: 'Expense Breakdown', font: { size: 14, weight: 'bold' } }, legend: { position: 'right' } } }
                }, 640, 320, T.chart);

                const chartW = (contentWidth - 4) / 2;
                if (trendImg) doc.addImage(trendImg, 'PNG', margin, yPos, chartW, 46);
                if (expDoughnutImg) doc.addImage(expDoughnutImg, 'PNG', margin + chartW + 4, yPos, chartW, 46);
                yPos += 51;
            }

            // INSIGHT
            let insight = `During ${data.periodLabel}, you recorded ${data.totalCount} transactions with a net cashflow of ${(data.netCashflow < 0 ? '-' : '') + formatIDR(Math.abs(data.netCashflow))}. `;
            insight += data.totalCount === 0 ? "No records found." : (data.netCashflow > 0 ? `Savings rate stands at ${data.savingsRate}%, a healthy surplus.` : `Expenses exceeded income. Review spending to optimize cashflow.`);
            
            const wrappedInsight = doc.splitTextToSize(insight, contentWidth - 8);
            const boxHeight = 9 + (wrappedInsight.length * 4.2);
            doc.setFillColor(isDark ? 30 : 238, isDark ? 27 : 242, isDark ? 75 : 255); 
            doc.roundedRect(margin, yPos, contentWidth, boxHeight, 2, 2, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(isDark ? 165 : 79, isDark ? 180 : 70, isDark ? 252 : 229);
            doc.text("EXECUTIVE SUMMARY", margin + 4, yPos + 5.5);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...T.textMain);
            doc.text(wrappedInsight, margin + 4, yPos + 10.5);
            yPos += boxHeight + 8;

            // TABLE
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...T.textMain);
            doc.text("Transaction Ledger", margin, yPos);
            
            const tableRows = data.filtered.length ? data.filtered.map(tx => [tx.date, tx.type.toUpperCase(), tx.category || '-', tx.note || '-', (tx.type === 'income' ? '+ ' : '- ') + formatIDR(tx.amount)]) : [['-', '-', '-', 'No transactions', 'Rp 0']];

            doc['autoTable']({
                startY: yPos + 3,
                head: [['Date', 'Type', 'Category', 'Description', 'Amount']],
                body: tableRows,
                margin: { left: margin, right: margin, bottom: 16 },
                styles: { fillColor: T.card, textColor: T.textMain, fontSize: 8.5, cellPadding: 3, lineColor: T.border, lineWidth: 0.1 },
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: isDark ? [17, 22, 38] : [248, 250, 252] },
                columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
                didParseCell: (data) => {
                    if (data.section === 'body' && (data.column.index === 1 || data.column.index === 4)) {
                        data.cell.styles.textColor = data.row.raw[1] === 'INCOME' ? [16, 185, 129] : [239, 68, 68];
                    }
                },
                willDrawPage: (data) => { if (data.pageNumber > 1) paintBackground(); },
                didDrawPage: (data) => { doc.setFontSize(8); doc.setTextColor(...T.textMuted); doc.text(`Krisna's Vault | Page ${data.pageNumber}`, pageWidth / 2, pageHeight - 8, { align: 'center' }); }
            });

            doc.save(`Krisnas_Vault_${data.periodLabel.replace(/ /g, '_')}.pdf`);

        } catch (err) {
            console.error(err);
            alert('Failed to generate PDF: ' + err.message);
        } finally {
            btnGenerate.disabled = false;
            btnGenerate.innerHTML = origBtnHTML;
        }
    });
});
