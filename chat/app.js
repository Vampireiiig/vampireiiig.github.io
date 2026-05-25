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

const DAY_LENGTH_MS = 12 * 60 * 60 * 1000;
const NEXT_DAY_UNLOCK_MS = 6 * 60 * 60 * 1000;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;
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

  mapCells.forEach((cell) => {
    const state = allStates.find((item) => item.id === cell.stateId);
    if (!state) return;
    const owned = ownedIds.has(state.id);
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
    ].join(" ");
    tile.style.backgroundColor = owned ? cell.ownedColor : cell.enemyColor;
    tile.title = getStateDisplayName(state);
    if (cell.capital) tile.dataset.label = getStateDisplayName(state);
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
  $("selected-state").innerHTML = `
    <h3>${escapeHTML(getStateDisplayName(state))}</h3>
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

  const landSelect = $("offer-land");
  landSelect.innerHTML = `<option value="">No land</option>`;
  ownedStates.forEach((owned) => {
    const state = allStates.find((item) => item.id === owned.state_id);
    if (!state) return;
    const option = document.createElement("option");
    option.value = state.id;
    option.textContent = getStateDisplayName(state);
    landSelect.appendChild(option);
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
  const landValue = prefix === "offer" ? $("offer-land").value : $("ask-land").value.trim();
  return {
    money: clampNumber($(`${prefix}-money`).value, 0, 1000000),
    food: clampNumber($(`${prefix}-food`).value, 0, 1000000),
    water: clampNumber($(`${prefix}-water`).value, 0, 1000000),
    soldiers: clampNumber($(`${prefix}-soldiers`).value, 0, 1000000),
    population: clampNumber($(`${prefix}-population`).value, 0, 1000000),
    land: landValue || "",
  };
}

function hasTradeValue(side) {
  return side.money || side.food || side.water || side.soldiers || side.population || side.land;
}

function canAffordTradeSide(side, player) {
  return side.money <= Number(player.money) &&
    side.food <= Number(player.food) &&
    side.water <= Number(player.water) &&
    side.soldiers <= Number(player.soldiers) &&
    side.population <= Number(player.population);
}

function formatTradeSide(side) {
  const parts = [];
  ["money", "food", "water", "soldiers", "population"].forEach((key) => {
    if (Number(side?.[key]) > 0) parts.push(`${side[key]} ${key}`);
  });
  if (side?.land) parts.push(`land: ${side.land}`);
  return parts.length ? parts.join(", ") : "nothing";
}

function clearTradeForm() {
  ["offer-money", "offer-food", "offer-water", "offer-soldiers", "offer-population", "ask-money", "ask-food", "ask-water", "ask-soldiers", "ask-population"].forEach((id) => {
    $(id).value = 0;
  });
  $("offer-land").value = "";
  $("ask-land").value = "";
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
  const seeds = allStates.map((state, index) => {
    const rng = seededRandom(hashString(state.id));
    return {
      stateId: state.id,
      x: Math.floor(((state.x - 0.5) / 3) * MAP_WIDTH + (rng() - 0.5) * 3),
      y: Math.floor(((state.y - 0.5) / 3) * MAP_HEIGHT + (rng() - 0.5) * 3),
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
