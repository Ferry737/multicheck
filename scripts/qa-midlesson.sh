#!/bin/bash
# Real-student MicroLesson live test: fresh session, answer WRONG SLOWLY 3x on same subskill
export PATH="/opt/data/home/.local/bin:$PATH"; export GSTACK_CHROMIUM_NO_SANDBOX=1
B="/opt/data/skills/gstack/browse/dist/browse"

wrong_slow_text() {
  sleep 5.5
  "$B" js "const i=document.querySelector('input'); if(i){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; colleg=0; s.call(i,'falsch999'); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}" >/dev/null 2>&1
  sleep 1.8
}
wrong_slow_choice() {
  sleep 5.5
  "$B" js "const c=[...document.querySelectorAll('div.rounded-card button')]; if(c.length){c[0].click();}" >/dev/null 2>&1
  sleep 0.5
  "$B" js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Prüfen'); b?b.click():0" >/dev/null 2>&1
  sleep 1.5
  "$B" js "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Weiter →'); b?b.click():0" >/dev/null 2>&1
  sleep 1.2
}

for N in $(seq 1 16); do
  TXT=$("$B" js "document.body.innerText" 2>/dev/null | tr '\n' '|')
  if echo "$TXT" | grep -q "Kurz-Lektion\|Erklärung\|Arbeitsbeispiel\|Übe die Aufgabe\|Schritt 1"; then
    echo "MICROLESSON TRIGGERED at iter $N"
    "$B" js "document.body.innerText.slice(60,340)" 2>/dev/null | tr '\n' '|' | head -c 340
    break
  fi
  if echo "$TXT" | grep -q "Session beendet\|8/8"; then echo "ENDED (no lesson) iter $N"; break; fi
  # detect question type
  TYP=$("$B" js "const i=document.querySelector('input'); const c=document.querySelectorAll('div.rounded-card button').length; i?'text':'choice'" 2>/dev/null | tr -d '\n' | tail -c 4)
  if [ "$TYP" = "text" ]; then wrong_slow_text; else wrong_slow_choice; fi
done
