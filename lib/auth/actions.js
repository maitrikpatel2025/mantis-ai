"use server";
import { createFirstUser } from "../db/users.js";
async function setupAdmin(email, password) {
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  const created = createFirstUser(email, password);
  if (!created) {
    return { error: "Setup already completed." };
  }
  return { success: true };
}
export {
  setupAdmin
};
