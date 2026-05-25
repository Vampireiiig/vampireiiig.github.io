import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://jhfyvpwiutuztvajcojq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZnl2cHdpdXR1enR2YWpjb2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTEwOTIsImV4cCI6MjA5NTI2NzA5Mn0.Bg3LCk02pYWyG3Rb1qIDZTmNA-LqqVXhCi2iNXOoJGY"
);

const fakeEmail = (username) => `${username.toLowerCase()}@rgd.chat`;

let sessionUser = null;
let currentUser = null;
let currentPlayer = null;
let allStates = [];
let ownedStates = [];
let selectedStateId = null;
let presenceChannel = null;
let messageChannel = null;
let dayTimer = null;

const DAY_LENGTH_MS = 12 * 60 * 60 * 1000;
const NEXT_DAY_UNLOCK_MS = 6 * 60 * 60 * 1000;
const FALLBACK_STATES = [
  { id: "northwatch", name: "Northwatch", x: 1, y: 1, soldiers: 7, soldier_power: 2, money: 60, food: 90, water: 70 },
  { id: "ironfield", name: "Ironfield", x: 2, y: 1, soldiers: 10, soldier_power: 2, money: 110, food: 80, water: 55 },
  { id: "sunford", name: "Sunford", x: 3, y: 1, soldiers: 14, soldier_power: 3, money: 130, food: 120, water: 90 },
  { id: "greenbay", name: "Greenbay", x: 1, y: 2, soldiers: 6, soldier_power: 1, money: 70, food: 160, water: 120 },
  { id: "crownmere", name: "Crownmere", x: 2, y: 2, soldiers: 18, soldier_power: 4, money: 220, food: 150, water: 150 },
  { id: "eastvale", name: "Eastvale", x: 3, y: 2, soldiers: 9, soldier_power: 2, money: 90, food: 80, water: 130 },
  { id: "stonepass", name: "Stonepass", x: 1, y: 3, soldiers: 12, soldier_power: 3, money: 100, food: 65, water: 80 },
  { id: "riverhold", name: "Riverhold", x: 2, y: 3, soldiers: 8, soldier_power: 2, money: 85, food: 140, water: 170 },
  { id: "ashridge", name: "Ashridge", x: 3, y: 3, soldiers: 16, soldier_power: 4, money: 190, food: 100, water: 90 },
];

const $ = (id) => document.getElementById(id);

window.switchTab = function(tab) {
  $("form-login").classList.toggle("hidden", tab !== "login");
  $("form-signup").classList.toggle("hidden", tab !== "signup");
  $("tab-login").classList.toggle("active", tab === "login");
  $("tab-signup").classList.toggle("active", tab === "signup");
};

window.setView = function(view) {
  $("chat-view").classList.toggle("active", view === "chat");
  $("war-view").classList.toggle("active", view === "war");
  $("view-chat").classList.toggle("active", view === "chat");
  $("view-war").classList.toggle("active", view === "war");
  if (view === "war") refreshGame();
};

window.handleLogin = async function() {
  const username = $("login-username").value.trim();
  const password = $("login-password").value;
  const errEl = $("login-error");
  errEl.textContent = "";

  if (!username || !password) {
    errEl.textContent = "Fill in all fields.";
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: fakeEmail(username),
    password,
  });

  if (error) {
    errEl.textContent = "Incorrect username or password.";
    return;
  }

  sessionUser = data.user;
  await loadProfileAndEnter();
};

window.handleSignup = async function() {
  const username = $("signup-username").value.trim();
  const password = $("signup-password").value;
  const errEl = $("signup-error");
  errEl.textContent = "";

  if (!username || !password) {
    errEl.textContent = "Fill in all fields.";
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    errEl.textContent = "Username must be 3-16 letters, numbers, or underscores.";
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    return;
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    errEl.textContent = "That username is already taken.";
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email: fakeEmail(username),
    password,
  });

  if (error) {
    errEl.textContent = error.message;
    return;
  }

  sessionUser = data.user;

  const { error: profileErr } = await supabase.from("profiles").insert({
    id: sessionUser.id,
    username,
  });

  if (profileErr) {
    errEl.textContent = profileErr.message;
    return;
  }

  await loadProfileAndEnter();
};

window.handleLogout = async function() {
  if (presenceChannel) await supabase.removeChannel(presenceChannel);
  if (messageChannel) await supabase.removeChannel(messageChannel);
  if (dayTimer) clearTimeout(dayTimer);
  await supabase.auth.signOut();
  sessionUser = null;
  currentUser = null;
  currentPlayer = null;
  $("messages").innerHTML = "";
  $("online-list").innerHTML = "";
  $("online-count").textContent = "0";
  showScreen("auth-screen");
};

async function loadProfileAndEnter() {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", sessionUser.id)
    .single();

  if (error || !profile) return;
  currentUser = profile.username;
  showScreen("app-screen");
  await Promise.all([loadMessages(), setupGame()]);
  subscribeToMessages();
  trackPresence();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  $(id).classList.add("active");
}

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) return console.error(error);

  $("messages").innerHTML = "";
  data.forEach(appendMessage);
  scrollToBottom();
}

function subscribeToMessages() {
  if (messageChannel) supabase.removeChannel(messageChannel);

  messageChannel = supabase
    .channel("messages-feed")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      appendMessage(payload.new);
      scrollToBottom();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
      const oldNode = document.querySelector(`[data-message-id="${payload.new.id}"]`);
      if (oldNode) oldNode.remove();
      appendMessage(payload.new);
      scrollToBottom();
    })
    .subscribe();
}

window.sendMessage = async function() {
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text || !sessionUser) return;
  input.value = "";

  const { error } = await supabase.from("messages").insert({
    user_id: sessionUser.id,
    username: currentUser,
    content: text,
  });

  if (error) {
    input.value = text;
    console.error("Send failed:", error.message);
  }
};

window.deleteMessage = async function(id) {
  const { error } = await supabase
    .from("messages")
    .update({ deleted: true, content: "" })
    .eq("id", id)
    .eq("user_id", sessionUser.id);

  if (error) console.error("Delete failed:", error.message);
};

function appendMessage(msg) {
  const container = $("messages");
  if (document.querySelector(`[data-message-id="${msg.id}"]`)) return;

  const isOwn = msg.user_id === sessionUser?.id || msg.username === currentUser;
  const div = document.createElement("div");
  div.className = `msg${isOwn ? " own" : ""}`;
  div.dataset.messageId = msg.id || crypto.randomUUID();

  const timeStr = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const text = msg.deleted ? "<em>Message deleted</em>" : escapeHTML(msg.content);
  const deleteButton = isOwn && !msg.deleted
    ? `<button class="delete-msg" type="button" onclick="deleteMessage('${msg.id}')">Delete</button>`
    : "";

  div.innerHTML = `
    <div class="msg-avatar">${escapeHTML(msg.username).charAt(0).toUpperCase()}</div>
    <div class="msg-bubble">
      <div class="msg-meta">
        <span class="msg-username">${escapeHTML(msg.username)}</span>
        <span class="msg-time">${timeStr}</span>
        ${deleteButton}
      </div>
      <div class="msg-text">${text}</div>
    </div>
  `;
  container.appendChild(div);
}

function trackPresence() {
  if (presenceChannel) supabase.removeChannel(presenceChannel);

  presenceChannel = supabase.channel("online-users", {
    config: { presence: { key: currentUser } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      updateOnlineUsers(Object.keys(presenceChannel.presenceState()));
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({ username: currentUser, at: new Date().toISOString() });
      }
    });
}

function updateOnlineUsers(users) {
  $("online-count").textContent = users.length;
  $("online-list").innerHTML = "";
  users.sort().forEach((username) => {
    const li = document.createElement("li");
    li.textContent = username;
    $("online-list").appendChild(li);
  });
}

async function setupGame() {
  await loadStates();
  await loadOrCreatePlayer();
  await refreshGame();
}

async function loadStates() {
  const { data, error } = await supabase.from("states").select("*").order("y").order("x");
  if (error) {
    console.error(error);
    allStates = FALLBACK_STATES;
    addLog("Using built-in map. Run setup.sql in Supabase if battles fail.");
    return;
  }
  allStates = data?.length ? data : FALLBACK_STATES;
}

async function loadOrCreatePlayer() {
  const { data } = await supabase
    .from("players")
    .select("*")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (data) {
    currentPlayer = data;
    await fixOldStarterKitIfNeeded();
    return;
  }

  const starterState = allStates.reduce((best, state) => (
    !best || state.soldiers < best.soldiers ? state : best
  ), null);

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      id: sessionUser.id,
      username: currentUser,
      money: 100,
      food: 50,
      water: 50,
      population: 10,
      soldiers: 3,
      soldier_power: 1,
      day: 1,
      last_day_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return console.error(error);
  currentPlayer = created;

  if (starterState) {
    await supabase.from("player_states").insert({
      player_id: sessionUser.id,
      state_id: starterState.id,
      soldiers: 3,
    });
    selectedStateId = starterState.id;
  }
}

async function fixOldStarterKitIfNeeded() {
  const looksLikeOldStarter =
    currentPlayer.day === 1 &&
    Number(currentPlayer.money) === 100 &&
    Number(currentPlayer.food) === 100 &&
    Number(currentPlayer.water) === 100 &&
    currentPlayer.population === 10 &&
    currentPlayer.soldiers === 3;

  if (!looksLikeOldStarter) return;
  await updatePlayer({ food: 50, water: 50 });
}

async function refreshGame() {
  if (!sessionUser) return;

  const [{ data: player }, { data: owned }] = await Promise.all([
    supabase.from("players").select("*").eq("id", sessionUser.id).single(),
    supabase.from("player_states").select("*").eq("player_id", sessionUser.id),
  ]);

  currentPlayer = player || currentPlayer;
  ownedStates = owned || [];
  selectedStateId = selectedStateId || ownedStates[0]?.state_id || allStates[0]?.id;

  renderStats();
  renderMap();
  renderSelectedState();
  updateNextDayButton();
}

function renderStats() {
  const land = ownedStates.length;
  $("stat-money").textContent = `$${Math.floor(currentPlayer.money)}`;
  $("stat-food").textContent = Math.floor(currentPlayer.food);
  $("stat-water").textContent = Math.floor(currentPlayer.water);
  $("stat-population").textContent = currentPlayer.population;
  $("stat-soldiers").textContent = currentPlayer.soldiers;
  $("stat-power").textContent = Number(currentPlayer.soldier_power).toFixed(1);
  $("stat-land").textContent = land;
  $("stat-day").textContent = currentPlayer.day;
  $("war-status").textContent = `${currentUser}'s kingdom controls ${land} state${land === 1 ? "" : "s"}.`;
}

function renderMap() {
  const ownedIds = new Set(ownedStates.map((state) => state.state_id));
  $("map-grid").innerHTML = "";

  allStates.forEach((state) => {
    const owned = ownedIds.has(state.id);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `state-tile ${owned ? "owned" : "enemy"} ${state.id === selectedStateId ? "selected" : ""}`;
    tile.onclick = () => {
      selectedStateId = state.id;
      renderMap();
      renderSelectedState();
    };
    tile.innerHTML = `
      <div>
        <div class="state-name">${escapeHTML(state.name)}</div>
        <div class="state-owner">${owned ? "Your land" : "Unconquered"}</div>
      </div>
      <div class="state-stats">
        <span>Soldiers: ${owned ? getOwnedState(state.id)?.soldiers || 0 : state.soldiers}</span>
        <span>Power: ${Number(state.soldier_power).toFixed(1)}</span>
        <span>Loot: $${state.money} / ${state.food} food / ${state.water} water</span>
      </div>
    `;
    $("map-grid").appendChild(tile);
  });
}

function renderSelectedState() {
  const state = getSelectedState();
  if (!state) return;

  const owned = getOwnedState(state.id);
  $("selected-state").innerHTML = `
    <h3>${escapeHTML(state.name)}</h3>
    <p>${owned ? "You own this state." : "Enemy territory."}</p>
    <p>Soldiers here: ${owned ? owned.soldiers : state.soldiers}</p>
    <p>Soldier power: ${Number(state.soldier_power).toFixed(1)}</p>
  `;
}

window.buyResource = async function(type) {
  if (currentPlayer.money < 25) return addLog("Not enough money.");
  const patch = { money: currentPlayer.money - 25 };
  patch[type] = Number(currentPlayer[type]) + 50;
  await updatePlayer(patch);
  addLog(`Bought 50 ${type}.`);
};

window.sellResource = async function(type) {
  if (Number(currentPlayer[type]) < 50) return addLog(`Not enough ${type} to sell.`);
  await updatePlayer({
    [type]: Number(currentPlayer[type]) - 50,
    money: Number(currentPlayer.money) + 20,
  });
  addLog(`Sold 50 ${type} for $20.`);
};

window.advanceDay = async function() {
  const elapsed = getDayElapsedMs();
  if (elapsed < NEXT_DAY_UNLOCK_MS) {
    addLog(`Next day unlocks in ${formatDuration(NEXT_DAY_UNLOCK_MS - elapsed)}.`);
    updateNextDayButton();
    return;
  }

  const popGain = Math.random() < 0.1 ? Math.ceil(currentPlayer.population * 0.1) : 0;
  const soldierJoin = currentPlayer.population > 1 && Math.random() < 0.01 ? 1 : 0;
  const consumptionRate = 0.8 + Math.random() * 0.5;
  const consumed = Math.ceil(currentPlayer.population * consumptionRate);

  const food = Math.max(0, Number(currentPlayer.food) - consumed);
  const water = Math.max(0, Number(currentPlayer.water) - consumed);
  const starving = food === 0 || water === 0;
  const populationLoss = starving ? Math.ceil(currentPlayer.population * 0.1) : 0;

  await updatePlayer({
    day: currentPlayer.day + 1,
    food,
    water,
    population: Math.max(1, currentPlayer.population + popGain - populationLoss - soldierJoin),
    soldiers: currentPlayer.soldiers + soldierJoin,
    money: Number(currentPlayer.money) + ownedStates.length * 10,
    last_day_at: new Date().toISOString(),
  });

  addLog(`Day advanced. Used ${consumed} food and water.${popGain ? ` Population grew by ${popGain}.` : ""}${soldierJoin ? " One citizen joined the soldiers." : ""}${starving ? " Shortages hurt your population." : ""}`);
};

window.attackSelectedState = async function() {
  const state = getSelectedState();
  if (!state) return;
  if (getOwnedState(state.id)) return addLog("You already own this state.");

  const sent = clampNumber($("attack-count").value, 1, currentPlayer.soldiers);
  if (sent > currentPlayer.soldiers) return addLog("You do not have that many soldiers.");

  const result = simulateBattle({
    attackerCount: sent,
    attackerPower: Number(currentPlayer.soldier_power),
    defenderCount: state.soldiers,
    defenderPower: Number(state.soldier_power),
  });

  let patch = {
    soldiers: currentPlayer.soldiers - sent + result.attackerRemaining,
  };

  if (result.won) {
    const powerGain = result.powerGain;
    patch = {
      ...patch,
      money: Number(currentPlayer.money) + Number(state.money),
      food: Number(currentPlayer.food) + Number(state.food),
      water: Number(currentPlayer.water) + Number(state.water),
      soldier_power: Number(currentPlayer.soldier_power) + powerGain,
    };

    await supabase.from("player_states").insert({
      player_id: sessionUser.id,
      state_id: state.id,
      soldiers: Math.max(1, result.attackerRemaining),
    });
  }

  await updatePlayer(patch);
  await supabase.from("battles").insert({
    player_id: sessionUser.id,
    state_id: state.id,
    result: result.won ? "won" : "lost",
    report: result.report,
  });

  addLog(result.report);
};

window.moveSoldiersToSelectedState = async function() {
  const state = getSelectedState();
  const owned = state ? getOwnedState(state.id) : null;
  if (!state || !owned) return addLog("Select one of your own states first.");

  const count = clampNumber($("move-count").value, 1, currentPlayer.soldiers);
  if (count > currentPlayer.soldiers) return addLog("You do not have that many free soldiers.");

  const { error } = await supabase
    .from("player_states")
    .update({ soldiers: owned.soldiers + count })
    .eq("player_id", sessionUser.id)
    .eq("state_id", state.id);

  if (error) return console.error(error);
  await updatePlayer({ soldiers: currentPlayer.soldiers - count });
  addLog(`Moved ${count} soldier${count === 1 ? "" : "s"} to ${state.name}.`);
};

window.saveGame = async function() {
  await updatePlayer({});
  addLog("Game saved.");
};

async function updatePlayer(patch) {
  const { data, error } = await supabase
    .from("players")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", sessionUser.id)
    .select()
    .single();

  if (error) return console.error(error);
  currentPlayer = data;
  await refreshGame();
}

function simulateBattle({ attackerCount, attackerPower, defenderCount, defenderPower }) {
  let attackers = makeSoldiers(attackerCount, attackerPower);
  let defenders = makeSoldiers(defenderCount, defenderPower);
  let totalHealthLost = 0;
  let seconds = 0;

  while (attackers.length && defenders.length && seconds < 5000) {
    const a = attackers[0];
    const d = defenders[0];
    a.hp -= defenderPower + 1;
    d.hp -= attackerPower + 1;
    seconds += 1;

    if (a.hp <= 0) attackers.shift();
    if (d.hp <= 0) defenders.shift();
  }

  attackers.forEach((soldier) => {
    totalHealthLost += Math.max(0, soldier.maxHp - soldier.hp);
  });

  const won = attackers.length > 0;
  const remaining = attackers.length;
  const powerGain = won && remaining ? totalHealthLost / (10 * remaining) : 0;

  return {
    won,
    attackerRemaining: remaining,
    powerGain,
    report: won
      ? `Victory! ${remaining} soldier${remaining === 1 ? "" : "s"} survived and gained ${powerGain.toFixed(2)} average power.`
      : "Defeat. Your attacking soldiers were lost.",
  };
}

function makeSoldiers(count, power) {
  return Array.from({ length: count }, () => {
    const hp = power * 10 + 20;
    return { hp, maxHp: hp };
  });
}

function getSelectedState() {
  return allStates.find((state) => state.id === selectedStateId);
}

function getOwnedState(id) {
  return ownedStates.find((state) => state.state_id === id);
}

function addLog(text) {
  const p = document.createElement("p");
  p.textContent = text;
  $("battle-log").prepend(p);
}

function updateNextDayButton() {
  const button = $("next-day-btn");
  if (!button || !currentPlayer) return;

  if (dayTimer) clearTimeout(dayTimer);

  const elapsed = getDayElapsedMs();
  const unlockRemaining = NEXT_DAY_UNLOCK_MS - elapsed;
  const fullDayRemaining = DAY_LENGTH_MS - elapsed;

  if (unlockRemaining > 0) {
    button.disabled = true;
    button.textContent = `Next Day in ${formatDuration(unlockRemaining)}`;
    $("war-status").textContent = `${currentUser}'s kingdom controls ${ownedStates.length} state${ownedStates.length === 1 ? "" : "s"}. Day is 12 hours.`;
    dayTimer = setTimeout(updateNextDayButton, 60000);
    return;
  }

  button.disabled = false;
  button.textContent = fullDayRemaining > 0
    ? `Next Day Available (${formatDuration(fullDayRemaining)} left)`
    : "Start Next Day";
  dayTimer = setTimeout(updateNextDayButton, 60000);
}

function getDayElapsedMs() {
  const started = currentPlayer?.last_day_at ? new Date(currentPlayer.last_day_at).getTime() : Date.now();
  return Math.max(0, Date.now() - started);
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function scrollToBottom() {
  $("messages").scrollTop = $("messages").scrollHeight;
}

function clampNumber(value, min, max) {
  const number = Math.floor(Number(value));
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (!session) return;
  sessionUser = session.user;
  await loadProfileAndEnter();
});
