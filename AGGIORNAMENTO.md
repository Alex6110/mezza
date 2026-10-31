# Aggiornamento: cosa fare, in ordine

Questo zip contiene TUTTO il progetto (le fasi vecchie e quelle nuove): basta usare questo.

## A. Risolvere il 403 delle notifiche (5 minuti)
1. Inventa un segreto lungo. Da terminale: `openssl rand -hex 24` (oppure una stringa casuale di almeno 30 caratteri). Copialo.
2. Supabase > Edge Functions > Secrets: aggiungi `WEBHOOK_SECRET` con quel valore.
3. Supabase > Edge Functions > `send-push`: sostituisci tutto il codice con quello del file `supabase/functions/send-push/index.ts` di questo zip e premi Deploy.
4. Supabase > Database > Webhooks > `notifiche_app` > pulsante "Add header": nome `x-webhook-secret`, valore lo stesso segreto del punto 1. Lascia le altre intestazioni. Premi "Update webhook".
5. Prova: aggiungi una spesa condivisa con un contatto collegato che ha attivato le notifiche. Se non arriva, guarda Edge Functions > send-push > Logs.

## B. Database
Esegui nel SQL Editor SOLO `patch-12.sql` (testi chiari delle notifiche, avvisi per modifica/eliminazione).
Se non avevi ancora eseguito `patch-11.sql`, esegui prima quello. Non rieseguire i patch vecchi: alcuni danno errore se ripetuti.

## C. App
1. Estrai lo zip e copia i file DENTRO la cartella `mezza` che già usi (la cartella nascosta `.git` non va toccata).
2. Dal terminale, nella cartella `mezza`: `git add .`, `git commit -m "aggiornamento"`, `git push`.
3. Netlify pubblica da solo. Ricarica l'app un paio di volte; sul telefono chiudila e riaprila.
4. In `src/config.js` ricontrolla che `VAPID_PUBLIC_KEY` sia la tua chiave pubblica (se hai scaricato un nuovo zip il campo è vuoto: rimetti la chiave).

## D. Cosa c'è di nuovo
- Notifiche con testo chiaro (chi, cosa, quanto) e avvisi per spesa modificata, eliminata e saldo annullato.
- Swipe a sinistra per eliminare le tue spese (Home e pagina persona).
- Ricerca e filtri per periodo in Home.
- Colore dell'app a scelta (Impostazioni > Preferenze).
- Correzioni per Android e browser meno recenti: niente più riquadri e sfondi che spariscono.
