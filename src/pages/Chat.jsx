import Comments from '../components/Comments';
import { Card, PageTitle } from '../components/ui';

export default function Chat() {
  return (
    <div>
      <PageTitle eyebrow="Everyone">Chat</PageTitle>
      <Card className="h-[calc(100dvh-220px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[360px] overflow-hidden lg:h-[calc(100dvh-180px)]">
        <Comments room="general" variant="chat" emptyText="No messages yet. Say what's up." />
      </Card>
    </div>
  );
}
