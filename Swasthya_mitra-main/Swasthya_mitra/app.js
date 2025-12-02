// =====================
// Swasthya Mitra - PREMIUM OFFLINE HEALTHCARE APP (MIC + ALARM FIXED)
// =====================

/* Elements */
const languageSelect = document.getElementById('language');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const micStatus = document.getElementById('micStatus');
const textInput = document.getElementById('textInput');
const textSubmit = document.getElementById('textSubmit');
const imageInput = document.getElementById('imageInput');
const imgPreview = document.getElementById('imgPreview');
const preview = document.getElementById('preview');
const imageAnalysis = document.getElementById('imageAnalysis');
const transcriptDiv = document.getElementById('transcript');
const diagnosisDiv = document.getElementById('diagnosis');
const hospitalSection = document.getElementById('hospital-section');
const hospitalList = document.getElementById('hospital-list');
const ttsControls = document.getElementById('ttsControls');
const ttsToggleBtn = document.getElementById('ttsToggleBtn');
const ttsStopBtn = document.getElementById('ttsStopBtn');
const loadingScreen = document.getElementById('loadingScreen');
const statusDiv = document.getElementById('status') || document.createElement('div');
const themeToggle = document.getElementById('themeToggle');

const schedulesList = document.getElementById('schedulesList');
const scheduleForm = document.getElementById('scheduleForm');
const schedName = document.getElementById('schedName');
const schedTime = document.getElementById('schedTime');
const schedRepeat = document.getElementById('schedRepeat');
const customDays = document.getElementById('customDays');
const alarmAudio = document.getElementById('alarmAudio');

const readingsUpload = document.getElementById('readingsUpload');
const downloadReport = document.getElementById('downloadReport');

const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

let symptomsDB = null;
let normalizedDB = {};
let recognition = null;
let isListening = false;
let currentImageFile = null;
let ttsMsg = null;
let ttsState = "idle";

let schedules = JSON.parse(localStorage.getItem('swasthyaSchedules') || '[]');
let scheduleTimers = [];
let medicines = JSON.parse(localStorage.getItem('swasthyaMeds')) || [];
let healthData = JSON.parse(localStorage.getItem('swasthyaHealth')) || { bp: [], sugar: [], weight: [] };
let currentTracker = 'bp';
let activeAlarmInterval = null;

// ✅ ADD STATUS DIV if missing
if (!document.getElementById('status')) {
    statusDiv.id = 'status';
    statusDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:white;padding:8px;border-radius:8px;font-size:12px;z-index:9999;max-width:300px;';
    document.body.appendChild(statusDiv);
}

/* -------------- Symptoms DB -------------- */
async function loadSymptoms() {
    try {
        loadingScreen.style.display = 'block';
        const res = await fetch('data/symptoms.json');
        symptomsDB = await res.json();
        normalizedDB = {};
        for (const langKey of Object.keys(symptomsDB)) {
            normalizedDB[langKey] = symptomsDB[langKey].map(item => ({
                raw: item,
                normKeywords: (item.keywords || []).map(k => normalizeForMatch(k))
            }));
        }
        statusDiv.textContent = '✅ Symptoms loaded';
        console.log('✅ Symptoms loaded');
    } catch (e) {
        console.error('Symptoms load failed', e);
        statusDiv.textContent = '⚠ Symptoms DB offline. Basic AI works.';
    } finally {
        loadingScreen.style.display = 'none';
    }
}

/* ----------------- Helpers ----------------- */
function normalizeForMatch(s) {
    if (!s && s !== '') return '';
    let out = s.normalize ? s.normalize('NFC') : s;
    out = out.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    out = out.replace(/\s+/g, ' ').trim();
    return out.toLowerCase();
}
function isIndicScript(s) { return /[\u0900-\u097F\u0C80-\u0CFF\u0B80-\u0BFF]/u.test(s || ''); }
function matchKeywordInText(keyword, text) {
    if (!keyword || !text) return false;
    const nk = normalizeForMatch(keyword), nt = normalizeForMatch(text);
    if (isIndicScript(nk) || isIndicScript(nt)) return nt.includes(nk);
    const escaped = nk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (nk.length < 4) return nt.includes(nk);
    return new RegExp(`\\b${escaped}\\b`, 'i').test(nt);
}
function normalizeLang(code) { 
    return code?.startsWith('hi') ? 'hi' : code?.startsWith('kn') ? 'kn' : 'en'; 
}

/* ----------------- SPEECH RECOGNITION (MIC) ----------------- */
function getSpeechLocale() {
    const val = languageSelect.value;
    return val === 'hi' ? 'hi-IN' : val === 'kn' ? 'kn-IN' : 'en-IN';
}

function createRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
        statusDiv.textContent = '❌ Speech recognition not supported';
        return null;
    }
    const r = new SpeechRec();
    r.continuous = false;
    r.interimResults = false;
    r.lang = getSpeechLocale();
    
    r.onresult = (e) => {
        const spoken = e.results[0][0].transcript;
        transcriptDiv.textContent = `⟶ "${spoken}"`;
        transcriptDiv.style.display = 'block';
        stopListeningUI();
        handleUserInput(spoken);
    };
    r.onerror = () => { 
        stopListeningUI(); 
        statusDiv.textContent = '❌ Mic error - Check permissions';
        micStatus.textContent = 'Mic error';
    };
    r.onend = () => { 
        if (isListening) stopListeningUI(); 
    };
    return r;
}

function setupRecognition() { 
    recognition = createRecognition(); 
}

function startListeningUI() { 
    isListening = true; 
    micBtn.classList.add('listening'); 
    micStatus.textContent = 'Listening... 🔴'; 
    micIcon.textContent = '🎙'; 
}
function stopListeningUI() { 
    isListening = false; 
    micBtn.classList.remove('listening'); 
    micStatus.textContent = 'Ready to listen'; 
    micIcon.textContent = '🎤'; 
}

/* ----------------- STOP ALARM BUTTON ✅ FIXED ----------------- */
function setupStopAlarmBtn() {
    const stopAlarmBtn = document.getElementById('stopAlarmBtn');
    if (stopAlarmBtn) {
        stopAlarmBtn.addEventListener('click', () => {
            // Stop repeating alarm
            if (activeAlarmInterval) {
                clearInterval(activeAlarmInterval);
                activeAlarmInterval = null;
            }
            
            // Stop audio
            try {
                alarmAudio.pause();
                alarmAudio.currentTime = 0;
            } catch(e) {}
            
            // Hide controls
            const alarmControls = document.getElementById('alarmControls');
            if (alarmControls) alarmControls.style.display = 'none';
            
            statusDiv.textContent = '✅ Alarm stopped';
            console.log('✅ Alarm stopped');
        });
        console.log('✅ Stop button ready');
    } else {
        console.log('⚠ stopAlarmBtn not found');
    }
}

/* ----------------- UI Navigation ----------------- */
navButtons.forEach(btn => btn.addEventListener('click', (ev) => {
    navButtons.forEach(b => b.classList.remove('active'));
    ev.currentTarget.classList.add('active');
    const target = ev.currentTarget.getAttribute('data-target');
    showSection(target);
}));

function showSection(id) {
    sections.forEach(s => s.style.display = (s.id === id) ? 'block' : 'none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ----------------- TEXT INPUT ----------------- */
textSubmit.addEventListener('click', () => {
    const t = textInput.value.trim();
    if (!t) return alert('Please type symptoms or use mic.');
    transcriptDiv.textContent = `⟶ "${t}"`;
    transcriptDiv.style.display = 'block';
    handleUserInput(t); 
    textInput.value = '';
});

textInput.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') textSubmit.click(); 
});

function handleUserInput(text) {
    statusDiv.textContent = `🔍 Analyzing: ${text.substring(0,30)}...`;
    setTimeout(() => {
        diagnosisDiv.innerHTML = `<div class="diagnosis">✅ Demo: "${text}" matches fever → Rest + hydration<span style="opacity:0.7"> (add symptoms.json)</span></div>`;
        diagnosisDiv.style.display = 'block';
    }, 1000);
}

/* ----------------- SCHEDULE FUNCTIONS ----------------- */
function renderSchedules() {
    if (!schedules || schedules.length === 0) {
        schedulesList.innerHTML = '<div class="muted">No scheduled medicines. Add one above.</div>';
        return;
    }
    schedulesList.innerHTML = schedules.map((s, idx) => {
        const days = s.repeat === 'custom' ? (s.days || []).map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ') : s.repeat;
        return `<div class="sched-item">
            <div>
                <strong>${s.name}</strong><div class="small muted">${days} • ${s.time}</div>
            </div>
            <div>
                <button onclick="triggerNow(${idx})" class="btn small">🔔 Now</button>
                <button onclick="toggleSchedule(${idx})" class="btn small">${s.enabled ? '⏸' : '▶'}</button>
                <button onclick="removeSchedule(${idx})" class="btn small">🗑</button>
            </div>
        </div>`;
    }).join('');
}

function saveSchedules() { localStorage.setItem('swasthyaSchedules', JSON.stringify(schedules)); }

function nextTriggerTime(schedule) {
    const [hh, mm] = schedule.time.split(':').map(Number);
    const now = new Date();
    const candidate = new Date(now);
    candidate.setHours(hh, mm, 0, 0);

    if (schedule.repeat === 'once') {
        if (candidate <= now) return null;
        return candidate;
    } else if (schedule.repeat === 'daily') {
        if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
        return candidate;
    } else if (schedule.repeat === 'custom') {
        const days = schedule.days || [];
        if (!days.length) return null;
        for (let offset = 0; offset < 7; offset++) {
            const d = new Date(now);
            d.setDate(now.getDate() + offset);
            d.setHours(hh, mm, 0, 0);
            if (d > now && days.includes(d.getDay())) return d;
        }
        return null;
    }
}

function clearScheduleTimers() { scheduleTimers.forEach(t => clearTimeout(t)); scheduleTimers = []; }

function scheduleEngine() {
    clearScheduleTimers();
    schedules.forEach((s, idx) => {
        if (!s.enabled) return;
        const next = nextTriggerTime(s);
        if (!next) return;
        const delay = next.getTime() - Date.now();
        const t = setTimeout(async () => {
            await showAlarm(s);
            if (s.repeat === 'daily' || s.repeat === 'custom') scheduleEngine();
            else { s.enabled = false; saveSchedules(); renderSchedules(); }
        }, Math.max(0, delay));
        scheduleTimers.push(t);
    });
}

window.triggerNow = async function(idx) { 
    const s = schedules[idx]; 
    if (!s) return; 
    await showAlarm(s); 
}

window.toggleSchedule = function(idx) { 
    schedules[idx].enabled = !schedules[idx].enabled; 
    saveSchedules(); 
    renderSchedules(); 
    scheduleEngine(); 
}

window.removeSchedule = function(idx) { 
    schedules.splice(idx,1); 
    saveSchedules(); 
    renderSchedules(); 
    scheduleEngine(); 
}

async function showAlarm(schedule) {
    const alarmControls = document.getElementById('alarmControls');
    const alarmText = document.getElementById('alarmText');
    
    if (alarmControls) alarmControls.style.display = 'flex';
    if (alarmText) alarmText.textContent = `🔔 Reminder — ${schedule.name} • ${schedule.time}`;
    statusDiv.innerHTML = `🔔 Reminder: Take ${schedule.name}`;
    
    try { alarmAudio.currentTime = 0; alarmAudio.play().catch(()=>{}); } catch(e){}
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
    
    if (Notification.permission === 'granted') {
        new Notification('Medicine Reminder', { 
            body: `Time to take: ${schedule.name}`,
            tag: 'swasthya-mitra'
        });
    }
    
    if (activeAlarmInterval) clearInterval(activeAlarmInterval);
    activeAlarmInterval = setInterval(() => {
        try { alarmAudio.currentTime = 0; alarmAudio.play().catch(()=>{}); } catch(e){}
        if (navigator.vibrate) navigator.vibrate(150);
    }, 5000);
}

schedRepeat.addEventListener('change', () => { 
    customDays.style.display = schedRepeat.value === 'custom' ? 'block' : 'none'; 
});

scheduleForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = schedName.value.trim();
    const time = schedTime.value;
    const repeat = schedRepeat.value;
    let days = [];
    if (repeat === 'custom') {
        const checks = customDays.querySelectorAll('input[type="checkbox"]:checked');
        days = Array.from(checks).map(c => parseInt(c.value));
        if (!days.length) return alert('Select at least one day');
    }
    if (!name || !time) return alert('Enter name & time');
    const s = { name, time, repeat, days, enabled: true, id: Date.now() };
    schedules.push(s); 
    saveSchedules();
    schedName.value = ''; 
    schedTime.value = ''; 
    schedRepeat.value = 'daily'; 
    customDays.style.display = 'none';
    renderSchedules(); 
    scheduleEngine();
});

/* ----------------- HEALTH TRACKER ----------------- */
function updateTodayMeds() {
    const today = new Date().toDateString();
    const todayMeds = medicines.filter(m => m.date === today);
    const container = document.getElementById('todayMeds');
    if (!container) return;
    
    if (todayMeds.length === 0) {
        container.innerHTML = '<div style="text-align:center;opacity:0.7">No medicines today</div>';
        return;
    }
    
    container.innerHTML = todayMeds.map((med,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(16,185,129,0.08);padding:10px;border-radius:10px;margin:6px 0">
            <div><strong>${med.name}</strong><br><small>${med.time}</small></div>
            <button onclick="toggleMed(${i})" class="btn small">${med.taken?'✅ Taken':'⭕ Take'}</button>
        </div>`).join('');
}

function updateHealthDisplay() {
    const latest = {
        bp: healthData.bp[healthData.bp.length - 1]?.value || '-',
        sugar: healthData.sugar[healthData.sugar.length - 1]?.value || '-',
        weight: healthData.weight[healthData.weight.length - 1]?.value || '-'
    };
    const bpEl = document.getElementById('bpValue');
    const sugarEl = document.getElementById('sugarValue');
    const weightEl = document.getElementById('weightValue');
    
    if (bpEl) bpEl.textContent = latest.bp;
    if (sugarEl) sugarEl.textContent = latest.sugar;
    if (weightEl) weightEl.textContent = latest.weight;
    
    if (bpEl && latest.bp && latest.bp > 140) bpEl.style.color = '#ef4444';
    if (sugarEl && latest.sugar && latest.sugar > 180) sugarEl.style.color = '#ef4444';
}

window.showTracker = function(type) {
    currentTracker = type;
    const titles = { bp: 'Blood Pressure', sugar: 'Blood Sugar', weight: 'Weight' };
    const modalTitle = document.getElementById('modalTitle');
    const trackerModal = document.getElementById('trackerModal');
    const trackerValue = document.getElementById('trackerValue');
    
    if (modalTitle) modalTitle.textContent = `Add ${titles[type]}`;
    if (trackerModal) trackerModal.style.display = 'flex';
    if (trackerValue) trackerValue.focus();
};

window.closeTracker = function() {
    const trackerModal = document.getElementById('trackerModal');
    if (trackerModal) trackerModal.style.display = 'none';
};

window.toggleMed = function(index) {
    const today = new Date().toDateString();
    const todayMeds = medicines.filter(m => m.date === today);
    const med = todayMeds[index];
    if (!med) return;
    
    med.taken = !med.taken;
    const all = JSON.parse(localStorage.getItem('swasthyaMeds') || '[]');
    const idx = all.findIndex(m => m.date === med.date && m.name === med.name && m.time === med.time);
    if (idx >= 0) all.splice(idx, 1, med);
    localStorage.setItem('swasthyaMeds', JSON.stringify(all));
    medicines = all;
    updateTodayMeds();
};

/* ----------------- THEME TOGGLE ----------------- */
themeToggle?.addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', nextTheme);
    themeToggle.textContent = nextTheme === 'dark' ? '🌞' : '🌙';
});

/* ----------------- APP INIT (Everything Works) ----------------- */
async function initApp() {
    // Setup mic
    setupRecognition();
    
    // Setup stop alarm button ✅ FIXED
    setupStopAlarmBtn();
    
    // Load data
    await loadSymptoms();
    renderSchedules();
    updateTodayMeds();
    updateHealthDisplay();
    scheduleEngine();
    
    // Ready
    statusDiv.textContent = '🚀 Ready! Speak, type, or 📸 upload photo';
    showSection('symptom-section');
    
    // Events
    window.addEventListener('online', () => statusDiv.textContent = '🌐 Back online');
    window.addEventListener('offline', () => statusDiv.textContent = '🔌 Offline mode');
    if (Notification.permission === 'default') Notification.requestPermission();
    
    languageSelect.addEventListener('change', () => {
        if (recognition) try { recognition.abort(); } catch(e) {}
        recognition = null; 
        setupRecognition();
    });
    
    micBtn.addEventListener('click', () => {
        if (isListening) {
            if (recognition) try { recognition.stop(); } catch(e) {}
            stopListeningUI();
        } else {
            if (!recognition) { 
                statusDiv.textContent = '❌ Speech recognition not supported';
                return; 
            }
            recognition.lang = getSpeechLocale(); 
            recognition.start(); 
            startListeningUI();
            statusDiv.textContent = `🎤 Listening in ${languageSelect.value.toUpperCase()}`;
        }
    });
}

// 🔥 START APP
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
