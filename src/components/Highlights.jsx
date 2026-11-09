import { useState } from 'react';
import { Icon } from './icons';
import { Card, SectionTitle } from './ui';

const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/** Game highlights that play right in the app. */
export default function Highlights({ videos }) {
  const [playing, setPlaying] = useState(null);
  if (!videos?.length) return null;
  const current = videos.find((v) => v.id === playing);
  return (
    <>
      <SectionTitle>Highlights</SectionTitle>
      {current && (
        <Card className="mb-3 overflow-hidden">
          {current.src ? (
            <video key={current.id} src={current.src} poster={current.thumb} controls autoPlay playsInline className="aspect-video w-full bg-black" />
          ) : (
            <a href={current.web} target="_blank" rel="noreferrer" className="block p-4 text-accent">Watch on ESPN</a>
          )}
          <div className="px-4 py-2.5 text-[14px] font-semibold">{current.title}</div>
        </Card>
      )}
      <div className="no-scrollbar -mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0">
        {videos.map((v) => (
          <button
            key={v.id}
            onClick={() => (v.src ? setPlaying(v.id) : window.open(v.web, '_blank', 'noopener'))}
            className={`w-[200px] shrink-0 overflow-hidden rounded-2xl bg-card text-left transition active:scale-[0.98] ${playing === v.id ? 'ring-2 ring-accent' : ''}`}
          >
            <div className="relative aspect-video bg-fill">
              {v.thumb && <img src={v.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                  <Icon.Play className="ml-0.5 h-4 w-4" />
                </span>
              </span>
              {v.duration > 0 && <span className="num absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 text-[11px] font-semibold text-white">{dur(v.duration)}</span>}
            </div>
            <div className="line-clamp-2 px-3 py-2 text-[13px] font-semibold leading-snug">{v.title}</div>
          </button>
        ))}
      </div>
    </>
  );
}
