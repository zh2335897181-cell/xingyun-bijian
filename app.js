// --- 粒子系统 & Canvas (Defined First) ---
// --- IndexedDB 核心系统 (最终修复版) ---
// 1. 改了数据库名字 (V3)，强制浏览器创建新库，避开旧库的结构错误
// 2. 依然包含自动迁移功能
const DB_CONFIG = {
    name: 'NebulaQuillDB_V3', // 🔴 改名了！这会强制创建一个全新的数据库
    version: 1,
    storeName: 'novel_data'
};

const idb = {
    open: () => {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
            
            req.onerror = () => {
                console.error("DB Open Error:", req.error);
                reject(req.error);
            };

            req.onsuccess = () => resolve(req.result);

            // 这是创建数据库结构的关键步骤
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                // 如果旧表存在（理论上新库不会有），先删除
                if (db.objectStoreNames.contains(DB_CONFIG.storeName)) {
                    db.deleteObjectStore(DB_CONFIG.storeName);
                }
                // 🔴 关键：创建带主键 'id' 的表
                db.createObjectStore(DB_CONFIG.storeName, { keyPath: 'id' });
            };
        });
    },
    put: async (data) => {
        try {
            const db = await idb.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(DB_CONFIG.storeName, 'readwrite');
                const store = tx.objectStore(DB_CONFIG.storeName);
                
                // 深拷贝数据，防止对象引用问题
                const safeData = JSON.parse(JSON.stringify(data));
                
                // 🔴 确保写入的数据里包含 id: 'main'
                const req = store.put({ ...safeData, id: 'main' });
                
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => {
                    console.error("DB Put Error:", req.error);
                    reject(req.error);
                };
            });
        } catch (err) {
            console.error("IDB Put Exception:", err);
            throw err;
        }
    },
    get: async () => {
        try {
            const db = await idb.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(DB_CONFIG.storeName, 'readonly');
                const store = tx.objectStore(DB_CONFIG.storeName);
                const req = store.get('main');
                
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (err) {
            return null; // 如果出错（比如库不存在），返回 null 触发迁移逻辑
        }
    },
    clear: async () => {
        const db = await idb.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_CONFIG.storeName, 'readwrite');
            const store = tx.objectStore(DB_CONFIG.storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
};

class Particle { 
    constructor(width, height) { 
        this.x = Math.random() * width; 
        this.y = Math.random() * height; 
        this.vx = (Math.random()-0.5)*0.2; 
        this.vy = (Math.random()-0.5)*0.2; 
        this.size = Math.random()*2; 
        this.opacity = Math.random()*0.5; 
        this.fade = Math.random()*0.005; 
    } 
    update(width, height) { 
        this.x+=this.vx; this.y+=this.vy; this.opacity+=this.fade; 
        if(this.opacity>0.8||this.opacity<0.1) this.fade=-this.fade; 
        if(this.x<0)this.x=width; if(this.x>width)this.x=0; 
        if(this.y<0)this.y=height; if(this.y>height)this.y=0; 
    } 
    draw(ctx) { 
        let c='255,255,255'; 
        if(store.theme==='dawn')c='255,215,0'; 
        if(store.theme==='cyber')c='45,212,191'; 
        if(store.theme==='ink')c='60,60,60'; 
        ctx.beginPath(); 
        if(store.theme==='crystal'){ctx.moveTo(this.x,this.y-4);ctx.lineTo(this.x+1,this.y-1);ctx.lineTo(this.x+4,this.y);ctx.lineTo(this.x+1,this.y+1);ctx.lineTo(this.x,this.y+4);ctx.lineTo(this.x-1,this.y+1);ctx.lineTo(this.x-4,this.y);ctx.lineTo(this.x-1,this.y-1);}
        else{ctx.arc(this.x,this.y,this.size,0,Math.PI*2);} 
        ctx.fillStyle=`rgba(${c},${this.opacity})`; ctx.fill(); 
    } 
}

let particles = [];
let canvasWidth, canvasHeight;

function resizeCanvas() { 
    const canvas = document.getElementById('bg-canvas');
    if(!canvas) return;
    canvasWidth = window.innerWidth; 
    canvasHeight = window.innerHeight; 
    canvas.width = canvasWidth; 
    canvas.height = canvasHeight; 
}

function initP() { 
    particles=[]; 
    for(let i=0;i<60;i++) particles.push(new Particle(canvasWidth, canvasHeight)); 
} 

function animP() { 
    const canvas = document.getElementById('bg-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvasWidth,canvasHeight); 
    particles.forEach(p=>{p.update(canvasWidth, canvasHeight);p.draw(ctx);}); 
    requestAnimationFrame(animP); 
}

// --- 核心状态 ---
let store = { 
    defaultWordCount: '2000-3000', // 新增字段，默认值
    apiKey: '', 
    concept: '', 
    lore: '', 
    targetChapters: 100, 
    characters: [], 
    outline: [], 
    currentChapterId: null, 
    chapterTexts: {}, 
    theme: 'crystal', 
    tags: [], 
    // Removed mode from store
    engine: 'none',
    baseUrl: 'https://api.deepseek.com/chat/completions'
};
let saveTimeout;
const NOVEL_TAGS = { "🏆 男频精选": ["玄幻", "都市", "仙侠", "科幻", "悬疑", "奇幻", "历史", "游戏", "体育", "军事", "武侠", "轻小说"], "🌸 女频精选": ["现言", "古言", "幻言", "校园", "青春", "纯爱", "宫斗", "重生", "种田", "豪门", "女强", "快穿"], "⚡ 核心元素": ["系统", "神医", "脑洞", "鉴宝", "恐怖", "推理", "谍战", "末世", "无限流", "赛博朋克", "克苏鲁", "灵气复苏", "诸天万界"], "🎭 主角人设": ["腹黑", "高冷", "病娇", "赘婿", "战神", "神豪", "学霸", "奶爸", "杀伐果断", "智商在线", "反派", "老六"], "🎨 风格基调": ["爽文", "搞笑", "轻松", "热血", "暗黑", "治愈", "甜宠", "虐文", "无敌", "迪化", "群像", "幕后流"] };
const systemAnnouncements = [
    { id: 999, title: "🔑 新手必读：免费获取 DeepSeek API Key", date: "置顶", type: "important", content: `<div class="space-y-2"><p>DeepSeek 注册即送免费额度，无需绑卡！</p><ol class="list-decimal pl-4 space-y-1 opacity-80"><li>访问 <a href="https://platform.deepseek.com/" target="_blank" class="underline font-bold text-accent">DeepSeek 开放平台</a>。</li><li>点击左侧 <b>API Keys</b> 菜单 -> <b>Create API Key</b>。</li><li>复制 <code class="bg-black/20 px-1 rounded border border-white/10">sk-</code> 开头的密钥，粘贴到本网页右上角。</li></ol></div>` },
    { id: 305, title: "v3.7 优化更新", date: "2025-07-02", type: "update", content: "• <b>纯净模式</b>: 移除了长短篇切换，专注于长篇网文连载体验。<br>• <b>性能提升</b>: 优化了编辑器响应速度。" }
];

// --- 初始化 & 生命周期 ---
window.onload = function() {
    // Core
    loadData(); 
    changeTheme(store.theme || 'crystal'); 
    
    // Background
    resizeCanvas(); 
    initP(); 
    animP(); 
    window.addEventListener('resize', resizeCanvas);

    // Clock & Engine
    setInterval(updateClock, 1000); 
    updateClock(); 
    detectEngine();
    
    // UI Render
    renderTagSelector(); 
    renderSelectedTags(); 
    // Removed setMode call
    
    // 协议检查
    const hasAgreed = localStorage.getItem('agreed_to_terms_v1'); 
    if(hasAgreed!=='true') showDisclaimer(false); 
    else checkAndAutoPopAnnouncements();

    // Event Listeners
    document.addEventListener('click', (e) => { 
        const m = document.getElementById('theme-menu'); const b = document.getElementById('theme-btn'); 
        if(m && !m.contains(e.target) && !b.contains(e.target)) m.classList.add('hidden'); 
    });

    const editor = document.getElementById('chapter-editor');
    if(editor) {
        editor.addEventListener('mouseup', handleSelection);
        editor.addEventListener('keyup', handleSelection);
    }
    document.addEventListener('mousedown', (e) => {
        const toolbar = document.getElementById('ai-toolbar');
        if (toolbar && !toolbar.contains(e.target) && e.target !== editor) toolbar.classList.remove('visible');
    });
    
    // Init Base URL Input
    const urlInput = document.getElementById('custom-base-url');
    if(urlInput && store.baseUrl) urlInput.value = store.baseUrl;

    setTimeout(petHappy, 1000);
};

// --- Lore Tab Logic ---
let loreNodes = [];
let loreOffset = { x: 0, y: 0 };
let loreScale = 1; 
let isDraggingLore = false;
let lastLoreMousePos = { x: 0, y: 0 };
let loreViewMode = 'text';
let loreAnimationId = null;
let lastTouchDist = 0;

function setLoreView(mode) {
    loreViewMode = mode;
    const textView = document.getElementById('lore-text-view');
    const graphView = document.getElementById('lore-graph-view');
    const btnText = document.getElementById('btn-lore-text');
    const btnGraph = document.getElementById('btn-lore-graph');

    if(mode === 'text') {
        textView.classList.remove('hidden');
        graphView.classList.add('hidden');
        cancelAnimationFrame(loreAnimationId);
        btnText.className = "px-4 py-1.5 text-xs font-bold rounded-md bg-[var(--panel-bg)] text-accent shadow-sm transition-all";
        btnGraph.className = "px-4 py-1.5 text-xs font-bold rounded-md text-sub hover:text-main transition-all";
    } else {
        textView.classList.add('hidden');
        graphView.classList.remove('hidden');
        btnGraph.className = "px-4 py-1.5 text-xs font-bold rounded-md bg-[var(--panel-bg)] text-accent shadow-sm transition-all";
        btnText.className = "px-4 py-1.5 text-xs font-bold rounded-md text-sub hover:text-main transition-all";
        setTimeout(() => { parseLoreToGraph(); animateLoreGraph(); }, 50); 
    }
}

// ✅ 添加以下两个函数：

function toggleRefreshModal() {
    document.getElementById('refresh-modal').classList.toggle('hidden');
}

async function performRefresh() { 
    // 1. 清空 IndexedDB
    try { await idb.clear(); } catch(e) {}

    // 2. 清空 LocalStorage
    localStorage.clear(); 
    
    // 3. 刷新 (彻底恢复出厂设置)
    location.reload(); 
}

function parseLoreToGraph() {
    const text = document.getElementById('novel-lore').value;
    const lines = text.split('\n');
    const canvas = document.getElementById('lore-canvas');
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    loreOffset = { x: canvas.width / 2, y: canvas.height / 2 }; 
    loreScale = 1;
    loreNodes = [];
    let currentParentIndex = -1;

    lines.forEach((line) => {
        line = line.trim();
        if(!line) return;
        
        // 过滤说明文字
        if(line.includes('名称：描述') || line.includes('例如：') || line.includes('格式提示')) return;

        // 识别父节点: 【】 或 #
        if((line.startsWith('【') && line.endsWith('】')) || line.startsWith('#')) {
            const label = line.replace(/[【】#]/g, '').trim();
            loreNodes.push({ label, type: 'category', x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50, vx:0, vy:0, radius: 40, color: '#c084fc', connections: [] });
            currentParentIndex = loreNodes.length - 1;
        } else if (currentParentIndex !== -1) {
            let label = line;
            let desc = "";
            
            // 分割冒号
            if(line.match(/[:：]/)) {
                const parts = line.split(/[:：]/);
                label = parts[0];
                desc = parts.slice(1).join(':');
            }
            
            // 强力清洗前缀符号 (1. - * > 等)
            label = label.replace(/^[\s\d\.\-\*\>\•\+]+/g, '').trim();

            if(label.length > 0) {
                const parent = loreNodes[currentParentIndex];
                loreNodes.push({ label, desc, type: 'item', x: parent.x+(Math.random()-0.5)*20, y: parent.y+(Math.random()-0.5)*20, vx:0, vy:0, radius: 25, color: '#818cf8', parentId: currentParentIndex });
                parent.connections.push(loreNodes.length - 1);
            }
        }
    });
    if(loreNodes.length === 0) loreNodes.push({ label: "无数据", type: 'category', x: 0, y: 0, vx:0, vy:0, radius: 60, color: '#94a3b8', connections: [] });
}

function updateLorePhysics() {
    const repulsion = 15000; const springLength = 180; const k = 0.04; const maxVel = 10;
    for(let i=0; i<loreNodes.length; i++) {
        let nodeA = loreNodes[i];
        for(let j=i+1; j<loreNodes.length; j++) {
            let nodeB = loreNodes[j];
            let dx = nodeA.x - nodeB.x; let dy = nodeA.y - nodeB.y;
            let distSq = dx*dx + dy*dy || 1; let dist = Math.sqrt(distSq);
            if(dist < 800) {
                let f = repulsion / distSq; let fx = (dx / dist) * f; let fy = (dy / dist) * f;
                nodeA.vx += fx; nodeA.vy += fy; nodeB.vx -= fx; nodeB.vy -= fy;
            }
        }
        if(nodeA.parentId !== undefined) {
            let parent = loreNodes[nodeA.parentId];
            let dx = nodeA.x - parent.x; let dy = nodeA.y - parent.y;
            let dist = Math.sqrt(dx*dx + dy*dy) || 1;
            let f = (dist - springLength) * k; let fx = (dx / dist) * f; let fy = (dy / dist) * f;
            nodeA.vx -= fx; nodeA.vy -= fy; parent.vx += fx; parent.vy += fy;
        }
        nodeA.vx -= nodeA.x * 0.002; nodeA.vy -= nodeA.y * 0.002;
    }
    loreNodes.forEach(node => {
        node.vx = Math.max(-maxVel, Math.min(maxVel, node.vx));
        node.vy = Math.max(-maxVel, Math.min(maxVel, node.vy));
        node.x += node.vx; node.y += node.vy; node.vx *= 0.9; node.vy *= 0.9;
    });
}

function animateLoreGraph() {
    if(loreViewMode !== 'graph') return;
    updateLorePhysics();
    drawLoreGraph();
    loreAnimationId = requestAnimationFrame(animateLoreGraph);
}

function drawLoreGraph() {
    const canvas = document.getElementById('lore-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(loreOffset.x, loreOffset.y);
    ctx.scale(loreScale, loreScale);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2 / loreScale;
    loreNodes.forEach((node) => { if(node.parentId !== undefined) { const parent = loreNodes[node.parentId]; ctx.beginPath(); ctx.moveTo(parent.x, parent.y); ctx.lineTo(node.x, node.y); ctx.stroke(); } });
    loreNodes.forEach(node => {
        ctx.shadowBlur = 20; ctx.shadowColor = node.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { ctx.lineTo(node.x + node.radius * Math.cos(i * Math.PI / 3), node.y + node.radius * Math.sin(i * Math.PI / 3)); }
        ctx.closePath(); ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.fill(); ctx.strokeStyle = node.color; ctx.lineWidth = 2 / loreScale; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        const fontSize = (node.type === 'category' ? 14 : 10) / (loreScale > 1 ? 1 : loreScale * 0.8);
        ctx.font = `bold ${Math.max(8, fontSize)}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(node.label, node.x, node.y);
    });
    ctx.restore();
}

// --- Interaction Handlers ---
const loreCanvas = document.getElementById('lore-canvas');
function getPointerPos(e) {
    const rect = loreCanvas.getBoundingClientRect();
    let cx = e.touches ? e.touches[0].clientX : e.clientX;
    let cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
}
function handleStart(e) {
    if(e.type === 'touchstart' && e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); return; }
    isDraggingLore = true; lastLoreMousePos = getPointerPos(e); loreCanvas.style.cursor = 'grabbing';
}
function handleMove(e) {
    e.preventDefault();
    if(e.type === 'touchmove' && e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if(lastTouchDist > 0) { const zoom = Math.exp((dist - lastTouchDist) * 0.01); loreScale = Math.min(Math.max(0.1, loreScale * zoom), 5); }
        lastTouchDist = dist; return;
    }
    if(isDraggingLore) { const pos = getPointerPos(e); loreOffset.x += pos.x - lastLoreMousePos.x; loreOffset.y += pos.y - lastLoreMousePos.y; lastLoreMousePos = pos; }
}
function handleWheel(e) { e.preventDefault(); const zoom = Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1); const rect = loreCanvas.getBoundingClientRect(); const mx = e.clientX - rect.left; const my = e.clientY - rect.top; const wx = (mx - loreOffset.x) / loreScale; const wy = (my - loreOffset.y) / loreScale; loreScale = Math.min(Math.max(0.1, loreScale * zoom), 5); loreOffset.x = mx - wx * loreScale; loreOffset.y = my - wy * loreScale; }

if(loreCanvas) {
    loreCanvas.addEventListener('mousedown', handleStart); loreCanvas.addEventListener('touchstart', handleStart, {passive: false});
    window.addEventListener('mouseup', () => { isDraggingLore = false; loreCanvas.style.cursor = 'grab'; }); window.addEventListener('touchend', () => isDraggingGraph = false);
    loreCanvas.addEventListener('mousemove', handleMove); loreCanvas.addEventListener('touchmove', handleMove, {passive: false});
    loreCanvas.addEventListener('wheel', handleWheel);
    loreCanvas.addEventListener('dblclick', () => { loreOffset = { x: loreCanvas.width / 2, y: loreCanvas.height / 2 }; loreScale = 1; });
}

// --- Data Logic ---
function updateBaseUrl() {
    const input = document.getElementById('custom-base-url');
    if(input) {
        store.baseUrl = input.value.trim() || 'https://api.deepseek.com/chat/completions';
        saveData();
        showToast("Base URL 已更新", "success");
    }
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store));
    const a = document.createElement('a'); a.href = dataStr; a.download = "nebula_quill_backup_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); a.remove(); showToast("备份已下载", "success");
}
function importData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try { const data = JSON.parse(e.target.result); if(data.characters && data.outline) { store = {...store, ...data}; saveData(); location.reload(); } else { showToast("文件格式不正确", "error"); } } catch(err) { showToast("导入失败: " + err.message, "error"); }
    }; reader.readAsText(file);
}
function handleSelection(e) {
    const editor = document.getElementById('chapter-editor'); const toolbar = document.getElementById('ai-toolbar');
    const start = editor.selectionStart; const end = editor.selectionEnd;
    if (start !== end) {
        currentSelectionRange = { start, end, text: editor.value.substring(start, end) };
        if(e.type === 'mouseup') { toolbar.style.left = `${Math.min(e.clientX - 50, window.innerWidth - 250)}px`; toolbar.style.top = `${Math.max(e.clientY - 60, 20)}px`; toolbar.classList.add('visible'); }
    } else { toolbar.classList.remove('visible'); }
}
async function aiAssist(type) {
    if(!currentSelectionRange) return;
    const toolbar = document.getElementById('ai-toolbar'); toolbar.classList.remove('visible');
    let prompt = ""; if(type === 'polish') prompt = "请润色以下段落，使其文笔更优美："; if(type === 'expand') prompt = "请扩写以下段落，增加细节："; if(type === 'shorten') prompt = "请精简以下段落："; if(type === 'synonym') prompt = "请重写以下句子：";
    showToast("AI 正在施法...", "info");
    try { const res = await callAI([{role: "system", content: "你是一个专业的文学编辑。直接返回修改后的文本。"}, {role: "user", content: `${prompt}\n\n"${currentSelectionRange.text}"`}]); const editor = document.getElementById('chapter-editor'); editor.setRangeText(res, currentSelectionRange.start, currentSelectionRange.end, 'select'); showToast("修改完成", "success"); updateWordCount(); saveData(); } catch(e) { showToast("辅助失败: " + e.message, "error"); }
}
function toggleZenMode() { document.body.classList.toggle('zen-mode'); if(document.body.classList.contains('zen-mode')) showToast("已进入禅模式", "info"); }

// --- 毒舌审稿 UI 逻辑 (New) ---
function toggleCritiqueModal() { document.getElementById('critique-modal').classList.toggle('hidden'); }
function copyCritique() { const text = document.getElementById('critique-content').innerText; navigator.clipboard.writeText(text); showToast("复制成功，请含泪修改", "success"); }

async function aiCritique() {
    const content = document.getElementById('chapter-editor').value; 
    if(content.length < 200) return showToast("字数太少，AI 懒得喷", "info");
    
    showToast("毒舌编辑正在磨刀...", "info");
    
    // 1. 先显示弹窗，并清空内容
    const critiqueBox = document.getElementById('critique-content');
    critiqueBox.innerHTML = '<span class="animate-pulse">正在阅读...</span>';
    document.getElementById('critique-modal').classList.remove('hidden');
    
    let fullResponse = "";

    try { 
        const prompt = `你是一个非常严格、毒舌的资深网文主编。请对以下正文进行犀利点评。
        请按以下格式返回（不要Markdown代码块）：
        【综合评分】：X/10
        【毒点扫描】：(列出逻辑漏洞、人设崩塌等)
        【节奏分析】：(剧情是否拖沓)
        【修改建议】：(给出一针见血的建议)
        
        正文内容：
        ${content.slice(-2000)}`;

        // 2. 调用 callAI 时传入 onChunk 回调
        await callAI([{role: 'user', content: prompt}], (chunk) => {
            fullResponse += chunk;
            // 实时高亮格式化
            let formatted = fullResponse.replace(/【(.*?)】/g, '<span class="critique-highlight">【$1】</span>');
            critiqueBox.innerHTML = formatted;
            
            // 自动滚动到底部
            const container = critiqueBox.parentElement;
            container.scrollTop = container.scrollHeight;
        }); 
        
    } catch(e) { 
        showToast("审稿失败: " + e.message, "error");
        critiqueBox.innerHTML += `\n\n[出错]: ${e.message}`;
    }
}

// --- Character Graph Logic ---
let graphNodes = []; let graphOffset = { x: 0, y: 0 }; let isDraggingGraph = false; let lastMousePos = { x: 0, y: 0 };
function initGraph() {
    const canvas = document.getElementById('graph-canvas'); if(!canvas) return;
    const parent = canvas.parentElement; canvas.width = parent.clientWidth; canvas.height = parent.clientHeight;
    const chars = store.characters.length > 0 ? store.characters : [{name: "主角", role: "核心"}, {name: "反派", role: "对立"}];
    graphNodes = chars.map((c, i) => { const angle = (i/chars.length)*Math.PI*2; return { name: c.name, role: c.role, x: canvas.width/2+Math.cos(angle)*150, y: canvas.height/2+Math.sin(angle)*150, color: i===0?'#f43f5e':'#818cf8' }; });
    drawGraph();
}
function drawGraph() {
    const canvas = document.getElementById('graph-canvas'); if(!canvas) return; const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(graphOffset.x, graphOffset.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    for(let i=0;i<graphNodes.length;i++) for(let j=i+1;j<graphNodes.length;j++) { ctx.beginPath(); ctx.moveTo(graphNodes[i].x, graphNodes[i].y); ctx.lineTo(graphNodes[j].x, graphNodes[j].y); ctx.stroke(); }
    graphNodes.forEach(n => { const g = ctx.createRadialGradient(n.x,n.y,5,n.x,n.y,25); g.addColorStop(0,n.color); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x,n.y,25,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='12px Inter'; ctx.textAlign='center'; ctx.fillText(n.name,n.x,n.y+20); });
    ctx.restore();
}
const graphCanvas = document.getElementById('graph-canvas');
if(graphCanvas) {
    graphCanvas.addEventListener('mousedown', e => { isDraggingGraph=true; const r=graphCanvas.getBoundingClientRect(); lastMousePos={x:e.clientX-r.left,y:e.clientY-r.top}; });
    graphCanvas.addEventListener('mousemove', e => { if(isDraggingGraph){ const r=graphCanvas.getBoundingClientRect(); const cx=e.clientX-r.left; const cy=e.clientY-r.top; graphOffset.x+=cx-lastMousePos.x; graphOffset.y+=cy-lastMousePos.y; lastMousePos={x:cx,y:cy}; drawGraph(); } });
    graphCanvas.addEventListener('mouseup', () => isDraggingGraph=false);
}

// --- Common Helpers ---
// Removed setMode function
function renderTagSelector() { const c = document.getElementById('tag-list-container'); if(c) { let h=''; for(const [k,v] of Object.entries(NOVEL_TAGS)) { h+=`<div class="mb-5"><h4 class="text-xs font-bold text-sub mb-3 opacity-80 border-b border-[var(--panel-border)] pb-1">${k}</h4><div class="flex flex-wrap gap-2">${v.map(t=>`<div onclick="toggleTag('${t}')" class="tag-selectable ${store.tags.includes(t)?'selected':''}">${t}</div>`).join('')}</div></div>`; } c.innerHTML=h; } }
function toggleTag(t) { if(store.tags.includes(t)) store.tags=store.tags.filter(x=>x!==t); else store.tags.push(t); renderTagSelector(); renderSelectedTags(); saveData(); }
function renderSelectedTags() { const c = document.getElementById('selected-tags-container'); if(c) c.innerHTML = store.tags.map(t=>`<span class="novel-tag">${t} <span onclick="toggleTag('${t}');event.stopPropagation()" class="tag-remove">×</span></span>`).join(''); }
function toggleTagSelector() { document.getElementById('tag-selector-modal').classList.toggle('hidden'); if(!document.getElementById('tag-selector-modal').classList.contains('hidden')) renderTagSelector(); }
function addCustomTag() { const i=document.getElementById('custom-tag-input'); const v=i.value.trim(); if(v&&!store.tags.includes(v)){ store.tags.push(v); i.value=''; renderTagSelector(); renderSelectedTags(); saveData(); } }
function updateClock() { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }
function debounceSave() { const s=document.getElementById('save-status'); if(s) { s.innerText="Writing..."; clearTimeout(saveTimeout); saveTimeout=setTimeout(saveData, 1000); } petHappy(); }
function toggleThemeMenu() { const m=document.getElementById('theme-menu'); m.classList.toggle('hidden'); if(!m.classList.contains('hidden')) m.classList.add('dropdown-enter'); }
function changeTheme(n) { document.documentElement.setAttribute('data-theme', n); store.theme=n; saveData(); document.getElementById('theme-menu').classList.add('hidden'); }
function switchTab(id) { ['tab-prompt','tab-lore','tab-graph'].forEach(t=>document.getElementById(t).classList.add('hidden')); ['btn-tab-prompt','btn-tab-lore','btn-tab-graph'].forEach(b=>document.getElementById(b).className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 opacity-60 hover:opacity-100 hover:bg-[var(--panel-bg)]"); document.getElementById(id).classList.remove('hidden'); document.getElementById('btn-'+id).className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 shadow-md bg-[var(--panel-bg)] text-accent"; if(id==='tab-graph') initGraph(); }
function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }
function showToast(m, t='info') { Toastify({ text: m, duration: 3000, gravity: "top", position: "center", style: { background: t==='success'?"#10b981":"#f43f5e" }, className: "rounded-lg shadow-lg font-bold text-sm" }).showToast(); }


// --- 修改后的保存逻辑 (支持 IndexedDB) ---
async function saveData() {
    // 1. 获取当前 UI 状态更新到 store
    const apiKeyInput = document.getElementById('api-key');
    if (apiKeyInput) store.apiKey = apiKeyInput.value;
    
    const promptInput = document.getElementById('novel-prompt');
    if (promptInput) store.concept = promptInput.value;
    
    const loreInput = document.getElementById('novel-lore');
    if (loreInput) store.lore = loreInput.value;
    
    const targetInput = document.getElementById('target-total-chapters');
    if (targetInput) store.targetChapters = targetInput.value;

    // 2. 异步写入 IndexedDB
    try {
        await idb.put(store);
        
        // 3. UI 反馈
        const s = document.getElementById('save-status');
        if (s) {
            s.innerText = "● Saved " + new Date().toLocaleTimeString();
            s.style.color = "var(--accent-primary)"; // 修正了颜色变量引用
            s.style.opacity = "1";
        }
    } catch (e) {
        console.error("Save Failed:", e);
        const s = document.getElementById('save-status');
        if (s) {
            s.innerText = "⚠️ Save Failed!";
            s.style.color = "#f43f5e";
        }
    }
}

// --- 修改后的加载逻辑 (含自动迁移) ---
async function loadData() {
    try {
        // 1. 尝试从 IndexedDB 读取
        let data = await idb.get();
        let migrated = false;

        // 2. 如果 DB 为空，检查旧版 LocalStorage (数据迁移)
        if (!data) {
            const localRaw = localStorage.getItem('deepseek_novel_data_v2') || localStorage.getItem('deepseek_novel_data_v1');
            if (localRaw) {
                console.log("检测到旧版数据，正在迁移至 IndexedDB...");
                try {
                    data = JSON.parse(localRaw);
                    migrated = true;
                } catch (e) {
                    console.error("旧数据解析失败", e);
                }
            }
        }

        // 3. 合并数据到 store
        if (data) {
            // 剔除 id 字段 (因为 IndexedDB 会多存一个 keyPath id)
            const { id, ...rest } = data;
            store = { ...store, ...rest };
            
            // 4. 数据补全与兼容
            if (!store.tags) store.tags = [];
            if (!store.baseUrl) store.baseUrl = 'https://api.deepseek.com/chat/completions';
            if (!store.characters) store.characters = [];
            if (!store.outline) store.outline = [];

            // 5. 恢复 UI 显示
            const elKey = document.getElementById('api-key');
            if (elKey) elKey.value = store.apiKey || '';
            
            const elPrompt = document.getElementById('novel-prompt');
            if (elPrompt) elPrompt.value = store.concept || '';
            
            const elLore = document.getElementById('novel-lore');
            if (elLore) elLore.value = store.lore || '';
            
            const elTarget = document.getElementById('target-total-chapters');
            if (elTarget) elTarget.value = store.targetChapters || 100;
            
            const elBaseUrl = document.getElementById('custom-base-url');
            if (elBaseUrl) elBaseUrl.value = store.baseUrl;

            // 恢复各模块视图
            if (store.characters.length) renderCharacters();
            if (store.outline.length) {
                renderOutline();
                document.getElementById('section-outline').classList.remove('hidden');
                // 恢复最后编辑的章节
                if (store.currentChapterId) {
                    // 稍微延迟以确保 DOM 准备好
                    setTimeout(() => {
                        activateLoom();
                        selectChapter(store.currentChapterId);
                    }, 100);
                }
            }
            renderSelectedTags();
            detectEngine();
            changeTheme(store.theme || 'crystal');

            // 6. 如果发生了迁移，保存到 DB 并清空 LocalStorage (释放空间)
            if (migrated) {
                await saveData(); // 存入 DB
                localStorage.removeItem('deepseek_novel_data_v2'); // 移除旧数据
                localStorage.removeItem('deepseek_novel_data_v1');
                showToast("🎉 数据已升级至高性能存储库！", "success");
            }
        }
    } catch (e) {
        console.error("Load Failed:", e);
        showToast("数据加载出错: " + e.message, "error");
    }
}function clearAllData() { toggleResetModal(); }
function toggleResetModal() { document.getElementById('reset-modal').classList.toggle('hidden'); }


async function performReset() { 
    // 获取当前的 API Key
    const currentKey = store.apiKey || document.getElementById('api-key').value;
    
    // 1. 清空 IndexedDB
    try { await idb.clear(); } catch(e) {}
    
    // 2. 清空 LocalStorage
    localStorage.clear(); 
    
    // 3. 保留 Key (存回 DB)
    if(currentKey) {
        // 重置 store 为初始状态，仅保留 key
        const freshStore = {
            apiKey: currentKey,
            concept: '', lore: '', targetChapters: 100,
            characters: [], outline: [], currentChapterId: null, chapterTexts: {},
            tags: [], theme: 'crystal', engine: 'none',
            baseUrl: 'https://api.deepseek.com/chat/completions'
        };
        await idb.put(freshStore);
    }
    
    location.reload(); 
}

// 2. 添加快捷键监听 (建议放在 window.onload 内部或文件末尾)
document.addEventListener('keydown', (e) => {
    // 检测 Ctrl + Z (Mac下是 Command + Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        // 关键判断：如果用户正在输入框(Input/Textarea)里打字，Ctrl+Z 应该是“撤销文字”，不应该弹出重置
        const tag = e.target.tagName.toUpperCase();
        const isEditable = e.target.isContentEditable;
        
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !isEditable) {
            e.preventDefault(); // 阻止浏览器默认行为
            toggleResetModal(); // 呼出重置确认窗
        }
    }
});

// --- 修改结束 ---
function downloadNovel() { if(!store.outline.length) return showToast("无内容", "error"); let c=`《${store.concept.substring(0,10)}》\n${store.concept}\n${store.lore}\n\n`; store.outline.forEach(ch=>c+=`${ch.title}\n${store.chapterTexts[ch.id]||''}\n\n`); const b=new Blob([c],{type:"text/plain"}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download="小说.txt"; a.click(); }

// --- Engine Detection ---
function detectEngine() { 
    const k=document.getElementById('api-key').value.trim(); 
    const d=document.getElementById('engine-dot'); 
    const n=document.getElementById('engine-name'); 
    if(!d||!n) return; 
    
    // Only Check for DeepSeek
    if(k.startsWith('sk-')){
        store.engine='deepseek';
        d.className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]";
        n.innerText="DeepSeek";
        n.className="text-blue-300 font-bold";
    } else {
        store.engine='none';
        d.className="w-2 h-2 rounded-full bg-gray-500";
        n.innerText="No Key";
        n.className="opacity-50";
    } 
    debounceSave(); 
}

function cleanJson(text) {
    console.log("AI Raw Response:", text); // 方便调试

    let content = text;
    // 1. 尝试移除 Markdown 标记 (保留原有逻辑)
    const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (m) content = m[1];

    // 2. 智能提取最外层的 JSON 结构 (保留原有逻辑，稍微增强)
    const firstOpenBracket = content.indexOf('[');
    const firstOpenBrace = content.indexOf('{');
    
    let start = -1;
    let end = -1;

    // 判断是数组还是对象
    if (firstOpenBracket !== -1 && (firstOpenBrace === -1 || firstOpenBracket < firstOpenBrace)) {
        start = firstOpenBracket;
        end = content.lastIndexOf(']');
    } else if (firstOpenBrace !== -1) {
        start = firstOpenBrace;
        end = content.lastIndexOf('}');
    }

    if (start !== -1 && end !== -1 && end > start) {
        content = content.substring(start, end + 1);
    }

    // 3. 尝试解析与修复
    try {
        return JSON.parse(content);
    } catch (e) {
        console.warn("初次解析失败，尝试智能修复 JSON...", e);
        
        let fixed = content;

        // 【修复策略 1】补全对象之间丢失的逗号
        // 情况：...} { "title"...  -> ...}, { "title"...
        fixed = fixed.replace(/}\s*{/g, '},{');
        
        // 【修复策略 2】补全丢失的闭合括号 (针对你遇到的报错)
        // 情况：..."内容..." { "title"... -> ..."内容..."}, { "title"...
        // 原理：如果双引号后直接跟了左大括号，说明上一个对象没闭合
        fixed = fixed.replace(/\"\s*\n?\s*\{/g, '"},{');

        // 【修复策略 3】移除数组末尾多余的逗号
        // 情况：...}, ] -> ...} ]
        fixed = fixed.replace(/,\s*]/g, ']');

        try {
            console.log("修复后的 JSON:", fixed);
            return JSON.parse(fixed);
        } catch (e2) {
            console.error("修复后解析仍失败:", e2);
            throw new Error("AI 生成数据格式严重错误，请点击重试 (Parse Error)");
        }
    }
}
// --- 修改结束 ---
// --- AI Call Logic (DeepSeek) ---
async function callAI(msgs, onChunk) {
    let key = document.getElementById('api-key').value.trim().replace(/[\u4e00-\u9fa5]/g,''); if (!key) throw new Error("请输入 API Key");
    const baseUrl = store.baseUrl || "https://api.deepseek.com/chat/completions";
    let attempt = 0;
    while(attempt <= 2) {
        try {
            // Only DeepSeek Logic
            const r = await fetch(baseUrl, { 
                method: "POST", 
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, 
                body: JSON.stringify({ model: "deepseek-chat", messages: msgs, temperature: 1.3, max_tokens: 4000, stream: !!onChunk }) 
            });
            
            if (!r.ok) throw new Error("DeepSeek API Error (请检查 Base URL)");
            
            if(onChunk) { 
                const reader = r.body.getReader(); 
                const decoder = new TextDecoder("utf-8"); 
                let result = ""; 
                while (true) { 
                    const { done, value } = await reader.read(); 
                    if (done) break; 
                    const chunk = decoder.decode(value, { stream: true }); 
                    const lines = chunk.split('\n'); 
                    for (const line of lines) { 
                        if (line.startsWith('data: ')) { 
                            const jsonStr = line.slice(6); 
                            if (jsonStr === '[DONE]') break; 
                            try { 
                                const json = JSON.parse(jsonStr); 
                                const content = json.choices[0].delta.content || ""; 
                                result += content; 
                                onChunk(content); 
                            } catch (e) {} 
                        } 
                    } 
                } 
                return result; 
            } else { 
                const d = await r.json(); 
                return d.choices[0].message.content; 
            }

        } catch(e) { 
            attempt++; 
            if(attempt > 2) throw new Error(`API 错误: ${e.message}。请检查 API Key 或网络。`); 
            await new Promise(r => setTimeout(r, 1000 * attempt)); 
        }
    }
}

async function generateInitialAnalysis() { 
    const p=document.getElementById('novel-prompt').value; if(!p) return showToast("输入梗概", "error"); 
    const btn=document.querySelector('button[onclick="generateInitialAnalysis()"]'); btn.innerText="⏳"; btn.disabled=true; 
    
    // Fix: Add safe check for store.tags
    const t=(store.tags && store.tags.length>0)?`类型标签:${store.tags.join(', ')}。`:""; 
    // Fixed mode to long novel
    const m="长篇连载模式"; 
    try { 
        const r=await callAI([{role:"system",content:`${m} 生成角色JSON:[{"name":"","role":"","tags":[],"desc":""}] NO MARKDOWN, RAW JSON ONLY.`},{role:"user",content:`${t} 设定:${p}`}]); 
        
        // Fix: Sanitize AI data to ensure tags is always an array
        const rawData = cleanJson(r);
        const safeData = Array.isArray(rawData) ? rawData.map(c => ({...c, tags: Array.isArray(c.tags)?c.tags:[]})) : [];
        
        store.characters=[...store.characters, ...safeData]; 
        renderCharacters(); 
        document.getElementById('section-outline').classList.remove('hidden'); 
        saveData(); 
    } catch(e){showToast(e.message,"error")} finally{btn.innerText="🧠 构思"; btn.disabled=false;} 
}
// --- 新增：AI 单独捏人功能 ---
// --- 修改开始：AI 捏人逻辑优化 ---// --- 新增：AI 单独捏人功能 ---
async function aiGenerateCharacter(btn) {
    const p = document.getElementById('novel-prompt').value;
    if (!p) return showToast("请先输入核心梗概", "error");

    // UI 交互：锁定按钮
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ 构思中...";
    btn.disabled = true;

    try {
        // 获取当前已有角色的名字，避免 AI 生成重复角色
        const existingNames = store.characters.map(c => c.name).join('、');
        const context = existingNames ? `(已知角色: ${existingNames})` : "";
        const tags = store.tags.length > 0 ? `风格标签:${store.tags.join(',')}` : "";

        // 构造 Prompt
        const prompt = `基于核心梗概: "${p}"。${tags}。
        当前已有角色: ${context}。
        请构思 1 个新的关键角色，该角色需要能推动剧情发展或与现有角色产生冲突/羁绊。
        
        必须返回纯 JSON 对象 (NO MARKDOWN)，格式如下:
        {"name": "姓名", "role": "定位(如:反派/死党)", "tags": ["标签1", "标签2"], "desc": "简短人设描述"}`;

        // 调用 AI
        const res = await callAI([
            { role: "system", content: "你是一个专业的网文人设策划。只返回 RAW JSON。" },
            { role: "user", content: prompt }
        ]);

        // 数据清洗与容错
        let newChar = cleanJson(res);
        
        // 如果 AI 返回的是数组（有时候它会这么做），取第一个；如果是对象，直接用
        if (Array.isArray(newChar)) newChar = newChar[0];

        // 强制补全 tags 防止报错
        if (!Array.isArray(newChar.tags)) newChar.tags = [];
        if (!newChar.name) throw new Error("AI 生成格式异常");

        // 存入数据并刷新界面
        store.characters.push(newChar);
        renderCharacters();
        saveData();
        initGraph(); // 刷新关系图
        
        showToast(`角色【${newChar.name}】已生成`, "success");

    } catch (e) {
        console.error(e);
        showToast("捏人失败: " + e.message, "error");
    } finally {
        // 恢复按钮
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
// --- 修改结束 ---
async function generateMoreOutline() { 
    const c=store.outline.length; const t=parseInt(document.getElementById('target-total-chapters').value); 
    if(c>=t) return showToast("已达目标","info"); 
    const btn=document.getElementById('btn-add-outline'); const s=document.getElementById('outline-spinner'); 
    btn.disabled=true; btn.querySelector('span').innerText="推演中..."; s.classList.remove('hidden'); 
    
    // Fix: Add safe check for store.tags
    const ts=(store.tags && store.tags.length>0)?`风格标签：${store.tags.join(', ')}`:""; 
    
    try { 
        const l=c>0?JSON.stringify(store.outline.slice(-5)):"无"; 
        const p=`我是大纲策划。核心：${store.concept}。世界观：${store.lore}。${ts}。角色：${JSON.stringify(store.characters.map(x=>x.name))}。生成第${c+1}到${Math.min(c+10,t)}章大纲。紧接：${l}。格式：[{"title":"标题","desc":"剧情"}]。IMPORTANT: RETURN RAW JSON ARRAY ONLY. NO MARKDOWN.`; 
        const r=await callAI([{role:"system",content:p},{role:"user",content:"生成"}]); 
        cleanJson(r).forEach((x,i)=>store.outline.push({id:c+i+1, title:x.title, desc:x.desc})); renderOutline(); saveData(); showToast(`成功延展`, "success"); 
    } catch(e){ showToast(e.message,"error"); } finally{ btn.disabled=false; btn.querySelector('span').innerText="+ 延展剧情"; s.classList.add('hidden'); } 
}

function insertLoreTemplate(type) { const t={'等级体系':'\n【力量等级】\n1. 凡境：练气、筑基\n2. 灵境：元婴、化神','地理环境':'\n【世界地图】\n东域：修仙宗门\n西漠：魔修','势力组织':'\n【主要势力】\n天道宗：正道\n血煞门：反派'}; document.getElementById('novel-lore').value+=t[type]||''; if(loreViewMode==='graph') parseLoreToGraph(); debounceSave(); }
async function aiGenLore() { const p=document.getElementById('novel-prompt').value; if(!p) return showToast("请输入梗概后再使用哦~", "info"); document.getElementById('lore-loading').classList.remove('hidden'); try { const r=await callAI([{role:'user', content:`基于梗概生成世界观（等级、势力等）。格式：\n【大标题】\n名称：描述\n...\n\n梗概：${p}`}]); document.getElementById('novel-lore').value+="\n"+r; if(loreViewMode==='graph') parseLoreToGraph(); debounceSave(); showToast("推演完成", "success"); } catch(e) { showToast(e.message, "error"); } finally { document.getElementById('lore-loading').classList.add('hidden'); } }

// --- Modified: selectChapter to Populate Editor Module ---
function selectChapter(id) { 
    if(!id) return;
    store.currentChapterId = id;
    activateLoom(); 
    document.getElementById('chapter-selector').value = id; 
    loadChapterText(); 
    renderOutline(); 
    
    // Populate Active Outline Module
    const ch = store.outline.find(x => x.id == id);
    if(ch) {
        document.getElementById('active-outline-module').classList.remove('hidden');
        document.getElementById('active-outline-title').value = ch.title;
        document.getElementById('active-outline-desc').value = ch.desc;
        document.getElementById('active-outline-words').value = ch.targetWords || "2000-3000";
    }
}

function updateActiveOutlineData() {
    const id = store.currentChapterId;
    if(!id) return;
    const chIndex = store.outline.findIndex(x => x.id == id);
    if(chIndex !== -1) {
        store.outline[chIndex].title = document.getElementById('active-outline-title').value;
        store.outline[chIndex].desc = document.getElementById('active-outline-desc').value;
        store.outline[chIndex].targetWords = document.getElementById('active-outline-words').value;
        saveData();
        renderOutline(); // Update grid view titles/descs
    }
}

async function generateChapterText(cont) { 
    const id=store.currentChapterId; if(!id) return showToast("选章节","error"); 
    const ch=store.outline.find(x=>x.id==id); const ed=document.getElementById('chapter-editor'); 
    const pnl=document.getElementById('loom-panel'); pnl.classList.add('generating-glow'); 
    const spin=document.getElementById('loading-overlay'); if(spin) { spin.classList.remove('hidden'); spin.querySelector('p').innerText="AI 正在奋笔疾书..."; } 
    
    // Fix: Safe check for store.tags
    const ts=(store.tags && store.tags.length>0)?`风格：${store.tags.join(', ')}`:""; 
    const mp="长篇网文风格"; 
    // Use specific target words if available
    const wordTarget = ch.targetWords || "2000-3000";
    
    try { 
        // Fix: Safe check for individual character tags (x.tags||[])
        let msg=[]; const l=store.lore; const cs=store.characters.map(x=>`${x.name}(${(x.tags||[]).join(',')})`).join(';'); 
        if(cont){ 
            const ctx=ed.value.slice(-1500); 
            msg=[{role:"system",content:`续写。${mp} ${ts}。设定:${store.concept}。人物:${cs}。章纲:${ch.desc}。字数要求:${wordTarget}字。`},{role:"user",content:`上文:${ctx}\n续写800字。`}]; 
        } else { 
            msg=[{role:"system",content:`网文作家。${mp} ${ts}。将大纲扩写为正文。Show don't tell。字数要求:${wordTarget}字。`},{role:"user",content:`世界观:${l}。人物:${cs}。章节:${ch.title}\n大纲:${ch.desc}\n请开始:`}]; 
        } 
        if(spin) spin.classList.add('hidden'); 
        await callAI(msg, (c) => { ed.value+=c; ed.scrollTop=ed.scrollHeight; updateWordCount(); }); 
        store.chapterTexts[id]=ed.value; saveData(); renderOutline(); 
    } catch(e){ showToast(e.message,"error"); } finally{ if(pnl) pnl.classList.remove('generating-glow'); if(spin) spin.classList.add('hidden'); } 
}

async function aiBrainstormTags() { const p=document.getElementById('novel-prompt').value; if(!p) return showToast("请输入梗概后再使用哦~么么哒~", "info"); showToast("分析中...", "info"); try { const r=await callAI([{role:'user', content:`基于梗概推荐5-8个标签。JSON数组格式。梗概：${p}`}]); const t=cleanJson(r); if(Array.isArray(t)) { let c=0; t.forEach(x=>{if(!store.tags.includes(x)){store.tags.push(x);c++;}}); renderSelectedTags(); renderTagSelector(); saveData(); showToast(`添加 ${c} 个标签`, "success"); } } catch(e) { showToast(e.message, "error"); } }
function renderCharacters() { 
    const l = document.getElementById('character-list'); 
    if (!l) return; 
    
    l.innerHTML = store.characters.map((c, i) => `
        <div class="glass-panel p-3 rounded-xl relative group hover:bg-[var(--panel-bg)] border border-[var(--panel-border)] shadow-sm flex flex-col gap-2 transition-all hover:-translate-y-1 hover:shadow-md hover:border-indigo-500/30">
            <div class="flex justify-between items-start">
                <span class="font-bold text-accent text-sm truncate pr-2">${c.name}</span>
                <span class="text-[10px] opacity-60 bg-black/20 px-1.5 py-0.5 rounded text-sub border border-[var(--panel-border)] whitespace-nowrap max-w-[45%] truncate">${c.role}</span>
            </div>
            
            <div class="text-[10px] text-sub line-clamp-3 leading-relaxed opacity-80 bg-black/5 p-1.5 rounded-lg min-h-[3.5em]">
                ${c.desc || '暂无描述...'}
            </div>

            <button onclick="store.characters.splice(${i},1);renderCharacters();saveData();initGraph()" class="absolute -top-2 -right-2 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow-md backdrop-blur-sm z-10">×</button>
        </div>
    `).join(''); 
}function renderOutline() { const c=document.getElementById('outline-container'); const e=document.getElementById('outline-empty-state'); const p=document.getElementById('chapter-progress-text'); const t=document.getElementById('target-total-chapters').value; p.innerText=`${store.outline.length}/${t}`; if(store.outline.length===0){c.innerHTML='';e.classList.remove('hidden');return;}else{e.classList.add('hidden');} c.innerHTML=store.outline.map((ch,i)=>{ const has=store.chapterTexts[ch.id]&&store.chapterTexts[ch.id].length>0; const b=has?`<span class="text-[10px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/30">✅ 已写</span>`:`<span class="text-[10px] bg-[var(--input-bg)] text-sub px-2 py-0.5 rounded-full border border-[var(--panel-border)] opacity-60">⏳ 待写</span>`; const sel=store.currentChapterId==ch.id?'card-active scale-[1.02]':''; return `<div class="glass-panel p-5 rounded-2xl cursor-pointer hover:bg-[var(--panel-bg)] transition-all group highlight-card relative overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 ${sel}" onclick="selectChapter(${ch.id})"><div class="absolute -right-2 -top-5 text-[5rem] font-bold opacity-[0.03] text-main pointer-events-none mono-font select-none">${String(i+1).padStart(2,'0')}</div><div class="relative z-10"><div class="flex justify-between items-start mb-3"><span class="text-xs font-bold opacity-50 tracking-wider text-sub">CH ${i+1}</span>${b}</div><h3 class="text-sm font-bold text-main truncate mb-2 group-hover:text-accent transition-colors leading-relaxed">${ch.title}</h3><p class="text-xs text-sub leading-relaxed line-clamp-3 opacity-80">${ch.desc}</p></div></div>`; }).join(''); const sel=document.getElementById('chapter-selector'); const val=sel.value; sel.innerHTML='<option value="">选择章节...</option>'+store.outline.map(ch=>`<option value="${ch.id}">${ch.title}</option>`).join(''); if(val) sel.value=val; }
function updateProgressUI() { document.getElementById('chapter-progress-text').innerText=`${store.outline.length}/${document.getElementById('target-total-chapters').value}`; }
function activateLoom() { document.getElementById('section-loom').classList.remove('hidden'); document.getElementById('section-loom').scrollIntoView({behavior:'smooth'}); }
function loadChapterText() { const id=document.getElementById('chapter-selector').value; store.currentChapterId=id; document.getElementById('chapter-editor').value=(id&&store.chapterTexts[id])?store.chapterTexts[id]:""; updateWordCount(); }
function updateWordCount() { document.getElementById('current-word-count').innerText=document.getElementById('chapter-editor').value.length+" Words"; }
function addManualCharacter() { const n=document.getElementById('new-char-name').value; if(!n) return; store.characters.push({name:n, role:document.getElementById('new-char-role').value, tags:document.getElementById('new-char-tags').value.split(/[,，]/), desc:document.getElementById('new-char-desc').value}); renderCharacters(); saveData(); toggleModal('char-modal'); initGraph(); }

// --- 公告与免责声明 ---
function checkAndAutoPopAnnouncements() { const r = JSON.parse(localStorage.getItem('read_announcements') || '[]'); if(!r.includes(999)) toggleAnnouncements(); }
function toggleAnnouncements() { const m=document.getElementById('announcement-modal'); const l=document.getElementById('announcement-list'); const dot=document.getElementById('notification-dot'); if(m.classList.contains('hidden')) { m.classList.remove('hidden'); dot.classList.add('hidden'); l.innerHTML = systemAnnouncements.map(a => { const r = JSON.parse(localStorage.getItem('read_announcements')||'[]').includes(a.id); let c=a.type==='important'?'announcement-important':'border border-[var(--panel-border)] bg-[var(--input-bg)]'; let b=a.type==='important'?`<span class="bg-amber-500 text-black px-2 rounded font-bold text-xs animate-pulse">必读</span>`:`<span class="bg-indigo-500 text-white px-2 rounded text-xs">更新</span>`; return `<div class="p-4 rounded-lg mb-3 ${c} ${r&&a.type!=='important'?'opacity-50':''}"><div class="flex justify-between mb-2"><div class="flex gap-2 items-center">${b} <span class="font-bold text-main">${a.title}</span></div><span class="text-xs text-sub">${a.date}</span></div><div class="text-sm text-sub leading-relaxed pl-1 opacity-90">${a.content}</div></div>`; }).join(''); } else m.classList.add('hidden'); }
function markAllAsRead() { const ids=systemAnnouncements.map(a=>a.id); localStorage.setItem('read_announcements', JSON.stringify(ids)); toggleAnnouncements(); }
function showDisclaimer(r) { document.getElementById('disclaimer-modal').classList.remove('hidden'); if(!r) document.getElementById('main-content').classList.add('blur-content'); }
function acceptDisclaimer() { localStorage.setItem('agreed_to_terms_v1', 'true'); document.getElementById('disclaimer-modal').classList.add('hidden'); document.getElementById('main-content').classList.remove('blur-content'); showToast("欢迎使用", "success"); setTimeout(checkAndAutoPopAnnouncements, 500); }
function toggleTutorial() { document.getElementById('tutorial-modal').classList.toggle('hidden'); }
let petState = 'idle'; let petTimer;
function petInteract() { const pet = document.getElementById('pet-body'); const bubble = document.getElementById('pet-bubble'); pet.classList.add('pet-happy'); const msgs = ["加油呀！", "你是最棒的！", "这里剧情不错~", "记得存稿哦", "喝口水吧", "灵感+1", "DeepSeek 也很喜欢这章！"]; bubble.innerText = msgs[Math.floor(Math.random()*msgs.length)]; bubble.classList.add('show'); setTimeout(() => { pet.classList.remove('pet-happy'); bubble.classList.remove('show'); }, 2000); }
function petHappy() { const pet = document.getElementById('pet-body'); if(!pet.classList.contains('pet-happy')) { pet.classList.add('pet-happy'); setTimeout(() => pet.classList.remove('pet-happy'), 1000); } clearTimeout(petTimer); }
document.addEventListener('mousemove', (e) => { const eyes = document.querySelectorAll('.pet-eye'); eyes.forEach(eye => { const rect = eye.getBoundingClientRect(); const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2; const rad = Math.atan2(e.clientX - x, e.clientY - y); const rot = (rad * (180 / Math.PI) * -1) + 180; eye.style.transform = `rotate(${rot}deg)`; }); });
function togglePet() { const c = document.getElementById('pet-container'); c.style.display = c.style.display === 'none' ? 'block' : 'none'; }
