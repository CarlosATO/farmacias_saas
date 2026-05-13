CREATE OR REPLACE FUNCTION pharmacy.log_audit_event(
  p_event_type text,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pharmacy, public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_audit_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT cu.company_id
  INTO v_company_id
  FROM public.company_users cu
  WHERE cu.user_id = v_user_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver company_id para auditoria';
  END IF;

  INSERT INTO pharmacy.audit_logs (
    company_id,
    user_id,
    event_type,
    description,
    metadata
  )
  VALUES (
    v_company_id,
    v_user_id,
    p_event_type,
    p_description,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy.log_audit_event(text, text, jsonb) TO authenticated;
