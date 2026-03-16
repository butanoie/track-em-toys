\restrict dbmate

-- Dumped from database version 17.8 (Homebrew)
-- Dumped by pg_dump version 17.8 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_id() RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::UUID;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type character varying(50) NOT NULL,
    ip_address inet,
    user_agent character varying(512),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['signin'::character varying, 'refresh'::character varying, 'logout'::character varying, 'link_account'::character varying, 'provider_auto_linked'::character varying, 'token_reuse_detected'::character varying, 'account_deactivated'::character varying, 'consent_revoked'::character varying])::text[])))
);


--
-- Name: COLUMN auth_events.event_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_events.event_type IS 'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated | consent_revoked';


--
-- Name: catalog_edits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid,
    editor_id uuid NOT NULL,
    edit_type text NOT NULL,
    data_before jsonb,
    data_after jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_edits_edit_type_check CHECK ((edit_type = ANY (ARRAY['create'::text, 'update'::text, 'merge'::text, 'delete'::text]))),
    CONSTRAINT catalog_edits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'auto_approved'::text])))
);


--
-- Name: character_appearances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_appearances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    character_id uuid NOT NULL,
    description text,
    source_media text,
    source_name text,
    year_start integer,
    year_end integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE character_appearances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.character_appearances IS 'A character''s visual depiction in a specific media source. E.g., G1 cartoon Optimus Prime vs IDW comic Optimus Prime. Items optionally link to an appearance to specify which design the toy represents.';


--
-- Name: COLUMN character_appearances.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.character_appearances.slug IS 'URL-safe kebab-case key, globally unique (e.g., optimus-prime-g1-cartoon, megatron-idw-phase-1).';


--
-- Name: COLUMN character_appearances.source_media; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.character_appearances.source_media IS 'Media type. Values: TV, Comic, Movie, OVA, Toy-only, Video Game, Manga.';


--
-- Name: COLUMN character_appearances.source_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.character_appearances.source_name IS 'Specific media title (e.g., The Transformers Season 1, Marvel US Comics, Bumblebee Movie).';


--
-- Name: character_sub_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_sub_groups (
    character_id uuid NOT NULL,
    sub_group_id uuid NOT NULL
);


--
-- Name: TABLE character_sub_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.character_sub_groups IS 'Many-to-many junction: characters can belong to multiple sub-groups. E.g., Apeface → Headmasters + Horrorcons; Springer → Triple Changers.';


--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    franchise text DEFAULT 'Transformers'::text NOT NULL,
    faction_id uuid,
    character_type text,
    alt_mode text,
    is_combined_form boolean DEFAULT false NOT NULL,
    combined_form_id uuid,
    combiner_role text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    continuity_family_id uuid NOT NULL
);


--
-- Name: TABLE characters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.characters IS 'Franchise characters (Optimus Prime, Snake Eyes, Spike Witwicky, etc.). Includes Transformers, humans, and other species.';


--
-- Name: COLUMN characters.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.slug IS 'URL-safe kebab-case key (e.g., optimus-prime, spike-witwicky, devastator). Unique across all franchises.';


--
-- Name: COLUMN characters.character_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.character_type IS 'Species or gimmick-type classification. Not an enum to allow future expansion. Species types: Transformer, Human, Nebulan, Quintesson, Sharkticon, Junkion, Alien. Gimmick types: Pretender, Godmaster, Powermaster, Targetmaster, Headmaster, Headmaster Junior, Brainmaster, Powered Master, Classic Pretender, Micromaster, Drone. Other: Energy being, Other Robotic, Other Alien.';


--
-- Name: COLUMN characters.combined_form_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.combined_form_id IS 'Self-referential FK: if this character is a combiner component, references the combined form character entry.';


--
-- Name: COLUMN characters.combiner_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.combiner_role IS 'Role in combination. Standard: torso, right arm, left arm, right leg, left leg. Extended (JP combiners): upper torso, lower torso, upper body, lower body, torso (right half), torso (left half), main body, wings/booster, weapon, back-mounted weapon. NULL if not a combiner component.';


--
-- Name: COLUMN characters.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.metadata IS 'Extensible JSONB for japanese_name, first_appearance, first_appearance_season, aliases, series_year, notes, etc.';


--
-- Name: COLUMN characters.continuity_family_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.continuity_family_id IS 'FK → continuity_families. The character identity boundary — same name in different families = different character (e.g., G1 Megatron vs Beast Wars Megatron). Replaces the free-text series and continuity columns from migration 012.';


--
-- Name: continuity_families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.continuity_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    franchise text,
    sort_order integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE continuity_families; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.continuity_families IS 'Continuity family groupings (Generation 1, Beast Era, Unicron Trilogy, etc.). The identity boundary for characters — same name in different families = different character. Reference table — no updated_at.';


--
-- Name: COLUMN continuity_families.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.continuity_families.slug IS 'URL-safe kebab-case key (e.g., g1, beast-era, movieverse).';


--
-- Name: COLUMN continuity_families.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.continuity_families.sort_order IS 'Optional display sort order. Lower values appear first.';


--
-- Name: factions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    franchise text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE factions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.factions IS 'Canonical factions/allegiances (Autobot, Decepticon, etc.). Normalized to avoid enum migration overhead.';


--
-- Name: COLUMN factions.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factions.slug IS 'URL-safe kebab-case key (e.g., autobot, decepticon, quintesson)';


--
-- Name: item_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    url text NOT NULL,
    caption text,
    uploaded_by uuid,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    manufacturer_id uuid,
    character_id uuid NOT NULL,
    toy_line_id uuid NOT NULL,
    year_released integer,
    description text,
    barcode text,
    sku text,
    product_code text,
    is_third_party boolean DEFAULT false NOT NULL,
    created_by uuid,
    data_quality text DEFAULT 'needs_review'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    character_appearance_id uuid,
    size_class text,
    CONSTRAINT items_data_quality_check CHECK ((data_quality = ANY (ARRAY['needs_review'::text, 'verified'::text, 'community_verified'::text])))
);


--
-- Name: COLUMN items.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.slug IS 'URL-safe kebab-case key (e.g., ft-44-thomas, mp-44-optimus-prime). Unique across all items.';


--
-- Name: COLUMN items.product_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.product_code IS 'Manufacturer product designation (e.g., MP-44, FT-44, CS-01)';


--
-- Name: COLUMN items.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.metadata IS 'Extensible JSONB: scale, variant_type, base_product_code, sub_brand, status, etc.';


--
-- Name: COLUMN items.character_appearance_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.character_appearance_id IS 'Optional FK → character_appearances. Links an item to a specific visual depiction of a character (e.g., G1 cartoon Optimus vs Movie Optimus). NULL = generic depiction.';


--
-- Name: COLUMN items.size_class; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.items.size_class IS 'Toy size class (e.g., Core, Deluxe, Voyager, Leader, Commander, Titan). Nullable — third-party figures may use non-standard or unknown sizing.';


--
-- Name: manufacturers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_official_licensee boolean DEFAULT false NOT NULL,
    country text,
    website_url character varying(500),
    aliases text[] DEFAULT '{}'::text[],
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN manufacturers.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.manufacturers.slug IS 'URL-safe kebab-case key (e.g., fanstoys, hasbro, takara-tomy)';


--
-- Name: oauth_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    provider_user_id character varying(255) NOT NULL,
    email character varying(255),
    is_private_email boolean DEFAULT false NOT NULL,
    raw_profile jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_oauth_accounts_provider CHECK (((provider)::text = ANY ((ARRAY['apple'::character varying, 'google'::character varying])::text[])))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    device_info character varying(255),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_type text DEFAULT 'web'::text NOT NULL,
    CONSTRAINT refresh_tokens_client_type_check CHECK ((client_type = ANY (ARRAY['native'::text, 'web'::text])))
);


--
-- Name: COLUMN refresh_tokens.client_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refresh_tokens.client_type IS 'Identifies the client platform that created this token. Derived from the
   verified provider id_token audience claim (bundleId/iosClientId = native,
   servicesId/webClientId = web). Used to determine refresh token delivery
   (body for native, httpOnly cookie for web). Cannot be spoofed by the client.';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: sub_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    faction_id uuid,
    franchise text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sub_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sub_groups IS 'Named sub-teams within factions (Dinobots, Constructicons, Aerialbots, etc.)';


--
-- Name: COLUMN sub_groups.faction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sub_groups.faction_id IS 'Optional FK to factions. NULL for cross-faction or franchise-neutral groups.';


--
-- Name: toy_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toy_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    franchise text,
    manufacturer_id uuid NOT NULL,
    scale character varying(50),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255),
    email_verified boolean DEFAULT false NOT NULL,
    display_name character varying(255),
    avatar_url text,
    deactivated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: COLUMN users.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.deleted_at IS 'GDPR tombstone. When set, PII columns (email, display_name, avatar_url) have been scrubbed. The row is preserved so foreign keys from items, catalog_edits, item_photos remain intact. App displays "Deleted user" when deleted_at IS NOT NULL.';


--
-- Name: auth_events auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_pkey PRIMARY KEY (id);


--
-- Name: catalog_edits catalog_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_edits
    ADD CONSTRAINT catalog_edits_pkey PRIMARY KEY (id);


--
-- Name: character_appearances character_appearances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_appearances
    ADD CONSTRAINT character_appearances_pkey PRIMARY KEY (id);


--
-- Name: character_appearances character_appearances_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_appearances
    ADD CONSTRAINT character_appearances_slug_key UNIQUE (slug);


--
-- Name: character_sub_groups character_sub_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_sub_groups
    ADD CONSTRAINT character_sub_groups_pkey PRIMARY KEY (character_id, sub_group_id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: characters characters_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_slug_key UNIQUE (slug);


--
-- Name: continuity_families continuity_families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_families
    ADD CONSTRAINT continuity_families_pkey PRIMARY KEY (id);


--
-- Name: continuity_families continuity_families_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_families
    ADD CONSTRAINT continuity_families_slug_key UNIQUE (slug);


--
-- Name: factions factions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factions
    ADD CONSTRAINT factions_name_key UNIQUE (name);


--
-- Name: factions factions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factions
    ADD CONSTRAINT factions_pkey PRIMARY KEY (id);


--
-- Name: factions factions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factions
    ADD CONSTRAINT factions_slug_key UNIQUE (slug);


--
-- Name: item_photos item_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: items items_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_slug_key UNIQUE (slug);


--
-- Name: manufacturers manufacturers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_name_key UNIQUE (name);


--
-- Name: manufacturers manufacturers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_pkey PRIMARY KEY (id);


--
-- Name: manufacturers manufacturers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_slug_key UNIQUE (slug);


--
-- Name: oauth_accounts oauth_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT oauth_accounts_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sub_groups sub_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_groups
    ADD CONSTRAINT sub_groups_pkey PRIMARY KEY (id);


--
-- Name: sub_groups sub_groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_groups
    ADD CONSTRAINT sub_groups_slug_key UNIQUE (slug);


--
-- Name: toy_lines toy_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_pkey PRIMARY KEY (id);


--
-- Name: toy_lines toy_lines_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_slug_key UNIQUE (slug);


--
-- Name: oauth_accounts uq_oauth_provider_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_auth_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_created_at ON public.auth_events USING btree (created_at);


--
-- Name: idx_auth_events_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_type_created ON public.auth_events USING btree (event_type, created_at);


--
-- Name: idx_auth_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_events_user_id ON public.auth_events USING btree (user_id);


--
-- Name: idx_catalog_edits_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_edits_item ON public.catalog_edits USING btree (item_id);


--
-- Name: idx_catalog_edits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_edits_status ON public.catalog_edits USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_character_appearances_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_appearances_character ON public.character_appearances USING btree (character_id);


--
-- Name: idx_character_sub_groups_sub_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_sub_groups_sub_group ON public.character_sub_groups USING btree (sub_group_id);


--
-- Name: idx_characters_combined_form; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_combined_form ON public.characters USING btree (combined_form_id) WHERE (combined_form_id IS NOT NULL);


--
-- Name: idx_characters_continuity_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_continuity_family ON public.characters USING btree (continuity_family_id);


--
-- Name: idx_characters_faction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_faction ON public.characters USING btree (faction_id);


--
-- Name: idx_characters_name_franchise_cf; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_characters_name_franchise_cf ON public.characters USING btree (lower(name), lower(franchise), continuity_family_id);


--
-- Name: idx_characters_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_type ON public.characters USING btree (character_type);


--
-- Name: idx_item_photos_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_photos_item ON public.item_photos USING btree (item_id);


--
-- Name: idx_item_photos_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_item_photos_one_primary ON public.item_photos USING btree (item_id) WHERE (is_primary = true);


--
-- Name: idx_items_character; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_character ON public.items USING btree (character_id);


--
-- Name: idx_items_character_appearance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_character_appearance ON public.items USING btree (character_appearance_id) WHERE (character_appearance_id IS NOT NULL);


--
-- Name: idx_items_data_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_data_quality ON public.items USING btree (data_quality);


--
-- Name: idx_items_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_manufacturer ON public.items USING btree (manufacturer_id);


--
-- Name: idx_items_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_product_code ON public.items USING btree (product_code) WHERE (product_code IS NOT NULL);


--
-- Name: idx_items_size_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_size_class ON public.items USING btree (size_class) WHERE (size_class IS NOT NULL);


--
-- Name: idx_items_toy_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_toy_line ON public.items USING btree (toy_line_id);


--
-- Name: idx_oauth_accounts_provider_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_accounts_provider_email ON public.oauth_accounts USING btree (provider, lower((email)::text));


--
-- Name: idx_oauth_accounts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_accounts_user_id ON public.oauth_accounts USING btree (user_id);


--
-- Name: idx_refresh_tokens_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active ON public.refresh_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_active ON public.refresh_tokens USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_sub_groups_name_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sub_groups_name_franchise ON public.sub_groups USING btree (lower(name), COALESCE(franchise, ''::text));


--
-- Name: idx_toy_lines_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_toy_lines_manufacturer ON public.toy_lines USING btree (manufacturer_id);


--
-- Name: idx_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_email_lower ON public.users USING btree (lower((email)::text));


--
-- Name: character_appearances character_appearances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER character_appearances_updated_at BEFORE UPDATE ON public.character_appearances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: characters characters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER characters_updated_at BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: items items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: manufacturers manufacturers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER manufacturers_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: toy_lines toy_lines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER toy_lines_updated_at BEFORE UPDATE ON public.toy_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: auth_events auth_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_events
    ADD CONSTRAINT auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: catalog_edits catalog_edits_editor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_edits
    ADD CONSTRAINT catalog_edits_editor_id_fkey FOREIGN KEY (editor_id) REFERENCES public.users(id);


--
-- Name: catalog_edits catalog_edits_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_edits
    ADD CONSTRAINT catalog_edits_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: catalog_edits catalog_edits_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_edits
    ADD CONSTRAINT catalog_edits_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: character_appearances character_appearances_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_appearances
    ADD CONSTRAINT character_appearances_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_sub_groups character_sub_groups_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_sub_groups
    ADD CONSTRAINT character_sub_groups_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_sub_groups character_sub_groups_sub_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_sub_groups
    ADD CONSTRAINT character_sub_groups_sub_group_id_fkey FOREIGN KEY (sub_group_id) REFERENCES public.sub_groups(id) ON DELETE CASCADE;


--
-- Name: characters characters_combined_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_combined_form_id_fkey FOREIGN KEY (combined_form_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: characters characters_continuity_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_continuity_family_id_fkey FOREIGN KEY (continuity_family_id) REFERENCES public.continuity_families(id) ON DELETE RESTRICT;


--
-- Name: characters characters_faction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_faction_id_fkey FOREIGN KEY (faction_id) REFERENCES public.factions(id) ON DELETE SET NULL;


--
-- Name: item_photos item_photos_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_photos item_photos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: items items_character_appearance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_character_appearance_id_fkey FOREIGN KEY (character_appearance_id) REFERENCES public.character_appearances(id) ON DELETE SET NULL;


--
-- Name: items items_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE RESTRICT;


--
-- Name: items items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: items items_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id);


--
-- Name: items items_toy_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_toy_line_id_fkey FOREIGN KEY (toy_line_id) REFERENCES public.toy_lines(id) ON DELETE RESTRICT;


--
-- Name: oauth_accounts oauth_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_accounts
    ADD CONSTRAINT oauth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sub_groups sub_groups_faction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_groups
    ADD CONSTRAINT sub_groups_faction_id_fkey FOREIGN KEY (faction_id) REFERENCES public.factions(id) ON DELETE SET NULL;


--
-- Name: toy_lines toy_lines_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('001'),
    ('002'),
    ('003'),
    ('004'),
    ('005'),
    ('006'),
    ('007'),
    ('008'),
    ('009'),
    ('010'),
    ('011'),
    ('012'),
    ('013');
