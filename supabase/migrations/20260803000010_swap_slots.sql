-- =============================================================================
-- 0010 · Los movimientos del Planner, en transacción.
--
-- Tres operaciones del grid que NO pueden quedar a medias:
--
--   1 · Intercambiar dos piezas de fecha. Si se hace con dos UPDATE sueltos
--       desde la aplicación y el segundo falla, el mes queda con dos piezas el
--       mismo día y una fecha vacía. Nadie se entera hasta que el cliente ve
--       el calendario.
--   2 · "Insertar y correr", que mueve N piezas de un jalón.
--   3 · Editar un campo que escribió un agente: el cambio y su renglón en
--       human_edits tienen que viajar juntos. Esa tabla es el criterio de la
--       marca aprendido, y un cambio guardado cuyo aprendizaje se perdió es
--       peor que no haber guardado.
--
-- Patrón del esquema, y por qué hay dos capas:
--   · La lógica vive en `app`, que NO se expone por PostgREST, es SECURITY
--     DEFINER y trae search_path fijado.
--   · Encima va una envoltura delgada en `public`, que es lo único que el
--     Data API alcanza. Sin ella, `supabase.rpc()` no puede llamar nada de
--     `app` — y meter la lógica directo en `public` rompería la regla de que
--     las funciones de ayuda no se exponen.
--
-- SECURITY DEFINER salta RLS, así que cada función verifica el acceso a mano
-- con `app.is_staff_of_client` y exige que TODAS las piezas involucradas sean
-- del mismo cliente. Un intercambio entre clientes es un cruce de datos, no un
-- error de dedo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Intercambiar los slots de dos piezas
-- -----------------------------------------------------------------------------
create or replace function app.swap_piece_slots(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pa public.pieces%rowtype;
  pb public.pieces%rowtype;
begin
  if a is null or b is null or a = b then
    raise exception 'Se necesitan dos piezas distintas para intercambiar.'
      using errcode = '22023';
  end if;

  -- Se toman los candados SIEMPRE en el mismo orden (por id). Dos intercambios
  -- simultáneos que toquen el mismo par se formarían en fila en vez de
  -- abrazarse en un deadlock.
  select * into pa from public.pieces where id = least(a, b) for update;
  select * into pb from public.pieces where id = greatest(a, b) for update;

  if pa.id is null or pb.id is null then
    raise exception 'Alguna de las dos piezas ya no existe. Recarga el planner.'
      using errcode = 'P0002';
  end if;

  if pa.client_id <> pb.client_id then
    raise exception 'Las dos piezas tienen que ser del mismo cliente.'
      using errcode = '42501';
  end if;

  if not app.is_staff_of_client(pa.client_id) then
    raise exception 'No tienes acceso a estas piezas.'
      using errcode = '42501';
  end if;

  if pa.date_locked or pb.date_locked then
    raise exception 'Una de las piezas está amarrada a su fecha. Quita el candado para moverla.'
      using errcode = '42501';
  end if;

  -- La base ya prohíbe una pieza publicada sin fecha; el mensaje crudo de ese
  -- CHECK no le sirve a nadie, así que se explica antes de provocarlo.
  if (pa.status = 'publicado' and pb.publish_at is null)
     or (pb.status = 'publicado' and pa.publish_at is null) then
    raise exception 'Una pieza ya publicada no se puede quedar sin fecha.'
      using errcode = '22023';
  end if;

  update public.pieces
     set publish_at = pb.publish_at, slot_index = pb.slot_index
   where id = pa.id;

  update public.pieces
     set publish_at = pa.publish_at, slot_index = pa.slot_index
   where id = pb.id;
end;
$$;

comment on function app.swap_piece_slots(uuid, uuid) is
  'Intercambia publish_at y slot_index de dos piezas del mismo cliente, en una transacción.';

-- -----------------------------------------------------------------------------
-- 2 · Insertar y correr: aplica los slots ya calculados a N piezas
--
-- Recibe SOLO las piezas que cambian, calculadas por src/domain/planner.ts. No
-- recalcula el mes completo a propósito: reescribir 68 renglones para mover uno
-- convierte cada arrastre en un conflicto con cualquier otra edición en curso.
-- -----------------------------------------------------------------------------
create or replace function app.shift_piece_slots(target_client uuid, moves jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  esperadas integer;
  aplicadas integer;
begin
  if not app.is_staff_of_client(target_client) then
    raise exception 'No tienes acceso a las piezas de este cliente.'
      using errcode = '42501';
  end if;

  if moves is null or jsonb_typeof(moves) <> 'array' or jsonb_array_length(moves) = 0 then
    raise exception 'No hay movimientos que aplicar.'
      using errcode = '22023';
  end if;

  esperadas := jsonb_array_length(moves);

  perform p.id
     from public.pieces p
    where p.id = any (
            select (m.value ->> 'id')::uuid
              from jsonb_array_elements(moves) as m(value)
          )
    order by p.id
      for update;

  if (
    select count(*)
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.client_id = target_client
  ) <> esperadas then
    raise exception 'Alguna pieza del reacomodo no existe o no es de este cliente.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.date_locked
  ) then
    raise exception 'Hay una pieza amarrada a su fecha dentro del reacomodo.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.status = 'publicado'
       and nullif(m.value ->> 'publish_at', '') is null
  ) then
    raise exception 'Una pieza ya publicada no se puede quedar sin fecha.'
      using errcode = '22023';
  end if;

  update public.pieces p
     set publish_at = nullif(m.value ->> 'publish_at', '')::timestamptz,
         slot_index = (m.value ->> 'slot_index')::integer
    from jsonb_array_elements(moves) as m(value)
   where p.id = (m.value ->> 'id')::uuid
     and p.client_id = target_client;

  get diagnostics aplicadas = row_count;
  return aplicadas;
end;
$$;

comment on function app.shift_piece_slots(uuid, jsonb) is
  'Aplica en una transacción los slots calculados por el planner. moves = [{id, publish_at, slot_index}].';

-- -----------------------------------------------------------------------------
-- 3 · Editar un campo de copy y registrar el aprendizaje
--
-- Al editar, la llave del campo se borra de `authored_by`. Eso es lo que hace
-- que el punto del tile pase de lleno a hueco: la pieza ya no llegó sola.
-- -----------------------------------------------------------------------------
create or replace function app.edit_piece_field(
  p_piece uuid,
  p_field text,
  p_value text,
  p_tags  text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pieza     public.pieces%rowtype;
  anterior  text;
  nuevo     text;
  agente    app.agent_key;
begin
  if p_field is null or p_field not in
     ('idea', 'hook', 'script', 'copy_in', 'copy_out', 'cta', 'hashtags') then
    raise exception 'El campo "%" no se edita por aquí.', coalesce(p_field, '(vacío)')
      using errcode = '22023';
  end if;

  select * into pieza from public.pieces where id = p_piece for update;

  if pieza.id is null then
    raise exception 'La pieza ya no existe. Recarga el planner.'
      using errcode = 'P0002';
  end if;

  if not app.is_staff_of_client(pieza.client_id) then
    raise exception 'No tienes acceso a esta pieza.'
      using errcode = '42501';
  end if;

  -- La procedencia se lee ANTES de borrarla: es la que queda registrada como
  -- "a quién se le corrigió". Se valida contra el enum en vez de castear a
  -- ciegas, porque un authored_by con basura no debe tumbar la edición.
  if pieza.authored_by ? p_field
     and (pieza.authored_by ->> p_field) = any (enum_range(null::app.agent_key)::text[]) then
    agente := (pieza.authored_by ->> p_field)::app.agent_key;
  end if;

  if p_field = 'hashtags' then
    anterior := array_to_string(pieza.hashtags, ' ');
    nuevo    := array_to_string(coalesce(p_tags, '{}'::text[]), ' ');

    update public.pieces
       set hashtags    = coalesce(p_tags, '{}'::text[]),
           authored_by = authored_by - p_field
     where id = p_piece;
  else
    anterior := to_jsonb(pieza) ->> p_field;
    nuevo    := nullif(p_value, '');

    execute format(
      'update public.pieces set %I = $1, authored_by = authored_by - $2 where id = $3',
      p_field
    ) using nuevo, p_field, p_piece;
  end if;

  -- Se escribe siempre, aunque el campo no lo hubiera tocado un agente: la
  -- lista de correcciones es el criterio de la marca, y las que Ana hace sobre
  -- su propio texto también lo son.
  insert into public.human_edits
    (org_id, client_id, piece_id, agent, field, old_value, new_value, edited_by)
  values
    (pieza.org_id, pieza.client_id, p_piece, agente, p_field, anterior, nuevo,
     (select auth.uid()));
end;
$$;

comment on function app.edit_piece_field(uuid, text, text, text[]) is
  'Edita un campo de copy, limpia su procedencia de agente y registra la corrección en human_edits, todo en una transacción.';

-- =============================================================================
-- Envolturas públicas: lo único que el Data API puede llamar.
-- =============================================================================

create or replace function public.swap_piece_slots(a uuid, b uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.swap_piece_slots(a, b);
$$;

create or replace function public.shift_piece_slots(target_client uuid, moves jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select app.shift_piece_slots(target_client, moves);
$$;

create or replace function public.edit_piece_field(
  p_piece uuid,
  p_field text,
  p_value text,
  p_tags  text[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.edit_piece_field(p_piece, p_field, p_value, p_tags);
$$;

-- Postgres otorga EXECUTE a PUBLIC en toda función nueva. Se quita y se da
-- solo a quien tiene sesión: el portal de cliente no reordena nada.
revoke all on function
  app.swap_piece_slots(uuid, uuid),
  app.shift_piece_slots(uuid, jsonb),
  app.edit_piece_field(uuid, text, text, text[]),
  public.swap_piece_slots(uuid, uuid),
  public.shift_piece_slots(uuid, jsonb),
  public.edit_piece_field(uuid, text, text, text[])
from public, anon;

grant execute on function
  app.swap_piece_slots(uuid, uuid),
  app.shift_piece_slots(uuid, jsonb),
  app.edit_piece_field(uuid, text, text, text[])
to authenticated, service_role;

grant execute on function
  public.swap_piece_slots(uuid, uuid),
  public.shift_piece_slots(uuid, jsonb),
  public.edit_piece_field(uuid, text, text, text[])
to authenticated, service_role;
