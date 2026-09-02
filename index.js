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
const express = require('express');

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
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";

      if (statusCode === 403 || errorMessage.includes("banned") || errorMessage.includes("Stream Errored (custom)")) {
        console.log("🚨 ALERTE CRITIQUE : Ce numéro WhatsApp est banni par Meta/WhatsApp !");
      }
    } else if (connection === 'open') {
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
      const errorMessage = err?.message || err?.toString() || "";
      
      if (errorMessage.includes("banned") || errorMessage.includes("Forbidden") || err?.output?.statusCode === 403) {
        console.log("🚨 ALERTE : Impossible d'obtenir le code, le numéro est banni !");
      } else {
        console.error("❌ Erreur génération code :", errorMessage);
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
  }, 2 * 1000); // Intervalle sécurisé à 20 secondes pour éviter le spam/bannissement de l'API
}

// Lancement direct du bot au démarrage du script[span_0](start_span)[span_0](end_span)
startBotWithPhone(phoneNumber.replace(/[^0-9]/g, ""));

// 👉 CONFIGURATION DU SERVEUR WEB POUR RENDER
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Le bot WhatsApp Titan est en cours d\'exécution !');
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur web en écoute sur le port ${PORT}`);
});
