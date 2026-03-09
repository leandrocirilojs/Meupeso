// =====================================================================
// STATE
// =====================================================================
let profile = JSON.parse(localStorage.getItem('nt_profile')||'null');
let logs = JSON.parse(localStorage.getItem('nt_logs')||'[]');
let waterStore = JSON.parse(localStorage.getItem('nt_water')||'{}');
let weights = JSON.parse(localStorage.getItem('nt_weights')||'[]');
let workouts = JSON.parse(localStorage.getItem('nt_workouts')||'[]');
let exercises = [];
let gender = 'M';
let selectedGoal = 'emagrecer';
let selectedMeal = 'Café da manhã';
let selectedFood = null;
let currentStep = 0;
let searchSource = 'local';
let offLang = 'br';
let offDebounceTimer = null;
let offSearching = false;
const offCache = {};

const TOTAL_STEPS = 3;
const MEALS = ['Café da manhã','Almoço','Lanche','Jantar','Pré-treino','Pós-treino'];

function todayKey(){ return new Date().toLocaleDateString('pt-BR'); }
function getWater(){ return waterStore[todayKey()]||0; }
function setWaterVal(v){ waterStore[todayKey()]=v; localStorage.setItem('nt_water',JSON.stringify(waterStore)); }
function save(k,v){ localStorage.setItem(k,JSON.stringify(v)); }

// =====================================================================
// OPEN FOOD FACTS INTEGRATION
// =====================================================================
const CORS_PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://cors-anywhere.herokuapp.com/${url}`,
];

async function fetchWithProxy(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CuidaApp/1.0 (github.com/leandrocirilojs)' } });
    if (res.ok) return res;
  } catch (_) {}
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url));
      if (res.ok) return res;
    } catch (_) {}
  }
  throw new Error('Não foi possível conectar ao Open Food Facts. Verifique sua conexão.');
}

function setSource(src) {
  searchSource = src;
  document.getElementById('srcLocal').classList.toggle('active', src==='local');
  document.getElementById('srcOFF').classList.toggle('active', src==='off');
  document.getElementById('localSearchSection').style.display = src==='local' ? 'block' : 'none';
  document.getElementById('offSearchSection').style.display = src==='off' ? 'block' : 'none';
  document.getElementById('portionSection').style.display = 'none';
  document.getElementById('addFoodBtn').disabled = true;
  selectedFood = null;
  if (src==='off') {
    document.getElementById('offSearch').focus();
    const q = document.getElementById('offSearch').value.trim();
    if (q.length >= 2) searchOFF(q);
  }
}

function setOFFLang(lang) {
  offLang = lang;
  document.getElementById('langBR').classList.toggle('active', lang==='br');
  document.getElementById('langWORLD').classList.toggle('active', lang==='world');
  const q = document.getElementById('offSearch').value.trim();
  if (q.length >= 2) searchOFF(q);
}

function debounceOFF() {
  clearTimeout(offDebounceTimer);
  const q = document.getElementById('offSearch').value.trim();
  if (q.length < 2) { document.getElementById('offResults').innerHTML = ''; return; }
  document.getElementById('offSearchIcon').textContent = '⏳';
  offDebounceTimer = setTimeout(() => searchOFF(q), 600);
}

async function searchOFF(query) {
  const cacheKey = `${offLang}::${query.toLowerCase()}`;
  if (offCache[cacheKey]) { renderOFFResults(offCache[cacheKey]); return; }
  offSearching = true;
  document.getElementById('offResults').innerHTML = `<div class="off-loader"><div class="spinner"></div>Buscando no Open Food Facts...</div>`;
  document.getElementById('offSearchIcon').textContent = '⏳';
  try {
    const country = offLang === 'br' ? 'br' : 'world';
    const offUrl = `https://${country}.openfoodfacts.org/cgi/search.pl`
      + `?search_terms=${encodeURIComponent(query)}`
      + `&search_simple=1&action=process&json=1&page_size=20`
      + `&fields=product_name,brands,nutriments,nutriscore_grade,image_small_url,quantity,categories_tags,_id`;
    const res = await fetchWithProxy(offUrl);
    const data = await res.json();
    const products = (data.products || []).filter(p => {
      const n = p.nutriments;
      return p.product_name && n && (n['energy-kcal_100g'] || n['energy-kcal'] || n['energy_100g']);
    });
    const normalized = products.map(p => normalizeOFFProduct(p)).filter(Boolean);
    offCache[cacheKey] = normalized;
    renderOFFResults(normalized);
  } catch (err) {
    document.getElementById('offResults').innerHTML = `
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:14px;text-align:center;font-size:13px;color:var(--red)">
        ⚠️ Erro ao buscar. Verifique sua conexão.<br>
        <span style="font-size:11px;color:var(--muted);margin-top:4px;display:block">${err.message}</span>
      </div>`;
  } finally {
    offSearching = false;
    document.getElementById('offSearchIcon').textContent = '🔍';
  }
}

function normalizeOFFProduct(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'] || n['energy-kcal'];
  if (!kcal && n['energy_100g']) kcal = n['energy_100g'] / 4.184;
  if (!kcal) return null;
  const prot = n['proteins_100g'] || n['proteins'] || 0;
  const carb = n['carbohydrates_100g'] || n['carbohydrates'] || 0;
  const fat  = n['fat_100g'] || n['fat'] || 0;
  const fiber = n['fiber_100g'] || n['fiber'] || 0;
  const sodium = n['sodium_100g'] || n['sodium'] || 0;
  const sugar = n['sugars_100g'] || n['sugars'] || 0;
  return {
    n: p.product_name.trim(),
    c: Math.round(kcal),
    p: Math.round(prot * 10) / 10,
    ch: Math.round(carb * 10) / 10,
    g: Math.round(fat * 10) / 10,
    fiber: Math.round(fiber * 10) / 10,
    sodium: Math.round(sodium * 1000),
    sugar: Math.round(sugar * 10) / 10,
    cat: 'Open Food Facts',
    source: 'off',
    brand: p.brands || '',
    nutriscore: p.nutriscore_grade || '',
    img: p.image_small_url || '',
    offId: p._id || '',
    quantity: p.quantity || '',
  };
}

function renderOFFResults(products) {
  const el = document.getElementById('offResults');
  if (!products.length) {
    el.innerHTML = `<div class="empty" style="padding:28px 0"><div class="eicon">🔍</div><p>Nenhum produto encontrado.<br><span style="font-size:12px">Tente outras palavras ou busca global.</span></p></div>`;
    return;
  }
  const nsColors = {a:'#038141',b:'#85bb2f',c:'#fecb02',d:'#ee8100',e:'#e63e11'};
  let html = `<div class="search-status"><span class="search-status-txt">Resultados do Open Food Facts</span><span class="search-status-count">${products.length} produtos</span></div>`;
  products.forEach((prod, i) => {
    const ns = prod.nutriscore ? prod.nutriscore.toLowerCase() : '';
    const nsColor = nsColors[ns] || 'var(--muted)';
    const imgHtml = prod.img ? `<img class="off-img" src="${prod.img}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : '';
    const placeholderHtml = `<div class="off-img-placeholder" style="${prod.img ? 'display:none' : ''}">🥘</div>`;
    html += `<div class="off-card" onclick="selectOFFFood(${i})" id="offcard_${i}">
      <div class="off-card-inner">
        ${imgHtml}${placeholderHtml}
        <div class="off-info">
          <div class="off-name">${prod.n}</div>
          <div class="off-brand">${prod.brand}${prod.quantity ? ' · ' + prod.quantity : ''}</div>
          <div class="off-macros-row">
            <span class="off-macro-pill kcal">${prod.c} kcal</span>
            <span class="off-macro-pill prot">P: ${prod.p}g</span>
            <span class="off-macro-pill carb">C: ${prod.ch}g</span>
            <span class="off-macro-pill fat">G: ${prod.g}g</span>
            ${ns ? `<span class="nutriscore" style="background:${nsColor}">${ns.toUpperCase()}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
  window._offProducts = products;
}

function selectOFFFood(idx) {
  const prod = window._offProducts[idx];
  selectedFood = prod;
  document.querySelectorAll('.off-card').forEach((el, i) => el.classList.toggle('selected', i===idx));
  showPortionSection();
}

// =====================================================================
// GOALS
// =====================================================================
function calcGoals(p){
  const act = +p.activity||1.55;
  const bmr = p.gender==='M'
    ? 88.36+13.4*p.weight+4.8*p.height-5.7*p.age
    : 447.6+9.2*p.weight+3.1*p.height-4.3*p.age;
  const tdee = bmr*act;
  let cal = p.goal==='emagrecer'?tdee-500:p.goal==='massa'?tdee+300:tdee;
  cal = Math.round(cal);
  const prot = p.goal==='massa'?Math.round(p.weight*2.2):Math.round(p.weight*1.8);
  const fat = Math.round((cal*0.25)/9);
  const carb = Math.round((cal-prot*4-fat*9)/4);
  return {cal,prot,carb,fat};
}

// =====================================================================
// SETUP
// =====================================================================
function buildProgress(){
  const el=document.getElementById('stepProgress');
  el.innerHTML='';
  for(let i=0;i<TOTAL_STEPS;i++){
    const d=document.createElement('div');
    d.className='step-dot'+(i<=currentStep?' done':'');
    el.appendChild(d);
  }
}
function selectGender(g){
  gender=g;
  document.getElementById('gM').classList.toggle('active',g==='M');
  document.getElementById('gF').classList.toggle('active',g==='F');
}
function selectGoal(g){
  selectedGoal=g;
  ['emagrecer','massa','manter'].forEach(x=>document.getElementById('gc_'+x).classList.toggle('active',x===g));
}
function nextStep(){ if(currentStep===TOTAL_STEPS-1){saveProfile();return;} currentStep++; updateSetup(); }
function prevStep(){ if(currentStep>0){currentStep--; updateSetup();} }
function updateSetup(){
  for(let i=0;i<TOTAL_STEPS;i++) document.getElementById('step'+i).classList.toggle('active',i===currentStep);
  document.getElementById('backBtn').style.display=currentStep>0?'block':'none';
  document.getElementById('nextBtn').textContent=currentStep===TOTAL_STEPS-1?'Começar! 🚀':'Continuar →';
  buildProgress();
}
function saveProfile(){
  profile={
    name:document.getElementById('sName').value.trim()||'Usuário',
    weight:+document.getElementById('sWeight').value||70,
    height:+document.getElementById('sHeight').value||170,
    age:+document.getElementById('sAge').value||25,
    gender,
    goal:selectedGoal,
    activity:document.getElementById('sActivity').value
  };
  save('nt_profile',profile);
  document.getElementById('setupOverlay').style.display='none';
  document.getElementById('mainApp').style.display='block';
  initApp();
}
function resetProfile(){
  if(!confirm('Redefinir perfil?')) return;
  profile=null; localStorage.removeItem('nt_profile');
  currentStep=0; updateSetup();
  document.getElementById('mainApp').style.display='none';
  document.getElementById('setupOverlay').style.display='flex';
}

// =====================================================================
// INIT
// =====================================================================
window.onload=function(){
  buildProgress();
  document.getElementById('weightDate').value = new Date().toISOString().split('T')[0];
  if(profile){
    document.getElementById('setupOverlay').style.display='none';
    document.getElementById('mainApp').style.display='block';
    initApp();
  }
};

function initApp(){
  const goalLabels={emagrecer:'🔥 Emagrecimento',massa:'💪 Ganho de Massa',manter:'⚖️ Manutenção'};
  document.getElementById('greeting').textContent='Olá, '+profile.name+'!';
  document.getElementById('goalBadge').textContent=goalLabels[profile.goal];
  const cats=[...new Set(FOODS.map(f=>f.cat))].sort();
  const sel=document.getElementById('catSelect');
  cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
  buildMealPills();
  updateUI();
  addExercise();
}

function buildMealPills(){
  const pills=document.getElementById('mealPills');
  pills.innerHTML='';
  MEALS.forEach(m=>{
    const b=document.createElement('button');
    b.className='pill'+(m===selectedMeal?' active':'');
    b.textContent=m;
    b.onclick=()=>{selectedMeal=m;pills.querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));b.classList.add('active');};
    pills.appendChild(b);
  });
}

// =====================================================================
// MAIN UI UPDATE
// =====================================================================
function updateUI(){
  if(!profile)return;
  const goals=calcGoals(profile);
  const today=logs.filter(l=>l.date===todayKey());
  const tot=today.reduce((a,l)=>({cal:a.cal+l.cal,prot:a.prot+l.prot,carb:a.carb+l.carb,fat:a.fat+l.fat}),{cal:0,prot:0,carb:0,fat:0});
  const circ=2*Math.PI*56;
  const pct=Math.min(tot.cal/goals.cal,1);
  const ring=document.getElementById('ringCircle');
  ring.setAttribute('stroke-dasharray',`${circ*pct} ${circ}`);
  ring.setAttribute('stroke',tot.cal>goals.cal?'#ef4444':'url(#rg)');
  document.getElementById('ringKcal').textContent=Math.round(tot.cal);
  document.getElementById('ringLabel').textContent='de '+goals.cal+' kcal';
  const rem=goals.cal-Math.round(tot.cal);
  const rt=document.getElementById('remainText');
  rt.textContent=rem>=0?`+${rem} kcal restantes`:`${Math.abs(rem)} kcal acima`;
  rt.className='remain '+(rem>=0?'ok':'over');
  document.getElementById('qProt').textContent=Math.round(tot.prot)+'g';
  document.getElementById('qCarb').textContent=Math.round(tot.carb)+'g';
  document.getElementById('qFat').textContent=Math.round(tot.fat)+'g';
  function setBar(id,bid,cur,goal,color){
    const p=Math.min((cur/goal)*100,100),over=cur>goal;
    document.getElementById(id).textContent=Math.round(cur)+'/'+goal+'g';
    document.getElementById(id).className='macro-val'+(over?' over':'');
    const bar=document.getElementById(bid);
    bar.style.width=p+'%';
    bar.style.background=over?'var(--red)':color;
  }
  setBar('mProt','bProt',tot.prot,goals.prot,'var(--purple)');
  setBar('mCarb','bCarb',tot.carb,goals.carb,'var(--orange)');
  setBar('mFat','bFat',tot.fat,goals.fat,'var(--red)');
  document.getElementById('streakNum').textContent=calcStreak();
  renderMealLog(today);
  renderHistory();
  renderWater();
  renderWeightList();
  renderWorkouts();
  renderAlerts(tot,goals);
}

function calcStreak(){
  const days=[...new Set(logs.map(l=>l.date))];
  if(!days.length)return 0;
  let streak=0,d=new Date();
  while(true){
    const key=d.toLocaleDateString('pt-BR');
    if(days.includes(key)){streak++;d.setDate(d.getDate()-1);}
    else break;
  }
  return streak;
}

// =====================================================================
// MEAL LOG
// =====================================================================
function renderMealLog(today){
  const el=document.getElementById('mealLog');
  if(!today.length){el.innerHTML='<div class="empty"><div class="eicon">🍽️</div><p>Nenhum alimento registrado hoje.<br>Toque no <strong>+</strong> para adicionar.</p></div>';return;}
  let html='';
  MEALS.forEach(m=>{
    const items=today.filter(l=>l.meal===m);
    if(!items.length)return;
    const total=items.reduce((a,l)=>({cal:a.cal+l.cal}),{cal:0});
    html+=`<div class="meal-section"><div class="meal-header">🍽️ ${m} <span class="tag">${Math.round(total.cal)} kcal</span></div><div class="card" style="margin-top:0;padding:0;overflow:hidden">`;
    items.forEach(item=>{
      const srcBadge = item.source==='off'
        ? `<span class="badge-off">OFF</span>`
        : item.source==='ai'
        ? `<span class="badge-ai">IA</span>`
        : `<span class="badge-local">LOCAL</span>`;
      html+=`<div class="log-item"><div><div class="log-food">${item.food} ${srcBadge}</div><div class="log-detail">${item.grams}g · ${item.time}${item.brand?' · '+item.brand:''}</div></div>
      <div style="display:flex;align-items:center;gap:4px"><div style="text-align:right"><div class="log-kcal">${item.cal} kcal</div><div class="log-macros">P:${item.prot}g C:${item.carb}g G:${item.fat}g</div></div>
      <button class="delete-btn" onclick="deleteLog(${item.id})">🗑</button></div></div>`;
    });
    html+='</div></div>';
  });
  el.innerHTML=html;
}

// =====================================================================
// HISTORY
// =====================================================================
function renderHistory(){
  const el=document.getElementById('historyLog');
  const days=[...new Set(logs.map(l=>l.date))].sort((a,b)=>b.localeCompare(a));
  if(!days.length){el.innerHTML='<div class="empty"><div class="eicon">📋</div><p>Nenhum histórico ainda.</p></div>';return;}
  let html='';
  days.forEach(d=>{
    const items=logs.filter(l=>l.date===d);
    const tot=items.reduce((a,l)=>({cal:a.cal+l.cal,prot:a.prot+l.prot,carb:a.carb+l.carb,fat:a.fat+l.fat}),{cal:0,prot:0,carb:0,fat:0});
    const label=d===todayKey()?'Hoje':d;
    html+=`<div class="history-day"><div class="history-date">${label}</div>
    <div class="history-summary"><div><div class="hs-kcal">${Math.round(tot.cal)} kcal</div><div class="hs-macros">P:${Math.round(tot.prot)}g · C:${Math.round(tot.carb)}g · G:${Math.round(tot.fat)}g · ${items.length} alimentos</div></div>
    <button onclick="deleteDay('${d}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px">🗑</button></div></div>`;
  });
  el.innerHTML=html;
}

// =====================================================================
// WATER
// =====================================================================
function addWater(ml){ setWaterVal(getWater()+ml); renderWater(); }
function resetWater(){ setWaterVal(0); renderWater(); }
function renderWater(){
  if(!profile)return;
  const wGoal=Math.round(profile.weight*35);
  const w=getWater();
  document.getElementById('waterMl').textContent=w;
  document.getElementById('waterGoalTxt').textContent='de '+wGoal+' ml';
  document.getElementById('waterFill').style.width=Math.min((w/wGoal)*100,100)+'%';
}

// =====================================================================
// WEIGHT
// =====================================================================
function addWeight(){
  const val=+document.getElementById('weightInput').value;
  const date=document.getElementById('weightDate').value;
  if(!val||!date)return;
  const dateFormatted=new Date(date+'T12:00:00').toLocaleDateString('pt-BR');
  weights=weights.filter(w=>w.date!==dateFormatted);
  weights.push({val,date:dateFormatted,ts:new Date(date).getTime()});
  weights.sort((a,b)=>a.ts-b.ts);
  save('nt_weights',weights);
  document.getElementById('weightInput').value='';
  renderWeightList();
  renderIMC();
}
function renderWeightList(){
  const el=document.getElementById('weightList');
  if(!weights.length){el.innerHTML='<div class="empty"><div class="eicon">⚖️</div><p>Nenhum peso registrado.</p></div>';return;}
  const sorted=[...weights].reverse();
  let html='';
  sorted.forEach((w,i)=>{
    const prev=sorted[i+1];
    let diffHtml='';
    if(prev){
      const d=(w.val-prev.val).toFixed(1);
      const cls=d>0?'up':d<0?'down':'same';
      diffHtml=`<div class="weight-diff ${cls}">${d>0?'+':''}${d}kg</div>`;
    }
    html+=`<div class="weight-entry"><div><div class="weight-val">${w.val} kg</div><div class="weight-date">${w.date}</div></div>${diffHtml}<button onclick="deleteWeight('${w.date}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px">🗑</button></div>`;
  });
  el.innerHTML=html;
  renderIMC();
}
function renderIMC(){
  if(!weights.length||!profile){document.getElementById('imcCard').style.display='none';return;}
  document.getElementById('imcCard').style.display='block';
  const last=weights[weights.length-1];
  const h=profile.height/100;
  const imc=last.val/(h*h);
  document.getElementById('imcVal').textContent=imc.toFixed(1);
  let cls,color;
  if(imc<18.5){cls='Abaixo do peso';color='var(--blue)'}
  else if(imc<25){cls='Peso normal ✓';color='var(--green)'}
  else if(imc<30){cls='Sobrepeso';color='var(--orange)'}
  else{cls='Obesidade';color='var(--red)'}
  document.getElementById('imcClass').textContent=cls;
  document.getElementById('imcClass').style.color=color;
  const pct=Math.min(Math.max((imc-15)/25,0),1)*100;
  document.getElementById('imcMarker').style.left=`calc(${pct}% - 1.5px)`;
}
function deleteWeight(date){
  if(!confirm('Remover registro?'))return;
  weights=weights.filter(w=>w.date!==date);
  save('nt_weights',weights);
  renderWeightList();
}

// =====================================================================
// WORKOUT
// =====================================================================
function addExercise(){
  const list=document.getElementById('exerciseList');
  const idx=exercises.length;
  exercises.push({name:'',sets:'',reps:'',weight:''});
  const div=document.createElement('div');
  div.className='exercise-row';
  div.id='ex_'+idx;
  div.innerHTML=`<input type="text" placeholder="Exercício" oninput="exercises[${idx}].name=this.value" style="flex:2"/>
    <input type="number" placeholder="Séries" oninput="exercises[${idx}].sets=this.value" style="flex:1"/>
    <input type="number" placeholder="Reps" oninput="exercises[${idx}].reps=this.value" style="flex:1"/>
    <input type="number" placeholder="kg" oninput="exercises[${idx}].weight=this.value" style="flex:1"/>
    <button class="remove-ex" onclick="removeExercise(${idx})">×</button>`;
  list.appendChild(div);
}
function removeExercise(idx){
  document.getElementById('ex_'+idx)?.remove();
  exercises[idx]=null;
}
function saveWorkout(){
  const name=document.getElementById('wName').value.trim();
  if(!name){alert('Dê um nome ao treino.');return;}
  const ex=exercises.filter(e=>e&&e.name);
  workouts.unshift({
    id:Date.now(),
    date:todayKey(),
    name,
    type:document.getElementById('wType').value,
    duration:+document.getElementById('wDuration').value||0,
    calBurned:+document.getElementById('wCalBurned').value||0,
    exercises:ex,
    notes:document.getElementById('wNotes').value,
  });
  save('nt_workouts',workouts);
  document.getElementById('wName').value='';
  document.getElementById('wDuration').value='';
  document.getElementById('wCalBurned').value='';
  document.getElementById('wNotes').value='';
  document.getElementById('exerciseList').innerHTML='';
  exercises=[];
  addExercise();
  renderWorkouts();
}
function renderWorkouts(){
  const el=document.getElementById('workoutList');
  if(!workouts.length){el.innerHTML='<div class="empty" style="margin:0 14px"><div class="eicon">🏋️</div><p>Nenhum treino registrado.</p></div>';return;}
  const typeColors={musculacao:'rgba(139,92,246,.3)',cardio:'rgba(0,229,160,.3)',hiit:'rgba(239,68,68,.3)',yoga:'rgba(236,72,153,.3)',funcional:'rgba(245,158,11,.3)',esporte:'rgba(56,189,248,.3)',outro:'rgba(74,74,106,.3)'};
  const typeIcons={musculacao:'🏋️',cardio:'🏃',hiit:'⚡',yoga:'🧘',funcional:'🤸',esporte:'⚽',outro:'💪'};
  let html='<div class="section-hdr"><h3>Treinos Registrados</h3></div>';
  workouts.slice(0,10).forEach(w=>{
    const icon=typeIcons[w.type]||'💪';
    const color=typeColors[w.type]||'rgba(74,74,106,.3)';
    html+=`<div class="workout-item">
      <div class="workout-header">
        <div><div class="workout-name">${icon} ${w.name}</div><div class="workout-date">${w.date}${w.duration?' · '+w.duration+' min':''}${w.calBurned?' · -'+w.calBurned+' kcal':''}</div></div>
        <button onclick="deleteWorkout(${w.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px">🗑</button>
      </div>
      ${w.exercises.length?`<div class="workout-tags">${w.exercises.map(e=>`<span class="wtag" style="background:${color};color:var(--text)">${e.name}${e.sets?' '+e.sets+'×'+e.reps:''}</span>`).join('')}</div>`:''}
      ${w.notes?`<div style="font-size:12px;color:var(--muted);margin-top:8px">${w.notes}</div>`:''}
    </div>`;
  });
  el.innerHTML=html;
}
function deleteWorkout(id){
  if(!confirm('Remover treino?'))return;
  workouts=workouts.filter(w=>w.id!==id);
  save('nt_workouts',workouts);
  renderWorkouts();
}

// =====================================================================
// ALERTS
// =====================================================================
function renderAlerts(tot,goals){
  const el=document.getElementById('alertsList');
  const alerts=[];
  const calPct=tot.cal/goals.cal;
  if(calPct<0.5) alerts.push({type:'yellow',icon:'⚠️',text:'Calorias baixas',sub:`Você consumiu apenas ${Math.round(calPct*100)}% das calorias diárias.`});
  else if(calPct>1.1) alerts.push({type:'red',icon:'🚫',text:'Meta calórica ultrapassada',sub:`Você excedeu ${Math.round((calPct-1)*100)}% acima da meta.`});
  else alerts.push({type:'green',icon:'✅',text:'Calorias no caminho certo',sub:`${Math.round(tot.cal)} / ${goals.cal} kcal`});
  const protPct=tot.prot/goals.prot;
  if(protPct<0.7) alerts.push({type:'yellow',icon:'💪',text:'Proteína abaixo da meta',sub:`${Math.round(tot.prot)}g de ${goals.prot}g. Adicione carnes, ovos ou whey.`});
  else alerts.push({type:'green',icon:'💪',text:'Proteína adequada',sub:`${Math.round(tot.prot)}g / ${goals.prot}g`});
  const w=getWater(),wGoal=Math.round(profile.weight*35);
  if(w<wGoal*0.5) alerts.push({type:'red',icon:'💧',text:'Hidratação baixa!',sub:`Beba mais água. ${w}ml de ${wGoal}ml.`});
  else if(w<wGoal*0.8) alerts.push({type:'yellow',icon:'💧',text:'Hidratação precisa melhorar',sub:`${w}ml de ${wGoal}ml.`});
  else alerts.push({type:'green',icon:'💧',text:'Hidratação ótima',sub:`${w}ml de ${wGoal}ml.`});
  if(!workouts.filter(w=>w.date===todayKey()).length) alerts.push({type:'yellow',icon:'🏋️',text:'Sem treino hoje',sub:'Registre seu treino ao terminar!'});
  else alerts.push({type:'green',icon:'🏋️',text:'Treino registrado hoje!',sub:'Ótimo trabalho!'});
  el.innerHTML=alerts.map(a=>`<div class="alert-box ${a.type}"><div class="alert-icon">${a.icon}</div><div><div class="alert-text">${a.text}</div><div class="alert-sub">${a.sub}</div></div></div>`).join('');
  renderWeekSummary();
}
function renderWeekSummary(){
  if(!profile)return;
  const el=document.getElementById('weekSummary');
  const goals=calcGoals(profile);
  const days7=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days7.push(d.toLocaleDateString('pt-BR'));}
  const daysWithLog=days7.filter(d=>logs.some(l=>l.date===d)).length;
  const avgCal=days7.reduce((a,d)=>{const items=logs.filter(l=>l.date===d);const cal=items.reduce((s,l)=>s+l.cal,0);return a+cal;},0)/7;
  const trainings=workouts.filter(w=>days7.includes(w.date)).length;
  el.innerHTML=`<div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
    <div class="prog-row"><span class="prog-label">Dias com registro</span><span class="prog-val" style="color:var(--green)">${daysWithLog}/7 dias</span></div>
    <div class="prog-row"><span class="prog-label">Média calórica diária</span><span class="prog-val">${Math.round(avgCal)} kcal</span></div>
    <div class="prog-row"><span class="prog-label">Meta calórica</span><span class="prog-val">${goals.cal} kcal</span></div>
    <div class="prog-row"><span class="prog-label">Treinos na semana</span><span class="prog-val" style="color:var(--purple)">${trainings} treinos</span></div>
    <div class="prog-row"><span class="prog-label">Sequência atual</span><span class="prog-val" style="color:var(--orange)">${calcStreak()} 🔥</span></div>
  </div>`;
}

// =====================================================================
// CHARTS
// =====================================================================
let charts={};
function drawCharts(){
  const goals=calcGoals(profile);
  const days7=[],labels=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    days7.push(d.toLocaleDateString('pt-BR'));
    labels.push(d.toLocaleDateString('pt-BR',{weekday:'short'}));
  }
  const calData=days7.map(d=>logs.filter(l=>l.date===d).reduce((a,l)=>a+l.cal,0));
  const protData=days7.map(d=>logs.filter(l=>l.date===d).reduce((a,l)=>a+l.prot,0));
  drawBar('chartCal',labels,calData,'Calorias (kcal)',goals.cal,'#00e5a0','rgba(0,229,160,.15)');
  drawBar('chartProt',labels,protData,'Proteína (g)',goals.prot,'#8b5cf6','rgba(139,92,246,.15)');
  drawLineWeight();
  drawPie();
}
function drawBar(id,labels,data,label,goalVal,color,fill){
  const canvas=document.getElementById(id);
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.parentElement.clientWidth||360;
  canvas.height=180;
  const W=canvas.width,H=canvas.height;
  const pad={t:20,r:20,b:30,l:40};
  const cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
  ctx.clearRect(0,0,W,H);
  const max=Math.max(...data,goalVal,1)*1.1;
  const barW=cW/data.length*0.55,gap=cW/data.length;
  ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
  [0,.25,.5,.75,1].forEach(f=>{
    const y=pad.t+cH*(1-f);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle='#4a4a6a';ctx.font='9px Sora';ctx.textAlign='right';
    ctx.fillText(Math.round(f*max),pad.l-4,y+3);
  });
  const goalY=pad.t+cH*(1-goalVal/max);
  ctx.strokeStyle='rgba(255,255,255,.3)';ctx.setLineDash([4,4]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad.l,goalY);ctx.lineTo(W-pad.r,goalY);ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(255,255,255,.4)';ctx.font='9px Sora';ctx.textAlign='left';
  ctx.fillText('Meta',pad.l+2,goalY-3);
  data.forEach((v,i)=>{
    const x=pad.l+i*gap+(gap-barW)/2,h=(v/max)*cH,y=pad.t+cH-h,over=v>goalVal;
    ctx.fillStyle=over?'rgba(239,68,68,.7)':fill;
    ctx.beginPath();ctx.roundRect(x,y,barW,h,4);ctx.fill();
    ctx.fillStyle=over?'#ef4444':color;
    ctx.beginPath();ctx.roundRect(x,y,barW,Math.min(h,3),3);ctx.fill();
    ctx.fillStyle='#4a4a6a';ctx.font='9px Sora';ctx.textAlign='center';
    ctx.fillText(labels[i],x+barW/2,H-pad.b+12);
    if(v>0){ctx.fillStyle=over?'#ef4444':color;ctx.font='bold 9px Sora';ctx.fillText(Math.round(v),x+barW/2,y-3);}
  });
}
function drawLineWeight(){
  const canvas=document.getElementById('chartWeight');
  if(!canvas||!weights.length)return;
  const ctx=canvas.getContext('2d');
  canvas.width=canvas.parentElement.clientWidth||360;
  canvas.height=180;
  const W=canvas.width,H=canvas.height;
  const pad={t:20,r:20,b:30,l:45};
  const cW=W-pad.l-pad.r,cH=H-pad.t-pad.b;
  ctx.clearRect(0,0,W,H);
  const data=weights.slice(-15);
  const vals=data.map(w=>w.val);
  const min=Math.min(...vals)-2,max=Math.max(...vals)+2;
  const pts=data.map((w,i)=>({x:pad.l+(i/(data.length-1||1))*cW,y:pad.t+cH*(1-(w.val-min)/(max-min||1))}));
  ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;
  [0,.25,.5,.75,1].forEach(f=>{
    const y=pad.t+cH*(1-f);
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(W-pad.r,y);ctx.stroke();
    ctx.fillStyle='#4a4a6a';ctx.font='9px Sora';ctx.textAlign='right';
    ctx.fillText((min+f*(max-min)).toFixed(1),pad.l-4,y+3);
  });
  if(pts.length<2){ctx.fillStyle='#4a4a6a';ctx.font='12px Sora';ctx.textAlign='center';ctx.fillText('Adicione mais registros',W/2,H/2);return;}
  const grad=ctx.createLinearGradient(0,pad.t,0,H-pad.b);
  grad.addColorStop(0,'rgba(56,189,248,.3)');grad.addColorStop(1,'rgba(56,189,248,.0)');
  ctx.fillStyle=grad;
  ctx.beginPath();ctx.moveTo(pts[0].x,H-pad.b);pts.forEach(p=>ctx.lineTo(p.x,p.y));ctx.lineTo(pts[pts.length-1].x,H-pad.b);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#38bdf8';ctx.lineWidth=2;ctx.lineJoin='round';
  ctx.beginPath();pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.stroke();
  pts.forEach((p,i)=>{
    ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f0f0ff';ctx.font='8px Sora';ctx.textAlign='center';
    ctx.fillText(data[i].val,p.x,p.y-7);
  });
}
function drawPie(){
  const canvas=document.getElementById('chartPie');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,200,200);
  const today=logs.filter(l=>l.date===todayKey());
  const tot=today.reduce((a,l)=>({p:a.p+l.prot,c:a.c+l.carb,f:a.f+l.fat}),{p:0,c:0,f:0});
  const data=[{label:'Proteína',val:tot.p*4,color:'#8b5cf6'},{label:'Carboidrato',val:tot.c*4,color:'#f59e0b'},{label:'Gordura',val:tot.f*9,color:'#ef4444'}];
  const total=data.reduce((a,d)=>a+d.val,0);
  if(!total){ctx.fillStyle='#1a1a2e';ctx.beginPath();ctx.arc(100,100,80,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4a4a6a';ctx.font='13px Sora';ctx.textAlign='center';ctx.fillText('Sem dados',100,104);return;}
  let start=-Math.PI/2;
  data.forEach(d=>{
    const slice=(d.val/total)*Math.PI*2;
    ctx.fillStyle=d.color;
    ctx.beginPath();ctx.moveTo(100,100);ctx.arc(100,100,80,start,start+slice);ctx.closePath();ctx.fill();
    start+=slice;
  });
  ctx.fillStyle='#0f0f1e';ctx.beginPath();ctx.arc(100,100,50,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#f0f0ff';ctx.font='bold 14px Sora';ctx.textAlign='center';ctx.fillText(Math.round(total),100,98);
  ctx.fillStyle='#4a4a6a';ctx.font='10px Sora';ctx.fillText('kcal',100,112);
  const leg=document.getElementById('pieLegend');
  leg.innerHTML=data.map(d=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px"><div style="width:10px;height:10px;border-radius:3px;background:${d.color}"></div>${d.label}: ${Math.round(d.val/4)}g</div>`).join('');
}

// =====================================================================
// MODAL
// =====================================================================
function openModal(){
  document.getElementById('logModal').classList.add('open');
  document.getElementById('foodSearch').value='';
  document.getElementById('searchResults').innerHTML='';
  document.getElementById('offSearch').value='';
  document.getElementById('offResults').innerHTML='';
  document.getElementById('portionSection').style.display='none';
  document.getElementById('addFoodBtn').disabled=true;
  document.getElementById('catSelect').value='';
  selectedFood=null;
  setSource('local');
}
function closeModal(){ document.getElementById('logModal').classList.remove('open'); }
function closeModalOutside(e){ if(e.target===document.getElementById('logModal'))closeModal(); }

// =====================================================================
// LOCAL FOOD SEARCH
// =====================================================================
function filterByCategory(){ searchFood(); }
function searchFood(){
  const q=document.getElementById('foodSearch').value.trim().toLowerCase();
  const cat=document.getElementById('catSelect').value;
  let results=FOODS;
  if(cat)results=results.filter(f=>f.cat===cat);
  if(q.length>0)results=results.filter(f=>f.n.toLowerCase().includes(q));
  results=results.slice(0,25);
  const el=document.getElementById('searchResults');
  if(!results.length){el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:10px">Nenhum alimento encontrado.</div>';return;}
  el.innerHTML=results.map(f=>`<div class="food-item" onclick="selectLocalFood('${f.n.replace(/'/g,"\\'")}')"><div><div class="food-name">${f.n}</div><div class="food-cat"><span class="badge-local">LOCAL</span> ${f.cat}</div></div><div><div class="food-kcal">${f.c} kcal</div><div class="food-kcal-sub">por 100g</div></div></div>`).join('');
}
function selectLocalFood(name){
  const f = FOODS.find(x=>x.n===name);
  selectedFood = {...f, source:'local'};
  document.querySelectorAll('.food-item').forEach(el=>el.classList.toggle('selected',el.querySelector('.food-name').textContent===name));
  showPortionSection();
}

// =====================================================================
// PORTION SECTION
// =====================================================================
function showPortionSection(){
  if(!selectedFood) return;
  document.getElementById('portionSection').style.display='block';
  document.getElementById('addFoodBtn').disabled=false;
  const srcBadge = selectedFood.source==='off'
    ? `<span class="badge-off">🌍 Open Food Facts</span>`
    : `<span class="badge-local">📦 Local</span>`;
  document.getElementById('selFoodName').textContent = selectedFood.n;
  let meta = `${srcBadge}`;
  if(selectedFood.brand) meta += ` · ${selectedFood.brand}`;
  if(selectedFood.nutriscore) {
    const nsColors={a:'#038141',b:'#85bb2f',c:'#fecb02',d:'#ee8100',e:'#e63e11'};
    const ns=selectedFood.nutriscore.toLowerCase();
    meta += ` · Nutriscore <span class="nutriscore" style="background:${nsColors[ns]||'var(--muted)'}">${ns.toUpperCase()}</span>`;
  }
  document.getElementById('selFoodMeta').innerHTML = meta;
  document.getElementById('gramsInput').value = 100;
  updatePreview();
}
function changeGrams(d){
  const inp=document.getElementById('gramsInput');
  inp.value=Math.max(1,(+inp.value||100)+d);
  updatePreview();
}
function updatePreview(){
  if(!selectedFood)return;
  const g=+document.getElementById('gramsInput').value||100;
  const f=g/100;
  const extras = selectedFood.fiber ? `<div class="preview-box"><div class="preview-val" style="color:var(--blue)">${(selectedFood.fiber*f).toFixed(1)}g</div><div class="preview-lbl">fibras</div></div>` : '';
  document.getElementById('previewGrid').innerHTML=`
    <div class="preview-box"><div class="preview-val" style="color:var(--green)">${Math.round(selectedFood.c*f)}</div><div class="preview-lbl">kcal</div></div>
    <div class="preview-box"><div class="preview-val" style="color:var(--purple)">${(selectedFood.p*f).toFixed(1)}g</div><div class="preview-lbl">prot</div></div>
    <div class="preview-box"><div class="preview-val" style="color:var(--orange)">${(selectedFood.ch*f).toFixed(1)}g</div><div class="preview-lbl">carb</div></div>
    <div class="preview-box"><div class="preview-val" style="color:var(--red)">${(selectedFood.g*f).toFixed(1)}g</div><div class="preview-lbl">gord</div></div>
    ${extras}`;
}
function addFood(){
  if(!selectedFood)return;
  const g=+document.getElementById('gramsInput').value||100;
  const f=g/100;
  logs.push({
    id:Date.now(),
    date:todayKey(),
    time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    meal:selectedMeal,
    food:selectedFood.n,
    grams:g,
    cal:Math.round(selectedFood.c*f),
    prot:Math.round(selectedFood.p*f*10)/10,
    carb:Math.round(selectedFood.ch*f*10)/10,
    fat:Math.round(selectedFood.g*f*10)/10,
    source:selectedFood.source||'local',
    brand:selectedFood.brand||'',
    nutriscore:selectedFood.nutriscore||'',
  });
  save('nt_logs',logs);
  closeModal();
  updateUI();
  showTab('resumo');
}
function deleteLog(id){
  if(!confirm('Remover alimento?'))return;
  logs=logs.filter(l=>l.id!==id);
  save('nt_logs',logs);
  updateUI();
}
function deleteDay(date){
  if(!confirm('Remover todos os alimentos deste dia?'))return;
  logs=logs.filter(l=>l.date!==date);
  save('nt_logs',logs);
  updateUI();
}

// =====================================================================
// TABS
// =====================================================================
function showTab(t){
  const tabIds=['resumo','refeicoes','agua','peso','treino','graficos','alertas','historico','chat'];
  tabIds.forEach(x=>{const el=document.getElementById('tab-'+x);if(el)el.style.display=x===t?'block':'none';});
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',tabIds[i]===t));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const navMap={resumo:0,refeicoes:1,treino:2,peso:3,chat:4};
  if(navMap[t]!==undefined) document.querySelectorAll('.nav-btn')[navMap[t]]?.classList.add('active');
  if(t==='agua') renderWater();
  if(t==='graficos') drawCharts();
  if(t==='alertas'){
    const goals=calcGoals(profile);
    const today=logs.filter(l=>l.date===todayKey());
    const tot=today.reduce((a,l)=>({cal:a.cal+l.cal,prot:a.prot+l.prot,carb:a.carb+l.carb,fat:a.fat+l.fat}),{cal:0,prot:0,carb:0,fat:0});
    renderAlerts(tot,goals);
  }
  if(t==='chat') initChat();
}

// =====================================================================
// CHAT IA — GROQ (chave do usuário via banner)
// =====================================================================
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

let chatHistory = JSON.parse(localStorage.getItem('nt_chat') || '[]');
let chatIsTyping = false;
let chatInitialized = false;

function getGroqKey() {
  return localStorage.getItem('nt_groq_key') || '';
}

function saveGroqKey() {
  const input = document.getElementById('apiKeyInput');
  const key = input ? input.value.trim() : '';
  if (!key) return;
  localStorage.setItem('nt_groq_key', key);
  const banner = document.getElementById('apiKeyBanner');
  if (banner) banner.style.display = 'none';
  appendMessage('ai', '✅ Chave Groq configurada! Agora pode me perguntar qualquer coisa sobre nutrição.');
}

function extractFoodJSON(text) {
  const match = text.match(/```json([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch(e) { return null; }
}

function addFoodsFromAI(foodList) {
  if (!foodList || !foodList.length) return;
  foodList.forEach(item => {
    const food = FOODS.find(f => f.n.toLowerCase().includes(item.name.toLowerCase()));
    if (!food) return;
    const grams = item.grams || 100;
    const factor = grams / 100;
    logs.push({
      id: Date.now() + Math.random(),
      date: todayKey(),
      time: new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
      meal: selectedMeal,
      food: food.n,
      grams,
      cal: Math.round(food.c * factor),
      prot: Math.round(food.p * factor * 10) / 10,
      carb: Math.round(food.ch * factor * 10) / 10,
      fat: Math.round(food.g * factor * 10) / 10,
      source: 'ai'
    });
  });
  save('nt_logs', logs);
  updateUI();
}

function buildUserContext() {
  if (!profile) return '';
  const goals = calcGoals(profile);
  const today = logs.filter(l => l.date === todayKey());
  const tot = today.reduce((a,l)=>({cal:a.cal+l.cal,prot:a.prot+l.prot,carb:a.carb+l.carb,fat:a.fat+l.fat}),{cal:0,prot:0,carb:0,fat:0});
  const todayFoods = today.length
    ? today.map(l => `${l.food} (${l.grams}g)`).join(', ')
    : 'Nenhum alimento registrado hoje';
  return `
Usuário: ${profile.name}
Objetivo: ${profile.goal}
Metas diárias — Cal: ${goals.cal} | Prot: ${goals.prot}g | Carb: ${goals.carb}g | Gord: ${goals.fat}g
Consumo hoje — Cal: ${Math.round(tot.cal)} | Prot: ${Math.round(tot.prot)}g | Carb: ${Math.round(tot.carb)}g | Gord: ${Math.round(tot.fat)}g
Alimentos hoje: ${todayFoods}
`;
}

function buildSystemPrompt() {
  return `Você é o Nutri IA, assistente nutricional do aplicativo Cuida.
Responda sempre em português do Brasil. Use linguagem simples e amigável.
Ajude com nutrição, dieta, calorias, proteínas, sugestões de refeições e análise alimentar.
Use os dados do usuário quando necessário.
${buildUserContext()}
IMPORTANTE: Se o usuário disser que comeu algum alimento, extraia-os e gere um JSON no FINAL da resposta.
Formato obrigatório:
\`\`\`json
{"foods":[{"name":"ovo","grams":100},{"name":"banana","grams":120}]}
\`\`\`
Regras: JSON só no final, apenas alimentos citados, gramas aproximadas.`;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || chatIsTyping) return;

  const apiKey = getGroqKey();
  if (!apiKey) { showApiKeyBanner(); return; }

  input.value = '';
  input.style.height = 'auto';

  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  showTyping();
  chatIsTyping = true;
  document.getElementById('chatSendBtn').disabled = true;
  document.getElementById('chatStatus').textContent = '● Digitando...';
  document.getElementById('chatStatus').className = 'chat-status typing';

  try {
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...chatHistory.slice(-10)
    ];

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err?.error?.message || `Erro HTTP ${res.status}`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Resposta vazia.');

    chatHistory.push({ role: 'assistant', content: reply });
    localStorage.setItem('nt_chat', JSON.stringify(chatHistory.slice(-20)));

    removeTyping();
    appendMessage('ai', reply);

    const foodData = extractFoodJSON(reply);
    if (foodData && foodData.foods) addFoodsFromAI(foodData.foods);

  } catch (err) {
    removeTyping();
    let errorMsg = '⚠️ Erro ao conectar com o Groq.';
    if (err.message.includes('401') || err.message.includes('invalid_api_key') || err.message.includes('Unauthorized')) {
      errorMsg = '🔑 Chave inválida. Verifique sua chave em console.groq.com e salve novamente.';
      showApiKeyBanner();
    } else if (err.message.includes('429') || err.message.toLowerCase().includes('rate limit')) {
      errorMsg = '⏳ Limite temporário atingido. Aguarde alguns segundos e tente novamente.';
    } else {
      errorMsg += ` ${err.message}`;
    }
    appendMessage('ai', errorMsg);
  } finally {
    chatIsTyping = false;
    document.getElementById('chatSendBtn').disabled = false;
    document.getElementById('chatStatus').textContent = '● Online';
    document.getElementById('chatStatus').className = 'chat-status';
  }
}

function sendSuggestion(btn) {
  document.getElementById('chatInput').value = btn.textContent.replace(/^[\p{Emoji}\s]+/u, '').trim();
  sendChatMessage();
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function appendMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="chat-msg-avatar">${role === 'ai' ? '🥗' : '👤'}</div>
    <div>
      <div class="chat-msg-bubble">${formatAIText(text)}</div>
      <div class="chat-msg-time">${time}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<span class="highlight">$1</span>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="chat-msg-avatar">🥗</div>
    <div class="chat-msg-bubble" style="padding:14px 16px">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById('typingIndicator')?.remove();
}

function clearChat() {
  if (!confirm('Limpar toda a conversa?')) return;
  chatHistory = [];
  localStorage.removeItem('nt_chat');
  chatInitialized = false;
  document.getElementById('chatMessages').innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">🥗</div>
      <div class="chat-welcome-title">Olá! Sou o Nutri IA</div>
      <div class="chat-welcome-sub">Seu assistente nutricional inteligente. Posso analisar sua dieta, sugerir refeições e responder dúvidas sobre nutrição!</div>
      <div class="chat-suggestions">
        <button class="suggestion-btn" onclick="sendSuggestion(this)">📊 Como está minha dieta hoje?</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">🍽️ Sugestão de refeição para bater minha meta</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">💪 Quanto de proteína devo consumir?</button>
        <button class="suggestion-btn" onclick="sendSuggestion(this)">🥦 Alimentos ricos em proteína e baixo em calorias</button>
      </div>
    </div>`;
  initChat();
}

function showApiKeyBanner() {
  const existing = document.getElementById('apiKeyBanner');
  if (existing) { existing.style.display = 'flex'; return; }
  const container = document.getElementById('chatMessages');
  const banner = document.createElement('div');
  banner.id = 'apiKeyBanner';
  banner.className = 'api-key-banner';
  banner.innerHTML = `
    <div class="api-key-banner-title">🔑 Configure sua chave Groq</div>
    <div class="api-key-banner-sub">
      Para usar o chat, você precisa de uma chave gratuita do Groq.<br>
      1. Acesse <strong>console.groq.com</strong><br>
      2. Vá em <strong>API Keys → Create API Key</strong><br>
      3. Cole a chave abaixo e salve.
    </div>
    <div class="api-key-input-row">
      <input type="password" id="apiKeyInput" placeholder="gsk_..." value="${getGroqKey()}"/>
      <button class="api-key-save-btn" onclick="saveGroqKey()">Salvar</button>
    </div>`;
  container.appendChild(banner);
  container.scrollTop = container.scrollHeight;
}

function initChat() {
  if (chatInitialized) return;
  chatInitialized = true;

  if (chatHistory.length > 0 && chatHistory[0].parts) {
    chatHistory = [];
    localStorage.removeItem('nt_chat');
  }

  if (chatHistory.length > 0) {
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    chatHistory.forEach(msg => {
      if (msg.role === 'user') appendMessage('user', msg.content);
      if (msg.role === 'assistant') appendMessage('ai', msg.content);
    });
  }

  if (!getGroqKey()) {
    setTimeout(showApiKeyBanner, 300);
  }
  }
