// Dev-only preview of the live NFL field in different game situations.
import FootballField from '../components/FootballField';
import GameCard from '../components/GameCard';
import { Card } from '../components/ui';

const home = { id: '3', abbr: 'CHI', name: 'Bears', color: '#0b162a', alt: '#c83803', record: '6-2', score: 24, linescores: [] };
const away = { id: '27', abbr: 'TB', name: 'Buccaneers', color: '#d50a0a', record: '3-5', score: 13, linescores: [] };
const S = (o) => ({ downDistance: '', full: '', redZone: false, lastPlay: '', ...o });
const cases = [
  ['CHI ball, red zone', S({ possession: '3', spot: 'TB 20', yardLine: 80, distance: 14, down: 3, full: '3rd & 14 at TB 20', redZone: true, driveStart: 'CHI 31', driveSummary: '7 plays, 49 yards, 2:48' })],
  ['TB ball, own 25', S({ possession: '27', spot: 'TB 25', yardLine: 25, distance: 10, down: 1, full: '1st & 10 at TB 25', driveStart: 'TB 25' })],
  ['TB ball, midfield', S({ possession: '27', spot: '50', yardLine: 50, distance: 7, down: 2, full: '2nd & 7 at 50', driveStart: 'TB 18' })],
  ['CHI goal to go', S({ possession: '3', spot: 'TB 4', yardLine: 96, distance: 4, down: 1, goalToGo: true, full: '1st & Goal at TB 4', redZone: true, driveStart: 'CHI 22' })],
];
export default function DevField() {
  return (
    <div className="space-y-4">
      {cases.map(([title, sit]) => (
        <Card key={title} className="space-y-3 p-4">
          <div className="text-[13px] font-semibold">{title} · {sit.full}</div>
          <FootballField situation={sit} home={home} away={away} size="lg" />
          <FootballField situation={sit} home={home} away={away} size="sm" />
        </Card>
      ))}
      <GameCard
        g={{ id: 'x', league: 'nfl', date: new Date().toISOString(), status: { state: 'in', label: '7:12 - 3rd' }, home, away, leaders: [], situation: cases[0][1], broadcast: 'FOX', venue: '', note: '' }}
      />
    </div>
  );
}
