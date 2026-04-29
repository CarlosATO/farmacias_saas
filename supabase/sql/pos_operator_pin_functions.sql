create or replace function pharmacy.reset_pos_operator_pin(
  p_operator_id uuid,
  p_company_id uuid,
  p_warehouse_id uuid,
  p_pin_code text
)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_pin_code is null or length(trim(p_pin_code)) <> 4 then
    raise exception 'El PIN debe tener exactamente 4 digitos';
  end if;

  update pharmacy.pos_operators
  set pin_hash = crypt(trim(p_pin_code), gen_salt('bf'))
  where id = p_operator_id
    and company_id = p_company_id
    and warehouse_id = p_warehouse_id;

  if not found then
    raise exception 'Operador POS no encontrado para la empresa/sucursal indicada';
  end if;

  return true;
end;
$$;
