// Dashboard Kepemilikan Saham >1%
const fmtID = new Intl.NumberFormat('id-ID');
const fmtPct = new Intl.NumberFormat('id-ID', { minimumFractionDigits:2, maximumFractionDigits:2 });

let rawData = [];
let filteredData = [];
let sortKey = 'saham';
let sortDir = 'desc';
let currentPage = 1;
const pageSize = 20;

let donutChart, barChart;
let debounceTimer;

document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.font.family = "'PT Sans', sans-serif";
  Chart.defaults.font.size = 12;
  
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
    header.forEach((h,i)=> obj[h]=cols[i]||'');
    return {
      date: obj.DATE,
      code: obj.SHARE_CODE,
      issuer: obj.ISSUER_NAME,
      investor: obj.INVESTOR_NAME,
      type: obj.INVESTOR_TYPE || '',
      asal: obj.LOCAL_FOREIGN || '',
      nationality: obj.NATIONALITY || '',
      domicile: obj.DOMICILE || '',
      shares: parseInt((obj.TOTAL_HOLDING_SHARES||'0').replace(/\./g,'')) || 0,
      percent: parseFloat((obj.PERCENTAGE||'0').replace(',','.')) || 0,
      emitenLabel: `${obj.SHARE_CODE} - ${obj.ISSUER_NAME}`
    };
  });
}

function initFilters() {
  // Emiten
  const emitenSet = new Map();
  rawData.forEach(d => emitenSet.set(d.code, d.issuer));
  const emitenList = document.getElementById('emitenList');
  [...emitenSet.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([code,name])=>{
    const opt = document.createElement('option');
    opt.value = `${code} - ${name}`;
    emitenList.appendChild(opt);
  });
  
  // Tipe
  const tipeSet = [...new Set(rawData.map(d=>d.type).filter(Boolean))].sort();
  const tipeSel = document.getElementById('filterTipe');
  tipeSet.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    tipeSel.appendChild(opt);
  });
  
  // Domisili
  const domSet = [...new Set(rawData.map(d=>d.domicile).filter(Boolean))].sort();
  const domSel = document.getElementById('filterDomisili');
  domSet.forEach(d=>{
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    domSel.appendChild(opt);
  });
}

function bindEvents() {
  document.getElementById('filterEmiten').addEventListener('input', applyFilters);
  document.getElementById('filterTipe').addEventListener('change', applyFilters);
  document.getElementById('filterAsal').addEventListener('change', applyFilters);
  document.getElementById('filterDomisili').addEventListener('change', applyFilters);
  document.getElementById('filterCari').addEventListener('input', e=>{
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 300);
  });
  document.getElementById('btnReset').addEventListener('click', resetFilters);
  
  document.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (sortKey===key) sortDir = sortDir==='asc'?'desc':'asc';
      else { sortKey=key; sortDir='desc'; }
      renderTable();
    });
  });
  
  document.getElementById('prevBtn').addEventListener('click', ()=>{ if(currentPage>1){currentPage--; renderTable();}});
  document.getElementById('nextBtn').addEventListener('click', ()=>{ const max=Math.ceil(filteredData.length/pageSize); if(currentPage<max){currentPage++; renderTable();}});
}

function resetFilters() {
  document.getElementById('filterEmiten').value='';
  document.getElementById('filterTipe').value='';
  document.getElementById('filterAsal').value='';
  document.getElementById('filterDomisili').value='';
  document.getElementById('filterCari').value='';
  applyFilters();
}

function applyFilters() {
  const emitenVal = document.getElementById('filterEmiten').value.trim();
  const emitenCode = emitenVal.split(' - ')[0];
  const tipeVal = document.getElementById('filterTipe').value;
  const asalVal = document.getElementById('filterAsal').value;
  const domVal = document.getElementById('filterDomisili').value;
  const cariVal = document.getElementById('filterCari').value.trim().toLowerCase();
  
  filteredData = rawData.filter(d=>{
    if (emitenVal && emitenVal!=='Semua' && d.code!==emitenCode) return false;
    if (tipeVal && d.type!==tipeVal) return false;
    if (asalVal && d.asal!==asalVal) return false;
    if (domVal && d.domicile!==domVal) return false;
    if (cariVal && !d.investor.toLowerCase().includes(cariVal)) return false;
    return true;
  });
  
  currentPage = 1;
  updateKPIs();
  updateCharts(cariVal);
  renderTable();
}

function updateKPIs() {
  const totalEmiten = new Set(filteredData.map(d=>d.code)).size;
  const totalInvestor = new Set(filteredData.map(d=>d.investor)).size;
  const totalSaham = filteredData.reduce((s,d)=>s+d.shares,0);
  const avgPct = filteredData.length ? filteredData.reduce((s,d)=>s+d.percent,0)/filteredData.length : 0;
  
  document.getElementById('kpiEmiten').textContent = fmtID.format(totalEmiten);
  document.getElementById('kpiInvestor').textContent = fmtID.format(totalInvestor);
  document.getElementById('kpiLembar').textContent = fmtID.format(totalSaham);
  document.getElementById('kpiAvg').textContent = fmtPct.format(avgPct);
  
  document.getElementById('tableInfo').textContent = `${fmtID.format(filteredData.length)} data`;
}

function updateCharts(cariActive) {
  // Donut Lokal vs Asing
  const lokal = filteredData.filter(d=>d.asal==='L').reduce((s,d)=>s+d.shares,0);
  const asing = filteredData.filter(d=>d.asal==='A').reduce((s,d)=>s+d.shares,0);
  
  const donutCtx = document.getElementById('chartDonut').getContext('2d');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(donutCtx, {
    type:'doughnut',
    data:{
      labels:['Lokal (L)', 'Asing (A)'],
      datasets:[{
        data:[lokal, asing],
        backgroundColor:['#00599A','#c92b2c'],
        borderWidth:0
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{ position:'bottom', labels:{ font:{ family:'PT Sans', weight:'400' } } },
        tooltip:{ callbacks:{ label:ctx=>`${ctx.label}: ${fmtID.format(ctx.raw)} lembar` } }
      }
    }
  });
  
  // Bar
  const barCtx = document.getElementById('chartBar').getContext('2d');
  if (barChart) barChart.destroy();
  
  let barData, title, sub;
  if (cariActive) {
    title = 'Portofolio Terbesar';
    sub = 'emiten dengan kepemilikan terbanyak';
    const map = new Map();
    filteredData.forEach(d=>{
      map.set(d.emitenLabel, (map.get(d.emitenLabel)||0)+d.shares);
    });
    barData = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  } else {
    title = 'Investor Terbesar';
    sub = 'berdasarkan total lembar';
    const map = new Map();
    filteredData.forEach(d=>{
      map.set(d.investor, (map.get(d.investor)||0)+d.shares);
    });
    barData = [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  }
  document.getElementById('barTitle').textContent = title;
  document.getElementById('barSub').textContent = sub;
  
  const labels = barData.map(d=>truncate(d[0],32));
  const values = barData.map(d=>d[1]);
  
  barChart = new Chart(barCtx, {
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'Jumlah Saham',
        data:values,
        backgroundColor:'#00599A',
        borderRadius:4
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label:ctx=>fmtID.format(ctx.raw)+' lembar' } }
      },
      scales:{
        x:{ ticks:{ callback:v=>fmtID.format(v) } }
      }
    }
  });
}

function truncate(str, n){ return str.length>n ? str.slice(0,n-1)+'…' : str; }

function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!filteredData.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Tidak ada data</td></tr>`;
    document.getElementById('pageInfo').textContent = '0–0 dari 0';
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;
    return;
  }
  
  const sorted = [...filteredData].sort((a,b)=>{
    let va, vb;
    switch(sortKey){
      case 'emiten': va=a.code; vb=b.code; break;
      case 'investor': va=a.investor; vb=b.investor; break;
      case 'tipe': va=a.type; vb=b.type; break;
      case 'asal': va=a.asal; vb=b.asal; break;
      case 'domisili': va=a.domicile; vb=b.domicile; break;
      case 'saham': va=a.shares; vb=b.shares; break;
      case 'persen': va=a.percent; vb=b.percent; break;
      default: va=a.shares; vb=b.shares;
    }
    if (typeof va==='string') return sortDir==='asc'? va.localeCompare(vb): vb.localeCompare(va);
    return sortDir==='asc'? va-vb : vb-va;
  });
  
  const start = (currentPage-1)*pageSize;
  const pageData = sorted.slice(start, start+pageSize);
  
  tbody.innerHTML = pageData.map(d=>{
    const highlight = d.percent>50 ? 'highlight' : '';
    const pillClass = d.asal==='L' ? 'l' : 'a';
    const pillText = d.asal || '-';
    return `<tr class="${highlight}">
      <td>${d.code} - ${d.issuer}</td>
      <td>${d.investor}</td>
      <td>${d.type}</td>
      <td><span class="pill ${pillClass}">${pillText}</span></td>
      <td>${d.domicile||'-'}</td>
      <td class="right">${fmtID.format(d.shares)}</td>
      <td class="right">${fmtPct.format(d.percent)}</td>
    </tr>`;
  }).join('');
  
  const total = filteredData.length;
  const end = Math.min(start+pageSize, total);
  document.getElementById('pageInfo').textContent = `${fmtID.format(start+1)}–${fmtID.format(end)} dari ${fmtID.format(total)}`;
  document.getElementById('prevBtn').disabled = currentPage===1;
  document.getElementById('nextBtn').disabled = end>=total;
}
