#!/bin/sh
# Mirrors what the cluster's Postgres provisioning creates: an owner role that owns the database, and
# runtime roles that own nothing and can never bypass row-level security (ADR-0002). Local development only: the
# passwords come from compose.yaml and are not secrets.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v owner_pw="$BACKOFFICE_OWNER_PASSWORD" -v app_pw="$BACKOFFICE_APP_PASSWORD" \
  -v auth_pw="$BACKOFFICE_AUTH_PASSWORD" -v ingest_pw="$BACKOFFICE_INGEST_PASSWORD" \
  -v public_pw="$BACKOFFICE_PUBLIC_PASSWORD" <<'SQL'
CREATE ROLE pauseai_backoffice_owner WITH LOGIN PASSWORD :'owner_pw';
-- The API's staff and bot routes, always through withActor.
CREATE ROLE pauseai_backoffice_app WITH LOGIN PASSWORD :'app_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Better Auth's: reaches only the auth schema.
CREATE ROLE pauseai_backoffice_auth WITH LOGIN PASSWORD :'auth_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- The Airtable sync's (M1): inserts intake records and import runs, nothing else.
CREATE ROLE pauseai_backoffice_ingest WITH LOGIN PASSWORD :'ingest_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- The census form's routes (M2): execute the submit function, no table grants.
CREATE ROLE pauseai_backoffice_public WITH LOGIN PASSWORD :'public_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- `pauseai_backoffice` for development, `pauseai_backoffice_test` for the test suites (rebuilt on every run).
CREATE DATABASE pauseai_backoffice OWNER pauseai_backoffice_owner;
CREATE DATABASE pauseai_backoffice_test OWNER pauseai_backoffice_owner;
GRANT CONNECT ON DATABASE pauseai_backoffice, pauseai_backoffice_test
  TO pauseai_backoffice_app, pauseai_backoffice_auth, pauseai_backoffice_ingest, pauseai_backoffice_public;
SQL
