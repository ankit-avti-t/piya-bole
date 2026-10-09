const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { GoogleGenAI } = require("@google/genai");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "orbit-data.json");
const sessions = new Map();
const sockets = new Map();
const data = loadData();
const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

function loadData() {
  try {
    const stored = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    stored.users = (stored.users || []).map(user => ({ ...user, publicKey: typeof user.publicKey === "object" ? user.publicKey : null, onboardingComplete: user.onboardingComplete !== false, lastSeenAt: user.lastSeenAt || null, readReceipts: user.readReceipts !== false, gender: user.gender || "", bio: user.bio || "", bodyCount: user.bodyCount || "", avatar: typeof user.avatar === "string" ? user.avatar : "", profilePic: typeof user.profilePic === "string" ? user.profilePic : "", profilePublic: user.profilePublic !== false, media: Array.isArray(user.media) ? user.media : [], visibility: { gender: user.visibility?.gender !== false, bio: user.visibility?.bio !== false, bodyCount: user.visibility?.bodyCount === true }, username: user.username || user.email?.split("@")[0] || user.name.toLowerCase().replace(/\s+/g, "") }));
    return stored;
  }
  catch { return { users: [], messages: [] }; }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function id() { return crypto.randomUUID(); }
function hash(password) { return crypto.createHash("sha256").update(password).digest("hex"); }
function publicUser(user, self = false) {
  const result = { id: user.id, name: user.name, username: user.username, publicKey: user.publicKey || null, lastSeenAt: user.lastSeenAt || null, onboardingComplete: user.onboardingComplete !== false, readReceipts: user.readReceipts !== false, avatar: user.avatar || "", profilePic: user.profilePic || "", initials: user.name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(), online: sockets.has(user.id) };
  result.profilePublic = self || user.profilePublic !== false;
  if (self || user.profilePublic !== false) {
    if (self || user.visibility?.gender !== false) result.gender = user.gender || "";
    if (self || user.visibility?.bio !== false) result.bio = user.bio || "";
    if (self || user.visibility?.bodyCount === true) result.bodyCount = user.bodyCount || "";
    result.media = Array.isArray(user.media) ? user.media : [];
  }
  if (self) result.visibility = user.visibility;
  return result;
}
function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" }); res.end(JSON.stringify(body)); }
function userFromRequest(req) { return sessions.get((req.headers.authorization || "").replace("Bearer ", "")); }
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = ""; req.on("data", chunk => raw += chunk); req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); } });
  });
}
function sendTo(userId, message) {
  const socket = sockets.get(userId);
  if (socket?.readyState === 1) socket.send(JSON.stringify(message));
}
function conversationMessages(userId, otherId) {
  return data.messages.filter(m => (m.senderId === userId && m.receiverId === otherId) || (m.senderId === otherId && m.receiverId === userId));
}
function connectedUserIds(userId) {
  return new Set(data.messages.flatMap(message => {
    if (message.senderId === userId) return [message.receiverId];
    if (message.receiverId === userId) return [message.senderId];
    return [];
  }));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" }); return res.end(); }
  if (req.url.startsWith("/api/")) {
    try {
      if (req.method === "POST" && ["/api/register", "/api/login"].includes(req.url)) {
        const input = await body(req);
        if (!input.username || !input.password || (req.url.endsWith("register") && (!input.name || !input.dateOfBirth))) return json(res, 400, { error: "Date of birth, username, name, and password are required." });
        const username = input.username.trim().toLowerCase();
        const normalizedName = req.url.endsWith("register") ? input.name.trim().toLowerCase().replace(/\s+/g, "") : "";
        if (req.url.endsWith("register") && username === normalizedName) return json(res, 400, { error: "Username and name must be different." });
        if (req.url.endsWith("register")) {
          const dateOfBirth = new Date(`${input.dateOfBirth}T00:00:00`);
          const youngestAllowed = new Date();
          youngestAllowed.setHours(0, 0, 0, 0);
          youngestAllowed.setFullYear(youngestAllowed.getFullYear() - 13);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth) || Number.isNaN(dateOfBirth.getTime()) || dateOfBirth > youngestAllowed) return json(res, 400, { error: "You must be at least 13 years old to join Piya." });
        }
        let user = data.users.find(item => item.username === username);
        if (req.url.endsWith("register")) {
          if (user) return json(res, 409, { error: "That username is already taken." });
          user = { id: id(), name: input.name.trim(), username, dateOfBirth: input.dateOfBirth, publicKey: null, password: hash(input.password), onboardingComplete: false, lastSeenAt: null, readReceipts: true, gender: "", bio: "", bodyCount: "", avatar: "", profilePic: "", profilePublic: true, media: [], visibility: { gender: true, bio: true, bodyCount: false } }; data.users.push(user); saveData();
        } else if (!user) return json(res, 404, { error: "That username does not exist." });
        else if (user.password !== hash(input.password)) return json(res, 401, { error: "Incorrect username or password." });
        const token = id(); sessions.set(token, user); return json(res, 200, { token, user: publicUser(user, true) });
      }
      const user = userFromRequest(req);
      if (!user) return json(res, 401, { error: "Please sign in first." });
      if (req.method === "GET" && req.url === "/api/me") return json(res, 200, { user: publicUser(user, true) });
      if (req.method === "PATCH" && req.url === "/api/crypto-key") {
        const input = await body(req);
        if (!input.publicKey || input.publicKey.kty !== "EC" || input.publicKey.crv !== "P-256" || typeof input.publicKey.x !== "string" || typeof input.publicKey.y !== "string") return json(res, 400, { error: "Invalid encryption key." });
        user.publicKey = input.publicKey;
        saveData();
        return json(res, 200, { publicKey: user.publicKey });
      }
      if (req.method === "GET" && req.url.startsWith("/api/users/search")) {
        const query = new URL(req.url, "http://localhost").searchParams.get("q")?.trim().toLowerCase() || "";
        return json(res, 200, { users: data.users.filter(item => item.id !== user.id && item.username.includes(query)).map(publicUser) });
      }
      if (req.method === "GET" && req.url === "/api/users") {
        const connectedIds = connectedUserIds(user.id);
        return json(res, 200, { users: data.users.filter(item => item.id !== user.id && connectedIds.has(item.id)).map(publicUser) });
      }
      if (req.method === "GET" && req.url.startsWith("/api/messages/")) {
        const otherId = req.url.split("/").pop();
        const messages = conversationMessages(user.id, otherId);
        if (user.readReceipts !== false) {
          const seenAt = new Date().toISOString();
          const incoming = messages.filter(message => message.receiverId === user.id && !message.seenAt);
          incoming.forEach(message => { message.seenAt = seenAt; sendTo(message.senderId, { type: "seen", messageIds: [message.id], seenAt, seenBy: user.id }); });
          if (incoming.length) saveData();
        }
        return json(res, 200, { messages: messages.map(message => { const safeMessage = { ...message }; delete safeMessage._reactors; return safeMessage; }) });
      }
      if (req.method === "POST" && req.url === "/api/messages") {
        const input = await body(req);
        const receiver = data.users.find(item => item.id === input.receiverId);
        const attachment = input.attachment;
        const encrypted = input.encrypted;
        if (!receiver || (!input.text?.trim() && !attachment && !encrypted)) return json(res, 400, { error: "A recipient and message are required." });
        if (encrypted && (typeof encrypted.iv !== "string" || typeof encrypted.data !== "string" || encrypted.data.length > 30_000_000)) return json(res, 400, { error: "Encrypted message is invalid or too large." });
        if (attachment) {
          if (typeof attachment.name !== "string" || typeof attachment.type !== "string" || typeof attachment.data !== "string" || !attachment.data.startsWith("data:") || attachment.data.length > 20_000_000 || attachment.size > 15_000_000) return json(res, 400, { error: "Attachments must be valid files smaller than 15 MB." });
        }
        const message = { id: id(), senderId: user.id, receiverId: receiver.id, encrypted: encrypted || null, text: encrypted ? "" : (typeof input.text === "string" ? input.text.trim() : ""), attachment: encrypted ? null : (attachment ? { name: attachment.name.slice(0, 160), type: attachment.type.slice(0, 120), size: attachment.size, data: attachment.data } : null), reactions: {}, createdAt: new Date().toISOString(), seenAt: null };
        data.messages.push(message); saveData(); sendTo(receiver.id, { type: "message", message }); return json(res, 201, { message });
      }
      if ((req.method === "PATCH" || req.method === "DELETE") && req.url.startsWith("/api/messages/")) {
        const messageId = req.url.split("/").pop();
        const message = data.messages.find(item => item.id === messageId);
        if (!message) return json(res, 404, { error: "Message not found." });
        if (req.method === "PATCH") {
          const input = await body(req);
          const participant = message.senderId === user.id || message.receiverId === user.id;
          if (typeof input.reaction === "string") {
            const allowedReactions = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
            if (!participant || !allowedReactions.includes(input.reaction)) return json(res, 403, { error: "You cannot react to this message." });
            message.reactions = message.reactions || {};
            const reactionKey = `${user.id}:${input.reaction}`;
            message._reactors = message._reactors || {};
            if (message._reactors[reactionKey]) {
              delete message._reactors[reactionKey];
              message.reactions[input.reaction] = Math.max(0, (message.reactions[input.reaction] || 0) - 1);
            } else {
              message._reactors[reactionKey] = true;
              message.reactions[input.reaction] = (message.reactions[input.reaction] || 0) + 1;
            }
            saveData();
            const publicMessage = { ...message };
            delete publicMessage._reactors;
            sendTo(message.senderId === user.id ? message.receiverId : message.senderId, { type: "message-reaction", message: publicMessage });
            return json(res, 200, { message: publicMessage });
          }
          if (input.encrypted && (typeof input.encrypted.iv !== "string" || typeof input.encrypted.data !== "string" || input.encrypted.data.length > 30_000_000)) return json(res, 400, { error: "Encrypted message is invalid or too large." });
          if (message.senderId !== user.id) return json(res, 403, { error: "You can only edit messages you sent." });
          if (input.encrypted) {
            message.encrypted = input.encrypted;
            message.text = "";
            message.attachment = null;
            message.editedAt = new Date().toISOString();
            saveData();
            sendTo(message.receiverId, { type: "message-updated", message });
            return json(res, 200, { message });
          }
          if (typeof input.text !== "string" || !input.text.trim()) return json(res, 400, { error: "A message cannot be empty." });
          message.text = input.text.trim().slice(0, 4000);
          message.editedAt = new Date().toISOString();
          saveData();
          sendTo(message.receiverId, { type: "message-updated", message });
          return json(res, 200, { message });
        }
        if (message.senderId !== user.id) return json(res, 403, { error: "You can only delete messages you sent." });
        data.messages = data.messages.filter(item => item.id !== messageId);
        saveData();
        sendTo(message.receiverId, { type: "message-deleted", messageId });
        return json(res, 200, { deleted: true, messageId, scope: "everyone" });
      }
      if (req.method === "DELETE" && req.url.startsWith("/api/conversations/")) {
        const otherId = req.url.split("/").pop();
        if (!data.users.some(item => item.id === otherId)) return json(res, 404, { error: "Conversation not found." });
        data.messages = data.messages.filter(message => !(
          (message.senderId === user.id && message.receiverId === otherId) ||
          (message.senderId === otherId && message.receiverId === user.id)
        ));
        saveData();
        sendTo(otherId, { type: "conversation-deleted", userId: user.id });
        return json(res, 200, { deleted: true });
      }
      if (req.method === "PATCH" && req.url === "/api/settings") {
        const input = await body(req);
        if (typeof input.readReceipts !== "boolean") return json(res, 400, { error: "A read receipt setting is required." });
        user.readReceipts = input.readReceipts; saveData(); return json(res, 200, { user: publicUser(user, true) });
      }
      if (req.method === "PATCH" && req.url === "/api/profile") {
        const input = await body(req);
        const allowedAvatars = ["🪐", "🌙", "⚡", "🌈", "🦋", "🐼", "🦊", "🐸", "👾", "🔥", "🌻", "🎧"];
        if (typeof input.bio !== "string" || typeof input.gender !== "string" || typeof input.bodyCount !== "string" || typeof input.profilePic !== "string" || (input.avatar !== "" && !allowedAvatars.includes(input.avatar)) || !Array.isArray(input.media) || input.media.length > 4) return json(res, 400, { error: "Invalid profile data." });
        if (input.profilePic && (!input.profilePic.startsWith("data:image/") || input.profilePic.length > 8_000_000)) return json(res, 400, { error: "Profile pictures must be images smaller than 8 MB." });
        const mediaSize = input.media.reduce((total, item) => total + (typeof item?.data === "string" ? item.data.length : 0), 0);
        if (mediaSize > 20_000_000 || input.media.some(item => !["image", "video"].includes(item?.type) || typeof item.data !== "string" || !item.data.startsWith("data:") || (item.type === "video" && (typeof item.duration !== "number" || item.duration < 1 || item.duration > 7)))) return json(res, 400, { error: "Media must be up to 4 images or 1–7 second videos." });
        user.gender = input.gender.trim().slice(0, 40);
        user.bio = input.bio.trim().slice(0, 160);
        user.bodyCount = input.bodyCount.trim().slice(0, 20);
        user.avatar = input.avatar;
        user.profilePic = input.profilePic;
        user.profilePublic = input.profilePublic !== false;
        user.media = input.media.map(item => ({ type: item.type, data: item.data, name: String(item.name || "").slice(0, 80), duration: item.type === "video" ? Number(item.duration.toFixed(2)) : null }));
        user.visibility = {
          gender: input.visibility?.gender === true,
          bio: input.visibility?.bio === true,
          bodyCount: input.visibility?.bodyCount === true
        };
        user.onboardingComplete = true;
        saveData();
        return json(res, 200, { user: publicUser(user, true) });
      }
      if (req.method === "POST" && req.url === "/api/ai-chat") {
        const input = await body(req);
        if (!input.text?.trim()) return json(res, 400, { error: "A message is required." });
        if (!gemini) return json(res, 503, { error: "Gemini is not configured yet. Add GEMINI_API_KEY and restart the server." });
        try {
          const result = await gemini.models.generateContent({
            model: "gemini-3.8-flash",
            contents: input.text.trim(),
            config: { systemInstruction: "You are Piya AI, a warm, concise assistant inside a private chat app. Be helpful and conversational. Keep replies under 120 words unless the user asks for detail." }
          });
          return json(res, 200, { text: result.text || "I could not generate a response this time." });
        } catch (error) {
          console.error("Gemini request failed:", error);
          return json(res, 502, { error: "Piya AI is temporarily unavailable. Please try again in a moment." });
        }
      }
      if (req.method === "DELETE" && req.url === "/api/account") {
        const deletedId = user.id;
        data.users = data.users.filter(item => item.id !== deletedId);
        data.messages = data.messages.filter(message => message.senderId !== deletedId && message.receiverId !== deletedId);
        for (const [sessionToken, sessionUser] of sessions) if (sessionUser.id === deletedId) sessions.delete(sessionToken);
        sockets.get(deletedId)?.close(1000, "Account deleted");
        sockets.delete(deletedId);
        saveData();
        return json(res, 200, { deleted: true });
      }
      return json(res, 404, { error: "Not found." });
    } catch (error) { console.error(error); return json(res, 500, { error: "The server could not complete that request." }); }
  }
  const file = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(__dirname, file);
  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath)) return json(res, 404, { error: "Not found." });
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png" };
  res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" }); fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, req) => {
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
  const user = sessions.get(token);
  if (!user) return socket.close(1008, "Unauthorized");
  sockets.set(user.id, socket);
  socket.on("close", () => {
    if (sockets.get(user.id) === socket) {
      sockets.delete(user.id);
      user.lastSeenAt = new Date().toISOString();
      saveData();
    }
  });
});
server.listen(PORT, () => console.log(`Piya is running at http://localhost:${PORT}`));
