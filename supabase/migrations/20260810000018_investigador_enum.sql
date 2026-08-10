-- =============================================================================
-- 0018 · El noveno agente: investigador.
--
-- Solo el valor del enum, en su propio archivo. `alter type ... add value` no
-- se puede usar en la misma transacción en la que se agrega — separarlo de
-- 0019 (que ya inserta filas con `agent = 'investigador'`) evita pelear contra
-- esa regla de Postgres en vez de contra el problema real.
-- =============================================================================
alter type app.agent_key add value 'investigador';
