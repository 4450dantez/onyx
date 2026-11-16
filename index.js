const sessionName = 'session';
const session = process.env.SESSION || '';
const botname = "TESLA-MD";
const port = process.env.PORT || 5000;
let botStatus = 'starting';
let sessionInitialized = false;
let databaseInitialized = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const chalk = require("chalk");
const logger = pino({ level: 'silent' });
const FileType = require("file-type");
const figlet = require("figlet");
let lastTextTime = 0;
const messageDelay = 5000;
const express = require("express");
const currentTime = Date.now();
const packname = process.env.STICKER_PACKNAME;
const _ = require("lodash");
const PhoneNumber = require("awesome-phonenumber");
const { initializeDatabase } = require('./database/config');
const fetchSettings = require('./database/fetchSettings');
const groupCache = require('./lib/Groupcache');
const Events = require('./lib/events');
const { isUrl, smsg, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('./lib/dreadfunc');
const makeInMemoryStore = require('./store/store.js'); 
const store = makeInMemoryStore({ logger: logger.child({ stream: 'store' }) });

const app = express();
const color = (text, color) => {
  return !color ? chalk.green(text) : chalk.keyword(color)(text);
};


function decodeSession(value) {
  let text = String(value || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!text) throw new Error("SESSION is empty.");
  text = text.replace(/^[A-Za-z0-9_-]{1,32}:~/, "");

  let json;
  if (text.startsWith("{")) {
    json = text;
  } else {
    const base64 = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error('SESSION has characters that are not valid base64. Copy the whole session again, starting at the label (for example "TESLA-MD:~").');
    }
    json = Buffer.from(base64, "base64").toString("utf8");
  }

  let creds;
  try {
    creds = JSON.parse(json);
  } catch {
    throw new Error("SESSION could not be read. It looks cut off or changed; copy the whole session again from the session site.");
  }
  const missing = ["noiseKey", "signedIdentityKey", "signedPreKey", "registrationId", "advSecretKey"].filter((key) => !(key in creds));
  if (missing.length > 0) {
    throw new Error(`SESSION is not a WhatsApp login (missing: ${missing.join(", ")}). Generate a new session on the session site.`);
  }
  return json;
}

async function authenticationn() {
  const credsPath = path.join(__dirname, sessionName, "creds.json");
  const useEnvSession = process.env.NODE_ENV === "production" || session.length > 0;

  if (sessionInitialized) return;
  if (session === "zokk" && process.env.NODE_ENV !== "production" && fs.existsSync(credsPath)) {
    sessionInitialized = true;
    return;
  }
  if (!session && useEnvSession) {
    throw new Error("SESSION must be set to a base64-encoded WhatsApp credentials file.");
  }
  if (!session) {
    if (fs.existsSync(credsPath)) {
      sessionInitialized = true;
      return;
    }
    throw new Error("No WhatsApp session found. Set SESSION before starting the bot.");
  }

  const creds = decodeSession(session);
  fs.mkdirSync(path.dirname(credsPath), { recursive: true });
  fs.writeFileSync(credsPath, creds, { encoding: "utf8", mode: 0o600 });
  sessionInitialized = true;
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return;
  const delay = Math.min(1_000 * 2 ** reconnectAttempts, 30_000);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
  console.warn(`WhatsApp connection closed (${reason}); retrying in ${delay}ms.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startperez().catch((error) => {
      botStatus = "failed";
      console.error("WhatsApp reconnect failed:", error.message || error);
    });
  }, delay);
}

async function startperez() {
  await authenticationn();

  const {
    default: perezConnect,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage,
    jidDecode,
    proto,
  } = await import("@whiskeysockets/baileys");

  if (!databaseInitialized) {
    await initializeDatabase();
    databaseInitialized = true;
  }

  let autobio, welcome, mode, prefix, anticall;

try {
  const settings = await fetchSettings();
  console.log("😴 settings object:", settings);

  
  ({ autobio, welcome, mode, prefix, anticall } = settings);

  console.log("✅ Settings loaded successfully.... indexfile");
} catch (error) {
  console.error("❌ Failed to load settings:...indexfile", error.message || error);
  return;
}
  
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
  console.log(
    color(
      figlet.textSync(botname, {
        font: "Standard",
        horizontalLayout: "default",
        verticalLayout: "default",
        whitespaceBreak: false,
      }),
      "green"
    )
  );

  const client = perezConnect({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: [botname, "Safari", "5.1.7"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    syncFullHistory: false,
  });

groupCache.bind(client);
store.bind(client.ev);
  
if (autobio === 'on'){ 
            setInterval(() => { 

                                 const date = new Date() 

                         client.updateProfileStatus( 

                                         ` ${date.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })} It's a ${date.toLocaleString('en-US', { weekday: 'long', timeZone: 'Africa/Nairobi'})}.` 

                                 ) 

                         }, 10 * 1000) 

}
  
  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {

      if (!chatUpdate.messages?.length) return;
      const mek = chatUpdate.messages[0];
      if (!mek.message) return;
      mek.message = Object.keys(mek.message)[0] === "ephemeralMessage" ? mek.message.ephemeralMessage.message : mek.message;

      if (mek.key && mek.key.remoteJid === "status@broadcast") {

        if (chatUpdate.type !== "notify" || mek.key.fromMe) return;
        const live = await fetchSettings();
        if (live.autoview === 'on') {
          try {
            await client.readMessages([mek.key]);
          } catch (error) {
            console.log('Status view failed:', error.message || error);
          }
        }
        
        if (live.autolike === 'on') {
          try {
            let poster = mek.key.participantAlt || mek.key.participantPn;
            if (!poster && mek.key.participant && mek.key.participant.endsWith('@lid')) {
              try {
                poster = await client.signalRepository.lidMapping.getPNForLID(mek.key.participant);
              } catch (error) { /* no phone number known for this LID */ }
            }
            poster = poster || mek.key.participant;
            if (poster) {
              const botJid = client.decodeJid(client.user.id);
              const likeKey = {
                remoteJid: mek.key.remoteJid,
                id: mek.key.id,
                fromMe: mek.key.fromMe,
                participant: poster,
              };
              await client.sendMessage(mek.key.remoteJid, { react: { key: likeKey, text: '🧚' } }, { statusJidList: [poster, botJid] });
              console.log('Status like sent to:', poster, '(as', mek.key.participant + ')');
            }
          } catch (error) {
            console.log('Status like failed:', error.message || error);
          }
        }
        return; 
      }

      if (!client.public && !mek.key.fromMe && chatUpdate.type === "notify") return;
      
      const m = smsg(client, mek, store);
      
const tesla = require("./tesla.js");
tesla(client, m, chatUpdate, store);

      } catch (err) {
    
      console.log(err);
    }
  });
  
//<================================================>//
  // Handle error
  const unhandledRejections = new Map();
  process.on("unhandledRejection", (reason, promise) => {
    unhandledRejections.set(promise, reason);
    console.log("Unhandled Rejection at:", promise, "reason:", reason);
  });
  process.on("rejectionHandled", (promise) => {
    unhandledRejections.delete(promise);
  });
  process.on("Something went wrong", function (err) {
    console.log("Caught exception: ", err);
  });

  // Setting
  client.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };

client.ev.on('call', async (callData) => {
  const { anticall: dbAnticall } = await fetchSettings();

  if (dbAnticall === 'on') {
    const callId = callData[0]?.id;
    const callerId = callData[0]?.from;

    if (callId && callerId) {
      await client.rejectCall(callId, callerId);
      const currentTime = Date.now();
      if (currentTime - lastTextTime >= messageDelay) {
        await client.sendMessage(callerId, {
          text: "🚫 Anticall is active. Only text messages are allowed."
        });
        lastTextTime = currentTime;
      }
    }
  } else {
    console.log("✅ Anticall is OFF. Call ignored.");
  }
});

  client.ev.on("contacts.update", (update) => {
    for (let contact of update) {
      let id = client.decodeJid(contact.id);
      if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
    }
  });
  
client.ev.on("group-participants.update", async (m) => {
    Events(client, m);
  });
  
  client.getName = (jid, withoutContact = false) => {
    id = client.decodeJid(jid);
    withoutContact = client.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us"))
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {};
        if (!(v.name || v.subject)) v = client.groupMetadata(id) || {};
        resolve(v.name || v.subject || PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber("international"));
      });
    else
      v =
        id === "0@s.whatsapp.net"
          ? {
              id,
              name: "WhatsApp",
            }
          : id === client.decodeJid(client.user.id)
          ? client.user
          : store.contacts[id] || {};
    return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber("international");
  };

  client.setStatus = (status) => {
    client.query({
      tag: "iq",
      attrs: {
        to: "@s.whatsapp.net",
        type: "set",
        xmlns: "status",
      },
      content: [
        {
          tag: "status",
          attrs: {},
          content: Buffer.from(status, "utf-8"),
        },
      ],
    });
    return status;
  };

  client.public = true;

  client.serializeM = (m) => smsg(client, m, store);
  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botStatus = "awaiting_auth";
      console.warn("WhatsApp authentication is required; QR data is intentionally not logged.");
    }
    if (connection === "connecting") botStatus = "connecting";
    if (connection === "close") {
      botStatus = "reconnecting";
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (
        reason === DisconnectReason.badSession ||
        reason === DisconnectReason.connectionReplaced ||
        reason === DisconnectReason.loggedOut
      ) {
        botStatus = "failed";
        console.error(`WhatsApp session needs attention (disconnect reason ${reason}).`);
      } else {
        scheduleReconnect(reason ?? "unknown");
      }
    } else if (connection === "open") {  
      botStatus = "connected";
      reconnectAttempts = 0;
      
      console.log(color(`Congrats, ${botname} has successfully connected to this server`, "green"));
      console.log(color("Lost in thoughts found in code", "red"));
      console.log(color("Text the bot number with menu to check my command list"));
      
      (async () => {
        const self = client.decodeJid(client.user.id);
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 3000 : 5000));
            await client.sendMessage(self, { text: `Connected » ✅️ »【${botname}】` });
            return;
          } catch (error) {
            console.error(`Could not send the startup notice (attempt ${attempt}):`, error.message || error);
          }
        }
      })();
    }
    
  });

  client.ev.on("creds.update", saveCreds);

const getBuffer = async (url, options) => {
    try {
      options ? options : {};
      const res = await axios({
        method: "get",
        url,
        headers: {
          DNT: 1,
          "Upgrade-Insecure-Request": 1,
        },
        ...options,
        responseType: "arraybuffer",
      });
      return res.data;
    } catch (err) {
      return err;
    }
  };

 client.downloadMediaMessage = async (message) => { 
         let mime = (message.msg || message).mimetype || ''; 
         let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]; 
         const stream = await downloadContentFromMessage(message, messageType); 
         let buffer = Buffer.from([]); 
         for await(const chunk of stream) { 
             buffer = Buffer.concat([buffer, chunk]) 
         } 
  
         return buffer 
      }; 
  
 client.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => { 
         let quoted = message.msg ? message.msg : message; 
         let mime = (message.msg || message).mimetype || ''; 
         let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]; 
         const stream = await downloadContentFromMessage(quoted, messageType); 
         let buffer = Buffer.from([]); 
         for await(const chunk of stream) { 
             buffer = Buffer.concat([buffer, chunk]); 
         } 
         let type = await FileType.fromBuffer(buffer); 
         trueFileName = attachExtension ? (filename + '.' + type.ext) : filename; 
         // save to file 
         await fs.writeFileSync(trueFileName, buffer); 
         return trueFileName; 
     };

  client.sendText = (jid, text, quoted = "", options) => client.sendMessage(jid, { text: text, ...options }, { quoted });

  client.cMod = (jid, copy, text = "", sender = client.user.id, options = {}) => {
    //let copy = message.toJSON()
    let mtype = Object.keys(copy.message)[0];
    let isEphemeral = mtype === "ephemeralMessage";
    if (isEphemeral) {
      mtype = Object.keys(copy.message.ephemeralMessage.message)[0];
    }
    let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message;
    let content = msg[mtype];
    if (typeof content === "string") msg[mtype] = text || content;
    else if (content.caption) content.caption = text || content.caption;
    else if (content.text) content.text = text || content.text;
    if (typeof content !== "string")
      msg[mtype] = {
        ...content,
        ...options,
      };
    if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
    else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
    if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid;
    else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid;
    copy.key.remoteJid = jid;
    copy.key.fromMe = sender === client.user.id;

    return proto.WebMessageInfo.create(copy);
  };

  return client;
}

app.use(express.static(path.join(__dirname, "tesla")));
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "tesla", "index.html")));
app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: botStatus,
    connected: botStatus === "connected",
  });
});
app.listen(port, "0.0.0.0", () => console.log(`📡 Connected on port ${port}`));

if (process.env.BOT_ENABLED === "false") {
  botStatus = "disabled";
  console.log("WhatsApp bot startup disabled by BOT_ENABLED=false.");
} else {
  startperez().catch((error) => {
    botStatus = "failed";
    console.error("WhatsApp bot failed to start:", error.message || error);
  });
}
