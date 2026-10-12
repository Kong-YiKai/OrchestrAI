-- Mirrors the locked upstream LangChain PGVector schema; 1024 dimensions fixed.
CREATE TABLE langchain_pg_collection (
 uuid uuid PRIMARY KEY, name varchar, cmetadata json
);
CREATE UNIQUE INDEX collection_name_unique ON langchain_pg_collection(name);
CREATE TABLE langchain_pg_embedding (
 uuid uuid PRIMARY KEY,
 collection_id uuid REFERENCES langchain_pg_collection(uuid) ON DELETE CASCADE,
 embedding vector(1024), document varchar, cmetadata jsonb, custom_id varchar
);
CREATE INDEX ix_cmetadata_gin ON langchain_pg_embedding USING gin(cmetadata jsonb_path_ops);
CREATE INDEX embedding_file ON langchain_pg_embedding((cmetadata->>'file_id'));
INSERT INTO langchain_pg_collection VALUES ('9d179641-7f38-49bc-822f-7e3bda83bda8','orchestrai', '{}');
