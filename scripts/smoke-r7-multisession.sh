#!/usr/bin/env bash
# R7 real-browser multi-session smoke on production.
# Session 1: fail maths deliberately. Session 2: mixed. Session 3: succeed.
# Records the Heute plan before/after each session so plan movement is observable.
set -u
B=/opt/data/home/.claude/skills/gstack/browse/dist/browse
BASE=https://multicheck-one.vercel.app

snap() {
  timeout 60 "$B" js "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');
    const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');const s=m.subs||{};
    const mast=(k)=>s[k]?Math.round((s[k].mastery||0)*100):null;
    // Capture the plan block NAMES (header is upper-case in the DOM), not just counts:
    // the earlier version only read counts/modes and so could not show reordering.
    const names=['Satzbau','Textverständnis','Textaufgaben','Kopfrechnen','Prozesslogik','Wortgruppen','Bilder','Symbole','Schilder','Sortierverfahren','Alltagswissen'];
    const i=t.indexOf('· 2 ·'); const seg=i>=0?t.slice(Math.max(0,i-200),i+220):'';
    const order=[]; const re=/(Satzbau|Textverständnis|Textaufgaben|Kopfrechnen[^·]*|Prozesslogik|Wortgruppen|Bilder[^·]*|Symbole[^·]*|Schilder[^·]*|Sortierverfahren|Praktisches Alltagswissen)\s*·\s*(\d+)\s*·\s*(adaptive|spaced|speed|mixed|maintenance)/g;
    let mm; while((mm=re.exec(t))!==null){order.push(mm[1].trim()+':'+mm[3]);}
    return JSON.stringify({planOrder:order,
      kopf:mast('kopfrechnen'),textauf:mast('textaufgaben'),satzbau:mast('satzbau'),
      hist:(m.history||[]).length});})()" 2>/dev/null | tail -1
}

# one session: answer N items, forcing correct/incorrect on maths
play() {
  local want_correct="$1" items="$2"
  timeout 90 "$B" goto "$BASE/training/auto" >/dev/null 2>&1
  sleep 3
  for ((i=0;i<items;i++)); do
    if [ "$want_correct" = "yes" ]; then
      # reveal the answer via the DOM only to simulate a competent learner
      timeout 60 "$B" js "(()=>{const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!/Prüfen|Weiter|Eingabe|Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen/.test(b.innerText));if(o.length){o[0].click();}else{const inp=document.querySelector('input[placeholder=\"Antwort…\"]');if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'antwort');inp.dispatchEvent(new Event('input',{bubbles:true}));}}const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 'a';})()" >/dev/null 2>&1
    else
      timeout 60 "$B" js "(()=>{const inp=document.querySelector('input[placeholder=\"Antwort…\"]');if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'FALSCH');inp.dispatchEvent(new Event('input',{bubbles:true}));}else{const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!/Prüfen|Weiter|Eingabe|Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen/.test(b.innerText));if(o.length)o[o.length-1].click();}const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 'a';})()" >/dev/null 2>&1
    fi
    sleep 1
    timeout 60 "$B" js "(()=>{const w=Array.from(document.querySelectorAll('button')).find(x=>/Weiter/.test(x.innerText));if(w)w.click();return 'n';})()" >/dev/null 2>&1
    sleep 1
  done
}

timeout 60 "$B" js "localStorage.clear();'ok'" >/dev/null 2>&1
timeout 90 "$B" goto "$BASE/" >/dev/null 2>&1; sleep 3
echo "BEFORE ANY SESSION:  $(snap)"

play no 8
timeout 90 "$B" goto "$BASE/" >/dev/null 2>&1; sleep 3
echo "AFTER SESSION 1 (deliberate failures): $(snap)"

play no 8
timeout 90 "$B" goto "$BASE/" >/dev/null 2>&1; sleep 3
echo "AFTER SESSION 2 (more failures):       $(snap)"

play yes 8
timeout 90 "$B" goto "$BASE/" >/dev/null 2>&1; sleep 3
echo "AFTER SESSION 3 (successes):           $(snap)"
