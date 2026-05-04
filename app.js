// Dashboard Kepemilikan Saham >1%
const fmtID = new Intl.NumberFormat('id-ID');
const fmtPct = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCompact = n => {
  if (n >= 1e12) return (n / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' T';
  if (n >= 1e9) return (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' Jt';
  return fmtID.format(n);
};

const escapeHtml = s => s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

let rawData = [];
let filteredData = [];
let sortKey = 'saham';
let sortDir = 'desc';
let currentPage = 1;
const pageSize = 20;

let donutChart, barChart;
let debounceTimer;

document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.font.family = "'PT Sans', system-ui, sans-serif";
  Chart.defaults.color = '#64748b';

  await loadData();
  initFilters();
  bindEvents();
  applyFilters();
});

async function loadData() {
  const res = await fetch('data/saham.csv');
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(';');

  rawData = lines.slice(1).map(line => {
    const cols = line.split(';');
    const obj = {};
    header.forEach((h, i) => obj[h] = cols[i] || '');
    return {
      code: obj.SHARE_CODE,
      issuer: obj.ISSUER_NAME,
      investor: obj.INVESTOR_NAME,
      type: obj.INVESTOR_TYPE || '',
      asal: obj.LOCAL_FOREIGN || '',
      domicile: obj.DOMICILE || '',
      shares: parseInt((obj.TOTAL_HOLDING_SHARES || '0').replace(/\./g, '')) || 0,
      percent: parseFloat((obj.PERCENTAGE || '0').replace(',', '.')) || 0,
    };
  }).filter(d => d.code);
}

function initFilters() {
  const emitenSet = new Map();
  rawData.forEach(d => emitenSet.set(d.code, d.issuer));
  const emitenList = document.getElementById('emitenList');
  [...emitenSet.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([code, name]) => {
    const opt = document.createElement('option');
    opt.value = code + ' - ' + name;
    emitenList.appendChild(opt);
  });

  const tipeSet = [...new Set(rawData.map(d => d.type).filter(Boolean))].sort();
  const tipeSel = document.getElementById('filterTipe');
  tipeSet.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    tipeSel.appendChild(opt);
  });

  const domSet = [...new Set(rawData.map(d => d.domicile).filter(Boolean))].sort();
  const domSel = document.getElementById('filterDomisili');
  domSet.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    domSel.appendChild(opt);
  });
}

function bindEvents() {
  document.getElementById('filterEmiten').addEventListener('input', applyFilters);
  document.getElementById('filterTipe').addEventListener('change', applyFilters);
  document.getElementById('filterAsal').addEventListener('change', applyFilters);
  document.getElementById('filterDomisili').addEventListener('change', applyFilters);
  document.getElementById('filterCari').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 300);
  });
  document.getElementById('btnReset').addEventListener('click', resetFilters);

  document.querySelectorAll('#dataTable thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = key; sortDir = 'desc'; }
      renderTable();
      updateSortUI();
    });
  });

  document.getElementById('prevBtn').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
  document.getElementById('nextBtn').addEventListener('click', () => { const max = Math.ceil(filteredData.length / pageSize); if (currentPage < max) { currentPage++; renderTable(); } });
}

function resetFilters() {
  document.getElementById('filterEmiten').value = '';
  document.getElementById('filterTipe').value = '';
  document.getElementById('filterAsal').value = '';
  document.getElementById('filterDomisili').value = '';
  document.getElementById('filterCari').value = '';
  sortKey = 'saham';
  sortDir = 'desc';
  applyFilters();
}

function applyFilters() {
  const emitenVal = document.getElementById('filterEmiten').value.trim();
  const emitenCode = emitenVal.split(' - ')[0].toUpperCase();
  const tipeVal = document.getElementById('filterTipe').value;
  const asalVal = document.getElementById('filterAsal').value;
  const domVal = document.getElementById('filterDomisili').value;
  const cariVal = document.getElementById('filterCari').value.trim().toLowerCase();

  filteredData = rawData.filter(d => {
    if (emitenVal && d.code !== emitenCode) return false;
    if (tipeVal && d.type !== tipeVal) return false;
    if (asalVal && d.asal !== asalVal) return false;
    if (domVal && d.domicile !== domVal) return false;
    if (cariVal && !d.investor.toLowerCase().includes(cariVal) && !d.code.toLowerCase().includes(cariVal)) return false;
    return true;
  });

  currentPage = 1;
  updateKPIs();
  updateCharts(cariVal);
  renderTable();
  updateSortUI();
}

function updateKPIs() {
  const totalEmiten = new Set(filteredData.map(d => d.code)).size;
  const totalInvestor = new Set(filteredData.map(d => d.investor)).size;
  const totalShares = filteredData.reduce((s, d) => s + d.shares, 0);
  const avgPct = filteredData.length ? filteredData.reduce((s, d) => s + d.percent, 0) / filteredData.length : 0;

  document.getElementById('kpiEmiten').textContent = fmtID.format(totalEmiten);
  document.getElementById('kpiInvestor').textContent = fmtID.format(totalInvestor);
  document.getElementById('kpiLembar').textContent = formatCompact(totalShares);
  document.getElementById('kpiAvg').textContent = fmtPct.format(avgPct);
  document.getElementById('tableInfo').textContent = fmtID.format(filteredData.length) + ' data';
}

function updateCharts(cariActive) {
  const lokal = filteredData.filter(d => d.asal === 'L').reduce((s, d) => s + d.shares, 0);
  const asing = filteredData.filter(d => d.asal === 'A').reduce((s, d) => s + d.shares, 0);
  const totalLA = lokal + asing || 1;

  const donutCtx = document.getElementById('chartDonut').getContext('2d');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(donutCtx, {
    type: 'doughnut',
    data: {
      labels: ['Lokal', 'Asing'],
      datasets: [{ data: [lokal, asing], backgroundColor: ['#0ea5e9', '#6366f1'], borderWidth: 0, hoverOffset: 8 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 18 } },
        tooltip: { callbacks: { label: ctx => ctx.label + ': ' + formatCompact(ctx.parsed) + ' (' + (ctx.parsed / totalLA * 100).toFixed(1) + '%)' } }
      }
    }
  });

  const barCtx = document.getElementById('chartBar').getContext('2d');
  if (barChart) barChart.destroy();

  let barData, title, sub;
  if (cariActive) {
    title = 'Emiten Terkait';
    sub = 'berdasarkan total lembar';
    const map = new Map();
    filteredData.forEach(d => {
      const label = d.code + ' - ' + d.issuer;
      map.set(label, (map.get(label) || 0) + d.shares);
    });
    barData = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  } else {
    title = 'Investor Terbesar';
    sub = 'berdasarkan total lembar';
    const map = new Map();
    filteredData.forEach(d => {
      map.set(d.investor, (map.get(d.investor) || 0) + d.shares);
    });
    barData = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }
  document.getElementById('barTitle').textContent = title;
  document.getElementById('barSub').textContent = sub;

  const labels = barData.map(d => truncate(d[0], 26));
  const values = barData.map(d => d[1]);

  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Lembar', data: values, backgroundColor: '#0ea5e9', borderRadius: 8, borderSkipped: false, maxBarThickness: 32 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => formatCompact(ctx.parsed.x) + ' lembar' } }
      },
      scales: {
        x: { ticks: { callback: v => formatCompact(v) }, grid: { drawBorder: false } },
        y: { grid: { display: false } }
      }
    }
  });
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!filteredData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Tidak ada data ditemukan. Coba ubah filter.</td></tr>';
    document.getElementById('pageInfo').textContent = '0\u20130 dari 0';
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    return;
  }

  const sorted = [...filteredData].sort((a, b) => {
    let va, vb;
    switch (sortKey) {
      case 'emiten': va = a.code; vb = b.code; break;
      case 'investor': va = a.investor; vb = b.investor; break;
      case 'tipe': va = a.type; vb = b.type; break;
      case 'asal': va = a.asal; vb = b.asal; break;
      case 'domisili': va = a.domicile; vb = b.domicile; break;
      case 'saham': va = a.shares; vb = b.shares; break;
      case 'persen': va = a.percent; vb = b.percent; break;
      default: va = a.shares; vb = b.shares;
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, filteredData.length);
  const pageData = sorted.slice(start, end);

  tbody.innerHTML = pageData.map(d => {
    const badgeClass = d.asal === 'L' ? 'L' : 'A';
    return '<tr>' +
      '<td><span class="emiten-badge">' + escapeHtml(d.code) + '</span></td>' +
      '<td><div class="investor-cell" title="' + escapeHtml(d.investor) + '">' + escapeHtml(d.investor) + '</div></td>' +
      '<td>' + escapeHtml(d.type) + '</td>' +
      '<td><span class="badge-la ' + badgeClass + '">' + (d.asal || '-') + '</span></td>' +
      '<td>' + (escapeHtml(d.domicile) || '-') + '</td>' +
      '<td class="right">' + fmtID.format(d.shares) + '</td>' +
      '<td class="right">' + fmtPct.format(d.percent) + '%</td>' +
      '</tr>';
  }).join('');

  document.getElementById('pageInfo').textContent = fmtID.format(start + 1) + '\u2013' + fmtID.format(end) + ' dari ' + fmtID.format(filteredData.length);
  document.getElementById('prevBtn').disabled = start === 0;
  document.getElementById('nextBtn').disabled = end >= filteredData.length;
}

function updateSortUI() {
  document.querySelectorAll('#dataTable thead th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.key === sortKey) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });
}