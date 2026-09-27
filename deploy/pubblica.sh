#!/usr/bin/env bash
#
# Pubblica Budget Famiglia su un server Linux con Apache.
#
# L'app è fatta solo di file statici. Alla prima esecuzione lo script configura
# Apache perché la serva su una porta tutta sua, che scegli tu; poi, a ogni
# esecuzione, esegue i test, compila l'app e copia i file sul server via SSH
# con rsync. Lanciato direttamente sul server (SERVER vuoto) lavora in locale.
#
# La configurazione si legge da deploy/pubblica.conf: vedi l'esempio in
# deploy/pubblica.conf.esempio, oppure deploy/pubblica.sh --aiuto.

set -euo pipefail

RADICE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIGURAZIONE="$RADICE/deploy/pubblica.conf"
NOME_SITO="budget-famiglia"
# File vuoto lasciato nella destinazione: indica che la cartella è gestita da questo script.
MARCATORE=".budget-famiglia"

uso() {
  cat <<'FINE'
Uso: deploy/pubblica.sh [--installa] [--prova] [--forza]

La prima volta configura Apache sul server (chiede su quale porta servire
l'app), poi a ogni esecuzione esegue i test, compila e pubblica.

  --installa  rifà la configurazione di Apache, per esempio per cambiare porta
  --prova     mostra cosa verrebbe fatto, senza toccare il server
  --forza     pubblica anche in una cartella non vuota mai usata da questo
              script (il suo contenuto attuale verrà cancellato)

Configurazione in deploy/pubblica.conf (parti da deploy/pubblica.conf.esempio).
Le stesse variabili si possono passare dall'ambiente, che ha la precedenza:

  SERVER        utente@host per SSH; vuoto per lavorare su questa macchina
  DESTINAZIONE  cartella da cui Apache serve l'app (predefinita
                /var/www/budget-famiglia)
  PORTA         porta per Apache all'installazione; se manca, lo script la chiede
  PORTA_SSH     porta SSH (predefinita 22)
  CHIAVE_SSH    chiave privata SSH da usare (facoltativa)
  URL_PUBBLICO  indirizzo dell'app, se non è http://host:porta (per esempio
                dietro un dominio): serve alla verifica finale

Esempio senza file di configurazione:
  SERVER=frank@mio-server.it deploy/pubblica.sh
FINE
}

errore() {
  printf '\nErrore: %s\n' "$*" >&2
  exit 1
}

passo() {
  printf '\n==> %s\n' "$*"
}

OPZIONE_INSTALLA=0
PROVA=0
FORZA=0
for argomento in "$@"; do
  case "$argomento" in
    --installa) OPZIONE_INSTALLA=1 ;;
    --prova) PROVA=1 ;;
    --forza) FORZA=1 ;;
    -h | --help | --aiuto)
      uso
      exit 0
      ;;
    *) errore "opzione sconosciuta: $argomento (vedi deploy/pubblica.sh --aiuto)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------

if [[ -f "$CONFIGURAZIONE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIGURAZIONE"
fi
SERVER="${SERVER-}"
DESTINAZIONE="${DESTINAZIONE:-/var/www/$NOME_SITO}"
PORTA="${PORTA-}"
PORTA_SSH="${PORTA_SSH:-22}"
CHIAVE_SSH="${CHIAVE_SSH-}"
URL_PUBBLICO="${URL_PUBBLICO-}"

while [[ "$DESTINAZIONE" == */ && "$DESTINAZIONE" != / ]]; do DESTINAZIONE="${DESTINAZIONE%/}"; done
[[ "$DESTINAZIONE" =~ ^/[A-Za-z0-9._/-]+$ ]] ||
  errore "DESTINAZIONE deve essere un percorso assoluto fatto di lettere, cifre, . _ - e /, non \"$DESTINAZIONE\"."
case "/$DESTINAZIONE/" in
  */./* | */../*) errore "DESTINAZIONE non può contenere . o .. come cartella ($DESTINAZIONE)." ;;
esac
case "$DESTINAZIONE" in
  / | /bin | /boot | /dev | /etc | /home | /lib | /lib64 | /media | /mnt | /opt | /proc | /root | /run | /sbin | /srv | /sys | /tmp | /usr | /var | /var/www)
    errore "DESTINAZIONE \"$DESTINAZIONE\" è una cartella di sistema o condivisa: usa una cartella dedicata, per esempio /var/www/$NOME_SITO."
    ;;
esac
[[ "$PORTA_SSH" =~ ^[0-9]+$ ]] || errore "PORTA_SSH deve essere un numero, non \"$PORTA_SSH\"."
if [[ -n "$CHIAVE_SSH" && ! -r "$CHIAVE_SSH" ]]; then
  errore "non riesco a leggere la chiave SSH \"$CHIAVE_SSH\"."
fi

for comando in node npm rsync base64; do
  command -v "$comando" >/dev/null 2>&1 || errore "manca il comando \"$comando\": installalo e riprova."
done
if [[ -n "$SERVER" ]]; then
  command -v ssh >/dev/null 2>&1 || errore "manca il comando \"ssh\": installalo e riprova."
fi
node -e '
  const [maggiore, minore] = process.versions.node.split(".").map(Number)
  process.exit(maggiore > 22 || (maggiore === 22 && minore >= 12) || (maggiore === 20 && minore >= 19) ? 0 : 1)
' || errore "serve Node.js 20.19 o successivo (22.12+ per la serie 22), ora c'è $(node --version)."

OPZIONI_SSH=(-p "$PORTA_SSH")
if [[ -n "$CHIAVE_SSH" ]]; then OPZIONI_SSH+=(-i "$CHIAVE_SSH"); fi

if [[ -n "$SERVER" ]]; then
  BERSAGLIO="$SERVER:$DESTINAZIONE"
  HOST="${SERVER#*@}"
else
  BERSAGLIO="$DESTINAZIONE"
  HOST="localhost"
fi

# Esegue uno script sh sul server (via SSH) o su questa macchina, con l'utente normale.
# Gli argomenti contengono solo caratteri sicuri (verificati sopra), quindi possono
# passare alla shell remota senza virgolette.
esegui_sul_server() {
  local script="$1"
  shift
  if [[ -n "$SERVER" ]]; then
    # shellcheck disable=SC2029
    ssh "${OPZIONI_SSH[@]}" "$SERVER" "sh -s -- $*" <<<"$script"
  else
    sh -s -- "$@" <<<"$script"
  fi
}

# Come esegui_sul_server, ma da amministratore: con sudo se l'utente non è root.
# Lo script viaggia nella riga di comando (in base64) così il terminale resta
# libero per l'eventuale password di sudo.
esegui_come_root() {
  local script="$1"
  shift
  local sudo=""
  if [[ "$UTENTE_SERVER" != root ]]; then sudo="sudo"; fi
  if [[ -n "$SERVER" ]]; then
    local codificato opzioni=("${OPZIONI_SSH[@]}")
    codificato="$(printf '%s' "$script" | base64 | tr -d '\n')"
    if [[ -t 0 ]]; then opzioni+=(-t); fi
    # shellcheck disable=SC2029
    ssh "${opzioni[@]}" "$SERVER" "printf '%s' $codificato | base64 -d | $sudo sh -s -- $*"
  else
    printf '%s' "$script" | $sudo sh -s -- "$@"
  fi
}

# ---------------------------------------------------------------------------
# Ispezione del server: cartella, Apache, porte occupate
# ---------------------------------------------------------------------------

passo "Controllo il server${SERVER:+ $SERVER}"
# shellcheck disable=SC2016 # gli script tra apici girano in sh sul server: le variabili sono loro.
ISPEZIONE='
dest="$1"; marcatore="$2"; nome="$3"
echo "utente=$(id -un)"
if [ -e "$dest" ] && [ ! -d "$dest" ]; then echo "destinazione=non-cartella"
elif [ ! -d "$dest" ]; then echo "destinazione=assente"
elif [ -z "$(ls -A "$dest")" ]; then echo "destinazione=vuota"
elif [ -e "$dest/$marcatore" ]; then echo "destinazione=nostra"
else echo "destinazione=estranea"; fi
if [ -d "$dest" ] && [ -w "$dest" ]; then echo "scrivibile=si"; else echo "scrivibile=no"; fi
conf=""
if [ -x /usr/sbin/a2ensite ] && [ -d /etc/apache2/sites-available ]; then
  echo "apache=debian"; conf="/etc/apache2/sites-available/$nome.conf"
elif [ -d /etc/httpd/conf.d ]; then
  echo "apache=rhel"; conf="/etc/httpd/conf.d/$nome.conf"
else
  echo "apache=nessuno"
fi
porta=""
if [ -n "$conf" ] && [ -r "$conf" ]; then
  porta="$(sed -n "s/^# $nome porta=\([0-9][0-9]*\).*/\1/p" "$conf" | head -n 1)"
fi
echo "porta_app=$porta"
if command -v rsync >/dev/null 2>&1; then echo "rsync=si"; else echo "rsync=no"; fi
if command -v ss >/dev/null 2>&1; then
  elenco="$(ss -ltn 2>/dev/null | awk "NR > 1 { print \$4 }")"
elif command -v netstat >/dev/null 2>&1; then
  elenco="$(netstat -ltn 2>/dev/null | awk "NR > 2 { print \$4 }")"
else
  elenco="?"
fi
echo "porte_occupate=$(echo "$elenco" | sed "s/.*://" | sort -un | tr "\n" " ")"
'
if ! RISPOSTA="$(esegui_sul_server "$ISPEZIONE" "$DESTINAZIONE" "$MARCATORE" "$NOME_SITO")"; then
  errore "non riesco a collegarmi a $SERVER. Prova a mano: ssh ${OPZIONI_SSH[*]} $SERVER"
fi

UTENTE_SERVER=""
STATO_DESTINAZIONE=""
DESTINAZIONE_SCRIVIBILE=""
APACHE=""
PORTA_APP=""
PORTE_OCCUPATE=""
RSYNC_SUL_SERVER=""
while IFS='=' read -r chiave valore; do
  case "$chiave" in
    utente) UTENTE_SERVER="$valore" ;;
    destinazione) STATO_DESTINAZIONE="$valore" ;;
    scrivibile) DESTINAZIONE_SCRIVIBILE="$valore" ;;
    apache) APACHE="$valore" ;;
    porta_app) PORTA_APP="$valore" ;;
    porte_occupate) PORTE_OCCUPATE="$valore" ;;
    rsync) RSYNC_SUL_SERVER="$valore" ;;
  esac
done <<<"$RISPOSTA"
[[ -n "$UTENTE_SERVER" && -n "$STATO_DESTINAZIONE" ]] || errore "risposta inattesa dal server: $RISPOSTA"
if [[ "$RSYNC_SUL_SERVER" != si ]]; then
  errore "sul server manca rsync, che serve per copiare i file. Installalo con: sudo apt install rsync (oppure sudo dnf install rsync)"
fi

case "$STATO_DESTINAZIONE" in
  non-cartella) errore "$DESTINAZIONE esiste sul server ma non è una cartella." ;;
  estranea)
    if ((FORZA)); then
      echo "Attenzione (--forza): i file che $DESTINAZIONE contiene adesso verranno cancellati."
    else
      errore "$DESTINAZIONE non è vuota e non è mai stata usata da questo script: pubblicando, i file che contiene verrebbero cancellati. Controlla la cartella, oppure rilancia con --forza se va bene così."
    fi
    ;;
esac

if [[ -n "$PORTA_APP" ]]; then
  echo "Apache serve già l'app sulla porta $PORTA_APP."
else
  echo "L'app non è ancora configurata in Apache: prima la installo."
fi

# ---------------------------------------------------------------------------
# Installazione su Apache (la prima volta, o con --installa)
# ---------------------------------------------------------------------------

# Stampa perché la porta non va bene, oppure niente se va bene.
problema_porta() {
  local porta="$1"
  if ! [[ "$porta" =~ ^[1-9][0-9]{0,4}$ ]] || ((10#$porta > 65535)); then
    echo "la porta deve essere un numero tra 1 e 65535"
  elif [[ "$porta" != "$PORTA_APP" && " $PORTE_OCCUPATE " == *" $porta "* ]]; then
    echo "la porta $porta è già usata da un altro servizio sul server"
  fi
}

chiedi_porta() {
  local proposta="${PORTA_APP:-8080}" risposta problema
  while true; do
    read -r -p "Porta su cui Apache servirà l'app [$proposta]: " risposta || errore "nessuna porta indicata."
    risposta="${risposta:-$proposta}"
    problema="$(problema_porta "$risposta")"
    if [[ -z "$problema" ]]; then
      PORTA="$risposta"
      return
    fi
    echo "  No: $problema. Scegline un'altra."
  done
}

configurazione_apache() {
  local famiglia="$1" porta="$2" registri
  # shellcheck disable=SC2016 # la variabile la espande Apache (Debian), non la shell.
  if [[ "$famiglia" == debian ]]; then registri='${APACHE_LOG_DIR}'; else registri='logs'; fi
  cat <<FINE
# $NOME_SITO porta=$porta
# Generato da deploy/pubblica.sh: per cambiare porta rilancialo con --installa.
Listen $porta

<VirtualHost *:$porta>
    DocumentRoot $DESTINAZIONE
    DirectoryIndex index.html

    <Directory $DESTINAZIONE>
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>

    <IfModule mod_headers.c>
        # I file in assets/ hanno l'hash nel nome e non cambiano mai: cache lunga.
        <LocationMatch "^/assets/">
            Header set Cache-Control "public, max-age=31536000, immutable"
        </LocationMatch>
        # index.html e versione.txt vanno sempre ricontrollati, così dopo una
        # pubblicazione il telefono carica subito la versione nuova.
        <LocationMatch "^/(index\.html|versione\.txt)?$">
            Header set Cache-Control "no-cache"
        </LocationMatch>
    </IfModule>

    # I file nascosti, come il marcatore dello script di pubblicazione, non si servono.
    <FilesMatch "^\.">
        Require all denied
    </FilesMatch>

    ErrorLog $registri/$NOME_SITO-errori.log
    CustomLog $registri/$NOME_SITO-accessi.log combined
</VirtualHost>
FINE
}

# shellcheck disable=SC2016 # gira in sh sul server, da amministratore.
INSTALLAZIONE='
set -eu
famiglia="$1"; dest="$2"; porta="$3"; nome="$4"; configurazione="$5"
proprietario="${SUDO_USER:-$(id -un)}"
case "$famiglia" in
  debian) conf="/etc/apache2/sites-available/$nome.conf"; servizio=apache2 ;;
  rhel) conf="/etc/httpd/conf.d/$nome.conf"; servizio=httpd ;;
  *) echo "Tipo di Apache sconosciuto: $famiglia" >&2; exit 1 ;;
esac

mkdir -p "$dest"
chown "$proprietario:" "$dest"
chmod 755 "$dest"
echo "Cartella $dest pronta (proprietario $proprietario)."

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = Enforcing ]; then
  if command -v semanage >/dev/null 2>&1; then
    semanage port -a -t http_port_t -p tcp "$porta" 2>/dev/null || semanage port -m -t http_port_t -p tcp "$porta" 2>/dev/null || true
    restorecon -R "$dest" 2>/dev/null || true
  else
    echo "Attenzione: SELinux è attivo ma manca semanage. Se Apache non parte: semanage port -a -t http_port_t -p tcp $porta"
  fi
fi

copia=""
if [ -f "$conf" ]; then copia="$(mktemp)"; cp "$conf" "$copia"; fi
ripristina() {
  if [ -n "$copia" ]; then
    cp "$copia" "$conf"
    rm -f "$copia"
  else
    rm -f "$conf"
    if [ "$famiglia" = debian ]; then rm -f "/etc/apache2/sites-enabled/$nome.conf"; fi
  fi
}

printf "%s" "$configurazione" | base64 -d >"$conf"
chmod 644 "$conf"
if [ "$famiglia" = debian ]; then
  a2enmod -q headers >/dev/null
  a2ensite -q "$nome" >/dev/null
fi

if ! controllo="$(apachectl configtest 2>&1)"; then
  echo "La configurazione di Apache non è valida, ripristino quella di prima:" >&2
  echo "$controllo" >&2
  ripristina
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$servizio" 2>/dev/null; then
  if ! systemctl reload "$servizio" || ! sleep 2 || ! systemctl is-active --quiet "$servizio"; then
    echo "Apache non ha accettato la nuova configurazione: ripristino quella di prima e lo riavvio." >&2
    ripristina
    systemctl restart "$servizio" || true
    exit 1
  fi
elif ! apachectl graceful; then
  echo "Apache non ha accettato la nuova configurazione: ripristino quella di prima." >&2
  ripristina
  apachectl graceful || true
  exit 1
fi
if [ -n "$copia" ]; then rm -f "$copia"; fi

in_ascolto=""
for tentativo in 1 2 3 4 5; do
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk "{ print \$4 }" | grep -q ":$porta\$"; then in_ascolto=si; break; fi
  sleep 1
done
if [ "$in_ascolto" = si ]; then
  echo "Apache ($servizio) serve l'"'"'app sulla porta $porta."
else
  echo "Attenzione: non vedo Apache in ascolto sulla porta $porta. Controlla con: sudo apachectl -S" >&2
fi

if [ -f /etc/ufw/ufw.conf ] && grep -q "^ENABLED=yes" /etc/ufw/ufw.conf; then
  if ! ufw status 2>/dev/null | grep -qE "^$porta(/tcp)?[[:space:]]"; then
    echo "Il firewall ufw è attivo: per raggiungere l'"'"'app da altri dispositivi apri la porta con"
    echo "  sudo ufw allow $porta/tcp"
  fi
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  if ! firewall-cmd --query-port="$porta/tcp" >/dev/null 2>&1; then
    echo "Il firewall firewalld è attivo: per raggiungere l'"'"'app da altri dispositivi apri la porta con"
    echo "  sudo firewall-cmd --permanent --add-port=$porta/tcp && sudo firewall-cmd --reload"
  fi
fi
'

if ((OPZIONE_INSTALLA)) || [[ -z "$PORTA_APP" ]]; then
  [[ "$APACHE" != nessuno ]] ||
    errore "sul server non trovo Apache (cerco /etc/apache2 su Debian e Ubuntu, /etc/httpd su Red Hat, Fedora e simili)."
  if [[ -n "$PORTA" ]]; then
    problema="$(problema_porta "$PORTA")"
    [[ -z "$problema" ]] || errore "PORTA=$PORTA non va bene: $problema."
  elif [[ -t 0 ]]; then
    passo "Scelta della porta"
    echo "Porte già occupate sul server: ${PORTE_OCCUPATE:-nessuna}"
    chiedi_porta
  else
    errore "per l'installazione serve la porta: rilancia da un terminale oppure imposta PORTA (es. PORTA=8080)."
  fi

  CONFIGURAZIONE_APACHE="$(configurazione_apache "$APACHE" "$PORTA")"
  if ((PROVA)); then
    passo "Prova: configurerei Apache ($APACHE) con questo sito, sulla porta $PORTA"
    printf '%s\n' "$CONFIGURAZIONE_APACHE"
  else
    passo "Configuro Apache sulla porta $PORTA"
    if [[ "$UTENTE_SERVER" != root ]]; then echo "Serve sudo: se richiesta, inserisci la password di $UTENTE_SERVER sul server."; fi
    esegui_come_root "$INSTALLAZIONE" "$APACHE" "$DESTINAZIONE" "$PORTA" "$NOME_SITO" \
      "$(printf '%s' "$CONFIGURAZIONE_APACHE" | base64 | tr -d '\n')" ||
      errore "configurazione di Apache non riuscita: vedi i messaggi sopra."
    PORTA_APP="$PORTA"
    DESTINAZIONE_SCRIVIBILE="si"
    if [[ "$STATO_DESTINAZIONE" == assente ]]; then STATO_DESTINAZIONE="vuota"; fi
  fi
elif [[ -n "$PORTA" && "$PORTA" != "$PORTA_APP" ]]; then
  echo "PORTA=$PORTA ignorata: l'app è già sulla porta $PORTA_APP. Per cambiarla usa --installa."
fi

# ---------------------------------------------------------------------------
# Cartella di destinazione scrivibile dall'utente SSH
# ---------------------------------------------------------------------------

if ((!PROVA)) && [[ "$DESTINAZIONE_SCRIVIBILE" != si ]]; then
  # shellcheck disable=SC2016
  PREPARA='dest="$1"; mkdir -p "$dest" 2>/dev/null || true; if [ -d "$dest" ] && [ -w "$dest" ]; then echo si; else echo no; fi'
  if [[ "$(esegui_sul_server "$PREPARA" "$DESTINAZIONE")" != si ]]; then
    errore "l'utente $UTENTE_SERVER non può scrivere in $DESTINAZIONE. Sul server: sudo mkdir -p $DESTINAZIONE && sudo chown $UTENTE_SERVER: $DESTINAZIONE"
  fi
fi

# ---------------------------------------------------------------------------
# Test e compilazione
# ---------------------------------------------------------------------------

cd "$RADICE"

VERSIONE="sconosciuta"
if git rev-parse --git-dir >/dev/null 2>&1; then
  VERSIONE="$(git rev-parse --short HEAD 2>/dev/null || echo sconosciuta)"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    VERSIONE="$VERSIONE-modificata"
    echo "Attenzione: ci sono modifiche non committate, quindi la versione pubblicata non corrisponde a un commit."
  fi
fi

passo "Installo le dipendenze"
npm ci --no-audit --no-fund

passo "Eseguo i test"
npm test

passo "Compilo l'app (versione $VERSIONE)"
npm run build
printf 'Budget Famiglia\nversione: %s\npubblicata: %s\n' "$VERSIONE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >dist/versione.txt
: >"dist/$MARCATORE"

# ---------------------------------------------------------------------------
# Copia
# ---------------------------------------------------------------------------

OPZIONI_RSYNC=(--recursive --links --perms --times "--chmod=D755,F644")
if [[ -n "$SERVER" ]]; then
  # rsync divide da sé il comando: gli apici (letterali) tengono intero il percorso della chiave.
  # shellcheck disable=SC2016
  OPZIONI_RSYNC+=(--rsh="ssh -p $PORTA_SSH${CHIAVE_SSH:+ -i '$CHIAVE_SSH'}")
fi
if ((PROVA)); then OPZIONI_RSYNC+=(--dry-run --itemize-changes); fi

if ((PROVA)) && [[ "$STATO_DESTINAZIONE" == assente ]]; then
  passo "Prova: questi file verrebbero copiati nella nuova cartella $BERSAGLIO"
  (cd dist && find . -type f | sed 's|^\./||' | sort)
else
  if ((PROVA)); then passo "Prova: ecco cosa cambierebbe in $BERSAGLIO"; else passo "Copio i file in $BERSAGLIO"; fi
  # Prima i file con l'hash nel nome, poi index.html: così la pagina pubblicata
  # non punta mai a file non ancora arrivati.
  if [[ -d dist/assets ]]; then
    rsync "${OPZIONI_RSYNC[@]}" dist/assets/ "$BERSAGLIO/assets/"
  fi
  # Poi tutto il resto, cancellando i file rimasti dalle versioni precedenti.
  rsync "${OPZIONI_RSYNC[@]}" --delete-after dist/ "$BERSAGLIO/"
fi

if ((PROVA)); then
  printf '\nProva terminata: sul server non è stato modificato niente.\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# Verifica dal web
# ---------------------------------------------------------------------------

INDIRIZZO="${URL_PUBBLICO:-http://$HOST:$PORTA_APP}"
INDIRIZZO="${INDIRIZZO%/}"
printf '\nPubblicata la versione %s in %s.\n' "$VERSIONE" "$BERSAGLIO"

if command -v curl >/dev/null 2>&1; then
  VERSIONE_ONLINE="$(curl -fsSL --max-time 15 "$INDIRIZZO/versione.txt" 2>/dev/null | sed -n 's/^versione: //p')" || VERSIONE_ONLINE=""
  if [[ "$VERSIONE_ONLINE" == "$VERSIONE" ]]; then
    echo "Verificato: $INDIRIZZO risponde con la versione $VERSIONE."
  else
    echo "Attenzione: $INDIRIZZO/versione.txt non risponde con la versione appena pubblicata (${VERSIONE_ONLINE:-nessuna risposta})."
    echo "Se da qui il server non è raggiungibile su quella porta (firewall, nome host), controlla da un browser;"
    echo "se usi un dominio o un proxy, indica l'indirizzo giusto in URL_PUBBLICO."
  fi
fi
echo "Apri l'app: $INDIRIZZO/"
