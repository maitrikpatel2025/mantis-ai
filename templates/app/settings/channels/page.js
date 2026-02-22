import { auth } from 'mantis-ai/auth';
import { ChannelsPage } from 'mantis-ai/chat';
import { getChannelsList } from 'mantis-ai/chat/actions';

export default async function Page() {
  const session = await auth();
  return <ChannelsPage session={session} getChannelsList={getChannelsList} />;
}
