-- migrate:up

-- Who lives in Spain, as far as is known already (PLAN R74): everyone whose province is one of Spain's, as written
-- (in either language, by its community or main island: the names the apps read, packages/domain places.ts), and
-- everyone Global's Airtable view brought, which was Spain's alone (ADR-0005). Nobody else is guessed at: their country
-- stays unknown until someone says it. Provinces are kept as written.
UPDATE app.people p SET country = 'ES'
 WHERE p.country IS NULL AND p.merged_into IS NULL AND p.anonymised_at IS NULL
   AND (private.fold_name(p.province) IN (
          SELECT private.fold_name(v.name) FROM (VALUES
         ('A Coruña'), ('Albacete'), ('Alicante/Alacant'), ('Almería'), ('Araba/Álava'), ('Asturias'), ('Ávila'),
         ('Badajoz'), ('Barcelona'), ('Bizkaia'), ('Burgos'), ('Cáceres'), ('Cádiz'), ('Cantabria'),
         ('Castellón/Castelló'), ('Ceuta'), ('Ciudad Real'), ('Córdoba'), ('Cuenca'), ('Gipuzkoa'), ('Girona'),
         ('Granada'), ('Guadalajara'), ('Huelva'), ('Huesca'), ('Illes Balears'), ('Jaén'), ('La Rioja'),
         ('Las Palmas'), ('León'), ('Lleida'), ('Lugo'), ('Madrid'), ('Málaga'), ('Melilla'), ('Murcia'),
         ('Navarra'), ('Ourense'), ('Palencia'), ('Pontevedra'), ('Salamanca'), ('Santa Cruz de Tenerife'),
         ('Segovia'), ('Sevilla'), ('Soria'), ('Tarragona'), ('Teruel'), ('Toledo'), ('Valencia/València'),
         ('Valladolid'), ('Zamora'), ('Zaragoza'), ('coruna'), ('la coruna'), ('alicante'), ('alacant'), ('alava'),
         ('araba'), ('principado de asturias'), ('vizcaya'), ('castellon'), ('castello'), ('guipuzcoa'), ('gerona'),
         ('baleares'), ('islas baleares'), ('illes balears'), ('balears'), ('mallorca'), ('rioja'), ('gran canaria'),
         ('lerida'), ('comunidad de madrid'), ('region de murcia'), ('nafarroa'), ('orense'), ('tenerife'),
         ('valencia')) AS v(name))
        OR EXISTS (SELECT 1 FROM app.person_sources s WHERE s.person_id = p.id AND s.source = 'airtable'));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
