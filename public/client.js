let socket = null;
let authToken = localStorage.getItem("domino_token");
let myName = localStorage.getItem("domino_display_name") || "";

const countrySelect = document.getElementById("reg-country");
if (typeof WORLD_COUNTRIES !== "undefined") {
  WORLD_COUNTRIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    countrySelect.appendChild(opt);
  });
  countrySelect.value = "Chile";
}

const urlParams = new URLSearchParams(location.search);
const watchCode = urlParams.get("watch");

const authEl = document.getElementById("auth");
const lobbyEl = document.getElementById("lobby");
const waitingEl = document.getElementById("waiting");
const gameEl = document.getElementById("game");
const spectateEl = document.getElementById("spectate");

const capBtns = document.querySelectorAll(".cap-btn");
const createBtn = document.getElementById("create-btn");
const codeInput = document.getElementById("code-input");
const joinBtn = document.getElementById("join-btn");
const lobbyError = document.getElementById("lobby-error");

let selectedCap = 4;
let selectedHandSize = 9;
let mySeatIndex = null;
let myHand = [];
let latestState = null;
let jitsiApi = null;
let myBalance = 0;
let paypalConfig = null;

capBtns.forEach((b) => {
  b.addEventListener("click", () => {
    capBtns.forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
    selectedCap = parseInt(b.getAttribute("data-cap"), 10);
    document.getElementById("handsize-row").style.display = selectedCap === 4 ? "none" : "flex";
  });
});
capBtns[2].classList.add("selected");
document.getElementById("handsize-row").style.display = "none";

document.querySelectorAll(".handsize-btn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".handsize-btn").forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
    selectedHandSize = parseInt(b.getAttribute("data-size"), 10);
  });
});
document.querySelector('.handsize-btn[data-size="9"]').classList.add("selected");

// ---------------- Login / registro ----------------

document.getElementById("tab-login").addEventListener("click", () => switchTab("login"));
document.getElementById("tab-register").addEventListener("click", () => switchTab("register"));

function switchTab(which) {
  document.getElementById("tab-login").classList.toggle("selected", which === "login");
  document.getElementById("tab-register").classList.toggle("selected", which === "register");
  document.getElementById("login-form").classList.toggle("hidden", which !== "login");
  document.getElementById("register-form").classList.toggle("hidden", which !== "register");
  document.getElementById("auth-error").textContent = "";
}

document.getElementById("register-btn").addEventListener("click", async () => {
  const name = document.getElementById("reg-name").value.trim();
  const legalName = document.getElementById("reg-legalname").value.trim();
  const phone = document.getElementById("reg-phone").value.trim();
  const country = document.getElementById("reg-country").value;
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const paypalEmail = document.getElementById("reg-paypal").value.trim();
  const avatarFile = document.getElementById("reg-avatar").files[0];
  const err = document.getElementById("auth-error");
  err.textContent = "Creando cuenta...";
  try {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("legalName", legalName);
    formData.append("phone", phone);
    formData.append("country", country);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("paypalEmail", paypalEmail);
    if (avatarFile) formData.append("avatar", avatarFile);

    const res = await fetch("/api/register", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    onAuthSuccess(data.token, data.name, data.balance, data.emailVerified);
  } catch (e) {
    err.textContent = "Error de conexión.";
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const err = document.getElementById("auth-error");
  err.textContent = "Entrando...";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    onAuthSuccess(data.token, data.name, data.balance, data.emailVerified);
  } catch (e) {
    err.textContent = "Error de conexión.";
  }
});

function onAuthSuccess(token, name, balance, emailVerified) {
  authToken = token;
  myName = name;
  myBalance = balance;
  localStorage.setItem("domino_token", token);
  localStorage.setItem("domino_display_name", name);

  if (emailVerified === false) {
    authEl.classList.add("hidden");
    document.getElementById("verify-screen").classList.remove("hidden");
    return;
  }

  if (watchCode) {
    startSpectating(name);
  } else {
    connectSocket();
    showLobby();
  }
}

document.getElementById("verify-submit-btn").addEventListener("click", async () => {
  const code = document.getElementById("verify-code-input").value.trim();
  const err = document.getElementById("verify-error");
  err.textContent = "Verificando...";
  try {
    const res = await fetch("/api/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error; return; }
    document.getElementById("verify-screen").classList.add("hidden");
    if (watchCode) startSpectating(myName);
    else { connectSocket(); showLobby(); }
  } catch (e) {
    err.textContent = "Error de conexión.";
  }
});

document.getElementById("resend-code-link").addEventListener("click", async (e) => {
  e.preventDefault();
  const err = document.getElementById("verify-error");
  err.textContent = "Enviando...";
  try {
    const res = await fetch("/api/resend-verification", {
      method: "POST",
      headers: { Authorization: "Bearer " + authToken },
    });
    const data = await res.json();
    err.textContent = res.ok ? "Te mandamos un código nuevo." : data.error;
  } catch (e2) {
    err.textContent = "Error de conexión.";
  }
});

function showLobby() {
  authEl.classList.add("hidden");
  lobbyEl.classList.remove("hidden");
  document.getElementById("lobby-name-label").innerHTML =
    "Jugando como " + escapeHtml(myName) + ' · <a href="#" id="logout-link" style="color:#e0a63e;">cerrar sesión</a>';
  document.getElementById("logout-link").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("domino_token");
    localStorage.removeItem("domino_display_name");
    location.reload();
  });
  loadFollowing();
  loadProfile();
  loadLiveRooms();
}

async function loadLiveRooms() {
  const wrap = document.getElementById("live-rooms-list");
  try {
    const res = await fetch("/api/live-rooms");
    const data = await res.json();
    if (!data.rooms.length) { wrap.innerHTML = '<p class="empty-msg-small">No hay ninguna partida en vivo en este momento.</p>'; return; }
    wrap.innerHTML = data.rooms.map((r) => `
      <div class="player-row">
        <span class="player-name"><span class="live-dot"></span> ${r.players.map(escapeHtml).join(", ")} · ${r.spectatorCount} mirando</span>
        <span class="player-actions"><button class="btn-watch" onclick="location.href='/?watch=${r.code}'">Mirar</button></span>
      </div>
    `).join("");
  } catch (e) {
    wrap.innerHTML = '<p class="empty-msg-small">Error cargando.</p>';
  }
}

let searchTimeout = null;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  searchTimeout = setTimeout(() => runSearch(q), 350);
});

async function runSearch(q) {
  const wrap = document.getElementById("search-results");
  if (!q) { wrap.innerHTML = ""; return; }
  try {
    const res = await fetch("/api/search-players?q=" + encodeURIComponent(q), {
      headers: { Authorization: "Bearer " + authToken },
    });
    const data = await res.json();
    if (!data.results.length) { wrap.innerHTML = '<p class="empty-msg-small">Nadie encontrado con ese nombre.</p>'; return; }
    wrap.innerHTML = data.results.map(playerRowHtml).join("");
    attachPlayerRowHandlers(wrap);
  } catch (e) {
    wrap.innerHTML = '<p class="empty-msg-small">Error buscando.</p>';
  }
}

async function loadFollowing() {
  const wrap = document.getElementById("following-list");
  try {
    const res = await fetch("/api/following", { headers: { Authorization: "Bearer " + authToken } });
    const data = await res.json();
    if (!data.results.length) { wrap.innerHTML = '<p class="empty-msg-small">Todavía no seguís a nadie. Buscá jugadores arriba.</p>'; return; }
    wrap.innerHTML = data.results.map((r) => playerRowHtml({ ...r, isFollowing: true })).join("");
    attachPlayerRowHandlers(wrap);
  } catch (e) {
    wrap.innerHTML = '<p class="empty-msg-small">Error cargando.</p>';
  }
}

function playerRowHtml(p) {
  const liveTag = p.isLive ? '<span class="live-dot"></span> en vivo' : '';
  const watchBtn = p.isLive ? `<button class="btn-watch" data-watch="${p.roomCode}">Mirar</button>` : "";
  const followBtn = p.isFollowing
    ? `<button class="btn-unfollow" data-unfollow="${escapeHtml(p.email)}">Dejar de seguir</button>`
    : `<button class="btn-follow" data-follow="${escapeHtml(p.email)}">Seguir</button>`;
  return `<div class="player-row">
    <span class="player-name">${escapeHtml(p.name)} ${liveTag ? '· ' + liveTag : ''}</span>
    <span class="player-actions">${watchBtn}${followBtn}</span>
  </div>`;
}

function attachPlayerRowHandlers(wrap) {
  wrap.querySelectorAll("[data-follow]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken }, body: JSON.stringify({ email: btn.dataset.follow }) });
      runSearch(document.getElementById("search-input").value.trim());
      loadFollowing();
    });
  });
  wrap.querySelectorAll("[data-unfollow]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch("/api/unfollow", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken }, body: JSON.stringify({ email: btn.dataset.unfollow }) });
      runSearch(document.getElementById("search-input").value.trim());
      loadFollowing();
    });
  });
  wrap.querySelectorAll("[data-watch]").forEach((btn) => {
    btn.addEventListener("click", () => { location.href = "/?watch=" + btn.dataset.watch; });
  });
}

// Actualizamos quién está en vivo cada 8 segundos mientras estás en el lobby
setInterval(() => {
  if (!lobbyEl.classList.contains("hidden")) {
    loadFollowing();
    loadLiveRooms();
    const q = document.getElementById("search-input").value.trim();
    if (q) runSearch(q);
  }
}, 8000);

function connectSocket() {
  socket = io("https://chriswalk-domino-api.onrender.com", {
    auth: { token: authToken }
  });
  attachSocketHandlers();
}
let watchingAsGuest = false;

function startSpectating(name) {
  authEl.classList.add("hidden");
  document.getElementById("spectate-prompt").classList.add("hidden");
  spectateEl.classList.remove("hidden");
  document.getElementById("spectate-code").textContent = watchCode;

  const SERVER_URL = "https://chriswalk-domino-api.onrender.com";

if (authToken) {
    socket = io(SERVER_URL, { auth: { token: authToken } });
} else {
    watchingAsGuest = true;
    socket = io(SERVER_URL, { auth: {} });
}
  }
  socket.on("connect", () => socket.emit("spectateRoom", { code: watchCode, name: name || myName || "Espectador" }));
  socket.on("errorMsg", (msg) => { document.getElementById("spectate-info").textContent = msg; });
  socket.on("balance", (bal) => {
    myBalance = bal;
    const el = document.getElementById("wallet-balance");
    if (el) el.textContent = bal;
  });
  socket.on("giftError", (msg) => showToast(msg));
  socket.on("giftEvent", (g) => showToast(g.from + " le regaló " + g.amount + " 💎 a " + g.to + "!"));
  socket.on("likeEvent", (l) => { if (l.from !== myName) showToast(l.from + " le dio ❤️ a alguien"); });
  socket.on("commentEvent", (c) => appendChatLine(c));
  socket.on("state", (state) => {
    latestState = state;
    mySeatIndex = null;
    renderSpectatorView(state);
  });
}

if (watchCode) {
  if (authToken) {
    startSpectating(myName);
  } else {
    authEl.classList.add("hidden");
    lobbyEl.classList.add("hidden");
    document.getElementById("spectate-prompt").classList.remove("hidden");
    document.getElementById("spectate-name-input").value = localStorage.getItem("domino_last_guest_name") || "";
    document.getElementById("spectate-enter-btn").addEventListener("click", () => {
      const name = document.getElementById("spectate-name-input").value.trim() || "Espectador";
      localStorage.setItem("domino_last_guest_name", name);
      startSpectating(name);
    });
    document.getElementById("spectate-login-link").addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("spectate-prompt").classList.add("hidden");
      authEl.classList.remove("hidden");
      switchTab("login");
    });
  }
} else if (authToken) {
  connectSocket();
  showLobby();
} else {
  switchTab("login");
}

function renderSpectatorView(state) {
  document.getElementById("spectate-info").innerHTML =
    (state.started ? "Partida en curso" : "Esperando que se complete la mesa (" + state.seats.filter((s) => s.name).length + "/" + state.capacity + ")") +
    " · " + (state.spectatorCount || 0) + " personas mirando";
  gameEl.classList.remove("hidden");
  document.getElementById("my-area").classList.add("hidden");
  document.getElementById("play-actions").classList.add("hidden");
  if (authToken) {
    document.getElementById("wallet-bar").classList.remove("hidden");
  } else {
    document.getElementById("wallet-bar").classList.add("hidden");
  }
  setupVideoIfNeeded(state.code);
  renderGame(state, true);
}

function attachSocketHandlers() {
  socket.on("connect_error", () => {
    document.getElementById("auth-error").textContent = "Tu sesión expiró, iniciá sesión de nuevo.";
    localStorage.removeItem("domino_token");
    authEl.classList.remove("hidden");
    lobbyEl.classList.add("hidden");
  });

  createBtn.addEventListener("click", () => socket.emit("createRoom", { capacity: selectedCap, handSize: selectedHandSize }));
  joinBtn.addEventListener("click", () => {
    const code = codeInput.value.trim();
    if (!code) return;
    socket.emit("joinRoom", { code });
  });

  socket.on("errorMsg", (msg) => { lobbyError.textContent = msg; });

  socket.on("joined", (data) => {
    mySeatIndex = data.seatIndex;
    lobbyEl.classList.add("hidden");
    document.getElementById("waiting-code").textContent = data.code;
    document.getElementById("waiting-code-big").textContent = data.code;
    document.getElementById("copy-spectate-link").onclick = () => {
      const link = location.origin + "/?watch=" + data.code;
      navigator.clipboard.writeText(link).then(() => {
        document.getElementById("spectate-link-msg").textContent = "¡Copiado! Cualquiera que lo abra puede mirar la partida en vivo, sin necesitar cuenta.";
      }).catch(() => {
        document.getElementById("spectate-link-msg").textContent = link;
      });
    };
  });

  socket.on("queued", (data) => {
    lobbyEl.classList.add("hidden");
    waitingEl.classList.remove("hidden");
    gameEl.classList.add("hidden");
    document.getElementById("waiting-code").textContent = data.code;
    document.getElementById("waiting-code-big").textContent = data.code;
    document.getElementById("waiting-count").textContent =
      "Estás en la fila de espera (posición " + data.position + "). Entrás automáticamente apenas se libera un lugar.";
  });

  socket.on("hand", (hand) => { myHand = hand; renderHand(); });

  socket.on("balance", (bal) => {
    myBalance = bal;
    const el = document.getElementById("wallet-balance");
    if (el) el.textContent = bal;
  });

  socket.on("giftError", (msg) => showToast(msg));
  socket.on("giftEvent", (g) => showToast(g.from + " le regaló " + g.amount + " 💎 a " + g.to + "!"));
  socket.on("likeEvent", (l) => {
    if (l.from !== myName) showToast(l.from + " le dio ❤️ a alguien");
  });
  socket.on("commentEvent", (c) => appendChatLine(c));

  socket.on("state", (state) => {
    latestState = state;
    if (!state.started) {
      waitingEl.classList.remove("hidden");
      gameEl.classList.add("hidden");
      document.getElementById("waiting-count").textContent =
        state.seats.filter((s) => s.name).length + " de " + state.capacity + " jugadores en la mesa";
      const rows = state.seats.map(
        (s) => "<li>" + (s.name ? escapeHtml(s.name) + (s.seatIndex === mySeatIndex ? " (vos)" : "") : "— esperando jugador —") + "</li>"
      );
      if (state.queue.length) rows.push("<li>En fila: " + state.queue.map(escapeHtml).join(", ") + "</li>");
      document.getElementById("waiting-list").innerHTML = rows.join("");
    } else {
      waitingEl.classList.add("hidden");
      gameEl.classList.remove("hidden");
      setupVideoIfNeeded(state.code);
      renderGame(state);
    }
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Cada valor de ficha (0 al 6) tiene su propio color fijo, así cada combinación
// de dos números se ve como una mezcla única de esos dos colores.
const PIP_COLORS = {
  0: "#7d8b99", 1: "#f0a63e", 2: "#2f9e73", 3: "#4d76e0",
  4: "#e0524a", 5: "#a15ae0", 6: "#1fb3a8",
};
function tileColors(tile) {
  return [PIP_COLORS[tile[0]], PIP_COLORS[tile[1]]];
}

let tileStyle = localStorage.getItem("domino_tile_style") || "numbers";

const PIP_PATTERNS = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function pipGridHtml(value) {
  const dots = PIP_PATTERNS[value] || [];
  const cells = dots.map(([r, c]) => `<span class="pip-dot" style="grid-row:${r + 1};grid-column:${c + 1};"></span>`).join("");
  return '<div class="pip-grid">' + cells + "</div>";
}

// Dibuja una mitad de ficha con el estilo elegido: números con color, o puntitos sobre color
function renderHalf(value, color) {
  if (tileStyle === "dots") {
    return `<div class="domino-half dots" style="background:${color};">${pipGridHtml(value)}</div>`;
  }
  return `<div class="domino-half" style="background:${color};">${value}</div>`;
}

function setupVideoIfNeeded(code) {
  const bar = document.getElementById("video-bar");
  if (bar.dataset.setupDone) return;
  bar.dataset.setupDone = "1";
  const container = document.createElement("div");
  container.className = "video-tile";
  container.style.width = "100%";
  container.style.maxWidth = "480px";
  container.style.height = "160px";
  bar.appendChild(container);
  try {
    jitsiApi = new JitsiMeetExternalAPI("meet.jit.si", {
      roomName: "chrishook-domino-" + code,
      parentNode: container,
      width: "100%",
      height: "100%",
      configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true },
      interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, MOBILE_APP_PROMO: false },
      userInfo: { displayName: myName },
    });
  } catch (e) {
    bar.innerHTML = '<p style="font-size:12px;color:#cfe3da;padding:8px;">No se pudo cargar el video. Pueden seguir jugando sin él.</p>';
  }
}

function renderBoneyardVisual(state) {
  const pile = document.getElementById("boneyard-pile");
  if (state.boneyardCount > 0) {
    pile.classList.remove("hidden");
    document.getElementById("boneyard-count-label").textContent = state.boneyardCount + " en el montón";
    const row = document.getElementById("boneyard-row");
    if (row.children.length !== state.boneyardCount) {
      row.innerHTML = "";
      for (let i = 0; i < state.boneyardCount; i++) {
        const t = document.createElement("div");
        t.className = "boneyard-tile";
        t.dataset.pileIndex = i;
        row.appendChild(t);
      }
    }
  } else {
    pile.classList.add("hidden");
  }
}

function renderGame(state, readOnly) {
  document.getElementById("room-label").textContent = "Sala " + state.code;
  const turnSeat = state.seats.find((s) => s.seatIndex === state.turnSeatIndex);
  const isMyTurn = !readOnly && state.turnSeatIndex === mySeatIndex && mySeatIndex !== null;

  document.getElementById("turn-label").textContent = state.finished
    ? "Partida terminada"
    : (isMyTurn ? "Tu turno" : "Turno de " + (turnSeat ? turnSeat.name : "..."));

  document.getElementById("spectator-count").textContent =
    state.spectatorCount ? "👁 " + state.spectatorCount + " mirando" : "";

  const totalLikes = state.likes ? Object.values(state.likes).reduce((a, b) => a + b, 0) : 0;
  document.getElementById("rail-like-count").textContent = totalLikes;

  // Orden de turno: la secuencia de asientos con quien juega ahora resaltado
  const orderWrap = document.getElementById("turn-order");
  orderWrap.innerHTML = "";
  state.seats.forEach((s, i) => {
    if (i > 0) {
      const arrow = document.createElement("span");
      arrow.className = "turn-order-arrow";
      arrow.textContent = "→";
      orderWrap.appendChild(arrow);
    }
    const item = document.createElement("span");
    item.className = "turn-order-item" + (s.seatIndex === state.turnSeatIndex ? " current" : "");
    item.textContent = s.name ? s.name + (s.seatIndex === mySeatIndex ? " (vos)" : "") : "—";
    orderWrap.appendChild(item);
  });

  const oppWrap = document.getElementById("opponents");
  oppWrap.innerHTML = "";
  state.seats.filter((s) => s.seatIndex !== mySeatIndex).forEach((s) => {
    const active = s.seatIndex === state.turnSeatIndex ? "active" : "";
    const div = document.createElement("div");
    div.className = "opp-badge " + active;
    const label = s.name ? escapeHtml(s.name) : "esperando...";
    const status = s.name && !s.connected ? " (se cayó, esperando reemplazo)" : "";
    div.innerHTML = label + " · " + s.tileCount + " fichas" + status;

    const likeBtn = document.createElement("button");
    likeBtn.className = "like-btn";
    likeBtn.textContent = "❤️" + (state.likes && state.likes[s.seatIndex] ? " " + state.likes[s.seatIndex] : "");
    likeBtn.title = "Dar me gusta";
    likeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("sendLike", { toSeatIndex: s.seatIndex });
      likeBtn.classList.remove("pop");
      void likeBtn.offsetWidth;
      likeBtn.classList.add("pop");
    });
    div.appendChild(likeBtn);

    if ((!readOnly || authToken) && s.name && s.connected) {
      const giftBtn = document.createElement("button");
      giftBtn.className = "gift-btn";
      giftBtn.textContent = "🎁";
      giftBtn.title = "Mandarle un regalo";
      giftBtn.addEventListener("click", (e) => { e.stopPropagation(); openGiftPicker(giftBtn, s.seatIndex); });
      div.appendChild(giftBtn);
    }
    oppWrap.appendChild(div);
  });
  if (state.queue && state.queue.length) {
    const q = document.createElement("div");
    q.className = "opp-badge";
    q.textContent = "En fila: " + state.queue.map(escapeHtml).join(", ");
    oppWrap.appendChild(q);
  }

  renderSpiralBoard(state.board);

  syncChatHistory(state.comments);

  // Esto lo vemos todos, jugadores y espectadores por igual
  renderBoneyardVisual(state);

  if (readOnly) { renderHand(); return; }

  selectedTile = null;
  updatePlayActions();

  const canPlay = isMyTurn && myHand.some((t) =>
    state.board.length === 0 || t[0] === state.leftEnd || t[1] === state.leftEnd || t[0] === state.rightEnd || t[1] === state.rightEnd
  );
  const passBtn = document.getElementById("pass-btn");
  const pile = document.getElementById("boneyard-pile");

  if (isMyTurn && !state.finished && !canPlay) {
    if (state.boneyardCount > 0) {
      passBtn.classList.add("hidden");
      pile.classList.add("drawable");
      pile.querySelectorAll(".boneyard-tile").forEach((t) => {
        t.onclick = () => socket.emit("drawTile", { pileIndex: parseInt(t.dataset.pileIndex, 10) });
      });
      if (autoPassTimeout) { clearTimeout(autoPassTimeout); autoPassTimeout = null; }
    } else {
      pile.classList.remove("drawable");
      passBtn.textContent = "Pasando automáticamente...";
      passBtn.classList.remove("hidden");
      passBtn.disabled = true;
      passBtn.onclick = null;
      if (autoPassTimeout) clearTimeout(autoPassTimeout);
      autoPassTimeout = setTimeout(() => { socket.emit("passTurn"); }, 1800);
    }
  } else {
    passBtn.classList.add("hidden");
    passBtn.disabled = false;
    passBtn.onclick = null;
    pile.classList.remove("drawable");
    pile.querySelectorAll(".boneyard-tile").forEach((t) => { t.onclick = null; });
    if (autoPassTimeout) { clearTimeout(autoPassTimeout); autoPassTimeout = null; }
  }

  updateUndoButton(state);

  const overWrap = document.getElementById("gameover-wrap");
  if (state.finished) {
    overWrap.classList.remove("hidden");
    const w = state.winner;
    document.getElementById("gameover-text").textContent = w.seatIndex === mySeatIndex
      ? "¡Ganaste vos! (" + (w.reason === "sin_fichas" ? "te quedaste sin fichas" : "menos puntos al bloquearse") + ")"
      : (w.name || "Un jugador") + " ganó la partida.";
  } else {
    overWrap.classList.add("hidden");
  }
  renderHand();
}

function renderTile(tile, cls) {
  return '<div class="domino ' + cls + '"><div class="domino-half">' + tile[0] + '</div><div class="domino-half">' + tile[1] + "</div></div>";
}

let selectedTile = null;
let autoPassTimeout = null;

function renderHand() {
  const handEl = document.getElementById("my-hand");
  const isMyTurn = latestState && latestState.turnSeatIndex === mySeatIndex && !latestState.finished;
  handEl.innerHTML = "";
  myHand.forEach((tile) => {
    const div = document.createElement("div");
    const playable = !latestState || latestState.board.length === 0 ||
      tile[0] === latestState.leftEnd || tile[1] === latestState.leftEnd ||
      tile[0] === latestState.rightEnd || tile[1] === latestState.rightEnd;
    div.className = "domino hand-tile" + (!playable ? " disabled" : "");
    if (selectedTile && selectedTile[0] === tile[0] && selectedTile[1] === tile[1]) div.classList.add("selected");
    const [c1, c2] = tileColors(tile);
    div.innerHTML = renderHalf(tile[0], c1) + renderHalf(tile[1], c2);
    if (isMyTurn && playable) div.addEventListener("click", () => onTileClick(tile));
    else if (!isMyTurn) div.style.opacity = "0.7";
    handEl.appendChild(div);
  });
}

function onTileClick(tile) {
  if (!latestState) return;
  selectedTile = tile;
  renderHand();
  updatePlayActions();
}

function updatePlayActions() {
  const wrap = document.getElementById("play-actions");
  const label = document.getElementById("play-actions-label");
  const buttons = document.getElementById("play-actions-buttons");
  buttons.innerHTML = "";

  if (!selectedTile || !latestState) { wrap.classList.add("hidden"); return; }
  const tile = selectedTile;

  if (latestState.board.length === 0) {
    label.textContent = "Ficha " + tile[0] + " | " + tile[1] + " seleccionada — es la primera del tablero";
    const b = document.createElement("button");
    b.textContent = "Jugar esta ficha";
    b.addEventListener("click", () => { socket.emit("playTile", { tile, end: "right" }); selectedTile = null; });
    buttons.appendChild(b);
    wrap.classList.remove("hidden");
    return;
  }

  const matchesLeft = tile[0] === latestState.leftEnd || tile[1] === latestState.leftEnd;
  const matchesRight = tile[0] === latestState.rightEnd || tile[1] === latestState.rightEnd;

  if (!matchesLeft && !matchesRight) {
    label.textContent = "Esa ficha no encaja en ningún extremo del tablero.";
    wrap.classList.remove("hidden");
    return;
  }

  label.textContent = "Ficha " + tile[0] + " | " + tile[1] + " — ¿de qué lado la jugás?";
  if (matchesLeft) {
    const b = document.createElement("button");
    b.textContent = "‹ Lado izquierdo";
    b.addEventListener("click", () => { socket.emit("playTile", { tile, end: "left" }); selectedTile = null; });
    buttons.appendChild(b);
  }
  if (matchesRight) {
    const b = document.createElement("button");
    b.textContent = "Lado derecho ›";
    b.addEventListener("click", () => { socket.emit("playTile", { tile, end: "right" }); selectedTile = null; });
    buttons.appendChild(b);
  }
  wrap.classList.remove("hidden");
}

let undoInterval = null;

function updateUndoButton(state) {
  const btn = document.getElementById("undo-btn");
  if (undoInterval) { clearInterval(undoInterval); undoInterval = null; }

  if (state.lastMoveSeatIndex !== mySeatIndex || mySeatIndex === null || !state.lastMoveExpiresAt) {
    btn.classList.add("hidden");
    return;
  }

  btn.classList.remove("hidden");
  const tick = () => {
    const secondsLeft = Math.max(0, Math.ceil((state.lastMoveExpiresAt - Date.now()) / 1000));
    btn.textContent = "Deshacer última jugada (" + secondsLeft + "s)";
    if (secondsLeft <= 0) {
      btn.classList.add("hidden");
      clearInterval(undoInterval);
    }
  };
  tick();
  undoInterval = setInterval(tick, 500);
  btn.onclick = () => socket.emit("undoLastMove");
}

// ---------------- Mesa: fichas en espiral + tapete elegible ----------------

const STEP = 60; // distancia entre el centro de una ficha y la siguiente

function renderSpiralBoard(board) {
  const inner = document.getElementById("board-inner");
  if (!board.length) { inner.innerHTML = ""; inner.style.transform = ""; return; }

  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // derecha, abajo, izquierda, arriba
  let x = 0, y = 0, dirIndex = 0, segLength = 5, segCount = 0, turns = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  let html = "";

  board.forEach((entry) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);

    // Al doblar la esquina hacia la izquierda o hacia arriba, el orden de los
    // dos lados de la ficha se invierte, así el punto que toca a la ficha
    // anterior siempre queda pegado a ella, sin importar hacia dónde gira.
    const swap = dirIndex === 2 || dirIndex === 3;
    const rotate = (dirIndex === 1 || dirIndex === 3) ? 90 : 0;
    const values = swap ? [entry.tile[1], entry.tile[0]] : [entry.tile[0], entry.tile[1]];
    const colors = tileColors(swap ? [entry.tile[1], entry.tile[0]] : entry.tile);

    html += `<div class="domino board-tile" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${rotate}deg);">
      ${renderHalf(values[0], colors[0])}${renderHalf(values[1], colors[1])}
    </div>`;

    segCount++;
    if (segCount === segLength) {
      segCount = 0;
      dirIndex = (dirIndex + 1) % 4;
      turns++;
      if (turns === 2) { segLength += 2; turns = 0; }
    }
    x += dirs[dirIndex][0] * STEP;
    y += dirs[dirIndex][1] * STEP;
  });

  inner.innerHTML = html;

  // Si la espiral crece más que la mesa, la achicamos entera para que nunca se corte ninguna ficha
  const mesa = document.getElementById("table-mesa");
  const mesaRect = mesa.getBoundingClientRect();
  const spanX = (maxX - minX) + 90;
  const spanY = (maxY - minY) + 90;
  const availW = mesaRect.width - 30;
  const availH = mesaRect.height - 30;
  const scale = Math.min(1, availW / spanX, availH / spanY);
  inner.style.transformOrigin = "0 0";
  inner.style.transform = "scale(" + scale + ")";
}

document.querySelectorAll(".mesa-swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mesa-swatch").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const felt = btn.getAttribute("data-felt");
    applyFelt(felt);
    localStorage.setItem("domino_felt", felt);
  });
});

function applyFelt(felt) {
  const mesa = document.getElementById("table-mesa");
  const feltGradients = {
    green: "linear-gradient(160deg, #1B4332 0%, #0f2b23 100%)",
    red: "linear-gradient(160deg, #7a2020 0%, #4a1010 100%)",
    blue: "linear-gradient(160deg, #1e3a5f 0%, #10223a 100%)",
    purple: "linear-gradient(160deg, #4a2160 0%, #2a1038 100%)",
  };
  mesa.style.background =
    "radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 70%), " + (feltGradients[felt] || feltGradients.green);
}

const savedFelt = localStorage.getItem("domino_felt");
if (savedFelt) {
  applyFelt(savedFelt);
  document.querySelectorAll(".mesa-swatch").forEach((b) => b.classList.toggle("active", b.getAttribute("data-felt") === savedFelt));
}

document.querySelectorAll(".style-swatch").forEach((btn) => {
  if (btn.getAttribute("data-style") === tileStyle) btn.classList.add("active");
  btn.addEventListener("click", () => {
    document.querySelectorAll(".style-swatch").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    tileStyle = btn.getAttribute("data-style");
    localStorage.setItem("domino_tile_style", tileStyle);
    if (latestState) renderGame(latestState, mySeatIndex === null);
  });
});

document.getElementById("rematch-btn").addEventListener("click", () => socket.emit("rematch"));

document.getElementById("rail-share-btn").addEventListener("click", () => document.getElementById("share-btn").click());
document.getElementById("rail-chat-btn").addEventListener("click", () => {
  document.getElementById("chat-input").focus();
  document.getElementById("chat-messages").scrollIntoView({ behavior: "smooth", block: "center" });
});
document.getElementById("rail-gift-btn").addEventListener("click", () => {
  const firstGiftBtn = document.querySelector("#opponents .gift-btn");
  if (firstGiftBtn) firstGiftBtn.click();
  else showToast("Todavía no hay jugadores a quién regalarle.");
});
document.getElementById("rail-like-btn").addEventListener("click", () => {
  const firstSeat = latestState && latestState.seats.find((s) => s.seatIndex !== mySeatIndex && s.name);
  if (!firstSeat) { showToast("Todavía no hay a quién darle like."); return; }
  socket.emit("sendLike", { toSeatIndex: firstSeat.seatIndex });
  const btn = document.getElementById("rail-like-btn");
  btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
});

document.getElementById("share-btn").addEventListener("click", async () => {
  if (!latestState) return;
  const link = location.origin + "/?watch=" + latestState.code;
  const shareData = { title: "Chris Domino", text: "¡Mirá esta partida de Chris Domino en vivo!", url: link };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (e) { /* la persona canceló */ }
  } else {
    try { await navigator.clipboard.writeText(link); showToast("Link copiado, ¡compartilo donde quieras!"); }
    catch (e) { showToast(link); }
  }
});

function appendChatLine(c) {
  const wrap = document.getElementById("chat-messages");
  const line = document.createElement("div");
  line.className = "chat-line";
  line.innerHTML = "<b>" + escapeHtml(c.name) + ":</b> " + escapeHtml(c.text);
  wrap.appendChild(line);
  wrap.scrollTop = wrap.scrollHeight;
}

let lastRenderedCommentCount = 0;
function syncChatHistory(comments) {
  if (!comments || comments.length === lastRenderedCommentCount) return;
  const wrap = document.getElementById("chat-messages");
  wrap.innerHTML = "";
  comments.forEach(appendChatLine);
  lastRenderedCommentCount = comments.length;
}

document.getElementById("chat-send-btn").addEventListener("click", sendChatMessage);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});
function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || !socket) return;
  socket.emit("sendComment", { text });
  input.value = "";
}

// ---------------- Perfil, datos de cobro y monetización ----------------

let myMonetizationStatus = "no_solicitado";
let myFollowerCount = 0;

async function loadProfile() {
  try {
    const res = await fetch("/api/me", { headers: { Authorization: "Bearer " + authToken } });
    const data = await res.json();
    myFollowerCount = data.followerCount;
    myMonetizationStatus = data.monetization ? data.monetization.status : "no_solicitado";

    document.getElementById("profile-followers").textContent =
      data.followerCount + " seguidores · se necesitan " + data.monetizationThreshold + " para poder monetizar";
    const avatarEl = document.getElementById("profile-avatar");
    if (data.avatarUrl) { avatarEl.src = data.avatarUrl; avatarEl.style.display = "block"; }
    else { avatarEl.style.display = "none"; }
    document.getElementById("profile-paypal").value = data.paypalEmail || "";
    document.getElementById("profile-bank-name").value = data.bankName || "";
    document.getElementById("profile-bank-number").value = data.bankAccountNumber || "";
    document.getElementById("profile-bank-holder").value = data.bankAccountHolder || "";

    renderMonetizationSection(data);
  } catch (e) {}
}

function renderMonetizationSection(data) {
  const statusEl = document.getElementById("monetization-status");
  const formEl = document.getElementById("monetization-form");
  const status = data.monetization ? data.monetization.status : "no_solicitado";

  if (status === "aprobado") {
    statusEl.textContent = "✅ Tu cuenta ya está verificada y monetizada. Podés recibir regalos y retirarlos.";
    formEl.classList.add("hidden");
  } else if (status === "pendiente") {
    statusEl.textContent = "⏳ Tu solicitud de monetización está en revisión.";
    formEl.classList.add("hidden");
  } else if (status === "rechazado") {
    statusEl.textContent = "❌ Tu solicitud anterior fue rechazada. Podés volver a enviarla.";
    if (data.followerCount >= data.monetizationThreshold) formEl.classList.remove("hidden");
    else formEl.classList.add("hidden");
  } else {
    if (data.followerCount >= data.monetizationThreshold) {
      statusEl.textContent = "🎉 ¡Llegaste a " + data.monetizationThreshold + " seguidores! Ya podés solicitar la monetización.";
      formEl.classList.remove("hidden");
    } else {
      statusEl.textContent = "Te faltan " + (data.monetizationThreshold - data.followerCount) + " seguidores para poder monetizar tu cuenta.";
      formEl.classList.add("hidden");
    }
  }
}

document.getElementById("save-payout-btn").addEventListener("click", async () => {
  const msg = document.getElementById("payout-msg");
  msg.textContent = "Guardando...";
  try {
    const res = await fetch("/api/update-payout-info", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
      body: JSON.stringify({
        paypalEmail: document.getElementById("profile-paypal").value.trim(),
        bankName: document.getElementById("profile-bank-name").value.trim(),
        bankAccountNumber: document.getElementById("profile-bank-number").value.trim(),
        bankAccountHolder: document.getElementById("profile-bank-holder").value.trim(),
      }),
    });
    if (!res.ok) { msg.textContent = "No se pudo guardar."; return; }
    msg.textContent = "¡Guardado!";
  } catch (e) {
    msg.textContent = "Error de conexión.";
  }
});

document.getElementById("submit-monetization-btn").addEventListener("click", async () => {
  const fileInput = document.getElementById("kyc-file");
  const msg = document.getElementById("monetization-msg");
  if (!fileInput.files[0]) { msg.textContent = "Elegí primero un archivo con tu documento."; return; }
  msg.textContent = "Enviando...";
  try {
    const formData = new FormData();
    formData.append("idDocument", fileInput.files[0]);
    const res = await fetch("/api/monetization/apply", {
      method: "POST",
      headers: { Authorization: "Bearer " + authToken },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; return; }
    msg.textContent = "¡Solicitud enviada! Te avisamos cuando se revise.";
    loadProfile();
  } catch (e) {
    msg.textContent = "Error de conexión.";
  }
});

// ---------------- Tienda de gemas (PayPal) ----------------

document.getElementById("buy-gems-btn").addEventListener("click", async () => {
  document.getElementById("buy-modal").classList.remove("hidden");
  if (!paypalConfig) await setupPaypal();
});
document.getElementById("close-buy-modal").addEventListener("click", () => document.getElementById("buy-modal").classList.add("hidden"));
document.getElementById("withdraw-btn").addEventListener("click", () => document.getElementById("withdraw-modal").classList.remove("hidden"));
document.getElementById("close-withdraw-modal").addEventListener("click", () => document.getElementById("withdraw-modal").classList.add("hidden"));

document.getElementById("submit-withdraw").addEventListener("click", async () => {
  const amount = parseInt(document.getElementById("withdraw-amount").value, 10);
  const msg = document.getElementById("withdraw-msg");
  msg.textContent = "Procesando...";
  try {
    const res = await fetch("/api/withdraw-request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error; return; }
    msg.textContent = "¡Listo! Vas a recibir USD $" + data.payoutAmount + " en tu PayPal (se descontó $" + data.platformCut + " de comisión). Te lo procesan en las próximas 48 horas.";
    myBalance = data.newBalance;
    document.getElementById("wallet-balance").textContent = myBalance;
  } catch (e) {
    msg.textContent = "Hubo un error de conexión.";
  }
});

async function setupPaypal() {
  const res = await fetch("/api/paypal/config");
  paypalConfig = await res.json();

  const grid = document.getElementById("pack-grid");
  grid.innerHTML = "";
  Object.entries(paypalConfig.packs).forEach(([packId, pack]) => {
    const card = document.createElement("div");
    card.className = "pack-card";
    card.innerHTML = `
      <div class="pack-symbol">${pack.symbol}</div>
      <div class="pack-label">${pack.label} · ${pack.gems.toLocaleString()} gemas</div>
      <div class="pack-price">USD $${pack.usd}</div>
      <div id="paypal-${packId}"></div>
    `;
    grid.appendChild(card);
  });

  if (!paypalConfig.configured || !paypalConfig.clientId) {
    document.getElementById("paypal-warning").classList.remove("hidden");
    return;
  }
  const script = document.createElement("script");
  script.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(paypalConfig.clientId) + "&currency=USD";
  script.onload = () => Object.keys(paypalConfig.packs).forEach(renderPaypalButton);
  document.body.appendChild(script);
}

function renderPaypalButton(packId) {
  if (!window.paypal) return;
  window.paypal.Buttons({
    style: { layout: "horizontal", height: 35, tagline: false },
    createOrder: async () => {
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      return data.orderID;
    },
    onApprove: async (data) => {
      const res = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + authToken },
        body: JSON.stringify({ orderID: data.orderID }),
      });
      const result = await res.json();
      if (result.newBalance !== undefined) {
        myBalance = result.newBalance;
        document.getElementById("wallet-balance").textContent = myBalance;
      }
    },
  }).render("#paypal-" + packId);
}

// ---------------- Regalos ----------------

function showToast(text) {
  const wrap = document.getElementById("gift-toast");
  const el = document.createElement("div");
  el.className = "toast-item";
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function openGiftPicker(anchorEl, seatIndex) {
  closeGiftPicker();
  const picker = document.createElement("div");
  picker.id = "gift-picker";
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top = rect.bottom + window.scrollY + 4 + "px";
  picker.style.left = rect.left + window.scrollX + "px";
  [10, 50, 100].forEach((amt) => {
    const b = document.createElement("button");
    b.textContent = amt + " 💎";
    b.addEventListener("click", () => { socket.emit("sendGift", { toSeatIndex: seatIndex, amount: amt }); closeGiftPicker(); });
    picker.appendChild(b);
  });
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener("click", closeGiftPickerOnce), 0);
}
function closeGiftPickerOnce(e) { if (!e.target.closest("#gift-picker")) closeGiftPicker(); }
function closeGiftPicker() {
  const existing = document.getElementById("gift-picker");
  if (existing) existing.remove();
  document.removeEventListener("click", closeGiftPickerOnce);
}
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logout-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("domino_token");
      localStorage.removeItem("domino_display_name");

      if (socket) {
        socket.disconnect();
      }

      location.reload();
    });
  }
});
