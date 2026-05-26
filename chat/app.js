import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ─────────────────────────────────────────────
// SUPABASE SETUP
// ─────────────────────────────────────────────
const supabase = createClient(
  "https://jhfyvpwiutuztvajcojq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZnl2cHdpdXR1enR2YWpjb2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTEwOTIsImV4cCI6MjA5NTI2NzA5Mn0.Bg3LCk02pYWyG3Rb1qIDZTmNA-LqqVXhCi2iNXOoJGY"
);

// fake email derived from username — user never sees this
const fakeEmail = (username) => `${username.toLowerCase()}@rgd.chat`;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentUser = null;
let presenceChannel = null;

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────
window.switchTab = function(tab) {
  document.getElementById("form-login").classList.toggle("hidden", tab !== "login");
  document.getElementById("form-signup").classList.toggle("hidden", tab !== "signup");
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
};

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
window.handleLogin = async function() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";

  if (!username || !password) { errEl.textContent = "! fill in all fields"; return; }

  const { error } = await supabase.auth.signInWithPassword({
    email: fakeEmail(username),
    password,
  });

  if (error) {
    errEl.textContent = "! incorrect username or password";
    return;
  }

  currentUser = username;
  enterChat();
};

// ─────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────
window.handleSignup = async function() {
  const username = document.getElementById("signup-username").value.trim();
  const password = document.getElementById("signup-password").value;
  const errEl = document.getElementById("signup-error");
  errEl.textContent = "";

  if (!username || !password) { errEl.textContent = "! fill in all fields"; return; }
  if (password.length < 6) { errEl.textContent = "! password must be 6+ characters"; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { errEl.textContent = "! username: letters, numbers, _ only"; return; }

  // check username not already taken
  const { data: existing } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .single();

  if (existing) { errEl.textContent = "! username already taken"; return; }

  // create auth account with fake email
  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail(username),
    password,
  });

  if (error) { errEl.textContent = "! " + error.message; return; }

  // save profile
  const { error: profileErr } = await supabase.from("profiles").insert({
    id: data.user.id,
    username,
  });

  if (profileErr) { errEl.textContent = "! " + profileErr.message; return; }

  currentUser = username;
  enterChat();
};

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────
window.handleLogout = async function() {
  if (presenceChannel) await supabase.removeChannel(presenceChannel);
  await supabase.auth.signOut();
  currentUser = null;
  document.getElementById("messages").innerHTML = "";
  document.getElementById("online-list").innerHTML = "";
  document.getElementById("online-count").textContent = "0";
  showScreen("auth-screen");
};

// ─────────────────────────────────────────────
// ENTER CHAT
// ─────────────────────────────────────────────
function enterChat() {
  showScreen("chat-screen");
  loadMessages();
  subscribeToMessages();
  trackPresence();
}

// ─────────────────────────────────────────────
// LOAD PAST MESSAGES
// ─────────────────────────────────────────────
async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) { console.error(error); return; }
  document.getElementById("messages").innerHTML = "";
  data.forEach(m => appendMessage(m));
  scrollToBottom();
}

// ─────────────────────────────────────────────
// REAL-TIME NEW MESSAGES
// ─────────────────────────────────────────────
function subscribeToMessages() {
  supabase
    .channel("public:messages")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        if (payload.new.username !== currentUser) {
          appendMessage(payload.new);
          scrollToBottom();
        }
      }
    )
    .subscribe();
}

// ─────────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────────
window.sendMessage = async function() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  appendMessage({ username: currentUser, content: text, created_at: new Date().toISOString() });
  scrollToBottom();

  const { error } = await supabase.from("messages").insert({
    username: currentUser,
    content: text,
  });

  if (error) console.error("Send failed:", error.message);
};

// ─────────────────────────────────────────────
// PRESENCE (online users)
// ─────────────────────────────────────────────
function trackPresence() {
  presenceChannel = supabase.channel("online-users", {
    config: { presence: { key: currentUser } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      updateOnlineUsers(Object.keys(state));
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ username: currentUser });
      }
    });
}

function updateOnlineUsers(users) {
  const list = document.getElementById("online-list");
  document.getElementById("online-count").textContent = users.length;
  list.innerHTML = "";
  users.forEach(username => {
    const li = document.createElement("li");
    li.textContent = username;
    list.appendChild(li);
  });
}

// ─────────────────────────────────────────────
// RENDER A MESSAGE
// ─────────────────────────────────────────────
function appendMessage(msg) {
  const container = document.getElementById("messages");
  const isOwn = msg.username === currentUser;
  const timeStr = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const div = document.createElement("div");
  div.className = `msg${isOwn ? " own" : ""}`;
  div.innerHTML = `
    <div class="msg-avatar">${escapeHTML(msg.username).charAt(0).toUpperCase()}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-username">${escapeHTML(msg.username)}</span>
        <span class="msg-time">${timeStr}</span>
      </div>
      <div class="msg-text">${escapeHTML(msg.content)}</div>
    </div>
  `;
  container.appendChild(div);
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
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────
// AUTO-LOGIN if session still active
// ─────────────────────────────────────────────
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", session.user.id)
      .single();

    if (profile) {
      currentUser = profile.username;
      enterChat();
    }
  }
});
