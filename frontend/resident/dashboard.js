const API       = `${window.location.protocol}//${window.location.hostname}:8000`;
const USER_ID   = parseInt(sessionStorage.getItem('user_id')   || '1');
const USER_NAME = sessionStorage.getItem('user_name') || 'Resident';

// ── STATE ──────────────────────────────────────────────────────────────────────
let allReports         = [];
let chatHistory        = [];
let selectedReportType = '';
let selectedSeverity   = '';
let recognition        = null;
let isRecording        = false;

// ── RULE-BASED CHATBOT KNOWLEDGE BASE ─────────────────────────────────────────
const CHATBOT_KB = [
  // Emergency Hotlines
  {
    keywords: ['emergency', 'hotline', 'number', 'contact', 'call', 'phone', 'numero', 'telepono', 'linya'],
    response: ` <strong>Emergency Contact Numbers — Polangui, Albay</strong><br><br>
 <strong>Emergency Hotline:</strong> 911<br>
 <strong>MDRRMO Polangui:</strong> (052) 486-0160<br>
 <strong>BFP (Fire Station):</strong> (052) 486-0117<br>
 <strong>PNP Polangui Police:</strong> (052) 486-0116<br>
 <strong>Polangui General Hospital:</strong> (052) 486-0133<br>
 <strong>MERALCO:</strong> 16211<br>
 <strong>PAGASA (Weather):</strong> (02) 8284-0800<br><br>
<em>💡 Para sa agarang tulong, tawagan ang 911 o MDRRMO.</em>`
  },
  // MDRRMO specific
  {
    keywords: ['mdrrmo', 'disaster risk', 'municipal'],
    response: ` <strong>MDRRMO — Polangui, Albay</strong><br><br>
 <strong>Hotline:</strong> (052) 486-0160<br>
 <strong>Address:</strong> Municipal Hall, Polangui, Albay<br>
 <strong>Hours:</strong> 24/7 sa panahon ng kalamidad<br><br>
Ang MDRRMO (Municipal Disaster Risk Reduction and Management Office) ang responsable sa disaster preparedness, response, at rehabilitation sa Polangui.<br><br>
Maaari kang mag-report ng insidente direkta sa pamamagitan ng <strong>🚨 Report button</strong> sa app na ito.`
  },
  // Police
  {
    keywords: ['police', 'pulis', 'pnp', 'patroller'],
    response: `👮 <strong>PNP Polangui Police Station</strong><br><br>
 <strong>Direktang Linya:</strong> (052) 486-0116<br>
 <strong>Emergency:</strong> 911<br>
 <strong>Address:</strong> Poblacion, Polangui, Albay<br><br>
Para sa krimen, pagkawala ng tao, o anumang sitwasyong nangangailangan ng pulis, tumawag agad sa 911.`
  },
  // Fire
  {
    keywords: ['fire', 'sunog', 'bfp', 'fire station', 'firetruck'],
    response: `🚒 <strong>BFP — Bureau of Fire Protection, Polangui</strong><br><br>
 <strong>Fire Station:</strong> (052) 486-0117<br>🚨 <strong>Emergency:</strong> 911<br><br>
 <strong>Kung may sunog:</strong><br>
1. Lumabas agad sa gusali — huwag kumuha ng gamit<br>
2. Tumawag sa 911 o BFP<br>
3. Huwag gumamit ng elevator<br>
4. Mag-rally sa designated meeting point<br>
5. Hintayin ang mga bumbero`
  },
  // Hospital / Medical
  {
    keywords: ['hospital', 'ospital', 'medical', 'doctor', 'ambulance', 'injured', 'sugatan', 'sakit', 'sick'],
    response: ` <strong>Medical Emergency — Polangui</strong><br><br>
<strong>Polangui General Hospital:</strong> (052) 486-0133<br>
 <strong>Emergency/Ambulance:</strong> 911<br><br>
<strong>Para sa medikal na emergency:</strong><br>
1. Tumawag sa 911 para sa ambulance<br>
2. Huwag ilipat ang injured person maliban kung kailangan<br>
3. Mag-apply ng basic first aid kung may alam<br>
4. Ipaalam ang eksaktong lokasyon sa dispatcher`
  },
  // Evacuation Centers
  {
    keywords: ['evacuation', 'evacuation center', 'shelter', 'kanlungan', 'saan', 'likas', 'ligtas na lugar', 'safe place'],
    response: `🏫 <strong>Evacuation Centers — Polangui, Albay</strong><br><br>
 <strong>Primary Evacuation Centers:</strong><br>
 Polangui Central School — Poblacion<br>
 Polangui Municipal Gym — Poblacion<br>
 Agos Elementary School — Agos<br>
 Ason National High School — Ason<br>
 Cotmon Elementary School — Cotmon<br>
 Burabod Elementary School — Burabod<br><br>
 <strong>Panuto:</strong> Pumunta sa pinakamalapit na evacuation center sa inyong barangay.<br><br>
 Para malaman ang status ng evacuation center, tumawag sa <strong>MDRRMO: (052) 486-0160</strong>`
  },
  // Signal levels
  {
    keywords: ['signal', 'signal level', 'signal number', 'anong signal', 'typhoon signal', 'storm signal', 'bagyo'],
    response: ` <strong>PAGASA Typhoon Signal Levels</strong><br><br>
 <strong>Signal #1</strong> — Winds 30–60 kph expected within 36 hours. Mag-monitor ng balita.<br>
<strong>Signal #2</strong> — Winds 61–120 kph expected within 24 hours. Mag-ingat; i-secure ang bahay.<br>
 <strong>Signal #3</strong> — Winds 121–170 kph expected within 18 hours. Mag-evacuate kung kinakailangan.<br>
<strong>Signal #4</strong> — Winds 171–220 kph expected within 12 hours. Emergency na kondisyon.<br>
<strong>Signal #5</strong> — Winds >220 kph. Katastrophikong pinsala. Sumunod sa MDRRMO instructions.<br><br>
 Para sa pinakabagong signal update, pakinggan ang radyo o bisitahin ang <strong>bagong.pagasa.dost.gov.ph</strong><br>
 MDRRMO: (052) 486-0160`
  },
  // Before typhoon
  {
    keywords: ['bago', 'before', 'prepare', 'paghahanda', 'preparation', 'checklist', 'bago dumating', 'before typhoon'],
    response: ` <strong>Paghahanda Bago Dumating ang Bagyo</strong><br><br>
 Mag-imbak ng flashlight at extra batteries<br>
 Mag-ipon ng de-lata at pagkain para 3–7 araw<br>
 Mag-imbak ng malinis na tubig (min. 3 litro/araw/tao)<br>
 I-charge ang cellphone at powerbank<br>
 I-handa ang gamot at first aid kit<br>
 I-check ang Go Bag: ID, documents, pera, gamot<br>
 I-secure ang bubong, pinto, at bintana<br>
 Putulin ang mga sanga ng puno na malapit sa bahay<br>
 I-monitor ang PAGASA updates<br>
 Alamin ang MDRRMO hotline: <strong>(052) 486-0160</strong><br>
 Alamin ang pinakamalapit na evacuation center`
  },
  // During typhoon
  {
    keywords: ['during', 'habang', 'nasa bagyo', 'habang bagyo', 'during typhoon', 'during storm'],
    response: `🌀 <strong>Habang May Bagyo — Dapat Gawin</strong><br><br>
 Manatili sa loob ng bahay — huwag lumabas maliban kung emergency<br>
🪟 Lumayo sa mga bintana at pinto<br>
 Makinig sa radyo para sa updates<br>
 Huwag gumamit ng kandila — gamitin ang flashlight<br>
 I-unplug ang mga electronics<br>
 Huwag tumawid sa baha — kahit mababa<br>
  Kung may emergency: tumawag sa <strong>911</strong> o <strong>MDRRMO (052) 486-0160</strong><br>
 Gamitin ang app na ito para mag-report ng insidente`
  },
  // After typhoon
  {
    keywords: ['after', 'pagkatapos', 'after typhoon', 'recovery', 'tapos na', 'lipas na'],
    response: ` <strong>Pagkatapos ng Bagyo — Dapat Gawin</strong><br><br>
 Mag-ingat sa labasan — maaaring may debris at baha pa<br>
 Huwag hawakan ang fallen power lines — tumawag sa MERALCO: <strong>16211</strong><br>
 I-check ang bahay para sa structural damage bago pumasok<br>
 Huwag uminom ng tubig mula sa gripo hanggang malinis na<br>
 Mag-ingat sa mga ahas at insects na maaaring lumabas pagkatapos ng baha<br>
 I-report ang damage sa MDRRMO o gamitin ang app na ito<br>
 MDRRMO: <strong>(052) 486-0160</strong><br>
 Kumuha ng litrato ng damage para sa report`
  },
  // Flood
  {
    keywords: ['flood', 'baha', 'tubig', 'bumabaha', 'flooded', 'nagbabaha'],
    response: ` <strong>Paano Haharapin ang Baha</strong><br><br>
 <strong>HUWAG</strong> tumawid sa baha — kahit tuhod lang ang lalim<br>
 <strong>HUWAG</strong> mag-drive sa bahang daan<br>
 <strong>HUWAG</strong> lumapit sa ilog o estero<br><br>
 <strong>DAPAT GAWIN:</strong><br>
1. Pumunta sa mas mataas na lugar<br>
2. Dalhin ang Go Bag at mahahalagang gamit<br>
3. I-turn off ang kuryente bago umalis<br>
4. Pumunta sa evacuation center<br>
5. I-report ang baha sa app o tumawag sa MDRRMO<br><br>
MDRRMO: <strong>(052) 486-0160</strong> | Emergency: <strong>911</strong>`
  },
  // How to report / submit report
  {
    keywords: ['report', 'mag-report', 'i-report', 'submit', 'how to report', 'paano mag-report', 'incident'],
    response: `📋 <strong>Paano Mag-submit ng Incident Report</strong><br><br>
1️⃣ I-tap ang <strong> Report button</strong> sa ibaba ng screen<br>
2️⃣ Piliin ang <strong>Uri ng Insidente</strong> (Flood, Wind Damage, atbp.)<br>
3️⃣ Piliin ang inyong <strong>Barangay</strong><br>
4️⃣ Piliin ang <strong>Severity Level</strong><br>
5️⃣ Ilagay ang <strong>Paglalarawan</strong> ng nangyari<br>
6️⃣ Mag-attach ng <strong>Larawan</strong> (optional)<br>
7️⃣ I-tap ang  para idagdag ang lokasyon (optional)<br>
8️⃣ I-tap ang <strong> I-submit ang Report</strong><br><br>
Ang inyong report ay matatanggap ng <strong>MDRRMO Polangui</strong> para sa agarang aksyon.`
  },
  // Missing person
  {
    keywords: ['missing', 'nawawala', 'nawala', 'missing person', 'lost person', 'hinahanap'],
    response: ` <strong>Missing Person — Dapat Gawin</strong><br><br>
1. Mag-report agad sa <strong>PNP Polangui: (052) 486-0116</strong><br>
2. Tumawag sa <strong>911</strong> kung emergency<br>
3. Mag-submit ng <strong>Missing Person report</strong> sa app na ito<br>
4. I-provide ang detalye: pangalan, edad, huling nakitang lugar, damit<br>
5. Mag-share ng photo sa MDRRMO at PNP<br><br>
PNP Polangui: <strong>(052) 486-0116</strong><br>
 MDRRMO: <strong>(052) 486-0160</strong><br>
 Emergency: <strong>911</strong>`
  },
  // Power outage
  {
    keywords: ['power', 'kuryente', 'electricity', 'outage', 'blackout', 'walang kuryente', 'meralco'],
    response: `⚡ <strong>Power Outage — Paano Haharapin</strong><br><br>
 <strong>MERALCO Hotline:</strong> 16211<br>
 <strong>MERALCO Area:</strong> 1-800-10-MERALCO (1-800-10-637-2526)<br><br>
 <strong>Dapat Gawin:</strong><br>
• Gumamit ng flashlight — iwasan ang kandila<br>
• I-unplug ang mga appliances para maiwasan ang power surge<br>
• I-save ang battery ng cellphone<br>
• I-report sa MERALCO ang downed power lines<br><br>
 <strong>HUWAG</strong> lumapit sa fallen power lines — ito ay mapanganib.<br>
Tumawag sa MERALCO o MDRRMO agad kung may downed lines.`
  },
  // About DRES / app
  {
    keywords: ['about', 'ano ito', 'what is', 'dres', 'app', 'system', 'anong app'],
    response: ` <strong>Tungkol sa DRES Polangui</strong><br><br>
Ang <strong>DRES (Disaster Response and Emergency System)</strong> ay isang Web at Mobile-Based na sistema para sa Polangui, Albay.<br><br>
 <strong>Mga Pangunahing Feature:</strong><br>
•  Mag-submit ng incident reports (text, larawan, lokasyon)<br>
•  DRES-Bot para sa disaster guidance<br>
•  Suriin ang status ng inyong mga report<br>
•  Safety tips at preparedness guides<br><br>
Ang sistema ay direktang konektado sa <strong>MDRRMO ng Polangui</strong> para sa mas mabilis na emergency response.<br><br>
 MDRRMO: <strong>(052) 486-0160</strong>`
  },
  // Go bag
  {
    keywords: ['go bag', 'emergency kit', 'survival kit', 'bag', 'dala', 'dalhin'],
    response: ` <strong>Go Bag Checklist</strong><br><br>
 <strong>Mahahalagang Dokumento:</strong><br>
• PhilSys ID / Valid ID (copy)<br>
• Birth Certificate (copy)<br>
• Insurance documents<br><br>
 <strong>Gamot at Kalusugan:</strong><br>
• Maintenance medicines (7 days supply)<br>
• First aid kit<br>
• Face masks at hand sanitizer<br><br>
 <strong>Pagkain at Tubig:</strong><br>
• Ready-to-eat food (3 days)<br>
• Bottled water (1 liter per person)<br><br>
🔦 <strong>Kagamitan:</strong><br>
• Flashlight + extra batteries<br>
• Powerbank (fully charged)<br>
• Extra clothes at blanket<br>
• Cash (small bills)<br>
• Whistle`
  },
  // Greeting
  {
    keywords: ['hello', 'hi', 'kumusta', 'kamusta', 'magandang', 'good morning', 'good afternoon', 'good evening', 'hey'],
    response: `👋 Kumusta! Ako si <strong>DRES-Bot</strong>, ang inyong assistant para sa disaster preparedness sa Polangui, Albay.<br><br>
Maaari akong tumulong sa:<br>
•  Emergency contact numbers<br>
•  Evacuation center locations<br>
•  Typhoon safety guidance<br>
•  Paano mag-submit ng report<br>
•  Go bag checklist<br><br>
<em>Ano ang maaari kitang matulungan ngayon?</em>`
  },
  // Thank you
  {
    keywords: ['thank', 'thanks', 'salamat', 'maraming salamat', 'thank you'],
    response: `😊 Walang anuman! Lagi kaming nandito para tumulong.<br><br>
Kung mayroon kang emergency, huwag kalimutang tumawag sa:<br>
🚨 <strong>911</strong> o <strong>MDRRMO: (052) 486-0160</strong><br><br>
Manatiling ligtas! 🛡️`
  }
];

// ── RULE-BASED CHAT ENGINE ─────────────────────────────────────────────────────
function getRuleBotResponse(msg) {
  const lower = msg.toLowerCase();

  // Check each KB entry for keyword matches
  for (const entry of CHATBOT_KB) {
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return entry.response;
      }
    }
  }

  // Default fallback response
  return `🤔 Paumanhin, hindi ko pa masagot ang tanong na iyon.<br><br>
Maaari akong tumulong sa mga sumusunod — i-tap o i-type ang keyword:<br>
<strong>"emergency numbers"</strong> — mga hotline<br>
<strong>"evacuation center"</strong> — mga lugar ng likas<br>
<strong>"signal level"</strong> — typhoon signal info<br>
 <strong>"bago ang bagyo"</strong> — preparation checklist<br>
 <strong>"mag-report"</strong> — paano mag-submit ng report<br>
 <strong>"go bag"</strong> — emergency kit checklist<br><br>
Para sa direktang tulong:  <strong>MDRRMO: (052) 486-0160</strong> | 🚨 <strong>911</strong>`;
}

// ── INIT ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('greetName').textContent  = USER_NAME;
  document.getElementById('userAvatar').textContent = USER_NAME.charAt(0).toUpperCase();
  loadMyReports();
  initVoice();
});

// ── VOICE INPUT ────────────────────────────────────────────────────────────────
function initVoice() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang           = 'fil-PH';
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      document.getElementById('chatInput').value = e.results[0][0].transcript;
      isRecording = false;
      document.getElementById('voiceBtn').classList.remove('recording');
      sendChat();
    };
    recognition.onerror = () => {
      isRecording = false;
      document.getElementById('voiceBtn').classList.remove('recording');
      showToast('Hindi naintindihan ang boses. Subukan ulit.');
    };
  }
}

function toggleVoice() {
  if (!recognition) { showToast('Voice input not supported. Try Chrome.'); return; }
  if (!isRecording) {
    recognition.start();
    isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
    showToast('🎤 Nakikinig... / Listening...');
  } else {
    recognition.stop();
    isRecording = false;
    document.getElementById('voiceBtn').classList.remove('recording');
  }
}

// ── PAGE NAVIGATION ────────────────────────────────────────────────────────────
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.nav-item, .nav-fab').forEach(b => b.classList.remove('active'));

  const pg = document.getElementById('page-' + page);
  if (pg) {
    pg.style.display = page === 'chat' ? 'flex' : 'block';
    if (page === 'chat') pg.style.height = '100%';
    pg.classList.add('active');
  }

  const nb = document.getElementById('nav-' + page);
  if (nb) nb.classList.add('active');

  if (page === 'myreports') loadMyReports();
}

// ── QUICK CHAT ─────────────────────────────────────────────────────────────────
function quickChat(msg) {
  switchPage('chat');
  setTimeout(() => {
    document.getElementById('chatInput').value = msg;
    sendChat();
  }, 200);
}

// ── CHAT — Rule-Based Engine ───────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg   = input.value.trim();
  if (!msg) return;

  appendMsg(msg, 'user');
  input.value = '';
  showTyping();

  // Simulate a short thinking delay for better UX
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

  const reply = getRuleBotResponse(msg);
  removeTyping();
  appendMsg(reply, 'bot');

  chatHistory.push({ role: 'user', content: msg   });
  chatHistory.push({ role: 'bot',  content: reply });

  // ── Log to admin chatbot logs (after reply is defined) ──────────────────────
  fetch(`${API}/api/admin/chatbot-logs`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user_id: USER_ID, message: msg, response: reply })
  }).catch(() => {}); // silent fail — logging should never break the chat
}

//Situational Awareness Engine
function processInput(userText) {
  const situation = detectSituation(userText);
  const response = getResponse(situation);
  return response;
}

//COMPREHENSION
function detectSituation(text) {
  text = text.toLowerCase();

  let type = "unknown";
  let severity = "low";

  if (text.includes("baha") || text.includes("flood")) {
    type = "flood";
  } else if (text.includes("sunog") || text.includes("fire")) {
    type = "fire";
  } else if (text.includes("bagyo") || text.includes("typhoon")) {
    type = "typhoon";
  }

  // severity detection
  if (text.includes("malalim") || text.includes("mataas") || text.includes("grabe")) {
    severity = "high";
  }

  return { type, severity };
}


// ── CHAT UI HELPERS ────────────────────────────────────────────────────────────
function appendMsg(text, type) {
  const container = document.getElementById('chatMessages');
  const div       = document.createElement('div');
  div.className   = `msg msg-${type}`;
  div.innerHTML   = text
    .replace(/\n/g,            '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,     '<em>$1</em>');
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.id        = 'typingDot';
  div.className = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingDot');
  if (el) el.remove();
}

function getResponse(situation) {
  const { type, severity } = situation;

  if (type === "flood") {
    if (severity === "high") {
      return "⚠️ Mataas ang baha! Lumikas agad sa evacuation center at iwasan ang mababang lugar.";
    }
    return "🌊 May baha. Manatiling alerto at ihanda ang emergency kit.";
  }

  if (type === "fire") {
    return "🔥 May sunog! Lumayo agad sa lugar at tumawag sa BFP (911 o local hotline).";
  }

  if (type === "typhoon") {
    return "🌀 May bagyo. I-secure ang bahay at maghanda ng go bag.";
  }

  return "🤖 Pasensya, hindi ko pa matukoy ang sitwasyon. Pwede mo bang linawin?";
}

// ── EMERGENCY BANNERS ──────────────────────────────────────────────────────────
function showEmergencyBanner() {
  removeExistingBanner();
  const banner      = document.createElement('div');
  banner.id         = 'emergencyBanner';
  banner.className  = 'emergency-banner critical';
  banner.innerHTML  = `
    <div class="eb-pulse"></div>
    <div class="eb-content">
      <div class="eb-title"> EMERGENCY DETECTED</div>
      <div class="eb-sub">Naipadala na ang inyong sitwasyon sa MDRRMO Polangui</div>
      <div class="eb-actions">
        <a href="tel:911"           class="eb-btn eb-btn-red">📞 Call 911</a>
        <a href="tel:+63524860160" class="eb-btn eb-btn-white">📞 MDRRMO</a>
      </div>
    </div>
    <button class="eb-close" onclick="removeExistingBanner()">✕</button>`;
  const msgs = document.getElementById('chatMessages');
  msgs.insertBefore(banner, msgs.firstChild);
  msgs.scrollTop = 0;
}

function showHighAlertBanner() {
  removeExistingBanner();
  const banner     = document.createElement('div');
  banner.id        = 'emergencyBanner';
  banner.className = 'emergency-banner high';
  banner.innerHTML = `
    <div class="eb-content">
      <div class="eb-title"> HIGH RISK SITUATION</div>
      <div class="eb-sub">Report automatically sent to MDRRMO for monitoring</div>
      <div class="eb-actions">
        <a href="tel:+63524860160" class="eb-btn eb-btn-orange">📞 MDRRMO: (052) 486-0160</a>
      </div>
    </div>
    <button class="eb-close" onclick="removeExistingBanner()">✕</button>`;
  const msgs = document.getElementById('chatMessages');
  msgs.insertBefore(banner, msgs.firstChild);
}

function removeExistingBanner() {
  const el = document.getElementById('emergencyBanner');
  if (el) el.remove();
}

// REPORT FORM
function selectType(btn) {
  document.querySelectorAll('#typeGrid .type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedReportType = btn.dataset.type;
}

function selectSeverity(btn) {
  document.querySelectorAll('#sevRow .sev-btn').forEach(b =>
    b.classList.remove('sel-low','sel-moderate','sel-high','sel-critical')
  );
  const map = { low:'sel-low', moderate:'sel-moderate', high:'sel-high', critical:'sel-critical' };
  btn.classList.add(map[btn.dataset.sev]);
  selectedSeverity = btn.dataset.sev;
}

function previewRptImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader  = new FileReader();
  reader.onload = ev => {
    const img         = document.getElementById('imgPreview');
    img.src           = ev.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function getLocation() {
  if (!navigator.geolocation) { showToast('Geolocation not supported.'); return; }
  showToast('📍 Kinukuha ang lokasyon...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('rptLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('rptLng').value = pos.coords.longitude.toFixed(6);
      showToast(' Nakuha na ang lokasyon!');
    },
    () => showToast('Hindi ma-access ang lokasyon. I-allow ang location permission.')
  );
}

async function submitReport() {
  const barangay = document.getElementById('rptBarangay').value;
  const desc     = document.getElementById('rptDesc').value.trim();

  if (!selectedReportType) { showToast(' Piliin ang uri ng insidente.'); return; }
  if (!barangay)            { showToast(' Piliin ang inyong barangay.'); return; }
  if (!desc)                { showToast(' Ilagay ang paglalarawan ng insidente.'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled    = true;
  btn.textContent = ' Isinusumite...';

  const fd = new FormData();
  fd.append('user_id',     USER_ID);
  fd.append('barangay',    barangay);
  fd.append('report_type', selectedReportType);
  fd.append('description', desc);
  if (selectedSeverity) fd.append('severity', selectedSeverity);

  const lat = document.getElementById('rptLat').value;
  const lng = document.getElementById('rptLng').value;
  if (lat) fd.append('latitude',  lat);
  if (lng) fd.append('longitude', lng);

  const imgFile = document.getElementById('rptImage').files[0];
  if (imgFile) fd.append('image', imgFile);

  try {
    const res  = await fetch(`${API}/api/reports/submit`, { method: 'POST', body: fd });
    const data = await res.json();

    if (data.status === 'success') {
      showToast('Na-submit na ang inyong report sa MDRRMO!', 3500);
      resetReportForm();
      setTimeout(() => switchPage('myreports'), 1500);
    } else {
      showToast('❌ Error: ' + (data.detail || 'Subukan ulit.'));
    }
  } catch (err) {
    showToast('❌ Hindi ma-reach ang server. Tingnan ang koneksyon.');
  }

  btn.disabled    = false;
  btn.textContent = '🚨 I-submit ang Report';
}

function resetReportForm() {
  selectedReportType = '';
  selectedSeverity   = '';
  document.querySelectorAll('#typeGrid .type-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('#sevRow .sev-btn').forEach(b =>
    b.classList.remove('sel-low','sel-moderate','sel-high','sel-critical')
  );
  ['rptBarangay','rptDesc','rptLat','rptLng'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('rptImage').value = '';
  const img = document.getElementById('imgPreview');
  img.src           = '';
  img.style.display = 'none';
}

// ── MY REPORTS ─────────────────────────────────────────────────────────────────
async function loadMyReports() {
  try {
    const res  = await fetch(`${API}/api/reports/user/${USER_ID}`);
    const data = await res.json();
    allReports = data.data || [];
  } catch { allReports = []; }
  renderReports(allReports);
  updateHomeSummary();
}

function updateHomeSummary() {
  document.getElementById('home-total').textContent    = allReports.length;
  document.getElementById('home-pending').textContent  = allReports.filter(r => (r.status||'').toLowerCase() === 'pending').length;
  document.getElementById('home-resolved').textContent = allReports.filter(r => (r.status||'').toLowerCase() === 'resolved').length;
}

function filterReports(filter, btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderReports(filter === 'all' ? allReports : allReports.filter(r => (r.status||'').toLowerCase() === filter));
}

const TYPE_ICONS   = { 'Flood':'🌊','Wind Damage':'💨','Missing Person':'🔍','Road Block':'🚧','Power Outage':'⚡','Other':'📝' };
const STATUS_CLASS = { pending:'sp-pending', reviewed:'sp-reviewed', resolved:'sp-resolved' };

function renderReports(reports) {
  const el    = document.getElementById('reportsList');
  const count = document.getElementById('reportCount');
  count.textContent = `${reports.length} report${reports.length !== 1 ? 's' : ''}`;

  if (!reports.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">📋</div><div class="es-title">Walang reports</div><div class="es-sub">Wala kang mga naka-submit na report pa.<br>I-tap ang 🚨 button para mag-report.</div></div>`;
    return;
  }

  el.innerHTML = reports.map(r => {
    const icon    = TYPE_ICONS[r.report_type] || '📝';
    const status  = (r.status || 'pending').toLowerCase();
    const sc      = STATUS_CLASS[status] || 'sp-pending';
    const encoded = encodeURIComponent(JSON.stringify(r));
    return `
      <div class="report-card" onclick="openReportDetail('${encoded}')">
        <div class="report-card-top">
          <div class="rc-type">${icon} ${r.report_type || 'Unknown'}</div>
          <span class="rc-id">${r.id || '—'}</span>
        </div>
        <div class="rc-desc">${r.description || '—'}</div>
        <div class="rc-bottom">
          <span class="rc-meta">📍 ${r.barangay || '—'} · ${formatTime(r.created_at)}</span>
          <span class="status-pill ${sc}">${(r.status||'pending').toUpperCase()}</span>
        </div>
      </div>`;
  }).join('');
}

function formatTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' }); }
  catch { return iso; }
}

// ── REPORT DETAIL MODAL ────────────────────────────────────────────────────────
function openReportDetail(encoded) {
  const r      = JSON.parse(decodeURIComponent(encoded));
  const status = (r.status || 'pending').toLowerCase();
  const sc     = STATUS_CLASS[status] || 'sp-pending';

  document.getElementById('modalTitle').textContent =
    `${TYPE_ICONS[r.report_type] || '📝'} ${r.report_type || 'Report'}`;

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-row"><span class="modal-key">Report ID</span><span class="modal-val">${r.id||'—'}</span></div>
    <div class="modal-row"><span class="modal-key">Status</span><span class="modal-val"><span class="status-pill ${sc}">${(r.status||'pending').toUpperCase()}</span></span></div>
    <div class="modal-row"><span class="modal-key">Barangay</span><span class="modal-val">${r.barangay||'—'}</span></div>
    <div class="modal-row"><span class="modal-key">Severity</span><span class="modal-val">${r.severity||'—'}</span></div>
    <div class="modal-row"><span class="modal-key">Submitted</span><span class="modal-val">${formatTime(r.created_at)}</span></div>
    <div class="modal-row"><span class="modal-key">Description</span><span class="modal-val">${r.description||'—'}</span></div>`;

  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ── TOAST ──────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

      // ── PROFILE PAGE ────────────────────────────────────────────────────────
      function loadProfilePage() {
        const name =
          sessionStorage.getItem("user_name") ||
          localStorage.getItem("prof_name") ||
          "Resident";
        const barangay = localStorage.getItem("prof_barangay") || "—";
        const contact = localStorage.getItem("prof_contact") || "—";
        const email = localStorage.getItem("prof_email") || "—";

        document.getElementById("profileAvatar").textContent = name
          .charAt(0)
          .toUpperCase();
        document.getElementById("profileName").textContent = name;
        document.getElementById("piName").textContent = name;
        document.getElementById("piBarangay").textContent = barangay;
        document.getElementById("piContact").textContent = contact;
        document.getElementById("piEmail").textContent = email;

        // Report stats from allReports
        document.getElementById("prof-total").textContent = allReports.length;
        document.getElementById("prof-pending").textContent = allReports.filter(
          (r) => (r.status || "").toLowerCase() === "pending",
        ).length;
        document.getElementById("prof-resolved").textContent =
          allReports.filter(
            (r) => (r.status || "").toLowerCase() === "resolved",
          ).length;
      }

      function openEditProfile() {
        document.getElementById("editName").value =
          localStorage.getItem("prof_name") || "";
        document.getElementById("editBarangay").value =
          localStorage.getItem("prof_barangay") || "";
        document.getElementById("editContact").value =
          localStorage.getItem("prof_contact") || "";
        document.getElementById("editEmail").value =
          localStorage.getItem("prof_email") || "";
        document.getElementById("editProfileOverlay").classList.add("open");
      }

      function closeEditProfile() {
        document.getElementById("editProfileOverlay").classList.remove("open");
      }

      function saveProfile() {
        const name = document.getElementById("editName").value.trim();
        const barangay = document.getElementById("editBarangay").value;
        const contact = document.getElementById("editContact").value.trim();
        const email = document.getElementById("editEmail").value.trim();

        if (name) {
          localStorage.setItem("prof_name", name);
          sessionStorage.setItem("user_name", name);
        }
        if (barangay) localStorage.setItem("prof_barangay", barangay);
        if (contact) localStorage.setItem("prof_contact", contact);
        if (email) localStorage.setItem("prof_email", email);

        closeEditProfile();
        loadProfilePage();
        showToast("✅ Na-save na ang inyong profile!");
      }

      function handleLogout() {
        if (confirm("Sigurado ka bang gusto mong mag-logout?")) {
          sessionStorage.clear();
          showToast("Nag-logout na. Redirect sa login...");
          setTimeout(() => {
            window.location.href = "index.html";
          }, 1500);
        }
      }

      // Override switchPage to load profile data when opening profile
      const _origSwitchPage = switchPage;
      switchPage = function (page) {
        _origSwitchPage(page);
        if (page === "profile") loadProfilePage();
      };

      // Load profile data on init
      document.addEventListener("DOMContentLoaded", loadProfilePage);