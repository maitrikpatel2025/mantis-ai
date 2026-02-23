import { SecurityPage } from 'mantis-ai/chat';
import { getSecurityPolicies, updateToolPolicy, getPendingApprovals, respondToApproval, getToolNames } from 'mantis-ai/chat/actions';

export default function SettingsSecurityRoute() {
  return (
    <SecurityPage
      getSecurityPoliciesAction={getSecurityPolicies}
      updateToolPolicyAction={updateToolPolicy}
      getPendingApprovalsAction={getPendingApprovals}
      respondToApprovalAction={respondToApproval}
      getToolNamesAction={getToolNames}
    />
  );
}
