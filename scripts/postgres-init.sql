-- Runs once on first postgres startup (mounted into /docker-entrypoint-initdb.d).
-- POSTGRES_DB already creates the api database (default: modular_forms);
-- this script adds the chat RAG database and enables the vector extension
-- on it for pgvector embeddings.

CREATE DATABASE chat;

\connect chat
CREATE EXTENSION IF NOT EXISTS vector;
