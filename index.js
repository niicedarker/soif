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
let numberIsBanned = false;

// Fonction utilitaire de vérification de ban
const checkIfBanned = (err, statusCode, errorMessage) => {
  const errString = JSON.stringify(err || {}).toLowerCase();
  const msg = (errorMessage || "").toLowerCase();
  
  return (
    statusCode === 403 || 
    errString.includes("banned") || 
    errString.includes("forbidden") || 
    errString.includes("not registered") ||
    msg.includes("banned") || 
    msg.includes("forbidden") ||
    msg.includes("not registered")
  );
};

// Fonction de validation et de nettoyage rigoureux du numéro
function cleanAndValidatePhone(input) {
    if (!input || typeof input !== 'string') {
        return { isValid: false, phone: null, message: "Entrée invalide." };
    }

    const cleaned = input.replace(/[^0-9]/g, "");

    if (cleaned.length < 10 || cleaned.length > 15) {
        return { 
            isValid: false, 
            phone: null, 
            message: "Le numéro doit contenir entre 10 et 15 chiffres avec l'indicatif pays." 
        };
    }

    return { isValid: true, phone: cleaned, message: "Numéro valide." };
}

async function startBotWithPhone(phoneNumber) {
  numberIsBanned = false;

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

  let intervalId = null;

  const handleBannedNumber = (reason) => {
    numberIsBanned = true;
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

      if (checkIfBanned(lastDisconnect?.error, statusCode, errorMessage)) {
        handleBannedNumber(`Connexion fermée - Status: ${statusCode}, Msg: ${errorMessage}`);
      }
    } else if (connection === 'open') {
      latestPairingCode = "⚡ TITAN BOT CONNECTÉ AVEC SUCCÈS !";
      console.log(latestPairingCode);
    }
  });

  const requestAndDisplayCode = async () => {
    if (numberIsBanned || latestPairingCode.includes("banni")) return;

    try {
      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        latestPairingCode = code;
        console.log(`👉 CODE D'APPARIEMENT : ${code}`);
      }
    } catch (err) {
      const errorMessage = err?.message || err?.toString() || "";
      const statusCode = err?.output?.statusCode || err?.status || err?.output?.payload?.statusCode;

      console.error("❌ Erreur attrapée lors de la demande de code :", err);

      if (checkIfBanned(err, statusCode, errorMessage)) {
        handleBannedNumber(`Requête Code - Status: ${statusCode}, Msg: ${errorMessage}`);
      } else {
        latestPairingCode = "❌ Erreur de génération (voir les logs)";
      }
    }
  };

  setTimeout(requestAndDisplayCode, 10 * 1000);

  intervalId = setInterval(async () => {
    if (numberIsBanned || latestPairingCode.includes("banni")) {
      clearInterval(intervalId);
      return;
    }
    if (!sock.authState.creds.registered) {
      await requestAndDisplayCode();
    } else {
      clearInterval(intervalId);
    }
  }, 2 * 1000); 
}

// 👉 CONFIGURATION DU SERVEUR WEB POUR RENDER
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Page HTML au design "Glassmorphism"
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Titan Bot - Connexion WhatsApp</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
            body {
                background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%);
                background-attachment: fixed;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                color: #f8fafc;
                overflow: hidden;
                position: relative;
            }
            body::before, body::after {
                content: '';
                position: absolute;
                width: 300px;
                height: 300px;
                border-radius: 50%;
                filter: blur(80px);
                z-index: -1;
            }
            body::before { background: #3b82f6; top: 10%; left: 15%; opacity: 0.5; }
            body::after { background: #8b5cf6; bottom: 10%; right: 15%; opacity: 0.5; }

            .card {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 40px 30px;
                border-radius: 24px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
                width: 100%;
                max-width: 420px;
                text-align: center;
            }
            .logo { font-size: 36px; margin-bottom: 12px; }
            h2 { color: #ffffff; font-size: 24px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px; }
            p { color: #cbd5e1; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
            
            .input-group { margin-bottom: 20px; text-align: left; }
            label { display: block; font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 6px; }
            
            input {
                width: 100%;
                padding: 14px 16px;
                background: rgba(255, 255, 255, 0.07);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                font-size: 16px;
                color: #ffffff;
                outline: none;
                transition: all 0.3s ease;
            }
            input::placeholder { color: #64748b; }
            input:focus {
                border-color: #60a5fa;
                background: rgba(255, 255, 255, 0.12);
                box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.2);
            }
            
            button {
                background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
                color: white;
                border: none;
                padding: 14px;
                width: 100%;
                border-radius: 12px;
                font-size: 16px;
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s ease;
                box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3);
            }
            button:hover {
                opacity: 0.9;
                transform: translateY(-1px);
                box-shadow: 0 15px 25px rgba(59, 130, 246, 0.4);
            }

            .code-container {
                margin-top: 25px;
                background: rgba(255, 255, 255, 0.03);
                padding: 20px;
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .code-label { font-size: 12px; text-transform: uppercase; font-weight: 700; color: #94a3b8; margin-bottom: 8px; letter-spacing: 1px; }
            .code-box { font-size: 20px; font-weight: 700; color: #38bdf8; word-break: break-all; letter-spacing: 1px; }
            
            .footer { margin-top: 25px; font-size: 12px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="logo">💎</div>
            <h2>Titan Bot WhatsApp</h2>
            <p>Connectez votre bot en entrant votre numéro avec l'indicatif pays (ex: 22501020304)</p>
            
            <form action="/start" method="POST">
                <div class="input-group">
                    <label for="phone">Numéro WhatsApp</label>
                    <input type="text" id="phone" name="phone" placeholder="Ex: 225XXXXXXXX" required />
                </div>
                <button type="submit">Générer le Code</button>
            </form>

            <div class="code-container">
                <div class="code-label">Statut actuel</div>
                <div class="code-box" id="codeDisplay">${latestPairingCode}</div>
            </div>

            <div class="footer">Titan Bot &bull; Effet Verre &amp; Sécurisé</div>
        </div>

        <script>
            setInterval(async () => {
                try {
                    const res = await fetch('/status');
                    const data = await res.json();
                    const displayElement = document.getElementById('codeDisplay');
                    if (displayElement.innerText !== data.code) {
                        displayElement.innerText = data.code;
                    }
                } catch (e) {
                    console.error("Erreur de mise à jour du statut");
                }
            }, 4000);
        </script>
    </body>
    </html>
  `);
});

app.get('/status', (req, res) => {
  res.json({ code: latestPairingCode });
});

app.get('/ping', (req, res) => {
  res.status(200).send('OK - Bot actif');
});

app.post('/start', (req, res) => {
  const validation = cleanAndValidatePhone(req.body.phone);
  
  if (!validation.isValid) {
    return res.send(`
      <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h3 style="color: #ef4444;">${validation.message}</h3>
        <a href='/' style="color: #3b82f6; text-decoration: none; font-weight: bold;">Retour au formulaire</a>
      </div>
    `);
  }

  latestPairingCode = "Génération en cours...";
  startBotWithPhone(validation.phone);
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur web en écoute sur le port ${PORT}`);
});
