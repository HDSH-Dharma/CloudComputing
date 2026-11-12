-- Local-only seed data (`supabase db reset`). NEVER runs against production.
-- Demo login:  demo@filamentiq.local / demo-password-123
-- Gives the frontend realistic rows for every screen before the real pipeline exists.

do $$
declare
  uid  uuid := '11111111-1111-1111-1111-111111111111';
  prn  uuid := '22222222-2222-2222-2222-222222222222';
  sp1  uuid := '33333333-3333-3333-3333-333333333301';
  sp2  uuid := '33333333-3333-3333-3333-333333333302';
  sp3  uuid := '33333333-3333-3333-3333-333333333303';
  gc1  uuid := '44444444-4444-4444-4444-444444444401';
  gc2  uuid := '44444444-4444-4444-4444-444444444402';
  jb1  uuid := '55555555-5555-5555-5555-555555555501';
  jb2  uuid := '55555555-5555-5555-5555-555555555502';
  jb3  uuid := '55555555-5555-5555-5555-555555555503';
  jb4  uuid := '55555555-5555-5555-5555-555555555504';
  sn1  uuid := '66666666-6666-6666-6666-666666666601';
  sn2  uuid := '66666666-6666-6666-6666-666666666602';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
          'demo@filamentiq.local', extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"display_name":"Demo Maker"}', now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', 'demo@filamentiq.local', 'email_verified', true),
          'email', now(), now(), now());

  insert into public.printers (id, owner_id, name, model, api_type, base_url, webcam_url, power_watts)
  values (prn, uid, 'Ender 3 V3', 'Creality Ender-3 V3 SE', 'octoprint',
          'https://printer.example.ts.net', 'https://printer.example.ts.net/webcam/?action=snapshot', 150);

  insert into public.spools (id, owner_id, name, material, brand, color_name, color_hex, density_g_cm3,
                             initial_net_weight_g, tare_weight_g, remaining_weight_g, price, purchased_at)
  values
    (sp1, uid, 'eSUN PLA+ Black',  'PLA',  'eSUN',     'Black', '#111111', 1.24, 1000, 180, 630.10, 185000, current_date - 40),
    (sp2, uid, 'Polymaker PETG',   'PETG', 'Polymaker','Teal',  '#1AA39A', 1.27, 1000, 210, 905.00, 245000, current_date - 15),
    (sp3, uid, 'Sunlu PLA White',  'PLA',  'Sunlu',    'White', '#F5F5F5', 1.24, 1000, 160, 140.00, 160000, current_date - 90);

  insert into public.gcode_files (id, owner_id, storage_path, original_filename, size_bytes, parse_status, slicer,
                                  filament_type, filament_length_mm, filament_weight_g, filament_diameter_mm, filament_density,
                                  estimated_duration_s, nozzle_temp_c, bed_temp_c, layer_height_mm, first_layer_height_mm,
                                  layer_count, max_z_mm, metadata)
  values
    (gc1, uid, uid || '/benchy.gcode', '3DBenchy_0.2mm_PLA.gcode', 2843112, 'parsed', 'PrusaSlicer 2.8.1',
     'PLA', 3920.5, 11.69, 1.75, 1.24, 4980, 215, 60, 0.2, 0.2, 240, 48.0, '{}'),
    (gc2, uid, uid || '/enclosure_lid.gcode', 'enclosure_lid_PETG.gcode', 9921004, 'parsed', 'OrcaSlicer 2.2.0',
     'PETG', 32850.0, 99.85, 1.75, 1.27, 21300, 240, 80, 0.24, 0.24, 95, 22.8, '{}');

  insert into public.print_jobs (id, owner_id, name, project, printer_id, gcode_file_id, spool_id, status,
                                 started_at, ended_at, weight_before_g, weight_after_g, actual_filament_g)
  values
    (jb1, uid, 'Benchy calibration', 'Calibration', prn, gc1, sp1, 'completed',
     now() - interval '6 days 3 hours', now() - interval '6 days 1 hour 37 minutes', 650.00, 636.80, 13.20),
    (jb2, uid, 'Enclosure lid',      'Enclosure',   prn, gc2, sp2, 'completed',
     now() - interval '3 days 8 hours', now() - interval '3 days 2 hours 5 minutes', 1000.00, 905.00, 95.00),
    (jb3, uid, 'Benchy (spaghetti)', 'Calibration', prn, gc1, sp1, 'failed',
     now() - interval '1 day 4 hours', now() - interval '1 day 3 hours 20 minutes', 636.80, 630.10, 6.70),
    (jb4, uid, 'Benchy reprint',     'Calibration', prn, gc1, sp1, 'printing',
     now() - interval '40 minutes', null, 630.10, null, null);

  -- Telemetry for the running job: every minute for 40 minutes.
  insert into public.telemetry (owner_id, printer_id, print_job_id, captured_at, state,
                                nozzle_temp_c, nozzle_target_c, bed_temp_c, bed_target_c,
                                progress_pct, current_layer, total_layers, z_height_mm, time_remaining_s)
  select uid, prn, jb4, now() - make_interval(mins => 40 - m), 'printing',
         round((215 + sin(m / 3.0) * 1.5)::numeric, 1), 215,
         round((60 + cos(m / 4.0) * 0.6)::numeric, 1), 60,
         round(m / 83.0 * 100, 2), (m * 240 / 83), 240, round((m * 240 / 83) * 0.2, 2), (83 - m) * 60
  from generate_series(0, 40) as m;

  insert into public.snapshots (id, owner_id, printer_id, print_job_id, storage_path, captured_at, diff_score, ssim, analyzed)
  values
    (sn1, uid, prn, jb3, uid || '/' || prn || '/seed/t-10.jpg', now() - interval '1 day 3 hours 30 minutes', 0.021, 0.97, true),
    (sn2, uid, prn, jb3, uid || '/' || prn || '/seed/now.jpg',  now() - interval '1 day 3 hours 20 minutes', 0.184, 0.71, true);

  insert into public.monitoring_events (owner_id, printer_id, print_job_id, snapshot_id, reference_snapshot_id,
                                        status, confidence, reason, model, telemetry, alert_sent_at, created_at)
  values
    (uid, prn, jb3, sn2, sn1, 'warning', 0.91,
     'Loose filament strands visible above the hull; extrusion no longer follows the model while Z keeps rising (spaghetti).',
     'gemini-2.5-flash', '{"layer": 58, "nozzle_temp_c": 214.6, "bed_temp_c": 60.1}',
     now() - interval '1 day 3 hours 19 minutes', now() - interval '1 day 3 hours 20 minutes');

  insert into public.spool_weighins (owner_id, spool_id, print_job_id, kind, gross_weight_g, tare_weight_g, measured_at)
  values
    (uid, sp1, jb1, 'after_print', 816.80, 180, now() - interval '6 days 1 hour'),
    (uid, sp2, jb2, 'after_print', 1115.00, 210, now() - interval '3 days 2 hours'),
    (uid, sp1, jb3, 'after_print', 810.10, 180, now() - interval '1 day 3 hours');
end $$;
