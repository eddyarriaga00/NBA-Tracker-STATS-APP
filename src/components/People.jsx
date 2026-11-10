import { Link } from 'react-router-dom';
import { Avatar } from './Comments';

/** A person's photo, or their initial on a colour if they don't have one. */
export function UserAvatar({ profile, name, size = 40 }) {
  const label = profile?.display_name ?? name ?? '?';
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full bg-fill object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <Avatar name={label} size={size} />;
}

/** One person in a list: photo, name, a line under it, and whatever goes on the right. */
export function PersonRow({ p, sub, to, right }) {
  const body = (
    <>
      <UserAvatar profile={p} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-semibold">{p.display_name}</span>
        <span className="block truncate text-[13px] text-label-2">{sub ?? `@${p.username}`}</span>
      </span>
    </>
  );
  return (
    <div className="flex min-h-[60px] items-center gap-2 px-4 py-2">
      <Link to={to ?? `/u/${p.user_id}`} className="flex min-w-0 flex-1 items-center gap-3 active:opacity-60">{body}</Link>
      {right}
    </div>
  );
}

export function PillButton({ children, onClick, tone = 'accent', disabled }) {
  const cls = { accent: 'bg-accent text-white', soft: 'bg-fill text-label', danger: 'bg-live/10 text-live' }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition active:scale-95 disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}
