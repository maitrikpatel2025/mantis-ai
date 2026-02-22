import { auth } from 'mantis-ai/auth';
import { SkillsPage } from 'mantis-ai/chat';
import { getSkillsList, searchSkillsAction, installSkillAction, toggleSkillAction } from 'mantis-ai/chat/actions';

export default async function Page() {
  const session = await auth();
  return (
    <SkillsPage
      session={session}
      getSkillsList={getSkillsList}
      searchSkillsAction={searchSkillsAction}
      installSkillAction={installSkillAction}
      toggleSkillAction={toggleSkillAction}
    />
  );
}
