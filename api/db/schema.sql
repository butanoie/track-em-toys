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
-- Name: item_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.item_condition AS ENUM (
    'mint_sealed',
    'opened_complete',
    'opened_incomplete',
    'loose_complete',
    'loose_incomplete',
    'damaged',
    'unknown'
);


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
-- Name: items_default_franchise_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.items_default_franchise_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.franchise_id IS NULL OR
       (TG_OP = 'UPDATE' AND NEW.toy_line_id IS DISTINCT FROM OLD.toy_line_id) THEN
        SELECT franchise_id INTO NEW.franchise_id
          FROM public.toy_lines
         WHERE id = NEW.toy_line_id;
    END IF;
    RETURN NEW;
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
    CONSTRAINT auth_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['signin'::character varying, 'refresh'::character varying, 'logout'::character varying, 'link_account'::character varying, 'provider_auto_linked'::character varying, 'token_reuse_detected'::character varying, 'account_deactivated'::character varying, 'consent_revoked'::character varying, 'role_changed'::character varying, 'account_reactivated'::character varying, 'user_purged'::character varying])::text[])))
);


--
-- Name: COLUMN auth_events.event_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_events.event_type IS 'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated | consent_revoked | role_changed | account_reactivated | user_purged';


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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_appearances_source_media_check CHECK ((source_media = ANY (ARRAY['TV'::text, 'Comic/Manga'::text, 'Movie'::text, 'OVA'::text, 'Toy-only'::text, 'Video Game'::text])))
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

COMMENT ON COLUMN public.character_appearances.source_media IS 'Media type. Constrained to: TV, Comic/Manga, Movie, OVA, Toy-only, Video Game.';


--
-- Name: COLUMN character_appearances.source_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.character_appearances.source_name IS 'Specific media title (e.g., The Transformers Season 1, Marvel US Comics, Bumblebee Movie).';


--
-- Name: character_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    subtype text,
    entity1_id uuid NOT NULL,
    entity1_role text,
    entity2_id uuid NOT NULL,
    entity2_role text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_relationships_no_self CHECK ((entity1_id <> entity2_id))
);


--
-- Name: TABLE character_relationships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.character_relationships IS 'Character-to-character relationships: combiners, partner bonds, vehicle-crew, rivals, siblings, mentor-student, evolution. Replaces the legacy combined_form_id self-FK.';


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
    faction_id uuid,
    character_type text,
    alt_mode text,
    is_combined_form boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    continuity_family_id uuid NOT NULL,
    franchise_id uuid NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((((name || ' '::text) || COALESCE(alt_mode, ''::text)) || ' '::text) || COALESCE(character_type, ''::text)))) STORED
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
-- Name: COLUMN characters.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.metadata IS 'Extensible JSONB for japanese_name, first_appearance, first_appearance_season, aliases, series_year, notes, etc.';


--
-- Name: COLUMN characters.continuity_family_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.characters.continuity_family_id IS 'FK → continuity_families. The character identity boundary — same name in different families = different character (e.g., G1 Megatron vs Beast Wars Megatron). Replaces the free-text series and continuity columns from migration 012.';


--
-- Name: collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    condition public.item_condition DEFAULT 'unknown'::public.item_condition NOT NULL,
    notes text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.collection_items FORCE ROW LEVEL SECURITY;


--
-- Name: continuity_families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.continuity_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    franchise_id uuid NOT NULL
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
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    franchise_id uuid NOT NULL
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
-- Name: franchises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franchises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE franchises; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.franchises IS 'Top-level franchise groupings (Transformers, G.I. Joe, etc.). The primary domain boundary for the catalog.';


--
-- Name: COLUMN franchises.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.franchises.slug IS 'URL-safe kebab-case key (e.g., transformers, gi-joe, star-wars).';


--
-- Name: COLUMN franchises.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.franchises.sort_order IS 'Optional display sort order. Lower values appear first.';


--
-- Name: item_character_depictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_character_depictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    appearance_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE item_character_depictions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.item_character_depictions IS 'Junction: which character appearances an item depicts. Supports multi-character items (gift sets, 2-packs). Character is derived via appearance → character FK.';


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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'approved'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dhash text DEFAULT ''::text NOT NULL,
    CONSTRAINT item_photos_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: item_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    subtype text,
    item1_id uuid NOT NULL,
    item1_role text,
    item2_id uuid NOT NULL,
    item2_role text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_relationships_no_self CHECK ((item1_id <> item2_id)),
    CONSTRAINT item_relationships_type_check CHECK ((type = ANY (ARRAY['mold-origin'::text, 'gift-set-contents'::text, 'variant'::text])))
);


--
-- Name: TABLE item_relationships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.item_relationships IS 'Item-to-item relationships: mold origins (repaint/retool), gift set contents, variants (chase/exclusive). Schema-only — no seed data yet.';


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    manufacturer_id uuid,
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
    size_class text,
    franchise_id uuid NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((((((name || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || COALESCE(product_code, ''::text)) || ' '::text) || COALESCE(sku, ''::text)))) STORED,
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
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    franchise_id uuid NOT NULL
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
    manufacturer_id uuid NOT NULL,
    scale character varying(50),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    franchise_id uuid NOT NULL
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
    deleted_at timestamp with time zone,
    role text DEFAULT 'user'::text NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'curator'::text, 'admin'::text])))
);


--
-- Name: COLUMN users.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.deleted_at IS 'GDPR tombstone. When set, PII columns (email, display_name, avatar_url) have been scrubbed. The row is preserved so foreign keys from items, catalog_edits, item_photos remain intact. App displays "Deleted user" when deleted_at IS NOT NULL.';


--
-- Name: COLUMN users.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.role IS 'Authorization role: user | curator | admin. Included in JWT claims.';


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
-- Name: character_relationships character_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_pkey PRIMARY KEY (id);


--
-- Name: character_relationships character_relationships_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_unique UNIQUE (type, entity1_id, entity2_id);


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
-- Name: collection_items collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_pkey PRIMARY KEY (id);


--
-- Name: continuity_families continuity_families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_families
    ADD CONSTRAINT continuity_families_pkey PRIMARY KEY (id);


--
-- Name: factions factions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factions
    ADD CONSTRAINT factions_pkey PRIMARY KEY (id);


--
-- Name: franchises franchises_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchises
    ADD CONSTRAINT franchises_name_key UNIQUE (name);


--
-- Name: franchises franchises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchises
    ADD CONSTRAINT franchises_pkey PRIMARY KEY (id);


--
-- Name: franchises franchises_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchises
    ADD CONSTRAINT franchises_slug_key UNIQUE (slug);


--
-- Name: item_character_depictions item_character_depictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_character_depictions
    ADD CONSTRAINT item_character_depictions_pkey PRIMARY KEY (id);


--
-- Name: item_character_depictions item_character_depictions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_character_depictions
    ADD CONSTRAINT item_character_depictions_unique UNIQUE (item_id, appearance_id);


--
-- Name: item_photos item_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_photos
    ADD CONSTRAINT item_photos_pkey PRIMARY KEY (id);


--
-- Name: item_relationships item_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_relationships
    ADD CONSTRAINT item_relationships_pkey PRIMARY KEY (id);


--
-- Name: item_relationships item_relationships_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_relationships
    ADD CONSTRAINT item_relationships_unique UNIQUE (type, item1_id, item2_id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


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
-- Name: toy_lines toy_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_pkey PRIMARY KEY (id);


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
-- Name: idx_character_appearances_slug_character; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_character_appearances_slug_character ON public.character_appearances USING btree (slug, character_id);


--
-- Name: idx_character_relationships_entity1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_relationships_entity1 ON public.character_relationships USING btree (entity1_id);


--
-- Name: idx_character_relationships_entity2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_relationships_entity2 ON public.character_relationships USING btree (entity2_id);


--
-- Name: idx_character_relationships_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_relationships_type ON public.character_relationships USING btree (type);


--
-- Name: idx_character_sub_groups_sub_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_character_sub_groups_sub_group ON public.character_sub_groups USING btree (sub_group_id);


--
-- Name: idx_characters_continuity_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_continuity_family ON public.characters USING btree (continuity_family_id);


--
-- Name: idx_characters_faction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_faction ON public.characters USING btree (faction_id);


--
-- Name: idx_characters_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_franchise ON public.characters USING btree (franchise_id);


--
-- Name: idx_characters_franchise_name_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_franchise_name_id ON public.characters USING btree (franchise_id, name, id);


--
-- Name: idx_characters_name_franchise_cf; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_characters_name_franchise_cf ON public.characters USING btree (lower(name), franchise_id, continuity_family_id);


--
-- Name: idx_characters_name_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_name_id ON public.characters USING btree (name, id);


--
-- Name: idx_characters_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_search ON public.characters USING gin (search_vector);


--
-- Name: idx_characters_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_characters_slug_franchise ON public.characters USING btree (slug, franchise_id);


--
-- Name: idx_characters_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_characters_type ON public.characters USING btree (character_type);


--
-- Name: idx_collection_items_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_items_user_active ON public.collection_items USING btree (user_id, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_collection_items_user_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_items_user_item ON public.collection_items USING btree (user_id, item_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_continuity_families_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_continuity_families_franchise ON public.continuity_families USING btree (franchise_id);


--
-- Name: idx_continuity_families_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_continuity_families_slug_franchise ON public.continuity_families USING btree (slug, franchise_id);


--
-- Name: idx_factions_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factions_franchise ON public.factions USING btree (franchise_id);


--
-- Name: idx_factions_name_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_factions_name_franchise ON public.factions USING btree (lower(name), franchise_id);


--
-- Name: idx_factions_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_factions_slug_franchise ON public.factions USING btree (slug, franchise_id);


--
-- Name: idx_item_character_depictions_appearance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_character_depictions_appearance ON public.item_character_depictions USING btree (appearance_id);


--
-- Name: idx_item_character_depictions_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_character_depictions_item ON public.item_character_depictions USING btree (item_id);


--
-- Name: idx_item_character_depictions_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_item_character_depictions_one_primary ON public.item_character_depictions USING btree (item_id) WHERE (is_primary = true);


--
-- Name: idx_item_photos_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_photos_item ON public.item_photos USING btree (item_id);


--
-- Name: idx_item_photos_item_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_photos_item_sort ON public.item_photos USING btree (item_id, sort_order);


--
-- Name: idx_item_photos_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_item_photos_one_primary ON public.item_photos USING btree (item_id) WHERE (is_primary = true);


--
-- Name: idx_item_relationships_item1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_relationships_item1 ON public.item_relationships USING btree (item1_id);


--
-- Name: idx_item_relationships_item2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_relationships_item2 ON public.item_relationships USING btree (item2_id);


--
-- Name: idx_items_data_quality; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_data_quality ON public.items USING btree (data_quality);


--
-- Name: idx_items_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_franchise ON public.items USING btree (franchise_id);


--
-- Name: idx_items_franchise_name_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_franchise_name_id ON public.items USING btree (franchise_id, name, id);


--
-- Name: idx_items_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_manufacturer ON public.items USING btree (manufacturer_id);


--
-- Name: idx_items_manufacturer_name_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_manufacturer_name_id ON public.items USING btree (manufacturer_id, name, id);


--
-- Name: idx_items_name_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_name_id ON public.items USING btree (name, id);


--
-- Name: idx_items_product_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_product_code ON public.items USING btree (product_code) WHERE (product_code IS NOT NULL);


--
-- Name: idx_items_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_search ON public.items USING gin (search_vector);


--
-- Name: idx_items_size_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_size_class ON public.items USING btree (size_class) WHERE (size_class IS NOT NULL);


--
-- Name: idx_items_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_items_slug_franchise ON public.items USING btree (slug, franchise_id);


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
-- Name: idx_sub_groups_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sub_groups_franchise ON public.sub_groups USING btree (franchise_id);


--
-- Name: idx_sub_groups_name_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sub_groups_name_franchise ON public.sub_groups USING btree (lower(name), franchise_id);


--
-- Name: idx_sub_groups_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sub_groups_slug_franchise ON public.sub_groups USING btree (slug, franchise_id);


--
-- Name: idx_toy_lines_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_toy_lines_franchise ON public.toy_lines USING btree (franchise_id);


--
-- Name: idx_toy_lines_manufacturer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_toy_lines_manufacturer ON public.toy_lines USING btree (manufacturer_id);


--
-- Name: idx_toy_lines_slug_franchise; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_toy_lines_slug_franchise ON public.toy_lines USING btree (slug, franchise_id);


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
-- Name: collection_items collection_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER collection_items_updated_at BEFORE UPDATE ON public.collection_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: item_photos item_photos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_photos_updated_at BEFORE UPDATE ON public.item_photos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: items items_default_franchise; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_default_franchise BEFORE INSERT OR UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.items_default_franchise_id();


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
    ADD CONSTRAINT auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


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
-- Name: character_relationships character_relationships_entity1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_entity1_id_fkey FOREIGN KEY (entity1_id) REFERENCES public.characters(id) ON DELETE RESTRICT;


--
-- Name: character_relationships character_relationships_entity2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_relationships
    ADD CONSTRAINT character_relationships_entity2_id_fkey FOREIGN KEY (entity2_id) REFERENCES public.characters(id) ON DELETE RESTRICT;


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
-- Name: characters characters_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


--
-- Name: collection_items collection_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: collection_items collection_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: continuity_families continuity_families_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuity_families
    ADD CONSTRAINT continuity_families_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


--
-- Name: factions factions_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factions
    ADD CONSTRAINT factions_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


--
-- Name: item_character_depictions item_character_depictions_appearance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_character_depictions
    ADD CONSTRAINT item_character_depictions_appearance_id_fkey FOREIGN KEY (appearance_id) REFERENCES public.character_appearances(id) ON DELETE RESTRICT;


--
-- Name: item_character_depictions item_character_depictions_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_character_depictions
    ADD CONSTRAINT item_character_depictions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


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
-- Name: item_relationships item_relationships_item1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_relationships
    ADD CONSTRAINT item_relationships_item1_id_fkey FOREIGN KEY (item1_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: item_relationships item_relationships_item2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_relationships
    ADD CONSTRAINT item_relationships_item2_id_fkey FOREIGN KEY (item2_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: items items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: items items_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


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
    ADD CONSTRAINT oauth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sub_groups sub_groups_faction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_groups
    ADD CONSTRAINT sub_groups_faction_id_fkey FOREIGN KEY (faction_id) REFERENCES public.factions(id) ON DELETE SET NULL;


--
-- Name: sub_groups sub_groups_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_groups
    ADD CONSTRAINT sub_groups_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


--
-- Name: toy_lines toy_lines_franchise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_franchise_id_fkey FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;


--
-- Name: toy_lines toy_lines_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toy_lines
    ADD CONSTRAINT toy_lines_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON DELETE RESTRICT;


--
-- Name: collection_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_items collection_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_items_delete ON public.collection_items FOR DELETE USING ((user_id = ( SELECT public.current_app_user_id() AS current_app_user_id)));


--
-- Name: collection_items collection_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_items_insert ON public.collection_items FOR INSERT WITH CHECK ((user_id = ( SELECT public.current_app_user_id() AS current_app_user_id)));


--
-- Name: collection_items collection_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_items_select ON public.collection_items FOR SELECT USING ((user_id = ( SELECT public.current_app_user_id() AS current_app_user_id)));


--
-- Name: collection_items collection_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY collection_items_update ON public.collection_items FOR UPDATE USING ((user_id = ( SELECT public.current_app_user_id() AS current_app_user_id))) WITH CHECK ((user_id = ( SELECT public.current_app_user_id() AS current_app_user_id)));


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
    ('013'),
    ('014'),
    ('015'),
    ('016'),
    ('017'),
    ('018'),
    ('019'),
    ('020'),
    ('021'),
    ('022'),
    ('023'),
    ('024'),
    ('025'),
    ('026'),
    ('027'),
    ('028'),
    ('029'),
    ('030');
