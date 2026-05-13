CREATE OR REPLACE FUNCTION pharmacy.fetch_audit_logs(
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_user_id text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  user_id uuid,
  event_type text,
  description text,
  metadata jsonb,
  ip_address text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pharmacy, public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
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

  RETURN QUERY
  WITH filtered AS (
    SELECT al.*
    FROM pharmacy.audit_logs al
    WHERE al.company_id = v_company_id
      AND (p_start_at IS NULL OR al.created_at >= p_start_at)
      AND (p_end_at IS NULL OR al.created_at <= p_end_at)
      AND (NULLIF(TRIM(COALESCE(p_event_type, '')), '') IS NULL OR al.event_type ILIKE '%' || TRIM(p_event_type) || '%')
      AND (NULLIF(TRIM(COALESCE(p_user_id, '')), '') IS NULL OR al.user_id::text ILIKE '%' || TRIM(p_user_id) || '%')
  ), counted AS (
    SELECT filtered.*, COUNT(*) OVER() AS total_count
    FROM filtered
  )
  SELECT
    counted.id,
    counted.company_id,
    counted.user_id,
    counted.event_type,
    counted.description,
    counted.metadata,
    counted.ip_address,
    counted.created_at,
    counted.total_count
  FROM counted
  ORDER BY counted.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy.fetch_audit_logs(timestamptz, timestamptz, text, text, integer, integer) TO authenticated;
