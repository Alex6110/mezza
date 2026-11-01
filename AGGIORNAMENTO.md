# Aggiornamento: cosa fare, in ordine

Questo zip contiene TUTTO il progetto. Copia i file nella tua cartella `mezza` SENZA sovrascrivere `src/config.js`
(contiene la tua chiave VAPID pubblica: nello zip il campo è vuoto) e senza toccare la cartella nascosta `.git`.

## 1. Webhook (Supabase > Database > Webhooks > notifiche_app)
- Spunta SOLO "Insert". Togli la spunta da "Update" (altrimenti ogni "segna come letta" manda una notifica in più).
- Lascia le 3 intestazioni: Content-type, Authorization e x-webhook-secret (con il valore uguale al segreto WEBHOOK_SECRET).
- "Update webhook".

## 2. Funzione (Supabase > Edge Functions > send-push)
- Code: sostituisci tutto con `supabase/functions/send-push/index.ts` di questo zip, poi Deploy.
- Settings della funzione: disattiva il controllo JWT ("Verify JWT"). È sicuro: la funzione rifiuta chi non ha il segreto.
- Il test del pulsante "Send Request" della dashboard dà 403 se non aggiungi l'intestazione x-webhook-secret: è normale. Usa il test dentro l'app (punto 5).

## 3. Database (SQL Editor)
- `patch-12.sql` se non l'hai ancora eseguito (testi chiari delle notifiche, avvisi per modifica ed eliminazione).
- `patch-13.sql` (serve al pulsante "Invia notifica di prova").
- Non rieseguire gli altri patch.

## 4. App
`git add .`, `git commit -m "aggiornamento"`, `git push`. Poi chiudi e riapri l'app sul telefono (due volte, per la cache).

## 5. Prova delle notifiche
1. Nell'app: menu > Notifiche push > Attiva (su iPhone l'app deve essere installata sulla Home).
2. Il pannello mostra "Dispositivi registrati sul server: 1". Se mostra 0 o "?", premi Disattiva e poi Attiva.
3. Premi "Invia notifica di prova": deve arrivare entro pochi secondi, anche con l'app chiusa e lo schermo bloccato.
4. Se non arriva: Supabase > Edge Functions > send-push > Logs. Cosa leggere:
   - "rifiutata: ... x-webhook-secret": l'intestazione nel webhook manca o è diversa da WEBHOOK_SECRET.
   - "nessun dispositivo iscritto": il passo 1 non è andato a buon fine.
   - nei dettagli, "stato: 201": il servizio delle notifiche ha accettato il messaggio (il telefono lo mostrerà).
   - "stato: 401" o "403": la chiave pubblica in `src/config.js` NON è la stessa del segreto VAPID_PUBLIC_KEY (devono venire dalla stessa coppia di chiavi), oppure VAPID_SUBJECT non inizia con "mailto:".
   - "stato: 404" o "410": il dispositivo non esiste più; riattiva le notifiche.
