// ─────────────────────────────────────────────
// CONFIG — adjust these to match your server's routes
// ─────────────────────────────────────────────
const SERVER = "https://devserver-main--royalsgamedev.netlify.app";

const API = {
  login:    `${SERVER}/api/auth/login`,
  signup:   `${SERVER}/api/auth/signup`,
  messages: `${SERVER}/api/messages`,
  send:     `${SERVER}/api/messages`,
  online:   `${SERVER}/api/online`,
  ws:       SERVER.replace("https", "wss") + "/ws",
};

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentUser = null;
let token = null;
let socket = null;
let pollInterval = null;

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById("form-login").classList.toggle("hidden", tab !== "login");
  document.getElementById("form-signup").classList.toggle("hidden", tab !== "signup");
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";

  if (!username || !password) {
    errEl.textContent = "! fill in all fields";
    return;
  }

  try {
    const res = await fetch(API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = "! " + (data.message || data.error || "login failed");
      return;
    }

    token = data.token || data.accessToken || null;
    currentUser = data.user?.username || data.username || username;
    enterChat();

  } catch (err) {
    errEl.textContent = "! could not reach server";
    console.error(err);
  }
}

async function handleSignup() {
  const username = document.getElementById("signup-username").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const errEl = document.getElementById("signup-error");
  errEl.textContent = "";

  if (!username || !email || !password) {
    errEl.textContent = "! fill in all fields";
    return;
  }

  try {
    const res = await fetch(API.signup, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = "! " + (data.message || data.error || "signup failed");
      return;
    }

    token = data.token || data.accessToken || null;
    currentUser = data.user?.username || data.username || username;
    enterChat();

  } catch (err) {
    errEl.textContent = "! could not reach server";
    console.error(err);
  }
}

function handleLogout() {
  currentUser = null;
  token = null;
  if (socket) socket.close();
  if (pollInterval) clearInterval(pollInterval);
  document.getElementById("messages").innerHTML = "";
  document.getElementById("online-list").innerHTML = "";
  document.getElementById("online-count").textContent = "0";
  showScreen("auth-screen");
}

// ─────────────────────────────────────────────
// CHAT ENTRY
// ─────────────────────────────────────────────
function enterChat() {
  showScreen("chat-screen");
  loadMessages();
  connectWebSocket();
  fetchOnlineUsers();
  pollInterval = setInterval(() => {
    fetchOnlineUsers();
    // fallback polling if WebSocket not available
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      loadMessages();
    }
  }, 5000);
}

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────
async function loadMessages() {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(API.messages, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const msgs = Array.isArray(data) ? data : (data.messages || []);
    const container = document.getElementById("messages");
    container.innerHTML = "";
    msgs.forEach(m => appendMessage(m, false));
    scrollToBottom();
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  // optimistic render
  appendMessage({ username: currentUser, text, timestamp: new Date().toISOString() }, true);
  scrollToBottom();

  try {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(API.send, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text, text, content: text }),
    });
  } catch (err) {
    console.error("Failed to send:", err);
  }
}

function appendMessage(msg, scroll = true) {
  const container = document.getElementById("messages");
  const isOwn = msg.username === currentUser || msg.user === currentUser;
  const username = msg.username || msg.user || msg.sender || "unknown";
  const text = msg.text || msg.message || msg.content || "";
  const time = msg.timestamp || msg.createdAt || msg.time || "";
  const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const div = document.createElement("div");
  div.className = `msg${isOwn ? " own" : ""}`;
  div.innerHTML = `
    <div class="msg-avatar">${username.charAt(0).toUpperCase()}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-username">${username}</span>
        <span class="msg-time">${timeStr}</span>
      </div>
      <div class="msg-text">${escapeHTML(text)}</div>
    </div>
  `;
  container.appendChild(div);
  if (scroll) scrollToBottom();
}

function addSystemMessage(text) {
  const container = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = `— ${text} —`;
  container.appendChild(div);
}

// ─────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────
function connectWebSocket() {
  try {
    socket = new WebSocket(token ? `${API.ws}?token=${token}` : API.ws);

    socket.onopen = () => {
      console.log("WebSocket connected");
      addSystemMessage("connected to server");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message" || data.message || data.text) {
          const msg = data.message || data;
          if (msg.username !== currentUser && msg.user !== currentUser) {
            appendMessage(msg);
            scrollToBottom();
          }
        }

        if (data.type === "online" || data.onlineUsers) {
          updateOnlineUsers(data.onlineUsers || data.users || []);
        }

      } catch (e) {
        console.log("WS message:", event.data);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected, falling back to polling");
    };

    socket.onerror = () => {
      console.log("WebSocket unavailable, using polling");
    };

  } catch (e) {
    console.log("WebSocket not available:", e);
  }
}

// ─────────────────────────────────────────────
// ONLINE USERS
// ─────────────────────────────────────────────
async function fetchOnlineUsers() {
  try {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(API.online, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const users = Array.isArray(data) ? data : (data.users || data.onlineUsers || []);
    updateOnlineUsers(users);
  } catch (err) {
    // silently fail — server may not have this endpoint
  }
}

function updateOnlineUsers(users) {
  const list = document.getElementById("online-list");
  const count = document.getElementById("online-count");
  list.innerHTML = "";
  count.textContent = users.length;
  users.forEach(u => {
    const name = typeof u === "string" ? u : (u.username || u.name || "?");
    const li = document.createElement("li");
    li.textContent = name;
    list.appendChild(li);
  });
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function scrollToBottom() {
  const el = document.getElementById("messages");
  el.scrollTop = el.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
