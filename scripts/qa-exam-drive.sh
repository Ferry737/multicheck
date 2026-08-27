#!/bin/bash
# QA pass 2: complete the mini-sim exam end-to-end on production
# NOTE: browse js output is MULTILINE — never `tail -1` it (that keeps only the footer).
export PATH="/opt/data/home/.local/bin:$PATH"; export GSTACK_CHROMIUM_NO_SANDBOX=1
B="/opt/data/skills/gstack/browse/dist/browse"

read_state() {
  "$B" js "document.body.innerText" 2>/dev/null | tr '\n' '|' | head -c 800
}

for N in $(seq 1 100); do
  TXT=$(read_state)
  if echo "$TXT" | grep -qE "Ergebnis —|AUSWERTUNG|Auswertung"; then echo "EXAM COMPLETE at iter $N"; break; fi
  if echo "$TXT" | grep -q "abgeschlossen"; then
    echo "TRANSITION: $(echo "$TXT" | grep -oE '[A-Za-zÄÖÜäöü]+ abgeschlossen' | head -1)"
    "$B" js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Weiter'); b?b.click():0;'t'" >/dev/null 2>&1; sleep 1.3; continue
  fi
  if echo "$TXT" | grep -q "Merken Sie sich"; then
    echo "MEMORY STIMULUS PHASE"
    "$B" js "const b=[...document.querySelectorAll('button')].find(x=>/Weiter|Gemerkt/.test(x.textContent)); b?b.click():0;'m'" >/dev/null 2>&1; sleep 1.5; continue
  fi
  TA=$("$B" js "document.querySelector('textarea')?'y':'n'" 2>/dev/null | tr -d '\n' | tail -c 1)
  if [ "$TA" = "y" ]; then
    echo "WRITING PHASE"
    "$B" js "const t=document.querySelector('textarea'); const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(t,'Sehr geehrte Damen und Herren, ich bewerbe mich um die Ausbildungsstelle als Kauffrau. Mit freundlichen Grüssen.'); t.dispatchEvent(new Event('input',{bubbles:true}));'w'" >/dev/null 2>&1
    sleep 0.8
    "$B" js "const b=[...document.querySelectorAll('button')].find(x=>/^Weiter/.test(x.textContent.trim())); b?b.click():0;'ws'" >/dev/null 2>&1; sleep 1.5; continue
  fi
  if echo "$TXT" | grep -q "abgeben"; then
    echo "CONFIRMING PHASE - clicking Abgeben"
    "$B" js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Abgeben'); b?b.click():0;'c'" >/dev/null 2>&1; sleep 3; continue
  fi
  CHOSEN=$("$B" js "const c=[...document.querySelectorAll('div.rounded-card button')].filter(b=>b.textContent!=='Antworten'); c.length?(c[c.length%2].click(),'c'):'n'" 2>/dev/null | tr -d '\n' | tail -c 1)
  if [ "$CHOSEN" = "c" ]; then sleep 1; continue; fi
  TYPED=$("$B" js "const i=document.querySelector('input'); if(i){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'Antwort '+$N); i.dispatchEvent(new Event('input',{bubbles:true}));'typed'}else 'n'" 2>/dev/null | tr -d '\n' | tail -c 1)
  if [ "$TYPED" = "d" ]; then
    sleep 0.4
    "$B" js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Antworten'); b&&!b.disabled?b.click():0;'a'" >/dev/null 2>&1; sleep 1.2; continue
  fi
  sleep 0.8
done
echo "=== FINAL STATE ==="
read_state
echo ""
echo "=== CONSOLE ERRORS ==="
"$B" console --errors 2>&1 | grep -v "21:29:34" | tail -3
