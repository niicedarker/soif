// ⚡ FIX CRYPTO POUR RENDER & BAILEYS
const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

// 👉 METS TON NUMÉRO ICI AVEC L'INDICATIF INTERNATIONAL (Exemple: "2250102030405")
const phoneNumber = "13412081269";

async function getAuthState() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  return { state, saveCreds };
}

let sock = null;

async function startBotWithPhone(phoneNumber) {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.ws.close();
    } catch (e) {}
  }

  const { state, saveCreds } = await getAuthState();
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      console.log('⚡ TITAN BOT CONNECTÉ !');
    }
  });

  const requestAndDisplayCode = async () => {
    try {
      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(`👉 CODE D'APPARIEMENT : ${code}`);
      }
    } catch (err) {
      console.error("❌ Erreur génération code :", err);
      
      const errorMessage = err?.message || err?.toString() || "";
      if (errorMessage.includes("banned") || errorMessage.includes("Forbidden") || err?.output?.statusCode === 403) {
        console.log("⚠️ Alerte : Le numéro utilisé est banni par WhatsApp !");
      }
    }
  };

  setTimeout(requestAndDisplayCode, 2000);

  const intervalId = setInterval(async () => {
    if (!sock.authState.creds.registered) {
      await requestAndDisplayCode();
    } else {
      clearInterval(intervalId);
    }
  }, 2 * 1000); // 10 minutes d'intervalle sécurisé pour éviter le spam
}

// Lancement direct au démarrage du script
startBotWithPhone(phoneNumber.replace(/[^0-9]/g, ""));
