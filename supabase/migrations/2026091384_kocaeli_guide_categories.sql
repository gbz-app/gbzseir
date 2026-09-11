-- Kocaeli guide import (scripts/db/import-kocaeli-guide.mjs): the one institution category the province-wide guide needs
-- that the vocabulary lacks. İl / ilçe millî eğitim müdürlükleri (13 records: the provincial directorate and one per
-- district) would otherwise all fall into "Diğer kamu kurumu". Group egitim (the /rehber education list), after
-- Kütüphane. Every other record maps to an existing key (valilik, muhtarlık, göç, gümrük, sosyal hizmet, hükümet konağı
-- -> diger_kamu; oda -> ticaret_odasi; il / ilçe sağlık müdürlüğü -> ilce_saglik; ADSM -> agiz_dis; tıp merkezi ->
-- hastane).
-- institution_categories rows only. The app reads the vocabulary from this table (label, group and icon come from the
-- row; "landmark" is one of the guide icons), so no code change is needed. Re-runnable; an admin's later edits of the row
-- are kept (do nothing on conflict).
insert into public.institution_categories (key, label_tr, group_key, icon, sort) values
  ('milli_egitim', 'Milli eğitim müdürlüğü', 'egitim', 'landmark', 575)
on conflict (key) do nothing;
