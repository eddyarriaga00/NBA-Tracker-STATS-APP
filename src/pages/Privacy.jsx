import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Card, PageTitle } from '../components/ui';

const UPDATED = 'November 26, 2026';

const SECTIONS = [
  {
    title: 'The short version',
    body: [
      'This app is a small project for friends. There are no ads, nothing is sold, and nobody is tracked across other sites.',
      'You can use it without an account. If you join the chat or sign in, only what’s needed for those features is kept, and you can delete all of it from Settings at any time.',
    ],
  },
  {
    title: 'What’s stored on your device',
    body: [
      'Your settings, followed teams, recent searches, recent comparisons and a saved copy of the latest scores (so the app works offline). This stays on your phone or computer and is removed when you clear the site’s data.',
    ],
  },
  {
    title: 'What’s stored on the server',
    list: [
      'Your nickname, and your profile photo if you add one',
      'Your email or Google account, only if you choose to sign in with one',
      'Comments, reactions, chat and private messages you send, friend requests, and Pick’em picks',
      'Your followed teams and settings, if you’re signed in, so they follow you to other devices',
      'An alert address for your device, if you turn alerts on, plus which alerts you picked',
      'Crash reports: when something breaks, the error, the page you were on and your browser type. No name or account is attached. They are deleted after 30 days.',
    ],
  },
  {
    title: 'Who can see what',
    list: [
      'Your nickname, photo, comments, chat messages and Pick’em record are visible to other people using the app',
      'Private messages can only be read by you and the friend you sent them to',
      'Your email is never shown to anyone',
    ],
  },
  {
    title: 'Services the app uses',
    list: [
      'Supabase stores the server data listed above',
      'ESPN supplies the scores and stats; your device asks ESPN for them directly, so ESPN sees a normal web request',
      'GitHub Pages hosts the app itself',
      'Google, only if you sign in with Google',
      'Apple, Google or Mozilla deliver alerts to your device if you turn them on',
    ],
  },
  {
    title: 'Deleting your data',
    body: [
      'Settings → Account → Delete account (or Delete my data as a guest) permanently removes your profile, photo, messages, friends, picks, comments, reactions and alerts. It happens right away and can’t be undone.',
      'Turning alerts off in Settings removes your device’s alert address.',
    ],
  },
  {
    title: 'Changes',
    body: ['If this policy changes, the date at the top changes with it.'],
  },
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl pb-8">
      <Link to="/settings" className="mb-2 inline-flex items-center gap-1 px-1 text-[15px] text-accent">
        <Icon.ChevronRight className="h-4 w-4 rotate-180" />
        Settings
      </Link>
      <PageTitle eyebrow={`Updated ${UPDATED}`}>Privacy</PageTitle>
      <div className="space-y-3">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="px-4 py-3.5 md:px-5 md:py-4">
            <h2 className="text-[16px] font-bold">{s.title}</h2>
            {s.body?.map((p) => <p key={p} className="mt-1.5 text-[14px] leading-relaxed text-label-2">{p}</p>)}
            {s.list && (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-label-2 marker:text-label-3">
                {s.list.map((li) => <li key={li}>{li}</li>)}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
