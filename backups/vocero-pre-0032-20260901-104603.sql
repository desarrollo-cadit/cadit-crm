--
-- PostgreSQL database dump
--

\restrict VfV8plrEPgG8GlsTZT8WPlj3WsIxbVUbyM47lxkB16oX8egLBHglqc5fMqTgNIq

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
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assessment OWNER TO postgres;

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
    recording_url text
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
    meeting_url text
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
    min_attendance_pct integer
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
    welcome_email_sent_at timestamp without time zone
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
    CONSTRAINT resource_contenedor_unico CHECK ((((course_id IS NOT NULL) AND (class_session_id IS NULL)) OR ((class_session_id IS NOT NULL) AND (course_id IS NULL))))
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
    email text
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
    updated_at timestamp without time zone DEFAULT now() NOT NULL
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
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) FROM stdin;
hYhgrgXnsYb5PbaFFYn3rNMh8DDfWwr9	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	credential	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	\N	\N	\N	\N	\N	\N	e1ccc68b99a5932bd1f47124a93d7f5e:e30e893ac44b9a693d247fb4248668f433814a381acda342cf035bd2fe7e019ccea009f1109226e47a5048fce88098fc6832e089aa85615fbe336789feb0f7a1	2026-08-11 12:46:48.603	2026-08-11 12:46:48.603
1ReUAWyRK5pAXgKxKSWqhbQaieeOhCQP	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	credential	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	\N	\N	\N	\N	\N	\N	aa63e79685a20ed4efe62bb3f3a2bdbe:2d9d5d6ff9843eb19447f38bf00e30f4fe4af6dee94c9d96c26e9a93ded7b52a825e66d8ea6b27ec85b364d3a33a25762fd2132a1d7d1806c5a5920395440a14	2026-08-11 14:34:54.53	2026-08-11 14:34:54.53
ITfP8TVouEPqDVmL3luJFd8cUCzpi6TE	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	credential	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	\N	\N	\N	\N	\N	\N	686e516d1be13e967906b96125edad7f:663e9a98b9599298cb8a34e3fe8b27e196f32a53b67332f483994645209d6a2cb0cf1ece6ab3cc771129e5e6c8e2228c71d3d898ec320d4e71819ec51c60cc13	2026-08-10 19:37:00.677	2026-08-27 14:07:11.109
aRbG96L2V9Zh7OKIStlEbrMDZPaQtycu	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	credential	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	\N	\N	\N	\N	\N	\N	c9f192df28551c31cf1db5778526bdc9:153979cace621ddaacc9c629b1d276a2e041a06fab4ac1af9582f740b7a54d141808437ea4e30dc60bd91c4b1b0c8b55ca4eea4e4da91b4170986df2694bedc0	2026-08-11 12:20:11.629	2026-09-01 12:26:39
\.


--
-- Data for Name: account_link; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_link (id, organization_id, user_id, kind, contact_id, teacher_id, suspended_at, created_at, updated_at) FROM stdin;
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
\.


--
-- Data for Name: assessment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assessment (id, organization_id, cohort_id, name, "position", required, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: assessment_result; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.assessment_result (id, organization_id, assessment_id, enrollment_id, passed, notes, recorded_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, organization_id, class_session_id, enrollment_id, status, notes, created_at, updated_at, recorded_by) FROM stdin;
\.


--
-- Data for Name: automation_rule; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.automation_rule (id, organization_id, trigger_event, channel, template_id, template_body, active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: certificate; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.certificate (id, organization_id, enrollment_id, code, issued_at, issued_by, attendance_pct, historical, revoked_at, revoked_by, revoke_reason, created_at) FROM stdin;
\.


--
-- Data for Name: class_session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_session (id, organization_id, cohort_id, number, date, start_time, end_time, hours, teacher_id, topic, canceled_at, cancel_reason, created_at, updated_at, meeting_url, recording_url) FROM stdin;
\.


--
-- Data for Name: cohort; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cohort (id, organization_id, course_id, start_date, end_date, capacity, whatsapp_group_link, status, created_at, updated_at, teacher_id, cost, frequency, classroom, name, start_time, end_time, days_of_week, currency, min_attendance_pct, meeting_url) FROM stdin;
coh_sl0hpv9bnhpyecb5uaw1	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-02-02 00:00:00	2026-03-25 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	Lunes, miércoles y viernes 9:00 a 11:00	1	Revit Arquitectura - 1	09:00	11:00	0,2,4	UYU	\N	\N
coh_rgufdre6lab441xxahlc	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-06-30 00:00:00	2026-09-15 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves 9:00 a 11:00	1	Revit Arquitectura 4	09:00	11:00	1,3	UYU	\N	\N
coh_cwt9u68z4utu1t54l8x7	org_y0txnlv69l6vp70ey06b	crs_pe9at2dykyaefsvuf15u	2026-01-29 00:00:00	2026-03-05 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	jueves 10:00 a 12:00 (9:00 a 11:00 horario rep dom)	1	Taller DOCS + BIM Coll- 2	10:00	12:00	3	UYU	\N	\N
coh_8k3o186fttv1xn4qydc4	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-06-29 00:00:00	2026-07-31 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes 9:00 a 11:00	2	AutoCAD 2D - 3	09:00	11:00	0,2,4	UYU	\N	\N
coh_ydka81s7x8kixtq95vsm	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-08-11 00:00:00	2026-10-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves de 1830 a 2030	1	Revit Arquitectura 5	18:30	20:30	1,3	UYU	\N	\N
coh_0t6rtyqrmmrfzf2ybxgd	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-05-11 00:00:00	2026-07-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 15:00 a 17:00	1	Revit Arquitectura 3	15:00	17:00	0,2	UYU	\N	\N
coh_xld7rf296n1u8koji1qu	org_y0txnlv69l6vp70ey06b	crs_ugccjm296cuvxmzlqpva	2026-03-17 00:00:00	2026-06-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves de 18:30 a 20:30	1	Revit Arquitectura - 2	18:30	20:30	1,3	UYU	\N	\N
coh_zrac9hihrmdtqy5zgroc	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-05-12 00:00:00	2026-09-18 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	2025 - EBIM V.12	\N	\N	\N	UYU	\N	\N
coh_7ulnveocww219sh44h09	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-04-22 00:00:00	2026-12-20 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	lunes y miércoles de 18:30 a 20:30	\N	EBIM 13	18:30	20:30	0,2	UYU	\N	\N
coh_kg9vtmfdvnqyh4vts65f	org_y0txnlv69l6vp70ey06b	crs_s23vpc9fs2t4u48910zx	2026-07-29 00:00:00	2026-12-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 16:30 a 18:30	1	Revit Arq + Revit Estructura + Revit MEP	16:30	18:30	0,2,4	UYU	\N	\N
coh_wd2nkb1uorc4djcrjdfc	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-04-20 00:00:00	2026-06-01 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes de 9:00 a 11:00	2	AutoCAD 2D - 2	09:00	11:00	0,2,4	UYU	\N	\N
coh_7j07dkq1zqp7ta2di1u2	org_y0txnlv69l6vp70ey06b	crs_u4ajg3bfqfwfdom3x8hd	2026-07-14 00:00:00	\N	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	martes y jueves de 14:00 a 16:00	\N	CAPACITACION AP3D - NUBE DE PUNTOS	14:00	16:00	1,3	UYU	\N	\N
coh_nov7nfvbqq0bzhjm4xid	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-02-02 00:00:00	2026-03-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_9pkz4o44hesymq4e6oqm	\N	Lunes, miércoles y viernes 9:00 a 11:00	2	AutoCAD 2D - 1	09:00	11:00	0,2,4	UYU	\N	\N
coh_mepgc3e063trbzr24o7r	org_y0txnlv69l6vp70ey06b	crs_9q5kc25b0tgo0osgztec	2026-08-10 00:00:00	2026-10-12 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 14:00 a 16:00	1	Revit  MEP 1	14:00	16:00	0,2	UYU	\N	\N
coh_jwy2sja5eq1g393rve3d	org_y0txnlv69l6vp70ey06b	crs_h2nynx0r2ad3j3h9zs0d	2026-01-27 00:00:00	2026-03-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:00 a 12:00 (9:00 a 11:00 horario rep dom)	1	Taller DOCS + BIM Coll- 1	10:00	12:00	1	UYU	\N	\N
coh_22o5q4dmzp3c0fw2i0rr	org_y0txnlv69l6vp70ey06b	crs_3rvis8fhzjqj4c45y9pl	2026-08-03 00:00:00	2026-09-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_2wg1x96c6zbtkxntp77c	\N	lunes, miércoles y viernes de 15:00 a 17:00	2	Civil 3D	15:00	17:00	0,2,4	UYU	\N	\N
coh_85l5fveocl6msnly21a0	org_y0txnlv69l6vp70ey06b	crs_3rvis8fhzjqj4c45y9pl	2026-03-16 00:00:00	2026-05-13 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_2wg1x96c6zbtkxntp77c	\N	lunes y miércoles de 9:00 a 11:00	2	Civil 3D	09:00	11:00	0,2	UYU	\N	\N
coh_1san16fz6pubi2jizpap	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-07-14 00:00:00	2026-08-31 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	AutoCAD Plant 3D - 2	\N	\N	\N	UYU	\N	\N
coh_1ywhmtllljcb78h0slij	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-07-27 00:00:00	2026-08-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes y miércoles de 14:30 a 17:30 y viernes de 13:30 a 17:30	\N	AutoCAD PLANT	14:30	17:30	0,2,4	UYU	\N	\N
coh_uywkr3hq0o0ydfx6azx7	org_y0txnlv69l6vp70ey06b	crs_bkdrij1jvu0u9udj1ns0	2026-09-07 00:00:00	2026-10-09 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 9:00 a 11:00	3	AutoCAD 2D - 4	09:00	11:00	0,2,4	UYU	\N	\N
coh_j1qdgpt23p89pxxc7aig	org_y0txnlv69l6vp70ey06b	crs_kyz1ukzsz8rd7m2vtjup	2026-04-09 00:00:00	2026-04-21 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:30 a 12:30 y jueves 9:0.0 a 11:00	1	Taller DOCS	10:30	12:30	1,3	UYU	\N	\N
coh_kcdropxtyo32kpqqddg3	org_y0txnlv69l6vp70ey06b	crs_2iglohhtk1w3w9welsr5	2026-04-07 00:00:00	2026-06-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_tgh5y0gv4nn5ycny9lyw	\N	martes y jueves de 9:00 a 11:00	4	Inventor	09:00	11:00	1,3	UYU	\N	\N
coh_tf9ckgcjesdoen42ak0h	org_y0txnlv69l6vp70ey06b	crs_kvknjfarzcvxrbgs8bu5	2026-02-10 00:00:00	2026-03-17 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_0jizhz7uamo9bayglfxb	\N	lunes, miércoles y vienres de 9:00 a 11:00	3	Revit Estructura	09:00	11:00	0,2	UYU	\N	\N
coh_dcmroictyg8bin81ouq3	org_y0txnlv69l6vp70ey06b	crs_nzl4khq2vx64oatqe2gg	2026-02-10 00:00:00	2026-03-24 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves 16:00 a 18:00	1	Proyecto Ejecutivo con REVIT	16:00	18:00	1,3	UYU	\N	\N
coh_43zed46s1cxhwfuu3xdx	org_y0txnlv69l6vp70ey06b	crs_3cfqj4ncoq8pnzdvdplj	2026-03-16 00:00:00	2026-03-27 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes, miércoles y viernes de 9 a 13	\N	Fusion	\N	\N	0,2,4	UYU	\N	\N
coh_o500qyj1yvnorghwptun	org_y0txnlv69l6vp70ey06b	crs_dmwnzndn4evopl29alpk	2026-06-01 00:00:00	2026-06-24 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_5licjxvsw0onlt4v1ghy	\N	lunes y miércoles de 13:00 a 17:00	\N	AutoCAD PLANT	13:00	17:00	0,2	UYU	\N	\N
coh_rfautax494zvjxlbtis8	org_y0txnlv69l6vp70ey06b	crs_ffmn1fkujlw6sy2g9enx	2026-08-24 00:00:00	2026-09-28 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 9:00 a 11:00	1	Revit Avanzado	09:00	11:00	0,2	UYU	\N	\N
coh_jtbgl4phwuh6qtbj9hkf	org_y0txnlv69l6vp70ey06b	crs_x2diaha6tvi85ij7zv7y	2026-09-29 00:00:00	2027-04-01 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	martes y jueves de 18:30 a 20:30	\N	EBIM 14	18:30	20:30	1,3	UYU	\N	\N
coh_aas6nhly9bgr81bq09ql	org_y0txnlv69l6vp70ey06b	crs_f8aviwzruxbce1k7u9v6	2026-01-19 00:00:00	2026-02-04 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	Lunes, miércoles y jueves de 16:00 a 18:00	1	Revit Electrical	16:00	18:00	0,2,3	UYU	\N	\N
coh_939u17ifmjfns7pr40d2	org_y0txnlv69l6vp70ey06b	crs_am73cm3h95e5tfrcza62	2026-02-09 00:00:00	2026-03-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miércoles de 16:00 a 18:00	1	Revit FAMILIA	16:00	18:00	0,2	UYU	\N	\N
coh_fg1r6mpdbs5ssuusq9o5	org_y0txnlv69l6vp70ey06b	crs_am73cm3h95e5tfrcza62	2026-08-18 00:00:00	2026-09-08 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes y jueves de 14:00 a 16:00	1	Revit Familias	14:00	16:00	1,3	UYU	\N	\N
coh_z9zwwkuo4w9cjvj84vor	org_y0txnlv69l6vp70ey06b	crs_2iglohhtk1w3w9welsr5	2026-08-10 00:00:00	2026-09-23 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	lunes, miércoles y viernes de 9:00 a 11:00	\N	Inventor	09:00	11:00	0,2,4	UYU	\N	\N
coh_iarbf4v6itw2ewunjwlb	org_y0txnlv69l6vp70ey06b	crs_kvknjfarzcvxrbgs8bu5	2026-08-03 00:00:00	2026-09-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_0jizhz7uamo9bayglfxb	\N	lunes y miércoles de 16:30 a 18:30	3	Revit Estructura	16:30	18:30	0,2	UYU	\N	\N
coh_t2pyxowjji94k5vboph4	org_y0txnlv69l6vp70ey06b	crs_9q5kc25b0tgo0osgztec	2026-10-19 00:00:00	2026-12-02 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes, miércoles y viernes de 9:00 a 11:00	\N	Revit MEP 2	09:00	11:00	0,2,4	UYU	\N	\N
coh_dsk8k484pa43py216cpr	org_y0txnlv69l6vp70ey06b	crs_d110qd4kuva3yj9usqde	2026-01-19 00:00:00	2026-02-23 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	Taller Revit Electrical	\N	\N	\N	UYU	\N	\N
coh_g28y7xhfwhvtzqzge63p	org_y0txnlv69l6vp70ey06b	crs_qijayeof17p71rwtt3y0	2026-02-11 00:00:00	2026-05-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	BUILD - HandsON PY	\N	\N	\N	UYU	\N	\N
coh_pvzhsfwl145zkoc982dv	org_y0txnlv69l6vp70ey06b	crs_nu47757ykvons2xx1nje	2026-01-27 00:00:00	2026-03-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	martes 10:00 a 12:00	1	Taller BONITA BEACH 1	10:00	12:00	1	UYU	\N	\N
coh_8m433a0t9rhmqv7e7uwp	org_y0txnlv69l6vp70ey06b	crs_x76pxtm908ofniphypj2	2026-01-29 00:00:00	2026-03-05 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	jueves 10:00 a 12:00	1	Taller BONITA BEACH 2	10:00	12:00	3	UYU	\N	\N
coh_25o5mqnsu7mitmlrr0je	org_y0txnlv69l6vp70ey06b	crs_awo8z4lm4g5uykgxeax1	2026-06-30 00:00:00	2026-07-16 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_m7bcgin75gimvphl7h4q	\N	martes y jueves 15:00 a 17:00	presencial	Twinmotion	15:00	17:00	1,3	UYU	\N	\N
coh_i8c0a9tmibtdcfz9zv2a	org_y0txnlv69l6vp70ey06b	crs_675hlj4lf0n981c21k6v	2026-07-27 00:00:00	2026-08-10 00:00:00	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	tch_sl39f4ns1va4lo0oushl	\N	lunes y miercoles 9:00 a 11:00	1	Taller Mi Primer BIM	09:00	11:00	0,2	UYU	\N	\N
coh_b2hj22vygccz179bz0a2	org_y0txnlv69l6vp70ey06b	crs_sjrguxdhjetu5amhkyda	2026-07-29 00:00:00	\N	\N	\N	planificada	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	Revit - Zulamian	\N	\N	\N	UYU	\N	\N
\.


--
-- Data for Name: cohort_software; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cohort_software (cohort_id, software_id, organization_id) FROM stdin;
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

COPY public.course (id, organization_id, name, description, created_at, updated_at, slug, tagline, category_id, level, modality, duration_weeks, hours_per_week, image_url, learning_objectives, target_audience, syllabus_url, published, min_attendance_pct) FROM stdin;
crs_nzl4khq2vx64oatqe2gg	org_y0txnlv69l6vp70ey06b	Especialización Proyecto Ejecutivo con Revit	Adquirirás conocimientos para la generación de la documentación gráfica ejecutiva de REVIT necesaria para su ejecución en obra, gestión de permisos y habilitaciones.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	especializacion-proyecto-ejecutivo-con-revit	Especialización Proyecto Ejecutivo con Revit Aprende a desarrollar un proyecto arquitectónico completo para su integración colaborativa, documentación y aprobación municipal. [...]	\N	\N	en_vivo	\N	\N	\N	\N	Para arquitectos y estudiantes avanzados de arquitectura, que deseen especializarse en la generación de documentación para proyecto ejecutivo. — Conocimientos de REVIT.	\N	t	\N
crs_x2diaha6tvi85ij7zv7y	org_y0txnlv69l6vp70ey06b	Especialización en Proyectos BIM	Especialista en Proyectos BIM brinda una introducción a los conceptos teóricos y prácticos de las herramientas básicas necesarias, con el fin de que el alumno lidere el cambio de paradigma que implica la aplicación de metodologías BIM en el sector de la industria de la construcción. Además en los correspondientes módulos se abordan las diferentes tecnologías aplicables para cada una de las etapas del ciclo de vida de un proyecto. Desde la fase inicial de diseño, mediante la utilización de diferentes softwares de modelado, pasando por las fases de coordinación y gestión, hasta la Implementación. Se tiene en cuenta para ello su vinculación con las posteriores etapas de puesta en funcionamiento y mantenimiento de las infraestructuras.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	especializacion-en-proyectos-bim	Unite a la revolución de la metodología BIM Con la especialización en proyectos BIM, aprende a liderar el cambio de [...]	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N
crs_bkdrij1jvu0u9udj1ns0	org_y0txnlv69l6vp70ey06b	AutoCAD 2D Profesionales	Aprender los comandos necesarios para el diseño en dos dimensiones a nivel profesional.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-2d	Aprende las herramientas de dibujo técnico 2d, documentación y manejo de datos.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N
crs_7b7cs4ikva735avvxvwe	org_y0txnlv69l6vp70ey06b	AutoCAD 2D Estudiantes	Aprender los comandos necesarios para el diseño en dos dimensiones a nivel profesional.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-2d-estudiantes	Aprende las herramientas de dibujo técnico 2d, documentación y manejo de datos.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N
crs_2fdj83471xzcsu6fqh51	org_y0txnlv69l6vp70ey06b	AutoCAD Electrical	Contiene una completa librería de componentes estándares, soporta los principales estándares y permite la documentación y generación de la parte eléctrica de los prototipos digitales creados en Autodesk Inventor. Ofrece herramientas para la mejora de la productividad.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-electrical	Aprende a acelerar el proceso de diseño de sistemas de control y automatización.	\N	\N	en_vivo	\N	\N	\N	\N	Ingenieros y técnicos especializados en diseñar Circuitos eléctricos de Control y Automatización basados en PLC’s. — Uso básico del software AutoCAD.	\N	t	\N
crs_dmwnzndn4evopl29alpk	org_y0txnlv69l6vp70ey06b	AutoCAD Plant	En este curso, aprenderás cómo empezar un proyecto desde cero, cómo realizar el conexionado de equipos con piping y cómo insertar elementos en línea desde especificación. Además, conocerás los flujos de intercambio BIM con otras soluciones como Advance Steel o Inventor. El curso también te permitirá adquirir la capacidad de crear y gestionar especificaciones de tubería de diferentes estándares, así como la gestión de catálogos. Aprenderás a generar listados de ingeniería presentables al cliente y entenderás el alcance de proyectos con maquetas virtuales 3D generadas con nubes de puntos.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	autocad-plant	Aprende los conceptos generales del diseño de plantas y el uso de las herramientas: AutoCAD P&ID, AutoCAD Plant 3D y Autodesk Navisworks, para crear diseños de plantas que cumplan con los requerimientos de diseño y los flujos de trabajo.	\N	\N	en_vivo	\N	\N	\N	\N	Diseñadores de plantas, Ingenieros de procesos, Ingenieros Industriales, Estudiantes. — Uso básico del software AutoCAD.	\N	t	\N
crs_ugccjm296cuvxmzlqpva	org_y0txnlv69l6vp70ey06b	Revit Arquitectura Profesionales	Objetivo del curso: utilizar Revit arquitectura para el diseño y modelado de proyectos de edificaciones en 3D, así como generar documentación técnica para la presentación y construcción del proyecto.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-arquitectura	Aprende a implementar estrategias de eficiencia en procesos de proyecto, trabajo colaborativo, herramientas de visualización y conceptualización BIM.	\N	\N	\N	\N	\N	\N	\N	Dirigido a todo público que desee incorporarse o ya esté inserto en el mercado de la Arquitectura e Infraestructura.	\N	t	\N
crs_g4pmzpk6f5rlg03dlvd4	org_y0txnlv69l6vp70ey06b	Revit Arquitectura Estudiantes	Objetivo del curso: utilizar Revit arquitectura para el diseño y modelado de proyectos de edificaciones en 3D, así como generar documentación técnica para la presentación y construcción del proyecto.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-arquitectura-estudiantes	Aprende a implementar estrategias de eficiencia en procesos de proyecto, trabajo colaborativo, herramientas de visualización y conceptualización BIM.	\N	\N	\N	\N	\N	\N	\N	Dirigido a todo público que desee incorporarse o ya esté inserto en el mercado de la Arquitectura e Infraestructura.	\N	t	\N
crs_kvknjfarzcvxrbgs8bu5	org_y0txnlv69l6vp70ey06b	Revit Estructura	Revit Estructuras es una herramienta fundamental para el diseño y modelado de proyectos de ingeniería estructural en 3D cargados de información. Durante el curso, los participantes aprenderán a crear modelos de edificios y estructuras, agregar elementos constructivos y de diseño específicos para estructuras como pilares, vigas, losas y cimentaciones, y generar documentación técnica. El objetivo es que los participantes puedan utilizar Revit Estructuras para diseñar estructuras complejas y coordinar con otros profesionales involucrados en la construcción de un proyecto, lo que les permitirá mejorar la eficiencia y la precisión en sus diseños.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-avanzado	Aprende diseño y modelado de proyectos de ingeniería estructural en 3D cargados de información.	\N	\N	en_vivo	\N	\N	\N	\N	Profesionales y estudiantes en el rubro de la Arquitectura e Infraestructura. Se recomienda haber cursado Revit Básico.	\N	t	\N
crs_9q5kc25b0tgo0osgztec	org_y0txnlv69l6vp70ey06b	Revit MEP	Este curso está dirigido a estudiantes y profesionales interesados en aprender a utilizar Revit MEP, una herramienta fundamental para el diseño y modelado de proyectos de instalaciones MEP en 3D cargados de información.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-mep	Aprende diseño y modelado de proyectos de instalaciones MEP en 3D cargados de información.	\N	\N	en_vivo	\N	\N	\N	\N	profesionales en el rubro de la Arquitectura e Infraestructura.	\N	t	\N
crs_am73cm3h95e5tfrcza62	org_y0txnlv69l6vp70ey06b	Revit Familias	Este curso está dirigido a estudiantes y profesionales interesados en aprender a crear familias personalizadas en Revit, una habilidad esencial para la personalización de elementos específicos en proyectos de construcción.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-familias	Aprende a crear familias en Revit para la personalización de elementos específicos en proyectos de construcción.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N
crs_ffmn1fkujlw6sy2g9enx	org_y0txnlv69l6vp70ey06b	REVIT Avanzado	Obtendrás los conocimientos para una gestión gráfica coordinada y estandarizada. Personaliza tus operaciones con un navegador de proyecto organizado a medida, separado en fases de proyecto, genera nuevas opciones de diseño para mejorar el diálogo con tus clientes, trabaja con nubes de puntos y colaboración en la nube a través de un ECD (entorno común de datos). Un paquete que te abrirá un abanico interesante de opciones.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-avanzado-2	Aprende herramientas para gestionar la información de manera profesional, editando y creando parámetros de proyecto, globales y compartidos.	\N	\N	en_vivo	\N	\N	\N	\N	(estudiantes y profesionales) en el rubro de la Arquitectura e Infraestructura. — Se recomienda haber cursado Revit Arquitectura, Revit Estructura y/o Revit MEP.	\N	t	\N
crs_awo8z4lm4g5uykgxeax1	org_y0txnlv69l6vp70ey06b	Twinmotion para Revit	El curso Twinmotion para Revit está orientado a facilitar la visualización y comunicación de los proyectos arquitectónicos, lo que le permite crear representaciones fotorrealistas y experiencias inmersivas Twinmotion, es un programa de visualización arquitectónica en tiempo real que se integra fácilmente con Revit y permite a los arquitectos con experiencia en proyectos BIM y estudiantes de arquitectura crear presentaciones visuales impresionantes de sus diseños. Esta herramienta ofrece una interfaz fácil de entender y potentes capacidades de renderizado, lo que permite a los usuarios explorar y presentar sus modelos de Revit con una calidad fotorrealista y en tiempo real. Twinmotion permite a los arquitectos y estudiantes mostrar sus diseños en entornos diversos y realistas gracias a su amplia gama de efectos visuales, como iluminación dinámica, materiales realistas, vegetación abundante y condiciones climáticas variables.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	twinmotion-para-revit	Twinmotion para Revit Aprende a mejorar la presentación y visualización de proyectos de manera rápida y efectiva, con realidad virtual [...]	\N	\N	presencial	\N	\N	\N	\N	Conocimientos de conceptos de manejo espacial y composición arquitectónica. Este curso fue ideado para ser accesible a usuarios con nivel intermedio en Revit para iniciar el proceso de aprendizaje. Verificar requisitos para instalación de Twinmotion aquí: https://twinmotionhelp.epicgames.com/s/article/Twinmotion-System-Requirements?language=en_US	\N	t	\N
crs_3rvis8fhzjqj4c45y9pl	org_y0txnlv69l6vp70ey06b	Civil 3D	Aprenderás herramientas, conceptos y aplicaciones de las funciones esenciales de Auto- CAD Civil 3D para crear y analizar modelos Digitales del Terreno con el que se podrán afrontar complejos retos de infraestructura en un entorno basado en modelos 3D.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	robot-structural-analysis-essentials-civil-3d	Aprende a crear y analizar modelos Digitales del Terreno con el que se podrán afrontar complejos retos de infraestructura en un entorno basado en modelos 3D	\N	\N	en_vivo	\N	\N	\N	\N	Manejo de AutoCAD.	\N	t	\N
crs_nnnxm9wfs2fbjdh85b36	org_y0txnlv69l6vp70ey06b	Dynamo	Aprende a automatizar tareas, gestionar parámetros masivamente, y utilizar el diseño generativo para optimizar tus proyectos arquitectónicos. Gestión de parámetros: Aprende a volcar y extraer información de unos parámetros a otros de manera eficiente. Modelado y modificación masiva: Descubre cómo automatizar acciones para optimizar recursos y tiempo en Revit. Recopilación de información: Utiliza Dynamo para recopilar datos y generar informes personalizados. Diseño generativo: Explora el uso de algoritmos para generar múltiples soluciones de diseño innovadoras.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	curso-online-de-dynamo	Aprende a automatizar tareas, gestionar parámetros masivamente, y utilizar el diseño generativo para optimizar tus proyectos arquitectónicos.	\N	\N	en_vivo	\N	\N	\N	\N	Arquitectos y estudiantes de arquitectura con conocimiento nivel medio/avanzado de Revit en las diferentes disciplinas (Arquitectura, Estructura, MEP, etc) con conocimiento nivel inicial/medio de programación gráfica.	\N	t	\N
crs_2iglohhtk1w3w9welsr5	org_y0txnlv69l6vp70ey06b	Inventor Essentials	En este curso se cubren 3 módulos fundamentales del diseño paramétrico 3D en Inventor: el modelado de piezas, la generación de ensamblajes y la documentación en el plano. El curso es de carácter práctico y se presentan situaciones del mundo real con ejemplos de uso de las diferentes herramientas y módulos del programa.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-essentials	Aprende el modelado de piezas, la generación de ensamblajes y la documentación en el plano.	\N	\N	en_vivo	\N	\N	\N	\N	\N	\N	t	\N
crs_it0ldqs62njsolnuw9h7	org_y0txnlv69l6vp70ey06b	Inventor: ensamblaje avanzado y diseño de máquinas	Ensamblaje Avanzado y Diseño de Máquinas es la continuación de Inventor Essentials para llevar los conocimientos de Inventor, Diseño industrial y Mecánico mediante prototipos digitales al próximo nivel. Por ejemplo exploramos Diseño de Máquinas con archivo master, Técnicas de Diseño deriva-do, Generador de estructuras, Aceleradores de diseño de máquinas (rulemanes, engranajes, correas, piñones), Soldaduras entre otros.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	curso-online-de-inventor-ensamblaje-avanzado-y-diseno-de-maquinas	Es la continuación de Inventor Essentials para llevar los conocimientos de Inventor, Diseño industrial y Mecánico mediante prototipos digitales al próximo nivel.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N
crs_xdjuu6rl71nvz46v1gkp	org_y0txnlv69l6vp70ey06b	Inventor diseño de chapas	Sheet Metal o Inventor Chapa es un entorno de modelado específico con sus herramientas y técnica particular. Comprende conocer los conceptos y tecnología de fabricación, de máquinas CNC- y méto dos con ejemplos para exportar piezas desde el 3D, generar el desarrollo y realizar la documentación para manufactura.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-diseno-de-chapas	Aprende los conceptos y tecnología de fabricación, de máquinas CNC y métodos con ejemplos para exportar piezas desde en 3D, generar el desarrollo y realizar la documentación para manufactura.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N
crs_1gsbb0wiqpxjub6m1jav	org_y0txnlv69l6vp70ey06b	Inventor análisis de stress y simulación dinámica	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-analisis-de-stress-y-simulacion-dinamica	Aprende a simular y analizar los prototipos digitales como que fueran construidos en el mundo real. Mediante el análisis digital podemos realizar ajustes, resolver problemas de resistencia, ajustar los diseños y optimizar el uso de los materiales antes de realizar costosos prototipos físicos.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N
crs_7c9vabpgryq4nkhmhm70	org_y0txnlv69l6vp70ey06b	Inventor diseño de tuberías	Aprende a realizar proyectos de plantas con tuberías, se pueden realizar tuberías, cañerías y flexibles. Exploramos la generación de lista de partes completas con elementos completos y detallados, se insertan válvulas, reducciones, bridas etc.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-diseno-de-tuberias	Aprende a realizar proyectos de plantas con tuberías, se pueden realizar tuberías, cañerías y flexibles. Exploramos la generación de lista de partes completas con elementos completos y detallados, se insertan válvulas, reducciones, bridas etc.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N
crs_quggt2nlgu68r9dxeols	org_y0txnlv69l6vp70ey06b	Inventor Studio	Aprende a generar exportables de alta calidad y definición de nivel profesional de nuestros diseños. Las técnicas de renderizado con ajuste de estilo visual, texturados, sombras, perspectivas e iluminación, forman parte del conocimiento para comunicar los diseños. El entorno cuenta con herramientas de animación de movimiento de los diseños y de animación de las cámaras. El renderizado de nivel fotorrealista con trazado de rayos permite generar imágenes y animaciones digitales prácticamente reales.	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	inventor-studio	Aprende a generar exportables de alta calidad y definición de nivel profesional de nuestros diseños.	\N	\N	\N	\N	\N	\N	\N	\N	\N	t	\N
crs_u4ajg3bfqfwfdom3x8hd	org_y0txnlv69l6vp70ey06b	CAPACITACION AP3D - NUBE DE PUNTOS	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	capacitacion-ap3d-nube-de-puntos	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_s23vpc9fs2t4u48910zx	org_y0txnlv69l6vp70ey06b	Revit Arq + Revit Estructura + Revit MEP	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-arq-revit-estructura-revit-mep	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_f8aviwzruxbce1k7u9v6	org_y0txnlv69l6vp70ey06b	Revit Electrical	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-electrical	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_h2nynx0r2ad3j3h9zs0d	org_y0txnlv69l6vp70ey06b	Taller DOCS + BIM Coll- 1	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs-bim-coll-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_pe9at2dykyaefsvuf15u	org_y0txnlv69l6vp70ey06b	Taller DOCS + BIM Coll- 2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs-bim-coll-2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_3cfqj4ncoq8pnzdvdplj	org_y0txnlv69l6vp70ey06b	Fusion	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	fusion	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_kyz1ukzsz8rd7m2vtjup	org_y0txnlv69l6vp70ey06b	Taller DOCS	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-docs	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_nu47757ykvons2xx1nje	org_y0txnlv69l6vp70ey06b	Taller BONITA BEACH 1	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-bonita-beach-1	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_x76pxtm908ofniphypj2	org_y0txnlv69l6vp70ey06b	Taller BONITA BEACH 2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-bonita-beach-2	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_675hlj4lf0n981c21k6v	org_y0txnlv69l6vp70ey06b	Taller Mi Primer BIM	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-mi-primer-bim	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_sjrguxdhjetu5amhkyda	org_y0txnlv69l6vp70ey06b	Revit - Zulamian	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	revit-zulamian	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_d110qd4kuva3yj9usqde	org_y0txnlv69l6vp70ey06b	Taller Revit Electrical	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	taller-revit-electrical	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
crs_qijayeof17p71rwtt3y0	org_y0txnlv69l6vp70ey06b	BUILD - HandsON PY	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	build-handson-py	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
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

COPY public.enrollment (id, organization_id, contact_id, cohort_id, stage_id, "position", enrolled_at, last_activity_at, created_at, updated_at, amount, installments, payment_notes, national_id, invoice_number, receipt_number, seller_id, company_id, terms_email_sent_at, software_installed_at, had_own_license, academia_online_access_at, interest_course_id, currency, welcome_email_sent_at) FROM stdin;
enr_oveodcqx8abzj14drq0i	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_t2pyxowjji94k5vboph4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.348	\N	2026-08-17 15:53:14.645896	2026-08-17 19:01:42.114	18012	\N	paga cuando este confirmado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_cwhidx335p7izv97rbi2	org_y0txnlv69l6vp70ey06b	ct_cjj36uysd3662yb6n6r1	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.111	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ng880lw9cpx8tn56x34c	org_y0txnlv69l6vp70ey06b	ct_0133t8keomdz48yjpq26	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.038	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	pagó $20.000 el 26/2, y financiar el resto en 12 cuotas, y cancelando el saldo en noviembre antes de terminar el curso - $4666 el 13/3 -  $10.000 el 22/6 $5.000 el 4/8	\N	819	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6w7a3k5fhyw75qscimey	org_y0txnlv69l6vp70ey06b	ct_vzcwcvzk7a4cs0ymdjn0	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.04	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	ruc 3.985.979-7 - transferencia 10/3/26	\N	132	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N
enr_nqvgnj6ql7ivxtq0879a	org_y0txnlv69l6vp70ey06b	ct_emcyly83ztjpfgc1go4w	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.041	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	10/3 transferencia cuota 1/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_3lxcg1c0skuy3b6ii0ta	org_y0txnlv69l6vp70ey06b	ct_k03bmmvktxxcecc8rq02	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.042	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	socia sau, transferencia 19/3 $57.000	\N	808	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5d9x4ks9g710yc4d5f4q	org_y0txnlv69l6vp70ey06b	ct_5e4txam9jkv72xoi9xjn	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.043	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	oca presencial	\N	833	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_t6dfcyzf194k0qz30udv	org_y0txnlv69l6vp70ey06b	ct_upudzbdndawnh6gexj9o	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.044	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transferencia 6/4	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rpbm2w3hrb3mcxsy7s8m	org_y0txnlv69l6vp70ey06b	ct_fz2hf9uqbvxtlf8n5trj	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.045	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	INSEL SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N
enr_2hns1cq0ju8t92toqp29	org_y0txnlv69l6vp70ey06b	ct_8wblmsom0tx2aa8kch8m	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.046	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10000000	\N	pago 1/3 30/04, 2/3 el 21/7	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N
enr_zmhpsu8vwmusoqnrxz9l	org_y0txnlv69l6vp70ey06b	ct_eisi1chv7o33wm0120w9	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.047	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	\N	\N	849	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_uawricm1ew5sym6n3srj	org_y0txnlv69l6vp70ey06b	ct_g3yknsnigavx7bf504j0	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.048	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_f2657s8ezjnwcqb6yxkb	org_y0txnlv69l6vp70ey06b	ct_csc1ii0xcqw94cj50ksf	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.049	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	oca llamar 7/5 de 12 a 13	\N	853	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_h17ot2vv4rrjsuzmw7n7	org_y0txnlv69l6vp70ey06b	ct_5yi00tswejlfsx1oxkv5	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.049	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	visa mercado pago	\N	856	3142	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_txdakyc5nfq9kwb3b7o3	org_y0txnlv69l6vp70ey06b	ct_g7pa2737u8tendfex3bb	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.05	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	40000	\N	visa mercado pago	\N	857	3143	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8w5zhkcytqjjr3w8375c	org_y0txnlv69l6vp70ey06b	ct_kzcahp8j8foljjnb3sky	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.051	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	bps	\N	4113	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_qic60cg1khrzrloby1b2	org_y0txnlv69l6vp70ey06b	ct_wtm4qzhg4mz1qjhn1zd3	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.052	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_aq9km1z6too1u260uz8n	org_y0txnlv69l6vp70ey06b	ct_941m2jnq7h7gimf1u4bs	coh_7ulnveocww219sh44h09	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.053	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	76000	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_eoi4woflmu1md568b5kg	org_y0txnlv69l6vp70ey06b	ct_ur7p0ehsr6u7tt0iphol	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.054	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago	\N	858	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nvzrkhaem6hzbxpua9md	org_y0txnlv69l6vp70ey06b	ct_si9io0z4crn7m6rzjc0t	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.054	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16170	\N	transferencia 29/6 $16.170	\N	862	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_s21q916g0b48ealh1kfu	org_y0txnlv69l6vp70ey06b	ct_vsyctzhjt1o7y8zia7rw	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.055	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	transferencia a fin de junio	\N	863	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_cu9bowuqplgpw00e40yv	org_y0txnlv69l6vp70ey06b	ct_5uaksd3bubuamk2trueh	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.056	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago factura a Alenstar SA	\N	4116	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_lv0v6f2sjtqcdsufec1g	org_y0txnlv69l6vp70ey06b	ct_9upch4qkf72panbposye	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.057	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago	\N	860	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_l39dhx8br3u5v9glddtc	org_y0txnlv69l6vp70ey06b	ct_eolzsj2d5z6n1mwfbxrp	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.058	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	ARCA, transferencia enviar factura a arca@arca.com.uy	\N	4120	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hjbb0l79lmq2h3vyf7so	org_y0txnlv69l6vp70ey06b	ct_4knc0ilipcuryn9ydree	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.059	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	factura con rut envio x email, pago con tarjeta	\N	4121	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_47x5mnn3sdrk6w0oekyz	org_y0txnlv69l6vp70ey06b	ct_lb2i9icvy020cgzyxp9d	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.06	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de crédito	\N	870	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_r19567xhw5k3rik7yu3c	org_y0txnlv69l6vp70ey06b	ct_rh8htdhawm7cknnooyla	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.061	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 24/6 $11.550	\N	867	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zvasfx44j1qdjjuo7txy	org_y0txnlv69l6vp70ey06b	ct_32piiek47jg5q9cqdsb9	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.062	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	pagó transferencia 23/6 $6.125	\N	875	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_57tkd09ddz5kxm9jx0sq	org_y0txnlv69l6vp70ey06b	ct_7a0hq42x8vlycho17hng	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.063	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Fiscrea	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_j00ybkgk8zqazukx34ej	org_y0txnlv69l6vp70ey06b	ct_p4z8vpzm4ymvraasjtz7	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.064	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vbo18i6tbyfqza6i3m2s	org_y0txnlv69l6vp70ey06b	ct_4fonyo8bxvo029mf0h8p	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.065	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_geunf1cuf9d4jmrhdcra	org_y0txnlv69l6vp70ey06b	ct_ok2eypxm0g6yqmv4c84o	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.065	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ogqu6w35gch3mlatvxn6	org_y0txnlv69l6vp70ey06b	ct_bgcttxjnqh0t7uh3up49	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.066	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_j3mwlpi9wvt10i80ukgs	org_y0txnlv69l6vp70ey06b	ct_7cu3sq94htl3o0zfnwhz	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.068	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1ub4wwx5edgzjqs6u9dj	org_y0txnlv69l6vp70ey06b	ct_vd3ury62v662vqkxgjfz	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.068	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kebfdqwbr99wz1phq53u	org_y0txnlv69l6vp70ey06b	ct_sktyyq9fnz0o3y0h5gms	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.069	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11700	\N	transferencia	\N	876	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bxg66i77u5gpi0111r4o	org_y0txnlv69l6vp70ey06b	ct_n1k0tue7qlghv06vim5e	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.07	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta en 2 pagos	\N	877	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rgingqgkg3lvr16etmq5	org_y0txnlv69l6vp70ey06b	ct_u9igjbj7mld7lmd82ai7	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.071	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta	\N	878	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xro3uyaj580ex9gvadu2	org_y0txnlv69l6vp70ey06b	ct_0gr08xdgya9q5q3soxz2	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.072	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 25/6	\N	879	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zh1tb40zqoynri48ma4r	org_y0txnlv69l6vp70ey06b	ct_dbvs7vu5d7dctdc6i48m	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.073	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia	\N	880	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6fkg4lvb4e4yvt4pdjdg	org_y0txnlv69l6vp70ey06b	ct_d7yime2jqexoz5w72jsp	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.074	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	oca llamar 26/6 a las 12	\N	881	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_idggnv8ew3sij5ggjdzn	org_y0txnlv69l6vp70ey06b	ct_ezah637ulplhzkyatqdf	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.075	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia 29/6	\N	882	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_uo98wqr4jhloda1qo7y1	org_y0txnlv69l6vp70ey06b	ct_7yc37q2ijrdmot148vsw	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.076	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	intendencia durazno, ya esta en revit 3	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6a783009i8zk67gwxhkv	org_y0txnlv69l6vp70ey06b	ct_aerznjwghbkj8ye4s93t	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.077	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	intendencia durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_u9mad6gs9vmcthzjh0je	org_y0txnlv69l6vp70ey06b	ct_3cnyyonxdhz30gkqohjj	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.078	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	intendencia durazno ya esta en revit 3	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_f3khpk0iru3ua6d1ybmr	org_y0txnlv69l6vp70ey06b	ct_6mdisjacv5rrmnj8kln1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.079	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta	\N	883	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1pag64tnmpexk5w2ncyo	org_y0txnlv69l6vp70ey06b	ct_nfkibqyhptk1ejyj31ij	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.08	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1762900	\N	transferencia py 30/6	\N	229	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N
enr_6xyrlaxnpw6s173rqmo9	org_y0txnlv69l6vp70ey06b	ct_8qi2jrxa538rk49ii7a1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.08	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_q6rxn288k0vqq63rmnt7	org_y0txnlv69l6vp70ey06b	ct_ra3ga657hrde0x8worw1	coh_rgufdre6lab441xxahlc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.081	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	se factura a DISCO	\N	4142	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ixr1mm9ki50faab9k7ac	org_y0txnlv69l6vp70ey06b	ct_8dgagzpktt103cz85ng3	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.082	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1500	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fws83w9earj366b348ab	org_y0txnlv69l6vp70ey06b	ct_qa9ax4jrxltjuc51pdnk	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.083	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wapp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_14f7ea0fkjzcih4gj4l1	org_y0txnlv69l6vp70ey06b	ct_3f05ahiheid0ykus1ea6	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.084	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	nicolasdsf2@hotmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_i2a51qr79p6up8oct2y3	org_y0txnlv69l6vp70ey06b	ct_opb6yjpssdbvx61fpman	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.085	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	parsan11@hotmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_e5p4x7e686vbkdlfb26o	org_y0txnlv69l6vp70ey06b	ct_dffl4k37j5j6f30ezqlf	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.086	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	licencia hasta el 16/7	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ofivzgcrdx6eq9j96img	org_y0txnlv69l6vp70ey06b	ct_wgxtyp1bufhn65m9e9lg	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.087	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	leonardopuchetta21@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6ttu8elbn44zowgjubba	org_y0txnlv69l6vp70ey06b	ct_h9fut7276e783jhinqmd	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.087	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wapp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_dhp7i5ut18n3ze96627d	org_y0txnlv69l6vp70ey06b	ct_zhxbwzg25o3msb31pnu4	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.088	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_h1rykqg7z11xhzy7lvq5	org_y0txnlv69l6vp70ey06b	ct_7hu7yqp1sfnq4up34s5u	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.089	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	andrescunetti11@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rresmtgpn0c7s3znrqlx	org_y0txnlv69l6vp70ey06b	ct_g7qdxcf334d2pm24vzmo	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.09	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	jaguarino98@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ioww1ebbxuwz5kmswsdc	org_y0txnlv69l6vp70ey06b	ct_38tp3vw78qjeaqvujysm	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.091	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_awjsn7c8qs4pjqq6glg6	org_y0txnlv69l6vp70ey06b	ct_ot6tshbxt6qo80nbx41x	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.092	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_qh02n0jt9dnq22fg4ex7	org_y0txnlv69l6vp70ey06b	ct_o0z0jt4s9g4297kglx8k	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.093	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	wpp	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1d4w38m9zu9qb4tt5ogt	org_y0txnlv69l6vp70ey06b	ct_gv7k3b2tgp3np16hxrmj	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.094	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	darios.3010@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_arax03qw2sxqttga6fgu	org_y0txnlv69l6vp70ey06b	ct_e185ppup48ygqh652nzo	coh_7j07dkq1zqp7ta2di1u2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.094	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ronaldguazzo@gmail.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bapz52m98p4cdifjy7sl	org_y0txnlv69l6vp70ey06b	ct_wh7o5f78d3dghltj63tb	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.095	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1275	\N	BERKES OC 3207660	\N	4137	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_02ddg2aqmb8x3bt0yl51	org_y0txnlv69l6vp70ey06b	ct_8wm3mtb6861l697ng61n	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.096	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nq1wlci0pitse1eovdjt	org_y0txnlv69l6vp70ey06b	ct_a1g601fn42ta1j2i9mft	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.097	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xtsyp5j9axhtjjqqmf8l	org_y0txnlv69l6vp70ey06b	ct_qst1onjsvxr9b6oqxo7d	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.098	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kcmqof3gbw9p3qf65p7a	org_y0txnlv69l6vp70ey06b	ct_ow1imb4uoc6r9aq26464	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.099	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hbqjmm3ao7fk7kheak5w	org_y0txnlv69l6vp70ey06b	ct_l7zu83mlwztpaccovroy	coh_1ywhmtllljcb78h0slij	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.099	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nofory3nsore5npe9k7i	org_y0txnlv69l6vp70ey06b	ct_jibuii82lzjxq1tzukjp	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.1	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ZULAMIAN	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_harl4gia8dhx1pdcqwiq	org_y0txnlv69l6vp70ey06b	ct_k6lyyndc43c65cuewxs1	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.101	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_7yv2rp8upi4uvi1dmy1r	org_y0txnlv69l6vp70ey06b	ct_esqks78h1rxeowbu8oc7	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.102	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hds9oyyobovfk87sl00s	org_y0txnlv69l6vp70ey06b	ct_rqdf5wdnhisj1fwt86cd	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.104	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zaee3d74x0e8ll4dkrmk	org_y0txnlv69l6vp70ey06b	ct_sk22abcjuzk01ljfkxn0	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.105	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2jv2ijcp3umqzc5vmhmq	org_y0txnlv69l6vp70ey06b	ct_zdvvwq7p8z46oif99bq8	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.105	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_d7hm0xq12ft49n181l7x	org_y0txnlv69l6vp70ey06b	ct_ravr80wapkzolkbx460u	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.107	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nl2jv7v7nj0o2btfsa8d	org_y0txnlv69l6vp70ey06b	ct_m78k0262xcdcukbls9li	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.108	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ecdlah6z38mk6un84vco	org_y0txnlv69l6vp70ey06b	ct_ou4m4qyob4tz95n8ibt6	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.109	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6m9ps89ipu5wfvjgal0a	org_y0txnlv69l6vp70ey06b	ct_vimv2zr8vzx5rjgkyc4u	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.109	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_awyrva7cutctticz2779	org_y0txnlv69l6vp70ey06b	ct_1b7162oyg2zdigekceas	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.11	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rx17jztp3jhrdwajzols	org_y0txnlv69l6vp70ey06b	ct_anj4jf0orojdvrmnavjg	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.112	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_h5z4bff0xhn30wj5dht0	org_y0txnlv69l6vp70ey06b	ct_31bibppwmzlpstprzqdb	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.113	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_90lag0tuwi2ptcbaegg0	org_y0txnlv69l6vp70ey06b	ct_gegvw8tdnwaauj1b018a	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.114	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nnd12q9q2b16lthlkijj	org_y0txnlv69l6vp70ey06b	ct_gvd3bb9s0pvcwv3o3x5h	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.115	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	17100	\N	im durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_pgt4q4utxh80azfaoh1z	org_y0txnlv69l6vp70ey06b	ct_ku8rvyf1e3o849e4n3ql	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.116	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14116	\N	im durazno	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_st0izw2ox576bupyfohr	org_y0txnlv69l6vp70ey06b	ct_5epk3a3tx0emviicr8yz	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.117	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8550	\N	facturar a serviam / transferencia	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_u8kht1020v3al3vv0vue	org_y0txnlv69l6vp70ey06b	ct_b9p43i8ksuqc8huonk28	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.118	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	Im colonia - compra directa 861759	\N	4139	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xg8nvcn6mnj3qhkgkjgp	org_y0txnlv69l6vp70ey06b	ct_4by72fp42lvrm96iiygx	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.118	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	im colonia - oc 861760	\N	4140	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ah7ex5kdl18ux0v1z8a0	org_y0txnlv69l6vp70ey06b	ct_lb8whbhsnx2og714jppr	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.119	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	500	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hhlb4z248352qsx6at2d	org_y0txnlv69l6vp70ey06b	ct_xl9nuxjwitpvgityfa3b	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.12	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6hibzx8f2gtkj3um2lga	org_y0txnlv69l6vp70ey06b	ct_ygmvtyh4icoz3io2n61p	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.121	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_i5tjsu3dxrjcbhosynki	org_y0txnlv69l6vp70ey06b	ct_ayl1old045d6u0aqr2ic	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.122	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14450	\N	IM Colonia	\N	4141	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_se4dh0mb86snmcek0udo	org_y0txnlv69l6vp70ey06b	ct_01iei4vbpxqh0j31axgp	coh_22o5q4dmzp3c0fw2i0rr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.123	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	4275	\N	transf 10/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4yq7fg6xsqsjkxv7g9z4	org_y0txnlv69l6vp70ey06b	ct_vzptg6n4b5a8ytbkxpmu	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.124	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	seña $1.155 el 19/6 - $10.395 por MP el 24/7	\N	871	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_tto6hvhh76pjwi0g4469	org_y0txnlv69l6vp70ey06b	ct_gihr3i524upftmkk14t1	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.125	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de credito	\N	874	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9p7exh6ab92yp1z9023e	org_y0txnlv69l6vp70ey06b	ct_og1gsdc6gl46tq646syh	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.125	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	seña 10% transf 26/6	\N	872	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_mmggpabj4681hqaims8d	org_y0txnlv69l6vp70ey06b	ct_0cynznz47x3zws0ltqoo	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.126	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	transferencia	\N	889	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_js5d05p6dazgtdokrlnb	org_y0txnlv69l6vp70ey06b	ct_n0x8sa6p8r76zd0dlhq0	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.127	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	tarjeta de credito	\N	890	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_imdwthu47cr3ixy051ws	org_y0txnlv69l6vp70ey06b	ct_o7zxhvg9qggbjw6x0sgr	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.128	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11550	\N	trasf $3000 30/6 - transf 13/7 $3.000 - 31/7 $5.550	\N	891	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bo2nqlx5s5fq3b1txpq4	org_y0txnlv69l6vp70ey06b	ct_be23eluq87muu6mx0xa0	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.129	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	892	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_p5wuw4yd7en6iluv606n	org_y0txnlv69l6vp70ey06b	ct_se2g6qjdwt0nukb6lvl4	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.13	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	transferencia $11.550 el 13/7 - paga saldo al comienzo	\N	893	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_90235x0pdlxd38cijw7h	org_y0txnlv69l6vp70ey06b	ct_vhnhmyzk55gc3t2n63nr	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.13	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito - pensó que el curso costaba $7.000	\N	899	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_v18qk3xo39q3xvngmp86	org_y0txnlv69l6vp70ey06b	ct_yrchsigfeusllevfaqli	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.131	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	900	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_yy0gm8ubzh457rt3o2t8	org_y0txnlv69l6vp70ey06b	ct_kvqs56xtax6vxdq6sv4g	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.132	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	estudiante - tarjeta de crédito	\N	903	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_mgpfi9e52z7962xook1x	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.133	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	se baja y pasa a EBIM	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_t2k85kg1t3dpizj32hm5	org_y0txnlv69l6vp70ey06b	ct_my5dr0nr6pkpvcsqajtm	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.134	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18840	\N	Transf 27/7 - se facturó a $18.480	\N	906	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_lq1nwoa6e8egsnhp0m75	org_y0txnlv69l6vp70ey06b	ct_missa3il818b2cmc80ji	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.134	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18400	\N	presencial oca 29/7	\N	907	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nc0blhjkpqmpu2yft8k2	org_y0txnlv69l6vp70ey06b	ct_ugd1rdn2v2l69amiblna	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.135	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	paraguay	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_irj15f883l9vofg98u1o	org_y0txnlv69l6vp70ey06b	ct_3o8drttlxgoif1ntnbmu	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.136	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	paraguay	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1sz9pdf1yj7zi0682qoo	org_y0txnlv69l6vp70ey06b	ct_r16wwpyicaiey6ypjqhq	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.137	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Eslicon SA - Rut 215917050011 - Maldonado 797 CP11100 Montevide	\N	4143	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_gm201zq9pxdmv8hpbmpw	org_y0txnlv69l6vp70ey06b	ct_0jgc4lnen0vaynpw7mub	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.138	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	\N	\N	909	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_uodwddxl15w6bmnw10q8	org_y0txnlv69l6vp70ey06b	ct_2p8h9jhvvpbmpkxke16k	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.139	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	$11.550 el 5/8 - Natalie: paga el saldo en setiembre según lo conversado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ytfgugzf1ickgc78xitj	org_y0txnlv69l6vp70ey06b	ct_wqhss598kd3zuwmlr626	coh_ydka81s7x8kixtq95vsm	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.14	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	transferencia ago/set/oct	\N	910	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sxk07of8a35cfzkxltt3	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.14	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19380	\N	Dirección Nacional de Sanidad de las FF.AA con RUT 214700820011	\N	4144	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hx9u6e6e4lz4sx0yioqi	org_y0txnlv69l6vp70ey06b	ct_8a0mtv6xd7lijwmvgrj8	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.141	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	transferencia 30/6	\N	895	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_th33fmpqjv96b5o6pa2l	org_y0txnlv69l6vp70ey06b	ct_yqf77qpti68iani3ixu5	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.173	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sn5y9ldhe36k7u67m9na	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.142	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	transferencia saldo 14/7 $10.132	\N	898	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_gnbl09fiervi3ne7zyue	org_y0txnlv69l6vp70ey06b	ct_myz9lqrmj8kthh5b61d0	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.143	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11258	\N	tarjeta	\N	896	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sxfxdazjjkah5g2a0rv4	org_y0txnlv69l6vp70ey06b	ct_p0dwxw98pm1m87i98fl4	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.144	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18012	\N	oca	\N	897	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ropnc7fu3g6zibhyn7dp	org_y0txnlv69l6vp70ey06b	ct_4txnsmjmxc0x6ca60d4r	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.145	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sjl5db842daway2odsfv	org_y0txnlv69l6vp70ey06b	ct_ec03jn7zanyfi4g0nwt0	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.146	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_cpqgiszytkwk7c65pj64	org_y0txnlv69l6vp70ey06b	ct_b4mpsql0mfg1poorht29	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.146	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rhly0758gyp4zwvojrgs	org_y0txnlv69l6vp70ey06b	ct_ra3ga657hrde0x8worw1	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.147	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	22515	\N	facturar a grupo disco	\N	4145	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_cohv9x9hulmtixi17393	org_y0txnlv69l6vp70ey06b	ct_qpcz7bfz4x2ui2izzuta	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.148	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_x0tig45o1solmpro6iaq	org_y0txnlv69l6vp70ey06b	ct_4r8aiiwz7vkbtpr7zpah	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.149	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	450	\N	tpago pendiente	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rrxlxuvcyu4x5jsa5e3k	org_y0txnlv69l6vp70ey06b	ct_gt0i0omdgz7eqn5bv2lh	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.15	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	250	\N	facturar a Elemental Ingeniería  envio factura a jgomez@elementalbim.com o facturas@elementalbim.com	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_h0pazwl6esztncg9jfui	org_y0txnlv69l6vp70ey06b	ct_nhk8iiqvpmupgb4m4q5e	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.151	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	250	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4o07ryu4k33td785x06r	org_y0txnlv69l6vp70ey06b	ct_pgxnkjg998m0resh1gum	coh_aas6nhly9bgr81bq09ql	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.151	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	36000	\N	RHJF SRL	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_t75iwmfmdldzqv91nhxq	org_y0txnlv69l6vp70ey06b	ct_32tmcjryatk4o9updc0p	coh_aas6nhly9bgr81bq09ql	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.152	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	RHJF SRL	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9mfwivkm789d4iv69fvx	org_y0txnlv69l6vp70ey06b	ct_knbkmvrgfrqoapq2xrlz	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.153	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	transf 4/12	\N	593	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zmtoexyf5ccd6g977njx	org_y0txnlv69l6vp70ey06b	ct_6ywd616mlu77ggrza4l8	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.154	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	seña $4150 5/12 + 2 pagos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hr081q2iadtu9zkpme1t	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.155	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6100	\N	se anotó en dos cursos total $14.400 - 5/12 transf $4800 - el 13/1 pagó $4800 - 20/2 pagó $4800 - se cambia de grupo	\N	589	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_uvcl81cp7oj7teh281d4	org_y0txnlv69l6vp70ey06b	ct_aez2b5rmranl6oc2vztc	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.156	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Transf en 3 cuotas - 3/1 pagó $4.083, 28/1 $4.083 saldo 4.084, 19/2 4083	\N	595	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vl76ejtfyprmyzm19exk	org_y0txnlv69l6vp70ey06b	ct_vssmygmwqlchj4ml6ulz	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.157	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transf 29/12 $7900	\N	596	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0luc7e23478hejcli4xr	org_y0txnlv69l6vp70ey06b	ct_5ssnmi55usc0kf2zfoi6	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.157	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1380000	\N	transferencia	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	PYG	\N
enr_vta8nmlhlh888vcrymi1	org_y0txnlv69l6vp70ey06b	ct_xorxk70yjv3pj5ynziyv	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.158	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	Tarjeta de crédito OCA | Del 2/2 al 6/2 estará de viaje	\N	597	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_x1ws1zogk2oocip22vx6	org_y0txnlv69l6vp70ey06b	ct_ig1by7lwgcmjqahfg1gg	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.159	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	tarjeta de credito tiene revit tambien $17.800	\N	598	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_yterwwaibbjjbob6jqji	org_y0txnlv69l6vp70ey06b	ct_hf3bfxopbxp3xare7on8	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.16	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	tarjeta de debito con mercado pago 28/1	\N	614	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1msat7p2p7dv4vqg4nbv	org_y0txnlv69l6vp70ey06b	ct_hslpx9rcuvdkydukqlkj	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.161	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 29/1	\N	615	PAGÓ $4000 POR UPGRADE DE CURSO	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_utve5p0azx48kbxen557	org_y0txnlv69l6vp70ey06b	ct_gwj3w1x8nyu5f6ob4756	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.162	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Transferencia 29/1	\N	4003	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_v0zukxe24dbostu7vzst	org_y0txnlv69l6vp70ey06b	ct_k1c3nd876a4mar7pe35m	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.163	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transf 50% feb / 50% mar - el 2/2 pagó $3950 - el 26/3 pagó $3950	\N	618	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_st3oyq9r2mpfifp7zj6r	org_y0txnlv69l6vp70ey06b	ct_v96uwolph2zqeab8t630	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.163	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 30/1 - charden sa	\N	4004	está mal la CI	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_umg5t05kix3yf8tnoxs5	org_y0txnlv69l6vp70ey06b	ct_dbvs7vu5d7dctdc6i48m	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.164	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia 4/2	\N	814	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zxm9zb2p5l2lpvje1psz	org_y0txnlv69l6vp70ey06b	ct_56xsf4a80ggurim33yce	coh_nov7nfvbqq0bzhjm4xid	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.165	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	oca presencial 5/2	\N	815	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kkgefs0nc7x7d1rrw6rq	org_y0txnlv69l6vp70ey06b	ct_owv09p4844kfnfasfa74	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.166	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_igoau2h09wwfci7ywh4o	org_y0txnlv69l6vp70ey06b	ct_acx5rbd4z84k93fcxilh	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.167	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_qbbkjfz6laijvjg9o57j	org_y0txnlv69l6vp70ey06b	ct_c3h42bd3byl0h46n4kai	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.168	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_k77fm2yfwghurpdtii27	org_y0txnlv69l6vp70ey06b	ct_bbnczrh0rbhryw4glu2l	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.169	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_v7u9fs39udgyda6k5iti	org_y0txnlv69l6vp70ey06b	ct_7eqd1jwnzmtaqph6b69j	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.17	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nt8du4nctmes5sp4tlx0	org_y0txnlv69l6vp70ey06b	ct_vi3zs7iqydyzrbs9f3bc	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.171	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kusnxhjug7pk1auombt7	org_y0txnlv69l6vp70ey06b	ct_xqoq2uut6q1vvhezh0io	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.172	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ca21c9fw7xwnonovh5m0	org_y0txnlv69l6vp70ey06b	ct_chhucvvkgyyneuirbzk7	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.173	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_152mr1og9uv7hblyf65o	org_y0txnlv69l6vp70ey06b	ct_08cg3ftf0qan7ss8z21x	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.174	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_05fs5mgcdq8oxaws3zrj	org_y0txnlv69l6vp70ey06b	ct_zo2pzwag90vslw4abr7o	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.175	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ojxoji5qd1xk40xbylst	org_y0txnlv69l6vp70ey06b	ct_84vh96lu1loh3vf94cjs	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.176	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5ojeumoucs7ke1878mqt	org_y0txnlv69l6vp70ey06b	ct_vrkuta96azae6q444w9w	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.177	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6aada3266th7phzncppq	org_y0txnlv69l6vp70ey06b	ct_a6p5j4g2o3or9yn4q1z8	coh_jwy2sja5eq1g393rve3d	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.178	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_b4yc2ytjmb4kqr505m9s	org_y0txnlv69l6vp70ey06b	ct_iypxtbeiu388z9zox635	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.179	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2fsr70vejhayl6z982o7	org_y0txnlv69l6vp70ey06b	ct_rx08oljrjoascvqm2y1r	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.18	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_wfmkdtj0i2mg8j4oo4kd	org_y0txnlv69l6vp70ey06b	ct_mrg3fw4g7rlltdsif5te	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.181	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_niuczxlcf02s9a3eeump	org_y0txnlv69l6vp70ey06b	ct_0xfsjveoox1mfvw6f6r3	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.182	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_14s9f04jtlw67539xqro	org_y0txnlv69l6vp70ey06b	ct_2davdpdx3myfo8p9x2eh	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.182	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_iy3cx3gj98eqwzscjtqp	org_y0txnlv69l6vp70ey06b	ct_dde4wdiaxtmfxu9y31dz	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.183	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_olliqqrth5socaw3shsq	org_y0txnlv69l6vp70ey06b	ct_jrej0wrmyac21p887fe2	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.184	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Victor Manuel Lopez	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ydo6ria44l1bq2mw4030	org_y0txnlv69l6vp70ey06b	ct_k34ocq3hexgctmavy2oj	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.185	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Pere Serravinyals	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_avn47zhx44icnaqdlkgs	org_y0txnlv69l6vp70ey06b	ct_29751vqljjjz20ogmq7f	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.186	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Antonia Maria Martorell	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_eh2injkg0ozmttiiagfx	org_y0txnlv69l6vp70ey06b	ct_msrbuujc00euxycev6ac	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.187	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Eva Diaz	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_yiwrdfvgu0nq09l3su4e	org_y0txnlv69l6vp70ey06b	ct_apkxj7ks0ciwyw6bnv61	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.189	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Salvador Ramírez	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_27gtx0e5gyei9v2oqx6a	org_y0txnlv69l6vp70ey06b	ct_83gbpi4z5tssc3rai80i	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.189	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xs9dtu27jpnplhb6w2my	org_y0txnlv69l6vp70ey06b	ct_wf7kes4in4d0lldmh460	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.19	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_j07lpv7g2n2kpstjtj8e	org_y0txnlv69l6vp70ey06b	ct_mug65680leuqvdfpefh1	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.191	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fuybdvuuz9bfczwymipn	org_y0txnlv69l6vp70ey06b	ct_mka3v5xdz0e5t1dmxm8b	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.192	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_09ififdb9ewbdougx6qy	org_y0txnlv69l6vp70ey06b	ct_dzjw1273ietucur67rzp	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.193	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_alsye1nq38je23vcaojc	org_y0txnlv69l6vp70ey06b	ct_i57asd9wwktua1z993ny	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.194	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_yaclsz62v8wbbw5686er	org_y0txnlv69l6vp70ey06b	ct_cqr33sonwova2vmi6wrz	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.195	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_258gsvpgi8fnox29m2j7	org_y0txnlv69l6vp70ey06b	ct_08cg3ftf0qan7ss8z21x	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.196	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_oiwry7p2z9vlqjje051p	org_y0txnlv69l6vp70ey06b	ct_owv09p4844kfnfasfa74	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.196	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2ujc7exzyufwh3a7xwhe	org_y0txnlv69l6vp70ey06b	ct_b1j3omevlbv625dnon4c	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.197	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9vsvalkv04xa2e1ylxyr	org_y0txnlv69l6vp70ey06b	ct_bbnczrh0rbhryw4glu2l	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.198	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ggmn2nlbwli2ctu3bsyg	org_y0txnlv69l6vp70ey06b	ct_acx5rbd4z84k93fcxilh	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.199	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_nkjf90rikkq7gq5fd6ef	org_y0txnlv69l6vp70ey06b	ct_vi3zs7iqydyzrbs9f3bc	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.2	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4r299r6npcjfstbw23gi	org_y0txnlv69l6vp70ey06b	ct_7top8nm3vgktp1bsl569	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.201	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_11zvkhqx04dlm717dc6p	org_y0txnlv69l6vp70ey06b	ct_hajhwyq4pve7fbgjokr3	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.202	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_y2k8aigv09papvl2ptxg	org_y0txnlv69l6vp70ey06b	ct_5w2y45ms5frt0g6ghptf	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.202	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fuyirtqalj5oc14dqqc2	org_y0txnlv69l6vp70ey06b	ct_jbvgkqu1vyyhhsgd4bq9	coh_cwt9u68z4utu1t54l8x7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.203	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_7i61umk2btuy03xfehur	org_y0txnlv69l6vp70ey06b	ct_cfmol0q5e0o20sw9u5da	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.204	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9600	\N	nueve uno (BRILGENCO) - pagó por transf 27/4	\N	4104	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_jxczy813ktgalrfnk155	org_y0txnlv69l6vp70ey06b	ct_ddgeytw2wmyt26yk65oh	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.205	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10200	\N	Ya pagó el 18/12 con transferencia (15% desc.)	\N	838	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vz2twaw5mgp36rydiniq	org_y0txnlv69l6vp70ey06b	ct_2peskmf7z7duxm8nu56b	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.206	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_7klhhky58o88q61sfacf	org_y0txnlv69l6vp70ey06b	ct_arkflzoobww564vke4pf	coh_tf9ckgcjesdoen42ak0h	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.207	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5m0lsz9dxuqtvwdbjtna	org_y0txnlv69l6vp70ey06b	ct_tgt03655a4xf0mxe7fdd	coh_939u17ifmjfns7pr40d2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.208	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Benitez Bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_3e88n1zrrf32ngke6s6e	org_y0txnlv69l6vp70ey06b	ct_x72d3kmdccbnqm7rr6t4	coh_939u17ifmjfns7pr40d2	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.208	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Benitez Bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8ac54n7hncoxvmutjc1h	org_y0txnlv69l6vp70ey06b	ct_4oswg5quch4mpxucau40	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.209	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	34500	\N	cousa	\N	4108	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4vl5cbxibjdyr2mhgli3	org_y0txnlv69l6vp70ey06b	ct_j4cqj5wpiunw7oco0sww	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.21	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_12is72wjjnf8og9ld22e	org_y0txnlv69l6vp70ey06b	ct_34iw9gqfxegazhwt9iyd	coh_43zed46s1cxhwfuu3xdx	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.211	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vn4fqqnq5v24vx8wev28	org_y0txnlv69l6vp70ey06b	ct_qvjygvffpu4wqi4mngeq	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.212	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14400	\N	oca llamar 11/12 despues de 17hs	\N	837	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8eqw1yrlcuvtqgqqx8fh	org_y0txnlv69l6vp70ey06b	ct_6j50ua6w0icoxn9vv480	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.213	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_u23020w29pb7kqkcqvcc	org_y0txnlv69l6vp70ey06b	ct_w1zdnvajbbcc5t2ow4l1	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.214	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	benitez bittar	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hcbwq96334v757a5dapc	org_y0txnlv69l6vp70ey06b	ct_98flwj98j0ld0gxleyl3	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.215	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	360	\N	usd 100 acreditado 8/1 PY, usd 100 10/2, usd 100 23/03, saldo usd 60	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_68yrgvxvibkk8js80ygs	org_y0txnlv69l6vp70ey06b	ct_9jnu97oqvs4nhwbhpeyy	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.215	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	pagó 28/11 link	\N	586	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_168ir78xx2j7jgke7xht	org_y0txnlv69l6vp70ey06b	ct_2z6s3fw7ah0wcjayexvw	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.216	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	\N	\N	585	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_04n441y2p3zd6t5lg8vp	org_y0txnlv69l6vp70ey06b	ct_vgaxakv0rr0q9di5ba63	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.217	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 3/12	\N	592	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sepu6m60xe126icp76fl	org_y0txnlv69l6vp70ey06b	ct_6puo7oazd7064grnr64a	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.218	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 5/12	\N	591	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ptskdomysc8helhcoxk9	org_y0txnlv69l6vp70ey06b	ct_ncas8r8tgiofruydklv8	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.219	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	transf 8/12	\N	594	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_lu96m4457j7zq41p8ks6	org_y0txnlv69l6vp70ey06b	ct_6ywd616mlu77ggrza4l8	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.22	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	seña $4.150 5/12, $ 2.075 19/01 saldo $2.075	\N	587	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kkysvmjlmr7tofq2x90z	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.221	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	8300	\N	se anotó en dos cursos	\N	588	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_w3d30l364ij071uqf7ok	org_y0txnlv69l6vp70ey06b	ct_pyaotn72uyjb37ih1hce	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.222	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia antes del 22/12 - Enzo no responde los mensajes	\N	599	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ekvpkansb153y9027qv2	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.222	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	transferencia 29/1	\N	600	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_y5y3pj2x2iduesnnl6kp	org_y0txnlv69l6vp70ey06b	ct_sgc2b6gbxegqqf6hiwyr	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.223	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	pagó el 18/12 $9900	\N	601	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_whyodsfnkr30kz206w1p	org_y0txnlv69l6vp70ey06b	ct_u9jszvv9oz8r58vt8l5p	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.224	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	profesional	\N	603	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0gwffa5kdmcbrdima3pf	org_y0txnlv69l6vp70ey06b	ct_kzrcjyrgrlnwgvqgqole	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.225	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	OK CONSTRUCTORA SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rpmdzfygb70nhf4k0t1a	org_y0txnlv69l6vp70ey06b	ct_jut4axr4rdesuvv1akdq	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.226	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Pagó seña el 24/12 y el resto en enero	\N	602	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_y0ovoe8zjkmbc41pw3bj	org_y0txnlv69l6vp70ey06b	ct_ig1by7lwgcmjqahfg1gg	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.227	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	tarjeta de credito tiene autoCAD tambien $17.800	\N	598	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_h94jep0jmbyjvm04walj	org_y0txnlv69l6vp70ey06b	ct_qqgvd83dxq8py1b4x38m	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.228	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS	\N	604	pendiente de facturación, no tenemos sistema contable	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_tityqrz6wb6x6qvg51ba	org_y0txnlv69l6vp70ey06b	ct_n32ag73n01hq0loczhch	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.228	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS	\N	605	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_v77ymdxfb32ht55hpn8k	org_y0txnlv69l6vp70ey06b	ct_r3vqu7tnisp30qsvrcpm	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.229	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	BPS - queda pago, lo hace en otro momento	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ilb51y0osaf55z2hso60	org_y0txnlv69l6vp70ey06b	ct_30bhwy753n4buwd5i7pn	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.23	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 14/1	\N	606	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6yq2bkmdotxsheuc8sho	org_y0txnlv69l6vp70ey06b	ct_g4kzzrgure5bl9l1nr1h	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.231	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Tarjeta de crédito 12 cuotas	\N	607	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rneo8i57ma0v91993cro	org_y0txnlv69l6vp70ey06b	ct_mmx6z8xol56lu1doodg7	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.232	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 25/1, pagó $9.600 - 23/3 pagó saldo $300	\N	608	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zz9rob5uq2jlxm76lzio	org_y0txnlv69l6vp70ey06b	ct_u5h3vh05kussthcpqqqs	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.233	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sf5roq38roe7xpq1kbpd	org_y0txnlv69l6vp70ey06b	ct_66br25ae5t5b23jafccx	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.234	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 50% $4950 21/1 - 50% transf 18/2	\N	617	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_inf6halq4he9iy31ks7m	org_y0txnlv69l6vp70ey06b	ct_9sme557v445zw5lfpa7u	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.235	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	seña $2.310 26/01 - 23/3 pagó $20.790	\N	609	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_d4lpiwfyh35vlkqb3msw	org_y0txnlv69l6vp70ey06b	ct_xpmfe99eef491j8zgjme	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.236	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transf 5000 el 27/01 - transf 4900 5/2	\N	610	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_qc08jkvwedml222x6m4e	org_y0txnlv69l6vp70ey06b	ct_wx674y59uodyitv0o3sa	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.237	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	transferencia 26/1	\N	611	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_aaaxl5w96rb47sz1xjwj	org_y0txnlv69l6vp70ey06b	ct_8qi2jrxa538rk49ii7a1	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.238	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bgo2p60i4vozyoe8ctbe	org_y0txnlv69l6vp70ey06b	ct_kjr66h6mwvokt56ia5ea	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.239	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4z8tu32y8ieqvy2rb3q4	org_y0txnlv69l6vp70ey06b	ct_jmai64gjzpc49xxdtpbt	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.24	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_3bftn7y69y87z0aoyvyb	org_y0txnlv69l6vp70ey06b	ct_1mt84favrcsp34to2q6p	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.241	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Humphreys	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_jdxyfdksnwsfkvhen3rf	org_y0txnlv69l6vp70ey06b	ct_4hp5kwr24a1bsb7i2vo2	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.275	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_e9krwctpsagx3xvcyah7	org_y0txnlv69l6vp70ey06b	ct_wq8aiekx72qkxa7d2kbt	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.242	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	mercado pago 26/1	\N	612	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_wfqji73sf0n1sg71utj8	org_y0txnlv69l6vp70ey06b	ct_ice45dlgb03j5bb5tquh	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.242	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	mercado pago 28/1	\N	613	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ei5v678dovubbpdlx0fc	org_y0txnlv69l6vp70ey06b	ct_h8nuht48h7szfxl0gcbi	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.243	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	Tarjeta de crédito 28/1	\N	4002	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_60g9x9nshb2wrbwamas9	org_y0txnlv69l6vp70ey06b	ct_urp4rlkjnv3gc2ld8541	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.244	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 29/1	\N	616	COBRAR EXTRA POR UPGRADE DE CURSO $2700	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_pizqp03wyncd8wughu0p	org_y0txnlv69l6vp70ey06b	ct_59nrj6n3cfida34qbw4s	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.245	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_eubfet95qfubzm2tjwy3	org_y0txnlv69l6vp70ey06b	ct_r6paucbcrymyd2fxucs6	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.246	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	paga en 3 cuotas, +598 91 529 081 cecilia - pagó $3300 el 6/2 - 5/3 pagó segunda cuota - 8/4 pagó ultima cuota	\N	809	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5v6ledtrut4eyrucwhbe	org_y0txnlv69l6vp70ey06b	ct_oi48t0i2p37eiyaxslsf	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.247	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2 $9900	\N	803	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_khok668r9h0ghfckckmp	org_y0txnlv69l6vp70ey06b	ct_f2vgquicssz1nou4b504	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.248	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2 $9900	\N	810	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2zqrbf2f6q1vvu8g0erd	org_y0txnlv69l6vp70ey06b	ct_416xi720m7svcnxzm16b	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.249	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	tarjeta presencial 4/2	\N	811	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ymkgusibe66oxgsw5z2m	org_y0txnlv69l6vp70ey06b	ct_gmu8ja7mw7qagmv8027o	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.25	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	efectivo 4/2	\N	812	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_mogeujpyhzby9m0fbjo4	org_y0txnlv69l6vp70ey06b	ct_6x1go9apq5v84377ao18	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.251	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	transferencia 4/2	\N	813	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_jbhs1k7ibp8sqpjl2so1	org_y0txnlv69l6vp70ey06b	ct_p4y4tomuyxhzh39etcj1	coh_sl0hpv9bnhpyecb5uaw1	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.251	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	pago en 2024 pero no cursó	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1h5hajfwzckxscrcba4n	org_y0txnlv69l6vp70ey06b	ct_c1m5uig1eo366jctbhk2	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.254	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_q68bkq47nds6izqosmm3	org_y0txnlv69l6vp70ey06b	ct_ev5np40dfljisa5jtaez	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.255	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_izgmp3plbo5aseepa2gx	org_y0txnlv69l6vp70ey06b	ct_ptqa4olpspscjro4m0ld	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.256	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ij49cpxsdzbobeirav4x	org_y0txnlv69l6vp70ey06b	ct_wqh95qq49xzc7c8rmq5x	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.257	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9vpy092wz85qw7tdii31	org_y0txnlv69l6vp70ey06b	ct_emrkclo9sph47ucrjkmw	coh_j1qdgpt23p89pxxc7aig	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.258	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_t93do5pftqos3ke0re79	org_y0txnlv69l6vp70ey06b	ct_io0g79gzwnikxeay7f14	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.259	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13680	\N	oca	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_wm9n33ht9m4ivo3cwkb8	org_y0txnlv69l6vp70ey06b	ct_zxybd0vbs0ovb1va9lv7	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.259	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13680	\N	oca	\N	A820	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4oxazkhicoyqiu6babj9	org_y0txnlv69l6vp70ey06b	ct_gxvtczx280ck8z0zomvh	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.26	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_46rlrb1g5a91os92ki7l	org_y0txnlv69l6vp70ey06b	ct_q926137miey19hjqrqd4	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.261	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9l6kgbwg84pm415rupur	org_y0txnlv69l6vp70ey06b	ct_gmz3rfrk7pu7m5jtq1r9	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.262	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	30536	\N	UTE	\N	9285 por FLUSOR	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1jfe6e8muw0gaymsm83i	org_y0txnlv69l6vp70ey06b	ct_o5id01cjtynkgw1aqjq6	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.263	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	UTE	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_9kr5zeu7rwginptpgin2	org_y0txnlv69l6vp70ey06b	ct_85eqw7lmq50ikniau81d	coh_85l5fveocl6msnly21a0	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.264	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	430	\N	SICON PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fhq4ngbcv2rgllggbmy5	org_y0txnlv69l6vp70ey06b	ct_4oswg5quch4mpxucau40	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.265	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	78300	\N	cousa	\N	4108	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fjwxlqvi8886jpm0cxgw	org_y0txnlv69l6vp70ey06b	ct_j4cqj5wpiunw7oco0sww	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.266	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	cousa	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6o7dmz76oor8l7y0gl0o	org_y0txnlv69l6vp70ey06b	ct_34iw9gqfxegazhwt9iyd	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.267	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	cousa	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0rwk3t2vfiuom539udxo	org_y0txnlv69l6vp70ey06b	ct_7o6sa8polarxatrxcsw9	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.267	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	20880	\N	Paga con tarjeta de crédito OCA (el monto ya tiene descuento aplicado)	\N	A826	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_mi71d2vjb7r7cmfud8qt	org_y0txnlv69l6vp70ey06b	ct_1w0f7xmypxep5hwx8h00	coh_kcdropxtyo32kpqqddg3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.268	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16900	\N	Desc. autorizado por Gustavo - Transferencia - pagó $8.000 el 6/4 - pagó $8.900 el 1/5 -	\N	A829	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0qbnh5x2xiuq5kg1hzao	org_y0txnlv69l6vp70ey06b	ct_w87z1jao43d3hfoo08ec	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.269	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	7900	\N	transferencia en marzo 25/3 por itau	\N	817	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_osbv32s09toe3ygpkvfd	org_y0txnlv69l6vp70ey06b	ct_v1hasicgvj1brseq9vv3	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.27	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	se anotó en dos cursos - se cambió de grupo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_fz209o8bto92biikefxo	org_y0txnlv69l6vp70ey06b	ct_rlwtvu81j6v2b8nqmi0q	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.271	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Pagó con débito	\N	A828	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_z6xgsxyc5yc2c5ddbyb5	org_y0txnlv69l6vp70ey06b	ct_jzekf46v4tvkajhazseu	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.271	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	Paga con OCA MP	\N	835	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_trucnuc7v7qcaoiu05qe	org_y0txnlv69l6vp70ey06b	ct_w5xumwe5wz42ov2b6x0o	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.272	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Tarjeta de crédito	\N	836	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2dovh3my9c0mh21a20fz	org_y0txnlv69l6vp70ey06b	ct_njyvyb2f3e1ck7cynse0	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.273	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	107800	\N	UTE	\N	4111	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_uils7hrk9gbclpmid26z	org_y0txnlv69l6vp70ey06b	ct_1geeffzgb0qt728y1sph	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.274	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_b9kgcsam1bfpy6wrp7c9	org_y0txnlv69l6vp70ey06b	ct_md436goshxjs6lln53kn	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.276	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ej6celrewg5vnj5tlqoi	org_y0txnlv69l6vp70ey06b	ct_2pgv8r1jmy6772h81dx0	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.276	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vlo41if4pa5lelgk24aq	org_y0txnlv69l6vp70ey06b	ct_sx7hojpfhsl49p1mmxxm	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.277	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rgj8u9avgfjfoxiy51me	org_y0txnlv69l6vp70ey06b	ct_7h8xbksjiur28ibigayv	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.278	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xsneo35eyl4wgmf7hscv	org_y0txnlv69l6vp70ey06b	ct_ezolbj1iecbmwcvzrbbi	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.279	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_jdhx2ouf2edh13j2s1mn	org_y0txnlv69l6vp70ey06b	ct_a9qvophuygi8v7qwi6ec	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.28	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_lznvxukxvpunaeazs5am	org_y0txnlv69l6vp70ey06b	ct_uurtglkshlzqrzuktogq	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.281	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_383rhdk0jvoxewhtk22q	org_y0txnlv69l6vp70ey06b	ct_j84ejosmialz950n63t7	coh_wd2nkb1uorc4djcrjdfc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.282	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4qqr220bcxbznjv8s27p	org_y0txnlv69l6vp70ey06b	ct_o64uehaawjcugm8e7eav	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.282	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	780	\N	OK CONSTRUCTORA SA	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_o47upn3r381p3z7ts0im	org_y0txnlv69l6vp70ey06b	ct_n5quvb6upai59t0dh7t8	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.283	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9900	\N	seña $990 transf 13/2 - 10/3 saldo	\N	816	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_3s956jea2ifa2qi00szl	org_y0txnlv69l6vp70ey06b	ct_mobjfg6rblfiwho5dbwn	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.284	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	818	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5kpzx55zd7mlr5zn3uqe	org_y0txnlv69l6vp70ey06b	ct_wj6jgkuk6f630dbo2zfv	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.285	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	A821	MP	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_somuju9u7tehr2xt58hd	org_y0txnlv69l6vp70ey06b	ct_x0wqbesxp6ku9t743jf4	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.286	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	mercado pago enviar link	\N	A822	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bc682lhb54i6tdfrozsn	org_y0txnlv69l6vp70ey06b	ct_7bvmdxa0jt8c13evbp7h	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.287	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	10710	\N	MP 26/3	\N	A823	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_p4ufwle5yf1p3xcnia6b	org_y0txnlv69l6vp70ey06b	ct_9h3cr430rqn8kfkk5zrr	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.287	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	mercado pago enviar link	\N	A824	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ww6kg4lfnwsdax8o2v56	org_y0txnlv69l6vp70ey06b	ct_c1m5uig1eo366jctbhk2	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.288	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_k09itmhwl8nea0tcc1zn	org_y0txnlv69l6vp70ey06b	ct_ev5np40dfljisa5jtaez	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.289	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	AZETA PY	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zwrqzosm99up00fogbfx	org_y0txnlv69l6vp70ey06b	ct_27v4d8e16vqrc6upvlmo	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.29	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	19635	\N	UTE	\N	4122	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_yjg8wg4eo3ma2z1kpaku	org_y0txnlv69l6vp70ey06b	ct_x9i3774eubs71mbqzrtc	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.291	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	mercado pago enviar link	\N	4107	ya pagó, quiere factura con rut MINBROL SA / RUT 213854120011 - cel dep padre ernesto 096246410	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_28yu479i3vuig4z8k1mb	org_y0txnlv69l6vp70ey06b	ct_1t6u03iygz6yy17zrt2v	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.292	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Compro licencia Revit LT Suite (promo)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_x9drsppdar3j6hsvpmyu	org_y0txnlv69l6vp70ey06b	ct_vyuyzc0q1dnb65lsv7zw	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.292	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Compro 3 licencias Revit LT Suite (promo)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_951367lf7qa8eq1pzst8	org_y0txnlv69l6vp70ey06b	ct_pagvc52zbh71ackn88w6	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.293	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	paga por MP 9/4	\N	834	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_7xqnnezvk29lclul4vsl	org_y0txnlv69l6vp70ey06b	ct_314h2g5xwa3l5af9o0li	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.294	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	estudio capote - promo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rju9rp97mfqxwnd6logi	org_y0txnlv69l6vp70ey06b	ct_4fhgnkwi48uceu5h5zhh	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.295	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	estudio capote - promo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ha2kn69axdm1ydmkjuzo	org_y0txnlv69l6vp70ey06b	ct_w53oo15v8fev5gtk6q49	coh_xld7rf296n1u8koji1qu	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.296	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	tarjeta cabal	\N	A827	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_p2m1ctyyjop2h2nvzgit	org_y0txnlv69l6vp70ey06b	ct_65dmx1bmeqmbhtpnmpjy	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.297	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	1485	\N	REVOLTA	\N	4125	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ck8g6uns7j72bqn6vnjz	org_y0txnlv69l6vp70ey06b	ct_da808l5docpxbm5okdbi	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.298	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_um2xb0bnnojuctdsxxlh	org_y0txnlv69l6vp70ey06b	ct_40xsmxt18gg4at3def4c	coh_o500qyj1yvnorghwptun	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.298	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8aapyfmd17fg6xlxspr2	org_y0txnlv69l6vp70ey06b	ct_aijy1udcjdlz7ndpasxi	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.299	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	23100	\N	Paga en 2 veces con transferencia - 21/4 $ 11.550 -	\N	841 y 845	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_bmp96fsxb909967n0m43	org_y0txnlv69l6vp70ey06b	ct_3vbrbjbnr7e6ulpnif8b	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.3	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12600	\N	mercado pago 6 cuotas	\N	842	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_wzxtjxpzjbt75hzshrps	org_y0txnlv69l6vp70ey06b	ct_6jp6kvy03mazdjdxe1tm	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.301	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	843	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_u1rotxchksk0cp1j83u0	org_y0txnlv69l6vp70ey06b	ct_fexnrgqrah8yd5ut9djb	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.302	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	844	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0i9ywemarkvtossbc1ye	org_y0txnlv69l6vp70ey06b	ct_j4vwt5758cuxl6667h24	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.303	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	ya pagó revit arq 7 2025 pero se bajo	\N	534	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_r1do04scytl6bv0n1smo	org_y0txnlv69l6vp70ey06b	ct_pexwcs5gjsw149duueyc	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.304	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	847	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_f3j5hskvuy7lf479d89k	org_y0txnlv69l6vp70ey06b	ct_0ytxao5cs0wv0j2kpr2h	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.306	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Tarjeta OCA	\N	848	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5wk9l1lqtp3yndvco9i3	org_y0txnlv69l6vp70ey06b	ct_a0i72u0n6tomlxvkzf0t	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.307	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	Promo Revit LT (no paga)	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_eez5unomlksp3b881xlp	org_y0txnlv69l6vp70ey06b	ct_ynv93yuczhz7nfnl066p	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.308	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	118976	\N	Intendencia Durazno	\N	fac flusor 9586	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ku3k6lzp95laamp1zhnm	org_y0txnlv69l6vp70ey06b	ct_3cnyyonxdhz30gkqohjj	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.308	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_btc8wb71jigu62aya1dr	org_y0txnlv69l6vp70ey06b	ct_swjujy612dsd2p05w71r	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.309	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0ayfsecwu8qvokwrnede	org_y0txnlv69l6vp70ey06b	ct_fw4y5ak3aqmcbagus8jn	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.311	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_3q3xu9a6ap7d8u2iatw0	org_y0txnlv69l6vp70ey06b	ct_pthn2suhsmehcyfd6g6z	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.312	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0dghs1oi2djkgfuehf7w	org_y0txnlv69l6vp70ey06b	ct_xwywlbulbzhr8kp03za5	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.313	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_de84hq4u9k6re4hra07w	org_y0txnlv69l6vp70ey06b	ct_6lpsx6xon0qdmpl4l6rk	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.313	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_g1l4izlqug3ymhsi9mfh	org_y0txnlv69l6vp70ey06b	ct_aerznjwghbkj8ye4s93t	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.314	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	16170	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_o318e81xld02cswdkj5b	org_y0txnlv69l6vp70ey06b	ct_a8aeo4xx3ydfogq6cvdg	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.315	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	pago presencial con oca 7/5	\N	854	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rbx7ymj0rtlocrlvwz5a	org_y0txnlv69l6vp70ey06b	ct_ao3pmbbhvjkt3tcm8jqf	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.316	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	paga con oca	\N	855	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_gahov668i68hr0g2rv04	org_y0txnlv69l6vp70ey06b	ct_pfzkf02zn3h7b6pu50d6	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.317	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	Intendencia de Montevideo	\N	4133	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rh4phxh8p2tzasef4942	org_y0txnlv69l6vp70ey06b	ct_rakovv9ksj97pty1qpjy	coh_0t6rtyqrmmrfzf2ybxgd	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.318	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	18480	\N	\N	\N	865	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_mxu3qqdk4lnfu5zezd77	org_y0txnlv69l6vp70ey06b	ct_bw5yl8v9in2vu3amst03	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.319	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Tarjeta de crédito	\N	866	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4n007s9ppqqce954m4he	org_y0txnlv69l6vp70ey06b	ct_6ck31x0yr3i0wj94vofq	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.32	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	78400	\N	\N	\N	4128	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_90sitogww4kjjad2e6yr	org_y0txnlv69l6vp70ey06b	ct_8f7a4s4myo15ea7b3o8f	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.321	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Ernesto.Decia@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6ykg2077bf7s2iafn7qu	org_y0txnlv69l6vp70ey06b	ct_pk7o3kubmvrr42qh0cu4	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.322	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Federico.Carneiro@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_71ulp098qjsfq5apdkcb	org_y0txnlv69l6vp70ey06b	ct_im44hx4v43zwkgp7e2j8	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.323	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_gleqht5yso7x38mtxuqc	org_y0txnlv69l6vp70ey06b	ct_752zbx54974iruk8kp89	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.323	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Daymel.Abisaab@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4ftsdy9v2zynvpxe208n	org_y0txnlv69l6vp70ey06b	ct_dznqwqm6whdzigyoypc3	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.324	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Mariapaula.Pintos@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ylhcj8kts761sf253yd1	org_y0txnlv69l6vp70ey06b	ct_3592tsbfv63rilz5dxbt	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.325	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Camila.Silveira@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_k7aup5dblqidz242zc3x	org_y0txnlv69l6vp70ey06b	ct_bm2q3p5u826bjvv4uxz6	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.326	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	Maria.Rodriguez.Berti@brou.com.uy	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_tctxi83yw95kw30j18kl	org_y0txnlv69l6vp70ey06b	ct_u6xb34ve7xjutc4kl857	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.327	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	868	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_i29q9enqlhlpauvmn2y2	org_y0txnlv69l6vp70ey06b	ct_9qaw44mj80ydc7f9d2pj	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.328	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	873	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sh2dwtaqvtcwd7nt502k	org_y0txnlv69l6vp70ey06b	ct_u9xuulrai3qv307xutii	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.329	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6500	\N	pagó 10/7 $6500	\N	4124	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8p3iud0cuwel9rqawkz1	org_y0txnlv69l6vp70ey06b	ct_5uaksd3bubuamk2trueh	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.33	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	transferencia 22/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ajwgn5s1k8c3xpzht08s	org_y0txnlv69l6vp70ey06b	ct_xon7g6f0kg5qwtdmz5ol	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.331	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	pagó transf 22/6 - factura a Mauro Mattos 216510170012 camino paso escobar sn	\N	4123	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zv82fd17lgogao3m69qn	org_y0txnlv69l6vp70ey06b	ct_esgt082m67g5mv517ms0	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.332	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia 24/6	\N	884	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_reabr8u2b6d28rpl5uf8	org_y0txnlv69l6vp70ey06b	ct_4rh2o35543rzpra6x6dk	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.332	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	facturar a ingener OC 161474	\N	4131	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_w8rgl6p4p6zeggvwjx8w	org_y0txnlv69l6vp70ey06b	ct_yixrt4dpjh9hsnmy41yw	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.333	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia a inicio de julio y antes de finalizar el curso - 7/7 transfirió $3000 - paga segunda mitad despues del 20/8	\N	885	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hhkxuch36mi5je2t84o4	org_y0txnlv69l6vp70ey06b	ct_q490l1033tas9gcs8rqc	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.334	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	23/7 contactar tarjeta de crédito MP	\N	886	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5ywxfd89vsnru1ccjkhb	org_y0txnlv69l6vp70ey06b	ct_k6g583mloylvda88j5se	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.335	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia 26/6 $6.000	\N	887	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_42k4n0y7z8pav3el26qg	org_y0txnlv69l6vp70ey06b	ct_si9io0z4crn7m6rzjc0t	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.336	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	0	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_xvwba62ylj37ykbg3frg	org_y0txnlv69l6vp70ey06b	ct_u42gwlaidqw53uo7ulus	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.337	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6125	\N	transferencia	\N	888	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ti5jcosd9kufur5k8gqm	org_y0txnlv69l6vp70ey06b	ct_mlb2zwldcj74vljia67v	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.337	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12000	\N	oca 12 pagos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rw4tx43cvangl2uxvtcg	org_y0txnlv69l6vp70ey06b	ct_5e4txam9jkv72xoi9xjn	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.338	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_vr4lqu9xp1vjdfv7ozbt	org_y0txnlv69l6vp70ey06b	ct_wro72i8fiiofqujxvpbn	coh_rfautax494zvjxlbtis8	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.339	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	15300	\N	facturtado a pedido del alumno, pagará Mep y Avanzado	\N	4144	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_gae5kgvsyboa8s7iot98	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_fg1r6mpdbs5ssuusq9o5	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.34	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	5850	\N	pagó transferencia 22/6 $5.850	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zqlblkug56afr9gghnl2	org_y0txnlv69l6vp70ey06b	ct_qyij7zwnzehs2k4qzrjh	coh_fg1r6mpdbs5ssuusq9o5	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.341	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	11700	\N	transferencia cuando este confirmado el curos	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_kifkj2locnugwd8pzbt1	org_y0txnlv69l6vp70ey06b	ct_8mjgwd7jl9ik5kvr2d2b	coh_iarbf4v6itw2ewunjwlb	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.341	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6000	\N	transferencia pagó 23/6	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_sj0tuz1uettcp3019qq1	org_y0txnlv69l6vp70ey06b	ct_riuez12o9nem6ssr1sdq	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.342	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	47500	\N	ZUNINO SILVA SOFIA RUT 150864930014, confirmar transferencia	\N	4127	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_tlmcttap6p8kfaw1k0xr	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.344	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transf $40.000 27/7 - 29/7 MP $17.000	\N	904	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_1qlcax1sgchf8f16mi1m	org_y0txnlv69l6vp70ey06b	ct_4q2qcqfwg1q56c1hx8jn	coh_jtbgl4phwuh6qtbj9hkf	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.344	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	57000	\N	transf $20.000 aprox 20/8  + 12 x oca	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_c4sddlh0za824lxrufvo	org_y0txnlv69l6vp70ey06b	ct_u42gwlaidqw53uo7ulus	coh_z9zwwkuo4w9cjvj84vor	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.345	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	13050	\N	factura a TUBACERO SA 212364880011, trsf	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_cwbejo4u0u3on1lfbadn	org_y0txnlv69l6vp70ey06b	ct_8a0mtv6xd7lijwmvgrj8	coh_z9zwwkuo4w9cjvj84vor	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.346	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	22185	\N	avisar cuando se confirme el grupo	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_k3vjbqvx0pp8yxdbxndf	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_dcmroictyg8bin81ouq3	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.347	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	14400	\N	paga cuando este confirmado	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_8l8c341umkkcjl0q6705	org_y0txnlv69l6vp70ey06b	ct_2lhq1lxsr7lfm2i14dw4	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.349	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	teyma	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_619clkgmih5qa8lipzxy	org_y0txnlv69l6vp70ey06b	ct_m23xr5ociwh4esv04h56	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.35	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	transf 3/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_5mt360fgzl6fz59af9n7	org_y0txnlv69l6vp70ey06b	ct_97i5rrcdvxwmttabk4rq	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.351	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	9800	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_hnxlhufsth19x3uehow2	org_y0txnlv69l6vp70ey06b	ct_brfxaq7eaoyv9tfslky1	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.352	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	tarjeta de crédito	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ds0qvy7gy51a3tx733nc	org_y0txnlv69l6vp70ey06b	ct_wsc902l54a7ygve6pj3r	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.352	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	6500	\N	transf - metropolitana trf 14/8	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_11fzdya9sc3t5lwq1ms7	org_y0txnlv69l6vp70ey06b	ct_sacnb9ppmxc6z16hd79j	coh_uywkr3hq0o0ydfx6azx7	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.353	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	12250	\N	Aladinos SRL Rut 150 128 300 011\nLavalleja 113 ciudad de Rocha. - TRSF	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6j85x31msbytj30am9se	org_y0txnlv69l6vp70ey06b	ct_32tmcjryatk4o9updc0p	coh_dsk8k484pa43py216cpr	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.354	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_4tt8owe9cnzkn98h4wgr	org_y0txnlv69l6vp70ey06b	ct_ludd2upyz99f4209u2s0	coh_g28y7xhfwhvtzqzge63p	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.355	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_rw02ikra2zaum8chz8iv	org_y0txnlv69l6vp70ey06b	ct_zl8vn7egylihxgiqhpds	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.356	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N
enr_4f6iykkzi067nukgpuvt	org_y0txnlv69l6vp70ey06b	ct_ihfhw0yj280w4s7szggb	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.356	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N
enr_9436w1ykieunqxg740un	org_y0txnlv69l6vp70ey06b	ct_zqqcma0swk93bkki188v	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.357	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N
enr_497qyd7mtammlq0hktxh	org_y0txnlv69l6vp70ey06b	ct_b7tigawwotwae9ee0k6v	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.359	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N
enr_54x03c6ujgklo8yiuflz	org_y0txnlv69l6vp70ey06b	ct_jn1alhy13bkdet9idehn	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.359	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_c841pe4z8kvys4hirww4	\N	\N	f	\N	\N	UYU	\N
enr_jo00l8fml8kru7t6d3p2	org_y0txnlv69l6vp70ey06b	ct_sy6ucdx11tq4s1qiqy9t	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.36	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_dzjfd06eqf6n9056nb27	org_y0txnlv69l6vp70ey06b	ct_gsue6i62fqoltdxpgahz	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.361	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_i327f1mdjpwoaoqpk2kp	org_y0txnlv69l6vp70ey06b	ct_ajt1bffx9lkmifo1n0h9	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.362	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_ri7nt1mttizdrggiap6f	org_y0txnlv69l6vp70ey06b	ct_7c3orpait7lzfbykco30	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.363	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_t9jus7bxo31qyaamqfxr	org_y0txnlv69l6vp70ey06b	ct_od91c05h76dybvxtydix	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.364	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_6fcmkog8y2f9sskfi5t4	org_y0txnlv69l6vp70ey06b	ct_85eqw7lmq50ikniau81d	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.364	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0uw935mamsfkj53unsg4	org_y0txnlv69l6vp70ey06b	ct_mjou5sr0e27ha3m8ru6d	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.365	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_31fvbw03gs0xyypg8u0f	org_y0txnlv69l6vp70ey06b	ct_mkkia7qjay94mlvmgauj	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.366	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_2dlvk5n2vuiawusy3k2t	org_y0txnlv69l6vp70ey06b	ct_77g2ngbba0jkaxelz6el	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.367	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_wdtlkcl2cvgpxfu6qxsh	org_y0txnlv69l6vp70ey06b	ct_k3wjyjfbtldez67j143n	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.368	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_jr7lz5vymfqfvgcgdrfx	org_y0txnlv69l6vp70ey06b	ct_mu38jminu016mhx5rfdm	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.368	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_0zh7yyo7plqmq7kmnn4g	org_y0txnlv69l6vp70ey06b	ct_j57s68coufi5x4pyzwv4	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.369	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_91j6zfouwkjgbgbgcrmj	org_y0txnlv69l6vp70ey06b	ct_eagt0oec7tuau3khv6ze	coh_zrac9hihrmdtqy5zgroc	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.37	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_zmqspmm7ct3oaghiyfxl	org_y0txnlv69l6vp70ey06b	ct_p0dwxw98pm1m87i98fl4	coh_t2pyxowjji94k5vboph4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.371	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
enr_r0a7fmp4gnjnd9gd19aa	org_y0txnlv69l6vp70ey06b	ct_1b7162oyg2zdigekceas	coh_8k3o186fttv1xn4qydc4	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.372	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_43upei40tsidwvmfh9kt	\N	\N	f	\N	\N	UYU	\N
enr_bs2ahpu62keh4xt4xu3m	org_y0txnlv69l6vp70ey06b	ct_3f05ahiheid0ykus1ea6	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.373	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_fodizjs8tuf17ro33sap	org_y0txnlv69l6vp70ey06b	ct_opb6yjpssdbvx61fpman	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.374	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_fqk7n57m3zdx7m8x3742	org_y0txnlv69l6vp70ey06b	ct_g7qdxcf334d2pm24vzmo	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.375	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_0cddj2fzk5svgbp3g25u	org_y0txnlv69l6vp70ey06b	ct_e185ppup48ygqh652nzo	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.376	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_2d62pip1l5o102x3ombj	org_y0txnlv69l6vp70ey06b	ct_wgxtyp1bufhn65m9e9lg	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.377	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_kts4ma5ka9g5fpprnzkx	org_y0txnlv69l6vp70ey06b	ct_7hu7yqp1sfnq4up34s5u	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.378	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_tfkqsx3y1t0ebwwipj26	org_y0txnlv69l6vp70ey06b	ct_gv7k3b2tgp3np16hxrmj	coh_1san16fz6pubi2jizpap	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.379	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_9198qa28d3i99t4jmgot	\N	\N	f	\N	\N	UYU	\N
enr_scetvpndj7gjndfjpcn3	org_y0txnlv69l6vp70ey06b	ct_f745s217e80xgw43977h	coh_kg9vtmfdvnqyh4vts65f	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.38	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	cia_43upei40tsidwvmfh9kt	\N	\N	f	\N	\N	UYU	\N
enr_3dyozf7brzyk2utdhegf	org_y0txnlv69l6vp70ey06b	ct_215aw1k3arcnyhsvhhb6	coh_mepgc3e063trbzr24o7r	stg_f92b4uejkxutx12710ff	0	2026-08-17 15:53:15.381	\N	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	UYU	\N
\.


--
-- Data for Name: installment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.installment (id, organization_id, enrollment_id, number, due_date, amount, currency, canceled_at, notes, created_at, updated_at) FROM stdin;
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
\.


--
-- Data for Name: media_asset; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.media_asset (id, organization_id, kind, wa_media_id, mime_type, file_name, file_size, caption, payload, storage_path, fetch_status, fetch_error, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member (id, organization_id, user_id, role, created_at) FROM stdin;
mem_f9o01kv633g7q2yxx8qt	org_y0txnlv69l6vp70ey06b	lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	soporte	2026-08-11 12:20:11.64619
mem_j0gne8e2als3itzuaui4	org_y0txnlv69l6vp70ey06b	SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	soporte	2026-08-11 14:34:54.595718
mem_qpwoebl904jute5fwz1o	org_y0txnlv69l6vp70ey06b	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	direccion	2026-08-10 19:37:00.784484
mem_n9qtt0nfj8ku07d19cyv	org_y0txnlv69l6vp70ey06b	7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	coordinacion	2026-08-11 12:46:48.621102
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
-- Data for Name: organization; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organization (id, name, slug, logo, created_at, metadata, timezone, meeting_open_before_min, meeting_open_after_min) FROM stdin;
org_y0txnlv69l6vp70ey06b	Negocio de Dev Local	principal	\N	2026-08-10 19:37:00.784484	{"branding":{"name":"CAD IT Solution Provider","accent":"#1b3bbb"}}	America/Montevideo	15	30
\.


--
-- Data for Name: payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payment (id, organization_id, enrollment_id, installment_id, amount, currency, paid_at, method, receipt_number, notes, recorded_by, voided_at, voided_by, void_reason, idempotency_key, created_at) FROM stdin;
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

COPY public.resource (id, organization_id, course_id, class_session_id, course_module_id, title, url, kind, "position", created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: role; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role (id, organization_id, key, name, capabilities, system, created_at, updated_at) FROM stdin;
rol_15fc419dca4bd1ccc0f2	org_y0txnlv69l6vp70ey06b	direccion	Dirección	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inscripciones.editar", "cobranza.ver", "cobranza.editar", "inbox.ver", "inbox.responder", "configuracion.editar", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
rol_b4d75c9111148f96d0b3	org_y0txnlv69l6vp70ey06b	coordinacion	Coordinación	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inscripciones.editar", "cobranza.ver", "cobranza.editar", "inbox.ver", "inbox.responder", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
rol_0b30088b2fd44ae9c4ae	org_y0txnlv69l6vp70ey06b	soporte	Soporte	["academico.ver", "academico.editar", "asistencia.ver", "asistencia.editar", "evaluacion.ver", "evaluacion.editar", "certificados.emitir", "contactos.ver", "contactos.editar", "inscripciones.ver", "inbox.ver", "inbox.responder", "configuracion.editar", "accesos.gestionar"]	t	2026-08-27 12:19:29.805338	2026-08-27 12:19:29.805338
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
8WYf7lF2kGFZaD3K19dEdDX2oJPYUAUn	2026-09-08 13:44:48.567	AbomnlYSS991ArrxKjhBs0c04AfslLhM	2026-08-27 14:07:59.677	2026-09-01 13:44:48.567	0000:0000:0000:0000:0000:0000:0000:0000	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	org_y0txnlv69l6vp70ey06b
\.


--
-- Data for Name: software; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.software (id, organization_id, name, total_licenses, created_at, updated_at, photo_mime_type) FROM stdin;
\.


--
-- Data for Name: teacher; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teacher (id, organization_id, name, created_at, updated_at, hourly_rate, photo_mime_type, email) FROM stdin;
tch_9pkz4o44hesymq4e6oqm	org_y0txnlv69l6vp70ey06b	Ximena Pereira	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_5licjxvsw0onlt4v1ghy	org_y0txnlv69l6vp70ey06b	Claudio Fortunato	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_2wg1x96c6zbtkxntp77c	org_y0txnlv69l6vp70ey06b	Nicolas Villarreal	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_0jizhz7uamo9bayglfxb	org_y0txnlv69l6vp70ey06b	Andres Del Castillo	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_sl39f4ns1va4lo0oushl	org_y0txnlv69l6vp70ey06b	Ovidio Santos	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_m7bcgin75gimvphl7h4q	org_y0txnlv69l6vp70ey06b	Sandra Moros	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
tch_tgh5y0gv4nn5ycny9lyw	org_y0txnlv69l6vp70ey06b	Fernan Luna	2026-08-17 15:53:14.645896	2026-08-17 15:53:14.645896	\N	\N	\N
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

COPY public."user" (id, name, email, email_verified, image, created_at, updated_at) FROM stdin;
P8MlchVjpBpvmyldmHnrydKVBEBhxzUE	Dev Local	dev@vocero.local	f	\N	2026-08-10 19:37:00.419	2026-08-10 19:37:00.419
lgnVCLf3e9BjTkeAVGjNjuc9JEafXcK5	Soporte Uno	soporte@vocero.local	f	\N	2026-08-11 12:20:11.623	2026-08-11 12:20:11.623
7tXuvLJj7wp3IxvSZhd9l5FvwJwMEXDe	Verificación 005	verificacion005@vocero.local	f	\N	2026-08-11 12:46:48.595	2026-08-11 12:46:48.595
SkEhyIkst9g33B4S0rVDQh66Ktzuz3TK	Soporte Dos	soporte2@vocero.local	f	\N	2026-08-11 14:34:54.506	2026-08-11 14:34:54.506
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.verification (id, identifier, value, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: postgres
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 32, true);


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
-- Name: resource_org_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX resource_org_course_idx ON public.resource USING btree (organization_id, course_id);


--
-- Name: role_org_key_uq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX role_org_key_uq ON public.role USING btree (organization_id, key);


--
-- Name: software_org_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX software_org_idx ON public.software USING btree (organization_id);


--
-- Name: stage_org_pos_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX stage_org_pos_idx ON public.pipeline_stage USING btree (organization_id, "position");


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
-- Name: account_link account_link_contact_id_contact_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_link
    ADD CONSTRAINT account_link_contact_id_contact_id_fk FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


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
-- Name: enrollment enrollment_seller_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.enrollment
    ADD CONSTRAINT enrollment_seller_id_user_id_fk FOREIGN KEY (seller_id) REFERENCES public."user"(id) ON DELETE SET NULL;


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
-- Name: software; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.software ENABLE ROW LEVEL SECURITY;

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
-- Name: software tenant_isolation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY tenant_isolation ON public.software USING ((organization_id = current_setting('app.current_org'::text, true))) WITH CHECK ((organization_id = current_setting('app.current_org'::text, true)));


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
-- Name: TABLE session; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO cadit_app;


--
-- Name: TABLE software; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.software TO cadit_app;


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

\unrestrict VfV8plrEPgG8GlsTZT8WPlj3WsIxbVUbyM47lxkB16oX8egLBHglqc5fMqTgNIq

