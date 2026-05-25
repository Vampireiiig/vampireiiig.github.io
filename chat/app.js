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
let allPlayers = [];
let tradeOffers = [];
let mapCells = [];
let selectedStateId = null;
let presenceChannel = null;
let messageChannel = null;
let dayTimer = null;
let pendingUsername = null;
let mapView = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 };

const DAY_LENGTH_MS = 12 * 60 * 60 * 1000;
const NEXT_DAY_UNLOCK_MS = 6 * 60 * 60 * 1000;
const MAINTENANCE_MS = 7 * 24 * 60 * 60 * 1000;
const MAP_WIDTH = 48;
const MAP_HEIGHT = 32;
const FALLBACK_STATES = [
  { id: "northwatch", name: "Northwatch", x: 1, y: 1, soldiers: 7, soldier_power: 2, money: 60, food: 90, water: 70, natural_oil_level: 0 },
  { id: "ironfield", name: "Ironfield", x: 2, y: 1, soldiers: 10, soldier_power: 2, money: 110, food: 80, water: 55, natural_oil_level: 1 },
  { id: "sunford", name: "Sunford", x: 3, y: 1, soldiers: 14, soldier_power: 3, money: 130, food: 120, water: 90, natural_oil_level: 0 },
  { id: "greenbay", name: "Greenbay", x: 1, y: 2, soldiers: 6, soldier_power: 1, money: 70, food: 160, water: 120, natural_oil_level: 0 },
  { id: "crownmere", name: "Crownmere", x: 2, y: 2, soldiers: 18, soldier_power: 4, money: 220, food: 150, water: 150, natural_oil_level: 2 },
  { id: "eastvale", name: "Eastvale", x: 3, y: 2, soldiers: 9, soldier_power: 2, money: 90, food: 80, water: 130, natural_oil_level: 0 },
  { id: "stonepass", name: "Stonepass", x: 1, y: 3, soldiers: 12, soldier_power: 3, money: 100, food: 65, water: 80, natural_oil_level: 1 },
  { id: "riverhold", name: "Riverhold", x: 2, y: 3, soldiers: 8, soldier_power: 2, money: 85, food: 140, water: 170, natural_oil_level: 0 },
  { id: "ashridge", name: "Ashridge", x: 3, y: 3, soldiers: 16, soldier_power: 4, money: 190, food: 100, water: 90, natural_oil_level: 2 },
  { id: "redmesa", name: "Redmesa", x: 4, y: 1, soldiers: 19, soldier_power: 4, money: 230, food: 120, water: 70, natural_oil_level: 3 },
  { id: "frostgate", name: "Frostgate", x: 5, y: 1, soldiers: 11, soldier_power: 3, money: 120, food: 75, water: 95, natural_oil_level: 0 },
  { id: "saltmarsh", name: "Saltmarsh", x: 6, y: 1, soldiers: 13, soldier_power: 3, money: 160, food: 95, water: 190, natural_oil_level: 1 },
  { id: "blackport", name: "Blackport", x: 4, y: 2, soldiers: 21, soldier_power: 5, money: 270, food: 130, water: 110, natural_oil_level: 2 },
  { id: "silverrun", name: "Silverrun", x: 5, y: 2, soldiers: 15, soldier_power: 3, money: 190, food: 180, water: 120, natural_oil_level: 0 },
  { id: "dunewatch", name: "Dunewatch", x: 6, y: 2, soldiers: 17, soldier_power: 4, money: 210, food: 80, water: 65, natural_oil_level: 3 },
  { id: "wolfpine", name: "Wolfpine", x: 4, y: 3, soldiers: 12, soldier_power: 2, money: 140, food: 210, water: 100, natural_oil_level: 0 },
  { id: "stormfen", name: "Stormfen", x: 5, y: 3, soldiers: 20, soldier_power: 5, money: 260, food: 140, water: 180, natural_oil_level: 1 },
  { id: "goldcliff", name: "Goldcliff", x: 6, y: 3, soldiers: 24, soldier_power: 6, money: 340, food: 160, water: 130, natural_oil_level: 2 },
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

window.toggleSidebar = function() {
  $("app-screen").classList.toggle("sidebar-collapsed");
};

window.toggleTutorial = function() {
  $("tutorial-modal").classList.toggle("hidden");
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
  pendingUsername = username;
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

  if (error?.message?.toLowerCase().includes("already registered")) {
    errEl.textContent = "Account already exists. Use Login instead.";
    return;
  }

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
  let { data: profile, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load failed:", error.message);
    return;
  }

  if (!profile) {
    const username = pendingUsername || sessionUser.email?.split("@")[0];
    if (!username) return;

    const { data: createdProfile, error: createProfileError } = await supabase
      .from("profiles")
      .insert({ id: sessionUser.id, username })
      .select("username")
      .single();

    if (createProfileError) {
      console.error("Profile repair failed:", createProfileError.message);
      return;
    }

    profile = createdProfile;
  }

  pendingUsername = null;
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
  buildMapCells();
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
      last_oil_collected_at: new Date().toISOString(),
      oil_cycle_minutes: randomOilCycleMinutes(),
      last_oil_maintenance_at: new Date().toISOString(),
      oil_failure_chance: 0.10,
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
      oil_rig_level: Number(starterState.natural_oil_level) || 0,
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

  const [{ data: player }, { data: owned }, { data: players }, { data: trades }] = await Promise.all([
    supabase.from("players").select("*").eq("id", sessionUser.id).single(),
    supabase.from("player_states").select("*").eq("player_id", sessionUser.id),
    supabase.from("profiles").select("username").order("username"),
    supabase.from("trade_offers").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  currentPlayer = player || currentPlayer;
  ownedStates = owned || [];
  allPlayers = (players || []).filter((playerRow) => playerRow.username !== currentUser);
  tradeOffers = trades || [];
  selectedStateId = selectedStateId || ownedStates[0]?.state_id || allStates[0]?.id;

  renderStats();
  renderMap();
  renderSelectedState();
  renderTradeControls();
  renderTradeOffers();
  updateNextDayButton();
  setupMapInteractions();
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
  $("stat-oil").textContent = getTotalOilLevels();
  $("war-status").textContent = `${currentUser}'s kingdom controls ${land} state${land === 1 ? "" : "s"}.`;
}

function renderMap() {
  const ownedIds = new Set(ownedStates.map((state) => state.state_id));
  $("map-grid").innerHTML = "";

  mapCells.forEach((cell) => {
    const state = allStates.find((item) => item.id === cell.stateId);
    if (!state) return;
    const owned = ownedIds.has(state.id);
    const ownedState = getOwnedState(state.id);
    const oilLevel = ownedState?.oil_rig_level || state.natural_oil_level || 0;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = [
      "map-cell",
      owned ? "owned" : "enemy",
      state.id === selectedStateId ? "selected" : "",
      cell.edges.top ? "edge-top" : "",
      cell.edges.right ? "edge-right" : "",
      cell.edges.bottom ? "edge-bottom" : "",
      cell.edges.left ? "edge-left" : "",
      cell.capital ? "capital" : "",
      oilLevel ? "oil" : "",
    ].join(" ");
    tile.style.backgroundColor = owned ? cell.ownedColor : cell.enemyColor;
    tile.title = `${getStateDisplayName(state)} | Soldiers: ${owned ? ownedState?.soldiers || 0 : state.soldiers} | Power: ${Number(state.soldier_power).toFixed(1)} | Oil: ${oilLevel}`;
    if (cell.capital) tile.dataset.label = `${getStateDisplayName(state)} S:${owned ? ownedState?.soldiers || 0 : state.soldiers} O:${oilLevel}`;
    if (oilLevel) tile.dataset.oil = oilLevel;
    tile.onclick = () => {
      selectedStateId = state.id;
      renderMap();
      renderSelectedState();
    };
    $("map-grid").appendChild(tile);
  });
}

function renderSelectedState() {
  const state = getSelectedState();
  if (!state) return;

  const owned = getOwnedState(state.id);
  $("rename-state-input").value = owned?.custom_name || "";
  $("oil-rig-info").textContent = owned
    ? `Level ${owned.oil_rig_level || 0}/5. Generates $${(owned.oil_rig_level || 0) * 10} every ${currentPlayer.oil_cycle_minutes || 50} minutes. Maintenance: ${getMaintenanceStatusText()}.`
    : `Enemy land. Natural oil level: ${state.natural_oil_level || 0}.`;
  $("selected-state").innerHTML = `
    <h3>${escapeHTML(getStateDisplayName(state))}</h3>
    <p>${owned ? "You own this state." : "Enemy territory."}</p>
    <p>Soldiers here: ${owned ? owned.soldiers : state.soldiers}</p>
    <p>Soldier power: ${Number(state.soldier_power).toFixed(1)}</p>
    <p>Oil rig level: ${owned ? owned.oil_rig_level || 0 : state.natural_oil_level || 0}</p>
    <p>Resources: $${state.money}, ${state.food} food, ${state.water} water</p>
  `;
}

window.buyResource = async function(type) {
  if (currentPlayer.money < 25) return addLog("Not enough money.");
  const patch = { money: currentPlayer.money - 25 };
  patch[type] = Number(currentPlayer[type]) + 50;
  await updatePlayer(patch);
  addLog(`Bought 50 ${type}.`);
};

window.renameSelectedState = async function() {
  const state = getSelectedState();
  const owned = state ? getOwnedState(state.id) : null;
  if (!state || !owned) return addLog("You can only rename states you own.");

  const customName = $("rename-state-input").value.trim();
  if (customName.length < 2) return addLog("State name needs at least 2 characters.");

  const { error } = await supabase
    .from("player_states")
    .update({ custom_name: customName })
    .eq("player_id", sessionUser.id)
    .eq("state_id", state.id);

  if (error) return console.error(error);
  addLog(`${state.name} renamed to ${customName}.`);
  await refreshGame();
};

window.sellResource = async function(type) {
  if (Number(currentPlayer[type]) < 50) return addLog(`Not enough ${type} to sell.`);
  await updatePlayer({
    [type]: Number(currentPlayer[type]) - 50,
    money: Number(currentPlayer.money) + 20,
  });
  addLog(`Sold 50 ${type} for $20.`);
};

window.buildOrUpgradeOilRig = async function() {
  const state = getSelectedState();
  const owned = state ? getOwnedState(state.id) : null;
  if (!state || !owned) return addLog("Select one of your own states first.");

  const level = owned.oil_rig_level || 0;
  if (level >= 5) return addLog("This oil rig is already level 5.");

  const cost = level === 0 ? 1000 : 500;
  if (Number(currentPlayer.money) < cost) return addLog(`You need $${cost} for this.`);

  const { error } = await supabase
    .from("player_states")
    .update({ oil_rig_level: level + 1 })
    .eq("player_id", sessionUser.id)
    .eq("state_id", state.id);

  if (error) return console.error(error);

  await updatePlayer({ money: Number(currentPlayer.money) - cost });
  addLog(`${getStateDisplayName(state)} oil rig is now level ${level + 1}.`);
};

window.collectOilIncome = async function() {
  const income = calculateOilIncome();
  if (income <= 0) return addLog("No oil income ready yet.");

  if (isOilMaintenanceOverdue()) {
    const chance = Number(currentPlayer.oil_failure_chance ?? 0.10);
    if (Math.random() < chance) {
      await updatePlayer({
        last_oil_collected_at: new Date().toISOString(),
        oil_cycle_minutes: randomOilCycleMinutes(),
        oil_failure_chance: Math.min(0.95, chance + 0.02),
      });
      addLog(`Oil rigs failed due to overdue maintenance. Failure chance is now ${Math.round(Math.min(0.95, chance + 0.02) * 100)}%.`);
      return;
    }

    await updatePlayer({
      money: Number(currentPlayer.money) + income,
      last_oil_collected_at: new Date().toISOString(),
      oil_cycle_minutes: randomOilCycleMinutes(),
      oil_failure_chance: Math.min(0.95, chance + 0.02),
    });
    addLog(`Collected $${income}, but maintenance is overdue. Failure chance is now ${Math.round(Math.min(0.95, chance + 0.02) * 100)}%.`);
    return;
  }

  await updatePlayer({
    money: Number(currentPlayer.money) + income,
    last_oil_collected_at: new Date().toISOString(),
    oil_cycle_minutes: randomOilCycleMinutes(),
    oil_failure_chance: 0.10,
  });
  addLog(`Collected $${income} from oil rigs.`);
};

window.maintainOilRigs = async function() {
  if (getTotalOilLevels() <= 0) return addLog("You do not own any oil rigs yet.");
  if (Number(currentPlayer.money) < 100) return addLog("You need $100 for oil rig maintenance.");

  await updatePlayer({
    money: Number(currentPlayer.money) - 100,
    last_oil_maintenance_at: new Date().toISOString(),
    oil_failure_chance: 0.10,
  });
  addLog("Oil rigs maintained. Failure chance reset to 10% if maintenance becomes overdue again.");
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
      oil_rig_level: Number(state.natural_oil_level) || 0,
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

window.createTradeOffer = async function() {
  const toUsername = $("trade-player").value;
  if (!toUsername) return addLog("Choose a player to trade with.");

  const offer = readTradeSide("offer");
  const request = readTradeSide("ask");
  if (!hasTradeValue(offer) && !hasTradeValue(request)) return addLog("Add something to offer or request.");
  if (!canAffordTradeSide(offer, currentPlayer)) return addLog("You cannot offer more than you own.");

  const { error } = await supabase.from("trade_offers").insert({
    from_player: sessionUser.id,
    from_username: currentUser,
    to_username: toUsername,
    offer,
    request,
  });

  if (error) return console.error(error);
  clearTradeForm();
  addLog(`Trade offer sent to ${toUsername}.`);
  await refreshGame();
};

window.acceptTradeOffer = async function(id) {
  const { error } = await supabase.rpc("accept_trade_offer", { trade_id: id });
  if (error) return addLog(`Trade failed: ${error.message}`);
  addLog("Trade accepted.");
  await refreshGame();
};

window.declineTradeOffer = async function(id) {
  const { error } = await supabase
    .from("trade_offers")
    .update({ status: "declined" })
    .eq("id", id);

  if (error) return console.error(error);
  addLog("Trade declined.");
  await refreshGame();
};

function renderTradeControls() {
  const playerSelect = $("trade-player");
  playerSelect.innerHTML = `<option value="">Choose player</option>`;
  allPlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.username;
    option.textContent = player.username;
    playerSelect.appendChild(option);
  });

}

function renderTradeOffers() {
  const list = $("trade-list");
  list.innerHTML = "";

  if (!tradeOffers.length) {
    list.innerHTML = `<p class="hint-text">No trade offers yet.</p>`;
    return;
  }

  tradeOffers.forEach((trade) => {
    const incoming = trade.to_username === currentUser;
    const card = document.createElement("div");
    card.className = "trade-card";
    card.innerHTML = `
      <strong>${incoming ? `${escapeHTML(trade.from_username)} offers` : `To ${escapeHTML(trade.to_username)}`}</strong>
      <p>Status: ${escapeHTML(trade.status)}</p>
      <p>They give: ${escapeHTML(formatTradeSide(trade.offer))}</p>
      <p>They want: ${escapeHTML(formatTradeSide(trade.request))}</p>
      ${incoming && trade.status === "pending" ? `
        <div class="trade-actions">
          <button class="primary-btn" type="button" onclick="acceptTradeOffer('${trade.id}')">Accept</button>
          <button class="danger-btn" type="button" onclick="declineTradeOffer('${trade.id}')">Decline</button>
        </div>
      ` : ""}
    `;
    list.appendChild(card);
  });
}

function readTradeSide(prefix) {
  return {
    money: clampNumber($(`${prefix}-money`).value, 0, 1000000),
    food: clampNumber($(`${prefix}-food`).value, 0, 1000000),
    water: clampNumber($(`${prefix}-water`).value, 0, 1000000),
    soldiers: clampNumber($(`${prefix}-soldiers`).value, 0, 1000000),
    population: clampNumber($(`${prefix}-population`).value, 0, 1000000),
    oil_rigs: clampNumber($(`${prefix}-oil-rigs`).value, 0, 1000000),
  };
}

function hasTradeValue(side) {
  return side.money || side.food || side.water || side.soldiers || side.population || side.oil_rigs;
}

function canAffordTradeSide(side, player) {
  return side.money <= Number(player.money) &&
    side.food <= Number(player.food) &&
    side.water <= Number(player.water) &&
    side.soldiers <= Number(player.soldiers) &&
    side.population <= Number(player.population) &&
    side.oil_rigs <= getTotalOilLevels();
}

function formatTradeSide(side) {
  const parts = [];
  ["money", "food", "water", "soldiers", "population"].forEach((key) => {
    if (Number(side?.[key]) > 0) parts.push(`${side[key]} ${key}`);
  });
  if (Number(side?.oil_rigs) > 0) parts.push(`${side.oil_rigs} oil rig level${Number(side.oil_rigs) === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "nothing";
}

function clearTradeForm() {
  ["offer-money", "offer-food", "offer-water", "offer-soldiers", "offer-population", "offer-oil-rigs", "ask-money", "ask-food", "ask-water", "ask-soldiers", "ask-population", "ask-oil-rigs"].forEach((id) => {
    $(id).value = 0;
  });
}

function getTotalOilLevels() {
  return ownedStates.reduce((total, state) => total + Number(state.oil_rig_level || 0), 0);
}

function calculateOilIncome() {
  const oilLevels = getTotalOilLevels();
  if (!oilLevels) return 0;

  const lastCollected = currentPlayer?.last_oil_collected_at
    ? new Date(currentPlayer.last_oil_collected_at).getTime()
    : Date.now();
  const elapsedMinutes = Math.min(50 * 60, Math.max(0, (Date.now() - lastCollected) / 60000));
  const cycleMinutes = Number(currentPlayer?.oil_cycle_minutes) || 50;
  const completedCycles = Math.floor(elapsedMinutes / cycleMinutes);
  return oilLevels * 10 * completedCycles;
}

function randomOilCycleMinutes() {
  return Math.floor(35 + Math.random() * 36);
}

function isOilMaintenanceOverdue() {
  if (getTotalOilLevels() <= 0) return false;
  const maintainedAt = currentPlayer?.last_oil_maintenance_at
    ? new Date(currentPlayer.last_oil_maintenance_at).getTime()
    : 0;
  return Date.now() - maintainedAt > MAINTENANCE_MS;
}

function getMaintenanceStatusText() {
  if (getTotalOilLevels() <= 0) return "no rigs";
  const maintainedAt = currentPlayer?.last_oil_maintenance_at
    ? new Date(currentPlayer.last_oil_maintenance_at).getTime()
    : Date.now();
  const remaining = MAINTENANCE_MS - (Date.now() - maintainedAt);
  if (remaining <= 0) {
    return `overdue, ${Math.round(Number(currentPlayer.oil_failure_chance ?? 0.10) * 100)}% fail chance`;
  }
  return `due in ${formatDuration(remaining)}`;
}

window.zoomMap = function(delta) {
  mapView.scale = Math.max(0.45, Math.min(2.3, mapView.scale + delta));
  applyMapTransform();
};

window.resetMapView = function() {
  mapView = { ...mapView, scale: 1, x: 0, y: 0, dragging: false };
  applyMapTransform();
};

function setupMapInteractions() {
  const viewport = $("map-viewport");
  if (!viewport || viewport.dataset.ready) return;
  viewport.dataset.ready = "true";

  viewport.addEventListener("pointerdown", (event) => {
    mapView.dragging = true;
    mapView.startX = event.clientX;
    mapView.startY = event.clientY;
    mapView.originX = mapView.x;
    mapView.originY = mapView.y;
    viewport.classList.add("dragging");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!mapView.dragging) return;
    mapView.x = mapView.originX + event.clientX - mapView.startX;
    mapView.y = mapView.originY + event.clientY - mapView.startY;
    applyMapTransform();
  });

  viewport.addEventListener("pointerup", (event) => {
    mapView.dragging = false;
    viewport.classList.remove("dragging");
    viewport.releasePointerCapture(event.pointerId);
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const oldScale = mapView.scale;
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    mapView.scale = Math.max(0.45, Math.min(2.3, mapView.scale + delta));
    const rect = viewport.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const factor = mapView.scale / oldScale;
    mapView.x = mx - (mx - mapView.x) * factor;
    mapView.y = my - (my - mapView.y) * factor;
    applyMapTransform();
  }, { passive: false });

  applyMapTransform();
}

function applyMapTransform() {
  const grid = $("map-grid");
  if (!grid) return;
  grid.style.transform = `translate(${mapView.x}px, ${mapView.y}px) scale(${mapView.scale})`;
  $("zoom-label").textContent = `${Math.round(mapView.scale * 100)}%`;
}

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

function buildMapCells() {
  const maxStateX = Math.max(...allStates.map((state) => Number(state.x) || 1), 1);
  const maxStateY = Math.max(...allStates.map((state) => Number(state.y) || 1), 1);
  const seeds = allStates.map((state, index) => {
    const rng = seededRandom(hashString(state.id));
    return {
      stateId: state.id,
      x: Math.floor(((state.x - 0.5) / maxStateX) * MAP_WIDTH + (rng() - 0.5) * 4),
      y: Math.floor(((state.y - 0.5) / maxStateY) * MAP_HEIGHT + (rng() - 0.5) * 4),
      index,
    };
  });

  const cells = [];
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const nearest = seeds.reduce((best, seed) => {
        const wobble = Math.sin((x + seed.index) * 1.7) + Math.cos((y - seed.index) * 1.3);
        const distance = (x - seed.x) ** 2 + (y - seed.y) ** 2 + wobble * 3;
        return !best || distance < best.distance ? { seed, distance } : best;
      }, null).seed;
      cells.push({ x, y, stateId: nearest.stateId });
    }
  }

  mapCells = cells.map((cell) => {
    const same = (dx, dy) => cells.find((other) => other.x === cell.x + dx && other.y === cell.y + dy)?.stateId === cell.stateId;
    const stateCells = cells.filter((other) => other.stateId === cell.stateId);
    const center = stateCells.reduce((acc, item) => ({ x: acc.x + item.x, y: acc.y + item.y }), { x: 0, y: 0 });
    center.x /= stateCells.length;
    center.y /= stateCells.length;
    const capital = stateCells.reduce((best, item) => {
      const distance = (item.x - center.x) ** 2 + (item.y - center.y) ** 2;
      return !best || distance < best.distance ? { item, distance } : best;
    }, null).item;

    return {
      ...cell,
      capital: capital.x === cell.x && capital.y === cell.y,
      edges: {
        top: !same(0, -1),
        right: !same(1, 0),
        bottom: !same(0, 1),
        left: !same(-1, 0),
      },
      ownedColor: colorForState(cell.stateId, true),
      enemyColor: colorForState(cell.stateId, false),
    };
  });
}

function colorForState(id, owned) {
  const hue = hashString(id) % 360;
  return owned ? `hsl(${hue} 48% 31%)` : `hsl(${hue} 38% 24%)`;
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededRandom(seed) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function getSelectedState() {
  return allStates.find((state) => state.id === selectedStateId);
}

function getOwnedState(id) {
  return ownedStates.find((state) => state.state_id === id);
}

function getStateDisplayName(state) {
  return getOwnedState(state.id)?.custom_name || state.name;
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
  const days = Math.floor(hours / 24);
  const hourRemainder = hours % 24;
  if (days > 0) return `${days}d ${hourRemainder}h`;
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
