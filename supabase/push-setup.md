# Notifiche push: configurazione (una volta sola)

Le push arrivano anche a telefono bloccato. Su iPhone servono iOS 16.4 o successivo e l'app **installata sulla Home**
(Condividi > Aggiungi alla schermata Home): da Safari normale non funzionano.

1. **Chiavi.** Nel terminale: `npx web-push generate-vapid-keys`. Stampa una chiave pubblica e una privata. La privata non va mai nel codice né su GitHub.
2. **Chiave pubblica nell'app.** In `src/config.js` metti la chiave pubblica in `VAPID_PUBLIC_KEY`.
3. **Segreti su Supabase** (Edge Functions > Secrets):
   - `VAPID_PUBLIC_KEY` = la chiave pubblica
   - `VAPID_PRIVATE_KEY` = la chiave privata
   - `VAPID_SUBJECT` = `mailto:` seguito da una tua email (es. `mailto:tuoindirizzo@gmail.com`)
4. **Funzione.** Edge Functions > crea una funzione chiamata `send-push` e incolla `supabase/functions/send-push/index.ts`.
5. **Webhook.** Database > Webhooks > crea un webhook: tabella `notifications`, evento `Insert`, tipo "Supabase Edge Functions",
   funzione `send-push`, metodo POST. Nelle intestazioni usa "Add auth header with service key". Senza quell'intestazione la funzione rifiuta le chiamate.
6. **Attivazione.** Esegui `patch-11.sql`, fai il push del codice, apri l'app (installata, su iPhone), menu > Notifiche push > Attiva.
7. **Prova.** Con due account collegati, aggiungi una spesa condivisa dal primo: il secondo riceve la notifica.

Cose da sapere:
- Il testo della notifica compare anche sul blocco schermo (es. "Nuova spesa condivisa").
- Ogni dispositivo si attiva da solo. Uscendo dall'account, quel dispositivo smette di ricevere le notifiche di quell'utente.
- Se non arrivano: controlla Edge Functions > send-push > Logs.
