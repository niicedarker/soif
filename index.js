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

async function getAuthState() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  return { state, saveCreds };
}

let sock = null;
let latestPairingCode = "En attente du numéro...";

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

  let intervalId = null; // Déclaration de l'intervalle en amont

  // Fonction utilitaire pour marquer le numéro comme banni et tout stopper net
  const handleBannedNumber = (reason) => {
    latestPairingCode = "🚨 ALERTE : Impossible d'obtenir le code, le numéro est banni !";
    console.error("🚨 Numéro banni détecté :", reason);
    if (intervalId) {
      clearInterval(intervalId);
    }
    if (sock) {
      try {
        sock.ws.close();
      } catch (e) {}
    }
  };

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const errorString = String(lastDisconnect?.error || "");

      // Détection élargie du bannissement au niveau de la connexion
      if (
        statusCode === 403 || 
        statusCode === 401 ||
        errorMessage.includes("banned") || 
        errorMessage.includes("Forbidden") || 
        errorMessage.includes("Stream Errored (custom)") ||
        errorString.includes("banned") ||
        errorString.includes("Not Authorized")
      ) {
        handleBannedNumber(`Status: ${statusCode}, Msg: ${errorMessage}`);
      }
    } else if (connection === 'open') {
      latestPairingCode = "⚡ TITAN BOT CONNECTÉ AVEC SUCCÈS !";
      console.log(latestPairingCode);
    }
  });

  const requestAndDisplayCode = async () => {
    // Si on sait déjà que c'est banni, on n'essaie même plus
    if (latestPairingCode.includes("banni")) return;

    try {
      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        latestPairingCode = code;
        console.log(`👉 CODE D'APPARIEMENT : ${code}`);
      }
    } catch (err) {
      const errorMessage = err?.message || err?.toString() || "";
      const statusCode = err?.output?.statusCode || err?.status;
      const errJson = JSON.stringify(err);

      // Détection élargie pendant l'exécution directe de requestPairingCode
      if (
        statusCode === 403 || 
        statusCode === 401 ||
        errorMessage.includes("banned") || 
        errorMessage.includes("Forbidden") || 
        errorMessage.includes("not-authorized") ||
        errJson.includes("banned")
      ) {
        handleBannedNumber(`Catch Error: ${errorMessage} (Code: ${statusCode})`);
      } else {
        latestPairingCode = "❌ Erreur de génération (voir les logs)";
        console.error("❌ Erreur génération code :", errorMessage);
      }
    }
  };

  setTimeout(requestAndDisplayCode, 2000);

  intervalId = setInterval(async () => {
    if (!sock.authState.creds.registered) {
      if (latestPairingCode.includes("banni")) {
        clearInterval(intervalId);
        return;
      }
      await requestAndDisplayCode();
    } else {
      clearInterval(intervalId);
    }
  }, 2 * 1000); // Intervalle sécurisé à 30 secondes
}

// 👉 CONFIGURATION DU SERVEUR WEB POUR RENDER
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Page HTML pour entrer le numéro et voir le code
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Titan Bot - Connexion WhatsApp</title>
        <style>
            body { font-family: Arial, sans-serif; background: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
            input { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
            button { background: #25D366; color: white; border: none; padding: 12px; width: 100%; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: bold; }
            button:hover { background: #1ebe57; }
            .code-box { margin-top: 20px; background: #eef9f2; padding: 15px; border-radius: 6px; border: 1px dashed #25D366; font-size: 20px; font-weight: bold; color: #333; word-break: break-all; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Titan Bot WhatsApp</h2>
            <p>Entrez votre numéro avec l'indicatif pays (ex: 13412081269)</p>
            <form action="/start" method="POST">
                <input type="text" name="phone" placeholder="13412081269" required />
                <button type="submit">Générer le Code</button>
            </form>
            <div class="code-box" id="codeDisplay">Statut : ${latestPairingCode}</div>
        </div>
        <script>
            // Actualisation automatique de l'affichage du code toutes les 5 secondes
            setInterval(async () => {
                const res = await fetch('/status');
                const data = await res.json();
                document.getElementById('codeDisplay').innerText = "Code : " + data.code;
            }, 5000);
        </script>
    </body>
    </html>
  `);
});

// Route pour récupérer le statut du code en JSON
app.get('/status', (req, res) => {
  res.json({ code: latestPairingCode });
});

// Route pour lancer le bot avec le numéro soumis via le formulaire web
app.post('/start', (req, res) => {
  let userPhone = req.body.phone;
  if (userPhone) {
    // Nettoyage pour garder uniquement les chiffres
    userPhone = userPhone.replace(/[^0-9]/g, "");
    latestPairingCode = "Génération du code en cours pour " + userPhone + "...";
    startBotWithPhone(userPhone);
    res.redirect('/');
  } else {
    res.send("Numéro invalide. <a href='/'>Retour</a>");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur web en écoute sur le port ${PORT}`);
});
