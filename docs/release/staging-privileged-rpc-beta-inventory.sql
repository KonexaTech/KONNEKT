-- READ ONLY: staging project oiwtfkgrnpzirghbsvim. Do not run against production.
-- Review privileged RPCs that can bypass table RLS and the proposed beta gate.
-- Zero rows means no *catalog-detectable* gaps in this targeted inventory;
-- it is NOT proof of complete enforcement (dynamic SQL, delegated helpers,
-- Realtime, Edge Functions and external services require separate tests).
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as signature,
       case
         when pg_get_functiondef(p.oid) ~* 'konnekt_beta[.]allowed[[:space:]]*\\('
           then 'DIRECT_GATE_REFERENCE_REVIEW_BEHAVIOR'
         else 'NO_DIRECT_BETA_GATE_REFERENCE'
       end as beta_gate_check
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','konnekt_private')
  and p.prosecdef
  and has_function_privilege('authenticated',p.oid,'EXECUTE')
  and p.proname in (
    'konnekt_authorize_turn',
    'konnekt_create_group_conversation',
    'konnekt_register_push_session',
    'konnekt_start_direct_conversation',
    'konnekt_unregister_push_session'
  )
order by n.nspname,p.proname;
