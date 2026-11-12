import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '../lib/push';

const KEY = 'installTipSeen';

// Chrome on Android offers its own install prompt; hold on to it so the tip can show a button.
let deferred = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    window.dispatchEvent(new Event('installready'));
  });
}

const ShareGlyph = () => (
  <svg aria-label="Share" width="15" height="19" viewBox="0 0 15 19" className="mx-0.5 inline-block align-[-3px] text-accent">
    <path d="M7.5 12V1.5M4 4.5l3.5-3.5 3.5 3.5M3.5 8H2a1 1 0 00-1 1v8a1 1 0 001 1h11a1 1 0 001-1V9a1 1 0 00-1-1h-1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A one-time tip, on a phone's first visit, on putting the site on the Home Screen. */
export default function InstallTip() {
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(!!deferred);
  const ios = isIOS();

  useEffect(() => {
    const phone = ios || /Android/i.test(navigator.userAgent);
    let seen = true;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* private mode: skip the tip */ }
    if (!phone || seen || isStandalone()) return;
    const t = setTimeout(() => setOpen(true), 1800);
    const ready = () => setCanPrompt(true);
    window.addEventListener('installready', ready);
    return () => { clearTimeout(t); window.removeEventListener('installready', ready); };
  }, [ios]);

  if (!open) return null;
  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    setOpen(false);
  };
  const install = async () => {
    const e = deferred;
    deferred = null;
    close();
    try { await e?.prompt(); } catch { /* ignore */ }
  };
  const steps = ios
    ? [<>Tap <ShareGlyph /> <b>Share</b> in your browser's toolbar</>, <>Scroll down and tap <b>Add to Home Screen</b></>, <>Tap <b>Add</b>, then open it from your Home Screen</>]
    : [<>Tap the <b>⋮</b> menu in your browser</>, <>Tap <b>Add to Home screen</b> or <b>Install app</b></>, <>Open it from your Home screen</>];

  return (
    <div role="dialog" aria-label="Add to Home Screen" className="rise fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl border border-sep bg-card p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="44" height="44" className="rounded-[10px]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold leading-tight">Use it like an app</div>
          <div className="mt-0.5 text-[13px] leading-snug text-label-2">Add it to your Home Screen for full screen, one-tap access and game alerts.</div>
        </div>
        <button onClick={close} aria-label="Close" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] text-label-2 active:bg-fill">×</button>
      </div>
      {canPrompt && !ios ? (
        <button onClick={install} className="mt-3 w-full rounded-xl bg-accent py-2.5 text-[15px] font-semibold text-white active:opacity-80">Add to Home Screen</button>
      ) : (
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[14px]">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-[12px] font-bold text-label-2">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      <button onClick={close} className="mt-3 w-full rounded-xl py-2 text-[14px] font-semibold text-label-2 active:bg-fill">Not now</button>
    </div>
  );
}
