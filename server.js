<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>KAVRIX OS | AI Architect</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .glass { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px); }
        #sidebar { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
        .sidebar-closed { transform: translateX(-100%); opacity: 0; }
        iframe { background: white; border-radius: 12px; transition: all 0.3s; }
        .loader { border-top-color: #6366f1; animation: spinner 0.6s linear infinite; }
        @keyframes spinner { to { transform: rotate(360deg); } }
    </style>
</head>
<body class="bg-[#020617] text-slate-200 overflow-hidden">

    <!-- Top Navigation -->
    <nav class="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#0f172a]/50 backdrop-blur-md z-50 relative">
        <div class="flex items-center gap-4">
            <button id="menuToggle" class="w-10 h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-lg shadow-indigo-500/20">
                <i class="fas fa-th-large text-white"></i>
            </button>
            <div class="hidden md:block">
                <h1 class="text-xl font-extrabold tracking-tighter text-white">KAVRIX <span class="text-indigo-400">OS</span></h1>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Next-Gen App Builder</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <button id="downloadBtn" class="hidden sm:flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-700">
                <i class="fas fa-cloud-download-alt text-indigo-400"></i> EXPORTEER HTML
            </button>
            <button id="resetBtn" class="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors">
                <i class="fas fa-refresh"></i>
            </button>
        </div>
    </nav>

    <div class="flex h-[calc(100vh-64px)] relative">
        <!-- Sidebar Overlay -->
        <aside id="sidebar" class="absolute inset-0 md:relative md:w-[420px] glass border-r border-slate-800 p-6 flex flex-col z-40 sidebar-closed md:transform-none md:opacity-100">
            <div class="flex-1 overflow-y-auto space-y-8 pr-2">
                
                <!-- Build Section -->
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <label class="text-[11px] font-black text-indigo-400 uppercase tracking-widest">Nieuw Concept</label>
                        <span class="text-[10px] text-slate-600">v5.2 Engine</span>
                    </div>
                    <textarea id="promptInput" class="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-sm outline-none focus:border-indigo-500 transition-all placeholder:text-slate-600" placeholder="Beschrijf je droom app..."></textarea>
                    <button id="buildBtn" class="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98]">
                        GENEREER APPLICATIE
                    </button>
                </div>

                <!-- Chat & Edit Section -->
                <div id="editSection" class="space-y-4 opacity-30 pointer-events-none transition-all">
                    <label class="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Aanpassen & Optimaliseren</label>
                    <textarea id="editInput" class="w-full h-24 bg-slate-900/50 border border-slate-700 rounded-2xl p-4 text-sm outline-none focus:border-emerald-500 transition-all" placeholder="Bijv: 'Maak de knoppen rood' of 'Voeg een tabel toe'"></textarea>
                    <button id="editBtn" class="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 transition-all">
                        UPDATE CODE
                    </button>
                </div>

                <!-- History / Logs -->
                <div class="pt-4 border-t border-slate-800">
                    <label class="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Systeem Status</label>
                    <div id="logArea" class="mt-2 text-[10px] font-mono text-slate-500 space-y-1">
                        <div>> Systeem gereed...</div>
                    </div>
                </div>
            </div>

            <!-- Loading Indicator -->
            <div id="statusArea" class="hidden mt-4 p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl flex items-center gap-4">
                <div class="loader w-5 h-5 border-2 border-indigo-200 rounded-full"></div>
                <span class="text-xs font-bold text-indigo-300 uppercase tracking-tighter">AI is aan het bouwen...</span>
            </div>
        </aside>

        <!-- Main Viewport -->
        <main class="flex-1 bg-[#020617] p-3 md:p-6 flex flex-col gap-4">
            <div class="flex-1 relative group">
                <iframe id="previewFrame" class="w-full h-full border-none shadow-2xl shadow-black/50"></iframe>
                <div id="emptyState" class="absolute inset-0 flex flex-col items-center justify-center bg-[#020617]">
                    <div class="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mb-6">
                        <i class="fas fa-layer-group text-3xl text-indigo-500"></i>
                    </div>
                    <h2 class="text-xl font-bold text-white">Wachten op instructies</h2>
                    <p class="text-slate-500 text-sm mt-2">Gebruik het menu om je eerste app te bouwen.</p>
                </div>
            </div>
        </main>
    </div>

    <script>
        let currentCode = localStorage.getItem('kavrix_os_code') || "";
        const sidebar = document.getElementById("sidebar");
        const preview = document.getElementById("previewFrame");
        const empty = document.getElementById("emptyState");

        function addLog(msg) {
            const log = document.getElementById("logArea");
            const div = document.createElement("div");
            div.innerText = `> ${msg}`;
            log.prepend(div);
        }

        document.getElementById("menuToggle").addEventListener("click", () => {
            sidebar.classList.toggle("sidebar-closed");
        });

        if(currentCode) {
            preview.srcdoc = currentCode;
            empty.classList.add("hidden");
            document.getElementById("editSection").classList.remove("opacity-30", "pointer-events-none");
            document.getElementById("downloadBtn").classList.remove("hidden");
        }

        async function callAI(prompt, isEdit = false) {
            const btn = isEdit ? document.getElementById("editBtn") : document.getElementById("buildBtn");
            const status = document.getElementById("statusArea");
            
            btn.disabled = true;
            status.classList.remove("hidden");
            addLog(isEdit ? "Wijziging doorvoeren..." : "Nieuw project starten...");

            try {
                const response = await fetch("https://kavrix.onrender.com/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt, existingCode: isEdit ? currentCode : "" })
                });

                const data = await response.json();
                if (data.code) {
                    currentCode = data.code;
                    localStorage.setItem('kavrix_os_code', currentCode);
                    preview.srcdoc = data.code;
                    empty.classList.add("hidden");
                    document.getElementById("editSection").classList.remove("opacity-30", "pointer-events-none");
                    document.getElementById("downloadBtn").classList.remove("hidden");
                    addLog("Succesvol gegenereerd.");
                    if(window.innerWidth < 768) sidebar.classList.add("sidebar-closed");
                }
            } catch (e) { 
                addLog("FOUT: Verbinding mislukt.");
                alert("Er ging iets mis. Check je internet of API key."); 
            } finally { 
                btn.disabled = false; 
                status.classList.add("hidden"); 
            }
        }

        document.getElementById("buildBtn").addEventListener("click", () => {
            const p = document.getElementById("promptInput").value;
            if(p) callAI(p, false);
        });

        document.getElementById("editBtn").addEventListener("click", () => {
            const p = document.getElementById("editInput").value;
            if(p) callAI(p, true);
        });

        document.getElementById("resetBtn").addEventListener("click", () => {
            if(confirm("Wil je het huidige project volledig wissen?")) {
                localStorage.removeItem('kavrix_os_code');
                location.reload();
            }
        });

        document.getElementById("downloadBtn").addEventListener("click", () => {
            const blob = new Blob([currentCode], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'kavrix-app.html';
            a.click();
            addLog("Bestand geëxporteerd.");
        });
    </script>
</body>
</html>
