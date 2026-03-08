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
