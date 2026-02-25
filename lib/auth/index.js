import { handlers, auth } from "./config.js";
const { GET, POST } = handlers;
async function getPageAuthState() {
  const { getUserCount } = await import("../db/users.js");
  const [session, userCount] = await Promise.all([
    auth(),
    Promise.resolve(getUserCount())
  ]);
  return {
    session,
    needsSetup: userCount === 0
  };
}
export {
  GET,
  POST,
  auth,
  getPageAuthState
};
