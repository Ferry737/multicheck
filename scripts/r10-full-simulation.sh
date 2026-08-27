#!/usr/bin/env bash
# R10 — complete a Full Simulation end to end on live production.
#
# UI CONTRACT (verified live, this cost several attempts to pin down):
#   - Multiple-choice item: ONLY the 4 option buttons exist. Clicking an option IS the
#     submission and advances immediately. There is no separate confirm button.
#   - Text item: a text input plus an "Antworten" button. Fill, then click Antworten.
#   - Completion: NEITHER control is present any more.
# Doing both actions in one tick races the DOM, which is why an earlier driver stalled.
set -u
B=/opt/data/home/.claude/skills/gstack/browse/dist/browse
BASE=https://multicheck-one.vercel.app
NAV='Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen|Abbrechen|Neu starten|fortsetzen'

jsq() { timeout 60 "$B" js "$1" 2>/dev/null | tail -1; }

snap_model() {
  jsq "(()=>{const m=JSON.parse(localStorage.getItem('multicheck-coach-v3')||'{}');const s=m.subs||{};
    const g=k=>s[k]?{m:Math.round((s[k].mastery||0)*100),c:Number((s[k].confidence||0).toFixed(2))}:null;
    const vals=Object.values(s);const rd=vals.length?Math.round(vals.reduce((a,x)=>a+(x.mastery||0),0)/vals.length*100):0;
    return JSON.stringify({kopf:g('kopfrechnen'),textauf:g('textaufgaben'),readiness:rd,hist:(m.history||[]).length});})()"
}

echo "== warm-up so Math has a BEFORE value =="
jsq "localStorage.clear();'ok'" >/dev/null
timeout 90 "$B" goto "$BASE/training/auto" >/dev/null 2>&1; sleep 3
for i in 1 2 3 4 5 6 7 8; do
  jsq "(()=>{const nav=/$NAV/;const inp=document.querySelector('input[placeholder=\"Antwort…\"]');
    if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'antwort');inp.dispatchEvent(new Event('input',{bubbles:true}));
      const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 't';}
    const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!nav.test(b.innerText)&&!/^Prüfen|^Eingabe/.test(b.innerText));
    if(o.length){o[0].click();const p=Array.from(document.querySelectorAll('button')).find(x=>/^Prüfen/.test(x.innerText));if(p)p.click();return 'm';}return '-';})()" >/dev/null
  sleep 1
  jsq "(()=>{const w=Array.from(document.querySelectorAll('button')).find(x=>/Weiter/.test(x.innerText));if(w)w.click();return 'n';})()" >/dev/null
  sleep 1
done
echo "BEFORE EXAM: $(snap_model)"

echo "== start Full Simulation =="
timeout 90 "$B" goto "$BASE/pruefung" >/dev/null 2>&1; sleep 3
jsq "(()=>{const b=Array.from(document.querySelectorAll('button,a')).find(x=>/Vollständige Simulation/.test(x.innerText));if(b)b.click();return 'sel';})()" >/dev/null; sleep 3
jsq "(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>/Prüfung beginnen/.test(x.innerText));if(b){b.click();return 'started';}
  const r=Array.from(document.querySelectorAll('button')).find(x=>/Neu starten/.test(x.innerText));if(r){r.click();return 'restarted';}return 'no start';})()"
sleep 3
echo "EXAM START: $(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');return JSON.stringify({prog:t.match(/(\d+)\s*\/\s*(\d+)/)?.[0],timer:t.match(/\d+:\d\d/)?.[0]});})()")"

breach=0
for i in $(seq 1 40); do
  st=$(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');const nav=/$NAV/;
    const hasText=!!document.querySelector('input[placeholder=\"Antwort…\"]');
    const opts=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!nav.test(b.innerText)&&!/^Antworten/.test(b.innerText));
    return JSON.stringify({prog:t.match(/(\d+)\s*\/\s*(\d+)/)?.[0]||'',sub:(t.match(/(Deutsch|Mathematik|Logik|Konzentration|Merkfähigkeit|Praktisches)/)||[''])[0],
      hasText,opts:opts.length,fb:/✓|✗|Richtig:|Falsch/.test(t),hint:/Tipp|Hinweis:|MicroLesson|Lektion/.test(t)});})()")
  case "$st" in *'"fb":true'*|*'"hint":true'*) echo "  !! INTEGRITY BREACH loop $i: $st"; breach=1;; esac
  case "$st" in *'"hasText":false'*'"opts":0'*) echo "  COMPLETE at loop $i: $st"; break;; esac
  isMath=$(printf '%s' "$st" | grep -c Mathematik || true)
  hasText=$(printf '%s' "$st" | grep -c '"hasText":true' || true)
  if [ "$hasText" = "1" ]; then
    val=$([ "$isMath" = "1" ] && echo 999999 || echo antwort)
    jsq "(()=>{const inp=document.querySelector('input[placeholder=\"Antwort…\"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'$val');inp.dispatchEvent(new Event('input',{bubbles:true}));const p=Array.from(document.querySelectorAll('button')).find(x=>/^Antworten/.test(x.innerText));if(p)p.click();return 'text';})()" >/dev/null
  else
    idx=$([ "$isMath" = "1" ] && echo "o.length-1" || echo "0")
    jsq "(()=>{const nav=/$NAV/;const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>1&&!nav.test(b.innerText)&&!/^Antworten/.test(b.innerText));if(o.length){o[$idx].click();return 'mc';}return '-';})()" >/dev/null
  fi
  sleep 2
done

echo "AFTER EXAM: $(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');return JSON.stringify({prog:t.match(/(\d+)\s*\/\s*(\d+)/)?.[0],result:t.slice(200,520)});})()")"
echo "MODEL AFTER: $(snap_model)"
echo "INTEGRITY BREACHES: $breach"
