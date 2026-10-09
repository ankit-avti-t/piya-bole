const SERVER_ORIGIN = window.location.protocol === "file:" ? "http://localhost:3000" : window.location.origin;
const API = `${SERVER_ORIGIN}/api`;
const token = () => localStorage.getItem("orbit-token");
const state = { user: JSON.parse(localStorage.getItem("orbit-user") || "null"), users: [], recentSearches: JSON.parse(localStorage.getItem("piya-recent-searches") || "[]"), customBots: JSON.parse(localStorage.getItem("piya-custom-bots") || "[]"), cryptoPrivateKey: null, cryptoReady: false, chatbotEditingId: null, messageMenuId: null, reactionMessageId: null, editingMessageId: null, searchResults: [], active: null, messages: [], authMode: "login", socket: null, profileTarget: null, profileDraftMedia: [], profileDraftPicture: "", onboarding: Number(localStorage.getItem("orbit-onboarding-step") || "0"), pendingAttachment: null, unread: {}, settingsOpen: false, sidebarWidth: Number(localStorage.getItem("piya-sidebar-width") || "335"), sidebarCollapsed: localStorage.getItem("piya-sidebar-collapsed") === "true", sidebarHidden: localStorage.getItem("piya-sidebar-hidden") === "true" };
const bots = [
  { id: "bot-orbit", name: "Piya AI", initials: "AI", profilePic: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ff6f61'/%3E%3Cstop offset='1' stop-color='%237657f6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='34' fill='url(%23g)'/%3E%3Ccircle cx='60' cy='58' r='31' fill='%23fff' opacity='.95'/%3E%3Ccircle cx='49' cy='55' r='5' fill='%2324143f'/%3E%3Ccircle cx='71' cy='55' r='5' fill='%2324143f'/%3E%3Cpath d='M47 70c8 8 18 8 26 0' fill='none' stroke='%2324143f' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M60 23v-9M55 14h10' stroke='%23fff' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E", bot: true, online: true, description: "Your helpful chat assistant" },
  { id: "bot-focus", name: "Focus Coach", initials: "FC", profilePic: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%232fc9a0'/%3E%3Cstop offset='1' stop-color='%233879e8'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='34' fill='url(%23g)'/%3E%3Ccircle cx='60' cy='58' r='31' fill='%23fff' opacity='.95'/%3E%3Cpath d='M43 53h15M62 53h15' stroke='%2324143f' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M47 72h26' stroke='%2324143f' stroke-width='5' stroke-linecap='round'/%3E%3Cpath d='M60 22v-7M54 15h12' stroke='%23fff' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E", bot: true, online: true, description: "Plan your day and stay focused" }
];
const botMessages = JSON.parse(localStorage.getItem("orbit-bot-messages") || "{}");
const avatarChoices = ["🪐", "🌙", "⚡", "🌈", "🦋", "🐼", "🦊", "🐸", "👾", "🔥", "🌻", "🎧"];
function allBots() { return [...state.customBots, ...bots]; }
function nextChatbotName() {
  let number = state.customBots.length + 1;
  while (state.customBots.some(bot => bot.name.toLowerCase() === `chatbot${number}`)) number += 1;
  return `Chatbot${number}`;
}
function saveCustomBots() { localStorage.setItem("piya-custom-bots", JSON.stringify(state.customBots)); }
function saveRecentSearches() { localStorage.setItem("piya-recent-searches", JSON.stringify(state.recentSearches)); }
function addRecentSearch(user) {
  state.recentSearches = [user, ...state.recentSearches.filter(item => item.id !== user.id)].slice(0, 8);
  saveRecentSearches();
}
function removeRecentSearch(userId) {
  state.recentSearches = state.recentSearches.filter(user => user.id !== userId);
  saveRecentSearches();
  render();
}
function messageKey(message) { return message.id || `local-${message.createdAt}`; }
async function ensureCryptoIdentity() {
  if (!window.crypto?.subtle || !state.user) return;
  const stored = localStorage.getItem("piya-e2ee-private-key");
  if (stored) state.cryptoPrivateKey = await crypto.subtle.importKey("jwk", JSON.parse(stored), { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  else {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    state.cryptoPrivateKey = pair.privateKey;
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    localStorage.setItem("piya-e2ee-private-key", JSON.stringify(privateJwk));
    state.user.publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const result = await request("/crypto-key", { method: "PATCH", body: JSON.stringify({ publicKey: state.user.publicKey }) });
    state.user.publicKey = result.publicKey;
    localStorage.setItem("orbit-user", JSON.stringify(state.user));
  }
  if (!state.user.publicKey) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
    state.cryptoPrivateKey = pair.privateKey;
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    state.user.publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
    localStorage.setItem("piya-e2ee-private-key", JSON.stringify(privateJwk));
    await request("/crypto-key", { method: "PATCH", body: JSON.stringify({ publicKey: state.user.publicKey }) });
    localStorage.setItem("orbit-user", JSON.stringify(state.user));
  }
  state.cryptoReady = true;
}
async function sharedKeyFor(user) {
  if (!state.cryptoPrivateKey || !user?.publicKey) throw new Error("This contact has not enabled secure messaging yet.");
  const publicKey = await crypto.subtle.importKey("jwk", user.publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: publicKey }, state.cryptoPrivateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function bytesToBase64(bytes) { const view = new Uint8Array(bytes); let binary = ""; for (let index = 0; index < view.length; index += 0x8000) binary += String.fromCharCode(...view.subarray(index, index + 0x8000)); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
async function encryptPayload(payload, recipient) {
  const key = await sharedKeyFor(recipient);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { version: 1, iv: bytesToBase64(iv), data: bytesToBase64(encrypted) };
}
async function decryptMessage(message) {
  if (!message.encrypted) return message;
  try {
    const other = message.senderId === state.user.id ? state.active : [...state.users, ...state.searchResults].find(user => user.id === message.senderId);
    const key = await sharedKeyFor(other);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(message.encrypted.iv) }, key, base64ToBytes(message.encrypted.data));
    return { ...message, ...JSON.parse(new TextDecoder().decode(decrypted)), encrypted: message.encrypted };
  } catch {
    return { ...message, text: "Unable to decrypt this message on this device.", decryptionError: true };
  }
}
async function decryptMessages(messages) { return Promise.all(messages.map(decryptMessage)); }
function finishChatbotName(botId, value) {
  const bot = state.customBots.find(item => item.id === botId);
  if (!bot) return;
  bot.name = value.trim().slice(0, 40) || bot.defaultName || nextChatbotName();
  bot.initials = initials(bot.name);
  state.chatbotEditingId = null;
  saveCustomBots();
  render();
}

const icons = {
  logo: '<img src="/idk.jpeg" alt="Piya logo">',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4 4 6c0 7.7 6.3 14 14 14l2-3-4-2-2 2a12 12 0 0 1-7-7l2-2-2-4Z"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m20 11-7.7 7.7a5 5 0 0 1-7.1-7.1L13 3.8a3.5 3.5 0 0 1 5 5l-7.8 7.8a2 2 0 0 1-2.8-2.8L15 6.2"/></svg>'
};

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, { ...options, headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) } });
  } catch {
    throw new Error("Cannot connect to Piya. Start the server with `npm start`, then open http://localhost:3000.");
  }
  const raw = await response.text();
  let result;
  try { result = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error("Piya returned an invalid response. Make sure the app is open at http://localhost:3000."); }
  if (!response.ok) {
    const error = new Error(result.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return result;
}
function avatar(person, profileId = "") { const content = person.profilePic ? `<img src="${escapeHtml(person.profilePic)}" alt="${escapeHtml(person.name || "Profile picture")}">` : escapeHtml(person.avatar || person.initials || initials(person.name || "Piya")); return `<div class="avatar" ${profileId ? `data-open-profile="${profileId}"` : ""} style="background:linear-gradient(140deg,#6d8cff,#8959d9)">${content}</div>`; }
function icon(name) { return `<span class="icon">${icons[name]}</span>`; }
function initials(name) { return name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[x])); }
function dobMaximum() { const date = new Date(); date.setFullYear(date.getFullYear() - 13); return date.toISOString().slice(0, 10); }
function profilePictureContent(profile) {
  if (profile.profilePic) return `<img src="${escapeHtml(profile.profilePic)}" alt="${escapeHtml(profile.name || "Profile picture")}">`;
  return `<span class="no-dp-placeholder" aria-label="No profile picture"><span>✦</span></span>`;
}
function formatLastSeen(value) {
  if (!value) return "Last seen recently";
  return `Last seen ${new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}
function showToast(message) {
  document.querySelector(".message-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "message-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
function profileFromId(profileId) {
  if (profileId === state.user?.id) return state.user;
  return [...state.users, ...state.searchResults].find(user => user.id === profileId);
}
function openProfileView(profile, mode = "view", addHistory = true) {
  if (!profile) return;
  state.profileTarget = { ...profile, profilePublicView: mode === "view" };
  state.profileDraftMedia = [...(profile.media || [])];
  state.profileDraftPicture = profile.profilePic || "";
  if (addHistory) history.pushState({ piyaView: "profile", profileId: profile.id, mode }, "", window.location.href);
  render();
}
function closeProfile(fromHistory = false) {
  if (!fromHistory && history.state?.piyaView === "profile") {
    history.back();
    return;
  }
  state.profileTarget = null;
  state.profileDraftMedia = [];
  state.profileDraftPicture = "";
  render();
}
function render() {
  const app = document.getElementById("app");
  const initialRender = !app.firstElementChild;
  app.innerHTML = state.user ? (state.onboarding ? renderOnboarding() : `${renderApp()}${renderProfileModal()}`) : renderAuth();
  if (initialRender) app.firstElementChild?.classList.add("initial-render");
  attachEvents();
}

function renderAuth(error = "", values = {}, passwordError = false) {
  const register = state.authMode === "register";
  return `<main class="auth-page"><section class="auth-hero"><div class="brand"><span class="brand-mark">${icons.logo}</span> piya</div><div class="hero-copy"><div class="tagline">SAB BOLENGE</div><h1>Say it.<br><span>Share it.</span><br>Feel closer.</h1><p>A vibrant space for the people, ideas, and conversations you want to keep close.</p></div><div class="hero-note">Real-time connection · private by design</div></section><section class="auth-panel"><form class="auth-card" id="auth-form"><div class="card-brand"><span class="brand-mark">${icons.logo}</span><div><span>piya</span><small>sab bolenge</small></div></div><h2>${register ? "Create your piya" : "Welcome back"}</h2><p>${register ? "Make an account and let the conversation begin." : "Sign in and keep your circle moving."}</p>${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}${register ? `<div class="field signup-dob-field"><label>DATE OF BIRTH</label><input id="dob-input" type="date" name="dateOfBirth" max="${dobMaximum()}" value="${escapeHtml(values.dateOfBirth || "")}" required><small>Private and used only to confirm your age.</small></div><div class="field"><label>YOUR NAME</label><input id="name-input" name="name" placeholder="e.g. Alex Morgan" value="${escapeHtml(values.name || "")}" required></div><div id="identity-warning" class="identity-warning" aria-live="polite"></div>` : ""}<div class="field"><label>USERNAME</label><input id="username-input" name="username" placeholder="e.g. alexmorgan" autocomplete="username" value="${escapeHtml(values.username || "")}" required></div><div class="field"><label>PASSWORD</label><div class="password-field ${passwordError ? "password-error" : ""}"><input id="password-input" type="password" name="password" placeholder="" minlength="4" autocomplete="${register ? "new-password" : "current-password"}" value="${escapeHtml(values.password || "")}" ${register ? "disabled" : ""} ${passwordError ? 'aria-invalid="true"' : ""} required><button type="button" data-password-toggle ${values.password ? "" : "hidden"}>Show</button></div></div><button class="primary-btn" type="submit" ${register ? "disabled" : ""}>${register ? "Create account" : "Sign in"} <span>→</span></button><div class="auth-toggle">${register ? "Already have an account?" : "New to piya?"} <button type="button" data-auth-toggle>${register ? "Sign in" : "Create an account"}</button></div></form></section></main>`;
}
function renderOnboarding(error = "") {
  const steps = ["Profile picture", "Bio", "Body count"];
  const step = Math.min(Math.max(state.onboarding - 1, 0), steps.length - 1);
  const labels = steps.map((label, index) => `<span class="${index <= step ? "active" : ""}">${index + 1}. ${label}</span>`).join("");
  const content = step === 0
    ? `<div class="onboarding-icon">📸</div><h1>Add a profile picture</h1><p>Help your friends recognize you. You can skip this and add one later.</p><label class="upload-drop"><input id="onboarding-picture" type="file" accept="image/*"><strong>${state.user.profilePic ? "Change picture" : "Choose a picture"}</strong><span>JPG, PNG, or WEBP · optional</span></label>`
    : step === 1
      ? `<div class="onboarding-icon">💬</div><h1>Tell people about you</h1><p>Write a short bio. This is optional and can be changed anytime.</p><textarea id="onboarding-bio" class="onboarding-input" maxlength="160" placeholder="A little about you...">${escapeHtml(state.user.bio || "")}</textarea>`
      : `<div class="onboarding-icon">✨</div><h1>Add your body count</h1><p>This is optional and private by default. You choose whether to show it later.</p><input id="onboarding-body-count" class="onboarding-input" value="${escapeHtml(state.user.bodyCount || "")}" maxlength="20" placeholder="Leave blank if you prefer">`;
  return `<main class="onboarding-page"><section class="onboarding-card"><div class="card-brand"><span class="brand-mark">${icons.logo}</span><div><span>piya</span><small>sab bolenge</small></div></div><div class="onboarding-progress">${labels}</div>${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}${content}<div class="onboarding-actions"><button type="button" class="secondary-btn" data-onboarding-skip>Skip</button><button type="button" class="primary-btn" data-onboarding-next>${step === steps.length - 1 ? "Finish and enter Piya" : "Continue"} <span>→</span></button></div><p class="onboarding-note">You can edit these details later from your profile.</p></section></main>`;
}
function renderApp() {
  const active = state.active || allBots()[0];
  const me = { initials: initials(state.user.name), avatar: state.user.avatar, profilePic: state.user.profilePic };
  const settingsMenu = state.settingsOpen ? `<div class="settings-menu" data-settings-menu><div class="settings-heading">Account settings</div><button data-edit-profile>✎ Edit profile</button><button data-profile>✦ View profile</button><button data-receipts>✓ Read receipts: ${state.user.readReceipts !== false ? "On" : "Off"}</button><button data-help>？ Help & support</button><button data-about>ⓘ About Piya</button><button data-signout>⇥ Sign out</button><button class="danger-action" data-delete-account>Delete account</button></div>` : "";
  const sidebarClass = `${state.sidebarCollapsed ? "sidebar-collapsed " : ""}${state.sidebarHidden ? "sidebar-hidden" : ""}`.trim();
  const sidebarControls = `<div class="sidebar-controls"><button type="button" data-sidebar="decrease" title="Make sidebar narrower">−</button><button type="button" data-sidebar="reset" title="Restore sidebar width">↔</button><button type="button" data-sidebar="increase" title="Make sidebar wider">+</button><button type="button" data-sidebar="collapse" title="${state.sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}">${state.sidebarCollapsed ? "»" : "«"}</button><button type="button" data-sidebar="hide" title="Hide sidebar">×</button></div>`;
  const showSidebarButton = state.sidebarHidden ? '<button class="show-sidebar" type="button" data-sidebar="show" title="Show sidebar">☰</button>' : "";
  const chatbotList = allBots();
  const recentMarkup = state.recentSearches.length ? `<div class="recent-searches">${state.recentSearches.map(user => `<div class="recent-search-item" data-recent-user="${user.id}">${avatar(user, user.id)}<span>${escapeHtml(user.name)}<small>@${escapeHtml(user.username || "")}</small></span><button type="button" data-remove-recent="${user.id}" aria-label="Remove ${escapeHtml(user.username || user.name)} from recent searches">×</button></div>`).join("")}</div>` : "";
  const groupMembers = [active, ...state.users].filter(Boolean).slice(0, 6);
  return `<main class="app-shell ${sidebarClass}" style="--sidebar-width:${state.sidebarWidth}px"><aside class="sidebar"><div class="sidebar-top"><div class="brand"><span class="brand-mark">${icons.logo}</span><div class="brand-copy"><div class="brand-name">piya</div><div class="brand-tag">sab bolenge</div></div>${sidebarControls}</div><div class="profile ${state.settingsOpen ? "settings-open" : ""}" data-profile-swipe>${avatar(me)}<div class="profile-copy"><div class="profile-name">${escapeHtml(state.user.name)}</div><div class="profile-status"><span class="online-dot"></span> Available</div></div><button class="settings-btn" title="Settings" data-account>${icon("more")}</button>${settingsMenu}</div></div><div class="search-users"><input id="user-search" placeholder="Search username..." autocomplete="off"><div class="search-results">${state.searchResults.map(user => chatItem(user, active)).join("")}</div></div><div class="section-label section-heading"><span>Chatbots</span><button type="button" class="add-chatbot" data-add-chatbot title="Add chatbot">+</button></div><div class="chat-list">${chatbotList.map(user => chatItem(user, active)).join("")}</div><div class="section-label">Your chats</div><div class="chat-list">${state.users.map(user => chatItem(user, active)).join("") || '<div class="empty-state" style="padding:16px 23px;color:#8391ae;font-size:12px">No friends here yet.<br>Search for a username to start.</div>'}</div></aside><section class="chat-area"><div class="home-topbar"><div class="global-search"><span>${icon("search")}</span><input id="global-user-search" placeholder="Search usernames..." autocomplete="off"><div class="global-search-results">${state.searchResults.map(user => chatItem(user, active)).join("")}${recentMarkup}</div></div><button type="button" class="top-account-btn" data-signout>Sign out</button></div>${showSidebarButton}${active ? renderConversation(active) : ""}</section><aside class="info-panel"><div class="info-panel-head"><h2>Group info</h2><button type="button" class="info-close" aria-label="Close group info">×</button></div><div class="info-profile">${active ? avatar(active, active.bot ? "" : active.id) : ""}<h3>${escapeHtml(active?.name || "Your conversation")}</h3><p>${active?.bot ? "AI assistant" : `${groupMembers.length || 1} members, ${Math.max(1, groupMembers.length - 1)} online`}</p></div><div class="info-section"><div class="info-label">Shared files</div><button class="info-row" type="button"><span class="info-icon">▧</span><span>Photos</span><b>24</b><span>⌄</span></button><button class="info-row" type="button"><span class="info-icon">▱</span><span>Videos</span><b>13</b><span>⌄</span></button><button class="info-row" type="button"><span class="info-icon">□</span><span>Files</span><b>38</b><span>⌄</span></button><button class="info-row" type="button"><span class="info-icon">♫</span><span>Audio files</span><b>8</b><span>⌄</span></button><button class="info-row" type="button"><span class="info-icon">↗</span><span>Shared links</span><b>12</b><span>⌄</span></button></div><div class="info-section members-section"><div class="info-label">${groupMembers.length} members</div>${groupMembers.map(member => `<button class="member-row" type="button" data-user="${member.id}">${avatar(member, member.bot ? "" : member.id)}<span>${escapeHtml(member.name)}</span></button>`).join("")}</div></aside></main>`;
}
function renderProfileModal() {
  const profile = state.profileTarget || state.user;
  const isOwner = profile.id === state.user.id;
  const viewingOwnProfile = isOwner && state.profileTarget?.profilePublicView;
  const editing = isOwner && !viewingOwnProfile;
  const showProfile = !editing && (isOwner || profile.profilePublic !== false);
  const media = Array.isArray(profile.media) ? profile.media : [];
  const profilePic = editing ? state.profileDraftPicture : profile.profilePic;
  const mediaMarkup = media.map((item, index) => item.type === "video"
    ? `<video src="${escapeHtml(item.data)}" controls preload="metadata" aria-label="Profile video ${index + 1}"></video>`
    : `<img src="${escapeHtml(item.data)}" alt="Profile image ${index + 1}">`).join("");
  const mediaEditorMarkup = (state.profileDraftMedia || media).map((item, index) => `<div class="profile-media-edit-item">${item.type === "video" ? `<video src="${escapeHtml(item.data)}" controls preload="metadata"></video>` : `<img src="${escapeHtml(item.data)}" alt="Selected profile media ${index + 1}">`}<button type="button" data-remove-media="${index}" aria-label="Remove media">×</button></div>`).join("");
  const details = [
    ["Gender", profile.gender],
    ["Bio", profile.bio],
    ["Body count", profile.bodyCount]
  ].filter(([, value]) => value !== undefined && value !== "").map(([label, value]) => `<div class="public-detail"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const profileClass = viewingOwnProfile ? "profile-modal own-profile-page" : "profile-modal";
  const backControl = viewingOwnProfile ? '<button class="profile-back" data-back-profile aria-label="Go back">← <span>Back</span></button>' : '<button class="modal-close" data-close-profile aria-label="Close profile">×</button>';
  const cover = viewingOwnProfile ? "" : '<div class="profile-cover"></div>';
  const profileLeft = state.sidebarHidden ? 0 : (state.sidebarCollapsed ? 76 : state.sidebarWidth);
  return `<div class="${profileClass}" id="profile-modal" style="--profile-left:${profileLeft}px" aria-hidden="${state.profileTarget ? "false" : "true"}"><div class="profile-card profile-public-card">${backControl}${cover}<div class="profile-card-head"><div class="profile-avatar-stage" data-avatar-stage><div class="profile-picture">${profilePictureContent({ ...profile, profilePic })}</div></div><div><div class="eyebrow">${editing ? "YOUR PIYA PROFILE" : (profile.profilePublic === false && !isOwner ? "PRIVATE PROFILE" : "PIYA PROFILE")}</div><h2>${escapeHtml(profile.name || "Piya user")}</h2><p>@${escapeHtml(profile.username || "")}</p></div></div>${!editing && !showProfile ? '<div class="private-profile">This profile is private.</div>' : ""}${showProfile ? `<div class="public-details">${details || '<div class="private-profile">You have not added public details yet.</div>'}</div><div class="profile-media visible" id="profile-media">${mediaMarkup || '<div class="private-profile">No profile media yet.</div>'}</div>` : ""}${viewingOwnProfile ? '<button class="primary-btn profile-edit-btn" data-edit-profile>Edit profile</button>' : ""}${editing ? `<div class="avatar-picker"><div class="avatar-picker-label">Choose an avatar <span>optional</span></div><button type="button" data-avatar="" class="${!profile.avatar ? "selected" : ""}" aria-label="Remove avatar">＋</button>${avatarChoices.map(choice => `<button type="button" data-avatar="${choice}" class="${profile.avatar === choice ? "selected" : ""}">${choice}</button>`).join("")}</div><div class="profile-fields"><label>PROFILE PICTURE <span>optional</span><input id="profile-picture-input" type="file" accept="image/*"><button type="button" class="secondary-btn" data-remove-picture ${profilePic ? "" : "disabled"}>Remove picture</button></label><label>GENDER <span>optional</span><input id="profile-gender" value="${escapeHtml(profile.gender || "")}" placeholder="How do you identify?"></label><label>BIO <span>optional</span><textarea id="profile-bio" maxlength="160" placeholder="A little about you...">${escapeHtml(profile.bio || "")}</textarea></label><label>BODY COUNT <span>optional</span><input id="profile-body-count" value="${escapeHtml(profile.bodyCount || "")}" placeholder="Keep private if you prefer"></label><label>PROFILE MEDIA <span>up to 4 images or videos (1–7 seconds)</span><input id="profile-media-input" type="file" accept="image/*,video/*" multiple><div id="profile-media-editor" class="profile-media-editor">${mediaEditorMarkup || "No media selected."}</div></label></div><div class="visibility-list"><div>Profile visibility</div><label><input type="checkbox" id="profile-public" ${profile.profilePublic !== false ? "checked" : ""}> Public profile</label><div>Show on your profile</div><label><input type="checkbox" id="show-gender" ${profile.visibility?.gender !== false ? "checked" : ""}> Gender</label><label><input type="checkbox" id="show-bio" ${profile.visibility?.bio !== false ? "checked" : ""}> Bio</label><label><input type="checkbox" id="show-body-count" ${profile.visibility?.bodyCount === true ? "checked" : ""}> Body count</label></div><button class="primary-btn" data-save-profile>Save profile</button>` : ""}</div></div>`;
}
function chatItem(user, active) {
  const unread = state.unread[user.id] || 0;
  if (user.bot && state.chatbotEditingId === user.id) return `<div class="chat-item chatbot-editing ${active?.id === user.id ? "active" : ""}" data-user="${user.id}">${avatar(user)}<div class="chat-info"><input class="chatbot-name-input" data-chatbot-name="${user.id}" value="${escapeHtml(user.name)}" maxlength="40" aria-label="Chatbot name"></div></div>`;
  return `<div class="chat-item ${active?.id === user.id ? "active" : ""}" data-user="${user.id}">${avatar(user, user.bot ? "" : user.id)}<div class="chat-info"><div class="chat-name-row"><span class="chat-name">${escapeHtml(user.name)}</span><span class="chat-time">${unread ? `<b class="unread-badge">${unread}</b>` : ""}</span></div><div class="chat-preview">${user.bot ? user.description : "Open conversation to message"}</div></div></div>`;
}
function renderConversation(active) {
  const attachment = state.pendingAttachment ? `<div class="attachment-chip">${escapeHtml(state.pendingAttachment.name)}<button type="button" data-remove-attachment>×</button></div>` : "";
  const headerSubtitle = active.bot ? "AI assistant" : `<span class="chat-username">@${escapeHtml(active.username || "")}</span><span class="header-presence">${formatLastSeen(active.lastSeenAt)}</span><span class="encryption-badge">🔒 End-to-end encrypted</span>`;
  return `<header class="chat-header">${avatar(active, active.bot ? "" : active.id)}<div><div class="header-name">${escapeHtml(active.name)}</div><div class="header-status">${headerSubtitle}</div></div><div class="header-actions"><button class="icon-btn" title="Search" data-search>${icon("search")}</button><button class="icon-btn" title="Delete conversation" data-delete-conversation>${icon("more")}</button><button class="icon-btn" title="Audio call">${icon("phone")}</button><button class="icon-btn" title="Video call">${icon("video")}</button></div></header><div class="messages" id="messages"><div class="day-label">Conversation</div>${state.messages.length ? state.messages.map(messageHtml).join("") : '<div class="empty-state"><h3>Say hello 👋</h3><p>Start a private conversation with your friend.</p></div>'}</div><div class="composer-wrap">${attachment}<form class="composer" id="composer"><button type="button" class="icon-btn" title="Attach a photo, video, document, or ZIP file" data-attach>${icon("paperclip")}</button><input id="file-input" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.7z" hidden><input id="message-input" autocomplete="off" placeholder="Write a message..." /><button class="send-btn" title="Send message" type="submit">${icon("send")}<span>Send</span></button></form></div>`;
}
function messageHtml(message) {
  const messageId = messageKey(message);
  const mine = message.senderId === state.user.id || message.senderId === "me";
  const person = mine ? { initials: initials(state.user.name) } : state.active;
  const attachment = message.attachment ? (message.attachment.type.startsWith("image/") ? `<img class="message-attachment" src="${escapeHtml(message.attachment.data)}" alt="${escapeHtml(message.attachment.name)}">` : message.attachment.type.startsWith("video/") ? `<video class="message-attachment" src="${escapeHtml(message.attachment.data)}" controls></video>` : message.attachment.type.startsWith("audio/") ? `<audio class="message-audio" src="${escapeHtml(message.attachment.data)}" controls></audio>` : `<a class="file-attachment" href="${escapeHtml(message.attachment.data)}" download="${escapeHtml(message.attachment.name)}">📎 ${escapeHtml(message.attachment.name)}</a>`) : "";
  const canChange = mine;
  const menuOpen = state.messageMenuId === messageId;
  const reactionOpen = state.reactionMessageId === messageId;
  const editing = state.editingMessageId === messageId;
  const actions = `<div class="message-actions"><button type="button" class="message-react" data-reaction-menu="${messageId}" aria-label="React to message">☺</button><button type="button" class="message-more" data-message-menu="${messageId}" aria-label="Message options">⋮</button>${reactionOpen ? `<div class="reaction-picker">${["❤️","😂","👍","😮","😢","🔥"].map(reaction => `<button type="button" data-reaction="${reaction}" data-reaction-message="${messageId}">${reaction}</button>`).join("")}</div>` : ""}${menuOpen ? `<div class="message-menu"><button type="button" data-copy-message="${messageId}">Copy text</button>${canChange ? `<button type="button" data-edit-message="${messageId}">Edit</button><button type="button" data-delete-message="${messageId}" class="danger-action">Delete for everyone</button>` : ""}</div>` : ""}</div>`;
  const reactions = Object.entries(message.reactions || {}).filter(([, count]) => count > 0).map(([reaction, count]) => `<span>${reaction} ${count}</span>`).join("");
  const content = editing
    ? `<div class="message-edit"><textarea data-edit-input="${messageId}" maxlength="4000">${escapeHtml(message.text || "")}</textarea><div><button type="button" data-cancel-edit="${messageId}">Cancel</button><button type="button" data-save-edit="${messageId}" class="save-edit">Save</button></div></div>`
    : `<div class="bubble">${escapeHtml(message.text || "")}${attachment}${message.editedAt ? '<span class="edited-label">edited</span>' : ""}</div>`;
  return `<div class="message-row ${mine ? "mine" : ""}">${avatar(person, mine ? "" : state.active?.id)}<div class="bubble-wrap">${actions}${content}${reactions ? `<div class="message-reactions">${reactions}</div>` : ""}<div class="meta"><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>${mine ? (message.seenAt ? "<span>Seen</span>" : "<span>✓✓</span>") : ""}</div></div></div>`;
}
async function loadUsers() {
  const result = await request("/users"); state.users = result.users;
  if (!state.active || (!allBots().some(bot => bot.id === state.active.id) && !state.users.some(user => user.id === state.active.id))) state.active = allBots()[0];
  if (state.active.bot) state.messages = botMessages[state.active.id] || [];
  else state.messages = await decryptMessages((await request(`/messages/${state.active.id}`)).messages);
  render();
}
function connectSocket() {
  const socketOrigin = SERVER_ORIGIN.replace(/^http/, "ws");
  state.socket = new WebSocket(`${socketOrigin}/ws?token=${token()}`);
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  state.socket.onmessage = async event => {
    const incoming = JSON.parse(event.data);
    if (incoming.type === "message") {
      const sender = [...state.users, ...allBots()].find(user => user.id === incoming.message.senderId);
      if (state.active?.id === incoming.message.senderId) { state.messages.push(await decryptMessage(incoming.message)); render(); }
      else {
        state.unread[incoming.message.senderId] = (state.unread[incoming.message.senderId] || 0) + 1;
        render();
        const senderName = sender?.name || "Someone";
        const preview = incoming.message.encrypted ? "sent you a secure message" : (incoming.message.text || "sent you an attachment");
        showToast(`${senderName}: ${preview}`);
        if ("Notification" in window && Notification.permission === "granted") new Notification(`New message from ${senderName}`, { body: preview, icon: "/favicon.ico" });
        await loadUsers();
      }
    }
    if (incoming.type === "message-updated") {
      state.messages = await Promise.all(state.messages.map(async message => message.id === incoming.message.id ? decryptMessage(incoming.message) : message));
      render();
    }
    if (incoming.type === "message-deleted") {
      state.messages = state.messages.filter(message => message.id !== incoming.messageId);
      render();
    }
    if (incoming.type === "message-reaction") {
      state.messages = state.messages.map(message => message.id === incoming.message.id ? incoming.message : message);
      render();
    }
    if (incoming.type === "conversation-deleted" && state.active?.id === incoming.userId) {
      state.messages = [];
      render();
    }
    if (incoming.type === "seen") {
      state.messages = state.messages.map(message => incoming.messageIds.includes(message.id) ? { ...message, seenAt: incoming.seenAt } : message);
      render();
    }
  };
}
function attachEvents() {
  document.querySelector("[data-add-chatbot]")?.addEventListener("click", () => {
    const botName = nextChatbotName();
    const bot = { id: `bot-custom-${crypto.randomUUID()}`, name: botName, defaultName: botName, initials: initials(botName), bot: true, online: true, description: "Your personal chatbot" };
    state.customBots.push(bot);
    state.chatbotEditingId = bot.id;
    saveCustomBots();
    state.active = bot;
    state.messages = botMessages[bot.id] || [];
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector(`[data-chatbot-name="${bot.id}"]`);
      input?.focus();
      input?.select();
    });
  });
  document.querySelectorAll("[data-chatbot-name]").forEach(input => input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishChatbotName(event.currentTarget.dataset.chatbotName, event.currentTarget.value);
    }
  }));
  document.querySelectorAll("[data-sidebar]").forEach(button => button.addEventListener("click", event => {
    const action = event.currentTarget.dataset.sidebar;
    if (action === "decrease") state.sidebarWidth = Math.max(220, state.sidebarWidth - 40);
    if (action === "increase") state.sidebarWidth = Math.min(480, state.sidebarWidth + 40);
    if (action === "reset") { state.sidebarWidth = 335; state.sidebarCollapsed = false; }
    if (action === "collapse") state.sidebarCollapsed = !state.sidebarCollapsed;
    if (action === "hide") state.sidebarHidden = true;
    if (action === "show") state.sidebarHidden = false;
    localStorage.setItem("piya-sidebar-width", String(state.sidebarWidth));
    localStorage.setItem("piya-sidebar-collapsed", String(state.sidebarCollapsed));
    localStorage.setItem("piya-sidebar-hidden", String(state.sidebarHidden));
    render();
  }));
  document.querySelector("[data-auth-toggle]")?.addEventListener("click", () => { state.authMode = state.authMode === "login" ? "register" : "login"; render(); });
  const openProfile = () => openProfileView(state.user);
  const editProfile = () => openProfileView(state.user, "edit");
  document.querySelector("[data-settings-menu]")?.addEventListener("click", event => event.stopPropagation());
  if (state.settingsOpen) document.addEventListener("click", event => {
    if (event.target.closest("[data-account], [data-settings-menu]")) return;
    state.settingsOpen = false;
    render();
  }, { once: true });
  document.querySelector("[data-profile]")?.addEventListener("click", openProfile);
  document.querySelector("[data-profile-swipe]")?.addEventListener("click", event => { if (!event.target.closest("[data-account]")) openProfile(); });
  document.querySelectorAll("[data-open-profile]").forEach(item => item.addEventListener("click", event => {
    event.stopPropagation();
    const profile = [...state.users, ...state.searchResults].find(user => user.id === item.dataset.openProfile);
    if (profile) openProfileView(profile);
  }));
  document.querySelector("[data-close-profile]")?.addEventListener("click", () => closeProfile());
  document.querySelector("[data-back-profile]")?.addEventListener("click", () => closeProfile());
  document.querySelector("[data-edit-profile]")?.addEventListener("click", editProfile);
  document.querySelectorAll("[data-avatar]").forEach(button => button.addEventListener("click", event => {
    state.user.avatar = event.currentTarget.dataset.avatar;
    document.querySelectorAll("[data-avatar]").forEach(item => item.classList.toggle("selected", item === event.currentTarget));
  }));
  document.querySelector("[data-remove-picture]")?.addEventListener("click", () => {
    state.profileDraftPicture = "";
    render();
  });
  document.querySelector("#profile-picture-input")?.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Profile pictures must be images.");
    if (file.size > 8_000_000) return alert("The profile picture must be smaller than 8 MB.");
    const reader = new FileReader();
    reader.onload = () => { state.profileDraftPicture = reader.result; render(); };
    reader.onerror = () => alert("Could not read that picture.");
    reader.readAsDataURL(file);
  });
  document.querySelector("[data-save-profile]")?.addEventListener("click", async () => {
    const result = await request("/profile", { method: "PATCH", body: JSON.stringify({
      gender: document.querySelector("#profile-gender").value,
      bio: document.querySelector("#profile-bio").value,
      bodyCount: document.querySelector("#profile-body-count").value,
      avatar: state.user.avatar || "",
      profilePic: state.profileDraftPicture,
      profilePublic: document.querySelector("#profile-public").checked,
      media: state.profileDraftMedia,
      visibility: {
        gender: document.querySelector("#show-gender").checked,
        bio: document.querySelector("#show-bio").checked,
        bodyCount: document.querySelector("#show-body-count").checked
      }
    })});
    state.user = result.user; state.profileTarget = null; state.profileDraftMedia = []; state.profileDraftPicture = ""; localStorage.setItem("orbit-user", JSON.stringify(state.user)); render();
  });
  document.querySelector("#profile-media-input")?.addEventListener("change", async event => {
    const files = [...event.target.files];
    if (state.profileDraftMedia.length + files.length > 4) return alert("You can add up to 4 profile images or videos.");
    try {
      const additions = await Promise.all(files.map(async file => {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) throw new Error("Only images and videos are supported.");
        if (file.size > 8_000_000) throw new Error("Each profile file must be smaller than 8 MB.");
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read that file.")); reader.readAsDataURL(file); });
        const type = file.type.startsWith("video/") ? "video" : "image";
        let duration = null;
        if (type === "video") {
          duration = await new Promise((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration); };
            video.onerror = () => reject(new Error("Could not read the video duration."));
            video.src = URL.createObjectURL(file);
          });
          if (!Number.isFinite(duration) || duration < 1 || duration > 7) throw new Error("Videos must be between 1 and 7 seconds.");
        }
        return { type, data, name: file.name, duration };
      }));
      state.profileDraftMedia = [...state.profileDraftMedia, ...additions];
      render();
    } catch (error) { alert(error.message); }
  });
  document.querySelectorAll("[data-remove-media]").forEach(button => button.addEventListener("click", event => {
    state.profileDraftMedia.splice(Number(event.currentTarget.dataset.removeMedia), 1);
    render();
  }));
  document.querySelector("[data-password-toggle]")?.addEventListener("click", event => {
    const input = document.querySelector("#password-input");
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.textContent = input.type === "password" ? "Show" : "Hide";
  });
  document.querySelector("#password-input")?.addEventListener("input", event => {
    const toggle = document.querySelector("[data-password-toggle]");
    if (toggle) toggle.hidden = !event.currentTarget.value;
  });
  if (!state.user && state.authMode === "register") {
    const dobInput = document.querySelector("#dob-input");
    const nameInput = document.querySelector("#name-input");
    const usernameInput = document.querySelector("#username-input");
    const passwordInput = document.querySelector("#password-input");
    const submitButton = document.querySelector("#auth-form .primary-btn");
    const warning = document.querySelector("#identity-warning");
    if (dobInput && nameInput && usernameInput && passwordInput && submitButton && warning) {
    const validateIdentity = () => {
    const dob = dobInput.value;
    const name = nameInput.value.trim().toLowerCase().replace(/\s+/g, "");
    const username = usernameInput.value.trim().toLowerCase();
    const matches = Boolean(name && username && name === username);
    const ready = Boolean(dob && name && username && !matches);
    warning.textContent = matches ? "Your name and username must be different." : (!dob ? "Choose your date of birth to continue." : "");
    warning.classList.toggle("visible", matches);
      passwordInput.disabled = !ready;
      submitButton.disabled = !ready;
      nameInput.classList.toggle("invalid", matches);
      usernameInput.classList.toggle("invalid", matches);
    };
    nameInput.addEventListener("input", validateIdentity);
    usernameInput.addEventListener("input", validateIdentity);
    dobInput.addEventListener("change", validateIdentity);
      validateIdentity();
    }
  }
  document.querySelector("#auth-form")?.addEventListener("submit", async event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target)); try { const result = await request(state.authMode === "login" ? "/login" : "/register", { method: "POST", body: JSON.stringify(input) }); localStorage.setItem("orbit-token", result.token); localStorage.setItem("orbit-user", JSON.stringify(result.user)); state.user = result.user; await ensureCryptoIdentity(); state.onboarding = state.authMode === "register" && result.user.onboardingComplete === false ? 1 : 0; if (state.onboarding) localStorage.setItem("orbit-onboarding-step", "1"); else localStorage.removeItem("orbit-onboarding-step"); render(); } catch (error) { const unknownUser = state.authMode === "login" && (error.status === 404 || error.message === "That username does not exist."); const passwordError = state.authMode === "login" && !unknownUser && error.message === "Incorrect username or password."; const values = unknownUser ? {} : input; document.getElementById("app").innerHTML = renderAuth(unknownUser ? "That username does not exist." : error.message, values, passwordError); attachEvents(); if (passwordError) document.querySelector("#password-input")?.select(); } });
  if (state.user && state.onboarding) {
    const saveStep = async (skip = false) => {
      const step = state.onboarding;
      if (!skip) {
        if (step === 2) state.user.bio = document.querySelector("#onboarding-bio")?.value.trim() || "";
        if (step === 3) state.user.bodyCount = document.querySelector("#onboarding-body-count")?.value.trim() || "";
      }
      if (step === 3 || (skip && step === 3)) {
        const result = await request("/profile", { method: "PATCH", body: JSON.stringify({
          gender: state.user.gender || "",
          bio: state.user.bio || "",
          bodyCount: state.user.bodyCount || "",
          avatar: state.user.avatar || "",
          profilePic: state.user.profilePic || "",
          profilePublic: state.user.profilePublic !== false,
          media: state.user.media || [],
          visibility: state.user.visibility || { gender: true, bio: true, bodyCount: false }
        })});
        state.user = result.user;
        localStorage.setItem("orbit-user", JSON.stringify(state.user));
        state.onboarding = 0;
        state.user.onboardingComplete = true;
        localStorage.removeItem("orbit-onboarding-step");
        connectSocket();
        await loadUsers();
        return;
      }
      state.onboarding = step + 1;
      localStorage.setItem("orbit-onboarding-step", String(state.onboarding));
      render();
    };
    document.querySelector("#onboarding-picture")?.addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) return alert("Profile pictures must be images.");
      if (file.size > 8_000_000) return alert("The profile picture must be smaller than 8 MB.");
      const reader = new FileReader();
      reader.onload = () => { state.user.profilePic = reader.result; localStorage.setItem("orbit-user", JSON.stringify(state.user)); render(); };
      reader.onerror = () => alert("Could not read that picture.");
      reader.readAsDataURL(file);
    });
    document.querySelector("[data-onboarding-next]")?.addEventListener("click", () => saveStep());
    document.querySelector("[data-onboarding-skip]")?.addEventListener("click", () => saveStep(true));
  }
  document.querySelector("[data-account]")?.addEventListener("click", event => {
    event.stopPropagation();
    state.settingsOpen = !state.settingsOpen;
    render();
  });
  document.querySelector("[data-delete-account]")?.addEventListener("click", async () => {
    const action = prompt("Type DELETE to permanently delete your account, or CANCEL to close.");
    if (action !== "DELETE") return;
    await request("/account", { method: "DELETE" });
    localStorage.removeItem("orbit-token"); localStorage.removeItem("orbit-user"); state.user = null; state.socket?.close(); render();
  });
  document.querySelector("[data-signout]")?.addEventListener("click", () => {
    localStorage.removeItem("orbit-token"); localStorage.removeItem("orbit-user"); localStorage.removeItem("orbit-onboarding-step");
    state.user = null; state.socket?.close(); state.settingsOpen = false; render();
  });
  document.querySelector("[data-help]")?.addEventListener("click", () => alert("Help & support\n\nSearch for a username to start a chat. Select a conversation to send messages and files. Open Settings to edit your profile or change read receipts."));
  document.querySelector("[data-about]")?.addEventListener("click", () => alert("Piya — Sab Bolenge\n\nA private real-time chat app for staying close to the people who matter."));
  document.querySelector("[data-receipts]")?.addEventListener("click", async () => {
    const result = await request("/settings", { method: "PATCH", body: JSON.stringify({ readReceipts: state.user.readReceipts === false }) });
    state.user = result.user; localStorage.setItem("orbit-user", JSON.stringify(state.user)); render();
  });
  document.querySelectorAll("[data-user]").forEach(item => item.addEventListener("click", async () => { state.active = [...allBots(), ...state.users, ...state.searchResults].find(user => user.id === item.dataset.user); if (!state.active) return; if (!state.active.bot) addRecentSearch(state.active); state.unread[state.active.id] = 0; state.messageMenuId = null; state.editingMessageId = null; state.searchResults = []; state.messages = state.active.bot ? (botMessages[state.active.id] || []) : await decryptMessages((await request(`/messages/${state.active.id}`)).messages); render(); }));
  const searchUsers = async (input, focusGlobal = false) => {
    const query = input.value.trim();
    state.searchResults = query.length ? (await request(`/users/search?q=${encodeURIComponent(query)}`)).users : [];
    render();
    document.querySelector(focusGlobal ? "#global-user-search" : "#user-search")?.focus();
  };
  document.querySelector("#global-user-search")?.addEventListener("input", event => searchUsers(event.currentTarget, true));
  document.querySelectorAll("[data-remove-recent]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    removeRecentSearch(button.dataset.removeRecent);
  }));
  document.querySelectorAll("[data-recent-user]").forEach(item => {
    item.addEventListener("click", () => {
      const user = state.recentSearches.find(profile => profile.id === item.dataset.recentUser);
      if (user) openProfileView(user);
    });
    let startX = 0;
    item.addEventListener("pointerdown", event => { startX = event.clientX; });
    item.addEventListener("pointerup", event => {
      if (event.clientX - startX > 65) removeRecentSearch(item.dataset.recentUser);
    });
  });
  document.querySelector("[data-delete-conversation]")?.addEventListener("click", async () => {
    if (!state.active) return;
    if (!confirm("Delete this entire conversation for both people?")) return;
    if (state.active.bot) {
      delete botMessages[state.active.id];
      localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages));
    } else {
      await request(`/conversations/${state.active.id}`, { method: "DELETE" });
    }
    state.messages = [];
    state.messageMenuId = null;
    showToast("Conversation deleted");
    render();
  });
  document.querySelectorAll("[data-message-menu]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    state.messageMenuId = state.messageMenuId === button.dataset.messageMenu ? null : button.dataset.messageMenu;
    render();
  }));
  document.querySelectorAll("[data-reaction-menu]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    state.reactionMessageId = state.reactionMessageId === button.dataset.reactionMenu ? null : button.dataset.reactionMenu;
    state.messageMenuId = null;
    render();
  }));
  document.querySelectorAll("[data-reaction]").forEach(button => button.addEventListener("click", async () => {
    const message = state.messages.find(item => messageKey(item) === button.dataset.reactionMessage);
    if (!message) return;
    if (state.active.bot) {
      message.reactions = message.reactions || {};
      message._reactors = message._reactors || {};
      const reactionKey = `me:${button.dataset.reaction}`;
      if (message._reactors[reactionKey]) {
        delete message._reactors[reactionKey];
        message.reactions[button.dataset.reaction] = Math.max(0, (message.reactions[button.dataset.reaction] || 0) - 1);
      } else {
        message._reactors[reactionKey] = true;
        message.reactions[button.dataset.reaction] = (message.reactions[button.dataset.reaction] || 0) + 1;
      }
      botMessages[state.active.id] = state.messages;
      localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages));
    } else {
      const result = await request(`/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ reaction: button.dataset.reaction }) });
      state.messages = state.messages.map(item => item.id === message.id ? result.message : item);
    }
    state.reactionMessageId = null;
    render();
  }));
  document.querySelectorAll("[data-copy-message]").forEach(button => button.addEventListener("click", async () => {
    const message = state.messages.find(item => messageKey(item) === button.dataset.copyMessage);
    if (!message?.text) return showToast("This message has no text to copy");
    try {
      await navigator.clipboard.writeText(message.text);
      showToast("Message copied");
    } catch {
      showToast("Could not copy the message");
    }
    state.messageMenuId = null;
    render();
  }));
  document.querySelectorAll("[data-edit-message]").forEach(button => button.addEventListener("click", () => {
    state.editingMessageId = button.dataset.editMessage;
    state.messageMenuId = null;
    render();
    document.querySelector(`[data-edit-input="${button.dataset.editMessage}"]`)?.focus();
  }));
  document.querySelectorAll("[data-cancel-edit]").forEach(button => button.addEventListener("click", () => {
    state.editingMessageId = null;
    render();
  }));
  document.querySelectorAll("[data-save-edit]").forEach(button => button.addEventListener("click", async () => {
    const input = document.querySelector(`[data-edit-input="${button.dataset.saveEdit}"]`);
    if (!input?.value.trim()) return;
    const message = state.messages.find(item => messageKey(item) === button.dataset.saveEdit);
    if (!message) return;
    if (state.active.bot) {
      message.text = input.value.trim();
      message.editedAt = new Date().toISOString();
      botMessages[state.active.id] = state.messages;
      localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages));
    } else {
      const encrypted = await encryptPayload({ text: input.value.trim(), attachment: message.attachment || null }, state.active);
      const result = await request(`/messages/${message.id}`, { method: "PATCH", body: JSON.stringify({ encrypted }) });
      state.messages = state.messages.map(item => messageKey(item) === button.dataset.saveEdit ? { ...message, text: input.value.trim(), editedAt: result.message.editedAt, encrypted } : item);
    }
    state.editingMessageId = null;
    render();
  }));
  document.querySelectorAll("[data-delete-message]").forEach(button => button.addEventListener("click", async () => {
    if (!confirm("Delete this message for everyone? It will be removed from both sides of the conversation.")) return;
    const messageId = button.dataset.deleteMessage;
    if (state.active.bot) {
      botMessages[state.active.id] = (botMessages[state.active.id] || []).filter(message => messageKey(message) !== messageId);
      localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages));
    } else await request(`/messages/${messageId}`, { method: "DELETE" });
    state.messages = state.messages.filter(message => messageKey(message) !== messageId);
    state.messageMenuId = null;
    render();
  }));
  document.querySelector("#user-search")?.addEventListener("input", async event => {
    await searchUsers(event.currentTarget);
  });
  document.querySelector("#composer")?.addEventListener("submit", async event => {
    event.preventDefault(); const input = document.getElementById("message-input"); const text = input.value.trim(); if (!text && !state.pendingAttachment) return;
    if (state.active.bot) {
      const list = botMessages[state.active.id] || [];
      list.push({ id: `local-${crypto.randomUUID()}`, senderId: "me", receiverId: state.active.id, text, createdAt: new Date().toISOString() });
      botMessages[state.active.id] = list; localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages)); state.messages = list; render();
      try {
        const result = await request("/ai-chat", { method: "POST", body: JSON.stringify({ text }) });
        const reply = { id: `local-${crypto.randomUUID()}`, senderId: state.active.id, receiverId: "me", text: result.text, createdAt: new Date().toISOString() };
        botMessages[state.active.id].push(reply); localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages)); state.messages = botMessages[state.active.id]; render();
      } catch (error) {
        const reply = { senderId: state.active.id, receiverId: "me", text: error.message, createdAt: new Date().toISOString(), error: true };
        botMessages[state.active.id].push(reply); localStorage.setItem("orbit-bot-messages", JSON.stringify(botMessages)); state.messages = botMessages[state.active.id]; render();
      }
      return;
    }
    const encrypted = await encryptPayload({ text, attachment: state.pendingAttachment }, state.active);
    await request("/messages", {
      method: "POST",
      body: JSON.stringify({ receiverId: state.active.id, encrypted })
    });
    state.pendingAttachment = null;
    await loadUsers();
  });
  document.querySelector("[data-attach]")?.addEventListener("click", () => document.querySelector("#file-input")?.click());
  document.querySelector("#file-input")?.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 15_000_000) return alert("Files must be smaller than 15 MB.");
    const reader = new FileReader();
    reader.onload = () => { state.pendingAttachment = { name: file.name, type: file.type || "application/octet-stream", size: file.size, data: reader.result }; render(); };
    reader.onerror = () => alert("Could not read that file.");
    reader.readAsDataURL(file);
  });
  document.querySelector("[data-remove-attachment]")?.addEventListener("click", () => { state.pendingAttachment = null; render(); });
  document.querySelector("[data-search]")?.addEventListener("click", () => { const term = prompt("Search this conversation:")?.toLowerCase(); if (term) document.querySelectorAll(".message-row").forEach(row => { row.style.display = row.textContent.toLowerCase().includes(term) ? "flex" : "none"; }); });
}

async function boot() {
  if (!state.user || !token()) return render();
  try { const result = await request("/me"); state.user = result.user; await ensureCryptoIdentity(); if (state.user.onboardingComplete === false && state.onboarding) render(); else { state.onboarding = 0; localStorage.removeItem("orbit-onboarding-step"); connectSocket(); await loadUsers(); } } catch { localStorage.clear(); state.user = null; render(); }
}
if (!history.state?.piyaView) history.replaceState({ piyaView: "home" }, "", window.location.href);
window.addEventListener("popstate", event => {
  if (event.state?.piyaView === "profile") {
    const profile = profileFromId(event.state.profileId);
    if (profile) openProfileView(profile, event.state.mode || "view", false);
    return;
  }
  closeProfile(true);
});
boot();
