#!/usr/bin/env bash
# R10 continuation driver: finish whatever Full Simulation is currently in progress.
# The exam is MULTI-SECTION (sectionOrder in multicheck-exam-v1), so the item loop must
# be sized for all sections, not one 14-item section.
set -u
B=/opt/data/home/.claude/skills/gstack/browse/dist/browse
NAV='Heute|Training|Prüfung|Fehler|Fortschritt|Schreiben|Einstellungen|Abbrechen|Neu starten|fortsetzen'
jsq() { timeout 60 "$B" js "$1" 2>/dev/null | tail -1; }

breach=0
for i in $(seq 1 120); do
  st=$(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');const nav=/$NAV/;
    const hasText=!!document.querySelector('input[placeholder=\"Antwort…\"]')||!!document.querySelector('textarea');
    const opts=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>=1&&!nav.test(b.innerText)&&!/^Antworten|^Abschicken/.test(b.innerText));
    const submitBtn=Array.from(document.querySelectorAll('button')).some(b=>/^Antworten|^Abschicken/.test(b.innerText));
    const st=JSON.parse(localStorage.getItem('multicheck-exam-v1')||'{}');
    return JSON.stringify({prog:t.match(/(\d+)\s*\/\s*(\d+)/)?.[0]||'',sec:st.currentSection??'',ans:Object.keys(st.answers||{}).length,
      submitted:!!st.submitted,hasText,opts:opts.length,submitBtn,fb:/✓|✗|Richtig:/.test(t),hint:/Tipp|Hinweis:|MicroLesson/.test(t)});})()")
  case "$st" in *'"fb":true'*|*'"hint":true'*) echo "  !! BREACH $i: $st"; breach=1;; esac
  case "$st" in *'"submitted":true'*) echo "  SUBMITTED at loop $i: $st"; break;; esac
  case "$st" in *'"hasText":false'*'"opts":0'*'"submitBtn":false'*) echo "  NO CONTROLS at loop $i: $st"; break;; esac
  if printf '%s' "$st" | grep -q '"hasText":true'; then
    jsq "(()=>{const ta=document.querySelector('textarea');
      if(ta){const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(ta,'Sehr geehrte Damen und Herren, ich melde den Vorfall im Lager. Das Regal ist beschaedigt. Bitte informieren Sie die Technik. Freundliche Gruesse');ta.dispatchEvent(new Event('input',{bubbles:true}));
        const ab=Array.from(document.querySelectorAll('button')).find(x=>/^Abschicken/.test(x.innerText));if(ab)ab.click();return 'wrote';}
      const inp=document.querySelector('input[placeholder=\"Antwort…\"]');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,'antwort');inp.dispatchEvent(new Event('input',{bubbles:true}));
      const p=Array.from(document.querySelectorAll('button')).find(x=>/^Antworten/.test(x.innerText));if(p)p.click();return 'text';})()" >/dev/null
  else
    jsq "(()=>{const nav=/$NAV/;const o=Array.from(document.querySelectorAll('button')).filter(b=>b.innerText.trim().length>=1&&!nav.test(b.innerText)&&!/^Antworten|^Abschicken/.test(b.innerText));
      if(o.length){o[0].click();return 'mc';}
      const s=Array.from(document.querySelectorAll('button')).find(b=>/^Antworten|^Abschicken/.test(b.innerText));if(s){s.click();return 'submit';}return '-';})()" >/dev/null
  fi
  sleep 2
  [ $((i % 20)) -eq 0 ] && echo "  ...loop $i: $st"
done
echo "FINAL: $(jsq "(()=>{const t=document.body.innerText.replace(/\s+/g,' ');const st=JSON.parse(localStorage.getItem('multicheck-exam-v1')||'{}');return JSON.stringify({submitted:!!st.submitted,answers:Object.keys(st.answers||{}).length,finished:(st.finishedSections||[]).length,visible:t.slice(180,470)});})()")"
echo "BREACHES: $breach"
