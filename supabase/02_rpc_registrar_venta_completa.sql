create or replace function registrar_venta_completa(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  nueva_venta_id bigint;
  nuevo_numero bigint;
  item jsonb;
  ingrediente jsonb;
begin
  select coalesce(max(numero), 0) + 1 into nuevo_numero
  from ventas;

  insert into ventas (
    numero,
    turno_id,
    usuario,
    origen,
    total,
    efectivo,
    digital,
    vuelto,
    estado,
    facturada
  )
  values (
    nuevo_numero,
    nullif(payload->>'turno_id', '')::bigint,
    payload->>'usuario',
    payload->>'origen',
    coalesce((payload->>'total')::numeric, 0),
    coalesce((payload->'pago'->>'efectivo')::numeric, 0),
    coalesce((payload->'pago'->>'digital')::numeric, 0),
    coalesce((payload->'pago'->>'vuelto')::numeric, 0),
    'activa',
    false
  )
  returning id into nueva_venta_id;

  for item in select * from jsonb_array_elements(coalesce(payload->'items', '[]'::jsonb))
  loop
    insert into venta_items (
      venta_id,
      producto_id,
      nombre,
      cantidad,
      precio_unitario,
      subtotal
    )
    values (
      nueva_venta_id,
      nullif(item->>'producto_id', '')::bigint,
      item->>'nombre',
      coalesce((item->>'cantidad')::numeric, 1),
      coalesce((item->>'precio_unitario')::numeric, 0),
      coalesce((item->>'subtotal')::numeric, 0)
    );

    for ingrediente in select * from jsonb_array_elements(coalesce(item->'ingredientes', '[]'::jsonb))
    loop
      insert into stock_movimientos (
        venta_id,
        producto_id,
        ingrediente,
        gramos,
        tipo
      )
      values (
        nueva_venta_id,
        nullif(item->>'producto_id', '')::bigint,
        ingrediente->>'nombre',
        coalesce((ingrediente->>'gramos')::numeric, 0) * coalesce((item->>'cantidad')::numeric, 1) * -1,
        'venta'
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'venta_id', nueva_venta_id,
    'numero', nuevo_numero
  );
end;
$$;
