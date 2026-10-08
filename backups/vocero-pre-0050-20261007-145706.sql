--
-- PostgreSQL database dump
--

\restrict eyfsENtLLcqVGmX5chabch7yf3IxqcYycZpoDpjizBqEcPaqQgRgVIVPQL4siDS

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: postgres
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: postgres
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO postgres;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: postgres
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: account; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.account OWNER TO postgres;

--
-- Name: account_link; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_link (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    kind text NOT NULL,
    contact_id text,
    teacher_id text,
    suspended_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    invitation_email_sent_at timestamp without time zone,
    invitation_email_sent_by text,
    CONSTRAINT account_link_kind_coherente CHECK ((((kind = 'alumno'::text) AND (contact_id IS NOT NULL) AND (teacher_id IS NULL)) OR ((kind = 'profesor'::text) AND (teacher_id IS NOT NULL) AND (contact_id IS NULL))))
);


ALTER TABLE public.account_link OWNER TO postgres;

--
-- Name: agent_profile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_profile (
    id text NOT NULL,
    organization_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    name text DEFAULT 'Asistente'::text NOT NULL,
    tone text,
    instructions text,
    escalation_rules text,
    greeting text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_profile OWNER TO postgres;

--
-- Name: agent_test_case; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_test_case (
    id text NOT NULL,
    organization_id text NOT NULL,
    run_id text NOT NULL,
    persona text NOT NULL,
    conversation_id text,
    transcript jsonb,
    veredicto text,
    hallazgos jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_test_case OWNER TO postgres;

--
-- Name: agent_test_run; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_test_run (
    id text NOT NULL,
    organization_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    score integer,
    error text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone
);


ALTER TABLE public.agent_test_run OWNER TO postgres;

--
-- Name: announcement; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement (
    id text NOT NULL,
    organization_id text NOT NULL,
    cohort_id text NOT NULL,
    author_user_id text,
    title text NOT NULL,
    body text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcement OWNER TO postgres;

--
-- Name: assessment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assessment (
    id text NOT NULL,
    organization_id text NOT NULL,
    cohort_id text NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    due_at timestamp without time zone
);


ALTER TABLE public.assessment OWNER TO postgres;

--
-- Name: assessment_extension; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assessment_extension (
    id text NOT NULL,
    organization_id text NOT NULL,
    assessment_id text NOT NULL,
    enrollment_id text NOT NULL,
    due_at timestamp without time zone NOT NULL,
    reason text NOT NULL,
    granted_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assessment_extension OWNER TO postgres;

--
-- Name: assessment_result; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assessment_result (
    id text NOT NULL,
    organization_id text NOT NULL,
    assessment_id text NOT NULL,
    enrollment_id text NOT NULL,
    passed boolean,
    notes text,
    recorded_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assessment_result OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id text NOT NULL,
    organization_id text NOT NULL,
    class_session_id text NOT NULL,
    enrollment_id text NOT NULL,
    status text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    recorded_by text
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: automation_rule; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_rule (
    id text NOT NULL,
    organization_id text NOT NULL,
    trigger_event text NOT NULL,
    channel text NOT NULL,
    template_id text,
    template_body text,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_rule OWNER TO postgres;

--
-- Name: bulk_send_recipient; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bulk_send_recipient (
    id text NOT NULL,
    organization_id text NOT NULL,
    run_id text NOT NULL,
    enrollment_id text NOT NULL,
    "position" integer NOT NULL,
    outcome text DEFAULT 'pending'::text NOT NULL,
    message text,
    processed_at timestamp without time zone
);


ALTER TABLE public.bulk_send_recipient OWNER TO postgres;

--
-- Name: bulk_send_run; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bulk_send_run (
    id text NOT NULL,
    organization_id text NOT NULL,
    cohort_id text NOT NULL,
    kind text NOT NULL,
    started_by text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    finished_at timestamp without time zone
);


ALTER TABLE public.bulk_send_run OWNER TO postgres;

--
-- Name: certificate; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.certificate (
    id text NOT NULL,
    organization_id text NOT NULL,
    enrollment_id text NOT NULL,
    code text NOT NULL,
    issued_at timestamp without time zone DEFAULT now() NOT NULL,
    issued_by text,
    attendance_pct integer,
    historical boolean DEFAULT false NOT NULL,
    revoked_at timestamp without time zone,
    revoked_by text,
    revoke_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.certificate OWNER TO postgres;

--
-- Name: class_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_session (
    id text NOT NULL,
    organization_id text NOT NULL,
    cohort_id text NOT NULL,
    number integer NOT NULL,
    date timestamp without time zone NOT NULL,
    start_time text,
    end_time text,
    hours integer,
    teacher_id text,
    topic text,
    canceled_at timestamp without time zone,
    cancel_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    meeting_url text,
    recording_url text,
    virtual_room_id text
);


ALTER TABLE public.class_session OWNER TO postgres;

--
-- Name: cohort; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cohort (
    id text NOT NULL,
    organization_id text NOT NULL,
    course_id text NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone,
    capacity integer,
    whatsapp_group_link text,
    status text DEFAULT 'planificada'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    teacher_id text,
    cost integer,
    frequency text,
    classroom text,
    name text,
    start_time text,
    end_time text,
    days_of_week text,
    currency text DEFAULT 'UYU'::text NOT NULL,
    min_attendance_pct integer,
    meeting_url text,
    virtual_room_id text,
    parent_cohort_id text,
    "position" integer,
    is_specialization boolean DEFAULT false NOT NULL,
    CONSTRAINT cohort_padre_distinto_de_si CHECK (((parent_cohort_id IS NULL) OR (parent_cohort_id <> id)))
);


ALTER TABLE public.cohort OWNER TO postgres;

--
-- Name: cohort_software; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cohort_software (
    cohort_id text NOT NULL,
    software_id text NOT NULL,
    organization_id text NOT NULL
);


ALTER TABLE public.cohort_software OWNER TO postgres;

--
-- Name: company; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.company (
    id text NOT NULL,
    organization_id text NOT NULL,
    legal_name text NOT NULL,
    tax_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.company OWNER TO postgres;

--
-- Name: contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact (
    id text NOT NULL,
    organization_id text NOT NULL,
    phone text,
    notes text,
    archived_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    wa_identity text NOT NULL,
    wa_user_id text,
    source text,
    utm_campaign text,
    email text,
    national_id text,
    first_name text NOT NULL,
    last_name text
);


ALTER TABLE public.contact OWNER TO postgres;

--
-- Name: conversation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversation (
    id text NOT NULL,
    organization_id text NOT NULL,
    contact_id text NOT NULL,
    is_test boolean DEFAULT false NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL,
    handoff_at timestamp without time zone,
    handoff_reason text,
    last_inbound_at timestamp without time zone,
    last_message_at timestamp without time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.conversation OWNER TO postgres;

--
-- Name: course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    tagline text,
    category_id text,
    level text,
    modality text,
    duration_weeks integer,
    hours_per_week integer,
    image_url text,
    learning_objectives jsonb,
    target_audience text,
    syllabus_url text,
    published boolean DEFAULT true NOT NULL,
    min_attendance_pct integer,
    list_price integer,
    list_currency text,
    grants_certificate boolean DEFAULT true NOT NULL
);


ALTER TABLE public.course OWNER TO postgres;

--
-- Name: course_category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_category (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.course_category OWNER TO postgres;

--
-- Name: course_module; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_module (
    id text NOT NULL,
    organization_id text NOT NULL,
    course_id text NOT NULL,
    "position" integer NOT NULL,
    title text NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.course_module OWNER TO postgres;

--
-- Name: enrollment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.enrollment (
    id text NOT NULL,
    organization_id text NOT NULL,
    contact_id text NOT NULL,
    cohort_id text,
    stage_id text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    enrolled_at timestamp without time zone,
    last_activity_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    amount integer,
    installments integer,
    payment_notes text,
    national_id text,
    invoice_number text,
    receipt_number text,
    seller_id text,
    company_id text,
    terms_email_sent_at timestamp without time zone,
    software_installed_at timestamp without time zone,
    had_own_license boolean DEFAULT false NOT NULL,
    academia_online_access_at timestamp without time zone,
    interest_course_id text,
    currency text DEFAULT 'UYU'::text NOT NULL,
    welcome_email_sent_at timestamp without time zone,
    parent_enrollment_id text,
    attendance_waiver_at timestamp without time zone,
    attendance_waiver_by text,
    attendance_waiver_reason text,
    attendance_waiver_revoked_at timestamp without time zone,
    attendance_waiver_revoked_by text,
    attendance_waiver_revoke_reason text,
    CONSTRAINT enrollment_madre_distinta_de_si CHECK (((parent_enrollment_id IS NULL) OR (parent_enrollment_id <> id)))
);


ALTER TABLE public.enrollment OWNER TO postgres;

--
-- Name: installment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.installment (
    id text NOT NULL,
    organization_id text NOT NULL,
    enrollment_id text NOT NULL,
    number integer NOT NULL,
    due_date timestamp without time zone NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'UYU'::text NOT NULL,
    canceled_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.installment OWNER TO postgres;

--
-- Name: intake_form; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.intake_form (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    course_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.intake_form OWNER TO postgres;

--
-- Name: invitation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invitation (
    id text NOT NULL,
    organization_id text NOT NULL,
    email text NOT NULL,
    role text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    inviter_id text NOT NULL
);


ALTER TABLE public.invitation OWNER TO postgres;

--
-- Name: kb_entry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kb_entry (
    id text NOT NULL,
    organization_id text NOT NULL,
    kind text NOT NULL,
    question text,
    answer text,
    content text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.kb_entry OWNER TO postgres;

--
-- Name: license; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.license (
    id text NOT NULL,
    organization_id text NOT NULL,
    enrollment_id text NOT NULL,
    assigned boolean DEFAULT false NOT NULL,
    assigned_at timestamp without time zone,
    expires_at timestamp without time zone,
    software_id text NOT NULL
);


ALTER TABLE public.license OWNER TO postgres;

--
-- Name: media_asset; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.media_asset (
    id text NOT NULL,
    organization_id text NOT NULL,
    kind text NOT NULL,
    wa_media_id text,
    mime_type text,
    file_name text,
    file_size integer,
    caption text,
    payload jsonb,
    storage_path text,
    fetch_status text DEFAULT 'pending'::text NOT NULL,
    fetch_error text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.media_asset OWNER TO postgres;

--
-- Name: member; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member (
    id text NOT NULL,
    organization_id text NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.member OWNER TO postgres;

--
-- Name: message; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.message (
    id text NOT NULL,
    organization_id text NOT NULL,
    conversation_id text NOT NULL,
    wa_message_id text,
    direction text NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    text text,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    ai_generated boolean DEFAULT false NOT NULL,
    wa_timestamp timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'operator'::text NOT NULL,
    media_asset_id text
);


ALTER TABLE public.message OWNER TO postgres;

--
-- Name: meta_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_credentials (
    id text NOT NULL,
    organization_id text NOT NULL,
    waba_id text NOT NULL,
    phone_number_id text NOT NULL,
    display_phone_number text,
    verified_name text,
    token_cipher text NOT NULL,
    token_iv text NOT NULL,
    token_tag text NOT NULL,
    status text DEFAULT 'connected'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meta_credentials OWNER TO postgres;

--
-- Name: offline_answer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_answer (
    id text NOT NULL,
    organization_id text NOT NULL,
    question_id text NOT NULL,
    legacy_ref text,
    text text NOT NULL,
    is_correct boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.offline_answer OWNER TO postgres;

--
-- Name: offline_course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_course (
    id text NOT NULL,
    organization_id text NOT NULL,
    legacy_ref text,
    title text NOT NULL,
    slug text NOT NULL,
    description_md text DEFAULT ''::text NOT NULL,
    thumbnail_url text,
    status text DEFAULT 'published'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.offline_course OWNER TO postgres;

--
-- Name: offline_course_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_course_access (
    id text NOT NULL,
    organization_id text NOT NULL,
    offline_course_id text NOT NULL,
    cohort_id text,
    enrollment_id text,
    mode text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT offline_course_access_target_coherent CHECK ((((cohort_id IS NOT NULL) AND (enrollment_id IS NULL) AND (mode IS NULL)) OR ((enrollment_id IS NOT NULL) AND (cohort_id IS NULL) AND (mode IS NOT NULL))))
);


ALTER TABLE public.offline_course_access OWNER TO postgres;

--
-- Name: offline_lesson; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_lesson (
    id text NOT NULL,
    organization_id text NOT NULL,
    course_id text NOT NULL,
    legacy_ref text,
    title text NOT NULL,
    content_md text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.offline_lesson OWNER TO postgres;

--
-- Name: offline_question; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_question (
    id text NOT NULL,
    organization_id text NOT NULL,
    quiz_id text NOT NULL,
    legacy_ref text,
    question_md text NOT NULL,
    answer_type text NOT NULL,
    points integer DEFAULT 1 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_question_points_non_negative CHECK ((points >= 0))
);


ALTER TABLE public.offline_question OWNER TO postgres;

--
-- Name: offline_quiz; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_quiz (
    id text NOT NULL,
    organization_id text NOT NULL,
    course_id text NOT NULL,
    lesson_id text,
    legacy_ref text,
    title text NOT NULL,
    description_md text DEFAULT ''::text NOT NULL,
    passing_percentage integer DEFAULT 80 NOT NULL,
    retries_allowed integer,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_quiz_passing_range CHECK (((passing_percentage >= 0) AND (passing_percentage <= 100))),
    CONSTRAINT offline_quiz_retries_non_negative CHECK (((retries_allowed IS NULL) OR (retries_allowed >= 0)))
);


ALTER TABLE public.offline_quiz OWNER TO postgres;

--
-- Name: offline_quiz_attempt; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_quiz_attempt (
    id text NOT NULL,
    organization_id text NOT NULL,
    quiz_id text NOT NULL,
    enrollment_id text NOT NULL,
    contact_id text NOT NULL,
    attempt_number integer NOT NULL,
    score_percentage numeric(5,2) NOT NULL,
    passed boolean NOT NULL,
    answers_given jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT offline_quiz_attempt_number_positive CHECK ((attempt_number >= 1))
);


ALTER TABLE public.offline_quiz_attempt OWNER TO postgres;

--
-- Name: offline_recognition; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_recognition (
    id text NOT NULL,
    organization_id text NOT NULL,
    contact_id text NOT NULL,
    course_id text NOT NULL,
    lesson_id text,
    reason text NOT NULL,
    recognized_by text,
    recognized_at timestamp without time zone DEFAULT now() NOT NULL,
    revoked_at timestamp without time zone,
    revoked_by text,
    CONSTRAINT offline_recognition_reason_present CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)))
);


ALTER TABLE public.offline_recognition OWNER TO postgres;

--
-- Name: offline_topic; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_topic (
    id text NOT NULL,
    organization_id text NOT NULL,
    lesson_id text NOT NULL,
    legacy_ref text,
    title text NOT NULL,
    content_md text DEFAULT ''::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    video_url text,
    video_shown text DEFAULT 'after'::text NOT NULL,
    CONSTRAINT offline_topic_video_shown_valid CHECK ((video_shown = ANY (ARRAY['before'::text, 'after'::text])))
);


ALTER TABLE public.offline_topic OWNER TO postgres;

--
-- Name: offline_topic_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_topic_progress (
    id text NOT NULL,
    organization_id text NOT NULL,
    contact_id text NOT NULL,
    topic_id text NOT NULL,
    watched_ratio numeric(5,4) DEFAULT '0'::numeric NOT NULL,
    completed_at timestamp without time zone,
    completed_by text,
    completion_source text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    played_ranges jsonb DEFAULT '[]'::jsonb NOT NULL,
    video_duration numeric,
    CONSTRAINT offline_topic_progress_completion_coherent CHECK (((completed_at IS NULL) = (completion_source IS NULL))),
    CONSTRAINT offline_topic_progress_ratio_range CHECK (((watched_ratio >= (0)::numeric) AND (watched_ratio <= (1)::numeric))),
    CONSTRAINT offline_topic_progress_source_valid CHECK (((completion_source IS NULL) OR (completion_source = ANY (ARRAY['video'::text, 'no_video'::text, 'staff'::text])))),
    CONSTRAINT offline_topic_progress_staff_author CHECK (((completed_by IS NULL) OR (completion_source = 'staff'::text)))
);


ALTER TABLE public.offline_topic_progress OWNER TO postgres;

--
-- Name: organization; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organization (
    id text NOT NULL,
    name text NOT NULL,
    slug text,
    logo text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    metadata text,
    timezone text DEFAULT 'America/Montevideo'::text NOT NULL,
    meeting_open_before_min integer DEFAULT 15 NOT NULL,
    meeting_open_after_min integer DEFAULT 30 NOT NULL
);


ALTER TABLE public.organization OWNER TO postgres;

--
-- Name: payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment (
    id text NOT NULL,
    organization_id text NOT NULL,
    enrollment_id text NOT NULL,
    installment_id text,
    amount integer NOT NULL,
    currency text DEFAULT 'UYU'::text NOT NULL,
    paid_at timestamp without time zone NOT NULL,
    method text NOT NULL,
    receipt_number text,
    notes text,
    recorded_by text,
    voided_at timestamp without time zone,
    voided_by text,
    void_reason text,
    idempotency_key text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payment OWNER TO postgres;

--
-- Name: pipeline_stage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pipeline_stage (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    kind text DEFAULT 'open'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pipeline_stage OWNER TO postgres;

--
-- Name: resource; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.resource (
    id text NOT NULL,
    organization_id text NOT NULL,
    course_id text,
    class_session_id text,
    course_module_id text,
    title text NOT NULL,
    url text NOT NULL,
    kind text DEFAULT 'enlace'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    cohort_id text,
    CONSTRAINT resource_contenedor_unico CHECK ((((
CASE
    WHEN (course_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (cohort_id IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN (class_session_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1))
);


ALTER TABLE public.resource OWNER TO postgres;

--
-- Name: role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role (
    id text NOT NULL,
    organization_id text NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    system boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.role OWNER TO postgres;

--
-- Name: seller; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seller (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    email text,
    user_id text,
    archived_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT seller_name_present CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
);


ALTER TABLE public.seller OWNER TO postgres;

--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    active_organization_id text
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: software; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.software (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    total_licenses integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    photo_mime_type text
);


ALTER TABLE public.software OWNER TO postgres;

--
-- Name: submission; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.submission (
    id text NOT NULL,
    organization_id text NOT NULL,
    assessment_id text NOT NULL,
    enrollment_id text NOT NULL,
    url text NOT NULL,
    title text,
    submitted_at timestamp without time zone DEFAULT now() NOT NULL,
    passed boolean,
    feedback text,
    corrected_at timestamp without time zone,
    corrected_by text,
    reopened_at timestamp without time zone,
    reopened_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.submission OWNER TO postgres;

--
-- Name: teacher; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    hourly_rate integer,
    photo_mime_type text,
    email text,
    title text
);


ALTER TABLE public.teacher OWNER TO postgres;

--
-- Name: teacher_course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_course (
    teacher_id text NOT NULL,
    course_id text NOT NULL,
    organization_id text NOT NULL
);


ALTER TABLE public.teacher_course OWNER TO postgres;

--
-- Name: template; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    language text NOT NULL,
    category text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    rejection_reason text,
    wa_template_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.template OWNER TO postgres;

--
-- Name: user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL
);


ALTER TABLE public."user" OWNER TO postgres;

--
-- Name: verification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.verification OWNER TO postgres;

--
-- Name: virtual_room; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.virtual_room (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    account_email text,
    notes text,
    archived_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.virtual_room OWNER TO postgres;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: postgres
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	b6237d6b38228eb58adf9cfab41c1706735a71c7b9dcd6c42b7517de0f204455	1783657511753
2	366deadb77fb633842808cd652e703d0e500a49b4d1a99c8656e896e2782fb56	1785464517783
3	42b8c1b9dca0e2d821917137014a95a82c38bebcb9c9e7a891098a39b76af779	1785872764254
4	22da2b0b64e2950eedd222d0cd40132ddfc78d85aad8d099633c93662da84a12	1786386600925
5	421bd5018fef3daca85e93c957e45b553fdf078af749c19a5cb213f25362aee8	1786386627378
6	4d9171ab895419cbf71ccc202db155f2f186c5438e929aa6af404c20c46b578a	1786393941593
7	904a83d9d839f0500edc37cf68f5522402bc90b333c12f4b984e68586d142bb8	1786393949992
8	a6b8ad67dc417064904ce635a137fa10c786a6b684d3450437cb3082a3a96cc6	1786461928827
9	b0238be77c3b061ac2d8b53bfdaeed51043f2295db03c6b33a9b5ac43f968b58	1786462273935
10	044e0e5a6273043dbfb3f95d156b6131d848d8e0a0a29c78b281cadea0787bcf	1786474366987
11	1cabb4e2de8de285d70f4ea9109a7387c4e482f68068507a65e5ba1b896d36a9	1786476127521
12	73021aed6791f895741d37aae8395647639408dee51a059fdc77b4c5d41c7285	1786476719468
13	11bf890087426e6c913f561649b70310362060d1b7f570c81caac577c28b237c	1786477929156
14	ccc66b8cc146a630a2e68b665bc85f814198a916f401940fe0d493f00f6cc7c2	1786477985906
15	f2261c0ccf6d66ab1b5b6097cfad13819d28244f0f732ced309048e5e02c1b4c	1786558873265
16	0619219472530a0bde8f35358a913e038abdff358773f605c67536c4848a567e	1786558932780
17	99a19a62cb929b10510dd82da86cf3aaf869e5c29c98373ba4dfbc71cfbe827b	1786561085498
18	c34e259b82bff2686c506f2196a301595df05bb23031063b3176e691b2b41b4e	1786738696880
19	92665b3b53df1d8e94f55925b1b003861e18d3ff6e795547a3b48fb6931a0fa5	1786979429699
20	bd895e42276ca4c38d1089f9b54eacea01fa68e10d7eceac3fb638b2cfadcb84	1786990843544
21	302acd931c99ed3e46ebee1b986cda923e1931b5e0bd11a8d2d1b90a7c1bae70	1787239978768
22	a23268ab34fbbee79e92a93963efab4733128c82c99255e59f5dd052f2eca6a2	1787317458736
23	c66ce57539dbb3370eee7b372827017d4410213695a67c6d2cf7dfc856dde006	1787751303599
24	baf910388ae4e7c708592bccca849b319ebd13a2c748c05c849eb07a2aea768b	1787772687329
25	f417008a4db153b30fa629df2bd8bc1d8543798fddae407383c1eae07d7a6daa	1787777485029
26	f093d4e0baaad17c887fb555ecc695c3d3659c49f0c023f167ac48736ecf7108	1787834149538
27	88207116156de71974876a0ef2ccd1691d120f6d53a6ea6791c3e13a9e79f7fa	1787834183358
28	6dafda2e6a4d17948043ca0ced2a178ceb899fe6960562e418be6de4b42067cd	1787836850265
29	836144131002fdd3016610d3e38b9b87b9a8fd325fb9986902590a8809322d35	1787840178895
30	02d791fc90d2c7d0ec302e7632a796acaaa45dadfdbcbad470a1a05bb643b234	1787842554902
31	78c78a6eddeed70f7e854038c0f30c96d2dcca734f20a4a4c3097562f86d935a	1787851125905
32	2de6a3433ce925f30440e119c100016e933a9772b9f07e659fc43b6379029401	1787921057631
33	a36acd763ea632b7f62e96ce0c33b1f04e8a2ecc507230c41df24ed4beda2b9d	1788270356693
34	94575d0fd6255754279f715d01c8d4e4d12c9aff02b96b6c7246201e67aad1a0	1788283290241
35	c7362965f5cc16301091daa98931f0882769dd2ee3758d65ffad6bc9e95ffa38	1788372011232
36	71cb9ec1ba008a668d8870302013f1a26646123eaa1c7c285d137dc278a5e54a	1788456788149
37	2ab7dec3aa143a85fbeb27a0de3110b1aa200843b0c7b6eaec4d285b3d203ce8	1788543188149
38	e9bce74435b6b1bda949e99740b1f1381f0e7fb53cb7797fbd6c7ee75653a9cf	1788878069438
39	a1bb40d31094f75117d9ffa6c723601de5537340f55f0cd9f7c3ad980fe0e046	1788959721497
40	06d7e3a9653ba2d9e68c336530cc525412fbad6d30953b26ce6beba646a3b6dc	1789587613656
41	c1933b321e63ad9d7eb037b9a317c24bf1afad3289a5c30d7515f3bac906aa5a	1789735441273
42	c2bf5ebbad03e3d0655cf29a0be512b05112e2b9455483731e98df3030cad081	1790258057234
43	99a759d0ba5112ffb6e13a5dbdb32f400fb75d6c202440d01ca7e28a9cec48b3	1790342893254
44	6b020d1f81b2dc899c923e29ce18cfaf0fb19a4494cf4140b8e55002f837c1b1	1790361535762
45	bf4c7be653f6f65fdd233907c6c00fdf6a71f98b172ce5a79ede0cd079b4d47b	1790365349958
46	5df66190eea3b02b2404dd1c80c152d381d8f97ed434fe7c00d25928869f9748	1790599758057
47	2225641985fbce0b46c77acc7d48c53994aaa727603b618a26749006cfd1dbe5	1791221344658
48	d00785d4d8516ba7d00906b7b956d47319ef01def7e052a2654e2f6be50a6575	1791231995140
49	a45c100f13b1daf57505ba2293b177a917e6fa5916e66273c8453e5ce20316bf	1791295131147
50	043f982c870a8673da3f66054f093637b74fca74fce5c12b331b4b3837f8a9cf	1791299267905
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) FROM stdin;
hYhgrgXnsYb5PbaFFYn3rNMh8DDfWwr9	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	credential	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	\N	\N	\N	\N	\N	\N	e1ccc68b99a5932bd1f47124a93d7f5e:e30e893ac44b9a693d247fb4248668f433814a381acda342cf035bd2fe7e019ccea009f1109226e47a5048fce88098fc6832e089aa85615fbe336789feb0f7a1	2026-08-11 12:46:48.603	2026-08-11 12:46:48.603
1ReUAWyRK5pAXgKxKSWqhbQaieeOhCQP	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	credential	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	\N	\N	\N	\N	\N	\N	aa63e79685a20ed4efe62bb3f3a2bdbe:2d9d5d6ff9843eb19447f38bf00e30f4fe4af6dee94c9d96c26e9a93ded7b52a825e66d8ea6b27ec85b364d3a33a25762fd2132a1d7d1806c5a5920395440a14	2026-08-11 14:34:54.53	2026-08-11 14:34:54.53
5K7BDZj0aU8HdRLT9hkQ2ar2vjLjPH67	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	credential	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N	\N	\N	\N	\N	\N	87ac21f3d9c80459e632e60cedc69664:1c4818d98ebd8ce4ab9dc071d822e0b95df0a9adcd919e9dff1e0a476a52c91639e7ce1d8d3c456ad37f27027202bdadfc89db6fa34116867a61744ac05483f5	2026-09-02 19:55:54.146	2026-09-02 19:56:08.314
MQQdHg4OzcYXBxNi3J1cvoigZR6imqzK	osrQ0lXIfCOLYrSahugeSYTlpT3ksClr	credential	osrQ0lXIfCOLYrSahugeSYTlpT3ksClr	\N	\N	\N	\N	\N	\N	acb1b22ded28302c52f0f27cc1b28f09:207ddfae385447ef5e8b086be34a70904345962ea2ed92267a825f26bbf0ac27bf5499f9f82d3941862d6b5ec8a492c509b06462bbf6743388edf154e1cac868	2026-09-07 17:55:40.324	2026-09-07 17:55:40.324
aRbG96L2V9Zh7OKIStlEbrMDZPaQtycu	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	credential	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	\N	\N	\N	\N	\N	\N	c9f192df28551c31cf1db5778526bdc9:153979cace621ddaacc9c629b1d276a2e041a06fab4ac1af9582f740b7a54d141808437ea4e30dc60bd91c4b1b0c8b55ca4eea4e4da91b4170986df2694bedc0	2026-08-11 12:20:11.629	2026-09-01 12:26:39
ctEnh5Z3QoSbFRTZzoev1SWGOuwXvmOM	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	credential	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N	\N	\N	\N	\N	\N	39e7913de3f467fbeb171472bd3bbb26:47d6b98fa24d4e8c0978e1f4bae17c8f4d986c1d2d151dfa36a5ea5286c03a24d95d69666ce5628fa1db83d9f40fc1aa2ce3cc4fd0631b61427f05c306b773bb	2026-09-02 19:55:54.071	2026-09-28 14:33:46.892
wP9eXOmqMHIWO5daSRveZ2ohArkEQBo6	JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	credential	JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	\N	\N	\N	\N	\N	\N	0483e8f0c458eeabe7453395b602569b:bf057207350f1a50fcac9e03cd785c83d05ebbfe1ae5fbf6763d6f7f1031d102c90afeadd42a57ce40dd1d46d4abd60eb13feec8f85a1a64c28f06ed08142bb5	2026-09-02 14:39:55.716	2026-09-02 14:40:07.179
MF1FEZmrADDqljDsZ4faB9kKJw4ydiZn	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	credential	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	\N	\N	\N	\N	\N	\N	33878ae1610f7c355308f3f56e10296e:0cfc9a4f173cbf914ccaf802285bd7c67d3f2fba4f9763cab6508da7d46950dfbe0256a7583080b4738b3d73563179271cd5c6dac83e0b15ccc586007c26c687	2026-09-01 14:07:15.333	2026-09-02 14:40:09.347
ITfP8TVouEPqDVmL3luJFd8cUCzpi6TE	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	credential	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	\N	\N	\N	\N	\N	\N	6bb9c1a19d8425ab204e8e6aa411c778:918d50a974dfbc241faa493b2b9fb1ef7a0ff573f70ff40ee42d9cb3cc7a9f3cd00710109d6cc2b5caf53837f45ca918f89e7d94122c22787bcd3c785f9dec12	2026-08-10 19:37:00.677	2026-09-02 14:40:11.584
\.


--
-- Data for Name: account_link; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_link (id, organization_id, user_id, kind, contact_id, teacher_id, suspended_at, created_at, updated_at, invitation_email_sent_at, invitation_email_sent_by) FROM stdin;
alk_aegxavppoede25wrbzfo	org_y0txnlv69l6vp70ey06b	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	profesor	\N	tch_sl39f4ns1va4lo0oushl	\N	2026-09-01 14:07:15.036435	2026-09-01 14:07:15.036435	\N	\N
alk_p7rlvmv9rlsl48axogz0	org_y0txnlv69l6vp70ey06b	JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	alumno	ct_215aw1k3arcnyhsvhhb6	\N	\N	2026-09-02 14:39:55.565352	2026-09-02 14:39:55.565352	\N	\N
alk_0w38fzhsnamr9fk21zms	org_y0txnlv69l6vp70ey06b	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	alumno	ct_6z2cdwqromj4rz56cuay	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N
alk_k9zadasceaje63ms8mih	org_y0txnlv69l6vp70ey06b	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	profesor	\N	tch_cjk87xea142wsnmdezy4	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N
\.


--
-- Data for Name: agent_profile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_profile (id, organization_id, enabled, name, tone, instructions, escalation_rules, greeting, created_at, updated_at) FROM stdin;
agp_mjqec2uligb4g5kzu6gu	org_y0txnlv69l6vp70ey06b	f	Asistente	\N	\N	\N	\N	2026-08-10 19:37:00.784484	2026-08-10 19:37:00.784484
\.


--
-- Data for Name: agent_test_case; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_test_case (id, organization_id, run_id, persona, conversation_id, transcript, veredicto, hallazgos, status, created_at) FROM stdin;
\.


--
-- Data for Name: agent_test_run; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_test_run (id, organization_id, status, score, error, started_at, finished_at) FROM stdin;
\.


--
-- Data for Name: announcement; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcement (id, organization_id, cohort_id, author_user_id, title, body, created_at) FROM stdin;
anc_srz37qdkg4o11n22sf0i	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	[DEMO] Traigan el plano acotado	El lunes arrancamos con el render, así que necesitamos el plano ya acotado.	2026-09-02 19:55:53.861376
\.


--
-- Data for Name: assessment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assessment (id, organization_id, cohort_id, name, "position", required, created_at, updated_at, due_at) FROM stdin;
asm_ya602yt5bufxwt0fgtif	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	Test	0	t	2026-09-01 14:56:13.745955	2026-09-01 14:56:13.745955	\N
asm_ettqnhjrzk1a505xsw4y	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	Modulo 4	1	t	2026-09-01 14:56:47.522019	2026-09-01 14:56:47.522019	\N
asm_l44gy66wi2h5hfmyi0p9	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	Modulo 5	2	t	2026-09-01 14:56:59.119386	2026-09-01 14:56:59.119386	\N
asm_nkes6mef7nxts98g1w5p	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	[DEMO] Trabajo práctico 1	0	t	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N
asm_mww8krumwk332tm1oani	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	[DEMO] Entrega final	1	t	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N
asm_5i1ds8hvrbsmuwr2npfe	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	Entrega Módulo 1	0	t	2026-09-24 15:34:13.306141	2026-09-24 15:34:22.913	2026-10-01 02:59:00
\.


--
-- Data for Name: assessment_extension; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assessment_extension (id, organization_id, assessment_id, enrollment_id, due_at, reason, granted_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: assessment_result; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assessment_result (id, organization_id, assessment_id, enrollment_id, passed, notes, recorded_by, created_at, updated_at) FROM stdin;
res_6p971nqrw6ssmwn5r4sl	org_y0txnlv69l6vp70ey06b	asm_ya602yt5bufxwt0fgtif	enr_rw4tx43cvangl2uxvtcg	t	\N	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	2026-09-01 14:57:11.30779	2026-09-01 14:57:11.314
res_a9fvz7m0b34mbvlv3q0h	org_y0txnlv69l6vp70ey06b	asm_ettqnhjrzk1a505xsw4y	enr_rw4tx43cvangl2uxvtcg	t	\N	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	2026-09-01 14:57:16.89628	2026-09-01 14:57:16.89628
res_gyp31wvp830779mxtuk4	org_y0txnlv69l6vp70ey06b	asm_l44gy66wi2h5hfmyi0p9	enr_rw4tx43cvangl2uxvtcg	t	\N	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	2026-09-01 14:57:19.98453	2026-09-01 14:57:21.98
res_sbpxaclsuq6c9p73y5bb	org_y0txnlv69l6vp70ey06b	asm_nkes6mef7nxts98g1w5p	enr_ol258rs97f4orbbsap6m	t	\N	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, organization_id, class_session_id, enrollment_id, status, notes, created_at, updated_at, recorded_by) FROM stdin;
att_nejpt8kusxxhstndqgb5	org_y0txnlv69l6vp70ey06b	cls_k0o2q6h0dh3hn04nd5hq	enr_ol258rs97f4orbbsap6m	presente	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_rv8hkhh87kz73au5yop1	org_y0txnlv69l6vp70ey06b	cls_ksmlidx4epzi8ry2z380	enr_ol258rs97f4orbbsap6m	ausente	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_f8p9neim146k4h3e1bq6	org_y0txnlv69l6vp70ey06b	cls_p1nu8cpn9l68g8sm2uq4	enr_ol258rs97f4orbbsap6m	presente	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_l9n8ffhkgm7mm5f1iu0u	org_y0txnlv69l6vp70ey06b	cls_x2kq4ykei2krs1zyvtc1	enr_ol258rs97f4orbbsap6m	tarde	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_l6t735g6tmygabhe6j1c	org_y0txnlv69l6vp70ey06b	cls_6oqpnrfkegvww8hcxtz1	enr_ol258rs97f4orbbsap6m	presente	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_wcgb88oxtr7qy1bjmv73	org_y0txnlv69l6vp70ey06b	cls_lzs9lgxtxbgh7fvuos6q	enr_ol258rs97f4orbbsap6m	presente	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5
att_3ilja933a9jygyoki8xh	org_y0txnlv69l6vp70ey06b	cls_k8k82iw27jgtnt0bxo2b	enr_ol258rs97f4orbbsap6m	presente	\N	2026-09-02 19:55:53.861376	2026-09-03 17:10:26.524	L5Rd42NmmROxqwZic1unHDnTdfYQU44R
\.


--
-- Data for Name: automation_rule; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_rule (id, organization_id, trigger_event, channel, template_id, template_body, active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: bulk_send_recipient; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bulk_send_recipient (id, organization_id, run_id, enrollment_id, "position", outcome, message, processed_at) FROM stdin;
\.


--
-- Data for Name: bulk_send_run; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bulk_send_run (id, organization_id, cohort_id, kind, started_by, started_at, finished_at) FROM stdin;
\.


--
-- Data for Name: certificate; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.certificate (id, organization_id, enrollment_id, code, issued_at, issued_by, attendance_pct, historical, revoked_at, revoked_by, revoke_reason, created_at) FROM stdin;
\.


--
-- Data for Name: class_session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_session (id, organization_id, cohort_id, number, date, start_time, end_time, hours, teacher_id, topic, canceled_at, cancel_reason, created_at, updated_at, meeting_url, recording_url, virtual_room_id) FROM stdin;
cls_k0o2q6h0dh3hn04nd5hq	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	2	2026-08-17 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_ksmlidx4epzi8ry2z380	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	3	2026-08-19 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_p1nu8cpn9l68g8sm2uq4	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	4	2026-08-24 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_x2kq4ykei2krs1zyvtc1	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	5	2026-08-26 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_6oqpnrfkegvww8hcxtz1	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	6	2026-08-31 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_lzs9lgxtxbgh7fvuos6q	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	7	2026-09-02 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_0shug8gvl6but3cooiyg	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	9	2026-09-09 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_8r0ypsl7gtny64hu444x	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	10	2026-09-14 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_isoamsjou4tqebwplpe5	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	11	2026-09-16 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_gggx7wyedv07jbys9vil	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	8	2026-09-07 00:00:00	18:30	21:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-04 18:40:55.833	\N	\N	\N
cls_k8k82iw27jgtnt0bxo2b	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	1	2026-08-12 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-04 20:50:10.53	\N	\N	\N
cls_7jvu3qbmmshdii41xgdz	org_y0txnlv69l6vp70ey06b	coh_o0wif02yng8jx045ofc5	12	2026-09-21 03:00:00	18:30	20:30	2	tch_cjk87xea142wsnmdezy4	\N	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	\N
cls_wwnjqwa1lemnanvswaie	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	1	2026-08-24 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_0k11ki31vu7i70pc7oxe	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	2	2026-08-26 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_20nay7btuhlzfnx1rxpu	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	3	2026-08-31 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_gu0b4spwj2t7z5qzl6qg	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	4	2026-09-02 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_d3eqidshc3hirjudbala	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	5	2026-09-07 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_i87euf5qubj2tce5b8jd	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	6	2026-09-09 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_pxdo0d5mb332373262bs	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	7	2026-09-14 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_u7av3a72nz9vpywyvlbo	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	8	2026-09-16 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_w5dng68a89jtvbo3z58z	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	9	2026-09-21 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_0uhqqmamwz290gnf0pr9	org_y0txnlv69l6vp70ey06b	coh_rfautax494zvjxlbtis8	10	2026-09-23 03:00:00	09:00	11:00	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-04 18:24:14.676648	2026-09-04 18:24:14.676648	\N	\N	\N
cls_3lntnqc8m0j6qaq3lcjc	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	1	2026-09-25 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_3slbel9lce3rnlk86c5b	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	2	2026-09-29 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_k2ih4r0ytbdxun2h6vcw	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	3	2026-10-02 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_uhqsu56i75a1v2r0ullq	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	4	2026-10-06 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_4svpci6pdajnq28pnb5a	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	5	2026-10-09 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_pesdza9kwmmx8cu71ic9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	6	2026-10-13 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_zgdapmx27xdj9x92embt	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	7	2026-10-16 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_uwfgwjatrbjmp65aa101	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	8	2026-10-20 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_men80v4mawcqnj78rziz	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	9	2026-10-23 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_9k92sreld2af83jc4gyz	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	10	2026-10-27 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_oxq5du8i82f7088j1a1f	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	11	2026-10-30 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_synm7jis4d1kev9qeulm	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	12	2026-11-03 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_j885nbjrtza80kgz9lgw	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	13	2026-11-06 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_geaa6big61z5mj9i9fsn	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	14	2026-11-10 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_85ydomwecvcmdluinfb9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	15	2026-11-13 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_csq25yjjk183g75bao1g	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	16	2026-11-17 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_eb1djno9azu8e9m6pw5b	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	17	2026-11-20 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_vdimmrtai2t43fjmebgh	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	18	2026-11-24 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_9gbabaawbzorx02u9rj1	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	19	2026-11-27 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_9aeao7e6ipel59an8ud7	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	20	2026-12-01 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_v9uxkw6tn4xpwku11dmp	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	21	2026-12-04 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_sm6v0r2liheaj8720y2m	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	22	2026-12-08 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_5co33jn2fyhc16fkppl9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	23	2026-12-11 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_wd2xkkjxrbwfn01p8ukg	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	24	2026-12-15 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_da39paj1ou6rneugacse	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	25	2026-12-18 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_rywwfyazg7wtdvibsrms	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	26	2026-12-22 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_ltrm4gs8fopx6vmwiacy	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	27	2026-12-25 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_w2d4qpx6h4wwiz4grkcc	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	28	2026-12-29 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_1fjg5x2zqa1zlw0toeha	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	29	2027-01-01 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_zwu078tkbjx4ep59ls2b	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	30	2027-01-05 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_evyndwouq4m8fzsqt9g7	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	31	2027-01-08 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_sk4y2s97buz0ci9rlw4n	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	32	2027-01-12 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_cth1bk1aszfoj0hqwjfq	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	33	2027-01-15 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_chi7hbv0w95n9l3zruvl	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	34	2027-01-19 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_2tqsi932fstahmy3kli1	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	35	2027-01-22 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_yy8k7t0onio4t6nreb7w	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	36	2027-01-26 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_p4l6t2uxea9d4nhm1h4a	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	37	2027-01-29 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_o8osvqtscyerp4bm9bwe	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	38	2027-02-02 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_erpkxuhkuoukgbh3l4v4	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	39	2027-02-05 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_92vi2gady0rxxk6pt4il	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	40	2027-02-09 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_pd44uhs2o544b4gbhzr8	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	41	2027-02-12 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_nqgv1ddm3ckf2krhjuz1	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	42	2027-02-16 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_5643abcrvt1ae239o7hj	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	43	2027-02-19 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_qvt10qvj4mktiox81x2o	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	44	2027-02-23 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_64dt2woh0bg6a0gv90qt	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	45	2027-02-26 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_ogyvwuk9md8p2l9l83nf	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	46	2027-03-02 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_a6aldth6l1jdqzacsz0h	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	47	2027-03-05 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_dy8llmswfc6kb6g86q7q	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	48	2027-03-09 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_b3246tlp5gfmriber4a0	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	49	2027-03-12 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_gegfhzldyw2pm5gkbdhi	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	50	2027-03-16 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_bw4tn6m73363bmx78uqe	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	51	2027-03-19 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_t3vkzl63kviwmn60rwy7	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	52	2027-03-23 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_mq3jb09qxn4zadhej48z	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	53	2027-03-26 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_jp526hi3y07crqr182yz	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	54	2027-03-30 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_0ki9mfz7ixfpnqfd1e6k	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	55	2027-04-02 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_pi5tm74y5f8rveif6wfc	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	56	2027-04-06 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_hkgkyeyshrsamph5sr0s	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	57	2027-04-09 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_jqer8dujzbowed8bxb4q	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	58	2027-04-13 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_h8nflkosbwp3fx8elmiy	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	59	2027-04-16 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_ms2robc7wuavgsrsizsz	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	60	2027-04-20 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_wbmvb4rovqivrknrcd5i	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	61	2027-04-23 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_r7h8830ngf0c0lzryvpf	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	62	2027-04-27 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_77ux187en33teiy06s5l	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	63	2027-04-30 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_naf8oxfa5jnlypjedcn5	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	64	2027-05-04 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_cscdyqznacjdl7ny8wh8	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	65	2027-05-07 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_d6zkhlaet6tb4oska4n2	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	66	2027-05-11 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_87pfu2gqvpc6gy1yhojk	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	67	2027-05-14 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_qowdna3hsb029i0fhfng	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	68	2027-05-18 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_1bpu8ex557jhmy0jt7gi	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	69	2027-05-21 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_u4d8keezb7rvncldpb6b	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	70	2027-05-25 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_o0xinqcs8f7wk5k3m5ts	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	71	2027-05-28 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_gpx69wq99ifpc0hhu0ye	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	72	2027-06-01 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_l401wgcwbxxksv80pu8c	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	73	2027-06-04 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_0rx8gy7fn7xt1s778lwm	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	74	2027-06-08 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_olqwvy01kcxveel5vpbg	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	75	2027-06-11 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_xwjis3iu4to0qt51la1s	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	76	2027-06-15 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_1818yzebc49n2io3pyh9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	77	2027-06-18 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_lultgfb8qwtaky5iczse	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	78	2027-06-22 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_tsy8wcuhoi5rhelfvno1	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	79	2027-06-25 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_1lhuptu1dmrhuwup9s42	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	80	2027-06-29 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_gjm0x5i882kl2ebzbtsi	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	81	2027-07-02 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_xtuvenewxlf7te3rxnfq	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	82	2027-07-06 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_j1s2he63ttt6w5pb69h2	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	83	2027-07-09 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_t9tyz45z1dyt14ts42i9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	84	2027-07-13 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_8ano22pzqfnu0pv3kaaj	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	85	2027-07-16 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_002ufjxrw4owyyv70bt7	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	86	2027-07-20 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_hue3hcospa42s7wk0p0u	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	87	2027-07-23 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_ifngzuvkliv2vvjm9x2t	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	88	2027-07-27 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_6e74vd2a2xop4hlvwdka	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	89	2027-07-30 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_ldto48blzs9it7zzqrt7	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	90	2027-08-03 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_x01mye3tqfn8fw0t6f0y	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	91	2027-08-06 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_i4matomu6n9krnrnnr95	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	92	2027-08-10 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_5puyu7ehwqayh407htp0	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	93	2027-08-13 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_45tpyush6j0vvv2tcx0c	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	94	2027-08-17 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_u922bzl9zf00uqjmqb82	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	95	2027-08-20 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_i8hqokcrmmv7f6ji7m8w	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	96	2027-08-24 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_isy5kjiubk702aquk21q	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	97	2027-08-27 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_t1fntoflhgsjfqnype6w	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	98	2027-08-31 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_b191mf9luulcd57m4mnb	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	99	2027-09-03 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_wud4vzje55xds9g3v1tr	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	100	2027-09-07 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_2cbu1zfdb4eb3rjzhztk	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	101	2027-09-10 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_xhlxd30v8to9ax9yy668	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	102	2027-09-14 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_q3qsivqqaxs81rg3aiwy	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	103	2027-09-17 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_m57ii6c42nqgk0rofrz9	org_y0txnlv69l6vp70ey06b	coh_2mtrin842axs6j9uodgc	104	2027-09-21 03:00:00	12:25	14:27	2	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	2026-09-24 15:26:16.087033	2026-09-24 15:26:16.087033	\N	\N	\N
cls_denvhqdepnak0g6vxxpn	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	1	2026-09-24 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_4wjbapf3jao3h1aub3id	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	2	2026-09-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_iejya5brjpwzsm799ckp	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	3	2026-10-01 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_vw0qmqagm5q1ol49faft	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	4	2026-10-06 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_pejstylrzsbljgr3eeiw	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	5	2026-10-08 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_a8r1ic15t3u6ok2ptlyx	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	6	2026-10-13 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_8olwougmdah2ganocpu4	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	7	2026-10-15 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_mya79mgnjsi3cam2e9iu	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	8	2026-10-20 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_nxkzrmb44a7hlocr9m9c	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	9	2026-10-22 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_92sjk4lyxbc5s5bh6j6q	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	10	2026-10-27 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_nhm6feyq9i4exa8hvxgk	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	11	2026-10-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_h27tye6e88s08qsxacn8	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	12	2026-11-03 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_jeqa9zaxi0cfcctn03xg	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	13	2026-11-05 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_i354hkv9tmegyupdi99a	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	14	2026-11-10 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ztp6qz4obidp4pr3xusy	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	15	2026-11-12 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_cwx4s3xeoe1ywb5xmrv3	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	16	2026-11-17 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_f7nejhm1csztunjylk55	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	17	2026-11-19 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ysc58dgliff8jwqirgcr	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	18	2026-11-24 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_7fhltv8kdwrnsp18tq6r	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	19	2026-11-26 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_v4onadqzwgh2efnlqflk	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	20	2026-12-01 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_o5965qna3evj6ofpzlr2	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	21	2026-12-03 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_7aia0dm44uu33l470o2l	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	22	2026-12-08 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ia1umt2kk4waye84wd2m	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	23	2026-12-10 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_qhz6zkyebl7z1krbxgki	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	24	2026-12-15 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_dzif6bfrqz8voj03iqho	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	25	2026-12-17 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_t00f9dc37tt83rc59b6v	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	26	2026-12-22 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_g0cph2xskhqg5wdkqoxs	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	27	2026-12-24 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_9x7rzy8bm91ayjy4a2jq	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	28	2026-12-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_13lw6nvl28v19cb8126s	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	29	2026-12-31 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_2c6230m9jhe9520w3fmo	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	30	2027-01-05 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_uejpz5la1nohindpq2gh	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	31	2027-01-07 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_yr96sdn5b80uzfak4e9p	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	32	2027-01-12 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_wtc0zjwmejal5bfvetug	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	33	2027-01-14 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_y4biyhjfzswp0s1ib3t3	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	34	2027-01-19 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_yogvsxvxpy9ntno922z6	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	35	2027-01-21 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_mu65dn64pddeivaboh1o	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	36	2027-01-26 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_1wvx0fj42059bu9rm6sc	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	37	2027-01-28 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_eh7xlmza6g3kk3q2yft9	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	38	2027-02-02 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_25h3bvm2y18jzb0mnmr3	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	39	2027-02-04 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_oukvf1y6k0ua60xgnzod	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	40	2027-02-09 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_zqux3svu2kvw9nrzaykd	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	41	2027-02-11 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_t6qrxdlmiq96l7mwod1x	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	42	2027-02-16 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_4kb4nb2g8no2k1croeqn	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	43	2027-02-18 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ww58hxp58bh4pdibqolx	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	44	2027-02-23 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_6i9kfrzw4sw72y5dmw6m	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	45	2027-02-25 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_9gp5ceg5zhj8gkeukdol	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	46	2027-03-02 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_z0x7n30mr0b0eaer1kzp	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	47	2027-03-04 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_z5wgcck1p6f3y7jqeunt	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	48	2027-03-09 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_a9pa1qoc43dlx64n543s	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	49	2027-03-11 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_uxqy0t0p283qpuulf84k	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	50	2027-03-16 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_h2hf2egqgzo6fcjf0f2k	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	51	2027-03-18 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ctigrwar1l4j18r43djj	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	52	2027-03-23 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_c0epfpzrzudaal73t69t	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	53	2027-03-25 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_xfn3i3gdcy1paqfpqrzd	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	54	2027-03-30 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_s7i9zhci1jk5mqvbg4uy	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	55	2027-04-01 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_9mpjkbtdi4irgupeza9x	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	56	2027-04-06 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_lfhj4pdkxuyvghq5dlgt	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	57	2027-04-08 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_89pkb6kgsrpopfvgbpeq	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	58	2027-04-13 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_shlvt2m8wx8s8bv6z7s5	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	59	2027-04-15 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_q4ljhli64a2k7kvt0m0o	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	60	2027-04-20 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_sdg79dzcd85dafqpcfgz	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	61	2027-04-22 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_e82p8rdogj4kv82yx7hf	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	62	2027-04-27 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_l6mvqcicq5g92llgmk0f	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	63	2027-04-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_d8yzi99d36c3pl07vf16	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	64	2027-05-04 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_gvc0fnsz14whprsg7u3e	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	65	2027-05-06 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_aqc2a4bw9eduu2p2kwl4	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	66	2027-05-11 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_v84viou5jz6v5la0tn8a	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	67	2027-05-13 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_hxcqetsjod9bm6hcbxqe	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	68	2027-05-18 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_bilmxmbe4qx0kt1o5v5t	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	69	2027-05-20 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_z1lobr9fkv8xh2oc4pnx	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	70	2027-05-25 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_tq8d9ac2d7kubheczc8y	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	71	2027-05-27 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_94k943hid4epuop1u1by	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	72	2027-06-01 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_llpg6h3d8z6jrzqabfar	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	73	2027-06-03 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_dewgf1a6ru9gmrv35yer	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	74	2027-06-08 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_0dr5d20whxxgyzp26cwe	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	75	2027-06-10 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_737unnvsvkv52j3ag7yn	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	76	2027-06-15 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_3j2gi5erqzb3wu1nvu6t	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	77	2027-06-17 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_rp0b5yhf369bueh9vaa5	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	78	2027-06-22 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_0x7fjipt2nfs5qp73qld	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	79	2027-06-24 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_yzgvp6nuy6xznspyjrzz	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	80	2027-06-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_fwt10xrnrll4g1fmurzq	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	81	2027-07-01 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_knakdc3zhrbis25623qe	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	82	2027-07-06 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_807gfsdrnzfvqdant55p	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	83	2027-07-08 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_jmreq328lmayv8kl499l	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	84	2027-07-13 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_fyfjmznbrvweua9bn84r	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	85	2027-07-15 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_r96mpkj36n8o6xagnvdh	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	86	2027-07-20 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_um6t9a8rf4txf755mkjy	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	87	2027-07-22 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_i8yc75nlhhn1g6c3i5vv	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	88	2027-07-27 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_j4t4yt36wca5i43uh70n	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	89	2027-07-29 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_cjsa4fgtcpbkr3wrk7ky	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	90	2027-08-03 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_to4khlp4u6srxrjno761	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	91	2027-08-05 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_fow40qk90s6d85drsvrg	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	92	2027-08-10 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_k0k6mu9g9rxl99mv3aah	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	93	2027-08-12 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_ntf7rl6v05nb1zi25ek4	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	94	2027-08-17 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_vdp703yeaknesne9ez5e	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	95	2027-08-19 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_z9gw3tyzlbaqjjaogz2w	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	96	2027-08-24 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_fq9z2awq5j38j8jk9arw	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	97	2027-08-26 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_myqfe4hly85inxr1xoty	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	98	2027-08-31 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_9l1rtdfxquk75mbzh3tv	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	99	2027-09-02 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_wvz6itvb8unzpxqbbwol	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	100	2027-09-07 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_72frdzazm8lazpqsg6yv	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	101	2027-09-09 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_urwan33jvofh35vkut3n	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	102	2027-09-14 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_z4pjz2xa10ac1gjtkxmf	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	103	2027-09-16 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_rv61ssrb5jl9ltq3h55e	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	104	2027-09-21 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
cls_i8h5e3whswwm4126tyup	org_y0txnlv69l6vp70ey06b	coh_tgqs0kohcxfg54jlf8gd	105	2027-09-23 03:00:00	12:25	14:27	2	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	2026-09-24 15:26:57.524111	2026-09-24 15:26:57.524111	\N	\N	\N
\.


--
-- Data for Name: cohort; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cohort (id, organization_id, course_id, start_date, end_date, capacity, whatsapp_group_link, status, created_at, updated_at, teacher_id, cost, frequency, classroom, name, start_time, end_time, days_of_week, currency, min_attendance_pct, meeting_url, virtual_room_id, parent_cohort_id, "position", is_specialization) FROM stdin;
coh_q37c918zbpx0au3eolbq	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-09-24 00:00:00	2027-09-24 00:00:00	\N	\N	planificada	2026-09-24 15:21:48.330256	2026-09-24 15:21:48.330256	\N	25000	\N	\N	EBIM 15	\N	\N	\N	UYU	\N	\N	\N	\N	\N	t
coh_tgqs0kohcxfg54jlf8gd	org_y0txnlv69l6vp70ey06b	crs_3rvis8fhzjqj4c45y9pl	2026-09-24 00:00:00	2027-09-24 00:00:00	\N	\N	planificada	2026-09-24 15:26:01.791946	2026-09-24 15:26:01.791946	tch_tgh5y0gv4nn5ycny9lyw	\N	\N	\N	Módulo 2	12:25	14:27	1,3	UYU	\N	\N	\N	coh_q37c918zbpx0au3eolbq	20	f
coh_o0wif02yng8jx045ofc5	org_y0txnlv69l6vp70ey06b	crs_alv3pmlqlhohwf2e3mia	2026-08-12 00:00:00	2026-09-23 00:00:00	10	\N	planificada	2026-09-02 19:55:53.861376	2026-09-04 15:50:06.499	tch_cjk87xea142wsnmdezy4	24000	Lunes y miércoles de 18:30 a 20:30	Aula demo	[DEMO] Camada de prueba	18:30	20:30	0,2	UYU	75	https://zoom.us/j/RECURRENTE-DEMO	aula_g2xkghmg5hx937s4xkyi	\N	\N	f
coh_2mtrin842axs6j9uodgc	org_y0txnlv69l6vp70ey06b	crs_7b7cs4ikva735avvxvwe	2026-09-24 00:00:00	2027-09-24 00:00:00	\N	\N	planificada	2026-09-24 15:25:34.401803	2026-09-24 15:25:34.401803	tch_sl39f4ns1va4lo0oushl	\N	\N	\N	Modulo 1	12:25	14:27	1,4	UYU	\N	\N	aula_nmxgmvavq9h0hz8fkoi7	coh_q37c918zbpx0au3eolbq	10	f
coh_sl0hpv9bnhpyecb5uaw1	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-02-02 00:00:00	2026-03-25 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	Lunes, miércoles y viernes 9:00 a 11:00	1	Revit Arquitectura - 1	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_rgufdre6lab441xxahlc	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-06-30 00:00:00	2026-09-15 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves 9:00 a 11:00	1	Revit Arquitectura 4	09:00	11:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_cwt9u68z4utu1t54l8x7	org_y0txnlv69l6vp70ey06b	crs_pe9at2dykyaefsvuf15u	2026-01-29 00:00:00	2026-03-05 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	jueves 10:00 a 12:00 (9:00 a 11:00 horario rep dom)	1	Taller DOCS + BIM Coll- 2	10:00	12:00	3	UYU	\N	\N	\N	\N	\N	f
coh_8k3o186fttv1xn4qydc4	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-06-29 00:00:00	2026-07-31 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes 9:00 a 11:00	2	AutoCAD 2D - 3	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_ydka81s7x8kixtq95vsm	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-08-11 00:00:00	2026-10-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves de 1830 a 2030	1	Revit Arquitectura 5	18:30	20:30	1,3	UYU	\N	\N	\N	\N	\N	f
coh_0t6rtyqrmmrfzf2ybxgd	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-05-11 00:00:00	2026-07-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 15:00 a 17:00	1	Revit Arquitectura 3	15:00	17:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_xld7rf296n1u8koji1qu	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-03-17 00:00:00	2026-06-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves de 18:30 a 20:30	1	Revit Arquitectura - 2	18:30	20:30	1,3	UYU	\N	\N	\N	\N	\N	f
coh_zrac9hihrmdtqy5zgroc	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-05-12 00:00:00	2026-09-18 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	2025 - EBIM V.12	\N	\N	\N	UYU	\N	\N	\N	\N	\N	f
coh_7ulnveocww219sh44h09	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-04-22 00:00:00	2026-12-20 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	lunes y miércoles de 18:30 a 20:30	\N	EBIM 13	18:30	20:30	0,2	UYU	\N	\N	\N	\N	\N	f
coh_kg9vtmfdvnqyh4vts65f	org_y0txnlv69l6vp70ey06b	crs_s23vpc9fs2t4u48910zx	2026-07-29 00:00:00	2026-12-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 16:30 a 18:30	1	Revit Arq + Revit Estructura + Revit MEP	16:30	18:30	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_wd2nkb1uorc4djcrjdfc	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-04-20 00:00:00	2026-06-01 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes de 9:00 a 11:00	2	AutoCAD 2D - 2	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_7j07dkq1zqp7ta2di1u2	org_y0txnlv69l6vp70ey06b	crs_u4ajg3bfqfwfdom3x8hd	2026-07-14 00:00:00	\N	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	martes y jueves de 14:00 a 16:00	\N	CAPACITACION AP3D - NUBE DE PUNTOS	14:00	16:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_nov7nfvbqq0bzhjm4xid	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-02-02 00:00:00	2026-03-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes 9:00 a 11:00	2	AutoCAD 2D - 1	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_mepgc3e063trbzr24o7r	org_y0txnlv69l6vp70ey06b	crs_9q5kc25b0tgo0osgztec	2026-08-10 00:00:00	2026-10-12 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 14:00 a 16:00	1	Revit  MEP 1	14:00	16:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_jwy2sja5eq1g393rve3d	org_y0txnlv69l6vp70ey06b	crs_h2nynx0r2ad3j3h9zs0d	2026-01-27 00:00:00	2026-03-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:00 a 12:00 (9:00 a 11:00 horario rep dom)	1	Taller DOCS + BIM Coll- 1	10:00	12:00	1	UYU	\N	\N	\N	\N	\N	f
coh_22o5q4dmzp3c0fw2i0rr	org_y0txnlv69l6vp70ey06b	crs_3rvis8fhzjqj4c45y9pl	2026-08-03 00:00:00	2026-09-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_2wg1x96c6zbtkxntp77c	\N	lunes, miércoles y viernes de 15:00 a 17:00	2	Civil 3D	15:00	17:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_85l5fveocl6msnly21a0	org_y0txnlv69l6vp70ey06b	crs_3rvis8fhzjqj4c45y9pl	2026-03-16 00:00:00	2026-05-13 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_2wg1x96c6zbtkxntp77c	\N	lunes y miércoles de 9:00 a 11:00	2	Civil 3D	09:00	11:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_1san16fz6pubi2jizpap	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-07-14 00:00:00	2026-08-31 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	AutoCAD Plant 3D - 2	\N	\N	\N	UYU	\N	\N	\N	\N	\N	f
coh_1ywhmtllljcb78h0slij	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-07-27 00:00:00	2026-08-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes y miércoles de 14:30 a 17:30 y viernes de 13:30 a 17:30	\N	AutoCAD PLANT	14:30	17:30	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_uywkr3hq0o0ydfx6azx7	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-09-07 00:00:00	2026-10-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 9:00 a 11:00	3	AutoCAD 2D - 4	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_j1qdgpt23p89pxxc7aig	org_y0txnlv69l6vp70ey06b	crs_kyz1ukzsz8rd7m2vtjup	2026-04-09 00:00:00	2026-04-21 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:30 a 12:30 y jueves 9:0.0 a 11:00	1	Taller DOCS	10:30	12:30	1,3	UYU	\N	\N	\N	\N	\N	f
coh_kcdropxtyo32kpqqddg3	org_y0txnlv69l6vp70ey06b	crs_2iglohhtk1w3w9welsr5	2026-04-07 00:00:00	2026-06-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_tgh5y0gv4nn5ycny9lyw	\N	martes y jueves de 9:00 a 11:00	4	Inventor	09:00	11:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_tf9ckgcjesdoen42ak0h	org_y0txnlv69l6vp70ey06b	crs_kvknjfarzcvxrbgs8bu5	2026-02-10 00:00:00	2026-03-17 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_0jizhz7uamo9bayglfxb	\N	lunes, miércoles y vienres de 9:00 a 11:00	3	Revit Estructura	09:00	11:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_dcmroictyg8bin81ouq3	org_y0txnlv69l6vp70ey06b	crs_nzl4khq2vx64oatqe2gg	2026-02-10 00:00:00	2026-03-24 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves 16:00 a 18:00	1	Proyecto Ejecutivo con REVIT	16:00	18:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_43zed46s1cxhwfuu3xdx	org_y0txnlv69l6vp70ey06b	crs_3cfqj4ncoq8pnzdvdplj	2026-03-16 00:00:00	2026-03-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes, miércoles y viernes de 9 a 13	\N	Fusion	\N	\N	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_o500qyj1yvnorghwptun	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-06-01 00:00:00	2026-06-24 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes y miércoles de 13:00 a 17:00	\N	AutoCAD PLANT	13:00	17:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_jtbgl4phwuh6qtbj9hkf	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-09-29 00:00:00	2027-04-01 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	martes y jueves de 18:30 a 20:30	\N	EBIM 14	18:30	20:30	1,3	UYU	\N	\N	\N	\N	\N	f
coh_aas6nhly9bgr81bq09ql	org_y0txnlv69l6vp70ey06b	crs_f8aviwzruxbce1k7u9v6	2026-01-19 00:00:00	2026-02-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	Lunes, miércoles y jueves de 16:00 a 18:00	1	Revit Electrical	16:00	18:00	0,2,3	UYU	\N	\N	\N	\N	\N	f
coh_939u17ifmjfns7pr40d2	org_y0txnlv69l6vp70ey06b	crs_am73cm3h95e5tfrcza62	2026-02-09 00:00:00	2026-03-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 16:00 a 18:00	1	Revit FAMILIA	16:00	18:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_z9zwwkuo4w9cjvj84vor	org_y0txnlv69l6vp70ey06b	crs_2iglohhtk1w3w9welsr5	2026-08-10 00:00:00	2026-09-23 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	lunes, miércoles y viernes de 9:00 a 11:00	\N	Inventor	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
coh_iarbf4v6itw2ewunjwlb	org_y0txnlv69l6vp70ey06b	crs_kvknjfarzcvxrbgs8bu5	2026-08-03 00:00:00	2026-09-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_0jizhz7uamo9bayglfxb	\N	lunes y miércoles de 16:30 a 18:30	3	Revit Estructura	16:30	18:30	0,2	UYU	\N	\N	\N	\N	\N	f
coh_dsk8k484pa43py216cpr	org_y0txnlv69l6vp70ey06b	crs_d110qd4kuva3yj9usqde	2026-01-19 00:00:00	2026-02-23 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	Taller Revit Electrical	\N	\N	\N	UYU	\N	\N	\N	\N	\N	f
coh_g28y7xhfwhvtzqzge63p	org_y0txnlv69l6vp70ey06b	crs_qijayeof17p71rwtt3y0	2026-02-11 00:00:00	2026-05-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	BUILD - HandsON PY	\N	\N	\N	UYU	\N	\N	\N	\N	\N	f
coh_pvzhsfwl145zkoc982dv	org_y0txnlv69l6vp70ey06b	crs_nu47757ykvons2xx1nje	2026-01-27 00:00:00	2026-03-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:00 a 12:00	1	Taller BONITA BEACH 1	10:00	12:00	1	UYU	\N	\N	\N	\N	\N	f
coh_8m433a0t9rhmqv7e7uwp	org_y0txnlv69l6vp70ey06b	crs_x76pxtm908ofniphypj2	2026-01-29 00:00:00	2026-03-05 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	jueves 10:00 a 12:00	1	Taller BONITA BEACH 2	10:00	12:00	3	UYU	\N	\N	\N	\N	\N	f
coh_25o5mqnsu7mitmlrr0je	org_y0txnlv69l6vp70ey06b	crs_awo8z4lm4g5uykgxeax1	2026-06-30 00:00:00	2026-07-16 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves 15:00 a 17:00	presencial	Twinmotion	15:00	17:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_i8c0a9tmibtdcfz9zv2a	org_y0txnlv69l6vp70ey06b	crs_675hlj4lf0n981c21k6v	2026-07-27 00:00:00	2026-08-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miercoles 9:00 a 11:00	1	Taller Mi Primer BIM	09:00	11:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_b2hj22vygccz179bz0a2	org_y0txnlv69l6vp70ey06b	crs_sjrguxdhjetu5amhkyda	2026-07-29 00:00:00	\N	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	Revit - Zulamian	\N	\N	\N	UYU	\N	\N	\N	\N	\N	f
coh_fg1r6mpdbs5ssuusq9o5	org_y0txnlv69l6vp70ey06b	crs_am73cm3h95e5tfrcza62	2026-08-18 00:00:00	2026-09-08 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-09-02 19:27:17.556	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves de 14:00 a 16:00	1	Revit Familias	14:00	16:00	1,3	UYU	\N	\N	\N	\N	\N	f
coh_rfautax494zvjxlbtis8	org_y0txnlv69l6vp70ey06b	crs_ffmn1fkujlw6sy2g9enx	2026-08-24 00:00:00	2026-09-28 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-09-04 18:34:07.912	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 9:00 a 11:00	1	Revit Avanzado	09:00	11:00	0,2	UYU	\N	\N	\N	\N	\N	f
coh_t2pyxowjji94k5vboph4	org_y0txnlv69l6vp70ey06b	crs_9q5kc25b0tgo0osgztec	2026-10-19 09:00:00	2026-12-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 9:00 a 11:00	\N	Revit MEP 2	09:00	11:00	0,2,4	UYU	\N	\N	\N	\N	\N	f
\.


--
-- Data for Name: cohort_software; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cohort_software (cohort_id, software_id, organization_id) FROM stdin;
coh_rfautax494zvjxlbtis8	sw_mfc8dn692pimlpfzabcm	org_y0txnlv69l6vp70ey06b
coh_2mtrin842axs6j9uodgc	sw_mfc8dn692pimlpfzabcm	org_y0txnlv69l6vp70ey06b
\.


--
-- Data for Name: company; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.company (id, organization_id, legal_name, tax_id, created_at, updated_at) FROM stdin;
cia_8hnkuz1ko9twztv731p1	org_y0txnlv69l6vp70ey06b	Intendencia Departamental de Durazno	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896
cia_9198qa28d3i99t4jmgot	org_y0txnlv69l6vp70ey06b	ANCAP	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896
cia_51x2td2pj0ckjpf7uhoq	org_y0txnlv69l6vp70ey06b	Berkes	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896
cia_43upei40tsidwvmfh9kt	org_y0txnlv69l6vp70ey06b	Zulamian	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896
cia_c841pe4z8kvys4hirww4	org_y0txnlv69l6vp70ey06b	PAEMFE	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896
\.


--
-- Data for Name: contact; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contact (id, organization_id, phone, notes, archived_at, created_at, updated_at, wa_identity, wa_user_id, source, utm_campaign, email, national_id, first_name, last_name) FROM stdin;
ct_6z2cdwqromj4rz56cuay	org_y0txnlv69l6vp70ey06b	59899000001	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	59899000001	\N	\N	\N	alumno.demo@ejemplo.test	\N	[DEMO] Alumno	Demo
ct_vzcwcvzk7a4cs0ymdjn0	org_y0txnlv69l6vp70ey06b	595981271428	\N	\N	2026-08-17 15:53:14.645896	2026-08-27 18:39:16.734	595981271428	\N	importación:CSV 2026	\N	eschaves93@gmail.com	3.985.979	Esther Emilia	Chaves Bogado
ct_0133t8keomdz48yjpq26	org_y0txnlv69l6vp70ey06b	59899725527	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899725527	\N	importación:CSV 2026	\N	romiitecco@gmail.com	5267808-5	Romina	De los Santos
ct_emcyly83ztjpfgc1go4w	org_y0txnlv69l6vp70ey06b	59899503448	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899503448	\N	importación:CSV 2026	\N	francosantos.10@gmail.com	5.115.461-2	Franco	Santos
ct_k03bmmvktxxcecc8rq02	org_y0txnlv69l6vp70ey06b	59895426731	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895426731	\N	importación:CSV 2026	\N	arq.belenlemos@gmail.com	4.959.844-2	Maria Belen	Lemos Basanta
ct_5e4txam9jkv72xoi9xjn	org_y0txnlv69l6vp70ey06b	59898389044	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898389044	\N	importación:CSV 2026	\N	arq.eduardomingroni@gmail.com	5.074.901-8	Eduardo	Mingroni
ct_upudzbdndawnh6gexj9o	org_y0txnlv69l6vp70ey06b	59899889305	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899889305	\N	importación:CSV 2026	\N	arq.barbaradesouza@outlook.com	50390746	Bárbara Milena	De Souza Rodríguez
ct_fz2hf9uqbvxtlf8n5trj	org_y0txnlv69l6vp70ey06b	595986939294	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595986939294	\N	importación:CSV 2026	\N	gabrielortiz256@gmail.com	8.627.479	Gabriel	Ortiz
ct_8wblmsom0tx2aa8kch8m	org_y0txnlv69l6vp70ey06b	595981143220	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981143220	\N	importación:CSV 2026	\N	yaninavbrendler@gmail.com	5074418	Yanina Vanesa	Brendler Groos
ct_eisi1chv7o33wm0120w9	org_y0txnlv69l6vp70ey06b	59891383814	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891383814	\N	importación:CSV 2026	\N	ing.jpr@gmail.com	45084552	Jesús	Piñeyro
ct_g3yknsnigavx7bf504j0	org_y0txnlv69l6vp70ey06b	595982195693	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595982195693	\N	importación:CSV 2026	\N	emi.leiva68@gmail.com	4.514.711	Maria	Emilia Leiva
ct_csc1ii0xcqw94cj50ksf	org_y0txnlv69l6vp70ey06b	59897153988	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897153988	\N	importación:CSV 2026	\N	martinreynaldo@outlook.es	51999353	Martín	Reynaldo
ct_5yi00tswejlfsx1oxkv5	org_y0txnlv69l6vp70ey06b	59898900471	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898900471	\N	importación:CSV 2026	\N	marmalaquin@gmail.com	4.709.149-2	Marcela	Malaquín
ct_g7pa2737u8tendfex3bb	org_y0txnlv69l6vp70ey06b	59891637575	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891637575	\N	importación:CSV 2026	\N	arq.moralespaz@outlook.com	57204875	Emiliano	Moralez Paz
ct_kzcahp8j8foljjnb3sky	org_y0txnlv69l6vp70ey06b	59894126482	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894126482	\N	importación:CSV 2026	\N	creisch1976@gmail.com	1.802.596-1	Cesar	Reisch
ct_wtm4qzhg4mz1qjhn1zd3	org_y0txnlv69l6vp70ey06b	59898984596	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898984596	\N	importación:CSV 2026	\N	gortegaba@gmail.com	2.780.160-5	Gonzalo	Ortega
ct_941m2jnq7h7gimf1u4bs	org_y0txnlv69l6vp70ey06b	59899427797	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899427797	\N	importación:CSV 2026	\N	arqmpintos@gmail.com	3.704.276-6	Marcos	Pintos
ct_ur7p0ehsr6u7tt0iphol	org_y0txnlv69l6vp70ey06b	59892672911	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892672911	\N	importación:CSV 2026	\N	julietabove22@hotmail.com	5489798-6	Julieta	Bove González
ct_si9io0z4crn7m6rzjc0t	org_y0txnlv69l6vp70ey06b	59891853053	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891853053	\N	importación:CSV 2026	\N	florbrenda28@gmail.com	5.213.130-8	Florencia	Madera Freitas
ct_vsyctzhjt1o7y8zia7rw	org_y0txnlv69l6vp70ey06b	59894753506	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894753506	\N	importación:CSV 2026	\N	agusm4842@gmail.com	5495729-3	Agustina	Méndez
ct_5uaksd3bubuamk2trueh	org_y0txnlv69l6vp70ey06b	59891352269	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891352269	\N	importación:CSV 2026	\N	martumirandasotelo@gmail.com	54366541	Martina	Miranda Sotelo
ct_9upch4qkf72panbposye	org_y0txnlv69l6vp70ey06b	59899641056	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899641056	\N	importación:CSV 2026	\N	trinicastro702@gmail.com	5172498-8	Trinidad	Castro Freira
ct_eolzsj2d5z6n1mwfbxrp	org_y0txnlv69l6vp70ey06b	59898112712	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898112712	\N	importación:CSV 2026	\N	lucia.diaz@arca.com.uy	4.654.839-7	Lucia	Diaz
ct_4knc0ilipcuryn9ydree	org_y0txnlv69l6vp70ey06b	59899857845	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899857845	\N	importación:CSV 2026	\N	palomeque.mafe@gmail.com	4.516.610-8	Maria Fernanda	Palomeque
ct_lb2i9icvy020cgzyxp9d	org_y0txnlv69l6vp70ey06b	59891234234	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891234234	\N	importación:CSV 2026	\N	paulimietto@gmail.com	5.240.879-5	Paulina	Mietto
ct_rh8htdhawm7cknnooyla	org_y0txnlv69l6vp70ey06b	59892983757	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892983757	\N	importación:CSV 2026	\N	jonathan.fernandez.anana@gmail.com	4.508.035-2	Jonathan	Añaña
ct_32piiek47jg5q9cqdsb9	org_y0txnlv69l6vp70ey06b	59897350253	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897350253	\N	importación:CSV 2026	\N	arambarri.2001@gmail.com	52866834	Andres	Arambarri
ct_7a0hq42x8vlycho17hng	org_y0txnlv69l6vp70ey06b	595976381555	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595976381555	\N	importación:CSV 2026	\N	anarojas@fiscrea.com.py	5.217.652	Ana	Rojas
ct_p4z8vpzm4ymvraasjtz7	org_y0txnlv69l6vp70ey06b	595983497997	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595983497997	\N	importación:CSV 2026	\N	danilourbieta@fiscrea.com.py	4.480.611	Danilo	Urbieta
ct_4fonyo8bxvo029mf0h8p	org_y0txnlv69l6vp70ey06b	595994544267	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595994544267	\N	importación:CSV 2026	\N	josemartinez@fiscrea.com.py	6.575.714	Jose	Junior Martinez
ct_ok2eypxm0g6yqmv4c84o	org_y0txnlv69l6vp70ey06b	595961788144	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595961788144	\N	importación:CSV 2026	\N	karinalarrosa@fiscrea.com.py	3.204.771	Karina	Larrosa
ct_bgcttxjnqh0t7uh3up49	org_y0txnlv69l6vp70ey06b	595986139634	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595986139634	\N	importación:CSV 2026	\N	luisbenitez@fiscrea.com.py	4.740.329	Luis	Benitez
ct_7cu3sq94htl3o0zfnwhz	org_y0txnlv69l6vp70ey06b	595974138882	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595974138882	\N	importación:CSV 2026	\N	martinpistilli@fiscrea.com.py	4.438.767	Martin	Pistilli
ct_vd3ury62v662vqkxgjfz	org_y0txnlv69l6vp70ey06b	595976265871	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595976265871	\N	importación:CSV 2026	\N	nathaliajimenez@fiscrea.com.py	6.717.842	Nathalia Ines	Jimenez Leguizamon
ct_sktyyq9fnz0o3y0h5gms	org_y0txnlv69l6vp70ey06b	59898397725	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898397725	\N	importación:CSV 2026	\N	flrod2312@gmail.com	4.864949-2	Florencia	Rodriguez
ct_n1k0tue7qlghv06vim5e	org_y0txnlv69l6vp70ey06b	59898123110	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898123110	\N	importación:CSV 2026	\N	mateocastro1022@gmail.com	5.498.938-1	Mateo	Castro Benítez
ct_u9igjbj7mld7lmd82ai7	org_y0txnlv69l6vp70ey06b	59898426431	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898426431	\N	importación:CSV 2026	\N	iriartevalentina0603@gmail.com	5.333.006-4	Valentina	Iriarte
ct_0gr08xdgya9q5q3soxz2	org_y0txnlv69l6vp70ey06b	59898485501	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898485501	\N	importación:CSV 2026	\N	santiagomd124@gmail.com	5.152.924-1	Santiago	Morales Dovat
ct_dbvs7vu5d7dctdc6i48m	org_y0txnlv69l6vp70ey06b	59891648178	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891648178	\N	importación:CSV 2026	\N	kurtaagustina2008@gmail.com	5718912-8	Agustina	Kurta
ct_d7yime2jqexoz5w72jsp	org_y0txnlv69l6vp70ey06b	59899323397	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899323397	\N	importación:CSV 2026	\N	v.slyomovich@gmail.com	2548078-0	Veronica	Slyomovich
ct_ezah637ulplhzkyatqdf	org_y0txnlv69l6vp70ey06b	59895202995	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895202995	\N	importación:CSV 2026	\N	daisyjmj2004@gmail.com	56907579	Daisy	Rodriguez
ct_7yc37q2ijrdmot148vsw	org_y0txnlv69l6vp70ey06b	59899380580	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899380580	\N	importación:CSV 2026	\N	gbelhot.arq@gmail.com	4.082.529-2	Gustavo Adolfo	Belhot Rivero
ct_aerznjwghbkj8ye4s93t	org_y0txnlv69l6vp70ey06b	59899362659	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899362659	\N	importación:CSV 2026	\N	sainziriondo@gmail.com	2.981.794-9	Javier	Sainz Iriondo
ct_3cnyyonxdhz30gkqohjj	org_y0txnlv69l6vp70ey06b	59899659505	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899659505	\N	importación:CSV 2026	\N	\N	3.808.911 -5	Camilo Luzardo,	María Eugenia
ct_6mdisjacv5rrmnj8kln1	org_y0txnlv69l6vp70ey06b	59893424823	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893424823	\N	importación:CSV 2026	\N	antonellalombardo10@gmail.com	5.224.231-3	Antonella	Lombardo
ct_nfkibqyhptk1ejyj31ij	org_y0txnlv69l6vp70ey06b	595981177722	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981177722	\N	importación:CSV 2026	\N	aden95@outlook.com	4752442	Anwar David	Espinola
ct_8qi2jrxa538rk49ii7a1	org_y0txnlv69l6vp70ey06b	59899575224	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899575224	\N	importación:CSV 2026	\N	mariainesmorato@gmail.com	\N	Maria	Morato
ct_ra3ga657hrde0x8worw1	org_y0txnlv69l6vp70ey06b	59894269801	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894269801	\N	importación:CSV 2026	\N	fscalabrino@disco.com.uy	5063362-7	Franco	Scalabrino
ct_8dgagzpktt103cz85ng3	org_y0txnlv69l6vp70ey06b	59898963313	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898963313	\N	importación:CSV 2026	\N	soliveira@ancap.com.uy	53384554	OLIVEIRA	GOMEZ,SARA BELEN
ct_qa9ax4jrxltjuc51pdnk	org_y0txnlv69l6vp70ey06b	59898861716	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898861716	\N	importación:CSV 2026	\N	alemaire@ancap.com.uy	42437601	LEMAIRE	GUIGOU,ANDRES SEBASTIAN
ct_3f05ahiheid0ykus1ea6	org_y0txnlv69l6vp70ey06b	59898336815	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898336815	\N	importación:CSV 2026	\N	cdossanto@ancap.com.uy	43440823	Christian	Dos Santos
ct_opb6yjpssdbvx61fpman	org_y0txnlv69l6vp70ey06b	59899097581	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899097581	\N	importación:CSV 2026	\N	spardinas@ancap.com.uy	44143080	Santiago	Pardiñas
ct_dffl4k37j5j6f30ezqlf	org_y0txnlv69l6vp70ey06b	59895753632	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895753632	\N	importación:CSV 2026	\N	gnievas@ancap.com.uy	29346518	NIEVAS	DIPERNA,GENARO GABRIEL
ct_wgxtyp1bufhn65m9e9lg	org_y0txnlv69l6vp70ey06b	59891359563	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891359563	\N	importación:CSV 2026	\N	lpuchetta@ancap.com.uy	45127865	Leonardo	Puchetta
ct_h9fut7276e783jhinqmd	org_y0txnlv69l6vp70ey06b	59892769487	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892769487	\N	importación:CSV 2026	\N	ngandini@ancap.com.uy	45501534	GANDINI	GONZALEZ,NICOLAS
ct_zhxbwzg25o3msb31pnu4	org_y0txnlv69l6vp70ey06b	59898496794	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898496794	\N	importación:CSV 2026	\N	maxcabrera@ancap.com.uy	45174090	CABRERA	ALVAREZ,MAXIMILIANO JAVIER
ct_7hu7yqp1sfnq4up34s5u	org_y0txnlv69l6vp70ey06b	59898774429	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898774429	\N	importación:CSV 2026	\N	ccunetti@ancap.com.uy	17049398	Andres	Cuñetti
ct_g7qdxcf334d2pm24vzmo	org_y0txnlv69l6vp70ey06b	59891800076	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891800076	\N	importación:CSV 2026	\N	juguarino@ancap.com.uy	48653645	Juan	Guarino
ct_38tp3vw78qjeaqvujysm	org_y0txnlv69l6vp70ey06b	59899748210	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899748210	\N	importación:CSV 2026	\N	lventurino@ancap.com.uy	30885690	VENTURINO	CERINI,LUIS SEBASTIAN
ct_ot6tshbxt6qo80nbx41x	org_y0txnlv69l6vp70ey06b	59899196496	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899196496	\N	importación:CSV 2026	\N	tpirez@ancap.com.uy	46007539	PIREZ	SANCHEZ,TAMARA
ct_o0z0jt4s9g4297kglx8k	org_y0txnlv69l6vp70ey06b	59898240274	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898240274	\N	importación:CSV 2026	\N	rialvarez@ancap.com.uy	42489557	ALVAREZ	DELGADO,RICARDO
ct_gv7k3b2tgp3np16hxrmj	org_y0txnlv69l6vp70ey06b	59892463242	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892463242	\N	importación:CSV 2026	\N	rubsilva@ancap.com.uy	44019629	Ruben	Silva
ct_e185ppup48ygqh652nzo	org_y0txnlv69l6vp70ey06b	59899786222	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899786222	\N	importación:CSV 2026	\N	rguazzo@ancap.com.uy	45832442	Ronald	Guazzo
ct_wh7o5f78d3dghltj63tb	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:kerly.ochoa@bwe.uy	\N	importación:CSV 2026	\N	kerly.ochoa@bwe.uy	\N	Kerly	Ochoa
ct_8wm3mtb6861l697ng61n	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:ayeuriano@gmail.com	\N	importación:CSV 2026	\N	ayeuriano@gmail.com	\N	Ayelen	Uriano
ct_a1g601fn42ta1j2i9mft	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:fcaporuiz@gmail.com	\N	importación:CSV 2026	\N	fcaporuiz@gmail.com	\N	Federico	Capó
ct_qst1onjsvxr9b6oqxo7d	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:julieta.irazusta@bwe.uy	\N	importación:CSV 2026	\N	julieta.irazusta@bwe.uy	\N	Julieta	Irazusta
ct_ow1imb4uoc6r9aq26464	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:mathias.canepa@bwe.uy	\N	importación:CSV 2026	\N	mathias.canepa@bwe.uy	\N	Mathias	Canepa
ct_l7zu83mlwztpaccovroy	org_y0txnlv69l6vp70ey06b	\N	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	import:agustina.pisciottano@bwe.uy	\N	importación:CSV 2026	\N	agustina.pisciottano@bwe.uy	\N	Agustina	Pisciottano
ct_jibuii82lzjxq1tzukjp	org_y0txnlv69l6vp70ey06b	59892468805	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892468805	\N	importación:CSV 2026	\N	mgoux@zulamian.com	4.914.379-0	Maria	Goux
ct_k6lyyndc43c65cuewxs1	org_y0txnlv69l6vp70ey06b	59891055414	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891055414	\N	importación:CSV 2026	\N	hbatista@zulamian.com	4.184.304-7	Hector	Batista
ct_esqks78h1rxeowbu8oc7	org_y0txnlv69l6vp70ey06b	59898722358	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898722358	\N	importación:CSV 2026	\N	joherrera@zulamian.com	5.164.365-9	Joaquin	Herrera
ct_rqdf5wdnhisj1fwt86cd	org_y0txnlv69l6vp70ey06b	59899173437	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899173437	\N	importación:CSV 2026	\N	sbaumgartner@zulamian.com	4.718.509-9	Sofia	Baumgartner
ct_sk22abcjuzk01ljfkxn0	org_y0txnlv69l6vp70ey06b	59895721513	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895721513	\N	importación:CSV 2026	\N	rgayol@zulamian.com	5.296.426-4	Ramiro	Gayol
ct_zdvvwq7p8z46oif99bq8	org_y0txnlv69l6vp70ey06b	59899162848	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899162848	\N	importación:CSV 2026	\N	jherrera@zulamian.com	2.619.665-7	Javier	Herrera
ct_ravr80wapkzolkbx460u	org_y0txnlv69l6vp70ey06b	59893433216	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893433216	\N	importación:CSV 2026	\N	jgesuele@zulamian.com	4.750.355-6	Joaquina	Gesuele
ct_m78k0262xcdcukbls9li	org_y0txnlv69l6vp70ey06b	59898909926	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898909926	\N	importación:CSV 2026	\N	ajacovenco@zulamian.com	4.383.136-1	Alexis	Jacovenco
ct_ou4m4qyob4tz95n8ibt6	org_y0txnlv69l6vp70ey06b	5989924985059893484085	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	5989924985059893484085	\N	importación:CSV 2026	\N	nbatista@zulamian.com	5.387.310-9	Naiara	Batista
ct_vimv2zr8vzx5rjgkyc4u	org_y0txnlv69l6vp70ey06b	59893451224	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893451224	\N	importación:CSV 2026	\N	jbalsamo@zulamian.com	4.640.076-1	Juan	Balsamo
ct_1b7162oyg2zdigekceas	org_y0txnlv69l6vp70ey06b	59899420411	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899420411	\N	importación:CSV 2026	\N	vfeed@zulamian.com	4.421.809-9	Victoria	Feed
ct_cjj36uysd3662yb6n6r1	org_y0txnlv69l6vp70ey06b	59898973428	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898973428	\N	importación:CSV 2026	\N	afinozzi@zulamian.com	2.977.309-6	Armando	Finozzi
ct_anj4jf0orojdvrmnavjg	org_y0txnlv69l6vp70ey06b	59899868459	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899868459	\N	importación:CSV 2026	\N	albojer@zulamian.com	3.197.686-0	Diego	Albojer
ct_31bibppwmzlpstprzqdb	org_y0txnlv69l6vp70ey06b	59893363785	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893363785	\N	importación:CSV 2026	\N	vteske@zulamian.com	5.067.404-3	Valentina	Teske
ct_gegvw8tdnwaauj1b018a	org_y0txnlv69l6vp70ey06b	59894422151	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894422151	\N	importación:CSV 2026	\N	mcoitino@zulamian.com	4.739.576-7	Mauro	Coitiño
ct_gvd3bb9s0pvcwv3o3x5h	org_y0txnlv69l6vp70ey06b	59894466468	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894466468	\N	importación:CSV 2026	\N	flavio.flores@durazno.gub.uy	5.866.050-3	Flavio César	Flores Del Villar
ct_ku8rvyf1e3o849e4n3ql	org_y0txnlv69l6vp70ey06b	59891446092	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891446092	\N	importación:CSV 2026	\N	sofiaalfaro.agrim@gmail.com	47932418	Sofía	Alfaro Vianna
ct_5epk3a3tx0emviicr8yz	org_y0txnlv69l6vp70ey06b	59899229574	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899229574	\N	importación:CSV 2026	\N	alvaromartinez735@gmail.com	5014609-2	Alvaro	Martinez
ct_b9p43i8ksuqc8huonk28	org_y0txnlv69l6vp70ey06b	59899301326	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899301326	\N	importación:CSV 2026	\N	v.aguilar.cerdena@gmail.com	4.798.835-4	Veronica	Aguilar
ct_4by72fp42lvrm96iiygx	org_y0txnlv69l6vp70ey06b	59891356779	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891356779	\N	importación:CSV 2026	\N	pablososa.colonia@gmail.com	3.952.636-0	Pablo Sosa	Sosa
ct_lb8whbhsnx2og714jppr	org_y0txnlv69l6vp70ey06b	595994354702	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595994354702	\N	importación:CSV 2026	\N	diego.gonzalez@itcsa.com.py	3.549.253	Diego	Gonzalez
ct_xl9nuxjwitpvgityfa3b	org_y0txnlv69l6vp70ey06b	595981850401	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981850401	\N	importación:CSV 2026	\N	pablo.yunis@itcsa.com.py	5264936	Pablo Daniel	Yunis Guerrero
ct_ygmvtyh4icoz3io2n61p	org_y0txnlv69l6vp70ey06b	59899622180	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899622180	\N	importación:CSV 2026	\N	ing.cgonzaleztorena@gmail.com	4.090.529-8	Carlos	Gonzalez
ct_ayl1old045d6u0aqr2ic	org_y0txnlv69l6vp70ey06b	59898036136	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898036136	\N	importación:CSV 2026	\N	abgitoburn@gmail.com	33834387	Aldo	Brun
ct_01iei4vbpxqh0j31axgp	org_y0txnlv69l6vp70ey06b	595992508077	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595992508077	\N	importación:CSV 2026	\N	edugonzalarre@gmail.com	5066989	Eduardo Fabián	González Larré
ct_vzptg6n4b5a8ytbkxpmu	org_y0txnlv69l6vp70ey06b	59891716647	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891716647	\N	importación:CSV 2026	\N	dani14071997@gmail.com	6.710.468-3	Daniela	Morales
ct_gihr3i524upftmkk14t1	org_y0txnlv69l6vp70ey06b	59892050260	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892050260	\N	importación:CSV 2026	\N	lm.arquitectura22@gmail.com	4.946.135-2	Lucia	Moreira Agradeño
ct_og1gsdc6gl46tq646syh	org_y0txnlv69l6vp70ey06b	59894069279	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894069279	\N	importación:CSV 2026	\N	melaniepiedra@hotmail.com	5.070.755-7	Melanie	Piedra
ct_0cynznz47x3zws0ltqoo	org_y0txnlv69l6vp70ey06b	59895876583	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895876583	\N	importación:CSV 2026	\N	marcejuarez824@gmail.com	4478046-8	Marcelo	Juarez
ct_n0x8sa6p8r76zd0dlhq0	org_y0txnlv69l6vp70ey06b	59898900724	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898900724	\N	importación:CSV 2026	\N	ceciliacabrer@gmail.com	25523510	Cecilia	Cabrera
ct_o7zxhvg9qggbjw6x0sgr	org_y0txnlv69l6vp70ey06b	59892470300	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892470300	\N	importación:CSV 2026	\N	artigtecturas@gmail.com	4766893-2	Giselle	Roque Artigas
ct_be23eluq87muu6mx0xa0	org_y0txnlv69l6vp70ey06b	59899379831	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899379831	\N	importación:CSV 2026	\N	dosantosbd2000@gmail.com	4996848-5	Belen	do Santos
ct_se2g6qjdwt0nukb6lvl4	org_y0txnlv69l6vp70ey06b	59897310663	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897310663	\N	importación:CSV 2026	\N	sebastiat97@gmail.com	67574739	Claudia	Sebastia Torres
ct_vhnhmyzk55gc3t2n63nr	org_y0txnlv69l6vp70ey06b	59893598660	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893598660	\N	importación:CSV 2026	\N	victoriaferreiraest@gmail.com	5539590-1	Victoria	Ferreira
ct_yrchsigfeusllevfaqli	org_y0txnlv69l6vp70ey06b	59891459885	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891459885	\N	importación:CSV 2026	\N	aricarnice19@gmail.com	56948923	Ariana	Carnicelli
ct_kvqs56xtax6vxdq6sv4g	org_y0txnlv69l6vp70ey06b	59891438063	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891438063	\N	importación:CSV 2026	\N	luciasuarezamoedo@gmail.com	56860969	Lucia	Suarez
ct_215aw1k3arcnyhsvhhb6	org_y0txnlv69l6vp70ey06b	59898630672	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898630672	\N	importación:CSV 2026	\N	esilvapintos@gmail.com	49281188	Emanuel	Silva Pintos
ct_my5dr0nr6pkpvcsqajtm	org_y0txnlv69l6vp70ey06b	59898637092	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898637092	\N	importación:CSV 2026	\N	vectornortedigital@outlook.com	4861695-2	Gabriel	Rodriguez Arregin
ct_missa3il818b2cmc80ji	org_y0txnlv69l6vp70ey06b	59896702243	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896702243	\N	importación:CSV 2026	\N	marianalau7@gmail.com	4.843.164-7	Mariana	Borda
ct_ugd1rdn2v2l69amiblna	org_y0txnlv69l6vp70ey06b	595983004047	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595983004047	\N	importación:CSV 2026	\N	fabrizio.espinola@itcsa.com.py	5300404	Fabrizio	Espinola Galli
ct_3o8drttlxgoif1ntnbmu	org_y0txnlv69l6vp70ey06b	595982926900	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595982926900	\N	importación:CSV 2026	\N	ana.mendiguren@itcsa.com.py	5640537	Ana	Mendiguren
ct_r16wwpyicaiey6ypjqhq	org_y0txnlv69l6vp70ey06b	59894478061	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894478061	\N	importación:CSV 2026	\N	lafferranderie.miranda@gmail.com	58604294	Miranda	Lafferranderie Carrara
ct_0jgc4lnen0vaynpw7mub	org_y0txnlv69l6vp70ey06b	59898342132	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898342132	\N	importación:CSV 2026	\N	luchimachado@gmail.com	5.122.765-1	Lucía	Machado Duarte
ct_2p8h9jhvvpbmpkxke16k	org_y0txnlv69l6vp70ey06b	59899894477	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899894477	\N	importación:CSV 2026	\N	fsalvadorpereira@gmail.com	56365975	Francisco Salvador	Pereira Gutiérrez
ct_wqhss598kd3zuwmlr626	org_y0txnlv69l6vp70ey06b	59891402124	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891402124	\N	importación:CSV 2026	\N	camilagomezsilva4@gmail.com	5475920-3	Camila	Gómez
ct_wro72i8fiiofqujxvpbn	org_y0txnlv69l6vp70ey06b	59899059882	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899059882	\N	importación:CSV 2026	\N	hugosangui3@gmail.com	4.272.834-1	Hugo	Sanguinetti
ct_8a0mtv6xd7lijwmvgrj8	org_y0txnlv69l6vp70ey06b	59893944254	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893944254	\N	importación:CSV 2026	\N	joaquin.lopez399@gmail.com	51468855	Joaquin	Lopez Benitez
ct_8mjgwd7jl9ik5kvr2d2b	org_y0txnlv69l6vp70ey06b	59898227745	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898227745	\N	importación:CSV 2026	\N	mariohebermendez@gmail.com	4061183-5	Mario	Heber Mendez
ct_myz9lqrmj8kthh5b61d0	org_y0txnlv69l6vp70ey06b	59891608449	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891608449	\N	importación:CSV 2026	\N	arq.evelynrosa@gmail.com	47182859	Evelyn	Rodriguez
ct_p0dwxw98pm1m87i98fl4	org_y0txnlv69l6vp70ey06b	59898609137	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898609137	\N	importación:CSV 2026	\N	karengurevich4@gmail.com	5296266-4	Karen	Gurevich
ct_4txnsmjmxc0x6ca60d4r	org_y0txnlv69l6vp70ey06b	59891001521	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891001521	\N	importación:CSV 2026	\N	bruscojuan@gmail.com	\N	Juan	Brusco
ct_ec03jn7zanyfi4g0nwt0	org_y0txnlv69l6vp70ey06b	595981105161	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981105161	\N	importación:CSV 2026	\N	eliana.ayala@tecnoedil.com.py	3738350	Eliana	Ayala
ct_b4mpsql0mfg1poorht29	org_y0txnlv69l6vp70ey06b	595994357164	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595994357164	\N	importación:CSV 2026	\N	evelyn.villalba@tecnoedil.com.py	4668309	Evelyn Rocío	Villalba Benítez
ct_qpcz7bfz4x2ui2izzuta	org_y0txnlv69l6vp70ey06b	595974307043	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595974307043	\N	importación:CSV 2026	\N	adolfo@elementalbim.com	5.737.573	Adolfo	Benitez
ct_4r8aiiwz7vkbtpr7zpah	org_y0txnlv69l6vp70ey06b	595981425564	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981425564	\N	importación:CSV 2026	\N	belusartorio@hotmail.com	2991123	María Belen	Sartorio
ct_gt0i0omdgz7eqn5bv2lh	org_y0txnlv69l6vp70ey06b	595986546014	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595986546014	\N	importación:CSV 2026	\N	aylentank15@gmail.com	\N	Camila	Tank
ct_nhk8iiqvpmupgb4m4q5e	org_y0txnlv69l6vp70ey06b	595991701203	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595991701203	\N	importación:CSV 2026	\N	matias.mallorquin96@gmail.com	\N	Matias	Mallorquin
ct_pgxnkjg998m0resh1gum	org_y0txnlv69l6vp70ey06b	59898661305	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898661305	\N	importación:CSV 2026	\N	joaquin@richof.com	4.677.446-3	Joaquin	Báez
ct_32tmcjryatk4o9updc0p	org_y0txnlv69l6vp70ey06b	59899311537	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899311537	\N	importación:CSV 2026	\N	carlos@richof.com	2.609.404-9	Carlos	Buzzo
ct_knbkmvrgfrqoapq2xrlz	org_y0txnlv69l6vp70ey06b	59891952451	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891952451	\N	importación:CSV 2026	\N	arihanavarela@gmail.com	5.381.165-8	Arihana	Varela Moreira
ct_6ywd616mlu77ggrza4l8	org_y0txnlv69l6vp70ey06b	59898599405	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898599405	\N	importación:CSV 2026	\N	emilianasosa18@gmail.com	4.956.900-5	Emiliana	Sosa Inderkun
ct_v1hasicgvj1brseq9vv3	org_y0txnlv69l6vp70ey06b	59899828471	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899828471	\N	importación:CSV 2026	\N	gsosainderkun@gmail.com	4.956.901-1	Giuliana	Sosa Inderkun
ct_aez2b5rmranl6oc2vztc	org_y0txnlv69l6vp70ey06b	642040902829	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	642040902829	\N	importación:CSV 2026	\N	zetabentos23@gmail.com	4 956258-0	Ezequiel	Bentos
ct_vssmygmwqlchj4ml6ulz	org_y0txnlv69l6vp70ey06b	59897095480	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897095480	\N	importación:CSV 2026	\N	paulamenchacas@gmail.com	4.855.614-0	Paula	Menchaca
ct_5ssnmi55usc0kf2zfoi6	org_y0txnlv69l6vp70ey06b	595984885932	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595984885932	\N	importación:CSV 2026	\N	ximenaverruck@gmail.com	5.497.274	Ximena	Paredes
ct_xorxk70yjv3pj5ynziyv	org_y0txnlv69l6vp70ey06b	59899002393	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899002393	\N	importación:CSV 2026	\N	oslean0483@gmail.com	6.298.320-8	Oslean	Alonso
ct_ig1by7lwgcmjqahfg1gg	org_y0txnlv69l6vp70ey06b	59892787673	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892787673	\N	importación:CSV 2026	\N	briandiez2802@gmail.com	53810905	Brian	Diez
ct_hf3bfxopbxp3xare7on8	org_y0txnlv69l6vp70ey06b	59899119798	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899119798	\N	importación:CSV 2026	\N	robgomez100@gmail.com	35403855	Roberto Daniel	Gomez Rodriguez
ct_hslpx9rcuvdkydukqlkj	org_y0txnlv69l6vp70ey06b	59899281372	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899281372	\N	importación:CSV 2026	\N	robertozipitria13@icloud.com	50117304	Roberto	Zipitria Comba
ct_gwj3w1x8nyu5f6ob4756	org_y0txnlv69l6vp70ey06b	584124717299	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	584124717299	\N	importación:CSV 2026	\N	rrosales@sustentacorp.com	26.809.607	Rosmery	Rosales
ct_k1c3nd876a4mar7pe35m	org_y0txnlv69l6vp70ey06b	59893550860	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893550860	\N	importación:CSV 2026	\N	valpicerno@gmail.com	5324230-8	Valentina	Picerno
ct_v96uwolph2zqeab8t630	org_y0txnlv69l6vp70ey06b	59896172696	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896172696	\N	importación:CSV 2026	\N	angefontanarossa@gmail.com	5442329-2	Angelina	Fontanarossa
ct_56xsf4a80ggurim33yce	org_y0txnlv69l6vp70ey06b	59897970681	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897970681	\N	importación:CSV 2026	\N	sofianuez@gmail.com	3344600-1	Sofía	Nuñez
ct_owv09p4844kfnfasfa74	org_y0txnlv69l6vp70ey06b	18493518614	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18493518614	\N	importación:CSV 2026	\N	rbrazoban@gva.com.do	\N	Rosmery	Brazoban
ct_acx5rbd4z84k93fcxilh	org_y0txnlv69l6vp70ey06b	34617713875	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34617713875	\N	importación:CSV 2026	\N	vmlopez@hogrup.com	\N	Victor	Manuel Lopez
ct_c3h42bd3byl0h46n4kai	org_y0txnlv69l6vp70ey06b	18293454390	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18293454390	\N	importación:CSV 2026	\N	alfonso@bonita.golf	\N	Alfonso	Carrascosa
ct_bbnczrh0rbhryw4glu2l	org_y0txnlv69l6vp70ey06b	18492095894	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18492095894	\N	importación:CSV 2026	\N	davendano@gva.com.do	\N	David	Avendaño
ct_7eqd1jwnzmtaqph6b69j	org_y0txnlv69l6vp70ey06b	18293804354	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18293804354	\N	importación:CSV 2026	\N	mc@tldint.com	\N	Mariella	Carrasco
ct_vi3zs7iqydyzrbs9f3bc	org_y0txnlv69l6vp70ey06b	34625669835	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34625669835	\N	importación:CSV 2026	\N	areabim@hogrup.com	\N	Eva	Diaz
ct_xqoq2uut6q1vvhezh0io	org_y0txnlv69l6vp70ey06b	18293459487	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18293459487	\N	importación:CSV 2026	\N	manuel@bonita.golf	\N	Bernardo	Diaz
ct_chhucvvkgyyneuirbzk7	org_y0txnlv69l6vp70ey06b	18099659114	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18099659114	\N	importación:CSV 2026	\N	rs@tldint.com	\N	Radhames	Soto
ct_yqf77qpti68iani3ixu5	org_y0txnlv69l6vp70ey06b	18292814195	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18292814195	\N	importación:CSV 2026	\N	kmontano@gva.com.do	\N	Karla	Montaño
ct_08cg3ftf0qan7ss8z21x	org_y0txnlv69l6vp70ey06b	18099912605	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18099912605	\N	importación:CSV 2026	\N	ngeraldino@gva.com.do	\N	Nicoles	Geraldino
ct_zo2pzwag90vslw4abr7o	org_y0txnlv69l6vp70ey06b	34696448815	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34696448815	\N	importación:CSV 2026	\N	sramirez@hogrup.com	\N	Salvador	Ramírez
ct_84vh96lu1loh3vf94cjs	org_y0txnlv69l6vp70ey06b	18096964087	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18096964087	\N	importación:CSV 2026	\N	earce@tldint.com	\N	Elizabeth	Arce
ct_vrkuta96azae6q444w9w	org_y0txnlv69l6vp70ey06b	18097631172	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18097631172	\N	importación:CSV 2026	\N	jclavero@tldint.com	\N	Javier	Clavero
ct_a6p5j4g2o3or9yn4q1z8	org_y0txnlv69l6vp70ey06b	18094308899	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18094308899	\N	importación:CSV 2026	\N	wr@tldint.com	\N	Wilfredo	Rodríguez
ct_iypxtbeiu388z9zox635	org_y0txnlv69l6vp70ey06b	18299873851	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18299873851	\N	importación:CSV 2026	\N	jmarty@gva.com.do	\N	Joan	Marty
ct_rx08oljrjoascvqm2y1r	org_y0txnlv69l6vp70ey06b	18295315703	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18295315703	\N	importación:CSV 2026	\N	bmontalvo@tldint.com	\N	Benjamin	Montalvo
ct_mrg3fw4g7rlltdsif5te	org_y0txnlv69l6vp70ey06b	34653186050	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34653186050	\N	importación:CSV 2026	\N	amartorell@hogrup.com	\N	Antonia	Maria Martorell
ct_0xfsjveoox1mfvw6f6r3	org_y0txnlv69l6vp70ey06b	18495072116	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18495072116	\N	importación:CSV 2026	\N	rhl@bonita.golf	\N	Ricardo	Hoepelman
ct_2davdpdx3myfo8p9x2eh	org_y0txnlv69l6vp70ey06b	18492651644	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18492651644	\N	importación:CSV 2026	\N	portiz@gva.com.do	\N	Paola	Ortiz
ct_dde4wdiaxtmfxu9y31dz	org_y0txnlv69l6vp70ey06b	18296480805	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18296480805	\N	importación:CSV 2026	\N	ladrover@tldint.com	\N	Lorenzo	Adrover
ct_jrej0wrmyac21p887fe2	org_y0txnlv69l6vp70ey06b	34670233677	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34670233677	\N	importación:CSV 2026	\N	pserravinyals@hogrup.com	\N	Pere	Serravinyals
ct_k34ocq3hexgctmavy2oj	org_y0txnlv69l6vp70ey06b	18098933339	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18098933339	\N	importación:CSV 2026	\N	estherceballos@bonita.golf	\N	Esther	Ceballos
ct_29751vqljjjz20ogmq7f	org_y0txnlv69l6vp70ey06b	18095191685	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18095191685	\N	importación:CSV 2026	\N	lpena@gva.com.do	\N	Lina	Peña
ct_msrbuujc00euxycev6ac	org_y0txnlv69l6vp70ey06b	18293412252	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18293412252	\N	importación:CSV 2026	\N	ingenieros.dr@gmail.com	\N	Sammy	Duarte
ct_apkxj7ks0ciwyw6bnv61	org_y0txnlv69l6vp70ey06b	17865375359	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	17865375359	\N	importación:CSV 2026	\N	jmonterroso@crystal-lagoons.com	\N	Juan	Monterroso
ct_83gbpi4z5tssc3rai80i	org_y0txnlv69l6vp70ey06b	18495853802	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18495853802	\N	importación:CSV 2026	\N	igarcia@tldint.com	\N	Ivan	Garcia
ct_wf7kes4in4d0lldmh460	org_y0txnlv69l6vp70ey06b	17868630176	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	17868630176	\N	importación:CSV 2026	\N	acp@bonita.golf	\N	Alvaro	Carrascosa
ct_mug65680leuqvdfpefh1	org_y0txnlv69l6vp70ey06b	56965874432	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	56965874432	\N	importación:CSV 2026	\N	cmellado@crystal-lagoons.com	\N	Catalina	Mellado
ct_mka3v5xdz0e5t1dmxm8b	org_y0txnlv69l6vp70ey06b	18296850885	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18296850885	\N	importación:CSV 2026	\N	rodrigo.garcia.taveras@gmail.com	\N	Rodrigo	García
ct_dzjw1273ietucur67rzp	org_y0txnlv69l6vp70ey06b	18495061291	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18495061291	\N	importación:CSV 2026	\N	katherine@bonita.golf	\N	Katherina	Laantigua
ct_i57asd9wwktua1z993ny	org_y0txnlv69l6vp70ey06b	18296596108	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18296596108	\N	importación:CSV 2026	\N	marielina@bonita.golf	\N	Marielina	Arias
ct_cqr33sonwova2vmi6wrz	org_y0txnlv69l6vp70ey06b	18098933341	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18098933341	\N	importación:CSV 2026	\N	ignacio@bonita.golf	\N	Ignacio	Marti
ct_b1j3omevlbv625dnon4c	org_y0txnlv69l6vp70ey06b	18293351138	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18293351138	\N	importación:CSV 2026	\N	\N	\N	Jaime	Gonzalez
ct_7top8nm3vgktp1bsl569	org_y0txnlv69l6vp70ey06b	523318485809	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	523318485809	\N	importación:CSV 2026	\N	\N	\N	Giovanni	Salcedo
ct_hajhwyq4pve7fbgjokr3	org_y0txnlv69l6vp70ey06b	523315875655	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	523315875655	\N	importación:CSV 2026	\N	\N	\N	Evarlín	Vélez
ct_5w2y45ms5frt0g6ghptf	org_y0txnlv69l6vp70ey06b	523338299811	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	523338299811	\N	importación:CSV 2026	\N	\N	\N	Fernanda	Gonzalez
ct_jbvgkqu1vyyhhsgd4bq9	org_y0txnlv69l6vp70ey06b	523315405685	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	523315405685	\N	importación:CSV 2026	\N	\N	\N	Miguel	Rodríguez
ct_cfmol0q5e0o20sw9u5da	org_y0txnlv69l6vp70ey06b	59892021096	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892021096	\N	importación:CSV 2026	\N	matias.ortiz273@gmail.com	4.730.930-2	Matías	Ortiz
ct_ddgeytw2wmyt26yk65oh	org_y0txnlv69l6vp70ey06b	59891414941	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891414941	\N	importación:CSV 2026	\N	mela.gobbi@gmail.com	5.152.005-7	Melissa	Gobbi
ct_2peskmf7z7duxm8nu56b	org_y0txnlv69l6vp70ey06b	595986652535	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595986652535	\N	importación:CSV 2026	\N	dbasualdo@benitezbittar.com.py	3.974.282	David	Basualdo
ct_arkflzoobww564vke4pf	org_y0txnlv69l6vp70ey06b	595971858940	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595971858940	\N	importación:CSV 2026	\N	presupuestos@benitezbittar.com.py	5.478.641	Suene	Gonzalez
ct_tgt03655a4xf0mxe7fdd	org_y0txnlv69l6vp70ey06b	595985320460	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595985320460	\N	importación:CSV 2026	\N	btilleria@benitezbittar.com.py	4.476.785	Bryam	Tilleria
ct_x72d3kmdccbnqm7rr6t4	org_y0txnlv69l6vp70ey06b	595981736235	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981736235	\N	importación:CSV 2026	\N	ebenitez@benitezbittar.com.py	4.542.349	Esteban	Benitez
ct_4oswg5quch4mpxucau40	org_y0txnlv69l6vp70ey06b	59899210244	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899210244	\N	importación:CSV 2026	\N	fbarcelo@cousa.com	3.694.724-6	Miguel Fernando	Barcelo Rodriguez
ct_j4cqj5wpiunw7oco0sww	org_y0txnlv69l6vp70ey06b	59899636682	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899636682	\N	importación:CSV 2026	\N	lrios9609@hotmail.com	6.309.271-1	Luis	Rios
ct_34iw9gqfxegazhwt9iyd	org_y0txnlv69l6vp70ey06b	59899632940	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899632940	\N	importación:CSV 2026	\N	nantognazza@cousa.com	4.089.263-3	Nicolas Alfredo	Antognazza Frabasile
ct_qvjygvffpu4wqi4mngeq	org_y0txnlv69l6vp70ey06b	59891228301	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891228301	\N	importación:CSV 2026	\N	j.felipebidegain@gmail.com	4.491.015-4	Juan	Felipe Bidegain
ct_6j50ua6w0icoxn9vv480	org_y0txnlv69l6vp70ey06b	595971780446	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595971780446	\N	importación:CSV 2026	\N	mmaciel@benitezbittar.com.py	4.699.775	Martin	Maciel
ct_w1zdnvajbbcc5t2ow4l1	org_y0txnlv69l6vp70ey06b	595971878484	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595971878484	\N	importación:CSV 2026	\N	iheisecke@benitezbittar.com.py	3.572.838	Ivonne	Heisecke
ct_98flwj98j0ld0gxleyl3	org_y0txnlv69l6vp70ey06b	595991919179	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595991919179	\N	importación:CSV 2026	\N	dianadenisse1998@gmail.com	5.188.805	Diana Denisse	Ortigoza Fleitas
ct_9jnu97oqvs4nhwbhpeyy	org_y0txnlv69l6vp70ey06b	59895106767	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895106767	\N	importación:CSV 2026	\N	lufuidio@gmail.com	5.584.828-7	Lucia	Fuidio
ct_2z6s3fw7ah0wcjayexvw	org_y0txnlv69l6vp70ey06b	59898558281	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898558281	\N	importación:CSV 2026	\N	segui.avril.2610@gmail.com	5.607.405-3	Avril	Segui Scarone
ct_vgaxakv0rr0q9di5ba63	org_y0txnlv69l6vp70ey06b	59899955962	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899955962	\N	importación:CSV 2026	\N	felipeferihl@gmail.com	5.005.724-1	Felipe	Fernandez
ct_6puo7oazd7064grnr64a	org_y0txnlv69l6vp70ey06b	59899698738	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899698738	\N	importación:CSV 2026	\N	flopyperez2001@gmail.com	5.466.413-5	Florencia	Perez
ct_ncas8r8tgiofruydklv8	org_y0txnlv69l6vp70ey06b	59898691417	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898691417	\N	importación:CSV 2026	\N	duhartm17@gmail.com	5.358.808-7	Melina	Selene Duhart Callorda
ct_pyaotn72uyjb37ih1hce	org_y0txnlv69l6vp70ey06b	59899779908	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899779908	\N	importación:CSV 2026	\N	4enzobaez@gmail.com	5.067.037-6	Enzo	Baez
ct_sgc2b6gbxegqqf6hiwyr	org_y0txnlv69l6vp70ey06b	59891384825	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891384825	\N	importación:CSV 2026	\N	valeoliveraf5@gmail.com	5.442.401-0	Valentina	Olivera
ct_u9jszvv9oz8r58vt8l5p	org_y0txnlv69l6vp70ey06b	59894119380	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894119380	\N	importación:CSV 2026	\N	tebiarq@gmail.com	4.018.848-6	Carola	Bianco
ct_kzrcjyrgrlnwgvqgqole	org_y0txnlv69l6vp70ey06b	595984324170	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595984324170	\N	importación:CSV 2026	\N	m.noguera@okconstructora.com	5.724.989	Melissa	Noguera
ct_jut4axr4rdesuvv1akdq	org_y0txnlv69l6vp70ey06b	59898343150	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898343150	\N	importación:CSV 2026	\N	v.r.garciasuarez@gmail.com	4.539.015-7	Victoria	Garcia
ct_qqgvd83dxq8py1b4x38m	org_y0txnlv69l6vp70ey06b	59899306277	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899306277	\N	importación:CSV 2026	\N	gpuchiele@bps.gub.uy	4.136.640-9	Guillermo	Puchiele
ct_n32ag73n01hq0loczhch	org_y0txnlv69l6vp70ey06b	59892088843	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892088843	\N	importación:CSV 2026	\N	nsilvera@bps.gub.uy	4.049.725-9	Javier	Silvera
ct_r3vqu7tnisp30qsvrcpm	org_y0txnlv69l6vp70ey06b	59898687662	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898687662	\N	importación:CSV 2026	\N	golopez@bps.gub.uy	2.972.394-4	Gonzalo	Lopez
ct_30bhwy753n4buwd5i7pn	org_y0txnlv69l6vp70ey06b	59891891584	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891891584	\N	importación:CSV 2026	\N	andreavila3107@gmail.com	5.340.459-6	Andrea	Vila
ct_g4kzzrgure5bl9l1nr1h	org_y0txnlv69l6vp70ey06b	59898558228	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898558228	\N	importación:CSV 2026	\N	luperrsu@gmail.com	5.486.854-9	Luciana	Perrou
ct_mmx6z8xol56lu1doodg7	org_y0txnlv69l6vp70ey06b	59892887450	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892887450	\N	importación:CSV 2026	\N	agusbp200210@gmail.com	5.237.017-8	Fernando Mario	Crrero Gasgi
ct_u5h3vh05kussthcpqqqs	org_y0txnlv69l6vp70ey06b	59896619477	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896619477	\N	importación:CSV 2026	\N	fernando.carrero@aduanas.gub.uy	3.993.408-4	Yamila	Alvarez Rodriguez
ct_66br25ae5t5b23jafccx	org_y0txnlv69l6vp70ey06b	59898985049	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898985049	\N	importación:CSV 2026	\N	yamilaalvarez26@gmail.com	4.958.324-5	Florencia	Charquero
ct_9sme557v445zw5lfpa7u	org_y0txnlv69l6vp70ey06b	59898135324	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898135324	\N	importación:CSV 2026	\N	flocharquero@gmail.com	4.316.104-3	Victoria	Rodriguez Iglesias
ct_xpmfe99eef491j8zgjme	org_y0txnlv69l6vp70ey06b	59893701797	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893701797	\N	importación:CSV 2026	\N	vicky120903@gmail.com	53625750	Lucia	Casanova Golzalez
ct_wx674y59uodyitv0o3sa	org_y0txnlv69l6vp70ey06b	59899889276	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899889276	\N	importación:CSV 2026	\N	luliwy0085@gmail.com	53226455	Maria Ines	Morato
ct_kjr66h6mwvokt56ia5ea	org_y0txnlv69l6vp70ey06b	59899238148	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899238148	\N	importación:CSV 2026	\N	andres@humphreys.com	\N	Libero	Bueno
ct_jmai64gjzpc49xxdtpbt	org_y0txnlv69l6vp70ey06b	59898952761	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898952761	\N	importación:CSV 2026	\N	libero@humphreys.com	\N	Veronica	Rossi
ct_1mt84favrcsp34to2q6p	org_y0txnlv69l6vp70ey06b	59899262541	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899262541	\N	importación:CSV 2026	\N	veronica.rossi@humphreys.com	\N	Mateo	Laino
ct_wq8aiekx72qkxa7d2kbt	org_y0txnlv69l6vp70ey06b	59898418101	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898418101	\N	importación:CSV 2026	\N	mateolainofuentes@gmail.com	5083341-1	Eugenia	Cardozo
ct_ice45dlgb03j5bb5tquh	org_y0txnlv69l6vp70ey06b	59898017824	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898017824	\N	importación:CSV 2026	\N	eugecardozo88@gmail.com	4975388-6	Eugenia	Cardozo
ct_h8nuht48h7szfxl0gcbi	org_y0txnlv69l6vp70ey06b	59894449784	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894449784	\N	importación:CSV 2026	\N	mariaesalinas@hotmail.com	2.693.103-1	Maria Elena	Salinas
ct_urp4rlkjnv3gc2ld8541	org_y0txnlv69l6vp70ey06b	59892114551	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892114551	\N	importación:CSV 2026	\N	aguscaberve@gmail.com	5.508.582-7	Agustin	Casado
ct_59nrj6n3cfida34qbw4s	org_y0txnlv69l6vp70ey06b	59898381855	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898381855	\N	importación:CSV 2026	\N	mcanziani@humphreysandpartners.com	\N	Martin	Canziani
ct_r6paucbcrymyd2fxucs6	org_y0txnlv69l6vp70ey06b	59895397687	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895397687	\N	importación:CSV 2026	\N	mslebratocorbo@gmail.com	57108415	Maria Sol	Lebrato
ct_oi48t0i2p37eiyaxslsf	org_y0txnlv69l6vp70ey06b	59895118851	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895118851	\N	importación:CSV 2026	\N	caminoechwicz@gmail.com	55227376	Camila	Noechwicz
ct_f2vgquicssz1nou4b504	org_y0txnlv69l6vp70ey06b	59891361092	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891361092	\N	importación:CSV 2026	\N	carmeodrioarq@gmail.com	5546877-4	Carmela	Odriozola
ct_416xi720m7svcnxzm16b	org_y0txnlv69l6vp70ey06b	59897241405	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897241405	\N	importación:CSV 2026	\N	carolpopovits@gmail.com	55165845	Carola	Popovits
ct_gmu8ja7mw7qagmv8027o	org_y0txnlv69l6vp70ey06b	59894689179	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894689179	\N	importación:CSV 2026	\N	natidegen2004@gmail.com	54649929	Natalie	Degen
ct_6x1go9apq5v84377ao18	org_y0txnlv69l6vp70ey06b	59899428108	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899428108	\N	importación:CSV 2026	\N	luciasanchezdeleonarq@gmail.com	55999379	Lucia	Sánchez
ct_p4y4tomuyxhzh39etcj1	org_y0txnlv69l6vp70ey06b	59899876378	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899876378	\N	importación:CSV 2026	\N	josefinatriver@gmail.com	5412929-6	Josefina	Triver
ct_c1m5uig1eo366jctbhk2	org_y0txnlv69l6vp70ey06b	595981576590	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981576590	\N	importación:CSV 2026	\N	ivana.antunez@azeta.com.py	\N	Ivana	Antunez
ct_ev5np40dfljisa5jtaez	org_y0txnlv69l6vp70ey06b	595976599060	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595976599060	\N	importación:CSV 2026	\N	cynthia.ronnebeck@azeta.com.py	\N	Cynthia	Rönnebeck
ct_ptqa4olpspscjro4m0ld	org_y0txnlv69l6vp70ey06b	595982839132	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595982839132	\N	importación:CSV 2026	\N	maira.martinez@azeta.com.py	\N	Maira	Martinez
ct_wqh95qq49xzc7c8rmq5x	org_y0txnlv69l6vp70ey06b	595971867865	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595971867865	\N	importación:CSV 2026	\N	eduardo.godoy@azeta.com.py	\N	Eduardo	Godoy
ct_emrkclo9sph47ucrjkmw	org_y0txnlv69l6vp70ey06b	595972508712	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595972508712	\N	importación:CSV 2026	\N	oliver.acosta@azeta.com.py	\N	Oliver	Acosta
ct_io0g79gzwnikxeay7f14	org_y0txnlv69l6vp70ey06b	59898258483	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898258483	\N	importación:CSV 2026	\N	andreasanchis23@gmail.com	5.197.912-5	Andrea Maria	Sanchis Bisio
ct_zxybd0vbs0ovb1va9lv7	org_y0txnlv69l6vp70ey06b	59898340866	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898340866	\N	importación:CSV 2026	\N	nico_8ds@hotmail.com	4714522-9	Nicolas	De Souza
ct_gxvtczx280ck8z0zomvh	org_y0txnlv69l6vp70ey06b	59899795797	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899795797	\N	importación:CSV 2026	\N	marianela@pittamiglio.com.uy	\N	Marianela	Pérez Naya
ct_q926137miey19hjqrqd4	org_y0txnlv69l6vp70ey06b	59899116393	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899116393	\N	importación:CSV 2026	\N	florencia@pittamiglio.com.uy	\N	Florencia	Maldonado
ct_gmz3rfrk7pu7m5jtq1r9	org_y0txnlv69l6vp70ey06b	59899584498	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899584498	\N	importación:CSV 2026	\N	malves@ute.com.uy	43751531	Marcelo	Alves
ct_o5id01cjtynkgw1aqjq6	org_y0txnlv69l6vp70ey06b	59894391857	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894391857	\N	importación:CSV 2026	\N	semartinez@ute.com.uy	35680691	Sebastian	Martinez
ct_85eqw7lmq50ikniau81d	org_y0txnlv69l6vp70ey06b	595985284086	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595985284086	\N	importación:CSV 2026	\N	dpto.tecnico@sicon.com.py	4.317.908	Johanna	Rivas
ct_7o6sa8polarxatrxcsw9	org_y0txnlv69l6vp70ey06b	59894022562	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894022562	\N	importación:CSV 2026	\N	tatipose5@gmail.com	4.932.405-9	Tatiana	Pose
ct_1w0f7xmypxep5hwx8h00	org_y0txnlv69l6vp70ey06b	59898889473	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898889473	\N	importación:CSV 2026	\N	pablovargasmoraez@gmail.com	1.680.966-4	Pablo	Vargas Moraez
ct_w87z1jao43d3hfoo08ec	org_y0txnlv69l6vp70ey06b	59898382382	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898382382	\N	importación:CSV 2026	\N	aleuruguaya@gmail.com	3.848.205-2	Erika	Alejandra Lukic
ct_rlwtvu81j6v2b8nqmi0q	org_y0txnlv69l6vp70ey06b	59891652785	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891652785	\N	importación:CSV 2026	\N	javier.travieso86@gmail.com	3.266.095-9	Javier	Efrain Travieso
ct_jzekf46v4tvkajhazseu	org_y0txnlv69l6vp70ey06b	59891217605	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891217605	\N	importación:CSV 2026	\N	candelacastrillon@gmail.com	4.925.468-6	Candela	Castrillon
ct_w5xumwe5wz42ov2b6x0o	org_y0txnlv69l6vp70ey06b	59897658423	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897658423	\N	importación:CSV 2026	\N	manuel89513@gmail.com	62925662	Manuel	Gutiuérrez
ct_njyvyb2f3e1ck7cynse0	org_y0txnlv69l6vp70ey06b	59899400763	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899400763	\N	importación:CSV 2026	\N	gamarra854@hotmail.com	44579473	Silvia Fabiana	Gamarra Curbelo
ct_1geeffzgb0qt728y1sph	org_y0txnlv69l6vp70ey06b	59899055580	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899055580	\N	importación:CSV 2026	\N	fdur11@hotmail.com	28751427	Fabricio	Gutierrez Arguello
ct_4hp5kwr24a1bsb7i2vo2	org_y0txnlv69l6vp70ey06b	59899558531	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899558531	\N	importación:CSV 2026	\N	wsosa@ute.com.uy	42784729	Omar	Sosa
ct_md436goshxjs6lln53kn	org_y0txnlv69l6vp70ey06b	59899559861	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899559861	\N	importación:CSV 2026	\N	fernamangarcia@gmail.com	43464988	Fernando Manuel	Garcia Santellan
ct_2pgv8r1jmy6772h81dx0	org_y0txnlv69l6vp70ey06b	59899430738	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899430738	\N	importación:CSV 2026	\N	gonzads24@gmail.com	46019091	Gonzalo Da	Silva Rivero
ct_sx7hojpfhsl49p1mmxxm	org_y0txnlv69l6vp70ey06b	59891228209	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891228209	\N	importación:CSV 2026	\N	lautifafa99@gmail.com	49641924	Guillermo Fabian De	Los Santos Lopez
ct_7h8xbksjiur28ibigayv	org_y0txnlv69l6vp70ey06b	59898495395	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898495395	\N	importación:CSV 2026	\N	daniellotito@gmail.com	37020176	Juan Daniel	Lotito Seiler
ct_ezolbj1iecbmwcvzrbbi	org_y0txnlv69l6vp70ey06b	59899028044	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899028044	\N	importación:CSV 2026	\N	jdlotito@ute.com.uy	38466682	Maximiliano Dos	Santos Arriola
ct_a9qvophuygi8v7qwi6ec	org_y0txnlv69l6vp70ey06b	59899882572	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899882572	\N	importación:CSV 2026	\N	hernanpelado16@gmail.com	48703965	Julio Hernan	Delgado Castillo
ct_uurtglkshlzqrzuktogq	org_y0txnlv69l6vp70ey06b	59898270627	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898270627	\N	importación:CSV 2026	\N	lubal@ute.com.uy	41637723	Luis Emilio	Ubal Techera
ct_j84ejosmialz950n63t7	org_y0txnlv69l6vp70ey06b	59899461440	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899461440	\N	importación:CSV 2026	\N	amenendez@ute.com.uy	28685038	Alfonso Ezequiel	Menendez Rodriguez
ct_o64uehaawjcugm8e7eav	org_y0txnlv69l6vp70ey06b	595994887405	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595994887405	\N	importación:CSV 2026	\N	a.colman@okconstructora.com	3.853.917	Alejandra	Colman
ct_n5quvb6upai59t0dh7t8	org_y0txnlv69l6vp70ey06b	59892802528	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892802528	\N	importación:CSV 2026	\N	contuh13@gmail.com	5601452-2	Constanza	Hernández Borges
ct_mobjfg6rblfiwho5dbwn	org_y0txnlv69l6vp70ey06b	59898558520	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898558520	\N	importación:CSV 2026	\N	valerioss1020@gmail.com	5418544-2	Sergio	Valentino Ríos
ct_wj6jgkuk6f630dbo2zfv	org_y0txnlv69l6vp70ey06b	59898778892	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898778892	\N	importación:CSV 2026	\N	mfasari52@gmail.com	5262247-8	Madeline Agustina	Fasari Trías
ct_x0wqbesxp6ku9t743jf4	org_y0txnlv69l6vp70ey06b	59899460750	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899460750	\N	importación:CSV 2026	\N	juan.attun@gmail.com	4.565.049-6	Juan	Manuel Attún
ct_7bvmdxa0jt8c13evbp7h	org_y0txnlv69l6vp70ey06b	59895500606	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895500606	\N	importación:CSV 2026	\N	manuchocorradi2@gmail.com	5.576.282-3	Manuel	Corradi Cosme
ct_9h3cr430rqn8kfkk5zrr	org_y0txnlv69l6vp70ey06b	59894546176	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894546176	\N	importación:CSV 2026	\N	martinavalverde.arq@gmail.com	4.968.348-5	Martina	Valverde
ct_27v4d8e16vqrc6upvlmo	org_y0txnlv69l6vp70ey06b	59899892946	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899892946	\N	importación:CSV 2026	\N	aacosta@ute.com.uy	1.971.410-7	Alicia	Ines Acosta
ct_x9i3774eubs71mbqzrtc	org_y0txnlv69l6vp70ey06b	59896232257	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896232257	\N	importación:CSV 2026	\N	talonsouy@gmail.com	52236770	Tomas	Alonso
ct_1t6u03iygz6yy17zrt2v	org_y0txnlv69l6vp70ey06b	59891071957	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891071957	\N	importación:CSV 2026	\N	serranaespino@gmail.com	\N	Serrana	Espino
ct_vyuyzc0q1dnb65lsv7zw	org_y0txnlv69l6vp70ey06b	59899162828	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899162828	\N	importación:CSV 2026	\N	adrianaramos@estudiocapote.com	\N	Adriana	Ramos
ct_pagvc52zbh71ackn88w6	org_y0txnlv69l6vp70ey06b	59891746200	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891746200	\N	importación:CSV 2026	\N	agusgm299@gmail.com	53840562	Agustina	Gómez
ct_314h2g5xwa3l5af9o0li	org_y0txnlv69l6vp70ey06b	59899464457	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899464457	\N	importación:CSV 2026	\N	valentinariccio@estudiocapote.com	4.841.619-6	Valentina	Riccio Guizzo
ct_4fhgnkwi48uceu5h5zhh	org_y0txnlv69l6vp70ey06b	59895771924	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895771924	\N	importación:CSV 2026	\N	camilagiaconi@estudiocapote.com	50852805	Valeria	Martino Rezende
ct_w53oo15v8fev5gtk6q49	org_y0txnlv69l6vp70ey06b	59895679160	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895679160	\N	importación:CSV 2026	\N	nagu100598@gmail.com	4.864.232-5	Nahuel	Alvez
ct_65dmx1bmeqmbhtpnmpjy	org_y0txnlv69l6vp70ey06b	59895256811	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895256811	\N	importación:CSV 2026	\N	benisaen3@gmail.com	5.478.656-7	Belen	Boado
ct_da808l5docpxbm5okdbi	org_y0txnlv69l6vp70ey06b	59893934426	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893934426	\N	importación:CSV 2026	\N	franco.damian.rodriguez@hotmail.com	4.944.191-4	Franco	Rodríguez
ct_40xsmxt18gg4at3def4c	org_y0txnlv69l6vp70ey06b	59898065825	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898065825	\N	importación:CSV 2026	\N	dlanzag4@gmail.com	5.454.949-4	Diego	Lanza
ct_aijy1udcjdlz7ndpasxi	org_y0txnlv69l6vp70ey06b	59895400025	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895400025	\N	importación:CSV 2026	\N	caterineestudia01@gmail.com	55372981	Caterine	Nahiely Cabrera
ct_3vbrbjbnr7e6ulpnif8b	org_y0txnlv69l6vp70ey06b	59895359963	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895359963	\N	importación:CSV 2026	\N	aguirrehernandezmartina@gmail.com	54884373	Martina	Aguirre Hernandez
ct_6jp6kvy03mazdjdxe1tm	org_y0txnlv69l6vp70ey06b	59898701434	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898701434	\N	importación:CSV 2026	\N	kgbaldomir@gmail.com	4.863.903-5	Karina	García
ct_fexnrgqrah8yd5ut9djb	org_y0txnlv69l6vp70ey06b	59899332803	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899332803	\N	importación:CSV 2026	\N	valentina.lodeiro98@gmail.com	4.923.022-0	Valentina	Lodeiro
ct_j4vwt5758cuxl6667h24	org_y0txnlv69l6vp70ey06b	59899418089	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899418089	\N	importación:CSV 2026	\N	marichalvero@gmail.com	\N	Veronica	Marichal
ct_pexwcs5gjsw149duueyc	org_y0txnlv69l6vp70ey06b	59894616967	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894616967	\N	importación:CSV 2026	\N	denubarreto@gmail.com	4727690-1	Denisse	Barreto
ct_0ytxao5cs0wv0j2kpr2h	org_y0txnlv69l6vp70ey06b	59894012185	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894012185	\N	importación:CSV 2026	\N	apolettoarq@gmail.com	4.155.881-2	Antonella	Poletto
ct_a0i72u0n6tomlxvkzf0t	org_y0txnlv69l6vp70ey06b	59896207675	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896207675	\N	importación:CSV 2026	\N	patricia@mobilart.com.uy	3.261.661-3	Patricia	Erramuspe
ct_ynv93yuczhz7nfnl066p	org_y0txnlv69l6vp70ey06b	59899360103	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899360103	\N	importación:CSV 2026	\N	analaura.baez@durazno.gub.uy	4.527.213 -5	Baez Alberti,	Ana Laura
ct_swjujy612dsd2p05w71r	org_y0txnlv69l6vp70ey06b	59899517646	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899517646	\N	importación:CSV 2026	\N	santiago.carbajal@durazno.gub.uy	3.429.254 -6	Carbajal	García, Santiago
ct_fw4y5ak3aqmcbagus8jn	org_y0txnlv69l6vp70ey06b	59892079290	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892079290	\N	importación:CSV 2026	\N	angel.cha@durazno.gub.uy	5.384.955 -2	Chá Valdez,	Ángel Fabio
ct_pthn2suhsmehcyfd6g6z	org_y0txnlv69l6vp70ey06b	59891670722	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891670722	\N	importación:CSV 2026	\N	cecilia.fajian@durazno.gub.uy	4.527.213 -5	Fajián Rodriguez,	Cecilia Raquel
ct_xwywlbulbzhr8kp03za5	org_y0txnlv69l6vp70ey06b	59899411179	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899411179	\N	importación:CSV 2026	\N	mariela.garrido@durazno.gub.uy	1.970.686 -7	Garrido	Rodriguez, Mariela
ct_6lpsx6xon0qdmpl4l6rk	org_y0txnlv69l6vp70ey06b	59899339479	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899339479	\N	importación:CSV 2026	\N	addis.maciel@durazno.gub.uy	4.797.825 -4	Maciel fernandez,	Addis María
ct_a8aeo4xx3ydfogq6cvdg	org_y0txnlv69l6vp70ey06b	59898994232	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898994232	\N	importación:CSV 2026	\N	agustinaelola29@gmail.com	51370688	Agustina	Elola
ct_ao3pmbbhvjkt3tcm8jqf	org_y0txnlv69l6vp70ey06b	59894720303	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894720303	\N	importación:CSV 2026	\N	mikaela.perey@gmail.com	54503636	Camila Mikaela	Pereyra
ct_pfzkf02zn3h7b6pu50d6	org_y0txnlv69l6vp70ey06b	59899703590	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899703590	\N	importación:CSV 2026	\N	karen.leider@imm.gub.uy	2.624.354-9	Karen	Leider
ct_rakovv9ksj97pty1qpjy	org_y0txnlv69l6vp70ey06b	59899783078	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899783078	\N	importación:CSV 2026	\N	kbia90@gmail.com	4.545.263-8	Karen	Bia
ct_bw5yl8v9in2vu3amst03	org_y0txnlv69l6vp70ey06b	59899902711	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899902711	\N	importación:CSV 2026	\N	analia2809@gmail.com	3.391.968-4	Analía	Pérez Sánchez
ct_6ck31x0yr3i0wj94vofq	org_y0txnlv69l6vp70ey06b	59894646862	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59894646862	\N	importación:CSV 2026	\N	gustavo.andreoli@brou.com.uy	1.965.690-1	Gustavo Abascal	ANDREOLI CORREA
ct_8f7a4s4myo15ea7b3o8f	org_y0txnlv69l6vp70ey06b	59899208669	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899208669	\N	importación:CSV 2026	\N	edecia81@gmail.com	3.048.578-3	Ernesto	DECIA RAVAIOLI
ct_pk7o3kubmvrr42qh0cu4	org_y0txnlv69l6vp70ey06b	59891793753	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891793753	\N	importación:CSV 2026	\N	fedecarneiro27@gmail.com	3.896.370-9	Federico Adrián	CARNEIRO BONILLA
ct_im44hx4v43zwkgp7e2j8	org_y0txnlv69l6vp70ey06b	59891098368	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891098368	\N	importación:CSV 2026	\N	maria.rocha.galanena@brou.com.uy	4.368.334-8	Ma. Jesús	Rocha
ct_752zbx54974iruk8kp89	org_y0txnlv69l6vp70ey06b	59892201250	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892201250	\N	importación:CSV 2026	\N	daymelas@gmail.com	5.041.881-5	Daymel Noe	ABI SAAB FAGOAGA
ct_dznqwqm6whdzigyoypc3	org_y0txnlv69l6vp70ey06b	59899841406	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899841406	\N	importación:CSV 2026	\N	paulap_102@hotmail.com	4.806.089-8	María Paula	PINTOS CORREA
ct_3592tsbfv63rilz5dxbt	org_y0txnlv69l6vp70ey06b	59898060823	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898060823	\N	importación:CSV 2026	\N	cammi.silveira@hotmail.com	5.068.626-0	Camila	SILVEIRA CORREA PAIVA
ct_bm2q3p5u826bjvv4uxz6	org_y0txnlv69l6vp70ey06b	59891387868	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891387868	\N	importación:CSV 2026	\N	rodriguezmarianoel@hotmail.com	4.424.872-5	María Noel	RODRIGUEZ BERTI
ct_u6xb34ve7xjutc4kl857	org_y0txnlv69l6vp70ey06b	59896241039	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896241039	\N	importación:CSV 2026	\N	betspaganifing@gmail.com	4.768.060-7	Betsebel	Pagani
ct_9qaw44mj80ydc7f9d2pj	org_y0txnlv69l6vp70ey06b	59891710348	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891710348	\N	importación:CSV 2026	\N	guillermina7428@gmail.com	52557265	Guillermina	Rodriguez
ct_u9xuulrai3qv307xutii	org_y0txnlv69l6vp70ey06b	59897392211	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897392211	\N	importación:CSV 2026	\N	aulfe@metropolitana.com.uy	4.859.224-3	Alejandra Romina	Ulfe Da Silva
ct_xon7g6f0kg5qwtdmz5ol	org_y0txnlv69l6vp70ey06b	59895410045	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895410045	\N	importación:CSV 2026	\N	agustin_agius@hotmail.com	4149472-5	Agustín	Agius Garrido
ct_esgt082m67g5mv517ms0	org_y0txnlv69l6vp70ey06b	59893728516	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893728516	\N	importación:CSV 2026	\N	fgastonvp@gmail.com	48585032	Francisco Gastón	Varela Pérez
ct_4rh2o35543rzpra6x6dk	org_y0txnlv69l6vp70ey06b	59892944555	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892944555	\N	importación:CSV 2026	\N	franciscogalietta@ingener.com	49512444	Francisco Gastón	Galietta
ct_yixrt4dpjh9hsnmy41yw	org_y0txnlv69l6vp70ey06b	59892648199	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892648199	\N	importación:CSV 2026	\N	virbarant@gmail.com	5041456-8	Virginia	barreto
ct_q490l1033tas9gcs8rqc	org_y0txnlv69l6vp70ey06b	59899965739	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899965739	\N	importación:CSV 2026	\N	juan.lacassy19@gmail.com	4.859.696-0	Juan	Lacassy
ct_k6g583mloylvda88j5se	org_y0txnlv69l6vp70ey06b	59898487080	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898487080	\N	importación:CSV 2026	\N	suarezbarriosmanuela@gmail.com	5.330.925-9	Manuela	Suarez Barrios
ct_u42gwlaidqw53uo7ulus	org_y0txnlv69l6vp70ey06b	59895747659	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59895747659	\N	importación:CSV 2026	\N	mayra4138@gmail.com	4.906.342-1	Mayra Elizabeth	Doldán Machado
ct_mlb2zwldcj74vljia67v	org_y0txnlv69l6vp70ey06b	59892611682	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892611682	\N	importación:CSV 2026	\N	karinabon1203@gmail.com	4.439.294-4	Karina	Bon
ct_qyij7zwnzehs2k4qzrjh	org_y0txnlv69l6vp70ey06b	59899375571	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899375571	\N	importación:CSV 2026	\N	karinapensado@gmail.com	27890084	Karina	Pensado
ct_riuez12o9nem6ssr1sdq	org_y0txnlv69l6vp70ey06b	59898176905	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898176905	\N	importación:CSV 2026	\N	ceisofiazunino@gmail.com	4803167-7	Sofia	Zunino
ct_4q2qcqfwg1q56c1hx8jn	org_y0txnlv69l6vp70ey06b	59893376269	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59893376269	\N	importación:CSV 2026	\N	ks928237@gmail.com	5.275.465-9	Kelly Nayeli	Silva Ferreira
ct_2lhq1lxsr7lfm2i14dw4	org_y0txnlv69l6vp70ey06b	59897990373	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897990373	\N	importación:CSV 2026	\N	miguel.velazco@teyma.com	4.848.120-0	Miguel	Velazco
ct_m23xr5ociwh4esv04h56	org_y0txnlv69l6vp70ey06b	59896406721	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896406721	\N	importación:CSV 2026	\N	vicenreuglio@gmail.com	5.629.801-5	Vicente	Ruglio
ct_97i5rrcdvxwmttabk4rq	org_y0txnlv69l6vp70ey06b	59892404291	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892404291	\N	importación:CSV 2026	\N	lucas.suarez.70234@gmail.com	5.456.311-7	Lucas Nahuel	Giménez Suárez
ct_brfxaq7eaoyv9tfslky1	org_y0txnlv69l6vp70ey06b	59899461573	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899461573	\N	importación:CSV 2026	\N	maguibianchi04@gmail.com	5383481-6	Magdalena	Bianchi
ct_wsc902l54a7ygve6pj3r	org_y0txnlv69l6vp70ey06b	59897935920	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897935920	\N	importación:CSV 2026	\N	framos@metropolitana.com.uy	4.761.195-1	Florencia	Ramos
ct_sacnb9ppmxc6z16hd79j	org_y0txnlv69l6vp70ey06b	59898182486	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898182486	\N	importación:CSV 2026	\N	amoreno.aladinos@gmail.com	42461236	Alejandro	Moreno
ct_ludd2upyz99f4209u2s0	org_y0txnlv69l6vp70ey06b	595976206198	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595976206198	\N	importación:CSV 2026	\N	fvillablanca@benitezbittar.com.py	\N	Francisco	VillaBlanca
ct_zl8vn7egylihxgiqhpds	org_y0txnlv69l6vp70ey06b	59892804665	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59892804665	\N	importación:CSV 2026	\N	antonellapassaro01@gmail.com	\N	Antonella	Passaro
ct_ihfhw0yj280w4s7szggb	org_y0txnlv69l6vp70ey06b	59898611221	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898611221	\N	importación:CSV 2026	\N	silvaminetto@gmail.com	\N	Marcelo	Silva
ct_zqqcma0swk93bkki188v	org_y0txnlv69l6vp70ey06b	59898978406	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898978406	\N	importación:CSV 2026	\N	carlos.guido@gmail.com	\N	Carlos	Guido
ct_b7tigawwotwae9ee0k6v	org_y0txnlv69l6vp70ey06b	59899875113	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899875113	\N	importación:CSV 2026	\N	vir.rubio.del@gmail.com	\N	Virginia	Rubio
ct_jn1alhy13bkdet9idehn	org_y0txnlv69l6vp70ey06b	59899522924	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899522924	\N	importación:CSV 2026	\N	arq.leticia.balao@gmail.com	\N	Leticia	Balao
ct_sy6ucdx11tq4s1qiqy9t	org_y0txnlv69l6vp70ey06b	59897438234	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59897438234	\N	importación:CSV 2026	\N	daniielzerpa@gmail.com	\N	Daniel	Zerpa
ct_gsue6i62fqoltdxpgahz	org_y0txnlv69l6vp70ey06b	59898992238	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898992238	\N	importación:CSV 2026	\N	ing.ramiroreyes@gmail.com	\N	Ramiro	Reyes
ct_ajt1bffx9lkmifo1n0h9	org_y0txnlv69l6vp70ey06b	59898634458	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898634458	\N	importación:CSV 2026	\N	fedemoder513@gmail.com	\N	Federico	Modernel
ct_7c3orpait7lzfbykco30	org_y0txnlv69l6vp70ey06b	59891056667	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891056667	\N	importación:CSV 2026	\N	ignaciogelmini3a@gmail.com	\N	Ignacio	Gelmini
ct_od91c05h76dybvxtydix	org_y0txnlv69l6vp70ey06b	59898103832	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898103832	\N	importación:CSV 2026	\N	delafuenteeuge@gmail.com	\N	Eugenia	de la Fuente
ct_mjou5sr0e27ha3m8ru6d	org_y0txnlv69l6vp70ey06b	595981794017	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595981794017	\N	importación:CSV 2026	\N	jpineda@sicon.com.py	\N	Javier	Pineda
ct_mkkia7qjay94mlvmgauj	org_y0txnlv69l6vp70ey06b	59896195981	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59896195981	\N	importación:CSV 2026	\N	juanic.nu@gmail.com	\N	Nicolás	Nuñez Pirez
ct_77g2ngbba0jkaxelz6el	org_y0txnlv69l6vp70ey06b	59898834614	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59898834614	\N	importación:CSV 2026	\N	luciaarimonrava@gmail.com	\N	Lucía	Arimon
ct_k3wjyjfbtldez67j143n	org_y0txnlv69l6vp70ey06b	59891392591	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59891392591	\N	importación:CSV 2026	\N	nicohansen15@gmail.com	\N	Nicolas	Hansen
ct_mu38jminu016mhx5rfdm	org_y0txnlv69l6vp70ey06b	59899251562	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899251562	\N	importación:CSV 2026	\N	arqdemattos@gmail.com	\N	Margarita	de Mattos
ct_j57s68coufi5x4pyzwv4	org_y0txnlv69l6vp70ey06b	595985461757	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	595985461757	\N	importación:CSV 2026	\N	manuperezv12@gmail.com	\N	Manuel Alexander	Pérez Vera
ct_eagt0oec7tuau3khv6ze	org_y0txnlv69l6vp70ey06b	59899228532	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899228532	\N	importación:CSV 2026	\N	arq.analuisalopez@gmail.com	\N	Ana Luisa	López Gambetta
ct_f745s217e80xgw43977h	org_y0txnlv69l6vp70ey06b	59899249850	\N	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	59899249850	\N	importación:CSV 2026	\N	naiarab1992@gmail.com	\N	Naiara	Batista
\.


--
-- Data for Name: conversation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.conversation (id, organization_id, contact_id, is_test, ai_enabled, handoff_at, handoff_reason, last_inbound_at, last_message_at, unread_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course (id, organization_id, name, description, created_at, updated_at, slug, tagline, category_id, level, modality, duration_weeks, hours_per_week, image_url, learning_objectives, target_audience, syllabus_url, published, min_attendance_pct, list_price, list_currency, grants_certificate) FROM stdin;
crs_alv3pmlqlhohwf2e3mia	org_y0txnlv69l6vp70ey06b	[DEMO] Curso de prueba	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	demo-curso-de-prueba	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_7b7cs4ikva735avvxvwe	org_y0txnlv69l6vp70ey06b	AutoCAD 2D Estudiantes	Aprender los comandos necesarios para el diseño en dos dimensiones a nivel profesional.	2026-08-17 15:53:14.645896	2026-09-01 18:44:33.355	autocad-2d-estudiantes	Aprende las herramientas de dibujo técnico 2d, documentación y manejo de datos.	\N	\N	en_vivo	\N	\N	https://damassets.autodesk.net/content/dam/autodesk/www/products/autocad/fy26/overview/images/autocad-2026-mobile-banner-560x315.jpg	[]	\N	\N	t	\N	\N	\N	t
crs_ugccjm296cuvxmzlqpva	org_y0txnlv69l6vp70ey06b	Revit Arquitectura Profesionales	Objetivo del curso: utilizar Revit arquitectura para el diseño y modelado de proyectos de edificaciones en 3D, así como generar documentación técnica para la presentación y construcción del proyecto.	2026-08-17 15:53:14.645896	2026-09-01 13:58:32.121	revit-arquitectura	Aprende a implementar estrategias de eficiencia en procesos de proyecto, trabajo colaborativo, herramientas de visualización y conceptualización BIM.	\N	\N	\N	\N	\N	\N	\N	Dirigido a todo público que desee incorporarse o ya esté inserto en el mercado de la Arquitectura e Infraestructura.	\N	t	\N	\N	\N	t
crs_nzl4khq2vx64oatqe2gg	org_y0txnlv69l6vp70ey06b	Especialización Proyecto Ejecutivo con Revit	Adquirirás conocimientos para la generación de la documentación gráfica ejecutiva de REVIT necesaria para su ejecución en obra, gestión de permisos y habilitaciones.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	especializacion-proyecto-ejecutivo-con-revit	Especialización Proyecto Ejecutivo con Revit Aprende a desarrollar un proyecto arquitectónico completo para su integración colaborativa, documentación y aprobación municipal. [...]	\N	\N	en_vivo	\N	\N	\N	\N	Para arquitectos y estudiantes avanzados de arquitectura, que deseen especializarse en la generación de documentación para proyecto ejecutivo. — Conocimientos de REVIT.	\N	t	\N	\N	\N	t
crs_x2diaha6tvi85ij7zv7y	org_y0txnlv69l6vp70ey06b	Especialización en Proyectos BIM	Especialista en Proyectos BIM brinda una introducción a los conceptos teóricos y prácticos de las herramientas básicas necesarias, con el fin de que el alumno lidere el cambio de paradigma que implica la aplicación de metodologías BIM en el sector de la industria de la construcción. Además en los correspondientes módulos se abordan las diferentes tecnologías aplicables para cada una de las etapas del ciclo de vida de un proyecto. Desde la fase inicial de diseño, mediante la utilización de diferentes softwares de modelado, pasando por las fases de coordinación y gestión, hasta la Implementación. Se tiene en cuenta para ello su vinculación con las posteriores etapas de puesta en funcionamiento y mantenimiento de las infraestructuras.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	especializacion-en-proyectos-bim	Unite a la revolución de la metodología BIM Con la especialización en proyectos BIM, aprende a liderar el cambio de [...]	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_bkdrij1jvu0u9udj1ns0	org_y0txnlv69l6vp70ey06b	AutoCAD 2D Profesionales	Aprender los comandos necesarios para el diseño en dos dimensiones a nivel profesional.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-2d	Aprende las herramientas de dibujo técnico 2d, documentación y manejo de datos.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_2fdj83471xzcsu6fqh51	org_y0txnlv69l6vp70ey06b	AutoCAD Electrical	Contiene una completa librería de componentes estándares, soporta los principales estándares y permite la documentación y generación de la parte eléctrica de los prototipos digitales creados en Autodesk Inventor. Ofrece herramientas para la mejora de la productividad.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-electrical	Aprende a acelerar el proceso de diseño de sistemas de control y automatización.	\N	\N	en_vivo	\N	\N	\N	\N	Ingenieros y técnicos especializados en diseñar Circuitos eléctricos de Control y Automatización basados en PLC’s. — Uso básico del software AutoCAD.	\N	t	\N	\N	\N	t
crs_dmwnzndn4evopl29alpk	org_y0txnlv69l6vp70ey06b	AutoCAD Plant	En este curso, aprenderás cómo empezar un proyecto desde cero, cómo realizar el conexionado de equipos con piping y cómo insertar elementos en línea desde especificación. Además, conocerás los flujos de intercambio BIM con otras soluciones como Advance Steel o Inventor. El curso también te permitirá adquirir la capacidad de crear y gestionar especificaciones de tubería de diferentes estándares, así como la gestión de catálogos. Aprenderás a generar listados de ingeniería presentables al cliente y entenderás el alcance de proyectos con maquetas virtuales 3D generadas con nubes de puntos.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-plant	Aprende los conceptos generales del diseño de plantas y el uso de las herramientas: AutoCAD P&ID, AutoCAD Plant 3D y Autodesk Navisworks, para crear diseños de plantas que cumplan con los requerimientos de diseño y los flujos de trabajo.	\N	\N	en_vivo	\N	\N	\N	\N	Diseñadores de plantas, Ingenieros de procesos, Ingenieros Industriales, Estudiantes. — Uso básico del software AutoCAD.	\N	t	\N	\N	\N	t
crs_g4pmzpk6f5rlg03dlvd4	org_y0txnlv69l6vp70ey06b	Revit Arquitectura Estudiantes	Objetivo del curso: utilizar Revit arquitectura para el diseño y modelado de proyectos de edificaciones en 3D, así como generar documentación técnica para la presentación y construcción del proyecto.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-arquitectura-estudiantes	Aprende a implementar estrategias de eficiencia en procesos de proyecto, trabajo colaborativo, herramientas de visualización y conceptualización BIM.	\N	\N	\N	\N	\N	\N	\N	Dirigido a todo público que desee incorporarse o ya esté inserto en el mercado de la Arquitectura e Infraestructura.	\N	t	\N	\N	\N	t
crs_kvknjfarzcvxrbgs8bu5	org_y0txnlv69l6vp70ey06b	Revit Estructura	Revit Estructuras es una herramienta fundamental para el diseño y modelado de proyectos de ingeniería estructural en 3D cargados de información. Durante el curso, los participantes aprenderán a crear modelos de edificios y estructuras, agregar elementos constructivos y de diseño específicos para estructuras como pilares, vigas, losas y cimentaciones, y generar documentación técnica. El objetivo es que los participantes puedan utilizar Revit Estructuras para diseñar estructuras complejas y coordinar con otros profesionales involucrados en la construcción de un proyecto, lo que les permitirá mejorar la eficiencia y la precisión en sus diseños.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-avanzado	Aprende diseño y modelado de proyectos de ingeniería estructural en 3D cargados de información.	\N	\N	en_vivo	\N	\N	\N	\N	Profesionales y estudiantes en el rubro de la Arquitectura e Infraestructura. Se recomienda haber cursado Revit Básico.	\N	t	\N	\N	\N	t
crs_9q5kc25b0tgo0osgztec	org_y0txnlv69l6vp70ey06b	Revit MEP	Este curso está dirigido a estudiantes y profesionales interesados en aprender a utilizar Revit MEP, una herramienta fundamental para el diseño y modelado de proyectos de instalaciones MEP en 3D cargados de información.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-mep	Aprende diseño y modelado de proyectos de instalaciones MEP en 3D cargados de información.	\N	\N	en_vivo	\N	\N	\N	\N	profesionales en el rubro de la Arquitectura e Infraestructura.	\N	t	\N	\N	\N	t
crs_am73cm3h95e5tfrcza62	org_y0txnlv69l6vp70ey06b	Revit Familias	Este curso está dirigido a estudiantes y profesionales interesados en aprender a crear familias personalizadas en Revit, una habilidad esencial para la personalización de elementos específicos en proyectos de construcción.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-familias	Aprende a crear familias en Revit para la personalización de elementos específicos en proyectos de construcción.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_ffmn1fkujlw6sy2g9enx	org_y0txnlv69l6vp70ey06b	REVIT Avanzado	Obtendrás los conocimientos para una gestión gráfica coordinada y estandarizada. Personaliza tus operaciones con un navegador de proyecto organizado a medida, separado en fases de proyecto, genera nuevas opciones de diseño para mejorar el diálogo con tus clientes, trabaja con nubes de puntos y colaboración en la nube a través de un ECD (entorno común de datos). Un paquete que te abrirá un abanico interesante de opciones.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-avanzado-2	Aprende herramientas para gestionar la información de manera profesional, editando y creando parámetros de proyecto, globales y compartidos.	\N	\N	en_vivo	\N	\N	\N	\N	(estudiantes y profesionales) en el rubro de la Arquitectura e Infraestructura. — Se recomienda haber cursado Revit Arquitectura, Revit Estructura y/o Revit MEP.	\N	t	\N	\N	\N	t
crs_awo8z4lm4g5uykgxeax1	org_y0txnlv69l6vp70ey06b	Twinmotion para Revit	El curso Twinmotion para Revit está orientado a facilitar la visualización y comunicación de los proyectos arquitectónicos, lo que le permite crear representaciones fotorrealistas y experiencias inmersivas Twinmotion, es un programa de visualización arquitectónica en tiempo real que se integra fácilmente con Revit y permite a los arquitectos con experiencia en proyectos BIM y estudiantes de arquitectura crear presentaciones visuales impresionantes de sus diseños. Esta herramienta ofrece una interfaz fácil de entender y potentes capacidades de renderizado, lo que permite a los usuarios explorar y presentar sus modelos de Revit con una calidad fotorrealista y en tiempo real. Twinmotion permite a los arquitectos y estudiantes mostrar sus diseños en entornos diversos y realistas gracias a su amplia gama de efectos visuales, como iluminación dinámica, materiales realistas, vegetación abundante y condiciones climáticas variables.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	twinmotion-para-revit	Twinmotion para Revit Aprende a mejorar la presentación y visualización de proyectos de manera rápida y efectiva, con realidad virtual [...]	\N	\N	presencial	\N	\N	\N	\N	Conocimientos de conceptos de manejo espacial y composición arquitectónica. Este curso fue ideado para ser accesible a usuarios con nivel intermedio en Revit para iniciar el proceso de aprendizaje. Verificar requisitos para instalación de Twinmotion aquí: https://twinmotionhelp.epicgames.com/s/article/Twinmotion-System-Requirements?language=en_US	\N	t	\N	\N	\N	t
crs_3rvis8fhzjqj4c45y9pl	org_y0txnlv69l6vp70ey06b	Civil 3D	Aprenderás herramientas, conceptos y aplicaciones de las funciones esenciales de Auto- CAD Civil 3D para crear y analizar modelos Digitales del Terreno con el que se podrán afrontar complejos retos de infraestructura en un entorno basado en modelos 3D.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	robot-structural-analysis-essentials-civil-3d	Aprende a crear y analizar modelos Digitales del Terreno con el que se podrán afrontar complejos retos de infraestructura en un entorno basado en modelos 3D	\N	\N	en_vivo	\N	\N	\N	\N	Manejo de AutoCAD.	\N	t	\N	\N	\N	t
crs_nnnxm9wfs2fbjdh85b36	org_y0txnlv69l6vp70ey06b	Dynamo	Aprende a automatizar tareas, gestionar parámetros masivamente, y utilizar el diseño generativo para optimizar tus proyectos arquitectónicos. Gestión de parámetros: Aprende a volcar y extraer información de unos parámetros a otros de manera eficiente. Modelado y modificación masiva: Descubre cómo automatizar acciones para optimizar recursos y tiempo en Revit. Recopilación de información: Utiliza Dynamo para recopilar datos y generar informes personalizados. Diseño generativo: Explora el uso de algoritmos para generar múltiples soluciones de diseño innovadoras.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	curso-online-de-dynamo	Aprende a automatizar tareas, gestionar parámetros masivamente, y utilizar el diseño generativo para optimizar tus proyectos arquitectónicos.	\N	\N	en_vivo	\N	\N	\N	\N	Arquitectos y estudiantes de arquitectura con conocimiento nivel medio/avanzado de Revit en las diferentes disciplinas (Arquitectura, Estructura, MEP, etc) con conocimiento nivel inicial/medio de programación gráfica.	\N	t	\N	\N	\N	t
crs_2iglohhtk1w3w9welsr5	org_y0txnlv69l6vp70ey06b	Inventor Essentials	En este curso se cubren 3 módulos fundamentales del diseño paramétrico 3D en Inventor: el modelado de piezas, la generación de ensamblajes y la documentación en el plano. El curso es de carácter práctico y se presentan situaciones del mundo real con ejemplos de uso de las diferentes herramientas y módulos del programa.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-essentials	Aprende el modelado de piezas, la generación de ensamblajes y la documentación en el plano.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_it0ldqs62njsolnuw9h7	org_y0txnlv69l6vp70ey06b	Inventor: ensamblaje avanzado y diseño de máquinas	Ensamblaje Avanzado y Diseño de Máquinas es la continuación de Inventor Essentials para llevar los conocimientos de Inventor, Diseño industrial y Mecánico mediante prototipos digitales al próximo nivel. Por ejemplo exploramos Diseño de Máquinas con archivo master, Técnicas de Diseño deriva-do, Generador de estructuras, Aceleradores de diseño de máquinas (rulemanes, engranajes, correas, piñones), Soldaduras entre otros.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	curso-online-de-inventor-ensamblaje-avanzado-y-diseno-de-maquinas	Es la continuación de Inventor Essentials para llevar los conocimientos de Inventor, Diseño industrial y Mecánico mediante prototipos digitales al próximo nivel.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_xdjuu6rl71nvz46v1gkp	org_y0txnlv69l6vp70ey06b	Inventor diseño de chapas	Sheet Metal o Inventor Chapa es un entorno de modelado específico con sus herramientas y técnica particular. Comprende conocer los conceptos y tecnología de fabricación, de máquinas CNC- y méto dos con ejemplos para exportar piezas desde el 3D, generar el desarrollo y realizar la documentación para manufactura.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-diseno-de-chapas	Aprende los conceptos y tecnología de fabricación, de máquinas CNC y métodos con ejemplos para exportar piezas desde en 3D, generar el desarrollo y realizar la documentación para manufactura.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_1gsbb0wiqpxjub6m1jav	org_y0txnlv69l6vp70ey06b	Inventor análisis de stress y simulación dinámica	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-analisis-de-stress-y-simulacion-dinamica	Aprende a simular y analizar los prototipos digitales como que fueran construidos en el mundo real. Mediante el análisis digital podemos realizar ajustes, resolver problemas de resistencia, ajustar los diseños y optimizar el uso de los materiales antes de realizar costosos prototipos físicos.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_7c9vabpgryq4nkhmhm70	org_y0txnlv69l6vp70ey06b	Inventor diseño de tuberías	Aprende a realizar proyectos de plantas con tuberías, se pueden realizar tuberías, cañerías y flexibles. Exploramos la generación de lista de partes completas con elementos completos y detallados, se insertan válvulas, reducciones, bridas etc.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-diseno-de-tuberias	Aprende a realizar proyectos de plantas con tuberías, se pueden realizar tuberías, cañerías y flexibles. Exploramos la generación de lista de partes completas con elementos completos y detallados, se insertan válvulas, reducciones, bridas etc.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_quggt2nlgu68r9dxeols	org_y0txnlv69l6vp70ey06b	Inventor Studio	Aprende a generar exportables de alta calidad y definición de nivel profesional de nuestros diseños. Las técnicas de renderizado con ajuste de estilo visual, texturados, sombras, perspectivas e iluminación, forman parte del conocimiento para comunicar los diseños. El entorno cuenta con herramientas de animación de movimiento de los diseños y de animación de las cámaras. El renderizado de nivel fotorrealista con trazado de rayos permite generar imágenes y animaciones digitales prácticamente reales.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-studio	Aprende a generar exportables de alta calidad y definición de nivel profesional de nuestros diseños.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	\N	t
crs_u4ajg3bfqfwfdom3x8hd	org_y0txnlv69l6vp70ey06b	CAPACITACION AP3D - NUBE DE PUNTOS	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	capacitacion-ap3d-nube-de-puntos	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_s23vpc9fs2t4u48910zx	org_y0txnlv69l6vp70ey06b	Revit Arq + Revit Estructura + Revit MEP	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-arq-revit-estructura-revit-mep	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_f8aviwzruxbce1k7u9v6	org_y0txnlv69l6vp70ey06b	Revit Electrical	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-electrical	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_h2nynx0r2ad3j3h9zs0d	org_y0txnlv69l6vp70ey06b	Taller DOCS + BIM Coll- 1	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs-bim-coll-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_pe9at2dykyaefsvuf15u	org_y0txnlv69l6vp70ey06b	Taller DOCS + BIM Coll- 2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs-bim-coll-2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_3cfqj4ncoq8pnzdvdplj	org_y0txnlv69l6vp70ey06b	Fusion	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	fusion	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_kyz1ukzsz8rd7m2vtjup	org_y0txnlv69l6vp70ey06b	Taller DOCS	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_x76pxtm908ofniphypj2	org_y0txnlv69l6vp70ey06b	Taller BONITA BEACH 2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-bonita-beach-2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_675hlj4lf0n981c21k6v	org_y0txnlv69l6vp70ey06b	Taller Mi Primer BIM	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-mi-primer-bim	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_sjrguxdhjetu5amhkyda	org_y0txnlv69l6vp70ey06b	Revit - Zulamian	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-zulamian	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_d110qd4kuva3yj9usqde	org_y0txnlv69l6vp70ey06b	Taller Revit Electrical	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-revit-electrical	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_qijayeof17p71rwtt3y0	org_y0txnlv69l6vp70ey06b	BUILD - HandsON PY	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	build-handson-py	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	t
crs_nu47757ykvons2xx1nje	org_y0txnlv69l6vp70ey06b	Taller BONITA BEACH 1	\N	2026-08-17 15:53:14.645896	2026-09-01 17:42:39.204	taller-bonita-beach-1	\N	\N	\N	\N	\N	\N	\N	[]	\N	\N	t	\N	\N	\N	t
\.


--
-- Data for Name: course_category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course_category (id, organization_id, name, slug, created_at, updated_at) FROM stdin;
cat_vq9gzsx66rw2wb0cs3wq	org_y0txnlv69l6vp70ey06b	Inteligencia Artificial	inteligencia-artificial	2026-08-12 18:41:01.169795	2026-08-12 18:41:01.169795
\.


--
-- Data for Name: course_module; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course_module (id, organization_id, course_id, "position", title, topics, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: enrollment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.enrollment (id, organization_id, contact_id, cohort_id, stage_id, "position", enrolled_at, last_activity_at, created_at, updated_at, amount, installments, payment_notes, national_id, invoice_number, receipt_number, seller_id, company_id, terms_email_sent_at, software_installed_at, had_own_license, academia_online_access_at, interest_course_id, currency, welcome_email_sent_at, parent_enrollment_id, attendance_waiver_at, attendance_waiver_by, attendance_waiver_reason, attendance_waiver_revoked_at, attendance_waiver_revoked_by, attendance_waiver_revoke_reason) FROM stdin;
enr_oveodcqx8abzj14drq0i	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_t2pyxowjji94k5vboph4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.348	\N	2026-08-17 15:53:14.645896	2026-08-17 19:01:42.114	18012	\N	paga cuando este confirmado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rw4tx43cvangl2uxvtcg	org_y0txnlv69l6vp70ey06b	ct_5e4txam9jkv72xoi9xjn	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.338	\N	2026-08-17 15:53:14.645896	2026-09-01 14:48:25.97	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ajwgn5s1k8c3xpzht08s	org_y0txnlv69l6vp70ey06b	ct_xon7g6f0kg5qwtdmz5ol	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.331	\N	2026-08-17 15:53:14.645896	2026-09-01 14:50:13.679	6125	\N	pagó transf 22/6 - factura a Mauro Mattos 216510170012 camino paso escobar sn	\N	4123	\N	\N	\N	\N	2026-09-01 14:50:13.679	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ol258rs97f4orbbsap6m	org_y0txnlv69l6vp70ey06b	ct_6z2cdwqromj4rz56cuay	coh_o0wif02yng8jx045ofc5	stg_f92b4uejkxutx12710ff	0	2026-08-11 00:00:00	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	24000	4	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_cwhidx335p7izv97rbi2	org_y0txnlv69l6vp70ey06b	ct_cjj36uysd3662yb6n6r1	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.111	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ng880lw9cpx8tn56x34c	org_y0txnlv69l6vp70ey06b	ct_0133t8keomdz48yjpq26	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.038	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	pagó $20.000 el 26/2, y financiar el resto en 12 cuotas, y cancelando el saldo en noviembre antes de terminar el curso - $4666 el 13/3 -  $10.000 el 22/6 $5.000 el 4/8	\N	819	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6w7a3k5fhyw75qscimey	org_y0txnlv69l6vp70ey06b	ct_vzcwcvzk7a4cs0ymdjn0	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.04	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	ruc 3.985.979-7 - transferencia 10/3/26	\N	132	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N	\N	\N	\N	\N	\N	\N	\N
enr_nqvgnj6ql7ivxtq0879a	org_y0txnlv69l6vp70ey06b	ct_emcyly83ztjpfgc1go4w	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.041	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	10/3 transferencia cuota 1/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3lxcg1c0skuy3b6ii0ta	org_y0txnlv69l6vp70ey06b	ct_k03bmmvktxxcecc8rq02	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.042	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	socia sau, transferencia 19/3 $57.000	\N	808	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5d9x4ks9g710yc4d5f4q	org_y0txnlv69l6vp70ey06b	ct_5e4txam9jkv72xoi9xjn	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.043	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	oca presencial	\N	833	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_t6dfcyzf194k0qz30udv	org_y0txnlv69l6vp70ey06b	ct_upudzbdndawnh6gexj9o	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.044	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transferencia 6/4	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rpbm2w3hrb3mcxsy7s8m	org_y0txnlv69l6vp70ey06b	ct_fz2hf9uqbvxtlf8n5trj	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.045	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	INSEL SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N	\N	\N	\N	\N	\N	\N	\N
enr_2hns1cq0ju8t92toqp29	org_y0txnlv69l6vp70ey06b	ct_8wblmsom0tx2aa8kch8m	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.046	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	pago 1/3 30/04, 2/3 el 21/7	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N	\N	\N	\N	\N	\N	\N	\N
enr_zmhpsu8vwmusoqnrxz9l	org_y0txnlv69l6vp70ey06b	ct_eisi1chv7o33wm0120w9	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.047	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	\N	\N	849	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_uawricm1ew5sym6n3srj	org_y0txnlv69l6vp70ey06b	ct_g3yknsnigavx7bf504j0	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.048	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_f2657s8ezjnwcqb6yxkb	org_y0txnlv69l6vp70ey06b	ct_csc1ii0xcqw94cj50ksf	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.049	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	oca llamar 7/5 de 12 a 13	\N	853	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_h17ot2vv4rrjsuzmw7n7	org_y0txnlv69l6vp70ey06b	ct_5yi00tswejlfsx1oxkv5	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.049	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	visa mercado pago	\N	856	3142	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_txdakyc5nfq9kwb3b7o3	org_y0txnlv69l6vp70ey06b	ct_g7pa2737u8tendfex3bb	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.05	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	visa mercado pago	\N	857	3143	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8w5zhkcytqjjr3w8375c	org_y0txnlv69l6vp70ey06b	ct_kzcahp8j8foljjnb3sky	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.051	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	bps	\N	4113	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_qic60cg1khrzrloby1b2	org_y0txnlv69l6vp70ey06b	ct_wtm4qzhg4mz1qjhn1zd3	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.052	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_aq9km1z6too1u260uz8n	org_y0txnlv69l6vp70ey06b	ct_941m2jnq7h7gimf1u4bs	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.053	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_eoi4woflmu1md568b5kg	org_y0txnlv69l6vp70ey06b	ct_ur7p0ehsr6u7tt0iphol	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.054	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago	\N	858	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nvzrkhaem6hzbxpua9md	org_y0txnlv69l6vp70ey06b	ct_si9io0z4crn7m6rzjc0t	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.054	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16170	\N	transferencia 29/6 $16.170	\N	862	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_s21q916g0b48ealh1kfu	org_y0txnlv69l6vp70ey06b	ct_vsyctzhjt1o7y8zia7rw	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.055	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	transferencia a fin de junio	\N	863	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_cu9bowuqplgpw00e40yv	org_y0txnlv69l6vp70ey06b	ct_5uaksd3bubuamk2trueh	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.056	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago factura a Alenstar SA	\N	4116	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_lv0v6f2sjtqcdsufec1g	org_y0txnlv69l6vp70ey06b	ct_9upch4qkf72panbposye	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.057	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago	\N	860	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_l39dhx8br3u5v9glddtc	org_y0txnlv69l6vp70ey06b	ct_eolzsj2d5z6n1mwfbxrp	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.058	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	ARCA, transferencia enviar factura a arca@arca.com.uy	\N	4120	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hjbb0l79lmq2h3vyf7so	org_y0txnlv69l6vp70ey06b	ct_4knc0ilipcuryn9ydree	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.059	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	factura con rut envio x email, pago con tarjeta	\N	4121	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_47x5mnn3sdrk6w0oekyz	org_y0txnlv69l6vp70ey06b	ct_lb2i9icvy020cgzyxp9d	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.06	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de crédito	\N	870	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_r19567xhw5k3rik7yu3c	org_y0txnlv69l6vp70ey06b	ct_rh8htdhawm7cknnooyla	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.061	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 24/6 $11.550	\N	867	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zvasfx44j1qdjjuo7txy	org_y0txnlv69l6vp70ey06b	ct_32piiek47jg5q9cqdsb9	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.062	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	pagó transferencia 23/6 $6.125	\N	875	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_57tkd09ddz5kxm9jx0sq	org_y0txnlv69l6vp70ey06b	ct_7a0hq42x8vlycho17hng	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.063	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Fiscrea	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_j00ybkgk8zqazukx34ej	org_y0txnlv69l6vp70ey06b	ct_p4z8vpzm4ymvraasjtz7	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.064	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vbo18i6tbyfqza6i3m2s	org_y0txnlv69l6vp70ey06b	ct_4fonyo8bxvo029mf0h8p	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.065	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_geunf1cuf9d4jmrhdcra	org_y0txnlv69l6vp70ey06b	ct_ok2eypxm0g6yqmv4c84o	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.065	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ogqu6w35gch3mlatvxn6	org_y0txnlv69l6vp70ey06b	ct_bgcttxjnqh0t7uh3up49	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.066	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_j3mwlpi9wvt10i80ukgs	org_y0txnlv69l6vp70ey06b	ct_7cu3sq94htl3o0zfnwhz	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.068	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1ub4wwx5edgzjqs6u9dj	org_y0txnlv69l6vp70ey06b	ct_vd3ury62v662vqkxgjfz	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.068	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kebfdqwbr99wz1phq53u	org_y0txnlv69l6vp70ey06b	ct_sktyyq9fnz0o3y0h5gms	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.069	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11700	\N	transferencia	\N	876	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bxg66i77u5gpi0111r4o	org_y0txnlv69l6vp70ey06b	ct_n1k0tue7qlghv06vim5e	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.07	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta en 2 pagos	\N	877	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rgingqgkg3lvr16etmq5	org_y0txnlv69l6vp70ey06b	ct_u9igjbj7mld7lmd82ai7	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.071	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta	\N	878	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xro3uyaj580ex9gvadu2	org_y0txnlv69l6vp70ey06b	ct_0gr08xdgya9q5q3soxz2	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.072	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 25/6	\N	879	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zh1tb40zqoynri48ma4r	org_y0txnlv69l6vp70ey06b	ct_dbvs7vu5d7dctdc6i48m	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.073	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia	\N	880	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6fkg4lvb4e4yvt4pdjdg	org_y0txnlv69l6vp70ey06b	ct_d7yime2jqexoz5w72jsp	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.074	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	oca llamar 26/6 a las 12	\N	881	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_idggnv8ew3sij5ggjdzn	org_y0txnlv69l6vp70ey06b	ct_ezah637ulplhzkyatqdf	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.075	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 29/6	\N	882	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_uo98wqr4jhloda1qo7y1	org_y0txnlv69l6vp70ey06b	ct_7yc37q2ijrdmot148vsw	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.076	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	intendencia durazno, ya esta en revit 3	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6a783009i8zk67gwxhkv	org_y0txnlv69l6vp70ey06b	ct_aerznjwghbkj8ye4s93t	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.077	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	intendencia durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_u9mad6gs9vmcthzjh0je	org_y0txnlv69l6vp70ey06b	ct_3cnyyonxdhz30gkqohjj	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.078	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	intendencia durazno ya esta en revit 3	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_f3khpk0iru3ua6d1ybmr	org_y0txnlv69l6vp70ey06b	ct_6mdisjacv5rrmnj8kln1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.079	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta	\N	883	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1pag64tnmpexk5w2ncyo	org_y0txnlv69l6vp70ey06b	ct_nfkibqyhptk1ejyj31ij	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.08	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1762900	\N	transferencia py 30/6	\N	229	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N	\N	\N	\N	\N	\N	\N	\N
enr_6xyrlaxnpw6s173rqmo9	org_y0txnlv69l6vp70ey06b	ct_8qi2jrxa538rk49ii7a1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.08	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_q6rxn288k0vqq63rmnt7	org_y0txnlv69l6vp70ey06b	ct_ra3ga657hrde0x8worw1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.081	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	se factura a DISCO	\N	4142	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ixr1mm9ki50faab9k7ac	org_y0txnlv69l6vp70ey06b	ct_8dgagzpktt103cz85ng3	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.082	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1500	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fws83w9earj366b348ab	org_y0txnlv69l6vp70ey06b	ct_qa9ax4jrxltjuc51pdnk	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.083	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wapp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_14f7ea0fkjzcih4gj4l1	org_y0txnlv69l6vp70ey06b	ct_3f05ahiheid0ykus1ea6	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.084	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	nicolasdsf2@hotmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_i2a51qr79p6up8oct2y3	org_y0txnlv69l6vp70ey06b	ct_opb6yjpssdbvx61fpman	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.085	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	parsan11@hotmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_e5p4x7e686vbkdlfb26o	org_y0txnlv69l6vp70ey06b	ct_dffl4k37j5j6f30ezqlf	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.086	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	licencia hasta el 16/7	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ofivzgcrdx6eq9j96img	org_y0txnlv69l6vp70ey06b	ct_wgxtyp1bufhn65m9e9lg	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.087	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	leonardopuchetta21@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6ttu8elbn44zowgjubba	org_y0txnlv69l6vp70ey06b	ct_h9fut7276e783jhinqmd	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.087	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wapp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_dhp7i5ut18n3ze96627d	org_y0txnlv69l6vp70ey06b	ct_zhxbwzg25o3msb31pnu4	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.088	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_h1rykqg7z11xhzy7lvq5	org_y0txnlv69l6vp70ey06b	ct_7hu7yqp1sfnq4up34s5u	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.089	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	andrescunetti11@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rresmtgpn0c7s3znrqlx	org_y0txnlv69l6vp70ey06b	ct_g7qdxcf334d2pm24vzmo	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.09	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	jaguarino98@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ioww1ebbxuwz5kmswsdc	org_y0txnlv69l6vp70ey06b	ct_38tp3vw78qjeaqvujysm	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.091	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_awjsn7c8qs4pjqq6glg6	org_y0txnlv69l6vp70ey06b	ct_ot6tshbxt6qo80nbx41x	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.092	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_qh02n0jt9dnq22fg4ex7	org_y0txnlv69l6vp70ey06b	ct_o0z0jt4s9g4297kglx8k	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.093	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wpp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1d4w38m9zu9qb4tt5ogt	org_y0txnlv69l6vp70ey06b	ct_gv7k3b2tgp3np16hxrmj	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.094	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	darios.3010@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_arax03qw2sxqttga6fgu	org_y0txnlv69l6vp70ey06b	ct_e185ppup48ygqh652nzo	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.094	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ronaldguazzo@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bapz52m98p4cdifjy7sl	org_y0txnlv69l6vp70ey06b	ct_wh7o5f78d3dghltj63tb	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.095	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1275	\N	BERKES OC 3207660	\N	4137	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_02ddg2aqmb8x3bt0yl51	org_y0txnlv69l6vp70ey06b	ct_8wm3mtb6861l697ng61n	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.096	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nq1wlci0pitse1eovdjt	org_y0txnlv69l6vp70ey06b	ct_a1g601fn42ta1j2i9mft	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.097	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xtsyp5j9axhtjjqqmf8l	org_y0txnlv69l6vp70ey06b	ct_qst1onjsvxr9b6oqxo7d	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.098	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kcmqof3gbw9p3qf65p7a	org_y0txnlv69l6vp70ey06b	ct_ow1imb4uoc6r9aq26464	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.099	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hbqjmm3ao7fk7kheak5w	org_y0txnlv69l6vp70ey06b	ct_l7zu83mlwztpaccovroy	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.099	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nofory3nsore5npe9k7i	org_y0txnlv69l6vp70ey06b	ct_jibuii82lzjxq1tzukjp	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.1	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ZULAMIAN	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_harl4gia8dhx1pdcqwiq	org_y0txnlv69l6vp70ey06b	ct_k6lyyndc43c65cuewxs1	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.101	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_7yv2rp8upi4uvi1dmy1r	org_y0txnlv69l6vp70ey06b	ct_esqks78h1rxeowbu8oc7	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.102	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hds9oyyobovfk87sl00s	org_y0txnlv69l6vp70ey06b	ct_rqdf5wdnhisj1fwt86cd	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.104	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zaee3d74x0e8ll4dkrmk	org_y0txnlv69l6vp70ey06b	ct_sk22abcjuzk01ljfkxn0	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.105	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2jv2ijcp3umqzc5vmhmq	org_y0txnlv69l6vp70ey06b	ct_zdvvwq7p8z46oif99bq8	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.105	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_d7hm0xq12ft49n181l7x	org_y0txnlv69l6vp70ey06b	ct_ravr80wapkzolkbx460u	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.107	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nl2jv7v7nj0o2btfsa8d	org_y0txnlv69l6vp70ey06b	ct_m78k0262xcdcukbls9li	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.108	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ecdlah6z38mk6un84vco	org_y0txnlv69l6vp70ey06b	ct_ou4m4qyob4tz95n8ibt6	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.109	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6m9ps89ipu5wfvjgal0a	org_y0txnlv69l6vp70ey06b	ct_vimv2zr8vzx5rjgkyc4u	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.109	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_awyrva7cutctticz2779	org_y0txnlv69l6vp70ey06b	ct_1b7162oyg2zdigekceas	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.11	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rx17jztp3jhrdwajzols	org_y0txnlv69l6vp70ey06b	ct_anj4jf0orojdvrmnavjg	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.112	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_h5z4bff0xhn30wj5dht0	org_y0txnlv69l6vp70ey06b	ct_31bibppwmzlpstprzqdb	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.113	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_90lag0tuwi2ptcbaegg0	org_y0txnlv69l6vp70ey06b	ct_gegvw8tdnwaauj1b018a	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.114	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nnd12q9q2b16lthlkijj	org_y0txnlv69l6vp70ey06b	ct_gvd3bb9s0pvcwv3o3x5h	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.115	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	17100	\N	im durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_pgt4q4utxh80azfaoh1z	org_y0txnlv69l6vp70ey06b	ct_ku8rvyf1e3o849e4n3ql	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.116	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14116	\N	im durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_st0izw2ox576bupyfohr	org_y0txnlv69l6vp70ey06b	ct_5epk3a3tx0emviicr8yz	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.117	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8550	\N	facturar a serviam / transferencia	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_u8kht1020v3al3vv0vue	org_y0txnlv69l6vp70ey06b	ct_b9p43i8ksuqc8huonk28	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.118	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	Im colonia - compra directa 861759	\N	4139	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xg8nvcn6mnj3qhkgkjgp	org_y0txnlv69l6vp70ey06b	ct_4by72fp42lvrm96iiygx	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.118	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	im colonia - oc 861760	\N	4140	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ah7ex5kdl18ux0v1z8a0	org_y0txnlv69l6vp70ey06b	ct_lb8whbhsnx2og714jppr	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.119	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	500	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hhlb4z248352qsx6at2d	org_y0txnlv69l6vp70ey06b	ct_xl9nuxjwitpvgityfa3b	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.12	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6hibzx8f2gtkj3um2lga	org_y0txnlv69l6vp70ey06b	ct_ygmvtyh4icoz3io2n61p	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.121	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_i5tjsu3dxrjcbhosynki	org_y0txnlv69l6vp70ey06b	ct_ayl1old045d6u0aqr2ic	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.122	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	IM Colonia	\N	4141	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_se4dh0mb86snmcek0udo	org_y0txnlv69l6vp70ey06b	ct_01iei4vbpxqh0j31axgp	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.123	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	4275	\N	transf 10/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4yq7fg6xsqsjkxv7g9z4	org_y0txnlv69l6vp70ey06b	ct_vzptg6n4b5a8ytbkxpmu	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.124	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	seña $1.155 el 19/6 - $10.395 por MP el 24/7	\N	871	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_tto6hvhh76pjwi0g4469	org_y0txnlv69l6vp70ey06b	ct_gihr3i524upftmkk14t1	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.125	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de credito	\N	874	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9p7exh6ab92yp1z9023e	org_y0txnlv69l6vp70ey06b	ct_og1gsdc6gl46tq646syh	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.125	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	seña 10% transf 26/6	\N	872	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_mmggpabj4681hqaims8d	org_y0txnlv69l6vp70ey06b	ct_0cynznz47x3zws0ltqoo	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.126	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia	\N	889	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_js5d05p6dazgtdokrlnb	org_y0txnlv69l6vp70ey06b	ct_n0x8sa6p8r76zd0dlhq0	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.127	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de credito	\N	890	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_imdwthu47cr3ixy051ws	org_y0txnlv69l6vp70ey06b	ct_o7zxhvg9qggbjw6x0sgr	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.128	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	trasf $3000 30/6 - transf 13/7 $3.000 - 31/7 $5.550	\N	891	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bo2nqlx5s5fq3b1txpq4	org_y0txnlv69l6vp70ey06b	ct_be23eluq87muu6mx0xa0	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.129	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	892	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_p5wuw4yd7en6iluv606n	org_y0txnlv69l6vp70ey06b	ct_se2g6qjdwt0nukb6lvl4	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.13	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	transferencia $11.550 el 13/7 - paga saldo al comienzo	\N	893	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_90235x0pdlxd38cijw7h	org_y0txnlv69l6vp70ey06b	ct_vhnhmyzk55gc3t2n63nr	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.13	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito - pensó que el curso costaba $7.000	\N	899	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_v18qk3xo39q3xvngmp86	org_y0txnlv69l6vp70ey06b	ct_yrchsigfeusllevfaqli	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.131	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	900	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_yy0gm8ubzh457rt3o2t8	org_y0txnlv69l6vp70ey06b	ct_kvqs56xtax6vxdq6sv4g	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.132	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	903	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_mgpfi9e52z7962xook1x	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.133	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	se baja y pasa a EBIM	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_t2k85kg1t3dpizj32hm5	org_y0txnlv69l6vp70ey06b	ct_my5dr0nr6pkpvcsqajtm	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.134	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18840	\N	Transf 27/7 - se facturó a $18.480	\N	906	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_lq1nwoa6e8egsnhp0m75	org_y0txnlv69l6vp70ey06b	ct_missa3il818b2cmc80ji	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.134	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18400	\N	presencial oca 29/7	\N	907	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nc0blhjkpqmpu2yft8k2	org_y0txnlv69l6vp70ey06b	ct_ugd1rdn2v2l69amiblna	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.135	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	paraguay	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_irj15f883l9vofg98u1o	org_y0txnlv69l6vp70ey06b	ct_3o8drttlxgoif1ntnbmu	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.136	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	paraguay	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1sz9pdf1yj7zi0682qoo	org_y0txnlv69l6vp70ey06b	ct_r16wwpyicaiey6ypjqhq	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.137	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Eslicon SA - Rut 215917050011 - Maldonado 797 CP11100 Montevide	\N	4143	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_gm201zq9pxdmv8hpbmpw	org_y0txnlv69l6vp70ey06b	ct_0jgc4lnen0vaynpw7mub	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.138	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	\N	\N	909	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_uodwddxl15w6bmnw10q8	org_y0txnlv69l6vp70ey06b	ct_2p8h9jhvvpbmpkxke16k	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.139	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	$11.550 el 5/8 - Natalie: paga el saldo en setiembre según lo conversado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ytfgugzf1ickgc78xitj	org_y0txnlv69l6vp70ey06b	ct_wqhss598kd3zuwmlr626	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.14	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	transferencia ago/set/oct	\N	910	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sxk07of8a35cfzkxltt3	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.14	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19380	\N	Dirección Nacional de Sanidad de las FF.AA con RUT 214700820011	\N	4144	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hx9u6e6e4lz4sx0yioqi	org_y0txnlv69l6vp70ey06b	ct_8a0mtv6xd7lijwmvgrj8	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.141	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	transferencia 30/6	\N	895	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_th33fmpqjv96b5o6pa2l	org_y0txnlv69l6vp70ey06b	ct_yqf77qpti68iani3ixu5	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.173	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sn5y9ldhe36k7u67m9na	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.142	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	transferencia saldo 14/7 $10.132	\N	898	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_gnbl09fiervi3ne7zyue	org_y0txnlv69l6vp70ey06b	ct_myz9lqrmj8kthh5b61d0	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.143	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	tarjeta	\N	896	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sxfxdazjjkah5g2a0rv4	org_y0txnlv69l6vp70ey06b	ct_p0dwxw98pm1m87i98fl4	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.144	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18012	\N	oca	\N	897	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ropnc7fu3g6zibhyn7dp	org_y0txnlv69l6vp70ey06b	ct_4txnsmjmxc0x6ca60d4r	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.145	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sjl5db842daway2odsfv	org_y0txnlv69l6vp70ey06b	ct_ec03jn7zanyfi4g0nwt0	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.146	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_cpqgiszytkwk7c65pj64	org_y0txnlv69l6vp70ey06b	ct_b4mpsql0mfg1poorht29	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.146	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rhly0758gyp4zwvojrgs	org_y0txnlv69l6vp70ey06b	ct_ra3ga657hrde0x8worw1	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.147	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	22515	\N	facturar a grupo disco	\N	4145	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_cohv9x9hulmtixi17393	org_y0txnlv69l6vp70ey06b	ct_qpcz7bfz4x2ui2izzuta	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.148	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_x0tig45o1solmpro6iaq	org_y0txnlv69l6vp70ey06b	ct_4r8aiiwz7vkbtpr7zpah	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.149	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	450	\N	tpago pendiente	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rrxlxuvcyu4x5jsa5e3k	org_y0txnlv69l6vp70ey06b	ct_gt0i0omdgz7eqn5bv2lh	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.15	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	250	\N	facturar a Elemental Ingeniería  envio factura a jgomez@elementalbim.com o facturas@elementalbim.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_h0pazwl6esztncg9jfui	org_y0txnlv69l6vp70ey06b	ct_nhk8iiqvpmupgb4m4q5e	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.151	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	250	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4o07ryu4k33td785x06r	org_y0txnlv69l6vp70ey06b	ct_pgxnkjg998m0resh1gum	coh_aas6nhly9bgr81bq09ql	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.151	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	36000	\N	RHJF SRL	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_t75iwmfmdldzqv91nhxq	org_y0txnlv69l6vp70ey06b	ct_32tmcjryatk4o9updc0p	coh_aas6nhly9bgr81bq09ql	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.152	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	RHJF SRL	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9mfwivkm789d4iv69fvx	org_y0txnlv69l6vp70ey06b	ct_knbkmvrgfrqoapq2xrlz	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.153	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	transf 4/12	\N	593	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zmtoexyf5ccd6g977njx	org_y0txnlv69l6vp70ey06b	ct_6ywd616mlu77ggrza4l8	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.154	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	seña $4150 5/12 + 2 pagos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hr081q2iadtu9zkpme1t	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.155	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	se anotó en dos cursos total $14.400 - 5/12 transf $4800 - el 13/1 pagó $4800 - 20/2 pagó $4800 - se cambia de grupo	\N	589	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_uvcl81cp7oj7teh281d4	org_y0txnlv69l6vp70ey06b	ct_aez2b5rmranl6oc2vztc	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.156	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Transf en 3 cuotas - 3/1 pagó $4.083, 28/1 $4.083 saldo 4.084, 19/2 4083	\N	595	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vl76ejtfyprmyzm19exk	org_y0txnlv69l6vp70ey06b	ct_vssmygmwqlchj4ml6ulz	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.157	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transf 29/12 $7900	\N	596	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0luc7e23478hejcli4xr	org_y0txnlv69l6vp70ey06b	ct_5ssnmi55usc0kf2zfoi6	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.157	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1380000	\N	transferencia	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N	\N	\N	\N	\N	\N	\N	\N
enr_vta8nmlhlh888vcrymi1	org_y0txnlv69l6vp70ey06b	ct_xorxk70yjv3pj5ynziyv	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.158	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	Tarjeta de crédito OCA | Del 2/2 al 6/2 estará de viaje	\N	597	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_x1ws1zogk2oocip22vx6	org_y0txnlv69l6vp70ey06b	ct_ig1by7lwgcmjqahfg1gg	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.159	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	tarjeta de credito tiene revit tambien $17.800	\N	598	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_yterwwaibbjjbob6jqji	org_y0txnlv69l6vp70ey06b	ct_hf3bfxopbxp3xare7on8	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.16	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	tarjeta de debito con mercado pago 28/1	\N	614	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1msat7p2p7dv4vqg4nbv	org_y0txnlv69l6vp70ey06b	ct_hslpx9rcuvdkydukqlkj	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.161	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 29/1	\N	615	PAGÓ $4000 POR UPGRADE DE CURSO	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_utve5p0azx48kbxen557	org_y0txnlv69l6vp70ey06b	ct_gwj3w1x8nyu5f6ob4756	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.162	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Transferencia 29/1	\N	4003	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_v0zukxe24dbostu7vzst	org_y0txnlv69l6vp70ey06b	ct_k1c3nd876a4mar7pe35m	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.163	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transf 50% feb / 50% mar - el 2/2 pagó $3950 - el 26/3 pagó $3950	\N	618	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_st3oyq9r2mpfifp7zj6r	org_y0txnlv69l6vp70ey06b	ct_v96uwolph2zqeab8t630	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.163	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 30/1 - charden sa	\N	4004	está mal la CI	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_umg5t05kix3yf8tnoxs5	org_y0txnlv69l6vp70ey06b	ct_dbvs7vu5d7dctdc6i48m	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.164	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 4/2	\N	814	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zxm9zb2p5l2lpvje1psz	org_y0txnlv69l6vp70ey06b	ct_56xsf4a80ggurim33yce	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.165	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	oca presencial 5/2	\N	815	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kkgefs0nc7x7d1rrw6rq	org_y0txnlv69l6vp70ey06b	ct_owv09p4844kfnfasfa74	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.166	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_igoau2h09wwfci7ywh4o	org_y0txnlv69l6vp70ey06b	ct_acx5rbd4z84k93fcxilh	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.167	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_qbbkjfz6laijvjg9o57j	org_y0txnlv69l6vp70ey06b	ct_c3h42bd3byl0h46n4kai	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.168	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_k77fm2yfwghurpdtii27	org_y0txnlv69l6vp70ey06b	ct_bbnczrh0rbhryw4glu2l	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.169	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_v7u9fs39udgyda6k5iti	org_y0txnlv69l6vp70ey06b	ct_7eqd1jwnzmtaqph6b69j	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.17	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nt8du4nctmes5sp4tlx0	org_y0txnlv69l6vp70ey06b	ct_vi3zs7iqydyzrbs9f3bc	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.171	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kusnxhjug7pk1auombt7	org_y0txnlv69l6vp70ey06b	ct_xqoq2uut6q1vvhezh0io	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.172	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ca21c9fw7xwnonovh5m0	org_y0txnlv69l6vp70ey06b	ct_chhucvvkgyyneuirbzk7	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.173	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_152mr1og9uv7hblyf65o	org_y0txnlv69l6vp70ey06b	ct_08cg3ftf0qan7ss8z21x	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.174	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_05fs5mgcdq8oxaws3zrj	org_y0txnlv69l6vp70ey06b	ct_zo2pzwag90vslw4abr7o	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.175	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ojxoji5qd1xk40xbylst	org_y0txnlv69l6vp70ey06b	ct_84vh96lu1loh3vf94cjs	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.176	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5ojeumoucs7ke1878mqt	org_y0txnlv69l6vp70ey06b	ct_vrkuta96azae6q444w9w	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.177	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6aada3266th7phzncppq	org_y0txnlv69l6vp70ey06b	ct_a6p5j4g2o3or9yn4q1z8	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.178	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_b4yc2ytjmb4kqr505m9s	org_y0txnlv69l6vp70ey06b	ct_iypxtbeiu388z9zox635	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.179	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2fsr70vejhayl6z982o7	org_y0txnlv69l6vp70ey06b	ct_rx08oljrjoascvqm2y1r	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.18	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_wfmkdtj0i2mg8j4oo4kd	org_y0txnlv69l6vp70ey06b	ct_mrg3fw4g7rlltdsif5te	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.181	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_niuczxlcf02s9a3eeump	org_y0txnlv69l6vp70ey06b	ct_0xfsjveoox1mfvw6f6r3	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.182	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_14s9f04jtlw67539xqro	org_y0txnlv69l6vp70ey06b	ct_2davdpdx3myfo8p9x2eh	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.182	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_iy3cx3gj98eqwzscjtqp	org_y0txnlv69l6vp70ey06b	ct_dde4wdiaxtmfxu9y31dz	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.183	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_olliqqrth5socaw3shsq	org_y0txnlv69l6vp70ey06b	ct_jrej0wrmyac21p887fe2	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.184	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Victor Manuel Lopez	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ydo6ria44l1bq2mw4030	org_y0txnlv69l6vp70ey06b	ct_k34ocq3hexgctmavy2oj	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.185	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Pere Serravinyals	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_avn47zhx44icnaqdlkgs	org_y0txnlv69l6vp70ey06b	ct_29751vqljjjz20ogmq7f	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.186	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Antonia Maria Martorell	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_eh2injkg0ozmttiiagfx	org_y0txnlv69l6vp70ey06b	ct_msrbuujc00euxycev6ac	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.187	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Eva Diaz	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_yiwrdfvgu0nq09l3su4e	org_y0txnlv69l6vp70ey06b	ct_apkxj7ks0ciwyw6bnv61	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.189	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Salvador Ramírez	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_27gtx0e5gyei9v2oqx6a	org_y0txnlv69l6vp70ey06b	ct_83gbpi4z5tssc3rai80i	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.189	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xs9dtu27jpnplhb6w2my	org_y0txnlv69l6vp70ey06b	ct_wf7kes4in4d0lldmh460	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.19	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_j07lpv7g2n2kpstjtj8e	org_y0txnlv69l6vp70ey06b	ct_mug65680leuqvdfpefh1	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.191	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fuybdvuuz9bfczwymipn	org_y0txnlv69l6vp70ey06b	ct_mka3v5xdz0e5t1dmxm8b	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.192	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_09ififdb9ewbdougx6qy	org_y0txnlv69l6vp70ey06b	ct_dzjw1273ietucur67rzp	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.193	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_alsye1nq38je23vcaojc	org_y0txnlv69l6vp70ey06b	ct_i57asd9wwktua1z993ny	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.194	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_yaclsz62v8wbbw5686er	org_y0txnlv69l6vp70ey06b	ct_cqr33sonwova2vmi6wrz	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.195	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_258gsvpgi8fnox29m2j7	org_y0txnlv69l6vp70ey06b	ct_08cg3ftf0qan7ss8z21x	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.196	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_oiwry7p2z9vlqjje051p	org_y0txnlv69l6vp70ey06b	ct_owv09p4844kfnfasfa74	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.196	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2ujc7exzyufwh3a7xwhe	org_y0txnlv69l6vp70ey06b	ct_b1j3omevlbv625dnon4c	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.197	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9vsvalkv04xa2e1ylxyr	org_y0txnlv69l6vp70ey06b	ct_bbnczrh0rbhryw4glu2l	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.198	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ggmn2nlbwli2ctu3bsyg	org_y0txnlv69l6vp70ey06b	ct_acx5rbd4z84k93fcxilh	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.199	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_nkjf90rikkq7gq5fd6ef	org_y0txnlv69l6vp70ey06b	ct_vi3zs7iqydyzrbs9f3bc	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4r299r6npcjfstbw23gi	org_y0txnlv69l6vp70ey06b	ct_7top8nm3vgktp1bsl569	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.201	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_11zvkhqx04dlm717dc6p	org_y0txnlv69l6vp70ey06b	ct_hajhwyq4pve7fbgjokr3	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.202	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_y2k8aigv09papvl2ptxg	org_y0txnlv69l6vp70ey06b	ct_5w2y45ms5frt0g6ghptf	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.202	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fuyirtqalj5oc14dqqc2	org_y0txnlv69l6vp70ey06b	ct_jbvgkqu1vyyhhsgd4bq9	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.203	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_7i61umk2btuy03xfehur	org_y0txnlv69l6vp70ey06b	ct_cfmol0q5e0o20sw9u5da	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.204	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9600	\N	nueve uno (BRILGENCO) - pagó por transf 27/4	\N	4104	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jxczy813ktgalrfnk155	org_y0txnlv69l6vp70ey06b	ct_ddgeytw2wmyt26yk65oh	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.205	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10200	\N	Ya pagó el 18/12 con transferencia (15% desc.)	\N	838	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vz2twaw5mgp36rydiniq	org_y0txnlv69l6vp70ey06b	ct_2peskmf7z7duxm8nu56b	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.206	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_7klhhky58o88q61sfacf	org_y0txnlv69l6vp70ey06b	ct_arkflzoobww564vke4pf	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.207	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5m0lsz9dxuqtvwdbjtna	org_y0txnlv69l6vp70ey06b	ct_tgt03655a4xf0mxe7fdd	coh_939u17ifmjfns7pr40d2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.208	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Benitez Bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3e88n1zrrf32ngke6s6e	org_y0txnlv69l6vp70ey06b	ct_x72d3kmdccbnqm7rr6t4	coh_939u17ifmjfns7pr40d2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.208	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Benitez Bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8ac54n7hncoxvmutjc1h	org_y0txnlv69l6vp70ey06b	ct_4oswg5quch4mpxucau40	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.209	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34500	\N	cousa	\N	4108	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4vl5cbxibjdyr2mhgli3	org_y0txnlv69l6vp70ey06b	ct_j4cqj5wpiunw7oco0sww	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.21	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_12is72wjjnf8og9ld22e	org_y0txnlv69l6vp70ey06b	ct_34iw9gqfxegazhwt9iyd	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.211	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vn4fqqnq5v24vx8wev28	org_y0txnlv69l6vp70ey06b	ct_qvjygvffpu4wqi4mngeq	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.212	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14400	\N	oca llamar 11/12 despues de 17hs	\N	837	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8eqw1yrlcuvtqgqqx8fh	org_y0txnlv69l6vp70ey06b	ct_6j50ua6w0icoxn9vv480	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.213	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_u23020w29pb7kqkcqvcc	org_y0txnlv69l6vp70ey06b	ct_w1zdnvajbbcc5t2ow4l1	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.214	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hcbwq96334v757a5dapc	org_y0txnlv69l6vp70ey06b	ct_98flwj98j0ld0gxleyl3	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.215	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	360	\N	usd 100 acreditado 8/1 PY, usd 100 10/2, usd 100 23/03, saldo usd 60	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_68yrgvxvibkk8js80ygs	org_y0txnlv69l6vp70ey06b	ct_9jnu97oqvs4nhwbhpeyy	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.215	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	pagó 28/11 link	\N	586	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_168ir78xx2j7jgke7xht	org_y0txnlv69l6vp70ey06b	ct_2z6s3fw7ah0wcjayexvw	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.216	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	\N	\N	585	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_04n441y2p3zd6t5lg8vp	org_y0txnlv69l6vp70ey06b	ct_vgaxakv0rr0q9di5ba63	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.217	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 3/12	\N	592	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sepu6m60xe126icp76fl	org_y0txnlv69l6vp70ey06b	ct_6puo7oazd7064grnr64a	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.218	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 5/12	\N	591	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ptskdomysc8helhcoxk9	org_y0txnlv69l6vp70ey06b	ct_ncas8r8tgiofruydklv8	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.219	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 8/12	\N	594	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_lu96m4457j7zq41p8ks6	org_y0txnlv69l6vp70ey06b	ct_6ywd616mlu77ggrza4l8	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.22	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	seña $4.150 5/12, $ 2.075 19/01 saldo $2.075	\N	587	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kkysvmjlmr7tofq2x90z	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.221	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	se anotó en dos cursos	\N	588	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_w3d30l364ij071uqf7ok	org_y0txnlv69l6vp70ey06b	ct_pyaotn72uyjb37ih1hce	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.222	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia antes del 22/12 - Enzo no responde los mensajes	\N	599	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ekvpkansb153y9027qv2	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.222	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	transferencia 29/1	\N	600	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_y5y3pj2x2iduesnnl6kp	org_y0txnlv69l6vp70ey06b	ct_sgc2b6gbxegqqf6hiwyr	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.223	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	pagó el 18/12 $9900	\N	601	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_whyodsfnkr30kz206w1p	org_y0txnlv69l6vp70ey06b	ct_u9jszvv9oz8r58vt8l5p	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.224	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	profesional	\N	603	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0gwffa5kdmcbrdima3pf	org_y0txnlv69l6vp70ey06b	ct_kzrcjyrgrlnwgvqgqole	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.225	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	OK CONSTRUCTORA SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rpmdzfygb70nhf4k0t1a	org_y0txnlv69l6vp70ey06b	ct_jut4axr4rdesuvv1akdq	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.226	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Pagó seña el 24/12 y el resto en enero	\N	602	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_y0ovoe8zjkmbc41pw3bj	org_y0txnlv69l6vp70ey06b	ct_ig1by7lwgcmjqahfg1gg	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.227	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	tarjeta de credito tiene autoCAD tambien $17.800	\N	598	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_h94jep0jmbyjvm04walj	org_y0txnlv69l6vp70ey06b	ct_qqgvd83dxq8py1b4x38m	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.228	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS	\N	604	pendiente de facturación, no tenemos sistema contable	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_tityqrz6wb6x6qvg51ba	org_y0txnlv69l6vp70ey06b	ct_n32ag73n01hq0loczhch	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.228	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS	\N	605	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_v77ymdxfb32ht55hpn8k	org_y0txnlv69l6vp70ey06b	ct_r3vqu7tnisp30qsvrcpm	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.229	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS - queda pago, lo hace en otro momento	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ilb51y0osaf55z2hso60	org_y0txnlv69l6vp70ey06b	ct_30bhwy753n4buwd5i7pn	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.23	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 14/1	\N	606	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6yq2bkmdotxsheuc8sho	org_y0txnlv69l6vp70ey06b	ct_g4kzzrgure5bl9l1nr1h	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.231	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Tarjeta de crédito 12 cuotas	\N	607	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rneo8i57ma0v91993cro	org_y0txnlv69l6vp70ey06b	ct_mmx6z8xol56lu1doodg7	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.232	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 25/1, pagó $9.600 - 23/3 pagó saldo $300	\N	608	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zz9rob5uq2jlxm76lzio	org_y0txnlv69l6vp70ey06b	ct_u5h3vh05kussthcpqqqs	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.233	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sf5roq38roe7xpq1kbpd	org_y0txnlv69l6vp70ey06b	ct_66br25ae5t5b23jafccx	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.234	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 50% $4950 21/1 - 50% transf 18/2	\N	617	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_inf6halq4he9iy31ks7m	org_y0txnlv69l6vp70ey06b	ct_9sme557v445zw5lfpa7u	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.235	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	seña $2.310 26/01 - 23/3 pagó $20.790	\N	609	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_d4lpiwfyh35vlkqb3msw	org_y0txnlv69l6vp70ey06b	ct_xpmfe99eef491j8zgjme	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.236	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transf 5000 el 27/01 - transf 4900 5/2	\N	610	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_qc08jkvwedml222x6m4e	org_y0txnlv69l6vp70ey06b	ct_wx674y59uodyitv0o3sa	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.237	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	transferencia 26/1	\N	611	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_aaaxl5w96rb47sz1xjwj	org_y0txnlv69l6vp70ey06b	ct_8qi2jrxa538rk49ii7a1	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.238	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bgo2p60i4vozyoe8ctbe	org_y0txnlv69l6vp70ey06b	ct_kjr66h6mwvokt56ia5ea	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.239	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4z8tu32y8ieqvy2rb3q4	org_y0txnlv69l6vp70ey06b	ct_jmai64gjzpc49xxdtpbt	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.24	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3bftn7y69y87z0aoyvyb	org_y0txnlv69l6vp70ey06b	ct_1mt84favrcsp34to2q6p	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.241	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jdxyfdksnwsfkvhen3rf	org_y0txnlv69l6vp70ey06b	ct_4hp5kwr24a1bsb7i2vo2	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.275	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_e9krwctpsagx3xvcyah7	org_y0txnlv69l6vp70ey06b	ct_wq8aiekx72qkxa7d2kbt	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.242	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	mercado pago 26/1	\N	612	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_wfqji73sf0n1sg71utj8	org_y0txnlv69l6vp70ey06b	ct_ice45dlgb03j5bb5tquh	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.242	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	mercado pago 28/1	\N	613	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ei5v678dovubbpdlx0fc	org_y0txnlv69l6vp70ey06b	ct_h8nuht48h7szfxl0gcbi	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.243	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Tarjeta de crédito 28/1	\N	4002	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_60g9x9nshb2wrbwamas9	org_y0txnlv69l6vp70ey06b	ct_urp4rlkjnv3gc2ld8541	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.244	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 29/1	\N	616	COBRAR EXTRA POR UPGRADE DE CURSO $2700	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_pizqp03wyncd8wughu0p	org_y0txnlv69l6vp70ey06b	ct_59nrj6n3cfida34qbw4s	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.245	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_eubfet95qfubzm2tjwy3	org_y0txnlv69l6vp70ey06b	ct_r6paucbcrymyd2fxucs6	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.246	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	paga en 3 cuotas, +598 91 529 081 cecilia - pagó $3300 el 6/2 - 5/3 pagó segunda cuota - 8/4 pagó ultima cuota	\N	809	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5v6ledtrut4eyrucwhbe	org_y0txnlv69l6vp70ey06b	ct_oi48t0i2p37eiyaxslsf	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.247	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2 $9900	\N	803	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_khok668r9h0ghfckckmp	org_y0txnlv69l6vp70ey06b	ct_f2vgquicssz1nou4b504	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.248	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2 $9900	\N	810	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2zqrbf2f6q1vvu8g0erd	org_y0txnlv69l6vp70ey06b	ct_416xi720m7svcnxzm16b	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.249	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	tarjeta presencial 4/2	\N	811	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ymkgusibe66oxgsw5z2m	org_y0txnlv69l6vp70ey06b	ct_gmu8ja7mw7qagmv8027o	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.25	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	efectivo 4/2	\N	812	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_mogeujpyhzby9m0fbjo4	org_y0txnlv69l6vp70ey06b	ct_6x1go9apq5v84377ao18	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.251	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2	\N	813	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jbhs1k7ibp8sqpjl2so1	org_y0txnlv69l6vp70ey06b	ct_p4y4tomuyxhzh39etcj1	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.251	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	pago en 2024 pero no cursó	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1h5hajfwzckxscrcba4n	org_y0txnlv69l6vp70ey06b	ct_c1m5uig1eo366jctbhk2	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.254	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_q68bkq47nds6izqosmm3	org_y0txnlv69l6vp70ey06b	ct_ev5np40dfljisa5jtaez	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.255	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_izgmp3plbo5aseepa2gx	org_y0txnlv69l6vp70ey06b	ct_ptqa4olpspscjro4m0ld	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.256	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ij49cpxsdzbobeirav4x	org_y0txnlv69l6vp70ey06b	ct_wqh95qq49xzc7c8rmq5x	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.257	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9vpy092wz85qw7tdii31	org_y0txnlv69l6vp70ey06b	ct_emrkclo9sph47ucrjkmw	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.258	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_t93do5pftqos3ke0re79	org_y0txnlv69l6vp70ey06b	ct_io0g79gzwnikxeay7f14	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.259	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13680	\N	oca	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_wm9n33ht9m4ivo3cwkb8	org_y0txnlv69l6vp70ey06b	ct_zxybd0vbs0ovb1va9lv7	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.259	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13680	\N	oca	\N	A820	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4oxazkhicoyqiu6babj9	org_y0txnlv69l6vp70ey06b	ct_gxvtczx280ck8z0zomvh	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.26	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_46rlrb1g5a91os92ki7l	org_y0txnlv69l6vp70ey06b	ct_q926137miey19hjqrqd4	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.261	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9l6kgbwg84pm415rupur	org_y0txnlv69l6vp70ey06b	ct_gmz3rfrk7pu7m5jtq1r9	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.262	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	30536	\N	UTE	\N	9285 por FLUSOR	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1jfe6e8muw0gaymsm83i	org_y0txnlv69l6vp70ey06b	ct_o5id01cjtynkgw1aqjq6	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.263	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	UTE	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9kr5zeu7rwginptpgin2	org_y0txnlv69l6vp70ey06b	ct_85eqw7lmq50ikniau81d	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.264	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	430	\N	SICON PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fhq4ngbcv2rgllggbmy5	org_y0txnlv69l6vp70ey06b	ct_4oswg5quch4mpxucau40	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.265	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	78300	\N	cousa	\N	4108	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fjwxlqvi8886jpm0cxgw	org_y0txnlv69l6vp70ey06b	ct_j4cqj5wpiunw7oco0sww	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.266	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	cousa	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6o7dmz76oor8l7y0gl0o	org_y0txnlv69l6vp70ey06b	ct_34iw9gqfxegazhwt9iyd	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.267	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	cousa	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0rwk3t2vfiuom539udxo	org_y0txnlv69l6vp70ey06b	ct_7o6sa8polarxatrxcsw9	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.267	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	20880	\N	Paga con tarjeta de crédito OCA (el monto ya tiene descuento aplicado)	\N	A826	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_mi71d2vjb7r7cmfud8qt	org_y0txnlv69l6vp70ey06b	ct_1w0f7xmypxep5hwx8h00	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.268	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16900	\N	Desc. autorizado por Gustavo - Transferencia - pagó $8.000 el 6/4 - pagó $8.900 el 1/5 -	\N	A829	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0qbnh5x2xiuq5kg1hzao	org_y0txnlv69l6vp70ey06b	ct_w87z1jao43d3hfoo08ec	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.269	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia en marzo 25/3 por itau	\N	817	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_osbv32s09toe3ygpkvfd	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.27	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	se anotó en dos cursos - se cambió de grupo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fz209o8bto92biikefxo	org_y0txnlv69l6vp70ey06b	ct_rlwtvu81j6v2b8nqmi0q	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.271	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Pagó con débito	\N	A828	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_z6xgsxyc5yc2c5ddbyb5	org_y0txnlv69l6vp70ey06b	ct_jzekf46v4tvkajhazseu	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.271	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	Paga con OCA MP	\N	835	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_trucnuc7v7qcaoiu05qe	org_y0txnlv69l6vp70ey06b	ct_w5xumwe5wz42ov2b6x0o	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.272	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Tarjeta de crédito	\N	836	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2dovh3my9c0mh21a20fz	org_y0txnlv69l6vp70ey06b	ct_njyvyb2f3e1ck7cynse0	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.273	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	107800	\N	UTE	\N	4111	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_uils7hrk9gbclpmid26z	org_y0txnlv69l6vp70ey06b	ct_1geeffzgb0qt728y1sph	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.274	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_b9kgcsam1bfpy6wrp7c9	org_y0txnlv69l6vp70ey06b	ct_md436goshxjs6lln53kn	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.276	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ej6celrewg5vnj5tlqoi	org_y0txnlv69l6vp70ey06b	ct_2pgv8r1jmy6772h81dx0	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.276	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vlo41if4pa5lelgk24aq	org_y0txnlv69l6vp70ey06b	ct_sx7hojpfhsl49p1mmxxm	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.277	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rgj8u9avgfjfoxiy51me	org_y0txnlv69l6vp70ey06b	ct_7h8xbksjiur28ibigayv	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.278	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xsneo35eyl4wgmf7hscv	org_y0txnlv69l6vp70ey06b	ct_ezolbj1iecbmwcvzrbbi	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.279	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jdhx2ouf2edh13j2s1mn	org_y0txnlv69l6vp70ey06b	ct_a9qvophuygi8v7qwi6ec	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.28	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_lznvxukxvpunaeazs5am	org_y0txnlv69l6vp70ey06b	ct_uurtglkshlzqrzuktogq	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.281	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_383rhdk0jvoxewhtk22q	org_y0txnlv69l6vp70ey06b	ct_j84ejosmialz950n63t7	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.282	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4qqr220bcxbznjv8s27p	org_y0txnlv69l6vp70ey06b	ct_o64uehaawjcugm8e7eav	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.282	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	780	\N	OK CONSTRUCTORA SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_o47upn3r381p3z7ts0im	org_y0txnlv69l6vp70ey06b	ct_n5quvb6upai59t0dh7t8	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.283	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	seña $990 transf 13/2 - 10/3 saldo	\N	816	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3s956jea2ifa2qi00szl	org_y0txnlv69l6vp70ey06b	ct_mobjfg6rblfiwho5dbwn	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.284	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	818	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5kpzx55zd7mlr5zn3uqe	org_y0txnlv69l6vp70ey06b	ct_wj6jgkuk6f630dbo2zfv	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.285	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	A821	MP	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_somuju9u7tehr2xt58hd	org_y0txnlv69l6vp70ey06b	ct_x0wqbesxp6ku9t743jf4	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.286	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	A822	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bc682lhb54i6tdfrozsn	org_y0txnlv69l6vp70ey06b	ct_7bvmdxa0jt8c13evbp7h	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.287	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	MP 26/3	\N	A823	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_p4ufwle5yf1p3xcnia6b	org_y0txnlv69l6vp70ey06b	ct_9h3cr430rqn8kfkk5zrr	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.287	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	mercado pago enviar link	\N	A824	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ww6kg4lfnwsdax8o2v56	org_y0txnlv69l6vp70ey06b	ct_c1m5uig1eo366jctbhk2	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.288	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_k09itmhwl8nea0tcc1zn	org_y0txnlv69l6vp70ey06b	ct_ev5np40dfljisa5jtaez	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.289	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zwrqzosm99up00fogbfx	org_y0txnlv69l6vp70ey06b	ct_27v4d8e16vqrc6upvlmo	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.29	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	UTE	\N	4122	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_yjg8wg4eo3ma2z1kpaku	org_y0txnlv69l6vp70ey06b	ct_x9i3774eubs71mbqzrtc	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.291	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	mercado pago enviar link	\N	4107	ya pagó, quiere factura con rut MINBROL SA / RUT 213854120011 - cel dep padre ernesto 096246410	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_28yu479i3vuig4z8k1mb	org_y0txnlv69l6vp70ey06b	ct_1t6u03iygz6yy17zrt2v	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.292	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Compro licencia Revit LT Suite (promo)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_x9drsppdar3j6hsvpmyu	org_y0txnlv69l6vp70ey06b	ct_vyuyzc0q1dnb65lsv7zw	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.292	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Compro 3 licencias Revit LT Suite (promo)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_951367lf7qa8eq1pzst8	org_y0txnlv69l6vp70ey06b	ct_pagvc52zbh71ackn88w6	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.293	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	paga por MP 9/4	\N	834	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_7xqnnezvk29lclul4vsl	org_y0txnlv69l6vp70ey06b	ct_314h2g5xwa3l5af9o0li	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.294	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	estudio capote - promo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rju9rp97mfqxwnd6logi	org_y0txnlv69l6vp70ey06b	ct_4fhgnkwi48uceu5h5zhh	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.295	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	estudio capote - promo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ha2kn69axdm1ydmkjuzo	org_y0txnlv69l6vp70ey06b	ct_w53oo15v8fev5gtk6q49	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.296	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	tarjeta cabal	\N	A827	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_p2m1ctyyjop2h2nvzgit	org_y0txnlv69l6vp70ey06b	ct_65dmx1bmeqmbhtpnmpjy	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.297	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1485	\N	REVOLTA	\N	4125	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ck8g6uns7j72bqn6vnjz	org_y0txnlv69l6vp70ey06b	ct_da808l5docpxbm5okdbi	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.298	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_um2xb0bnnojuctdsxxlh	org_y0txnlv69l6vp70ey06b	ct_40xsmxt18gg4at3def4c	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.298	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8aapyfmd17fg6xlxspr2	org_y0txnlv69l6vp70ey06b	ct_aijy1udcjdlz7ndpasxi	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.299	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	Paga en 2 veces con transferencia - 21/4 $ 11.550 -	\N	841 y 845	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bmp96fsxb909967n0m43	org_y0txnlv69l6vp70ey06b	ct_3vbrbjbnr7e6ulpnif8b	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.3	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago 6 cuotas	\N	842	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_wzxtjxpzjbt75hzshrps	org_y0txnlv69l6vp70ey06b	ct_6jp6kvy03mazdjdxe1tm	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.301	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	843	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_u1rotxchksk0cp1j83u0	org_y0txnlv69l6vp70ey06b	ct_fexnrgqrah8yd5ut9djb	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.302	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	844	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0i9ywemarkvtossbc1ye	org_y0txnlv69l6vp70ey06b	ct_j4vwt5758cuxl6667h24	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.303	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ya pagó revit arq 7 2025 pero se bajo	\N	534	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_r1do04scytl6bv0n1smo	org_y0txnlv69l6vp70ey06b	ct_pexwcs5gjsw149duueyc	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.304	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	847	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_f3j5hskvuy7lf479d89k	org_y0txnlv69l6vp70ey06b	ct_0ytxao5cs0wv0j2kpr2h	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.306	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	848	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5wk9l1lqtp3yndvco9i3	org_y0txnlv69l6vp70ey06b	ct_a0i72u0n6tomlxvkzf0t	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.307	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Promo Revit LT (no paga)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_eez5unomlksp3b881xlp	org_y0txnlv69l6vp70ey06b	ct_ynv93yuczhz7nfnl066p	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.308	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	118976	\N	Intendencia Durazno	\N	fac flusor 9586	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ku3k6lzp95laamp1zhnm	org_y0txnlv69l6vp70ey06b	ct_3cnyyonxdhz30gkqohjj	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.308	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_btc8wb71jigu62aya1dr	org_y0txnlv69l6vp70ey06b	ct_swjujy612dsd2p05w71r	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.309	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0ayfsecwu8qvokwrnede	org_y0txnlv69l6vp70ey06b	ct_fw4y5ak3aqmcbagus8jn	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.311	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3q3xu9a6ap7d8u2iatw0	org_y0txnlv69l6vp70ey06b	ct_pthn2suhsmehcyfd6g6z	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.312	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0dghs1oi2djkgfuehf7w	org_y0txnlv69l6vp70ey06b	ct_xwywlbulbzhr8kp03za5	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.313	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_de84hq4u9k6re4hra07w	org_y0txnlv69l6vp70ey06b	ct_6lpsx6xon0qdmpl4l6rk	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.313	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_g1l4izlqug3ymhsi9mfh	org_y0txnlv69l6vp70ey06b	ct_aerznjwghbkj8ye4s93t	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.314	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16170	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_o318e81xld02cswdkj5b	org_y0txnlv69l6vp70ey06b	ct_a8aeo4xx3ydfogq6cvdg	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.315	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	pago presencial con oca 7/5	\N	854	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rbx7ymj0rtlocrlvwz5a	org_y0txnlv69l6vp70ey06b	ct_ao3pmbbhvjkt3tcm8jqf	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.316	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	paga con oca	\N	855	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_gahov668i68hr0g2rv04	org_y0txnlv69l6vp70ey06b	ct_pfzkf02zn3h7b6pu50d6	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.317	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Intendencia de Montevideo	\N	4133	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rh4phxh8p2tzasef4942	org_y0txnlv69l6vp70ey06b	ct_rakovv9ksj97pty1qpjy	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.318	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	\N	\N	865	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_mxu3qqdk4lnfu5zezd77	org_y0txnlv69l6vp70ey06b	ct_bw5yl8v9in2vu3amst03	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.319	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Tarjeta de crédito	\N	866	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4n007s9ppqqce954m4he	org_y0txnlv69l6vp70ey06b	ct_6ck31x0yr3i0wj94vofq	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.32	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	78400	\N	\N	\N	4128	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_90sitogww4kjjad2e6yr	org_y0txnlv69l6vp70ey06b	ct_8f7a4s4myo15ea7b3o8f	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.321	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Ernesto.Decia@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6ykg2077bf7s2iafn7qu	org_y0txnlv69l6vp70ey06b	ct_pk7o3kubmvrr42qh0cu4	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.322	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Federico.Carneiro@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_71ulp098qjsfq5apdkcb	org_y0txnlv69l6vp70ey06b	ct_im44hx4v43zwkgp7e2j8	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.323	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_gleqht5yso7x38mtxuqc	org_y0txnlv69l6vp70ey06b	ct_752zbx54974iruk8kp89	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.323	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Daymel.Abisaab@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4ftsdy9v2zynvpxe208n	org_y0txnlv69l6vp70ey06b	ct_dznqwqm6whdzigyoypc3	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.324	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Mariapaula.Pintos@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ylhcj8kts761sf253yd1	org_y0txnlv69l6vp70ey06b	ct_3592tsbfv63rilz5dxbt	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.325	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Camila.Silveira@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_k7aup5dblqidz242zc3x	org_y0txnlv69l6vp70ey06b	ct_bm2q3p5u826bjvv4uxz6	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.326	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Maria.Rodriguez.Berti@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_tctxi83yw95kw30j18kl	org_y0txnlv69l6vp70ey06b	ct_u6xb34ve7xjutc4kl857	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.327	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	868	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_i29q9enqlhlpauvmn2y2	org_y0txnlv69l6vp70ey06b	ct_9qaw44mj80ydc7f9d2pj	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.328	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	873	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sh2dwtaqvtcwd7nt502k	org_y0txnlv69l6vp70ey06b	ct_u9xuulrai3qv307xutii	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.329	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6500	\N	pagó 10/7 $6500	\N	4124	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8p3iud0cuwel9rqawkz1	org_y0txnlv69l6vp70ey06b	ct_5uaksd3bubuamk2trueh	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.33	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	transferencia 22/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zv82fd17lgogao3m69qn	org_y0txnlv69l6vp70ey06b	ct_esgt082m67g5mv517ms0	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.332	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia 24/6	\N	884	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_reabr8u2b6d28rpl5uf8	org_y0txnlv69l6vp70ey06b	ct_4rh2o35543rzpra6x6dk	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.332	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	facturar a ingener OC 161474	\N	4131	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_w8rgl6p4p6zeggvwjx8w	org_y0txnlv69l6vp70ey06b	ct_yixrt4dpjh9hsnmy41yw	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.333	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia a inicio de julio y antes de finalizar el curso - 7/7 transfirió $3000 - paga segunda mitad despues del 20/8	\N	885	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hhkxuch36mi5je2t84o4	org_y0txnlv69l6vp70ey06b	ct_q490l1033tas9gcs8rqc	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.334	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	23/7 contactar tarjeta de crédito MP	\N	886	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5ywxfd89vsnru1ccjkhb	org_y0txnlv69l6vp70ey06b	ct_k6g583mloylvda88j5se	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.335	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia 26/6 $6.000	\N	887	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_42k4n0y7z8pav3el26qg	org_y0txnlv69l6vp70ey06b	ct_si9io0z4crn7m6rzjc0t	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.336	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_xvwba62ylj37ykbg3frg	org_y0txnlv69l6vp70ey06b	ct_u42gwlaidqw53uo7ulus	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.337	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	888	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ti5jcosd9kufur5k8gqm	org_y0txnlv69l6vp70ey06b	ct_mlb2zwldcj74vljia67v	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.337	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12000	\N	oca 12 pagos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_vr4lqu9xp1vjdfv7ozbt	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.339	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	15300	\N	facturtado a pedido del alumno, pagará Mep y Avanzado	\N	4144	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_gae5kgvsyboa8s7iot98	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_fg1r6mpdbs5ssuusq9o5	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.34	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	5850	\N	pagó transferencia 22/6 $5.850	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zqlblkug56afr9gghnl2	org_y0txnlv69l6vp70ey06b	ct_qyij7zwnzehs2k4qzrjh	coh_fg1r6mpdbs5ssuusq9o5	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.341	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11700	\N	transferencia cuando este confirmado el curos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kifkj2locnugwd8pzbt1	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_iarbf4v6itw2ewunjwlb	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.341	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6000	\N	transferencia pagó 23/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_sj0tuz1uettcp3019qq1	org_y0txnlv69l6vp70ey06b	ct_riuez12o9nem6ssr1sdq	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.342	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	47500	\N	ZUNINO SILVA SOFIA RUT 150864930014, confirmar transferencia	\N	4127	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_tlmcttap6p8kfaw1k0xr	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.344	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transf $40.000 27/7 - 29/7 MP $17.000	\N	904	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_1qlcax1sgchf8f16mi1m	org_y0txnlv69l6vp70ey06b	ct_4q2qcqfwg1q56c1hx8jn	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.344	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transf $20.000 aprox 20/8  + 12 x oca	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_c4sddlh0za824lxrufvo	org_y0txnlv69l6vp70ey06b	ct_u42gwlaidqw53uo7ulus	coh_z9zwwkuo4w9cjvj84vor	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.345	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13050	\N	factura a TUBACERO SA 212364880011, trsf	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_cwbejo4u0u3on1lfbadn	org_y0txnlv69l6vp70ey06b	ct_8a0mtv6xd7lijwmvgrj8	coh_z9zwwkuo4w9cjvj84vor	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.346	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	22185	\N	avisar cuando se confirme el grupo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_k3vjbqvx0pp8yxdbxndf	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.347	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14400	\N	paga cuando este confirmado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_8l8c341umkkcjl0q6705	org_y0txnlv69l6vp70ey06b	ct_2lhq1lxsr7lfm2i14dw4	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.349	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	teyma	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_619clkgmih5qa8lipzxy	org_y0txnlv69l6vp70ey06b	ct_m23xr5ociwh4esv04h56	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.35	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	transf 3/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_5mt360fgzl6fz59af9n7	org_y0txnlv69l6vp70ey06b	ct_97i5rrcdvxwmttabk4rq	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.351	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_hnxlhufsth19x3uehow2	org_y0txnlv69l6vp70ey06b	ct_brfxaq7eaoyv9tfslky1	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.352	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	tarjeta de crédito	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ds0qvy7gy51a3tx733nc	org_y0txnlv69l6vp70ey06b	ct_wsc902l54a7ygve6pj3r	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.352	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6500	\N	transf - metropolitana trf 14/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_11fzdya9sc3t5lwq1ms7	org_y0txnlv69l6vp70ey06b	ct_sacnb9ppmxc6z16hd79j	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.353	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Aladinos SRL Rut 150 128 300 011\nLavalleja 113 ciudad de Rocha. - TRSF	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6j85x31msbytj30am9se	org_y0txnlv69l6vp70ey06b	ct_32tmcjryatk4o9updc0p	coh_dsk8k484pa43py216cpr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.354	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4tt8owe9cnzkn98h4wgr	org_y0txnlv69l6vp70ey06b	ct_ludd2upyz99f4209u2s0	coh_g28y7xhfwhvtzqzge63p	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.355	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_rw02ikra2zaum8chz8iv	org_y0txnlv69l6vp70ey06b	ct_zl8vn7egylihxgiqhpds	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.356	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_4f6iykkzi067nukgpuvt	org_y0txnlv69l6vp70ey06b	ct_ihfhw0yj280w4s7szggb	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.356	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_9436w1ykieunqxg740un	org_y0txnlv69l6vp70ey06b	ct_zqqcma0swk93bkki188v	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.357	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_497qyd7mtammlq0hktxh	org_y0txnlv69l6vp70ey06b	ct_b7tigawwotwae9ee0k6v	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.359	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_54x03c6ujgklo8yiuflz	org_y0txnlv69l6vp70ey06b	ct_jn1alhy13bkdet9idehn	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.359	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jo00l8fml8kru7t6d3p2	org_y0txnlv69l6vp70ey06b	ct_sy6ucdx11tq4s1qiqy9t	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.36	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_dzjfd06eqf6n9056nb27	org_y0txnlv69l6vp70ey06b	ct_gsue6i62fqoltdxpgahz	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.361	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_i327f1mdjpwoaoqpk2kp	org_y0txnlv69l6vp70ey06b	ct_ajt1bffx9lkmifo1n0h9	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.362	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_ri7nt1mttizdrggiap6f	org_y0txnlv69l6vp70ey06b	ct_7c3orpait7lzfbykco30	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.363	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_t9jus7bxo31qyaamqfxr	org_y0txnlv69l6vp70ey06b	ct_od91c05h76dybvxtydix	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.364	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_6fcmkog8y2f9sskfi5t4	org_y0txnlv69l6vp70ey06b	ct_85eqw7lmq50ikniau81d	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.364	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0uw935mamsfkj53unsg4	org_y0txnlv69l6vp70ey06b	ct_mjou5sr0e27ha3m8ru6d	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.365	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_31fvbw03gs0xyypg8u0f	org_y0txnlv69l6vp70ey06b	ct_mkkia7qjay94mlvmgauj	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.366	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2dlvk5n2vuiawusy3k2t	org_y0txnlv69l6vp70ey06b	ct_77g2ngbba0jkaxelz6el	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.367	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_wdtlkcl2cvgpxfu6qxsh	org_y0txnlv69l6vp70ey06b	ct_k3wjyjfbtldez67j143n	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.368	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_jr7lz5vymfqfvgcgdrfx	org_y0txnlv69l6vp70ey06b	ct_mu38jminu016mhx5rfdm	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.368	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0zh7yyo7plqmq7kmnn4g	org_y0txnlv69l6vp70ey06b	ct_j57s68coufi5x4pyzwv4	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.369	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_91j6zfouwkjgbgbgcrmj	org_y0txnlv69l6vp70ey06b	ct_eagt0oec7tuau3khv6ze	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.37	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_zmqspmm7ct3oaghiyfxl	org_y0txnlv69l6vp70ey06b	ct_p0dwxw98pm1m87i98fl4	coh_t2pyxowjji94k5vboph4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.371	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_r0a7fmp4gnjnd9gd19aa	org_y0txnlv69l6vp70ey06b	ct_1b7162oyg2zdigekceas	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.372	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_43upei40tsidwvmfh9kt	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_bs2ahpu62keh4xt4xu3m	org_y0txnlv69l6vp70ey06b	ct_3f05ahiheid0ykus1ea6	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.373	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fodizjs8tuf17ro33sap	org_y0txnlv69l6vp70ey06b	ct_opb6yjpssdbvx61fpman	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.374	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_fqk7n57m3zdx7m8x3742	org_y0txnlv69l6vp70ey06b	ct_g7qdxcf334d2pm24vzmo	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.375	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_0cddj2fzk5svgbp3g25u	org_y0txnlv69l6vp70ey06b	ct_e185ppup48ygqh652nzo	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.376	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_2d62pip1l5o102x3ombj	org_y0txnlv69l6vp70ey06b	ct_wgxtyp1bufhn65m9e9lg	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.377	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_kts4ma5ka9g5fpprnzkx	org_y0txnlv69l6vp70ey06b	ct_7hu7yqp1sfnq4up34s5u	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.378	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_tfkqsx3y1t0ebwwipj26	org_y0txnlv69l6vp70ey06b	ct_gv7k3b2tgp3np16hxrmj	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.379	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_scetvpndj7gjndfjpcn3	org_y0txnlv69l6vp70ey06b	ct_f745s217e80xgw43977h	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.38	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_43upei40tsidwvmfh9kt	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
enr_3dyozf7brzyk2utdhegf	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.381	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: installment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.installment (id, organization_id, enrollment_id, number, due_date, amount, currency, canceled_at, notes, created_at, updated_at) FROM stdin;
inst_atvu63tdutepu56e6lpe	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	1	2026-08-13 00:00:00	6000	UYU	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376
inst_jbgoftlao03rhsy6uw7m	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	2	2026-09-13 00:00:00	6000	UYU	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376
inst_97fvt0aswrpinsm0u4yd	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	3	2026-10-13 00:00:00	6000	UYU	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376
inst_jzcthnm411awp3djho5f	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	4	2026-11-13 00:00:00	6000	UYU	\N	\N	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376
\.


--
-- Data for Name: intake_form; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.intake_form (id, organization_id, name, course_id, created_at) FROM stdin;
frm_1jr4gupn8ruv9qqhsxsq	org_y0txnlv69l6vp70ey06b	Landing Verificación Viva	\N	2026-08-11 15:40:41.023326
frm_kl00fdkjb98xrhnfx40j	org_y0txnlv69l6vp70ey06b	Landing Verificacion Final	\N	2026-08-11 15:48:15.9583
frm_ffybeb1e3t61xloouucf	org_y0txnlv69l6vp70ey06b	Landing Mensaje Verif	\N	2026-08-11 19:05:06.760219
\.


--
-- Data for Name: invitation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invitation (id, organization_id, email, role, status, expires_at, inviter_id) FROM stdin;
\.


--
-- Data for Name: kb_entry; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.kb_entry (id, organization_id, kind, question, answer, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: license; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.license (id, organization_id, enrollment_id, assigned, assigned_at, expires_at, software_id) FROM stdin;
lic_rirnp6nu8ykqm40elfvi	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	t	2026-09-02 19:55:53.979	\N	sw_uuxbrm7yzt80a59foag8
\.


--
-- Data for Name: media_asset; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.media_asset (id, organization_id, kind, wa_media_id, mime_type, file_name, file_size, caption, payload, storage_path, fetch_status, fetch_error, created_at, updated_at) FROM stdin;
ma_1xjqdau30xyt23cbzkyg	org_y0txnlv69l6vp70ey06b	image	\N	image/png	Artboard-1-copy-12.png	87010	\N	\N	org_y0txnlv69l6vp70ey06b\\ma_1xjqdau30xyt23cbzkyg	available	\N	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
ma_07qe379u0oo2r3skfqlt	org_y0txnlv69l6vp70ey06b	image	\N	image/png	Artboard-1-copy-11.png	95490	\N	\N	org_y0txnlv69l6vp70ey06b\\ma_07qe379u0oo2r3skfqlt	available	\N	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
ma_rvweadgachy4jjs3vptt	org_y0txnlv69l6vp70ey06b	image	\N	image/png	Artboard-1-copy-10.png	94416	\N	\N	org_y0txnlv69l6vp70ey06b\\ma_rvweadgachy4jjs3vptt	available	\N	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
ma_3en1k9px0lyd03ltsnhx	org_y0txnlv69l6vp70ey06b	image	\N	image/png	Artboard-1-copy-9.png	96400	\N	\N	org_y0txnlv69l6vp70ey06b\\ma_3en1k9px0lyd03ltsnhx	available	\N	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
ma_ovf2h02phedoy3n7ro0v	org_y0txnlv69l6vp70ey06b	image	\N	image/png	Artboard-1-copy-8.png	91024	\N	\N	org_y0txnlv69l6vp70ey06b\\ma_ovf2h02phedoy3n7ro0v	available	\N	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
\.


--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member (id, organization_id, user_id, role, created_at) FROM stdin;
mem_f9o01kv633g7q2yxx8qt	org_y0txnlv69l6vp70ey06b	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	soporte	2026-08-11 12:20:11.64619
mem_j0gne8e2als3itzuaui4	org_y0txnlv69l6vp70ey06b	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	soporte	2026-08-11 14:34:54.595718
mem_qpwoebl904jute5fwz1o	org_y0txnlv69l6vp70ey06b	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	direccion	2026-08-10 19:37:00.784484
mem_n9qtt0nfj8ku07d19cyv	org_y0txnlv69l6vp70ey06b	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	coordinacion	2026-08-11 12:46:48.621102
mem_kwulqekimi546q83s0hv	org_y0txnlv69l6vp70ey06b	osrQ0lXIfCOLYrSahugeSYTlpT3ksClr	administracion	2026-09-07 17:55:40.253315
\.


--
-- Data for Name: message; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.message (id, organization_id, conversation_id, wa_message_id, direction, type, text, status, error, ai_generated, wa_timestamp, created_at, origin, media_asset_id) FROM stdin;
\.


--
-- Data for Name: meta_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.meta_credentials (id, organization_id, waba_id, phone_number_id, display_phone_number, verified_name, token_cipher, token_iv, token_tag, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: offline_answer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_answer (id, organization_id, question_id, legacy_ref, text, is_correct, "position", created_at, updated_at) FROM stdin;
oans_2b3f7qybaql9cqepcd2c	org_y0txnlv69l6vp70ey06b	oqst_ir7c0a0b04t1loli7c9q	answer:1281:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hz6udcydymfz2d9wk5ed	org_y0txnlv69l6vp70ey06b	oqst_ir7c0a0b04t1loli7c9q	answer:1281:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hw4eg9mqsma4gwj81lpo	org_y0txnlv69l6vp70ey06b	oqst_7jjylgts7o7wqm0lunis	answer:1281:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_emeeubn3h791hq5i35bx	org_y0txnlv69l6vp70ey06b	oqst_7jjylgts7o7wqm0lunis	answer:1281:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pmq2jfsq3sm3cjokw14p	org_y0txnlv69l6vp70ey06b	oqst_12ks264johio4lzthu4b	answer:1281:3:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zxews5nc2j0j3urrp35z	org_y0txnlv69l6vp70ey06b	oqst_12ks264johio4lzthu4b	answer:1281:3:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_een7pe7dsjkwq2zi9f3c	org_y0txnlv69l6vp70ey06b	oqst_7bbabbkepl0rs0vhdmp0	answer:1281:4:0	A - REVIT no tiene un panel llamado "Propiedades".	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3zar2mvxm8n4mhql1sf2	org_y0txnlv69l6vp70ey06b	oqst_7bbabbkepl0rs0vhdmp0	answer:1281:4:1	B - El panel de propiedades debe estar siempre abierto.	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pyt5tcdktiykcd0gj0hi	org_y0txnlv69l6vp70ey06b	oqst_7bbabbkepl0rs0vhdmp0	answer:1281:4:2	C - Reviso el panel de propiedades solo cuando lo necesito.	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7kb2zwlv5eob59vs49ua	org_y0txnlv69l6vp70ey06b	oqst_3zpz9ms1xzpccq8dil2q	answer:1281:5:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rrkcissuuas1b29p2hp8	org_y0txnlv69l6vp70ey06b	oqst_3zpz9ms1xzpccq8dil2q	answer:1281:5:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nwe2b86daaes7q88z37r	org_y0txnlv69l6vp70ey06b	oqst_9dsgj7o21uv1v1uqis3b	answer:1281:6:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6hb75kj9gxabfcym48d9	org_y0txnlv69l6vp70ey06b	oqst_9dsgj7o21uv1v1uqis3b	answer:1281:6:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i3wjxszc3kvs8hs43qy5	org_y0txnlv69l6vp70ey06b	oqst_xong4gkc9k2i32n9q7pz	answer:1281:7:0	A - El "Navegador de proyectos" es el sitio donde se guarda información de las vistas del proyecto.	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xwi7njpxyvj4p44x48ku	org_y0txnlv69l6vp70ey06b	oqst_xong4gkc9k2i32n9q7pz	answer:1281:7:1	B - El panel de "Propiedades" es el sitio donde se guarda información de las vistas del proyecto.	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ek8b92re5g8szjpeczhh	org_y0txnlv69l6vp70ey06b	oqst_xong4gkc9k2i32n9q7pz	answer:1281:7:2	C - Las cintas son el sitio donde se guarda información de las vistas del proyecto.	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6v0rk4e9hoexqvl6s15w	org_y0txnlv69l6vp70ey06b	oqst_v2vwje8liaxawhnnfye7	answer:1281:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tihcmepnztyf8h7p50l7	org_y0txnlv69l6vp70ey06b	oqst_v2vwje8liaxawhnnfye7	answer:1281:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iyhgwhkcjg35eisahpdc	org_y0txnlv69l6vp70ey06b	oqst_nhg2pr8io0r0ql3rcfvy	answer:1281:9:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t1edt64looxkphp2nd77	org_y0txnlv69l6vp70ey06b	oqst_nhg2pr8io0r0ql3rcfvy	answer:1281:9:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fajnvkhf63876na4cw5y	org_y0txnlv69l6vp70ey06b	oqst_1vzxesf4u22r353ar8zs	answer:1281:10:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bh39ouohv3qtw52p2hws	org_y0txnlv69l6vp70ey06b	oqst_1vzxesf4u22r353ar8zs	answer:1281:10:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nom0o6kp5gclsos8hvt8	org_y0txnlv69l6vp70ey06b	oqst_a3jmvzc0u6a36h84sgsd	answer:1281:11:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3yzdywafkiua5d37wwgm	org_y0txnlv69l6vp70ey06b	oqst_a3jmvzc0u6a36h84sgsd	answer:1281:11:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_u3qcd9aa1mmkcxbb31gj	org_y0txnlv69l6vp70ey06b	oqst_3ge66eo1zhya1fjcgbie	answer:1281:12:0	A - El comando por teclado de la herramienta "Copiar" es "C".	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i1hp6kfaga2q9nj0seu9	org_y0txnlv69l6vp70ey06b	oqst_3ge66eo1zhya1fjcgbie	answer:1281:12:1	B - El comando por teclado de la herramienta "Copiar" es "COPY".	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_c0pf2wgsy695hqrh3ifi	org_y0txnlv69l6vp70ey06b	oqst_3ge66eo1zhya1fjcgbie	answer:1281:12:2	C - El comando por teclado de la herramienta "Copiar" es "CO".	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_g5x1r9acjyyfkphrurqr	org_y0txnlv69l6vp70ey06b	oqst_q3g62y2b6u4ydxm76317	answer:1281:13:0	A - La distancia entre muros es de 1 mtr.	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_c20krcg23iphu17ttd4j	org_y0txnlv69l6vp70ey06b	oqst_q3g62y2b6u4ydxm76317	answer:1281:13:1	B - La distancia entre muros es de 1.2 mtrs.	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_21wbicun1vhcg829r8i5	org_y0txnlv69l6vp70ey06b	oqst_q3g62y2b6u4ydxm76317	answer:1281:13:2	C - La distancia entre muros es de 0.8 mtrs.	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lcpqpsm9uhxcu60wxwr2	org_y0txnlv69l6vp70ey06b	oqst_5vs8y52am42bcwaquiyu	answer:1281:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p55r5gk9fcjximplmnq6	org_y0txnlv69l6vp70ey06b	oqst_5vs8y52am42bcwaquiyu	answer:1281:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oqjvazs3kepgliilfgpr	org_y0txnlv69l6vp70ey06b	oqst_h4guv5yvvbuefgpw27hi	answer:1281:15:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oe430n09tj1pyo4sfli1	org_y0txnlv69l6vp70ey06b	oqst_h4guv5yvvbuefgpw27hi	answer:1281:15:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xsa6wi3kaydzoq7nner2	org_y0txnlv69l6vp70ey06b	oqst_t6nfmihmef04mao7j5dc	answer:1281:16:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_y9rtqkd06utzmnvufv1r	org_y0txnlv69l6vp70ey06b	oqst_t6nfmihmef04mao7j5dc	answer:1281:16:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_c694h2c8esdmudjdr3h5	org_y0txnlv69l6vp70ey06b	oqst_kyy4xtm0rgcejodpog6d	answer:1281:17:0	A - La herramienta "Bloquear", bloquea el movimiento del elemento.	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jz1yby5e8z6x72a7meb2	org_y0txnlv69l6vp70ey06b	oqst_kyy4xtm0rgcejodpog6d	answer:1281:17:1	B - La herramienta "Bloquear", bloquea las propiedades.	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lzy324cf7yxrm8zr3ys2	org_y0txnlv69l6vp70ey06b	oqst_kyy4xtm0rgcejodpog6d	answer:1281:17:2	C - La herramienta "Bloquear", no existe.	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rr7krkd6m53hsho9doht	org_y0txnlv69l6vp70ey06b	oqst_c7zv8simorg39fym1788	answer:1281:18:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mfd0k8mtf68pli8r7ztf	org_y0txnlv69l6vp70ey06b	oqst_c7zv8simorg39fym1788	answer:1281:18:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_um68ent2y38ka6ppd9ly	org_y0txnlv69l6vp70ey06b	oqst_4j2ibj4th158xy7iq0qc	answer:1281:19:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_v65fxqeb04m1r1nopzqp	org_y0txnlv69l6vp70ey06b	oqst_4j2ibj4th158xy7iq0qc	answer:1281:19:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_33g5p9wm3boky7bh2a69	org_y0txnlv69l6vp70ey06b	oqst_xe29rz7gzw7hohdu6069	answer:1281:20:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dbfxz5vz1tp406yd78oj	org_y0txnlv69l6vp70ey06b	oqst_xe29rz7gzw7hohdu6069	answer:1281:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_eec01glmsr0w2aq1i149	org_y0txnlv69l6vp70ey06b	oqst_v2di2eoia774xt1uwva1	answer:1218:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_17k96l2dv7w2y4i8c0sb	org_y0txnlv69l6vp70ey06b	oqst_v2di2eoia774xt1uwva1	answer:1218:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_kglkescj9f3h8pb8srav	org_y0txnlv69l6vp70ey06b	oqst_c7m2773uvxmm9em0l379	answer:1218:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7wq5mshvhozwvczmk7t6	org_y0txnlv69l6vp70ey06b	oqst_c7m2773uvxmm9em0l379	answer:1218:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ws5lp5xh36s3dw60d4yr	org_y0txnlv69l6vp70ey06b	oqst_ccdhy5gfq1mh36gsvqtf	answer:1218:3:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gqjgxdm5n44811f8kz8n	org_y0txnlv69l6vp70ey06b	oqst_ccdhy5gfq1mh36gsvqtf	answer:1218:3:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bbie74bg7xzey22c4zzg	org_y0txnlv69l6vp70ey06b	oqst_yfe85ofqum2z0r5ry7km	answer:1218:4:0	"Propiedades"	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8ys5mc6ex2osgtt5rxti	org_y0txnlv69l6vp70ey06b	oqst_yfe85ofqum2z0r5ry7km	answer:1218:4:1	"Llamada"\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wznshrbdb6n1325sm76t	org_y0txnlv69l6vp70ey06b	oqst_yfe85ofqum2z0r5ry7km	answer:1218:4:2	"Difusa"\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rlm5j5rxnd2n9z3xvb17	org_y0txnlv69l6vp70ey06b	oqst_7pkzd5jrmsjecp73j045	answer:1218:5:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mlj4f0tds16xx3cvswxa	org_y0txnlv69l6vp70ey06b	oqst_7pkzd5jrmsjecp73j045	answer:1218:5:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_77h261gvrraqjvd8l68n	org_y0txnlv69l6vp70ey06b	oqst_bshqqa41ukijfgsrekhc	answer:1218:6:0	Leyendas	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_shvm1ergzqmn8jsr4zsh	org_y0txnlv69l6vp70ey06b	oqst_bshqqa41ukijfgsrekhc	answer:1218:6:1	Gráficos	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0divvl1w92of0xlaw9sg	org_y0txnlv69l6vp70ey06b	oqst_bshqqa41ukijfgsrekhc	answer:1218:6:2	Familias	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_baelwk73ldj7h5vierhd	org_y0txnlv69l6vp70ey06b	oqst_o0e5wd3c2k4ar2cdjji4	answer:1218:7:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qx7o1jc3j0ah9v856nx9	org_y0txnlv69l6vp70ey06b	oqst_o0e5wd3c2k4ar2cdjji4	answer:1218:7:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r2crxle1akbmrdu5nbua	org_y0txnlv69l6vp70ey06b	oqst_dvskqe0gbsfl03d4xow3	answer:1218:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6e92bkgu7wo9tlw5n52a	org_y0txnlv69l6vp70ey06b	oqst_dvskqe0gbsfl03d4xow3	answer:1218:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_09jpgdofg938ftlg9pgu	org_y0txnlv69l6vp70ey06b	oqst_ia0s6v6t8bmy1yn4ut4h	answer:1218:9:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9xhv6ybuabsbs6sjwsjk	org_y0txnlv69l6vp70ey06b	oqst_ia0s6v6t8bmy1yn4ut4h	answer:1218:9:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_70e9fav621z0zhyqk4qv	org_y0txnlv69l6vp70ey06b	oqst_6bfr7tja8hd45ldpc9t4	answer:1218:10:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hkkec200bghxq6wmvfka	org_y0txnlv69l6vp70ey06b	oqst_6bfr7tja8hd45ldpc9t4	answer:1218:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xqw5x02xhdilkuhdlg0s	org_y0txnlv69l6vp70ey06b	oqst_rpxwn0yp2n9dkt92vzsp	answer:1218:11:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zmnow9f85bgzfkjn6kmy	org_y0txnlv69l6vp70ey06b	oqst_rpxwn0yp2n9dkt92vzsp	answer:1218:11:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ieijdubg06o6v5ae0lvo	org_y0txnlv69l6vp70ey06b	oqst_jn6100o52qfr7pe9pupy	answer:1218:12:0	Textos que reconocen información de un elemento	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_u8e8wxyj4s4gpdihx9hy	org_y0txnlv69l6vp70ey06b	oqst_jn6100o52qfr7pe9pupy	answer:1218:12:1	La marca de Revit\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t0274qm2x7uolp04e7i5	org_y0txnlv69l6vp70ey06b	oqst_jn6100o52qfr7pe9pupy	answer:1218:12:2	Un tipo de cota	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wxufs3ht5u0dql064yct	org_y0txnlv69l6vp70ey06b	oqst_fifpsoxyawgn5jdfx1d9	answer:1218:13:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_byzwmlp2ozjbakkrlyuc	org_y0txnlv69l6vp70ey06b	oqst_fifpsoxyawgn5jdfx1d9	answer:1218:13:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ondq2bik4rgyldefai3p	org_y0txnlv69l6vp70ey06b	oqst_de2ejisnocmxqwmqhm2j	answer:1218:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jm8tt56ypf4kc5h0wi3l	org_y0txnlv69l6vp70ey06b	oqst_de2ejisnocmxqwmqhm2j	answer:1218:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6xsqz2rb60b1nan10qzi	org_y0txnlv69l6vp70ey06b	oqst_eg8rpmf3lhe4jo96nqlx	answer:1218:15:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ntv2zbalzvar50f39g8p	org_y0txnlv69l6vp70ey06b	oqst_eg8rpmf3lhe4jo96nqlx	answer:1218:15:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7nz0t0zm85wj3wqbcukb	org_y0txnlv69l6vp70ey06b	oqst_v4kowi21rw8izjugpw6n	answer:1218:16:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_czp0ew6mosod3tbyccug	org_y0txnlv69l6vp70ey06b	oqst_v4kowi21rw8izjugpw6n	answer:1218:16:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_h4qioym1ub2zyy4cbfeu	org_y0txnlv69l6vp70ey06b	oqst_5kborn1s5i5ziw2opmts	answer:1218:17:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zik8av3cprd7fkswc1mh	org_y0txnlv69l6vp70ey06b	oqst_5kborn1s5i5ziw2opmts	answer:1218:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8zdec5khzk1rm43zv4rm	org_y0txnlv69l6vp70ey06b	oqst_ke8zyl39mwh03qmmib9c	answer:1218:18:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_eyj97zaxy0cupgbn6j5m	org_y0txnlv69l6vp70ey06b	oqst_ke8zyl39mwh03qmmib9c	answer:1218:18:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_5luba9jqdjupywbe1uwx	org_y0txnlv69l6vp70ey06b	oqst_3ed87653b8d25xekaqtw	answer:1218:19:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9162gx5sm3dgznw4sx35	org_y0txnlv69l6vp70ey06b	oqst_3ed87653b8d25xekaqtw	answer:1218:19:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_awol3lw87ky1rz7dlzc8	org_y0txnlv69l6vp70ey06b	oqst_vl4tg9dlunlpgww1n89u	answer:1218:20:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j8gbbxat4ffbldd0czue	org_y0txnlv69l6vp70ey06b	oqst_vl4tg9dlunlpgww1n89u	answer:1218:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j6ujid10hvc9ns3bcobb	org_y0txnlv69l6vp70ey06b	oqst_9ge7lcehpr4m0y1r20c2	answer:1239:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iiqenlu2jm4apiwsgxx0	org_y0txnlv69l6vp70ey06b	oqst_9ge7lcehpr4m0y1r20c2	answer:1239:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nk9fypszzk13pwtvdmi9	org_y0txnlv69l6vp70ey06b	oqst_rhwm15iq2mnbou3ww17d	answer:1239:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pwghvo1sssm0j2ravu0c	org_y0txnlv69l6vp70ey06b	oqst_rhwm15iq2mnbou3ww17d	answer:1239:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_e42lwgbahpaaiidrt2aj	org_y0txnlv69l6vp70ey06b	oqst_may40fzga3w9dl10u79t	answer:1239:3:0	La herramienta "agujero" sirve para perforar muros\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r4ylj3c2n1gcbvws1p73	org_y0txnlv69l6vp70ey06b	oqst_may40fzga3w9dl10u79t	answer:1239:3:1	La herramienta "agujero" sirve para perforar suelos solamente\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_68hcfq4emrsl5plfgpt7	org_y0txnlv69l6vp70ey06b	oqst_may40fzga3w9dl10u79t	answer:1239:3:2	La herramienta "agujero" sirve para perforar suelos techos y cubiertas\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0aczomtty1y31f23ajye	org_y0txnlv69l6vp70ey06b	oqst_ps5cm3sp63yiix76dlmz	answer:1239:4:0	Solo puedo crear elementos en niveles\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_v8rqx8l6ynhzj68qg8ka	org_y0txnlv69l6vp70ey06b	oqst_ps5cm3sp63yiix76dlmz	answer:1239:4:1	Puedo crear nuevos planos de trabajo en donde crear elementos\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xzqw8kqmtr95na3cjndp	org_y0txnlv69l6vp70ey06b	oqst_ps5cm3sp63yiix76dlmz	answer:1239:4:2	Ninguna de las 2 opciones anteriores es correcta\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nwq7nlxyhalkp9rguat0	org_y0txnlv69l6vp70ey06b	oqst_6fnuxq4vq6am51e1umi3	answer:1239:5:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_itcvhlqg4ck9fv4o3mk4	org_y0txnlv69l6vp70ey06b	oqst_6fnuxq4vq6am51e1umi3	answer:1239:5:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7kcu7d1xtn49yl24z3j4	org_y0txnlv69l6vp70ey06b	oqst_311zlyj7x76c6pkrv76x	answer:1239:6:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ycncwm34tndynxlh6lf5	org_y0txnlv69l6vp70ey06b	oqst_311zlyj7x76c6pkrv76x	answer:1239:6:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j1yn0p22sieh3aojsz1w	org_y0txnlv69l6vp70ey06b	oqst_w1v1dac3rndum0d4gs4l	answer:1239:7:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_szvj2em576nog206n4h7	org_y0txnlv69l6vp70ey06b	oqst_w1v1dac3rndum0d4gs4l	answer:1239:7:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8jaayyni35vfydmcv9af	org_y0txnlv69l6vp70ey06b	oqst_8zbag6jmb8if07389vpf	answer:1239:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_at75ikjs7qlxnpo2ifb1	org_y0txnlv69l6vp70ey06b	oqst_8zbag6jmb8if07389vpf	answer:1239:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wwrjc8wr5c3rocox6le1	org_y0txnlv69l6vp70ey06b	oqst_r3beqsrykzcpl92i2ru7	answer:1239:9:0	Dentro de las propiedades de la herramienta "hueco de muro", se encuentra una llamada "Restricción de base"\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fvysyxtbywv4xszaufns	org_y0txnlv69l6vp70ey06b	oqst_r3beqsrykzcpl92i2ru7	answer:1239:9:1	Puedo cambiarlo de material\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_f4ksqgx8zgzpggnpnr8q	org_y0txnlv69l6vp70ey06b	oqst_r3beqsrykzcpl92i2ru7	answer:1239:9:2	Puedo transformarlo en rampa\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fbay3uibtla0ufdzfu6c	org_y0txnlv69l6vp70ey06b	oqst_iwxxzc3x7z8r9yzykoq5	answer:1239:10:0	Cinta "Arquitectura", Panel "Construir"	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bmjpntbvyvlbgvh26wan	org_y0txnlv69l6vp70ey06b	oqst_iwxxzc3x7z8r9yzykoq5	answer:1239:10:1	Cinta "Arquitectura", Panel "Circulación"\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l6no0i1cvgyxp98mkj86	org_y0txnlv69l6vp70ey06b	oqst_iwxxzc3x7z8r9yzykoq5	answer:1239:10:2	Cinta "Arquitectura", Panel "Modelo"\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_87lei6bnrk0cu6rukgp9	org_y0txnlv69l6vp70ey06b	oqst_43s383wae3qb40ba0cmm	answer:1239:11:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_s24ifvpcodiv5z0j6z4t	org_y0txnlv69l6vp70ey06b	oqst_43s383wae3qb40ba0cmm	answer:1239:11:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_q5yt0vhplugz2sz2exeb	org_y0txnlv69l6vp70ey06b	oqst_q19v4e32v0r7kylc8qni	answer:1239:12:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_e3d9t8njoi5j229qki6a	org_y0txnlv69l6vp70ey06b	oqst_q19v4e32v0r7kylc8qni	answer:1239:12:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3np6ykgb4z46ored2r0n	org_y0txnlv69l6vp70ey06b	oqst_gw51e3jc3txsj9zkbjc8	answer:1239:13:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yu68hl2b5zobvsbornij	org_y0txnlv69l6vp70ey06b	oqst_gw51e3jc3txsj9zkbjc8	answer:1239:13:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qc52cz45wy3tu9oxi90b	org_y0txnlv69l6vp70ey06b	oqst_uhby3rpg5ldf0nt05gy4	answer:1239:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zjb66inva2p9ikya5j2m	org_y0txnlv69l6vp70ey06b	oqst_uhby3rpg5ldf0nt05gy4	answer:1239:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tgzrwh383d24i9t4pzky	org_y0txnlv69l6vp70ey06b	oqst_akf79qpibrsfbq3y0z5j	answer:1239:15:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_feiktiootwu1gg98s6a6	org_y0txnlv69l6vp70ey06b	oqst_akf79qpibrsfbq3y0z5j	answer:1239:15:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_deu5cwjuj0c7hroghukh	org_y0txnlv69l6vp70ey06b	oqst_0bethmeulvsqh5dodv5n	answer:1239:16:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r6gsjoqyl1irndmkonwh	org_y0txnlv69l6vp70ey06b	oqst_0bethmeulvsqh5dodv5n	answer:1239:16:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_sowrayli76btshcig4fu	org_y0txnlv69l6vp70ey06b	oqst_5f85nrj2w14j3sh5sqf1	answer:1239:17:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oan707g81biz0x86c07z	org_y0txnlv69l6vp70ey06b	oqst_5f85nrj2w14j3sh5sqf1	answer:1239:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qa63k2p18s02a3s54i6w	org_y0txnlv69l6vp70ey06b	oqst_00acr7g3887aadjtdwyv	answer:1239:18:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wd0x1czo9leohim6ocvy	org_y0txnlv69l6vp70ey06b	oqst_00acr7g3887aadjtdwyv	answer:1239:18:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mllarct6jxn8lwsonsft	org_y0txnlv69l6vp70ey06b	oqst_l4jr9fictvj79mgxr80z	answer:1239:19:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_x793qa9y059z8cvqdxsp	org_y0txnlv69l6vp70ey06b	oqst_l4jr9fictvj79mgxr80z	answer:1239:19:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_32m5g53wtd1824yue6dy	org_y0txnlv69l6vp70ey06b	oqst_a3musklh6ni9djkt7oor	answer:1239:20:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_331ut8lqu9ygu89ndeur	org_y0txnlv69l6vp70ey06b	oqst_a3musklh6ni9djkt7oor	answer:1239:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rf29f1f73w0pd6rynnn7	org_y0txnlv69l6vp70ey06b	oqst_sq1onsri73vkgshcz51m	answer:1199:1:0	Modificaciones de visibilidad / gráficos	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3p79qcg2i7y1rmjtk14o	org_y0txnlv69l6vp70ey06b	oqst_sq1onsri73vkgshcz51m	answer:1199:1:1	Ver gráficos como	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jnge2ua8j1wk66e7nvp4	org_y0txnlv69l6vp70ey06b	oqst_sq1onsri73vkgshcz51m	answer:1199:1:2	Editar visualización de vistas\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_a4s68f3cp71r4ga6v6pf	org_y0txnlv69l6vp70ey06b	oqst_pda9guj6mhts8hhasp3u	answer:1199:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_h6jv7sh07faauz5b46gx	org_y0txnlv69l6vp70ey06b	oqst_pda9guj6mhts8hhasp3u	answer:1199:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8h5w88o9m7pgz6l013ww	org_y0txnlv69l6vp70ey06b	oqst_fkv6uqcj9kjin8evw62a	answer:1199:3:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lkjmq2e6urw5zdzvn2a9	org_y0txnlv69l6vp70ey06b	oqst_fkv6uqcj9kjin8evw62a	answer:1199:3:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_n21sj0xlmslk6e4v2hdd	org_y0txnlv69l6vp70ey06b	oqst_k38p5rhmler04wdfl2sb	answer:1199:4:0	Todas las vistas	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3g4530763iaukwz3ztao	org_y0txnlv69l6vp70ey06b	oqst_k38p5rhmler04wdfl2sb	answer:1199:4:1	La vista en la que se aplica\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yo73f1cgqabi5mpvfihi	org_y0txnlv69l6vp70ey06b	oqst_k38p5rhmler04wdfl2sb	answer:1199:4:2	No sirve para eso\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yf1ceedqribjky02dsrk	org_y0txnlv69l6vp70ey06b	oqst_v86rsbam5z3kfglvso17	answer:1199:5:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9ym3mc3chn54g299ocer	org_y0txnlv69l6vp70ey06b	oqst_v86rsbam5z3kfglvso17	answer:1199:5:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dtqiexuwpsduewzqv3it	org_y0txnlv69l6vp70ey06b	oqst_vfvtr04fzghrh4r7w03p	answer:1199:6:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_sqwtmzjpjersj0ecs82r	org_y0txnlv69l6vp70ey06b	oqst_vfvtr04fzghrh4r7w03p	answer:1199:6:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xnhzgqj5qf4rz4ed5px6	org_y0txnlv69l6vp70ey06b	oqst_hun0nuczqruo4o1cuko9	answer:1199:7:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_520s6312yagvg1zcpthx	org_y0txnlv69l6vp70ey06b	oqst_hun0nuczqruo4o1cuko9	answer:1199:7:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_sot5vagcac8r1h4aoa2l	org_y0txnlv69l6vp70ey06b	oqst_l87y0noykehekl3gzgua	answer:1199:8:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_giml9u91icztpx3uhm7n	org_y0txnlv69l6vp70ey06b	oqst_l87y0noykehekl3gzgua	answer:1199:8:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7n02zatvtp1pc42schyb	org_y0txnlv69l6vp70ey06b	oqst_jk7ovq9xgz26srwu1ocu	answer:1199:9:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6nxa4n74yg6q40tn8s86	org_y0txnlv69l6vp70ey06b	oqst_jk7ovq9xgz26srwu1ocu	answer:1199:9:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_swy2da93zs7kfnmz7znt	org_y0txnlv69l6vp70ey06b	oqst_q8qgpusm8sflkrp0v2w4	answer:1199:10:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i4u41wlwz55dynztmubt	org_y0txnlv69l6vp70ey06b	oqst_q8qgpusm8sflkrp0v2w4	answer:1199:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8174u8k3i99ehbjq6ymu	org_y0txnlv69l6vp70ey06b	oqst_852ulffddi4b3zwfa4sm	answer:1199:11:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j7agdf97w6o42g1c2s92	org_y0txnlv69l6vp70ey06b	oqst_852ulffddi4b3zwfa4sm	answer:1199:11:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lwyh4fw1wbwjpxrw04tu	org_y0txnlv69l6vp70ey06b	oqst_ujxe4b8cen46qwjlvffv	answer:1199:12:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_d7pda25lducfckova5g7	org_y0txnlv69l6vp70ey06b	oqst_ujxe4b8cen46qwjlvffv	answer:1199:12:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nesif2g3x3xj60syj294	org_y0txnlv69l6vp70ey06b	oqst_gvxsu3jol4l11b17rnk7	answer:1199:13:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7vyebmxb70m9cdn535aq	org_y0txnlv69l6vp70ey06b	oqst_gvxsu3jol4l11b17rnk7	answer:1199:13:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0ovb05g4mmrwassmlgv9	org_y0txnlv69l6vp70ey06b	oqst_y92mgx2frkp3vd6m0dfn	answer:1199:14:0	Solo exporta elementos cortados	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_azc5t3my3nftf7gorcxp	org_y0txnlv69l6vp70ey06b	oqst_y92mgx2frkp3vd6m0dfn	answer:1199:14:1	Solo exporta elementos enteros\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_cg4n8phxlkdlnwma79xk	org_y0txnlv69l6vp70ey06b	oqst_y92mgx2frkp3vd6m0dfn	answer:1199:14:2	Puedo diferenciar entre un elemento cortado o en Proyección/Superficie\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pzsj02d9cqx2mdnwfuvm	org_y0txnlv69l6vp70ey06b	oqst_jbminde0yx8whmmls3fj	answer:1199:15:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nco4ljwsobjtm8wg145c	org_y0txnlv69l6vp70ey06b	oqst_jbminde0yx8whmmls3fj	answer:1199:15:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_csmvat43bo29sadizqo0	org_y0txnlv69l6vp70ey06b	oqst_ulye786uzgtt93jx2f1b	answer:1199:16:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_f5xfgiv6rw1kz96wqrhn	org_y0txnlv69l6vp70ey06b	oqst_ulye786uzgtt93jx2f1b	answer:1199:16:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2qx67ux2witx8n782v7i	org_y0txnlv69l6vp70ey06b	oqst_x77gfx8polnielgztyl9	answer:1199:17:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iyz2j85sse7o1xee240d	org_y0txnlv69l6vp70ey06b	oqst_x77gfx8polnielgztyl9	answer:1199:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jqlg3nfq4kygjcfls1ju	org_y0txnlv69l6vp70ey06b	oqst_s6zhx55x1p47tya87p03	answer:1199:18:0	RFA	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_giwf15jxqcdf90152rgx	org_y0txnlv69l6vp70ey06b	oqst_s6zhx55x1p47tya87p03	answer:1199:18:1	RFT\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_vwwvn3mvebtzvmmxy9n8	org_y0txnlv69l6vp70ey06b	oqst_s6zhx55x1p47tya87p03	answer:1199:18:2	RTE\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2lgz9gw6q49vc767yh44	org_y0txnlv69l6vp70ey06b	oqst_8l87qf1e4m6bweecvz9x	answer:1091:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l8zn8yhhxo73qpx9vavj	org_y0txnlv69l6vp70ey06b	oqst_8l87qf1e4m6bweecvz9x	answer:1091:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4fbkmudfmhov5ttsvg7u	org_y0txnlv69l6vp70ey06b	oqst_1ylrj8010w8vp0ywnvpj	answer:1091:2:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jlua3h2l9npdq68pj7ut	org_y0txnlv69l6vp70ey06b	oqst_1ylrj8010w8vp0ywnvpj	answer:1091:2:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3n4e9zxhl78yq7u5c3ct	org_y0txnlv69l6vp70ey06b	oqst_20l0qv2y763f2q9g7fyn	answer:1091:3:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yvxnpage2d7m9pwrzc63	org_y0txnlv69l6vp70ey06b	oqst_20l0qv2y763f2q9g7fyn	answer:1091:3:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p4nj2qnwxbm086vfnws1	org_y0txnlv69l6vp70ey06b	oqst_fpsnh4yob636cg00um88	answer:1091:4:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_z5sawjdngz1l9u4ebn9n	org_y0txnlv69l6vp70ey06b	oqst_fpsnh4yob636cg00um88	answer:1091:4:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_m4851ap6y3a79wspoqib	org_y0txnlv69l6vp70ey06b	oqst_bj872eo4ese7vcziqas2	answer:1091:5:0	Disciplina\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6r060cssp0p1lm5gilfi	org_y0txnlv69l6vp70ey06b	oqst_bj872eo4ese7vcziqas2	answer:1091:5:1	Línea oculta\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zwx7hmudl7d56fhevft9	org_y0txnlv69l6vp70ey06b	oqst_bj872eo4ese7vcziqas2	answer:1091:5:2	Angulo\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_issx3417ckuj65cw80k6	org_y0txnlv69l6vp70ey06b	oqst_24by5yr8dd6viu8uw60o	answer:1091:6:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4v9pyrcplp8zmk8xhy7m	org_y0txnlv69l6vp70ey06b	oqst_24by5yr8dd6viu8uw60o	answer:1091:6:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_kn3g4w91ew9f7q8fov25	org_y0txnlv69l6vp70ey06b	oqst_fmq96odh87xslaq2j45o	answer:1091:7:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ufm2hv1tyjjk69jizd59	org_y0txnlv69l6vp70ey06b	oqst_fmq96odh87xslaq2j45o	answer:1091:7:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9xg11j7czyvz6o202b9s	org_y0txnlv69l6vp70ey06b	oqst_kms8q69fatjkct5g79ri	answer:1091:8:0	Conducto laminar\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_myg4phqd91skib0kjinc	org_y0txnlv69l6vp70ey06b	oqst_kms8q69fatjkct5g79ri	answer:1091:8:1	Conducto oval\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_61frljo7oocyeepq71qh	org_y0txnlv69l6vp70ey06b	oqst_kms8q69fatjkct5g79ri	answer:1091:8:2	Conducto redondo\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2xij5i03vopfo5s0xj8p	org_y0txnlv69l6vp70ey06b	oqst_b4xkurxnu70ugs0ilups	answer:1091:9:0	Sector donde puedo elegir de qué color será mi conducto editado\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t0iidcn06g215ekd5vho	org_y0txnlv69l6vp70ey06b	oqst_b4xkurxnu70ugs0ilups	answer:1091:9:1	Sector donde puedo elegir las uniones de mi conducto editado\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8acm6gjzklp2fss6zk24	org_y0txnlv69l6vp70ey06b	oqst_b4xkurxnu70ugs0ilups	answer:1091:9:2	Sector donde puedo elegir las uniones de todos los conductos\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oci6kh3y5nspgtg1nz8b	org_y0txnlv69l6vp70ey06b	oqst_zi2z4b9ailonwhxoadhp	answer:1091:10:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_m76wfp6f6gdrgoxcjmid	org_y0txnlv69l6vp70ey06b	oqst_zi2z4b9ailonwhxoadhp	answer:1091:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hf48l4ih5rr84l9bhc7f	org_y0txnlv69l6vp70ey06b	oqst_djvsa9jip3h4xoniu8x3	answer:1091:11:0	Geometría\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_h3014w5nx3we1aas0t6c	org_y0txnlv69l6vp70ey06b	oqst_djvsa9jip3h4xoniu8x3	answer:1091:11:1	Diámetro\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_n412ta6wj4qzwzdjeoav	org_y0txnlv69l6vp70ey06b	oqst_x15pife225dqig9cphbp	answer:1112:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p1mfthnt7hkc537wo6da	org_y0txnlv69l6vp70ey06b	oqst_djvsa9jip3h4xoniu8x3	answer:1091:11:2	Elevación intermedia\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l0j05mw84rmuxlu99mje	org_y0txnlv69l6vp70ey06b	oqst_gkdln1lvfwceocp4zuq3	answer:1091:12:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wwvdjnvltr4kufwplf6y	org_y0txnlv69l6vp70ey06b	oqst_gkdln1lvfwceocp4zuq3	answer:1091:12:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_od7bd8gmeaynne8how43	org_y0txnlv69l6vp70ey06b	oqst_l6eq8ovlpm77a6c6xkci	answer:1091:13:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_cpehqe7vq67jxmdl6ifs	org_y0txnlv69l6vp70ey06b	oqst_l6eq8ovlpm77a6c6xkci	answer:1091:13:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gz3zaver5phzq0zmh76i	org_y0txnlv69l6vp70ey06b	oqst_cbc1trm5v8wjoy1jqxaf	answer:1091:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p8ic9r9kqn2f1vcqx5nu	org_y0txnlv69l6vp70ey06b	oqst_cbc1trm5v8wjoy1jqxaf	answer:1091:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xyt4a614q5mgkrthq3zu	org_y0txnlv69l6vp70ey06b	oqst_6kkz5pxckliqmbbeoqtn	answer:1091:15:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r7o55gtt642rt082fa5c	org_y0txnlv69l6vp70ey06b	oqst_6kkz5pxckliqmbbeoqtn	answer:1091:15:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iksb15y0o7hhft036c5n	org_y0txnlv69l6vp70ey06b	oqst_ld2t1fol1d7zbjaupg0p	answer:1091:16:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_99mdsvq9kuabmowxee9d	org_y0txnlv69l6vp70ey06b	oqst_ld2t1fol1d7zbjaupg0p	answer:1091:16:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t8dixiw34m073rmoxl8n	org_y0txnlv69l6vp70ey06b	oqst_0qvxzyxi3avxgle3xs9f	answer:1091:17:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8f73dym8gcaa2beu3hot	org_y0txnlv69l6vp70ey06b	oqst_0qvxzyxi3avxgle3xs9f	answer:1091:17:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_sttipfakanl2jv7xnqdw	org_y0txnlv69l6vp70ey06b	oqst_j6031h0cf23yi73cpt38	answer:1091:18:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gub4nhz7f2bht3zamp17	org_y0txnlv69l6vp70ey06b	oqst_j6031h0cf23yi73cpt38	answer:1091:18:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_u2cmha2b5dyoy8hvgfg5	org_y0txnlv69l6vp70ey06b	oqst_mxsqukrydxa74ls25xib	answer:1091:19:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_5vof5ohk6zwoyokb7ayi	org_y0txnlv69l6vp70ey06b	oqst_mxsqukrydxa74ls25xib	answer:1091:19:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i3f2qkz0k4ds1l1hoyel	org_y0txnlv69l6vp70ey06b	oqst_mk5z568ewoef0d9c7nso	answer:1091:20:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p6x2nwb8dhuj2ah2d5nd	org_y0txnlv69l6vp70ey06b	oqst_mk5z568ewoef0d9c7nso	answer:1091:20:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_27mw7v6kp4ov2y9zfrxe	org_y0txnlv69l6vp70ey06b	oqst_idnhbad37j9cdzsujz3k	answer:1112:1:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2qg73m3a7aagd2058e1n	org_y0txnlv69l6vp70ey06b	oqst_idnhbad37j9cdzsujz3k	answer:1112:1:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_05go4vdctru76ywl6ef3	org_y0txnlv69l6vp70ey06b	oqst_yb50i4ms9ug5zcqcu0sn	answer:1112:2:0	Sector donde configuro los tamaños de uniones sanitarias\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bahxd0zjgkoypd7mzisq	org_y0txnlv69l6vp70ey06b	oqst_yb50i4ms9ug5zcqcu0sn	answer:1112:2:1	Sector donde configuro el tamaño de los segmentos de tuberías\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_aw9c9x6vlewx9i1n0ww7	org_y0txnlv69l6vp70ey06b	oqst_yb50i4ms9ug5zcqcu0sn	answer:1112:2:2	Sector donde configuro el tamaño de los aparatos sanitarios\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mou6jwjyc5ej9tm9ybsz	org_y0txnlv69l6vp70ey06b	oqst_d5fwbwr7cenm1n9qxn8m	answer:1112:3:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_w3yiglvccd2oe9ya914k	org_y0txnlv69l6vp70ey06b	oqst_d5fwbwr7cenm1n9qxn8m	answer:1112:3:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j190j3xuhxapdtkh4akm	org_y0txnlv69l6vp70ey06b	oqst_6cphp2uetzmz3gxyck15	answer:1112:4:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qtres26njdvfsjws5k9t	org_y0txnlv69l6vp70ey06b	oqst_6cphp2uetzmz3gxyck15	answer:1112:4:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ekna7zffrt9f921oafp2	org_y0txnlv69l6vp70ey06b	oqst_bjvcssgh5p29cr3ald2k	answer:1112:5:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pnbwlfvbmj2hygtuh92v	org_y0txnlv69l6vp70ey06b	oqst_bjvcssgh5p29cr3ald2k	answer:1112:5:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pnki9zflm6utzevbv9lq	org_y0txnlv69l6vp70ey06b	oqst_d5nmbj8da4ch3qhhsrlk	answer:1112:6:0	Sector donde puedo elegir las uniones de mi tubería editada\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_p7ztrfno0m0l5n77v258	org_y0txnlv69l6vp70ey06b	oqst_d5nmbj8da4ch3qhhsrlk	answer:1112:6:1	Sector donde puedo elegir de qué color será mi tubería editada\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_o2upc32014vtx5pbssqn	org_y0txnlv69l6vp70ey06b	oqst_d5nmbj8da4ch3qhhsrlk	answer:1112:6:2	Sector donde puedo elegir las uniones de todas las tuberías\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i2xudgjl1gxd9hb40y3e	org_y0txnlv69l6vp70ey06b	oqst_xlmi64ozia10uq5dr9it	answer:1112:7:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4cvkx7ga20isva1q9f15	org_y0txnlv69l6vp70ey06b	oqst_xlmi64ozia10uq5dr9it	answer:1112:7:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wt2zfj584gu3t5pn450a	org_y0txnlv69l6vp70ey06b	oqst_a0s63d7mk5uv8ioqgcoo	answer:1112:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qslftaffw61ih28xbiup	org_y0txnlv69l6vp70ey06b	oqst_a0s63d7mk5uv8ioqgcoo	answer:1112:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_incetzpnhvn90k5nbf5w	org_y0txnlv69l6vp70ey06b	oqst_7epazp1vtavm1c876dss	answer:1112:9:0	Heredar elevación\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_b9wxy6pi4usvyltgca31	org_y0txnlv69l6vp70ey06b	oqst_7epazp1vtavm1c876dss	answer:1112:9:1	Diámetro\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_f3llg3pmcy3sa46nurfl	org_y0txnlv69l6vp70ey06b	oqst_7epazp1vtavm1c876dss	answer:1112:9:2	Tipo de sistema\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gp1qm0j3ge338qcigivw	org_y0txnlv69l6vp70ey06b	oqst_a3p5trwtp2ywqjl6ks2p	answer:1112:10:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2k4dj9qah7r2m2ome2ap	org_y0txnlv69l6vp70ey06b	oqst_a3p5trwtp2ywqjl6ks2p	answer:1112:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tck5wn8gw3aafohegkg6	org_y0txnlv69l6vp70ey06b	oqst_7gbrujp8nz8mvaidy5jd	answer:1112:11:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_kcjanhe3qanzn0gsmv07	org_y0txnlv69l6vp70ey06b	oqst_7gbrujp8nz8mvaidy5jd	answer:1112:11:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_w2oke6pmevydn6kqcq5h	org_y0txnlv69l6vp70ey06b	oqst_22zq12wk5x1zntqrl6ki	answer:1112:12:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_n5g3bxdbjtb8r01bvn0n	org_y0txnlv69l6vp70ey06b	oqst_22zq12wk5x1zntqrl6ki	answer:1112:12:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_71xy8crx53ftlswax77u	org_y0txnlv69l6vp70ey06b	oqst_8b30t3kr2m0pvhjznjaa	answer:1112:13:0	Herramienta para modelar líneas que con propiedades de tuberías\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ro2id70jwucg0ysk3fpp	org_y0txnlv69l6vp70ey06b	oqst_8b30t3kr2m0pvhjznjaa	answer:1112:13:1	Herramienta para modelar tuberías flexibles\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7p27fcmls62ht0u7y14z	org_y0txnlv69l6vp70ey06b	oqst_8b30t3kr2m0pvhjznjaa	answer:1112:13:2	Herramienta para modelar líneas sin propiedades\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_450znetle4a7ii0ix6cs	org_y0txnlv69l6vp70ey06b	oqst_x15pife225dqig9cphbp	answer:1112:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_80saatd8wtxytvvt30r3	org_y0txnlv69l6vp70ey06b	oqst_4zl7jn7saqvncilvdtd7	answer:1112:15:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mecrjz8wawvg7mwffkbc	org_y0txnlv69l6vp70ey06b	oqst_4zl7jn7saqvncilvdtd7	answer:1112:15:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_objfriv5wxxukgr71d6b	org_y0txnlv69l6vp70ey06b	oqst_x7mk3ejmivzrsdsgid88	answer:1112:16:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bjfn9n05iulhpwdx7ez0	org_y0txnlv69l6vp70ey06b	oqst_x7mk3ejmivzrsdsgid88	answer:1112:16:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_o5kliru4m54i7nuzsb49	org_y0txnlv69l6vp70ey06b	oqst_mljbow4s3a5rykbd06gx	answer:1112:17:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_kzb2nmpt0fim99yiuj3e	org_y0txnlv69l6vp70ey06b	oqst_mljbow4s3a5rykbd06gx	answer:1112:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_js3egqv3ldvvhlp6ff59	org_y0txnlv69l6vp70ey06b	oqst_sjmax22ajvn6z8r0z2vr	answer:1112:18:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ri5niek966zifgqort9m	org_y0txnlv69l6vp70ey06b	oqst_sjmax22ajvn6z8r0z2vr	answer:1112:18:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jod3ugo493al10dndlpp	org_y0txnlv69l6vp70ey06b	oqst_4xzid3ccz0eqh3js6hhw	answer:1112:19:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_bttuvou6r26imuw5ahgl	org_y0txnlv69l6vp70ey06b	oqst_4xzid3ccz0eqh3js6hhw	answer:1112:19:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7zc8ke5ah8xpxgcrogo8	org_y0txnlv69l6vp70ey06b	oqst_ygz09wxnnuzadb6h3qic	answer:1112:20:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lp8z5rv51az14nihhn61	org_y0txnlv69l6vp70ey06b	oqst_ygz09wxnnuzadb6h3qic	answer:1112:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dh6fyqp6hyclmhl5vzjr	org_y0txnlv69l6vp70ey06b	oqst_ap9o61th606qwjdtqmeu	answer:1133:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_o340ivld99le8l83dfeo	org_y0txnlv69l6vp70ey06b	oqst_ap9o61th606qwjdtqmeu	answer:1133:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l75y2aoxq9z6izkirkl1	org_y0txnlv69l6vp70ey06b	oqst_8kizgz1jlhip2n5d2p2u	answer:1133:2:0	Fontanería\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l63b87ucsjgs6f1h5pcj	org_y0txnlv69l6vp70ey06b	oqst_8kizgz1jlhip2n5d2p2u	answer:1133:2:1	Incendio\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lhs2z7mhpxq1rti52ysv	org_y0txnlv69l6vp70ey06b	oqst_8kizgz1jlhip2n5d2p2u	answer:1133:2:2	Climatización\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_se0p08id44i34bsbqkhm	org_y0txnlv69l6vp70ey06b	oqst_pspm0k3vo2fqvpoxnk05	answer:1133:3:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j2zikpnaro5lu5f2hqm2	org_y0txnlv69l6vp70ey06b	oqst_pspm0k3vo2fqvpoxnk05	answer:1133:3:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rbusnivaloji8mag7jst	org_y0txnlv69l6vp70ey06b	oqst_eqrp0tt7p7gukkfom3je	answer:1133:4:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9gsakyodp4y47hl2nd4j	org_y0txnlv69l6vp70ey06b	oqst_eqrp0tt7p7gukkfom3je	answer:1133:4:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lxfw2af3ylvlm5f39v01	org_y0txnlv69l6vp70ey06b	oqst_fcqdp810fg1ovmw6d4t1	answer:1133:5:0	Automático - de origen interno a origen interno\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ot0koupnys5fxxntowm5	org_y0txnlv69l6vp70ey06b	oqst_fcqdp810fg1ovmw6d4t1	answer:1133:5:1	Automático - centro a centro\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hx2mslcq6w55j2jl9cyg	org_y0txnlv69l6vp70ey06b	oqst_fcqdp810fg1ovmw6d4t1	answer:1133:5:2	Manual - Origen interno\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_plf4liwjtaja1mky06vl	org_y0txnlv69l6vp70ey06b	oqst_ubokwbcx1b752606ziv7	answer:1133:6:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fih56cdgvgej7dhhj6s8	org_y0txnlv69l6vp70ey06b	oqst_ubokwbcx1b752606ziv7	answer:1133:6:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_x0d1fpo5ot9pp8akdl6p	org_y0txnlv69l6vp70ey06b	oqst_pvddoxx8kg70qdzmh5d0	answer:1133:7:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wgbo3yths4fg83sgyr5t	org_y0txnlv69l6vp70ey06b	oqst_pvddoxx8kg70qdzmh5d0	answer:1133:7:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_3b5s6c7b52hxc9uibpvc	org_y0txnlv69l6vp70ey06b	oqst_vmv6kn00dim1989aeqcu	answer:1133:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i9cpirtt6iodwz6aglp0	org_y0txnlv69l6vp70ey06b	oqst_vmv6kn00dim1989aeqcu	answer:1133:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gstprkeoe006cwaceqvz	org_y0txnlv69l6vp70ey06b	oqst_s6pc7xq209rnio2hadzm	answer:1133:9:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gzv3kcc8003rwbkt4mtr	org_y0txnlv69l6vp70ey06b	oqst_s6pc7xq209rnio2hadzm	answer:1133:9:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_o3fo8aq7kjqf92cibwqj	org_y0txnlv69l6vp70ey06b	oqst_vl2uhkuwpfd28go9hwup	answer:1133:10:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7hnnqfp4onf9jiljh9to	org_y0txnlv69l6vp70ey06b	oqst_vl2uhkuwpfd28go9hwup	answer:1133:10:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j20je7pqmvspay2ojucb	org_y0txnlv69l6vp70ey06b	oqst_mhm73lxmmthik9x66f25	answer:1070:1:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_20qli5nqbocmbt7a1kd8	org_y0txnlv69l6vp70ey06b	oqst_mhm73lxmmthik9x66f25	answer:1070:1:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ikh6voapwurq5k6ks5zb	org_y0txnlv69l6vp70ey06b	oqst_tz3fa627ik1j0pkg2aye	answer:1070:2:0	Colaboración PID\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iaqvzlofdxia7i0t6hk5	org_y0txnlv69l6vp70ey06b	oqst_tz3fa627ik1j0pkg2aye	answer:1070:2:1	Definición de voltaje\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8sjvqmh1emmhbv13lkez	org_y0txnlv69l6vp70ey06b	oqst_tz3fa627ik1j0pkg2aye	answer:1070:2:2	Sistema de distribución\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_icvk10wsoh7by56npzwu	org_y0txnlv69l6vp70ey06b	oqst_xhgk8h5smo2l7lprn5z5	answer:1070:3:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fbcaihzcq6iat3b26odd	org_y0txnlv69l6vp70ey06b	oqst_xhgk8h5smo2l7lprn5z5	answer:1070:3:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qfq2fgl6rg01uzqg4vqz	org_y0txnlv69l6vp70ey06b	oqst_0de3auaea5wa2gaulmyh	answer:1070:4:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ovhq6j7oek7lsjsmvzqm	org_y0txnlv69l6vp70ey06b	oqst_0de3auaea5wa2gaulmyh	answer:1070:4:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9poy6wdgdf2qrjeci8b1	org_y0txnlv69l6vp70ey06b	oqst_7sxukxflcqq9yc4e46zy	answer:1070:5:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wptphf8qpebovv679zr0	org_y0txnlv69l6vp70ey06b	oqst_7sxukxflcqq9yc4e46zy	answer:1070:5:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_36lvvvnjcw53nx5tp3jc	org_y0txnlv69l6vp70ey06b	oqst_hmfju5mpkzmpmappri6d	answer:1070:6:0	Verdadero\n	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_iyg5daeebh7s0pnmddtg	org_y0txnlv69l6vp70ey06b	oqst_hmfju5mpkzmpmappri6d	answer:1070:6:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_a8uwo1aiigxfmc2uzw5s	org_y0txnlv69l6vp70ey06b	oqst_auc2zf7x3z6yipyrt1ly	answer:1070:7:0	Datos eléctricos\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_eeeuelbez5bbl8t8qf1j	org_y0txnlv69l6vp70ey06b	oqst_auc2zf7x3z6yipyrt1ly	answer:1070:7:1	Geometría\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hzcz0mw7y4m0txybrwhb	org_y0txnlv69l6vp70ey06b	oqst_auc2zf7x3z6yipyrt1ly	answer:1070:7:2	ID del interruptor\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9x866g28butirnrimykm	org_y0txnlv69l6vp70ey06b	oqst_1tgo3xx902z31rdr76u6	answer:1070:8:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tmfnceujni86iibke198	org_y0txnlv69l6vp70ey06b	oqst_1tgo3xx902z31rdr76u6	answer:1070:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_too9iww27awp7k56leue	org_y0txnlv69l6vp70ey06b	oqst_z3gy4ttk2pr8l56h68aq	answer:1070:9:0	Datos eléctricos\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zoamm18tdasiw0vn1a19	org_y0txnlv69l6vp70ey06b	oqst_z3gy4ttk2pr8l56h68aq	answer:1070:9:1	Estadística\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_egzegwi695xk8k3oammn	org_y0txnlv69l6vp70ey06b	oqst_z3gy4ttk2pr8l56h68aq	answer:1070:9:2	Número de circuito\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9yaf3x74q9xw9yfr0wq5	org_y0txnlv69l6vp70ey06b	oqst_yaby0uhhpr5arrhdqdhv	answer:1070:10:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r8yr2uvrrzh1deb9tilr	org_y0txnlv69l6vp70ey06b	oqst_yaby0uhhpr5arrhdqdhv	answer:1070:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_200ior48le000mjg712u	org_y0txnlv69l6vp70ey06b	oqst_b4h4i0819bf713oruml2	answer:1070:11:0	Verdadero\n	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_5ov5nhvcig7og1w5olmi	org_y0txnlv69l6vp70ey06b	oqst_b4h4i0819bf713oruml2	answer:1070:11:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hjc389rjtqxf2nndtvd1	org_y0txnlv69l6vp70ey06b	oqst_cw2qb99py0195gbl2k4z	answer:1070:12:0	Verdadero\n	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7ozr3u7rwri7uo63sntf	org_y0txnlv69l6vp70ey06b	oqst_cw2qb99py0195gbl2k4z	answer:1070:12:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_kaplgdcnn1kwbsjkex4f	org_y0txnlv69l6vp70ey06b	oqst_59bhslgfiidmvibw7vuz	answer:1070:13:0	Carga\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_waq86dofjnb3mad6spi1	org_y0txnlv69l6vp70ey06b	oqst_59bhslgfiidmvibw7vuz	answer:1070:13:1	Clasificación de carga\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_vdygli6spn3lvdgz80ds	org_y0txnlv69l6vp70ey06b	oqst_59bhslgfiidmvibw7vuz	answer:1070:13:2	Fotometría\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oqbvs8id46anio9vl2vo	org_y0txnlv69l6vp70ey06b	oqst_w1fzd9jfxcriob2w2awa	answer:1070:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j7hevgqvcgp7i9bwaxdn	org_y0txnlv69l6vp70ey06b	oqst_w1fzd9jfxcriob2w2awa	answer:1070:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r6f66ljn7tmqj485wbp3	org_y0txnlv69l6vp70ey06b	oqst_2o89ddwpj9ml30ert74r	answer:1070:15:0	Verdadero\n	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dekh9z60n0end9wyoz2s	org_y0txnlv69l6vp70ey06b	oqst_2o89ddwpj9ml30ert74r	answer:1070:15:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nzsvc81v9z65oce4dq8s	org_y0txnlv69l6vp70ey06b	oqst_y8ivjv0sarod7egl7wg6	answer:1070:16:0	Voltaje\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0118g2fq07phjq5an5vo	org_y0txnlv69l6vp70ey06b	oqst_y8ivjv0sarod7egl7wg6	answer:1070:16:1	Número de polos\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_nvk9yj7eiqmg1tb30dft	org_y0txnlv69l6vp70ey06b	oqst_y8ivjv0sarod7egl7wg6	answer:1070:16:2	Salto de llave\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fs6g7abl1mqdap740nuj	org_y0txnlv69l6vp70ey06b	oqst_928y4mgiuok1v4rtxghx	answer:1070:17:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_85djbkj1kjtiretpqkl1	org_y0txnlv69l6vp70ey06b	oqst_928y4mgiuok1v4rtxghx	answer:1070:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_vud074vl960bj5blcj6v	org_y0txnlv69l6vp70ey06b	oqst_oot37efmvkdmclmzclx2	answer:1070:18:0	Un resumen láminas diagramadas de mi proyecto\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fotigtfd6ajx9ukkt817	org_y0txnlv69l6vp70ey06b	oqst_oot37efmvkdmclmzclx2	answer:1070:18:1	Un resumen de vistas del proyecto\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_5ret2je5lkc5kqfgjo4m	org_y0txnlv69l6vp70ey06b	oqst_oot37efmvkdmclmzclx2	answer:1070:18:2	Un resumen de los sistemas que tengo creados, más algunas propiedades\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gpsvwczlf8jmm7jifei2	org_y0txnlv69l6vp70ey06b	oqst_zacae4jau8q45eigfivm	answer:1070:19:0	Anchura\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_m8t8i4pq2k5bdmzr6h30	org_y0txnlv69l6vp70ey06b	oqst_zacae4jau8q45eigfivm	answer:1070:19:1	Amplitud\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hms49dmc16lbrt8qpxmv	org_y0txnlv69l6vp70ey06b	oqst_zacae4jau8q45eigfivm	answer:1070:19:2	Altura\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_a20413jch3e8pbi4g975	org_y0txnlv69l6vp70ey06b	oqst_w42b7z9za4asg51b4yna	answer:1070:20:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xxuldoin5zl8moa1okmg	org_y0txnlv69l6vp70ey06b	oqst_w42b7z9za4asg51b4yna	answer:1070:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xo41vpg7lbppsrm001ba	org_y0txnlv69l6vp70ey06b	oqst_2q8m6gl9cednxjzmvo1x	answer:484:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rz8ds7wkbg5b5vpgmrb3	org_y0txnlv69l6vp70ey06b	oqst_2q8m6gl9cednxjzmvo1x	answer:484:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qaofi6cg6jnxpyz7favz	org_y0txnlv69l6vp70ey06b	oqst_ye21x3fdzlzetpjw191d	answer:484:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ccc18rwz8oj4b2h8j7ql	org_y0txnlv69l6vp70ey06b	oqst_ye21x3fdzlzetpjw191d	answer:484:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_53yhe7wgj31av8qemjqg	org_y0txnlv69l6vp70ey06b	oqst_5j399aax4y8wrbwxdj13	answer:484:3:0	Se achica\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qo2c7tyojkwa5vntwtw1	org_y0txnlv69l6vp70ey06b	oqst_5j399aax4y8wrbwxdj13	answer:484:3:1	Cambia la altura de antepecho	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mzdm1rtiho1m4yc8374v	org_y0txnlv69l6vp70ey06b	oqst_5j399aax4y8wrbwxdj13	answer:484:3:2	No pasa nada	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_opi2jkky7sswz5yas29k	org_y0txnlv69l6vp70ey06b	oqst_bnprmhwcow52wd5301t7	answer:484:4:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yvx793uyrbxj4f83dzs8	org_y0txnlv69l6vp70ey06b	oqst_bnprmhwcow52wd5301t7	answer:484:4:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ym94vkzkmcmdd0z4spen	org_y0txnlv69l6vp70ey06b	oqst_wjwa39b7zebr0b5higk5	answer:484:5:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t1k8zpzlu5ickidzdw3f	org_y0txnlv69l6vp70ey06b	oqst_wjwa39b7zebr0b5higk5	answer:484:5:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_krhktcte6xy34v9skqh5	org_y0txnlv69l6vp70ey06b	oqst_nj447xz3g8cjoc4kx7ws	answer:484:6:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4an2ozxphgqcfimfxokn	org_y0txnlv69l6vp70ey06b	oqst_nj447xz3g8cjoc4kx7ws	answer:484:6:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_36tdcewtwua2dpi01v7r	org_y0txnlv69l6vp70ey06b	oqst_zqp9xj5s29fg92ifay0o	answer:484:7:0	Es una forma de crear cubiertas	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yny50oz6mbmum0k7ojd1	org_y0txnlv69l6vp70ey06b	oqst_zqp9xj5s29fg92ifay0o	answer:484:7:1	Me permite dibujar el boceto del techo\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r3tr5dyxifsncsufife9	org_y0txnlv69l6vp70ey06b	oqst_zqp9xj5s29fg92ifay0o	answer:484:7:2	Reconoce áreas cerradas del modelo\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zdqup28fb285znsj2fzz	org_y0txnlv69l6vp70ey06b	oqst_w4cypg51297vvpgdvn1g	answer:484:8:0	Una visualización de otro nivel, en el plano de trabajo\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zczwg6ng28xvmnrf8srg	org_y0txnlv69l6vp70ey06b	oqst_w4cypg51297vvpgdvn1g	answer:484:8:1	Un plano de techos\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2zkk75h5u5vdzk8qnly7	org_y0txnlv69l6vp70ey06b	oqst_w4cypg51297vvpgdvn1g	answer:484:8:2	Una vista aérea\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_is0wmtw64ncmo6krm442	org_y0txnlv69l6vp70ey06b	oqst_hx61ktpdpsugplqtmca0	answer:484:9:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0nagtt7p6vswwwen5uem	org_y0txnlv69l6vp70ey06b	oqst_hx61ktpdpsugplqtmca0	answer:484:9:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4w3cxw5qjeliirp39nie	org_y0txnlv69l6vp70ey06b	oqst_k2uizje9hzbz379ddafu	answer:484:10:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_k9fzsdmaivrh1dp1pimd	org_y0txnlv69l6vp70ey06b	oqst_k2uizje9hzbz379ddafu	answer:484:10:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_h85zc5b2n6j1cetvu5se	org_y0txnlv69l6vp70ey06b	oqst_q487secin29pi2uxnx1z	answer:484:11:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8ob3r6toilf9p0q35srj	org_y0txnlv69l6vp70ey06b	oqst_q487secin29pi2uxnx1z	answer:484:11:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_x1k840by05cghofj9tw0	org_y0txnlv69l6vp70ey06b	oqst_rqmlcvg52bbh5rxc7abr	answer:484:12:0	Es una forma de crear Muros\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pfrv9bl91ci4dtaajr2t	org_y0txnlv69l6vp70ey06b	oqst_rqmlcvg52bbh5rxc7abr	answer:484:12:1	Es una forma de crear Cubiertas\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ovb5va0glblxbqd8vn1c	org_y0txnlv69l6vp70ey06b	oqst_rqmlcvg52bbh5rxc7abr	answer:484:12:2	Es una forma de crear vistas\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_t4d5xfhg1qpb9pyreu46	org_y0txnlv69l6vp70ey06b	oqst_p9xyo735o9hfp22ogd5q	answer:484:13:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zzdq33rrf59a3d7cu515	org_y0txnlv69l6vp70ey06b	oqst_p9xyo735o9hfp22ogd5q	answer:484:13:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_l2i888vm9rrrch7o4gd1	org_y0txnlv69l6vp70ey06b	oqst_l9fgyti0pla91tqdi8l2	answer:484:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_axdn3hustci9bpxnic3j	org_y0txnlv69l6vp70ey06b	oqst_l9fgyti0pla91tqdi8l2	answer:484:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_h4ugs4eu3ojaj8i68rkx	org_y0txnlv69l6vp70ey06b	oqst_jb54aekw7c1y6p78hwwa	answer:484:15:0	Mobiliario\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r8ffkvjvo6ggmjgttgnn	org_y0txnlv69l6vp70ey06b	oqst_jb54aekw7c1y6p78hwwa	answer:484:15:1	Mobiliario fijo\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_a14lenz73o0fn02qzux7	org_y0txnlv69l6vp70ey06b	oqst_jb54aekw7c1y6p78hwwa	answer:484:15:2	Modelo genérico\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2bd9bifb0b3zaht4kgwn	org_y0txnlv69l6vp70ey06b	oqst_csth75bztbzq51fr8dvp	answer:484:16:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_2lhkxxm0cgg0mbhj2hp6	org_y0txnlv69l6vp70ey06b	oqst_csth75bztbzq51fr8dvp	answer:484:16:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_jr0ubm6wm17kxh2vd2d6	org_y0txnlv69l6vp70ey06b	oqst_1pdua6wtuwxlm3idhnw9	answer:484:17:0	Las propiedades de vista afectan a todas las vistas del proyecto\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_hvceur9fje6hokywc2fl	org_y0txnlv69l6vp70ey06b	oqst_1pdua6wtuwxlm3idhnw9	answer:484:17:1	Las propiedades de vista no afectan a las vistas\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_oq7e90njb9a1czt70jcv	org_y0txnlv69l6vp70ey06b	oqst_1pdua6wtuwxlm3idhnw9	answer:484:17:2	Las propiedades de vista afectan a cada vista individualmente\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_rdo3m9t7brqt0ba88sud	org_y0txnlv69l6vp70ey06b	oqst_hmicueyj0ucdw4xw7hxr	answer:484:18:0	En una vista lateral, copio elementos y los pego en el nivel deseado\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_08r7wdfqez6ase512hdg	org_y0txnlv69l6vp70ey06b	oqst_hmicueyj0ucdw4xw7hxr	answer:484:18:1	Seleccionar elementos, copiar a portapapeles, pegar seleccionando niveles\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_am14usclo219j571ssri	org_y0txnlv69l6vp70ey06b	oqst_hmicueyj0ucdw4xw7hxr	answer:484:18:2	Todas son correctas\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_8pqyoiadqw7jkkazyfqd	org_y0txnlv69l6vp70ey06b	oqst_i86zst10mh4049kxqjto	answer:484:19:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_349ibgv5ff5n8vt0kx0i	org_y0txnlv69l6vp70ey06b	oqst_i86zst10mh4049kxqjto	answer:484:19:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zhn0h0818d0cm3bk7lh6	org_y0txnlv69l6vp70ey06b	oqst_lrqv7y4tm7tat377vnop	answer:484:20:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_46hqn361n623q5ddo2y6	org_y0txnlv69l6vp70ey06b	oqst_lrqv7y4tm7tat377vnop	answer:484:20:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ihrvlx7dythym2c92svm	org_y0txnlv69l6vp70ey06b	oqst_kr4wmc2u8rgty6ns91z9	answer:450:1:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0lw6a49zv3g799cvxkoq	org_y0txnlv69l6vp70ey06b	oqst_kr4wmc2u8rgty6ns91z9	answer:450:1:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gnsvceb04cqslz6lq5y1	org_y0txnlv69l6vp70ey06b	oqst_4jnzw46y8jc4mxn03wt3	answer:450:2:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_1vfre12t1vc4wjp64e3h	org_y0txnlv69l6vp70ey06b	oqst_4jnzw46y8jc4mxn03wt3	answer:450:2:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xzefz67fnooemrzg1ifp	org_y0txnlv69l6vp70ey06b	oqst_p6ybvv7xlgkvqga2jg5u	answer:450:3:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_k83bauu06stxx3yabi0p	org_y0txnlv69l6vp70ey06b	oqst_p6ybvv7xlgkvqga2jg5u	answer:450:3:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_n1juoph0qavwptqhr8wd	org_y0txnlv69l6vp70ey06b	oqst_lo3ve2k0lkofi1bxkxki	answer:450:4:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4yq658uay22qp4bv1nqj	org_y0txnlv69l6vp70ey06b	oqst_lo3ve2k0lkofi1bxkxki	answer:450:4:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_vua0bwsnsskf0919zbrk	org_y0txnlv69l6vp70ey06b	oqst_x8jfd1csv01vmm8836om	answer:450:5:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_k9h54ulo3ecm6233ot03	org_y0txnlv69l6vp70ey06b	oqst_x8jfd1csv01vmm8836om	answer:450:5:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_61jzxk47zk6kgdsbsiw3	org_y0txnlv69l6vp70ey06b	oqst_ca1ff4cd5b4p1ai3eisr	answer:450:6:0	Cinta "Estrcutura", Herramienta "Pilar"\t	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7z00cncoktkbxqxnxe5f	org_y0txnlv69l6vp70ey06b	oqst_ca1ff4cd5b4p1ai3eisr	answer:450:6:1	Cinta "Arquitectura", Herrmianta "Pilar Arquitectonico"\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zrwkgna70g4xqimrg7tq	org_y0txnlv69l6vp70ey06b	oqst_ca1ff4cd5b4p1ai3eisr	answer:450:6:2	Cinta "Estructura", Herramienta "soporte vertical"\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_cot6vkkctvkg8vemhd4r	org_y0txnlv69l6vp70ey06b	oqst_df71kt8730klrvz5qdtk	answer:450:7:0	"En pilares"\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ikm6l5749t03gllobuzn	org_y0txnlv69l6vp70ey06b	oqst_df71kt8730klrvz5qdtk	answer:450:7:1	"En rejillas"\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_djme5jcofrq1126uao4w	org_y0txnlv69l6vp70ey06b	oqst_df71kt8730klrvz5qdtk	answer:450:7:2	"En sistema"\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_i5f1e4cssvhcyiu6ymz5	org_y0txnlv69l6vp70ey06b	oqst_9rxp82ubseyn0502t9ye	answer:450:8:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lrhjxbqu0svrog3z2coh	org_y0txnlv69l6vp70ey06b	oqst_9rxp82ubseyn0502t9ye	answer:450:8:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_1xzsdikid12ha9s7xsmv	org_y0txnlv69l6vp70ey06b	oqst_ryl5ft3c3fecli6j6jnb	answer:450:9:0	"Aislada" "Armadura" "Losa"\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_b0eh9ngg6xchyx5r8uai	org_y0txnlv69l6vp70ey06b	oqst_ryl5ft3c3fecli6j6jnb	answer:450:9:1	"Soporte" "Muro" "Losa"\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tltnjmwc6qrtsgnfwgpe	org_y0txnlv69l6vp70ey06b	oqst_ryl5ft3c3fecli6j6jnb	answer:450:9:2	"Aislada" "Muro" "Losa"\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_og0zzgq8j1m3x054inv5	org_y0txnlv69l6vp70ey06b	oqst_ds5da0ob8h9ljr7p9gkf	answer:450:10:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mk1nfuydgswvepem60va	org_y0txnlv69l6vp70ey06b	oqst_ds5da0ob8h9ljr7p9gkf	answer:450:10:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qkd0kfdjgxxw3iikx6p2	org_y0txnlv69l6vp70ey06b	oqst_taljgwqrryzuw3ka86az	answer:450:11:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mwr0yad9xbo8dw53s9w2	org_y0txnlv69l6vp70ey06b	oqst_taljgwqrryzuw3ka86az	answer:450:11:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wljok5lq0ax6lv0pvmbc	org_y0txnlv69l6vp70ey06b	oqst_a4btr5mlj3cdfsu2j5et	answer:450:12:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j48mgnnw48vvr8ch542y	org_y0txnlv69l6vp70ey06b	oqst_a4btr5mlj3cdfsu2j5et	answer:450:12:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_87zqhiti9ddof4t43ubt	org_y0txnlv69l6vp70ey06b	oqst_c9an0nt60w1idgohr6li	answer:450:13:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_j0ftp8islqplcvuhe5f3	org_y0txnlv69l6vp70ey06b	oqst_c9an0nt60w1idgohr6li	answer:450:13:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_pp0zs66jswinubthwr4d	org_y0txnlv69l6vp70ey06b	oqst_npf291jnymcl31w0b6hf	answer:450:14:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_cdeivernn34ffzftfimb	org_y0txnlv69l6vp70ey06b	oqst_npf291jnymcl31w0b6hf	answer:450:14:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yp8hf2ak43k68rnvqcjx	org_y0txnlv69l6vp70ey06b	oqst_94pcsbb8gd5gvhzk6q6z	answer:450:15:0	Distancia fija\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_6y2n85zo0jcm91sohpac	org_y0txnlv69l6vp70ey06b	oqst_94pcsbb8gd5gvhzk6q6z	answer:450:15:1	Espaciado máximo\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qi1czoqdyupclyz9qd9m	org_y0txnlv69l6vp70ey06b	oqst_94pcsbb8gd5gvhzk6q6z	answer:450:15:2	Modelo genérico\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_0ycvjb0erko1r8w9s8m6	org_y0txnlv69l6vp70ey06b	oqst_h2m2i4v4zqsxvounrj9v	answer:450:16:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_xedaj5kcfiyrli4qxx0p	org_y0txnlv69l6vp70ey06b	oqst_h2m2i4v4zqsxvounrj9v	answer:450:16:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_urtr29f3s1ccxda7q00c	org_y0txnlv69l6vp70ey06b	oqst_xfxc9mqs6f3sj6fa5oi2	answer:450:17:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tcizbvm7q54xn1cicvg0	org_y0txnlv69l6vp70ey06b	oqst_xfxc9mqs6f3sj6fa5oi2	answer:450:17:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ra2arfh0f0eo9pt1vqfm	org_y0txnlv69l6vp70ey06b	oqst_u67gkf6cge8py42kgvlw	answer:450:18:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_r3jextopbcga3wu5np1b	org_y0txnlv69l6vp70ey06b	oqst_u67gkf6cge8py42kgvlw	answer:450:18:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_qzp45s7rtym1fkrsw7bm	org_y0txnlv69l6vp70ey06b	oqst_blsiznprboko14cg6c23	answer:450:19:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ypchykf34qog247d9xr4	org_y0txnlv69l6vp70ey06b	oqst_blsiznprboko14cg6c23	answer:450:19:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_udzofyklfyzwt4y5hsrt	org_y0txnlv69l6vp70ey06b	oqst_qbir5lz0gi4t424dx15w	answer:450:20:0	Verdadero\n	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_lqbek9n2osbpyhra8pkm	org_y0txnlv69l6vp70ey06b	oqst_qbir5lz0gi4t424dx15w	answer:450:20:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_770tnqnpck338oiv0yk4	org_y0txnlv69l6vp70ey06b	oqst_1kethwupqe7uikhe9qu9	answer:450:21:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_gsxcst13uwtec6k6358v	org_y0txnlv69l6vp70ey06b	oqst_1kethwupqe7uikhe9qu9	answer:450:21:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_wr5pe0f7p4h5vbo2ek8e	org_y0txnlv69l6vp70ey06b	oqst_lhvcqrnepsivk3u115dz	answer:450:22:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_odxsiwa2uazkxepdq8zz	org_y0txnlv69l6vp70ey06b	oqst_lhvcqrnepsivk3u115dz	answer:450:22:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_zdh7gzk30ykbnokm4q78	org_y0txnlv69l6vp70ey06b	oqst_bg8pw3j5gbw0e9dr888n	answer:450:23:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9tft6oed3o39phif0pqg	org_y0txnlv69l6vp70ey06b	oqst_bg8pw3j5gbw0e9dr888n	answer:450:23:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7z0owiof91uz2g0fyshh	org_y0txnlv69l6vp70ey06b	oqst_0iosfnu741z50i3ouix2	answer:450:24:0	Muestra una lista de formas de recubrimientos cargados en el proyecto\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_yf5d0yyl5tt5hjv9aqg7	org_y0txnlv69l6vp70ey06b	oqst_0iosfnu741z50i3ouix2	answer:450:24:1	Muestra una lista de vigas\t	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_vnyrnpckanhwui2d9yd0	org_y0txnlv69l6vp70ey06b	oqst_0iosfnu741z50i3ouix2	answer:450:24:2	Muestra una lista de formas de armadura cargadas en el proyecto\t	t	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_emr11nx8wfnompj4ocq1	org_y0txnlv69l6vp70ey06b	oqst_a92m4r27ufajg7eaxkch	answer:450:25:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_suzfr4dfkl7qf9l0il9k	org_y0txnlv69l6vp70ey06b	oqst_a92m4r27ufajg7eaxkch	answer:450:25:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_tbwqzv5dail9vonedgpx	org_y0txnlv69l6vp70ey06b	oqst_rta85fnqrk55jixyibhv	answer:450:26:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ggxgrogsv50oaa77zs58	org_y0txnlv69l6vp70ey06b	oqst_rta85fnqrk55jixyibhv	answer:450:26:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7b4r2cayrwarx0hr7zzl	org_y0txnlv69l6vp70ey06b	oqst_mts4q4unqjfaavlefzbm	answer:450:27:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dky3a2490ffz3c8satek	org_y0txnlv69l6vp70ey06b	oqst_mts4q4unqjfaavlefzbm	answer:450:27:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_9bhnac433na988wqvvvm	org_y0txnlv69l6vp70ey06b	oqst_l34rklzqxph5vw5t8gcl	answer:450:28:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_68nwpo4fzvqpdhq1z1ob	org_y0txnlv69l6vp70ey06b	oqst_l34rklzqxph5vw5t8gcl	answer:450:28:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_mgpgpu5vgt2nnqc48lkh	org_y0txnlv69l6vp70ey06b	oqst_04l00zjn7nohlfveyx6u	answer:450:29:0	Mostrar armadura (cuando selecciono viga)\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_dvkabxuxj3gu8ccnvuou	org_y0txnlv69l6vp70ey06b	oqst_04l00zjn7nohlfveyx6u	answer:450:29:1	Estado de visibilidad en vista (cuando selecciono el acero)\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ml4b85693thce4pg2xc0	org_y0txnlv69l6vp70ey06b	oqst_04l00zjn7nohlfveyx6u	answer:450:29:2	Mostrar armadura (cuando selecciono el acero)\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_fz63y2a5zus1muriq4le	org_y0txnlv69l6vp70ey06b	oqst_3jhn2twlv0rdknt0058o	answer:450:30:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_utkvf0zencecn1xwntw8	org_y0txnlv69l6vp70ey06b	oqst_3jhn2twlv0rdknt0058o	answer:450:30:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_7ny5tlhldktwnznkllfx	org_y0txnlv69l6vp70ey06b	oqst_1uqaaftylylhd95ni7nx	answer:450:31:0	Verdadero	t	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_4n4b44sxy5fsuxma7w4r	org_y0txnlv69l6vp70ey06b	oqst_1uqaaftylylhd95ni7nx	answer:450:31:1	Falso	f	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_y3qnorg2qd3p8qwx7crh	org_y0txnlv69l6vp70ey06b	oqst_t6acm02iovbnrdnlp46t	answer:450:32:0	Piezas\t	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_eyuzicxv74nxh6l6re00	org_y0txnlv69l6vp70ey06b	oqst_t6acm02iovbnrdnlp46t	answer:450:32:1	Elementos de fabricación\t	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ltug3ldlb6v8tthpoykp	org_y0txnlv69l6vp70ey06b	oqst_t6acm02iovbnrdnlp46t	answer:450:32:2	Dispositivos\t	f	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_ucgsysqsl3bxly1e2knr	org_y0txnlv69l6vp70ey06b	oqst_7225gan9q47zchsohg9m	answer:450:33:0	Verdadero	f	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oans_1nehz0bfa8fg4kv2akvo	org_y0txnlv69l6vp70ey06b	oqst_7225gan9q47zchsohg9m	answer:450:33:1	Falso	t	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
\.


--
-- Data for Name: offline_course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_course (id, organization_id, legacy_ref, title, slug, description_md, thumbnail_url, status, created_at, updated_at) FROM stdin;
ocrs_7093zy6b3elid4m39mjq	org_y0txnlv69l6vp70ey06b	course:1776	Revit® MEP 2025	revit-mep-2025	El **Curso de Revit (Instalaciones) MEP Completo** consiste en un **pack que engloba los cursos de Revit MEP** en 4 Módulos.\n\nCon él aprenderás **desde las nociones básicas de las disciplinas que componen MEP** (General, Fontanería, Climatización y Eléctrica) hasta el uso de **familias MEP complejas** o la **terminación de un edificio en REVIT MEP**.\n\nPara realizar este curso es necesario tener conocimiento teórico de Instalaciones y saber usar nuestro [REVIT BÁSICO GRATUITO](http://academia.cadit.com.uy/courses/revit-basico/).	/api/media/ma_1xjqdau30xyt23cbzkyg	published	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.407
ocrs_8er99oh77cvsytvswhj2	org_y0txnlv69l6vp70ey06b	course:1647	Revit® Estructura 2025	revit-estructura-2025	**Revit®** para ingeniería estructural\n\nOptimiza tus proyectos, desde el concepto del diseño hasta la fabricación, con el software de modelado de información de edificios de **Revit**®.\n\nMejora los niveles de precisión y constructibilidad mediante la conexión de tu diseño estructural con el modelo detallado.	/api/media/ma_07qe379u0oo2r3skfqlt	published	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.41
ocrs_mo20ndr6bnz5aj0qyicp	org_y0txnlv69l6vp70ey06b	course:1607	Revit® Básico 2025	revit-basico-2025	Este es un curso oficial de Autodesk orientado específicamente a la arquitectura y la construcción.\n\nEl software Revit® para el diseño de edificios se ha desarrollado específicamente para BIM **(Building Information Modeling)**, y permite a los profesionales del diseño y la construcción transformar las ideas desde el concepto hasta la terminación con un enfoque coordinado y homogéneo basado en modelos. En este curso se cubren todos los fundamentos del software.	/api/media/ma_rvweadgachy4jjs3vptt	published	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.411
ocrs_3qha4umq5zv29i7mikto	org_y0txnlv69l6vp70ey06b	course:1319	Revit® Arquitectura 2025	revit-arquitectura-2	Este es un curso oficial de Autodesk orientado específicamente a la arquitectura y la construcción.\n\nEl software Revit® para el diseño de edificios se ha desarrollado específicamente para BIM **(Building Information Modeling)**, y permite a los profesionales del diseño y la construcción transformar las ideas desde el concepto hasta la terminación con un enfoque coordinado y homogéneo basado en modelos. En este curso se cubren todos los fundamentos del software.	/api/media/ma_3en1k9px0lyd03ltsnhx	published	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.411
ocrs_suajbvlidh1c5yyms10j	org_y0txnlv69l6vp70ey06b	course:721	Civil 3D®	civil-3d	Civil 3D es un software de diseño y documentación para infraestructuras civiles.\nCivil 3D le permite simplificar tareas, mantener la coherencia de los datos y responder a los cambios con rapidez.	/api/media/ma_ovf2h02phedoy3n7ro0v	published	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.412
\.


--
-- Data for Name: offline_course_access; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_course_access (id, organization_id, offline_course_id, cohort_id, enrollment_id, mode, created_at, created_by) FROM stdin;
oacc_t4dcccsl2dluwcjy26q1	org_y0txnlv69l6vp70ey06b	ocrs_suajbvlidh1c5yyms10j	coh_ydka81s7x8kixtq95vsm	\N	\N	2026-09-29 18:39:33.727155	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE
oacc_z6g20pj16yh16mqdvff0	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	coh_ydka81s7x8kixtq95vsm	\N	\N	2026-09-29 18:39:33.727155	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE
oacc_nhwa2du8x4cb0mky73p4	org_y0txnlv69l6vp70ey06b	ocrs_8er99oh77cvsytvswhj2	coh_ydka81s7x8kixtq95vsm	\N	\N	2026-09-29 18:39:33.727155	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE
oacc_aa1wj7w62fwlty94j83g	org_y0txnlv69l6vp70ey06b	ocrs_mo20ndr6bnz5aj0qyicp	coh_ydka81s7x8kixtq95vsm	\N	\N	2026-09-29 18:39:33.727155	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE
oacc_if6ib5zqcwu467u2ftp5	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	coh_ydka81s7x8kixtq95vsm	\N	\N	2026-09-29 18:39:33.727155	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE
\.


--
-- Data for Name: offline_lesson; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_lesson (id, organization_id, course_id, legacy_ref, title, content_md, "position", created_at, updated_at) FROM stdin;
oles_zy97t4w9v6bptv2glzeu	org_y0txnlv69l6vp70ey06b	ocrs_8er99oh77cvsytvswhj2	lesson:1651	Curso Revit Estructura		0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oles_3so93sc4ca4phfci3t7h	org_y0txnlv69l6vp70ey06b	ocrs_mo20ndr6bnz5aj0qyicp	lesson:1610	Curso Revit Básico		0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oles_5x3zarg1f6hyl2hi98vm	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	lesson:1371	Curso Revit Arquitectura		0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oles_muukdv77lkisj972jlpf	org_y0txnlv69l6vp70ey06b	ocrs_suajbvlidh1c5yyms10j	lesson:735	Módulo A - Civil 3d®	AutoCAD *Civil 3D* es una solución de diseño y documentación para ingeniería civil que admite flujos de trabajo de BIM (Building Information Modeling).	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oles_wnfd6pu5oo635wfog0k3	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	lesson:1778	Revit® MEP - Módulo común		0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.415
oles_n7ssucgv9ts4vk4uz9oh	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	lesson:1780	Revit® MEP - Módulo continuo		1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.416
\.


--
-- Data for Name: offline_question; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_question (id, organization_id, quiz_id, legacy_ref, question_md, answer_type, points, "position", created_at, updated_at) FROM stdin;
oqst_ir7c0a0b04t1loli7c9q	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:1	REVIT tiene incluida por defecto una plantilla inicial para proyectos de Arquitectura.	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7jjylgts7o7wqm0lunis	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:2	La cinta "Arquitectura" tiene herramientas exclusivas para modelar la arquitectura de un proyecto.	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_12ks264johio4lzthu4b	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:3	En REVIT no se puede modelar la Estructura de un proyecto.	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7bbabbkepl0rs0vhdmp0	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:4	Marque la correcta.	multiple	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_3zpz9ms1xzpccq8dil2q	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:5	El comando por teclado para ingresar a cambiar las unidades es UNE.	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_9dsgj7o21uv1v1uqis3b	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:6	Cuando selecciono un elemento el panel de "Propiedades" me muestra datos y propiedades de dicho elemento.	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_xong4gkc9k2i32n9q7pz	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:7	Marque la correcta.	multiple	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_v2vwje8liaxawhnnfye7	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:8	El "Navegador de proyectos" es un repositorio para el proyecto.	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_nhg2pr8io0r0ql3rcfvy	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:9	Dentro de la pestaña "Familias" en el "Navegador de proyectos", se encuentran todas las familias de la web.	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1vzxesf4u22r353ar8zs	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:10	En la cinta "Modificar" se encuentra la herramienta "Muros".	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a3jmvzc0u6a36h84sgsd	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:11	Puedo mover un elemento seleccionándolo, arrastrando y soltando.	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_3ge66eo1zhya1fjcgbie	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:12	Marque la correcta.	multiple	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_q3g62y2b6u4ydxm76317	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:13	Modele un muro de Ancho 20cm que mida 2 metros, en el sentido Sur/Norte. Copie el muro hacia la derecha tecleando 1 y luego presione enter.	multiple	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_5vs8y52am42bcwaquiyu	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:14	Existe 2 heramientas que permiten realizar simetrías.	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_h4guv5yvvbuefgpw27hi	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:15	"Recortar/Extender esquina", se utiliza tanto para muros como para líneas.	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_t6nfmihmef04mao7j5dc	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:16	"Recortar/Extender elementos simples", es una herramienta que se encuentra en la cinta "Sistemas".	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_kyy4xtm0rgcejodpog6d	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:17	Marque la correcta.	multiple	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_c7zv8simorg39fym1788	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:18	La herramienta de "Dividir elemento", me permite dividir un muro en partes.	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_4j2ibj4th158xy7iq0qc	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:19	La herramienta de "Dividir con separación", no existe.	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_xe29rz7gzw7hohdu6069	org_y0txnlv69l6vp70ey06b	oqz_0cgbzpb64rlhpqsak9kk	question:1281:20	La herramienta de "Suprimir", se encuentra en la cinta "Modificar".	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_v2di2eoia774xt1uwva1	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:1	Dentro de la cinta de "Vistas" se encuentra la herramienta para hacer secciones	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_c7m2773uvxmm9em0l379	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:2	Al generar una sección, automáticamente aparece una vista nueva para la misma	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ccdhy5gfq1mh36gsvqtf	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:3	No puedo generar vistas de "Alzado" nuevas	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_yfe85ofqum2z0r5ry7km	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:4	La herramienta que usamos para realizar detalles a diferente escala es:	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7pkzd5jrmsjecp73j045	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:5	Las "Vistas de Diseño" son hojas en blanco prontas para dibujar detalles	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_bshqqa41ukijfgsrekhc	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:6	Puedo crear una planilla de aberturas usando las vistas de:	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_o0e5wd3c2k4ar2cdjji4	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:7	Un "Componenetes de Leyenda" es un dibujo 2D de una familia cargada en el proyecto	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_dvskqe0gbsfl03d4xow3	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:8	Los "Textos" siempre mantienen su tamaño, sin importar la escala de proyecto	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ia0s6v6t8bmy1yn4ut4h	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:9	No puedo cambiar el color del texto	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_6bfr7tja8hd45ldpc9t4	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:10	"Alineada","Lineal" y "Angular", son 3 formas diferentes de cotas	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_rpxwn0yp2n9dkt92vzsp	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:11	La cota "Alineada" es siempre ortogonal	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_jn6100o52qfr7pe9pupy	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:12	Las etiquetas son:	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_fifpsoxyawgn5jdfx1d9	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:13	La herramienta "Etiquetar todo" me permite etiquetar todos los elementos de una o varias categorías, en simultáneo	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_de2ejisnocmxqwmqhm2j	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:14	Las "Tablas de planificación/Cantidades" son tablas que proporcionan datos del modelo	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_eg8rpmf3lhe4jo96nqlx	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:15	No puedo hacer tablas con más de 3 campos	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_v4kowi21rw8izjugpw6n	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:16	Puedo ordenar las tablas en función de alguno de los campos	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_5kborn1s5i5ziw2opmts	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:17	Puedo hacer operaciones matemáticas entre campos	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ke8zyl39mwh03qmmib9c	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:18	Las tablas permiten crear campos nuevos	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_3ed87653b8d25xekaqtw	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:19	No se pueden generar vistas en perspectiva	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_vl4tg9dlunlpgww1n89u	org_y0txnlv69l6vp70ey06b	oqz_jdg1yudxw1eqzmy0ldda	question:1218:20	Al renderizar Revit nos brinda la opción de Iluminar con Sol o Artificial, o ambas en simultáneo	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_9ge7lcehpr4m0y1r20c2	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:1	Existe un panel llamado "Hueco" en la Cinta de "Arquitectura"	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_rhwm15iq2mnbou3ww17d	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:2	Dentro de las propiedades de la herramienta "hueco de muro", se encuentra una llamada "Restricción de base"	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_may40fzga3w9dl10u79t	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:3	Marque la opción correcta	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ps5cm3sp63yiix76dlmz	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:4	Marque la opción correcta	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_6fnuxq4vq6am51e1umi3	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:5	Al crear una escalera, no puedo elegir cuantas contrahuellas va a tener	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_311zlyj7x76c6pkrv76x	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:6	En escaleras podemos cambiar la restricción de "altura de contrahuella máxima"	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_w1v1dac3rndum0d4gs4l	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:7	En escaleras no puedo modificar la profundidad de la huella	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_8zbag6jmb8if07389vpf	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:8	Puedo crear escaleras que contengan tramos curvos y rectos	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_r3beqsrykzcpl92i2ru7	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:9	Al convertir el descanso de una escalera en boceto de dibujo:	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_iwxxzc3x7z8r9yzykoq5	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:10	La herramienta para crear Rampas se encuentra en:	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_43s383wae3qb40ba0cmm	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:11	La rampa del tipo "Sólida", nos deja elegir el "Grosor" de la misma	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_q19v4e32v0r7kylc8qni	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:12	En las barandas se puede modificar el "Desfase de base" y el "Desfase de ruta"	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_gw51e3jc3txsj9zkbjc8	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:13	No existen Pilares Arquitectónicos diferentes a los de sección rectangular o circular.	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_uhby3rpg5ldf0nt05gy4	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:14	La herramienta "Superficie Topográfica" la encontramos en la cinta "Masa y emplazamiento"	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_akf79qpibrsfbq3y0z5j	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:15	Puedo editar el "Material" de la Topografía	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_0bethmeulvsqh5dodv5n	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:16	No puedo dividir una Topografía	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_5f85nrj2w14j3sh5sqf1	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:17	La "Subregión" se usa para darle otro material a un sector de la Topografía	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_00acr7g3887aadjtdwyv	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:18	"Muro Cortina" es una familia de la categoría de "Muros"	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_l4jr9fictvj79mgxr80z	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:19	Las "Rejillas" de un muro cortina son las divisiones de paneles del mismo	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a3musklh6ni9djkt7oor	org_y0txnlv69l6vp70ey06b	oqz_sxzjtdgrb9zl2sbhh9b6	question:1239:20	Al editar Tipo de "Muro Cortina", puedo diferenciar el Tipo de montante de borde 1, borde 2 y los de interior	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_sq1onsri73vkgshcz51m	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:1	Desde cual de las siguientes opciones puedo modificar la forma de visualizar las diferentes categorias?	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_pda9guj6mhts8hhasp3u	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:2	Puedo cambiar el grosor de línea de una categoría entera	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_fkv6uqcj9kjin8evw62a	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:3	No puedo ocultar todas las puertas a la misma vez	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_k38p5rhmler04wdfl2sb	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:4	"Modificaciones de visibilidad / gráficos" permite modificar la forma de ver los elementos de:	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_v86rsbam5z3kfglvso17	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:5	En los planos, a las "ventanas gráficas" puedo elegirle la escala	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_vfvtr04fzghrh4r7w03p	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:6	Una "ventana gráfica" es una familia a la cual se le puede crear "Tipos" nuevos	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_hun0nuczqruo4o1cuko9	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:7	No se puede diagramar la misma vista en 2 planos diferentes	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_l87y0noykehekl3gzgua	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:8	No se pueden diagramar en planos las vistas 3D ni las tablas de cantidades	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_jk7ovq9xgz26srwu1ocu	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:9	Puedo crear una familia de "cuadro de rotulación" de cualquier tamaño	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_q8qgpusm8sflkrp0v2w4	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:10	Un "Texto de etiqueta" es un texto que reconoce un dato del proyecto	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_852ulffddi4b3zwfa4sm	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:11	No se pueden agregar imágenes (logos, fotos, etc) en un "cuadro de rotulación"	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ujxe4b8cen46qwjlvffv	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:12	El formato de archivo de familias de Revit es \\*.RFA	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_gvxsu3jol4l11b17rnk7	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:13	Al exportar a CAD, puedo elegir el nombre de la capa para cada categoría de Revit	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_y92mgx2frkp3vd6m0dfn	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:14	Al exportar a CAD	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_jbminde0yx8whmmls3fj	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:15	Se puede exportar el 3D en forma de "Malla poligonal" o "Sólidos ACIS"	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ulye786uzgtt93jx2f1b	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:16	Revit permite imprimir varias vistas a la vez	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_x77gfx8polnielgztyl9	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:17	El formato de archivos de proyectos de Revit es \\*.RVT	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_s6zhx55x1p47tya87p03	org_y0txnlv69l6vp70ey06b	oqz_n85fxgmy24iac263qa5q	question:1199:18	El formato de archivos de una "plantilla de proyecto" de Revit es	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_8l87qf1e4m6bweecvz9x	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:1	Para que coincida el origen de coordenadas de mi archivo, con el del archivo vinculado, la importación se debe hacer de "Automática - De origen interno a origen interno"	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1ylrj8010w8vp0ywnvpj	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:2	Para proyectos de climatización ,la disciplina activa en las vistas debe ser "climatización"	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_20l0qv2y763f2q9g7fyn	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:3	Con el comando por teclado "MC", ingreso a la configuración mecánica	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_fpsnh4yob636cg00um88	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:4	Puedo modificar la visualización de las líneas ocultas en MEP	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_bj872eo4ese7vcziqas2	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:5	Cual de estas modificaciones NO se pueden realizar desde el panel "Configuración mecánica"	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_24by5yr8dd6viu8uw60o	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:6	Los sistemas de conductos se pueden diferenciar por color	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_fmq96odh87xslaq2j45o	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:7	Se pueden crear sistemas nuevos de conductos	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_kms8q69fatjkct5g79ri	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:8	Cual de las siguientes NO es una familia de conductos	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_b4xkurxnu70ugs0ilups	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:9	En el editor de tipo de conductos : Preferencias de enrutamiento	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_zi2z4b9ailonwhxoadhp	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:10	Existe una pieza de unión para los casos donde un conducto cambia de forma, por ejemplo, de oval a rectangular	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_djvsa9jip3h4xoniu8x3	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:11	Cual de estas NO es una opción del panel de propiedades al colocar conductos	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_gkdln1lvfwceocp4zuq3	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:12	Cuando la vista está configurada con nivel de detalle "Bajo", los conductos se ven representados como líneas	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_l6eq8ovlpm77a6c6xkci	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:13	La herramienta "justificación" se utiliza para indicar cual va a ser la línea de creación de un conducto. Ejemplo, Justificación horizontal Derecha y Justificación vertical Medio	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_cbc1trm5v8wjoy1jqxaf	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:14	Tanto la herramienta "heredar elevación" como la de "heredar tamaño" nos sirven para imitar alguna característica de un conducto ya modelada	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_6kkz5pxckliqmbbeoqtn	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:15	El marcado de "Marcador de posición de conductos" es una herramienta para crear rejillas de ventilación	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ld2t1fol1d7zbjaupg0p	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:16	La categoría "Terminal de Aire", agrupa todos los difusores y rejillas	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_0qvxzyxi3avxgle3xs9f	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:17	Los "Equipos Mecánicos" pertenecen únicamente a sistemas de climatización	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_j6031h0cf23yi73cpt38	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:18	Al hacer clic derecho en el conector de un conducto, existe una opción llamada "dibujar conducto flexible"	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_mxsqukrydxa74ls25xib	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:19	Al hacer clic derecho en el conector de un conducto, existe una opción llamada "Taponar extremo abierto"	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_mk5z568ewoef0d9c7nso	org_y0txnlv69l6vp70ey06b	oqz_eh8hlqox0anhiess5whk	question:1091:20	La herramienta "Mostrar desconexiones" se encuentra en la cinta "Modificar"	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_idnhbad37j9cdzsujz3k	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:1	No tengo forma de limitar los ángulos que se pueden formar entre 2 tuberías	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_yb50i4ms9ug5zcqcu0sn	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:2	Configuración: Segmentos y tamaños	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_d5fwbwr7cenm1n9qxn8m	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:3	Se pueden crear nuevos segmentos de tubería, donde puedo darle la propiedad de "Material" y/o "Serie/Tipo"	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_6cphp2uetzmz3gxyck15	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:4	Los sistemas de tubería se pueden diferenciar por color	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_bjvcssgh5p29cr3ald2k	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:5	No puedo crear sistemas de tuberías nuevos	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_d5nmbj8da4ch3qhhsrlk	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:6	En el editor de tipo de tuberías : Preferencias de enrutamiento	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_xlmi64ozia10uq5dr9it	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:7	Para que un codo se coloque de forma automática en una tubería modelada, previamente ese codo debe ser parte del enrutamiento en sus propiedades de tipo	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_9rxp82ubseyn0502t9ye	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:8	Podemos modelar pilares inclinados	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a0s63d7mk5uv8ioqgcoo	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:8	El segmento utilizado en el enrutamiento de una tubería, es quien define el menú de los diámetros de los caños	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7epazp1vtavm1c876dss	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:9	Cual de estas NO es una opción del panel de propiedades al colocar tuberías	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a3p5trwtp2ywqjl6ks2p	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:10	Al cambiar la altura de un caño, tambien cambia de altura toda la linea que se encuentre en la misma altura que dicho caño	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7gbrujp8nz8mvaidy5jd	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:11	Al cambiar el tamaño de un caño, tambien cambia de tamaño todos los caños que tengan el mismo tamaño que dicho caño	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_22zq12wk5x1zntqrl6ki	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:12	Tanto la herramienta "heredar elevación" como la de "heredar tamaño" nos sirven para imitar alguna característica de una tubería ya modelada	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_8b30t3kr2m0pvhjznjaa	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:13	"Marcador de posición":	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_x15pife225dqig9cphbp	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:14	Puedo transformar un "marcador de posición" en Tuberías	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_4zl7jn7saqvncilvdtd7	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:15	Si le hago click derecho al extremo de una tubería, me da una opción para colocarle un tapón	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_x7mk3ejmivzrsdsgid88	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:16	No puedo un codo ya modelado por otro	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_mljbow4s3a5rykbd06gx	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:17	Al seleccionar un codo, se me habilita una opción para transformarlo en Te	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_sjmax22ajvn6z8r0z2vr	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:18	Un accesorio es un elemento que se coloca en una tubería ya creada, ejemplo, una válvula	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_4xzid3ccz0eqh3js6hhw	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:19	No se pueden crear tuberías flexibles en Revit	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ygz09wxnnuzadb6h3qic	org_y0txnlv69l6vp70ey06b	oqz_gnots86p14ij8m4vmj5c	question:1112:20	Los aparatos sanitarios MEP, en caso de necesitar conectarle una tubería, deben tener conectores	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ap9o61th606qwjdtqmeu	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:1	Una plantilla es un archivo RTE que nos permite tener una pre-configuración inicial de proyecto, el cual nos brinda un punto de partida avanzado en un proyecto	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_8kizgz1jlhip2n5d2p2u	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:2	Cual de estas no es una disciplina en Revit	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_pspm0k3vo2fqvpoxnk05	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:3	Al seleccionar una disciplina de fontanería, todos los elementos arquitectónicos y estructurales se aprecian en un color más oscuro	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_eqrp0tt7p7gukkfom3je	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:4	Dentro de la Cinta "insertar", se encuentra una opción llamada "Vincular Revit"	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_fcqdp810fg1ovmw6d4t1	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:5	Para que el cero de mi disciplina coincida con el cero de la arquitectura vinculada, debo vincular la arquitectura:	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ubokwbcx1b752606ziv7	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:6	Puedo vincular archivos de Revit, IFC, CAD y nubes de puntos, a un archivo de proyecto de Revit	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_pvddoxx8kg70qdzmh5d0	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:7	Desde "modificaciones de visibilidad/gráficos", puedo editar la forma en la que se representa gráficamente un Vínculo	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_vmv6kn00dim1989aeqcu	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:8	Copiar/Supervisar: Herramienta que sirve para copiar elementos desde un vínculo al archivo origen	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_s6pc7xq209rnio2hadzm	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:9	Copiar/Supervisar: Herramienta que sirve para supervisar la existencia o posición de un elemento del archivo vinculado	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_vl2uhkuwpfd28go9hwup	org_y0txnlv69l6vp70ey06b	oqz_8ow298g55luwtz0urdal	question:1133:10	Copiar/Supervisar: Herramienta que sirve para crear copias de un objeto sin límite de cantidad	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_mhm73lxmmthik9x66f25	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:1	Para que coincida el origen de coordenadas de mi archivo, con el del archivo vinculado, la importación se debe hacer de "Manual - Origen"	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_tz3fa627ik1j0pkg2aye	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:2	Cual de estas modificaciones NO se pueden realizar desde el panel "Configuración eléctrica"	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_xhgk8h5smo2l7lprn5z5	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:3	Desde la "configuración eléctrica" puedo crear nuevos cables de diferentes materiales	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_0de3auaea5wa2gaulmyh	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:4	Un panel eléctrico está categorizado en Revit como "Equipo eléctrico"	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7sxukxflcqq9yc4e46zy	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:5	Colaboración PyID	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_hmfju5mpkzmpmappri6d	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:6	Las luminarias siempre debo colocarlas en un plano de planta	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_auc2zf7x3z6yipyrt1ly	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:7	Cual de estas NO es una propiedad de las luminarias	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1tgo3xx902z31rdr76u6	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:8	En Revit, los interruptores, son categorizados como "dispositivos de iluminación"	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_z3gy4ttk2pr8l56h68aq	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:9	Cual de estas NO es una propiedad un interruptor	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_yaby0uhhpr5arrhdqdhv	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:10	Un "Sistema de luminaria" me sirve para indicar con qué interruptor se prende cada luminaria	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_b4h4i0819bf713oruml2	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:11	Revit NO me permite indicar que varias luminarias se encienden con el mismo interruptor	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_cw2qb99py0195gbl2k4z	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:12	Los "Toma corriente" están categorizados en Revit como "Aparatos Eléctricos"	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_59bhslgfiidmvibw7vuz	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:13	Cual de estas NO es una propiedad de tipo, de un Toma corriente	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_w1fzd9jfxcriob2w2awa	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:14	Para cerrar un circuito eléctrico, el voltaje de todos sus componentes debe coincidir	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_2o89ddwpj9ml30ert74r	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:15	Cada Circuito eléctrico puede tener solamente un elemento	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_y8ivjv0sarod7egl7wg6	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:16	Cual de estas NO es una propiedad de un Circuito Eléctrico	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_928y4mgiuok1v4rtxghx	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:17	Los cables son elementos de detalle, eso quiere decir que quedan dibujados únicamente en la vista donde se crearon	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_oot37efmvkdmclmzclx2	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:18	El "Navegador de sistemas" nos muestra:	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_zacae4jau8q45eigfivm	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:19	Cual de estas NO es una propiedad de las Bandejas de Cables	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_w42b7z9za4asg51b4yna	org_y0txnlv69l6vp70ey06b	oqz_pgp1wjrp1y2tybnle31y	question:1070:20	El comando por teclado CN me permite crear tubos de eléctrica	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_2q8m6gl9cednxjzmvo1x	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:1	La vista de "planimetría general" la podemos usar para crear plantas de ubicación	multiple	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ye21x3fdzlzetpjw191d	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:2	Podemos crear niveles sin vista asociada en el navegador de proyecto	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_5j399aax4y8wrbwxdj13	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:3	En las propiedades de las ventanas, si cambio el valor de "Altura de extremo inicial":	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_bnprmhwcow52wd5301t7	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:4	Puedo colocar puertas sin que existan muros en el proyecto	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_wjwa39b7zebr0b5higk5	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:5	No puedo crear un suelo que contenga un hueco	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_nj447xz3g8cjoc4kx7ws	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:6	Los "planos de techo", son vistas que miran hacia abajo	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_zqp9xj5s29fg92ifay0o	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:7	La forma de crear techos "Techo automatico":	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_w4cypg51297vvpgdvn1g	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:8	Un plano "Subyacente" a una vista es:	single	1	7	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_hx61ktpdpsugplqtmca0	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:9	En las cubiertas por perímetro, puedo decidir que lado de la cubierta tiene pendiente.	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_k2uizje9hzbz379ddafu	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:10	Las unidades de proyecto indica que las pendientes siempre son en grados decimales.	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_q487secin29pi2uxnx1z	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:11	Los muros se pueden enlazar a la parte inferior de la cubierta	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_rqmlcvg52bbh5rxc7abr	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:12	Flecha de pendiente	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_p9xyo735o9hfp22ogd5q	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:13	Para crear una "Cubierta por extrusión" debe seleccionar un plano de referencia	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_l9fgyti0pla91tqdi8l2	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:14	Un "Componente" puede ser un mobiliario fijo	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_jb54aekw7c1y6p78hwwa	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:15	Una mesa pertenece a la categoría de:	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_csth75bztbzq51fr8dvp	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:16	Puedo cambiar la escala desde las propiedades de vista	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1pdua6wtuwxlm3idhnw9	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:17	Marque la correcta	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_hmicueyj0ucdw4xw7hxr	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:18	Para copiar elementos de un nivel a otro	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_i86zst10mh4049kxqjto	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:19	Al importar un CAD a Revit, se genera una copia del dibujo CAD en Revit	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_lrqv7y4tm7tat377vnop	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	question:484:20	Para que el CAD se importe únicamente en una planta, no debo seleccionar "solo vista actual"	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_kr4wmc2u8rgty6ns91z9	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:1	En la cinta "Insertar" encontramos la herramienta para vincular otro archivo de Revit al nuestro	single	1	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_4jnzw46y8jc4mxn03wt3	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:2	Con el comando por teclado "WT" divido la pantalla para trabajar en multimples vistas	single	1	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_p6ybvv7xlgkvqga2jg5u	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:3	Puedo modificar el "rango de vista" de una vista particular, desde el navegador de proyectos	single	1	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_lo3ve2k0lkofi1bxkxki	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:4	No se puede crear niveles debajo del 0.00	single	1	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_x8jfd1csv01vmm8836om	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:5	Puedo crear rejillas curvas	single	1	4	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ca1ff4cd5b4p1ai3eisr	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:6	Existe varias formas de crear un pilar estructural, la herramienta correcta es:	single	1	5	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_df71kt8730klrvz5qdtk	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:7	Cual de las siguientes no es una forma de colocar pilares estructurales	single	1	6	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ryl5ft3c3fecli6j6jnb	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:9	Existen 3 herramientas para crear cimentaciones	single	1	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_ds5da0ob8h9ljr7p9gkf	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:10	Puedo colocar cimentaciones aisladas utilizando la opción "en rejilla"	single	1	9	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_taljgwqrryzuw3ka86az	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:11	La herramienta "Losa", ubicada en la cinta estructral, se utiliza para crear cimentaciones de superficie	single	1	10	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a4btr5mlj3cdfsu2j5et	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:12	Para formar las vigas de celosia, se utilizan vigas ya cargadas en el modelo.	single	1	11	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_c9an0nt60w1idgohr6li	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:13	Debo usar la misma viga para el armado de toda una viga de celosia	single	1	12	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_npf291jnymcl31w0b6hf	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:14	Un "sistema de vigas" crea vigas paralelas	single	1	13	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_94pcsbb8gd5gvhzk6q6z	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:15	Cual de las siguientes no es una "regla de diseño" para un sistema de vigas	single	1	14	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_h2m2i4v4zqsxvounrj9v	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:16	Para colocar un "Tornapunta", debo tener cargada previamento un armazón estructural	single	1	15	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_xfxc9mqs6f3sj6fa5oi2	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:17	Se puede convertir un muro arquitectonico en un muro estructural	single	1	16	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_u67gkf6cge8py42kgvlw	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:18	El suelo estructural y el suelo arquitectonico son identicos en Revit	single	1	17	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_blsiznprboko14cg6c23	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:19	El modelo analítoco unicamente muestra datos de los elementos estructurales	single	1	18	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_qbir5lz0gi4t424dx15w	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:20	Todos los elementos estructurales que sean de hormigon, pueden recibir aceros	single	1	19	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1kethwupqe7uikhe9qu9	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:21	Se puede configurar el tamaño del recubrimiento de armaduras	single	1	20	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_lhvcqrnepsivk3u115dz	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:22	En una viga, el recubrimento de todas las caras debe ser el mismo	single	1	21	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_bg8pw3j5gbw0e9dr888n	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:23	Puedo configurar los aceros para que los ganchos se coloquen de forma automática	single	1	22	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_0iosfnu741z50i3ouix2	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:24	Navegador de formas de armaduras	single	1	23	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_a92m4r27ufajg7eaxkch	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:25	Al colocar armaduras en un pilar debo seleccionar su plano de colocación y su orientación de colocación	single	1	24	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_rta85fnqrk55jixyibhv	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:26	No existe herramientas para distribuir los estribos en un pilar	single	1	25	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_mts4q4unqjfaavlefzbm	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:27	Todos los aceros que creamos en revit son siempre del mismo grosor	single	1	26	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_l34rklzqxph5vw5t8gcl	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:28	Puedo dibujar la forma de una armadura a traves de un boceto	single	1	27	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_04l00zjn7nohlfveyx6u	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:29	La opcion que me permite mostrar elemento de armadura sin tapar y/o como sólido 3D, en nivel de detalle alto es:	single	1	28	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_3jhn2twlv0rdknt0058o	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:30	La herramienta para ahcer aceros llamada "área" me permite realizar una malla en 2 sentidos en una sola operación	single	1	29	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_1uqaaftylylhd95ni7nx	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:31	Las conxiones ente pilar y viga de acero se pueden editar paramétricamente ya que son tipos dentro de una familia	single	1	30	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_t6acm02iovbnrdnlp46t	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:32	A las pletinas, tornillos, anclajes, agujeros, pernos y soldaduras, Revit les llama:	single	1	31	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqst_7225gan9q47zchsohg9m	org_y0txnlv69l6vp70ey06b	oqz_z53a4dlq9276sso9m2mq	question:450:33	Los modificadores de aceros sirven para editar la forma de pilares de hormigon armado	single	1	32	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
\.


--
-- Data for Name: offline_quiz; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_quiz (id, organization_id, course_id, lesson_id, legacy_ref, title, description_md, passing_percentage, retries_allowed, "position", created_at, updated_at) FROM stdin;
oqz_0cgbzpb64rlhpqsak9kk	org_y0txnlv69l6vp70ey06b	ocrs_mo20ndr6bnz5aj0qyicp	\N	quiz:1281	Cuestionario Módulo A	Descripción breve cuestionario básico.	80	3	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_urbuy4t9t9j0er8uxsne	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	\N	quiz:484	Cuestionario - Revit® Arquitectura - Módulo A	Completa el Cuestionario del Módulo A para poder avanzar al Módulo B	80	3	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_sxzjtdgrb9zl2sbhh9b6	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	\N	quiz:1239	Cuestionario - Revit® Arquitectura - Módulo B		80	\N	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_jdg1yudxw1eqzmy0ldda	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	\N	quiz:1218	Cuestionario  - Revit® Arquitectura -  Módulo C	Completar el siguiente cuestionario para avanzar al Módulo D	80	\N	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_n85fxgmy24iac263qa5q	org_y0txnlv69l6vp70ey06b	ocrs_3qha4umq5zv29i7mikto	\N	quiz:1199	Cuestionario  - Revit® Arquitectura -  Módulo D	Cuestionario del Módulo D	80	\N	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_8ow298g55luwtz0urdal	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	\N	quiz:1133	Cuestionario - Revit® MEP - Módulo A		80	\N	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_gnots86p14ij8m4vmj5c	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	\N	quiz:1112	Cuestionario – Revit® MEP – Módulo B		80	\N	1	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_eh8hlqox0anhiess5whk	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	\N	quiz:1091	Cuestionario – Revit® MEP – Módulo C		80	\N	2	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_pgp1wjrp1y2tybnle31y	org_y0txnlv69l6vp70ey06b	ocrs_7093zy6b3elid4m39mjq	\N	quiz:1070	Cuestionario – Revit® MEP – Módulo D - Eléctrica	Cuestionario – Revit® MEP – Módulo D - Eléctrica\nComprueba tus conocimientos	80	3	3	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
oqz_z53a4dlq9276sso9m2mq	org_y0txnlv69l6vp70ey06b	ocrs_8er99oh77cvsytvswhj2	\N	quiz:450	Cuestionario - Revit® Estructuras - Módulo A		80	3	0	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332
\.


--
-- Data for Name: offline_quiz_attempt; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_quiz_attempt (id, organization_id, quiz_id, enrollment_id, contact_id, attempt_number, score_percentage, passed, answers_given, created_at) FROM stdin;
oatt_igwdjaffsio4nknku5fj	org_y0txnlv69l6vp70ey06b	oqz_urbuy4t9t9j0er8uxsne	enr_mgpfi9e52z7962xook1x	ct_215aw1k3arcnyhsvhhb6	1	35.00	f	[{"answerIds": ["oans_xo41vpg7lbppsrm001ba"], "questionId": "oqst_2q8m6gl9cednxjzmvo1x", "answerTexts": ["Verdadero"], "questionText": "La vista de \\"planimetría general\\" la podemos usar para crear plantas de ubicación"}, {"answerIds": ["oans_qaofi6cg6jnxpyz7favz"], "questionId": "oqst_ye21x3fdzlzetpjw191d", "answerTexts": ["Verdadero"], "questionText": "Podemos crear niveles sin vista asociada en el navegador de proyecto"}, {"answerIds": ["oans_qo2c7tyojkwa5vntwtw1"], "questionId": "oqst_5j399aax4y8wrbwxdj13", "answerTexts": ["Cambia la altura de antepecho"], "questionText": "En las propiedades de las ventanas, si cambio el valor de \\"Altura de extremo inicial\\":"}, {"answerIds": ["oans_opi2jkky7sswz5yas29k"], "questionId": "oqst_bnprmhwcow52wd5301t7", "answerTexts": ["Verdadero"], "questionText": "Puedo colocar puertas sin que existan muros en el proyecto"}, {"answerIds": ["oans_ym94vkzkmcmdd0z4spen"], "questionId": "oqst_wjwa39b7zebr0b5higk5", "answerTexts": ["Verdadero"], "questionText": "No puedo crear un suelo que contenga un hueco"}, {"answerIds": ["oans_krhktcte6xy34v9skqh5"], "questionId": "oqst_nj447xz3g8cjoc4kx7ws", "answerTexts": ["Verdadero"], "questionText": "Los \\"planos de techo\\", son vistas que miran hacia abajo"}, {"answerIds": ["oans_r3tr5dyxifsncsufife9"], "questionId": "oqst_zqp9xj5s29fg92ifay0o", "answerTexts": ["Reconoce áreas cerradas del modelo\\t"], "questionText": "La forma de crear techos \\"Techo automatico\\":"}, {"answerIds": ["oans_zczwg6ng28xvmnrf8srg"], "questionId": "oqst_w4cypg51297vvpgdvn1g", "answerTexts": ["Un plano de techos\\t"], "questionText": "Un plano \\"Subyacente\\" a una vista es:"}, {"answerIds": ["oans_0nagtt7p6vswwwen5uem"], "questionId": "oqst_hx61ktpdpsugplqtmca0", "answerTexts": ["Falso"], "questionText": "En las cubiertas por perímetro, puedo decidir que lado de la cubierta tiene pendiente."}, {"answerIds": ["oans_4w3cxw5qjeliirp39nie"], "questionId": "oqst_k2uizje9hzbz379ddafu", "answerTexts": ["Verdadero"], "questionText": "Las unidades de proyecto indica que las pendientes siempre son en grados decimales."}, {"answerIds": ["oans_h85zc5b2n6j1cetvu5se"], "questionId": "oqst_q487secin29pi2uxnx1z", "answerTexts": ["Verdadero"], "questionText": "Los muros se pueden enlazar a la parte inferior de la cubierta"}, {"answerIds": ["oans_ovb5va0glblxbqd8vn1c"], "questionId": "oqst_rqmlcvg52bbh5rxc7abr", "answerTexts": ["Es una forma de crear vistas\\t"], "questionText": "Flecha de pendiente"}, {"answerIds": ["oans_t4d5xfhg1qpb9pyreu46"], "questionId": "oqst_p9xyo735o9hfp22ogd5q", "answerTexts": ["Verdadero"], "questionText": "Para crear una \\"Cubierta por extrusión\\" debe seleccionar un plano de referencia"}, {"answerIds": ["oans_axdn3hustci9bpxnic3j"], "questionId": "oqst_l9fgyti0pla91tqdi8l2", "answerTexts": ["Falso"], "questionText": "Un \\"Componente\\" puede ser un mobiliario fijo"}, {"answerIds": ["oans_a14lenz73o0fn02qzux7"], "questionId": "oqst_jb54aekw7c1y6p78hwwa", "answerTexts": ["Modelo genérico\\t"], "questionText": "Una mesa pertenece a la categoría de:"}, {"answerIds": ["oans_2lhkxxm0cgg0mbhj2hp6"], "questionId": "oqst_csth75bztbzq51fr8dvp", "answerTexts": ["Falso"], "questionText": "Puedo cambiar la escala desde las propiedades de vista"}, {"answerIds": ["oans_hvceur9fje6hokywc2fl"], "questionId": "oqst_1pdua6wtuwxlm3idhnw9", "answerTexts": ["Las propiedades de vista no afectan a las vistas\\t"], "questionText": "Marque la correcta"}, {"answerIds": ["oans_08r7wdfqez6ase512hdg"], "questionId": "oqst_hmicueyj0ucdw4xw7hxr", "answerTexts": ["Seleccionar elementos, copiar a portapapeles, pegar seleccionando niveles\\t"], "questionText": "Para copiar elementos de un nivel a otro"}, {"answerIds": ["oans_8pqyoiadqw7jkkazyfqd"], "questionId": "oqst_i86zst10mh4049kxqjto", "answerTexts": ["Verdadero"], "questionText": "Al importar un CAD a Revit, se genera una copia del dibujo CAD en Revit"}, {"answerIds": ["oans_zhn0h0818d0cm3bk7lh6"], "questionId": "oqst_lrqv7y4tm7tat377vnop", "answerTexts": ["Verdadero"], "questionText": "Para que el CAD se importe únicamente en una planta, no debo seleccionar \\"solo vista actual\\""}]	2026-09-29 18:49:49.146872
\.


--
-- Data for Name: offline_recognition; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_recognition (id, organization_id, contact_id, course_id, lesson_id, reason, recognized_by, recognized_at, revoked_at, revoked_by) FROM stdin;
\.


--
-- Data for Name: offline_topic; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_topic (id, organization_id, lesson_id, legacy_ref, title, content_md, "position", created_at, updated_at, video_url, video_shown) FROM stdin;
otop_766hpi0z4o25hn9ry1k8	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1892	Climatización / Flexibles	Son conductos flexibles que permiten cambios de dirección en el sistema de conductos sin necesidad de conexiones rígidas ni ángulos precisos, además de utilizarse para conectar con terminales y/o equipos.	30	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332	https://vimeo.com/1073522481	after
otop_poadaxww6e0pbmd77oy8	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1713	Sistema de vigas	El sistema de vigas es una herramienta de Revit que permite modelar múltiples vigas de manera simultánea y ordenada. Algunos parámetros importantes incluyen la separación entre vigas, la dimensión de los perfiles, el material utilizado y la orientación o inclinación de los elementos.	29	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332	https://vimeo.com/1071907135	after
otop_7ldyj5ysmu6xr385uhmb	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1628	RB09- Alinear	Herramientas de la Cinta - "Alinear" , Restricciones. Herramienta para alinear un objeto a una línea o a otro elemento, y la posibilidad de bloquear esa relación	8	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332	https://vimeo.com/1071180019	after
otop_vs8d9ul0lqz9d0s9glfw	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1514	RA45- Recortar vista	Crear recortes en una vista permite delimitar el área visible de un plano o sección, enfocando el diseño en una zona específica y ocultando el resto para mayor claridad.	44	2026-09-25 19:50:46.356332	2026-09-25 19:50:46.356332	https://vimeo.com/1070437599	after
otop_xi23x14sc8hyb1a9e78c	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1783	Introducción a Revit	En el video se presentará una introducción a Revit, explicando sus conceptos básicos, herramientas principales y su aplicación en proyectos de diseño y construcción.	0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.423	https://vimeo.com/1073644220	after
otop_bwqmk3ert11594ahxxiq	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1787	Introducción a Revit MEP	En este curso de Revit MEP aprenderás a utilizar herramientas clave para el diseño y modelado de sistemas mecánicos, eléctricos y de Fontanería, optimizando la coordinación y documentación de proyectos MEP.	1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.425	https://vimeo.com/1073644080	after
otop_zdm0l7oyn4kkoss6xi51	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1789	Plantillas, RTE	Las "plantillas" de inicio en Revit son archivos preconfigurados que incluyen ajustes, familias y configuraciones base, usadas para comenzar proyectos con estándares definido para cualquier disciplina. Formato de archivo RTE.	2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.426	https://vimeo.com/1073643994	after
otop_cquh5l21c4q54cvuzlxu	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1791	Disciplinas	Las disciplinas organizan el modelo en categorías específicas como arquitectura, estructura o MEP, controlando la visibilidad y configuración según el enfoque profesional.	3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.427	https://vimeo.com/1073643871	after
otop_cwlx0jh1mwxsm275lkh8	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1793	Vincular Revit	Los vínculos permiten insertar y coordinar modelos externos en un proyecto, facilitando el trabajo colaborativo y la gestión de múltiples archivos de modelo.	4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.428	https://vimeo.com/1073643725	after
otop_06hrc6d2sjgl9wti6f63	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1795	Vínculos - Visibilidad	La edición de visibilidad de vínculos permite controlar cómo se muestran los modelos vinculados, ajustando su visibilidad, gráficos y configuración en la vista actual del proyecto.	5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.429	https://vimeo.com/1073643620	after
otop_wv6v1fqnqz7vs63aekun	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1797	Importar CAD	Importar un archivo de AutoCAD en Revit permite usar dibujos 2D o modelos 3D como referencia o base para desarrollar el proyecto en Revit.	6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.429	https://vimeo.com/1073643514	after
otop_xcn7obmqsteoco8jxt08	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1799	Importar CAD - Configuración	Configuración y edición de dibujo importado de AutoCAD.	7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.43	https://vimeo.com/1073643408	after
otop_yto5nxqxy1jg13zwzzu6	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1801	Niveles	Crear nuevos niveles en Revit establece planos de referencia horizontales en el proyecto, útiles para organizar pisos, techos o alturas específicas en el diseño arquitectónico.	8	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.431	https://vimeo.com/1073643299	after
otop_yix1pkwzzqvl35cbjzln	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1803	Crear Vistas	Crear vistas específicas para cada nivel del proyecto. Nuevas vistas de planta y de techos.	9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.432	https://vimeo.com/1073643227	after
otop_20ssmj0i5l9zvt89plbw	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1805	Propiedades de vista	Propiedades de vista. Estas propiedades afectan únicamente a la vista a la cual se le aplican. "Escala", "Nivel de detalle", "Estilo visual", "Sol" y "Sombras".	10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.433	https://vimeo.com/1073646395	after
otop_zmhz3d74xti1u9ymxu6b	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1807	Recortar vista	Crear recortes en una vista permite delimitar el área visible de un plano o sección, enfocando el diseño en una zona específica y ocultando el resto para mayor claridad.	11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.434	https://vimeo.com/1073646274	after
otop_6jiatuajwbpeualyy961	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1809	Vistas 3D	Herramientas para navegar a través de la vista 3D."Caja de sección", "Bloqueo de vista 3D", "Perspectiva".	12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.435	https://vimeo.com/1073646053	after
otop_xjbl0zr7zgmkri6l2r2e	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1811	Aislar - Ocultar elementos	"Aislar" u "ocultar" elementos o categorías en Revit permite mostrar sólo ciertos componentes o tipos de objetos en una vista, facilitando el enfoque en partes específicas del modelo. Revisaremos la opción de "Mostrar elementos ocultos".	13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.436	https://vimeo.com/1073645947	after
otop_76ib5djqsq3hwn8arelr	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1813	Copiar / Supervisar	La herramienta "Copiar/Supervisar" permite copiar elementos entre modelos vinculados y monitorear cambios, asegurando la coordinación entre disciplina.	14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.437	https://vimeo.com/1073645742	after
otop_80ukocdcien8ig7o35wq	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1815	Organización del "Navegador de proyectos"	La organización del navegador de proyecto en Revit permite personalizar la forma de visualizar y clasificar elementos como vistas, planos y familias, mejorando la gestión y el acceso al contenido del proyecto.	15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.438	https://vimeo.com/1073645628	after
otop_grw7v8dac18sl5z5wqzn	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1817	Rango de vista	El rango de vista define la profundidad y altura de la visualización en una vista de plano, controlando qué elementos son visibles en función de su ubicación vertical dentro de un rango específico.	16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.439	https://vimeo.com/1073645461	after
otop_s8e32okcs2kj7vh32k8n	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1819	Espacios / Zonas	Los espacios representan áreas delimitadas dentro de un edificio, utilizadas principalmente en proyectos MEP para análisis térmico, ventilación e iluminación.	17	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.44	https://vimeo.com/1073645266	after
otop_i6pouf8r62qxqios71ls	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1821	Sección	Una sección es una vista cortada verticalmente del modelo que permite ver el interior de un edificio, mostrando detalles de su estructura, distribución y elementos a través de un plano específico.	18	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.441	https://vimeo.com/1073645066	after
otop_tcfcmasovq5cr05dzsw5	org_y0txnlv69l6vp70ey06b	oles_wnfd6pu5oo635wfog0k3	topic:1823	Alzado	Las vistas de alzado en Revit son representaciones verticales del modelo, mostrando las fachadas del edificio desde diferentes direcciones, útiles para detallar la apariencia exterior.	19	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.442	https://vimeo.com/1073644928	after
otop_6hrgez65vhovjlc9ruih	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1826	Fontanería / Introducción a Fontanería	En este curso de Revit Fontanería aprenderás a diseñar, modelar y documentar sistemas de fontanería utilizando herramientas específicas del software, optimizando la planificación y coordinación de instalaciones hidráulicas en proyectos de construcción.	0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.442	https://vimeo.com/1073637723	after
otop_hfjlnqxr99mlxm73axr9	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1828	Fontanería / Sistemas de tuberías	La configuración y creación de sistemas de tuberías permite identificar el tipo de fluido (como agua, gas o vapor) y asignar una representación gráfica específica para cada tipo, facilitando su visualización y documentación en el modelo.	1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.444	https://vimeo.com/1073637590	after
otop_lheezxx3dmx60e8bi118	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1830	Fontanería / Configuración de tuberías - elementos ocultos	Permite controlar qué componentes MEP que estén tapados por otro componente se muestren o se oculten. Seleccionamos el estilo de líneas ocultas.	2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.445	https://vimeo.com/1073637528	after
otop_ygvct60829geqiqtnnd8	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1832	Fontanería / Configuración de tuberías - Ángulos	Configuración que permite limitar los ángulos que podemos formar utilizando uniones de tuberías.	3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.446	https://vimeo.com/1073637447	after
otop_ok7cpovpgr5m7oh4zr39	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1834	Fontanería / Configuración de tuberías - Segmentos y tamaños	Segmentos de tuberías, donde configuraremos su y sus tamaños, que luego se podrán utilizar en los tipos de tubería.	4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.447	https://vimeo.com/1073637349	after
otop_y83w8ux69tz35flkkzpt	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1836	Fontanería / Tipo de tuberías	La preferencia de enrutamiento que configuramos en la edición de tipo en tuberías se refiere a la asignación de uniones y conexiones específicas para los diferentes tipos de tuberías, determinando cómo se enlazan y ajustan en el sistema según sus características y materiales.	5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.447	https://vimeo.com/1073638625	after
otop_c11n2giwl7v56umsbzbn	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1838	Fontanería / Colocar tuberías - Enrutamiento, tamaño y elevación	Propiedades para colocar tuberías. Diámetro, elevación, uniones, sistemas	6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.448	https://vimeo.com/1073638490	after
otop_ajg87oxbwccnkhpn36f2	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1842	Fontanería / Colocar tuberías - Herramientas de colocación	Estudiaremos las herramientas de colocación: Justificación, concexión automática, heredar elevación y heredar tamaño.	7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.449	https://vimeo.com/1073638329	after
otop_dqztzsinui78xzpbquyr	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1844	Fontanería / Colocar tuberías - Desfasar conexiones - Pendientes	Estudiaremos las herramientas de desfasar conexiones: Añadir vertical, cambiar pendiente. Crearemos tuberías inclinadas.	8	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.45	https://vimeo.com/1073638175	after
otop_oz70hydwz4y6hmu8veib	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1846	Fontanería / Marcador de posición de tubería	La herramienta "Marcador de posición" se usa para crear esquemas lineales de tuberías, permitiendo indicar y organizar visualmente las rutas y conexiones de las tuberías en el diseño.	9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.451	https://vimeo.com/1073638081	after
otop_jvzuyw5q8rbk70hdvfyx	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1848	Fontanería / Aislamiento	La herramienta de aislación en tuberías permite asignar y controlar el tipo y el espesor del aislamiento.	10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.452	https://vimeo.com/1073638019	after
otop_9x4tit09c8csrxk0vvak	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1934	Eléctrica / Medir Cables - Circuitos eléctricos	Diferentes recursos para medir la longitud real del cableado de un circuito eléctrico.	51	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.485	https://vimeo.com/1073636587	after
otop_xsab8ee5vfw5r53iigq7	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1850	Fontanería / Uniones	Las uniones para tuberías en Revit son conexiones (codos, T), que permiten enlazar segmentos de tuberías, asegurando la continuidad y funcionalidad del sistema de tuberías.	11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.452	https://vimeo.com/1073637859	after
otop_2k7dtvh8jeredeavtrvm	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1852	Fontanería / Accesorios	Los accesorios de tuberías en incluyen elementos como llaves de corte, filtros, válvulas y otros componentes.	12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.454	https://vimeo.com/1073640983	after
otop_w5gknuowq0pypzi4sj5u	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1854	Fontanería / Flexibles	Son tuberías flexibles que permiten cambios de dirección en el sistema de tuberías sin necesidad de conexiones rígidas ni ángulos precisos.	13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.454	https://vimeo.com/1073640883	after
otop_c5mgwv6c8tohv0xro2b9	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1857	Fontanería / Instalación de fontanería	La instalación de fontanería son dispositivos como inodoros, lavamanos y duchas, que se integran en el diseño de sistemas de fontanería. Estudiaremos la importancia de sus conectores.	14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.455	https://vimeo.com/1073640602	after
otop_ic2qpcr4q03yx6w1eyua	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1859	Fontanería / Conexiones con pendiente	Interacción entre los conectores de un equipo y cañerías con pendiente.	15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.456	https://vimeo.com/1073640463	after
otop_urgyvw6ag68sivzqk3av	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1861	Fontanería / Comprobación de interferencias	La comprobación de interferencias en Revit identifica conflictos entre elementos del modelo, como colisiones entre estructuras, sistemas mecánicos o tuberías, para resolverlos antes de la construcción.	16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.457	https://vimeo.com/1073640327	after
otop_ehmv02e18dxdx5lfm3mm	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1865	Fontanería / Navegador de sistemas	El navegador de sistemas organiza y muestra una vista jerárquica de los sistemas MEP (mecánicos, eléctricos y de plomería), permitiendo inspeccionar, seleccionar y modificar elementos fácilmente.	17	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.458	https://vimeo.com/1073640231	after
otop_hr8pi86rd7tcygz3q5pf	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1867	Fontanería / Anotativos	Cotas, niveles, textos y etiquetas en tuberías y aparatos se utilizan para documentar el diseño, indicando dimensiones, elevaciones, descripciones y propiedades de los sistemas.	18	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.459	https://vimeo.com/1073640030	after
otop_n5dhvbmb3mez71kq5eqi	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1869	Fontanería / Tablas de cantidades	La tabla de planificación y cantidades para fontanería recopila y organiza datos como longitudes, diámetros y materiales de las tuberías, facilitando análisis, control y generación de informes del sistema.	19	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.459	https://vimeo.com/1073639760	after
otop_zibfm17zylrhkzavxlg9	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1871	Climatización / Introducción a Climatización	Este módulo de climatización presenta los conceptos básicos, sistemas y componentes principales, enfocándose en el diseño, instalación y modelado eficiente de sistemas HVAC en proyectos.	20	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.46	https://vimeo.com/1073371828	after
otop_wo5aepmtg6syxizl24qt	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1873	Climatización / Sistema de conductos	La configuración y creación de sistemas de conductos permite asignar una representación gráfica específica para cada tipo, facilitando su visualización y documentación en el modelo.	21	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.461	https://vimeo.com/1073371750	after
otop_twbcfx4qdsd5nn6k0y2k	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1876	Climatización / Configuración mecánica	La configuración mecánica permite ajustar la visibilidad, ángulos y tamaños de componentes HVAC para adaptar el diseño a las necesidades del proyecto.	22	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.462	https://vimeo.com/1073371353	after
otop_nbs3igjnyjqlrxmrtqac	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1878	Climatización / Tipos de conductos	La preferencia de enrutamiento que configuramos en la edición de tipo en conductos se refiere a la asignación de uniones y conexiones específicas para los diferentes tipos de conductos, determinando cómo se enlazan y ajustan en el sistema según sus características y materiales.	23	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.463	https://vimeo.com/1073371124	after
otop_j3zjnzb2d7lpex0fjd97	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1880	Climatización / Colocar conductos - Tamaño y elevación	El ancho y el alto de los conductos, junto con su elevación, determinan la dimensión y ubicación de los sistemas de ventilación.	24	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.464	https://vimeo.com/1073370967	after
otop_w0kcwe4nk4vcbry9yo82	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1882	Climatización / Colocar conductos - Justificación	La propiedad de “justificación” en los conductos determina su posición en relación con un punto de referencia (centro, cara, etc.), facilitando la alineación y colocación precisa en el proyecto.	25	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.465	https://vimeo.com/1073372826	after
otop_uzoyszfeusoxk13bzy5e	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1884	Climatización / Colocar conductos - Heredar elevación y tamaño	Estudiaremos las opciones de "Conexión automática", "Heredar elevación" y "Heredar tamaño".	26	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.465	https://vimeo.com/1073372450	after
otop_obmo0hu1skopph1leh2m	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1886	Climatización / Marcador de posición de conductos	La herramienta "Marcador de posición" se usa para crear esquemas lineales de conductos, permitiendo indicar y organizar visualmente las rutas y conexiones de los conductos en el diseño.	27	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.466	https://vimeo.com/1073372338	after
otop_vv43myvhdtim92mt1q7x	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1888	Climatización / Uniones	Las uniones para conductos en Revit son conexiones (codos, T), que permiten enlazar segmentos de conductos, asegurando la continuidad y funcionalidad del sistema.	28	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.467	https://vimeo.com/1073372181	after
otop_yrrdtb9wmboz1qjw61eg	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1890	Climatización / Aislamiento	La herramienta de aislación en conductos permite asignar y controlar el tipo y el espesor del aislamiento.	29	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.468	https://vimeo.com/1073372098	after
otop_mu0xu6pugssb8tqcwiuc	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1894	Climatización / Terminales	Los terminales en sistemas de climatización son los dispositivos finales (rejillas, difusores, etc.) que suministran o extraen aire, regulando así la distribución y confort térmico en cada espacio.	31	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.469	https://vimeo.com/1073376988	after
otop_oxb5ddnxuwfrkd2qqgrn	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1680	Vistas 3D	Herramientas para navegar a través de la vista 3D."Caja de sección", "Bloqueo de vista 3D", "Perspectiva".	13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.505	https://vimeo.com/1071914760	after
otop_2cz6ljp1cv5n6x55kmkl	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1896	Climatización / Equipos mecánicos	Los equipos mecánicos en Revit, como unidades de aire y enfriadoras, son esenciales para sistemas de climatización, permitiendo un modelado y coordinación eficientes del proyecto.	32	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.469	https://vimeo.com/1073376275	after
otop_5nnlnllklxzkj9bssg26	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1898	Climatización / Conectar terminales a equipos	Video práctico sobre técnicas de conexión de equipos y terminales. Estudiaremos la herramienta de convertir conductos rígidos a conductos flexibles.	33	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.471	https://vimeo.com/1073374404	after
otop_3x13ybpkyrcx0iqmmiwb	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1900	Climatización / Mostrar desconexiones	La herramienta “Mostrar desconexiones” en Revit resalta componentes o tramos sin conexión, facilitando la identificación y corrección de errores en el sistema.	34	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.471	https://vimeo.com/1073373345	after
otop_1mm4k1g6jdd0nvcnpf3o	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1902	Climatización / Comprobación de interferencias	La comprobación de interferencias en Revit identifica conflictos entre elementos del modelo, como colisiones entre estructuras, sistemas mecánicos o conductos, para resolverlos antes de la construcción.	35	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.472	https://vimeo.com/1073523208	after
otop_vu0o0h3whgim94qlzd2d	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1904	Climatización / Anotativos	Cotas, niveles, textos y etiquetas en conductos y aparatos se utilizan para documentar el diseño, indicando dimensiones, elevaciones, descripciones y propiedades de los sistemas.	36	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.473	https://vimeo.com/1073522888	after
otop_rrruxyfbqwqs1j7tiyv7	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1906	Climatización / Navegador de sistemas	El navegador de sistemas organiza y muestra una vista jerárquica de los sistemas MEP (mecánicos, eléctricos y de plomería), permitiendo inspeccionar, seleccionar y modificar elementos fácilmente.	37	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.474	https://vimeo.com/1073522835	after
otop_qi29wi9icl2j2utdxq74	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1908	Climatización / Tablas de cantidades	La tabla de planificación y cantidades para Climatización recopila y organiza datos como longitudes, diámetros y materiales de los conductos, facilitando análisis, control y generación de informes del sistema.	38	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.475	https://vimeo.com/1073522632	after
otop_8ng3z89xd78mqteqbeo9	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1910	Eléctrica / Introducción a Eléctrica	Este módulo de Revit MEP Eléctrica presenta los fundamentos, sistemas y componentes principales de la disciplina, enfocándose en el diseño, la instalación y el modelado eficiente de redes eléctricas dentro de proyectos de construcción.	39	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.475	https://vimeo.com/1073635196	after
otop_bqpzsk8yb243kvb9ajdf	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1912	Eléctrica / Configuración eléctrica	Iniciamos un proyecto, configuraremos la "definición de voltaje" que permiten configurar distintos valores y tipos de tensión (fase-fase, fase-neutro, monofásico, trifásico, etc.) para adaptarse a los requerimientos de cada proyecto.	40	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.476	https://vimeo.com/1073634971	after
otop_2fkuhslhi77j3je4zzu7	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1914	Eléctrica / Equipos eléctricos	Los paneles eléctricos son los componentes principales para distribuir y proteger circuitos. Se configuran definiendo sus características (capacidad, alimentación, fase, etc.) y se conectan a cargas para generar automáticamente circuitos, cálculos y documentación eléctrica.	41	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.477	https://vimeo.com/1073634834	after
otop_pp5q8r6gjlr8qn9xl4c2	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1916	Eléctrica / Luminarias	Las luminarias en Revit son familias paramétricas que controlan sus propiedades (tipo de lámpara, altura, etc.). Para colocarlas, se insertan en el modelo 3D, ajustando ubicación y orientación; luego se asignan a un circuito eléctrico para generar cálculos y documentación adecuados.	42	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.478	https://vimeo.com/1073634679	after
otop_hrwj97cm5xlyrhyda943	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1918	Eléctrica / Interruptores	Los interruptores permiten controlar la energía en circuitos eléctricos (por ejemplo, encendido y apagado de luminarias). El “ID de interruptor” es un identificador único que facilita su seguimiento y control dentro del modelo y la documentación.	43	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.479	https://vimeo.com/1073634566	after
otop_7jwoa20xsx54nvs7jss2	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1920	Eléctrica / Sistema de iluminación	Los sistemas de iluminación permiten identificar cada luminaria con un interruptor.	44	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.479	https://vimeo.com/1073635903	after
otop_budfl5qfrcozcg2bya8j	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1922	Eléctrica / Aparatos eléctricos	Los aparatos eléctricos (tomacorrientes) se insertan en el modelo, se configuran con sus propiedades y se asignan a circuitos, lo que permite el cálculo de cargas y la elaboración de la documentación correspondiente.	45	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.48	https://vimeo.com/1073635811	after
otop_62rxv29wik1gqh3zg3q4	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1924	Eléctrica / Circuitos eléctricos	Los circuitos eléctricos conectan equipos y cargas a paneles o tableros, permiten definir valores de tensión y protecciones, y posibilitan cálculos de carga y documentación automática.	46	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.481	https://vimeo.com/1073635687	after
otop_zjiurofvv4qiznozx9yq	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1926	Eléctrica / Cables	La herramienta para generar cables permite representar gráficamente las conexiones físicas entre componentes eléctricos, asignar estilos y tamaños de conductores.	47	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.482	https://vimeo.com/1073635575	after
otop_kxbryngbvyfrbphol9i2	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1928	Eléctrica / Navegador de sistemas	El navegador de sistemas organiza y muestra una vista jerárquica de los sistemas MEP (mecánicos, eléctricos y de plomería), permitiendo inspeccionar, seleccionar y modificar elementos fácilmente	48	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.483	https://vimeo.com/1073635462	after
otop_ah9llvt76bry62oas1mt	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1930	Eléctrica / Bandejas	Las bandejas de cables en Revit se utilizan para trazar y organizar el cableado eléctrico, definiendo trayectorias, tamaños y materiales, facilitando la coordinación con otras disciplinas y la documentación del proyecto.	49	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.483	https://vimeo.com/1073636866	after
otop_t2bnxcje1gxx5b83yrkv	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1932	Eléctrica / Tubos	Los tubos se utilizan para representar tuberías o conductos, definiendo trayectorias, dimensiones y materiales. Esto facilita la coordinación con otras disciplinas y la generación de planos y detalles constructivos de manera eficiente.	50	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.484	https://vimeo.com/1073636717	after
otop_2hmjeqngnu8pirtn4vbt	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1936	Eléctrica / Anotativos	Cotas, niveles, textos y etiquetas en diferentes categorías se utilizan para documentar el diseño, indicando dimensiones, elevaciones, descripciones y propiedades de los sistemas.	52	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.486	https://vimeo.com/1073636358	after
otop_m5snw69eax2mzkeq91uj	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1938	Eléctrica / Tabla de cantidades - Práctica 1	Tabla de datos que permite metrar diferentes categorías. Práctica con bandejas y uniones de bandejas.	53	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.487	https://vimeo.com/1073636149	after
otop_e7gcmc4c2yx1d75mcon1	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1940	Eléctrica / Tabla de cantidades - Práctica 2	Tabla de datos que permite metrar diferentes categorías. Práctica con luminarias.	54	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.488	https://vimeo.com/1073636030	after
otop_flswb05vuzenk4d5pw85	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1942	Herramientas / Limpiar elementos no utilizados	Borrar elementos cargados al modelo y que no utilizaremos, para que no generen peso extra en el archivo.	55	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.489	https://vimeo.com/1073633701	after
otop_4l85hwckgutxwjvejcvz	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1944	Herramientas / Transferir normas de proyecto	La herramienta "Transferir normas de proyecto" en permite copiar configuraciones estándar (estilos de vistas, familias, patrones, materiales, etc.) de un proyecto a otro, facilitando la consistencia y ahorro de tiempo en proyectos similares.	56	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.49	https://vimeo.com/1073633608	after
otop_1x122wzuxtwbt9dd0729	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1946	Herramientas / Vistas de diseño	La "vista de diseño" se utiliza para diagramas conceptuales y detalles constructivos.	57	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.49	https://vimeo.com/1073633535	after
otop_7pgggcxv7wuv335ik900	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1948	Herramientas / Planos	La diagramación de "Planos" consiste en organizar y configurar vistas, cotas, anotaciones y detalles en hojas, para generar la documentación del proyecto de manera ordenada y precisa.	58	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.491	https://vimeo.com/1073633349	after
otop_lmif4w0wjnqozxnikym7	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1950	Herramientas / Exportar PDF	Exportar planos y vistas a PDF en permite generar archivos en formato PDF de las hojas, vistas o planos seleccionados, facilitando su distribución e impresión.	59	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.492	https://vimeo.com/1073633204	after
otop_76qmyypwnqf5j05hvcmx	org_y0txnlv69l6vp70ey06b	oles_n7ssucgv9ts4vk4uz9oh	topic:1952	Herramientas / Imprimir	Las opciones para imprimir incluyen la selección de impresoras, configuraciones de escala, calidad, márgenes y formato, permitiendo personalizar la impresión de planos y vistas según las necesidades del proyecto.	60	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.493	https://vimeo.com/1073633147	after
otop_aovnapxlyiwaxj8aqjs8	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1653	Introducción a Revit	En el video se presentará una introducción a Revit, explicando sus conceptos básicos, herramientas principales y su aplicación en proyectos de diseño y construcción	0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.493	https://vimeo.com/1071902473	after
otop_s8soej25ytojnp7k0iyj	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1655	Introducción a Revit Estructura	En este curso nos centraremos en el modelado y la gestión de la información relacionada con los soportes de las construcciones.	1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.495	https://vimeo.com/1071902139	after
otop_owqwle0sr18rn20a3bi6	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1657	Plantillas, RTE	Las "plantillas" de inicio en Revit son archivos preconfigurados que incluyen ajustes, familias y configuraciones base, usadas para comenzar proyectos con estándares definido para cualquier disciplina. Formato de archivo RTE	2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.495	https://vimeo.com/1071901724	after
otop_6sj76dcvl8lky6zf55fw	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1659	Disciplinas	Las disciplinas organizan el modelo en categorías específicas como arquitectura, estructura o MEP, controlando la visibilidad y configuración según el enfoque profesional	3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.496	https://vimeo.com/1071901240	after
otop_wedu4dtafd64r2oqfs29	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1661	Vincular Revit	Los vínculos permiten insertar y coordinar modelos externos en un proyecto, facilitando el trabajo colaborativo y la gestión de múltiples archivos de modelo	4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.497	https://vimeo.com/1071899937	after
otop_5r1zkp6f4rtvncklo71i	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1663	Vínculos - Visibilidad	La edición de visibilidad de vínculos permite controlar cómo se muestran los modelos vinculados, ajustando su visibilidad, gráficos y configuración en la vista actual del proyecto	5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.498	https://vimeo.com/1071899251	after
otop_aknupvk1wii98x8qhz13	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1665	Importar CAD	Importar un archivo de AutoCAD en Revit permite usar dibujos 2D o modelos 3D como referencia o base para desarrollar el proyecto en Revit.	6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.499	https://vimeo.com/1071898639	after
otop_41rbxe26jo8puhtrv4sw	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1667	Importar CAD - Configuración	Configuración y edición de dibujo importado de AutoCAD.	7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.5	https://vimeo.com/1071903891	after
otop_pttrzws5m6flai78apw4	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1669	Niveles	Crear nuevos niveles en Revit establece planos de referencia horizontales en el proyecto, útiles para organizar pisos, techos o alturas específicas en el diseño arquitectónico.	8	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.501	https://vimeo.com/1071903317	after
otop_3cws9fah8xtvyze9849x	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1671	Crear Vistas	Crear vistas específicas para cada nivel del proyecto. Nuevas vistas de planta y de techos.	9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.502	https://vimeo.com/1071903022	after
otop_1irllk1cszzjf5kkbyyw	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1673	Vistas Estructura	Crear vistas estructurales partiendo desde la plantilla "estructural" que Revit nos brinda.	10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.502	https://vimeo.com/1071915467	after
otop_1uzkdrim0jjtryd8w601	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1676	Propiedades de vista	Propiedades de vista. Estas propiedades afectan únicamente a la vista a la cual se le aplican. "Escala", "Nivel de detalle", "Estilo visual", "Sol" y "Sombras".	11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.503	https://vimeo.com/1071915186	after
otop_x5ga4m2tmj7ry7ycxu9q	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1678	Recortar vista	Crear recortes en una vista permite delimitar el área visible de un plano o sección, enfocando el diseño en una zona específica y ocultando el resto para mayor claridad.	12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.504	https://vimeo.com/1071915015	after
otop_pbq269mxuerrs0vm9jyr	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1682	Aislar - Ocultar elementos	"Aislar" u "ocultar" elementos o categorías en Revit permite mostrar sólo ciertos componentes o tipos de objetos en una vista, facilitando el enfoque en partes específicas del modelo. Revisaremos la opción de "Mostrar elementos ocultos".	14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.506	https://vimeo.com/1071914662	after
otop_5e0pufmqxwk9lb6szqjf	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1684	Copiar / Supervisar	La herramienta "Copiar/Supervisar" permite copiar elementos entre modelos vinculados y monitorear cambios, asegurando la coordinación entre disciplina.	15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.507	https://vimeo.com/1071914526	after
otop_i0beuh3xdu2p4e0p820h	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1686	Organización del "Navegador de proyectos"	La organización del navegador de proyecto en Revit permite personalizar la forma de visualizar y clasificar elementos como vistas, planos y familias, mejorando la gestión y el acceso al contenido del proyecto.	16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.508	https://vimeo.com/1071930177	after
otop_nc0brb4kmj3dtwk2jkpf	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1688	Rango de vista	El rango de vista define la profundidad y altura de la visualización en una vista de plano, controlando qué elementos son visibles en función de su ubicación vertical dentro de un rango específico.	17	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.508	https://vimeo.com/1071914246	after
otop_52gvz3kqrjapw9es0yhn	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1690	Sección	Una sección es una vista cortada verticalmente del modelo que permite ver el interior de un edificio, mostrando detalles de su estructura, distribución y elementos a través de un plano específico.	18	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.509	https://vimeo.com/1071914054	after
otop_vvybrlkych8n3ixlbkm7	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1692	Alzado	Las vistas de alzado en Revit son representaciones verticales del modelo, mostrando las fachadas del edificio desde diferentes direcciones, útiles para detallar la apariencia exterior.	19	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.51	https://vimeo.com/1071913520	after
otop_cf7e1osrwc727y7vcoc8	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1694	Rejillas	Las Rejillas definen la ubicación y alineación de ejes estructurales, sirviendo de guía para la colocación de pilares, muros y otros elementos. Factores a tener en cuenta abarcan su espaciado, la nomenclatura, la visibilidad y la interacción con el modelo.	20	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.511	https://vimeo.com/1071913421	after
otop_nutid8ae2qdf6s6s0sok	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1696	Pilares Estructurales	Son elementos estructurales que soportan cargas y se adaptan al diseño. Permiten configurar dimensiones y materiales, se coordinan con otros componentes en el modelo y se actualizan automáticamente ante cambios, facilitando la documentación y la precisión del proyecto.	21	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.512	https://vimeo.com/1071913208	after
otop_gyduop3t6pkq94bhocqe	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1698	Pilares Estructurales - Cargar familias	Cargamos familias de Pilares estructurales y creamos variantes de tipo.	22	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.513	https://vimeo.com/1071913054	after
otop_yhgqvw89nav4la224gqg	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1700	Vigas	Las vigas en Revit son elementos estructurales que se colocan de forma horizontal para soportar y transmitir cargas hacia los pilares u otros apoyos, permitiendo definir dimensiones, materiales y coordinación automática con el modelo.	23	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.513	https://vimeo.com/1071912850	after
otop_egp4c82qk6cawt7gm2gi	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1702	Vigas - Cargar familias	Cargamos familias de Vigas y creamos variantes de tipo.	24	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.514	https://vimeo.com/1071912722	after
otop_fqybtfm21ha0ftp0wszc	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1704	Suelos estructurales	Los suelos estructurales son las mayormente conocidas losas estructurales, permiten definir espesores y materiales, y se coordinan automáticamente dentro del modelo.	25	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.515	https://vimeo.com/1071912495	after
otop_hm15983qg5xpw2mfs6cq	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1707	Muros estructurales	Los muros estructurales soportan y transfieren cargas, con posibilidades de definir materiales y espesores, permitiendo coordinación y ajuste automático en el modelo.	26	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.516	https://vimeo.com/1071912323	after
otop_sdmj2e5h4x6nk89f2m0a	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1709	Viga de celosía	Las vigas de celosía (o cerchas) son estructuras formadas por barras interconectadas que transmiten cargas de manera eficiente. Algunos parámetros importantes incluyen, dimensiones, perfiles, materiales y conexión.	27	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.517	https://vimeo.com/1071913665	after
otop_ie8f0jhjd5v9k4lghca2	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1711	Tornapunta	Las tornapuntas son elementos estructurales que se emplean para dar estabilidad adicional a vigas o muros, brindando rigidez y soporte contra fuerzas oblicuas. Algunos parámetros importantes incluyen la ubicación, el ángulo de inclinación, la sección transversal y el tipo de conexión.	28	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.517	https://vimeo.com/1071909529	after
otop_f0bv0x0dbad8ky3kp7y5	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1715	Cimentación Aislada	Las cimentaciones aisladas (o zapatas) son elementos que transmiten las cargas de la estructura al terreno de forma puntual. Algunos parámetros importantes incluyen la geometría, el refuerzo, el material y la profundidad de la base.	30	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.518	https://vimeo.com/1071918863	after
otop_8maxmp7q2zkf8dtystth	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1717	Cimentación Muro	Las cimentaciones tipo muro son zapatas lineales que soportan muros estructurales y reparten las cargas de forma continua. Entre los factores principales se contemplan la geometría, el material, el refuerzo y las condiciones de apoyo.	31	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.519	https://vimeo.com/1071918715	after
otop_iqi4f1j3l0qkjstfd025	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1719	Cimentación Losa	La cimentación losa es un tipo de base que cubre toda el área de la estructura, distribuyendo las cargas de manera uniforme. Entre los detalles fundamentales se contemplan la geometría, el espesor, el refuerzo y la calidad del suelo.	32	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.52	https://vimeo.com/1071918426	after
otop_y8y6005dax6rbg5g2vut	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1721	Recubrimientos	El recubrimiento en Revit define la distancia mínima entre el refuerzo y la superficie de los elementos, garantizando la protección del acero y la integridad estructural. Entre los aspectos clave se contemplan el espesor a cubrir, la normativa aplicable, las condiciones del entorno y el tipo de elemento.	33	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.521	https://vimeo.com/1071918257	after
otop_xmf8wia8q4nrt0sdgekm	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1763	Limpiar elementos no utilizados	Borrar elementos cargados al modelo y que no utilizaremos, para que no generen peso extra en el archivo.	54	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.538	https://vimeo.com/1071922533	after
otop_682wgmiu1pu92t3u4fgp	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1723	Formas de armaduras	Las “formas de armaduras” en Revit son librerías paramétricas que definen la geometría y el doblado de las barras de refuerzo. Factores esenciales incluyen el diámetro de la varilla, la longitud de doblez, el anclaje y la configuración de ganchos.	34	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.522	https://vimeo.com/1071917967	after
otop_kcg3cyn35taynizpg814	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1725	Métodos de inserción de armaduras	Estudiaremos los métodos de inserción, en donde tomaremos conciencia del plano de trabajo, la orientación de las barras, así como su distribución dentro el elemento estructural.	35	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.523	https://vimeo.com/1071917728	after
otop_645j10r62nfncja4wem7	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1727	Armaduras en pilares	La creación de armaduras en pilares en Revit refuerza la capacidad estructural y resistencia ante cargas verticales o laterales. Puntos clave incluyen la selección de barras longitudinales, estribos, recubrimiento y diámetros de refuerzo.	36	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.524	https://vimeo.com/1071917481	after
otop_nlcbzmve0mwp07d4qond	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1729	Armaduras en vigas	La creación de armaduras en vigas en Revit fortalece la estructura frente a esfuerzos de flexión y corte. Aspectos cruciales contemplan la posición de las barras longitudinales, la disposición de estribos, el recubrimiento y la selección del diámetro de refuerzo.	37	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.525	https://vimeo.com/1071917028	after
otop_m3angypzd37zp3g9mwur	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1731	Armaduras en cimentaciones	La creación de armaduras en cimentaciones en Revit refuerza la base estructural y mejora la transferencia de cargas. Factores determinantes abarcan la distribución de barras, la configuración de recubrimiento, el diámetro del refuerzo y las especificaciones normativas.	38	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.525	https://vimeo.com/1071916752	after
otop_1ixtpvc31kv1iihg7kuy	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1733	Armaduras en losas	La creación de armaduras en losas refuerza la placa estructural y mejora la transferencia de cargas. Factores clave contemplan la disposición de las barras, el diámetro del refuerzo, el recubrimiento y las especificaciones normativas.	39	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.526	https://vimeo.com/1071941059	after
otop_187i0cb3tgyvhem6dbz4	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1735	Conexiones	La “conexión”enlaza elementos estructurales con precisión, facilitando la configuración de placas, pernos o soldaduras. Factores esenciales abarcan el tipo de unión, la rigidez, los materiales y el cumplimiento normativo.	40	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.527	https://vimeo.com/1071921758	after
otop_cybahof7r9f4ncjimh11	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1737	Elementos de fabricación	Las herramientas del panel “elementos de fabricación” en Revit facilitan la creación y edición de componentes prefabricados y sistemas constructivos. Trabajaremos con Pletina, Tornillos y Soldaduras.	41	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.528	https://vimeo.com/1071920562	after
otop_2ljxc6l3jve71zhuieo0	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1739	Modificadores	El panel “Modificadores” de estructura en Revit ofrece herramientas para ajustar la geometría de los elementos: corte de esquina, cajeado inclinado, acortar y corte de contorno. Aspectos relevantes abarcan la posición del recorte, el ángulo de inclinación, la longitud deseada y la forma final del perfil.	42	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.529	https://vimeo.com/1071920387	after
otop_8llxt06hoxacjxz62jqb	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1741	Cortes paramétricos	El panel “Cortes paramétricos” de estructura en Revit (cajeado, inglete, corte a través, corte por) define recortes precisos en la geometría de los elementos. Factores determinantes contemplan la profundidad, el ángulo, la ubicación y la configuración paramétrica.	43	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.529	https://vimeo.com/1071920185	after
otop_hs0ls5onk9ozvnmb47b8	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1743	Líneas de modelo	Las líneas de modelo en Revit son líneas 3D permanentes en el proyecto, visibles en todas las vistas, que ayudan a definir geometrías y guiar el diseño.	44	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.53	https://vimeo.com/1071920035	after
otop_f7xs5g8q938wddpvwofc	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1745	Estilo de líneas	El estilo de línea define la apariencia de las líneas en el proyecto, incluyendo "grosor", color y "Patrón" (continuas, discontinuas, etc.), para mejorar la claridad y presentación en las vistas.	45	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.531	https://vimeo.com/1071921181	after
otop_gccyf12i3pqe0mntg65j	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1747	Grupos de modelo	Un grupo de modelo es un conjunto de elementos del modelo que se agrupan para ser copiados, movidos o editados conjuntamente, facilitando la gestión y replicación de partes del diseño.	46	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.532	https://vimeo.com/1071920989	after
otop_4ff66brojawii29nf2f7	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1749	Líneas de detalle	Las líneas de detalle son elementos 2D utilizados para agregar información gráfica en vistas específicas, como planos o secciones, sin afectar el modelo 3D.	47	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.532	https://vimeo.com/1071920872	after
otop_qntykoyw3lu8xvya117d	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1751	Vistas de diseño	La "vista de diseño" se utiliza para diagramas conceptuales y detalles constructivos.	48	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.533	https://vimeo.com/1071920784	after
otop_2f2mnwxvagd6h58rne0m	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1753	Cotas - Alineada	La cota "alineada" mide y anota distancias entre elementos en líneas rectas, alineadas con su orientación. Estudiaremos la variante de conta acumulada.	49	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.534	https://vimeo.com/1071923742	after
otop_5q3k9pnplzcraui1mbzt	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1755	Cota - Elevación - Pendiente	En este capítulo estudiaremos las cotas de elevación y las cotas para pendientes, identificando sus variantes de tipo.	50	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.535	https://vimeo.com/1071923496	after
otop_1r5n2tmwt3gqdx4xptfz	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1757	Textos	La herramienta "Texto" permite agregar anotaciones y descripciones escritas en las vistas del modelo o planos.	51	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.535	https://vimeo.com/1071923378	after
otop_ivka2338czkphgip8b3t	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1759	Etiquetas	Las "etiquetas" son anotaciones dinámicas que identifican y muestran propiedades de los elementos del modelo.	52	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.536	https://vimeo.com/1071923181	after
otop_p50vbwad4uaqmj4er0bg	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1761	Tablas de planificación / cantidades	La “tabla de planificación/cantidades” en Revit organiza y muestra información de los elementos del modelo. Puntos clave contemplan la selección de campos, la aplicación de filtros y suma de valores.	53	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.537	https://vimeo.com/1071922677	after
otop_d2qfgvxmwnvf70hlncte	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1765	Transferir normas de proyecto	La herramienta "Transferir normas de proyecto" en permite copiar configuraciones estándar (estilos de vistas, familias, patrones, materiales, etc.) de un proyecto a otro, facilitando la consistencia y ahorro de tiempo en proyectos similares.	55	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.539	https://vimeo.com/1071922404	after
otop_0fwd7ywbvm6dhhzlaaow	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1767	Planos	La diagramación de "Planos" consiste en organizar y configurar vistas, cotas, anotaciones y detalles en hojas, para generar la documentación del proyecto de manera ordenada y precisa.	56	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.54	https://vimeo.com/1071922206	after
otop_03d403imuyxky4a800pv	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1769	Exportar PDF	Exportar planos y vistas a PDF en permite generar archivos en formato PDF de las hojas, vistas o planos seleccionados, facilitando su distribución e impresión.	57	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.54	https://vimeo.com/1071922047	after
otop_lxtebdmtaa0caem7afyf	org_y0txnlv69l6vp70ey06b	oles_zy97t4w9v6bptv2glzeu	topic:1771	Imprimir	Las opciones para imprimir incluyen la selección de impresoras, configuraciones de escala, calidad, márgenes y formato, permitiendo personalizar la impresión de planos y vistas según las necesidades del proyecto.	58	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.541	https://vimeo.com/1071921970	after
otop_lpmsp8fflvqrv8f36wyi	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1609	RB01 - Introducción a Revit	En el video se presentará una introducción a Revit, explicando sus conceptos básicos, herramientas principales y su aplicación en proyectos de diseño y construcción	0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.542	https://vimeo.com/1071180747	after
otop_a6ff0lhb7mao29hx7zq5	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1614	RB02- Introducción a Revit Básico	En este curso de Revit básico aprenderás los fundamentos básicos del software, desde la interfaz hasta las herramientas esenciales para iniciar un modelo	1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.543	https://vimeo.com/1071180635	after
otop_u7er38itrozml6qjptlj	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1616	RB03- Pantalla de inicio	Recorrida inicial por la pantalla de Revit.	2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.544	https://vimeo.com/1071180555	after
otop_mqqrz08n92bowqsocni5	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1618	RB04- Recorrido por el contenido	Recorrido por las cintas de herramientas y una breve descripción de las mismas	3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.544	https://vimeo.com/1071180456	after
otop_x1k9b84rx9xumqtryddn	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1620	RB05- Propiedades	El Panel de "Propiedades" en Revit muestra y permite modificar las propiedades de cualquier elemento o vista seleccionada en el modelo. Desde allí se ajustan parámetros como dimensiones, materiales, visibilidad y otras características específicas del objeto, facilitando la personalización y el control detallado del diseño	4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.545	https://vimeo.com/1071180379	after
otop_ytds5vl83t63q92fvjv5	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1622	RB06- Navegador de proyecto	El "Navegador de Proyectos" en Revit organiza y permite acceder rápidamente a todos los elementos y vistas del proyecto, como planos, secciones, familias y hojas. Facilita la navegación dentro del modelo y el control de su estructura, optimizando el flujo de trabajo y la organización del proyecto	5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.546	https://vimeo.com/1071180277	after
otop_apzby86exlwtnh125wu1	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1624	RB07- Mover / Copiar	Herramientas de la Cinta: "Mover" - "Copiar"	6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.547	https://vimeo.com/1071180162	after
otop_si98i2y8oakq30lhcdc4	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1626	RB08- Rotar	Herramientas de la Cinta - "Rotar"	7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.548	https://vimeo.com/1071180106	after
otop_c5rb7013exg3xqmmapvx	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1630	RB10- Desfase	Herramientas de la Cinta - "Desfase". Herramienta para generar copias paralelas de un objeto	9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.548	https://vimeo.com/1071179962	after
otop_n838qbvpya4vvbx5mtk7	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1632	RB11- Reflejar	Herramientas de la Cinta - "Reflejar". Herramienta para crear simetrías	10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.549	https://vimeo.com/1071179899	after
otop_ye2razsmr9jq2heebhpa	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1634	RB12- Recortar/extender a esquina	Herramientas de la Cinta (Modificar) - "Recortar/extender a esquina". Herramienta para corregir esquinas de muros y/o líneas	11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.55	https://vimeo.com/1071179817	after
otop_lzdok0doxh71d5kuilf6	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1636	RB13- Recortar extender elementos simples / varios elementos	Herramientas de la Cinta (Modificar) - "Recortar extender elementos simples / varios elementos". Herramienta para extender muros o líneas hacia un destino seleccionado	12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.551	https://vimeo.com/1071179753	after
otop_ql2xx2v37hf1pyp3dalu	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1638	RB14- Unidades	El panel de unidades permite configurar las unidades de medida del proyecto (longitud, área, volumen, ángulos, etc.), personalizando la precisión y el formato para adaptarse a las necesidades de diseño y normativas del proyecto	13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.552	https://vimeo.com/1071179641	after
otop_54e8uho70roic7tmzbij	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1640	RB15- Jerarquías	Categoría: Clasificación general (muros, ventanas). Familia: Conjunto de elementos con características comunes. Tipo: Variación dentro de una familia (dimensiones, materiales). Ejemplar: Instancia específica del tipo en el modelo	14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.553	https://vimeo.com/1071179427	after
otop_v2orbn4ajfg6txh0pavw	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1642	RB16- Formato de archivos	4 formatos nativos para archivos en Revit - RVT (revit project file) - RTE (revit template file) - RFA (revit family file) - RFT (revit family template file)	15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.553	https://vimeo.com/1071179312	after
otop_b55zb5zzzp6sne3h5chq	org_y0txnlv69l6vp70ey06b	oles_3so93sc4ca4phfci3t7h	topic:1644	RB17- Familias	Cargar familias para incorporar elementos predefinidos, como muebles, puertas o ventanas, al proyecto, ampliando las opciones de diseño y facilitando la personalización del modelo. Revisamos biblioteca de Autodesk en la nube	16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.554	https://vimeo.com/1071179224	after
otop_3kb4l0xbpfkvy2prxjx3	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1373	RA01- Introducción a Revit	Herramientas principales y su aplicación en proyectos de diseño y construcción.	0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.555	https://vimeo.com/1070370669?share=copy#t=0	after
otop_hl8mxzqy6eh08yinuuk4	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1376	RA2- Introducción al curso Revit Arquitectura	Modelar y documentar proyectos arquitectónicos de manera eficiente y profesional.	1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.556	https://vimeo.com/1070394103	after
otop_2xmu807biw9lh3l1s3ge	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1427	RA03- Muros / Línea de ubicaciòn	Utilizamos la propiedad ""línea de ubicación"" para un mayor control del modelado".	2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.557	https://vimeo.com/1070393980	after
otop_h5116k021547c53epvsw	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1429	RA04- Muros / Altura	Altura del muro a través de las propiedades "Restricción de base".	3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.558	https://vimeo.com/1070393880	after
otop_kmez0pojx7b4amj12f7a	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1432	RA05- Muros / Cotas temporales	Las cotas temporales son medidas temporales que aparecen automáticamente al seleccionar elementos.	4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.559	https://vimeo.com/1070393785	after
otop_fhzah1qm0uuhyj9xb941	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1434	RA06- Muros / Capas	Los muros con capas en Revit son muros compuestos por varias capas de materiales (como acabado estructura aislamiento) cada una con un espesor y función específicos. Estas capas permiten un diseño preciso y detallado del muro tanto en aspecto como en propiedades térmicas y estructurales.	5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.56	https://vimeo.com/1070393564	after
otop_4xi3toyd8zoiquy0jb52	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1436	RA07- Muro Apilado	Los "Muros Apilados" en Revit son combinaciones de varios tipos de muros colocados uno sobre otro en una sola entidad. Permiten crear muros complejos con distintas secciones y acabados ideales para diseños con bases o coronamientos diferentes en un mismo muro.	6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.56	https://vimeo.com/1070393474	after
otop_owhj55og7dtz6qosegds	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1438	RA08- Muro Barrido	"Barrido" crea perfiles extruidos a lo largo de un recorrido (como molduras o guardas en muros).	7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.561	https://vimeo.com/1070393326	after
otop_bqxhrnfnuy3sdhmv5tmq	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1440	RA09- Muros inclinados y trapezoidales	La propiedad de muros inclinados permite ajustar el ángulo de inclinación de un muro mientras que la propiedad de muros trapezoidales configura anchuras diferentes en la base y la parte superior creando una forma trapezoidal.	8	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.562	https://vimeo.com/1070393220	after
otop_bv5j72ewalkqt51xfzoz	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1442	RA10- Muro / Edición de perfil	La edición del perfil de muro permite modificar su contorno ajustando la altura y forma para adaptarse al diseño elementos decorativos o necesidades arquitectónicas específicas.	9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.563	https://vimeo.com/1070404546	after
otop_8mouw310n2advz7vfpn5	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1444	RA11- Puertas	Las "Puertas" se colocan seleccionando un tipo de familia de puerta y ubicándola en un muro del modelo. Su edición permite ajustar dimensiones, materiales y orientación, además de personalizar parámetros específicos según el diseño, integrándose automáticamente con el muro donde se instalan.	10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.564	https://vimeo.com/1071146944	after
otop_fttd0k2aun8dobaqayn6	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1446	RA12- Ventanas	Las "Ventanas" se colocan seleccionando un tipo de familia de ventana y ubicándola en un muro. Luego, se pueden editar ajustando dimensiones, materiales, tipo de marco y otros parámetros específicos, adaptándolas al diseño y estilo del proyecto	11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.564	https://vimeo.com/1070404444	after
otop_0ov1dsh0o4q33x81vutu	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1448	RA13- Suelos / Suelo Arquitectónico	Los "suelos arquitectónicos" son elementos que definen superficies horizontales, como pisos y losas. Se crean usando el "boceto", donde puedes dibujar el contorno del mismo.	12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.565	https://vimeo.com/1070404328	after
otop_boslate8gl0k9csf1z7y	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1450	RA14- Suelos / Suelo con capas	La edición de tipo de suelos permite ajustar propiedades generales del suelo, como su estructura en capas, espesor, materiales, y características térmicas. Esto se realiza en el cuadro de propiedades "Editar Tipo", y afecta a todos los suelos del mismo tipo en el proyecto.	13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.566	https://vimeo.com/1070404219	after
otop_t8wgquv8t9l2ubu6o9qa	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1452	RA15- Suelos Estructurales	La edición de tipo de suelos permite ajustar propiedades generales del suelo, como su estructura en capas, espesor, materiales, y características térmicas. Esto se realiza en el cuadro de propiedades "Editar Tipo", y afecta a todos los suelos del mismo tipo en el proyecto.	14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.567	https://vimeo.com/1070404059	after
otop_8c0j4p7c184luaxfm8ca	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1454	RA16- Suelos / Edición de forma	La herramienta de edición de forma de suelos permite modificar la topografía de un suelo existente agregando puntos, pendientes y elevaciones personalizadas, útil para crear inclinaciones o superficies irregulares en pisos y losas.	15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.567	https://vimeo.com/1070403954	after
otop_pjubxd686erldcr8iplh	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1456	RA17- Suelos / Enlazar muros	La herramienta "Enlazar Parte Superior" de muros en Revit ajusta automáticamente la altura del muro para que siga la forma de un elemento superior, como un techo, cubierta o suelo, adaptándose a inclinaciones o geometrías complejas.	16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.568	https://vimeo.com/1070403834	after
otop_j9t2qxjb6eihjocnrr3n	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1458	RA18- Techos	La herramienta "Techos" (falso techo, cielorraso) permite crear superficies horizontales o inclinadas que definen la estructura del techo. Se pueden diseñar mediante boceto o automática, personalizando, materiales y capas.	17	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.569	https://vimeo.com/1070403760	after
otop_sn8tgydi36a7jloc25tj	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1460	RA19- Cubierta / Por perímetro	Esta herramienta genera cubiertas que siguen el perímetro, con ajustes de pendiente y altura según el diseño deseado.	18	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.57	https://vimeo.com/1070403591	after
otop_pg219uo1t7gihe4uy7zl	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1463	RA20- Cubierta / Flecha de pendiente	Define la inclinación de una cubierta dibujando una flecha en la dirección de la pendiente deseada, controlando su altura inicial y final para ajustar el ángulo de la superficie.	19	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.571	https://vimeo.com/1070428628	after
otop_n9sq1tw89cyarakunv6x	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1465	RA21- Cubierta / Por extrusión	Crea cubiertas con perfiles personalizados al dibujar una sección transversal que se extruye a lo largo de un eje, ideal para techos curvos o de formas complejas.	20	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.571	https://vimeo.com/1070428551	after
otop_stgx7cnr81lumlnshvet	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1508	RA42- Crear Vistas	Crear vistas específicas para cada nivel del proyecto. Nuevas vistas de planta y de techos.	41	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.588	https://vimeo.com/1070437874	after
otop_5bgjlgj451n7e1jo596c	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1467	RA22- Cubierta - imposta, Cielo Raso, Canalón	En el video aprenderemos a colocar impostas, cielos rasos y canalones en cubiertas en Revit, mostrando cómo definir estos elementos para mejorar el diseño y la funcionalidad de las cubiertas en un proyecto arquitectónico.	21	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.572	https://vimeo.com/1070428424	after
otop_f1imyxf9vw39c2yy1vj4	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1469	RA23- Huecos	Los huecos "por cara","agujero","muro","vertical" son aberturas creadas en elementos como muros, suelos o techos para puertas, ventanas, escaleras, o simplemente para generar vacíos en el modelo.	22	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.573	https://vimeo.com/1070428282	after
otop_nhcxy2fwrzxskjlito31	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1471	RA24- Componentes	Son elementos individuales, como muebles, equipos y accesorios, que se colocan en el modelo para detallar y complementar el diseño arquitectónico.	23	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.574	https://vimeo.com/1070428203	after
otop_9fnqizqsqd95rv7bbs8q	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1473	RA25- Componentes / Modelado in situ	Son elementos creados directamente en el proyecto, sin usar familias predefinidas. Se diseñan y modelan en el contexto del proyecto, permitiendo formas personalizadas y detalles específicos.	24	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.575	https://vimeo.com/1070428085	after
otop_fw05qopeounsdcw7v72f	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1475	RA26- Escalera / Tramos rectos	Las escaleras de tramos rectos consisten en varios tramos lineales conectados por descansos, permitiendo cambios de dirección entre niveles en un diseño escalonado.	25	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.576	https://vimeo.com/1070427967	after
otop_sspl3ybcop2wenr35om3	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1478	RA27- Escalera / Tramos curvos	Las escaleras de tramos curvos son escaleras que siguen una trayectoria circular o en arco, proporcionando una transición fluida entre niveles.	26	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.577	https://vimeo.com/1070427820	after
otop_tx6ednx25tc8ycw5vhnf	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1480	RA28- Escalera - Compensados en L y U	las escaleras "compensado en L" y "compensado en U" sin descansos son tramos que cambian de dirección en ángulo (90° o 180° respectivamente), utilizando peldaños triangulares o trapezoidales para una transición continua sin plataformas.	27	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.577	https://vimeo.com/1070427731	after
otop_gtmjsd7zduqc5x14w6ys	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1482	RA29- Escalera / Edición de boceto	La edición de boceto para escaleras en permite definir la forma y recorrido de la escalera mediante líneas y arcos, personalizando tramos, giros, y configurando detalles como el ancho y número de peldaños.	28	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.578	https://vimeo.com/1070427641	after
otop_2dtuungu279xmd7r7aq7	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1484	RA30- Escalera / Tipos de escaleras	La edición de tipo de escaleras permite modificar la huella, la contrahuella y los soportes, ajustando dimensiones y estilo de estos elementos para un diseño más detallado y personalizado.	29	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.579	https://vimeo.com/1070433791	after
otop_yer2ibihne8va5l03du6	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1486	RA31- Escalera / Multiplantas	La herramienta "Multiplantas" para escaleras permite crear escaleras que se replican automáticamente en varios niveles del edificio, conectando pisos de forma continua y simplificando su modelado en proyectos de varias plantas.	30	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.58	https://vimeo.com/1070433731	after
otop_r3mw64ypqtcjlugvm8ye	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1488	RA32- Rampas	Las rampas son elementos inclinados utilizados para conectar diferentes niveles, configurables en términos de pendiente, ancho y material, adaptándose a accesos y normativas de accesibilidad.	31	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.58	https://vimeo.com/1070433602	after
otop_lhdt2ldjns1k5josp0pd	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1490	RA33- Barandillas / Colocación	Colocación de barandillas en superficies planas, así como en escaleras y rampas existentes.	32	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.581	https://vimeo.com/1070433465	after
otop_o15cwc7hs3ior970nkaf	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1492	RA34- Barandillas / Edición	La edición de tipo de barandillas permite ajustar propiedades como el material, la altura, el estilo de los postes y las barras, así como la configuración de los elementos decorativos o funcionales.	33	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.582	https://vimeo.com/1070433334	after
otop_ra6608lq4gf8gft8bzdh	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1494	RA35- Pilares Arquitectónicos	Los pilares arquitectónicos son elementos verticales utilizados para fines estéticos o de diseño, sin función estructural. Se colocan en el modelo para definir el estilo y la organización espacial del proyecto.	34	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.583	https://vimeo.com/1070433277	after
otop_to79wssp7vx8rvhu9co4	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1496	RA36- Muros cortina / Edición de tipo	La edición de tipo de muro cortina permite configurar el sistema de paneles, montantes, rejillas y materiales, personalizando su apariencia y estructura para adaptarse a requisitos estéticos y funcionales del proyecto.	35	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.584	https://vimeo.com/1070433128	after
otop_csfxh4x12jtefh7dic3c	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1498	RA37- Muros cortina / Rejillas	Las rejillas para muro cortina en Revit definen el marco estructural del sistema, dividiendo el muro en secciones para colocar paneles o vidrio y alineando los montantes verticales y horizontales.	36	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.584	https://vimeo.com/1070433047	after
otop_hby9qxuv8v9onw60hydj	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1500	RA38- Muros cortina / Montantes	Los montantes de muro cortina en Revit son perfiles estructurales que se colocan en las rejillas del muro cortina, proporcionando soporte y dividiendo los paneles o vidrios, además de definir el estilo y apariencia del sistema.	37	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.585	https://vimeo.com/1070432943	after
otop_zp52skccscts5qi20n0v	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1502	RA39- Muros cortina - Paneles, puertas y ventanas	los paneles, puertas y ventanas para muro cortina se colocan en los espacios creados por las rejillas, permitiendo personalizar áreas con vidrio, materiales opacos, accesos o aperturas en el sistema de muro cortina.	38	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.586	https://vimeo.com/1070432844	after
otop_1mi7t208bgpst05knyxx	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1504	RA40- Sólido topográfico	El sólido topográfico representa el terreno en 3D, permitiendo modelar elevaciones, pendientes y elementos geográficos para coordinar con el diseño arquitectónico.	39	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.587	https://vimeo.com/1070438038	after
otop_xicoo6ws89yhsy76yd09	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1506	RA41- Niveles	Crear nuevos niveles en Revit establece planos de referencia horizontales en el proyecto, útiles para organizar pisos, techos o alturas específicas en el diseño arquitectónico.	40	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.588	https://vimeo.com/1070437939	after
otop_m6ten5nxog7xsei3dk34	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1510	RA43- Rango de vista	El rango de vista define la profundidad y altura de la visualización en una vista de plano, controlando qué elementos son visibles en función de su ubicación vertical dentro de un rango específico.	42	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.589	https://vimeo.com/1070437798	after
otop_7j01a6hxqqsxhogqi37z	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1512	RA44- Propiedades de vista	Propiedades de vista. Estas propiedades afectan únicamente a la vista a la cual se le aplican. "Escala", "Nivel de detalle", "Estilo visual", "Sol" y "Sombras".	43	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.59	https://vimeo.com/1070437674	after
otop_wdw62xabj3g03a1rxual	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1516	RA46- Vistas 3D	Herramientas para navegar a través de la vista 3D."Caja de sección", "Bloqueo de vista 3D", "Perspectiva".	45	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.591	https://vimeo.com/1070437449	after
otop_qkcbw7vtr3qeq6xu3g11	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1518	RA47- Aislar / Ocultar elementos	"Aislar" u "ocultar" elementos o categorías en Revit permite mostrar sólo ciertos componentes o tipos de objetos en una vista, facilitando el enfoque en partes específicas del modelo. Revisaremos la opción de "Mostrar elementos ocultos".	46	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.592	https://vimeo.com/1070437360	after
otop_e2aeva10wjyuqrgs5qpw	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1520	RA48- Texto modelado	El "Texto modelado" en Revit se utiliza para crear texto 3D en el modelo, generalmente para señalización o branding, integrándose como un elemento físico en el diseño arquitectónico.	47	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.593	https://vimeo.com/1070437256	after
otop_6xxbpk1qt9r6omcrw9t8	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1522	RA49- Líneas de modelo	Las líneas de modelo en Revit son líneas 3D permanentes en el proyecto, visibles en todas las vistas, que ayudan a definir geometrías y guiar el diseño.	48	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.594	https://vimeo.com/1070437184	after
otop_wwtsb66g0x8dkmb40fuf	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1524	RA50- Estilo de líneas	El estilo de línea define la apariencia de las líneas en el proyecto, incluyendo "grosor", color y "Patrón" (continuas, discontinuas, etc.), para mejorar la claridad y presentación en las vistas.	49	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.594	https://vimeo.com/1070444362	after
otop_37ceh028u9b70xzute6n	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1526	RA51- Grupos de modelo	Un grupo de modelo es un conjunto de elementos del modelo que se agrupan para ser copiados, movidos o editados conjuntamente, facilitando la gestión y replicación de partes del diseño.	50	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.595	https://vimeo.com/1070444251	after
otop_iaf2qtccd6q3zt0lqmc0	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1528	RA52- Copiar elementos de un nivel a otro	Diferentes maneras de copiar elementos entre niveles. Nos basamos en el concepto de planta tipo.	51	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.596	https://vimeo.com/1070444115	after
otop_zkbx7hbemvts275an7gt	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1530	RA53- Modificación de visibilidad / gráficos (Modelo)	La "modificación de visibilidad/gráficos" de elementos de modelo permite ajustar la apariencia de los elementos en las vistas, controlando su visibilidad, estilo, color y nivel de detalle según las necesidades del proyecto.	52	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.597	https://vimeo.com/1070443966	after
otop_5fr4uqwyvbdxmy8s9aos	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1532	RA54- Modificación de visibilidad / gráficos (Anotación)	La modificación de visibilidad/gráficos de elementos anotativos en Revit permite ajustar la visibilidad y el estilo de los elementos que combinan características gráficas y anotaciones, como etiquetas o dimensiones, en las vistas del proyecto.	53	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.598	https://vimeo.com/1070443911	after
otop_c4zoin81mtsoaw08pku4	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1534	RA55- Plantilla de vista	Una "Plantilla de vista" guarda configuraciones predefinidas de visibilidad, gráficos y otras propiedades para aplicar de manera consistente en múltiples vistas del proyecto.	54	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.599	https://vimeo.com/1070443787	after
otop_17590wru0vc6tlju8m7i	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1536	RA56- Sección	Una sección es una vista cortada verticalmente del modelo que permite ver el interior de un edificio, mostrando detalles de su estructura, distribución y elementos a través de un plano específico.	55	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.599	https://vimeo.com/1070443653	after
otop_61349p8jrfwx2iv1tm4j	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1538	RA57- Alzado	Las vistas de alzado en Revit son representaciones verticales del modelo, mostrando las fachadas del edificio desde diferentes direcciones, útiles para detallar la apariencia exterior.	56	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.6	https://vimeo.com/1070443522	after
otop_vi4qo8lrvyy4ogftw08p	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1540	RA58- Llamadas	Una llamada es una vista de detalle ampliada de una parte específica del modelo, útil para mostrar áreas complejas con mayor precisión en planos y documentos técnicos.	57	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.601	https://vimeo.com/1070443405	after
otop_7aeztxpakepjtcp0lq7f	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1542	RA59- Líneas de detalle	Las líneas de detalle son elementos 2D utilizados para agregar información gráfica en vistas específicas, como planos o secciones, sin afectar el modelo 3D.	58	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.602	https://vimeo.com/1070443340	after
otop_wam3vhcpg5u48n40n5kd	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1544	RA60- Región de máscara / Región rellenada	Una "región de máscara" es un área opaca 2D que oculta partes del modelo en una vista. Una "región rellenada" es un área 2D con un patrón de relleno o color, utilizada para destacar zonas específicas en vistas como planos o secciones, sin afectar el modelo 3D.	59	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.603	https://vimeo.com/1070451989	after
otop_oy7t3t9dgs6lz736n5cd	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1546	RA61- Componente de detalle	Un componente de detalle es una familia 2D , que se agrega a vistas específicas, como planos o secciones, para enriquecer los detalles constructivos sin modificar el modelo 3D. Estudiaremos la herramienta "componente de detalle repetido".	60	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.603	https://vimeo.com/1070451886	after
otop_53bjzd8lm66ru7eid5ah	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1548	RA62- Grupos de detalle	Un "grupo de detalle" es una colección de elementos 2D, como líneas y componentes de detalle, agrupados para replicarse o moverse juntos en vistas de detalle sin afectar el modelo 3D.	61	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.604	https://vimeo.com/1070451804	after
otop_yb3rt4bfj58wha2860lf	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1550	RA63- Leyenda / Componente de leyenda	La "Vista de leyenda" permite crear representaciones gráficas o tablas descriptivas de elementos del modelo, como materiales, componentes o símbolos, que se pueden usar en varias vistas y planos sin estar vinculadas a una vista específica del modelo.	62	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.605	https://vimeo.com/1070451670	after
otop_l28y6uptgdn6bsbvsp90	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1552	RA64- Vistas de diseño	La "vista de diseño" se utiliza para diagramas conceptuales y detalles constructivos.	63	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.605	https://vimeo.com/1070451636	after
otop_d7ymfyzi987a7tscgyxv	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1554	RA65- Textos	La herramienta "Texto" permite agregar anotaciones y descripciones escritas en las vistas del modelo o planos.	64	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.607	https://vimeo.com/1070451526	after
otop_ym6tvv1d0ox7pfu5uzc1	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1556	RA66- Cotas / Alineada	La cota "alineada" mide y anota distancias entre elementos en líneas rectas, alineadas con su orientación.	65	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.608	https://vimeo.com/1070451427	after
otop_giwlr5xjggrcvp1ovftc	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1558	RA67- Cotas / Alineada (Muros enteros)	Una variante dentro de las cotas alineadas que acelera el acotado de muros y sus elementos.	66	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.61	https://vimeo.com/1070451361	after
otop_sgyuzflao7eelv1lhyjl	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1560	RA68- Cotas / (lineal, angular, radial, diámetro, longitud de arco)	Estudiaremos el uso de las cotas "Lineal", "Angular", "Radial", "Diámetro" y "Longitud de arco".	67	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.61	https://vimeo.com/1070451283	after
otop_5hcwcm3tyijtx7gg4xop	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1563	RA69- Cotas / Tipo de cota	La edición de tipos de cotas permite personalizar su estilo, como fuente, tamaño, unidades y líneas de referencia.	68	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.611	https://vimeo.com/1070451160	after
otop_nbosl8vkqe5hxs5octmc	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1565	RA70- Cotas / (Elevación, coordenadas de putos, de pendiente)	Estudiaremos el uso de las cotas "Elevación", "Coordenadas de puntos", "Cota de pendiente".	69	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.612	https://vimeo.com/1070458082	after
otop_0vt3cxn6vspgd4qws8th	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1567	RA71- Etiquetas	Las "etiquetas" son anotaciones dinámicas que identifican y muestran propiedades de los elementos del modelo.	70	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.613	https://vimeo.com/1070457930	after
otop_owxoe4t3cbrogs9bqceq	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1569	RA72- Nuevos parámetros	Crearemos parámetros de proyecto para añadir información personalizada a los elementos del modelo para gestión y documentación.	71	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.613	https://vimeo.com/1070457816	after
otop_rw1w6xxgtz91r09u4btd	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1571	RA73- Limpiar elementos no utilizados	Borrar elementos cargados al modelo y que no utilizaremos, para que no generen peso extra en el archivo.	72	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.614	https://vimeo.com/1070457740	after
otop_astrcl554e96aymlsc7e	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1573	RA74- Transferir normas de proyecto	La herramienta "Transferir normas de proyecto" en permite copiar configuraciones estándar (estilos de vistas, familias, patrones, materiales, etc.) de un proyecto a otro, facilitando la consistencia y ahorro de tiempo en proyectos similares.	73	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.615	https://vimeo.com/1070457676	after
otop_pelhjzbe7rmwcezl9bdj	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1575	RA75- Norte real / Norte de proyecto	El "Norte de proyecto" es una orientación ajustable usada para el diseño y vistas internas. El "Norte real" refleja la orientación geográfica exacta para análisis solares o ubicación precisa del proyecto.	74	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.616	https://vimeo.com/1070457602	after
otop_fekeowdue93u7rmpwa94	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1577	RA76- Habitaciones	Las Habitaciones son volúmenes definidos dentro de un espacio cerrado que permiten cuantificar áreas, calcular volúmenes y asignar datos para planificación, análisis y documentación.	75	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.616	https://vimeo.com/1070457457	after
otop_h8t40rcfa56te1s8i9d1	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1579	RA77- Tablas de planificación / cantidades	Las tablas de planificación y cantidades permiten organizar y mostrar datos de los elementos del modelo, como dimensiones, materiales y cantidades, facilitando el control y la gestión del proyecto.	76	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.617	https://vimeo.com/1070457360	after
otop_z1xlfa8qn5k4rhcvhbbw	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1581	RA78- Tablas de planificación / cantidades, Recuento	Ejemplo de tabla, utilizando el parámentro "Recuento".	77	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.618	https://vimeo.com/1070457217	after
otop_g69qnufpd9rq7zqrsa41	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1583	RA79- Tablas de planificación / cantidades , Valor calculado	Ejemplo de tabla, utilizando la herramienta de "Valor calculado".	78	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.619	https://vimeo.com/1070457118	after
otop_djk3mfjvixwe181yvilt	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1585	RA80- Cámaras	Las cámaras en Revit son vistas en perspectiva 3D que simulan la posición de una cámara para visualizar y renderizar espacios del modelo arquitectónico.	79	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.62	https://vimeo.com/1070462766	after
otop_ug6vthv8d25qzc6uzimt	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1587	RA81- Render	Generar imágenes con mayo calidad del modelo 3D utilizando luces, materiales y configuraciones de cámara para simular el diseño final.	80	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.621	https://vimeo.com/1070462684	after
otop_y3t5usmn98olhhf07lqk	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1589	RA82- Vincular Revit	Los vínculos permiten insertar y coordinar modelos externos en un proyecto, facilitando el trabajo colaborativo y la gestión de múltiples archivos de modelo.	81	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.622	https://vimeo.com/1070462598	after
otop_lb653b01bd176wba894v	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1591	RA83- Importar CAD	Importar un archivo de AutoCAD en Revit permite usar dibujos 2D o modelos 3D como referencia o base para desarrollar el proyecto en Revit.	82	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.622	https://vimeo.com/1070462520	after
otop_iw1nw2l7ipca9ohbwk7e	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1593	RA84- Importar CAD / Configuración	Configuración y edicion de dibujo importado de AutoCAD.	83	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.623	https://vimeo.com/1070462426	after
otop_d34y7ig2t5na6l0ovshu	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1595	RA85- Exportar CAD	Exportar a formato DWG en Revit convierte vistas o planos del modelo en archivos compatibles con AutoCAD, facilitando la colaboración y el intercambio de información.	84	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.624	https://vimeo.com/1070462258	after
otop_r4bsbfuwgmru3mikm95p	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1597	RA86- Organización del "Navegador de proyectos"	La organización del navegador de proyecto en Revit permite personalizar la forma de visualizar y clasificar elementos como vistas, planos y familias, mejorando la gestión y el acceso al contenido del proyecto.	85	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.625	https://vimeo.com/1070462135	after
otop_0pgcnw2108hyi72m8itd	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1599	RA87- Planos	La diagramación de "Planos" consiste en organizar y configurar vistas, cotas, anotaciones y detalles en hojas, para generar la documentación del proyecto de manera ordenada y precisa.	86	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.626	https://vimeo.com/1070461956	after
otop_2xbakeogw8gu7a4zj6zv	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1601	RA88- Exportar PDF	Exportar planos y vistas a PDF en permite generar archivos en formato PDF de las hojas, vistas o planos seleccionados, facilitando su distribución e impresión.	87	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.627	https://vimeo.com/1070461855	after
otop_apl0oymp92fdsuaaufwf	org_y0txnlv69l6vp70ey06b	oles_5x3zarg1f6hyl2hi98vm	topic:1603	RA89- Imprimir	Las opciones para imprimir incluyen la selección de impresoras, configuraciones de escala, calidad, márgenes y formato, permitiendo personalizar la impresión de planos y vistas según las necesidades del proyecto.	88	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.628	https://vimeo.com/1070461779	after
otop_bpbu2347ktbvuasztydn	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1033	Lección 1 - Introducción a CIVIL 3D		0	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.629	https://vimeo.com/713308144/8f76cda54e	before
otop_e9ts113vfbhrnbe76ht7	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1031	Lección 2 - Superficies - Parte 1		1	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.629	https://vimeo.com/713308440/f4e5ffb690	after
otop_u345lixok81ataedbehr	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1029	Lección 3 - Superficies - Parte 2		2	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.63	https://vimeo.com/713309911/6967da888f	after
otop_kbt9lfbgde1zop19se1z	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1027	Lección 4 - Puntos COGO - Parte 1		3	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.631	https://vimeo.com/713311228/5ab318cb74	after
otop_0scvxddfbqft6ct0v063	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1025	Lección 5 - Puntos COGO - Parte 2		4	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.631	https://vimeo.com/713311827/37c953440a	after
otop_eipdnno5kh8o717sne32	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1023	Lección 6 - Alineamiento - Parte 1		5	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.632	https://vimeo.com/713313186/1956bfa9be	after
otop_he25djiu5b1jt4vjhxjm	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1021	Lección 7 - Alineamiento - Parte 2		6	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.633	https://vimeo.com/713314550/124525230f	after
otop_oqkxlishvqjvmws7pzrd	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1019	Lección 8 - Peralte		7	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.634	https://vimeo.com/713315267/deb3f7a7b8	after
otop_fo2bnrb484a5rbjxiwa4	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1017	Lección 9 - Perfil Longitudinal - Parte 1		8	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.634	https://vimeo.com/713315675/890e0bf042	after
otop_jn0eibonpdc6m3vijhv6	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1015	Lección 10 - Perfil Longitudinal - Parte 2		9	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.635	https://vimeo.com/713316150/543a77430e	after
otop_qstyz8zhus8mkrklmc03	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1013	Lección 11 - Assembly		10	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.636	https://vimeo.com/713316901/b40be0127e	after
otop_fjbe1v9lb7ixi4u9846g	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1011	Lección 12 - Corredores - Parte 1		11	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.637	https://vimeo.com/713317645/369d835908	after
otop_kv1jzr4bawsvknciddfg	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1009	Lección 13 – Corredores – Parte 2		12	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.637	https://vimeo.com/713318197/2367fb8b57	after
otop_klu3s863n0gwixi96oup	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1007	Lección 14 – Corredores – Parte 3		13	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.638	https://vimeo.com/713319375/414bd7029e	after
otop_xuz8yriig788tktyvhgj	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1005	Lección 15 – Corredores – Parte 4		14	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.639	https://vimeo.com/713321579/cb06f57bc9	after
otop_hiuzzn5twlktnpntotxi	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1003	Lección 16 – Corredores – Parte 5		15	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.64	https://vimeo.com/713323095/a56371453d	after
otop_a5k17tu2hm2u6h43lm9d	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:1001	Lección 17 - Cálculo de Volúmenes		16	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.641	https://vimeo.com/713324158/f743094051	after
otop_yr8ri1w249gxjvvij0qq	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:999	Lección 18 - Secciones Transversales - Parte 1		17	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.641	https://vimeo.com/713324508/7e22c2e913	after
otop_eu60mxr0qvhwl0bl1fwa	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:997	Lección 19 - Secciones Transversales - Parte 2		18	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.642	https://vimeo.com/713324994/f5c201abf3	after
otop_jnw2l6nvzzdhegzralx2	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:995	Lección 20 - Pipe Networks		19	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.643	https://vimeo.com/713325395/9ba672e516	after
otop_sp7vk76errn9gj1tiztx	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:993	Lección 21 - Gradings		20	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.644	https://vimeo.com/713326042/35ecf6359a	after
otop_gh0s1ezhon42648omazv	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:991	Lección 22 - LandXML		21	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.644	https://vimeo.com/713326468/7bf06cb37c	after
otop_u8kn5e8jvfyzzo6koz0l	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:989	Lección 23 - Data Shortcuts		22	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.645	https://vimeo.com/713326787/b563770513	after
otop_34rmf7dd9lfkvrw8c1j9	org_y0txnlv69l6vp70ey06b	oles_muukdv77lkisj972jlpf	topic:987	Lección 24 - XREF		23	2026-09-25 19:50:46.356332	2026-09-25 20:11:22.646	https://vimeo.com/713327233/00afa588c0	after
\.


--
-- Data for Name: offline_topic_progress; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.offline_topic_progress (id, organization_id, contact_id, topic_id, watched_ratio, completed_at, completed_by, completion_source, created_at, updated_at, played_ranges, video_duration) FROM stdin;
otpg_de4tqoo1o868imhvyasd	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	otop_bpbu2347ktbvuasztydn	0.9920	2026-09-29 18:44:16.598	\N	video	2026-09-29 18:41:36.452054	2026-09-29 18:44:17.139603	[{"end": 273.89, "start": 0.064}]	276.033
\.


--
-- Data for Name: organization; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organization (id, name, slug, logo, created_at, metadata, timezone, meeting_open_before_min, meeting_open_after_min) FROM stdin;
org_y0txnlv69l6vp70ey06b	Negocio de Dev Local	principal	\N	2026-08-10 19:37:00.784484	{"branding":{"name":"CAD IT Solution Provider","accent":"#1b3bbb"}}	America/Montevideo	15	30
\.


--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment (id, organization_id, enrollment_id, installment_id, amount, currency, paid_at, method, receipt_number, notes, recorded_by, voided_at, voided_by, void_reason, idempotency_key, created_at) FROM stdin;
pay_29m33zzmnko875n99efd	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	inst_atvu63tdutepu56e6lpe	6000	UYU	2026-08-15 19:55:53.961	transferencia	[DEMO]-1	\N	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	\N	\N	\N	\N	2026-09-02 19:55:53.861376
pay_8nlyv28eovda6ktrxzfa	org_y0txnlv69l6vp70ey06b	enr_ol258rs97f4orbbsap6m	inst_jbgoftlao03rhsy6uw7m	6000	UYU	2026-08-15 19:55:53.966	transferencia	[DEMO]-2	\N	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	\N	\N	\N	\N	2026-09-02 19:55:53.861376
\.


--
-- Data for Name: pipeline_stage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pipeline_stage (id, organization_id, name, "position", kind, created_at) FROM stdin;
stg_f92b4uejkxutx12710ff	org_y0txnlv69l6vp70ey06b	Nuevo	0	open	2026-08-10 19:37:00.784484
stg_xpsjzb990x14iutdhjzn	org_y0txnlv69l6vp70ey06b	En conversación	1	open	2026-08-10 19:37:00.784484
stg_afe9osamngth2rlyh4v0	org_y0txnlv69l6vp70ey06b	Interesado	2	open	2026-08-10 19:37:00.784484
stg_akn1zcst3t1htwgv0lmu	org_y0txnlv69l6vp70ey06b	Cliente	3	won	2026-08-10 19:37:00.784484
stg_tiwmtth8ftwox1n95b52	org_y0txnlv69l6vp70ey06b	Perdido	4	lost	2026-08-10 19:37:00.784484
stg_bbixrgtbfdxmmixes0k3	org_y0txnlv69l6vp70ey06b	lead	5	open	2026-08-10 19:37:04.462499
stg_wp3k3c3n75cyo1hgh1u5	org_y0txnlv69l6vp70ey06b	contactado	6	open	2026-08-10 19:37:04.465856
stg_gqyl81udj8uildkfwwhl	org_y0txnlv69l6vp70ey06b	inscripto	7	open	2026-08-10 19:37:04.469229
stg_6a925pk9q1kmdwlf4j4d	org_y0txnlv69l6vp70ey06b	con_licencia	8	open	2026-08-10 19:37:04.47267
stg_06lz8hn8xmdgzzpe7qap	org_y0txnlv69l6vp70ey06b	cursando	9	open	2026-08-10 19:37:04.475478
stg_0db9z2eip6p1qw0achdr	org_y0txnlv69l6vp70ey06b	finalizado	10	won	2026-08-10 19:37:04.478144
stg_5zemdon2wjjhtmlv1ujf	org_y0txnlv69l6vp70ey06b	abandonó	11	lost	2026-08-10 19:37:04.481487
\.


--
-- Data for Name: resource; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.resource (id, organization_id, course_id, class_session_id, course_module_id, title, url, kind, "position", created_at, updated_at, cohort_id) FROM stdin;
res_kqlb9gpvuiftq8lo3qyx	org_y0txnlv69l6vp70ey06b	crs_alv3pmlqlhohwf2e3mia	\N	\N	[DEMO] Guía de la clase 1	https://ejemplo.test/guia-demo.pdf	guia	0	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N
res_qc79qjb9edfkgomcvho5	org_y0txnlv69l6vp70ey06b	\N	\N	\N	Guía del profesor	https://drive.google.com/guia-profe	guia	0	2026-09-04 14:18:23.358189	2026-09-04 14:18:23.358189	coh_o0wif02yng8jx045ofc5
\.


--
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role (id, organization_id, key, name, capabilities, system, created_at, updated_at) FROM stdin;
rol_15fc419dca4bd1ccc0f2	org_y0txnlv69l6vp70ey06b	direccion	Dirección	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inscripciones.editar", "cobranza.ver", "cobranza.editar", "inbox.ver", "inbox.responder", "configuracion.editar", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
rol_b4d75c9111148f96d0b3	org_y0txnlv69l6vp70ey06b	coordinacion	Coordinación	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inscripciones.editar", "cobranza.ver", "cobranza.editar", "inbox.ver", "inbox.responder", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
rol_0b30088b2fd44ae9c4ae	org_y0txnlv69l6vp70ey06b	soporte	Soporte	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inbox.ver", "inbox.responder", "configuracion.editar", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
rol_7274291aa49965013da7	org_y0txnlv69l6vp70ey06b	administracion	Administración	["cobranza.ver", "inscripciones.ver", "academico.ver", "contactos.ver"]	t	2026-09-07 17:29:35.308038	2026-09-07 17:29:35.308038
\.


--
-- Data for Name: seller; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.seller (id, organization_id, name, email, user_id, archived_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id, active_organization_id) FROM stdin;
imRwZah1HyG1lTvVTn9u82qqEGdALkaE	2026-08-17 19:37:00.686	RyH62yunt1G4wRLUEPYtSgEpCGctv310	2026-08-10 19:37:00.686	2026-08-10 19:37:00.686	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	\N
nMEzrFr9XYWEsDPKdpnQ0HWpVbAj7M0L	2026-08-18 12:15:30.177	BtGh6vIEWlVKxW5Ky6eEIqwvwygmlQwV	2026-08-11 12:15:30.18	2026-08-11 12:15:30.18	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
T5zrY1szd4WQde24h59iz4Kdtz4jBkqH	2026-08-18 12:20:11.633	sVNGQc2sBXkbJUS5DFv55e5c6aFUVTcU	2026-08-11 12:20:11.633	2026-08-11 12:20:11.633			lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	\N
LrUjKbybF2KXLj27X6gyAgX9nllJVZiK	2026-08-18 12:20:25.787	RC4pqs1I4TtgRSP6eUV5AN1pbzFrbvGo	2026-08-11 12:20:25.787	2026-08-11 12:20:25.787	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
jNUcItoYYBm2KVMaAYFB2VusxllfO2Cq	2026-08-18 12:20:25.881	ACSiPiFTeqozkn02w8wpprghze1yuXUf	2026-08-11 12:20:25.881	2026-08-11 12:20:25.881	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
VrrA1yorLz6YNxmHX4BilUUg0pLZjYzM	2026-08-18 12:20:40.949	DI4KBbUWEcZzAvb9BlIwtxVlugjBY3n8	2026-08-11 12:20:40.949	2026-08-11 12:20:40.949	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
cA6PqZvg5AzYKqILhekyCfzDEq01lOZ8	2026-08-18 12:20:41.037	69YUHJizskEfdmnqIr9zUlI97geASqzO	2026-08-11 12:20:41.037	2026-08-11 12:20:41.037	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
fiE27LtayWHej6csfVr9BXq6z4KTVZoh	2026-08-18 12:20:56.082	BlJ5Ffn6dWlzFANjlfyyqLecHOjYsBvi	2026-08-11 12:20:56.083	2026-08-11 12:20:56.083	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
4EVCKJ62au7VQGW5SeCR12eF7AiRa73F	2026-08-18 12:46:48.609	J5IXmGg93F9KG04DP7n85ZNOYevgLqvt	2026-08-11 12:46:48.609	2026-08-11 12:46:48.609			7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	\N
KJNHTMiiUBCXiPfkl6Otuc4SAZCxTyX8	2026-08-18 12:47:08.887	szjChitmz8RojUjVLM2RvYnguf9uQ1bK	2026-08-11 12:47:08.889	2026-08-11 12:47:08.889	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	org_y0txnlv69l6vp70ey06b
pmV9GgYbeag9jU1GprWTWKt33ksg2aXB	2026-08-18 12:47:13.733	AEgYFX4xOhyjqvHi1noRg2GQcvA8gqfU	2026-08-11 12:47:13.733	2026-08-11 12:47:13.733	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
4bJV9LSEM1CH0EY02XDAj2oOgabceWOm	2026-08-18 12:54:57.806	9Vlts60gIF2Kz1g8Y6TI6TY5WrJ1vGuO	2026-08-11 12:54:57.806	2026-08-11 12:54:57.806	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
onr6eUdgFPG5Xz6XDvKfToIIctWf0EfL	2026-08-18 14:34:54.546	2YI2wj5GUOt1eGQy21dva8IGEOOC6TkB	2026-08-11 14:34:54.546	2026-08-11 14:34:54.546			SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	\N
M778UiIVAvqwzCqj6XziM2P4dMLVCzlz	2026-08-18 18:59:01.378	7x33nQc78bgZJNpRgHdHlVsFEQdKVVEZ	2026-08-11 18:59:01.379	2026-08-11 18:59:01.379	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
GnTY1ohmBNlLIOfXlKpz7l12Ww6biZhi	2026-08-18 18:59:25.397	DP1zhHEaAYDtpItJswVJgP0WNfdsXYQ5	2026-08-11 18:59:25.397	2026-08-11 18:59:25.397	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
2ZzZ82ePU3qTNu0SkOUCFeJyugZHt62b	2026-08-18 19:00:10.812	f5okBifKbfOPy4LvwnPJYwRhyxc6wr2C	2026-08-11 19:00:10.812	2026-08-11 19:00:10.812	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
GpwaCEWa3bR6OuGsN3qKks00qYegPMmB	2026-08-18 19:00:41.278	skGdzTVDbznPUwfTtoEO67utYgsPDaDj	2026-08-11 19:00:41.278	2026-08-11 19:00:41.278	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
lvO0p9FlU2k4RBKbgkV8idDgroU211KE	2026-08-18 19:41:34.059	povpZre7LVjfX3iRnclo9Z75phL07gVk	2026-08-10 19:40:41.913	2026-08-11 19:41:34.059	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
7lstONSgexfkSKCoEPekwrmqncku6USp	2026-08-18 19:59:30.83	TQtKRARB13cB2YiiVOZar9OxUVDSIolr	2026-08-11 19:59:30.83	2026-08-11 19:59:30.83	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
pyelSqF8PkZ8ARTJ7hJsJg3QJdvECoSr	2026-08-19 12:30:50.524	ZcvWuuS8DBb2qot6XoLy83yAveBQXUBp	2026-08-12 12:30:50.53	2026-08-12 12:30:50.53	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
2ip9YFURIHmRZpsT60eW3ixitdyvJKK7	2026-08-19 12:31:28.108	6NZVx2lFMLlHXQ7qgwybsfxhytxp1y6g	2026-08-12 12:31:28.108	2026-08-12 12:31:28.108	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
STJ9Iqw1ZeJlIGlmMhwytUtd7W5dnpqj	2026-08-19 12:31:39.279	DrPYNfZDLEpPDhnpgQIXWljMgy7mXzxh	2026-08-12 12:31:39.28	2026-08-12 12:31:39.28	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
3zljOjDwnpFxpBqDPkjdOKWvxno6qqTA	2026-08-19 12:31:58.873	KuwKSF4ZU48SgQtMiIGYsehd5hQjR7pf	2026-08-12 12:31:58.874	2026-08-12 12:31:58.874	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
fmYENY2I1Ir2nt9JJ6zw8NfDPdBqavQ1	2026-08-19 12:52:59.042	jyI8OjoBhPLGCX2DcW6LoFxXrxBo47SM	2026-08-12 12:52:59.043	2026-08-12 12:52:59.043	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
CHywCw0HDngvEfapiIichsgCiT0p7JHf	2026-08-19 13:11:54.244	UOcqHulB2YVVzS1U2pCciFrLy7dqiB7g	2026-08-12 13:11:54.246	2026-08-12 13:11:54.246	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
0SUnZGOEXuIPeoom2NUEkRJF08vFRQcm	2026-08-19 18:41:00.47	y04jY4beVDpxDZoiQ6hYtc7jwgmFYyz1	2026-08-12 18:41:00.471	2026-08-12 18:41:00.471	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
KpFTFTs99V8JpY6FiLwVIcfIMWN5hbSe	2026-08-19 18:41:32.595	ynf2yde1TPp61MsAqXsMkuaEmXfgiFMX	2026-08-12 18:41:32.595	2026-08-12 18:41:32.595	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
ioJ8UMGQWYBSWGrgfD6Kis2d7XVmYcfT	2026-08-19 18:41:45.893	omDEI5waQ3gy13Js04m6DXONr70t8zcU	2026-08-12 18:41:45.893	2026-08-12 18:41:45.893	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
FUUV3gAIWOtJq4yE8ImLSGq5MHeOjYMb	2026-08-19 18:48:33.525	ONeTN03H8RI3wXRjKEp2PRUGdEfCsptI	2026-08-12 18:48:33.526	2026-08-12 18:48:33.526	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
3EIGoSHnrXsnfjfd2XDKzYg0tKFn3Iqp	2026-08-19 19:03:04.293	JQCl84HIQP6EoBrXJPfxOR3I5UQJpX5e	2026-08-12 19:03:04.294	2026-08-12 19:03:04.294	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
OI3q7nQVlFgv6n8XvenRUsdE29zf46I6	2026-08-20 12:19:35.938	ZIcy24chAIk34uOPHtjhZAtmGHl3ngks	2026-08-13 12:19:35.939	2026-08-13 12:19:35.939	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
UE5c65Coc5DCZsA7hmENWhgiOHSVtxpa	2026-08-20 12:30:28.832	SJsC2rwWrgFbBlRkUjOa8x6tPzL5M3hh	2026-08-13 12:30:28.834	2026-08-13 12:30:28.834	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
MmFK2vmIwyzqYQMBqBMPqmQXYQgRRpc6	2026-08-21 12:58:07.452	G27sSV7g1j8scNHvBhT7wR7a75CPU0o3	2026-08-14 12:58:07.453	2026-08-14 12:58:07.453	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
Qui62V9X2kX9TAzfGnN6RL2ilnNpywR9	2026-08-21 13:13:41.866	tVbIvuHb8uaLW4y1ZL0z4sqyTThzkwwM	2026-08-14 13:13:41.868	2026-08-14 13:13:41.868	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
nkVoBgepNm5KE5mFdUmFNAVu9SXKRkcT	2026-09-04 13:20:13.961	qJDN3C0m4QEycYWonbxBDsMMKhfHR1Rq	2026-08-28 13:20:13.963	2026-08-28 13:20:13.963	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
gzypF3HqhpekmOqnucVL5P0KqInvzJpS	2026-08-24 06:26:39.411	hUREClaNKzBYeVv1TGWB7C42jgmpAwOo	2026-08-12 17:34:29.863	2026-08-17 06:26:39.411	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
Srzyv3YH52w5SKnPbZvIL4ndE7JcWLtB	2026-08-28 13:27:04.115	p6JCop4GqvJtvps1N32JsTqTXrE7zaBQ	2026-08-21 13:27:04.116	2026-08-21 13:27:04.116	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
tJrjalSJKyAqYuJlKxHPQg2QJVZBQRmI	2026-08-28 13:33:00.408	07Pr9bfnKQDxY1vgSKzQyl17tOuel0AW	2026-08-21 13:33:00.409	2026-08-21 13:33:00.409	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
CdzR47jImeUhQUDHrZ0CzPGbO4UOtxlr	2026-08-28 13:36:43.51	woTC03qgy7ZudYkCzFwyACNHQ7Pfxzhb	2026-08-21 13:36:43.518	2026-08-21 13:36:43.518	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
mLxzArAVPYZrVkQTm3VXWt3uYT8pNS64	2026-08-28 13:40:14.644	jbzVA8yZqBQn6iGirTNX7K1GF1nFwuhf	2026-08-21 13:40:14.645	2026-08-21 13:40:14.645	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
vRMiFjozgLe4Y4EUBoSa5fb3NwPzY8N9	2026-08-28 13:40:20.881	AqyLzuGdY4Y32oypUWpk2TvxsXzRrlR8	2026-08-21 13:40:20.882	2026-08-21 13:40:20.882	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
JmbcDFgmRRydIWsh43wt3sHnlvFr1HqH	2026-08-28 18:54:10.715	AbbFaCv33T3ZPtmjr6aWo6k2LgMJ7tWN	2026-08-21 18:54:10.717	2026-08-21 18:54:10.717	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
pHhs8rC2WMSB2u5HW0ENhinFLbKfYqnl	2026-09-03 14:31:02.077	2d2ZLBlvEoxPMCUeGwOx7ZiphpfZRklf	2026-08-27 14:31:02.079	2026-08-27 14:31:02.079	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
lmtoJF9IbzEwSoZiCLPsOOCZ3yjv0oGo	2026-09-03 15:31:31.955	OJUR4rReHs2lh03H3SnC4sFm7ip3ZJfM	2026-08-27 15:31:31.958	2026-08-27 15:31:31.958	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
vOLLV0nIak9RSB7CwLJ3ashgfBTExkcH	2026-09-03 17:30:06.836	QQu8WFzKZNMsqXy5A7uKMV6um6i08ju4	2026-08-27 17:30:06.836	2026-08-27 17:30:06.836	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
AuGWlqBsQ9XWno0CghpyAq1gvxXKtpLK	2026-09-03 17:31:16.639	K28Z1xLOeYK53assc2im6ofURmUJHglY	2026-08-27 17:31:16.642	2026-08-27 17:31:16.642	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
967UGfkTkDvr1kPKLkPOXJ2vHLkeWb7l	2026-09-03 17:32:49.192	IwZ39VFzSgKBocxnysALT91bN2dq8HM8	2026-08-27 17:32:49.193	2026-08-27 17:32:49.193	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
QPtjtvpIQT6ywWUuwekp3eXp4c87lIdI	2026-09-03 17:33:58.135	gR5VUHG5C24kddgSTAKA5jDLPh61Xq6l	2026-08-27 17:33:58.135	2026-08-27 17:33:58.135	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
aNtuppzLelksi7d5EtNQQs1hEJnNazwV	2026-09-03 18:39:04.585	lg6Xxyy6oinDcQMOLsAmTM82Vz7EyXWI	2026-08-27 18:39:04.586	2026-08-27 18:39:04.586	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
S85pHc4lfixnfLuJmzljC5n97hAi2tpY	2026-09-03 18:52:09.192	Sq982WTOsocUSUk9EK7AN6brBFrIpcmf	2026-08-27 18:52:09.194	2026-08-27 18:52:09.194	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
AJViZuqtvJUHyJqz8kYngc65WSFXgfYn	2026-09-03 18:52:29.029	PA1q1BCXecZO3T0iud1CxjXUv3olAkaT	2026-08-27 18:52:29.029	2026-08-27 18:52:29.029	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
c30EmKJyaOL1PXsyT2qcYZ8G3cInWpKy	2026-09-04 12:59:12.813	3iZtMXjCJCD0nK4fGw8zamVNHk31lI56	2026-08-28 12:59:12.816	2026-08-28 12:59:12.816	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
5oWMVfp3vdkp1PdRZV49iNBWxJgYrMVj	2026-09-07 17:52:19.043	qWsCDKvcsogKm6HqL809QtJvWLj0mkfG	2026-08-31 17:52:19.046	2026-08-31 17:52:19.046	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
vj2z79eSlCxuMXZJQKESfpIzHNHTGRlB	2026-09-04 15:41:15.592	GTEc1OTtuRdS5cnvnLa56bi7aB4XfBuZ	2026-08-28 15:41:15.595	2026-08-28 15:41:15.595	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
X7MgkIl1r3mloKt5DK80p2rC6NLDnhKV	2026-09-04 18:16:02.088	F8nlhNigo7werVTnILFOailR3lrK7Imf	2026-08-28 18:16:02.089	2026-08-28 18:16:02.089	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
Z2Nsr5EnJPUP5oI69XMUZul6C3tMoaIX	2026-09-04 19:06:08.818	hKcy9lJuibD0jsn0QniIGgN79Eze14fH	2026-08-28 19:06:08.823	2026-08-28 19:06:08.823	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
O8Xv3JlVWyauDtckmPh2ldf97gtlyz6U	2026-09-07 12:49:13.406	MZgQlWMcINzJnBCVmroowQ92HdIzFLfz	2026-08-31 12:49:13.411	2026-08-31 12:49:13.411	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
0HvLpDtjwlBRRfCO1IyocC8qJTGR9xOc	2026-09-07 13:04:58.341	qBDa87tjeJbJ5y8BSMmn6bIMCwgA2I5H	2026-08-31 13:04:58.347	2026-08-31 13:04:58.347	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
KVSgPSZTCzR6CCBwjdCYPyhxDuVpRJJX	2026-09-07 18:01:15.823	4Lq1JVQj5ypdZGtazivkcIHkMBmroRx5	2026-08-31 18:01:15.826	2026-08-31 18:01:15.826	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
xOBh3ZwERjJWDMFoD1YwT1uc38O22RNb	2026-09-08 12:24:52.193	oRz3fXrvlbzYFMnZNbG4uUEASw3VGBIY	2026-09-01 12:24:52.195	2026-09-01 12:24:52.195	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
yqabns2awo0UzYeNshrHw9C3rJexe7GI	2026-09-08 12:25:53.256	Zq7XihCOQapiuDxZZnPvrRtTY6pU3lrP	2026-09-01 12:25:53.256	2026-09-01 12:25:53.256	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
yKM35Gyr23SCD0HfFnUvs9BZFOy7Cqk9	2026-09-08 12:26:39.772	Pm9DHWnF0q74IJ6OYmrofHTdfkYzLE2Y	2026-09-01 12:26:39.772	2026-09-01 12:26:39.772	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
mma9VKMmax7ai23zfT0bZAK27AZ80Jwv	2026-09-08 13:56:35.634	491Z1h7HCpyQ2cdcwc4hAIUznYRZdwjf	2026-09-01 13:56:35.636	2026-09-01 13:56:35.636	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
8V0b5rObsouzFXbxDV7YHFbr1u8bBVti	2026-09-08 13:58:26.787	REiiMjLrBNzHpU7mF6NYz1V390SSMhES	2026-09-01 13:58:26.788	2026-09-01 13:58:26.788	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
FBkOfuSoeBnGA3vESdv3F4FskpcDwnyd	2026-09-08 14:07:15.34	KtthdL5tzgt18g7eT1S8XTSaoDwrQC2s	2026-09-01 14:07:15.341	2026-09-01 14:07:15.341			tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	\N
zvfVU2HSSJiCvkPKDRzgsGaDxvX2yfS5	2026-09-08 14:12:31.474	8Z4BFhn0AMlpIIRPEeoLxwjd9quNxdhu	2026-09-01 14:12:31.475	2026-09-01 14:12:31.475	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
5tFq4ysr5qVSsQmYqFSf0ebGugQSyxvu	2026-09-08 17:31:30.998	bSCZlAp8yzTRYSXn1KHKVVijF5m1NGiK	2026-09-01 17:31:31.003	2026-09-01 17:31:31.003	0000:0000:0000:0000:0000:0000:0000:0000	node	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	org_y0txnlv69l6vp70ey06b
MjXqlJSE5WIxESKrOEPF72Oc9qsHDKLZ	2026-09-08 17:40:59.513	Uvn0ZVbbWZJteroravjWljuhibaoONHf	2026-09-01 17:40:59.514	2026-09-01 17:40:59.514	0000:0000:0000:0000:0000:0000:0000:0000	curl/8.19.0	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
q7Q4kx6HNlSROVQcsqHgsryL6lQ5W8e9	2026-09-08 18:39:27.22	31kTODYRYcTz2dwz8cIeZlaa0LOO51ij	2026-09-01 18:39:27.222	2026-09-01 18:39:27.222	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
EDg5gnHc6ljYUSwPe9ncPN28EUI9xtG0	2026-09-09 14:34:32.04	LfbD6HA0GLE9gjYHZQinLdyUO24xywWr	2026-09-02 14:34:32.042	2026-09-02 14:34:32.042	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	\N
z9LD1ZswaIdkCOupUuifYTJWGipfiSfg	2026-09-09 14:39:55.749	fXD6YrhOdI9i0rpbT8dKuMlQnMi8eHxj	2026-09-02 14:39:55.749	2026-09-02 14:39:55.749			JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	\N
gfowMhejb4j5mvEHVBAbArn7Wi0bnnUL	2026-09-09 14:40:31.623	PJtJaK9gsBFKHrqcn9YNXoZ5gOtYENFY	2026-09-02 14:40:31.625	2026-09-02 14:40:31.625	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	\N
5uJpJMlaGQ9KPkiYBOVuOCRwlGcx7Q0G	2026-09-09 14:40:47.875	zWjOrqnpgYZ0kORoUmwJdji814eXBLQ1	2026-09-02 14:40:47.876	2026-09-02 14:40:47.876	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	\N
D3tkGT2Btm2vwQhrHkxajuryXAzAVo2d	2026-09-09 14:41:01.341	kCdrw5QIAq9sZQEsp3DJ55v1QBobz7pK	2026-09-02 14:41:01.342	2026-09-02 14:41:01.342	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
m3S06yhc4DSacLqGG6EhJkKfk9tGTnSN	2026-09-09 14:41:32.455	tKcqnxiiOLhoxz7iZ4cnJYj2Q1vAbtWB	2026-09-02 14:41:32.455	2026-09-02 14:41:32.455	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	\N
pmwNFVZ9RPA9nYNWjUOT0se5aAdidlWw	2026-09-09 19:26:00.627	QgCcOYB5VbmCZwqJ9EeeXtkAAKyRpEGd	2026-09-02 19:26:00.629	2026-09-02 19:26:00.629	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
XEK9zCQI6OosQDiqoaSaSBDzuJGJ3i6I	2026-09-09 19:26:27.379	HuAzsJctkVmBj081TftM0zwRrw1b7R1z	2026-09-02 19:26:27.379	2026-09-02 19:26:27.379	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
9bxYjWfdCCLz4emMt8gMdY1pvRMZRkK4	2026-09-09 19:27:17.296	6CoSlnIBj93AWvagfOkt2GauVShYHTfl	2026-09-02 19:27:17.296	2026-09-02 19:27:17.296	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
E6XnVgsA3Y1JrhesiL7nUYAm1VyQMiYi	2026-09-09 19:53:19.38	rV1YksBXoYsjG3M0vJX6NEEZKB2Xn0XA	2026-09-02 19:53:19.381	2026-09-02 19:53:19.381	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
BDknHZIu1g15teonrbGiURvnEr20Csd6	2026-09-09 19:55:54.074	28b2B1DWwmohy9yGk3hHicM6DxlNn1Sa	2026-09-02 19:55:54.074	2026-09-02 19:55:54.074			ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
ugncqsbNtbnjuW0sreNYyb0zyMcmqcQm	2026-09-09 19:55:54.149	3bpr9LnW4KyMzPCWzyU5Jj4KNa0fqT0A	2026-09-02 19:55:54.149	2026-09-02 19:55:54.149			L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
GkQLiKZnNdbc4D3OoMwxpK7MEWlkh8Xe	2026-09-09 19:56:09.621	slZWK8iAXSjHe0WXP1bNcUPPLVduGSKy	2026-09-02 19:56:09.621	2026-09-02 19:56:09.621	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
OmVqSth2viPVFOxGAIIJWIa4OkYTr77c	2026-09-10 17:40:40.494	eUT6TgAKwC3X8o7MTIhHj7fm9KbXGc5n	2026-09-03 17:40:40.495	2026-09-03 17:40:40.495	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
K2SViud9GBUH937Fd6s2mkvnki3NvK0v	2026-09-10 17:41:11.362	xERmIB6Qt8d2pWJwuAgIIo95mhAeZ07L	2026-09-03 17:41:11.363	2026-09-03 17:41:11.363	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
EAWdqo1G0or6DIx2aozotirOvddh0qNS	2026-09-10 17:41:17.055	dIHPZQVbDS1HjUY6JudujWUalISC0880	2026-09-03 17:41:17.055	2026-09-03 17:41:17.055	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
qYLFBVMtAJhZWhFyhu5g7J3JwcTb6jof	2026-09-10 17:41:22.665	4ZmlvPGkUmcX1OrLIxRyhvB6aoLQ0Bdy	2026-09-03 17:41:22.665	2026-09-03 17:41:22.665	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
jCLp7CoRg4W5EoMtQHiA5dgjeDm4iE4p	2026-09-10 17:42:04.634	OXennhCw5KcjFh3ZEwxnMvdb6qrBepMv	2026-09-03 17:42:04.634	2026-09-03 17:42:04.634	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
r0xKptSfk6vr85N7Ur6hWZBTEwyqreLS	2026-09-10 17:42:10.144	ZZQ8cdju40mE9B1rZC0WuMB52IgQ1O3m	2026-09-03 17:42:10.144	2026-09-03 17:42:10.144	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
uJ8h2AQ3GEu4N1wAj6yPEKLMN3p087lL	2026-09-10 17:47:39.337	VYQfH3EnERSo7s7GvHyeSfnVqFrqVczd	2026-09-03 17:47:39.339	2026-09-03 17:47:39.339	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
WESZz6MTOZLKblMB3YJg7FLuEflRw8IW	2026-09-10 17:42:15.756	Tkk3NenaMkQuucdoTotHFsyi3ZL0t8M9	2026-09-03 17:42:15.757	2026-09-03 17:42:15.757	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
CA4ASD2SS589BL7QeCyOtGtYX2WkaUVN	2026-09-10 17:50:45.196	MnVgTqYYUq0esPxlXL6OV0gmwOtxs47j	2026-09-03 17:50:45.199	2026-09-03 17:50:45.199	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
uKo2t3zUr28y2qfzVnntUBDVYBwoEprA	2026-09-10 18:17:52.539	Ap1KJ5hKXnqv4f4N9j2aHQ9rwpTXyjQa	2026-09-03 18:17:52.544	2026-09-03 18:17:52.544	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
qFKWEQBrnNIiL69pEp7MQpJJgyz9INhz	2026-09-10 17:42:21.054	iw0kHm5RPDZZ856yo42SKbYLdEnb8EJf	2026-09-03 17:42:21.055	2026-09-03 17:42:21.055	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
tV76zhCWycOFFK93XqpPuhfJvhKtluTb	2026-09-10 17:43:39.705	NtjaGz8izCcsBNC4Eu4vbJgYIzi184PE	2026-09-03 17:43:39.705	2026-09-03 17:43:39.705	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
1d9kRgnkzR8JU4mcR3B409Lbp4JG9aZq	2026-09-10 18:20:32.598	S6Fjwl7k03mizEJCAaceoRqlyHKIctpi	2026-09-03 18:20:32.599	2026-09-03 18:20:32.599	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
yq2LFN7w7qYFpPKlF1BMERW5LZBqqyU2	2026-09-11 14:11:17.635	6SHH7KHFzoKHMzD36NchpdAsXEnhD1dL	2026-09-04 14:11:17.636	2026-09-04 14:11:17.636	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
5BtJqhzOkK7gbiQZrvPF7LEDYfTJE0bt	2026-09-11 14:17:41.329	V3FEoqNzIGiyqOejjCyhnJc0U3N5WaE0	2026-09-04 14:17:41.33	2026-09-04 14:17:41.33	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
xrBDQjWWtL08AA0M0LtzJ66v0DsRcsCe	2026-09-11 14:17:41.71	1xtFVTQvgzQi0XObdAUJDEazelXGKbz2	2026-09-04 14:17:41.71	2026-09-04 14:17:41.71	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
UjVmEBliaNyN4AXSr4geRzTk3Xlg0VLl	2026-09-11 14:18:51.183	MgLHgWADSKesa2QiOGeMaPXV2QjkQanj	2026-09-04 14:18:51.184	2026-09-04 14:18:51.184	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
qhAVY9cuAotW6n3P9p07MF5VJwKwqDI0	2026-09-11 14:18:51.538	C5TOXeA9QwII1y5l8KRgrVSBpkO9c1p8	2026-09-04 14:18:51.538	2026-09-04 14:18:51.538	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
Wf5bZ3IKmaswF2jcGiRk0gFsTf1smW0I	2026-09-11 14:22:56.535	E6FKIIElsUKF43e8HozzeyR62AYfbjAF	2026-09-04 14:22:56.537	2026-09-04 14:22:56.537	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
CRcAL90bdZPnA2KNH1KXNiDe6wa1tM2N	2026-09-11 14:22:56.912	s1HbbXhnmCrk5fWoVOXgLpTeqppFpjMq	2026-09-04 14:22:56.913	2026-09-04 14:22:56.913	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
5tNteuP70IldYUmxCm5ES8COn9Eexm6K	2026-09-11 15:48:29.594	qndPiSaT3bQGRZgbw5OvncoCwxFK5REM	2026-09-04 15:48:29.596	2026-09-04 15:48:29.596	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
MlUNkPVxGOIeotT52FaXMhlIS0xEY9Pf	2026-09-11 15:48:29.964	VOWj1QhuI33dRr4FErU9qNGwF3Y82XxV	2026-09-04 15:48:29.964	2026-09-04 15:48:29.964	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
Zc9k5S1xbpebC7RsUvzXJ3beJWfviLqr	2026-09-11 15:50:04.833	feLMeMkGrqqTWxpDSQZ3ak9m80geh9Xr	2026-09-04 15:50:04.834	2026-09-04 15:50:04.834	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
tLgqcM5PPR0bqyvh3dUFVTI343r4Fwog	2026-09-11 15:50:05.196	Z3XaT128xPypdL2wzJIWo14WK9AqWSHC	2026-09-04 15:50:05.196	2026-09-04 15:50:05.196	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
eh9AX4NIW2nHzH03VUosKX2fyyH3LimB	2026-09-11 18:40:18.482	6qPNxhGU09lOkL443HNLDtVvFCGyTGiX	2026-09-04 18:40:18.491	2026-09-04 18:40:18.491	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
7s8CJ63dRbkNF2ewok6NEKOnDQf8DoKc	2026-09-11 18:40:19.412	m1LayNOwePiLuHRVoXfPqYWdco7TCWJa	2026-09-04 18:40:19.413	2026-09-04 18:40:19.413	0000:0000:0000:0000:0000:0000:0000:0000	node	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
gBOggUYLzy3Sc0P1exX8a6rF8XRFAq0e	2026-09-11 18:41:27.491	0Dlo1jnL9IwtgtIATGXsmzxhZTRHbQdT	2026-09-04 18:41:27.492	2026-09-04 18:41:27.492	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
WleDUDwx1Ax6ujP5HcSUN3bQdypr3Mo6	2026-09-11 19:47:44.354	vvODx9UyjiLYNGk4LfGNZJ8tbBc6aDwk	2026-09-04 19:47:44.355	2026-09-04 19:47:44.355	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
G9Hbt4NKkQk4TxpWQkLfOZmqsWkaoLkJ	2026-09-11 20:20:34.482	qFuffvLUtBjnf3wJeCQqFoziBHx7gB4B	2026-09-04 20:20:34.495	2026-09-04 20:20:34.495	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
3P4fCkdlaxeDTmc8QshNomKbIG6nuv1j	2026-09-11 20:20:42.132	i3ZXlKokURNsDe0X9lukWYbs6TiilyPD	2026-09-04 20:20:42.134	2026-09-04 20:20:42.134	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
TbTLKOELKxCfHNWCaqFv3CzrJImSKQlH	2026-09-11 20:50:05.736	JgYcG3wYm0PkNewnygcXv3VNvdwFZg2P	2026-09-04 20:50:05.741	2026-09-04 20:50:05.741	0000:0000:0000:0000:0000:0000:0000:0000	node	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
VFT7efHtuqRQ1rYj7oZ3I44vkuncV28T	2026-09-11 20:50:06.291	8yIkMKwvMPLc90HW0uqwuNugf3FJxyTc	2026-09-04 20:50:06.292	2026-09-04 20:50:06.292	0000:0000:0000:0000:0000:0000:0000:0000	node	L5Rd42NmmROxqwZic1unHDnTdfYQU44R	\N
FB4WO85Ayri5hvouvVA5NvpM3s2ZKana	2026-09-14 17:55:40.333	aQHaDmc5ZTJgv1eByPr6o8oRLlsY0reu	2026-09-07 17:55:40.333	2026-09-07 17:55:40.333			osrQ0lXIfCOLYrSahugeSYTlpT3ksClr	\N
QsYSTqnLvG4r5NkdmKyWWLaPQVO0H7PU	2026-09-15 19:02:00.404	0INrfnMqbJvyS4xJy6vg7S67J0HTJSx6	2026-09-08 19:02:00.405	2026-09-08 19:02:00.405	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
HyXXyBq1BBL4ZF5ViraqS64khFh0sWN1	2026-10-05 14:34:08.1	47gV9zuApFLGsA5yjwPOKN1sQeH72G6x	2026-09-28 14:34:08.102	2026-09-28 14:34:08.102	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
5NO5SCUJAeWDdSBb6QC7zdp64C9nNsKk	2026-10-05 14:47:31.925	sUl81fZhGW77gj5iTMMgm3hqcw34LORt	2026-09-28 14:47:31.927	2026-09-28 14:47:31.927	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
J24t1FkHWV32yP94M4egH7FltvnxIoMn	2026-10-05 14:35:28.712	2SeiZa6FiiIBRri8Ie3k2ceTLhTaSv4d	2026-09-28 14:35:28.715	2026-09-28 14:35:28.715	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
L2mtYi93vxGa7H2PX1hEKicU2hohFjV3	2026-10-05 14:36:28.584	6vDuyp1bZvl1Z5R1BzZCh5mvA0A86ltA	2026-09-28 14:36:28.585	2026-09-28 14:36:28.585	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
aGgzxlfNtNd97ikoNYygR49RutdTKxHp	2026-10-05 14:46:35.643	C0CSv5pY6VpiwXMMw8V0rd9RDrItZtH3	2026-09-28 14:46:35.646	2026-09-28 14:46:35.646	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
9WO6rNsorp1SAX7HkoMXAwxRBeiUOOL1	2026-10-05 14:47:41.759	kIoDYNDAajjI2L8EOXFWifH2qTiL8Fju	2026-09-28 14:47:41.76	2026-09-28 14:47:41.76	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
ImZGNpZhnAytjWb54UgkSp7EOGy33P0Q	2026-10-05 14:49:30.545	IogjtjrAH4EqRHUAmJYNMwT1Zdb3dCBh	2026-09-28 14:49:30.548	2026-09-28 14:49:30.548	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
w5LVIy0VyyPB06vXTvzg3PUo4nuhTLpi	2026-10-05 14:49:53.136	vYMs1LQBrWwC7nc1DJyxjTzzsQ62qhxl	2026-09-28 14:49:53.137	2026-09-28 14:49:53.137	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
tJvdyOQ50h9hmxTH8akJw5Z8kHPM2AUr	2026-10-05 14:50:47.368	sElmGvCQDv5HCcX2HaAfiFpSvvzcnqhK	2026-09-28 14:50:47.37	2026-09-28 14:50:47.37	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
U1Z6Ya9yb4W5KndyEQddGnMkyWLvFaUl	2026-10-05 14:54:13.495	HrSfus1sGmkmjcmbiWc7g4pDQ7Cn8hbp	2026-09-28 14:54:13.496	2026-09-28 14:54:13.496	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
VNiexZ85yPcPO3RaspCGSGlDsPAlo9KX	2026-10-05 14:54:30.991	amCWdH8X9UFV8TCgPIbTWdgOcpzozRxx	2026-09-28 14:54:30.991	2026-09-28 14:54:30.991	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
z4RiXIq7QngTkG4v270LvvaoSCtZUN1C	2026-10-05 14:55:09.275	Z34aXWp6z0mcA0RFpCSzZ3UGk8eIwMHj	2026-09-28 14:55:09.275	2026-09-28 14:55:09.275	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
1CgXv9JDrAz6ASVdi0jl7zEMTwVhHPgy	2026-10-05 15:02:00.475	VlyQHTG6HlI9YiV7pfxchvpuPIbuYTsT	2026-09-28 15:02:00.476	2026-09-28 15:02:00.476	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
eyR8A1ye9SrFOnJxZj4h6cWJExybD1aJ	2026-10-05 15:02:19.161	s3gljLYNmDGuaWpmdtToi04vkmFJk0hQ	2026-09-28 15:02:19.162	2026-09-28 15:02:19.162	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
TwjuChmg31dYzLXZZYVyr5sKiyMfXZSC	2026-10-05 15:02:53.45	dGEOLFDUbf54LUgveFSphhl9mNB5kka5	2026-09-28 15:02:53.451	2026-09-28 15:02:53.451	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
w3lH1tclh18HI1wAyUY4n1OsYH3xK58S	2026-10-05 15:05:28.413	e6XJMonnv9yCcI2LK0C5dUAAFCd6ugR6	2026-09-28 15:05:28.417	2026-09-28 15:05:28.417	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
YhG8BJlK8t9ut5EvYRaJ7GgDiDWcp4lz	2026-10-05 15:05:43.676	Xtaj1B1LQFozBuU9SO7m0Ygq7xBAAttf	2026-09-28 15:05:43.677	2026-09-28 15:05:43.677	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
4mFWvxMUgtGglNdJ06tVmbskXAYUpG2O	2026-10-05 15:30:13.528	3RAsJBR1Xh5pVFRgNebRdOqbwpxHfEER	2026-09-28 15:30:13.531	2026-09-28 15:30:13.531	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
OSS5IE7wxqqdaDbBDJc1ROrOlc1QMT7C	2026-10-05 15:32:47.37	hYaW086tVLtv1PQ0qgHSz4xv27mH1Qn0	2026-09-28 15:32:47.37	2026-09-28 15:32:47.37	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
N08TET3rXBUmDQAP1GA0530G6dS92Z9r	2026-10-05 15:33:31.17	bQe68wChIEz9G2wDyvqd0XBPJ7zWwKNY	2026-09-28 15:33:31.171	2026-09-28 15:33:31.171	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
FuSyIp5ZAkweBQvdnnimMVIT4ysL31ze	2026-10-05 15:34:31.11	ifxvdcQrUDC2LSwRn5Lb0rpPBoGACzBy	2026-09-28 15:34:31.111	2026-09-28 15:34:31.111	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
var1DUvaaB2oCTGmCLqFWnzGxUxCilQM	2026-10-05 15:45:27.196	AvT2ALq97Ry8RO3tAgKpYop39UEqElas	2026-09-28 15:45:27.198	2026-09-28 15:45:27.198	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
C7yH7BaYIhx0TTQaSstK9fBQyzMJ0c8a	2026-10-05 15:47:15.886	V0VX1JSyzz0KifjhWl7L7Zg0ZEzqEzhw	2026-09-28 15:47:15.887	2026-09-28 15:47:15.887	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
vT4VNgdiwkfC7SGmBMdljfWDMwO0mhgF	2026-10-05 15:50:25.598	TAJdpOeSNhfW50JNkMCa8iMWm9IAwxO7	2026-09-28 15:50:25.6	2026-09-28 15:50:25.6	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
OmaR0PV239E9vuXEAzjOS2P5U48mBcma	2026-10-05 15:51:48.646	uzgMc8gcEtNyO1m86TAJHnk2ib75GZSd	2026-09-28 15:51:48.652	2026-09-28 15:51:48.652	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
3DnUfS5ipCXFwQlkahxc9VBM1iCxgL9O	2026-10-06 15:10:45.382	RHE9bKEQWkRRs8Ixiy7rbwCghOFmtm6I	2026-09-29 15:10:45.387	2026-09-29 15:10:45.387	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
mc1Iut2FDvRCbian1W8spuAbl5N6pfZE	2026-10-06 15:11:06.405	xCIwRr6jna02Fe7QKHPoiS96a0jvE0Np	2026-09-29 15:11:06.406	2026-09-29 15:11:06.406	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
8Fx8rWbQC5Xm9b9honFxOKmMCuM15UBu	2026-10-06 15:11:57.63	ZspSscaWU3XJINAehQaRNLFkFkQ5Oyj9	2026-09-29 15:11:57.632	2026-09-29 15:11:57.632	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
PPdHj4v0HNf28lKpi1UDSLwjMSR4M76M	2026-10-06 15:13:26.678	6dDPjCQIYfm9jvAcuqJbpcvTw81ADqGQ	2026-09-29 15:13:26.679	2026-09-29 15:13:26.679	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
n2gdOGMr0ZvaqP2CmzVQzpW7kjPLjbLX	2026-10-06 15:13:36.724	cwuyba69wTpoTssA4obFNuHt0TwmENTi	2026-09-29 15:13:36.725	2026-09-29 15:13:36.725	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
E664n6mpbnVlmRroIq8zcLuCTsUnEewX	2026-10-06 15:14:16.271	rFuNLm6zEHpi1zSUzU5pk7ipPHQZXJlV	2026-09-29 15:14:16.271	2026-09-29 15:14:16.271	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
J49sxpfRNxosvFB24rl0Qd100KKlAyGM	2026-10-06 15:16:13.074	GdWKGcogEkeObKeCgZydxMO72CY2AwrL	2026-09-29 15:16:13.075	2026-09-29 15:16:13.075	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
2KBpDT5pFsHojLeBSMJ5pqAmwvroW02N	2026-10-06 15:25:57.85	cPn9hiU48P2elJr9ry24pbNVoNiOjEGb	2026-09-29 15:25:57.858	2026-09-29 15:25:57.858	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
ne9lwzfD8i6csPmr07bOE3PkGTRjcgOt	2026-10-06 15:28:53.595	cm08pYJ1iDX13Gn0RIlO7j2OMaHuLI9B	2026-09-29 15:28:53.596	2026-09-29 15:28:53.596	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
hgAULRpakN0M8zFBynP9S2DQWBJ3Ae71	2026-10-06 15:36:18.585	cJdJMKch6zdC8pb1CMSvZszgQrFvoLU0	2026-09-29 15:36:18.588	2026-09-29 15:36:18.588	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
ULvI4K6UnbuZE3QMNXbxWJqY5MPMr1ZO	2026-10-06 15:44:15.289	7h5k3mefk1459Uwbr401hMnFHS0tBIhR	2026-09-29 15:44:15.289	2026-09-29 15:44:15.289	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
B2U59CvUFmHi6bGhIyhM2X6z10OEQXTo	2026-10-06 15:27:49.206	hzRvYFMP3Epx2YhBb9KLSOeZu6ZN4GKe	2026-09-29 15:27:49.207	2026-09-29 15:27:49.207	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
p3HDZoc4FLovS4Je9wMjBlqwZpFfD4Fx	2026-10-06 15:28:37.613	VsQBsIyQFpI4cdzzqncUxmnMkl8UTxwU	2026-09-29 15:28:37.614	2026-09-29 15:28:37.614	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
eEUZ1WUvQoZav7QyEVysk477tM7NQBGM	2026-10-06 15:29:39.218	nWqkwAeqooRDeUiO7AcbgAMXz1iWYgCq	2026-09-29 15:29:39.219	2026-09-29 15:29:39.219	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
jy0KPRMejdNmj3iyJyCEScaBzSks2sLT	2026-10-06 15:36:42.242	S1dkgwhnXQzgEvGpj6iXiUgFy0KPMwoX	2026-09-29 15:36:42.242	2026-09-29 15:36:42.242	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
Cn0cf12SUgKcigt2jHAvptGzJGEk5Z0n	2026-10-06 15:44:28.163	PK6LVoKfTF13pkAAczY5zVvQW9BuSUvN	2026-09-29 15:44:28.163	2026-09-29 15:44:28.163	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
O31rIw9FjtguGKRFIDPvcfX4UBALRNJM	2026-10-06 15:45:08.868	IOwYGk8cg2f4psDN6wmV5Bzk7qfn5lxI	2026-09-29 15:45:08.868	2026-09-29 15:45:08.868	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36	ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	\N
87kgq6pGagVtGWFFAEbLC6w3WVBHiCxp	2026-10-13 13:27:55.124	4QVMDG3DfbKeWm0Zg0vOALDCfTIpldTg	2026-10-06 13:27:55.128	2026-10-06 13:27:55.128	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
\.


--
-- Data for Name: software; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.software (id, organization_id, name, total_licenses, created_at, updated_at, photo_mime_type) FROM stdin;
sw_mfc8dn692pimlpfzabcm	org_y0txnlv69l6vp70ey06b	AutoCAD	1	2026-09-01 14:49:14.460059	2026-09-01 18:39:18.725	image/webp
sw_uuxbrm7yzt80a59foag8	org_y0txnlv69l6vp70ey06b	[DEMO] AutoCAD demo	5	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N
\.


--
-- Data for Name: submission; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.submission (id, organization_id, assessment_id, enrollment_id, url, title, submitted_at, passed, feedback, corrected_at, corrected_by, reopened_at, reopened_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: teacher; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teacher (id, organization_id, name, created_at, updated_at, hourly_rate, photo_mime_type, email, title) FROM stdin;
tch_9pkz4o44hesymq4e6oqm	org_y0txnlv69l6vp70ey06b	Ximena Pereira	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_5licjxvsw0onlt4v1ghy	org_y0txnlv69l6vp70ey06b	Claudio Fortunato	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_2wg1x96c6zbtkxntp77c	org_y0txnlv69l6vp70ey06b	Nicolas Villarreal	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_0jizhz7uamo9bayglfxb	org_y0txnlv69l6vp70ey06b	Andres Del Castillo	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_m7bcgin75gimvphl7h4q	org_y0txnlv69l6vp70ey06b	Sandra Moros	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_tgh5y0gv4nn5ycny9lyw	org_y0txnlv69l6vp70ey06b	Fernan Luna	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N
tch_sl39f4ns1va4lo0oushl	org_y0txnlv69l6vp70ey06b	Ovidio Santos	2026-08-17 15:53:14.645896	2026-09-01 17:31:33.543	\N	\N	ovidio@cadit.uy	\N
tch_cjk87xea142wsnmdezy4	org_y0txnlv69l6vp70ey06b	[DEMO] Profesora Demo	2026-09-02 19:55:53.861376	2026-09-02 19:55:53.861376	\N	\N	profesor.demo@ejemplo.test	Arquitecta
\.


--
-- Data for Name: teacher_course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teacher_course (teacher_id, course_id, organization_id) FROM stdin;
\.


--
-- Data for Name: template; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.template (id, organization_id, name, language, category, body, status, rejection_reason, wa_template_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."user" (id, name, email, email_verified, image, created_at, updated_at, must_change_password) FROM stdin;
P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	Dev Local	dev@vocero.local	f	\N	2026-08-10 19:37:00.419	2026-08-10 19:37:00.419	f
lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	Soporte Uno	soporte@vocero.local	f	\N	2026-08-11 12:20:11.623	2026-08-11 12:20:11.623	f
7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	Verificación 005	verificacion005@vocero.local	f	\N	2026-08-11 12:46:48.595	2026-08-11 12:46:48.595	f
SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	Soporte Dos	soporte2@vocero.local	f	\N	2026-08-11 14:34:54.506	2026-08-11 14:34:54.506	f
osrQ0lXIfCOLYrSahugeSYTlpT3ksClr	Sebastián Fernández	sebastian@cadit.uy	f	\N	2026-09-07 17:55:40.315	2026-09-07 17:55:40.315	f
L5Rd42NmmROxqwZic1unHDnTdfYQU44R	[DEMO] Profesora Demo	profesor.demo@ejemplo.test	f	\N	2026-09-02 19:55:54.142	2026-09-02 19:55:54.142	t
ipilgzW7mWHgLj5g4aN7wu47dyapvNh9	[DEMO] Alumno Demo	alumno.demo@ejemplo.test	f	\N	2026-09-02 19:55:54.068	2026-09-02 19:55:54.068	t
tP9McvnEVoXRu3ZQ3o0FJ0WOBwW74TQi	Ovidio Santos	ovidio@cadit.uy	f	\N	2026-09-01 14:07:15.319	2026-09-01 14:07:15.319	t
JyIwiVIwIHD1pFLsscjWRCz3ZgIikiGE	Emanuel Silva Pintos	esilvapintos@gmail.com	f	\N	2026-09-02 14:39:55.689	2026-09-02 14:39:55.689	t
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.verification (id, identifier, value, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: virtual_room; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.virtual_room (id, organization_id, name, url, account_email, notes, archived_at, created_at, updated_at) FROM stdin;
aula_nmxgmvavq9h0hz8fkoi7	org_y0txnlv69l6vp70ey06b	Zoom 1	https://zoom.us/j/1000000001	cuenta1@cadit.uy	\N	\N	2026-09-02 19:26:01.318627	2026-09-02 19:26:01.318627
aula_61p4qaztzddhyncpfioo	org_y0txnlv69l6vp70ey06b	Zoom 2	https://zoom.us/j/1000000002	cuenta2@cadit.uy	\N	\N	2026-09-02 19:26:01.383995	2026-09-02 19:26:01.383995
aula_g2xkghmg5hx937s4xkyi	org_y0txnlv69l6vp70ey06b	[DEMO] Sala de prueba	https://zoom.us/j/00000000000	demo@ejemplo.test	Creada por pnpm demo-camada. Se borra con `borrar`.	2026-09-08 19:09:19.455	2026-09-02 19:55:53.861376	2026-09-08 19:09:19.455
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 50, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: postgres
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: account_link account_link_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: agent_profile agent_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_profile
    ADD CONSTRAINT agent_profile_pkey PRIMARY KEY (id);


--
-- Name: agent_test_case agent_test_case_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_case
    ADD CONSTRAINT agent_test_case_pkey PRIMARY KEY (id);


--
-- Name: agent_test_run agent_test_run_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_run
    ADD CONSTRAINT agent_test_run_pkey PRIMARY KEY (id);


--
-- Name: announcement announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_pkey PRIMARY KEY (id);


--
-- Name: assessment_extension assessment_extension_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_extension
    ADD CONSTRAINT assessment_extension_pkey PRIMARY KEY (id);


--
-- Name: assessment assessment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment
    ADD CONSTRAINT assessment_pkey PRIMARY KEY (id);


--
-- Name: assessment_result assessment_result_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_result
    ADD CONSTRAINT assessment_result_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: automation_rule automation_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_rule
    ADD CONSTRAINT automation_rule_pkey PRIMARY KEY (id);


--
-- Name: bulk_send_recipient bulk_send_recipient_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_recipient
    ADD CONSTRAINT bulk_send_recipient_pkey PRIMARY KEY (id);


--
-- Name: bulk_send_run bulk_send_run_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_run
    ADD CONSTRAINT bulk_send_run_pkey PRIMARY KEY (id);


--
-- Name: certificate certificate_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_code_unique UNIQUE (code);


--
-- Name: certificate certificate_enrollment_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_enrollment_id_unique UNIQUE (enrollment_id);


--
-- Name: certificate certificate_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_pkey PRIMARY KEY (id);


--
-- Name: class_session class_session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_session
    ADD CONSTRAINT class_session_pkey PRIMARY KEY (id);


--
-- Name: cohort cohort_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_pkey PRIMARY KEY (id);


--
-- Name: cohort_software cohort_software_cohort_id_software_id_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort_software
    ADD CONSTRAINT cohort_software_cohort_id_software_id_pk PRIMARY KEY (cohort_id, software_id);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);


--
-- Name: course_category course_category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_category
    ADD CONSTRAINT course_category_pkey PRIMARY KEY (id);


--
-- Name: course_module course_module_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_module
    ADD CONSTRAINT course_module_pkey PRIMARY KEY (id);


--
-- Name: course course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_pkey PRIMARY KEY (id);


--
-- Name: enrollment enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_pkey PRIMARY KEY (id);


--
-- Name: installment installment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.installment
    ADD CONSTRAINT installment_pkey PRIMARY KEY (id);


--
-- Name: intake_form intake_form_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.intake_form
    ADD CONSTRAINT intake_form_pkey PRIMARY KEY (id);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: kb_entry kb_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kb_entry
    ADD CONSTRAINT kb_entry_pkey PRIMARY KEY (id);


--
-- Name: license license_enrollment_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_enrollment_id_unique UNIQUE (enrollment_id);


--
-- Name: license license_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_pkey PRIMARY KEY (id);


--
-- Name: media_asset media_asset_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: message message_wa_message_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_wa_message_id_unique UNIQUE (wa_message_id);


--
-- Name: meta_credentials meta_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_credentials
    ADD CONSTRAINT meta_credentials_pkey PRIMARY KEY (id);


--
-- Name: offline_answer offline_answer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_answer
    ADD CONSTRAINT offline_answer_pkey PRIMARY KEY (id);


--
-- Name: offline_course_access offline_course_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_pkey PRIMARY KEY (id);


--
-- Name: offline_course offline_course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course
    ADD CONSTRAINT offline_course_pkey PRIMARY KEY (id);


--
-- Name: offline_lesson offline_lesson_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_lesson
    ADD CONSTRAINT offline_lesson_pkey PRIMARY KEY (id);


--
-- Name: offline_question offline_question_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_question
    ADD CONSTRAINT offline_question_pkey PRIMARY KEY (id);


--
-- Name: offline_quiz_attempt offline_quiz_attempt_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz_attempt
    ADD CONSTRAINT offline_quiz_attempt_pkey PRIMARY KEY (id);


--
-- Name: offline_quiz offline_quiz_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz
    ADD CONSTRAINT offline_quiz_pkey PRIMARY KEY (id);


--
-- Name: offline_recognition offline_recognition_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_pkey PRIMARY KEY (id);


--
-- Name: offline_topic offline_topic_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic
    ADD CONSTRAINT offline_topic_pkey PRIMARY KEY (id);


--
-- Name: offline_topic_progress offline_topic_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic_progress
    ADD CONSTRAINT offline_topic_progress_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization organization_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_slug_unique UNIQUE (slug);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stage pipeline_stage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_stage
    ADD CONSTRAINT pipeline_stage_pkey PRIMARY KEY (id);


--
-- Name: resource resource_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_pkey PRIMARY KEY (id);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);


--
-- Name: seller seller_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller
    ADD CONSTRAINT seller_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: software software_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.software
    ADD CONSTRAINT software_pkey PRIMARY KEY (id);


--
-- Name: submission submission_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_pkey PRIMARY KEY (id);


--
-- Name: teacher_course teacher_course_teacher_id_course_id_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_course
    ADD CONSTRAINT teacher_course_teacher_id_course_id_pk PRIMARY KEY (teacher_id, course_id);


--
-- Name: teacher teacher_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher
    ADD CONSTRAINT teacher_pkey PRIMARY KEY (id);


--
-- Name: template template_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_pkey PRIMARY KEY (id);


--
-- Name: user user_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: virtual_room virtual_room_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.virtual_room
    ADD CONSTRAINT virtual_room_pkey PRIMARY KEY (id);


--
-- Name: account_link_org_contact_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_link_org_contact_idx ON public.account_link USING btree (organization_id, contact_id);


--
-- Name: account_link_org_teacher_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_link_org_teacher_idx ON public.account_link USING btree (organization_id, teacher_id);


--
-- Name: account_link_org_user_kind_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_link_org_user_kind_uq ON public.account_link USING btree (organization_id, user_id, kind);


--
-- Name: agent_profile_org_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_profile_org_uq ON public.agent_profile USING btree (organization_id);


--
-- Name: announcement_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX announcement_org_cohort_idx ON public.announcement USING btree (organization_id, cohort_id, created_at);


--
-- Name: assessment_extension_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assessment_extension_org_enrollment_idx ON public.assessment_extension USING btree (organization_id, enrollment_id);


--
-- Name: assessment_extension_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX assessment_extension_uq ON public.assessment_extension USING btree (assessment_id, enrollment_id);


--
-- Name: assessment_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assessment_org_cohort_idx ON public.assessment USING btree (organization_id, cohort_id, "position");


--
-- Name: assessment_result_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX assessment_result_org_enrollment_idx ON public.assessment_result USING btree (organization_id, enrollment_id);


--
-- Name: assessment_result_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX assessment_result_uq ON public.assessment_result USING btree (assessment_id, enrollment_id);


--
-- Name: attendance_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX attendance_org_enrollment_idx ON public.attendance USING btree (organization_id, enrollment_id);


--
-- Name: attendance_session_enrollment_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX attendance_session_enrollment_uq ON public.attendance USING btree (class_session_id, enrollment_id);


--
-- Name: automation_rule_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX automation_rule_org_idx ON public.automation_rule USING btree (organization_id);


--
-- Name: bulk_send_recipient_org_run_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bulk_send_recipient_org_run_idx ON public.bulk_send_recipient USING btree (organization_id, run_id, "position");


--
-- Name: bulk_send_run_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bulk_send_run_org_cohort_idx ON public.bulk_send_run USING btree (organization_id, cohort_id, kind);


--
-- Name: certificate_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX certificate_org_idx ON public.certificate USING btree (organization_id);


--
-- Name: class_session_cohort_number_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX class_session_cohort_number_uq ON public.class_session USING btree (organization_id, cohort_id, number);


--
-- Name: class_session_org_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX class_session_org_date_idx ON public.class_session USING btree (organization_id, date);


--
-- Name: cohort_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cohort_org_course_idx ON public.cohort USING btree (organization_id, course_id);


--
-- Name: cohort_org_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cohort_org_parent_idx ON public.cohort USING btree (organization_id, parent_cohort_id, "position");


--
-- Name: cohort_software_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cohort_software_org_idx ON public.cohort_software USING btree (organization_id);


--
-- Name: cohort_software_software_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cohort_software_software_idx ON public.cohort_software USING btree (software_id);


--
-- Name: cohort_teacher_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cohort_teacher_idx ON public.cohort USING btree (teacher_id);


--
-- Name: company_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX company_org_idx ON public.company USING btree (organization_id);


--
-- Name: contact_org_email_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX contact_org_email_uq ON public.contact USING btree (organization_id, email) WHERE (email IS NOT NULL);


--
-- Name: contact_org_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX contact_org_name_idx ON public.contact USING btree (organization_id, first_name);


--
-- Name: contact_org_phone_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX contact_org_phone_uq ON public.contact USING btree (organization_id, phone) WHERE (phone IS NOT NULL);


--
-- Name: contact_org_wa_identity_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX contact_org_wa_identity_uq ON public.contact USING btree (organization_id, wa_identity);


--
-- Name: contact_org_wa_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX contact_org_wa_user_id_idx ON public.contact USING btree (organization_id, wa_user_id);


--
-- Name: conversation_org_contact_real_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX conversation_org_contact_real_uq ON public.conversation USING btree (organization_id, contact_id) WHERE (is_test = false);


--
-- Name: conversation_org_last_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX conversation_org_last_idx ON public.conversation USING btree (organization_id, last_message_at);


--
-- Name: course_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX course_category_idx ON public.course USING btree (category_id);


--
-- Name: course_category_org_slug_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX course_category_org_slug_uq ON public.course_category USING btree (organization_id, slug);


--
-- Name: course_module_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX course_module_course_idx ON public.course_module USING btree (organization_id, course_id, "position");


--
-- Name: course_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX course_org_idx ON public.course USING btree (organization_id);


--
-- Name: course_org_slug_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX course_org_slug_uq ON public.course USING btree (organization_id, slug);


--
-- Name: enrollment_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_company_idx ON public.enrollment USING btree (company_id);


--
-- Name: enrollment_contact_cohort_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX enrollment_contact_cohort_uq ON public.enrollment USING btree (contact_id, cohort_id) WHERE (cohort_id IS NOT NULL);


--
-- Name: enrollment_contact_general_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX enrollment_contact_general_uq ON public.enrollment USING btree (contact_id) WHERE (cohort_id IS NULL);


--
-- Name: enrollment_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_org_cohort_idx ON public.enrollment USING btree (organization_id, cohort_id);


--
-- Name: enrollment_org_interest_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_org_interest_course_idx ON public.enrollment USING btree (organization_id, interest_course_id);


--
-- Name: enrollment_org_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_org_parent_idx ON public.enrollment USING btree (organization_id, parent_enrollment_id);


--
-- Name: enrollment_org_stage_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_org_stage_idx ON public.enrollment USING btree (organization_id, stage_id, "position");


--
-- Name: enrollment_seller_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX enrollment_seller_idx ON public.enrollment USING btree (seller_id);


--
-- Name: installment_enrollment_number_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX installment_enrollment_number_uq ON public.installment USING btree (organization_id, enrollment_id, number);


--
-- Name: installment_org_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX installment_org_due_idx ON public.installment USING btree (organization_id, due_date);


--
-- Name: intake_form_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX intake_form_org_idx ON public.intake_form USING btree (organization_id);


--
-- Name: kb_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX kb_org_idx ON public.kb_entry USING btree (organization_id);


--
-- Name: license_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX license_org_idx ON public.license USING btree (organization_id);


--
-- Name: license_software_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX license_software_idx ON public.license USING btree (software_id);


--
-- Name: media_asset_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX media_asset_org_idx ON public.media_asset USING btree (organization_id, created_at);


--
-- Name: media_asset_wa_media_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX media_asset_wa_media_idx ON public.media_asset USING btree (wa_media_id);


--
-- Name: message_org_conv_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX message_org_conv_idx ON public.message USING btree (organization_id, conversation_id, created_at);


--
-- Name: meta_credentials_org_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX meta_credentials_org_uq ON public.meta_credentials USING btree (organization_id);


--
-- Name: meta_credentials_phone_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX meta_credentials_phone_uq ON public.meta_credentials USING btree (phone_number_id);


--
-- Name: offline_answer_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_answer_org_legacy_uq ON public.offline_answer USING btree (organization_id, legacy_ref);


--
-- Name: offline_answer_org_question_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_answer_org_question_idx ON public.offline_answer USING btree (organization_id, question_id, "position");


--
-- Name: offline_course_access_cohort_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_course_access_cohort_uq ON public.offline_course_access USING btree (cohort_id, offline_course_id) WHERE (cohort_id IS NOT NULL);


--
-- Name: offline_course_access_enrollment_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_course_access_enrollment_uq ON public.offline_course_access USING btree (enrollment_id, offline_course_id) WHERE (enrollment_id IS NOT NULL);


--
-- Name: offline_course_access_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_course_access_org_cohort_idx ON public.offline_course_access USING btree (organization_id, cohort_id);


--
-- Name: offline_course_access_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_course_access_org_course_idx ON public.offline_course_access USING btree (organization_id, offline_course_id);


--
-- Name: offline_course_access_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_course_access_org_enrollment_idx ON public.offline_course_access USING btree (organization_id, enrollment_id);


--
-- Name: offline_course_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_course_org_legacy_uq ON public.offline_course USING btree (organization_id, legacy_ref);


--
-- Name: offline_course_org_title_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_course_org_title_idx ON public.offline_course USING btree (organization_id, title);


--
-- Name: offline_lesson_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_lesson_org_course_idx ON public.offline_lesson USING btree (organization_id, course_id, "position");


--
-- Name: offline_lesson_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_lesson_org_legacy_uq ON public.offline_lesson USING btree (organization_id, legacy_ref);


--
-- Name: offline_question_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_question_org_legacy_uq ON public.offline_question USING btree (organization_id, legacy_ref);


--
-- Name: offline_question_org_quiz_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_question_org_quiz_idx ON public.offline_question USING btree (organization_id, quiz_id, "position");


--
-- Name: offline_quiz_attempt_org_contact_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_quiz_attempt_org_contact_idx ON public.offline_quiz_attempt USING btree (organization_id, contact_id, quiz_id);


--
-- Name: offline_quiz_attempt_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_quiz_attempt_org_enrollment_idx ON public.offline_quiz_attempt USING btree (organization_id, enrollment_id);


--
-- Name: offline_quiz_attempt_quiz_contact_number_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_quiz_attempt_quiz_contact_number_uq ON public.offline_quiz_attempt USING btree (quiz_id, contact_id, attempt_number);


--
-- Name: offline_quiz_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_quiz_org_course_idx ON public.offline_quiz USING btree (organization_id, course_id, "position");


--
-- Name: offline_quiz_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_quiz_org_legacy_uq ON public.offline_quiz USING btree (organization_id, legacy_ref);


--
-- Name: offline_recognition_course_active_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_recognition_course_active_uq ON public.offline_recognition USING btree (contact_id, course_id) WHERE ((lesson_id IS NULL) AND (revoked_at IS NULL));


--
-- Name: offline_recognition_lesson_active_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_recognition_lesson_active_uq ON public.offline_recognition USING btree (contact_id, lesson_id) WHERE ((lesson_id IS NOT NULL) AND (revoked_at IS NULL));


--
-- Name: offline_recognition_org_contact_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_recognition_org_contact_idx ON public.offline_recognition USING btree (organization_id, contact_id, course_id);


--
-- Name: offline_recognition_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_recognition_org_course_idx ON public.offline_recognition USING btree (organization_id, course_id);


--
-- Name: offline_recognition_org_lesson_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_recognition_org_lesson_idx ON public.offline_recognition USING btree (organization_id, lesson_id);


--
-- Name: offline_topic_org_legacy_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_topic_org_legacy_uq ON public.offline_topic USING btree (organization_id, legacy_ref);


--
-- Name: offline_topic_org_lesson_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_topic_org_lesson_idx ON public.offline_topic USING btree (organization_id, lesson_id, "position");


--
-- Name: offline_topic_progress_contact_topic_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_topic_progress_contact_topic_uq ON public.offline_topic_progress USING btree (contact_id, topic_id);


--
-- Name: offline_topic_progress_org_contact_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_topic_progress_org_contact_idx ON public.offline_topic_progress USING btree (organization_id, contact_id);


--
-- Name: offline_topic_progress_org_topic_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_topic_progress_org_topic_idx ON public.offline_topic_progress USING btree (organization_id, topic_id);


--
-- Name: payment_org_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_org_enrollment_idx ON public.payment USING btree (organization_id, enrollment_id);


--
-- Name: payment_org_idempotency_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payment_org_idempotency_uq ON public.payment USING btree (organization_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: payment_org_paid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX payment_org_paid_idx ON public.payment USING btree (organization_id, paid_at);


--
-- Name: resource_org_class_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX resource_org_class_idx ON public.resource USING btree (organization_id, class_session_id);


--
-- Name: resource_org_cohort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX resource_org_cohort_idx ON public.resource USING btree (organization_id, cohort_id);


--
-- Name: resource_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX resource_org_course_idx ON public.resource USING btree (organization_id, course_id);


--
-- Name: role_org_key_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX role_org_key_uq ON public.role USING btree (organization_id, key);


--
-- Name: seller_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX seller_org_idx ON public.seller USING btree (organization_id);


--
-- Name: seller_org_user_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX seller_org_user_uq ON public.seller USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: software_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX software_org_idx ON public.software USING btree (organization_id);


--
-- Name: stage_org_pos_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX stage_org_pos_idx ON public.pipeline_stage USING btree (organization_id, "position");


--
-- Name: submission_abierta_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX submission_abierta_uq ON public.submission USING btree (assessment_id, enrollment_id) WHERE ((corrected_at IS NULL) AND (reopened_at IS NULL));


--
-- Name: submission_org_assessment_enrollment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX submission_org_assessment_enrollment_idx ON public.submission USING btree (organization_id, assessment_id, enrollment_id, submitted_at);


--
-- Name: submission_org_assessment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX submission_org_assessment_idx ON public.submission USING btree (organization_id, assessment_id);


--
-- Name: teacher_course_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX teacher_course_course_idx ON public.teacher_course USING btree (course_id);


--
-- Name: teacher_course_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX teacher_course_org_idx ON public.teacher_course USING btree (organization_id);


--
-- Name: teacher_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX teacher_org_idx ON public.teacher USING btree (organization_id);


--
-- Name: template_org_name_lang_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX template_org_name_lang_uq ON public.template USING btree (organization_id, name, language);


--
-- Name: test_case_run_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX test_case_run_idx ON public.agent_test_case USING btree (run_id);


--
-- Name: test_run_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX test_run_org_idx ON public.agent_test_run USING btree (organization_id, started_at);


--
-- Name: test_run_org_running_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX test_run_org_running_uq ON public.agent_test_run USING btree (organization_id) WHERE (status = 'running'::text);


--
-- Name: virtual_room_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX virtual_room_org_idx ON public.virtual_room USING btree (organization_id);


--
-- Name: virtual_room_org_name_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX virtual_room_org_name_uq ON public.virtual_room USING btree (organization_id, name);


--
-- Name: account_link account_link_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: account_link account_link_invitation_email_sent_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_invitation_email_sent_by_user_id_fk FOREIGN KEY (invitation_email_sent_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: account_link account_link_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: account_link account_link_teacher_id_teacher_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_teacher_id_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES public.teacher(id) ON DELETE CASCADE;


--
-- Name: account_link account_link_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: account account_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: agent_profile agent_profile_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_profile
    ADD CONSTRAINT agent_profile_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: agent_test_case agent_test_case_conversation_id_conversation_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_case
    ADD CONSTRAINT agent_test_case_conversation_id_conversation_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE SET NULL;


--
-- Name: agent_test_case agent_test_case_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_case
    ADD CONSTRAINT agent_test_case_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: agent_test_case agent_test_case_run_id_agent_test_run_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_case
    ADD CONSTRAINT agent_test_case_run_id_agent_test_run_id_fk FOREIGN KEY (run_id) REFERENCES public.agent_test_run(id) ON DELETE CASCADE;


--
-- Name: agent_test_run agent_test_run_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_test_run
    ADD CONSTRAINT agent_test_run_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: announcement announcement_author_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_author_user_id_user_id_fk FOREIGN KEY (author_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: announcement announcement_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: announcement announcement_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: assessment assessment_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment
    ADD CONSTRAINT assessment_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: assessment_extension assessment_extension_assessment_id_assessment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_extension
    ADD CONSTRAINT assessment_extension_assessment_id_assessment_id_fk FOREIGN KEY (assessment_id) REFERENCES public.assessment(id) ON DELETE CASCADE;


--
-- Name: assessment_extension assessment_extension_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_extension
    ADD CONSTRAINT assessment_extension_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: assessment_extension assessment_extension_granted_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_extension
    ADD CONSTRAINT assessment_extension_granted_by_user_id_fk FOREIGN KEY (granted_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: assessment_extension assessment_extension_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_extension
    ADD CONSTRAINT assessment_extension_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: assessment assessment_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment
    ADD CONSTRAINT assessment_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: assessment_result assessment_result_assessment_id_assessment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_result
    ADD CONSTRAINT assessment_result_assessment_id_assessment_id_fk FOREIGN KEY (assessment_id) REFERENCES public.assessment(id) ON DELETE CASCADE;


--
-- Name: assessment_result assessment_result_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_result
    ADD CONSTRAINT assessment_result_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: assessment_result assessment_result_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_result
    ADD CONSTRAINT assessment_result_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: assessment_result assessment_result_recorded_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assessment_result
    ADD CONSTRAINT assessment_result_recorded_by_user_id_fk FOREIGN KEY (recorded_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_class_session_id_class_session_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_session_id_class_session_id_fk FOREIGN KEY (class_session_id) REFERENCES public.class_session(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_recorded_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_recorded_by_user_id_fk FOREIGN KEY (recorded_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: automation_rule automation_rule_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_rule
    ADD CONSTRAINT automation_rule_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: bulk_send_recipient bulk_send_recipient_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_recipient
    ADD CONSTRAINT bulk_send_recipient_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: bulk_send_recipient bulk_send_recipient_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_recipient
    ADD CONSTRAINT bulk_send_recipient_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: bulk_send_recipient bulk_send_recipient_run_id_bulk_send_run_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_recipient
    ADD CONSTRAINT bulk_send_recipient_run_id_bulk_send_run_id_fk FOREIGN KEY (run_id) REFERENCES public.bulk_send_run(id) ON DELETE CASCADE;


--
-- Name: bulk_send_run bulk_send_run_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_run
    ADD CONSTRAINT bulk_send_run_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: bulk_send_run bulk_send_run_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_run
    ADD CONSTRAINT bulk_send_run_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: bulk_send_run bulk_send_run_started_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bulk_send_run
    ADD CONSTRAINT bulk_send_run_started_by_user_id_fk FOREIGN KEY (started_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: certificate certificate_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: certificate certificate_issued_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_issued_by_user_id_fk FOREIGN KEY (issued_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: certificate certificate_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: certificate certificate_revoked_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.certificate
    ADD CONSTRAINT certificate_revoked_by_user_id_fk FOREIGN KEY (revoked_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: class_session class_session_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_session
    ADD CONSTRAINT class_session_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: class_session class_session_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_session
    ADD CONSTRAINT class_session_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: class_session class_session_teacher_id_teacher_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_session
    ADD CONSTRAINT class_session_teacher_id_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES public.teacher(id) ON DELETE SET NULL;


--
-- Name: class_session class_session_virtual_room_id_virtual_room_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_session
    ADD CONSTRAINT class_session_virtual_room_id_virtual_room_id_fk FOREIGN KEY (virtual_room_id) REFERENCES public.virtual_room(id) ON DELETE SET NULL;


--
-- Name: cohort cohort_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_course_id_course_id_fk FOREIGN KEY (course_id) REFERENCES public.course(id) ON DELETE RESTRICT;


--
-- Name: cohort cohort_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: cohort cohort_parent_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_parent_cohort_id_cohort_id_fk FOREIGN KEY (parent_cohort_id) REFERENCES public.cohort(id) ON DELETE RESTRICT;


--
-- Name: cohort_software cohort_software_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort_software
    ADD CONSTRAINT cohort_software_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: cohort_software cohort_software_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort_software
    ADD CONSTRAINT cohort_software_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: cohort_software cohort_software_software_id_software_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort_software
    ADD CONSTRAINT cohort_software_software_id_software_id_fk FOREIGN KEY (software_id) REFERENCES public.software(id) ON DELETE RESTRICT;


--
-- Name: cohort cohort_teacher_id_teacher_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_teacher_id_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES public.teacher(id) ON DELETE SET NULL;


--
-- Name: cohort cohort_virtual_room_id_virtual_room_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cohort
    ADD CONSTRAINT cohort_virtual_room_id_virtual_room_id_fk FOREIGN KEY (virtual_room_id) REFERENCES public.virtual_room(id) ON DELETE SET NULL;


--
-- Name: company company_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: contact contact_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: conversation conversation_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: conversation conversation_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: course course_category_id_course_category_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_category_id_course_category_id_fk FOREIGN KEY (category_id) REFERENCES public.course_category(id) ON DELETE SET NULL;


--
-- Name: course_category course_category_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_category
    ADD CONSTRAINT course_category_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: course_module course_module_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_module
    ADD CONSTRAINT course_module_course_id_course_id_fk FOREIGN KEY (course_id) REFERENCES public.course(id) ON DELETE CASCADE;


--
-- Name: course_module course_module_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course_module
    ADD CONSTRAINT course_module_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: course course_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: enrollment enrollment_attendance_waiver_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_attendance_waiver_by_user_id_fk FOREIGN KEY (attendance_waiver_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: enrollment enrollment_attendance_waiver_revoked_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_attendance_waiver_revoked_by_user_id_fk FOREIGN KEY (attendance_waiver_revoked_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: enrollment enrollment_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE RESTRICT;


--
-- Name: enrollment enrollment_company_id_company_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_company_id_company_id_fk FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE RESTRICT;


--
-- Name: enrollment enrollment_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: enrollment enrollment_interest_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_interest_course_id_course_id_fk FOREIGN KEY (interest_course_id) REFERENCES public.course(id) ON DELETE SET NULL;


--
-- Name: enrollment enrollment_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: enrollment enrollment_parent_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_parent_enrollment_id_enrollment_id_fk FOREIGN KEY (parent_enrollment_id) REFERENCES public.enrollment(id) ON DELETE RESTRICT;


--
-- Name: enrollment enrollment_seller_id_seller_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_seller_id_seller_id_fk FOREIGN KEY (seller_id) REFERENCES public.seller(id) ON DELETE SET NULL;


--
-- Name: enrollment enrollment_stage_id_pipeline_stage_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_stage_id_pipeline_stage_id_fk FOREIGN KEY (stage_id) REFERENCES public.pipeline_stage(id);


--
-- Name: installment installment_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.installment
    ADD CONSTRAINT installment_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: installment installment_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.installment
    ADD CONSTRAINT installment_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: intake_form intake_form_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.intake_form
    ADD CONSTRAINT intake_form_course_id_course_id_fk FOREIGN KEY (course_id) REFERENCES public.course(id) ON DELETE SET NULL;


--
-- Name: intake_form intake_form_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.intake_form
    ADD CONSTRAINT intake_form_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_inviter_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_inviter_id_user_id_fk FOREIGN KEY (inviter_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: kb_entry kb_entry_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kb_entry
    ADD CONSTRAINT kb_entry_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: license license_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: license license_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: license license_software_id_software_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.license
    ADD CONSTRAINT license_software_id_software_id_fk FOREIGN KEY (software_id) REFERENCES public.software(id) ON DELETE RESTRICT;


--
-- Name: media_asset media_asset_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.media_asset
    ADD CONSTRAINT media_asset_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: member member_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: member member_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: message message_conversation_id_conversation_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_conversation_id_conversation_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversation(id) ON DELETE CASCADE;


--
-- Name: message message_media_asset_id_media_asset_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id) REFERENCES public.media_asset(id) ON DELETE SET NULL;


--
-- Name: message message_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: meta_credentials meta_credentials_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_credentials
    ADD CONSTRAINT meta_credentials_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_answer offline_answer_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_answer
    ADD CONSTRAINT offline_answer_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_answer offline_answer_question_id_offline_question_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_answer
    ADD CONSTRAINT offline_answer_question_id_offline_question_id_fk FOREIGN KEY (question_id) REFERENCES public.offline_question(id) ON DELETE CASCADE;


--
-- Name: offline_course_access offline_course_access_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: offline_course_access offline_course_access_created_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_created_by_user_id_fk FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: offline_course_access offline_course_access_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: offline_course_access offline_course_access_offline_course_id_offline_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_offline_course_id_offline_course_id_fk FOREIGN KEY (offline_course_id) REFERENCES public.offline_course(id) ON DELETE CASCADE;


--
-- Name: offline_course_access offline_course_access_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course_access
    ADD CONSTRAINT offline_course_access_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_course offline_course_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_course
    ADD CONSTRAINT offline_course_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_lesson offline_lesson_course_id_offline_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_lesson
    ADD CONSTRAINT offline_lesson_course_id_offline_course_id_fk FOREIGN KEY (course_id) REFERENCES public.offline_course(id) ON DELETE CASCADE;


--
-- Name: offline_lesson offline_lesson_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_lesson
    ADD CONSTRAINT offline_lesson_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_question offline_question_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_question
    ADD CONSTRAINT offline_question_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_question offline_question_quiz_id_offline_quiz_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_question
    ADD CONSTRAINT offline_question_quiz_id_offline_quiz_id_fk FOREIGN KEY (quiz_id) REFERENCES public.offline_quiz(id) ON DELETE CASCADE;


--
-- Name: offline_quiz_attempt offline_quiz_attempt_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz_attempt
    ADD CONSTRAINT offline_quiz_attempt_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: offline_quiz_attempt offline_quiz_attempt_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz_attempt
    ADD CONSTRAINT offline_quiz_attempt_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: offline_quiz_attempt offline_quiz_attempt_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz_attempt
    ADD CONSTRAINT offline_quiz_attempt_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_quiz_attempt offline_quiz_attempt_quiz_id_offline_quiz_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz_attempt
    ADD CONSTRAINT offline_quiz_attempt_quiz_id_offline_quiz_id_fk FOREIGN KEY (quiz_id) REFERENCES public.offline_quiz(id) ON DELETE CASCADE;


--
-- Name: offline_quiz offline_quiz_course_id_offline_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz
    ADD CONSTRAINT offline_quiz_course_id_offline_course_id_fk FOREIGN KEY (course_id) REFERENCES public.offline_course(id) ON DELETE CASCADE;


--
-- Name: offline_quiz offline_quiz_lesson_id_offline_lesson_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz
    ADD CONSTRAINT offline_quiz_lesson_id_offline_lesson_id_fk FOREIGN KEY (lesson_id) REFERENCES public.offline_lesson(id) ON DELETE SET NULL;


--
-- Name: offline_quiz offline_quiz_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_quiz
    ADD CONSTRAINT offline_quiz_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_recognition offline_recognition_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: offline_recognition offline_recognition_course_id_offline_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_course_id_offline_course_id_fk FOREIGN KEY (course_id) REFERENCES public.offline_course(id) ON DELETE CASCADE;


--
-- Name: offline_recognition offline_recognition_lesson_id_offline_lesson_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_lesson_id_offline_lesson_id_fk FOREIGN KEY (lesson_id) REFERENCES public.offline_lesson(id) ON DELETE CASCADE;


--
-- Name: offline_recognition offline_recognition_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_recognition offline_recognition_recognized_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_recognized_by_user_id_fk FOREIGN KEY (recognized_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: offline_recognition offline_recognition_revoked_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_recognition
    ADD CONSTRAINT offline_recognition_revoked_by_user_id_fk FOREIGN KEY (revoked_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: offline_topic offline_topic_lesson_id_offline_lesson_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic
    ADD CONSTRAINT offline_topic_lesson_id_offline_lesson_id_fk FOREIGN KEY (lesson_id) REFERENCES public.offline_lesson(id) ON DELETE CASCADE;


--
-- Name: offline_topic offline_topic_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic
    ADD CONSTRAINT offline_topic_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_topic_progress offline_topic_progress_completed_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic_progress
    ADD CONSTRAINT offline_topic_progress_completed_by_user_id_fk FOREIGN KEY (completed_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: offline_topic_progress offline_topic_progress_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic_progress
    ADD CONSTRAINT offline_topic_progress_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: offline_topic_progress offline_topic_progress_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic_progress
    ADD CONSTRAINT offline_topic_progress_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: offline_topic_progress offline_topic_progress_topic_id_offline_topic_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_topic_progress
    ADD CONSTRAINT offline_topic_progress_topic_id_offline_topic_id_fk FOREIGN KEY (topic_id) REFERENCES public.offline_topic(id) ON DELETE CASCADE;


--
-- Name: payment payment_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: payment payment_installment_id_installment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_installment_id_installment_id_fk FOREIGN KEY (installment_id) REFERENCES public.installment(id) ON DELETE SET NULL;


--
-- Name: payment payment_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: payment payment_recorded_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_recorded_by_user_id_fk FOREIGN KEY (recorded_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: payment payment_voided_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_voided_by_user_id_fk FOREIGN KEY (voided_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: pipeline_stage pipeline_stage_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pipeline_stage
    ADD CONSTRAINT pipeline_stage_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: resource resource_class_session_id_class_session_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_class_session_id_class_session_id_fk FOREIGN KEY (class_session_id) REFERENCES public.class_session(id) ON DELETE CASCADE;


--
-- Name: resource resource_cohort_id_cohort_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_cohort_id_cohort_id_fk FOREIGN KEY (cohort_id) REFERENCES public.cohort(id) ON DELETE CASCADE;


--
-- Name: resource resource_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_course_id_course_id_fk FOREIGN KEY (course_id) REFERENCES public.course(id) ON DELETE CASCADE;


--
-- Name: resource resource_course_module_id_course_module_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_course_module_id_course_module_id_fk FOREIGN KEY (course_module_id) REFERENCES public.course_module(id) ON DELETE SET NULL;


--
-- Name: resource resource_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: role role_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: seller seller_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller
    ADD CONSTRAINT seller_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: seller seller_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seller
    ADD CONSTRAINT seller_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: session session_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: software software_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.software
    ADD CONSTRAINT software_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: submission submission_assessment_id_assessment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_assessment_id_assessment_id_fk FOREIGN KEY (assessment_id) REFERENCES public.assessment(id) ON DELETE CASCADE;


--
-- Name: submission submission_corrected_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_corrected_by_user_id_fk FOREIGN KEY (corrected_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: submission submission_enrollment_id_enrollment_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_enrollment_id_enrollment_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollment(id) ON DELETE CASCADE;


--
-- Name: submission submission_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: submission submission_reopened_by_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submission
    ADD CONSTRAINT submission_reopened_by_user_id_fk FOREIGN KEY (reopened_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: teacher_course teacher_course_course_id_course_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_course
    ADD CONSTRAINT teacher_course_course_id_course_id_fk FOREIGN KEY (course_id) REFERENCES public.course(id) ON DELETE CASCADE;


--
-- Name: teacher_course teacher_course_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_course
    ADD CONSTRAINT teacher_course_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: teacher_course teacher_course_teacher_id_teacher_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_course
    ADD CONSTRAINT teacher_course_teacher_id_teacher_id_fk FOREIGN KEY (teacher_id) REFERENCES public.teacher(id) ON DELETE CASCADE;


--
-- Name: teacher teacher_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher
    ADD CONSTRAINT teacher_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: template template_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template
    ADD CONSTRAINT template_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: virtual_room virtual_room_organization_id_organization_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.virtual_room
    ADD CONSTRAINT virtual_room_organization_id_organization_id_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;


--
-- Name: agent_profile; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agent_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_test_case; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agent_test_case ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_test_run; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.agent_test_run ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.assessment ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment_extension; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.assessment_extension ENABLE ROW LEVEL SECURITY;

--
-- Name: assessment_result; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.assessment_result ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_rule; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.automation_rule ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_send_recipient; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bulk_send_recipient ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_send_run; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.bulk_send_run ENABLE ROW LEVEL SECURITY;

--
-- Name: certificate; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.certificate ENABLE ROW LEVEL SECURITY;

--
-- Name: class_session; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_session ENABLE ROW LEVEL SECURITY;

--
-- Name: cohort; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cohort ENABLE ROW LEVEL SECURITY;

--
-- Name: cohort_software; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.cohort_software ENABLE ROW LEVEL SECURITY;

--
-- Name: company; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;

--
-- Name: contact; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contact ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.conversation ENABLE ROW LEVEL SECURITY;

--
-- Name: course; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.course ENABLE ROW LEVEL SECURITY;

--
-- Name: course_category; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.course_category ENABLE ROW LEVEL SECURITY;

--
-- Name: course_module; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.course_module ENABLE ROW LEVEL SECURITY;

--
-- Name: enrollment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.enrollment ENABLE ROW LEVEL SECURITY;

--
-- Name: installment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.installment ENABLE ROW LEVEL SECURITY;

--
-- Name: intake_form; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.intake_form ENABLE ROW LEVEL SECURITY;

--
-- Name: kb_entry; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.kb_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: license; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.license ENABLE ROW LEVEL SECURITY;

--
-- Name: media_asset; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.media_asset ENABLE ROW LEVEL SECURITY;

--
-- Name: message; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_answer; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_answer ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_course; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_course ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_course_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_course_access ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_lesson; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_lesson ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_question; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_question ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_quiz; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_quiz ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_quiz_attempt; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_quiz_attempt ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_recognition; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_recognition ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_topic; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_topic ENABLE ROW LEVEL SECURITY;

--
-- Name: offline_topic_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.offline_topic_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: payment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stage; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pipeline_stage ENABLE ROW LEVEL SECURITY;

--
-- Name: resource; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.resource ENABLE ROW LEVEL SECURITY;

--
-- Name: seller; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.seller ENABLE ROW LEVEL SECURITY;

--
-- Name: software; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;

--
-- Name: submission; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.submission ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teacher ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_course; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teacher_course ENABLE ROW LEVEL SECURITY;

--
-- Name: template; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.template ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_profile tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.agent_profile USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: agent_test_case tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.agent_test_case USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: agent_test_run tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.agent_test_run USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: announcement tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.announcement USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: assessment tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.assessment USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: assessment_extension tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.assessment_extension USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: assessment_result tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.assessment_result USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: attendance tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.attendance USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: automation_rule tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.automation_rule USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: bulk_send_recipient tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.bulk_send_recipient USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: bulk_send_run tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.bulk_send_run USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: certificate tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.certificate USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: class_session tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.class_session USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: cohort tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.cohort USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: cohort_software tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.cohort_software USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: company tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.company USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: contact tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.contact USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: conversation tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.conversation USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: course tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.course USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: course_category tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.course_category USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: course_module tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.course_module USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: enrollment tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.enrollment USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: installment tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.installment USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: intake_form tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.intake_form USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: kb_entry tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.kb_entry USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: license tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.license USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: media_asset tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.media_asset USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: message tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.message USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_answer tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_answer USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_course tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_course USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_course_access tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_course_access USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_lesson tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_lesson USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_question tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_question USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_quiz tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_quiz USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_quiz_attempt tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_quiz_attempt USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_recognition tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_recognition USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_topic tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_topic USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: offline_topic_progress tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.offline_topic_progress USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: payment tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.payment USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: pipeline_stage tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.pipeline_stage USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: resource tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.resource USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: seller tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.seller USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: software tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.software USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: submission tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.submission USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: teacher tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.teacher USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: teacher_course tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.teacher_course USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: template tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.template USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: virtual_room tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.virtual_room USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


--
-- Name: virtual_room; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.virtual_room ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO cadit_app;


--
-- Name: TABLE account; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO cadit_app;


--
-- Name: TABLE account_link; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_link TO cadit_app;


--
-- Name: TABLE agent_profile; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.agent_profile TO cadit_app;


--
-- Name: TABLE agent_test_case; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.agent_test_case TO cadit_app;


--
-- Name: TABLE agent_test_run; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.agent_test_run TO cadit_app;


--
-- Name: TABLE announcement; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.announcement TO cadit_app;


--
-- Name: TABLE assessment; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assessment TO cadit_app;


--
-- Name: TABLE assessment_extension; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assessment_extension TO cadit_app;


--
-- Name: TABLE assessment_result; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assessment_result TO cadit_app;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.attendance TO cadit_app;


--
-- Name: TABLE automation_rule; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.automation_rule TO cadit_app;


--
-- Name: TABLE bulk_send_recipient; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bulk_send_recipient TO cadit_app;


--
-- Name: TABLE bulk_send_run; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bulk_send_run TO cadit_app;


--
-- Name: TABLE certificate; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.certificate TO cadit_app;


--
-- Name: TABLE class_session; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.class_session TO cadit_app;


--
-- Name: TABLE cohort; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cohort TO cadit_app;


--
-- Name: TABLE cohort_software; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cohort_software TO cadit_app;


--
-- Name: TABLE company; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company TO cadit_app;


--
-- Name: TABLE contact; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contact TO cadit_app;


--
-- Name: TABLE conversation; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conversation TO cadit_app;


--
-- Name: TABLE course; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.course TO cadit_app;


--
-- Name: TABLE course_category; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.course_category TO cadit_app;


--
-- Name: TABLE course_module; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.course_module TO cadit_app;


--
-- Name: TABLE enrollment; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.enrollment TO cadit_app;


--
-- Name: TABLE installment; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.installment TO cadit_app;


--
-- Name: TABLE intake_form; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.intake_form TO cadit_app;


--
-- Name: TABLE invitation; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invitation TO cadit_app;


--
-- Name: TABLE kb_entry; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.kb_entry TO cadit_app;


--
-- Name: TABLE license; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.license TO cadit_app;


--
-- Name: TABLE media_asset; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.media_asset TO cadit_app;


--
-- Name: TABLE member; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.member TO cadit_app;


--
-- Name: TABLE message; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.message TO cadit_app;


--
-- Name: TABLE meta_credentials; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meta_credentials TO cadit_app;


--
-- Name: TABLE offline_answer; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_answer TO cadit_app;


--
-- Name: TABLE offline_course; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_course TO cadit_app;


--
-- Name: TABLE offline_course_access; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_course_access TO cadit_app;


--
-- Name: TABLE offline_lesson; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_lesson TO cadit_app;


--
-- Name: TABLE offline_question; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_question TO cadit_app;


--
-- Name: TABLE offline_quiz; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_quiz TO cadit_app;


--
-- Name: TABLE offline_quiz_attempt; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_quiz_attempt TO cadit_app;


--
-- Name: TABLE offline_recognition; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_recognition TO cadit_app;


--
-- Name: TABLE offline_topic; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_topic TO cadit_app;


--
-- Name: TABLE offline_topic_progress; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offline_topic_progress TO cadit_app;


--
-- Name: TABLE organization; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.organization TO cadit_app;


--
-- Name: TABLE payment; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment TO cadit_app;


--
-- Name: TABLE pipeline_stage; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pipeline_stage TO cadit_app;


--
-- Name: TABLE resource; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.resource TO cadit_app;


--
-- Name: TABLE role; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.role TO cadit_app;


--
-- Name: TABLE seller; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.seller TO cadit_app;


--
-- Name: TABLE session; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO cadit_app;


--
-- Name: TABLE software; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.software TO cadit_app;


--
-- Name: TABLE submission; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.submission TO cadit_app;


--
-- Name: TABLE teacher; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.teacher TO cadit_app;


--
-- Name: TABLE teacher_course; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.teacher_course TO cadit_app;


--
-- Name: TABLE template; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.template TO cadit_app;


--
-- Name: TABLE "user"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."user" TO cadit_app;


--
-- Name: TABLE verification; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.verification TO cadit_app;


--
-- Name: TABLE virtual_room; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.virtual_room TO cadit_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO cadit_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO cadit_app;


--
-- PostgreSQL database dump complete
--

\unrestrict eyfsENtLLcqVGmX5chabch7yf3IxqcYycZpoDpjizBqEcPaqQgRgVIVPQL4siDS

