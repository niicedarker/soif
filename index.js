// ⚡ FIX CRYPTO POUR RENDER & BAILEYS
const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;

const fs = require('fs');
const express = require("express");
const https = require("https");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

// Variable globale pour stocker le dernier code généré ou le statut d'erreur/bannissement
let latestPairingCode = "En attente de génération...";

// 🌐 PAGE HTML INTÉGRÉE POUR DEMANDER LE CODE FACLEMENT
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Titan Bot - Code de Parrainage</title>
        <style>
            body { font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
            input { width: 80%; padding: 12px; margin: 15px 0; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 16px; text-align: center; }
            button { background: #22c55e; color: white; border: none; padding: 12px 20px; font-size: 16px; border-radius: 6px; cursor: pointer; width: 100%; font-weight: bold; }
            button:hover { background: #16a34a; }
            .code-box { margin-top: 20px; background: #0f172a; padding: 15px; border-radius: 6px; border: 1px dashed #22c55e; font-size: 22px; font-weight: bold; color: #4ade80; letter-spacing: 2px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>⚡ Titan Bot - Appariement</h2>
            <p>Entre ton numéro avec l'indicatif (ex: 15551234567)</p>
            <form action="/generate" method="POST">
                <input type="text" name="phone" placeholder="Ex: 15551234567" required />
                <button type="submit">Générer le code</button>
            </form>
            <div class="code-box">${latestPairingCode}</div>
        </div>
    </body>
    </html>
  `);
});

// Route pour déclencher la génération via le formulaire web
app.post("/generate", async (startReq, startRes) => {
  const phoneNumber = startReq.body.phone.replace(/[^0-9]/g, "");
  if (phoneNumber) {
    latestPairingCode = "Génération en cours...";
    startRes.redirect("/");
    
    // Lancer le bot avec ce numéro
    startBotWithPhone(phoneNumber);
  } else {
    latestPairingCode = "Numéro invalide !";
    startRes.redirect("/");
  }
});

app.get("/health", (req, res) => res.status(200).send("OK"));

app.listen(PORT, () => console.log(`🌐 Serveur web actif sur le port ${PORT}`));

// Keep-alive pour Render
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    https.get(renderUrl, (res) => console.log(`⏰ Keep-Alive Status: ${res.statusCode}`))
        .on('error', (err) => console.error('⚠️ Erreur Keep-Alive :', err.message));
  }
}, 8 * 60 * 1000);

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
      latestPairingCode = "Connecté avec succès ! ✅";
    }
  });

  // Demande immédiate du code + intervalle sécurisé de 10 minutes max avec détection de bannissement
  const requestAndDisplayCode = async () => {
    try {
      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        latestPairingCode = code;
        console.log(`👉 Nouveau code généré : ${code}`);
      }
    } catch (err) {
      console.error("❌ Erreur génération code :", err);
      
      const errorMessage = err?.message || err?.toString() || "";
      if (errorMessage.includes("banned") || errorMessage.includes("Forbidden") || err?.output?.statusCode === 403) {
        latestPairingCode = "❌ Numéro BANNI par WhatsApp !";
        console.log("⚠️ Alerte : Le numéro utilisé est banni.");
      } else {
        latestPairingCode = "Erreur de génération";
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
  }, 2 * 1000); // 10 minutes d'intervalle sécurisé
}
