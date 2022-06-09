import {PreTokenGenerationTriggerHandler} from 'aws-lambda';
import {SAMPLE_FINGERPRINT} from '../constants';
import {sha256} from '../utils';

const createFingerprint = () => {
  return sha256(SAMPLE_FINGERPRINT);
};

const getActiveCompany = () => {
  // Get current company of the user in active company table
  return {
    id: 'b8fd7715-464b-46df-9e7f-465293d73755',
    role: 'member',
  };
};

export const main: PreTokenGenerationTriggerHandler = async event => {
  const fingerprintHash = createFingerprint();
  const company = getActiveCompany();

  event.response = {
    claimsOverrideDetails: {
      claimsToAddOrOverride: {
        companyId: company.id,
        companyRole: company.role,
        fingerprintHash,
      },
    },
  };

  return event;
};
