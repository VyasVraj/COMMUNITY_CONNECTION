-- =============================================================================
-- Migration: 20261019100000_extend_schema_for_community_census_and_import.sql
-- Purpose:   Extend canonical families and persons tables with community census
--             attributes, update import batch constraints for Excel formats,
--             and enhance promote_import_batch RPC to link all family members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend public.families with Community & Household Attributes
-- -----------------------------------------------------------------------------

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS mool_shakha TEXT,
  ADD COLUMN IF NOT EXISTS family_type TEXT,
  ADD COLUMN IF NOT EXISTS mukhi_name TEXT,
  ADD COLUMN IF NOT EXISTS native_place TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS census_status TEXT DEFAULT 'INCOMPLETE';

COMMENT ON COLUMN public.families.mool_shakha IS 'Ancestral branch or clan shakha (e.g., Kapoor).';
COMMENT ON COLUMN public.families.family_type IS 'Household structure (e.g., Nuclear, Joint, Extended).';
COMMENT ON COLUMN public.families.mukhi_name IS 'Designated community elder or mukhi for this household.';
COMMENT ON COLUMN public.families.native_place IS 'Ancestral native place or village (e.g. Sindh Jo Gam).';
COMMENT ON COLUMN public.families.address IS 'Physical household street address.';
COMMENT ON COLUMN public.families.area IS 'Household residential neighborhood or area.';
COMMENT ON COLUMN public.families.postal_code IS 'Household postal code / PIN code.';
COMMENT ON COLUMN public.families.census_status IS 'Census workflow completion status (e.g., INCOMPLETE, COMPLETED).';

-- -----------------------------------------------------------------------------
-- 2. Extend public.persons with Demographic & Contact Attributes
-- -----------------------------------------------------------------------------

ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS marital_status TEXT,
  ADD COLUMN IF NOT EXISTS blood_group TEXT,
  ADD COLUMN IF NOT EXISTS education TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS birth_order INT,
  ADD COLUMN IF NOT EXISTS native_place TEXT,
  ADD COLUMN IF NOT EXISTS current_address TEXT,
  ADD COLUMN IF NOT EXISTS current_area TEXT,
  ADD COLUMN IF NOT EXISTS current_city TEXT,
  ADD COLUMN IF NOT EXISTS current_state TEXT,
  ADD COLUMN IF NOT EXISTS current_postal_code TEXT;

COMMENT ON COLUMN public.persons.marital_status IS 'Marital status (e.g., Single, Married, Widowed, Divorced).';
COMMENT ON COLUMN public.persons.blood_group IS 'Blood group (e.g., A+, B+, AB+, O+, etc.).';
COMMENT ON COLUMN public.persons.education IS 'Highest educational qualification or school standard.';
COMMENT ON COLUMN public.persons.occupation IS 'Occupation, business, or employment status.';
COMMENT ON COLUMN public.persons.birth_order IS 'Numerical birth order among siblings (1, 2, 3...).';
COMMENT ON COLUMN public.persons.native_place IS 'Ancestral native village or origin place.';
COMMENT ON COLUMN public.persons.current_address IS 'Individual current address if distinct from family household.';
COMMENT ON COLUMN public.persons.current_area IS 'Individual current residential area.';
COMMENT ON COLUMN public.persons.current_city IS 'Individual current residential city.';
COMMENT ON COLUMN public.persons.current_state IS 'Individual current residential state/province.';
COMMENT ON COLUMN public.persons.current_postal_code IS 'Individual current residential postal code.';

-- -----------------------------------------------------------------------------
-- 3. Update import_batches File Format Constraint for Excel
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'import_batches_file_format_valid'
  ) THEN
    ALTER TABLE public.import_batches
      DROP CONSTRAINT import_batches_file_format_valid;
  END IF;

  ALTER TABLE public.import_batches
    ADD CONSTRAINT import_batches_file_format_valid
    CHECK (file_format IN ('CSV', 'JSON', 'XLSX', 'EXCEL'));
END $$;

-- -----------------------------------------------------------------------------
-- 4. Authoritative RPC: Enhanced public.promote_import_batch
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_import_batch(
  p_batch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_batch RECORD;
  v_rec RECORD;

  -- Eligibility counters
  v_pending_count INT := 0;
  v_error_count INT := 0;
  v_unresolved_error_count INT := 0;
  v_eligible_count INT := 0;
  v_already_promoted_count INT := 0;

  -- Execution counters
  v_promoted_persons INT := 0;
  v_promoted_families INT := 0;
  v_promoted_memberships INT := 0;
  v_promoted_relationships INT := 0;
  v_created_duplicate_flags INT := 0;
  v_total_promoted INT := 0;

  -- Entity variables
  v_canonical_id UUID;
  v_first_name TEXT;
  v_last_name TEXT;
  v_middle_name TEXT;
  v_maiden_name TEXT;
  v_gender public.gender;
  v_gender_str TEXT;
  v_dob DATE;
  v_dod DATE;
  v_dob_str TEXT;
  v_dod_str TEXT;
  v_birth_place TEXT;
  v_gotra TEXT;
  v_nukh TEXT;
  v_kul TEXT;
  v_phone TEXT;
  v_email TEXT;
  v_status_str TEXT;
  v_person_status public.person_status;

  -- Extended person fields
  v_marital_status TEXT;
  v_blood_group TEXT;
  v_education TEXT;
  v_occupation TEXT;
  v_birth_order INT;
  v_p_native_place TEXT;
  v_current_address TEXT;
  v_current_area TEXT;
  v_current_city TEXT;
  v_current_state TEXT;
  v_current_postal_code TEXT;

  -- Family variables
  v_family_name TEXT;
  v_description TEXT;
  v_city TEXT;
  v_state TEXT;
  v_country TEXT;
  v_mool_shakha TEXT;
  v_family_type TEXT;
  v_mukhi_name TEXT;
  v_f_native_place TEXT;
  v_f_address TEXT;
  v_f_area TEXT;
  v_f_postal_code TEXT;
  v_census_status TEXT;

  -- Membership variables
  v_head_ref TEXT;
  v_head_canonical_id UUID;
  v_fam_ref TEXT;
  v_target_family_id UUID;
  v_member_role_str TEXT;
  v_member_role public.family_role;
  v_is_head_bool BOOLEAN;

  -- Relationship variables
  v_rel_person_a_ref TEXT;
  v_rel_person_b_ref TEXT;
  v_rel_type_str TEXT;
  v_rel_type public.relationship_type;
  v_canonical_person_a UUID;
  v_canonical_person_b UUID;
  v_swap_temp UUID;

  -- Duplicate candidate variables
  v_dup_candidate_id UUID;
  v_dup_confidence public.duplicate_confidence;
  v_dup_confidence_str TEXT;
  v_dup_signals JSONB;
  v_dup_rec_a UUID;
  v_dup_rec_b UUID;
  v_error_elem JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated to promote import batch'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization check: Super Admin or Admin only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks administrator role to promote import batches'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Lock and retrieve import batch
  SELECT * INTO v_batch
  FROM public.import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Import batch % does not exist', p_batch_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 4. Idempotency: If already PROMOTED, return existing summary safely
  IF v_batch.status = 'PROMOTED' THEN
    SELECT
      count(*) FILTER (WHERE entity_type = 'PERSON' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'FAMILY' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE entity_type = 'RELATIONSHIP' AND canonical_id IS NOT NULL),
      count(*) FILTER (WHERE canonical_id IS NOT NULL)
    INTO
      v_promoted_persons,
      v_promoted_families,
      v_promoted_relationships,
      v_total_promoted
    FROM public.staging_records
    WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
      'success', true,
      'batchId', p_batch_id,
      'status', 'PROMOTED',
      'alreadyPromoted', true,
      'promotedRecords', jsonb_build_object(
        'persons', v_promoted_persons,
        'families', v_promoted_families,
        'relationships', v_promoted_relationships,
        'total', v_total_promoted
      ),
      'familyMemberships', 0,
      'duplicateFlags', 0,
      'total', v_total_promoted
    );
  END IF;

  -- Lifecycle status check: Only VALIDATED batches may be promoted
  IF v_batch.status != 'VALIDATED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot promote import batch % with status %. Batch must be VALIDATED.', p_batch_id, v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- 5. Lock all staging records for this batch deterministically
  PERFORM 1
  FROM public.staging_records
  WHERE batch_id = p_batch_id
  ORDER BY source_row_number ASC, id ASC
  FOR UPDATE;

  -- 6. Rigorous Eligibility Verification
  SELECT
    count(*) FILTER (WHERE validation_status = 'PENDING'),
    count(*) FILTER (WHERE validation_status = 'ERROR'),
    count(*) FILTER (
      WHERE validation_status != 'EXCLUDED'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(validation_errors) elem
          WHERE elem->>'severity' = 'ERROR'
        )
    ),
    count(*) FILTER (WHERE validation_status IN ('VALID', 'WARNING')),
    count(*) FILTER (WHERE canonical_id IS NOT NULL)
  INTO
    v_pending_count,
    v_error_count,
    v_unresolved_error_count,
    v_eligible_count,
    v_already_promoted_count
  FROM public.staging_records
  WHERE batch_id = p_batch_id;

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with % unvalidated (PENDING) records. Run validation first.', v_pending_count
      USING ERRCODE = '23514';
  END IF;

  IF v_error_count > 0 OR v_unresolved_error_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with unresolved errors (% with ERROR status, % with unresolved error payloads).', v_error_count, v_unresolved_error_count
      USING ERRCODE = '23514';
  END IF;

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Cannot promote batch with zero valid or warning records.'
      USING ERRCODE = '23514';
  END IF;

  IF v_already_promoted_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: Batch contains % records that have already been assigned a canonical_id.', v_already_promoted_count
      USING ERRCODE = '23514';
  END IF;

  -- 7. Create temporary in-transaction source-to-canonical mapping table
  CREATE TEMP TABLE temp_import_id_map (
    staging_id UUID PRIMARY KEY,
    source_record_id TEXT,
    entity_type public.import_entity_type NOT NULL,
    canonical_id UUID NOT NULL
  ) ON COMMIT DROP;

  CREATE INDEX idx_temp_import_id_map_source
    ON temp_import_id_map (source_record_id)
    WHERE source_record_id IS NOT NULL;

  -- ===========================================================================
  -- STEP 1: PROMOTE PERSON RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'PERSON'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_first_name := trim(v_rec.parsed_data->>'first_name');
    v_last_name := trim(v_rec.parsed_data->>'last_name');
    v_middle_name := NULLIF(trim(v_rec.parsed_data->>'middle_name'), '');
    v_maiden_name := NULLIF(trim(v_rec.parsed_data->>'maiden_name'), '');

    v_gender_str := upper(trim(COALESCE(v_rec.parsed_data->>'gender', '')));
    IF v_gender_str = 'MALE' THEN
      v_gender := 'MALE'::public.gender;
    ELSIF v_gender_str = 'FEMALE' THEN
      v_gender := 'FEMALE'::public.gender;
    ELSIF v_gender_str = 'OTHER' THEN
      v_gender := 'OTHER'::public.gender;
    ELSIF v_gender_str = 'PREFER_NOT_TO_SAY' THEN
      v_gender := 'PREFER_NOT_TO_SAY'::public.gender;
    ELSE
      v_gender := NULL;
    END IF;

    v_dob_str := NULLIF(trim(v_rec.parsed_data->>'date_of_birth'), '');
    v_dob := CASE WHEN v_dob_str IS NOT NULL THEN v_dob_str::DATE ELSE NULL END;

    v_dod_str := NULLIF(trim(v_rec.parsed_data->>'date_of_death'), '');
    v_dod := CASE WHEN v_dod_str IS NOT NULL THEN v_dod_str::DATE ELSE NULL END;

    v_birth_place := NULLIF(trim(v_rec.parsed_data->>'birth_place'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_phone := NULLIF(trim(v_rec.parsed_data->>'phone'), '');
    v_email := NULLIF(trim(v_rec.parsed_data->>'email'), '');

    -- Extended attributes
    v_marital_status := NULLIF(trim(v_rec.parsed_data->>'marital_status'), '');
    v_blood_group := NULLIF(trim(v_rec.parsed_data->>'blood_group'), '');
    v_education := NULLIF(trim(v_rec.parsed_data->>'education'), '');
    v_occupation := NULLIF(trim(v_rec.parsed_data->>'occupation'), '');
    v_p_native_place := NULLIF(trim(v_rec.parsed_data->>'native_place'), '');
    v_current_address := NULLIF(trim(v_rec.parsed_data->>'current_address'), '');
    v_current_area := NULLIF(trim(v_rec.parsed_data->>'current_area'), '');
    v_current_city := NULLIF(trim(v_rec.parsed_data->>'current_city'), '');
    v_current_state := NULLIF(trim(v_rec.parsed_data->>'current_state'), '');
    v_current_postal_code := NULLIF(trim(v_rec.parsed_data->>'current_postal_code'), '');
    v_birth_order := CASE
      WHEN v_rec.parsed_data->>'birth_order' IS NOT NULL AND v_rec.parsed_data->>'birth_order' ~ '^[0-9]+$'
      THEN (v_rec.parsed_data->>'birth_order')::INT
      ELSE NULL
    END;

    -- Determine canonical person status: ACTIVE | DECEASED
    v_status_str := upper(trim(COALESCE(v_rec.parsed_data->>'status', 'ACTIVE')));
    IF v_status_str = 'DECEASED' OR v_dod IS NOT NULL THEN
      v_person_status := 'DECEASED'::public.person_status;
    ELSE
      v_person_status := 'ACTIVE'::public.person_status;
    END IF;

    -- Insert into public.persons (PERSON != USER: user_id IS NULL)
    INSERT INTO public.persons (
      first_name,
      middle_name,
      last_name,
      maiden_name,
      gender,
      date_of_birth,
      date_of_death,
      birth_place,
      gotra,
      nukh,
      kul,
      phone,
      email_contact,
      status,
      verification_status,
      profile_privacy,
      dob_privacy,
      contact_privacy,
      user_id,
      created_by,
      created_at,
      updated_at,
      deleted_at,
      marital_status,
      blood_group,
      education,
      occupation,
      birth_order,
      native_place,
      current_address,
      current_area,
      current_city,
      current_state,
      current_postal_code
    ) VALUES (
      v_first_name,
      v_middle_name,
      v_last_name,
      v_maiden_name,
      v_gender,
      v_dob,
      v_dod,
      v_birth_place,
      v_gotra,
      v_nukh,
      v_kul,
      v_phone,
      v_email,
      v_person_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'FAMILY'::public.privacy_level,
      'PRIVATE'::public.privacy_level,
      NULL,
      v_caller_id,
      NOW(),
      NOW(),
      NULL,
      v_marital_status,
      v_blood_group,
      v_education,
      v_occupation,
      v_birth_order,
      v_p_native_place,
      v_current_address,
      v_current_area,
      v_current_city,
      v_current_state,
      v_current_postal_code
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'PERSON', v_canonical_id);

    v_promoted_persons := v_promoted_persons + 1;

    -- Duplicate Review Traceability for Person
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'PERSON'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'PERSON'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 2: PROMOTE FAMILY RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, source_record_id, parsed_data, validation_status, validation_errors
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_family_name := trim(v_rec.parsed_data->>'family_name');
    v_description := NULLIF(trim(v_rec.parsed_data->>'description'), '');
    v_gotra := NULLIF(trim(v_rec.parsed_data->>'gotra'), '');
    v_nukh := NULLIF(trim(v_rec.parsed_data->>'nukh'), '');
    v_kul := NULLIF(trim(v_rec.parsed_data->>'kul'), '');
    v_city := NULLIF(trim(v_rec.parsed_data->>'city'), '');
    v_state := NULLIF(trim(v_rec.parsed_data->>'state'), '');
    v_country := COALESCE(NULLIF(trim(v_rec.parsed_data->>'country'), ''), 'India');

    -- Extended family attributes
    v_mool_shakha := NULLIF(trim(v_rec.parsed_data->>'mool_shakha'), '');
    v_family_type := NULLIF(trim(v_rec.parsed_data->>'family_type'), '');
    v_mukhi_name := NULLIF(trim(v_rec.parsed_data->>'mukhi_name'), '');
    v_f_native_place := NULLIF(trim(v_rec.parsed_data->>'native_place'), '');
    v_f_address := NULLIF(trim(v_rec.parsed_data->>'address'), '');
    v_f_area := NULLIF(trim(v_rec.parsed_data->>'area'), '');
    v_f_postal_code := NULLIF(trim(v_rec.parsed_data->>'postal_code'), '');
    v_census_status := COALESCE(NULLIF(trim(v_rec.parsed_data->>'census_status'), ''), 'INCOMPLETE');

    -- Insert into public.families
    INSERT INTO public.families (
      family_name,
      description,
      gotra,
      nukh,
      kul,
      city,
      state,
      country,
      status,
      verification_status,
      profile_privacy,
      members_privacy,
      created_by,
      created_at,
      updated_at,
      deleted_at,
      mool_shakha,
      family_type,
      mukhi_name,
      native_place,
      address,
      area,
      postal_code,
      census_status
    ) VALUES (
      v_family_name,
      v_description,
      v_gotra,
      v_nukh,
      v_kul,
      v_city,
      v_state,
      v_country,
      'ACTIVE'::public.family_status,
      'UNVERIFIED'::public.verification_status,
      'COMMUNITY'::public.privacy_level,
      'COMMUNITY'::public.privacy_level,
      v_caller_id,
      NOW(),
      NOW(),
      NULL,
      v_mool_shakha,
      v_family_type,
      v_mukhi_name,
      v_f_native_place,
      v_f_address,
      v_f_area,
      v_f_postal_code,
      v_census_status
    )
    RETURNING id INTO v_canonical_id;

    -- Update staging record with canonical link
    UPDATE public.staging_records
    SET
      canonical_id = v_canonical_id,
      updated_at = NOW()
    WHERE id = v_rec.id;

    -- Record mapping for downstream resolution
    INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
    VALUES (v_rec.id, v_rec.source_record_id, 'FAMILY', v_canonical_id);

    v_promoted_families := v_promoted_families + 1;

    -- Duplicate Review Traceability for Family
    IF v_rec.validation_status = 'WARNING' THEN
      FOR v_error_elem IN SELECT * FROM jsonb_array_elements(v_rec.validation_errors)
      LOOP
        IF v_error_elem->>'code' = 'DUPLICATE_CANDIDATE' AND v_error_elem->>'canonical_candidate_id' IS NOT NULL THEN
          v_dup_candidate_id := (v_error_elem->>'canonical_candidate_id')::UUID;
          v_dup_confidence_str := upper(trim(COALESCE(v_error_elem->>'confidence', 'POSSIBLE')));
          IF v_dup_confidence_str = 'STRONG' THEN
            v_dup_confidence := 'STRONG'::public.duplicate_confidence;
          ELSIF v_dup_confidence_str = 'WEAK' THEN
            v_dup_confidence := 'WEAK'::public.duplicate_confidence;
          ELSE
            v_dup_confidence := 'POSSIBLE'::public.duplicate_confidence;
          END IF;
          v_dup_signals := COALESCE(v_error_elem->'match_signals', '["IMPORT_VALIDATION_MATCH"]'::jsonb);

          IF v_canonical_id < v_dup_candidate_id THEN
            v_dup_rec_a := v_canonical_id;
            v_dup_rec_b := v_dup_candidate_id;
          ELSE
            v_dup_rec_a := v_dup_candidate_id;
            v_dup_rec_b := v_canonical_id;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM public.duplicate_flags
            WHERE entity_type = 'FAMILY'
              AND record_a_id = v_dup_rec_a
              AND record_b_id = v_dup_rec_b
          ) THEN
            INSERT INTO public.duplicate_flags (
              entity_type,
              record_a_id,
              record_b_id,
              confidence,
              match_signals,
              status,
              notes,
              flagged_by,
              created_at,
              updated_at
            ) VALUES (
              'FAMILY'::public.duplicate_entity_type,
              v_dup_rec_a,
              v_dup_rec_b,
              v_dup_confidence,
              v_dup_signals,
              'OPEN'::public.duplicate_flag_status,
              format('Flagged during import promotion for batch %s (source row %s). DETECT != MERGE: distinct canonical records preserved.', p_batch_id, v_rec.source_row_number),
              v_caller_id,
              NOW(),
              NOW()
            );
            v_created_duplicate_flags := v_created_duplicate_flags + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 3: FAMILY MEMBERSHIP LINKAGE (HEAD + ALL FAMILY MEMBERS)
  -- ===========================================================================

  -- 3A: Explicit head linkage from family head_id (backward compatibility)
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, canonical_id
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'FAMILY'
      AND canonical_id IS NOT NULL
    ORDER BY source_row_number ASC
  LOOP
    v_head_ref := NULLIF(trim(v_rec.parsed_data->>'head_id'), '');
    IF v_head_ref IS NOT NULL THEN
      SELECT canonical_id INTO v_head_canonical_id
      FROM temp_import_id_map
      WHERE entity_type = 'PERSON'
        AND (source_record_id = v_head_ref OR staging_id::TEXT = v_head_ref);

      IF v_head_canonical_id IS NOT NULL THEN
        INSERT INTO public.family_members (
          family_id,
          person_id,
          role,
          is_head,
          joined_at,
          added_by,
          created_at
        ) VALUES (
          v_rec.canonical_id,
          v_head_canonical_id,
          'HEAD'::public.family_role,
          TRUE,
          NOW(),
          v_caller_id,
          NOW()
        )
        ON CONFLICT (family_id, person_id) DO UPDATE
          SET role = 'HEAD'::public.family_role, is_head = TRUE;

        v_promoted_memberships := v_promoted_memberships + 1;
      END IF;
    END IF;
  END LOOP;

  -- 3B: Link all staged PERSON records that specify a family_ref
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, canonical_id
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'PERSON'
      AND canonical_id IS NOT NULL
      AND (parsed_data->>'family_ref' IS NOT NULL OR parsed_data->>'family_id' IS NOT NULL)
    ORDER BY source_row_number ASC
  LOOP
    v_fam_ref := COALESCE(
      NULLIF(trim(v_rec.parsed_data->>'family_ref'), ''),
      NULLIF(trim(v_rec.parsed_data->>'family_id'), '')
    );

    v_target_family_id := NULL;
    SELECT canonical_id INTO v_target_family_id
    FROM temp_import_id_map
    WHERE entity_type = 'FAMILY'
      AND (source_record_id = v_fam_ref OR staging_id::TEXT = v_fam_ref);

    -- Fallback to existing canonical family if UUID format
    IF v_target_family_id IS NULL AND v_fam_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_target_family_id
      FROM public.families
      WHERE id = v_fam_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_target_family_id IS NOT NULL THEN
      v_member_role_str := upper(trim(COALESCE(v_rec.parsed_data->>'family_role', v_rec.parsed_data->>'role', 'MEMBER')));
      IF v_member_role_str = 'HEAD' THEN
        v_member_role := 'HEAD'::public.family_role;
        v_is_head_bool := TRUE;
      ELSIF v_member_role_str = 'SPOUSE' THEN
        v_member_role := 'SPOUSE'::public.family_role;
        v_is_head_bool := FALSE;
      ELSIF v_member_role_str = 'CHILD' THEN
        v_member_role := 'CHILD'::public.family_role;
        v_is_head_bool := FALSE;
      ELSIF v_member_role_str = 'PARENT' THEN
        v_member_role := 'PARENT'::public.family_role;
        v_is_head_bool := FALSE;
      ELSIF v_member_role_str = 'SIBLING' THEN
        v_member_role := 'SIBLING'::public.family_role;
        v_is_head_bool := FALSE;
      ELSIF v_member_role_str = 'GRANDPARENT' THEN
        v_member_role := 'GRANDPARENT'::public.family_role;
        v_is_head_bool := FALSE;
      ELSIF v_member_role_str = 'GRANDCHILD' THEN
        v_member_role := 'GRANDCHILD'::public.family_role;
        v_is_head_bool := FALSE;
      ELSE
        v_member_role := 'EXTENDED'::public.family_role;
        v_is_head_bool := FALSE;
      END IF;

      INSERT INTO public.family_members (
        family_id,
        person_id,
        role,
        is_head,
        joined_at,
        added_by,
        created_at
      ) VALUES (
        v_target_family_id,
        v_rec.canonical_id,
        v_member_role,
        v_is_head_bool,
        NOW(),
        v_caller_id,
        NOW()
      )
      ON CONFLICT (family_id, person_id) DO UPDATE
        SET role = EXCLUDED.role, is_head = EXCLUDED.is_head;

      v_promoted_memberships := v_promoted_memberships + 1;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 4: PROMOTE RELATIONSHIP RECORDS
  -- ===========================================================================
  FOR v_rec IN
    SELECT id, source_row_number, parsed_data, validation_status
    FROM public.staging_records
    WHERE batch_id = p_batch_id
      AND entity_type = 'RELATIONSHIP'
      AND validation_status IN ('VALID', 'WARNING')
    ORDER BY source_row_number ASC, id ASC
  LOOP
    v_rel_person_a_ref := NULLIF(trim(v_rec.parsed_data->>'person_a_id'), '');
    v_rel_person_b_ref := NULLIF(trim(v_rec.parsed_data->>'person_b_id'), '');
    v_rel_type_str := upper(trim(COALESCE(v_rec.parsed_data->>'relationship_type', '')));

    -- Validate relationship type
    IF v_rel_type_str = 'PARENT' THEN
      v_rel_type := 'PARENT'::public.relationship_type;
    ELSIF v_rel_type_str = 'SPOUSE' THEN
      v_rel_type := 'SPOUSE'::public.relationship_type;
    ELSIF v_rel_type_str = 'SIBLING' THEN
      v_rel_type := 'SIBLING'::public.relationship_type;
    ELSE
      RAISE EXCEPTION 'INVALID_ARGUMENT: Unsupported relationship type "%" in row % (canonical types: PARENT, SPOUSE, SIBLING).', v_rel_type_str, v_rec.source_row_number
        USING ERRCODE = '23514';
    END IF;

    -- Resolve Person A endpoint
    v_canonical_person_a := NULL;
    SELECT canonical_id INTO v_canonical_person_a
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_a_ref OR staging_id::TEXT = v_rel_person_a_ref);

    IF v_canonical_person_a IS NULL AND v_rel_person_a_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_a
      FROM public.persons
      WHERE id = v_rel_person_a_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_a IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_a_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_a_ref
        USING ERRCODE = '23503';
    END IF;

    -- Resolve Person B endpoint
    v_canonical_person_b := NULL;
    SELECT canonical_id INTO v_canonical_person_b
    FROM temp_import_id_map
    WHERE entity_type = 'PERSON'
      AND (source_record_id = v_rel_person_b_ref OR staging_id::TEXT = v_rel_person_b_ref);

    IF v_canonical_person_b IS NULL AND v_rel_person_b_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_canonical_person_b
      FROM public.persons
      WHERE id = v_rel_person_b_ref::UUID AND deleted_at IS NULL;
    END IF;

    IF v_canonical_person_b IS NULL THEN
      RAISE EXCEPTION 'UNRESOLVED_REFERENCE: Relationship row % person_b_id "%" cannot be resolved to any canonical person in this batch or database.', v_rec.source_row_number, v_rel_person_b_ref
        USING ERRCODE = '23503';
    END IF;

    -- Disallow self-reference
    IF v_canonical_person_a = v_canonical_person_b THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: Relationship in row % connects person % to themselves.', v_rec.source_row_number, v_canonical_person_a
        USING ERRCODE = '23514';
    END IF;

    -- Canonical Lexical Ordering for symmetric types (SPOUSE, SIBLING)
    IF v_rel_type IN ('SPOUSE', 'SIBLING') AND v_canonical_person_a > v_canonical_person_b THEN
      v_swap_temp := v_canonical_person_a;
      v_canonical_person_a := v_canonical_person_b;
      v_canonical_person_b := v_swap_temp;
    END IF;

    -- Insert canonical relationship
    INSERT INTO public.relationships (
      person_a_id,
      person_b_id,
      relationship_type,
      notes,
      verification_status,
      created_by,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      v_canonical_person_a,
      v_canonical_person_b,
      v_rel_type,
      NULLIF(trim(v_rec.parsed_data->>'notes'), ''),
      'UNVERIFIED'::public.verification_status,
      v_caller_id,
      NOW(),
      NOW(),
      NULL
    )
    ON CONFLICT (person_a_id, person_b_id, relationship_type) DO NOTHING
    RETURNING id INTO v_canonical_id;

    IF v_canonical_id IS NOT NULL THEN
      UPDATE public.staging_records
      SET
        canonical_id = v_canonical_id,
        updated_at = NOW()
      WHERE id = v_rec.id;

      INSERT INTO temp_import_id_map (staging_id, source_record_id, entity_type, canonical_id)
      VALUES (v_rec.id, v_rec.source_record_id, 'RELATIONSHIP', v_canonical_id);

      v_promoted_relationships := v_promoted_relationships + 1;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- STEP 5: FINALIZE IMPORT BATCH STATUS
  -- ===========================================================================
  v_total_promoted := v_promoted_persons + v_promoted_families + v_promoted_relationships;

  UPDATE public.import_batches
  SET
    status = 'PROMOTED',
    promoted_at = NOW(),
    promoted_by = v_caller_id,
    updated_at = NOW()
  WHERE id = p_batch_id;

  -- ===========================================================================
  -- STEP 6: IMMUTABLE AUDIT LOG ENTRY
  -- ===========================================================================
  PERFORM public.log_audit_event(
    p_action := 'ADMIN_ACTION'::public.audit_action,
    p_target_id := p_batch_id::TEXT,
    p_target_type := 'import_batches',
    p_metadata := jsonb_build_object(
      'operation', 'PROMOTE_IMPORT_BATCH',
      'batch_id', p_batch_id,
      'file_name', v_batch.file_name,
      'promoted_persons', v_promoted_persons,
      'promoted_families', v_promoted_families,
      'promoted_memberships', v_promoted_memberships,
      'promoted_relationships', v_promoted_relationships,
      'created_duplicate_flags', v_created_duplicate_flags,
      'total_promoted', v_total_promoted
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batchId', p_batch_id,
    'status', 'PROMOTED',
    'promotedRecords', jsonb_build_object(
      'persons', v_promoted_persons,
      'families', v_promoted_families,
      'relationships', v_promoted_relationships,
      'total', v_total_promoted
    ),
    'familyMemberships', v_promoted_memberships,
    'duplicateFlags', v_created_duplicate_flags,
    'total', v_total_promoted
  );
END;
$$;

COMMENT ON FUNCTION public.promote_import_batch(UUID) IS
  'Authoritative RPC for atomic promotion of validated staging records into canonical census tables with full lineage, membership linkage, duplicate flags, and audit trail.';
