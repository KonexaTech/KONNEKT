import { useEffect, useState } from 'react';
import { supabase } from '../lib_supabase';

export function useSessionSecurity(token) {
  const [security, setSecurity] = useState({ token: null, status: 'checking', factors: [], error: '' });
  const [securityAttempt, setSecurityAttempt] = useState(0);
  const matched = security.token === token;
  const securityChecking = !!token && (!matched || security.status === 'checking');
  const mfaRequired = !!token && matched && security.status === 'challenge';
  const mfaError = token && matched && security.status === 'error' ? security.error : '';
  const accessReady = !!token && matched && security.status === 'ready';
  const refreshSecurity = () => setSecurityAttempt(value => value + 1);

  useEffect(() => {
    let active = true;
    if (!token) { setSecurity({ token: null, status: 'ready', factors: [], error: '' }); return; }
    setSecurity({ token, status: 'checking', factors: [], error: '' });
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(token);
        if (error) throw error;
        if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
          const result = await supabase.auth.mfa.listFactors();
          if (result.error) throw result.error;
          const factors = (result.data?.totp || []).filter(factor => factor.status === 'verified');
          if (!factors.length) throw new Error('This account requires a verification method that is not supported here. Use its supported sign-in method or contact support.');
          if (active) setSecurity({ token, status: 'challenge', factors, error: '' });
        } else if (active) setSecurity({ token, status: 'ready', factors: [], error: '' });
      } catch (error) {
        if (active) setSecurity({ token, status: 'error', factors: [], error: error.message || 'Could not verify account security.' });
      }
    })();
    return () => { active = false; };
  }, [token, securityAttempt]);

  return { securityChecking, mfaRequired, mfaError, accessReady, refreshSecurity, mfaFactors: matched ? security.factors : [] };
}
