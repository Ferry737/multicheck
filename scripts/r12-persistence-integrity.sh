#!/usr/bin/env bash
# R12 — PERSISTENCE + IDEMPOTENCY + DATA INTEGRITY (docs/RELEASE-GATES.md)
# Live production. Verifies write-side AND read-side integrity.
set -u
B=/opt/data/home/.claude/skills/gstack/browse/dist/browse
BASE=https://multicheck-one.vercel.app
NAV='Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen|Abbrechen|Neu starten|fortsetzen'
jsq() { timeout 60 "$B" js "$1" 2>/dev/null | tail -1; }
pass=0; fail=0
chk() { if [ "$1" = "1" ]; then echo "  PASS — $2"; pass=$((pass+1)); else echo "  FAIL — $2  [$3]"; fail=$((fail+1)); fi; }

echo "R12.1 TRAINING: answer -> refresh -> history correct"
jsq "localStorage.clear();'ok'" >/dev/null
timeout 90 "$B" goto "$BASE/training/auto" >/dev/null 2>&1; sleep 3
for i in 1 2 3; do
  jsq "(()=>{const nav=/$NAV/;const inp=document.querySelector('input[placeholder=\"Antwort…\"]');
    if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'FALSCHEANTWORT');inp.dispatchEvent(new Event('input',{bubbles:true}));const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 't';}
    const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>=1&&!nav.test(b.innerText)&&!/^Prüfen|^Eingabe/.test(b.innerText));
    if(o.length){o[o.length-1].click();const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 'm';}return '-';})()" >/dev/null
  sleep 1
  jsq "(()=>{const w=Array.from(document.querySelectorAll('button')).find(x=>/Weiter/.test(x.innerText));if(w)w.click();return 'n';})()" >/dev/null
  sleep 1
done
h1=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');return String((m.history||[]).length);})()")
timeout 90 "$B" reload >/dev/null 2>&1; sleep 3
h2=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');return String((m.history||[]).length);})()")
chk "$([ "$h1" = "$h2" ] && [ "$h1" -gt 0 ] && echo 1 || echo 0)" "history survives refresh unchanged (no loss, no duplication)" "before=$h1 after=$h2"

echo "R12.2 FEHLER: wrong answer recorded once, with the correct answer"
timeout 90 "$B" goto "$BASE/fehler" >/dev/null 2>&1; sleep 3
f1=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');const f=m.fehler||[];const t=document.body.innerText;
  return JSON.stringify({n:f.length,hasStudentAnswer:t.includes('FALSCHEANTWORT'),hasCorrect:/Richtig:/.test(t)});})()")
echo "    $f1"
chk "$(printf '%s' "$f1" | grep -c '"hasStudentAnswer":true')" "exact wrong answer recorded and shown" "$f1"
chk "$(printf '%s' "$f1" | grep -c '"hasCorrect":true')" "correct answer recorded and shown" "$f1"
n_before=$(printf '%s' "$f1" | sed -E 's/.*"n":([0-9]+).*/\1/')
timeout 90 "$B" reload >/dev/null 2>&1; sleep 3
n_after=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');return String((m.fehler||[]).length);})()")
chk "$([ "$n_before" = "$n_after" ] && echo 1 || echo 0)" "refresh does not duplicate error entries" "before=$n_before after=$n_after"

echo "R12.3 FORTSCHRITT: displayed analytics match persisted history"
timeout 90 "$B" goto "$BASE/fortschritt" >/dev/null 2>&1; sleep 3
fp=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');const h=m.history||[];
  const n=h.length,c=h.filter(x=>x.correct).length;const acc=n?Math.round(c/n*100):0;
  const t=document.body.innerText.replace(/\s+/g,' ');const shown=(t.match(/(\d+)%\s*GENAUIGKEIT/i)||[])[1];
  return JSON.stringify({persistedN:n,persistedCorrect:c,recomputedAcc:acc,shownAcc:shown?Number(shown):null});})()")
echo "    $fp"
ra=$(printf '%s' "$fp" | sed -E 's/.*"recomputedAcc":([0-9]+).*/\1/')
sa=$(printf '%s' "$fp" | sed -E 's/.*"shownAcc":([0-9]+).*/\1/')
chk "$([ "$ra" = "$sa" ] && echo 1 || echo 0)" "independently recomputed accuracy == displayed accuracy" "recomputed=$ra shown=$sa"

echo "R12.4 DOUBLE ACTIONS: rapid double-submit must not duplicate"
timeout 90 "$B" goto "$BASE/training/auto" >/dev/null 2>&1; sleep 3
hb=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');return String((m.history||[]).length);})()")
jsq "(()=>{const nav=/$NAV/;const inp=document.querySelector('input[placeholder=\"Antwort…\"]');
  if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'doppelt');inp.dispatchEvent(new Event('input',{bubbles:true}));}
  else{const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>=1&&!nav.test(b.innerText)&&!/^Prüfen|^Eingabe/.test(b.innerText));if(o.length)o[0].click();}
  const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));
  if(p){p.click();p.click();p.click();}
  return 'triple-clicked';})()" >/dev/null
sleep 3
ha=$(jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');return String((m.history||[]).length);})()")
delta=$((ha - hb))
chk "$([ "$delta" -le 1 ] && echo 1 || echo 0)" "triple-click submit records at most ONE attempt" "history +$delta"

echo "R12.5 CORRUPT/OLD STORAGE: graceful fallback, no blank screen"
jsq "localStorage.setItem('multicheck-coach-v3','{\"subs\":null,\"history\":\"not-an-array\",\"schema\":0}');'corrupted'" >/dev/null
timeout 90 "$B" goto "$BASE/" >/dev/null 2>&1; sleep 4
cs=$(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');return JSON.stringify({len:t.length,hasNav:/Heute/.test(t),blank:t.trim().length<80});})()")
echo "    $cs"
chk "$(printf '%s' "$cs" | grep -c '"blank":false')" "corrupt storage does not blank the app" "$cs"
chk "$(printf '%s' "$cs" | grep -c '"hasNav":true')" "navigation still renders after corrupt storage" "$cs"

jsq "localStorage.setItem('multicheck-coach-v3','{oh no not even json');'malformed'" >/dev/null
timeout 90 "$B" goto "$BASE/fortschritt" >/dev/null 2>&1; sleep 4
ms=$(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');return JSON.stringify({blank:t.trim().length<80,hasNav:/Heute/.test(t)});})()")
chk "$(printf '%s' "$ms" | grep -c '"blank":false')" "malformed JSON storage does not blank a data page" "$ms"

echo ""
echo "R12 RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
