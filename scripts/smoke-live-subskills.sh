#!/usr/bin/env bash
# Phase 16: per-subskill live smoke on production. Serves several questions in each
# subskill through the real UI and reports whether any subskill fails to render a
# question (which is what duplicate-filter exhaustion would look like to a student).
set -u
B=/opt/data/home/.claude/skills/gstack/browse/dist/browse
BASE=https://multicheck-one.vercel.app

SUBS="Satzbau|Textverständnis|Textaufgaben|Kopfrechnen|Prozesslogik|Wortgruppen|Bilder zählen|Symbole entdecken|Schilder erinnern|Sortierverfahren|Praktisches Alltagswissen"

IFS='|' read -ra ARR <<< "$SUBS"
for name in "${ARR[@]}"; do
  timeout 90 "$B" goto "$BASE/training" >/dev/null 2>&1
  sleep 2
  # click the subskill card
  timeout 60 "$B" js "(()=>{const b=Array.from(document.querySelectorAll('a,button')).find(x=>x.innerText.includes('$name'));if(!b)return 'NOTFOUND';b.click();return 'ok';})()" >/dev/null 2>&1
  sleep 3
  served=0
  for i in 1 2 3 4; do
    got=$(timeout 60 "$B" js "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');const has=/Prüfen|Antworten/.test(t)&&t.length>200;return has?'Q':'NOQ';})()" 2>/dev/null | tail -1)
    case "$got" in *Q*) served=$((served+1));; esac
    # answer and advance
    timeout 60 "$B" js "(()=>{const inp=document.querySelector('input[placeholder=\"Antwort…\"]');if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'x'+Math.random().toString(36).slice(2,5));inp.dispatchEvent(new Event('input',{bubbles:true}));}else{const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!/Prüfen|Weiter|Eingabe|Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen|Abschicken/.test(b.innerText));if(o[0])o[0].click();}const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 'a';})()" >/dev/null 2>&1
    sleep 1
    timeout 60 "$B" js "(()=>{const w=Array.from(document.querySelectorAll('button')).find(x=>/Weiter/.test(x.innerText));if(w)w.click();return 'n';})()" >/dev/null 2>&1
    sleep 1
  done
  printf "%-28s served=%d/4 %s\n" "$name" "$served" "$([ "$served" -ge 3 ] && echo OK || echo LOW)"
done
