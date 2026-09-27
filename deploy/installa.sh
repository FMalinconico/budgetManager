#!/usr/bin/env bash
#
# Scarica Budget Famiglia da GitHub e la pubblica con Apache su questo server.
#
# Si lancia sul server con curl, senza bisogno di una copia del repository.
# Con il repository pubblico:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/FMalinconico/budgetManager/HEAD/deploy/installa.sh)
#
# Con il repository privato serve un token GitHub che possa leggerne i contenuti
# (vedi README, sezione "Installazione con curl").
#
# Lo script scarica i sorgenti in ~/budget-famiglia, controlla che ci siano
# Node.js, npm e rsync (se mancano propone di installarli) e lancia
# deploy/pubblica.sh su questa macchina. Gli argomenti passano a
# deploy/pubblica.sh, per esempio --installa o --prova.
#
# Variabili facoltative: GITHUB_TOKEN (per il repository privato), RAMO (se non
# è quello predefinito), SORGENTI (dove mettere i sorgenti), e quelle di
# deploy/pubblica.sh come PORTA e DESTINAZIONE.

set -euo pipefail

REPOSITORY="FMalinconico/budgetManager"
RAMO="${RAMO:-}"
SORGENTI="${SORGENTI:-$HOME/budget-famiglia}"
API_GITHUB="${API_GITHUB:-https://api.github.com}"

errore() {
  printf '\nErrore: %s\n' "$*" >&2
  exit 1
}

passo() {
  printf '\n==> %s\n' "$*"
}

# Il terminale di chi lancia lo script, anche quando lo script arriva da una
# pipe (curl ... | bash): le domande si fanno lì.
if { true </dev/tty; } 2>/dev/null; then TERMINALE=/dev/tty; else TERMINALE=""; fi

chiedi_conferma() {
  local risposta
  [[ -n "$TERMINALE" ]] || return 1
  read -r -p "$1 [s/N] " risposta <"$TERMINALE" || return 1
  [[ "$risposta" == [sSyY]* ]]
}

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then SUDO="sudo"; fi

if command -v apt-get >/dev/null 2>&1; then
  GESTORE="apt-get"
elif command -v dnf >/dev/null 2>&1; then
  GESTORE="dnf"
elif command -v yum >/dev/null 2>&1; then
  GESTORE="yum"
else
  GESTORE=""
fi

installa_pacchetti() {
  case "$GESTORE" in
    apt-get) $SUDO apt-get update -qq </dev/null && $SUDO apt-get install -y -qq "$@" </dev/null ;;
    dnf | yum) $SUDO "$GESTORE" install -y -q "$@" </dev/null ;;
    *) return 1 ;;
  esac
}

node_adatto() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && node -e '
    const [maggiore, minore] = process.versions.node.split(".").map(Number)
    process.exit(maggiore > 22 || (maggiore === 22 && minore >= 12) || (maggiore === 20 && minore >= 19) ? 0 : 1)
  ' 2>/dev/null
}

# Node.js 22 LTS dai pacchetti ufficiali di NodeSource.
installa_node() {
  local indirizzo
  case "$GESTORE" in
    apt-get) indirizzo="https://deb.nodesource.com/setup_22.x" ;;
    dnf | yum) indirizzo="https://rpm.nodesource.com/setup_22.x" ;;
    *) return 1 ;;
  esac
  curl -fsSL "$indirizzo" -o "$LAVORO/nodesource.sh" &&
    $SUDO bash "$LAVORO/nodesource.sh" </dev/null &&
    installa_pacchetti nodejs
}

LAVORO="$(mktemp -d)"
trap 'rm -rf "$LAVORO"' EXIT

# ---------------------------------------------------------------------------
# Prerequisiti
# ---------------------------------------------------------------------------

passo "Controllo i prerequisiti"
for comando in curl tar; do
  command -v "$comando" >/dev/null 2>&1 || errore "manca il comando \"$comando\": installalo e riprova."
done
if [[ -n "$SUDO" ]] && ! command -v sudo >/dev/null 2>&1; then
  errore "servono i permessi di amministratore: lancia lo script come root oppure installa sudo."
fi

if ! command -v rsync >/dev/null 2>&1; then
  if chiedi_conferma "Manca rsync, che serve per copiare i file. Lo installo?" && installa_pacchetti rsync; then
    echo "rsync installato."
  else
    errore "serve rsync: installalo (per esempio sudo apt-get install rsync) e rilancia il comando."
  fi
fi

if ! node_adatto; then
  echo "Per compilare l'app serve Node.js 20.19 o successivo, con npm: qui $(command -v node >/dev/null 2>&1 && echo "c'è la versione $(node --version)" || echo "non c'è")."
  if [[ -n "$GESTORE" ]] && chiedi_conferma "Installo Node.js 22 LTS dai pacchetti ufficiali di NodeSource?" && installa_node && node_adatto; then
    echo "Node.js $(node --version) installato."
  else
    errore "installa Node.js 20.19 o successivo (https://nodejs.org/it/download) e rilancia il comando."
  fi
fi
echo "Ok: Node.js $(node --version), npm $(npm --version), rsync."

# ---------------------------------------------------------------------------
# Sorgenti da GitHub
# ---------------------------------------------------------------------------

# Scarica l'archivio dei sorgenti e stampa il codice HTTP della risposta.
scarica_sorgenti() {
  local token="$1" intestazioni=(-H "Accept: application/vnd.github+json")
  if [[ -n "$token" ]]; then intestazioni+=(-H "Authorization: Bearer $token"); fi
  curl -sSL --max-time 180 -o "$LAVORO/sorgenti.tar.gz" -w '%{http_code}' "${intestazioni[@]}" \
    "$API_GITHUB/repos/$REPOSITORY/tarball${RAMO:+/$RAMO}"
}

passo "Scarico i sorgenti di $REPOSITORY${RAMO:+ (ramo $RAMO)}"
TOKEN="${GITHUB_TOKEN:-}"
CODICE="$(scarica_sorgenti "$TOKEN")" || errore "download non riuscito: controlla che il server raggiunga $API_GITHUB."
# Per un repository privato, senza token GitHub risponde 404 come se non esistesse.
if [[ "$CODICE" == 404 && -z "$TOKEN" ]]; then
  [[ -n "$TERMINALE" ]] ||
    errore "il repository è privato: rendilo pubblico per il tempo dell'installazione, oppure imposta GITHUB_TOKEN."
  echo "Il repository è privato: serve un token GitHub che possa leggerne i contenuti."
  read -r -s -p "Token GitHub: " TOKEN <"$TERMINALE"
  echo
  CODICE="$(scarica_sorgenti "$TOKEN")" || errore "download non riuscito: controlla che il server raggiunga $API_GITHUB."
fi
case "$CODICE" in
  200) ;;
  401) errore "GitHub non accetta il token (401): controlla di averlo copiato per intero e che non sia scaduto." ;;
  403) errore "GitHub ha rifiutato la richiesta (403): senza token si possono fare al massimo 60 richieste l'ora, oppure il token non ha i permessi giusti." ;;
  404) errore "GitHub non mi lascia leggere $REPOSITORY${RAMO:+ al ramo $RAMO} (404): il token deve poter leggere i contenuti del repository${RAMO:+ e il ramo deve esistere}." ;;
  *) errore "GitHub ha risposto con il codice $CODICE." ;;
esac

mkdir "$LAVORO/estratti"
tar -xzf "$LAVORO/sorgenti.tar.gz" -C "$LAVORO/estratti"
ESTRATTI="$(find "$LAVORO/estratti" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "$ESTRATTI" && -f "$ESTRATTI/deploy/pubblica.sh" ]] ||
  errore "l'archivio scaricato non contiene deploy/pubblica.sh${RAMO:+: il ramo $RAMO è quello giusto?}"
# La cartella dell'archivio si chiama <proprietario>-<repository>-<commit>.
COMMIT="${ESTRATTI##*-}"
COMMIT="${COMMIT:0:7}"

if [[ -e "$SORGENTI" ]]; then
  [[ ! -e "$SORGENTI/.git" ]] ||
    errore "$SORGENTI è una copia git: aggiornala con git pull e lancia direttamente deploy/pubblica.sh, oppure indica un'altra cartella con SORGENTI=/percorso."
  [[ -f "$SORGENTI/deploy/pubblica.sh" ]] ||
    errore "$SORGENTI esiste già e non contiene Budget Famiglia: indica un'altra cartella con SORGENTI=/percorso."
  # La configurazione locale della pubblicazione si conserva da una versione all'altra.
  if [[ -f "$SORGENTI/deploy/pubblica.conf" ]]; then cp "$SORGENTI/deploy/pubblica.conf" "$ESTRATTI/deploy/"; fi
  rm -rf "$SORGENTI"
fi
mkdir -p "$(dirname "$SORGENTI")"
mv "$ESTRATTI" "$SORGENTI"
chmod +x "$SORGENTI/deploy/"*.sh
echo "Sorgenti del commit $COMMIT in $SORGENTI."

# ---------------------------------------------------------------------------
# Pubblicazione su questa macchina
# ---------------------------------------------------------------------------

passo "Avvio la pubblicazione"
cd "$SORGENTI"
# Il token non serve più: non lo si passa agli altri programmi.
if [[ -n "$TERMINALE" ]]; then
  env -u GITHUB_TOKEN SERVER="" VERSIONE_PUBBLICATA="$COMMIT" deploy/pubblica.sh "$@" <"$TERMINALE"
else
  env -u GITHUB_TOKEN SERVER="" VERSIONE_PUBBLICATA="$COMMIT" deploy/pubblica.sh "$@"
fi
