/**
 * SISTEM PRESENSI PERAWAT - PUSKESMAS SAMPANAHAN
 * Logika Lengkap dan Sinkronisasi Cloud
 */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw-Fl_qSNgqr9oEnn3vUmCtN4bRCZ5M7wz5YMiofUD33pN-kICuL6zubelKVcI_k2luXg/exec";

const db = {
    activeUser: localStorage.getItem('presensi_user') || null,
    isSettingsAuth: localStorage.getItem('is_admin_auth') === 'true',
    isChatAuth: localStorage.getItem('is_chat_auth') === 'true',
    activeView: 'home',
    lastChatId: localStorage.getItem('last_chat_id') || "0",
    selectedMsgId: null,
    officers: [], 
    logs: [], 
    schedule: {}, 
    attendance: {}, 
    holidays: [],
    chat: [], 
    config: { 
        adminPin: "1111", 
        chatPin: "ugd", 
        qrData: "SISTEM-PRO-01", 
        themeColor: '#0d9488', 
        navLayout: 'grid', 
        voice: true, 
        motivation: true,
        gpsEnabled: false,
        lat: "", lng: "", radius: "100",
        shiftHours: { 
            Pagi: { start: "08:00", end: "14:00" }, 
            Siang: { start: "14:00", end: "20:00" }, 
            Malam: { start: "20:00", end: "08:00" } 
        }, 
        rates: { biasa: 0, besar: 0 } 
    }
};

let h5q = null;

// --- UTILITIES ---
function safeSetText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
function safeSetHTML(id, html) { const el = document.getElementById(id); if(el) el.innerHTML = html; }
function safeSetValue(id, val) { const el = document.getElementById(id); if(el) el.value = val; }
function safeSetChecked(id, val) { const el = document.getElementById(id); if(el) el.checked = !!val; }

function showLoading(s) { 
    const l = document.getElementById('loading'); 
    if(l) s ? l.classList.remove('hidden') : l.classList.add('hidden'); 
}

function showModernNotify(type, title, msg) {
    const toast = document.getElementById('modern-toast');
    const icon = document.getElementById('toast-icon');
    if(!toast) return;
    
    toast.className = (type === 'success' ? 'toast-success show' : 'toast-error show') + ' flex items-center';
    if(type === 'info') {
        icon.innerText = "💬";
    } else if(type === 'error') {
        icon.innerText = "✕";
    } else {
        icon.innerText = "✓";
    }
    
    safeSetText('toast-title', title); safeSetText('toast-body', msg);
    setTimeout(() => { toast.classList.remove('show'); }, 5000);
}

function getTodayStr() {
    const n = new Date();
    return ("0"+n.getDate()).slice(-2)+"/"+("0"+(n.getMonth()+1)).slice(-2)+"/"+n.getFullYear();
}

function getShiftData() {
    const now = new Date(), cur = now.getHours() * 60 + now.getMinutes(), sh = db.config.shiftHours;
    const parse = (t) => { if(!t) return 0; const p = String(t).split(':'); return parseInt(p[0])*60 + (p[1]?parseInt(p[1]):0); };
    if(cur >= parse(sh.Pagi.start) && cur < parse(sh.Pagi.end)) return {l:'Pagi', emoji:'☀️', code:'P'};
    if(cur >= parse(sh.Siang.start) && cur < parse(sh.Siang.end)) return {l:'Siang', emoji:'🌅', code:'S'};
    return {l:'Malam', emoji:'🌙', code:'M'};
}

// --- DATA FETCHING ---
async function fetchWithRetry(url, options = {}, retries = 5) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error("HTTP Error");
        return response;
    } catch (error) {
        if (retries > 0) return fetchWithRetry(url, options, retries - 1);
        throw error;
    }
}

window.loadData = async function(mode) {
    if(mode !== 'background') showLoading(true);
    try {
        const r = await fetchWithRetry(WEB_APP_URL + "?action=getData", { method: "GET" });
        const d = await r.json();
        
        // Cek Chat Baru untuk Notifikasi
        if(d.chat && d.chat.length > 0) {
            const latestMsg = d.chat[d.chat.length - 1];
            const latestId = parseInt(latestMsg.msgId || 0);
            const lastSeenId = parseInt(db.lastChatId || 0);
            if (latestId > lastSeenId && latestMsg.name !== db.activeUser) {
                if (db.activeView !== 'chat') {
                    document.getElementById('chat-badge')?.classList.remove('hidden');
                    showModernNotify('info', 'Pesan Baru', `${latestMsg.name}: ${latestMsg.message.substring(0, 25)}...`);
                }
            }
        }

        db.officers = d.officers || []; 
        db.logs = d.logs || []; 
        db.schedule = d.schedule || {}; 
        db.chat = d.chat || []; 
        db.holidays = d.holidays || [];
        if(d.config) db.config = Object.assign(db.config, d.config);
        
        // Proses Data Absensi untuk Tabel Rekap (Bulan Berjalan)
        db.attendance = {};
        const now = new Date();
        db.logs.forEach(l => {
            if(!l.date) return;
            const p = l.date.split('/');
            if(p.length === 3) {
                // Hanya proses log untuk bulan dan tahun yang sama dengan hari ini
                if(parseInt(p[1])-1 === now.getMonth() && parseInt(p[2]) === now.getFullYear()) {
                    const key = l.name.trim().toUpperCase();
                    if(!db.attendance[key]) db.attendance[key] = {};
                    db.attendance[key][parseInt(p[0])] = l.shift && l.shift !== "Dihapus" ? l.shift[0].toUpperCase() : '';
                }
            }
        });

        window.render();
        if(db.isSettingsAuth) window.fillConfigInputs();
    } catch(e) { 
        console.error("Gagal sinkronisasi data:", e);
        showModernNotify('error', 'Koneksi', 'Gagal memperbarui data dari server.');
    } finally { showLoading(false); }
};

// --- RENDER LOGIC ---
window.render = function() {
    const sh = getShiftData(), today = getTodayStr(), now = new Date();
    
    // Header & Clock
    safeSetText('clock', now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }));
    safeSetText('date-label', now.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long' }));
    safeSetText('shift-label', "Shift " + sh.l); 
    safeSetText('shift-icon', sh.emoji);
    
    // User Section
    safeSetText('user-display-name', db.activeUser || "Selamat Datang");
    const sel = document.getElementById('select-onboarding'); 
    if(sel) {
        const options = db.officers.length 
            ? '<option value="">-- PILIH IDENTITAS --</option>' + db.officers.map(o => `<option value="${o}" ${db.activeUser === o ? 'selected' : ''}>${o}</option>`).join('') 
            : '<option value="">Memuat data...</option>';
        sel.innerHTML = options;
    }
    
    document.getElementById('section-login')?.classList.toggle('hidden', !!db.activeUser);
    document.getElementById('logout-btn')?.classList.toggle('hidden', !db.activeUser);
    ['section-planned-schedule','section-actual-duty','section-daily-log'].forEach(id => {
        document.getElementById(id)?.classList.toggle('hidden', !db.activeUser);
    });

    // Auth States untuk View Settings & Chat
    const sa = document.getElementById('settings-auth-container'), sp = document.getElementById('settings-protected-content');
    const ca = document.getElementById('chat-auth-container'), cp = document.getElementById('chat-protected-content');
    if(db.isSettingsAuth){ sa?.classList.add('hidden'); sp?.classList.remove('hidden'); }
    else { sa?.classList.remove('hidden'); sp?.classList.add('hidden'); }
    if(db.isChatAuth){ ca?.classList.add('hidden'); cp?.classList.remove('hidden'); }
    else { ca?.classList.remove('hidden'); cp?.classList.add('hidden'); }

    // Render Jadwal Terencana (Hari Ini)
    let schH = '<table class="schedule-table"><tbody>';
    ['Pagi','Siang','Malam'].forEach(sName => {
        const assigned = db.officers.filter(n => db.schedule[n] && db.schedule[n][now.getDate()] === sName[0]);
        const isCur = sName.toLowerCase() === sh.l.toLowerCase();
        schH += `<tr>
            <td class="${isCur ? 'current-shift-card' : ''}"><div class="font-black text-slate-700 text-xs">${sName}</div></td>
            <td class="${isCur ? 'current-shift-card' : ''}">${assigned.length ? assigned.map(o => `<span class="staff-pill ${isCur ? 'staff-pill-active' : ''}">${o}</span>`).join('') : '<span class="text-slate-300 italic text-[10px]">Kosong</span>'}</td>
        </tr>`;
    });
    safeSetHTML('planned-schedule-list', schH + '</tbody></table>');

    // Render Status Kehadiran Live (Actual Duty)
    const actLogs = db.logs.filter(l => l.date === today && l.shift === sh.l);
    safeSetHTML('current-duty-list', actLogs.length ? actLogs.map(l => `
        <div class="bg-white p-3 rounded-2xl flex items-center gap-3 border border-emerald-100">
            <div class="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs">${l.name[0]}</div>
            <div>
                <p class="text-[10px] font-black uppercase text-slate-700">${l.name}</p>
                <p class="text-[7px] font-bold text-emerald-500 uppercase">SHIFT ${l.shift.toUpperCase()} • HADIR</p>
            </div>
        </div>`).join('') : '<p class="text-center py-4 text-[10px] font-bold text-slate-300 uppercase">Belum ada absen masuk</p>');

    // Render Log Scan Hari Ini
    const dailyLogs = db.logs.filter(l => l.date === today);
    safeSetHTML('daily-log-list', dailyLogs.length ? dailyLogs.slice(0,8).map(l => `
        <div class="bg-white p-3 rounded-2xl flex items-center justify-between border border-slate-100">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400 font-bold">${l.name[0]}</div>
                <div>
                    <p class="text-[10px] font-black uppercase text-slate-700">${l.name}</p>
                    <p class="text-[7px] font-bold text-slate-400 uppercase">${l.shift} • ${l.time}</p>
                </div>
            </div>
            <div class="text-[8px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">OK</div>
        </div>`).join('') : '<p class="text-center py-4 text-[10px] font-bold text-slate-300">Belum ada aktivitas</p>');

    // Update Tema Dinamis
    const color = db.config.themeColor || '#0d9488';
    document.getElementById('dynamic-theme').innerHTML = `:root { --primary: ${color}; --primary-light: ${color}15; --accent: #f43f5e; --bg: #f8fafc; }`;

    // Panggil Sub-render untuk view Rekap dan Chat
    window.renderRekap();
    window.renderChat();
};

window.renderRekap = function() {
    const now = new Date(), yr = now.getFullYear(), mo = now.getMonth(), days = new Date(yr, mo+1, 0).getDate();
    let h = `<table class="editor-table"><thead><tr><th class="sticky-col">PERAWAT</th>`;
    for(let d=1; d<=days; d++) h += `<th>${d}</th>`;
    h += `<th class="sticky-col-right text-white" style="background-color: var(--primary) !important;">TOT</th></tr></thead><tbody>`;
    
    db.officers.forEach(name => {
        const att = db.attendance[name.toUpperCase()] || {};
        h += `<tr><td class="sticky-col uppercase font-black text-xs">${name}</td>`;
        for(let d=1; d<=days; d++) {
            const val = att[d] || '';
            h += `<td class="cell-${val} font-bold">${val}</td>`;
        }
        h += `<td class="sticky-col-right font-black" style="color: var(--primary); background-color: white !important;">${Object.keys(att).length}</td></tr>`;
    });
    safeSetHTML('rekap-table-container', h + `</tbody></table>`);
};

window.renderChat = function() {
    const container = document.getElementById('chat-container');
    if (!container) return;
    if (!db.chat.length) {
        container.innerHTML = '<p class="text-center text-slate-400 text-[10px] mt-10 uppercase font-bold">Belum ada percakapan</p>';
        return;
    }
    container.innerHTML = db.chat.map(m => {
        const isMe = m.name === db.activeUser;
        return `
            <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4">
                <div class="${isMe ? 'bg-teal-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white text-slate-800 rounded-r-2xl rounded-tl-2xl'} p-3 shadow-sm border ${isMe ? 'border-teal-700' : 'border-slate-100'} max-w-[85%]">
                    ${!isMe ? `<p class="text-[9px] font-black uppercase mb-1 text-teal-600">${m.name}</p>` : ''}
                    <p class="text-[11px] font-medium leading-relaxed">${m.message}</p>
                    <p class="text-[7px] opacity-60 font-bold mt-1 text-right uppercase">${m.time}</p>
                </div>
            </div>
        `;
    }).join('');
    container.scrollTop = container.scrollHeight;
};

window.renderScheduleEditor = function() {
    const c = document.getElementById('editor-jadwal-container');
    if(!c) return;
    const now = new Date(), yr = now.getFullYear(), mo = now.getMonth(), days = new Date(yr, mo+1, 0).getDate();
    let h = `<table class="editor-table"><thead><tr><th class="sticky-col">PERAWAT</th>`;
    for(let d=1; d<=days; d++) h += `<th>${d}</th>`;
    h += `</tr></thead><tbody>`;
    db.officers.forEach(name => {
        h += `<tr><td class="sticky-col uppercase font-black text-xs">${name}</td>`;
        for(let d=1; d<=days; d++) {
            const v = (db.schedule[name] && db.schedule[name][d]) ? db.schedule[name][d] : '';
            h += `<td class="cell-${v}"><select onchange="window.updateLocalSch('${name}',${d},this.value,this.parentElement)" class="bg-transparent text-center font-bold w-full outline-none appearance-none">
                <option value=""></option>
                <option value="P" ${v==='P'?'selected':''}>P</option>
                <option value="S" ${v==='S'?'selected':''}>S</option>
                <option value="M" ${v==='M'?'selected':''}>M</option>
                <option value="L" ${v==='L'?'selected':''}>L</option>
                <option value="V" ${v==='V'?'selected':''}>V</option>
            </select></td>`;
        }
        h += `</tr>`;
    });
    safeSetHTML('editor-jadwal-container', h + `</tbody></table>`);
};

// --- ACTIONS ---
window.lockAccount = function() { 
    const v = document.getElementById('select-onboarding').value; 
    if(!v) return; 
    db.activeUser = v; 
    localStorage.setItem('presensi_user', v); 
    window.render(); 
};

window.logout = function() { 
    if(confirm("Keluar dari sesi ini?")) { 
        localStorage.removeItem('presensi_user'); 
        db.activeUser=null; 
        window.render(); 
    } 
};

window.showView = function(v) { 
    db.activeView = v;
    document.querySelectorAll('.view-content').forEach(el => el.classList.remove('active')); 
    document.getElementById('view-'+v).classList.add('active'); 
    document.querySelectorAll('.nav-card-item').forEach(el => el.classList.remove('active')); 
    document.getElementById('nav-'+v)?.classList.add('active'); 
    if(v === 'chat') {
        document.getElementById('chat-badge')?.classList.add('hidden');
        if(db.chat.length > 0) {
            db.lastChatId = db.chat[db.chat.length-1].msgId;
            localStorage.setItem('last_chat_id', db.lastChatId);
        }
    }
    if(v === 'settings' && db.isSettingsAuth) window.renderScheduleEditor();
};

window.verifySettingsPin = function() {
    const pin = document.getElementById('settings-pin-input').value;
    if(pin === db.config.adminPin) { 
        db.isSettingsAuth=true; 
        localStorage.setItem('is_admin_auth','true'); 
        window.loadData(); 
    } else showModernNotify('error', 'PIN Salah', 'Akses dashboard ditolak.');
};

window.logoutSettings = () => { db.isSettingsAuth=false; localStorage.removeItem('is_admin_auth'); window.render(); };

window.verifyChatPin = function() {
    const pin = document.getElementById('chat-pin-input').value;
    if(pin === db.config.chatPin) { 
        db.isChatAuth=true; 
        localStorage.setItem('is_chat_auth','true'); 
        window.render(); 
    } else showModernNotify('error', 'PIN Salah', 'Gagal masuk grup koordinasi.');
};

window.logoutChat = () => { db.isChatAuth=false; localStorage.removeItem('is_chat_auth'); window.render(); };

window.togglePanel = (id) => { document.getElementById(id).classList.toggle('open'); };
window.updateLocalSch = (n, d, v, cell) => { if(!db.schedule[n]) db.schedule[n] = {}; db.schedule[n][d] = v; cell.className = v ? 'cell-'+v : ''; };

window.openScanModal = async function() {
    if(!db.activeUser) return showModernNotify('error', 'Login!', 'Pilih perawat di Beranda dahulu.');
    const modal = document.getElementById('modal-scan');
    modal.style.display = 'flex';
    try {
        if(!h5q) h5q = new Html5Qrcode("reader");
        await h5q.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, async (txt) => {
            if(txt === db.config.qrData) {
                const shiftInfo = getShiftData();
                await h5q.stop();
                modal.style.display = 'none';
                
                const payload = { 
                    name: db.activeUser, 
                    date: getTodayStr(), 
                    shift: shiftInfo.l, 
                    time: new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) 
                };
                
                const success = await postToCloud('saveScan', payload);
                if(success) {
                    showModernNotify('success', 'Berhasil', 'Presensi Anda telah tercatat di server.');
                    if (db.config.voice && 'speechSynthesis' in window) {
                        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Presensi Berhasil"));
                    }
                }
            }
        });
    } catch (e) { 
        modal.style.display = 'none'; 
        showModernNotify('error', 'Kamera', 'Gagal mengakses kamera. Pastikan izin diberikan.'); 
    }
};

window.closeModal = async () => { if(h5q) { try{await h5q.stop();}catch(e){} } document.getElementById('modal-scan').style.display = 'none'; };

window.sendMessage = async () => {
    const i = document.getElementById('chat-input');
    if(!i.value.trim()) return;
    const msg = i.value.trim(); i.value = '';
    
    // Optimistic UI (tambah lokal dulu)
    const time = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
    db.chat.push({ msgId: 'temp', name: db.activeUser, message: msg, time: time });
    window.renderChat();
    
    await postToCloud('saveChat', { name: db.activeUser, message: msg, time: time });
};

window.exportToExcel = function() {
    const now = new Date(), yr = now.getFullYear(), mo = now.getMonth(), days = new Date(yr, mo+1, 0).getDate();
    const headers = ["NAMA PERAWAT"];
    for(let d=1; d<=days; d++) headers.push(d);
    headers.push("TOTAL");
    
    const rows = [headers];
    db.officers.forEach(n => {
        const att = db.attendance[n.toUpperCase()] || {};
        const row = [n];
        for(let d=1; d<=days; d++) row.push(att[d]||"");
        row.push(Object.keys(att).length);
        rows.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
    XLSX.writeFile(wb, `Rekap_Presensi_${mo+1}_${yr}.xlsx`);
};

window.fillConfigInputs = function() {
    const c = db.config;
    safeSetChecked('cfg-gps-toggle', c.gpsEnabled);
    safeSetValue('cfg-gps-lat', c.lat); 
    safeSetValue('cfg-gps-lng', c.lng); 
    safeSetValue('cfg-gps-radius', c.radius);
    safeSetValue('cfg-admin-pin', c.adminPin); 
    safeSetValue('cfg-chat-pin', c.chatPin);
    safeSetValue('cfg-qr-data', c.qrData);
    safeSetValue('cfg-rate-biasa', c.rates.biasa); 
    safeSetValue('cfg-rate-besar', c.rates.besar);
    safeSetChecked('cfg-voice-toggle', c.voice);
    safeSetChecked('cfg-motivation-toggle', c.motivation);
    
    if(c.shiftHours){
        safeSetValue('cfg-shift-pagi-start', c.shiftHours.Pagi.start); 
        safeSetValue('cfg-shift-pagi-end', c.shiftHours.Pagi.end);
        safeSetValue('cfg-shift-siang-start', c.shiftHours.Siang.start); 
        safeSetValue('cfg-shift-siang-end', c.shiftHours.Siang.end);
        safeSetValue('cfg-shift-malam-start', c.shiftHours.Malam.start); 
        safeSetValue('cfg-shift-malam-end', c.shiftHours.Malam.end);
    }
    
    const listH = document.getElementById('list-holidays');
    if(listH && db.holidays) {
        listH.innerHTML = db.holidays.map((h, i) => `
            <div class="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-xs font-bold mb-2">
                <span>${h}</span>
                <button onclick="db.holidays.splice(${i},1);window.fillConfigInputs()" class="text-rose-500">HAPUS</button>
            </div>`).join('');
    }
};

window.saveFullConfigCloud = async function() {
    // Ambil data dari input sebelum simpan
    db.config.gpsEnabled = document.getElementById('cfg-gps-toggle')?.checked;
    db.config.adminPin = document.getElementById('cfg-admin-pin')?.value;
    db.config.chatPin = document.getElementById('cfg-chat-pin')?.value;
    
    const btn = document.getElementById('btn-save-all');
    btn.innerText = "⏳ MENYIMPAN..."; btn.disabled = true;
    
    const res = await postToCloud('updateFullConfig', { 
        config: db.config, 
        officers: db.officers, 
        schedule: db.schedule, 
        holidays: db.holidays 
    });
    
    btn.innerText = "💾 SIMPAN SELURUH PERUBAHAN"; btn.disabled = false;
    if(res) showModernNotify('success', 'Tersimpan', 'Seluruh konfigurasi telah diperbarui di Cloud.');
};

async function postToCloud(action, payload) {
    try { 
        const r = await fetchWithRetry(WEB_APP_URL, { 
            method: "POST", 
            body: JSON.stringify({ action, payload }) 
        }); 
        const res = await r.json(); 
        if(res.status === 'success') {
            await window.loadData('background'); 
            return true;
        }
        return false;
    } catch(e) { 
        showModernNotify('error', 'Server Error', 'Gagal terhubung ke database.');
        return false; 
    }
}

// --- INITIALIZATION ---
window.onload = () => {
    window.loadData();
    // Sinkronisasi berkala tiap 30 detik
    setInterval(() => { window.loadData('background'); }, 30000);
};
